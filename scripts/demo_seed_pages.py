"""Test data for category pages: slogans, comparison prices, volumes, two new categories.

Builds on db/demo_seed.sql (the perfume catalog). Runs inside the backend
container like scripts/demo_seed.py:
    docker compose exec -T backend python - < scripts/demo_seed_pages.py

Runs once: a marker in coop_settings stops a second run.
"""
from app.db import get_db
from app.routes.store import ensure_store_schema

MARKER = "demo_pages_seeded"

PAGES = {
    # name: description (small label), slogan, intro, compare shops, order
    "Парфюмерия": (
        "Оригинальная парфюмерия",
        "Любимые ароматы дешевле, чем в социальных сетях",
        "Мы закупаем оригинальную парфюмерию у официальных поставщиков и продаём её дешевле крупных сетей.\n"
        "Промокод от вашего блогера снижает цену ещё сильнее — сразу на все товары.\n"
        "Оплата после того, как менеджер подтвердит наличие в чате заказа.",
        ("Золотое Яблоко", "Рандеву"), 1,
    ),
    "Уходовая косметика": (
        "Уход за лицом и телом",
        "Уход из аптеки и люкса — без наценки сетей",
        "Кремы, сыворотки и средства для тела от проверенных брендов.\n"
        "С промокодом блогера — ещё дешевле.",
        ("Золотое Яблоко", "Рандеву"), 2,
    ),
    "Еда": (
        "Продукты и деликатесы",
        "Вкусное с доставкой — дешевле, чем в супермаркете",
        "Собираем заказы у фермеров и производителей напрямую.\n"
        "Промокод блогера даёт скидку на всю корзину.",
        ("Перекрёсток", "ВкусВилл"), 3,
    ),
    "Доставка из Китая": (
        "Товары напрямую из Китая",
        "Из Китая — без переплаты маркетплейсам",
        "Выкупаем товар у фабрик и привозим за 2–3 недели.\n"
        "С промокодом блогера цена ниже, чем на маркетплейсах.",
        ("Ozon", "Wildberries"), 4,
    ),
}

NEW_PRODUCTS = {
    # category: [(name, price, promo price, compare 1, compare 2, description, badge)]
    "Еда": [
        ("Мёд алтайский гречишный 1 кг", 1200, 990, 1590, 1450, "Густой тёмный мёд с пасеки в Алтайском крае.", "hit"),
        ("Сыр пармезан 24 месяца, 500 г", 2400, 2100, 2990, 2790, "Выдержка 24 месяца, Италия.", "new"),
        ("Кофе в зёрнах Эфиопия Иргачефф, 1 кг", 2900, 2500, 3600, 3400, "Светлая обжарка, цитрусовые и ягодные ноты.", None),
    ],
    "Доставка из Китая": [
        ("Беспроводные наушники с шумоподавлением", 3900, 3300, 5490, 5190, "Bluetooth 5.3, до 30 часов работы.", "hit"),
        ("Робот-пылесос с влажной уборкой", 14900, 12900, 19990, 18900, "Лидар, карта помещений, управление со смартфона.", "new"),
        ("Умные часы с GPS", 5900, 4990, 7990, 7490, "Пульс, кислород, 100+ режимов тренировок.", None),
    ],
}

# product name (prefix) → [(label, price, promo price, compare 1, compare 2)]
VARIANTS = {
    "Maison Francis Kurkdjian Baccarat Rouge 540": [
        ("50 мл, товарная упаковка", 10000, 9200, 13900, 13500),
        ("50 мл, тестер", 8500, 7900, None, None),
        ("100 мл, товарная упаковка", 15000, 13900, 21900, 20900),
    ],
    "Chanel Coco Mademoiselle": [
        ("50 мл, товарная упаковка", 9900, 8900, 12500, 12100),
        ("100 мл, товарная упаковка", 14900, 12900, 18900, 18300),
        ("100 мл, тестер", 12500, 11200, None, None),
    ],
}

NEW_REVIEWS = {
    "Еда": ("Мёд настоящий, пармезан отличный. Привезли на следующий день.", 5),
    "Доставка из Китая": ("Наушники пришли за 16 дней, работают отлично. На Ozon такие дороже на 1500.", 5),
}


def _round100(x):
    return int(round(x / 100.0)) * 100


def main():
    ensure_store_schema()
    with get_db() as cur:
        cur.execute("SELECT 1 FROM coop_settings WHERE key = %s", (MARKER,))
        if cur.fetchone():
            print("Данные для страниц категорий уже есть, второй раз не добавляю.")
            return

        cat_ids = {}
        for name, (desc, slogan, intro, (cmp1, cmp2), order) in PAGES.items():
            cur.execute("SELECT id FROM coop_categories WHERE name = %s LIMIT 1", (name,))
            row = cur.fetchone()
            if row:
                cat_id = row["id"]
            else:
                cur.execute("INSERT INTO coop_categories (name) VALUES (%s) RETURNING id", (name,))
                cat_id = cur.fetchone()["id"]
            cur.execute(
                """UPDATE coop_categories SET description = %s, slogan = %s, intro = %s,
                       compare_label_1 = %s, compare_label_2 = %s, sort_order = %s WHERE id = %s""",
                (desc, slogan, intro, cmp1, cmp2, order, cat_id),
            )
            cat_ids[name] = cat_id

        # Comparison prices for the existing catalog: a bit above our own price.
        cur.execute("SELECT id, price FROM coop_products WHERE compare_price_1 IS NULL AND price IS NOT NULL")
        for p in cur.fetchall():
            price = float(p["price"])
            cur.execute(
                "UPDATE coop_products SET compare_price_1 = %s, compare_price_2 = %s WHERE id = %s",
                (_round100(price * 1.18), _round100(price * 1.11), p["id"]),
            )

        added = 0
        for cat, items in NEW_PRODUCTS.items():
            for name, price, promo, c1, c2, desc, badge in items:
                cur.execute("SELECT 1 FROM coop_products WHERE name = %s", (name,))
                if cur.fetchone():
                    continue
                cur.execute(
                    """INSERT INTO coop_products (name, price, promo_price, compare_price_1, compare_price_2,
                                                 description, category_id, badge, is_available)
                       VALUES (%s, %s, %s, %s, %s, %s, %s, %s, TRUE)""",
                    (name, price, promo, c1, c2, desc, cat_ids[cat], badge),
                )
                added += 1

        variants = 0
        for prefix, rows in VARIANTS.items():
            cur.execute("SELECT id FROM coop_products WHERE name LIKE %s ORDER BY id LIMIT 1", (prefix + "%",))
            p = cur.fetchone()
            if not p:
                continue
            cur.execute("DELETE FROM ref_product_variants WHERE product_id = %s", (p["id"],))
            for i, (label, price, promo, c1, c2) in enumerate(rows):
                cur.execute(
                    """INSERT INTO ref_product_variants
                       (product_id, label, price, promo_price, compare_price_1, compare_price_2, sort_order)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                    (p["id"], label, price, promo, c1, c2, i),
                )
                variants += 1

        # Existing reviews are about perfume; give the new pages one each.
        cur.execute("UPDATE coop_reviews SET category_id = %s WHERE category_id IS NULL", (cat_ids["Парфюмерия"],))
        cur.execute("SELECT id, full_name FROM coop_users WHERE email LIKE %s ORDER BY id LIMIT 1", ("%@test.refsale.ru",))
        author = cur.fetchone()
        for cat, (text, rating) in NEW_REVIEWS.items():
            cur.execute(
                "INSERT INTO coop_reviews (user_id, user_name, text, rating, category_id) VALUES (%s, %s, %s, %s, %s)",
                (author["id"] if author else None, author["full_name"] if author else "Покупатель", text, rating, cat_ids[cat]),
            )

        cur.execute("INSERT INTO coop_settings (key, value) VALUES (%s, 'true')", (MARKER,))

    print(f"Готово: 4 страницы категорий, {added} новых товаров, {variants} вариантов объёма, цены для сравнения.")


main()
