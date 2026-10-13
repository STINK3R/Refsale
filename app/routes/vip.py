"""
VIP API routes — public VIP endpoints + admin VIP management.
"""

import json

from flask import Blueprint, request, jsonify

from ..db import get_db, _row_to_dict, _rows_to_list
from ..utils import rate_limited, safe_update, safe_insert
from ..auth import require_auth, claimed_user_id
from ..email_service import (
    email_vip_order_confirmation, email_vip_order_status_change,
    email_admin_new_vip_order, email_seller_new_order,
)

bp = Blueprint('vip', __name__)


# ── Public VIP ─────────────────────────────────
def _ensure_vip_products_requires_variant(cur):
    """Idempotent migration for the separate variant-specification flag."""
    try:
        cur.execute(
            "DO $$ BEGIN ALTER TABLE coop_vip_products ADD COLUMN requires_variant BOOLEAN DEFAULT FALSE; "
            "EXCEPTION WHEN duplicate_column THEN NULL; END $$;"
        )
    except Exception:
        pass


@bp.route("/api/vip/products")
def api_vip_products():
    try:
        with get_db() as cur:
            _ensure_vip_products_requires_variant(cur)
            cur.execute("SELECT * FROM coop_vip_products ORDER BY created_at ASC")
            prods = _rows_to_list(cur.fetchall()) or []
            # Append approved + available products from VIP sellers flagged
            # with is_vip=true. These carry negative IDs so the frontend cart
            # / checkout code recognizes them as seller-originated (same
            # convention as /api/data on the regular catalog).
            try:
                cur.execute("""
                    SELECT sp.*, u.full_name AS seller_name
                    FROM coop_seller_products sp
                    JOIN coop_users u ON u.id = sp.seller_id
                    WHERE sp.is_vip = TRUE
                      AND COALESCE(sp.is_available, TRUE) = TRUE
                      AND COALESCE(sp.approval_status, 'approved') = 'approved'
                      AND COALESCE(u.is_vip_seller, FALSE) = TRUE
                    ORDER BY sp.created_at DESC
                """)
                seller_vip = _rows_to_list(cur.fetchall()) or []
                for sp in seller_vip:
                    sp["original_id"] = sp["id"]
                    sp["id"] = -int(sp["id"])  # negative id = seller product
                    sp["is_seller_product"] = True
                    # The frontend VipCatalog reads image_url directly; no need
                    # to build an `images` array, but keep gallery_urls as-is.
                prods.extend(seller_vip)
            except Exception as e:
                # Schema might be missing on a fresh install — don't let this
                # blank out the admin VIP catalog.
                print(f"[/api/vip/products] seller merge failed: {e}")
        return jsonify(prods)
    except:
        return jsonify([])


def _vip_item_price(cur, item: dict):
    """Authoritative unit price for a VIP cart item, or None if unpriceable."""
    try:
        iid = int(item.get("id") or 0)
    except (TypeError, ValueError):
        return None
    try:
        if iid > 0:
            cur.execute("SELECT price FROM coop_vip_products WHERE id = %s LIMIT 1", (iid,))
        elif iid < 0:
            cur.execute("SELECT price FROM coop_seller_products WHERE id = %s LIMIT 1", (-iid,))
        else:
            return None
        row = cur.fetchone()
        return float(row["price"]) if row else None
    except Exception:
        return None


@bp.route("/api/vip/orders", methods=["POST"])
def api_create_vip_order():
    """Create a VIP-catalog order.

    Like /api/orders, cart items are split:
      • VIP-admin products (positive IDs) → coop_vip_orders (single row).
      • VIP-seller products (negative IDs) → coop_seller_orders (one per seller).

    If the cart contains only seller items, coop_vip_orders is skipped and the
    first seller-order is returned as the primary response with an
    is_seller_order=True marker.
    """
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    d = request.json or {}
    required = ["full_name", "phone", "address", "items", "total"]
    for f in required:
        if not d.get(f):
            return jsonify({"error": f"Поле {f} обязательно"}), 400
    items_raw = d["items"]
    if isinstance(items_raw, str):
        try:
            items_list = json.loads(items_raw)
        except Exception:
            items_list = []
    else:
        items_list = items_raw or []
    if not isinstance(items_list, list) or not items_list:
        return jsonify({"error": "Пустой заказ"}), 400

    def _item_subtotal(it):
        try:
            return float(it.get("price") or 0) * int(it.get("qty") or it.get("quantity") or 1)
        except Exception:
            return 0.0

    order_user_id, auth_err = claimed_user_id(d.get("user_id"))
    if auth_err:
        return auth_err
    d["user_id"] = order_user_id

    try:
        with get_db() as cur:
            # Prices from the database, not from the cart payload.
            for it in items_list:
                if not isinstance(it, dict):
                    continue
                price = _vip_item_price(cur, it)
                if price is None:
                    print(f"[/api/vip/orders] unpriceable item rejected: {it.get('id')} / {it.get('name')}")
                    return jsonify({"error": "Товар больше недоступен — обновите страницу"}), 409
                it["price"] = price

            # ── Classify items ──────────────────────────────────────
            regular_items = []
            seller_groups: dict = {}
            for it in items_list:
                if not isinstance(it, dict):
                    continue
                try:
                    iid = int(it.get("id") or 0)
                except (TypeError, ValueError):
                    iid = 0
                if iid < 0:
                    orig_id = -iid
                    sp_row = None
                    try:
                        cur.execute(
                            "SELECT seller_id FROM coop_seller_products WHERE id = %s LIMIT 1",
                            (orig_id,)
                        )
                        sp_row = cur.fetchone()
                    except Exception:
                        sp_row = None
                    if sp_row and sp_row.get("seller_id"):
                        sid = int(sp_row["seller_id"])
                        seller_groups.setdefault(sid, []).append(it)
                        continue
                    continue
                regular_items.append(it)

            has_regular = len(regular_items) > 0
            has_sellers = len(seller_groups) > 0
            if not has_regular and not has_sellers:
                return jsonify({"error": "Пустой заказ"}), 400

            # ── Main VIP order ──────────────────────────────────────
            created = None
            if has_regular:
                regular_total = sum(_item_subtotal(it) for it in regular_items)
                cur.execute(
                    """INSERT INTO coop_vip_orders (full_name, phone, address, comment, items, total, status, user_id)
                       VALUES (%s, %s, %s, %s, %s, %s, 'new', %s) RETURNING *""",
                    (d["full_name"], d["phone"], d["address"], d.get("comment", ""),
                     json.dumps(regular_items, ensure_ascii=False), float(regular_total),
                     d.get("user_id"))
                )
                created = _row_to_dict(cur.fetchone())

            # ── Seller orders (per seller) ──────────────────────────
            seller_order_rows = []
            if has_sellers:
                try:
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS coop_seller_orders (
                            id SERIAL PRIMARY KEY,
                            seller_id INTEGER NOT NULL REFERENCES coop_users(id) ON DELETE CASCADE,
                            user_id INTEGER DEFAULT NULL,
                            full_name VARCHAR(255) NOT NULL,
                            phone VARCHAR(50) NOT NULL,
                            address TEXT DEFAULT '',
                            comment TEXT DEFAULT '',
                            items TEXT NOT NULL DEFAULT '[]',
                            total NUMERIC(12,2) DEFAULT 0,
                            status VARCHAR(30) DEFAULT 'new',
                            created_at TIMESTAMPTZ DEFAULT NOW()
                        )
                    """)
                except Exception:
                    pass
                for sid, sitems in seller_groups.items():
                    s_total = sum(_item_subtotal(si) for si in sitems)
                    try:
                        cur.execute(
                            """INSERT INTO coop_seller_orders
                               (seller_id, user_id, full_name, phone, address, comment, items, total, status)
                               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'new') RETURNING *""",
                            (sid, d.get("user_id"), d["full_name"], d["phone"], d["address"],
                             d.get("comment", ""), json.dumps(sitems, ensure_ascii=False), s_total)
                        )
                        row = _row_to_dict(cur.fetchone())
                        if row and row.get("id"):
                            seller_order_rows.append((sid, row, sitems, s_total))
                    except Exception:
                        pass

            # ── Emails ──────────────────────────────────────────────
            user_id = d.get("user_id")
            if created and user_id:
                try:
                    cur.execute("SELECT email FROM coop_users WHERE id = %s", (user_id,))
                    u = cur.fetchone()
                    if u and u.get("email"):
                        email_vip_order_confirmation(
                            d["full_name"], u["email"], created["id"],
                            float(created.get("total", 0)), regular_items
                        )
                except Exception:
                    pass
            if created:
                try:
                    email_admin_new_vip_order(
                        created["id"], d["full_name"], d["phone"],
                        float(created.get("total", 0)), created.get("items", "[]")
                    )
                except Exception:
                    pass
            for sid, so_row, sitems, s_total in seller_order_rows:
                try:
                    cur.execute("SELECT email, full_name FROM coop_users WHERE id = %s LIMIT 1", (sid,))
                    seller_row = cur.fetchone()
                    if seller_row and seller_row.get("email"):
                        email_seller_new_order(
                            seller_row.get("full_name") or "",
                            seller_row["email"],
                            so_row["id"],
                            d["full_name"], d["phone"],
                            json.dumps(sitems, ensure_ascii=False),
                            float(s_total)
                        )
                except Exception:
                    pass

        if created:
            return jsonify(created)
        if seller_order_rows:
            _sid, so_row, _sitems, _stotal = seller_order_rows[0]
            resp = dict(so_row)
            resp["is_seller_order"] = True
            return jsonify(resp)
        return jsonify({"error": "Пустой заказ"}), 400
    except Exception as e:
        print(f"[/api/vip/orders] error: {e}")
        return jsonify({"error": "Ошибка создания заказа"}), 500


# ── Admin VIP ──────────────────────────────────
@bp.route("/api/admin/users/<int:uid>/vip", methods=["PATCH"])
def api_toggle_vip(uid):
    d = request.json or {}
    is_vip = d.get("is_vip", False)
    try:
        with get_db() as cur:
            cur.execute("UPDATE coop_users SET is_vip = %s WHERE id = %s RETURNING *", (is_vip, uid))
            user = _row_to_dict(cur.fetchone())
            if user:
                user.pop("password", None)
        return jsonify({"user": user})
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/users/<int:uid>/seller", methods=["PATCH"])
def api_toggle_seller(uid):
    d = request.json or {}
    is_seller = d.get("is_seller", False)
    try:
        with get_db() as cur:
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE coop_users ADD COLUMN is_seller BOOLEAN DEFAULT FALSE;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
            """)
            cur.execute("UPDATE coop_users SET is_seller = %s WHERE id = %s RETURNING *", (is_seller, uid))
            user = _row_to_dict(cur.fetchone())
            if user:
                user.pop("password", None)
        return jsonify({"user": user})
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/users/<int:uid>/vip-seller", methods=["PATCH"])
def api_toggle_vip_seller(uid):
    """Admin-only: promote a seller to VIP-seller so their VIP-marked products
    appear in the VIP catalog. If they aren't yet flagged as a seller, we also
    flip that flag on so the promotion is self-contained."""
    d = request.json or {}
    is_vip_seller = bool(d.get("is_vip_seller", False))
    try:
        with get_db() as cur:
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE coop_users ADD COLUMN is_seller BOOLEAN DEFAULT FALSE;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
                DO $$ BEGIN
                    ALTER TABLE coop_users ADD COLUMN is_vip_seller BOOLEAN DEFAULT FALSE;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
            """)
            if is_vip_seller:
                cur.execute(
                    "UPDATE coop_users SET is_vip_seller = TRUE, is_seller = TRUE WHERE id = %s RETURNING *",
                    (uid,)
                )
            else:
                cur.execute(
                    "UPDATE coop_users SET is_vip_seller = FALSE WHERE id = %s RETURNING *",
                    (uid,)
                )
                # Also drop VIP flag from their existing products so nothing
                # leaks into the VIP catalog after a demotion.
                cur.execute(
                    "UPDATE coop_seller_products SET is_vip = FALSE WHERE seller_id = %s",
                    (uid,)
                )
            user = _row_to_dict(cur.fetchone())
            if user:
                user.pop("password", None)
        return jsonify({"user": user})
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/vip/products", methods=["POST"])
def api_admin_add_vip_product():
    d = request.json or {}
    # Map admin field names to actual DB columns and filter unknown fields
    field_map = {
        'vip_category_id': 'category_id',
        'vip_subcategory_id': 'subcategory_id',
        'vip_supplier_id': 'supplier_id',
    }
    _VIP_PRODUCT_COLS = {'name','price','description','category_id','subcategory_id','supplier_id',
                         'badge','image_url','is_available','product_type','box_size',
                         'requires_subscription','subscription_id','is_adult',
                         'pack_quantity','pack_weight_kg','requires_variant'}
    safe = {}
    for k, v in d.items():
        col = field_map.get(k, k)
        if col in _VIP_PRODUCT_COLS:
            safe[col] = v
    if not safe.get('name'):
        return jsonify({"error": "Название обязательно"}), 400
    try:
        with get_db() as cur:
            _ensure_vip_products_requires_variant(cur)
            cols = list(safe.keys())
            placeholders = ', '.join(['%s'] * len(cols))
            col_names = ', '.join(cols)
            cur.execute(f"INSERT INTO coop_vip_products ({col_names}) VALUES ({placeholders}) RETURNING *", list(safe.values()))
            result = _row_to_dict(cur.fetchone())
        return jsonify(result)
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500
_VIP_PRODUCT_COLS = {'name','price','description','category_id','subcategory_id','supplier_id',
                     'badge','image_url','is_available','product_type','box_size',
                     'requires_subscription','subscription_id','is_adult',
                     'pack_quantity','pack_weight_kg','requires_variant'}

@bp.route("/api/admin/vip/products/<int:pid>", methods=["PATCH"])
def api_admin_update_vip_product(pid):
    d = request.json or {}
    _map = {'vip_category_id':'category_id','vip_subcategory_id':'subcategory_id','vip_supplier_id':'supplier_id'}
    mapped = {_map.get(k,k): v for k,v in d.items()}
    try:
        with get_db() as cur:
            _ensure_vip_products_requires_variant(cur)
            row = safe_update(cur, 'coop_vip_products', _VIP_PRODUCT_COLS, mapped, 'id', pid)
            result = _row_to_dict(row)
        return jsonify(result)
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/vip/products/<int:pid>", methods=["DELETE"])
def api_admin_delete_vip_product(pid):
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_vip_products WHERE id = %s", (pid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/vip/orders")
def api_admin_vip_orders():
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_vip_orders ORDER BY created_at DESC")
            orders = _rows_to_list(cur.fetchall())
        return jsonify(orders or [])
    except:
        return jsonify([])


@bp.route("/api/admin/vip/orders/<int:oid>", methods=["PATCH"])
def api_admin_update_vip_order(oid):
    d = request.json or {}
    payment_template_id = d.pop("payment_template_id", None)
    try:
        with get_db() as cur:
            _VIP_ORDER_COLS = {'status','comment','items','total','full_name','phone','address'}
            row = safe_update(cur, 'coop_vip_orders', _VIP_ORDER_COLS, d, 'id', oid)
            result = _row_to_dict(row)
            # Send VIP status email if status changed
            new_status = d.get("status")
            if new_status and result:
                uid = result.get("user_id")
                # Load payment template for "ready" VIP orders
                payment_info = None
                if new_status == "ready":
                    if payment_template_id:
                        cur.execute("SELECT * FROM coop_vip_payment_templates WHERE id = %s LIMIT 1", (payment_template_id,))
                        tpl_row = cur.fetchone()
                        if tpl_row:
                            payment_info = _row_to_dict(tpl_row)
                    else:
                        cur.execute("SELECT * FROM coop_vip_payment_templates WHERE is_default = TRUE LIMIT 1")
                        tpl_row = cur.fetchone()
                        if tpl_row:
                            payment_info = _row_to_dict(tpl_row)
                if uid:
                    cur.execute("SELECT email FROM coop_users WHERE id = %s", (uid,))
                    u = cur.fetchone()
                    if u and u.get("email"):
                        try:
                            email_vip_order_status_change(
                                result.get("full_name", ""),
                                u["email"], oid,
                                float(result.get("total", 0)),
                                new_status,
                                payment_info=payment_info
                            )
                        except:
                            pass
        return jsonify(result)
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/vip/orders/<int:oid>", methods=["DELETE"])
def api_admin_delete_vip_order(oid):
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_vip_orders WHERE id = %s", (oid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/vip/subscriptions")
def api_vip_subscriptions():
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_subscriptions WHERE is_vip = TRUE AND is_active = TRUE ORDER BY id ASC")
            subs = _rows_to_list(cur.fetchall())
        return jsonify(subs or [])
    except:
        return jsonify([])


@bp.route("/api/admin/vip/data")
def api_admin_vip_data():
    try:
        with get_db() as cur:
            _ensure_vip_products_requires_variant(cur)
            cur.execute("SELECT * FROM coop_vip_products ORDER BY created_at ASC")
            prods = _rows_to_list(cur.fetchall())
            cur.execute("SELECT * FROM coop_vip_orders ORDER BY created_at DESC")
            ords = _rows_to_list(cur.fetchall())
            cur.execute("SELECT * FROM coop_vip_categories ORDER BY created_at ASC")
            cats = _rows_to_list(cur.fetchall())
            cur.execute("SELECT * FROM coop_vip_subcategories ORDER BY id ASC")
            subcats = _rows_to_list(cur.fetchall())
            cur.execute("SELECT * FROM coop_vip_suppliers ORDER BY name ASC")
            supps = _rows_to_list(cur.fetchall())
        return jsonify({"products": prods, "orders": ords, "categories": cats, "subcategories": subcats, "suppliers": supps})
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── VIP Categories ────────────────────────────
@bp.route("/api/admin/vip/categories", methods=["POST"])
def api_admin_add_vip_category():
    d = request.json or {}
    try:
        with get_db() as cur:
            cur.execute("INSERT INTO coop_vip_categories (name, description) VALUES (%s, %s) RETURNING *",
                        (d.get("name", ""), d.get("description", "")))
            return jsonify(_row_to_dict(cur.fetchone()))
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/vip/categories/<int:cid>", methods=["PATCH"])
def api_admin_update_vip_category(cid):
    d = request.json or {}
    try:
        with get_db() as cur:
            row = safe_update(cur, 'coop_vip_categories', {'name','description'}, d, 'id', cid)
            return jsonify(_row_to_dict(row))
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/vip/categories/<int:cid>", methods=["DELETE"])
def api_admin_delete_vip_category(cid):
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_vip_categories WHERE id = %s", (cid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── VIP Subcategories ─────────────────────────
@bp.route("/api/admin/vip/subcategories", methods=["POST"])
def api_admin_add_vip_subcategory():
    d = request.json or {}
    try:
        with get_db() as cur:
            cur.execute("INSERT INTO coop_vip_subcategories (category_id, name) VALUES (%s, %s) RETURNING *",
                        (d.get("category_id"), d.get("name", "")))
            return jsonify(_row_to_dict(cur.fetchone()))
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/vip/subcategories/<int:sid>", methods=["DELETE"])
def api_admin_delete_vip_subcategory(sid):
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_vip_subcategories WHERE id = %s", (sid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── VIP Suppliers ─────────────────────────────
@bp.route("/api/admin/vip/suppliers", methods=["POST"])
def api_admin_add_vip_supplier():
    d = request.json or {}
    try:
        with get_db() as cur:
            cur.execute(
                """INSERT INTO coop_vip_suppliers (name, delivery_day, delivery_note, assembly_day, contact_phone, contact_telegram)
                   VALUES (%s, %s, %s, %s, %s, %s) RETURNING *""",
                (d.get("name",""), d.get("delivery_day",""), d.get("delivery_note",""),
                 d.get("assembly_day",""), d.get("contact_phone",""), d.get("contact_telegram",""))
            )
            return jsonify(_row_to_dict(cur.fetchone()))
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/vip/suppliers/<int:sid>", methods=["PATCH"])
def api_admin_update_vip_supplier(sid):
    d = request.json or {}
    try:
        with get_db() as cur:
            row = safe_update(cur, 'coop_vip_suppliers', {'name','delivery_day','delivery_note','assembly_day','contact_phone','contact_telegram'}, d, 'id', sid)
            return jsonify(_row_to_dict(row))
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/vip/suppliers/<int:sid>", methods=["DELETE"])
def api_admin_delete_vip_supplier(sid):
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_vip_suppliers WHERE id = %s", (sid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── VIP Payment Templates ────────────────────
@bp.route("/api/admin/vip/payment-templates")
def api_admin_vip_payment_templates():
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_vip_payment_templates ORDER BY is_default DESC, id ASC")
            return jsonify(_rows_to_list(cur.fetchall()) or [])
    except:
        return jsonify([])


@bp.route("/api/admin/vip/payment-templates", methods=["POST"])
def api_admin_add_vip_payment_template():
    d = request.json or {}
    try:
        with get_db() as cur:
            if d.get("is_default"):
                cur.execute("UPDATE coop_vip_payment_templates SET is_default = FALSE WHERE is_default = TRUE")
            cur.execute(
                """INSERT INTO coop_vip_payment_templates (name, bank_name, recipient_name, card_number, phone_number, account_number, bik, inn, extra_info, is_default)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
                (d.get("name",""), d.get("bank_name",""), d.get("recipient_name",""),
                 d.get("card_number",""), d.get("phone_number",""), d.get("account_number",""),
                 d.get("bik",""), d.get("inn",""), d.get("extra_info",""), d.get("is_default", False))
            )
            return jsonify(_row_to_dict(cur.fetchone()))
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/vip/payment-templates/<int:tid>", methods=["PATCH"])
def api_admin_update_vip_payment_template(tid):
    d = request.json or {}
    try:
        with get_db() as cur:
            if d.get("is_default"):
                cur.execute("UPDATE coop_vip_payment_templates SET is_default = FALSE WHERE is_default = TRUE")
            _TPL_COLS = {'name','bank_name','recipient_name','card_number','phone_number','account_number','bik','inn','extra_info','is_default'}
            row = safe_update(cur, 'coop_vip_payment_templates', _TPL_COLS, d, 'id', tid)
            return jsonify(_row_to_dict(row))
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/vip/payment-templates/<int:tid>", methods=["DELETE"])
def api_admin_delete_vip_payment_template(tid):
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_vip_payment_templates WHERE id = %s", (tid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500
# ══════════════════════════════════════════════
# ── Seller endpoints ──────────────────────────
# ══════════════════════════════════════════════
_SELLER_PRODUCT_COLS = {
    'name', 'price', 'description', 'category_id', 'subcategory_id',
    'badge', 'image_url', 'gallery_urls', 'is_available', 'is_adult',
    'pack_quantity', 'pack_weight_kg', 'stock_quantity',
    'approval_status', 'moderation_note', 'is_vip', 'requires_variant'
}


def _ensure_seller_schema(cur):
    """Create or upgrade seller tables with full fields."""
    # Base products table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS coop_seller_products (
            id SERIAL PRIMARY KEY,
            seller_id INTEGER NOT NULL REFERENCES coop_users(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            price NUMERIC(12,2) DEFAULT 0,
            description TEXT DEFAULT '',
            image_url TEXT DEFAULT '',
            is_available BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    # Migrations for additional fields
    migrations = [
        "ALTER TABLE coop_seller_products ADD COLUMN category_id INTEGER DEFAULT NULL",
        "ALTER TABLE coop_seller_products ADD COLUMN subcategory_id INTEGER DEFAULT NULL",
        "ALTER TABLE coop_seller_products ADD COLUMN badge VARCHAR(30) DEFAULT NULL",
        "ALTER TABLE coop_seller_products ADD COLUMN gallery_urls TEXT DEFAULT '[]'",
        "ALTER TABLE coop_seller_products ADD COLUMN is_adult BOOLEAN DEFAULT FALSE",
        "ALTER TABLE coop_seller_products ADD COLUMN pack_quantity INTEGER DEFAULT NULL",
        "ALTER TABLE coop_seller_products ADD COLUMN pack_weight_kg NUMERIC(10,3) DEFAULT NULL",
        "ALTER TABLE coop_seller_products ADD COLUMN stock_quantity INTEGER DEFAULT NULL",
        "ALTER TABLE coop_seller_products ADD COLUMN approval_status VARCHAR(20) DEFAULT 'approved'",
        "ALTER TABLE coop_seller_products ADD COLUMN moderation_note TEXT DEFAULT ''",
        "ALTER TABLE coop_seller_products ADD COLUMN views_count INTEGER DEFAULT 0",
        # v11: VIP-seller flow. Product-level flag + seller-level flag.
        "ALTER TABLE coop_seller_products ADD COLUMN is_vip BOOLEAN DEFAULT FALSE",
        "ALTER TABLE coop_users ADD COLUMN is_vip_seller BOOLEAN DEFAULT FALSE",
        # v12: separate product type flag for variant-specification items
        # (e.g. 'парфюм — укажите, какой'). Not a badge.
        "ALTER TABLE coop_seller_products ADD COLUMN requires_variant BOOLEAN DEFAULT FALSE",
    ]
    for sql in migrations:
        try:
            cur.execute(f"DO $$ BEGIN {sql}; EXCEPTION WHEN duplicate_column THEN NULL; END $$;")
        except Exception:
            pass
    # Seller orders table
    cur.execute("""
        CREATE TABLE IF NOT EXISTS coop_seller_orders (
            id SERIAL PRIMARY KEY,
            seller_id INTEGER NOT NULL REFERENCES coop_users(id) ON DELETE CASCADE,
            user_id INTEGER DEFAULT NULL,
            full_name VARCHAR(255) NOT NULL,
            phone VARCHAR(50) NOT NULL,
            address TEXT DEFAULT '',
            comment TEXT DEFAULT '',
            items TEXT NOT NULL DEFAULT '[]',
            total NUMERIC(12,2) DEFAULT 0,
            status VARCHAR(30) DEFAULT 'new',
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)


def _filter_seller_fields(d):
    """Normalize + whitelist seller product fields."""
    safe = {}
    for k, v in d.items():
        if k in _SELLER_PRODUCT_COLS:
            if k == 'gallery_urls' and isinstance(v, list):
                safe[k] = json.dumps(v, ensure_ascii=False)
            elif k in ('price', 'pack_weight_kg'):
                try:
                    safe[k] = float(v) if v not in (None, '') else None
                except (TypeError, ValueError):
                    pass
            elif k in ('category_id', 'subcategory_id', 'pack_quantity', 'stock_quantity'):
                try:
                    safe[k] = int(v) if v not in (None, '') else None
                except (TypeError, ValueError):
                    pass
            elif k in ('is_available', 'is_adult', 'is_vip', 'requires_variant'):
                safe[k] = bool(v)
            else:
                safe[k] = v
    return safe


# ── Public: list all approved+available seller products ──
@bp.route("/api/seller/catalog")
def api_seller_catalog():
    """Public catalog of all seller products (approved + available)."""
    try:
        with get_db() as cur:
            _ensure_seller_schema(cur)
            cur.execute("""
                SELECT p.*, u.full_name AS seller_name
                FROM coop_seller_products p
                LEFT JOIN coop_users u ON u.id = p.seller_id
                WHERE p.is_available = TRUE AND (p.approval_status = 'approved' OR p.approval_status IS NULL)
                ORDER BY p.created_at DESC
            """)
            prods = _rows_to_list(cur.fetchall())
        return jsonify(prods or [])
    except:
        return jsonify([])


# ── Seller: categories (reuse admin categories) ──
@bp.route("/api/seller/categories")
def api_seller_categories():
    try:
        with get_db() as cur:
            cur.execute("SELECT id, name, description FROM coop_categories ORDER BY id ASC")
            cats = _rows_to_list(cur.fetchall())
            cur.execute("SELECT id, category_id, name FROM coop_subcategories ORDER BY id ASC")
            subs = _rows_to_list(cur.fetchall())
        return jsonify({"categories": cats or [], "subcategories": subs or []})
    except:
        return jsonify({"categories": [], "subcategories": []})


# ── Seller: own products ──
@bp.route("/api/seller/products")
def api_seller_products():
    user_id, err = require_seller()
    if err:
        return err
    try:
        with get_db() as cur:
            _ensure_seller_schema(cur)
            cur.execute("SELECT * FROM coop_seller_products WHERE seller_id = %s ORDER BY created_at DESC", (user_id,))
            prods = _rows_to_list(cur.fetchall())
        return jsonify(prods or [])
    except:
        return jsonify([])


def _is_vip_seller(cur, user_id):
    """Return True if the user is flagged as VIP seller."""
    try:
        cur.execute("SELECT is_vip_seller FROM coop_users WHERE id = %s LIMIT 1", (user_id,))
        row = cur.fetchone()
        return bool(row and row.get('is_vip_seller'))
    except Exception:
        return False


def require_seller():
    """(seller_id, None) for an approved seller, else (None, error response).

    The seller id comes from the token — a user_id in the query string or body
    is just a claim, and the whole seller cabinet used to run on that claim.
    """
    uid, err = require_auth()
    if err:
        return None, err
    try:
        with get_db() as cur:
            cur.execute(
                "SELECT is_seller, is_blocked, is_approved FROM coop_users WHERE id = %s LIMIT 1",
                (uid,)
            )
            u = cur.fetchone()
    except Exception:
        return None, (jsonify({"error": "Ошибка сервера"}), 500)
    if not u or not u.get("is_seller"):
        return None, (jsonify({"error": "Доступ только для продавцов"}), 403)
    if u.get("is_blocked") or not u.get("is_approved"):
        return None, (jsonify({"error": "Аккаунт заблокирован или не одобрен"}), 403)
    return uid, None


@bp.route("/api/seller/products", methods=["POST"])
def api_seller_create_product():
    user_id, err = require_seller()
    if err:
        return err
    d = request.json or {}
    name = (d.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Название обязательно"}), 400
    safe = _filter_seller_fields(d)
    safe['name'] = name
    try:
        with get_db() as cur:
            _ensure_seller_schema(cur)
            # Only VIP sellers can create VIP products. Silently strip the flag
            # for regular sellers so a tampered request can't leak into the
            # VIP catalog.
            if safe.get('is_vip') and not _is_vip_seller(cur, user_id):
                safe['is_vip'] = False
            cols = ['seller_id'] + list(safe.keys())
            placeholders = ', '.join(['%s'] * len(cols))
            params = [user_id] + list(safe.values())
            cur.execute(
                f"INSERT INTO coop_seller_products ({', '.join(cols)}) VALUES ({placeholders}) RETURNING *",
                params
            )
            prod = _row_to_dict(cur.fetchone())
        return jsonify(prod)
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/seller/products/<int:pid>", methods=["PATCH"])
def api_seller_update_product(pid):
    user_id, err = require_seller()
    if err:
        return err
    d = request.json or {}
    # Seller cannot change own approval_status/moderation_note
    d.pop('approval_status', None)
    d.pop('moderation_note', None)
    safe = _filter_seller_fields(d)
    if not safe:
        return jsonify({"error": "Нечего обновлять"}), 400
    try:
        with get_db() as cur:
            _ensure_seller_schema(cur)
            if 'is_vip' in safe and safe['is_vip'] and not _is_vip_seller(cur, user_id):
                safe['is_vip'] = False
            updates = ', '.join([f"{k} = %s" for k in safe.keys()])
            params = list(safe.values()) + [pid, user_id]
            cur.execute(
                f"UPDATE coop_seller_products SET {updates} WHERE id = %s AND seller_id = %s RETURNING *",
                params
            )
            prod = _row_to_dict(cur.fetchone())
        return jsonify(prod)
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/seller/products/<int:pid>", methods=["DELETE"])
def api_seller_delete_product(pid):
    user_id, err = require_seller()
    if err:
        return err
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_seller_products WHERE id = %s AND seller_id = %s", (pid, user_id))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── Seller: orders for this seller ──
@bp.route("/api/seller/orders")
def api_seller_orders():
    user_id, err = require_seller()
    if err:
        return err
    try:
        with get_db() as cur:
            _ensure_seller_schema(cur)
            cur.execute("SELECT * FROM coop_seller_orders WHERE seller_id = %s ORDER BY created_at DESC", (user_id,))
            orders = _rows_to_list(cur.fetchall())
        return jsonify(orders or [])
    except:
        return jsonify([])


@bp.route("/api/seller/orders/<int:oid>", methods=["PATCH"])
def api_seller_update_order(oid):
    user_id, err = require_seller()
    if err:
        return err
    d = request.json or {}
    new_status = d.get("status")
    if not new_status:
        return jsonify({"error": "status обязателен"}), 400
    try:
        with get_db() as cur:
            cur.execute(
                "UPDATE coop_seller_orders SET status = %s WHERE id = %s AND seller_id = %s RETURNING *",
                (new_status, oid, user_id)
            )
            order = _row_to_dict(cur.fetchone())
        return jsonify(order)
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── Seller: analytics/stats ──
@bp.route("/api/seller/stats")
def api_seller_stats():
    user_id, err = require_seller()
    if err:
        return err
    try:
        with get_db() as cur:
            _ensure_seller_schema(cur)
            # Product counts
            cur.execute("""
                SELECT
                    COUNT(*)::int AS total_products,
                    COUNT(*) FILTER (WHERE is_available = TRUE)::int AS active_products,
                    COUNT(*) FILTER (WHERE approval_status = 'pending')::int AS pending_products,
                    COUNT(*) FILTER (WHERE approval_status = 'rejected')::int AS rejected_products,
                    COALESCE(SUM(views_count), 0)::int AS total_views
                FROM coop_seller_products
                WHERE seller_id = %s
            """, (user_id,))
            pstats = _row_to_dict(cur.fetchone()) or {}
            # Order counts + revenue
            cur.execute("""
                SELECT
                    COUNT(*)::int AS total_orders,
                    COUNT(*) FILTER (WHERE status = 'new')::int AS new_orders,
                    COUNT(*) FILTER (WHERE status = 'done' OR status = 'delivered')::int AS done_orders,
                    COALESCE(SUM(total), 0)::float AS total_revenue,
                    COALESCE(SUM(total) FILTER (WHERE status = 'done' OR status = 'delivered'), 0)::float AS paid_revenue,
                    COALESCE(AVG(total), 0)::float AS avg_order_value
                FROM coop_seller_orders
                WHERE seller_id = %s
            """, (user_id,))
            ostats = _row_to_dict(cur.fetchone()) or {}
            # Revenue by day for last 30 days
            cur.execute("""
                SELECT TO_CHAR(created_at::date, 'YYYY-MM-DD') AS day,
                       COUNT(*)::int AS orders,
                       COALESCE(SUM(total), 0)::float AS revenue
                FROM coop_seller_orders
                WHERE seller_id = %s AND created_at >= NOW() - INTERVAL '30 days'
                GROUP BY day ORDER BY day ASC
            """, (user_id,))
            daily = _rows_to_list(cur.fetchall()) or []
            # Top products (by count across items)
            cur.execute("""
                SELECT p.id, p.name, p.price, p.image_url, p.is_available,
                       COALESCE(p.views_count, 0)::int AS views_count
                FROM coop_seller_products p
                WHERE p.seller_id = %s
                ORDER BY COALESCE(p.views_count, 0) DESC, p.created_at DESC
                LIMIT 5
            """, (user_id,))
            top_products = _rows_to_list(cur.fetchall()) or []
            # Products by category
            cur.execute("""
                SELECT COALESCE(c.name, 'Без категории') AS category,
                       COUNT(*)::int AS count
                FROM coop_seller_products p
                LEFT JOIN coop_categories c ON c.id = p.category_id
                WHERE p.seller_id = %s
                GROUP BY c.name
                ORDER BY count DESC
            """, (user_id,))
            by_category = _rows_to_list(cur.fetchall()) or []
        return jsonify({
            **pstats,
            **ostats,
            "daily_revenue": daily,
            "top_products": top_products,
            "by_category": by_category,
        })
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500
# ══════════════════════════════════════════════
# ── Admin: seller management ──────────────────
# ══════════════════════════════════════════════
@bp.route("/api/admin/sellers")
def api_admin_list_sellers():
    """List all seller users with their stats."""
    try:
        with get_db() as cur:
            _ensure_seller_schema(cur)
            cur.execute("""
                SELECT u.id, u.full_name, u.phone, u.email,
                    u.is_seller, COALESCE(u.is_vip_seller, FALSE) AS is_vip_seller,
                    u.is_approved, u.is_blocked, u.created_at,
                    COALESCE(pc.cnt, 0)::int AS products_count,
                    COALESCE(pc.active, 0)::int AS products_active,
                    COALESCE(oc.cnt, 0)::int AS orders_count,
                    COALESCE(oc.revenue, 0)::float AS revenue
                FROM coop_users u
                LEFT JOIN (
                    SELECT seller_id,
                        COUNT(*)::int AS cnt,
                        COUNT(*) FILTER (WHERE is_available = TRUE)::int AS active
                    FROM coop_seller_products GROUP BY seller_id
                ) pc ON pc.seller_id = u.id
                LEFT JOIN (
                    SELECT seller_id,
                        COUNT(*)::int AS cnt,
                        COALESCE(SUM(total), 0)::float AS revenue
                    FROM coop_seller_orders GROUP BY seller_id
                ) oc ON oc.seller_id = u.id
                WHERE u.is_seller = TRUE
                ORDER BY revenue DESC, u.created_at DESC
            """)
            sellers = _rows_to_list(cur.fetchall())
            for s in sellers or []:
                s.pop("password", None)
        return jsonify(sellers or [])
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/seller/products")
def api_admin_list_seller_products():
    """List all seller products across sellers (for moderation)."""
    try:
        with get_db() as cur:
            _ensure_seller_schema(cur)
            cur.execute("""
                SELECT p.*, u.full_name AS seller_name, u.phone AS seller_phone
                FROM coop_seller_products p
                LEFT JOIN coop_users u ON u.id = p.seller_id
                ORDER BY p.created_at DESC
            """)
            prods = _rows_to_list(cur.fetchall())
        return jsonify(prods or [])
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/seller/products/<int:pid>", methods=["PATCH"])
def api_admin_update_seller_product(pid):
    """Admin can update anything including approval_status/moderation_note."""
    d = request.json or {}
    safe = _filter_seller_fields(d)
    if not safe:
        return jsonify({"error": "Нечего обновлять"}), 400
    try:
        with get_db() as cur:
            updates = ', '.join([f"{k} = %s" for k in safe.keys()])
            params = list(safe.values()) + [pid]
            cur.execute(
                f"UPDATE coop_seller_products SET {updates} WHERE id = %s RETURNING *",
                params
            )
            prod = _row_to_dict(cur.fetchone())
        return jsonify(prod)
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/seller/products/<int:pid>", methods=["DELETE"])
def api_admin_delete_seller_product(pid):
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_seller_products WHERE id = %s", (pid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/seller/orders")
def api_admin_list_seller_orders():
    """List all seller orders across sellers."""
    try:
        with get_db() as cur:
            _ensure_seller_schema(cur)
            cur.execute("""
                SELECT o.*, u.full_name AS seller_name, u.phone AS seller_phone
                FROM coop_seller_orders o
                LEFT JOIN coop_users u ON u.id = o.seller_id
                ORDER BY o.created_at DESC
            """)
            orders = _rows_to_list(cur.fetchall())
        return jsonify(orders or [])
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/seller/orders/<int:oid>", methods=["PATCH"])
def api_admin_update_seller_order(oid):
    d = request.json or {}
    new_status = d.get("status")
    if not new_status:
        return jsonify({"error": "status обязателен"}), 400
    try:
        with get_db() as cur:
            cur.execute(
                "UPDATE coop_seller_orders SET status = %s WHERE id = %s RETURNING *",
                (new_status, oid)
            )
            order = _row_to_dict(cur.fetchone())
        return jsonify(order)
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/seller/stats")
def api_admin_seller_stats():
    """Global seller marketplace analytics."""
    try:
        with get_db() as cur:
            _ensure_seller_schema(cur)
            cur.execute("""
                SELECT
                    (SELECT COUNT(*)::int FROM coop_users WHERE is_seller = TRUE) AS total_sellers,
                    (SELECT COUNT(*)::int FROM coop_seller_products) AS total_products,
                    (SELECT COUNT(*)::int FROM coop_seller_products WHERE is_available = TRUE) AS active_products,
                    (SELECT COUNT(*)::int FROM coop_seller_products WHERE approval_status = 'pending') AS pending_products,
                    (SELECT COUNT(*)::int FROM coop_seller_orders) AS total_orders,
                    (SELECT COALESCE(SUM(total), 0)::float FROM coop_seller_orders) AS total_revenue
            """)
            stats = _row_to_dict(cur.fetchone()) or {}
            # Top 5 sellers by revenue
            cur.execute("""
                SELECT u.id, u.full_name, u.phone,
                    COALESCE(SUM(o.total), 0)::float AS revenue,
                    COUNT(o.id)::int AS orders_count
                FROM coop_users u
                LEFT JOIN coop_seller_orders o ON o.seller_id = u.id
                WHERE u.is_seller = TRUE
                GROUP BY u.id, u.full_name, u.phone
                ORDER BY revenue DESC
                LIMIT 5
            """)
            top_sellers = _rows_to_list(cur.fetchall()) or []
            # Revenue last 30 days
            cur.execute("""
                SELECT TO_CHAR(created_at::date, 'YYYY-MM-DD') AS day,
                    COUNT(*)::int AS orders,
                    COALESCE(SUM(total), 0)::float AS revenue
                FROM coop_seller_orders
                WHERE created_at >= NOW() - INTERVAL '30 days'
                GROUP BY day ORDER BY day ASC
            """)
            daily = _rows_to_list(cur.fetchall()) or []
        return jsonify({**stats, "top_sellers": top_sellers, "daily_revenue": daily})
    except Exception as e:
        print(f"[app/routes/vip.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500