-- ==========================================
-- V9: Promo codes, Referrals, Email verification
-- ==========================================

-- ── Promo Codes (admin-created) ──────────────
CREATE TABLE IF NOT EXISTS coop_promo_codes (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    max_activations INTEGER DEFAULT NULL,        -- NULL = unlimited
    current_activations INTEGER DEFAULT 0,
    expires_at TIMESTAMPTZ DEFAULT NULL,          -- NULL = no expiration
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promo_code ON coop_promo_codes(code);

-- Promo code usage log
CREATE TABLE IF NOT EXISTS coop_promo_usages (
    id SERIAL PRIMARY KEY,
    promo_id INTEGER REFERENCES coop_promo_codes(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES coop_users(id) ON DELETE SET NULL,
    order_id INTEGER REFERENCES coop_orders(id) ON DELETE SET NULL,
    used_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_promo_usages_promo ON coop_promo_usages(promo_id);
CREATE INDEX IF NOT EXISTS idx_promo_usages_user ON coop_promo_usages(user_id);

-- ── Referral System ──────────────────────────
-- Add referral_code and referred_by to users
DO $$ BEGIN
    ALTER TABLE coop_users ADD COLUMN referral_code VARCHAR(20) DEFAULT NULL UNIQUE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE coop_users ADD COLUMN referred_by INTEGER DEFAULT NULL REFERENCES coop_users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_referral_code ON coop_users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON coop_users(referred_by);

-- Referral rewards tracking
CREATE TABLE IF NOT EXISTS coop_referral_rewards (
    id SERIAL PRIMARY KEY,
    referrer_id INTEGER NOT NULL REFERENCES coop_users(id) ON DELETE CASCADE,
    referred_id INTEGER NOT NULL REFERENCES coop_users(id) ON DELETE CASCADE,
    promo_id INTEGER REFERENCES coop_promo_codes(id) ON DELETE SET NULL,
    reward_amount NUMERIC(12,2) DEFAULT 200,
    is_claimed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer ON coop_referral_rewards(referrer_id);

-- ── Email Verification ───────────────────────
DO $$ BEGIN
    ALTER TABLE coop_users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS coop_email_verification_codes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES coop_users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_verify_user ON coop_email_verification_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verify_code ON coop_email_verification_codes(code);

-- Add discount_amount column to orders for promo tracking
DO $$ BEGIN
    ALTER TABLE coop_orders ADD COLUMN promo_code VARCHAR(50) DEFAULT NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE coop_orders ADD COLUMN discount_amount NUMERIC(12,2) DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Min order amount for promo codes
DO $$ BEGIN
    ALTER TABLE coop_promo_codes ADD COLUMN min_order_amount NUMERIC(12,2) DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- is_vip flag for promo codes (VIP promos can't be used on VIP orders)
DO $$ BEGIN
    ALTER TABLE coop_promo_codes ADD COLUMN is_vip BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Settings for referral reward amount and min order for referral promo
INSERT INTO coop_settings (key, value) VALUES ('referral_reward_amount', '200') ON CONFLICT DO NOTHING;
INSERT INTO coop_settings (key, value) VALUES ('referral_milestone', '5') ON CONFLICT DO NOTHING;
INSERT INTO coop_settings (key, value) VALUES ('referral_referred_bonus', '100') ON CONFLICT DO NOTHING;
