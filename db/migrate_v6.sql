-- Migration v6: VIP categories, subcategories, suppliers, payment templates + product fields

-- VIP Categories
CREATE TABLE IF NOT EXISTS coop_vip_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- VIP Subcategories
CREATE TABLE IF NOT EXISTS coop_vip_subcategories (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES coop_vip_categories(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vip_subcats_cat ON coop_vip_subcategories(category_id);

-- VIP Suppliers
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

-- VIP Payment Templates
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

-- Add is_featured (актуальность) to VIP products
DO $$ BEGIN
    ALTER TABLE coop_vip_products ADD COLUMN is_featured BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add vip_category_id, vip_subcategory_id, vip_supplier_id to VIP products
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
