"""Product photos on a transparent background.

A photo uploaded into a product is cut out of its background and saved as a
PNG with transparency, so every card in the catalog sits on the page's own
colour. The cut is made by rembg (a neural network, model REMBG_MODEL, baked
into the backend image at build time); without rembg a simple fallback
clears a plain light background touching the edges.

The work runs in a short-lived process of its own (app/imaging_worker.py):
the network takes about a gigabyte while it works, and a separate process
hands all of it back once the photo is done — kept inside the web workers it
would stay there, a gigabyte per worker, until the server ran out of memory
and killed them mid-upload. A lock lets only one photo be processed at a
time on the whole server, whichever worker received it.
"""
import fcntl
import os
import subprocess
import sys
import tempfile

_WORKER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "imaging_worker.py")
_LOCK = os.path.join(tempfile.gettempdir(), "refsale-imaging.lock")
_TIMEOUT = 90  # seconds for one photo; the nginx timeout for uploads is 120
_PNG = b"\x89PNG\r\n\x1a\n"


def remove_background(data: bytes) -> bytes:
    """The photo as a PNG on a transparent background; raises on failure."""
    with open(_LOCK, "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            done = subprocess.run(
                [sys.executable, "-I", _WORKER],
                input=data, capture_output=True, timeout=_TIMEOUT,
            )
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)
    if done.stderr:
        print(f"[imaging] {done.stderr.decode('utf-8', 'replace')[-800:]}")
    if done.returncode != 0 or not done.stdout.startswith(_PNG):
        raise RuntimeError(f"background removal failed (exit {done.returncode})")
    return done.stdout
