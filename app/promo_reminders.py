"""A week before a buyer's promo code runs out, tell them: a push, an email
and a message in their "Вопросы площадке" chat.

Codes live in the buyer's browser; the server learns which ones a signed-in
buyer holds when the site checks them (ref_promo_activations). Every gunicorn
worker runs the same loop, so each reminder is claimed with one atomic UPDATE
and goes out once. A code whose end date the admin moves gets a new reminder
for the new date.
"""
import random
import threading
import time
from zoneinfo import ZoneInfo

from .db import get_db

REMIND_DAYS = 7
# Dates in the message read as the shop's own (Moscow) dates
SHOP_TZ = ZoneInfo("Europe/Moscow")
CHECK_EVERY_SECONDS = 30 * 60
# A code the buyer has not had on the site for this long is not theirs any more
SEEN_WITHIN_DAYS = 45

_started = False


def _plural_days(n: int) -> str:
    if n % 10 == 1 and n % 100 != 11:
        return f"{n} день"
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return f"{n} дня"
    return f"{n} дней"


def send_due_reminders():
    from .notify import notify_user
    from .routes.store import promo_scope_text

    with get_db() as cur:
        cur.execute(
            """SELECT a.id, a.user_id, p.id AS promo_id, p.code, p.expires_at, p.scope,
                      p.scope_category_id, p.scope_product_ids, u.full_name
               FROM ref_promo_activations a
               JOIN ref_promos p ON p.id = a.promo_id
               JOIN coop_users u ON u.id = a.user_id
               WHERE p.is_active AND p.expires_at IS NOT NULL
                 AND p.expires_at > NOW()
                 AND p.expires_at <= NOW() + make_interval(days => %s)
                 AND a.seen_at > NOW() - make_interval(days => %s)
                 AND a.reminded_for IS DISTINCT FROM p.expires_at""",
            (REMIND_DAYS, SEEN_WITHIN_DAYS),
        )
        due = cur.fetchall() or []

    for row in due:
        with get_db() as cur:
            # Claim it: only one worker gets the row back
            cur.execute(
                """UPDATE ref_promo_activations a SET reminded_for = p.expires_at
                   FROM ref_promos p
                   WHERE a.id = %s AND p.id = a.promo_id
                     AND a.reminded_for IS DISTINCT FROM p.expires_at
                   RETURNING a.id""",
                (row["id"],),
            )
            if not cur.fetchone():
                continue
            expires = row["expires_at"]
            days = max(1, int((expires.timestamp() - time.time()) // 86400) + 1)
            code = (row["code"] or "").upper()
            scope = promo_scope_text(cur, row)
            until = expires.astimezone(SHOP_TZ).strftime("%d.%m.%Y")
            text = (
                f"Промокод {code} действует ещё {_plural_days(days)} — до {until}. "
                f"Скидка {scope}. Загляните в «Избранное»: там видно, что по нему дешевле, "
                "а заказ можно оформить в пару нажатий."
            )
            # The chat: a note from the platform in the buyer's questions
            cur.execute(
                """INSERT INTO coop_support_tickets (user_id, user_name, subject, status, promo_code)
                   VALUES (%s, %s, %s, 'in_progress', %s) RETURNING id""",
                (row["user_id"], row.get("full_name") or "", f"Промокод {code} скоро закончится", code),
            )
            tid = cur.fetchone()["id"]
            cur.execute(
                """INSERT INTO coop_support_messages (ticket_id, sender_type, sender_name, text)
                   VALUES (%s, 'admin', 'RefSale', %s)""",
                (tid, text),
            )
        notify_user(
            row["user_id"], key=f"promo:{row['promo_id']}",
            title=f"Промокод {code}: осталось {_plural_days(days)}",
            body=text, url="/favorites",
            email_subject=f"Промокод {code} закончится {until}",
            email_heading=f"Промокод {code} скоро закончится",
        )


def _loop():
    # Workers start together; spread them out a little
    time.sleep(60 + random.random() * 120)
    while True:
        try:
            send_due_reminders()
        except Exception as e:
            print(f"[promo reminders] {e}")
        time.sleep(CHECK_EVERY_SECONDS + random.random() * 60)


def start_promo_reminders():
    global _started
    if _started:
        return
    _started = True
    threading.Thread(target=_loop, daemon=True, name="promo-reminders").start()
