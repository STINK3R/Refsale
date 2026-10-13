-- Local demo catalog for RefSale. NOT applied automatically — run it by hand
-- against a development database only:
--   docker compose -f docker-compose.local.yml exec -T db psql -U coop -d coop < db/demo_seed.sql

INSERT INTO coop_categories (name, description) VALUES
  ('Парфюмерия', 'Оригинальные ароматы'),
  ('Уходовая косметика', 'Уход за лицом и телом');

INSERT INTO coop_products (name, price, promo_price, description, category_id, badge, is_available) VALUES
  ('Chanel Coco Mademoiselle EDP 100 мл', 14900, 12900,
   'Свежий восточно-цветочный аромат: апельсин, бергамот, роза, жасмин, пачули.',
   (SELECT id FROM coop_categories WHERE name = 'Парфюмерия'), 'hit', TRUE),
  ('Dior Sauvage EDT 100 мл', 11900, 10400,
   'Пряный древесный аромат: калабрийский бергамот, амброксан, перец.',
   (SELECT id FROM coop_categories WHERE name = 'Парфюмерия'), 'hit', TRUE),
  ('Tom Ford Black Orchid EDP 50 мл', 16500, 14700,
   'Чувственный восточный аромат: чёрная орхидея, трюфель, пачули.',
   (SELECT id FROM coop_categories WHERE name = 'Парфюмерия'), 'new', TRUE),
  ('Maison Francis Kurkdjian Baccarat Rouge 540 EDP 70 мл', 32900, 29900,
   'Шафран, жасмин, амбра и кедр — знаменитый «рубиновый» аромат.',
   (SELECT id FROM coop_categories WHERE name = 'Парфюмерия'), 'rare', TRUE),
  ('Lancôme La Vie Est Belle EDP 75 мл', 10200, NULL,
   'Ирис, пралине, ваниль. Цена по промокоду не отличается — пример товара без скидки.',
   (SELECT id FROM coop_categories WHERE name = 'Парфюмерия'), NULL, TRUE),
  ('Giorgio Armani Acqua di Giò EDT 100 мл', 9800, 8600,
   'Морской акватический аромат: бергамот, нероли, розмарин.',
   (SELECT id FROM coop_categories WHERE name = 'Парфюмерия'), NULL, FALSE),
  ('La Roche-Posay Toleriane Sensitive крем 40 мл', 1850, 1590,
   'Увлажняющий крем для чувствительной кожи.',
   (SELECT id FROM coop_categories WHERE name = 'Уходовая косметика'), 'sale', TRUE),
  ('Clinique Moisture Surge 72h 50 мл', 4200, 3700,
   'Гель-крем с алоэ и гиалуроновой кислотой.',
   (SELECT id FROM coop_categories WHERE name = 'Уходовая косметика'), NULL, TRUE);

INSERT INTO coop_settings (key, value) VALUES
  ('contact_phone_1', '+7 900 000-00-01'),
  ('contact_email_1', 'sales@refsale.ru'),
  ('contact_tg_1', 'refsale'),
  ('contact_wa_1', '+7 900 000-00-01'),
  ('contact_phone_2', '+7 900 000-00-02'),
  ('contact_email_2', 'admin@refsale.ru'),
  ('contact_tg_2', 'refsale_admin')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
