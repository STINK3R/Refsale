"""Cuts one product photo out of its background: image bytes on stdin, a
transparent PNG on stdout.

Run as a separate short-lived process by app/imaging.py. The neural network
needs about a gigabyte while it works; in a process of its own all of it goes
back to the system the moment the photo is done, instead of staying in every
web worker that ever handled a photo. Standalone on purpose: it imports
nothing from the app, so it starts without the app's settings.
"""
import io
import os
import sys
from collections import deque

MAX_SIDE = 2000  # larger photos are scaled down first


def _rembg_cut(img):
    """The cut-out by rembg, or None when rembg or the model is missing."""
    try:
        import onnxruntime as ort
        from rembg import remove
        from rembg.sessions import sessions_class
    except Exception as e:
        print(f"rembg unavailable: {e}", file=sys.stderr)
        return None
    model = os.environ.get("REMBG_MODEL", "isnet-general-use")
    cls = next((c for c in sessions_class if c.name() == model), None)
    if cls is None:
        print(f"unknown REMBG_MODEL {model}", file=sys.stderr)
        return None
    opts = ort.SessionOptions()
    # No memory arena: a lower peak, and nothing is kept for a next run
    opts.enable_cpu_mem_arena = False
    opts.enable_mem_pattern = False
    opts.intra_op_num_threads = int(os.environ.get("REMBG_THREADS", "2"))
    opts.inter_op_num_threads = 1
    try:
        session = cls(model, opts)
    except Exception as e:
        print(f"model {model} failed to load: {e}", file=sys.stderr)
        return None
    return remove(img, session=session, post_process_mask=True)


def _simple_cut(img):
    """Clears a plain background that touches the edges (flood fill by colour)."""
    from PIL import Image, ImageFilter

    rgb = img.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
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
    out = img.convert("RGBA")
    out.putalpha(mask.filter(ImageFilter.GaussianBlur(1.2)))
    return out


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


def cut_out(data: bytes) -> bytes:
    from PIL import Image, ImageOps

    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)
    if max(img.size) > MAX_SIDE:
        img.thumbnail((MAX_SIDE, MAX_SIDE))
    img = img.convert("RGBA")
    cut = _rembg_cut(img)
    if cut is None:
        cut = _simple_cut(img)
    buf = io.BytesIO()
    _trim(cut).save(buf, format="PNG", optimize=True)
    return buf.getvalue()


if __name__ == "__main__":
    # stdout carries the picture and nothing else: libraries that print
    # (the model downloader does) go to stderr, at the descriptor level too
    out = os.fdopen(os.dup(1), "wb")
    os.dup2(2, 1)
    sys.stdout = sys.stderr
    result = cut_out(sys.stdin.buffer.read())
    out.write(result)
    out.flush()
