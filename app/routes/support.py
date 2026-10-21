"""
Support ticket API routes — public + admin.

Tickets are readable by their owner and by admins, nothing else. `sender_type`
is decided here from the caller's token: a client that simply asks to post as
'admin' would otherwise be able to impersonate the cooperative.
"""

from flask import Blueprint, request, jsonify

from ..db import get_db, _row_to_dict, _rows_to_list
from ..utils import rate_limited, sanitize_string, sanitize_image_urls
from ..auth import auth_user_id, require_self, claimed_user_id, is_admin_request
from ..notify import notify_user, snippet

bp = Blueprint('support', __name__)


def _ticket_owner(cur, tid):
    """(found, owner_user_id) for a ticket; owner is None for guest tickets."""
    cur.execute("SELECT user_id FROM coop_support_tickets WHERE id = %s LIMIT 1", (tid,))
    row = cur.fetchone()
    if not row:
        return False, None
    owner = row.get("user_id")
    return True, (int(owner) if owner else None)


def _may_access_ticket(cur, tid):
    """None when the caller may read/write this ticket, else an error response."""
    found, owner = _ticket_owner(cur, tid)
    if not found:
        return jsonify({"error": "Обращение не найдено"}), 404
    if is_admin_request():
        return None
    uid = auth_user_id()
    # Guest tickets (no owner) have nobody to authenticate as — admin only.
    if owner is None or uid is None or uid != owner:
        return jsonify({"error": "Нет доступа"}), 403
    return None


# ── Public ─────────────────────────────────────
@bp.route("/api/support/tickets", methods=["POST"])
def api_create_ticket():
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    d = request.json or {}
    user_id, auth_err = claimed_user_id(d.get("user_id"))
    if auth_err:
        return auth_err
    user_name = sanitize_string(d.get("user_name") or "", 255)
    subject = sanitize_string(d.get("subject") or "", 300)
    text = sanitize_string(d.get("text") or "", 5000)
    images = sanitize_image_urls(d.get("images"))
    if not subject or not text:
        return jsonify({"error": "Заполните тему и текст обращения"}), 400
    # Product enquiries ("Связь с продавцом") are a members-only channel — the
    # UI sends guests to register, and this backs that up. The id itself isn't
    # stored (the product is named in the message text); it only marks intent.
    if d.get("product_id") and user_id is None:
        return jsonify({"error": "Чтобы написать продавцу, войдите или зарегистрируйтесь"}), 401
    promo_code = sanitize_string(d.get("promo_code") or "", 50).upper()
    try:
        with get_db() as cur:
            # A buyer who came with a leader's code: the leader sees this
            # conversation in their cabinet, read-only.
            leader_id = None
            if promo_code:
                from .store import load_promo
                promo, _ = load_promo(cur, promo_code)
                if promo:
                    leader_id = promo.get("leader_id")
                else:
                    promo_code = ""
            cur.execute(
                "INSERT INTO coop_support_tickets (user_id, user_name, subject, promo_code, leader_id) "
                "VALUES (%s, %s, %s, %s, %s) RETURNING *",
                (user_id, user_name, subject, promo_code or None, leader_id)
            )
            ticket = _row_to_dict(cur.fetchone())
            cur.execute(
                "INSERT INTO coop_support_messages (ticket_id, sender_type, sender_name, text, images) VALUES (%s, 'user', %s, %s, %s) RETURNING *",
                (ticket['id'], user_name, text, images)
            )
            msg = _row_to_dict(cur.fetchone())
        return jsonify({"ticket": ticket, "message": msg})
    except Exception as e:
        print(f"[/api/support/tickets] error: {e}")
        return jsonify({"error": "Ошибка создания обращения"}), 500


@bp.route("/api/support/tickets/<int:user_id>")
def api_user_tickets(user_id):
    err = require_self(user_id)
    if err:
        return err
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_support_tickets WHERE user_id = %s ORDER BY updated_at DESC", (user_id,))
            tickets = _rows_to_list(cur.fetchall())
        return jsonify(tickets or [])
    except:
        return jsonify([])


@bp.route("/api/support/tickets/<int:tid>/messages")
def api_ticket_messages(tid):
    try:
        with get_db() as cur:
            err = _may_access_ticket(cur, tid)
            if err:
                return err
            cur.execute("SELECT * FROM coop_support_messages WHERE ticket_id = %s ORDER BY created_at ASC", (tid,))
            msgs = _rows_to_list(cur.fetchall())
        return jsonify(msgs or [])
    except:
        return jsonify([])


@bp.route("/api/support/tickets/<int:tid>/messages", methods=["POST"])
def api_add_ticket_message(tid):
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    d = request.json or {}
    sender_name = sanitize_string(d.get("sender_name") or "", 255)
    text = sanitize_string(d.get("text") or "", 5000)
    images = sanitize_image_urls(d.get("images"))
    if not text and images == "[]":
        return jsonify({"error": "Напишите сообщение"}), 400
    try:
        with get_db() as cur:
            err = _may_access_ticket(cur, tid)
            if err:
                return err
            # Derived from the token, never taken from the request body.
            sender_type = 'admin' if is_admin_request() else 'user'
            cur.execute(
                "INSERT INTO coop_support_messages (ticket_id, sender_type, sender_name, text, images) VALUES (%s, %s, %s, %s, %s) RETURNING *",
                (tid, sender_type, sender_name, text, images)
            )
            msg = _row_to_dict(cur.fetchone())
            cur.execute("UPDATE coop_support_tickets SET updated_at = NOW() WHERE id = %s RETURNING user_id, subject", (tid,))
            t = cur.fetchone() or {}
        if sender_type == 'admin':
            notify_user(
                t.get("user_id"), key=f"ticket:{tid}",
                title="Продавец ответил на ваш вопрос", body=snippet(text, images),
                url=f"/?support={tid}", email_subject=f"Ответ: {t.get('subject') or 'вопрос продавцу'}",
            )
        return jsonify(msg)
    except Exception as e:
        print(f"[/api/support/tickets/{tid}/messages] error: {e}")
        return jsonify({"error": "Ошибка отправки сообщения"}), 500


@bp.route("/api/support/unread-count/<int:user_id>")
def api_support_unread_count(user_id):
    """Count tickets with unread admin replies for a user."""
    err = require_self(user_id)
    if err:
        return err
    try:
        with get_db() as cur:
            # Count tickets where the latest message is from admin (i.e. user hasn't seen it)
            cur.execute("""
                SELECT COUNT(*) as cnt FROM coop_support_tickets t
                WHERE t.user_id = %s AND t.status != 'closed'
                AND EXISTS (
                    SELECT 1 FROM coop_support_messages m
                    WHERE m.ticket_id = t.id AND m.sender_type = 'admin'
                    AND m.id = (SELECT MAX(m2.id) FROM coop_support_messages m2 WHERE m2.ticket_id = t.id)
                )
            """, (user_id,))
            row = cur.fetchone()
            return jsonify({"count": row["cnt"] if row else 0})
    except:
        return jsonify({"count": 0})


# ── Admin ──────────────────────────────────────
@bp.route("/api/admin/support/tickets")
def api_admin_support_tickets():
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_support_tickets ORDER BY updated_at DESC")
            tickets = _rows_to_list(cur.fetchall())
        return jsonify(tickets or [])
    except:
        return jsonify([])


@bp.route("/api/admin/support/tickets/<int:tid>/status", methods=["PATCH"])
def api_admin_update_ticket_status(tid):
    d = request.json or {}
    status = d.get("status", "open")
    try:
        with get_db() as cur:
            cur.execute("UPDATE coop_support_tickets SET status = %s, updated_at = NOW() WHERE id = %s RETURNING *",
                        (status, tid))
            result = _row_to_dict(cur.fetchone())
        return jsonify(result)
    except Exception as e:
        print(f"[/api/admin/support/tickets/{tid}/status] error: {e}")
        return jsonify({"error": "Ошибка обновления статуса"}), 500


@bp.route("/api/admin/support/messages/<int:mid>", methods=["DELETE"])
def api_admin_delete_support_message(mid):
    """Admin-only: delete any support chat message (from user or admin)."""
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_support_messages WHERE id = %s", (mid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[/api/admin/support/messages/{mid}] error: {e}")
        return jsonify({"error": "Ошибка удаления сообщения"}), 500
