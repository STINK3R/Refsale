"""Personal data (152-ФЗ): consents, their record and the account's deletion.

Consent to processing is given separately from other documents (a checkbox
of its own at sign-up), and every grant or withdrawal is written to
ref_consent_log with the time, document version, IP and browser — the
operator has to be able to show it was given.
"""
import secrets

from flask import Blueprint, request, jsonify

from ..auth import require_auth
from ..db import get_db
from ..utils import hash_password, verify_password, rate_limited_auth

bp = Blueprint('privacy', __name__)

# Bump when the policy or the consent text changes in substance
LEGAL_VERSION = "2026-10-28"


def _client_ip() -> str:
    """The visitor's address behind the proxies (the leftmost X-Forwarded-For)."""
    fwd = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
    return fwd or request.headers.get("X-Real-IP") or request.remote_addr or ""


def log_consent(cur, user_id, kind: str, granted: bool):
    cur.execute(
        """INSERT INTO ref_consent_log (user_id, kind, granted, version, ip, user_agent)
           VALUES (%s, %s, %s, %s, %s, %s)""",
        (user_id, kind, granted, LEGAL_VERSION,
         _client_ip()[:64],
         (request.headers.get("User-Agent") or "")[:300]),
    )


def grant_signup_consents(cur, user_id: int, marketing: bool):
    """Called by sign-up: the processing consent (required) and, if ticked,
    the one for letters about offers and promo codes."""
    cur.execute(
        """UPDATE coop_users SET pd_consent_at = NOW(), pd_consent_version = %s,
                  marketing_consent = %s, marketing_consent_at = CASE WHEN %s THEN NOW() ELSE NULL END
           WHERE id = %s""",
        (LEGAL_VERSION, marketing, marketing, user_id),
    )
    log_consent(cur, user_id, "pd", True)
    if marketing:
        log_consent(cur, user_id, "marketing", True)


@bp.route("/api/privacy/consent", methods=["GET", "POST"])
def consent():
    """GET: what this account has agreed to. POST {pd: true} confirms the
    processing consent (accounts made before it was asked); {marketing: bool}
    turns letters about offers on or off."""
    uid, err = require_auth()
    if err:
        return err
    with get_db() as cur:
        if request.method == "POST":
            d = request.json or {}
            if d.get("pd") is True:
                cur.execute("UPDATE coop_users SET pd_consent_at = NOW(), pd_consent_version = %s WHERE id = %s",
                            (LEGAL_VERSION, uid))
                log_consent(cur, uid, "pd", True)
            if "marketing" in d:
                on = bool(d["marketing"])
                cur.execute(
                    "UPDATE coop_users SET marketing_consent = %s, marketing_consent_at = CASE WHEN %s THEN NOW() ELSE NULL END WHERE id = %s",
                    (on, on, uid),
                )
                log_consent(cur, uid, "marketing", on)
        cur.execute(
            "SELECT pd_consent_at, pd_consent_version, COALESCE(marketing_consent, FALSE) AS marketing FROM coop_users WHERE id = %s",
            (uid,),
        )
        row = cur.fetchone() or {}
    at = row.get("pd_consent_at")
    return jsonify({
        "pd": bool(at),
        "pd_at": at.isoformat() if at else None,
        "pd_version": row.get("pd_consent_version"),
        "current_version": LEGAL_VERSION,
        "marketing": bool(row.get("marketing")),
    })


@bp.route("/api/privacy/delete-account", methods=["POST"])
def delete_account():
    """Withdrawal of consent with the account's removal. Personal data is
    wiped from the account, reviews, forum and questions; orders stay (with
    the details the law requires the seller to keep for accounting)."""
    if rate_limited_auth():
        return jsonify({"error": "Слишком много попыток. Подождите минуту."}), 429
    uid, err = require_auth()
    if err:
        return err
    password = (request.json or {}).get("password") or ""
    with get_db() as cur:
        cur.execute("SELECT password FROM coop_users WHERE id = %s", (uid,))
        row = cur.fetchone()
        if not row:
            return jsonify({"error": "Аккаунт не найден"}), 404
        if not verify_password(password, row["password"]):
            return jsonify({"error": "Неверный пароль"}), 403
        log_consent(cur, uid, "pd", False)
        cur.execute(
            """UPDATE coop_users SET
                   full_name = 'Удалённый пользователь',
                   email = %s, phone = NULL, address = '',
                   telegram_username = '', telegram_chat_id = NULL,
                   password = %s, password_changed_at = NOW(),
                   is_blocked = TRUE, is_leader = FALSE, leader_can_write = FALSE, is_supplier = FALSE,
                   notify_email = FALSE, marketing_consent = FALSE, marketing_consent_at = NULL,
                   pd_consent_at = NULL, deleted_at = NOW()
               WHERE id = %s""",
            (f"deleted-{uid}@deleted.invalid", hash_password(secrets.token_urlsafe(24)), uid),
        )
        cur.execute("DELETE FROM ref_push_subscriptions WHERE user_id = %s", (uid,))
        cur.execute("DELETE FROM ref_promo_activations WHERE user_id = %s", (uid,))
        cur.execute("UPDATE coop_reviews SET user_name = 'Покупатель' WHERE user_id = %s", (uid,))
        cur.execute("UPDATE coop_forum_posts SET user_name = 'Участник' WHERE user_id = %s", (uid,))
        cur.execute("UPDATE coop_support_tickets SET user_name = 'Удалённый пользователь' WHERE user_id = %s", (uid,))
        cur.execute("UPDATE coop_support_messages SET sender_name = 'Удалённый пользователь' "
                    "WHERE sender_type = 'user' AND ticket_id IN (SELECT id FROM coop_support_tickets WHERE user_id = %s)", (uid,))
    return jsonify({"ok": True})
