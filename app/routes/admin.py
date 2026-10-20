"""
Admin API routes — all /api/admin/* endpoints.
Login endpoint is public; everything else requires token auth.
"""

import os
import re
import time
import hmac

from flask import Blueprint, request, jsonify

from ..db import get_db, _row_to_dict, _rows_to_list
from ..utils import rate_limited_auth, check_brute_force, record_login_fail, record_login_success, hash_password, verify_password, safe_update, safe_insert, sanitize_string, validate_upload
from ..auth import _create_admin_token, invalidate_user_tokens
from ..email_service import email_user_blocked
from ..config import UPLOAD_DIR

bp = Blueprint('admin', __name__)

# Auth guard is app-level in app/__init__.py — protects all /api/admin/* across all blueprints


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
            "admins": admins, "users": users,
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
                  'compare_label_1', 'compare_label_2', 'sort_order', 'accent_color', 'accent_strong'}


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
    for key in ("accent_color", "accent_strong"):
        value = d.get(key)
        if value not in (None, "") and not re.fullmatch(r"#[0-9a-fA-F]{6}", str(value)):
            return jsonify({"error": "Цвет — в формате #RRGGBB"}), 400
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
_PRODUCT_COLS = {'name', 'price', 'promo_price', 'compare_price_1', 'compare_price_2', 'description',
                 'category_id', 'subcategory_id', 'badge', 'image_url', 'is_available', 'is_adult',
                 'requires_variant'}

# Empty price fields mean "no such price", not zero.
_OPTIONAL_PRICES = ('promo_price', 'compare_price_1', 'compare_price_2')


@bp.route("/api/admin/products", methods=["POST"])
def api_add_product():
    d = request.json or {}
    for k in _OPTIONAL_PRICES:
        if k in d and d[k] in ('', 0, '0'):
            d[k] = None
    try:
        with get_db() as cur:
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
            row = safe_update(cur, 'coop_products', _PRODUCT_COLS, d, 'id', pid)
            if not row:
                cur.execute("SELECT * FROM coop_products WHERE id = %s", (pid,))
                row = cur.fetchone()
            result = _row_to_dict(row)
        return jsonify(result)
    except Exception as e:
        print(f"[app/routes/admin.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


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


@bp.route("/api/admin/users")
def api_get_users():
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_users ORDER BY created_at DESC")
            users = _rows_to_list(cur.fetchall())
            for u in users:
                u.pop("password", None)
        return jsonify(users)
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


@bp.route("/api/admin/users/<int:uid>/block", methods=["PATCH"])
def api_block_user(uid):
    try:
        with get_db() as cur:
            cur.execute("UPDATE coop_users SET is_blocked = TRUE WHERE id = %s", (uid,))
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

@bp.route("/api/admin/forums")
def api_admin_forums():
    try:
        with get_db() as cur:
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


