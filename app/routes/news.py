"""News in the catalog: two feeds with photos and videos, likes and comments.

- 'buyers'   — for everyone: deliveries, new arrivals, recipes. Anyone reads
               it; a signed-in buyer likes and comments.
- 'partners' — for opinion leaders and suppliers: read and discussed only by
               them (and the admin).

The admin posts to either feed from the admin panel; leaders and suppliers
post from the feed itself. A post has a title, a description, tags and up to
10 photos or videos.
"""
import json
import re

from flask import Blueprint, jsonify, request

from ..auth import auth_user_id, require_auth
from ..db import get_db, _row_to_dict, _rows_to_list
from ..utils import rate_limited, sanitize_string, public_name

bp = Blueprint("news", __name__)

FEEDS = ("buyers", "partners")
FEED_LABELS = {"buyers": "Покупателям", "partners": "Лидерам мнений и поставщикам"}
MAX_MEDIA = 10
MAX_TAGS = 8
_VIDEO_EXT = {"mp4", "webm", "mov"}
_IMAGE_EXT = {"jpg", "jpeg", "png", "gif", "webp"}


# ── helpers ─────────────────────────────────────
def clean_media(value) -> str:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            value = []
    out = []
    for item in (value if isinstance(value, list) else [])[:MAX_MEDIA]:
        url = item.get("url") if isinstance(item, dict) else item
        if not isinstance(url, str):
            continue
        url = url.strip()
        if not url.startswith("/uploads/") or ".." in url or "\\" in url or len(url) > 300 or re.search(r"[\s\"'<>]", url):
            continue
        ext = url.rsplit(".", 1)[-1].lower() if "." in url else ""
        if ext in _VIDEO_EXT:
            out.append({"url": url, "type": "video"})
        elif ext in _IMAGE_EXT:
            out.append({"url": url, "type": "image"})
    return json.dumps(out, ensure_ascii=False)


def clean_tags(value) -> str:
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            value = parsed if isinstance(parsed, list) else value
        except ValueError:
            pass
    if isinstance(value, str):
        value = re.split(r"[,#\n]", value)
    tags, seen = [], set()
    for t in (value if isinstance(value, list) else []):
        if not isinstance(t, str):
            continue
        t = re.sub(r"\s+", " ", t.strip().lstrip("#"))[:40]
        if t and t.lower() not in seen:
            seen.add(t.lower())
            tags.append(sanitize_string(t, 60))
        if len(tags) >= MAX_TAGS:
            break
    return json.dumps(tags, ensure_ascii=False)


def _role(cur, uid):
    """'leader', 'supplier' or 'buyer' for a signed-in member; None for a guest."""
    if not uid:
        return None, None
    cur.execute("SELECT full_name, is_leader, is_supplier, is_blocked FROM coop_users WHERE id = %s", (uid,))
    u = cur.fetchone()
    if not u or u.get("is_blocked"):
        return None, None
    role = "leader" if u.get("is_leader") else "supplier" if u.get("is_supplier") else "buyer"
    return role, u


def _can_read(feed: str, role) -> bool:
    return feed == "buyers" or role in ("leader", "supplier")


def _decode(row: dict) -> dict:
    for key in ("tags", "media"):
        try:
            row[key] = json.loads(row.get(key) or "[]")
        except ValueError:
            row[key] = []
    return row


def _posts(cur, where: str, params: list, uid, limit: int, offset: int):
    cur.execute(
        f"""SELECT p.*,
                   (SELECT COUNT(*) FROM ref_news_likes l WHERE l.post_id = p.id) AS like_count,
                   (SELECT COUNT(*) FROM ref_news_comments c WHERE c.post_id = p.id) AS comment_count,
                   EXISTS (SELECT 1 FROM ref_news_likes l WHERE l.post_id = p.id AND l.user_id = %s) AS liked,
                   u.avatar_url AS author_avatar
            FROM ref_news_posts p LEFT JOIN coop_users u ON u.id = p.author_user_id
            WHERE {where}
            ORDER BY p.is_pinned DESC, p.created_at DESC, p.id DESC
            LIMIT %s OFFSET %s""",
        [uid or 0] + params + [limit, offset],
    )
    rows = [_decode(r) for r in _rows_to_list(cur.fetchall())]
    for r in rows:
        r["is_mine"] = bool(uid) and r.get("author_user_id") == uid
    return rows


def _paging():
    try:
        limit = min(max(int(request.args.get("limit") or 10), 1), 30)
        offset = max(int(request.args.get("offset") or 0), 0)
    except ValueError:
        limit, offset = 10, 0
    return limit, offset


# ── storefront ──────────────────────────────────
@bp.route("/api/news/meta")
def api_news_meta():
    uid = auth_user_id()
    with get_db() as cur:
        role, _u = _role(cur, uid)
        feeds = [f for f in FEEDS if _can_read(f, role)]
        cur.execute("SELECT feed, tags FROM ref_news_posts WHERE feed = ANY(%s) ORDER BY created_at DESC LIMIT 300", (feeds,))
        counts: dict = {}
        for r in cur.fetchall():
            try:
                for t in json.loads(r["tags"] or "[]"):
                    key = (r["feed"], t)
                    counts[key] = counts.get(key, 0) + 1
            except ValueError:
                pass
        cur.execute("SELECT COALESCE(MAX(id), 0) AS m FROM ref_news_posts WHERE feed = 'buyers'")
        latest = cur.fetchone()["m"]
    tags = {f: [t for (ff, t), _n in sorted(counts.items(), key=lambda x: -x[1]) if ff == f][:20] for f in feeds}
    return jsonify({
        "role": role, "feeds": [{"key": f, "label": FEED_LABELS[f]} for f in feeds],
        "can_post": role in ("leader", "supplier"), "tags": tags, "latest_id": latest,
    })


@bp.route("/api/news")
def api_news_list():
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    feed = request.args.get("feed") or "buyers"
    if feed not in FEEDS:
        return jsonify({"error": "Нет такой ленты"}), 400
    uid = auth_user_id()
    limit, offset = _paging()
    tag = sanitize_string(request.args.get("tag") or "", 60)
    q = (request.args.get("q") or "").strip()[:100]
    with get_db() as cur:
        role, _u = _role(cur, uid)
        if not _can_read(feed, role):
            return jsonify({"error": "Эта лента — для лидеров мнений и поставщиков"}), 403
        where, params = ["p.feed = %s"], [feed]
        if tag:
            where.append("p.tags LIKE %s")
            params.append(f'%{json.dumps(tag, ensure_ascii=False)}%')
        if q:
            where.append("(p.title ILIKE %s OR p.body ILIKE %s)")
            params += [f"%{q}%", f"%{q}%"]
        items = _posts(cur, " AND ".join(where), params, uid, limit + 1, offset)
    return jsonify({"items": items[:limit], "has_more": len(items) > limit})


@bp.route("/api/news", methods=["POST"])
def api_news_create():
    uid, err = require_auth()
    if err:
        return err
    if rate_limited(limit=10, bucket="news_post"):
        return jsonify({"error": "Слишком часто. Подождите минуту."}), 429
    d = request.json or {}
    feed = d.get("feed") if d.get("feed") in FEEDS else "buyers"
    title = sanitize_string(d.get("title") or "", 300)
    body = sanitize_string(d.get("body") or "", 10000)
    if not title:
        return jsonify({"error": "Добавьте заголовок"}), 400
    with get_db() as cur:
        role, u = _role(cur, uid)
        if role not in ("leader", "supplier"):
            return jsonify({"error": "Публиковать новости могут лидеры мнений и поставщики"}), 403
        cur.execute(
            """INSERT INTO ref_news_posts (feed, title, body, tags, media, author_user_id, author_role, author_name)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s) RETURNING *""",
            (feed, title, body, clean_tags(d.get("tags")), clean_media(d.get("media")), uid, role,
             sanitize_string(u.get("full_name") or "", 255)),
        )
        post = _decode(_row_to_dict(cur.fetchone()))
    post.update({"like_count": 0, "comment_count": 0, "liked": False, "is_mine": True})
    return jsonify({"post": post})


@bp.route("/api/news/<int:pid>", methods=["DELETE"])
def api_news_delete_own(pid):
    uid, err = require_auth()
    if err:
        return err
    with get_db() as cur:
        cur.execute("DELETE FROM ref_news_posts WHERE id = %s AND author_user_id = %s RETURNING id", (pid, uid))
        if not cur.fetchone():
            return jsonify({"error": "Можно удалить только свою публикацию"}), 403
    return jsonify({"ok": True})


def _readable_post(cur, pid, uid):
    cur.execute("SELECT id, feed FROM ref_news_posts WHERE id = %s", (pid,))
    post = cur.fetchone()
    if not post:
        return None, (jsonify({"error": "Публикация не найдена"}), 404)
    role, u = _role(cur, uid)
    if not _can_read(post["feed"], role):
        return None, (jsonify({"error": "Нет доступа"}), 403)
    return (post, role, u), None


@bp.route("/api/news/<int:pid>/like", methods=["POST"])
def api_news_like(pid):
    uid, err = require_auth()
    if err:
        return err
    with get_db() as cur:
        found, bad = _readable_post(cur, pid, uid)
        if bad:
            return bad
        cur.execute("DELETE FROM ref_news_likes WHERE post_id = %s AND user_id = %s RETURNING post_id", (pid, uid))
        liked = cur.fetchone() is None
        if liked:
            cur.execute("INSERT INTO ref_news_likes (post_id, user_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (pid, uid))
        cur.execute("SELECT COUNT(*) AS n FROM ref_news_likes WHERE post_id = %s", (pid,))
        n = cur.fetchone()["n"]
    return jsonify({"liked": liked, "like_count": n})


@bp.route("/api/news/<int:pid>/comments")
def api_news_comments(pid):
    uid = auth_user_id()
    with get_db() as cur:
        found, bad = _readable_post(cur, pid, uid)
        if bad:
            return bad
        cur.execute(
            """SELECT c.id, c.post_id, c.user_id, c.author_name, c.author_role, c.text, c.created_at, u.avatar_url
               FROM ref_news_comments c LEFT JOIN coop_users u ON u.id = c.user_id
               WHERE c.post_id = %s ORDER BY c.id ASC LIMIT 500""",
            (pid,),
        )
        rows = _rows_to_list(cur.fetchall())
    for r in rows:
        r["is_mine"] = bool(uid) and r.get("user_id") == uid
    return jsonify(rows)


@bp.route("/api/news/<int:pid>/comments", methods=["POST"])
def api_news_comment(pid):
    uid, err = require_auth()
    if err:
        return err
    if rate_limited(limit=20, bucket="news_comment"):
        return jsonify({"error": "Слишком часто. Подождите минуту."}), 429
    text = sanitize_string((request.json or {}).get("text") or "", 2000)
    if not text:
        return jsonify({"error": "Напишите комментарий"}), 400
    with get_db() as cur:
        found, bad = _readable_post(cur, pid, uid)
        if bad:
            return bad
        _post, role, u = found
        if not u:
            return jsonify({"error": "Требуется вход в аккаунт"}), 401
        # Partners are named in full in their own feed; buyers as «Иван П.»
        name = (u.get("full_name") or "") if role in ("leader", "supplier") else public_name(u.get("full_name") or "")
        cur.execute(
            """INSERT INTO ref_news_comments (post_id, user_id, author_name, author_role, text)
               VALUES (%s, %s, %s, %s, %s) RETURNING id, post_id, user_id, author_name, author_role, text, created_at""",
            (pid, uid, sanitize_string(name, 255), role or "buyer", text),
        )
        row = _row_to_dict(cur.fetchone())
        cur.execute("SELECT avatar_url FROM coop_users WHERE id = %s", (uid,))
        row["avatar_url"] = (cur.fetchone() or {}).get("avatar_url") or ""
    row["is_mine"] = True
    return jsonify(row)


@bp.route("/api/news/comments/<int:cid>", methods=["DELETE"])
def api_news_comment_delete(cid):
    uid, err = require_auth()
    if err:
        return err
    with get_db() as cur:
        cur.execute("DELETE FROM ref_news_comments WHERE id = %s AND user_id = %s RETURNING id", (cid, uid))
        if not cur.fetchone():
            return jsonify({"error": "Можно удалить только свой комментарий"}), 403
    return jsonify({"ok": True})


# ── admin ───────────────────────────────────────
@bp.route("/api/admin/news")
def api_admin_news():
    feed = request.args.get("feed")
    limit, offset = _paging()
    with get_db() as cur:
        if feed in FEEDS:
            items = _posts(cur, "p.feed = %s", [feed], None, limit + 1, offset)
        else:
            items = _posts(cur, "TRUE", [], None, limit + 1, offset)
    return jsonify({"items": items[:limit], "has_more": len(items) > limit})


@bp.route("/api/admin/news", methods=["POST"])
def api_admin_news_create():
    d = request.json or {}
    feed = d.get("feed") if d.get("feed") in FEEDS else "buyers"
    title = sanitize_string(d.get("title") or "", 300)
    if not title:
        return jsonify({"error": "Добавьте заголовок"}), 400
    with get_db() as cur:
        cur.execute(
            """INSERT INTO ref_news_posts (feed, title, body, tags, media, author_role, author_name, is_pinned)
               VALUES (%s, %s, %s, %s, %s, 'admin', %s, %s) RETURNING *""",
            (feed, title, sanitize_string(d.get("body") or "", 10000), clean_tags(d.get("tags")),
             clean_media(d.get("media")), sanitize_string(d.get("author_name") or "RefSale", 255) or "RefSale",
             bool(d.get("is_pinned"))),
        )
        post = _decode(_row_to_dict(cur.fetchone()))
    return jsonify(post)


@bp.route("/api/admin/news/<int:pid>", methods=["PATCH"])
def api_admin_news_update(pid):
    d = request.json or {}
    sets, params = [], []
    if "feed" in d and d["feed"] in FEEDS:
        sets.append("feed = %s"); params.append(d["feed"])
    if "title" in d:
        title = sanitize_string(d.get("title") or "", 300)
        if not title:
            return jsonify({"error": "Добавьте заголовок"}), 400
        sets.append("title = %s"); params.append(title)
    if "body" in d:
        sets.append("body = %s"); params.append(sanitize_string(d.get("body") or "", 10000))
    if "tags" in d:
        sets.append("tags = %s"); params.append(clean_tags(d.get("tags")))
    if "media" in d:
        sets.append("media = %s"); params.append(clean_media(d.get("media")))
    if "is_pinned" in d:
        sets.append("is_pinned = %s"); params.append(bool(d.get("is_pinned")))
    if not sets:
        return jsonify({"error": "Нечего менять"}), 400
    with get_db() as cur:
        cur.execute(f"UPDATE ref_news_posts SET {', '.join(sets)}, updated_at = NOW() WHERE id = %s RETURNING *", params + [pid])
        row = cur.fetchone()
    if not row:
        return jsonify({"error": "Публикация не найдена"}), 404
    return jsonify(_decode(_row_to_dict(row)))


@bp.route("/api/admin/news/<int:pid>", methods=["DELETE"])
def api_admin_news_delete(pid):
    with get_db() as cur:
        cur.execute("DELETE FROM ref_news_posts WHERE id = %s", (pid,))
    return jsonify({"ok": True})


@bp.route("/api/admin/news/<int:pid>/comments")
def api_admin_news_comments(pid):
    with get_db() as cur:
        cur.execute(
            """SELECT c.*, u.email FROM ref_news_comments c LEFT JOIN coop_users u ON u.id = c.user_id
               WHERE c.post_id = %s ORDER BY c.id ASC""",
            (pid,),
        )
        return jsonify(_rows_to_list(cur.fetchall()))


@bp.route("/api/admin/news/comments/<int:cid>", methods=["DELETE"])
def api_admin_news_comment_delete(cid):
    with get_db() as cur:
        cur.execute("DELETE FROM ref_news_comments WHERE id = %s", (cid,))
    return jsonify({"ok": True})
