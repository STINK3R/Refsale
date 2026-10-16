"""Test data for a RefSale stand: leaders, promo codes, buyers, orders, chats.

Runs inside the backend container, reusing its DB pool and password hashing:
    docker compose exec -T db psql -U coop -d coop < db/demo_seed.sql      # catalog first
    docker compose exec -T backend python - < scripts/demo_seed.py

Every test account gets one random password, printed at the end. Runs once:
a marker in coop_settings stops a second run from duplicating everything.
"""
import json
import secrets

from app.db import get_db
from app.routes.order_chat import _ensure_table as ensure_order_chat
from app.routes.store import ensure_store_schema
from app.utils import hash_password

MARKER = "demo_seeded"

LEADERS = [
    # name, email, can_write
    ("Анна Ковалёва", "anna@test.refsale.ru", True),
    ("Максим Орлов", "max@test.refsale.ru", False),
]
BUYERS = [
    ("Ирина Смирнова", "irina@test.refsale.ru", "+7 900 111-11-11"),
    ("Дмитрий Волков", "dmitry@test.refsale.ru", "+7 900 222-22-22"),
    ("Елена Морозова", "elena@test.refsale.ru", "+7 900 333-33-33"),
]
PROMOS = [
    # code, label, leader index, reward, active, max uses, expires in days
    ("ANNA", "Instagram Анны", 0, 500, True, None, None),
    ("ANNA-VK", "VK Анны", 0, 400, True, 100, 90),
    ("MAX", "Telegram Максима", 1, 700, True, 50, None),
    ("OLD2025", "Старая акция", 1, 300, True, None, -30),
    ("PAUSED", "Выключенный код", None, 0, False, None, None),
]
# buyer index, promo code or None, product indexes with qty, status, contact
ORDERS = [
    (0, "ANNA", [(0, 1)], "new", "telegram"),
    (1, "ANNA", [(1, 1), (8, 2)], "accepted", "whatsapp"),
    (2, "MAX", [(3, 1)], "processing", "phone"),
    (0, "MAX", [(2, 1)], "shipping", "telegram"),
    (1, "ANNA-VK", [(4, 1), (9, 1)], "done", "max"),
    (2, None, [(5, 1)], "done", "phone"),
    (0, None, [(6, 3)], "cancelled", "whatsapp"),
    (1, "MAX", [(7, 1)], "new", "telegram"),
]
CHAT = [
    ("user", "Здравствуйте! Когда можно ждать доставку?"),
    ("admin", "Добрый день! Предоплату получили, отправим в течение двух дней."),
    ("user", "Спасибо!"),
]
REVIEWS = [
    (0, "Аромат оригинальный, упаковка целая. Пришло за 3 дня.", 5),
    (1, "Цена по промокоду заметно ниже, чем в магазинах. Буду заказывать ещё.", 5),
    (2, "Всё хорошо, но доставка заняла неделю.", 4),
]


def _user(cur, name, email, phone, password):
    cur.execute(
        """INSERT INTO coop_users (full_name, phone, email, address, password, is_approved, email_verified)
           VALUES (%s, %s, %s, '', %s, TRUE, TRUE) RETURNING id""",
        (name, phone, email, password),
    )
    return cur.fetchone()["id"]


def main():
    ensure_store_schema()
    password = secrets.token_urlsafe(9)
    hashed = hash_password(password)

    with get_db() as cur:
        ensure_order_chat(cur)
        cur.execute("SELECT 1 FROM coop_settings WHERE key = %s", (MARKER,))
        if cur.fetchone():
            print("Тестовые данные уже есть, второй раз не добавляю.")
            return
        cur.execute("SELECT id, name, price, promo_price, image_url FROM coop_products ORDER BY id")
        products = cur.fetchall()
        if len(products) < 10:
            print("В каталоге меньше 10 товаров. Сначала загрузите db/demo_seed.sql.")
            return

        leader_ids = []
        for i, (name, email, can_write) in enumerate(LEADERS):
            uid = _user(cur, name, email, f"+7 900 000-10-{i:02d}", hashed)
            cur.execute(
                "UPDATE coop_users SET is_leader = TRUE, leader_can_write = %s WHERE id = %s",
                (can_write, uid),
            )
            leader_ids.append(uid)
        buyer_ids = [_user(cur, n, e, p, hashed) for n, e, p in BUYERS]

        promos = {}
        for code, label, li, reward, active, max_uses, days in PROMOS:
            cur.execute(
                """INSERT INTO ref_promos (code, label, leader_id, reward_amount, is_active, max_uses, expires_at)
                   VALUES (%s, %s, %s, %s, %s, %s,
                           CASE WHEN %s::int IS NULL THEN NULL ELSE NOW() + make_interval(days => %s::int) END)
                   RETURNING *""",
                (code, label, leader_ids[li] if li is not None else None, reward, active, max_uses, days, days),
            )
            promos[code] = cur.fetchone()

        for n, (bi, code, lines, status, contact) in enumerate(ORDERS):
            promo = promos.get(code) if code else None
            items, total, discount = [], 0.0, 0.0
            for pi, qty in lines:
                p = products[pi]
                base = float(p["price"])
                promo_price = float(p["promo_price"] or 0)
                unit = promo_price if promo and 0 < promo_price < base else base
                items.append({"id": p["id"], "name": p["name"], "qty": qty, "price": unit,
                              "base_price": base, "image_url": p.get("image_url")})
                total += unit * qty
                discount += (base - unit) * qty
            name, _, phone = BUYERS[bi]
            age = len(ORDERS) - n  # older orders first
            cur.execute(
                """INSERT INTO coop_orders
                   (full_name, phone, address, comment, items, total, status, user_id,
                    promo_code, discount_amount, ref_promo_id, leader_id, leader_reward,
                    contact_method, created_at, status_changed_at, confirmed_at)
                   VALUES (%s, %s, %s, '', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                           NOW() - make_interval(days => %s), NOW() - make_interval(days => %s),
                           CASE WHEN %s IN ('new', 'cancelled') THEN NULL
                                ELSE NOW() - make_interval(days => %s) END)
                   RETURNING id""",
                (name, phone, "г. Москва, ул. Тестовая, д. 1", json.dumps(items, ensure_ascii=False),
                 round(total, 2), status, buyer_ids[bi],
                 code, round(discount, 2), promo["id"] if promo else None,
                 promo["leader_id"] if promo else None,
                 float(promo["reward_amount"]) if promo else 0,
                 contact, age * 2, age, status, age),
            )
            oid = cur.fetchone()["id"]
            if promo:
                cur.execute("UPDATE ref_promos SET current_uses = current_uses + 1 WHERE id = %s", (promo["id"],))
            for sender, text in CHAT[: 1 if status == "new" else 3]:
                cur.execute(
                    "INSERT INTO coop_order_messages (order_id, sender_type, sender_name, text) VALUES (%s, %s, %s, %s)",
                    (oid, sender, name if sender == "user" else "RefSale", text),
                )

        for bi, text, rating in REVIEWS:
            cur.execute(
                "INSERT INTO coop_reviews (user_id, user_name, text, rating) VALUES (%s, %s, %s, %s)",
                (buyer_ids[bi], BUYERS[bi][0], text, rating),
            )

        # A pre-order question that came in through Anna's code.
        cur.execute(
            """INSERT INTO coop_support_tickets (user_id, user_name, subject, status, promo_code, leader_id)
               VALUES (%s, %s, %s, 'open', 'ANNA', %s) RETURNING id""",
            (buyer_ids[2], BUYERS[2][0], "Есть ли Baccarat Rouge в 35 мл?", leader_ids[0]),
        )
        tid = cur.fetchone()["id"]
        cur.execute(
            "INSERT INTO coop_support_messages (ticket_id, sender_type, sender_name, text) VALUES (%s, 'user', %s, %s)",
            (tid, BUYERS[2][0], "Здравствуйте! Есть ли Baccarat Rouge 540 в объёме 35 мл?"),
        )

        cur.execute("INSERT INTO coop_settings (key, value) VALUES (%s, 'true')", (MARKER,))

    print("Готово: 2 лидера, 3 покупателя, 5 промокодов, 8 заказов, 3 отзыва, 1 вопрос продавцу.")
    print(f"Пароль всех тестовых аккаунтов: {password}")
    for _, email, _ in LEADERS:
        print(f"  лидер     {email}")
    for _, email, _ in BUYERS:
        print(f"  покупатель {email}")
    print("Промокоды: ANNA, ANNA-VK, MAX работают; OLD2025 просрочен; PAUSED выключен.")


main()
