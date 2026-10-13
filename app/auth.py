"""
HMAC-signed token authentication.

Two token families share one signing key, so every payload carries an explicit
``typ`` and each verifier refuses the other family — otherwise a user token
would validate as an admin token (same signature, same secret).

  • admin — issued by /api/admin/login, 1 h TTL, auto-refreshed.
  • user  — issued by /api/login and /api/register, 30 day TTL. Everything the
            API does on behalf of a member is keyed off this token, never off a
            user_id supplied by the client.
"""

import json
import time
import hmac
import hashlib
import base64

from flask import request, g, jsonify

from .config import SECRET_KEY

ADMIN_TOKEN_TTL = 3600  # 1 hour
ADMIN_TOKEN_REFRESH = 1800  # refresh after 30 min
USER_TOKEN_TTL = 30 * 24 * 3600  # 30 days


def _sign(payload_str: str) -> str:
    return hmac.new(SECRET_KEY.encode(), payload_str.encode(), hashlib.sha256).hexdigest()


def _encode(payload: dict) -> str:
    payload_str = json.dumps(payload, separators=(',', ':'), sort_keys=True)
    return base64.urlsafe_b64encode(f"{payload_str}|{_sign(payload_str)}".encode()).decode()


def _decode(token_str: str) -> dict | None:
    """Verify the signature and return the payload, or None if tampered."""
    try:
        decoded = base64.urlsafe_b64decode(token_str).decode()
        payload_str, sig = decoded.rsplit("|", 1)
        if not hmac.compare_digest(sig, _sign(payload_str)):
            return None
        return json.loads(payload_str)
    except Exception:
        return None


def _bearer_token(fallback_header: str) -> str:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return request.headers.get(fallback_header, "")


# ══════════════════════════════════════════════════
# ADMIN TOKENS
# ══════════════════════════════════════════════════
def _create_admin_token(admin_info: dict) -> str:
    return _encode({
        "typ": "admin",
        "id": admin_info.get("id", 0),
        "u": admin_info.get("username", "admin"),
        "ts": int(time.time()),
    })


def _verify_admin_token() -> bool:
    token_str = _bearer_token("X-Admin-Token")
    if not token_str:
        return False
    payload = _decode(token_str)
    if not payload or payload.get("typ") != "admin":
        return False
    if time.time() - payload.get("ts", 0) > ADMIN_TOKEN_TTL:
        return False
    g.admin_payload = payload
    return True


def is_admin_request() -> bool:
    """True when the caller presents a valid admin token.

    Used by the shared support/chat endpoints, which serve both the admin panel
    and members through the same URL.
    """
    if getattr(g, 'admin_payload', None):
        return True
    return _verify_admin_token()


def admin_token_refresh(response):
    """Auto-refresh admin token if older than 30 min."""
    try:
        payload = getattr(g, 'admin_payload', None)
        if payload:
            age = time.time() - payload.get("ts", 0)
            if age > ADMIN_TOKEN_REFRESH:
                new_token = _create_admin_token(payload)
                response.headers['X-Admin-Token-Refresh'] = new_token
    except Exception:
        pass
    return response


# ══════════════════════════════════════════════════
# USER TOKENS
# ══════════════════════════════════════════════════
def create_user_token(user_id: int) -> str:
    return _encode({"typ": "user", "uid": int(user_id), "ts": int(time.time())})


# Tokens are stateless, so a password change can't delete them. Instead every
# token is checked against the account's last password change: tokens older
# than it are dead. The lookup is cached briefly so this doesn't add a query to
# every single request — a revocation takes effect within PW_CACHE_TTL seconds
# (per gunicorn worker).
PW_CACHE_TTL = 60
# uid -> (password_changed_at epoch, blocked, cached_at)
_account_cache: dict[int, tuple[float, bool, float]] = {}


def _account_state(uid: int) -> tuple[float, bool]:
    """(last password change as epoch seconds, is_blocked) for an account."""
    now = time.time()
    hit = _account_cache.get(uid)
    if hit and now - hit[2] < PW_CACHE_TTL:
        return hit[0], hit[1]
    try:
        from .db import get_db
        with get_db() as cur:
            cur.execute(
                "SELECT password_changed_at, is_blocked FROM coop_users WHERE id = %s LIMIT 1",
                (uid,)
            )
            row = cur.fetchone()
        changed = row.get("password_changed_at") if row else None
        state = (changed.timestamp() if changed else 0.0, bool(row and row.get("is_blocked")))
    except Exception:
        # DB down or column not migrated yet — keep the last known answer
        # rather than logging the whole site out.
        return (hit[0], hit[1]) if hit else (0.0, False)
    _account_cache[uid] = (state[0], state[1], now)
    return state


def invalidate_user_tokens(user_id: int) -> None:
    """Drop the cached account state so a change applies immediately here."""
    _account_cache.pop(int(user_id), None)


def auth_user_id() -> int | None:
    """Authenticated member id from the signed token, or None for guests."""
    cached = getattr(g, '_auth_uid', False)
    if cached is not False:
        return cached
    uid = None
    token_str = _bearer_token("X-User-Token")
    if token_str:
        payload = _decode(token_str)
        if payload and payload.get("typ") == "user" and time.time() - payload.get("ts", 0) <= USER_TOKEN_TTL:
            try:
                uid = int(payload.get("uid"))
            except (TypeError, ValueError):
                uid = None
            if uid is not None:
                changed_at, blocked = _account_state(uid)
                if blocked or payload.get("ts", 0) < changed_at:
                    # Issued before the password changed, or the account was
                    # blocked since. Either way the session is over.
                    uid = None
    g._auth_uid = uid
    return uid


def _unauthorized():
    return jsonify({"error": "Требуется вход в аккаунт"}), 401


def _forbidden():
    return jsonify({"error": "Нет доступа"}), 403


def require_auth():
    """(user_id, None) when authenticated, else (None, 401-response)."""
    uid = auth_user_id()
    if uid is None:
        return None, _unauthorized()
    return uid, None


def require_self(user_id):
    """None when the caller owns `user_id`, else an error response.

    Admins pass through so the admin panel can reuse member-facing endpoints.
    """
    uid = auth_user_id()
    if uid is None:
        return None if is_admin_request() else _unauthorized()
    try:
        if int(uid) != int(user_id):
            return _forbidden()
    except (TypeError, ValueError):
        return _forbidden()
    return None


def claimed_user_id(claimed):
    """Reconcile a client-supplied user_id with the token.

    Returns (effective_user_id, error_response). A guest (no token, no claim)
    yields (None, None); claiming somebody else's id is rejected outright.
    """
    uid = auth_user_id()
    if claimed in (None, '', 0, '0'):
        return uid, None
    try:
        claimed_int = int(claimed)
    except (TypeError, ValueError):
        return uid, None
    if uid is None:
        return None, _unauthorized()
    if uid != claimed_int:
        return None, _forbidden()
    return uid, None
