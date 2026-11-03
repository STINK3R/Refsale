"""The supplier's cabinet (/supplier): their own products and the orders
that hold them, with the order chat.

A product a supplier adds or edits waits for the admin (moderation =
'pending') and only then shows in the catalog; the admin also sets the price
for promo-code holders. Hiding a product or putting it back is the supplier's
own call and needs no review. A supplier sees, in an order, only their own
lines and the buyer's first name with the initial of the surname — like a
leader — and writes in the order chat as «Поставщик».
"""
import json

from flask import Blueprint, jsonify, request

from ..auth import require_auth
from ..db import _row_to_dict, _rows_to_list, get_db
from ..notify import notify_user, snippet
from ..utils import rate_limited, sanitize_image_urls, sanitize_string

bp = Blueprint('supplier', __name__)

MAX_PRICE = 100_000_000
# Fields that change what buyers see: a change goes back to the admin
_CONTENT = ("name", "description", "price", "compare_price_1", "compare_price_2", "category_id", "subcategory_id", "images")


def _require_supplier():
    uid, err = require_auth()
    if err:
        return None, err
    with get_db() as cur:
        cur.execute("SELECT id, full_name, is_supplier, is_blocked FROM coop_users WHERE id = %s", (uid,))
        row = cur.fetchone()
    if not row or not row.get("is_supplier") or row.get("is_blocked"):
        return None, (jsonify({"error": "Кабинет доступен поставщикам — его подключает площадка"}), 403)
    return dict(row), None


def _masked(full_name: str) -> str:
    parts = (full_name or "").split()
    if not parts:
        return "Покупатель"
    return parts[0] if len(parts) == 1 else f"{parts[0]} {parts[1][0]}."


def _num(v):
    if v in (None, ""):
        return None
    try:
        n = round(float(v), 2)
    except (TypeError, ValueError):
        return None
    return n if 0 < n < MAX_PRICE else None


def _clean(d: dict) -> tuple[dict, str | None]:
    """The supplier's form, checked: (fields, error)."""
    out = {}
    if "name" in d:
        out["name"] = sanitize_string(d.get("name") or "", 255).strip()
        if not out["name"]:
            return {}, "Укажите название"
    if "description" in d:
        out["description"] = sanitize_string(d.get("description") or "", 4000)
    if "price" in d:
        out["price"] = _num(d.get("price"))
        if out["price"] is None:
            return {}, "Укажите цену"
    for k in ("compare_price_1", "compare_price_2"):
        if k in d:
            out[k] = _num(d.get(k))
    for k in ("category_id", "subcategory_id"):
        if k in d:
            try:
                out[k] = int(d[k]) if d.get(k) else None
            except (TypeError, ValueError):
                out[k] = None
    if "is_available" in d:
        out["is_available"] = bool(d.get("is_available"))
    if "images" in d:
        out["images"] = json.loads(sanitize_image_urls(d.get("images"), max_items=8))
    return out, None


def _differs(old, new) -> bool:
    """A stored value against the form's (prices come back as Decimal)."""
    if old is None or new is None:
        return (old is None) != (new is None) and (old or new) not in ("", None)
    if isinstance(new, (int, float)) and not isinstance(new, bool):
        try:
            return round(float(old), 2) != round(float(new), 2)
        except (TypeError, ValueError):
            return True
    return str(old) != str(new)


def _own_product(cur, sid: int, pid: int):
    cur.execute("SELECT * FROM coop_products WHERE id = %s AND seller_id = %s", (pid, sid))
    return cur.fetchone()


def _set_images(cur, pid: int, urls: list):
    cur.execute("DELETE FROM coop_product_images WHERE product_id = %s", (pid,))
    for i, url in enumerate(urls):
        cur.execute(
            "INSERT INTO coop_product_images (product_id, url, is_main, sort_order) VALUES (%s, %s, %s, %s)",
            (pid, url, i == 0, i),
        )
    cur.execute("UPDATE coop_products SET image_url = %s WHERE id = %s", (urls[0] if urls else None, pid))


def _with_images(cur, rows: list) -> list:
    ids = [r["id"] for r in rows]
    if not ids:
        return rows
    cur.execute("SELECT product_id, url FROM coop_product_images WHERE product_id = ANY(%s) ORDER BY sort_order, id", (ids,))
    by = {}
    for r in cur.fetchall():
        by.setdefault(r["product_id"], []).append(r["url"])
    for r in rows:
        r["images"] = by.get(r["id"], [r["image_url"]] if r.get("image_url") else [])
    return rows


# Orders that hold at least one of this supplier's products
_ORDERS_OF = """
    SELECT o.* FROM coop_orders o
    WHERE EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(o.items::jsonb, '[]'::jsonb)) it
        JOIN coop_products p ON p.id = (it->>'id')::int
        WHERE p.seller_id = %s
    )
"""


def _items(items) -> list:
    if isinstance(items, str):
        try:
            items = json.loads(items)
        except Exception:
            items = []
    return items or []


def _own_lines(cur, sid: int, items) -> list:
    """This supplier's lines of an order."""
    items = _items(items)
    ids = list({int(i.get("id")) for i in items if str(i.get("id", "")).isdigit()})
    if not ids:
        return []
    cur.execute("SELECT id FROM coop_products WHERE id = ANY(%s) AND seller_id = %s", (ids, sid))
    mine = {r["id"] for r in cur.fetchall()}
    return [i for i in items if int(i.get("id") or 0) in mine]


def suppliers_of_order(cur, items) -> list:
    """The suppliers whose products an order holds (for notifications)."""
    items = _items(items)
    ids = list({int(i.get("id")) for i in items if str(i.get("id", "")).isdigit()})
    if not ids:
        return []
    cur.execute("SELECT DISTINCT seller_id FROM coop_products WHERE id = ANY(%s) AND seller_id IS NOT NULL", (ids,))
    return [r["seller_id"] for r in cur.fetchall()]


def _lines_total(lines: list) -> float:
    return round(sum(float(l.get("price") or 0) * int(l.get("qty") or 0) for l in lines), 2)


@bp.route("/api/supplier/overview")
def supplier_overview():
    sup, err = _require_supplier()
    if err:
        return err
    sid = sup["id"]
    with get_db() as cur:
        cur.execute("""
            SELECT COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE COALESCE(moderation, 'approved') = 'approved' AND COALESCE(is_available, TRUE)) AS on_sale,
                   COUNT(*) FILTER (WHERE moderation = 'pending') AS pending,
                   COUNT(*) FILTER (WHERE moderation = 'rejected') AS rejected
            FROM coop_products WHERE seller_id = %s
        """, (sid,))
        products = _row_to_dict(cur.fetchone())
        cur.execute(_ORDERS_OF, (sid,))
        orders = _rows_to_list(cur.fetchall())
        revenue = 0.0
        active = done = 0
        for o in orders:
            if o["status"] == "done":
                done += 1
                revenue += _lines_total(_own_lines(cur, sid, o["items"]))
            elif o["status"] != "cancelled":
                active += 1
    return jsonify({
        "supplier": {"name": sup["full_name"]},
        "products": products,
        "orders": {"total": len(orders), "active": active, "done": done, "revenue_done": round(revenue, 2)},
    })


@bp.route("/api/supplier/products")
def supplier_products():
    sup, err = _require_supplier()
    if err:
        return err
    with get_db() as cur:
        cur.execute("""
            SELECT p.id, p.name, p.description, p.price, p.promo_price, p.compare_price_1, p.compare_price_2,
                   p.category_id, p.subcategory_id, p.image_url, p.is_available, p.created_at,
                   COALESCE(p.moderation, 'approved') AS moderation, COALESCE(p.moderation_note, '') AS moderation_note,
                   c.name AS category_name
            FROM coop_products p LEFT JOIN coop_categories c ON c.id = p.category_id
            WHERE p.seller_id = %s ORDER BY p.created_at DESC
        """, (sup["id"],))
        rows = _with_images(cur, _rows_to_list(cur.fetchall()))
    return jsonify(rows)


@bp.route("/api/supplier/products", methods=["POST"])
def supplier_add_product():
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    sup, err = _require_supplier()
    if err:
        return err
    d, error = _clean(request.json or {})
    if error:
        return jsonify({"error": error}), 400
    if not d.get("name") or d.get("price") is None or not d.get("category_id"):
        return jsonify({"error": "Нужны название, категория и цена"}), 400
    images = d.pop("images", [])
    with get_db() as cur:
        cur.execute(
            """INSERT INTO coop_products (name, description, price, compare_price_1, compare_price_2, category_id,
                                          subcategory_id, is_available, seller_id, moderation, moderation_note, submitted_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'pending', '', NOW()) RETURNING id""",
            (d["name"], d.get("description", ""), d["price"], d.get("compare_price_1"), d.get("compare_price_2"),
             d["category_id"], d.get("subcategory_id"), d.get("is_available", True), sup["id"]),
        )
        pid = cur.fetchone()["id"]
        _set_images(cur, pid, images)
    return jsonify({"id": pid, "moderation": "pending"}), 201


@bp.route("/api/supplier/products/<int:pid>", methods=["PATCH"])
def supplier_edit_product(pid):
    sup, err = _require_supplier()
    if err:
        return err
    d, error = _clean(request.json or {})
    if error:
        return jsonify({"error": error}), 400
    with get_db() as cur:
        row = _own_product(cur, sup["id"], pid)
        if not row:
            return jsonify({"error": "Товар не найден"}), 404
        images = d.pop("images", None)
        # The form sends every field: only a real change goes back to review,
        # and a product returned for rework goes back when it is saved again
        changed = any(k in _CONTENT and _differs(row.get(k), v) for k, v in d.items())
        if images is not None:
            cur.execute("SELECT url FROM coop_product_images WHERE product_id = %s ORDER BY sort_order, id", (pid,))
            changed = changed or [r["url"] for r in cur.fetchall()] != images
        resubmit = row.get("moderation") == "rejected" and (any(k in _CONTENT for k in d) or images is not None)
        sets = [f"{k} = %s" for k in d]
        args = list(d.values())
        if changed or resubmit:
            # What buyers see changed: back to the admin, off the shelf meanwhile
            sets += ["moderation = 'pending'", "moderation_note = ''", "submitted_at = NOW()"]
        if sets:
            cur.execute(f"UPDATE coop_products SET {', '.join(sets)} WHERE id = %s", (*args, pid))
        if images is not None:
            _set_images(cur, pid, images)
        cur.execute("SELECT COALESCE(moderation, 'approved') AS moderation FROM coop_products WHERE id = %s", (pid,))
        state = cur.fetchone()["moderation"]
    return jsonify({"id": pid, "moderation": state})


@bp.route("/api/supplier/products/<int:pid>", methods=["DELETE"])
def supplier_delete_product(pid):
    sup, err = _require_supplier()
    if err:
        return err
    with get_db() as cur:
        if not _own_product(cur, sup["id"], pid):
            return jsonify({"error": "Товар не найден"}), 404
        cur.execute("SELECT 1 FROM coop_orders WHERE items::jsonb @> %s::jsonb LIMIT 1", (json.dumps([{"id": pid}]),))
        if cur.fetchone():
            return jsonify({"error": "Товар уже заказывали — его можно скрыть, но не удалить"}), 409
        cur.execute("DELETE FROM coop_product_images WHERE product_id = %s", (pid,))
        cur.execute("DELETE FROM coop_products WHERE id = %s", (pid,))
    return jsonify({"ok": True})


@bp.route("/api/supplier/orders")
def supplier_orders():
    sup, err = _require_supplier()
    if err:
        return err
    with get_db() as cur:
        cur.execute(_ORDERS_OF + " ORDER BY o.created_at DESC", (sup["id"],))
        orders = _rows_to_list(cur.fetchall())
        out = []
        for o in orders:
            lines = _own_lines(cur, sup["id"], o["items"])
            cur.execute("SELECT text, created_at FROM coop_order_messages WHERE order_id = %s ORDER BY id DESC LIMIT 1", (o["id"],))
            last = _row_to_dict(cur.fetchone()) or {}
            out.append({
                "id": o["id"], "status": o["status"], "created_at": o["created_at"],
                "buyer": _masked(o.get("full_name") or ""),
                "items": lines, "total": _lines_total(lines),
                "last_text": last.get("text"), "last_at": last.get("created_at"),
            })
    return jsonify(out)


def _supplier_order(cur, sid: int, oid: int):
    cur.execute(_ORDERS_OF + " AND o.id = %s", (sid, oid))
    return cur.fetchone()


@bp.route("/api/supplier/orders/<int:oid>/messages")
def supplier_order_messages(oid):
    sup, err = _require_supplier()
    if err:
        return err
    from .store import _mask_buyers, order_status_history
    with get_db() as cur:
        order = _supplier_order(cur, sup["id"], oid)
        if not order:
            return jsonify({"error": "Заказ не найден"}), 404
        cur.execute("SELECT * FROM coop_order_messages WHERE order_id = %s ORDER BY created_at ASC", (oid,))
        msgs = _mask_buyers(_rows_to_list(cur.fetchall()))
        history = order_status_history(cur, oid)
        lines = _own_lines(cur, sup["id"], order["items"])
    return jsonify({"messages": msgs, "status": order["status"], "history": history, "items": lines, "can_write": True})


@bp.route("/api/supplier/orders/<int:oid>/messages", methods=["POST"])
def supplier_post_message(oid):
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    sup, err = _require_supplier()
    if err:
        return err
    d = request.json or {}
    text = sanitize_string(d.get("text") or "", 2000)
    images = sanitize_image_urls(d.get("images"))
    if not text.strip() and images == "[]":
        return jsonify({"error": "Напишите сообщение"}), 400
    with get_db() as cur:
        order = _supplier_order(cur, sup["id"], oid)
        if not order:
            return jsonify({"error": "Заказ не найден"}), 404
        if order["status"] in ("done", "cancelled"):
            return jsonify({"error": "Заказ завершён — чат закрыт"}), 409
        cur.execute(
            "INSERT INTO coop_order_messages (order_id, sender_type, sender_name, text, images) "
            "VALUES (%s, 'supplier', %s, %s, %s) RETURNING *",
            (oid, sup["full_name"], text, images),
        )
        msg = _row_to_dict(cur.fetchone())
    notify_user(
        order.get("user_id"), key=f"order:{oid}",
        title=f"Поставщик ответил по заказу №{oid}", body=snippet(text, images),
        url=f"/orders?order={oid}", email_subject=f"Новое сообщение по заказу №{oid}",
    )
    return jsonify(msg), 201


# ── The admin's side: the queue of products waiting for review ──
@bp.route("/api/admin/store/supplier-products")
def admin_supplier_products():
    status = request.args.get("status", "pending")
    where = "p.seller_id IS NOT NULL" + (" AND p.moderation = %s" if status != "all" else "")
    with get_db() as cur:
        cur.execute(f"""
            SELECT p.id, p.name, p.description, p.price, p.promo_price, p.compare_price_1, p.compare_price_2,
                   p.image_url, p.is_available, p.submitted_at, p.created_at,
                   COALESCE(p.moderation, 'approved') AS moderation, COALESCE(p.moderation_note, '') AS moderation_note,
                   c.name AS category_name, u.full_name AS supplier_name, u.email AS supplier_email
            FROM coop_products p
            LEFT JOIN coop_categories c ON c.id = p.category_id
            LEFT JOIN coop_users u ON u.id = p.seller_id
            WHERE {where} ORDER BY p.submitted_at DESC NULLS LAST, p.id DESC
        """, (status,) if status != "all" else ())
        rows = _with_images(cur, _rows_to_list(cur.fetchall()))
    return jsonify(rows)


@bp.route("/api/admin/store/supplier-products/<int:pid>/moderate", methods=["POST"])
def admin_moderate_product(pid):
    d = request.json or {}
    decision = d.get("decision")
    if decision not in ("approve", "reject"):
        return jsonify({"error": "approve или reject"}), 400
    note = sanitize_string(d.get("note") or "", 500)
    with get_db() as cur:
        cur.execute(
            "UPDATE coop_products SET moderation = %s, moderation_note = %s WHERE id = %s AND seller_id IS NOT NULL "
            "RETURNING id, name, seller_id",
            ("approved" if decision == "approve" else "rejected", note, pid),
        )
        row = cur.fetchone()
    if not row:
        return jsonify({"error": "Товар поставщика не найден"}), 404
    ok = decision == "approve"
    notify_user(
        row["seller_id"], key=f"supplier-product:{pid}",
        title=f"«{row['name']}» {'на витрине' if ok else 'не прошёл проверку'}",
        body=("Товар одобрен и уже в каталоге." if ok else f"Товар вернулся на доработку.{(' ' + note) if note else ''}"),
        url="/supplier", email_subject=f"Модерация товара «{row['name']}»",
    )
    return jsonify({"id": pid, "moderation": "approved" if ok else "rejected"})
