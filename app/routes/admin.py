"""
Admin API routes — all /api/admin/* endpoints.
Login endpoint is public; everything else requires token auth.
"""

import os
import json
import time
import hmac

from flask import Blueprint, request, jsonify

from ..db import get_db, _row_to_dict, _rows_to_list
from ..utils import rate_limited, rate_limited_auth, check_brute_force, record_login_fail, record_login_success, hash_password, verify_password, safe_update, safe_insert, sanitize_string, validate_upload
from ..auth import _create_admin_token, _verify_admin_token, invalidate_user_tokens
from ..email_service import email_order_status_change, email_user_approved, email_user_blocked
from ..config import UPLOAD_DIR

bp = Blueprint('admin', __name__)

# Auth guard is app-level in app/__init__.py — protects all /api/admin/* across all blueprints


def _activate_order_subscriptions(cur, order_id, user_id):
    """When an order is marked 'done', check if it contains subscription items and activate them.
    Subscriptions are activated automatically in coop_user_subscriptions table."""
    try:
        cur.execute("SELECT items FROM coop_orders WHERE id = %s", (order_id,))
        row = cur.fetchone()
        if not row:
            return
        items = row.get("items") or []
        if isinstance(items, str):
            import json as _json
            items = _json.loads(items)
        for it in items:
            sub_id = it.get("subscription_id")
            if not sub_id:
                continue
            cur.execute("SELECT id, duration_days FROM coop_subscriptions WHERE id = %s LIMIT 1", (sub_id,))
            sub = cur.fetchone()
            if sub:
                days = sub.get("duration_days") or 30
                cur.execute(
                    """INSERT INTO coop_user_subscriptions (user_id, subscription_id, expires_at, is_active)
                       VALUES (%s, %s, NOW() + INTERVAL '%s days', TRUE)""",
                    (user_id, sub_id, days)
                )
    except Exception:
        pass


def _deactivate_order_subscriptions(cur, order_id, user_id):
    """When an order is moved AWAY from 'done', deactivate its subscriptions."""
    try:
        cur.execute("SELECT items FROM coop_orders WHERE id = %s", (order_id,))
        row = cur.fetchone()
        if not row:
            return
        items = row.get("items") or []
        if isinstance(items, str):
            import json as _json
            items = _json.loads(items)
        for it in items:
            sub_id = it.get("subscription_id")
            if not sub_id:
                continue
            # Deactivate the most recent subscription for this user+plan
            cur.execute(
                """UPDATE coop_user_subscriptions SET is_active = FALSE
                   WHERE user_id = %s AND subscription_id = %s AND is_active = TRUE
                   AND id = (SELECT id FROM coop_user_subscriptions
                             WHERE user_id = %s AND subscription_id = %s AND is_active = TRUE
                             ORDER BY purchased_at DESC LIMIT 1)""",
                (user_id, sub_id, user_id, sub_id)
            )
    except Exception:
        pass


# ── Login ──────────────────────────────────────
@bp.route("/api/admin/login", methods=["POST"])
def api_admin_login():
    if rate_limited_auth():
        return jsonify({"error": "Слишком много попыток. Подождите минуту."}), 429
    if check_brute_force():
        return jsonify({"error": "IP заблокирован на 5 минут из-за множества неудачных попыток входа."}), 429
    d = request.json or {}
    username = sanitize_string(d.get("username") or "", 100)
    password = (d.get("password") or "").strip()
    if not username or not password:
        return jsonify({"error": "Введите логин и пароль"}), 400
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_admins WHERE username = %s LIMIT 1", (username,))
            admin = cur.fetchone()
            if admin:
                stored_pw = admin.get("password", "")
                if verify_password(password, stored_pw):
                    if not stored_pw.startswith('$2b$') and not stored_pw.startswith('$2a$'):
                        cur.execute("UPDATE coop_admins SET password = %s WHERE id = %s", (hash_password(password), admin['id']))
                    info = _row_to_dict(admin)
                    info.pop("password", None)
                    token = _create_admin_token(info)
                    record_login_success()
                    return jsonify({"admin": info, "token": token})
            if username == "admin":
                # Master password kept in coop_settings. No hardcoded fallback:
                # the old one shipped in this repo and in db/init.sql.
                cur.execute("SELECT value FROM coop_settings WHERE key = 'admin_password' LIMIT 1")
                row = cur.fetchone()
                master = (row["value"] if row else "") or ""
                ok = False
                if master.startswith('$2b$') or master.startswith('$2a$'):
                    ok = verify_password(password, master)
                elif master:
                    ok = hmac.compare_digest(password, master)
                if ok:
                    # Upgrade the stored plaintext to a bcrypt hash on first use,
                    # so a future settings leak can't hand over the account.
                    if not (master.startswith('$2b$') or master.startswith('$2a$')):
                        cur.execute(
                            "UPDATE coop_settings SET value = %s WHERE key = 'admin_password'",
                            (hash_password(password),)
                        )
                    info = {"id": 0, "username": "admin", "display_name": "Администратор"}
                    token = _create_admin_token(info)
                    record_login_success()
                    return jsonify({"admin": info, "token": token})
        record_login_fail()
        return jsonify({"error": "Неверный логин или пароль"}), 401
    except Exception as e:
        return jsonify({"error": "Ошибка входа"}), 500


# ── Bulk data ──────────────────────────────────
@bp.route("/api/admin/data")
def api_admin_data():
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_categories ORDER BY created_at ASC")
            cats = _rows_to_list(cur.fetchall())
            cur.execute("SELECT * FROM coop_products ORDER BY created_at ASC")
            prods = _rows_to_list(cur.fetchall())
            cur.execute("SELECT * FROM coop_orders ORDER BY created_at DESC")
            ords = _rows_to_list(cur.fetchall())
            cur.execute("SELECT * FROM coop_suppliers ORDER BY name ASC")
            supps = _rows_to_list(cur.fetchall())
            cur.execute("SELECT * FROM coop_music ORDER BY sort_order ASC")
            music = _rows_to_list(cur.fetchall())
            cur.execute("SELECT * FROM coop_admins ORDER BY created_at ASC")
            admins = _rows_to_list(cur.fetchall())
            for a in admins:
                a.pop("password", None)
            cur.execute("SELECT * FROM coop_users ORDER BY created_at DESC")
            users = _rows_to_list(cur.fetchall())
            for u in users:
                u.pop("password", None)
        return jsonify({
            "categories": cats, "products": prods, "orders": ords,
            "suppliers": supps, "music": music, "admins": admins, "users": users,
        })
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── Settings ───────────────────────────────────
@bp.route("/api/admin/settings", methods=["PATCH"])
def api_admin_save_settings():
    d = request.json or {}
    results = {}
    try:
        with get_db() as cur:
            for key, value in d.items():
                cur.execute(
                    """INSERT INTO coop_settings (key, value) VALUES (%s, %s)
                       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value""",
                    (key, str(value))
                )
                results[key] = value
    except Exception as e:
        print(f"Settings save error: {e}")
    return jsonify(results)


# ── CRUD: categories ───────────────────────────
# Each category is a page of its own on the storefront: picture, slogan,
# "как это работает" text and the two shops its prices are compared with.
_CATEGORY_COLS = {'name', 'description', 'hero_image', 'slogan', 'intro',
                  'compare_label_1', 'compare_label_2', 'sort_order', 'accent_color'}


@bp.route("/api/admin/categories", methods=["POST"])
def api_add_category():
    d = request.json or {}
    try:
        with get_db() as cur:
            row = safe_insert(cur, 'coop_categories', _CATEGORY_COLS, {"name": "", "description": "", **d})
            result = _row_to_dict(row)
        return jsonify(result)
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/categories/<int:cid>", methods=["PATCH"])
def api_update_category(cid):
    d = request.json or {}
    try:
        with get_db() as cur:
            row = safe_update(cur, 'coop_categories', _CATEGORY_COLS, d, 'id', cid)
            result = _row_to_dict(row)
        return jsonify(result)
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/categories/<int:cid>", methods=["DELETE"])
def api_delete_category(cid):
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_categories WHERE id = %s", (cid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── CRUD: subcategories ────────────────────────
@bp.route("/api/admin/subcategories", methods=["POST"])
def api_add_subcategory():
    d = request.json or {}
    try:
        with get_db() as cur:
            cur.execute("INSERT INTO coop_subcategories (name, category_id) VALUES (%s, %s) RETURNING *",
                        (d.get("name"), d.get("category_id")))
            result = _row_to_dict(cur.fetchone())
        return jsonify(result)
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/subcategories/<int:sid>", methods=["PATCH"])
def api_update_subcategory(sid):
    d = request.json or {}
    _COLS = {'name', 'category_id', 'description'}
    try:
        with get_db() as cur:
            row = safe_update(cur, 'coop_subcategories', _COLS, d, 'id', sid)
            result = _row_to_dict(row)
        return jsonify(result)
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/subcategories/<int:sid>", methods=["DELETE"])
def api_delete_subcategory(sid):
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_subcategories WHERE id = %s", (sid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── CRUD: products ─────────────────────────────
_PRODUCT_COLS = {'name','price','description','category_id','subcategory_id','supplier_id',
                 'badge','image_url','is_available','product_type','box_size',
                 'counter_reset_at','requires_subscription','is_adult',
                 'pack_quantity','pack_weight_kg','requires_variant','promo_price',
                 'compare_price_1','compare_price_2'}

# Empty price fields mean "no such price", not zero.
_OPTIONAL_PRICES = ('promo_price', 'compare_price_1', 'compare_price_2')


def _ensure_products_requires_variant(cur):
    """Idempotent migration: separate product-type flag for 'variant-specification'
    products (e.g. 'парфюм — укажите, какой именно'). Not a badge."""
    try:
        cur.execute(
            "DO $$ BEGIN ALTER TABLE coop_products ADD COLUMN requires_variant BOOLEAN DEFAULT FALSE; "
            "EXCEPTION WHEN duplicate_column THEN NULL; END $$;"
        )
    except Exception:
        pass


@bp.route("/api/admin/products", methods=["POST"])
def api_add_product():
    d = request.json or {}
    for k in _OPTIONAL_PRICES:
        if k in d and d[k] in ('', 0, '0'):
            d[k] = None
    try:
        with get_db() as cur:
            _ensure_products_requires_variant(cur)
            row = safe_insert(cur, 'coop_products', _PRODUCT_COLS, d)
            result = _row_to_dict(row)
        return jsonify(result)
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/products/<int:pid>", methods=["PATCH"])
def api_update_product(pid):
    d = request.json or {}
    for k in _OPTIONAL_PRICES:
        if k in d and d[k] in ('', 0, '0'):
            d[k] = None
    try:
        with get_db() as cur:
            _ensure_products_requires_variant(cur)
            if 'is_available' in d and not d['is_available']:
                cur.execute("SELECT product_type, box_size, counter_reset_at FROM coop_products WHERE id = %s", (pid,))
                row = cur.fetchone()
                if row and row.get('product_type') == 'box' and row.get('box_size'):
                    box_size = row['box_size']
                    reset_at = row.get('counter_reset_at')
                    cur.execute("SELECT items, created_at FROM coop_orders WHERE status IN ('new', 'collecting')")
                    orders = cur.fetchall()
                    current_count = 0
                    for o in (orders or []):
                        try:
                            items_data = o.get("items", [])
                            if isinstance(items_data, str):
                                items_data = json.loads(items_data)
                            order_time = o.get("created_at")
                            for it in items_data:
                                if it.get("id") == pid:
                                    if reset_at and order_time and order_time < reset_at:
                                        continue
                                    current_count += it.get("qty", 1)
                        except:
                            pass
                    current_in_box = current_count % box_size
                    threshold = box_size * 0.8
                    if current_in_box > 0 and current_in_box < threshold:
                        _cancel_box_orders(cur, pid, reset_at)
                        print(f"📦 Box product #{pid}: {current_in_box}/{box_size} (<80%) — cancelled unfilled orders")
                    elif current_in_box >= threshold:
                        print(f"📦 Box product #{pid}: {current_in_box}/{box_size} (>=80%) — auto-completed")
                    d['counter_reset_at'] = time.strftime('%Y-%m-%dT%H:%M:%S')
            row = safe_update(cur, 'coop_products', _PRODUCT_COLS, d, 'id', pid)
            if not row:
                cur.execute("SELECT * FROM coop_products WHERE id = %s", (pid,))
                row = cur.fetchone()
            result = _row_to_dict(row)
        return jsonify(result)
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


def _cancel_box_orders(cur, product_id: int, reset_at):
    """Cancel orders that contain an unfilled box product (< 80% threshold)."""
    cur.execute("SELECT id, items, user_id, total FROM coop_orders WHERE status IN ('new', 'collecting')")
    orders = cur.fetchall()
    for o in (orders or []):
        try:
            items_data = o.get("items", [])
            if isinstance(items_data, str):
                items_data = json.loads(items_data)
            order_time = o.get("created_at")
            has_product = False
            for it in items_data:
                if it.get("id") == product_id:
                    if reset_at and order_time and order_time < reset_at:
                        continue
                    has_product = True
                    break
            if has_product:
                cur.execute("UPDATE coop_orders SET status = 'cancelled' WHERE id = %s", (o['id'],))
                uid = o.get('user_id')
                if uid:
                    cur.execute("SELECT full_name, email FROM coop_users WHERE id = %s LIMIT 1", (uid,))
                    u = cur.fetchone()
                    if u and u.get("email"):
                        email_order_status_change(
                            u["full_name"], u["email"], o['id'],
                            float(o.get("total", 0)), "cancelled"
                        )
                print(f"  ❌ Cancelled order #{o['id']} (box not filled)")
        except Exception as e:
            print(f"  ⚠️ Error processing order #{o.get('id')}: {e}")


@bp.route("/api/admin/products/<int:pid>", methods=["DELETE"])
def api_delete_product(pid):
    try:
        with get_db() as cur:
            cur.execute("SELECT image_url FROM coop_products WHERE id = %s", (pid,))
            prod = cur.fetchone()
            urls_to_delete = []
            if prod and prod.get("image_url"):
                urls_to_delete.append(prod["image_url"])
            cur.execute("SELECT url FROM coop_product_images WHERE product_id = %s", (pid,))
            for row in (cur.fetchall() or []):
                if row.get("url"):
                    urls_to_delete.append(row["url"])
            cur.execute("DELETE FROM coop_products WHERE id = %s", (pid,))
        for url in urls_to_delete:
            if url and url.startswith("/uploads/"):
                fpath = os.path.join(UPLOAD_DIR, url.replace("/uploads/", ""))
                if os.path.exists(fpath):
                    try:
                        os.remove(fpath)
                    except:
                        pass
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── CRUD: product images ──────────────────────
@bp.route("/api/admin/products/<int:pid>/images")
def api_get_product_images(pid):
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_product_images WHERE product_id = %s ORDER BY sort_order ASC, id ASC", (pid,))
            return jsonify(_rows_to_list(cur.fetchall()))
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/products/<int:pid>/images", methods=["POST"])
def api_add_product_image(pid):
    try:
        d = request.json or {}
        url = d.get("url", "")
        is_main = d.get("is_main", False)
        if not url:
            return jsonify({"error": "URL required"}), 400
        with get_db() as cur:
            cur.execute("SELECT COUNT(*) as cnt FROM coop_product_images WHERE product_id = %s", (pid,))
            cnt = cur.fetchone()["cnt"]
            if cnt >= 7:
                return jsonify({"error": "Максимум 7 фото на товар"}), 400
            if is_main:
                cur.execute("UPDATE coop_product_images SET is_main = FALSE WHERE product_id = %s", (pid,))
            cur.execute(
                "INSERT INTO coop_product_images (product_id, url, is_main, sort_order) VALUES (%s, %s, %s, %s) RETURNING *",
                (pid, url, is_main, cnt)
            )
            img = _row_to_dict(cur.fetchone())
            if is_main:
                cur.execute("UPDATE coop_products SET image_url = %s WHERE id = %s", (url, pid))
        return jsonify(img)
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/product-images/<int:img_id>/set-main", methods=["POST"])
def api_set_main_image(img_id):
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_product_images WHERE id = %s", (img_id,))
            img = cur.fetchone()
            if not img:
                return jsonify({"error": "Image not found"}), 404
            pid = img["product_id"]
            cur.execute("UPDATE coop_product_images SET is_main = FALSE WHERE product_id = %s", (pid,))
            cur.execute("UPDATE coop_product_images SET is_main = TRUE WHERE id = %s", (img_id,))
            cur.execute("UPDATE coop_products SET image_url = %s WHERE id = %s", (img["url"], pid))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/product-images/<int:img_id>", methods=["DELETE"])
def api_delete_product_image(img_id):
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_product_images WHERE id = %s", (img_id,))
            img = cur.fetchone()
            if not img:
                return jsonify({"error": "Not found"}), 404
            url = img.get("url", "")
            was_main = img.get("is_main", False)
            pid = img["product_id"]
            cur.execute("DELETE FROM coop_product_images WHERE id = %s", (img_id,))
            if was_main:
                cur.execute("SELECT * FROM coop_product_images WHERE product_id = %s ORDER BY sort_order ASC, id ASC LIMIT 1", (pid,))
                nxt = cur.fetchone()
                if nxt:
                    cur.execute("UPDATE coop_product_images SET is_main = TRUE WHERE id = %s", (nxt["id"],))
                    cur.execute("UPDATE coop_products SET image_url = %s WHERE id = %s", (nxt["url"], pid))
                else:
                    cur.execute("UPDATE coop_products SET image_url = NULL WHERE id = %s", (pid,))
        if url and url.startswith("/uploads/"):
            fpath = os.path.join(UPLOAD_DIR, url.replace("/uploads/", ""))
            if os.path.exists(fpath):
                try:
                    os.remove(fpath)
                except:
                    pass
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── CRUD: orders ───────────────────────────────
@bp.route("/api/admin/orders")
def api_get_orders():
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_orders ORDER BY created_at DESC")
            orders = _rows_to_list(cur.fetchall())
        return jsonify(orders)
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/orders/<int:oid>", methods=["PATCH"])
def api_update_order(oid):
    d = request.json or {}
    new_status = d.get("status")
    payment_template_id = d.pop("payment_template_id", None)
    try:
        with get_db() as cur:
            old_status = None
            if new_status:
                cur.execute("SELECT status, user_id FROM coop_orders WHERE id = %s LIMIT 1", (oid,))
                old_row = cur.fetchone()
                if old_row:
                    old_status = old_row.get("status")
            _ORDER_COLS = {'status', 'comment', 'items', 'total', 'full_name', 'phone', 'address'}
            row = safe_update(cur, 'coop_orders', _ORDER_COLS, d, 'id', oid)
            result = _row_to_dict(row)
            if new_status and old_status and new_status != old_status and result:
                uid = result.get("user_id")
                # Load payment template for "ready" orders (requisites sent at ready stage)
                payment_info = None
                if new_status == "ready" and payment_template_id:
                    cur.execute("SELECT * FROM coop_payment_templates WHERE id = %s LIMIT 1", (payment_template_id,))
                    tpl_row = cur.fetchone()
                    if tpl_row:
                        payment_info = _row_to_dict(tpl_row)
                elif new_status == "ready":
                    # Use default template if none specified
                    cur.execute("SELECT * FROM coop_payment_templates WHERE is_default = TRUE LIMIT 1")
                    tpl_row = cur.fetchone()
                    if tpl_row:
                        payment_info = _row_to_dict(tpl_row)
                if uid:
                    cur.execute("SELECT full_name, email FROM coop_users WHERE id = %s LIMIT 1", (uid,))
                    u = cur.fetchone()
                    if u and u.get("email"):
                        email_order_status_change(
                            u["full_name"], u["email"], oid,
                            float(result.get("total", 0)), new_status,
                            payment_info=payment_info
                        )
                # Deactivate subscriptions when order moves AWAY from done
                if old_status == "done" and new_status != "done" and uid:
                    _deactivate_order_subscriptions(cur, oid, uid)
                # Activate subscriptions when order is done
                if new_status == "done" and uid:
                    _activate_order_subscriptions(cur, oid, uid)
                    # Check referral milestone (5 referred buyers → reward promo)
                    try:
                        from ..routes.public import _check_referral_milestone
                        _check_referral_milestone(cur, uid)
                    except Exception:
                        pass
        return jsonify(result)
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/orders/<int:oid>", methods=["DELETE"])
def api_delete_order(oid):
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_orders WHERE id = %s", (oid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── CRUD: suppliers ────────────────────────────
_SUPPLIER_COLS = {'name', 'delivery_day', 'delivery_note', 'assembly_date', 'contact_phone', 'contact_telegram'}

@bp.route("/api/admin/suppliers", methods=["POST"])
def api_add_supplier():
    d = request.json or {}
    try:
        with get_db() as cur:
            row = safe_insert(cur, 'coop_suppliers', _SUPPLIER_COLS, d)
            result = _row_to_dict(row)
        return jsonify(result)
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/suppliers/<int:sid>", methods=["PATCH"])
def api_update_supplier(sid):
    d = request.json or {}
    _COLS = {'name', 'delivery_day', 'delivery_note', 'assembly_date', 'contact_phone', 'contact_telegram'}
    try:
        with get_db() as cur:
            row = safe_update(cur, 'coop_suppliers', _COLS, d, 'id', sid)
            result = _row_to_dict(row)
        return jsonify(result)
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/suppliers/<int:sid>", methods=["DELETE"])
def api_delete_supplier(sid):
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_suppliers WHERE id = %s", (sid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── CRUD: music ────────────────────────────────
_MUSIC_COLS = {'title', 'artist', 'url', 'sort_order', 'duration'}

@bp.route("/api/admin/music", methods=["POST"])
def api_add_music():
    d = request.json or {}
    try:
        with get_db() as cur:
            row = safe_insert(cur, 'coop_music', _MUSIC_COLS, d)
            result = _row_to_dict(row)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": "Ошибка добавления трека"}), 500


@bp.route("/api/admin/music/<int:mid>", methods=["DELETE"])
def api_delete_music(mid):
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_music WHERE id = %s", (mid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── CRUD: admins ───────────────────────────────
@bp.route("/api/admin/admins", methods=["POST"])
def api_add_admin():
    d = request.json or {}
    try:
        pw = d.get("password", "")
        pw_hashed = hash_password(pw) if pw else ""
        with get_db() as cur:
            cur.execute("INSERT INTO coop_admins (username, display_name, password) VALUES (%s, %s, %s) RETURNING *",
                        (d.get("username", ""), d.get("display_name", ""), pw_hashed))
            result = _row_to_dict(cur.fetchone())
        return jsonify(result)
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/admins/<int:aid>", methods=["DELETE"])
def api_delete_admin(aid):
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_admins WHERE id = %s", (aid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── CRUD: users ────────────────────────────────
def _ensure_user_notes_schema(cur):
    """Idempotently add admin-only private note column on coop_users."""
    try:
        cur.execute(
            "DO $$ BEGIN ALTER TABLE coop_users ADD COLUMN admin_note TEXT DEFAULT ''; "
            "EXCEPTION WHEN duplicate_column THEN NULL; END $$;"
        )
    except Exception:
        pass


@bp.route("/api/admin/users")
def api_get_users():
    try:
        with get_db() as cur:
            _ensure_user_notes_schema(cur)
            cur.execute("SELECT * FROM coop_users ORDER BY created_at DESC")
            users = _rows_to_list(cur.fetchall())
            for u in users:
                u.pop("password", None)
        return jsonify(users)
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/users/<int:uid>/admin-note", methods=["PATCH"])
def api_update_admin_note(uid):
    """Admin-only private note. Feature is VIP-only: updates are rejected
    for non-VIP users so the note cannot exist outside the VIP section."""
    d = request.json or {}
    note = (d.get("admin_note") or "").strip()
    try:
        with get_db() as cur:
            _ensure_user_notes_schema(cur)
            cur.execute("SELECT is_vip FROM coop_users WHERE id = %s", (uid,))
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "Пользователь не найден"}), 404
            is_vip = row[0] if not isinstance(row, dict) else row.get("is_vip")
            if not is_vip:
                return jsonify({"error": "Заметки доступны только для VIP-пользователей"}), 403
            cur.execute(
                "UPDATE coop_users SET admin_note = %s WHERE id = %s RETURNING *",
                (note, uid)
            )
            user = _row_to_dict(cur.fetchone())
            if user:
                user.pop("password", None)
        return jsonify({"user": user})
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/users/<int:uid>", methods=["DELETE"])
def api_delete_user(uid):
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_users WHERE id = %s", (uid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/users/<int:uid>/approve", methods=["PATCH"])
def api_approve_user(uid):
    try:
        with get_db() as cur:
            cur.execute("UPDATE coop_users SET is_approved = TRUE, is_blocked = FALSE WHERE id = %s", (uid,))
            cur.execute("SELECT full_name, email FROM coop_users WHERE id = %s LIMIT 1", (uid,))
            u = cur.fetchone()
        if u and u.get("email"):
            email_user_approved(u["full_name"], u["email"])
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/users/<int:uid>/block", methods=["PATCH"])
def api_block_user(uid):
    try:
        with get_db() as cur:
            cur.execute("UPDATE coop_users SET is_blocked = TRUE, is_approved = FALSE WHERE id = %s", (uid,))
            cur.execute("SELECT full_name, email FROM coop_users WHERE id = %s LIMIT 1", (uid,))
            u = cur.fetchone()
        # Cut the block through to any live session in this worker at once.
        invalidate_user_tokens(uid)
        if u and u.get("email"):
            email_user_blocked(u["full_name"], u["email"])
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/users/<int:uid>/unblock", methods=["PATCH"])
def api_unblock_user(uid):
    try:
        with get_db() as cur:
            cur.execute("UPDATE coop_users SET is_blocked = FALSE WHERE id = %s", (uid,))
        invalidate_user_tokens(uid)
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/users/pending-count")
def api_pending_count():
    try:
        with get_db() as cur:
            cur.execute("SELECT COUNT(*) AS cnt FROM coop_users WHERE is_approved = FALSE AND (is_blocked IS NULL OR is_blocked = FALSE)")
            row = cur.fetchone()
        return jsonify({"count": row["cnt"] if row else 0})
    except:
        return jsonify({"count": 0})


@bp.route("/api/admin/users/create-vip", methods=["POST"])
def api_admin_create_vip_user():
    """Admin-only: create a fully-provisioned VIP account.

    The admin vouches for the user so we skip the usual approval / email-verification
    steps: the created user can log in immediately with email+password and already
    has VIP access. Phone is optional and gets collected at first order if empty.
    """
    d = request.json or {}
    full_name = sanitize_string(d.get("full_name") or "", 200)
    email = sanitize_string(d.get("email") or "", 255).lower().strip()
    password = (d.get("password") or "").strip()
    phone = sanitize_string(d.get("phone") or "", 30)
    address = sanitize_string(d.get("address") or "", 500)
    telegram_username = sanitize_string(d.get("telegram_username") or "", 100)
    if not full_name or not email or not password:
        return jsonify({"error": "Укажите имя, email и пароль"}), 400
    if len(password) < 6:
        return jsonify({"error": "Пароль минимум 6 символов"}), 400
    try:
        with get_db() as cur:
            # Uniqueness checks
            cur.execute("SELECT id FROM coop_users WHERE LOWER(email) = %s LIMIT 1", (email,))
            if cur.fetchone():
                return jsonify({"error": "Пользователь с таким email уже существует"}), 409
            if phone:
                cur.execute("SELECT id FROM coop_users WHERE phone = %s LIMIT 1", (phone,))
                if cur.fetchone():
                    return jsonify({"error": "Пользователь с таким номером уже существует"}), 409
            # Make sure the v9/v10 columns & constraints are in the shape we need.
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE coop_users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
                DO $$ BEGIN
                    ALTER TABLE coop_users ADD COLUMN is_vip BOOLEAN DEFAULT FALSE;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
                -- v10: phone is optional. Same migration as api_register.
                DO $$ BEGIN
                    ALTER TABLE coop_users ALTER COLUMN phone DROP NOT NULL;
                EXCEPTION WHEN others THEN NULL;
                END $$;
                DO $$ BEGIN
                    ALTER TABLE coop_users DROP CONSTRAINT coop_users_phone_key;
                EXCEPTION WHEN undefined_object THEN NULL;
                END $$;
                CREATE UNIQUE INDEX IF NOT EXISTS idx_coop_users_phone_unique
                    ON coop_users(phone)
                    WHERE phone IS NOT NULL AND phone <> '';
            """)
            phone_for_db = phone if phone else None
            cur.execute(
                """INSERT INTO coop_users
                     (full_name, phone, address, password, telegram_username, email,
                      is_approved, email_verified, is_vip, is_blocked)
                   VALUES (%s, %s, %s, %s, %s, %s, TRUE, TRUE, TRUE, FALSE)
                   RETURNING *""",
                (full_name, phone_for_db, address, hash_password(password), telegram_username, email)
            )
            user = _row_to_dict(cur.fetchone())
            if user:
                user.pop("password", None)
        return jsonify({"user": user})
    except Exception as e:
        print(f"⚠️ Admin VIP create error: {e}")
        return jsonify({"error": "Ошибка создания VIP аккаунта"}), 500


# ── Reviews ────────────────────────────────────
@bp.route("/api/admin/reviews/<int:rid>", methods=["DELETE"])
def api_delete_review(rid):
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_reviews WHERE id = %s", (rid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/reviews/<int:rid>", methods=["PATCH"])
def api_update_review_category(rid):
    """Which category page shows the review. Empty means none of them."""
    raw = (request.json or {}).get("category_id")
    try:
        cid = int(raw) if raw not in (None, "", 0, "0") else None
    except (TypeError, ValueError):
        return jsonify({"error": "Некорректная категория"}), 400
    try:
        with get_db() as cur:
            cur.execute("UPDATE coop_reviews SET category_id = %s WHERE id = %s RETURNING *", (cid, rid))
            row = cur.fetchone()
        if not row:
            return jsonify({"error": "Отзыв не найден"}), 404
        return jsonify(_row_to_dict(row))
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── Subscriptions ──────────────────────────────
@bp.route("/api/admin/subscriptions")
def api_admin_subscriptions():
    try:
        vip = request.args.get("vip")
        with get_db() as cur:
            if vip == "1":
                cur.execute("SELECT * FROM coop_subscriptions WHERE is_vip = TRUE ORDER BY id ASC")
            else:
                cur.execute("SELECT * FROM coop_subscriptions WHERE is_vip = FALSE OR is_vip IS NULL ORDER BY id ASC")
            subs = _rows_to_list(cur.fetchall())
        return jsonify(subs or [])
    except:
        return jsonify([])


@bp.route("/api/admin/subscriptions", methods=["POST"])
def api_admin_add_subscription():
    d = request.json or {}
    try:
        with get_db() as cur:
            cur.execute(
                """INSERT INTO coop_subscriptions (category_id, name, price, duration_days, description, image_url, is_vip)
                   VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING *""",
                (d.get("category_id"), d.get("name", ""), d.get("price", 0),
                 d.get("duration_days", 30), d.get("description", ""), d.get("image_url"), d.get("is_vip", False))
            )
            result = _row_to_dict(cur.fetchone())
        return jsonify(result)
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/subscriptions/<int:sid>", methods=["PATCH"])
def api_admin_update_subscription(sid):
    d = request.json or {}
    _COLS = {'name', 'price', 'duration_days', 'description', 'image_url', 'category_id', 'is_vip', 'is_active'}
    try:
        with get_db() as cur:
            row = safe_update(cur, 'coop_subscriptions', _COLS, d, 'id', sid)
            result = _row_to_dict(row)
        return jsonify(result)
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/subscriptions/<int:sid>", methods=["DELETE"])
def api_admin_delete_subscription(sid):
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_subscriptions WHERE id = %s", (sid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/subscription-orders")
def api_admin_subscription_orders():
    try:
        with get_db() as cur:
            cur.execute(
                """SELECT o.*, u.full_name as user_name
                   FROM coop_orders o
                   LEFT JOIN coop_users u ON u.id = o.user_id
                   WHERE o.items::text LIKE '%%subscription%%'
                   ORDER BY o.created_at DESC"""
            )
            orders = _rows_to_list(cur.fetchall())
        return jsonify(orders or [])
    except:
        return jsonify([])


@bp.route("/api/admin/subscription-history")
def api_admin_subscription_history():
    """List all user subscriptions (active and expired) from coop_user_subscriptions."""
    try:
        with get_db() as cur:
            cur.execute(
                """SELECT us.id, us.user_id, us.subscription_id, us.purchased_at, us.expires_at, us.is_active,
                          u.full_name as user_name, u.phone as user_phone, u.email as user_email,
                          s.name as subscription_name, s.duration_days, s.price as subscription_price
                   FROM coop_user_subscriptions us
                   LEFT JOIN coop_users u ON u.id = us.user_id
                   LEFT JOIN coop_subscriptions s ON s.id = us.subscription_id
                   ORDER BY us.purchased_at DESC"""
            )
            rows = _rows_to_list(cur.fetchall())
        return jsonify(rows or [])
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── File upload (with malware validation) ─────
@bp.route("/api/admin/upload", methods=["POST"])
def api_upload():
    if "file" not in request.files:
        return jsonify({"error": "No file"}), 400
    f = request.files["file"]
    # Validate file (extension, magic bytes, SVG script check)
    is_valid, err_msg = validate_upload(f)
    if not is_valid:
        return jsonify({"error": err_msg}), 400
    ext = f.filename.rsplit(".", 1)[-1].lower() if "." in f.filename else "bin"
    prefix = sanitize_string(request.form.get("prefix", "file"), 50)
    prefix = prefix.replace('/', '_').replace('\\', '_').replace('..', '_')
    old_url = request.form.get("old_url", "")
    filename = f"{prefix}_{int(time.time() * 1000)}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    f.save(filepath)
    public_url = f"/uploads/{filename}"
    if old_url and old_url.startswith("/uploads/") and '..' not in old_url:
        old_path = os.path.join(UPLOAD_DIR, os.path.basename(old_url.replace("/uploads/", "")))
        if os.path.exists(old_path):
            try:
                os.remove(old_path)
            except:
                pass
    return jsonify({"url": public_url})


# ── Forum moderation ──────────────────────────
_REQUIRED_FORUMS = [
    ("general", "Общий форум", "Общий форум для всех участников кооператива"),
    ("social", "Социальный форум", "Обсуждения, новости, свободные темы"),
    ("vip_general", "VIP Общий", "Общий форум для VIP участников"),
    ("vip_social", "VIP Социальный", "VIP обсуждения и новости"),
    ("vip_local", "VIP Локальный", "VIP локальные темы и предложения"),
]

@bp.route("/api/admin/forums")
def api_admin_forums():
    try:
        with get_db() as cur:
            # Auto-create required forums if missing
            for key, name, desc in _REQUIRED_FORUMS:
                cur.execute("SELECT id FROM coop_forums WHERE address_key = %s LIMIT 1", (key,))
                if not cur.fetchone():
                    cur.execute(
                        "INSERT INTO coop_forums (name, address_key, description) VALUES (%s, %s, %s)",
                        (name, key, desc)
                    )
            cur.execute("SELECT * FROM coop_forums ORDER BY id ASC")
            forums = _rows_to_list(cur.fetchall())
            for f in forums:
                cur.execute("SELECT COUNT(*) as cnt FROM coop_forum_posts WHERE forum_id = %s", (f['id'],))
                r = cur.fetchone()
                f['post_count'] = r['cnt'] if r else 0
        return jsonify(forums or [])
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/forums/<int:fid>/posts")
def api_admin_forum_posts(fid):
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_forum_posts WHERE forum_id = %s ORDER BY created_at DESC LIMIT 200", (fid,))
            posts = _rows_to_list(cur.fetchall())
        return jsonify(posts or [])
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/forums/posts/<int:pid>", methods=["DELETE"])
def api_admin_delete_forum_post(pid):
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_forum_posts WHERE id = %s", (pid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/forums/<int:fid>", methods=["DELETE"])
def api_admin_delete_forum(fid):
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_forums WHERE id = %s", (fid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── Payment Templates ─────────────────────────
@bp.route("/api/admin/payment-templates")
def api_admin_payment_templates():
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_payment_templates ORDER BY is_default DESC, id ASC")
            return jsonify(_rows_to_list(cur.fetchall()) or [])
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/payment-templates", methods=["POST"])
def api_admin_create_payment_template():
    d = request.json or {}
    name = (d.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Укажите название шаблона"}), 400
    try:
        with get_db() as cur:
            cur.execute(
                """INSERT INTO coop_payment_templates
                   (name, bank_name, recipient_name, card_number, phone_number, account_number, bik, inn, extra_info, is_default)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
                (name, d.get("bank_name",""), d.get("recipient_name",""), d.get("card_number",""),
                 d.get("phone_number",""), d.get("account_number",""), d.get("bik",""), d.get("inn",""),
                 d.get("extra_info",""), d.get("is_default", False))
            )
            tpl = _row_to_dict(cur.fetchone())
            if tpl.get("is_default"):
                cur.execute("UPDATE coop_payment_templates SET is_default = FALSE WHERE id != %s", (tpl["id"],))
        return jsonify(tpl)
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/payment-templates/<int:tid>", methods=["PATCH"])
def api_admin_update_payment_template(tid):
    d = request.json or {}
    try:
        with get_db() as cur:
            allowed = {"name","bank_name","recipient_name","card_number","phone_number","account_number","bik","inn","extra_info","is_default"}
            updates = {k: v for k, v in d.items() if k in allowed}
            if not updates:
                return jsonify({"error": "nothing to update"}), 400
            result = safe_update(cur, "coop_payment_templates", allowed, updates, "id", tid)
            tpl = _row_to_dict(result) if result else None
            if tpl and tpl.get("is_default"):
                cur.execute("UPDATE coop_payment_templates SET is_default = FALSE WHERE id != %s", (tpl["id"],))
        return jsonify(tpl)
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/payment-templates/<int:tid>", methods=["DELETE"])
def api_admin_delete_payment_template(tid):
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_payment_templates WHERE id = %s", (tid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── Promo Codes ───────────────────────────────
@bp.route("/api/admin/promo-codes")
def api_admin_promo_codes():
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_promo_codes ORDER BY created_at DESC")
            codes = _rows_to_list(cur.fetchall())
        return jsonify(codes or [])
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/promo-codes", methods=["POST"])
def api_admin_create_promo_code():
    d = request.json or {}
    code = (d.get("code") or "").strip().upper()
    discount_amount = d.get("discount_amount", 0)
    max_activations = d.get("max_activations")  # None = unlimited
    expires_at = d.get("expires_at")  # ISO string or None
    if not code:
        return jsonify({"error": "Укажите код промокода"}), 400
    if not discount_amount or float(discount_amount) <= 0:
        return jsonify({"error": "Укажите сумму скидки"}), 400
    try:
        with get_db() as cur:
            cur.execute("SELECT id FROM coop_promo_codes WHERE code = %s LIMIT 1", (code,))
            if cur.fetchone():
                return jsonify({"error": "Промокод с таким кодом уже существует"}), 409
            min_order_amount = d.get("min_order_amount", 0)
            is_vip = bool(d.get("is_vip", False))
            cur.execute("""
                DO $$ BEGIN ALTER TABLE coop_promo_codes ADD COLUMN min_order_amount NUMERIC(12,2) DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
                DO $$ BEGIN ALTER TABLE coop_promo_codes ADD COLUMN is_vip BOOLEAN DEFAULT FALSE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
            """)
            cur.execute(
                """INSERT INTO coop_promo_codes (code, discount_amount, max_activations, expires_at, min_order_amount, is_vip)
                   VALUES (%s, %s, %s, %s, %s, %s) RETURNING *""",
                (code, float(discount_amount),
                 int(max_activations) if max_activations is not None and str(max_activations).strip() != '' else None,
                 expires_at or None, float(min_order_amount or 0), is_vip)
            )
            result = _row_to_dict(cur.fetchone())
        return jsonify(result)
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/promo-codes/<int:pid>", methods=["PATCH"])
def api_admin_update_promo_code(pid):
    d = request.json or {}
    allowed = {"code", "discount_amount", "max_activations", "expires_at", "is_active", "min_order_amount", "is_vip"}
    updates = {k: v for k, v in d.items() if k in allowed}
    if not updates:
        return jsonify({"error": "nothing to update"}), 400
    if "code" in updates:
        updates["code"] = sanitize_string((updates["code"] or ""), 50).upper()
    if "max_activations" in updates:
        val = updates["max_activations"]
        updates["max_activations"] = int(val) if val is not None and str(val).strip() != '' else None
    try:
        with get_db() as cur:
            result = safe_update(cur, "coop_promo_codes", allowed, updates, "id", pid)
        return jsonify(_row_to_dict(result) if result else {"error": "not found"})
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/promo-codes/<int:pid>", methods=["DELETE"])
def api_admin_delete_promo_code(pid):
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_promo_codes WHERE id = %s", (pid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/promo-codes/<int:pid>/usages")
def api_admin_promo_usages(pid):
    try:
        with get_db() as cur:
            cur.execute(
                """SELECT pu.*, u.full_name as user_name, u.phone as user_phone
                   FROM coop_promo_usages pu
                   LEFT JOIN coop_users u ON u.id = pu.user_id
                   WHERE pu.promo_id = %s ORDER BY pu.used_at DESC""",
                (pid,)
            )
            usages = _rows_to_list(cur.fetchall())
        return jsonify(usages or [])
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── Referral Settings ─────────────────────────
@bp.route("/api/admin/referral-stats")
def api_admin_referral_stats():
    try:
        with get_db() as cur:
            cur.execute(
                """SELECT u.id, u.full_name, u.referral_code,
                          (SELECT COUNT(*) FROM coop_users r WHERE r.referred_by = u.id) as referral_count,
                          (SELECT COUNT(*) FROM coop_referral_rewards rr WHERE rr.referrer_id = u.id AND rr.is_claimed = TRUE) as rewards_claimed
                   FROM coop_users u
                   WHERE u.referral_code IS NOT NULL
                   ORDER BY referral_count DESC"""
            )
            stats = _rows_to_list(cur.fetchall())
        return jsonify(stats or [])
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500
# ══════════════════════════════════════════════════
# QUICK ORDER CODES (admin CRUD)
# ══════════════════════════════════════════════════

def _ensure_quick_order_tables(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS coop_quick_order_codes (
            id SERIAL PRIMARY KEY,
            code VARCHAR(50) UNIQUE NOT NULL,
            label VARCHAR(255) DEFAULT '',
            is_active BOOLEAN DEFAULT TRUE,
            max_uses INTEGER DEFAULT NULL,
            current_uses INTEGER DEFAULT 0,
            expires_at TIMESTAMPTZ DEFAULT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS coop_quick_orders (
            id SERIAL PRIMARY KEY,
            quick_code VARCHAR(50) NOT NULL,
            guest_name VARCHAR(255) NOT NULL,
            contact_type VARCHAR(20) NOT NULL,
            contact_value VARCHAR(255) NOT NULL,
            items JSONB NOT NULL DEFAULT '[]',
            total NUMERIC(12,2) NOT NULL DEFAULT 0,
            status VARCHAR(30) DEFAULT 'new',
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)


@bp.route("/api/admin/quick-codes")
def api_admin_quick_codes_list():
    try:
        with get_db() as cur:
            _ensure_quick_order_tables(cur)
            cur.execute("SELECT * FROM coop_quick_order_codes ORDER BY created_at DESC")
            codes = _rows_to_list(cur.fetchall())
        return jsonify(codes or [])
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/quick-codes", methods=["POST"])
def api_admin_quick_codes_create():
    d = request.json or {}
    code = sanitize_string((d.get("code") or ""), 50).upper()
    label = sanitize_string(d.get("label") or "", 255)
    max_uses = d.get("max_uses")
    expires_at = d.get("expires_at")
    if not code:
        return jsonify({"error": "Укажите код"}), 400
    try:
        with get_db() as cur:
            _ensure_quick_order_tables(cur)
            cur.execute("SELECT id FROM coop_quick_order_codes WHERE code = %s LIMIT 1", (code,))
            if cur.fetchone():
                return jsonify({"error": "Код уже существует"}), 409
            cur.execute(
                """INSERT INTO coop_quick_order_codes (code, label, max_uses, expires_at)
                   VALUES (%s, %s, %s, %s) RETURNING *""",
                (code, label,
                 int(max_uses) if max_uses is not None and str(max_uses).strip() != '' else None,
                 expires_at or None)
            )
            result = _row_to_dict(cur.fetchone())
        return jsonify(result)
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/quick-codes/<int:cid>", methods=["PATCH"])
def api_admin_quick_codes_update(cid):
    d = request.json or {}
    allowed = {"code", "label", "is_active", "max_uses", "expires_at"}
    updates = {k: v for k, v in d.items() if k in allowed}
    if not updates:
        return jsonify({"error": "nothing to update"}), 400
    if "code" in updates:
        updates["code"] = sanitize_string((updates["code"] or ""), 50).upper()
    if "max_uses" in updates:
        val = updates["max_uses"]
        updates["max_uses"] = int(val) if val is not None and str(val).strip() != '' else None
    try:
        with get_db() as cur:
            _ensure_quick_order_tables(cur)
            result = safe_update(cur, "coop_quick_order_codes", allowed, updates, "id", cid)
        return jsonify(_row_to_dict(result) if result else {"error": "not found"})
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/quick-codes/<int:cid>", methods=["DELETE"])
def api_admin_quick_codes_delete(cid):
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_quick_order_codes WHERE id = %s", (cid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/quick-orders")
def api_admin_quick_orders_list():
    try:
        with get_db() as cur:
            _ensure_quick_order_tables(cur)
            cur.execute("SELECT * FROM coop_quick_orders ORDER BY created_at DESC")
            orders = _rows_to_list(cur.fetchall())
        return jsonify(orders or [])
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/quick-orders/<int:oid>", methods=["DELETE"])
def api_admin_quick_orders_delete(oid):
    try:
        with get_db() as cur:
            _ensure_quick_order_tables(cur)
            cur.execute("DELETE FROM coop_quick_orders WHERE id = %s", (oid,))
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": "Ошибка удаления заказа"}), 500


_QUICK_ORDER_STATUSES = {"new", "processing", "done", "cancelled"}

@bp.route("/api/admin/quick-orders/<int:oid>", methods=["PATCH"])
def api_admin_quick_orders_update(oid):
    d = request.json or {}
    allowed = {"status"}
    updates = {k: v for k, v in d.items() if k in allowed}
    if not updates:
        return jsonify({"error": "nothing to update"}), 400
    if "status" in updates and updates["status"] not in _QUICK_ORDER_STATUSES:
        return jsonify({"error": "Недопустимый статус"}), 400
    try:
        with get_db() as cur:
            _ensure_quick_order_tables(cur)
            result = safe_update(cur, "coop_quick_orders", allowed, updates, "id", oid)
        return jsonify(_row_to_dict(result) if result else {"error": "not found"})
    except Exception as e:
        return jsonify({"error": "Ошибка обновления заказа"}), 500
