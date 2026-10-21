"""Telling a buyer that someone answered: a push to every device they turned
notifications on for, and an email (at most one per chat every 10 minutes, so
a lively chat does not flood the inbox).

Everything runs in a background thread with its own DB connection, after the
request has committed: the push services and SMTP can take seconds, the
manager's "send" must not.

The VAPID key pair is made on first use and kept in coop_settings, so a fresh
server needs no setup; the public half is what browsers subscribe with.
"""

import base64
import json
import threading

from .db import get_db

_EMAIL_EVERY_MINUTES = 10
_vapid_cache: dict = {}
_vapid_lock = threading.Lock()


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _vapid():
    """(private key object, public key as base64url), created once."""
    with _vapid_lock:
        if _vapid_cache:
            return _vapid_cache["key"], _vapid_cache["public"]
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import ec

        with get_db() as cur:
            cur.execute("SELECT value FROM coop_settings WHERE key = 'vapid_private_pem'")
            row = cur.fetchone()
            if row and row.get("value"):
                key = serialization.load_pem_private_key(row["value"].encode(), password=None)
            else:
                key = ec.generate_private_key(ec.SECP256R1())
                pem = key.private_bytes(
                    serialization.Encoding.PEM,
                    serialization.PrivateFormat.PKCS8,
                    serialization.NoEncryption(),
                ).decode()
                # Two workers may race here: the first insert wins, the other reads it back
                cur.execute(
                    "INSERT INTO coop_settings (key, value) VALUES ('vapid_private_pem', %s) ON CONFLICT (key) DO NOTHING",
                    (pem,),
                )
                cur.execute("SELECT value FROM coop_settings WHERE key = 'vapid_private_pem'")
                key = serialization.load_pem_private_key(cur.fetchone()["value"].encode(), password=None)
        public = _b64url(key.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))
        _vapid_cache.update(key=key, public=public)
        return key, public


def vapid_public_key() -> str:
    return _vapid()[1]


def _contact_email() -> str:
    from .config import ADMIN_NOTIFY_EMAIL, SMTP_FROM
    addr = (ADMIN_NOTIFY_EMAIL or SMTP_FROM or "").strip()
    if "<" in addr:
        addr = addr.split("<", 1)[1].rstrip(">")
    return f"mailto:{addr or 'admin@refsale.ru'}"


def _push(cur, user_id: int, payload: dict):
    try:
        from pywebpush import webpush, WebPushException
        from py_vapid import Vapid01
    except ImportError:
        print("[notify] pywebpush is not installed — push skipped")
        return
    cur.execute("SELECT id, endpoint, p256dh, auth FROM ref_push_subscriptions WHERE user_id = %s", (user_id,))
    subs = cur.fetchall()
    if not subs:
        return
    key, _ = _vapid()
    vapid = Vapid01(private_key=key)
    data = json.dumps(payload, ensure_ascii=False)
    for s in subs:
        try:
            webpush(
                subscription_info={"endpoint": s["endpoint"], "keys": {"p256dh": s["p256dh"], "auth": s["auth"]}},
                data=data,
                vapid_private_key=vapid,
                vapid_claims={"sub": _contact_email()},
                ttl=24 * 3600,
                timeout=10,
            )
        except WebPushException as e:
            code = getattr(getattr(e, "response", None), "status_code", None)
            if code in (404, 410):
                # The browser dropped this subscription: forget it
                cur.execute("DELETE FROM ref_push_subscriptions WHERE id = %s", (s["id"],))
            else:
                print(f"[notify] push failed for user {user_id}: {e}")
        except Exception as e:
            print(f"[notify] push failed for user {user_id}: {e}")


def _email(cur, user_id: int, key: str, subject: str, heading: str, snippet: str, url: str):
    cur.execute("SELECT full_name, email, COALESCE(notify_email, TRUE) AS on_ FROM coop_users WHERE id = %s", (user_id,))
    u = cur.fetchone()
    if not u or not u.get("email") or not u.get("on_"):
        return
    # One email per chat per few minutes: the first reply is news, the tenth is noise
    cur.execute(
        """INSERT INTO ref_notify_email_log (key, sent_at) VALUES (%s, NOW())
           ON CONFLICT (key) DO UPDATE SET sent_at = NOW()
           WHERE ref_notify_email_log.sent_at < NOW() - make_interval(mins => %s)
           RETURNING key""",
        (f"{user_id}:{key}", _EMAIL_EVERY_MINUTES),
    )
    if not cur.fetchone():
        return
    from .email_service import email_chat_reply
    email_chat_reply(u.get("full_name") or "", u["email"], subject, heading, snippet, url)


def notify_user(user_id, *, key: str, title: str, body: str, url: str,
                email_subject: str = "", email_heading: str = "", email: bool = True):
    """Push (and maybe email) one buyer about something new for them."""
    if not user_id:
        return

    def run():
        try:
            with get_db() as cur:
                _push(cur, int(user_id), {"title": title, "body": body[:180], "url": url, "tag": key})
                if email:
                    _email(cur, int(user_id), key, email_subject or title, email_heading or title, body, url)
        except Exception as e:
            print(f"[notify] {key} for user {user_id}: {e}")

    threading.Thread(target=run, daemon=True).start()


def snippet(text: str, images=None) -> str:
    """The message itself for the notification: its text, or what it carries."""
    t = (text or "").strip()
    if t:
        return t if len(t) <= 160 else t[:157] + "…"
    try:
        items = json.loads(images) if isinstance(images, str) else (images or [])
    except Exception:
        items = []
    if any(str(i).lower().endswith((".mp4", ".webm", ".mov")) for i in items):
        return "Видео"
    return "Фото" if items else "Новое сообщение"
