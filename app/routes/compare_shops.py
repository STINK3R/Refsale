"""Shops prices are compared with (ref_compare_shops).

The admin keeps the list of names («ВкусВилл», «Золотое Яблоко») and picks
one for each comparison price of a product, with a link to the item on that
shop's site. The storefront makes the shop's name a link.
"""
import re

from flask import Blueprint, jsonify, request

from ..db import get_db, _row_to_dict, _rows_to_list

bp = Blueprint("compare_shops", __name__)


def _clean(d: dict):
    name = str(d.get("name") or "").strip()[:100]
    site = str(d.get("site_url") or "").strip()[:500]
    if site and not re.match(r"^https?://[^\s<>\"']+$", site, re.I):
        return None, None, "Адрес сайта должен начинаться с http:// или https://"
    return name, site, None


@bp.route("/api/compare-shops")
def api_compare_shops():
    with get_db() as cur:
        cur.execute("SELECT id, name, site_url FROM ref_compare_shops ORDER BY sort_order, name")
        return jsonify(_rows_to_list(cur.fetchall()))


@bp.route("/api/admin/compare-shops", methods=["POST"])
def api_add_compare_shop():
    name, site, err = _clean(request.json or {})
    if err:
        return jsonify({"error": err}), 400
    if not name:
        return jsonify({"error": "Укажите название магазина"}), 400
    with get_db() as cur:
        cur.execute("SELECT 1 FROM ref_compare_shops WHERE LOWER(name) = LOWER(%s)", (name,))
        if cur.fetchone():
            return jsonify({"error": "Такой магазин уже есть"}), 409
        cur.execute("INSERT INTO ref_compare_shops (name, site_url) VALUES (%s, %s) RETURNING *", (name, site))
        return jsonify(_row_to_dict(cur.fetchone()))


@bp.route("/api/admin/compare-shops/<int:sid>", methods=["PATCH"])
def api_update_compare_shop(sid):
    d = request.json or {}
    name, site, err = _clean(d)
    if err:
        return jsonify({"error": err}), 400
    with get_db() as cur:
        cur.execute("SELECT * FROM ref_compare_shops WHERE id = %s", (sid,))
        old = cur.fetchone()
        if not old:
            return jsonify({"error": "Магазин не найден"}), 404
        name = name or old["name"]
        cur.execute("UPDATE ref_compare_shops SET name = %s, site_url = %s WHERE id = %s RETURNING *", (name, site, sid))
        row = _row_to_dict(cur.fetchone())
        # A renamed shop stays picked on the products that use it
        if name != old["name"]:
            for col in ("compare_shop_1", "compare_shop_2"):
                cur.execute(f"UPDATE coop_products SET {col} = %s WHERE {col} = %s", (name, old["name"]))
        return jsonify(row)


@bp.route("/api/admin/compare-shops/<int:sid>", methods=["DELETE"])
def api_delete_compare_shop(sid):
    with get_db() as cur:
        cur.execute("DELETE FROM ref_compare_shops WHERE id = %s", (sid,))
    return jsonify({"ok": True})
