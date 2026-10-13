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
from ..email_service import email_order_new_message

bp = Blueprint('order_chat', __name__)

# Statuses after which the chat is read-only.
CLOSED_STATUSES = ('done', 'cancelled')

_CREATE_TABLE_SQL = (
    "CREATE TABLE IF NOT EXISTS coop_order_messages ("
    "id SERIAL PRIMARY KEY, "
    "order_id INTEGER REFERENCES coop_orders(id) ON DELETE CASCADE, "
    "sender_type VARCHAR(10) DEFAULT 'user', "
    "sender_name VARCHAR(255) DEFAULT '', "
    "text TEXT NOT NULL, "
    "created_at TIMESTAMPTZ DEFAULT NOW())"
)


def _ensure_table(cur):
    cur.execute(_CREATE_TABLE_SQL)
    cur.execute("CREATE INDEX IF NOT EXISTS idx_order_messages_order ON coop_order_messages(order_id)")
    # Tracks when the buyer last opened the thread — drives the unread badge.
    cur.execute(
        "CREATE TABLE IF NOT EXISTS coop_order_chat_seen ("
        "order_id INTEGER PRIMARY KEY REFERENCES coop_orders(id) ON DELETE CASCADE, "
        "seen_at TIMESTAMPTZ DEFAULT NOW())"
    )


# ── Buyer (public) ─────────────────────────────────────
@bp.route("/api/orders/<int:order_id>/messages", methods=["GET"])
def get_order_messages(order_id):
    """Thread for a single order. The token must own the order."""
    user_id, err = require_auth()
    if err:
        return err
    try:
        with get_db() as cur:
            _ensure_table(cur)
            cur.execute("SELECT user_id, status FROM coop_orders WHERE id = %s", (order_id,))
            order = cur.fetchone()
            if not order:
                return jsonify({"error": "Заказ не найден"}), 404
            if str(order["user_id"]) != str(user_id):
                return jsonify({"error": "Нет доступа"}), 403
            cur.execute(
                "SELECT * FROM coop_order_messages WHERE order_id = %s ORDER BY created_at ASC",
                (order_id,)
            )
            msgs = _rows_to_list(cur.fetchall())
            # Mark the thread as seen by the buyer (drives the unread badge).
            cur.execute(
                "INSERT INTO coop_order_chat_seen (order_id, seen_at) VALUES (%s, NOW()) "
                "ON CONFLICT (order_id) DO UPDATE SET seen_at = NOW()",
                (order_id,)
            )
        return jsonify({"messages": msgs, "status": order["status"]})
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
            _ensure_table(cur)
            cur.execute("SELECT user_id, status FROM coop_orders WHERE id = %s", (order_id,))
            order = cur.fetchone()
            if not order:
                return jsonify({"error": "Заказ не найден"}), 404
            if str(order["user_id"]) != str(user_id):
                return jsonify({"error": "Нет доступа"}), 403
            if order["status"] in CLOSED_STATUSES:
                return jsonify({"error": "Заказ завершён — чат закрыт"}), 409
            cur.execute(
                "INSERT INTO coop_order_messages (order_id, sender_type, sender_name, text, images) "
                "VALUES (%s, 'user', %s, %s, %s) RETURNING *",
                (order_id, sender_name, text, images)
            )
            msg = _row_to_dict(cur.fetchone())
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
            _ensure_table(cur)
            cur.execute(
                """
                SELECT o.id AS order_id, o.status, o.total, o.items, o.created_at,
                       (SELECT text FROM coop_order_messages m WHERE m.order_id = o.id
                        ORDER BY m.id DESC LIMIT 1) AS last_text,
                       (SELECT sender_type FROM coop_order_messages m WHERE m.order_id = o.id
                        ORDER BY m.id DESC LIMIT 1) AS last_sender,
                       (SELECT created_at FROM coop_order_messages m WHERE m.order_id = o.id
                        ORDER BY m.id DESC LIMIT 1) AS last_at,
                       (SELECT seen_at FROM coop_order_chat_seen s WHERE s.order_id = o.id) AS seen_at
                FROM coop_orders o
                WHERE o.user_id = %s
                ORDER BY COALESCE((SELECT MAX(m.created_at) FROM coop_order_messages m WHERE m.order_id = o.id), o.created_at) DESC
                """,
                (user_id,)
            )
            rows = _rows_to_list(cur.fetchall())
            for r in rows:
                r["unread"] = (
                    r.get("last_sender") in ("admin", "leader")
                    and (not r.get("seen_at") or (r.get("last_at") or "") > (r.get("seen_at") or ""))
                )
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
            _ensure_table(cur)
            cur.execute(
                """
                SELECT COUNT(*) AS cnt FROM coop_orders o
                WHERE o.user_id = %s
                AND EXISTS (
                    SELECT 1 FROM coop_order_messages m
                    WHERE m.order_id = o.id AND m.sender_type IN ('admin', 'leader')
                    AND m.id = (SELECT MAX(m2.id) FROM coop_order_messages m2 WHERE m2.order_id = o.id)
                    AND m.created_at > COALESCE(
                        (SELECT seen_at FROM coop_order_chat_seen s WHERE s.order_id = o.id),
                        'epoch'::timestamptz
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
            _ensure_table(cur)
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
                r["needs_reply"] = (r.get("last_sender") == "user")
        return jsonify(rows or [])
    except Exception:
        return jsonify([])


@bp.route("/api/admin/orders/<int:order_id>/messages", methods=["GET"])
def admin_get_order_messages(order_id):
    try:
        with get_db() as cur:
            _ensure_table(cur)
            cur.execute("SELECT status, full_name FROM coop_orders WHERE id = %s", (order_id,))
            order = cur.fetchone()
            cur.execute(
                "SELECT * FROM coop_order_messages WHERE order_id = %s ORDER BY created_at ASC",
                (order_id,)
            )
            msgs = _rows_to_list(cur.fetchall())
        return jsonify({
            "messages": msgs,
            "status": order["status"] if order else None,
            "full_name": order["full_name"] if order else "",
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
            _ensure_table(cur)
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
            # Notify the buyer by email that there's a new reply.
            cur.execute(
                "SELECT u.full_name, u.email FROM coop_orders o "
                "JOIN coop_users u ON u.id = o.user_id WHERE o.id = %s",
                (order_id,)
            )
            u = cur.fetchone()
        if u and u.get("email"):
            try:
                email_order_new_message(u["full_name"], u["email"], order_id)
            except Exception:
                pass
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