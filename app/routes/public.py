"""
Public API routes — no admin auth required.
Covers: /api/data, /api/register, /api/login, /api/user, /api/orders,
        /api/reviews, /api/turnover, /api/settings, /api/forums,
        /api/members, /api/forgot-password, /api/product-order-counts,
        /api/subscriptions
"""

import json
import secrets
import string

from flask import Blueprint, request, jsonify

from ..db import get_db, _row_to_dict, _rows_to_list
from ..utils import rate_limited, rate_limited_auth, rate_limited_email, check_brute_force, record_login_fail, record_login_success, hash_password, verify_password, sanitize_string, validate_upload, _find_forum_by_normalized_address, _ensure_local_forum, normalize_address_key, sanitize_image_urls
from ..auth import create_user_token, require_auth, require_self, claimed_user_id, invalidate_user_tokens
from ..email_service import email_welcome, email_order_confirmation, email_admin_new_order, email_forgot_password, email_verification_code, email_seller_new_order
from ..config import DEVELOPMENT_FEE, UPLOAD_DIR

import os
import time

bp = Blueprint('public', __name__)


# ── Public file upload (for authenticated users, e.g. sellers) ──
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
            cur.execute("SELECT id, is_approved, is_blocked, is_seller FROM coop_users WHERE id = %s", (uid,))
            u = cur.fetchone()
            if not u:
                return jsonify({"error": "Пользователь не найден"}), 401
            if u.get("is_blocked"):
                return jsonify({"error": "Аккаунт заблокирован"}), 403
            if not u.get("is_approved"):
                return jsonify({"error": "Аккаунт не одобрен"}), 403
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
@bp.route("/api/data")
def api_data():
    """
    Public catalog data. Each sub-query is wrapped in its own try/except so
    a missing optional table (e.g. coop_product_images after a partial
    migration on prod) can't kill the whole catalog response and leave the
    site looking empty while admin still works.
    """
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429

    cats: list = []
    subcats: list = []
    prods: list = []
    supps: list = []
    music: list = []

    try:
        with get_db() as cur:
            # Defensive, non-destructive: make sure the optional tables used
            # below exist. CREATE TABLE IF NOT EXISTS is a no-op if the table
            # is already present and never touches any row.
            try:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS coop_subcategories (
                        id SERIAL PRIMARY KEY,
                        category_id INTEGER REFERENCES coop_categories(id) ON DELETE CASCADE,
                        name VARCHAR(255) NOT NULL,
                        description TEXT DEFAULT '',
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
            except Exception:
                pass
            try:
                cur.execute("""
                    CREATE TABLE IF NOT EXISTS coop_product_images (
                        id SERIAL PRIMARY KEY,
                        product_id INTEGER REFERENCES coop_products(id) ON DELETE CASCADE,
                        url TEXT NOT NULL,
                        is_main BOOLEAN DEFAULT FALSE,
                        sort_order INTEGER DEFAULT 0,
                        created_at TIMESTAMPTZ DEFAULT NOW()
                    )
                """)
            except Exception:
                pass

            # Categories
            try:
                cur.execute("SELECT * FROM coop_categories ORDER BY created_at ASC")
                cats = _rows_to_list(cur.fetchall())
            except Exception as e:
                print(f"[/api/data] categories failed: {e}")

            # Subcategories
            try:
                cur.execute("SELECT * FROM coop_subcategories ORDER BY created_at ASC")
                subcats = _rows_to_list(cur.fetchall())
            except Exception as e:
                print(f"[/api/data] subcategories failed: {e}")

            # Products — the one that really matters for the storefront
            try:
                # Defensive: ensure separate product-type flag column exists.
                try:
                    cur.execute(
                        "DO $$ BEGIN ALTER TABLE coop_products ADD COLUMN requires_variant BOOLEAN DEFAULT FALSE; "
                        "EXCEPTION WHEN duplicate_column THEN NULL; END $$;"
                    )
                except Exception:
                    pass
                cur.execute("SELECT * FROM coop_products ORDER BY created_at ASC")
                prods = _rows_to_list(cur.fetchall())
            except Exception as e:
                print(f"[/api/data] products failed: {e}")

            # Attach gallery images (best-effort)
            try:
                cur.execute("SELECT * FROM coop_product_images ORDER BY sort_order ASC, id ASC")
                imgs = _rows_to_list(cur.fetchall())
                img_map: dict = {}
                for img in imgs:
                    pid = img.get("product_id")
                    if pid not in img_map:
                        img_map[pid] = []
                    img_map[pid].append(img)
                for p in prods:
                    p["images"] = img_map.get(p["id"], [])
            except Exception as e:
                print(f"[/api/data] product_images failed: {e}")
                for p in prods:
                    p.setdefault("images", [])

            # Append approved seller products (marketplace items). Exclude
            # those marked is_vip=TRUE — those are VIP-catalog-only.
            try:
                cur.execute("""
                    SELECT sp.*, u.full_name AS seller_name, u.phone AS seller_phone
                    FROM coop_seller_products sp
                    LEFT JOIN coop_users u ON sp.seller_id = u.id
                    WHERE COALESCE(sp.approval_status, 'approved') = 'approved'
                      AND COALESCE(sp.is_available, TRUE) = TRUE
                      AND COALESCE(sp.is_vip, FALSE) = FALSE
                    ORDER BY sp.created_at ASC
                """)
                seller_prods = _rows_to_list(cur.fetchall())
                for sp in seller_prods:
                    sp["original_id"] = sp["id"]
                    sp["id"] = -int(sp["id"])  # negative = seller product marker
                    sp["is_seller_product"] = True
                    sp["supplier_id"] = None
                    sp["product_type"] = sp.get("product_type") or "piece"
                    images = []
                    if sp.get("image_url"):
                        images.append({"id": 0, "image_url": sp["image_url"], "sort_order": 0})
                    gallery = sp.get("gallery_urls")
                    if gallery:
                        try:
                            urls = json.loads(gallery) if isinstance(gallery, str) else gallery
                            if isinstance(urls, list):
                                for i, u in enumerate(urls):
                                    if isinstance(u, str) and u:
                                        images.append({"id": i + 1, "image_url": u, "sort_order": i + 1})
                        except Exception:
                            pass
                    sp["images"] = images
                prods.extend(seller_prods)
            except Exception as e:
                # Table may not exist on a fresh install — don't let that
                # empty the catalog.
                print(f"[/api/data] seller_products failed: {e}")

            # Suppliers
            try:
                cur.execute("SELECT * FROM coop_suppliers ORDER BY name ASC")
                supps = _rows_to_list(cur.fetchall())
            except Exception as e:
                print(f"[/api/data] suppliers failed: {e}")

            # Music
            try:
                cur.execute("SELECT * FROM coop_music ORDER BY sort_order ASC")
                music = _rows_to_list(cur.fetchall())
            except Exception as e:
                print(f"[/api/data] music failed: {e}")

        return jsonify({
            "categories": cats,
            "subcategories": subcats,
            "products": prods,
            "suppliers": supps,
            "music": music,
        })
    except Exception as e:
        # Even if the DB connection itself fails, return a structurally-valid
        # response so the SPA doesn't silently crash the catalog page.
        print(f"[/api/data] fatal: {e}")
        return jsonify({
            "categories": [],
            "subcategories": [],
            "products": [],
            "suppliers": [],
            "music": [],
            "error": str(e),
        }), 200


# ── Auth ───────────────────────────────────────
# How long a confirmed email code stays good for completing registration.
EMAIL_VERIFY_GRACE_MINUTES = 30


def _email_recently_verified(cur, email: str) -> bool:
    """True when this server confirmed a code for `email` a moment ago."""
    try:
        cur.execute(
            """SELECT 1 FROM coop_email_verification_codes
               WHERE LOWER(email) = LOWER(%s) AND verified_at IS NOT NULL
                 AND verified_at > NOW() - (%s * INTERVAL '1 minute')
               LIMIT 1""",
            (email, EMAIL_VERIFY_GRACE_MINUTES)
        )
        return cur.fetchone() is not None
    except Exception:
        # Table/column not migrated yet — treat as unverified rather than
        # silently letting registrations through.
        return False


@bp.route("/api/register", methods=["POST"])
def api_register():
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    d = request.json or {}
    full_name = sanitize_string(d.get("full_name") or "", 200)
    # Phone is no longer required at registration — collected later during first order.
    phone = sanitize_string(d.get("phone") or "", 30)
    address = sanitize_string(d.get("address") or "", 500)
    password = (d.get("password") or "").strip()
    telegram_username = sanitize_string(d.get("telegram_username") or "", 100)
    email = sanitize_string(d.get("email") or "", 255)
    referral_code_input = sanitize_string(d.get("referral_code") or "", 20).upper()
    if not full_name or not address or not password:
        return jsonify({"error": "Заполните все обязательные поля"}), 400
    if not email:
        return jsonify({"error": "Укажите email для входа и уведомлений"}), 400
    if len(password) < 6:
        return jsonify({"error": "Пароль минимум 6 символов"}), 400
    try:
        with get_db() as cur:
            # Email ownership is proven by a code this server issued and saw
            # confirmed — never by an "email_verified" flag from the client.
            if not _email_recently_verified(cur, email):
                return jsonify({"error": "Подтвердите email перед регистрацией"}), 400
            # Email is now the primary unique identifier. Phone uniqueness only
            # checked when phone is actually provided (many users register without it).
            if phone:
                cur.execute("SELECT id FROM coop_users WHERE phone = %s LIMIT 1", (phone,))
                if cur.fetchone():
                    return jsonify({"error": "Пользователь с таким номером уже существует"}), 409
            cur.execute("SELECT id FROM coop_users WHERE email = %s LIMIT 1", (email,))
            if cur.fetchone():
                return jsonify({"error": "Пользователь с таким email уже существует"}), 409
            # Ensure v9 columns exist (safe idempotent — uses DO block to avoid tx abort)
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE coop_users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
                DO $$ BEGIN
                    ALTER TABLE coop_users ADD COLUMN referred_by INTEGER DEFAULT NULL;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
                DO $$ BEGIN
                    ALTER TABLE coop_users ADD COLUMN referral_code VARCHAR(20) DEFAULT NULL;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
                -- v10: phone is now optional. Drop NOT NULL constraint and
                -- replace the blanket UNIQUE(phone) with a *partial* unique
                -- index so many users can coexist without a phone, but any
                -- provided phone must still be unique.
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
            # Resolve referral
            referred_by = None
            if referral_code_input:
                cur.execute("SELECT id FROM coop_users WHERE referral_code = %s LIMIT 1", (referral_code_input,))
                referrer = cur.fetchone()
                if referrer:
                    referred_by = referrer["id"]
            # Store NULL (not empty string) when phone is missing so that the
            # partial unique index above allows multiple phone-less users.
            phone_for_db = phone if phone else None
            cur.execute(
                """INSERT INTO coop_users (full_name, phone, address, password, telegram_username, email, is_approved, email_verified, referred_by)
                   VALUES (%s, %s, %s, %s, %s, %s, FALSE, %s, %s) RETURNING *""",
                (full_name, phone_for_db, address, hash_password(password), telegram_username, email, True, referred_by)
            )
            user = _row_to_dict(cur.fetchone())
            user.pop("password", None)
            _ensure_local_forum(cur, address)
            # Note: referrer promo is awarded when they accumulate N referred users who purchased.
            # See _check_referral_milestone() called from order completion.
            # Give the REFERRED user (who just registered) a welcome bonus promo
            if referred_by:
                _create_referred_user_bonus(cur, user["id"], referred_by)
        if email:
            email_welcome(full_name, email)
        return jsonify({"user": user, "token": create_user_token(user["id"])})
    except Exception as e:
        print(f"⚠️ Registration error: {e}")
        return jsonify({"error": "Ошибка регистрации"}), 500


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
                return jsonify({"error": "Ваш аккаунт заблокирован. Обратитесь к администратору."}), 403
            if user.get("is_approved") is False:
                return jsonify({"error": "Ваша заявка ещё не одобрена администратором. Ожидайте уведомления на email."}), 403
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
            if "address" in updates and updates["address"]:
                _ensure_local_forum(cur, updates["address"])
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


# ── Orders ─────────────────────────────────────
def _lookup_item_price(cur, item: dict):
    """Authoritative unit price for a cart item, or None if it can't be priced.

    The cart is client state: without this every order could be placed at a
    price the buyer made up.
    """
    sub_id = item.get("subscription_id")
    if sub_id:
        try:
            cur.execute("SELECT price FROM coop_subscriptions WHERE id = %s LIMIT 1", (int(sub_id),))
            row = cur.fetchone()
            return float(row["price"]) if row else None
        except Exception:
            return None
    try:
        iid = int(item.get("id") or 0)
    except (TypeError, ValueError):
        return None
    try:
        if iid > 0:
            cur.execute("SELECT price FROM coop_products WHERE id = %s LIMIT 1", (iid,))
        elif iid < 0:
            # Negative ids are seller-marketplace products in the merged catalog.
            cur.execute("SELECT price FROM coop_seller_products WHERE id = %s LIMIT 1", (-iid,))
        else:
            return None
        row = cur.fetchone()
        return float(row["price"]) if row else None
    except Exception:
        return None


@bp.route("/api/orders", methods=["POST"])
def api_create_order():
    """Create an order.

    Cart items are classified into two buckets:
      • Regular cooperative products  → inserted into coop_orders (with the
        development fee and any promo discount). This is the central record the
        admin handles on the main "Заказы" tab and the customer sees in their
        order history.
      • Seller marketplace products (id < 0 in the merged /api/data response,
        resolved to their seller_id via coop_seller_products) → inserted into
        coop_seller_orders, one row per seller. Sellers see these in their
        dashboard; admin sees them under Продавцы → Заказы.

    No duplication: a seller item appears ONLY in coop_seller_orders and the
    development fee / promo code apply ONLY to the regular cooperative slice.
    If the cart contains only seller items, coop_orders is skipped entirely and
    the first seller-order is returned to the frontend as the primary order.
    """
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    d = request.json or {}
    required = ["full_name", "phone", "address", "items", "total"]
    for f in required:
        if not d.get(f):
            return jsonify({"error": f"Поле {f} обязательно"}), 400
    d["full_name"] = sanitize_string(d["full_name"], 200)
    d["phone"] = sanitize_string(d["phone"], 30)
    d["address"] = sanitize_string(d["address"], 500)
    d["comment"] = sanitize_string(d.get("comment") or "", 1000)
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

    def _item_subtotal(it: dict) -> float:
        try:
            return float(it.get("price") or 0) * int(it.get("qty") or it.get("quantity") or 1)
        except Exception:
            return 0.0

    promo_code_input = (d.get("promo_code") or "").strip().upper()

    # The order is placed by whoever holds the token; a user_id in the body is
    # only accepted when it matches. Guests (no token) keep working.
    order_user_id, auth_err = claimed_user_id(d.get("user_id"))
    if auth_err:
        return auth_err
    d["user_id"] = order_user_id

    try:
        with get_db() as cur:
            # Prices come from the database, never from the cart payload.
            for it in items_list:
                if not isinstance(it, dict):
                    continue
                price = _lookup_item_price(cur, it)
                if price is None:
                    print(f"[/api/orders] unpriceable item rejected: {it.get('id')} / {it.get('name')}")
                    return jsonify({"error": "Товар больше недоступен — обновите страницу и соберите корзину заново"}), 409
                it["price"] = price

            # ── 1. Classify items: regular vs seller groups ─────────
            regular_items: list = []
            seller_groups: dict = {}  # seller_id -> list of items
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
                    # Phantom seller item (product was deleted) — drop it.
                    continue
                regular_items.append(it)

            has_regular = len(regular_items) > 0
            has_sellers = len(seller_groups) > 0
            if not has_regular and not has_sellers:
                return jsonify({"error": "Пустой заказ"}), 400

            # ── 2. Promo code (applies only to the cooperative slice) ─
            discount_amount = 0.0
            promo_id = None
            if has_regular and promo_code_input and d.get("user_id"):
                try:
                    cur.execute(
                        "SELECT * FROM coop_promo_codes WHERE code = %s AND is_active = TRUE LIMIT 1",
                        (promo_code_input,)
                    )
                    promo = cur.fetchone()
                    if promo:
                        valid = True
                        if promo.get("expires_at"):
                            cur.execute("SELECT NOW() > %s AS expired", (promo["expires_at"],))
                            if cur.fetchone().get("expired"):
                                valid = False
                        max_act = promo.get("max_activations")
                        cur_act = promo.get("current_activations", 0)
                        if max_act is not None and cur_act >= max_act:
                            valid = False
                        cur.execute(
                            "SELECT id FROM coop_promo_usages WHERE promo_id = %s AND user_id = %s LIMIT 1",
                            (promo["id"], d["user_id"])
                        )
                        if cur.fetchone():
                            valid = False
                        if valid:
                            discount_amount = float(promo["discount_amount"])
                            promo_id = promo["id"]
                except Exception:
                    pass

            # ── 3. Compute totals from items (ignore frontend total to prevent mismatch) ─
            regular_subtotal = sum(_item_subtotal(it) for it in regular_items)

            # ── 4. Create coop_orders (only if there are regular items) ─
            created = None
            if has_regular:
                coop_items = list(regular_items)
                coop_items.append({
                    "name": "На развитие, поддержание сайта и продвижение проекта",
                    "qty": 1, "price": DEVELOPMENT_FEE
                })
                coop_total = regular_subtotal + DEVELOPMENT_FEE
                if discount_amount > 0:
                    coop_total = max(0, coop_total - discount_amount)
                cur.execute("""
                    DO $$ BEGIN ALTER TABLE coop_orders ADD COLUMN promo_code VARCHAR(50) DEFAULT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
                    DO $$ BEGIN ALTER TABLE coop_orders ADD COLUMN discount_amount NUMERIC(12,2) DEFAULT 0; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
                """)
                cur.execute(
                    """INSERT INTO coop_orders (full_name, phone, address, comment, items, total, status, user_id, promo_code, discount_amount)
                       VALUES (%s, %s, %s, %s, %s, %s, 'new', %s, %s, %s) RETURNING *""",
                    (d["full_name"], d["phone"], d["address"], d.get("comment", ""),
                     json.dumps(coop_items, ensure_ascii=False), coop_total, d.get("user_id"),
                     promo_code_input if promo_id else None, discount_amount)
                )
                created = _row_to_dict(cur.fetchone())
                # Auto-open the order chat with a welcome message so the buyer
                # immediately sees a thread for the new order.
                if created and d.get("user_id"):
                    try:
                        from .order_chat import _ensure_table as _ensure_chat_table
                        _ensure_chat_table(cur)
                        cur.execute(
                            "INSERT INTO coop_order_messages (order_id, sender_type, sender_name, text) "
                            "VALUES (%s, 'admin', %s, %s)",
                            (created["id"], "Администрация",
                             f"Здравствуйте! Ваш заказ #{created['id']} принят. Здесь вы можете задать любой вопрос по заказу — мы ответим и будем держать вас в курсе статуса.")
                        )
                    except Exception:
                        pass
                if promo_id and created:
                    cur.execute(
                        "INSERT INTO coop_promo_usages (promo_id, user_id, order_id) VALUES (%s, %s, %s)",
                        (promo_id, d.get("user_id"), created["id"])
                    )
                    cur.execute(
                        "UPDATE coop_promo_codes SET current_activations = current_activations + 1 WHERE id = %s",
                        (promo_id,)
                    )

            # ── 5. Create coop_seller_orders (one per seller) ────────
            # Store tuples of (seller_id, order_id, items, total) for email fan-out
            seller_order_rows: list = []
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
                        # Don't let a seller insert failure block the rest
                        pass

            # ── 6. Emails ─────────────────────────────────────────────
            # Customer confirmation: only for the cooperative slice (kept consistent
            # with existing user-facing expectations). Sellers email directly.
            if created and d.get("user_id"):
                try:
                    cur.execute("SELECT email, full_name FROM coop_users WHERE id = %s LIMIT 1", (d["user_id"],))
                    u = cur.fetchone()
                    if u and u.get("email"):
                        email_order_confirmation(
                            u["full_name"], u["email"],
                            created["id"], float(created.get("total", 0)), created.get("items", "[]")
                        )
                except Exception:
                    pass

            # Admin email: only when there's a cooperative order (admin doesn't
            # handle pure marketplace orders — sellers do)
            if created:
                try:
                    email_admin_new_order(
                        created["id"], d["full_name"], d["phone"],
                        float(created.get("total", 0)), created.get("items", "[]")
                    )
                except Exception:
                    pass

            # Back-fill the user's phone on their profile if they registered
            # without one. We only overwrite empty/NULL — existing phones are kept.
            if d.get("user_id") and d.get("phone"):
                try:
                    cur.execute(
                        """UPDATE coop_users
                           SET phone = %s
                           WHERE id = %s AND (phone IS NULL OR phone = '')""",
                        (d["phone"], d["user_id"])
                    )
                except Exception:
                    pass

            # Per-seller email: the seller receives customer contact + items + their slice total
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

        # ── 7. Response ─────────────────────────────────────────
        # Prefer the cooperative order as the primary response; otherwise return
        # the first seller order with an is_seller_order marker so the frontend
        # can show "Заказ #N принят" using an existing display path.
        if created:
            return jsonify(created)
        if seller_order_rows:
            _sid, so_row, _sitems, _stotal = seller_order_rows[0]
            resp = dict(so_row)
            resp["is_seller_order"] = True
            return jsonify(resp)
        return jsonify({"error": "Пустой заказ"}), 400
    except Exception:
        return jsonify({"error": "Ошибка создания заказа"}), 500


@bp.route("/api/user/<int:user_id>/orders")
def api_user_orders(user_id):
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    err = require_self(user_id)
    if err:
        return err
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_orders WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
            orders = _rows_to_list(cur.fetchall())
            for o in orders:
                o["is_vip"] = False
                o["is_seller_order"] = False
            # Also include VIP orders
            cur.execute("SELECT * FROM coop_vip_orders WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
            vip_orders = _rows_to_list(cur.fetchall())
            for o in vip_orders:
                o["is_vip"] = True
                o["is_seller_order"] = False
            # Include marketplace (seller) orders so the buyer sees them in history too
            seller_orders: list = []
            try:
                cur.execute("""
                    SELECT o.*, u.full_name AS seller_name
                    FROM coop_seller_orders o
                    LEFT JOIN coop_users u ON u.id = o.seller_id
                    WHERE o.user_id = %s
                    ORDER BY o.created_at DESC
                """, (user_id,))
                seller_orders = _rows_to_list(cur.fetchall())
                for o in seller_orders:
                    o["is_vip"] = False
                    o["is_seller_order"] = True
            except Exception:
                seller_orders = []
            all_orders = orders + vip_orders + seller_orders
            all_orders.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return jsonify(all_orders or [])
    except:
        return jsonify({"error": "Ошибка получения заказов"}), 500


@bp.route("/api/orders/<int:oid>/cancel", methods=["PATCH"])
def api_cancel_order(oid):
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    uid, err = require_auth()
    if err:
        return err
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_orders WHERE id = %s LIMIT 1", (oid,))
            o = cur.fetchone()
            if not o:
                return jsonify({"error": "Заказ не найден"}), 404
            if o.get("user_id") != uid:
                return jsonify({"error": "Нет доступа"}), 403
            if o.get("status") not in ("new", "collecting"):
                return jsonify({"error": "Заказ нельзя отменить в текущем статусе"}), 400
            cur.execute("UPDATE coop_orders SET status = 'cancelled' WHERE id = %s", (oid,))
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": "Ошибка отмены заказа"}), 500


@bp.route("/api/orders/<int:oid>/modify", methods=["PATCH"])
def api_modify_order(oid):
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    uid, err = require_auth()
    if err:
        return err
    d = request.json or {}
    if "items" not in d:
        return jsonify({"error": "Нечего изменять"}), 400
    raw_items = d["items"]
    if isinstance(raw_items, str):
        try:
            new_items = json.loads(raw_items)
        except Exception:
            new_items = None
    else:
        new_items = raw_items
    if not isinstance(new_items, list) or not new_items:
        return jsonify({"error": "Пустой заказ"}), 400
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_orders WHERE id = %s LIMIT 1", (oid,))
            o = cur.fetchone()
            if not o:
                return jsonify({"error": "Заказ не найден"}), 404
            if o.get("user_id") != uid:
                return jsonify({"error": "Нет доступа"}), 403
            if o.get("status") not in ("new", "collecting"):
                return jsonify({"error": "Заказ нельзя изменить в текущем статусе"}), 400
            # Recompute the total here — the client sends one, but it is not
            # what gets stored.
            new_total = 0.0
            for it in new_items:
                if not isinstance(it, dict):
                    return jsonify({"error": "Некорректный состав заказа"}), 400
                price = _lookup_item_price(cur, it)
                if price is None:
                    # The development fee is a synthetic line with no product id.
                    if str(it.get("name", "")).startswith("На развитие"):
                        price = float(DEVELOPMENT_FEE)
                    else:
                        return jsonify({"error": "Товар больше недоступен"}), 409
                it["price"] = price
                try:
                    qty = int(it.get("qty") or it.get("quantity") or 1)
                except (TypeError, ValueError):
                    qty = 1
                new_total += price * max(qty, 0)
            discount = float(o.get("discount_amount") or 0)
            new_total = max(0.0, new_total - discount)
            cur.execute(
                "UPDATE coop_orders SET items = %s, total = %s WHERE id = %s",
                (json.dumps(new_items, ensure_ascii=False), new_total, oid)
            )
        return jsonify({"ok": True, "total": new_total})
    except Exception as e:
        print(f"[/api/orders/{oid}/modify] error: {e}")
        return jsonify({"error": "Ошибка изменения заказа"}), 500


# ── Reviews ────────────────────────────────────
@bp.route("/api/reviews")
def api_get_reviews():
    try:
        with get_db() as cur:
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
    if not user_id or not text:
        return jsonify({"error": "Заполните текст отзыва"}), 400
    try:
        with get_db() as cur:
            cur.execute("SELECT full_name FROM coop_users WHERE id = %s LIMIT 1", (user_id,))
            u = cur.fetchone()
            user_name = u["full_name"] if u else ""
            cur.execute(
                "INSERT INTO coop_reviews (user_id, user_name, text, rating, images) VALUES (%s, %s, %s, %s, %s) RETURNING *",
                (user_id, user_name, text, rating, images)
            )
            result = _row_to_dict(cur.fetchone())
        return jsonify(result)
    except Exception as e:
        print(f"⚠️ Review error: {e}")
        return jsonify({"error": "Ошибка добавления отзыва"}), 500


# ── Misc ───────────────────────────────────────
@bp.route("/api/turnover")
def api_turnover():
    """Public counters for the home page: total turnover + approved member count."""
    try:
        with get_db() as cur:
            cur.execute("SELECT COALESCE(SUM(total), 0) AS turnover FROM coop_orders WHERE status != 'cancelled'")
            row = cur.fetchone()
            cur.execute("SELECT COUNT(*) AS members FROM coop_users WHERE is_approved = TRUE AND COALESCE(is_blocked, FALSE) = FALSE")
            mrow = cur.fetchone()
        return jsonify({
            "turnover": float(row["turnover"]) if row else 0,
            "members": int(mrow["members"]) if mrow else 0,
        })
    except:
        return jsonify({"error": "Ошибка получения оборота"}), 500


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


@bp.route("/api/members")
def api_members():
    try:
        with get_db() as cur:
            cur.execute("SELECT full_name FROM coop_users WHERE is_approved = TRUE ORDER BY full_name ASC")
            users = cur.fetchall()
        members = []
        for u in (users or []):
            parts = (u.get("full_name") or "").split()
            if len(parts) >= 2:
                display = parts[1]
                if len(parts) >= 3:
                    display += " " + parts[2]
                display += " " + parts[0][0] + "."
                members.append({"name": display})
            elif parts:
                members.append({"name": parts[0]})
        return jsonify(members)
    except:
        return jsonify({"error": "Ошибка получения списка участников"}), 500


@bp.route("/api/subcategories")
def api_get_subcategories():
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_subcategories ORDER BY name ASC")
            subs = _rows_to_list(cur.fetchall())
        return jsonify(subs or [])
    except:
        return jsonify({"error": "Ошибка получения подкатегорий"}), 500


@bp.route("/api/product-order-counts")
def api_product_order_counts():
    try:
        with get_db() as cur:
            cur.execute("SELECT id, counter_reset_at FROM coop_products WHERE product_type = 'box' AND counter_reset_at IS NOT NULL")
            reset_map = {}
            for r in (cur.fetchall() or []):
                reset_map[r['id']] = r['counter_reset_at']
            cur.execute("SELECT items, created_at FROM coop_orders WHERE status != 'cancelled'")
            orders = cur.fetchall()
        counts = {}
        for o in (orders or []):
            try:
                items_data = o.get("items", [])
                if isinstance(items_data, str):
                    items_data = json.loads(items_data)
                order_time = o.get("created_at")
                for it in items_data:
                    pid = it.get("id")
                    qty = it.get("qty", 1)
                    if pid:
                        reset_at = reset_map.get(pid)
                        if reset_at and order_time and order_time < reset_at:
                            continue
                        counts[pid] = counts.get(pid, 0) + qty
            except:
                pass
        return jsonify(counts)
    except:
        return jsonify({"error": "Ошибка получения количества заказов"}), 500


# ── Forums ─────────────────────────────────────
@bp.route("/api/forums")
def api_forums():
    try:
        with get_db() as cur:
            # Auto-create required forums if missing
            _REQUIRED = [
                ("general", "Общий форум", "Обсуждения для всех участников"),
                ("social", "Социальный форум", "Свободные темы и общение"),
                ("vip_general", "VIP Общий", "VIP обсуждения"),
                ("vip_social", "VIP Социальный", "VIP свободные темы"),
            ]
            for key, name, desc in _REQUIRED:
                cur.execute("SELECT id FROM coop_forums WHERE address_key = %s LIMIT 1", (key,))
                if not cur.fetchone():
                    cur.execute("INSERT INTO coop_forums (name, address_key, description) VALUES (%s, %s, %s)", (name, key, desc))
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
    if not forum_id or not text:
        return jsonify({"error": "Заполните текст сообщения"}), 400
    try:
        with get_db() as cur:
            cur.execute(
                "INSERT INTO coop_forum_posts (forum_id, user_id, user_name, text) VALUES (%s, %s, %s, %s) RETURNING *",
                (forum_id, user_id, user_name, text)
            )
            result = _row_to_dict(cur.fetchone())
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": "Ошибка создания поста"}), 500


@bp.route("/api/forums/find-or-create", methods=["POST"])
def api_find_or_create_forum():
    d = request.json or {}
    address_key = (d.get("address_key") or "").strip()
    name = (d.get("name") or "").strip()
    if not address_key:
        return jsonify({"error": "address_key required"}), 400
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_forums WHERE address_key = %s LIMIT 1", (address_key,))
            existing = cur.fetchone()
            if existing:
                return jsonify(_row_to_dict(existing))
            normalized_match = _find_forum_by_normalized_address(cur, address_key)
            if normalized_match:
                return jsonify(normalized_match)
            cur.execute(
                "INSERT INTO coop_forums (name, address_key, description) VALUES (%s, %s, %s) RETURNING *",
                (name or address_key, address_key, f"Форум для адреса: {name or address_key}")
            )
            result = _row_to_dict(cur.fetchone())
        return jsonify(result)
    except Exception as e:
        print(f"[app/routes/public.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── Subscriptions ──────────────────────────────
@bp.route("/api/subscriptions")
def api_get_subscriptions():
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_subscriptions WHERE is_active = TRUE AND (is_vip = FALSE OR is_vip IS NULL) ORDER BY id ASC")
            subs = _rows_to_list(cur.fetchall())
        return jsonify(subs or [])
    except:
        return jsonify([])


@bp.route("/api/user/<int:user_id>/subscriptions")
def api_user_subscriptions(user_id):
    err = require_self(user_id)
    if err:
        return err
    try:
        with get_db() as cur:
            # Legacy plan-based subscriptions
            cur.execute(
                """SELECT us.*, s.name, s.category_id, s.description
                   FROM coop_user_subscriptions us
                   JOIN coop_subscriptions s ON s.id = us.subscription_id
                   WHERE us.user_id = %s AND us.is_active = TRUE AND us.expires_at > NOW()
                   ORDER BY us.expires_at DESC""",
                (user_id,)
            )
            subs = _rows_to_list(cur.fetchall())
            # Product-based subscriptions (subscription-as-product)
            cur.execute(
                """SELECT ps.id, ps.user_id, ps.product_id, ps.category_id, ps.purchased_at, ps.expires_at,
                          p.name, p.description, p.image_url
                   FROM coop_product_subscriptions ps
                   LEFT JOIN coop_products p ON p.id = ps.product_id
                   WHERE ps.user_id = %s AND ps.is_active = TRUE AND ps.expires_at > NOW()
                   ORDER BY ps.expires_at DESC""",
                (user_id,)
            )
            product_subs = _rows_to_list(cur.fetchall())
        return jsonify({"plan_subscriptions": subs or [], "product_subscriptions": product_subs or []})
    except:
        return jsonify({"plan_subscriptions": [], "product_subscriptions": []})


@bp.route("/api/subscriptions/purchase", methods=["POST"])
def api_purchase_subscription():
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    d = request.json or {}
    user_id, auth_err = claimed_user_id(d.get("user_id"))
    if auth_err:
        return auth_err
    subscription_id = d.get("subscription_id")
    if not user_id or not subscription_id:
        return jsonify({"error": "user_id and subscription_id required"}), 400
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_subscriptions WHERE id = %s AND is_active = TRUE", (subscription_id,))
            sub = cur.fetchone()
            if not sub:
                return jsonify({"error": "Подписка не найдена"}), 404
            duration = sub.get("duration_days", 30)
            cur.execute(
                """INSERT INTO coop_user_subscriptions (user_id, subscription_id, expires_at)
                   VALUES (%s, %s, NOW() + INTERVAL '%s days') RETURNING *""",
                (user_id, subscription_id, duration)
            )
            result = _row_to_dict(cur.fetchone())
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": "Ошибка покупки подписки"}), 500


# ── Promo Code Validation ─────────────────────
@bp.route("/api/promo/validate", methods=["POST"])
def api_validate_promo():
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    d = request.json or {}
    code = (d.get("code") or "").strip().upper()
    user_id, auth_err = claimed_user_id(d.get("user_id"))
    if auth_err:
        return auth_err
    if not code:
        return jsonify({"error": "Введите промокод"}), 400
    try:
        with get_db() as cur:
            cur.execute(
                "SELECT * FROM coop_promo_codes WHERE code = %s AND is_active = TRUE LIMIT 1",
                (code,)
            )
            promo = cur.fetchone()
            if not promo:
                return jsonify({"error": "Промокод не найден или неактивен"}), 404
            # Block VIP promo codes from being used on regular orders
            if promo.get("is_vip"):
                return jsonify({"error": "Этот промокод предназначен только для VIP"}), 400
            # Check expiration
            if promo.get("expires_at"):
                cur.execute("SELECT NOW() > %s AS expired", (promo["expires_at"],))
                if cur.fetchone().get("expired"):
                    return jsonify({"error": "Срок действия промокода истёк"}), 400
            # Check activation limit
            max_act = promo.get("max_activations")
            cur_act = promo.get("current_activations", 0)
            if max_act is not None and cur_act >= max_act:
                return jsonify({"error": "Промокод исчерпал лимит активаций"}), 400
            # Check if user already used this promo
            if user_id:
                cur.execute(
                    "SELECT id FROM coop_promo_usages WHERE promo_id = %s AND user_id = %s LIMIT 1",
                    (promo["id"], user_id)
                )
                if cur.fetchone():
                    return jsonify({"error": "Вы уже использовали этот промокод"}), 400
        min_order = float(promo.get("min_order_amount") or 0)
        return jsonify({
            "valid": True,
            "discount_amount": float(promo["discount_amount"]),
            "min_order_amount": min_order,
            "code": promo["code"],
            "promo_id": promo["id"],
        })
    except Exception as e:
        if "не найден" in str(e) or "истёк" in str(e) or "лимит" in str(e) or "уже использовали" in str(e):
            return jsonify({"error": str(e)}), 400
        return jsonify({"error": "Ошибка проверки промокода"}), 500


# ── User's Promo Codes ────────────────────────
@bp.route("/api/user/<int:user_id>/promo-codes")
def api_user_promo_codes(user_id):
    """Return promo codes available to this user (referral rewards etc.)."""
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    err = require_self(user_id)
    if err:
        return err
    try:
        with get_db() as cur:
            # Get referral reward promos for this user
            cur.execute("""
                SELECT pc.code, pc.discount_amount, pc.min_order_amount, pc.max_activations,
                       pc.current_activations, pc.expires_at, pc.is_active,
                       rr.created_at as earned_at
                FROM coop_referral_rewards rr
                JOIN coop_promo_codes pc ON pc.id = rr.promo_id
                WHERE rr.referrer_id = %s
                ORDER BY rr.created_at DESC
            """, (user_id,))
            referral_promos = _rows_to_list(cur.fetchall())
        return jsonify({"promos": referral_promos or []})
    except Exception:
        return jsonify({"promos": []})


# ── Email Verification ────────────────────────
def _generate_verification_code():
    # secrets, not random: these codes gate account creation.
    return ''.join(secrets.choice(string.digits) for _ in range(6))


@bp.route("/api/email/send-code", methods=["POST"])
def api_send_email_code():
    if rate_limited_email():
        return jsonify({"error": "Слишком много запросов. Подождите минуту."}), 429
    d = request.json or {}
    email = (d.get("email") or "").strip()
    if not email:
        return jsonify({"error": "Укажите email"}), 400
    code = _generate_verification_code()
    try:
        with get_db() as cur:
            # Auto-create table if it doesn't exist (safe for first run before migration)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS coop_email_verification_codes (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER DEFAULT NULL,
                    email VARCHAR(255) NOT NULL,
                    code VARCHAR(6) NOT NULL,
                    expires_at TIMESTAMPTZ NOT NULL,
                    used BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """)
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE coop_email_verification_codes ADD COLUMN verified_at TIMESTAMPTZ DEFAULT NULL;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
            """)
            # Invalidate old codes for this email
            cur.execute(
                "UPDATE coop_email_verification_codes SET used = TRUE WHERE email = %s AND used = FALSE",
                (email,)
            )
            cur.execute(
                """INSERT INTO coop_email_verification_codes (email, code, expires_at)
                   VALUES (%s, %s, NOW() + INTERVAL '10 minutes')""",
                (email, code)
            )
        email_verification_code(email, code)
        return jsonify({"success": True, "message": "Код отправлен на email"})
    except Exception as e:
        print(f"⚠️ Email send-code error: {e}")
        return jsonify({"error": "Ошибка отправки кода. Проверьте настройки SMTP."}), 500


@bp.route("/api/email/verify-code", methods=["POST"])
def api_verify_email_code():
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    d = request.json or {}
    email = (d.get("email") or "").strip()
    code = (d.get("code") or "").strip()
    if not email or not code:
        return jsonify({"error": "Укажите email и код"}), 400
    try:
        with get_db() as cur:
            cur.execute("""
                DO $$ BEGIN
                    ALTER TABLE coop_email_verification_codes ADD COLUMN verified_at TIMESTAMPTZ DEFAULT NULL;
                EXCEPTION WHEN duplicate_column THEN NULL;
                END $$;
            """)
            cur.execute(
                """SELECT id FROM coop_email_verification_codes
                   WHERE email = %s AND code = %s AND used = FALSE AND expires_at > NOW()
                   ORDER BY created_at DESC LIMIT 1""",
                (email, code)
            )
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "Неверный или просроченный код"}), 400
            # verified_at is what /api/register trusts later on.
            cur.execute(
                "UPDATE coop_email_verification_codes SET used = TRUE, verified_at = NOW() WHERE id = %s",
                (row["id"],)
            )
        return jsonify({"verified": True})
    except Exception as e:
        return jsonify({"error": "Ошибка проверки кода"}), 500


# ── Referral System ───────────────────────────
REFERRAL_MILESTONE = 5  # Number of referred users who must PURCHASE before promo is awarded

def _generate_referral_code():
    chars = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(chars) for _ in range(8))


def _create_referred_user_bonus(cur, new_user_id, referrer_id):
    """Create a welcome bonus promo code for a user who registered via referral link."""
    try:
        cur.execute("SELECT value FROM coop_settings WHERE key = 'referral_referred_bonus' LIMIT 1")
        srow = cur.fetchone()
        bonus_amount = float(srow["value"]) if srow else 100
        if bonus_amount <= 0:
            return
        promo_code = f"WELCOME{new_user_id}"
        cur.execute("SELECT id FROM coop_promo_codes WHERE code = %s LIMIT 1", (promo_code,))
        if cur.fetchone():
            return  # Already exists
        cur.execute(
            """INSERT INTO coop_promo_codes (code, discount_amount, max_activations, is_active, is_vip)
               VALUES (%s, %s, 1, TRUE, FALSE) RETURNING id""",
            (promo_code, bonus_amount)
        )
        promo_row = cur.fetchone()
        if promo_row:
            # Auto-log so only this user can use it
            # (validation also checks user_id in promo_usages, but we don't insert usage yet — 
            #  user needs to actually USE it at checkout)
            pass
        print(f"🎁 Created welcome bonus {promo_code} ({bonus_amount}₽) for user {new_user_id}")
    except Exception as e:
        print(f"⚠️ Failed to create referred user bonus: {e}")


def _check_referral_milestone(cur, user_id):
    """Called after an order is marked done. Check if the user who placed the order
    was referred by someone, and if that referrer now has 5+ referred users who purchased."""
    try:
        cur.execute("SELECT referred_by FROM coop_users WHERE id = %s LIMIT 1", (user_id,))
        row = cur.fetchone()
        if not row or not row.get("referred_by"):
            return
        referrer_id = row["referred_by"]
        # Count referred users who have at least one completed order
        cur.execute("""
            SELECT COUNT(DISTINCT u.id) as cnt
            FROM coop_users u
            WHERE u.referred_by = %s
              AND EXISTS (SELECT 1 FROM coop_orders o WHERE o.user_id = u.id AND o.status = 'done')
        """, (referrer_id,))
        purchased_count = cur.fetchone()["cnt"]
        if purchased_count < REFERRAL_MILESTONE:
            return
        # Check if reward already given for this milestone
        cur.execute("""CREATE TABLE IF NOT EXISTS coop_referral_rewards (
            id SERIAL PRIMARY KEY, referrer_id INTEGER NOT NULL, referred_id INTEGER NOT NULL,
            promo_id INTEGER DEFAULT NULL, reward_amount NUMERIC(12,2) DEFAULT 200,
            is_claimed BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW())""")
        cur.execute("SELECT id FROM coop_referral_rewards WHERE referrer_id = %s LIMIT 1", (referrer_id,))
        if cur.fetchone():
            return  # Already rewarded
        # Award promo
        cur.execute("SELECT value FROM coop_settings WHERE key = 'referral_reward_amount' LIMIT 1")
        srow = cur.fetchone()
        reward_amount = float(srow["value"]) if srow else 200
        cur.execute("""CREATE TABLE IF NOT EXISTS coop_promo_codes (
            id SERIAL PRIMARY KEY, code VARCHAR(50) NOT NULL UNIQUE,
            discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
            max_activations INTEGER DEFAULT NULL, current_activations INTEGER DEFAULT 0,
            expires_at TIMESTAMPTZ DEFAULT NULL, is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ DEFAULT NOW())""")
        promo_code = f"REF{referrer_id}_REWARD"
        # Check if promo already exists
        cur.execute("SELECT id FROM coop_promo_codes WHERE code = %s LIMIT 1", (promo_code,))
        if cur.fetchone():
            return
        cur.execute(
            """INSERT INTO coop_promo_codes (code, discount_amount, max_activations, is_active)
               VALUES (%s, %s, 1, TRUE) RETURNING id""",
            (promo_code, reward_amount)
        )
        promo_row = cur.fetchone()
        promo_id = promo_row["id"] if promo_row else None
        cur.execute(
            """INSERT INTO coop_referral_rewards (referrer_id, referred_id, promo_id, reward_amount)
               VALUES (%s, %s, %s, %s)""",
            (referrer_id, user_id, promo_id, reward_amount)
        )
        # Send email notification to the referrer
        try:
            cur.execute("SELECT full_name, email FROM coop_users WHERE id = %s LIMIT 1", (referrer_id,))
            referrer_user = cur.fetchone()
            if referrer_user and referrer_user.get("email"):
                from ..email_service import email_referral_promo_earned
                email_referral_promo_earned(
                    referrer_user["full_name"], referrer_user["email"],
                    promo_code, reward_amount
                )
        except Exception:
            pass
    except Exception as e:
        print(f"⚠️ Referral milestone check error: {e}")


@bp.route("/api/user/<int:user_id>/referral-code", methods=["POST"])
def api_generate_referral_code(user_id):
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    err = require_self(user_id)
    if err:
        return err
    try:
        with get_db() as cur:
            cur.execute("SELECT referral_code FROM coop_users WHERE id = %s LIMIT 1", (user_id,))
            user = cur.fetchone()
            if not user:
                return jsonify({"error": "Пользователь не найден"}), 404
            if user.get("referral_code"):
                return jsonify({"referral_code": user["referral_code"]})
            # Generate unique referral code
            for _ in range(10):
                code = _generate_referral_code()
                cur.execute("SELECT id FROM coop_users WHERE referral_code = %s LIMIT 1", (code,))
                if not cur.fetchone():
                    break
            cur.execute(
                "UPDATE coop_users SET referral_code = %s WHERE id = %s RETURNING referral_code",
                (code, user_id)
            )
            result = cur.fetchone()
        return jsonify({"referral_code": result["referral_code"] if result else code})
    except Exception as e:
        return jsonify({"error": "Ошибка генерации кода"}), 500


@bp.route("/api/user/<int:user_id>/referral-stats")
def api_referral_stats(user_id):
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    err = require_self(user_id)
    if err:
        return err
    try:
        with get_db() as cur:
            cur.execute("SELECT referral_code FROM coop_users WHERE id = %s LIMIT 1", (user_id,))
            user = cur.fetchone()
            if not user:
                return jsonify({"error": "Пользователь не найден"}), 404
            # Get list of invited users with purchase status
            cur.execute("""
                SELECT u.id, u.full_name, u.created_at,
                       EXISTS (SELECT 1 FROM coop_orders o WHERE o.user_id = u.id AND o.status = 'done') as has_purchased
                FROM coop_users u
                WHERE u.referred_by = %s
                ORDER BY u.created_at DESC
            """, (user_id,))
            invited_users = _rows_to_list(cur.fetchall())
            referral_count = len(invited_users)
            purchased_count = sum(1 for u in invited_users if u.get("has_purchased"))
            # Get rewards
            rewards = []
            try:
                cur.execute(
                    """SELECT rr.*, pc.code as promo_code, pc.discount_amount
                       FROM coop_referral_rewards rr
                       LEFT JOIN coop_promo_codes pc ON pc.id = rr.promo_id
                       WHERE rr.referrer_id = %s ORDER BY rr.created_at DESC""",
                    (user_id,)
                )
                rewards = _rows_to_list(cur.fetchall())
            except Exception:
                pass
        return jsonify({
            "referral_code": user.get("referral_code"),
            "referral_count": referral_count,
            "purchased_count": purchased_count,
            "milestone": REFERRAL_MILESTONE,
            "invited_users": invited_users or [],
            "rewards": rewards or [],
        })
    except Exception as e:
        print(f"[app/routes/public.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500
# ══════════════════════════════════════════════════
# QUICK ORDER (guest access via special code)
# ══════════════════════════════════════════════════

def _ensure_quick_order_tables(cur):
    """Create quick order tables if they don't exist yet."""
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


@bp.route("/api/quick-order/validate", methods=["POST"])
def api_quick_order_validate():
    """Validate a quick order code. Returns success if valid."""
    if rate_limited_auth():
        return jsonify({"error": "Слишком много попыток. Подождите минуту."}), 429
    d = request.json or {}
    code = (d.get("code") or "").strip().upper()
    if not code:
        return jsonify({"error": "Введите код быстрого заказа"}), 400
    try:
        with get_db() as cur:
            _ensure_quick_order_tables(cur)
            # Check global toggle
            cur.execute("SELECT value FROM coop_settings WHERE key = 'quick_orders_enabled' LIMIT 1")
            s = cur.fetchone()
            if s and s["value"] == "false":
                return jsonify({"error": "Быстрые заказы временно отключены"}), 403
            cur.execute(
                "SELECT * FROM coop_quick_order_codes WHERE code = %s AND is_active = TRUE LIMIT 1",
                (code,)
            )
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "Неверный или неактивный код"}), 404
            # Check expiry
            if row.get("expires_at"):
                cur.execute("SELECT NOW() > %s AS expired", (row["expires_at"],))
                if cur.fetchone().get("expired"):
                    return jsonify({"error": "Срок действия кода истёк"}), 410
            # Check max uses
            max_uses = row.get("max_uses")
            cur_uses = row.get("current_uses", 0)
            if max_uses is not None and cur_uses >= max_uses:
                return jsonify({"error": "Код исчерпал лимит использований"}), 410
        return jsonify({"valid": True, "code": code})
    except Exception as e:
        return jsonify({"error": "Ошибка проверки кода"}), 500


@bp.route("/api/quick-order/submit", methods=["POST"])
def api_quick_order_submit():
    """Submit a quick order from a guest user."""
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    d = request.json or {}
    code = (d.get("code") or "").strip().upper()
    guest_name = sanitize_string(d.get("guest_name") or "", 255)
    contact_type = (d.get("contact_type") or "").strip()
    contact_value = sanitize_string(d.get("contact_value") or "", 255)
    items_raw = d.get("items")
    total = d.get("total", 0)

    if not code:
        return jsonify({"error": "Код быстрого заказа обязателен"}), 400
    if not guest_name:
        return jsonify({"error": "Укажите ваше имя"}), 400
    if contact_type not in ("phone", "telegram"):
        return jsonify({"error": "Укажите способ связи (телефон или Telegram)"}), 400
    if not contact_value:
        return jsonify({"error": "Укажите контактные данные"}), 400
    if not items_raw:
        return jsonify({"error": "Корзина пуста"}), 400

    items_list = items_raw if isinstance(items_raw, list) else json.loads(items_raw)
    if not items_list:
        return jsonify({"error": "Корзина пуста"}), 400

    try:
        with get_db() as cur:
            _ensure_quick_order_tables(cur)
            # Check global toggle
            cur.execute("SELECT value FROM coop_settings WHERE key = 'quick_orders_enabled' LIMIT 1")
            s = cur.fetchone()
            if s and s["value"] == "false":
                return jsonify({"error": "Быстрые заказы временно отключены"}), 403
            # Validate code again
            cur.execute(
                "SELECT * FROM coop_quick_order_codes WHERE code = %s AND is_active = TRUE LIMIT 1",
                (code,)
            )
            qcode = cur.fetchone()
            if not qcode:
                return jsonify({"error": "Неверный или неактивный код"}), 404
            if qcode.get("expires_at"):
                cur.execute("SELECT NOW() > %s AS expired", (qcode["expires_at"],))
                if cur.fetchone().get("expired"):
                    return jsonify({"error": "Срок действия кода истёк"}), 410
            max_uses = qcode.get("max_uses")
            cur_uses = qcode.get("current_uses", 0)
            if max_uses is not None and cur_uses >= max_uses:
                return jsonify({"error": "Код исчерпал лимит использований"}), 410

            # Recalculate total server-side from actual DB prices to prevent client-side manipulation
            server_total = 0
            for it in items_list:
                if not isinstance(it, dict):
                    return jsonify({"error": "Некорректный состав заказа"}), 400
                price = _lookup_item_price(cur, it)
                if price is None:
                    return jsonify({"error": "Товар больше недоступен — обновите страницу"}), 409
                try:
                    qty = max(int(it.get("qty") or it.get("quantity") or 1), 0)
                except (TypeError, ValueError):
                    qty = 1
                it["price"] = price
                server_total += price * qty
            items_json = json.dumps(items_list, ensure_ascii=False)
            cur.execute(
                """INSERT INTO coop_quick_orders (quick_code, guest_name, contact_type, contact_value, items, total, status)
                   VALUES (%s, %s, %s, %s, %s, %s, 'new') RETURNING *""",
                (code, guest_name, contact_type, contact_value, items_json, server_total)
            )
            created = _row_to_dict(cur.fetchone())
            # Increment usage counter
            cur.execute(
                "UPDATE coop_quick_order_codes SET current_uses = current_uses + 1 WHERE id = %s",
                (qcode["id"],)
            )
            # Notify admin via email
            try:
                contact_display = f"Телефон: {contact_value}" if contact_type == "phone" else f"Telegram: @{contact_value}"
                email_admin_new_order(
                    created["id"], f"[Быстрый заказ] {guest_name}", contact_display,
                    float(total), items_json
                )
            except Exception:
                pass
        return jsonify(created)
    except Exception as e:
        return jsonify({"error": "Ошибка создания заказа"}), 500


# ── Public Chat (no auth required) ────────────────
@bp.route("/api/public-chat", methods=["GET"])
def get_public_chat():
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    limit = min(int(request.args.get("limit", 50)), 100)
    try:
        with get_db() as cur:
            cur.execute(
                "CREATE TABLE IF NOT EXISTS coop_public_chat ("
                "id SERIAL PRIMARY KEY, nickname VARCHAR(30) NOT NULL, "
                "text TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())"
            )
            cur.execute(
                "SELECT * FROM coop_public_chat ORDER BY created_at DESC LIMIT %s",
                (limit,)
            )
            msgs = _rows_to_list(cur.fetchall())
            msgs.reverse()
            return jsonify(msgs)
    except Exception:
        return jsonify([])


@bp.route("/api/public-chat", methods=["POST"])
def post_public_chat():
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    data = request.get_json(force=True, silent=True) or {}
    nickname = sanitize_string(data.get("nickname", ""))[:30]
    text = sanitize_string(data.get("text", ""))[:500]
    if not nickname or not text:
        return jsonify({"error": "nickname and text required"}), 400
    try:
        with get_db() as cur:
            cur.execute(
                "CREATE TABLE IF NOT EXISTS coop_public_chat ("
                "id SERIAL PRIMARY KEY, nickname VARCHAR(30) NOT NULL, "
                "text TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())"
            )
            cur.execute(
                "INSERT INTO coop_public_chat (nickname, text) VALUES (%s, %s) RETURNING *",
                (nickname, text)
            )
            msg = _row_to_dict(cur.fetchone())
            return jsonify(msg), 201
    except Exception:
        return jsonify({"error": "Ошибка отправки"}), 500


# ── Admin: public chat moderation ──────────────────
@bp.route("/api/admin/public-chat")
def admin_list_public_chat():
    """Admin view of public chat — newest first for moderation."""
    limit = min(int(request.args.get("limit", 200)), 500)
    try:
        with get_db() as cur:
            cur.execute(
                "CREATE TABLE IF NOT EXISTS coop_public_chat ("
                "id SERIAL PRIMARY KEY, nickname VARCHAR(30) NOT NULL, "
                "text TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())"
            )
            cur.execute(
                "SELECT * FROM coop_public_chat ORDER BY created_at DESC LIMIT %s",
                (limit,)
            )
            msgs = _rows_to_list(cur.fetchall())
        return jsonify(msgs or [])
    except Exception:
        return jsonify([])


@bp.route("/api/admin/public-chat/<int:mid>", methods=["DELETE"])
def admin_delete_public_chat(mid):
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM coop_public_chat WHERE id = %s", (mid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[app/routes/public.py] {request.method} {request.path}: {e}")
        return jsonify({"error": "Ошибка сервера"}), 500