"""Product photos on a transparent background.

A photo uploaded into a product is cut out of its background and saved as a
PNG with transparency, so every card in the catalog sits on the page's own
colour. The cut is made by rembg (a neural network, model REMBG_MODEL,
baked into the backend image at build time). Where rembg is not installed —
a slim local setup — a simple fallback clears a plain light background that
touches the photo's edges, which covers most packshots on white.

The model is loaded once per worker, on the first photo, and shared.
"""
import io
import os
import threading
from collections import deque

_MODEL = os.environ.get("REMBG_MODEL", "isnet-general-use")
_MAX_SIDE = 2000          # larger photos are scaled down first
_session = None
_session_failed = False
_lock = threading.Lock()


def _rembg_session():
    global _session, _session_failed
    if _session is not None or _session_failed:
        return _session
    with _lock:
        if _session is None and not _session_failed:
            try:
                from rembg import new_session
                _session = new_session(_MODEL)
            except Exception as e:  # not installed, or the model is missing
                print(f"[imaging] rembg unavailable, using the simple cut-out: {e}")
                _session_failed = True
    return _session


def _fallback_cutout(img):
    """Clear a plain background connected to the edges (flood fill by colour)."""
    from PIL import Image, ImageFilter

    rgb = img.convert("RGB")
    w, h = rgb.size
    px = rgb.load()
    # The background colour: the median of the border pixels
    border = [px[x, 0] for x in range(w)] + [px[x, h - 1] for x in range(w)] + \
             [px[0, y] for y in range(h)] + [px[w - 1, y] for y in range(h)]
    bg = tuple(sorted(c[i] for c in border)[len(border) // 2] for i in range(3))
    tol = 38

    def close(c):
        return abs(c[0] - bg[0]) + abs(c[1] - bg[1]) + abs(c[2] - bg[2]) <= tol * 3 // 2

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
        if not close(px[x, y]):
            continue
        mp[x, y] = 0
        if x > 0: q.append((x - 1, y))
        if x < w - 1: q.append((x + 1, y))
        if y > 0: q.append((x, y - 1))
        if y < h - 1: q.append((x, y + 1))
    mask = mask.filter(ImageFilter.GaussianBlur(1.2))
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def _trim(img, pad_ratio=0.04):
    """Crop to what is left, with a small even margin."""
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


def remove_background(data: bytes) -> bytes:
    """The photo as a PNG on a transparent background."""
    from PIL import Image, ImageOps

    img = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)
    if max(img.size) > _MAX_SIDE:
        img.thumbnail((_MAX_SIDE, _MAX_SIDE))
    img = img.convert("RGBA")
    session = _rembg_session()
    if session is not None:
        from rembg import remove
        cut = remove(img, session=session, post_process_mask=True)
    else:
        cut = _fallback_cutout(img)
    cut = _trim(cut)
    buf = io.BytesIO()
    cut.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def processing_available() -> bool:
    try:
        import PIL  # noqa: F401
        return True
    except Exception:
        return False
