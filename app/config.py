"""
Configuration constants for the backend.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ── Database ──
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://coop:coop@localhost:5432/coop")

# ── Security ──
# Signs admin and member tokens. A known value means anyone can mint an admin
# token offline, so refuse to boot rather than run with the old placeholder.
_WEAK_SECRETS = {"", "coop-secret-change-me", "change-me", "secret"}
SECRET_KEY = os.environ.get("SERVER_SECRET", "").strip()
if SECRET_KEY in _WEAK_SECRETS or len(SECRET_KEY) < 32:
    raise RuntimeError(
        "SERVER_SECRET is missing or too weak. Generate one and put it in .env:\n"
        "    python -c \"import secrets; print(secrets.token_urlsafe(48))\"\n"
        "Must be at least 32 characters."
    )

# ── SMTP ──
SMTP_HOST = os.environ.get("SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "").strip()
# Gmail shows an app password as four groups of four, and it is routinely pasted
# into .env with a space left on the end. Google tolerates it, other servers do
# not — so trim the edges. Inner spaces stay: some passwords really contain them.
SMTP_PASS = os.environ.get("SMTP_PASS", "").strip()
SMTP_FROM = os.environ.get("SMTP_FROM", SMTP_USER or "noreply@refsale.ru")
SMTP_ENABLED = bool(SMTP_HOST and SMTP_USER and SMTP_PASS)
ADMIN_NOTIFY_EMAIL = os.environ.get("ADMIN_NOTIFY_EMAIL", "")

# ── Site Domain (used for password reset links — prevents host header injection) ──
SITE_DOMAIN = os.environ.get("SITE_DOMAIN", "http://localhost:5000")

# ── CORS (comma-separated origins, or "*" for dev) ──
_cors_raw = os.environ.get("CORS_ORIGINS", "*")
CORS_ORIGINS = _cors_raw if _cors_raw == "*" else [o.strip() for o in _cors_raw.split(",") if o.strip()]

# ── Paths ──
BASE_DIR = os.path.dirname(os.path.dirname(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
FRONTEND_DIST = os.path.join(BASE_DIR, "frontend", "dist")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# ── Business constants ──
DEVELOPMENT_FEE = 200  # рублей

# ── Startup log ──
if not SMTP_ENABLED:
    print("⚠️  SMTP not configured — email notifications disabled.")
else:
    print(f"✅ SMTP configured: {SMTP_HOST}:{SMTP_PORT} as {SMTP_USER}")
