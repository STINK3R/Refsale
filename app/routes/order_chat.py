"""
Order chat API — buyer↔admin messaging anchored on an order.

Public endpoints (buyer): read/write messages for their own order.
Admin endpoints (under /api/admin/*, protected by the app-level token guard):
list order chats, read a thread, reply, delete a message.

The order itself is the thread anchor — there is no separate "chat" row.
Writing is blocked once the order reaches a terminal status (done/cancelled).
"""

from flask import Blueprint, request, jsonify

from ..db import get_db, _row_to_dict, _rows_to_list
from ..utils import rate_limited, sanitize_string, sanitize_image_urls
from ..auth import require_auth, require_self
from ..notify import notify_user, snippet

bp = Blueprint('order_chat', __name__)

# Statuses after which the chat is read-only.
CLOSED_STATUSES = ('done', 'cancelled')


def enriched_order_messages(cur, order_id: int):
    """Messages with the sender's current, consented profile image."""
    cur.execute(
        """SELECT m.*, CASE WHEN m.sender_type = 'user' THEN COALESCE(buyer.avatar_url, '')
                            WHEN m.sender_user_id IS NOT NULL THEN COALESCE(sender.avatar_url, '')
                            ELSE '' END AS avatar_url
           FROM coop_order_messages m
           JOIN coop_orders o ON o.id = m.order_id
           LEFT JOIN coop_users buyer ON buyer.id = o.user_id
           LEFT JOIN coop_users sender ON sender.id = m.sender_user_id
           WHERE m.order_id = %s ORDER BY m.created_at ASC, m.id ASC""",
        (order_id,),
    )
    return _rows_to_list(cur.fetchall())


# ── Buyer (public) ─────────────────────────────────────
@bp.route("/api/orders/<int:order_id>/messages", methods=["GET"])
def get_order_messages(order_id):
    """Thread for a single order. The token must own the order."""
    user_id, err = require_auth()
    if err:
        return err
    try:
        with get_db() as cur:
            cur.execute("SELECT user_id, status FROM coop_orders WHERE id = %s", (order_id,))
            order = cur.fetchone()
            if not order:
                return jsonify({"error": "Заказ не найден"}), 404
            if str(order["user_id"]) != str(user_id):
                return jsonify({"error": "Нет доступа"}), 403
            msgs = enriched_order_messages(cur, order_id)
            # Mark the thread as seen by the buyer (drives the unread badge).
            last_seen_id = max((int(m.get("id") or 0) for m in msgs), default=0)
            cur.execute(
                "INSERT INTO coop_order_chat_seen (order_id, seen_at, seen_message_id) VALUES (%s, NOW(), %s) "
                "ON CONFLICT (order_id) DO UPDATE SET seen_at = NOW(), "
                "seen_message_id = GREATEST(COALESCE(coop_order_chat_seen.seen_message_id, 0), EXCLUDED.seen_message_id)",
                (order_id, last_seen_id)
            )
            from .store import order_status_history
            history = order_status_history(cur, order_id)
        return jsonify({"messages": msgs, "status": order["status"], "history": history})
    except Exception:
        return jsonify({"messages": [], "status": None})


@bp.route("/api/orders/<int:order_id>/messages", methods=["POST"])
def post_order_message(order_id):
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    user_id, err = require_auth()
    if err:
        return err
    d = request.json or {}
    sender_name = sanitize_string(d.get("sender_name") or "", 255)
    text = sanitize_string(d.get("text") or "", 2000)
    images = sanitize_image_urls(d.get("images"))
    if not text.strip() and images == "[]":
        return jsonify({"error": "Напишите сообщение"}), 400
    try:
        with get_db() as cur:
            cur.execute("SELECT user_id, status FROM coop_orders WHERE id = %s", (order_id,))
            order = cur.fetchone()
            if not order:
                return jsonify({"error": "Заказ не найден"}), 404
            if str(order["user_id"]) != str(user_id):
                return jsonify({"error": "Нет доступа"}), 403
            if order["status"] in CLOSED_STATUSES:
                return jsonify({"error": "Заказ завершён — чат закрыт"}), 409
            cur.execute("SELECT full_name FROM coop_users WHERE id = %s", (user_id,))
            account = cur.fetchone() or {}
            sender_name = sanitize_string(account.get("full_name") or "Покупатель", 255)
            cur.execute(
                "INSERT INTO coop_order_messages (order_id, sender_type, sender_name, text, images, sender_user_id) "
                "VALUES (%s, 'user', %s, %s, %s, %s) RETURNING *",
                (order_id, sender_name, text, images, user_id)
            )
            msg = _row_to_dict(cur.fetchone())
            # A buyer who writes has read everything before their message.
            cur.execute(
                "INSERT INTO coop_order_chat_seen (order_id, seen_at, seen_message_id) VALUES (%s, NOW(), %s) "
                "ON CONFLICT (order_id) DO UPDATE SET seen_at = NOW(), "
                "seen_message_id = GREATEST(COALESCE(coop_order_chat_seen.seen_message_id, 0), EXCLUDED.seen_message_id)",
                (order_id, msg["id"])
            )
            from .supplier import suppliers_of_order
            cur.execute("SELECT items FROM coop_orders WHERE id = %s", (order_id,))
            suppliers = suppliers_of_order(cur, (cur.fetchone() or {}).get("items"))
        for sid in suppliers:
            notify_user(
                sid, key=f"supplier-order:{order_id}",
                title=f"Покупатель написал по заказу №{order_id}", body=snippet(text, images),
                url=f"/supplier?order={order_id}", email_subject=f"Новое сообщение по заказу №{order_id}",
            )
        return jsonify(msg), 201
    except Exception as e:
        print(f"[app/routes/order_chat.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/user/<int:user_id>/order-chats")
def list_user_order_chats(user_id):
    """Buyer's chat list: their orders with last-message preview and unread flag."""
    err = require_self(user_id)
    if err:
        return err
    try:
        with get_db() as cur:
            cur.execute(
                """
                SELECT o.id AS order_id, o.status, o.total, o.items, o.created_at,
                       latest.text AS last_text, latest.sender_type AS last_sender,
                       latest.created_at AS last_at, seen.seen_at,
                       EXISTS (
                           SELECT 1 FROM coop_order_messages unread_message
                           WHERE unread_message.order_id = o.id
                             AND unread_message.sender_type IN ('admin', 'leader', 'supplier')
                             AND unread_message.id > COALESCE(seen.seen_message_id, 0)
                       ) AS unread
                FROM coop_orders o
                LEFT JOIN LATERAL (
                    SELECT m.id, m.text, m.sender_type, m.created_at
                    FROM coop_order_messages m
                    WHERE m.order_id = o.id
                    ORDER BY m.id DESC
                    LIMIT 1
                ) latest ON TRUE
                LEFT JOIN coop_order_chat_seen seen ON seen.order_id = o.id
                WHERE o.user_id = %s
                ORDER BY COALESCE(latest.created_at, o.created_at) DESC
                """,
                (user_id,)
            )
            rows = _rows_to_list(cur.fetchall())
            for r in rows:
                r["unread"] = bool(r.get("unread"))
        return jsonify(rows or [])
    except Exception:
        return jsonify([])


@bp.route("/api/user/<int:user_id>/order-chats/unread-count")
def order_chats_unread_count(user_id):
    """Orders with admin messages the buyer hasn't opened the thread since."""
    err = require_self(user_id)
    if err:
        return err
    try:
        with get_db() as cur:
            cur.execute(
                """
                SELECT COUNT(*) AS cnt FROM coop_orders o
                WHERE o.user_id = %s
                AND EXISTS (
                    SELECT 1 FROM coop_order_messages m
                    WHERE m.order_id = o.id AND m.sender_type IN ('admin', 'leader', 'supplier')
                    AND m.id > COALESCE(
                        (SELECT seen_message_id FROM coop_order_chat_seen s WHERE s.order_id = o.id), 0
                    )
                )
                """,
                (user_id,)
            )
            row = cur.fetchone()
            return jsonify({"count": row["cnt"] if row else 0})
    except Exception:
        return jsonify({"count": 0})


# ── Admin ──────────────────────────────────────────────
@bp.route("/api/admin/order-chats")
def admin_list_order_chats():
    """Orders that have at least one chat message, newest activity first."""
    try:
        with get_db() as cur:
            cur.execute(
                """
                SELECT o.id AS order_id, o.full_name, o.status, o.user_id,
                       (SELECT text FROM coop_order_messages m WHERE m.order_id = o.id
                        ORDER BY m.id DESC LIMIT 1) AS last_text,
                       (SELECT sender_type FROM coop_order_messages m WHERE m.order_id = o.id
                        ORDER BY m.id DESC LIMIT 1) AS last_sender,
                       (SELECT created_at FROM coop_order_messages m WHERE m.order_id = o.id
                        ORDER BY m.id DESC LIMIT 1) AS last_at,
                       (SELECT COUNT(*) FROM coop_order_messages m WHERE m.order_id = o.id) AS msg_count
                FROM coop_orders o
                WHERE EXISTS (SELECT 1 FROM coop_order_messages m WHERE m.order_id = o.id)
                ORDER BY last_at DESC NULLS LAST
                """
            )
            rows = _rows_to_list(cur.fetchall())
            for r in rows:
                # The platform owes the next message after any buyer or
                # supplier message. Opening the thread must not clear this
                # queue; only a later platform reply does.
                r["needs_reply"] = r.get("last_sender") in ("user", "supplier", "leader")
        return jsonify(rows or [])
    except Exception:
        return jsonify([])


@bp.route("/api/admin/orders/<int:order_id>/messages", methods=["GET"])
def admin_get_order_messages(order_id):
    try:
        with get_db() as cur:
            cur.execute("SELECT status, full_name FROM coop_orders WHERE id = %s", (order_id,))
            order = cur.fetchone()
            msgs = enriched_order_messages(cur, order_id)
            from .store import order_status_history
            history = order_status_history(cur, order_id) if order else {}
        return jsonify({
            "messages": msgs,
            "status": order["status"] if order else None,
            "full_name": order["full_name"] if order else "",
            "history": history,
        })
    except Exception:
        return jsonify({"messages": [], "status": None, "full_name": ""})


@bp.route("/api/admin/orders/<int:order_id>/messages", methods=["POST"])
def admin_post_order_message(order_id):
    d = request.json or {}
    sender_name = sanitize_string(d.get("sender_name") or "Администратор", 255)
    text = sanitize_string(d.get("text") or "", 2000)
    images = sanitize_image_urls(d.get("images"))
    if not text.strip() and images == "[]":
        return jsonify({"error": "Напишите сообщение"}), 400
    try:
        with get_db() as cur:
            cur.execute("SELECT status FROM coop_orders WHERE id = %s", (order_id,))
            order = cur.fetchone()
            if not order:
                return jsonify({"error": "Заказ не найден"}), 404
            cur.execute(
                "INSERT INTO coop_order_messages (order_id, sender_type, sender_name, text, images) "
                "VALUES (%s, 'admin', %s, %s, %s) RETURNING *",
                (order_id, sender_name, text, images)
            )
            msg = _row_to_dict(cur.fetchone())
            cur.execute("SELECT user_id FROM coop_orders WHERE id = %s", (order_id,))
            buyer = (cur.fetchone() or {}).get("user_id")
        # Push to the buyer's devices and an email (throttled), after the commit
        notify_user(
            buyer, key=f"order:{order_id}",
            title=f"Менеджер ответил по заказу №{order_id}",
            body=snippet(text, images), url=f"/orders?order={order_id}",
            email_subject=f"Новое сообщение по заказу №{order_id}",
        )
        return jsonify(msg), 201
    except Exception as e:
        print(f"[app/routes/order_chat.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/order-messages/<int:mid>", methods=["DELETE"])
def admin_delete_order_message(mid):
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_order_messages WHERE id = %s", (mid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/order_chat.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500
