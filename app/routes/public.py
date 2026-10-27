"""
Public API routes — no admin auth required.
Covers: /api/login, /api/user, /api/forgot-password, /api/reset-password,
        /api/upload, /api/reviews, /api/settings, /api/subcategories, /api/forums
"""

import secrets

from flask import Blueprint, request, jsonify

from ..db import get_db, _row_to_dict, _rows_to_list
from ..utils import rate_limited, rate_limited_auth, check_brute_force, record_login_fail, record_login_success, hash_password, verify_password, sanitize_string, validate_upload, sanitize_image_urls
from ..auth import create_user_token, require_auth, require_self, claimed_user_id, invalidate_user_tokens
from ..email_service import email_forgot_password
from ..config import UPLOAD_DIR

import os
import time

bp = Blueprint('public', __name__)


# ── File upload for signed-in buyers (photos in reviews and chats) ──
@bp.route("/api/upload", methods=["POST"])
def api_public_upload():
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    # Identity comes from the signed token — a user_id in the form body is not
    # proof of anything and used to let anonymous callers upload.
    uid, err = require_auth()
    if err:
        return err
    try:
        with get_db() as cur:
            cur.execute("SELECT id, is_blocked FROM coop_users WHERE id = %s", (uid,))
            u = cur.fetchone()
            if not u:
                return jsonify({"error": "Пользователь не найден"}), 401
            if u.get("is_blocked"):
                return jsonify({"error": "Аккаунт заблокирован"}), 403
    except Exception:
        return jsonify({"error": "Неверный пользователь"}), 401

    if "file" not in request.files:
        return jsonify({"error": "No file"}), 400
    f = request.files["file"]
    is_valid, err_msg = validate_upload(f)
    if not is_valid:
        return jsonify({"error": err_msg}), 400
    ext = f.filename.rsplit(".", 1)[-1].lower() if "." in f.filename else "bin"
    prefix = sanitize_string(request.form.get("prefix", "file"), 50)
    prefix = prefix.replace('/', '_').replace('\\', '_').replace('..', '_')
    # Force user prefix so uploaded files are traceable
    prefix = f"u{uid}_{prefix}"
    old_url = request.form.get("old_url", "")
    filename = f"{prefix}_{int(time.time() * 1000)}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    f.save(filepath)
    public_url = f"/uploads/{filename}"
    # Allow user to delete only their own files (matching u{uid}_ prefix)
    if old_url and old_url.startswith("/uploads/") and '..' not in old_url:
        old_basename = os.path.basename(old_url.replace("/uploads/", ""))
        if old_basename.startswith(f"u{uid}_"):
            old_path = os.path.join(UPLOAD_DIR, old_basename)
            if os.path.exists(old_path):
                try:
                    os.remove(old_path)
                except Exception:
                    pass
    return jsonify({"url": public_url})


# ── Main data endpoint ─────────────────────────


@bp.route("/api/login", methods=["POST"])
def api_login():
    if rate_limited_auth():
        return jsonify({"error": "Слишком много попыток. Подождите минуту."}), 429
    if check_brute_force():
        return jsonify({"error": "IP заблокирован на 5 минут из-за множества неудачных попыток входа."}), 429
    d = request.json or {}
    # Email is the primary identifier. Legacy "phone" key is accepted as a
    # fallback so cached clients that still send phone keep working until the
    # next page refresh.
    email = sanitize_string(d.get("email") or "", 255).lower().strip()
    legacy_phone = sanitize_string(d.get("phone") or "", 50)
    password = (d.get("password") or "").strip()
    if (not email and not legacy_phone) or not password:
        return jsonify({"error": "Заполните все поля"}), 400
    try:
        with get_db() as cur:
            user = None
            if email:
                cur.execute("SELECT * FROM coop_users WHERE LOWER(email) = %s LIMIT 1", (email,))
                user = cur.fetchone()
            if not user and legacy_phone:
                # Legacy fallback: allow phone-based login for one release cycle.
                cur.execute("SELECT * FROM coop_users WHERE phone = %s LIMIT 1", (legacy_phone,))
                user = cur.fetchone()
            if not user:
                record_login_fail()
                return jsonify({"error": "Неверный email или пароль"}), 401
            stored_pw = user.get("password", "")
            if not verify_password(password, stored_pw):
                record_login_fail()
                return jsonify({"error": "Неверный email или пароль"}), 401
            # Auto-upgrade legacy SHA-256 hash to bcrypt
            if not stored_pw.startswith('$2b$') and not stored_pw.startswith('$2a$'):
                cur.execute("UPDATE coop_users SET password = %s WHERE id = %s", (hash_password(password), user['id']))
            user = _row_to_dict(user)
            if user.get("is_blocked"):
                return jsonify({"error": "Аккаунт заблокирован. Напишите нам — разберёмся."}), 403
            user.pop("password", None)
            record_login_success()
            return jsonify({"user": user, "token": create_user_token(user["id"])})
    except Exception as e:
        return jsonify({"error": "Ошибка входа"}), 500


@bp.route("/api/user/<int:user_id>")
def api_get_user(user_id):
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    err = require_self(user_id)
    if err:
        return err
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_users WHERE id = %s LIMIT 1", (user_id,))
            user = cur.fetchone()
        if not user:
            return jsonify({"error": "Пользователь не найден"}), 404
        user = _row_to_dict(user)
        user.pop("password", None)
        return jsonify({"user": user})
    except:
        return jsonify({"error": "Ошибка получения статистики"}), 500


@bp.route("/api/user/<int:user_id>", methods=["PATCH"])
def api_update_user(user_id):
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    err = require_self(user_id)
    if err:
        return err
    d = request.json or {}
    allowed = {"full_name", "phone", "address", "telegram_username", "password", "email"}
    updates = {}
    for k in allowed:
        if k in d:
            v = (d[k] or "").strip()
            if k == "password":
                if v and len(v) >= 6:
                    updates["password"] = hash_password(v)
            else:
                updates[k] = v
    if not updates:
        return jsonify({"error": "Нечего обновлять"}), 400
    password_changed = "password" in updates
    try:
        with get_db() as cur:
            from ..utils import safe_update
            row = safe_update(cur, 'coop_users', allowed, updates, 'id', user_id)
            user = _row_to_dict(row)
            if user:
                user.pop("password", None)
            # If address changed, ensure local forum exists for the new address
            if password_changed:
                # Kills every token issued before now — including any an
                # attacker may be holding, which is the point of the change.
                cur.execute(
                    "UPDATE coop_users SET password_changed_at = NOW() WHERE id = %s",
                    (user_id,)
                )
        if password_changed:
            invalidate_user_tokens(user_id)
            # Keep the caller signed in with a token minted after the change.
            return jsonify({"user": user, "token": create_user_token(user_id)})
        return jsonify({"user": user})
    except Exception as e:
        return jsonify({"error": "Ошибка обновления"}), 500


@bp.route("/api/forgot-password", methods=["POST"])
def api_forgot_password():
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    d = request.json or {}
    email = (d.get("email") or "").strip().lower()
    if not email:
        return jsonify({"error": "Укажите email"}), 400
    # Always respond with the same success message regardless of whether the
    # email is registered — this avoids user enumeration and matches what
    # users report as "не работало": they'd see a 404 for typos / case
    # mismatches and assume the feature is broken.
    generic_ok = jsonify({
        "success": True,
        "message": "Если такой email зарегистрирован, мы отправили на него ссылку для сброса пароля."
    })
    try:
        with get_db() as cur:
            cur.execute(
                "SELECT id, full_name, email FROM coop_users WHERE LOWER(email) = %s LIMIT 1",
                (email,)
            )
            user = cur.fetchone()
            if not user:
                return generic_ok
            token = secrets.token_urlsafe(48)
            cur.execute(
                "INSERT INTO coop_password_reset_tokens (user_id, token, expires_at) VALUES (%s, %s, NOW() + INTERVAL '1 hour')",
                (user['id'], token)
            )
        from ..config import SITE_DOMAIN
        reset_url = f"{SITE_DOMAIN}/?reset_token={token}"
        try:
            email_forgot_password(user.get("full_name", "") or "", user.get("email") or email, reset_url)
        except Exception as mail_err:
            # Make the real reason visible in the server logs instead of the
            # silent "Ошибка сервера" 500 the user sees in the browser.
            print(f"[/api/forgot-password] email send failed for {email}: {mail_err}")
        return generic_ok
    except Exception as e:
        print(f"[/api/forgot-password] db error: {e}")
        return generic_ok


@bp.route("/api/reset-password", methods=["POST"])
def api_reset_password():
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    d = request.json or {}
    token = (d.get("token") or "").strip()
    new_password = (d.get("new_password") or "").strip()
    if not token or not new_password:
        return jsonify({"error": "Токен и новый пароль обязательны"}), 400
    if len(new_password) < 6:
        return jsonify({"error": "Пароль минимум 6 символов"}), 400
    try:
        with get_db() as cur:
            cur.execute(
                "SELECT * FROM coop_password_reset_tokens WHERE token = %s AND used = FALSE AND expires_at > NOW() LIMIT 1",
                (token,)
            )
            reset = cur.fetchone()
            if not reset:
                return jsonify({"error": "Ссылка устарела или уже использована. Запросите новую."}), 400
            cur.execute(
                "UPDATE coop_users SET password = %s, password_changed_at = NOW() WHERE id = %s",
                (hash_password(new_password), reset['user_id'])
            )
            cur.execute("UPDATE coop_password_reset_tokens SET used = TRUE WHERE id = %s", (reset['id'],))
        # A reset is how someone recovers a compromised account — every
        # existing session must die with it.
        invalidate_user_tokens(reset['user_id'])
        return jsonify({"success": True, "message": "Пароль успешно изменён"})
    except Exception as e:
        print(f"[/api/reset-password] error: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── Reviews ────────────────────────────────────
@bp.route("/api/reviews")
def api_get_reviews():
    try:
        with get_db() as cur:
            # ?category_id=N — the reviews shown on that category's page.
            cid = request.args.get("category_id", type=int)
            if cid:
                cur.execute("SELECT * FROM coop_reviews WHERE category_id = %s ORDER BY created_at DESC LIMIT 50", (cid,))
            else:
                cur.execute("SELECT * FROM coop_reviews ORDER BY created_at DESC LIMIT 50")
            reviews = _rows_to_list(cur.fetchall())
        return jsonify(reviews or [])
    except:
        return jsonify({"error": "Ошибка получения отзывов"}), 500


@bp.route("/api/reviews", methods=["POST"])
def api_add_review():
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    d = request.json or {}
    user_id, auth_err = claimed_user_id(d.get("user_id"))
    if auth_err:
        return auth_err
    text = sanitize_string(d.get("text") or "", 2000)
    rating = min(5, max(1, int(d.get("rating", 5))))
    images = sanitize_image_urls(d.get("images"))
    try:
        category_id = int(d["category_id"]) if d.get("category_id") else None
    except (TypeError, ValueError):
        category_id = None
    if not user_id or not text:
        return jsonify({"error": "Заполните текст отзыва"}), 400
    try:
        with get_db() as cur:
            cur.execute("SELECT full_name FROM coop_users WHERE id = %s LIMIT 1", (user_id,))
            u = cur.fetchone()
            user_name = u["full_name"] if u else ""
            cur.execute(
                "INSERT INTO coop_reviews (user_id, user_name, text, rating, images, category_id) VALUES (%s, %s, %s, %s, %s, %s) RETURNING *",
                (user_id, user_name, text, rating, images, category_id)
            )
            result = _row_to_dict(cur.fetchone())
        return jsonify(result)
    except Exception as e:
        print(f"⚠️ Review error: {e}")
        return jsonify({"error": "Ошибка добавления отзыва"}), 500


# ── Misc ───────────────────────────────────────


# Keys that must never leave the server through the public settings endpoint.
# coop_settings holds the admin master password alongside harmless UI flags, so
# anything secret-looking is filtered out by name — a blocklist by pattern keeps
# future keys safe too.
_SECRET_SETTING_KEYS = {"telegram_admin_chat_ids"}
_SECRET_SETTING_PATTERNS = ("password", "secret", "token", "api_key", "apikey")


def _is_secret_setting(key: str) -> bool:
    k = (key or "").lower()
    return k in _SECRET_SETTING_KEYS or any(p in k for p in _SECRET_SETTING_PATTERNS)


@bp.route("/api/settings")
def api_settings():
    try:
        with get_db() as cur:
            cur.execute("SELECT key, value FROM coop_settings")
            rows = cur.fetchall()
        settings = {r["key"]: r["value"] for r in (rows or []) if not _is_secret_setting(r["key"])}
        return jsonify(settings)
    except Exception as e:
        print(f"⚠️ Settings fetch error: {e}")
        return jsonify({"error": "Ошибка получения настроек"}), 500


@bp.route("/api/subcategories")
def api_get_subcategories():
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_subcategories ORDER BY name ASC")
            subs = _rows_to_list(cur.fetchall())
        return jsonify(subs or [])
    except:
        return jsonify({"error": "Ошибка получения подкатегорий"}), 500


# ── Forums ─────────────────────────────────────
@bp.route("/api/forums")
def api_forums():
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_forums ORDER BY id ASC")
            forums = _rows_to_list(cur.fetchall())
        return jsonify(forums or [])
    except:
        return jsonify({"error": "Ошибка получения форумов"}), 500


@bp.route("/api/forums/<int:fid>/posts")
def api_forum_posts(fid):
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_forum_posts WHERE forum_id = %s ORDER BY created_at DESC LIMIT 100", (fid,))
            posts = _rows_to_list(cur.fetchall())
        return jsonify(posts or [])
    except:
        return jsonify({"error": "Ошибка получения постов форума"}), 500


@bp.route("/api/forums/posts", methods=["POST"])
def api_create_forum_post():
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    d = request.json or {}
    forum_id = d.get("forum_id")
    user_id, auth_err = claimed_user_id(d.get("user_id"))
    if auth_err:
        return auth_err
    user_name = sanitize_string(d.get("user_name") or "", 200)
    text = sanitize_string(d.get("text") or "", 5000)
    # Photos need an upload, and uploads need an account, so a guest post
    # carries text only.
    images = sanitize_image_urls(d.get("images")) if user_id else "[]"
    if not forum_id or (not text and images == "[]"):
        return jsonify({"error": "Заполните текст сообщения"}), 400
    try:
        with get_db() as cur:
            cur.execute(
                "INSERT INTO coop_forum_posts (forum_id, user_id, user_name, text, images) VALUES (%s, %s, %s, %s, %s) RETURNING *",
                (forum_id, user_id, user_name, text, images)
            )
            result = _row_to_dict(cur.fetchone())
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": "Ошибка создания поста"}), 500


# ── Subscriptions ──────────────────────────────


# ── Promo Code Validation ─────────────────────


