"""Database structure RefSale needs on top of db/init.sql.

Runs once when the app starts (and from the scripts in scripts/). Every
statement is idempotent, so it is safe both on a fresh database and on one that
has been running for a while. Nothing here runs per request.
"""

from .db import get_db

_TABLES = [
    # Order chat and when the buyer last opened it (drives the unread badge)
    """CREATE TABLE IF NOT EXISTS coop_order_messages (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES coop_orders(id) ON DELETE CASCADE,
        sender_type VARCHAR(10) DEFAULT 'user',
        sender_name VARCHAR(255) DEFAULT '',
        text TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS coop_order_chat_seen (
        order_id INTEGER PRIMARY KEY REFERENCES coop_orders(id) ON DELETE CASCADE,
        seen_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    # Opinion leaders' referral codes
    """CREATE TABLE IF NOT EXISTS ref_promos (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        label VARCHAR(255) DEFAULT '',
        leader_id INTEGER REFERENCES coop_users(id) ON DELETE SET NULL,
        reward_amount NUMERIC(12,2) DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        max_uses INTEGER DEFAULT NULL,
        current_uses INTEGER DEFAULT 0,
        expires_at TIMESTAMPTZ DEFAULT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    # Volume / packaging options of one product, each with its own prices
    # ("50 мл, тестер"), so the catalog needs no card per bottle size.
    """CREATE TABLE IF NOT EXISTS ref_product_variants (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES coop_products(id) ON DELETE CASCADE,
        label VARCHAR(200) NOT NULL,
        price NUMERIC(12,2) NOT NULL,
        promo_price NUMERIC(12,2) DEFAULT NULL,
        compare_price_1 NUMERIC(12,2) DEFAULT NULL,
        compare_price_2 NUMERIC(12,2) DEFAULT NULL,
        is_available BOOLEAN DEFAULT TRUE,
        sort_order INTEGER DEFAULT 0
    )""",
    # Devices a buyer turned notifications on for (one row per browser)
    """CREATE TABLE IF NOT EXISTS ref_push_subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES coop_users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    # When each chat last sent its "you have a reply" email (throttling)
    """CREATE TABLE IF NOT EXISTS ref_notify_email_log (
        key VARCHAR(100) PRIMARY KEY,
        sent_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    # When an order reached each status: the buyer sees the date and time
    # under every step of the track ("принят 16.10 15:14").
    """CREATE TABLE IF NOT EXISTS ref_order_status_log (
        id SERIAL PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES coop_orders(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL,
        changed_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    # Which codes a signed-in buyer holds (they live in the browser), so the
    # site can remind them a week before one runs out (promo_reminders.py)
    # Every consent given or withdrawn (152-ФЗ): when, which version, from where
    """CREATE TABLE IF NOT EXISTS ref_consent_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES coop_users(id) ON DELETE SET NULL,
        kind VARCHAR(20) NOT NULL,
        granted BOOLEAN NOT NULL,
        version VARCHAR(20) NOT NULL,
        ip VARCHAR(64) DEFAULT '',
        user_agent TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS ref_promo_activations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES coop_users(id) ON DELETE CASCADE,
        promo_id INTEGER NOT NULL REFERENCES ref_promos(id) ON DELETE CASCADE,
        activated_at TIMESTAMPTZ DEFAULT NOW(),
        seen_at TIMESTAMPTZ DEFAULT NOW(),
        reminded_for TIMESTAMPTZ DEFAULT NULL,
        UNIQUE (user_id, promo_id)
    )""",
]

# (table, column, definition) — added after the tables above exist.
_COLUMNS = [
    # Consents (152-ФЗ, 38-ФЗ) and the deleted account's mark
    ("coop_users", "pd_consent_at", "TIMESTAMPTZ DEFAULT NULL"),
    ("coop_users", "pd_consent_version", "VARCHAR(20) DEFAULT NULL"),
    ("coop_users", "marketing_consent", "BOOLEAN DEFAULT FALSE"),
    ("coop_users", "marketing_consent_at", "TIMESTAMPTZ DEFAULT NULL"),
    ("coop_users", "deleted_at", "TIMESTAMPTZ DEFAULT NULL"),
    # A supplier's account: «О нас» shows them the supplier's branch
    ("coop_users", "is_supplier", "BOOLEAN DEFAULT FALSE"),
    # Every code an order was placed with (several, one per category); the
    # leader of promo_code is the one credited for it
    ("coop_orders", "promo_codes", "TEXT DEFAULT NULL"),
    # "Не нашли?" plate at the top of a category page
    ("coop_categories", "request_text", "TEXT DEFAULT ''"),
    # Subcategories (brands, types) dress like categories: a logo or picture,
    # a colour, a slogan and a description, in an order the admin sets
    ("coop_subcategories", "image", "TEXT DEFAULT ''"),
    ("coop_subcategories", "accent_color", "VARCHAR(20) DEFAULT ''"),
    ("coop_subcategories", "slogan", "TEXT DEFAULT ''"),
    ("coop_subcategories", "sort_order", "INTEGER DEFAULT 0"),
    # A brand (not a type): it runs in the strip of logos
    ("coop_subcategories", "is_brand", "BOOLEAN DEFAULT FALSE"),
    # Forum posts can carry photos, like chat messages
    ("coop_forum_posts", "images", "TEXT DEFAULT '[]'"),
    # Catalog
    ("coop_products", "promo_price", "NUMERIC(12,2) DEFAULT NULL"),
    ("coop_products", "requires_variant", "BOOLEAN DEFAULT FALSE"),
    ("coop_products", "is_adult", "BOOLEAN DEFAULT FALSE"),
    # The same item at two other shops, for the "в других магазинах" line
    ("coop_products", "compare_price_1", "NUMERIC(12,2) DEFAULT NULL"),
    ("coop_products", "compare_price_2", "NUMERIC(12,2) DEFAULT NULL"),
    # A category is a page of its own: picture, slogan, "как это работает",
    # the two shops its prices are compared with, its accent colour.
    ("coop_categories", "hero_image", "TEXT DEFAULT ''"),
    ("coop_categories", "slogan", "TEXT DEFAULT ''"),
    ("coop_categories", "intro", "TEXT DEFAULT ''"),
    ("coop_categories", "compare_label_1", "VARCHAR(100) DEFAULT 'Золотое Яблоко'"),
    ("coop_categories", "compare_label_2", "VARCHAR(100) DEFAULT 'Рандеву'"),
    ("coop_categories", "sort_order", "INTEGER DEFAULT 0"),
    ("coop_categories", "accent_color", "VARCHAR(20) DEFAULT ''"),
    # Optional bold version of it (contact bar, active tab, highlights);
    # empty means the site derives it from accent_color.
    ("coop_categories", "accent_strong", "VARCHAR(20) DEFAULT ''"),
    ("coop_reviews", "category_id", "INTEGER DEFAULT NULL"),
    # Photo attachments: a JSON array of /uploads/... urls
    ("coop_reviews", "images", "TEXT DEFAULT '[]'"),
    ("coop_support_messages", "images", "TEXT DEFAULT '[]'"),
    ("coop_order_messages", "images", "TEXT DEFAULT '[]'"),
    # Accounts
    ("coop_users", "password_changed_at", "TIMESTAMPTZ DEFAULT NULL"),  # token revocation
    ("coop_users", "email_verified", "BOOLEAN DEFAULT FALSE"),
    ("coop_users", "is_leader", "BOOLEAN DEFAULT FALSE"),
    ("coop_users", "leader_can_write", "BOOLEAN DEFAULT FALSE"),
    # Emails about replies in chats; push is per device (ref_push_subscriptions)
    ("coop_users", "notify_email", "BOOLEAN DEFAULT TRUE"),
    # Orders
    ("coop_orders", "promo_code", "VARCHAR(50) DEFAULT NULL"),
    ("coop_orders", "discount_amount", "NUMERIC(12,2) DEFAULT 0"),
    ("coop_orders", "ref_promo_id", "INTEGER DEFAULT NULL"),
    ("coop_orders", "leader_id", "INTEGER DEFAULT NULL"),
    ("coop_orders", "leader_reward", "NUMERIC(12,2) DEFAULT 0"),
    ("coop_orders", "contact_method", "VARCHAR(30) DEFAULT ''"),
    ("coop_orders", "confirmed_at", "TIMESTAMPTZ DEFAULT NULL"),
    ("coop_orders", "status_changed_at", "TIMESTAMPTZ DEFAULT NULL"),
    # What a promo code makes cheaper: everything, one category, or chosen
    # products (a JSON list of ids)
    ("ref_promos", "scope", "VARCHAR(20) DEFAULT 'all'"),
    ("ref_promos", "scope_category_id", "INTEGER DEFAULT NULL"),
    ("ref_promos", "scope_product_ids", "TEXT DEFAULT '[]'"),
    # Pre-order questions ("Связь с продавцом") attributed to a leader
    ("coop_support_tickets", "promo_code", "VARCHAR(50) DEFAULT NULL"),
    ("coop_support_tickets", "leader_id", "INTEGER DEFAULT NULL"),
]

_INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_order_messages_order ON coop_order_messages(order_id)",
    "CREATE INDEX IF NOT EXISTS idx_variants_product ON ref_product_variants(product_id)",
    "CREATE INDEX IF NOT EXISTS idx_ref_promos_leader ON ref_promos(leader_id)",
    "CREATE INDEX IF NOT EXISTS idx_orders_leader ON coop_orders(leader_id)",
    "CREATE INDEX IF NOT EXISTS idx_orders_user ON coop_orders(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_tickets_leader ON coop_support_tickets(leader_id)",
    "CREATE INDEX IF NOT EXISTS idx_status_log_order ON ref_order_status_log(order_id)",
    "CREATE INDEX IF NOT EXISTS idx_push_user ON ref_push_subscriptions(user_id)",
]

# Data fixes, idempotent. Photos added to a product's gallery used to arrive
# without a main one, so its card had no picture: the photo already used as
# the card's cover takes the star, else the first one, and a product with no
# cover gets it.
_REPAIRS = [
    """UPDATE coop_product_images i SET is_main = TRUE
       FROM (SELECT DISTINCT ON (g.product_id) g.id, g.product_id
             FROM coop_product_images g JOIN coop_products p ON p.id = g.product_id
             ORDER BY g.product_id, (g.url = COALESCE(p.image_url, '')) DESC, g.sort_order, g.id) f
       WHERE i.id = f.id
         AND NOT EXISTS (SELECT 1 FROM coop_product_images m WHERE m.product_id = f.product_id AND m.is_main)""",
    """UPDATE coop_products p SET image_url = i.url
       FROM coop_product_images i
       WHERE i.product_id = p.id AND i.is_main AND COALESCE(p.image_url, '') = ''""",
    # Orders placed before the status log: their start, their confirmation and
    # the status they are in now, from the dates the order row kept.
    """INSERT INTO ref_order_status_log (order_id, status, changed_at)
       SELECT o.id, 'new', o.created_at FROM coop_orders o
       WHERE NOT EXISTS (SELECT 1 FROM ref_order_status_log l WHERE l.order_id = o.id)""",
    """INSERT INTO ref_order_status_log (order_id, status, changed_at)
       SELECT o.id, 'accepted', o.confirmed_at FROM coop_orders o
       WHERE o.confirmed_at IS NOT NULL AND o.status IN ('processing', 'shipping', 'done')
         AND NOT EXISTS (SELECT 1 FROM ref_order_status_log l WHERE l.order_id = o.id AND l.status = 'accepted')""",
    """INSERT INTO ref_order_status_log (order_id, status, changed_at)
       SELECT o.id, o.status, COALESCE(o.status_changed_at, o.created_at) FROM coop_orders o
       WHERE o.status <> 'new'
         AND NOT EXISTS (SELECT 1 FROM ref_order_status_log l WHERE l.order_id = o.id AND l.status = o.status)""",
    # Order numbers start at 101: "заказ №2" reads like a shop nobody uses.
    # Orders already placed keep their numbers.
    """DO $$
    DECLARE seq text := pg_get_serial_sequence('coop_orders', 'id'); last bigint;
    BEGIN
      IF seq IS NOT NULL THEN
        EXECUTE format('SELECT last_value FROM %s', seq) INTO last;
        IF last < 100 THEN
          PERFORM setval(seq, GREATEST(100, (SELECT COALESCE(MAX(id), 0) FROM coop_orders)), true);
        END IF;
      END IF;
    END $$""",
]

# The storefront has one forum: /forums opens the one with this key.
FORUM_KEY = "general"
_FORUM = (FORUM_KEY, "Общий форум", "Ароматы, находки и советы друг другу")


# One-off text fixes, each run once (a marker in coop_settings): the platform
# says "лидер мнений" where the first texts said "блогер".
_TEXT_FIXES = [
    ("Промокод от вашего блогера", "Промокод от вашего лидера мнений"),
    ("промокодом от вашего блогера", "промокодом от вашего лидера мнений"),
    ("С промокодом блогера", "С промокодом лидера мнений"),
    ("с промокодом блогера", "с промокодом лидера мнений"),
    ("Промокод блогера", "Промокод лидера мнений"),
    ("промокод блогера", "промокод лидера мнений"),
]


def _fix_texts(cur):
    cur.execute("SELECT 1 FROM coop_settings WHERE key = 'texts_leader_v1'")
    if cur.fetchone():
        return
    for col in ("intro", "slogan", "description"):
        for a, b in _TEXT_FIXES:
            cur.execute(f"UPDATE coop_categories SET {col} = REPLACE({col}, %s, %s) WHERE {col} LIKE %s", (a, b, f"%{a}%"))
    cur.execute("INSERT INTO coop_settings (key, value) VALUES ('texts_leader_v1', '1') ON CONFLICT (key) DO NOTHING")


# The perfume brands the brief names, so the strip of logos has something
# to show from the start; the admin adds logos and removes what is not needed.
_PERFUME_BRANDS = ["Clive Christian", "Chanel", "Tom Ford", "Givenchy", "Dior", "Amouage",
                   "Versace", "Ex Nihilo", "Memo", "Creed", "Nasomatto", "Sisley"]


def _seed_perfume_brands(cur):
    cur.execute("SELECT 1 FROM coop_settings WHERE key = 'perfume_brands_v1'")
    if cur.fetchone():
        return
    cur.execute("SELECT id FROM coop_categories WHERE name ILIKE %s ORDER BY id LIMIT 1", ("%парфюм%",))
    row = cur.fetchone()
    if row:
        for i, name in enumerate(_PERFUME_BRANDS, start=1):
            cur.execute(
                """UPDATE coop_subcategories SET is_brand = TRUE
                   WHERE category_id = %s AND LOWER(name) = LOWER(%s)""",
                (row["id"], name),
            )
            cur.execute(
                """INSERT INTO coop_subcategories (name, category_id, is_brand, sort_order)
                   SELECT %s, %s, TRUE, %s
                   WHERE NOT EXISTS (SELECT 1 FROM coop_subcategories
                                     WHERE category_id = %s AND LOWER(name) = LOWER(%s))""",
                (name, row["id"], i, row["id"], name),
            )
    cur.execute("INSERT INTO coop_settings (key, value) VALUES ('perfume_brands_v1', '1') ON CONFLICT (key) DO NOTHING")


# Logos for those brands, shipped in frontend/public/img/brands
_BRAND_LOGOS = {
    "Clive Christian": "clive-christian", "Chanel": "chanel", "Tom Ford": "tom-ford",
    "Givenchy": "givenchy", "Dior": "dior", "Amouage": "amouage", "Versace": "versace",
    "Ex Nihilo": "ex-nihilo", "Memo": "memo", "Creed": "creed", "Nasomatto": "nasomatto",
    "Sisley": "sisley",
}


def _seed_brand_logos(cur):
    """Once: a brand with no picture of its own gets the shipped logo."""
    cur.execute("SELECT 1 FROM coop_settings WHERE key = 'brand_logos_v1'")
    if cur.fetchone():
        return
    for name, slug in _BRAND_LOGOS.items():
        cur.execute(
            """UPDATE coop_subcategories SET image = %s, is_brand = TRUE
               WHERE LOWER(name) = LOWER(%s) AND COALESCE(image, '') = ''""",
            (f"/img/brands/{slug}.png", name),
        )
    cur.execute("INSERT INTO coop_settings (key, value) VALUES ('brand_logos_v1', '1') ON CONFLICT (key) DO NOTHING")


def _seed_request_texts(cur):
    """The perfume page asks for a scent by name; once, so the admin's own
    wording (or an empty field) stays as set."""
    cur.execute("SELECT 1 FROM coop_settings WHERE key = 'request_text_v1'")
    if cur.fetchone():
        return
    cur.execute(
        "UPDATE coop_categories SET request_text = %s WHERE name ILIKE %s AND COALESCE(request_text, '') = ''",
        ("Не нашли свой аромат? Отправьте название — в наличии 90% ароматов из сетевых магазинов.", "%парфюм%"),
    )
    cur.execute("INSERT INTO coop_settings (key, value) VALUES ('request_text_v1', '1') ON CONFLICT (key) DO NOTHING")


def ensure_schema():
    try:
        with get_db() as cur:
            for sql in _TABLES:
                cur.execute(sql)
            for table, column, definition in _COLUMNS:
                cur.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {definition}")
            for sql in _INDEXES:
                cur.execute(sql)
            for sql in _REPAIRS:
                cur.execute(sql)
            _fix_texts(cur)
            _seed_request_texts(cur)
            _seed_perfume_brands(cur)
            _seed_brand_logos(cur)
            cur.execute(
                """INSERT INTO coop_forums (name, address_key, description)
                   SELECT %s, %s, %s WHERE NOT EXISTS (SELECT 1 FROM coop_forums WHERE address_key = %s)""",
                (_FORUM[1], _FORUM[0], _FORUM[2], _FORUM[0]),
            )
    except Exception as e:
        print(f"⚠️  Schema bootstrap failed: {e}")
