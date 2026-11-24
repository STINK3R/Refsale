"""Cuts one product photo out of its background: image bytes on stdin, a
transparent PNG on stdout. Usage: imaging_worker.py <model>

<model> is the name of an ONNX segmentation network in U2NET_HOME
(isnet-general-use, u2netp…), or "simple" for a plain flood fill of a
uniform background — the last resort that needs almost no memory.

Run as a separate short-lived process by app/imaging.py, so the memory the
network takes goes back to the system the moment the photo is done. The
network runs straight on onnxruntime: the rembg package would pull scipy,
scikit-image, numba and opencv into the process and double its size.
Standalone on purpose: it imports nothing from the app.
"""
import io
import os
import sys
from collections import deque

MAX_SIDE = 2000  # larger photos are scaled down first

# Input size, mean and std each network was trained with
NETS = {
    "isnet-general-use": (1024, (0.5, 0.5, 0.5), (1.0, 1.0, 1.0)),
    "u2netp": (320, (0.485, 0.456, 0.406), (0.229, 0.224, 0.225)),
    "u2net": (320, (0.485, 0.456, 0.406), (0.229, 0.224, 0.225)),
    "silueta": (320, (0.485, 0.456, 0.406), (0.229, 0.224, 0.225)),
}


def model_path(name: str) -> str:
    home = os.path.expanduser(os.environ.get("U2NET_HOME", "~/.u2net"))
    return os.path.join(home, f"{name}.onnx")


def _net_mask(img, name):
    """The network's mask (L, the photo's size), or None if it cannot run."""
    if name not in NETS or not os.path.exists(model_path(name)):
        print(f"model {name} is not available", file=sys.stderr)
        return None
    import numpy as np
    import onnxruntime as ort
    from PIL import Image

    size, mean, std = NETS[name]
    opts = ort.SessionOptions()
    # The smallest footprint: no arena, no pre-planned buffers, basic graph
    # optimisations (the full set costs memory for little speed here)
    opts.enable_cpu_mem_arena = False
    opts.enable_mem_pattern = False
    opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
    opts.intra_op_num_threads = int(os.environ.get("REMBG_THREADS", "2"))
    opts.inter_op_num_threads = 1
    session = ort.InferenceSession(model_path(name), sess_options=opts, providers=["CPUExecutionProvider"])

    a = np.asarray(img.convert("RGB").resize((size, size), Image.Resampling.LANCZOS), dtype=np.float32)
    a /= max(float(a.max()), 1e-6)
    a -= np.array(mean, dtype=np.float32)
    a /= np.array(std, dtype=np.float32)
    x = np.ascontiguousarray(a.transpose(2, 0, 1)[None])
    del a
    pred = session.run(None, {session.get_inputs()[0].name: x})[0][0, 0]
    del session, x
    lo, hi = float(pred.min()), float(pred.max())
    pred = (pred - lo) / max(hi - lo, 1e-6)
    mask = Image.fromarray((pred * 255).astype(np.uint8))  # 2-D uint8: a greyscale mask
    return mask.resize(img.size, Image.Resampling.LANCZOS)


def _simple_mask(img):
    """Clears a plain background that touches the edges (flood fill by colour),
    worked out on a small copy and scaled back up."""
    from PIL import Image, ImageFilter

    small = img.convert("RGB")
    small.thumbnail((700, 700))
    w, h = small.size
    px = small.load()
    border = [px[x, 0] for x in range(w)] + [px[x, h - 1] for x in range(w)] + \
             [px[0, y] for y in range(h)] + [px[w - 1, y] for y in range(h)]
    bg = tuple(sorted(c[i] for c in border)[len(border) // 2] for i in range(3))
    limit = 57

    mask = Image.new("L", (w, h), 255)
    mp = mask.load()
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0)); q.append((x, h - 1))
    for y in range(h):
        q.append((0, y)); q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        c = px[x, y]
        if abs(c[0] - bg[0]) + abs(c[1] - bg[1]) + abs(c[2] - bg[2]) > limit:
            continue
        mp[x, y] = 0
        if x > 0: q.append((x - 1, y))
        if x < w - 1: q.append((x + 1, y))
        if y > 0: q.append((x, y - 1))
        if y < h - 1: q.append((x, y + 1))
    return mask.filter(ImageFilter.GaussianBlur(0.8)).resize(img.size, Image.Resampling.LANCZOS)


def _trim(img, pad_ratio=0.04):
    """Crops to what is left, with a small even margin."""
    from PIL import Image

    bbox = img.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if not bbox:
        return img
    img = img.crop(bbox)
    w, h = img.size
    pad = int(max(w, h) * pad_ratio)
    canvas = Image.new("RGBA", (w + 2 * pad, h + 2 * pad), (0, 0, 0, 0))
    canvas.paste(img, (pad, pad))
    return canvas


def cut_out(data: bytes, model: str = "isnet-general-use") -> bytes:
    from PIL import Image, ImageOps

    img = Image.open(io.BytesIO(data))
    img.draft("RGB", (MAX_SIDE, MAX_SIDE))  # a JPEG decodes straight at a smaller size
    img = ImageOps.exif_transpose(img)
    if max(img.size) > MAX_SIDE:
        img.thumbnail((MAX_SIDE, MAX_SIDE))
    img = img.convert("RGBA")
    mask = _net_mask(img, model) if model != "simple" else None
    if mask is None:
        mask = _simple_mask(img)
    out = img.copy()
    out.putalpha(mask)
    buf = io.BytesIO()
    _trim(out).save(buf, format="PNG", optimize=True)
    return buf.getvalue()


if __name__ == "__main__":
    # stdout carries the picture and nothing else: anything a library prints
    # goes to stderr, at the descriptor level too
    out = os.fdopen(os.dup(1), "wb")
    os.dup2(2, 1)
    sys.stdout = sys.stderr
    result = cut_out(sys.stdin.buffer.read(), sys.argv[1] if len(sys.argv) > 1 else "isnet-general-use")
    out.write(result)
    out.flush()
