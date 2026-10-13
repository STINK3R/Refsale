-- Migration v4: 18+ products, subscription-as-product model
-- Run on existing databases that already have v3 schema

-- 1. Add is_adult flag to products (blur + age confirmation)
DO $$ BEGIN
    ALTER TABLE coop_products ADD COLUMN is_adult BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 2. Add is_adult flag to VIP products
DO $$ BEGIN
    ALTER TABLE coop_vip_products ADD COLUMN is_adult BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 3. Add is_subscription flag to products (product IS a subscription)
--    When purchased, grants user access for subscription_days
DO $$ BEGIN
    ALTER TABLE coop_products ADD COLUMN is_subscription BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 4. Duration in days for subscription products (default 30)
DO $$ BEGIN
    ALTER TABLE coop_products ADD COLUMN subscription_days INTEGER DEFAULT 30;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 5. Which category does the subscription unlock?
--    NULL = unlocks all subscription-required products
DO $$ BEGIN
    ALTER TABLE coop_products ADD COLUMN subscription_category_id INTEGER DEFAULT NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 6. User active subscriptions from product purchases
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

-- 7. Add subscription_category_id to requires_subscription products
--    This links the product to a specific subscription category
DO $$ BEGIN
    ALTER TABLE coop_products ADD COLUMN subscription_category_id_required INTEGER DEFAULT NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
