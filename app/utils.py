"""
Shared utilities: rate limiting, password hashing, address normalization, security.
"""

import re as _re
import time
import hashlib
import html as _html
from collections import defaultdict

import bcrypt
from flask import request

# ══════════════════════════════════════════════════
# RATE LIMITING (DDoS protection — application layer)
# ══════════════════════════════════════════════════
_rate_store: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT = 30  # general requests per minute per IP
RATE_LIMIT_AUTH = 5  # login/register attempts per minute per IP
RATE_LIMIT_EMAIL = 3  # email send attempts per minute per IP

# ── Brute-force protection ────────────────────
_login_fails: dict[str, list[float]] = defaultdict(list)  # ip -> timestamps of failed logins
_account_locks: dict[str, float] = {}  # ip -> locked until timestamp
MAX_LOGIN_FAILS = 5  # max failed logins before lockout
LOCKOUT_DURATION = 300  # 5 minutes lockout


def _get_client_ip() -> str:
    """Get real client IP, considering X-Real-IP from nginx proxy."""
    return request.headers.get('X-Real-IP') or request.remote_addr or "unknown"


def rate_limited(limit: int = RATE_LIMIT, bucket: str = "general") -> bool:
    """General rate limiter. Returns True if rate exceeded.

    Each limit counts in its own bucket: with a shared one, five ordinary
    page requests were enough to lock someone out of logging in.
    """
    key = f"{bucket}:{_get_client_ip()}"
    now = time.time()
    window = [t for t in _rate_store[key] if now - t < 60]
    _rate_store[key] = window
    if len(window) >= limit:
        return True
    _rate_store[key].append(now)
    return False


def rate_limited_auth() -> bool:
    """Stricter rate limiter for auth endpoints (login/register)."""
    return rate_limited(RATE_LIMIT_AUTH, "auth")


def rate_limited_email() -> bool:
    """Rate limiter for email sending endpoints."""
    return rate_limited(RATE_LIMIT_EMAIL, "email")


def check_brute_force() -> bool:
    """Check if IP is locked out due to too many failed login attempts.
    Returns True if blocked."""
    ip = _get_client_ip()
    now = time.time()
    # Check if currently locked out
    if ip in _account_locks and _account_locks[ip] > now:
        return True
    # Clean old locks
    if ip in _account_locks and _account_locks[ip] <= now:
        del _account_locks[ip]
    return False


def record_login_fail():
    """Record a failed login attempt for brute-force tracking."""
    ip = _get_client_ip()
    now = time.time()
    window = [t for t in _login_fails[ip] if now - t < 600]  # 10 min window
    window.append(now)
    _login_fails[ip] = window
    if len(window) >= MAX_LOGIN_FAILS:
        _account_locks[ip] = now + LOCKOUT_DURATION
        _login_fails[ip] = []
        print(f"🔒 IP {ip} locked out for {LOCKOUT_DURATION}s after {MAX_LOGIN_FAILS} failed logins")


def record_login_success():
    """Clear failed login attempts on successful login."""
    ip = _get_client_ip()
    _login_fails.pop(ip, None)
    _account_locks.pop(ip, None)


# ══════════════════════════════════════════════════
# PASSWORD HASHING (bcrypt)
# ══════════════════════════════════════════════════
def hash_password(pw: str) -> str:
    """Hash password with bcrypt. Returns bcrypt hash string."""
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(pw: str, stored_hash: str) -> bool:
    """Verify password against stored hash. Supports both bcrypt and legacy SHA-256."""
    if stored_hash.startswith('$2b$') or stored_hash.startswith('$2a$'):
        try:
            return bcrypt.checkpw(pw.encode(), stored_hash.encode())
        except Exception:
            return False
    # Legacy SHA-256 fallback
    return hashlib.sha256(pw.encode()).hexdigest() == stored_hash


def _legacy_sha256(pw: str) -> str:
    """Legacy SHA-256 hash for backward compat checks only."""
    return hashlib.sha256(pw.encode()).hexdigest()


# ── Address normalization ─────────────────────
def _normalize_address_part(part: str) -> str:
    s = part.strip().lower()
    s = s.replace('.', ' ').replace(',', ' ')
    prefixes = [
        r'^дом\s*', r'^д\s*', r'^улица\s*', r'^ул\s*',
        r'^город\s*', r'^гор\s*', r'^г\s*',
        r'^проспект\s*', r'^пр-кт\s*', r'^пр\s*',
        r'^переулок\s*', r'^пер\s*',
        r'^бульвар\s*', r'^б-р\s*',
        r'^шоссе\s*', r'^ш\s*',
    ]
    for prefix in prefixes:
        s = _re.sub(prefix, '', s, count=1)
    return s.strip()


def normalize_address_key(address: str) -> str:
    parts = [p.strip() for p in address.split(',') if p.strip()]
    normalized = []
    for p in parts[:3]:
        normalized.append(_normalize_address_part(p))
    return ', '.join(normalized)


def _find_forum_by_normalized_address(cur, address: str):
    target_key = normalize_address_key(address)
    if not target_key:
        return None
    try:
        cur.execute("SELECT * FROM coop_forums WHERE address_key NOT IN ('general', 'social')")
        forums = cur.fetchall()
        for f in (forums or []):
            existing_key = normalize_address_key(f.get("address_key", ""))
            if existing_key == target_key:
                return dict(f)
    except:
        pass
    return None


# ── SQL Injection Prevention ──────────────────
import re as _re_sql

_SAFE_COL_RE = _re_sql.compile(r'^[a-z_][a-z0-9_]*$')


def safe_update(cur, table: str, allowed_cols: set, data: dict, where_col: str, where_val, returning: bool = True):
    """Build a safe UPDATE query using only whitelisted column names.
    Prevents SQL injection through dynamic column names."""
    safe = {k: v for k, v in data.items() if k in allowed_cols and _SAFE_COL_RE.match(k)}
    if not safe:
        return None
    sets = ', '.join(f"{k} = %s" for k in safe)
    vals = list(safe.values()) + [where_val]
    sql = f"UPDATE {table} SET {sets} WHERE {where_col} = %s"
    if returning:
        sql += " RETURNING *"
    cur.execute(sql, vals)
    return cur.fetchone() if returning else None


def safe_insert(cur, table: str, allowed_cols: set, data: dict, returning: bool = True):
    """Build a safe INSERT query using only whitelisted column names."""
    safe = {k: v for k, v in data.items() if k in allowed_cols and _SAFE_COL_RE.match(k)}
    if not safe:
        return None
    cols = ', '.join(safe.keys())
    placeholders = ', '.join(['%s'] * len(safe))
    sql = f"INSERT INTO {table} ({cols}) VALUES ({placeholders})"
    if returning:
        sql += " RETURNING *"
    cur.execute(sql, list(safe.values()))
    return cur.fetchone() if returning else None


# ══════════════════════════════════════════════════
# XSS PROTECTION + INPUT SANITIZATION
# ══════════════════════════════════════════════════
def sanitize_string(s: str, max_len: int = 500) -> str:
    """Strip dangerous characters, escape HTML entities, limit length."""
    if not isinstance(s, str):
        return ''
    s = s.strip()[:max_len]
    # Remove null bytes and control chars (except newline/tab)
    s = _re_sql.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', s)
    # Escape HTML to prevent stored XSS
    s = _html.escape(s, quote=True)
    return s


def escape_html(s: str) -> str:
    """Escape HTML special characters to prevent XSS."""
    if not isinstance(s, str):
        return ''
    return _html.escape(s, quote=True)


def sanitize_input(d: dict, text_fields: set = None, max_len: int = 500) -> dict:
    """Sanitize all string values in a dict for safe storage."""
    result = {}
    for k, v in d.items():
        if isinstance(v, str):
            v = sanitize_string(v, max_len)
        result[k] = v
    return result


# ══════════════════════════════════════════════════
# MALWARE PROTECTION — FILE UPLOAD VALIDATION
# ══════════════════════════════════════════════════
# SVG is deliberately absent: uploads are served from the site's own origin, so
# an SVG is an HTML document that can run scripts as us. Blacklisting tags is
# not a reliable defence, so the format simply isn't accepted.
ALLOWED_IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'webp'}
ALLOWED_AUDIO_EXTENSIONS = {'mp3', 'wav', 'ogg', 'flac'}
ALLOWED_VIDEO_EXTENSIONS = {'mp4', 'webm', 'mov'}
ALLOWED_UPLOAD_EXTENSIONS = ALLOWED_IMAGE_EXTENSIONS | ALLOWED_AUDIO_EXTENSIONS | ALLOWED_VIDEO_EXTENSIONS
MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB

# Magic bytes per extension — the header must match the *claimed* type, not just
# any known type, otherwise a .png carrying a different payload slips through.
_MAGIC_BY_EXT = {
    'jpg': (b'\xff\xd8\xff',),
    'jpeg': (b'\xff\xd8\xff',),
    'png': (b'\x89PNG',),
    'gif': (b'GIF87a', b'GIF89a'),
    'webp': (b'RIFF',),           # RIFF....WEBP
    'mp3': (b'ID3', b'\xff\xfb', b'\xff\xf3', b'\xff\xf2'),
    'flac': (b'fLaC',),
    'ogg': (b'OggS',),
    'wav': (b'RIFF',),            # RIFF....WAVE
}


def validate_upload(file, allowed_extensions: set = None) -> tuple[bool, str]:
    """Validate uploaded file: extension, size, magic bytes.
    Returns (is_valid, error_message)."""
    if allowed_extensions is None:
        allowed_extensions = ALLOWED_UPLOAD_EXTENSIONS

    if not file or not file.filename:
        return False, "Файл не выбран"

    # Check extension
    ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else ''
    if ext not in allowed_extensions:
        return False, f"Недопустимый формат файла: .{ext}"

    # Check file size (read into memory to check)
    file.seek(0, 2)
    size = file.tell()
    file.seek(0)
    if size > MAX_UPLOAD_SIZE:
        return False, f"Файл слишком большой ({size // 1024 // 1024} МБ, макс. {MAX_UPLOAD_SIZE // 1024 // 1024} МБ)"
    if size == 0:
        return False, "Файл пустой"

    # Check magic bytes (first 16 bytes) against the claimed extension
    header = file.read(16)
    file.seek(0)

    expected = _MAGIC_BY_EXT.get(ext)
    if expected and not any(header.startswith(m) for m in expected):
        return False, "Содержимое файла не соответствует расширению"

    # Sanitize filename — remove path separators and special chars
    safe_name = _re_sql.sub(r'[^a-zA-Z0-9._-]', '_', file.filename)
    file.filename = safe_name

    return True, ""


def _ensure_local_forum(cur, address: str):
    if not address:
        return
    parts = [p.strip() for p in address.split(',') if p.strip()]
    address_key = ', '.join(parts[:3])
    if not address_key:
        return
    try:
        cur.execute("SELECT id FROM coop_forums WHERE address_key = %s LIMIT 1", (address_key,))
        if cur.fetchone():
            return
        normalized_match = _find_forum_by_normalized_address(cur, address_key)
        if normalized_match:
            return
        cur.execute(
            "INSERT INTO coop_forums (name, address_key, description) VALUES (%s, %s, %s)",
            (address_key, address_key, f"Форум для адреса: {address_key}")
        )
        print(f"✅ Created local forum for: {address_key}")
    except Exception as e:
        print(f"⚠️ Forum creation error for '{address_key}': {e}")


# ── Attached photos ────────────────────────────
MAX_ATTACHED_IMAGES = 4


def sanitize_image_urls(value, max_items: int = MAX_ATTACHED_IMAGES) -> str:
    """Normalise a client-supplied list of photo urls into a JSON array string.

    Only paths this server produced (/uploads/...) are kept: accepting arbitrary
    urls would let anyone store a remote address that every viewer's browser
    then fetches, and would make the stored value a place to smuggle
    javascript: into the page.
    """
    import json as _json

    if isinstance(value, str):
        try:
            value = _json.loads(value)
        except Exception:
            value = []
    if not isinstance(value, list):
        return "[]"

    clean = []
    for item in value[:max_items]:
        if not isinstance(item, str):
            continue
        url = item.strip()
        if not url.startswith("/uploads/"):
            continue
        if ".." in url or "\\" in url or "\n" in url or "\r" in url:
            continue
        if len(url) > 300:
            continue
        clean.append(url)
    return _json.dumps(clean, ensure_ascii=False)
