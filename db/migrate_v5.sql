-- Migration v5: Payment templates + VIP gallery

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

-- VIP product gallery support
DO $$ BEGIN
    ALTER TABLE coop_vip_products ADD COLUMN gallery_urls JSONB DEFAULT '[]';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
