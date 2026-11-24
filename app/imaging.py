"""Product photos on a transparent background.

A photo uploaded into a product is cut out of its background and saved as a
PNG with transparency, so every card in the catalog sits on the page's own
colour. The cut is made by a segmentation network on onnxruntime
(app/imaging_worker.py), in a short-lived process of its own: the memory it
takes goes back to the system the moment the photo is done. A lock lets only
one photo be processed at a time on the whole server.

Which network depends on the memory the server has free right now:
  • isnet-general-use (REMBG_MODEL) — the best edges, ~800 MB while it works;
  • u2netp — a small one, ~250 MB;
  • "simple" — a flood fill of a plain background, almost nothing.
If the system still kills the process for memory, the next one is tried.
"""
import fcntl
import os
import signal
import subprocess
import sys
import tempfile

_WORKER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "imaging_worker.py")
_LOCK = os.path.join(tempfile.gettempdir(), "refsale-imaging.lock")
_TIMEOUT = 60  # seconds per attempt; the nginx timeout for uploads is 120
_PNG = b"\x89PNG\r\n\x1a\n"

# Free memory (MB) a network needs to be tried: its peak plus a margin
_NEEDS_MB = {"isnet-general-use": 1100, "u2net": 750, "silueta": 600, "u2netp": 350, "simple": 0}


def _available_mb() -> int | None:
    """Memory free for a new process (MB): the machine's MemAvailable, or what
    is left under the container's own limit if that is lower. None if unknown."""
    free = None
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    free = int(line.split()[1]) // 1024
                    break
    except Exception:
        pass
    # A memory limit set on the container: cgroup v2, then v1
    for limit_file, usage_file in (("/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory.current"),
                                   ("/sys/fs/cgroup/memory/memory.limit_in_bytes",
                                    "/sys/fs/cgroup/memory/memory.usage_in_bytes")):
        try:
            with open(limit_file) as f:
                limit = f.read().strip()
            with open(usage_file) as f:
                used = int(f.read().strip())
        except Exception:
            continue
        # "max" or a huge number (v1 without a limit) means no limit
        if limit.isdigit() and int(limit) < (1 << 50):
            left = (int(limit) - used) // 1024 // 1024
            free = left if free is None else min(free, left)
        break
    return free


def _plan() -> list[str]:
    preferred = os.environ.get("REMBG_MODEL", "isnet-general-use")
    chain = [preferred] + [m for m in ("u2netp", "simple") if m != preferred]
    free = _available_mb()
    if free is None:
        return chain
    fits = [m for m in chain if free >= _NEEDS_MB.get(m, 800)]
    return fits or ["simple"]


def remove_background(data: bytes) -> bytes:
    """The photo as a PNG on a transparent background; raises on failure."""
    with open(_LOCK, "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            plan = _plan()
            last = None
            for model in plan:
                try:
                    done = subprocess.run(
                        [sys.executable, "-I", _WORKER, model],
                        input=data, capture_output=True, timeout=_TIMEOUT,
                    )
                except subprocess.TimeoutExpired:
                    print(f"[imaging] {model}: timed out")
                    last = "timeout"
                    continue
                if done.returncode == 0 and done.stdout.startswith(_PNG):
                    if model != plan[0] or done.stderr:
                        print(f"[imaging] cut with {model} (plan {plan}, free {_available_mb()} MB)")
                    return done.stdout
                killed = done.returncode == -signal.SIGKILL
                print(f"[imaging] {model}: exit {done.returncode}"
                      f"{' — killed, out of memory' if killed else ''}; "
                      f"{done.stderr.decode('utf-8', 'replace')[-400:]}")
                last = done.returncode
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)
    raise RuntimeError(f"background removal failed ({last})")
