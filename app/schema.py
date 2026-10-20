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
]

# (table, column, definition) — added after the tables above exist.
_COLUMNS = [
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
    # Orders
    ("coop_orders", "promo_code", "VARCHAR(50) DEFAULT NULL"),
    ("coop_orders", "discount_amount", "NUMERIC(12,2) DEFAULT 0"),
    ("coop_orders", "ref_promo_id", "INTEGER DEFAULT NULL"),
    ("coop_orders", "leader_id", "INTEGER DEFAULT NULL"),
    ("coop_orders", "leader_reward", "NUMERIC(12,2) DEFAULT 0"),
    ("coop_orders", "contact_method", "VARCHAR(30) DEFAULT ''"),
    ("coop_orders", "confirmed_at", "TIMESTAMPTZ DEFAULT NULL"),
    ("coop_orders", "status_changed_at", "TIMESTAMPTZ DEFAULT NULL"),
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
]

# The storefront has one forum: /forums opens the one with this key.
FORUM_KEY = "general"
_FORUM = (FORUM_KEY, "Общий форум", "Ароматы, находки и советы друг другу")


def ensure_schema():
    try:
        with get_db() as cur:
            for sql in _TABLES:
                cur.execute(sql)
            for table, column, definition in _COLUMNS:
                cur.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {definition}")
            for sql in _INDEXES:
                cur.execute(sql)
            cur.execute(
                """INSERT INTO coop_forums (name, address_key, description)
                   SELECT %s, %s, %s WHERE NOT EXISTS (SELECT 1 FROM coop_forums WHERE address_key = %s)""",
                (_FORUM[1], _FORUM[0], _FORUM[2], _FORUM[0]),
            )
    except Exception as e:
        print(f"⚠️  Schema bootstrap failed: {e}")
