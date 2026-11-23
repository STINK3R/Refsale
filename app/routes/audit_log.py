"""The owner's register of admin actions: /api/admin/audit…

Only the owner (the master «admin» login) reads it; other admins get 403.
Rows are never edited or deleted through the API.
"""
import json
from datetime import datetime, timedelta

from flask import Blueprint, jsonify, request

from ..audit import is_owner
from ..db import get_db, _rows_to_list

bp = Blueprint("audit_log", __name__)


def _owner_only():
    if not is_owner():
        return jsonify({"error": "Реестр действий доступен только владельцу"}), 403
    return None


def _date(value: str | None):
    if not value:
        return None
    try:
        return datetime.strptime(value[:10], "%Y-%m-%d")
    except ValueError:
        return None


@bp.route("/api/admin/audit")
def api_audit_list():
    err = _owner_only()
    if err:
        return err
    where, params = ["1=1"], []
    admin = (request.args.get("admin") or "").strip()
    if admin:
        where.append("admin_username = %s")
        params.append(admin[:100])
    entity = (request.args.get("entity") or "").strip()
    if entity:
        where.append("entity = %s")
        params.append(entity[:60])
    kind = (request.args.get("kind") or "").strip()
    if kind == "delete":
        where.append("method = 'DELETE'")
    elif kind == "failed":
        where.append("status_code >= 400")
    elif kind == "auth":
        where.append("action LIKE 'auth.%%'")
    q = (request.args.get("q") or "").strip()
    if q:
        where.append("(action_label ILIKE %s OR details ILIKE %s OR COALESCE(snapshot, '') ILIKE %s OR entity_id = %s)")
        like = f"%{q[:100]}%"
        params += [like, like, like, q[:60]]
    start, end = _date(request.args.get("from")), _date(request.args.get("to"))
    if start:
        where.append("created_at >= %s")
        params.append(start)
    if end:
        where.append("created_at < %s")
        params.append(end + timedelta(days=1))
    try:
        limit = min(max(int(request.args.get("limit") or 50), 1), 200)
        offset = max(int(request.args.get("offset") or 0), 0)
    except ValueError:
        limit, offset = 50, 0
    sql_where = " AND ".join(where)
    with get_db() as cur:
        cur.execute(f"SELECT COUNT(*) AS n FROM ref_admin_audit WHERE {sql_where}", params)
        total = cur.fetchone()["n"]
        cur.execute(
            f"""SELECT * FROM ref_admin_audit WHERE {sql_where}
                ORDER BY created_at DESC, id DESC LIMIT %s OFFSET %s""",
            params + [limit, offset],
        )
        rows = _rows_to_list(cur.fetchall())
    for r in rows:
        for key in ("details", "snapshot"):
            try:
                r[key] = json.loads(r[key]) if r.get(key) else None
            except (TypeError, ValueError):
                pass
    return jsonify({"items": rows, "total": total})


@bp.route("/api/admin/audit/summary")
def api_audit_summary():
    """Activity per admin: how much, how many deletions, first and last action."""
    err = _owner_only()
    if err:
        return err
    days = request.args.get("days", "30")
    try:
        days = min(max(int(days), 1), 3650)
    except ValueError:
        days = 30
    with get_db() as cur:
        cur.execute(
            """SELECT admin_username, MAX(admin_name) AS admin_name, MAX(admin_id) AS admin_id,
                      COUNT(*) AS actions,
                      COUNT(*) FILTER (WHERE method = 'DELETE') AS deletions,
                      COUNT(*) FILTER (WHERE status_code >= 400) AS failed,
                      MIN(created_at) AS first_at, MAX(created_at) AS last_at
               FROM ref_admin_audit
               WHERE created_at > NOW() - (%s * INTERVAL '1 day')
               GROUP BY admin_username ORDER BY last_at DESC""",
            (days,),
        )
        admins = _rows_to_list(cur.fetchall())
        cur.execute(
            """SELECT entity, COUNT(*) AS n FROM ref_admin_audit
               WHERE created_at > NOW() - (%s * INTERVAL '1 day') AND entity <> ''
               GROUP BY entity ORDER BY n DESC""",
            (days,),
        )
        entities = _rows_to_list(cur.fetchall())
    return jsonify({"admins": admins, "entities": entities, "days": days})


@bp.route("/api/admin/whoami")
def api_admin_whoami():
    """Who is signed in to the admin panel and whether they own it."""
    from flask import g
    payload = getattr(g, "admin_payload", None) or {}
    return jsonify({"id": int(payload.get("id") or 0), "username": payload.get("u") or "", "is_owner": is_owner()})
