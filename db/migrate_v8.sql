-- Migration v8: Subscription photos, product linking, VIP subscriptions, password reset tokens

-- Add image_url column to coop_subscriptions for subscription photos
ALTER TABLE coop_subscriptions ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;

-- Add subscription_id to coop_products to link products to specific subscriptions
ALTER TABLE coop_products ADD COLUMN IF NOT EXISTS subscription_id INTEGER DEFAULT NULL;

-- Add is_vip flag to coop_subscriptions to distinguish VIP vs base subscriptions
ALTER TABLE coop_subscriptions ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT FALSE;

-- Add requires_subscription and subscription_id to VIP products
ALTER TABLE coop_vip_products ADD COLUMN IF NOT EXISTS requires_subscription BOOLEAN DEFAULT FALSE;
ALTER TABLE coop_vip_products ADD COLUMN IF NOT EXISTS subscription_id INTEGER DEFAULT NULL;
ALTER TABLE coop_vip_products ADD COLUMN IF NOT EXISTS is_adult BOOLEAN DEFAULT FALSE;

-- Password reset tokens table
CREATE TABLE IF NOT EXISTS coop_password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES coop_users(id) ON DELETE CASCADE,
    token VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reset_token ON coop_password_reset_tokens(token);

-- Packaging info: quantity of packs and optional weight in kg
ALTER TABLE coop_products ADD COLUMN IF NOT EXISTS pack_quantity INTEGER DEFAULT NULL;
ALTER TABLE coop_products ADD COLUMN IF NOT EXISTS pack_weight_kg NUMERIC(8,3) DEFAULT NULL;
ALTER TABLE coop_vip_products ADD COLUMN IF NOT EXISTS pack_quantity INTEGER DEFAULT NULL;
ALTER TABLE coop_vip_products ADD COLUMN IF NOT EXISTS pack_weight_kg NUMERIC(8,3) DEFAULT NULL;
