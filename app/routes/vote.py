"""Vote for new products (/vote).

The admin uploads a supplier's price list; it turns into a list by category
that members scroll and mark what is worth bringing in. Members see only our
price: the supplier's price plus the category's markup (or the default one),
rounded to whole roubles — or a price the admin typed in by hand.
"""
import csv
import io

from flask import Blueprint, Response, jsonify, request

from ..auth import auth_user_id, require_auth
from ..db import get_db, _row_to_dict, _rows_to_list
from ..pricelist import parse_rows, read_table_file
from ..utils import rate_limited, sanitize_string

bp = Blueprint("vote", __name__)

_DEFAULTS = {
    "vote_enabled": "true",
    "vote_markup_default": "15",
    "vote_price_basis": "cash",
    "vote_title": "Голосование за новые товары",
    "vote_intro": "Отметьте, что стоит привезти. Позиции, за которые проголосует больше людей, появятся в каталоге.",
}
MAX_FILE = 15 * 1024 * 1024


def _settings(cur) -> dict:
    cur.execute("SELECT key, value FROM coop_settings WHERE key = ANY(%s)", (list(_DEFAULTS),))
    out = dict(_DEFAULTS)
    for r in cur.fetchall():
        if r["value"] is not None:
            out[r["key"]] = r["value"]
    return out


def _num(value):
    try:
        return float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def our_price(item: dict, category_markup, settings: dict):
    """The price members see, or None while it is not known."""
    override = _num(item.get("price_override"))
    if override is not None:
        return round(override, 2)
    cash, cashless = _num(item.get("price_cash")), _num(item.get("price_cashless"))
    base = (cash if cash is not None else cashless) if settings.get("vote_price_basis") != "cashless" \
        else (cashless if cashless is not None else cash)
    if base is None:
        return None
    markup = _num(category_markup)
    if markup is None:
        markup = _num(settings.get("vote_markup_default")) or 0
    return float(round(base * (1 + markup / 100)))


def _load(cur, uid=None, include_hidden=False):
    settings = _settings(cur)
    cur.execute("SELECT * FROM ref_vote_categories ORDER BY sort_order, id")
    cats = _rows_to_list(cur.fetchall())
    cur.execute(
        f"""SELECT i.*, (SELECT COUNT(*) FROM ref_vote_votes v WHERE v.item_id = i.id) AS votes,
                   EXISTS (SELECT 1 FROM ref_vote_votes v WHERE v.item_id = i.id AND v.user_id = %s) AS voted
            FROM ref_vote_items i {'' if include_hidden else 'WHERE i.is_active'}
            ORDER BY i.sort_order, i.id""",
        (uid or 0,),
    )
    items = _rows_to_list(cur.fetchall())
    by_cat: dict = {}
    markups = {c["id"]: c.get("markup_percent") for c in cats}
    for it in items:
        it["price"] = our_price(it, markups.get(it["category_id"]), settings)
        by_cat.setdefault(it["category_id"], []).append(it)
    for c in cats:
        c["items"] = by_cat.get(c["id"], [])
    return settings, cats


# ── members ─────────────────────────────────────
@bp.route("/api/vote")
def api_vote():
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    uid = auth_user_id()
    with get_db() as cur:
        settings, cats = _load(cur, uid)
    public = []
    for c in cats:
        if not c["items"]:
            continue
        public.append({"id": c["id"], "name": c["name"], "items": [{
            k: it.get(k) for k in ("id", "name", "brand", "box_weight", "packing", "price", "price_note", "votes", "voted")
        } for it in c["items"]]})
    return jsonify({
        "enabled": settings["vote_enabled"] == "true",
        "title": settings["vote_title"], "intro": settings["vote_intro"],
        "categories": public if settings["vote_enabled"] == "true" else [],
        "my_votes": sum(1 for c in public for it in c["items"] if it["voted"]),
    })


@bp.route("/api/vote/items/<int:item_id>", methods=["POST"])
def api_vote_toggle(item_id):
    uid, err = require_auth()
    if err:
        return err
    if rate_limited(limit=120, bucket="vote"):
        return jsonify({"error": "Слишком часто. Подождите минуту."}), 429
    with get_db() as cur:
        if _settings(cur)["vote_enabled"] != "true":
            return jsonify({"error": "Голосование сейчас закрыто"}), 403
        cur.execute("SELECT id FROM ref_vote_items WHERE id = %s AND is_active", (item_id,))
        if not cur.fetchone():
            return jsonify({"error": "Позиция не найдена"}), 404
        cur.execute("DELETE FROM ref_vote_votes WHERE item_id = %s AND user_id = %s RETURNING item_id", (item_id, uid))
        voted = cur.fetchone() is None
        if voted:
            cur.execute("INSERT INTO ref_vote_votes (item_id, user_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (item_id, uid))
        cur.execute("SELECT COUNT(*) AS n FROM ref_vote_votes WHERE item_id = %s", (item_id,))
        n = cur.fetchone()["n"]
    return jsonify({"voted": voted, "votes": n})


# ── admin ───────────────────────────────────────
@bp.route("/api/admin/vote")
def api_admin_vote():
    with get_db() as cur:
        settings, cats = _load(cur, include_hidden=True)
        cur.execute("SELECT COUNT(DISTINCT user_id) AS n FROM ref_vote_votes")
        voters = cur.fetchone()["n"]
    return jsonify({"settings": settings, "categories": cats, "voters": voters})


@bp.route("/api/admin/vote/settings", methods=["PATCH"])
def api_admin_vote_settings():
    d = request.json or {}
    updates = {}
    if "enabled" in d:
        updates["vote_enabled"] = "true" if d.get("enabled") else "false"
    if "markup_default" in d:
        m = _num(d.get("markup_default"))
        if m is None or m < -100 or m > 1000:
            return jsonify({"error": "Наценка — число от −100 до 1000 %"}), 400
        updates["vote_markup_default"] = str(m)
    if "price_basis" in d:
        updates["vote_price_basis"] = "cashless" if d.get("price_basis") == "cashless" else "cash"
    if "title" in d:
        updates["vote_title"] = sanitize_string(d.get("title") or "", 200) or _DEFAULTS["vote_title"]
    if "intro" in d:
        updates["vote_intro"] = sanitize_string(d.get("intro") or "", 1000)
    with get_db() as cur:
        for k, v in updates.items():
            cur.execute("""INSERT INTO coop_settings (key, value) VALUES (%s, %s)
                           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value""", (k, v))
        settings = _settings(cur)
    return jsonify(settings)


@bp.route("/api/admin/vote/import", methods=["POST"])
def api_admin_vote_import():
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify({"error": "Выберите файл"}), 400
    data = f.read(MAX_FILE + 1)
    if len(data) > MAX_FILE:
        return jsonify({"error": "Файл больше 15 МБ"}), 400
    hide_missing = request.form.get("hide_missing") in ("1", "true")
    try:
        categories, items, skipped = parse_rows(read_table_file(f.filename, data))
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        print(f"[vote import] {e}")
        return jsonify({"error": "Не удалось прочитать файл. Проверьте, что это таблица Excel, Word или CSV."}), 400
    if not items:
        return jsonify({"error": "В файле не нашлось товаров. Нужна таблица с колонкой «Наименование»."}), 400
    added = updated = 0
    with get_db() as cur:
        cur.execute("SELECT COALESCE(MAX(sort_order), 0) AS m FROM ref_vote_categories")
        next_cat = cur.fetchone()["m"]
        cat_ids = {}
        for name in categories:
            clean = sanitize_string(name, 255)
            cur.execute("SELECT id FROM ref_vote_categories WHERE name = %s", (clean,))
            row = cur.fetchone()
            if not row:
                next_cat += 1
                cur.execute("INSERT INTO ref_vote_categories (name, sort_order) VALUES (%s, %s) RETURNING id", (clean, next_cat))
                row = cur.fetchone()
            cat_ids[name] = row["id"]
        seen = set()
        for order, it in enumerate(items, start=1):
            cid = cat_ids[it["category"]]
            vals = {k: sanitize_string(it[k], 500) for k in ("name", "brand", "box_weight", "packing", "price_note")}
            cur.execute(
                """SELECT id FROM ref_vote_items
                   WHERE category_id = %s AND LOWER(name) = LOWER(%s) AND LOWER(brand) = LOWER(%s) AND LOWER(packing) = LOWER(%s)
                   LIMIT 1""",
                (cid, vals["name"], vals["brand"], vals["packing"]),
            )
            row = cur.fetchone()
            if row:
                cur.execute(
                    """UPDATE ref_vote_items SET box_weight = %s, price_cashless = %s, price_cash = %s,
                              price_note = %s, sort_order = %s, is_active = TRUE WHERE id = %s""",
                    (vals["box_weight"], it["price_cashless"], it["price_cash"], vals["price_note"], order, row["id"]),
                )
                seen.add(row["id"])
                updated += 1
            else:
                cur.execute(
                    """INSERT INTO ref_vote_items (category_id, name, brand, box_weight, packing,
                           price_cashless, price_cash, price_note, sort_order)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
                    (cid, vals["name"], vals["brand"], vals["box_weight"], vals["packing"],
                     it["price_cashless"], it["price_cash"], vals["price_note"], order),
                )
                seen.add(cur.fetchone()["id"])
                added += 1
        hidden = 0
        if hide_missing and seen:
            cur.execute("UPDATE ref_vote_items SET is_active = FALSE WHERE is_active AND NOT (id = ANY(%s)) RETURNING id", (list(seen),))
            hidden = len(cur.fetchall())
    return jsonify({"categories": len(categories), "items": len(items), "added": added,
                    "updated": updated, "hidden": hidden, "skipped": skipped})


@bp.route("/api/admin/vote/categories/<int:cid>", methods=["PATCH"])
def api_admin_vote_category(cid):
    d = request.json or {}
    sets, params = [], []
    if "markup_percent" in d:
        m = _num(d.get("markup_percent"))
        if m is not None and (m < -100 or m > 1000):
            return jsonify({"error": "Наценка — число от −100 до 1000 %"}), 400
        sets.append("markup_percent = %s"); params.append(m)
    if "name" in d:
        name = sanitize_string(d.get("name") or "", 255)
        if not name:
            return jsonify({"error": "Название не может быть пустым"}), 400
        sets.append("name = %s"); params.append(name)
    if "sort_order" in d:
        sets.append("sort_order = %s"); params.append(int(_num(d.get("sort_order")) or 0))
    if not sets:
        return jsonify({"error": "Нечего менять"}), 400
    with get_db() as cur:
        cur.execute(f"UPDATE ref_vote_categories SET {', '.join(sets)} WHERE id = %s RETURNING *", params + [cid])
        row = cur.fetchone()
    return jsonify(_row_to_dict(row)) if row else (jsonify({"error": "Категория не найдена"}), 404)


@bp.route("/api/admin/vote/categories/<int:cid>", methods=["DELETE"])
def api_admin_vote_category_delete(cid):
    with get_db() as cur:
        cur.execute("DELETE FROM ref_vote_categories WHERE id = %s", (cid,))
    return jsonify({"ok": True})


@bp.route("/api/admin/vote/items/<int:item_id>", methods=["PATCH"])
def api_admin_vote_item(item_id):
    d = request.json or {}
    sets, params = [], []
    if "price_override" in d:
        p = _num(d.get("price_override"))
        if p is not None and (p < 0 or p > 100_000_000):
            return jsonify({"error": "Некорректная цена"}), 400
        sets.append("price_override = %s"); params.append(p)
    if "is_active" in d:
        sets.append("is_active = %s"); params.append(bool(d.get("is_active")))
    for key, size in (("name", 500), ("brand", 255), ("box_weight", 100), ("packing", 100), ("price_note", 100)):
        if key in d:
            value = sanitize_string(d.get(key) or "", size)
            if key == "name" and not value:
                return jsonify({"error": "Название не может быть пустым"}), 400
            sets.append(f"{key} = %s"); params.append(value)
    for key in ("price_cash", "price_cashless"):
        if key in d:
            sets.append(f"{key} = %s"); params.append(_num(d.get(key)))
    if not sets:
        return jsonify({"error": "Нечего менять"}), 400
    with get_db() as cur:
        cur.execute(f"UPDATE ref_vote_items SET {', '.join(sets)} WHERE id = %s RETURNING *", params + [item_id])
        row = cur.fetchone()
    return jsonify(_row_to_dict(row)) if row else (jsonify({"error": "Позиция не найдена"}), 404)


@bp.route("/api/admin/vote/items/<int:item_id>", methods=["DELETE"])
def api_admin_vote_item_delete(item_id):
    with get_db() as cur:
        cur.execute("DELETE FROM ref_vote_items WHERE id = %s", (item_id,))
    return jsonify({"ok": True})


@bp.route("/api/admin/vote/reset", methods=["POST"])
def api_admin_vote_reset():
    with get_db() as cur:
        cur.execute("DELETE FROM ref_vote_votes")
    return jsonify({"ok": True})


@bp.route("/api/admin/vote/clear", methods=["POST"])
def api_admin_vote_clear():
    with get_db() as cur:
        cur.execute("DELETE FROM ref_vote_categories")
        cur.execute("DELETE FROM ref_vote_items")
    return jsonify({"ok": True})


@bp.route("/api/admin/vote/results.csv")
def api_admin_vote_results():
    with get_db() as cur:
        _settings_, cats = _load(cur, include_hidden=True)
    out = io.StringIO()
    w = csv.writer(out, delimiter=";")
    w.writerow(["Категория", "Наименование", "Бренд", "Вес коробки", "Фасовка",
                "Цена безнал", "Цена нал", "Наша цена", "Голосов", "Показывается"])
    rows = [(c, it) for c in cats for it in c["items"]]
    rows.sort(key=lambda x: -int(x[1].get("votes") or 0))
    for c, it in rows:
        w.writerow([c["name"], it["name"], it["brand"], it["box_weight"], it["packing"],
                    it.get("price_cashless") or "", it.get("price_cash") or "", it.get("price") or "",
                    it.get("votes") or 0, "да" if it.get("is_active") else "нет"])
    data = "﻿" + out.getvalue()
    return Response(data, mimetype="text/csv; charset=utf-8",
                    headers={"Content-Disposition": "attachment; filename=vote_results.csv"})
