-- 1Кооперативный — PostgreSQL Schema
-- All tables previously in Supabase

CREATE TABLE IF NOT EXISTS coop_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coop_subcategories (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES coop_categories(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coop_suppliers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    delivery_day VARCHAR(100) DEFAULT '',
    delivery_note TEXT DEFAULT '',
    assembly_date VARCHAR(100) DEFAULT '',
    contact_phone VARCHAR(50) DEFAULT '',
    contact_telegram VARCHAR(100) DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coop_products (
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
    pack_quantity INTEGER DEFAULT NULL,
    pack_weight_kg NUMERIC(8,3) DEFAULT NULL,
    counter_reset_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coop_product_images (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES coop_products(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    is_main BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coop_users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) DEFAULT NULL,
    email VARCHAR(255) DEFAULT '',
    address TEXT DEFAULT '',
    password VARCHAR(255) NOT NULL,
    telegram_username VARCHAR(100) DEFAULT '',
    telegram_chat_id VARCHAR(50) DEFAULT NULL,
    is_approved BOOLEAN DEFAULT FALSE,
    is_blocked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Phone is optional. Uniqueness is enforced only when a value is provided,
-- so multiple phone-less users can coexist.
CREATE UNIQUE INDEX IF NOT EXISTS idx_coop_users_phone_unique
    ON coop_users(phone)
    WHERE phone IS NOT NULL AND phone <> '';

CREATE TABLE IF NOT EXISTS coop_orders (
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

CREATE TABLE IF NOT EXISTS coop_reviews (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES coop_users(id) ON DELETE SET NULL,
    user_name VARCHAR(255) DEFAULT '',
    text TEXT DEFAULT '',
    rating INTEGER DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coop_music (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    artist VARCHAR(255) DEFAULT '',
    url TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coop_admins (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    display_name VARCHAR(255) DEFAULT '',
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coop_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coop_forums (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address_key VARCHAR(500) DEFAULT '',
    description TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coop_forum_posts (
    id SERIAL PRIMARY KEY,
    forum_id INTEGER REFERENCES coop_forums(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES coop_users(id) ON DELETE SET NULL,
    user_name VARCHAR(255) DEFAULT '',
    text TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default settings
-- Admin password is NOT seeded here on purpose: a default committed to the
-- repository is a public credential. The backend creates it on first boot
-- (from ADMIN_PASSWORD, or a random one printed to the log once).

-- Default general forum
INSERT INTO coop_forums (name, address_key, description) VALUES ('Общий форум', 'general', 'Ароматы, уход и находки — для всех') ON CONFLICT DO NOTHING;
INSERT INTO coop_forums (name, address_key, description) VALUES ('Социальный форум', 'social', 'Обсуждения, новости, свободные темы') ON CONFLICT DO NOTHING;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_category ON coop_products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON coop_products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_available ON coop_products(is_available);
CREATE INDEX IF NOT EXISTS idx_orders_user ON coop_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON coop_orders(status);
CREATE INDEX IF NOT EXISTS idx_forum_posts_forum ON coop_forum_posts(forum_id);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON coop_product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_users_phone ON coop_users(phone);
CREATE INDEX IF NOT EXISTS idx_users_email ON coop_users(email);
CREATE INDEX IF NOT EXISTS idx_users_telegram ON coop_users(telegram_username);

-- No demo data here: this runs on the production database too.
-- For a local demo catalog see db/demo_seed.sql.

-- Migration: add counter_reset_at to existing coop_products tables
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='coop_products' AND column_name='counter_reset_at') THEN
    ALTER TABLE coop_products ADD COLUMN counter_reset_at TIMESTAMPTZ DEFAULT NULL;
  END IF;
END $$;

-- ==========================================
-- V3 TABLES: Subscriptions, VIP, Support
-- ==========================================

-- Subscriptions
CREATE TABLE IF NOT EXISTS coop_subscriptions (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES coop_categories(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    price NUMERIC(12,2) NOT NULL DEFAULT 0,
    duration_days INTEGER NOT NULL DEFAULT 30,
    description TEXT DEFAULT '',
    image_url TEXT DEFAULT NULL,
    is_vip BOOLEAN DEFAULT FALSE,
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

-- VIP products
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
    requires_subscription BOOLEAN DEFAULT FALSE,
    subscription_id INTEGER DEFAULT NULL,
    is_adult BOOLEAN DEFAULT FALSE,
    pack_quantity INTEGER DEFAULT NULL,
    pack_weight_kg NUMERIC(8,3) DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vip_products_category ON coop_vip_products(category_id);
CREATE INDEX IF NOT EXISTS idx_vip_products_available ON coop_vip_products(is_available);

-- VIP orders
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

-- Support tickets
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

-- Support messages
CREATE TABLE IF NOT EXISTS coop_support_messages (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES coop_support_tickets(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) DEFAULT 'user',
    sender_name VARCHAR(255) DEFAULT '',
    text TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON coop_support_messages(ticket_id);

-- Order chat messages (buyer↔admin, anchored on the order itself)
CREATE TABLE IF NOT EXISTS coop_order_messages (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES coop_orders(id) ON DELETE CASCADE,
    sender_type VARCHAR(10) DEFAULT 'user',
    sender_name VARCHAR(255) DEFAULT '',
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_messages_order ON coop_order_messages(order_id);

-- Add requires_subscription column to products
DO $$ BEGIN
    ALTER TABLE coop_products ADD COLUMN requires_subscription BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add is_vip column to users
DO $$ BEGIN
    ALTER TABLE coop_users ADD COLUMN is_vip BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Password reset tokens
CREATE TABLE IF NOT EXISTS coop_password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES coop_users(id) ON DELETE CASCADE,
    token VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reset_token ON coop_password_reset_tokens(token);
