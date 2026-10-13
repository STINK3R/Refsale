-- ═══════════════════════════════════════════════════════════════
-- Unified migration script: v3 → v4 → v5 → v6 → v7
-- Run this on existing production databases that have v2 or earlier schema.
-- All statements are idempotent (safe to re-run).
-- ═══════════════════════════════════════════════════════════════

-- ── Migration v3: Subscriptions, VIP, Support ─────────────────

CREATE TABLE IF NOT EXISTS coop_subscriptions (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES coop_categories(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    price NUMERIC(12,2) NOT NULL DEFAULT 0,
    duration_days INTEGER NOT NULL DEFAULT 30,
    description TEXT DEFAULT '',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coop_user_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES coop_users(id) ON DELETE CASCADE,
    subscription_id INTEGER REFERENCES coop_subscriptions(id) ON DELETE CASCADE,
    purchased_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_user_subs_user ON coop_user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subs_expires ON coop_user_subscriptions(expires_at);

DO $$ BEGIN
    ALTER TABLE coop_products ADD COLUMN requires_subscription BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE coop_users ADD COLUMN is_vip BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS coop_vip_products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    price NUMERIC(12,2),
    description TEXT DEFAULT '',
    category_id INTEGER REFERENCES coop_categories(id) ON DELETE SET NULL,
    subcategory_id INTEGER REFERENCES coop_subcategories(id) ON DELETE SET NULL,
    supplier_id INTEGER REFERENCES coop_suppliers(id) ON DELETE SET NULL,
    badge VARCHAR(20) DEFAULT NULL,
    image_url TEXT DEFAULT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    product_type VARCHAR(20) DEFAULT 'piece',
    box_size INTEGER DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vip_products_category ON coop_vip_products(category_id);
CREATE INDEX IF NOT EXISTS idx_vip_products_available ON coop_vip_products(is_available);

CREATE TABLE IF NOT EXISTS coop_vip_orders (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    address TEXT DEFAULT '',
    comment TEXT DEFAULT '',
    items JSONB DEFAULT '[]',
    total NUMERIC(12,2) DEFAULT 0,
    status VARCHAR(30) DEFAULT 'new',
    user_id INTEGER REFERENCES coop_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vip_orders_user ON coop_vip_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_vip_orders_status ON coop_vip_orders(status);

CREATE TABLE IF NOT EXISTS coop_support_tickets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES coop_users(id) ON DELETE SET NULL,
    user_name VARCHAR(255) DEFAULT '',
    subject VARCHAR(500) DEFAULT '',
    status VARCHAR(30) DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON coop_support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON coop_support_tickets(status);

CREATE TABLE IF NOT EXISTS coop_support_messages (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES coop_support_tickets(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) DEFAULT 'user',
    sender_name VARCHAR(255) DEFAULT '',
    text TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON coop_support_messages(ticket_id);

-- ── Migration v4: 18+ products, subscription-as-product ──────

DO $$ BEGIN
    ALTER TABLE coop_products ADD COLUMN is_adult BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE coop_vip_products ADD COLUMN is_adult BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE coop_products ADD COLUMN is_subscription BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE coop_products ADD COLUMN subscription_days INTEGER DEFAULT 30;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE coop_products ADD COLUMN subscription_category_id INTEGER DEFAULT NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS coop_product_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES coop_users(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES coop_products(id) ON DELETE SET NULL,
    order_id INTEGER REFERENCES coop_orders(id) ON DELETE SET NULL,
    category_id INTEGER REFERENCES coop_categories(id) ON DELETE SET NULL,
    purchased_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_prod_subs_user ON coop_product_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_prod_subs_expires ON coop_product_subscriptions(expires_at);

DO $$ BEGIN
    ALTER TABLE coop_products ADD COLUMN subscription_category_id_required INTEGER DEFAULT NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── Migration v5: Payment templates + VIP gallery ────────────

CREATE TABLE IF NOT EXISTS coop_payment_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    bank_name VARCHAR(255) DEFAULT '',
    recipient_name VARCHAR(255) DEFAULT '',
    card_number VARCHAR(50) DEFAULT '',
    phone_number VARCHAR(50) DEFAULT '',
    account_number VARCHAR(50) DEFAULT '',
    bik VARCHAR(20) DEFAULT '',
    inn VARCHAR(20) DEFAULT '',
    extra_info TEXT DEFAULT '',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
    ALTER TABLE coop_vip_products ADD COLUMN gallery_urls JSONB DEFAULT '[]';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── Migration v6: VIP categories, subcategories, suppliers ───

CREATE TABLE IF NOT EXISTS coop_vip_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coop_vip_subcategories (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES coop_vip_categories(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vip_subcats_cat ON coop_vip_subcategories(category_id);

CREATE TABLE IF NOT EXISTS coop_vip_suppliers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    delivery_day VARCHAR(100) DEFAULT '',
    delivery_note TEXT DEFAULT '',
    assembly_day VARCHAR(100) DEFAULT '',
    contact_phone VARCHAR(50) DEFAULT '',
    contact_telegram VARCHAR(100) DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coop_vip_payment_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    bank_name VARCHAR(255) DEFAULT '',
    recipient_name VARCHAR(255) DEFAULT '',
    card_number VARCHAR(50) DEFAULT '',
    phone_number VARCHAR(50) DEFAULT '',
    account_number VARCHAR(50) DEFAULT '',
    bik VARCHAR(20) DEFAULT '',
    inn VARCHAR(20) DEFAULT '',
    extra_info TEXT DEFAULT '',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
    ALTER TABLE coop_vip_products ADD COLUMN is_featured BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE coop_vip_products ADD COLUMN vip_category_id INTEGER REFERENCES coop_vip_categories(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE coop_vip_products ADD COLUMN vip_subcategory_id INTEGER REFERENCES coop_vip_subcategories(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE coop_vip_products ADD COLUMN vip_supplier_id INTEGER REFERENCES coop_vip_suppliers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── Migration v7: "ready" status (документация) ────────────
-- Новый статус заказа: ready = "Готов к выдаче"
-- Поток: new -> processing -> collecting -> ready -> done
-- Статус VARCHAR(30) — изменений схемы не требуется.
-- Реквизиты оплаты теперь отправляются на стадии "ready", а не "done".
-- Подписки активируются по-прежнему на стадии "done".

-- ── Migration v8: Subscriptions, VIP products, password reset ──

DO $$ BEGIN
    ALTER TABLE coop_subscriptions ADD COLUMN image_url TEXT DEFAULT NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE coop_subscriptions ADD COLUMN is_vip BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE coop_products ADD COLUMN subscription_id INTEGER DEFAULT NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE coop_vip_products ADD COLUMN requires_subscription BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE coop_vip_products ADD COLUMN subscription_id INTEGER DEFAULT NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE coop_vip_products ADD COLUMN is_adult BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS coop_password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES coop_users(id) ON DELETE CASCADE,
    token VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reset_token ON coop_password_reset_tokens(token);

DO $$ BEGIN
    ALTER TABLE coop_products ADD COLUMN pack_quantity INTEGER DEFAULT NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE coop_products ADD COLUMN pack_weight_kg NUMERIC(8,3) DEFAULT NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE coop_vip_products ADD COLUMN pack_quantity INTEGER DEFAULT NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE coop_vip_products ADD COLUMN pack_weight_kg NUMERIC(8,3) DEFAULT NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- Done. All migrations applied (v3–v8).
-- ═══════════════════════════════════════════════════════════════
