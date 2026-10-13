-- Migration v3: Subscriptions, VIP, Support chat
-- Run on existing databases that already have v2 schema

-- 1. Subscriptions table (subscription plans tied to categories)
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

-- 2. User subscriptions (purchased subscriptions)
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

-- 3. Mark products as subscription-required (no markup, non-perishable)
DO $$ BEGIN
    ALTER TABLE coop_products ADD COLUMN requires_subscription BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 4. VIP system — add is_vip flag to users
DO $$ BEGIN
    ALTER TABLE coop_users ADD COLUMN is_vip BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 5. VIP products table (separate catalog for VIP users)
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

-- 6. VIP orders table
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

-- 7. Support tickets
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

-- 8. Support messages
CREATE TABLE IF NOT EXISTS coop_support_messages (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER REFERENCES coop_support_tickets(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) DEFAULT 'user',
    sender_name VARCHAR(255) DEFAULT '',
    text TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON coop_support_messages(ticket_id);
