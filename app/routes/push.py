"""Web push subscriptions and the buyer's notification settings."""

from flask import Blueprint, request, jsonify

from ..auth import require_auth
from ..db import get_db
from ..notify import vapid_public_key, notify_user

bp = Blueprint('push', __name__)


@bp.route("/api/push/key")
def push_key():
    try:
        return jsonify({"publicKey": vapid_public_key()})
    except Exception as e:
        print(f"[/api/push/key] {e}")
        return jsonify({"error": "Уведомления недоступны"}), 503


@bp.route("/api/push/subscribe", methods=["POST"])
def push_subscribe():
    uid, err = require_auth()
    if err:
        return err
    sub = (request.json or {}).get("subscription") or {}
    endpoint = str(sub.get("endpoint") or "")
    keys = sub.get("keys") or {}
    p256dh, auth = str(keys.get("p256dh") or ""), str(keys.get("auth") or "")
    if not endpoint.startswith("https://") or len(endpoint) > 1000 or not p256dh or not auth:
        return jsonify({"error": "Неверная подписка"}), 400
    agent = (request.headers.get("User-Agent") or "")[:300]
    with get_db() as cur:
        # One device, one row; the same browser signing in as someone else moves to them
        cur.execute(
            """INSERT INTO ref_push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
               VALUES (%s, %s, %s, %s, %s)
               ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh,
                   auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent""",
            (uid, endpoint, p256dh, auth, agent),
        )
    return jsonify({"ok": True})


@bp.route("/api/push/unsubscribe", methods=["POST"])
def push_unsubscribe():
    uid, err = require_auth()
    if err:
        return err
    endpoint = str((request.json or {}).get("endpoint") or "")
    with get_db() as cur:
        cur.execute("DELETE FROM ref_push_subscriptions WHERE endpoint = %s AND user_id = %s", (endpoint, uid))
    return jsonify({"ok": True})


@bp.route("/api/push/test", methods=["POST"])
def push_test():
    uid, err = require_auth()
    if err:
        return err
    notify_user(uid, key="test", title="Уведомления включены",
                body="Так будут приходить ответы менеджера и новые статусы заказа.",
                url="/orders", email=False)
    return jsonify({"ok": True})


@bp.route("/api/notify/settings", methods=["GET", "PATCH"])
def notify_settings():
    uid, err = require_auth()
    if err:
        return err
    with get_db() as cur:
        if request.method == "PATCH":
            d = request.json or {}
            if "email" in d:
                cur.execute("UPDATE coop_users SET notify_email = %s WHERE id = %s", (bool(d["email"]), uid))
        cur.execute("SELECT COALESCE(notify_email, TRUE) AS email FROM coop_users WHERE id = %s", (uid,))
        row = cur.fetchone() or {}
        cur.execute("SELECT COUNT(*) AS n FROM ref_push_subscriptions WHERE user_id = %s", (uid,))
        devices = (cur.fetchone() or {}).get("n", 0)
    return jsonify({"email": bool(row.get("email", True)), "push_devices": devices})
