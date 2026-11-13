"""Private conversations between RefSale suppliers and opinion leaders."""

from flask import Blueprint, jsonify, request

from ..auth import require_auth
from ..db import _rows_to_list, get_db
from ..notify import notify_user, snippet
from ..utils import rate_limited, sanitize_image_urls, sanitize_string

bp = Blueprint("partner_chat", __name__)


def _participant(cur, uid: int):
    cur.execute(
        """SELECT id, full_name, avatar_url, is_leader, is_supplier, is_blocked
           FROM coop_users WHERE id = %s""",
        (uid,),
    )
    user = cur.fetchone()
    if not user or user.get("is_blocked"):
        return None
    if not (user.get("is_leader") or user.get("is_supplier")):
        return None
    return user


def _role(user) -> str:
    roles = []
    if user.get("is_supplier"):
        roles.append("поставщик")
    if user.get("is_leader"):
        roles.append("лидер мнений")
    return " · ".join(roles)


def _require_partner():
    uid, err = require_auth()
    if err:
        return None, err
    with get_db() as cur:
        user = _participant(cur, uid)
    if not user:
        return None, (jsonify({"error": "Чат доступен поставщикам и лидерам мнений"}), 403)
    return user, None


def _conversation_for(cur, conversation_id: int, uid: int):
    cur.execute(
        """SELECT id, participant_low_id, participant_high_id
           FROM ref_partner_conversations WHERE id = %s
             AND (participant_low_id = %s OR participant_high_id = %s)""",
        (conversation_id, uid, uid),
    )
    return cur.fetchone()


@bp.route("/api/partner-chat/contacts")
def partner_contacts():
    me, err = _require_partner()
    if err:
        return err
    q = sanitize_string(request.args.get("q") or "", 100).strip()
    with get_db() as cur:
        cur.execute(
            """SELECT id, full_name, COALESCE(avatar_url, '') AS avatar_url,
                      is_supplier, is_leader
               FROM coop_users
               WHERE id <> %s AND COALESCE(is_blocked, FALSE) = FALSE
                 AND (COALESCE(is_supplier, FALSE) OR COALESCE(is_leader, FALSE))
                 AND (%s = '' OR full_name ILIKE %s)
               ORDER BY full_name ASC LIMIT 100""",
            (me["id"], q, f"%{q}%"),
        )
        rows = _rows_to_list(cur.fetchall())
    return jsonify([
        {"id": u["id"], "name": u.get("full_name") or "Участник",
         "avatar_url": u.get("avatar_url") or "", "role": _role(u)}
        for u in rows
    ])


@bp.route("/api/partner-chat/conversations")
def partner_conversations():
    me, err = _require_partner()
    if err:
        return err
    uid = me["id"]
    with get_db() as cur:
        cur.execute(
            """SELECT c.id, c.updated_at, other.id AS other_id,
                      other.full_name AS other_name, COALESCE(other.avatar_url, '') AS other_avatar,
                      other.is_supplier AS other_supplier, other.is_leader AS other_leader,
                      latest.text AS last_text, latest.images AS last_images,
                      latest.created_at AS last_at, latest.sender_id AS last_sender_id,
                      COALESCE(seen.seen_message_id, 0) AS seen_message_id,
                      COALESCE(latest.id, 0) AS last_message_id
               FROM ref_partner_conversations c
               JOIN coop_users other ON other.id = CASE
                   WHEN c.participant_low_id = %s THEN c.participant_high_id
                   ELSE c.participant_low_id END
               LEFT JOIN LATERAL (
                   SELECT id, text, images, created_at, sender_id
                   FROM ref_partner_messages WHERE conversation_id = c.id
                   ORDER BY id DESC LIMIT 1
               ) latest ON TRUE
               LEFT JOIN ref_partner_chat_seen seen
                 ON seen.conversation_id = c.id AND seen.user_id = %s
               WHERE c.participant_low_id = %s OR c.participant_high_id = %s
               ORDER BY COALESCE(latest.created_at, c.updated_at) DESC""",
            (uid, uid, uid, uid),
        )
        rows = _rows_to_list(cur.fetchall())
    out = []
    for row in rows:
        row["other_role"] = _role({"is_supplier": row.pop("other_supplier"), "is_leader": row.pop("other_leader")})
        row["unread"] = int(row.get("last_sender_id") or 0) != uid and int(row.get("last_message_id") or 0) > int(row.get("seen_message_id") or 0)
        row["last_text"] = row.get("last_text") or snippet("", row.get("last_images"))
        row.pop("last_images", None)
        row.pop("last_sender_id", None)
        row.pop("seen_message_id", None)
        row.pop("last_message_id", None)
        out.append(row)
    return jsonify(out)


@bp.route("/api/partner-chat/conversations", methods=["POST"])
def partner_open_conversation():
    if rate_limited(30, "partner_chat"):
        return jsonify({"error": "Слишком много запросов. Попробуйте позже."}), 429
    me, err = _require_partner()
    if err:
        return err
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        data = {}
    try:
        other_id = int(data.get("user_id"))
    except (TypeError, ValueError):
        return jsonify({"error": "Выберите участника"}), 400
    if other_id == me["id"]:
        return jsonify({"error": "Нельзя начать чат с самим собой"}), 400
    with get_db() as cur:
        other = _participant(cur, other_id)
        if not other:
            return jsonify({"error": "Участник не найден или не может пользоваться этим чатом"}), 404
        low, high = sorted((int(me["id"]), other_id))
        cur.execute(
            """INSERT INTO ref_partner_conversations (participant_low_id, participant_high_id)
               VALUES (%s, %s)
               ON CONFLICT (participant_low_id, participant_high_id)
               DO UPDATE SET updated_at = ref_partner_conversations.updated_at
               RETURNING id""",
            (low, high),
        )
        conversation_id = cur.fetchone()["id"]
    return jsonify({"id": conversation_id, "other": {
        "id": other["id"], "name": other.get("full_name") or "Участник",
        "avatar_url": other.get("avatar_url") or "", "role": _role(other),
    }}), 200


@bp.route("/api/partner-chat/conversations/<int:conversation_id>/messages")
def partner_messages(conversation_id):
    me, err = _require_partner()
    if err:
        return err
    uid = me["id"]
    with get_db() as cur:
        conv = _conversation_for(cur, conversation_id, uid)
        if not conv:
            return jsonify({"error": "Диалог не найден"}), 404
        cur.execute(
            """SELECT m.id, m.conversation_id, m.sender_id, m.text, m.images, m.created_at,
                      u.full_name AS sender_name, COALESCE(u.avatar_url, '') AS avatar_url,
                      u.is_supplier, u.is_leader
               FROM ref_partner_messages m
               JOIN coop_users u ON u.id = m.sender_id
               WHERE m.conversation_id = %s ORDER BY m.id ASC""",
            (conversation_id,),
        )
        rows = _rows_to_list(cur.fetchall())
        last_id = max((int(row["id"]) for row in rows), default=0)
        cur.execute(
            """INSERT INTO ref_partner_chat_seen (conversation_id, user_id, seen_message_id, seen_at)
               VALUES (%s, %s, %s, NOW())
               ON CONFLICT (conversation_id, user_id) DO UPDATE
                 SET seen_message_id = GREATEST(ref_partner_chat_seen.seen_message_id, EXCLUDED.seen_message_id),
                     seen_at = NOW()""",
            (conversation_id, uid, last_id),
        )
    for row in rows:
        row["sender_role"] = _role({"is_supplier": row.pop("is_supplier"), "is_leader": row.pop("is_leader")})
    return jsonify({"messages": rows})


@bp.route("/api/partner-chat/conversations/<int:conversation_id>/messages", methods=["POST"])
def partner_post_message(conversation_id):
    if rate_limited(20, "partner_chat"):
        return jsonify({"error": "Слишком много сообщений. Попробуйте позже."}), 429
    me, err = _require_partner()
    if err:
        return err
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        data = {}
    text = sanitize_string(data.get("text") or "", 2000).strip()
    images = sanitize_image_urls(data.get("images"), max_items=4)
    if not text and images == "[]":
        return jsonify({"error": "Напишите сообщение или прикрепите файл"}), 400
    with get_db() as cur:
        conv = _conversation_for(cur, conversation_id, me["id"])
        if not conv:
            return jsonify({"error": "Диалог не найден"}), 404
        recipient = conv["participant_high_id"] if conv["participant_low_id"] == me["id"] else conv["participant_low_id"]
        recipient_user = _participant(cur, int(recipient))
        if not recipient_user:
            return jsonify({"error": "Участник больше не может пользоваться этим чатом"}), 404
        cur.execute(
            """INSERT INTO ref_partner_messages (conversation_id, sender_id, text, images)
               VALUES (%s, %s, %s, %s) RETURNING id, conversation_id, sender_id, text, images, created_at""",
            (conversation_id, me["id"], text, images),
        )
        message = cur.fetchone()
        cur.execute("UPDATE ref_partner_conversations SET updated_at = NOW() WHERE id = %s", (conversation_id,))
        message = dict(message)
        message.update(sender_name=me.get("full_name") or "Участник", avatar_url=me.get("avatar_url") or "", sender_role=_role(me))
    inbox_path = "/cabinet" if recipient_user and recipient_user.get("is_leader") else "/supplier"
    notify_user(
        recipient, key=f"partner-chat:{conversation_id}",
        title=f"Сообщение от {me.get('full_name') or 'участника'}",
        body=snippet(text, images), url=f"{inbox_path}?partner_chat={conversation_id}",
        email_subject="Новое сообщение в RefSale",
    )
    return jsonify(message), 201


# ── Admin: read-only view of every conversation ───────────────────────────
# /api/admin/* is guarded app-wide (app/__init__.py). The platform reads these
# threads for moderation; reading here does not mark anything as seen.
@bp.route("/api/admin/partner-chats")
def admin_partner_chats():
    with get_db() as cur:
        cur.execute(
            """SELECT c.id, c.created_at, c.updated_at,
                      lo.id AS a_id, lo.full_name AS a_name, COALESCE(lo.avatar_url, '') AS a_avatar,
                      lo.is_supplier AS a_supplier, lo.is_leader AS a_leader,
                      hi.id AS b_id, hi.full_name AS b_name, COALESCE(hi.avatar_url, '') AS b_avatar,
                      hi.is_supplier AS b_supplier, hi.is_leader AS b_leader,
                      latest.text AS last_text, latest.images AS last_images,
                      latest.created_at AS last_at, latest.sender_id AS last_sender_id,
                      (SELECT COUNT(*) FROM ref_partner_messages m WHERE m.conversation_id = c.id) AS message_count
               FROM ref_partner_conversations c
               JOIN coop_users lo ON lo.id = c.participant_low_id
               JOIN coop_users hi ON hi.id = c.participant_high_id
               LEFT JOIN LATERAL (
                   SELECT text, images, created_at, sender_id FROM ref_partner_messages
                   WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1
               ) latest ON TRUE
               ORDER BY COALESCE(latest.created_at, c.updated_at) DESC"""
        )
        rows = _rows_to_list(cur.fetchall())
    out = []
    for r in rows:
        people = []
        for side in ("a", "b"):
            people.append({
                "id": r[f"{side}_id"], "name": r.get(f"{side}_name") or "Участник",
                "avatar_url": r.get(f"{side}_avatar") or "",
                "role": _role({"is_supplier": r.get(f"{side}_supplier"), "is_leader": r.get(f"{side}_leader")}),
            })
        sender = next((p["name"] for p in people if p["id"] == r.get("last_sender_id")), "")
        out.append({
            "id": r["id"], "participants": people, "created_at": r.get("created_at"),
            "last_at": r.get("last_at") or r.get("updated_at"), "last_sender": sender,
            "last_text": r.get("last_text") or snippet("", r.get("last_images")),
            "message_count": int(r.get("message_count") or 0),
        })
    return jsonify(out)


@bp.route("/api/admin/partner-chats/<int:conversation_id>/messages")
def admin_partner_chat_messages(conversation_id):
    with get_db() as cur:
        cur.execute("SELECT id FROM ref_partner_conversations WHERE id = %s", (conversation_id,))
        if not cur.fetchone():
            return jsonify({"error": "Диалог не найден"}), 404
        cur.execute(
            """SELECT m.id, m.sender_id, m.text, m.images, m.created_at,
                      u.full_name AS sender_name, COALESCE(u.avatar_url, '') AS avatar_url,
                      u.is_supplier, u.is_leader
               FROM ref_partner_messages m JOIN coop_users u ON u.id = m.sender_id
               WHERE m.conversation_id = %s ORDER BY m.id ASC""",
            (conversation_id,),
        )
        rows = _rows_to_list(cur.fetchall())
    for row in rows:
        row["sender_role"] = _role({"is_supplier": row.pop("is_supplier"), "is_leader": row.pop("is_leader")})
    return jsonify({"messages": rows})
