"""
RefSale storefront API.

Pricing: every product has a base price (coop_products.price) and an optional
promo price (coop_products.promo_price), both set by the admin. A valid
referral promo code switches the buyer to promo prices. The code belongs to an
opinion leader ("лидер мнений"), so the order is tied to them: their cabinet
shows it, and the agreed reward is accrued once the order is delivered.

Order flow: the order is created as 'new' and a chat opens straight away. The
admin agrees the details there and, once the prepayment arrives, presses
"Подтверждено" — the order becomes 'accepted', the buyer gets an email and
the statuses start: accepted → processing → shipping → done (or cancelled).
The chat stays writable until the order is done or cancelled.

Leaders are read-only by default. An admin can let a particular leader write
in their buyers' chats and move their orders along (leader_can_write).
"""

import json

from flask import Blueprint, request, jsonify

from ..db import get_db, _row_to_dict, _rows_to_list
from ..utils import rate_limited, rate_limited_auth, sanitize_string, hash_password, sanitize_image_urls
from ..auth import create_user_token, require_auth, auth_user_id
from ..notify import notify_user, snippet

bp = Blueprint('store', __name__)

STORE_STATUSES = ('new', 'accepted', 'processing', 'shipping', 'done', 'cancelled')
STATUS_LABELS = {
    'new': 'Ожидает подтверждения',
    'accepted': 'Принят',
    'processing': 'В обработке',
    'shipping': 'В доставке',
    'done': 'Выдан',
    'cancelled': 'Отменён',
}
CONTACT_METHODS = ('phone', 'telegram', 'whatsapp', 'max', 'email')
MAX_QTY = 99
MAX_PRICE = 100_000_000  # well inside NUMERIC(12,2)
MAX_PROMO_CODES = 6
# Narrower codes win when two cover one item
_SCOPE_RANK = {"products": 0, "category": 1, "all": 2}


# ══════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════
def _promos_enabled(cur) -> bool:
    cur.execute("SELECT value FROM coop_settings WHERE key = 'ref_promos_enabled' LIMIT 1")
    row = cur.fetchone()
    return not (row and (row.get("value") or "").strip() == "false")


def load_promo(cur, code: str):
    """(promo_row, None) for a usable referral code, else (None, reason)."""
    code = (code or "").strip().upper()
    if not code:
        return None, "Введите промокод"
    if not _promos_enabled(cur):
        return None, "Промокоды временно отключены"
    cur.execute(
        """SELECT p.*, (p.expires_at IS NOT NULL AND p.expires_at < NOW()) AS expired,
                  u.full_name AS leader_name
           FROM ref_promos p LEFT JOIN coop_users u ON u.id = p.leader_id
           WHERE UPPER(p.code) = %s LIMIT 1""",
        (code,)
    )
    row = cur.fetchone()
    if not row or not row.get("is_active"):
        return None, "Промокод не найден или отключён"
    if row.get("expired"):
        return None, "Срок действия промокода истёк"
    max_uses = row.get("max_uses")
    if max_uses is not None and (row.get("current_uses") or 0) >= max_uses:
        return None, "Промокод исчерпал лимит использований"
    return row, None


def _scope_ids(promo) -> set:
    try:
        raw = promo.get("scope_product_ids") or "[]"
        return {int(x) for x in (json.loads(raw) if isinstance(raw, str) else raw)}
    except Exception:
        return set()


def promo_covers(promo, product_id, category_id) -> bool:
    """Whether this code makes this product cheaper: everything, its category,
    or a chosen product."""
    if not promo:
        return False
    scope = promo.get("scope") or "all"
    if scope == "category":
        return category_id is not None and promo.get("scope_category_id") == category_id
    if scope == "products":
        return int(product_id) in _scope_ids(promo)
    return True


def promo_scope_text(cur, promo) -> str:
    """'на весь каталог', 'на категорию «Еда»', 'на 3 товара' — for the buyer."""
    scope = promo.get("scope") or "all"
    if scope == "category" and promo.get("scope_category_id"):
        cur.execute("SELECT name FROM coop_categories WHERE id = %s", (promo["scope_category_id"],))
        row = cur.fetchone()
        return f"на категорию «{row['name']}»" if row else "на одну категорию"
    if scope == "products":
        ids = _scope_ids(promo)
        if len(ids) == 1:
            cur.execute("SELECT name FROM coop_products WHERE id = %s", (next(iter(ids)),))
            row = cur.fetchone()
            return f"на «{row['name']}»" if row else "на один товар"
        n = len(ids)
        word = "товар" if n % 10 == 1 and n % 100 != 11 else "товара" if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14 else "товаров"
        return f"на {n} {word}"
    return "на весь каталог"


def _effective_price(product: dict, promo_active: bool):
    """(unit price, base price) — the promo price only counts when it is lower."""
    base = float(product.get("price") or 0)
    promo = product.get("promo_price")
    if promo_active and promo is not None and 0 < float(promo) < base:
        return float(promo), base
    return base, base


def _first_name(full_name: str) -> str:
    parts = (full_name or "").split()
    return parts[0] if parts else ""


def _masked_name(full_name: str) -> str:
    """'Иван Петров' → 'Иван П.' — leaders see who ordered, not their identity."""
    parts = (full_name or "").split()
    if not parts:
        return "Покупатель"
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[1][0]}."


def _mask_buyers(messages: list) -> list:
    for m in messages:
        if m.get("sender_type") == "user":
            m["sender_name"] = _masked_name(m.get("sender_name") or "")
    return messages


def _post_system_message(cur, order_id: int, text: str):
    cur.execute(
        "INSERT INTO coop_order_messages (order_id, sender_type, sender_name, text) "
        "VALUES (%s, 'admin', %s, %s)",
        (order_id, "RefSale", text)
    )


def log_order_status(cur, order_id: int, status: str):
    cur.execute("INSERT INTO ref_order_status_log (order_id, status) VALUES (%s, %s)", (order_id, status))


def order_status_history(cur, order_id: int) -> dict:
    """{status: ISO time it was last entered}, for the dates under the track."""
    cur.execute(
        "SELECT status, MAX(changed_at) AS at FROM ref_order_status_log WHERE order_id = %s GROUP BY status",
        (order_id,),
    )
    return {r["status"]: r["at"].isoformat() for r in cur.fetchall() if r.get("at")}


def apply_order_status(cur, order_id: int, new_status: str, by: str = "admin"):
    """Move an order to `new_status`, post a chat note and email the buyer.

    Returns (order_dict, error_message).
    """
    if new_status not in STORE_STATUSES:
        return None, "Неизвестный статус"
    cur.execute("SELECT * FROM coop_orders WHERE id = %s LIMIT 1", (order_id,))
    order = cur.fetchone()
    if not order:
        return None, "Заказ не найден"
    old_status = order.get("status")
    if old_status == new_status:
        return _row_to_dict(order), None

    confirming = old_status == 'new' and new_status != 'cancelled'
    cur.execute(
        "UPDATE coop_orders SET status = %s, status_changed_at = NOW()"
        + (", confirmed_at = COALESCE(confirmed_at, NOW())" if confirming else "")
        + " WHERE id = %s RETURNING *",
        (new_status, order_id)
    )
    updated = _row_to_dict(cur.fetchone())
    log_order_status(cur, order_id, new_status)

    if confirming and new_status == 'accepted':
        note = ("✅ Подтверждено: оплата получена, заказ принят в работу. "
                "Дальше здесь и на почте вы будете видеть его статусы: "
                "принят → в обработке → в доставке → выдан.")
    else:
        note = f"Статус заказа изменён: {STATUS_LABELS[new_status]}"
    _post_system_message(cur, order_id, note)

    if updated.get("user_id"):
        cur.execute("SELECT full_name, email FROM coop_users WHERE id = %s LIMIT 1", (updated["user_id"],))
        u = cur.fetchone()
        if u and u.get("email"):
            try:
                from ..email_service import email_store_order_status
                email_store_order_status(
                    u.get("full_name") or "", u["email"], order_id,
                    float(updated.get("total") or 0), new_status, updated.get("items")
                )
            except Exception as e:
                print(f"[store] status email failed for order {order_id}: {e}")
    # The buyer hears about every change except the cancellation they made themselves
    if updated.get("user_id") and not by.startswith("buyer"):
        notify_user(
            updated.get("user_id"), key=f"status:{order_id}",
            title=f"Заказ №{order_id}: {STATUS_LABELS[new_status].lower()}",
            body=note, url=f"/orders?order={order_id}", email=False,
        )
    print(f"[store] order #{order_id}: {old_status} → {new_status} by {by}")
    return updated, None


# ══════════════════════════════════════════════════
# STOREFRONT
# ══════════════════════════════════════════════════
def _hide_promo_price(row: dict):
    """Swap the promo price for a flag: the public catalog only says one exists."""
    promo = row.pop("promo_price", None)
    base = float(row.get("price") or 0)
    row["has_promo_price"] = promo is not None and 0 < float(promo) < base


@bp.route("/api/store/catalog")
def store_catalog():
    """Categories and products with base prices only.

    Promo prices are not part of the public catalog: they are handed out by
    /api/store/promo/validate to someone who holds a working code.
    """
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    try:
        with get_db() as cur:
            cur.execute("""
                SELECT id, name, description, hero_image, slogan, intro, request_text,
                       compare_label_1, compare_label_2, accent_color, accent_strong
                FROM coop_categories ORDER BY sort_order ASC, created_at ASC
            """)
            cats = _rows_to_list(cur.fetchall())
            try:
                cur.execute("""
                    SELECT id, category_id, name, description, image, accent_color, slogan, is_brand
                    FROM coop_subcategories ORDER BY sort_order ASC, created_at ASC
                """)
                subcats = _rows_to_list(cur.fetchall())
            except Exception:
                subcats = []
            cur.execute("""
                SELECT id, name, description, price, promo_price, compare_price_1, compare_price_2,
                       category_id, subcategory_id, badge, image_url, is_available, requires_variant, created_at
                FROM coop_products ORDER BY created_at DESC
            """)
            prods = _rows_to_list(cur.fetchall())
            try:
                cur.execute("SELECT product_id, url, is_main, sort_order FROM coop_product_images ORDER BY sort_order ASC, id ASC")
                img_map: dict = {}
                for img in _rows_to_list(cur.fetchall()):
                    img_map.setdefault(img["product_id"], []).append({"url": img["url"], "is_main": img["is_main"]})
            except Exception:
                img_map = {}
            cur.execute("""
                SELECT id, product_id, label, price, promo_price, compare_price_1, compare_price_2, is_available
                FROM ref_product_variants ORDER BY sort_order ASC, id ASC
            """)
            var_map: dict = {}
            for v in _rows_to_list(cur.fetchall()):
                _hide_promo_price(v)
                var_map.setdefault(v.pop("product_id"), []).append(v)
        for p in prods:
            _hide_promo_price(p)
            p["images"] = img_map.get(p["id"], [])
            p["variants"] = var_map.get(p["id"], [])
        return jsonify({"categories": cats, "subcategories": subcats, "products": prods})
    except Exception as e:
        print(f"[/api/store/catalog] {e}")
        return jsonify({"categories": [], "subcategories": [], "products": []})


@bp.route("/api/store/promo/validate", methods=["POST"])
def store_validate_promo():
    # Own bucket: guessing codes is throttled without touching login limits.
    if rate_limited(10, "promo"):
        return jsonify({"error": "Слишком много попыток. Подождите минуту."}), 429
    code = sanitize_string((request.json or {}).get("code") or "", 50).upper()
    try:
        with get_db() as cur:
            promo, err = load_promo(cur, code)
            if err:
                return jsonify({"error": err}), 404
            cur.execute("SELECT id, category_id, price, promo_price FROM coop_products WHERE promo_price IS NOT NULL")
            prices = {}
            for row in cur.fetchall():
                if not promo_covers(promo, row["id"], row.get("category_id")):
                    continue
                unit, base = _effective_price(row, True)
                if unit < base:
                    prices[str(row["id"])] = unit
            # Variants share the map under "v<id>" so product and variant ids never clash.
            cur.execute("""SELECT v.id, v.product_id, p.category_id, v.price, v.promo_price
                           FROM ref_product_variants v JOIN coop_products p ON p.id = v.product_id
                           WHERE v.promo_price IS NOT NULL""")
            for row in cur.fetchall():
                if not promo_covers(promo, row["product_id"], row.get("category_id")):
                    continue
                unit, base = _effective_price(row, True)
                if unit < base:
                    prices[f"v{row['id']}"] = unit
            scope_text = promo_scope_text(cur, promo)
            # A signed-in buyer's codes are remembered for the expiry reminder
            uid = auth_user_id()
            if uid:
                cur.execute(
                    """INSERT INTO ref_promo_activations (user_id, promo_id) VALUES (%s, %s)
                       ON CONFLICT (user_id, promo_id) DO UPDATE SET seen_at = NOW()""",
                    (uid, promo["id"]),
                )
        expires = promo.get("expires_at")
        return jsonify({
            "valid": True,
            "code": promo["code"].upper(),
            "label": promo.get("label") or "",
            "leader_name": _first_name(promo.get("leader_name") or ""),
            "expires_at": expires.isoformat() if expires else None,
            "prices": prices,
            "scope": promo.get("scope") or "all",
            "scope_category_id": promo.get("scope_category_id"),
            "scope_product_ids": sorted(_scope_ids(promo)) if (promo.get("scope") or "all") == "products" else [],
            "scope_text": scope_text,
        })
    except Exception as e:
        print(f"[/api/store/promo/validate] {e}")
        return jsonify({"error": "Ошибка проверки промокода"}), 500


@bp.route("/api/sitemap.xml")
def sitemap_xml():
    """Served as /sitemap.xml (nginx): the main page, the catalog and each
    category's own address, so search engines find them all."""
    base = "https://refsale.ru"
    urls = [("/", "1.0", "daily"), ("/catalog", "0.9", "daily"), ("/forums", "0.5", "daily")]
    try:
        with get_db() as cur:
            cur.execute("SELECT id FROM coop_categories ORDER BY sort_order ASC, created_at ASC")
            urls += [(f"/catalog?c={r['id']}", "0.8", "daily") for r in cur.fetchall()]
    except Exception as e:
        print(f"[/api/sitemap.xml] {e}")
    body = "".join(
        f"<url><loc>{base}{loc.replace('&', '&amp;')}</loc><changefreq>{freq}</changefreq><priority>{prio}</priority></url>"
        for loc, prio, freq in urls
    )
    xml = f'<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{body}</urlset>'
    return xml, 200, {"Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600"}


@bp.route("/api/store/news")
def store_news():
    """What is new since the visitor last looked, for the counters in the menu:
    forum posts and reviews after the ids they saw, and the newest product."""
    def _seen(name):
        try:
            return max(0, int(request.args.get(name) or 0))
        except ValueError:
            return 0
    try:
        with get_db() as cur:
            cur.execute("SELECT COALESCE(MAX(id), 0) AS m, COUNT(*) FILTER (WHERE id > %s) AS n FROM coop_forum_posts", (_seen("forum"),))
            forum = cur.fetchone()
            cur.execute("SELECT COALESCE(MAX(id), 0) AS m, COUNT(*) FILTER (WHERE id > %s) AS n FROM coop_reviews", (_seen("reviews"),))
            reviews = cur.fetchone()
            cur.execute("SELECT COALESCE(MAX(id), 0) AS m FROM coop_products")
            products = cur.fetchone()
        return jsonify({
            "forum_max": forum["m"], "forum_new": forum["n"],
            "reviews_max": reviews["m"], "reviews_new": reviews["n"],
            "products_max": products["m"],
        })
    except Exception as e:
        print(f"[/api/store/news] {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/store/promo/forget", methods=["POST"])
def store_forget_promo():
    """The buyer took a code off: no reminders about it any more."""
    uid, err = require_auth()
    if err:
        return err
    code = sanitize_string((request.json or {}).get("code") or "", 50).upper()
    try:
        with get_db() as cur:
            cur.execute(
                """DELETE FROM ref_promo_activations a USING ref_promos p
                   WHERE a.promo_id = p.id AND a.user_id = %s AND UPPER(p.code) = %s""",
                (uid, code),
            )
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[/api/store/promo/forget] {e}")
        return jsonify({"ok": False}), 500


@bp.route("/api/store/register", methods=["POST"])
def store_quick_register():
    """Instant account: name, email, password. No admin approval, no address.

    Needed before the first order or question, so the buyer has a chat and
    order statuses to come back to.
    """
    if rate_limited_auth():
        return jsonify({"error": "Слишком много попыток. Подождите минуту."}), 429
    d = request.json or {}
    full_name = sanitize_string(d.get("full_name") or "", 200)
    email = sanitize_string(d.get("email") or "", 255).strip().lower()
    phone = sanitize_string(d.get("phone") or "", 30)
    password = (d.get("password") or "").strip()
    if not full_name:
        return jsonify({"error": "Укажите имя"}), 400
    if not email or "@" not in email or "." not in email.split("@")[-1]:
        return jsonify({"error": "Укажите корректный email"}), 400
    if len(password) < 6:
        return jsonify({"error": "Пароль минимум 6 символов"}), 400
    try:
        with get_db() as cur:
            cur.execute("SELECT id FROM coop_users WHERE LOWER(email) = %s LIMIT 1", (email,))
            if cur.fetchone():
                return jsonify({"error": "Этот email уже зарегистрирован — войдите в аккаунт", "exists": True}), 409
            if phone:
                cur.execute("SELECT id FROM coop_users WHERE phone = %s LIMIT 1", (phone,))
                if cur.fetchone():
                    phone = ""  # keep the account, drop the clashing number
            cur.execute(
                """INSERT INTO coop_users (full_name, phone, email, address, password, is_approved)
                   VALUES (%s, %s, %s, '', %s, TRUE) RETURNING *""",
                (full_name, phone or None, email, hash_password(password))
            )
            user = _row_to_dict(cur.fetchone())
            user.pop("password", None)
        try:
            from ..email_service import email_store_welcome
            email_store_welcome(full_name, email)
        except Exception:
            pass
        return jsonify({"user": user, "token": create_user_token(user["id"])})
    except Exception as e:
        print(f"[/api/store/register] {e}")
        return jsonify({"error": "Ошибка регистрации"}), 500


@bp.route("/api/store/orders", methods=["POST"])
def store_create_order():
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    uid, err = require_auth()
    if err:
        return err
    d = request.json or {}
    full_name = sanitize_string(d.get("full_name") or "", 200)
    phone = sanitize_string(d.get("phone") or "", 30)
    address = sanitize_string(d.get("address") or "", 500)
    comment = sanitize_string(d.get("comment") or "", 1000)
    contact_method = (d.get("contact_method") or "phone").strip()
    if contact_method not in CONTACT_METHODS:
        contact_method = "phone"
    # Only the cart is required: the buyer is signed in, so the name comes from
    # the account, and the manager asks for the address in the order chat.
    # Fewer fields between "Оформить" and a placed order.

    raw_items = d.get("items") or []
    if not isinstance(raw_items, list) or not raw_items:
        return jsonify({"error": "Корзина пуста"}), 400
    # Keyed by (product id, variant id or None): two sizes of one perfume are
    # two lines with two prices.
    wanted: dict = {}
    notes: dict = {}
    for it in raw_items:
        if not isinstance(it, dict):
            continue
        try:
            pid = int(it.get("id") or 0)
            qty = int(it.get("qty") or 1)
            vid = int(it["variant_id"]) if it.get("variant_id") not in (None, "", 0) else None
        except (TypeError, ValueError):
            continue
        if pid <= 0 or qty <= 0:
            continue
        key = (pid, vid)
        wanted[key] = min(wanted.get(key, 0) + qty, MAX_QTY)
        note = sanitize_string(it.get("variant_comment") or "", 300)
        if note:
            notes[key] = note
    if not wanted:
        return jsonify({"error": "Корзина пуста"}), 400

    # Several codes can be on at once (one for perfume, another for food);
    # promo_code is the old single-code form.
    raw_codes = d.get("promo_codes")
    if not isinstance(raw_codes, list):
        raw_codes = [d.get("promo_code")] if d.get("promo_code") else []
    codes = []
    for c in raw_codes[:MAX_PROMO_CODES]:
        c = sanitize_string(c or "", 50).upper()
        if c and c not in codes:
            codes.append(c)
    try:
        with get_db() as cur:
            promos = []
            for c in codes:
                p, perr = load_promo(cur, c)
                if perr:
                    return jsonify({"error": f"Промокод {c}: {perr[0].lower() + perr[1:]}. Уберите его или введите другой.",
                                   "promo_invalid": True, "promo_code": c}), 400
                promos.append(p)

            if not full_name:
                cur.execute("SELECT full_name FROM coop_users WHERE id = %s", (uid,))
                full_name = ((cur.fetchone() or {}).get("full_name") or "").strip() or "Покупатель"

            pids = list({pid for pid, _ in wanted})
            cur.execute(
                "SELECT id, name, category_id, price, promo_price, is_available, image_url FROM coop_products WHERE id = ANY(%s)",
                (pids,)
            )
            products = {row["id"]: row for row in cur.fetchall()}
            cur.execute(
                "SELECT id, product_id, label, price, promo_price, is_available FROM ref_product_variants WHERE product_id = ANY(%s)",
                (pids,)
            )
            variants: dict = {}
            for row in cur.fetchall():
                variants[row["id"]] = row
            has_variants = {row["product_id"] for row in variants.values()}
            items, total, discount = [], 0.0, 0.0
            covered: dict = {}  # promo id → value of the items it covers
            for (pid, vid), qty in wanted.items():
                p = products.get(pid)
                if not p or p.get("is_available") is False:
                    name = p["name"] if p else f"#{pid}"
                    return jsonify({"error": f"Товар «{name}» сейчас недоступен — уберите его из корзины"}), 409
                name, priced = p["name"], p
                if vid is not None or pid in has_variants:
                    v = variants.get(vid)
                    if not v or v["product_id"] != pid:
                        return jsonify({"error": f"Выберите объём или упаковку для «{p['name']}» заново"}), 409
                    if v.get("is_available") is False:
                        return jsonify({"error": f"«{p['name']} — {v['label']}» сейчас нет в наличии"}), 409
                    name, priced = f"{p['name']} — {v['label']}", v
                # The narrowest code that covers the item is the one it is
                # bought with: a perfume code beats a whole-catalog one
                covering = [pr for pr in promos if promo_covers(pr, pid, p.get("category_id"))]
                covering.sort(key=lambda pr: _SCOPE_RANK.get(pr.get("scope") or "all", 2))
                used = covering[0] if covering else None
                unit, base = _effective_price(priced, used is not None)
                line = {"id": pid, "name": name, "qty": qty, "price": unit,
                        "base_price": base, "image_url": p.get("image_url")}
                if used is not None:
                    line["promo_code"] = used["code"].upper()
                    covered[used["id"]] = covered.get(used["id"], 0.0) + base * qty
                if vid is not None:
                    line["variant_id"] = vid
                if (pid, vid) in notes:
                    line["variant_comment"] = notes[(pid, vid)]
                items.append(line)
                total += unit * qty
                discount += (base - unit) * qty

            # Codes that lowered nothing in this cart are not part of the order.
            # The order is credited to the code covering the most of it.
            used_promos = [pr for pr in promos if pr["id"] in covered]
            promo = max(used_promos, key=lambda pr: covered[pr["id"]]) if used_promos else None
            cur.execute(
                """INSERT INTO coop_orders
                   (full_name, phone, address, comment, items, total, status, user_id,
                    promo_code, promo_codes, discount_amount, ref_promo_id, leader_id, leader_reward,
                    contact_method, status_changed_at)
                   VALUES (%s, %s, %s, %s, %s, %s, 'new', %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                   RETURNING *""",
                (full_name, phone, address, comment, json.dumps(items, ensure_ascii=False),
                 round(total, 2), uid,
                 promo["code"].upper() if promo else None,
                 json.dumps([pr["code"].upper() for pr in used_promos]) if used_promos else None,
                 round(discount, 2),
                 promo["id"] if promo else None,
                 promo.get("leader_id") if promo else None,
                 float(promo.get("reward_amount") or 0) if promo else 0,
                 contact_method)
            )
            order = _row_to_dict(cur.fetchone())
            log_order_status(cur, order["id"], "new")
            for pr in used_promos:
                cur.execute("UPDATE ref_promos SET current_uses = current_uses + 1 WHERE id = %s", (pr["id"],))
            ask = "" if address else " и уточнит адрес доставки"
            _post_system_message(
                cur, order["id"],
                f"Здравствуйте! Заказ №{order['id']} получен. Менеджер ответит здесь: "
                f"подтвердит наличие и сроки{ask}, затем пришлёт реквизиты для предоплаты. "
                "После оплаты заказ будет подтверждён и вы увидите его статусы."
            )
            # Remember the phone on the account only if no other account has it:
            # phones are unique, and a clash must not fail the whole order.
            if phone:
                cur.execute(
                    """UPDATE coop_users SET phone = %s
                       WHERE id = %s AND (phone IS NULL OR phone = '')
                         AND NOT EXISTS (SELECT 1 FROM coop_users WHERE phone = %s AND id <> %s)""",
                    (phone, uid, phone, uid)
                )
            cur.execute("SELECT email, full_name FROM coop_users WHERE id = %s", (uid,))
            buyer = cur.fetchone() or {}

        try:
            from ..email_service import email_store_order_received, email_admin_new_order
            if buyer.get("email"):
                email_store_order_received(buyer.get("full_name") or full_name, buyer["email"],
                                           order["id"], float(order["total"]), order["items"])
            used = ", ".join(pr["code"].upper() for pr in used_promos)
            who = f"{full_name}" + (f" (промокод {used})" if used else "")
            email_admin_new_order(order["id"], who, phone or "—", float(order["total"]), order["items"])
        except Exception as e:
            print(f"[/api/store/orders] email failed: {e}")
        return jsonify(order)
    except Exception as e:
        print(f"[/api/store/orders] {e}")
        return jsonify({"error": "Ошибка создания заказа"}), 500


@bp.route("/api/store/my-orders")
def store_my_orders():
    uid, err = require_auth()
    if err:
        return err
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM coop_orders WHERE user_id = %s ORDER BY created_at DESC", (uid,))
            return jsonify(_rows_to_list(cur.fetchall()))
    except Exception:
        return jsonify([])


@bp.route("/api/store/orders/<int:oid>/cancel", methods=["POST"])
def store_cancel_order(oid):
    """Buyer may withdraw an order until it has been confirmed."""
    uid, err = require_auth()
    if err:
        return err
    try:
        with get_db() as cur:
            cur.execute("SELECT user_id, status FROM coop_orders WHERE id = %s", (oid,))
            o = cur.fetchone()
            if not o or o.get("user_id") != uid:
                return jsonify({"error": "Заказ не найден"}), 404
            if o.get("status") != "new":
                return jsonify({"error": "Заказ уже подтверждён — напишите в чат, чтобы отменить"}), 409
            updated, aerr = apply_order_status(cur, oid, "cancelled", by=f"buyer {uid}")
            if aerr:
                return jsonify({"error": aerr}), 400
        return jsonify(updated)
    except Exception as e:
        print(f"[/api/store/orders/{oid}/cancel] {e}")
        return jsonify({"error": "Ошибка отмены"}), 500


# ══════════════════════════════════════════════════
# OPINION LEADER CABINET
# ══════════════════════════════════════════════════
def _require_leader():
    uid, err = require_auth()
    if err:
        return None, err
    with get_db() as cur:
        cur.execute("SELECT id, full_name, is_leader, leader_can_write FROM coop_users WHERE id = %s", (uid,))
        row = cur.fetchone()
    if not row or not row.get("is_leader"):
        return None, (jsonify({"error": "Кабинет доступен только лидерам мнений"}), 403)
    return dict(row), None


def _leader_order(cur, leader_id: int, oid: int):
    cur.execute("SELECT * FROM coop_orders WHERE id = %s AND leader_id = %s LIMIT 1", (oid, leader_id))
    return cur.fetchone()


@bp.route("/api/leader/overview")
def leader_overview():
    leader, err = _require_leader()
    if err:
        return err
    lid = leader["id"]
    try:
        with get_db() as cur:
            cur.execute("""
                SELECT p.code, p.label, p.is_active, p.current_uses, p.max_uses, p.reward_amount,
                       p.expires_at, p.created_at,
                       (SELECT COUNT(*) FROM coop_orders o WHERE o.ref_promo_id = p.id) AS orders,
                       (SELECT COUNT(*) FROM coop_orders o WHERE o.ref_promo_id = p.id AND o.status = 'done') AS done
                FROM ref_promos p WHERE p.leader_id = %s ORDER BY p.created_at DESC
            """, (lid,))
            promos = _rows_to_list(cur.fetchall())
            cur.execute("""
                SELECT
                  COUNT(*) AS total,
                  COUNT(*) FILTER (WHERE status = 'new') AS awaiting,
                  COUNT(*) FILTER (WHERE status IN ('accepted','processing','shipping')) AS in_progress,
                  COUNT(*) FILTER (WHERE status = 'done') AS done,
                  COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
                  COALESCE(SUM(total) FILTER (WHERE status = 'done'), 0) AS revenue_done,
                  COALESCE(SUM(leader_reward) FILTER (WHERE status = 'done'), 0) AS reward_earned,
                  COALESCE(SUM(leader_reward) FILTER (WHERE status IN ('new','accepted','processing','shipping')), 0) AS reward_pending
                FROM coop_orders WHERE leader_id = %s
            """, (lid,))
            stats = _row_to_dict(cur.fetchone())
        return jsonify({
            "leader": {"name": leader["full_name"], "can_write": bool(leader.get("leader_can_write"))},
            "promos": promos,
            "stats": stats,
        })
    except Exception as e:
        print(f"[/api/leader/overview] {e}")
        return jsonify({"error": "Ошибка загрузки"}), 500


@bp.route("/api/leader/orders")
def leader_orders():
    leader, err = _require_leader()
    if err:
        return err
    try:
        with get_db() as cur:
            cur.execute("""
                SELECT o.id, o.full_name, o.status, o.total, o.discount_amount, o.items, o.promo_code,
                       o.leader_reward, o.created_at, o.confirmed_at, o.status_changed_at,
                       (SELECT text FROM coop_order_messages m WHERE m.order_id = o.id ORDER BY m.id DESC LIMIT 1) AS last_text,
                       (SELECT created_at FROM coop_order_messages m WHERE m.order_id = o.id ORDER BY m.id DESC LIMIT 1) AS last_at,
                       (SELECT COUNT(*) FROM coop_order_messages m WHERE m.order_id = o.id) AS msg_count
                FROM coop_orders o WHERE o.leader_id = %s
                ORDER BY o.created_at DESC
            """, (leader["id"],))
            rows = _rows_to_list(cur.fetchall())
        for r in rows:
            r["buyer"] = _masked_name(r.pop("full_name", ""))
        return jsonify(rows)
    except Exception as e:
        print(f"[/api/leader/orders] {e}")
        return jsonify([])


@bp.route("/api/leader/orders/<int:oid>/messages")
def leader_order_messages(oid):
    leader, err = _require_leader()
    if err:
        return err
    try:
        with get_db() as cur:
            order = _leader_order(cur, leader["id"], oid)
            if not order:
                return jsonify({"error": "Заказ не найден"}), 404
            cur.execute("SELECT * FROM coop_order_messages WHERE order_id = %s ORDER BY created_at ASC", (oid,))
            msgs = _mask_buyers(_rows_to_list(cur.fetchall()))
            history = order_status_history(cur, oid)
        return jsonify({"messages": msgs, "status": order["status"], "history": history,
                        "can_write": bool(leader.get("leader_can_write"))})
    except Exception as e:
        print(f"[/api/leader/orders/{oid}/messages] {e}")
        return jsonify({"messages": [], "status": None, "can_write": False})


@bp.route("/api/leader/orders/<int:oid>/messages", methods=["POST"])
def leader_post_order_message(oid):
    if rate_limited():
        return jsonify({"error": "rate limit"}), 429
    leader, err = _require_leader()
    if err:
        return err
    if not leader.get("leader_can_write"):
        return jsonify({"error": "Режим только просмотра — писать в чаты пока нельзя"}), 403
    d = request.json or {}
    text = sanitize_string(d.get("text") or "", 2000)
    images = sanitize_image_urls(d.get("images"))
    if not text.strip() and images == "[]":
        return jsonify({"error": "Напишите сообщение"}), 400
    try:
        with get_db() as cur:
            order = _leader_order(cur, leader["id"], oid)
            if not order:
                return jsonify({"error": "Заказ не найден"}), 404
            if order["status"] in ("done", "cancelled"):
                return jsonify({"error": "Заказ завершён — чат закрыт"}), 409
            cur.execute(
                "INSERT INTO coop_order_messages (order_id, sender_type, sender_name, text, images) "
                "VALUES (%s, 'leader', %s, %s, %s) RETURNING *",
                (oid, leader["full_name"], text, images)
            )
            msg = _row_to_dict(cur.fetchone())
            cur.execute("SELECT user_id FROM coop_orders WHERE id = %s", (oid,))
            buyer = (cur.fetchone() or {}).get("user_id")
        notify_user(
            buyer, key=f"order:{oid}",
            title=f"Новое сообщение по заказу №{oid}", body=snippet(text, images),
            url=f"/orders?order={oid}", email_subject=f"Новое сообщение по заказу №{oid}",
        )
        return jsonify(msg), 201
    except Exception as e:
        print(f"[/api/leader/orders/{oid}/messages POST] {e}")
        return jsonify({"error": "Ошибка отправки"}), 500


@bp.route("/api/leader/orders/<int:oid>/status", methods=["POST"])
def leader_set_order_status(oid):
    """Only for leaders the admin trusted with processing their own orders."""
    leader, err = _require_leader()
    if err:
        return err
    if not leader.get("leader_can_write"):
        return jsonify({"error": "Режим только просмотра"}), 403
    status = (request.json or {}).get("status") or ""
    try:
        with get_db() as cur:
            if not _leader_order(cur, leader["id"], oid):
                return jsonify({"error": "Заказ не найден"}), 404
            updated, aerr = apply_order_status(cur, oid, status, by=f"leader {leader['id']}")
            if aerr:
                return jsonify({"error": aerr}), 400
        return jsonify(updated)
    except Exception as e:
        print(f"[/api/leader/orders/{oid}/status] {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ══════════════════════════════════════════════════
# ADMIN (protected by the app-level /api/admin guard)
# ══════════════════════════════════════════════════
@bp.route("/api/admin/store/orders")
def admin_store_orders():
    status = request.args.get("status") or ""
    try:
        with get_db() as cur:
            sql = """
                SELECT o.*, u.email AS user_email, l.full_name AS leader_name,
                       (SELECT text FROM coop_order_messages m WHERE m.order_id = o.id ORDER BY m.id DESC LIMIT 1) AS last_text,
                       (SELECT sender_type FROM coop_order_messages m WHERE m.order_id = o.id ORDER BY m.id DESC LIMIT 1) AS last_sender,
                       (SELECT created_at FROM coop_order_messages m WHERE m.order_id = o.id ORDER BY m.id DESC LIMIT 1) AS last_at
                FROM coop_orders o
                LEFT JOIN coop_users u ON u.id = o.user_id
                LEFT JOIN coop_users l ON l.id = o.leader_id
            """
            params: tuple = ()
            if status in STORE_STATUSES:
                sql += " WHERE o.status = %s"
                params = (status,)
            sql += " ORDER BY o.created_at DESC LIMIT 500"
            cur.execute(sql, params)
            rows = _rows_to_list(cur.fetchall())
        for r in rows:
            r["needs_reply"] = r.get("last_sender") == "user"
        return jsonify(rows)
    except Exception as e:
        print(f"[/api/admin/store/orders] {e}")
        return jsonify([])


@bp.route("/api/admin/store/orders/<int:oid>/confirm", methods=["POST"])
def admin_store_confirm(oid):
    """"Подтверждено": prepayment received — the order enters the status flow."""
    try:
        with get_db() as cur:
            cur.execute("SELECT status FROM coop_orders WHERE id = %s", (oid,))
            o = cur.fetchone()
            if not o:
                return jsonify({"error": "Заказ не найден"}), 404
            if o["status"] != "new":
                return jsonify({"error": "Заказ уже подтверждён или закрыт"}), 409
            updated, err = apply_order_status(cur, oid, "accepted")
            if err:
                return jsonify({"error": err}), 400
        return jsonify(updated)
    except Exception as e:
        print(f"[/api/admin/store/orders/{oid}/confirm] {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/store/orders/<int:oid>/status", methods=["POST"])
def admin_store_set_status(oid):
    status = (request.json or {}).get("status") or ""
    try:
        with get_db() as cur:
            updated, err = apply_order_status(cur, oid, status)
            if err:
                return jsonify({"error": err}), 400
        return jsonify(updated)
    except Exception as e:
        print(f"[/api/admin/store/orders/{oid}/status] {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── Products: base and promo prices ───────────────
@bp.route("/api/admin/store/products")
def admin_store_products():
    try:
        with get_db() as cur:
            cur.execute("""
                SELECT p.id, p.name, p.price, p.promo_price, p.image_url, p.is_available,
                       p.category_id, c.name AS category_name
                FROM coop_products p LEFT JOIN coop_categories c ON c.id = p.category_id
                ORDER BY c.name NULLS LAST, p.name
            """)
            return jsonify(_rows_to_list(cur.fetchall()))
    except Exception as e:
        print(f"[/api/admin/store/products] {e}")
        return jsonify([])


@bp.route("/api/admin/store/products/<int:pid>", methods=["PATCH"])
def admin_store_update_product(pid):
    d = request.json or {}
    sets, params = [], []

    def _num(v):
        if v in (None, ""):
            return None
        return round(float(v), 2)

    try:
        if "price" in d:
            price = _num(d["price"])
            if price is None or price <= 0:
                return jsonify({"error": "Цена должна быть больше нуля"}), 400
            sets.append("price = %s"); params.append(price)
        if "promo_price" in d:
            promo = _num(d["promo_price"])
            if promo is not None and promo <= 0:
                return jsonify({"error": "Цена по промокоду должна быть больше нуля"}), 400
            sets.append("promo_price = %s"); params.append(promo)
        if "is_available" in d:
            sets.append("is_available = %s"); params.append(bool(d["is_available"]))
    except (TypeError, ValueError):
        return jsonify({"error": "Некорректная цена"}), 400
    if not sets:
        return jsonify({"error": "Нечего обновлять"}), 400
    try:
        with get_db() as cur:
            cur.execute(f"UPDATE coop_products SET {', '.join(sets)} WHERE id = %s RETURNING id, name, price, promo_price, is_available",
                        (*params, pid))
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "Товар не найден"}), 404
            return jsonify(_row_to_dict(row))
    except Exception as e:
        print(f"[/api/admin/store/products/{pid}] {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/store/products/<int:pid>/variants")
def admin_product_variants(pid):
    try:
        with get_db() as cur:
            cur.execute("SELECT * FROM ref_product_variants WHERE product_id = %s ORDER BY sort_order, id", (pid,))
            return jsonify(_rows_to_list(cur.fetchall()))
    except Exception as e:
        print(f"[/api/admin/store/products/{pid}/variants] {e}")
        return jsonify([])


@bp.route("/api/admin/store/products/<int:pid>/variants", methods=["PUT"])
def admin_save_product_variants(pid):
    """Replace the product's variant list with the one sent, in that order.

    Rows that carry an id are updated, rows without one are added, and
    variants missing from the list are deleted.
    """
    raw = (request.json or {}).get("variants")
    if not isinstance(raw, list):
        return jsonify({"error": "Нужен список вариантов"}), 400

    def _num(v):
        return None if v in (None, "") else round(float(v), 2)

    clean = []
    try:
        for i, v in enumerate(raw):
            if not isinstance(v, dict):
                continue
            label = sanitize_string(v.get("label") or "", 200).strip()
            price = _num(v.get("price"))
            if not label:
                return jsonify({"error": f"Вариант {i + 1}: укажите название, например «50 мл, тестер»"}), 400
            if price is None or price <= 0:
                return jsonify({"error": f"«{label}»: цена должна быть больше нуля"}), 400
            if price > MAX_PRICE:
                return jsonify({"error": f"«{label}»: слишком большая цена"}), 400
            row = {
                "id": int(v["id"]) if v.get("id") else None,
                "label": label,
                "price": price,
                "promo_price": _num(v.get("promo_price")),
                "compare_price_1": _num(v.get("compare_price_1")),
                "compare_price_2": _num(v.get("compare_price_2")),
                "is_available": v.get("is_available") is not False,
                "sort_order": i,
            }
            for f in ("promo_price", "compare_price_1", "compare_price_2"):
                if row[f] is not None and (row[f] <= 0 or row[f] > MAX_PRICE):
                    row[f] = None
            clean.append(row)
    except (TypeError, ValueError):
        return jsonify({"error": "Некорректная цена"}), 400

    try:
        with get_db() as cur:
            cur.execute("SELECT 1 FROM coop_products WHERE id = %s", (pid,))
            if not cur.fetchone():
                return jsonify({"error": "Товар не найден"}), 404
            keep = [r["id"] for r in clean if r["id"]]
            cur.execute(
                "DELETE FROM ref_product_variants WHERE product_id = %s AND NOT (id = ANY(%s))",
                (pid, keep)
            )
            for r in clean:
                vals = (r["label"], r["price"], r["promo_price"], r["compare_price_1"],
                        r["compare_price_2"], r["is_available"], r["sort_order"])
                if r["id"]:
                    cur.execute(
                        """UPDATE ref_product_variants SET label = %s, price = %s, promo_price = %s,
                               compare_price_1 = %s, compare_price_2 = %s, is_available = %s, sort_order = %s
                           WHERE id = %s AND product_id = %s""",
                        (*vals, r["id"], pid)
                    )
                else:
                    cur.execute(
                        """INSERT INTO ref_product_variants
                           (label, price, promo_price, compare_price_1, compare_price_2, is_available, sort_order, product_id)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                        (*vals, pid)
                    )
            cur.execute("SELECT * FROM ref_product_variants WHERE product_id = %s ORDER BY sort_order, id", (pid,))
            return jsonify(_rows_to_list(cur.fetchall()))
    except Exception as e:
        print(f"[/api/admin/store/products/{pid}/variants PUT] {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── Referral promo codes ──────────────────────────
_PROMO_COLS = ("code", "label", "leader_id", "reward_amount", "is_active", "max_uses", "expires_at",
               "scope", "scope_category_id", "scope_product_ids")


def _clean_promo_payload(d: dict) -> tuple[dict, str | None]:
    out: dict = {}
    if "code" in d:
        code = sanitize_string(d.get("code") or "", 50).strip().upper().replace(" ", "")
        if not code:
            return {}, "Укажите промокод"
        out["code"] = code
    if "label" in d:
        out["label"] = sanitize_string(d.get("label") or "", 255)
    if "leader_id" in d:
        try:
            out["leader_id"] = int(d["leader_id"]) if d["leader_id"] not in (None, "", 0, "0") else None
        except (TypeError, ValueError):
            return {}, "Некорректный лидер"
    if "reward_amount" in d:
        try:
            out["reward_amount"] = max(0.0, round(float(d.get("reward_amount") or 0), 2))
        except (TypeError, ValueError):
            return {}, "Некорректное вознаграждение"
    if "is_active" in d:
        out["is_active"] = bool(d["is_active"])
    if "max_uses" in d:
        try:
            out["max_uses"] = int(d["max_uses"]) if d["max_uses"] not in (None, "") else None
        except (TypeError, ValueError):
            return {}, "Некорректный лимит"
    if "expires_at" in d:
        out["expires_at"] = d["expires_at"] or None
    if "scope" in d:
        scope = d.get("scope") or "all"
        if scope not in ("all", "category", "products"):
            return {}, "Неизвестная область действия"
        out["scope"] = scope
        out["scope_category_id"] = None
        out["scope_product_ids"] = "[]"
        if scope == "category":
            try:
                out["scope_category_id"] = int(d.get("scope_category_id"))
            except (TypeError, ValueError):
                return {}, "Выберите категорию для промокода"
        if scope == "products":
            try:
                ids = sorted({int(x) for x in (d.get("scope_product_ids") or [])})
            except (TypeError, ValueError):
                return {}, "Некорректный список товаров"
            if not ids:
                return {}, "Выберите хотя бы один товар для промокода"
            out["scope_product_ids"] = json.dumps(ids)
    return out, None


@bp.route("/api/admin/store/promos")
def admin_store_promos():
    try:
        with get_db() as cur:
            cur.execute("""
                SELECT p.*, u.full_name AS leader_name, u.email AS leader_email,
                       (SELECT COUNT(*) FROM coop_orders o WHERE o.ref_promo_id = p.id) AS orders,
                       (SELECT COUNT(*) FROM coop_orders o WHERE o.ref_promo_id = p.id AND o.status = 'done') AS done,
                       (SELECT COALESCE(SUM(o.leader_reward), 0) FROM coop_orders o WHERE o.ref_promo_id = p.id AND o.status = 'done') AS reward_earned
                FROM ref_promos p LEFT JOIN coop_users u ON u.id = p.leader_id
                ORDER BY p.created_at DESC
            """)
            promos = _rows_to_list(cur.fetchall())
            enabled = _promos_enabled(cur)
        return jsonify({"promos": promos, "enabled": enabled})
    except Exception as e:
        print(f"[/api/admin/store/promos] {e}")
        return jsonify({"promos": [], "enabled": True})


@bp.route("/api/admin/store/promos", methods=["POST"])
def admin_store_create_promo():
    data, err = _clean_promo_payload(request.json or {})
    if err:
        return jsonify({"error": err}), 400
    if "code" not in data:
        return jsonify({"error": "Укажите промокод"}), 400
    data.setdefault("is_active", True)
    cols = [c for c in _PROMO_COLS if c in data]
    try:
        with get_db() as cur:
            cur.execute("SELECT id FROM ref_promos WHERE UPPER(code) = %s", (data["code"],))
            if cur.fetchone():
                return jsonify({"error": "Такой промокод уже есть"}), 409
            cur.execute(
                f"INSERT INTO ref_promos ({', '.join(cols)}) VALUES ({', '.join(['%s'] * len(cols))}) RETURNING *",
                tuple(data[c] for c in cols)
            )
            promo = _row_to_dict(cur.fetchone())
            if promo.get("leader_id"):
                # Owning a code makes the account a leader — the cabinet opens.
                cur.execute("UPDATE coop_users SET is_leader = TRUE WHERE id = %s", (promo["leader_id"],))
        return jsonify(promo)
    except Exception as e:
        print(f"[/api/admin/store/promos POST] {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/store/promos/<int:pid>", methods=["PATCH"])
def admin_store_update_promo(pid):
    data, err = _clean_promo_payload(request.json or {})
    if err:
        return jsonify({"error": err}), 400
    cols = [c for c in _PROMO_COLS if c in data]
    if not cols:
        return jsonify({"error": "Нечего обновлять"}), 400
    try:
        with get_db() as cur:
            if "code" in data:
                cur.execute("SELECT id FROM ref_promos WHERE UPPER(code) = %s AND id <> %s", (data["code"], pid))
                if cur.fetchone():
                    return jsonify({"error": "Такой промокод уже есть"}), 409
            cur.execute(
                f"UPDATE ref_promos SET {', '.join(c + ' = %s' for c in cols)} WHERE id = %s RETURNING *",
                (*[data[c] for c in cols], pid)
            )
            promo = cur.fetchone()
            if not promo:
                return jsonify({"error": "Промокод не найден"}), 404
            if promo.get("leader_id"):
                cur.execute("UPDATE coop_users SET is_leader = TRUE WHERE id = %s", (promo["leader_id"],))
        return jsonify(_row_to_dict(promo))
    except Exception as e:
        print(f"[/api/admin/store/promos/{pid} PATCH] {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


@bp.route("/api/admin/store/promos/<int:pid>", methods=["DELETE"])
def admin_store_delete_promo(pid):
    """Orders keep their promo_code and leader — only the code itself goes."""
    try:
        with get_db() as cur:
            cur.execute("DELETE FROM ref_promos WHERE id = %s", (pid,))
        return jsonify({"ok": True})
    except Exception as e:
        print(f"[/api/admin/store/promos/{pid} DELETE] {e}")
        return jsonify({"error": "Ошибка сервера"}), 500


# ── Leaders ───────────────────────────────────────
@bp.route("/api/admin/store/leaders")
def admin_store_leaders():
    try:
        with get_db() as cur:
            cur.execute("""
                SELECT u.id, u.full_name, u.email, u.phone, u.is_leader, u.leader_can_write, u.created_at,
                       (SELECT COUNT(*) FROM ref_promos p WHERE p.leader_id = u.id) AS promos,
                       (SELECT COUNT(*) FROM coop_orders o WHERE o.leader_id = u.id) AS orders,
                       (SELECT COUNT(*) FROM coop_orders o WHERE o.leader_id = u.id AND o.status = 'done') AS done,
                       (SELECT COALESCE(SUM(o.leader_reward), 0) FROM coop_orders o WHERE o.leader_id = u.id AND o.status = 'done') AS reward_earned
                FROM coop_users u WHERE u.is_leader = TRUE
                ORDER BY u.full_name
            """)
            return jsonify(_rows_to_list(cur.fetchall()))
    except Exception as e:
        print(f"[/api/admin/store/leaders] {e}")
        return jsonify([])


@bp.route("/api/admin/store/users")
def admin_store_users():
    """Account search for picking a leader."""
    q = sanitize_string(request.args.get("q") or "", 100).strip()
    try:
        with get_db() as cur:
            if q:
                like = f"%{q.lower()}%"
                cur.execute(
                    """SELECT id, full_name, email, phone, is_leader FROM coop_users
                       WHERE LOWER(full_name) LIKE %s OR LOWER(email) LIKE %s OR phone LIKE %s
                       ORDER BY full_name LIMIT 30""",
                    (like, like, f"%{q}%")
                )
            else:
                cur.execute("SELECT id, full_name, email, phone, is_leader FROM coop_users ORDER BY created_at DESC LIMIT 30")
            return jsonify(_rows_to_list(cur.fetchall()))
    except Exception as e:
        print(f"[/api/admin/store/users] {e}")
        return jsonify([])


@bp.route("/api/admin/store/users/<int:uid>/leader", methods=["PATCH"])
def admin_store_set_leader(uid):
    d = request.json or {}
    sets, params = [], []
    if "is_leader" in d:
        sets.append("is_leader = %s"); params.append(bool(d["is_leader"]))
    if "leader_can_write" in d:
        sets.append("leader_can_write = %s"); params.append(bool(d["leader_can_write"]))
    if "is_supplier" in d:
        sets.append("is_supplier = %s"); params.append(bool(d["is_supplier"]))
    if not sets:
        return jsonify({"error": "Нечего обновлять"}), 400
    try:
        with get_db() as cur:
            cur.execute(
                f"UPDATE coop_users SET {', '.join(sets)} WHERE id = %s "
                "RETURNING id, full_name, email, is_leader, leader_can_write, is_supplier",
                (*params, uid)
            )
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "Пользователь не найден"}), 404
        return jsonify(_row_to_dict(row))
    except Exception as e:
        print(f"[/api/admin/store/users/{uid}/leader] {e}")
        return jsonify({"error": "Ошибка сервера"}), 500
