-- Migration v2: Multi-photo support, social forum, supplier assembly dates
-- Run this on existing databases that already have v1 schema

-- 1. Product images table
CREATE TABLE IF NOT EXISTS coop_product_images (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES coop_products(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    is_main BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON coop_product_images(product_id);

-- 2. Add assembly_date to suppliers (skip if already exists)
DO $$ BEGIN
    ALTER TABLE coop_suppliers ADD COLUMN assembly_date VARCHAR(100) DEFAULT '';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 3. Add social forum
INSERT INTO coop_forums (name, address_key, description)
VALUES ('Социальный форум', 'social', 'Обсуждения, новости, свободные темы')
ON CONFLICT DO NOTHING;
