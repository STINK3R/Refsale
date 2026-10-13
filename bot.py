#!/usr/bin/env python3
"""
RefSale — Telegram Bot (Python, polling)
"""

import os
import re
import json
import html
import time
import logging
import asyncio
from datetime import datetime
from collections import defaultdict
from typing import Optional

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from telegram import (
    Update, InlineKeyboardButton, InlineKeyboardMarkup, BotCommand
)
from telegram.ext import (
    ApplicationBuilder, CommandHandler, CallbackQueryHandler,
    ContextTypes,
)
from telegram.constants import ParseMode

# ──────────────────────────────────────────────
# Config & Security
# ──────────────────────────────────────────────
load_dotenv()

BOT_TOKEN: str = os.environ.get("TELEGRAM_BOT_TOKEN", "")
DATABASE_URL: str = os.environ.get("DATABASE_URL", "postgresql://coop:coop@localhost:5432/coop")
_raw_admins = os.environ.get("TELEGRAM_ADMIN_CHAT_IDS") or os.environ.get("TELEGRAM_ADMIN_CHAT_ID", "")
ADMIN_CHAT_IDS: set[str] = {cid.strip() for cid in _raw_admins.split(",") if cid.strip()}
WEBSITE_URL: str = os.environ.get("WEBSITE_URL", "")

# Reload admin IDs from database (coop_settings) to pick up changes made via admin panel
def reload_admin_ids() -> None:
    global ADMIN_CHAT_IDS
    try:
        rows = db_query("SELECT value FROM coop_settings WHERE key = 'telegram_admin_chat_ids' LIMIT 1")
        if rows and rows[0].get("value"):
            db_ids = {cid.strip() for cid in rows[0]["value"].split(",") if cid.strip()}
            if db_ids:
                ADMIN_CHAT_IDS = db_ids
                return
    except Exception:
        pass
    # Fallback: keep env-based IDs

if not BOT_TOKEN:
    raise SystemExit("❌ Заполните .env файл: TELEGRAM_BOT_TOKEN")

# Rate limiting
RATE_LIMIT = 15
_rate_store: dict[int, list[float]] = defaultdict(list)

# Order notification polling
ORDER_POLL_INTERVAL = 15  # seconds
_last_notified_order_id: int = 0
_last_notified_vip_order_id: int = 0
_poll_task: asyncio.Task | None = None

STATUS_MAP = {
    "new": "🆕 Новый",
    "processing": "⏳ В обработке",
    "ready": "📬 Готов к выдаче",
    "done": "✅ Выполнен",
    "cancelled": "❌ Отменён",
}

WELCOME_TEXT = (
    "🏪 <b>RefSale — Бот</b>\n\n"
    "Добро пожаловать! Этот бот — ваш личный помощник "
    "в магазине <b>RefSale</b>.\n\n"
    "🔔 <b>Что умеет бот:</b>\n"
    "  • Уведомления о новых заказах\n"
    "  • Просмотр истории заказов\n"
    "  • Проверка статуса доставки\n"
    "  • Информация о сроках доставки\n\n"
    "Выберите действие ниже 👇"
)

HELP_TEXT = (
    "🏪 <b>RefSale — Справка</b>\n\n"
    "<b>Команды:</b>\n"
    "/start — привязать аккаунт\n"
    "/orders — мои последние заказы\n"
    "/status 42 — статус заказа\n"
    "/help — эта справка\n\n"
    "<b>Как это работает:</b>\n"
    "1. Зарегистрируйтесь на сайте\n"
    "2. Нажмите /start для привязки\n"
    "3. Оформите заказ на сайте\n"
    "4. Получайте уведомления здесь!\n\n"
    "При вопросах обращайтесь к администратору."
)

# ──────────────────────────────────────────────
# Logging
# ──────────────────────────────────────────────
logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("coop_bot")

# ──────────────────────────────────────────────
# PostgreSQL helper
# ──────────────────────────────────────────────
def _get_conn():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    return conn


def db_query(sql: str, params=None) -> list[dict]:
    try:
        conn = _get_conn()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(sql, params or ())
        if cur.description:
            rows = cur.fetchall()
            result = [dict(r) for r in rows]
        else:
            result = []
        cur.close()
        conn.close()
        return result
    except Exception as e:
        logger.error("DB query error: %s — %s", sql[:80], e)
        return []


def db_execute(sql: str, params=None) -> list[dict]:
    try:
        conn = _get_conn()
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(sql, params or ())
        if cur.description:
            rows = cur.fetchall()
            result = [dict(r) for r in rows]
        else:
            result = []
        cur.close()
        conn.close()
        return result
    except Exception as e:
        logger.error("DB execute error: %s — %s", sql[:80], e)
        return []


# ──────────────────────────────────────────────
# Security helpers
# ──────────────────────────────────────────────
def sanitize(text: str, max_len: int = 200) -> str:
    return html.escape(text.strip())[:max_len]


def is_safe_id(value: str) -> bool:
    return bool(re.fullmatch(r"\d{1,10}", value))


def rate_limited(user_id: int) -> bool:
    now = time.time()
    window = [t for t in _rate_store[user_id] if now - t < 60]
    _rate_store[user_id] = window
    if len(window) >= RATE_LIMIT:
        return True
    _rate_store[user_id].append(now)
    return False


def is_admin(chat_id: int) -> bool:
    return str(chat_id) in ADMIN_CHAT_IDS


def get_display_name(user: dict) -> str:
    parts = (user.get("full_name") or "").split()
    return parts[1] if len(parts) > 1 else (parts[0] if parts else "")


# ──────────────────────────────────────────────
# Inline keyboards
# ──────────────────────────────────────────────
def main_menu_kb(is_linked: bool = True) -> InlineKeyboardMarkup:
    buttons = []
    if WEBSITE_URL:
        buttons.append([InlineKeyboardButton("🌐 Сайт кооператива", url=WEBSITE_URL)])
    if is_linked:
        buttons.append([InlineKeyboardButton("📦 Мои заказы", callback_data="orders")])
        buttons.append([
            InlineKeyboardButton("👤 Мой профиль", callback_data="profile"),
            InlineKeyboardButton("ℹ️ Помощь", callback_data="help"),
        ])
    else:
        buttons.append([InlineKeyboardButton("🔄 Попробовать снова", callback_data="start")])
        buttons.append([InlineKeyboardButton("ℹ️ Помощь", callback_data="help")])
    return InlineKeyboardMarkup(buttons)


def orders_kb(orders: list) -> InlineKeyboardMarkup:
    buttons = []
    for o in orders[:5]:
        oid = o.get("id", "?")
        status = STATUS_MAP.get(o.get("status", ""), o.get("status", ""))
        total = f'{o.get("total", 0):,.0f}'.replace(",", " ")
        buttons.append([
            InlineKeyboardButton(
                f"#{oid}  {status}  💰{total} ₽",
                callback_data=f"status_{oid}",
            )
        ])
    buttons.append([InlineKeyboardButton("⬅️ Назад", callback_data="menu")])
    return InlineKeyboardMarkup(buttons)


def back_to_orders_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("⬅️ К заказам", callback_data="orders")],
        [InlineKeyboardButton("🏠 Главное меню", callback_data="menu")],
    ])


def back_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("⬅️ Назад", callback_data="menu")],
    ])


# ──────────────────────────────────────────────
# Formatting helpers
# ──────────────────────────────────────────────
def fmt_price(val) -> str:
    return f"{int(val):,}".replace(",", " ") + " ₽"


def fmt_date(iso) -> str:
    try:
        if hasattr(iso, 'strftime'):
            return iso.strftime("%d.%m.%Y")
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).strftime("%d.%m.%Y")
    except Exception:
        return "—"


def fmt_order_items(raw_items) -> str:
    try:
        if isinstance(raw_items, str):
            arr = json.loads(raw_items or "[]")
        elif isinstance(raw_items, list):
            arr = raw_items
        else:
            arr = []
        lines = []
        for i in arr:
            qty = i.get("qty", 1)
            price = i.get("price")
            price_str = f" = {fmt_price(float(price) * qty)}" if price else ""
            lines.append(f"  • {i.get('name', '?')} × {qty}{price_str}")
        return "\n".join(lines)
    except Exception:
        return ""


# ──────────────────────────────────────────────
# User lookup
# ──────────────────────────────────────────────
def find_user_by_tg(username: str) -> dict | None:
    safe = sanitize(username, 64)
    rows = db_query("SELECT * FROM coop_users WHERE telegram_username = %s LIMIT 1", (safe,))
    return rows[0] if rows else None


# ──────────────────────────────────────────────
# /start
# ──────────────────────────────────────────────
async def cmd_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    msg = update.effective_message
    chat_id = update.effective_chat.id
    username = update.effective_user.username

    if rate_limited(update.effective_user.id):
        await msg.reply_text("⏳ Слишком много запросов. Подождите минуту.")
        return

    # Admin gets a special welcome — no site registration needed
    if is_admin(chat_id):
        admin_kb = InlineKeyboardMarkup([
            [InlineKeyboardButton("📊 Статистика", callback_data="admin_stats")],
            [InlineKeyboardButton("📦 Последние заказы", callback_data="admin_orders")],
            [InlineKeyboardButton("👥 Новые заявки", callback_data="admin_requests")],
            *([[InlineKeyboardButton("🌐 Сайт кооператива", url=WEBSITE_URL)]] if WEBSITE_URL else []),
        ])
        await msg.reply_text(
            "🛡 <b>Добро пожаловать, администратор!</b>\n\n"
            "Вы получаете уведомления о всех новых заказах.\n\n"
            "🔔 <b>Возможности:</b>\n"
            "  • Уведомления о новых заказах\n"
            "  • Просмотр статистики\n"
            "  • Управление заявками\n\n"
            "Выберите действие ниже 👇",
            parse_mode=ParseMode.HTML,
            reply_markup=admin_kb,
        )
        return

    if not username:
        await msg.reply_text(
            "❌ У вас не установлен username в Telegram.\n\n"
            "Перейдите в <b>Настройки → Имя пользователя</b> и установите его, "
            "затем повторите /start.",
            parse_mode=ParseMode.HTML,
        )
        return

    user = find_user_by_tg(username)
    if not user:
        await msg.reply_text(
            f"👋 Привет, @{username}!\n\n"
            f"Ваш Telegram пока не привязан к кооперативу.\n\n"
            f"Зарегистрируйтесь или измените в настройках профиля username на сайте на: <b>@{username}</b>, "
            f'затем нажмите кнопку "Попробовать заново".',
            parse_mode=ParseMode.HTML,
            reply_markup=main_menu_kb(is_linked=False),
        )
        return

    display = get_display_name(user)
    existing_chat_id = user.get("telegram_chat_id")

    if existing_chat_id and str(existing_chat_id) == str(chat_id):
        await msg.reply_text(
            f"👋 <b>{display}, ваш аккаунт уже привязан!</b>\n\n"
            f"👤 {user.get('full_name', '—')}\n"
            f"📱 {user.get('phone', '—')}\n"
            f"📍 {user.get('address', '—')}\n\n"
            f"Вы уже получаете уведомления о заказах.\n"
            f"Выберите действие ниже 👇",
            parse_mode=ParseMode.HTML,
            reply_markup=main_menu_kb(),
        )
        return

    db_execute("UPDATE coop_users SET telegram_chat_id = %s WHERE id = %s", (str(chat_id), user['id']))

    await msg.reply_text(
        f"✅ <b>Аккаунт привязан!</b>\n\n"
        f"👤 {display}\n📱 {user.get('phone', '—')}\n📍 {user.get('address', '—')}\n\n"
        f"Теперь вы будете получать уведомления о заказах прямо в Telegram.",
        parse_mode=ParseMode.HTML,
        reply_markup=main_menu_kb(),
    )


# ──────────────────────────────────────────────
# /orders
# ──────────────────────────────────────────────
async def send_orders(chat_id: int, username: str, msg_obj, *, edit: bool = False) -> None:
    user = find_user_by_tg(username)
    if not user:
        text = "❌ Аккаунт не найден. Зарегистрируйтесь на сайте."
        kb = main_menu_kb(is_linked=False)
        if edit:
            await msg_obj.edit_text(text, parse_mode=ParseMode.HTML, reply_markup=kb)
        else:
            await msg_obj.reply_text(text, parse_mode=ParseMode.HTML, reply_markup=kb)
        return

    data = db_query("SELECT * FROM coop_orders WHERE user_id = %s ORDER BY created_at DESC LIMIT 5", (user['id'],))
    if not data:
        text = "📦 У вас пока нет заказов.\n\nОформите заказ на сайте — уведомление придёт сюда!"
        kb = back_kb()
        if edit:
            await msg_obj.edit_text(text, reply_markup=kb)
        else:
            await msg_obj.reply_text(text, reply_markup=kb)
        return

    lines = [f"📦 <b>Ваши заказы ({len(data)}):</b>\n"]
    lines.append("Нажмите на заказ для подробностей:\n")
    for o in data:
        date = fmt_date(o.get("created_at", ""))
        status = STATUS_MAP.get(o.get("status", ""), o.get("status", "Новый"))
        lines.append(f"🛒 #{o['id']} — {date} — {status} — <b>{fmt_price(o.get('total', 0))}</b>")

    text = "\n".join(lines)
    kb = orders_kb(data)
    if edit:
        await msg_obj.edit_text(text, parse_mode=ParseMode.HTML, reply_markup=kb)
    else:
        await msg_obj.reply_text(text, parse_mode=ParseMode.HTML, reply_markup=kb)


async def cmd_orders(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if rate_limited(update.effective_user.id):
        await update.effective_message.reply_text("⏳ Подождите минуту.")
        return
    username = update.effective_user.username
    if not username:
        await update.effective_message.reply_text("❌ Установите username в настройках Telegram.")
        return
    await send_orders(update.effective_chat.id, username, update.effective_message)


# ──────────────────────────────────────────────
# /status <id>
# ──────────────────────────────────────────────
async def send_status(order_id: str, chat_id: int, username: str, msg_obj, *, edit: bool = False) -> None:
    if not is_safe_id(order_id):
        text = "❌ Некорректный номер заказа."
        if edit:
            await msg_obj.edit_text(text, reply_markup=back_to_orders_kb())
        else:
            await msg_obj.reply_text(text, reply_markup=back_to_orders_kb())
        return

    user_id = None
    if username:
        user = find_user_by_tg(username)
        if user:
            user_id = user["id"]

    data = db_query("SELECT * FROM coop_orders WHERE id = %s LIMIT 1", (int(order_id),))
    if not data:
        text = f"❌ Заказ #{order_id} не найден."
        if edit:
            await msg_obj.edit_text(text, reply_markup=back_to_orders_kb())
        else:
            await msg_obj.reply_text(text, reply_markup=back_to_orders_kb())
        return

    o = data[0]
    if user_id and o.get("user_id") and o["user_id"] != user_id and not is_admin(chat_id):
        text = f"❌ Заказ #{order_id} не принадлежит вашему аккаунту."
        if edit:
            await msg_obj.edit_text(text, reply_markup=back_to_orders_kb())
        else:
            await msg_obj.reply_text(text, reply_markup=back_to_orders_kb())
        return

    date = fmt_date(o.get("created_at", ""))
    status = STATUS_MAP.get(o.get("status", ""), o.get("status", "Новый"))
    items = fmt_order_items(o.get("items", "[]"))

    lines = [
        f"🛒 <b>Заказ #{o['id']}</b> — {date}",
        f"Статус: {status}",
    ]
    if items:
        lines.append(f"\n📦 Состав:\n{items}")
    lines.append(f"\n💰 Итого: <b>{fmt_price(o.get('total', 0))}</b>")

    text = "\n".join(lines)
    if edit:
        await msg_obj.edit_text(text, parse_mode=ParseMode.HTML, reply_markup=back_to_orders_kb())
    else:
        await msg_obj.reply_text(text, parse_mode=ParseMode.HTML, reply_markup=back_to_orders_kb())


async def cmd_status(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if rate_limited(update.effective_user.id):
        await update.effective_message.reply_text("⏳ Подождите минуту.")
        return
    parts = (update.effective_message.text or "").split()
    if len(parts) < 2:
        await update.effective_message.reply_text(
            "Использование: /status <номер заказа>\nПример: /status 42"
        )
        return
    username = update.effective_user.username or ""
    await send_status(parts[1], update.effective_chat.id, username, update.effective_message)


# ──────────────────────────────────────────────
# /help
# ──────────────────────────────────────────────
async def cmd_help(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await update.effective_message.reply_text(
        HELP_TEXT,
        parse_mode=ParseMode.HTML,
        reply_markup=back_kb(),
    )


# ───────────────────────────────
# /menu
# ───────────────────────────────
async def cmd_menu(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if rate_limited(update.effective_user.id):
        await update.effective_message.reply_text("⏳ Подождите минуту.")
        return
    username = update.effective_user.username or ""
    user = find_user_by_tg(username) if username else None
    linked = user is not None
    await update.effective_message.reply_text(
        WELCOME_TEXT,
        parse_mode=ParseMode.HTML,
        reply_markup=main_menu_kb(is_linked=linked),
    )


# ──────────────────────────────────────────────
# Inline button handler
# ──────────────────────────────────────────────
async def on_callback(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()

    uid = update.effective_user.id
    if rate_limited(uid):
        await query.edit_message_text("⏳ Слишком много запросов. Подождите минуту.")
        return

    data = query.data or ""
    username = update.effective_user.username or ""
    chat_id = update.effective_chat.id
    msg = query.message

    if data == "start":
        user = find_user_by_tg(username) if username else None
        if not user:
            await msg.edit_text(
                f"❌ Аккаунт с username @{username} не найден.\n"
                f"Зарегистрируйтесь на сайте, затем нажмите кнопку.",
                parse_mode=ParseMode.HTML,
                reply_markup=main_menu_kb(is_linked=False),
            )
            return
        existing = user.get("telegram_chat_id")
        if existing and str(existing) == str(chat_id):
            display = get_display_name(user)
            await msg.edit_text(
                f"👋 <b>{display}, ваш аккаунт уже привязан!</b>\n\n"
                f"Вы уже получаете уведомления о заказах.\n"
                f"Выберите действие ниже 👇",
                parse_mode=ParseMode.HTML,
                reply_markup=main_menu_kb(),
            )
            return
        db_execute("UPDATE coop_users SET telegram_chat_id = %s WHERE id = %s", (str(chat_id), user['id']))
        display = get_display_name(user)
        await msg.edit_text(
            f"✅ <b>Аккаунт привязан!</b>\n\n"
            f"👤 {display}\n📱 {user.get('phone', '—')}\n📍 {user.get('address', '—')}\n\n"
            f"Теперь вы будете получать уведомления о заказах.",
            parse_mode=ParseMode.HTML,
            reply_markup=main_menu_kb(),
        )

    elif data == "orders":
        if not username:
            await msg.edit_text("❌ Установите username в настройках Telegram.")
            return
        await send_orders(chat_id, username, msg, edit=True)

    elif data.startswith("status_"):
        order_id = data.replace("status_", "")
        await send_status(order_id, chat_id, username, msg, edit=True)

    elif data == "help":
        await msg.edit_text(HELP_TEXT, parse_mode=ParseMode.HTML, reply_markup=back_kb())

    elif data == "profile":
        user = find_user_by_tg(username) if username else None
        if not user:
            await msg.edit_text("❌ Аккаунт не найден.", reply_markup=back_kb())
            return
        display = get_display_name(user)
        reg_date = fmt_date(user.get("created_at", ""))
        await msg.edit_text(
            f"👤 <b>Ваш профиль</b>\n\n"
            f"📛 ФИО: {user.get('full_name', '—')}\n"
            f"📱 Телефон: {user.get('phone', '—')}\n"
            f"📍 Адрес: {user.get('address', '—')}\n"
            f"💬 Telegram: @{username}\n"
            f"📅 Регистрация: {reg_date}\n\n"
            f"Для изменения данных зайдите на сайт → Профиль.",
            parse_mode=ParseMode.HTML,
            reply_markup=back_kb(),
        )

    elif data == "menu":
        # If admin, show admin menu
        if is_admin(chat_id):
            admin_kb = InlineKeyboardMarkup([
                [InlineKeyboardButton("📊 Статистика", callback_data="admin_stats")],
                [InlineKeyboardButton("📦 Последние заказы", callback_data="admin_orders")],
                [InlineKeyboardButton("👥 Новые заявки", callback_data="admin_requests")],
                *([[InlineKeyboardButton("🌐 Сайт кооператива", url=WEBSITE_URL)]] if WEBSITE_URL else []),
            ])
            await msg.edit_text(
                "🛡 <b>Админ-панель</b>\n\nВыберите действие:",
                parse_mode=ParseMode.HTML,
                reply_markup=admin_kb,
            )
            return
        user = find_user_by_tg(username) if username else None
        linked = user is not None
        await msg.edit_text(
            WELCOME_TEXT,
            parse_mode=ParseMode.HTML,
            reply_markup=main_menu_kb(is_linked=linked),
        )

    # ── Admin callbacks ──
    elif data == "admin_stats" and is_admin(chat_id):
        try:
            users = db_query("SELECT COUNT(*) as cnt FROM coop_users")
            orders = db_query("SELECT COUNT(*) as cnt FROM coop_orders")
            pending = db_query("SELECT COUNT(*) as cnt FROM coop_users WHERE is_approved = FALSE AND is_blocked = FALSE")
            products = db_query("SELECT COUNT(*) as cnt FROM coop_products")
            total_rev = db_query("SELECT COALESCE(SUM(total),0) as s FROM coop_orders WHERE status IN ('done','processing','new')")
            await msg.edit_text(
                "📊 <b>Статистика кооператива</b>\n\n"
                f"👥 Участников: <b>{users[0]['cnt'] if users else 0}</b>\n"
                f"📦 Заказов: <b>{orders[0]['cnt'] if orders else 0}</b>\n"
                f"🕐 Заявок на вступление: <b>{pending[0]['cnt'] if pending else 0}</b>\n"
                f"🛒 Товаров: <b>{products[0]['cnt'] if products else 0}</b>\n"
                f"💰 Общий оборот: <b>{fmt_price(total_rev[0]['s'] if total_rev else 0)}</b>",
                parse_mode=ParseMode.HTML,
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Назад", callback_data="menu")]]),
            )
        except Exception as e:
            await msg.edit_text(f"❌ Ошибка: {e}", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Назад", callback_data="menu")]]))

    elif data == "admin_orders" and is_admin(chat_id):
        try:
            recent = db_query("SELECT * FROM coop_orders ORDER BY created_at DESC LIMIT 10")
            if not recent:
                await msg.edit_text("📦 Нет заказов.", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Назад", callback_data="menu")]]))
                return
            lines = ["📦 <b>Последние 10 заказов:</b>\n"]
            for o in recent:
                status = STATUS_MAP.get(o.get("status",""), o.get("status",""))
                lines.append(f"#{o['id']} — {o.get('full_name','—')} — {status} — <b>{fmt_price(o.get('total',0))}</b>")
            await msg.edit_text(
                "\n".join(lines),
                parse_mode=ParseMode.HTML,
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Назад", callback_data="menu")]]),
            )
        except Exception as e:
            await msg.edit_text(f"❌ Ошибка: {e}", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Назад", callback_data="menu")]]))

    elif data == "admin_requests" and is_admin(chat_id):
        try:
            pending = db_query("SELECT * FROM coop_users WHERE is_approved = FALSE AND is_blocked = FALSE ORDER BY created_at DESC LIMIT 20")
            if not pending:
                await msg.edit_text("✅ Нет новых заявок на вступление.", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Назад", callback_data="menu")]]))
                return
            lines = [f"👥 <b>Заявки на вступление ({len(pending)}):</b>\n"]
            for u in pending:
                tg = f" @{u['telegram_username']}" if u.get('telegram_username') else ""
                lines.append(f"• {u.get('full_name','—')} — {u.get('phone','—')}{tg}")
            lines.append("\n<i>Одобрите заявки через админ-панель на сайте.</i>")
            await msg.edit_text(
                "\n".join(lines),
                parse_mode=ParseMode.HTML,
                reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Назад", callback_data="menu")]]),
            )
        except Exception as e:
            await msg.edit_text(f"❌ Ошибка: {e}", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅️ Назад", callback_data="menu")]]))


# ──────────────────────────────────────────────
# Order notification polling (background job)
# ──────────────────────────────────────────────
async def poll_new_orders(app) -> None:
    global _last_notified_order_id
    bot = app.bot

    initial = db_query("SELECT id FROM coop_orders ORDER BY id DESC LIMIT 1")
    if initial:
        _last_notified_order_id = initial[0].get("id", 0)
    logger.info("📡 Order polling started (last_id=%d)", _last_notified_order_id)

    suppliers = db_query("SELECT * FROM coop_suppliers")
    products = db_query("SELECT id, name, supplier_id FROM coop_products")

    _reload_counter = 0
    while True:
        await asyncio.sleep(ORDER_POLL_INTERVAL)
        # Reload admin IDs from DB every ~2 minutes
        _reload_counter += 1
        if _reload_counter % 8 == 0:
            reload_admin_ids()
        try:
            new_orders = db_query(
                "SELECT * FROM coop_orders WHERE id > %s ORDER BY id ASC LIMIT 10",
                (_last_notified_order_id,)
            )
            if not new_orders:
                continue

            for order in new_orders:
                oid = order.get("id", 0)
                if oid <= _last_notified_order_id:
                    continue
                _last_notified_order_id = oid

                full_name = order.get("full_name", "—")
                phone = order.get("phone", "—")
                address = order.get("address", "—")
                comment = order.get("comment", "")
                total = order.get("total", 0)
                user_id = order.get("user_id")

                items_raw = order.get("items", "[]")
                try:
                    items = json.loads(items_raw) if isinstance(items_raw, str) else items_raw
                except Exception:
                    items = []

                items_list = "\n".join(
                    f"  • {i.get('name','?')} × {i.get('qty',1)} = {fmt_price(float(i.get('price',0)) * i.get('qty',1))}"
                    for i in items
                )

                by_supp: dict[str, list] = {}
                for item in items:
                    prod = next((p for p in products if p.get("name") == item.get("name")), None)
                    sid = str(prod["supplier_id"]) if prod and prod.get("supplier_id") else "__none__"
                    by_supp.setdefault(sid, []).append(item)

                supp_sections = []
                for sid, sitems in by_supp.items():
                    if sid == "__none__":
                        continue
                    supplier = next((s for s in suppliers if str(s.get("id")) == sid), None)
                    if not supplier:
                        continue
                    slist = "\n".join(
                        f"  • {i.get('name','?')} × {i.get('qty',1)} = {fmt_price(float(i.get('price',0)) * i.get('qty',1))}"
                        for i in sitems
                    )
                    stotal = sum(float(i.get("price", 0)) * i.get("qty", 1) for i in sitems)
                    day = (supplier.get("delivery_day") or "—").strip()
                    supp_sections.append(
                        f"📦 <b>{supplier.get('name','')}</b>\n"
                        f"📅 Доставка: {day}\n"
                        f"{slist}\n"
                        f"💵 Подитог: <b>{fmt_price(stotal)}</b>"
                    )

                supp_block = ""
                if supp_sections:
                    supp_block = "\n\n━━━━━━━━━━━━━━━\n\n" + "\n\n━━━━━━━━━━━━━━━\n\n".join(supp_sections)

                tg_info = ""
                user_chat_id = None
                if user_id:
                    udata = db_query("SELECT * FROM coop_users WHERE id = %s LIMIT 1", (user_id,))
                    if udata:
                        u = udata[0]
                        tg_un = u.get("telegram_username")
                        if tg_un:
                            tg_info = f"\n💬 Telegram: @{tg_un.replace('@','')}"
                        user_chat_id = u.get("telegram_chat_id")

                if ADMIN_CHAT_IDS:
                    admin_msg = (
                        f"┏━━━━━━━━━━━━━━━━━━━━━━┓\n"
                        f"   🛒 <b>НОВЫЙ ЗАКАЗ #{oid}</b>\n"
                        f"┗━━━━━━━━━━━━━━━━━━━━━━┛\n\n"
                        f"👤 <b>Клиент:</b> {full_name}\n"
                        f"📱 <b>Тел:</b> {phone}{tg_info}\n"
                        f"📍 <b>Адрес:</b> {address}"
                        f"{chr(10) + '💬 <b>Комментарий:</b> <i>' + comment + '</i>' if comment else ''}"
                        f"{supp_block}\n\n"
                        f"┌──────────────────────┐\n"
                        f"  💰 <b>ИТОГО: {fmt_price(total)}</b>\n"
                        f"└──────────────────────┘"
                    )
                    for admin_id in ADMIN_CHAT_IDS:
                        try:
                            await bot.send_message(
                                chat_id=admin_id, text=admin_msg, parse_mode=ParseMode.HTML,
                            )
                        except Exception as e:
                            logger.error("Admin notify #%d (chat %s): %s", oid, admin_id, e)

                if user_chat_id:
                    delivery_lines = []
                    for sid, sitems in by_supp.items():
                        if sid == "__none__":
                            continue
                        supplier = next((s for s in suppliers if str(s.get("id")) == sid), None)
                        if not supplier:
                            continue
                        names = ", ".join(i.get("name", "?") for i in sitems)
                        day = (supplier.get("delivery_day") or "—").strip()
                        delivery_lines.append(f"📌 <b>{day}</b> — {names}")

                    delivery_block = ""
                    if delivery_lines:
                        delivery_block = "\n\n📅 <b>Примерные сроки доставки:</b>\n" + "\n".join(delivery_lines)

                    user_msg = (
                        f"┏━━━━━━━━━━━━━━━━━━━━━━┓\n"
                        f"   ✅ <b>ЗАКАЗ #{oid} ПРИНЯТ!</b>\n"
                        f"┗━━━━━━━━━━━━━━━━━━━━━━┛\n\n"
                        f"📦 <b>Состав заказа:</b>\n{items_list}\n\n"
                        f"┌──────────────────────┐\n"
                        f"  💰 <b>ИТОГО: {fmt_price(total)}</b>\n"
                        f"└──────────────────────┘"
                        f"{delivery_block}\n\n"
                        f"📋 Статус заказа: /status {oid}"
                    )
                    try:
                        await bot.send_message(
                            chat_id=user_chat_id, text=user_msg, parse_mode=ParseMode.HTML,
                            reply_markup=InlineKeyboardMarkup([
                                [InlineKeyboardButton(f"📋 Заказ #{oid}", callback_data=f"status_{oid}")],
                                [InlineKeyboardButton("📦 Все заказы", callback_data="orders")],
                            ]),
                        )
                    except Exception as e:
                        logger.error("User notify #%d (chat %s): %s", oid, user_chat_id, e)

                logger.info("✅ Notified order #%d", oid)

        except Exception as e:
            logger.error("Order poll error: %s", e)


# ──────────────────────────────────────────────
# VIP Order notification polling (background job)
# ──────────────────────────────────────────────
async def poll_new_vip_orders(app) -> None:
    global _last_notified_vip_order_id
    bot = app.bot

    initial = db_query("SELECT id FROM coop_vip_orders ORDER BY id DESC LIMIT 1")
    if initial:
        _last_notified_vip_order_id = initial[0].get("id", 0)
    logger.info("📡 VIP order polling started (last_id=%d)", _last_notified_vip_order_id)

    while True:
        await asyncio.sleep(ORDER_POLL_INTERVAL)
        try:
            new_orders = db_query(
                "SELECT * FROM coop_vip_orders WHERE id > %s ORDER BY id ASC LIMIT 10",
                (_last_notified_vip_order_id,)
            )
            if not new_orders:
                continue

            for order in new_orders:
                oid = order.get("id", 0)
                if oid <= _last_notified_vip_order_id:
                    continue
                _last_notified_vip_order_id = oid

                full_name = order.get("full_name", "—")
                phone = order.get("phone", "—")
                address = order.get("address", "—")
                comment = order.get("comment", "")
                total = order.get("total", 0)
                user_id = order.get("user_id")

                items_raw = order.get("items", "[]")
                try:
                    items = json.loads(items_raw) if isinstance(items_raw, str) else items_raw
                except Exception:
                    items = []

                items_list = "\n".join(
                    f"  • {i.get('name','?')} × {i.get('qty',1)} = {fmt_price(float(i.get('price',0)) * i.get('qty',1))}"
                    for i in items
                )

                tg_info = ""
                user_chat_id = None
                if user_id:
                    udata = db_query("SELECT * FROM coop_users WHERE id = %s LIMIT 1", (user_id,))
                    if udata:
                        u = udata[0]
                        tg_un = u.get("telegram_username")
                        if tg_un:
                            tg_info = f"\n💬 Telegram: @{tg_un.replace('@','')}"
                        user_chat_id = u.get("telegram_chat_id")

                # Notify admins — VIP styled message
                if ADMIN_CHAT_IDS:
                    admin_msg = (
                        f"┏━━━━━━━━━━━━━━━━━━━━━━┓\n"
                        f"   👑 <b>VIP ЗАКАЗ #{oid}</b>\n"
                        f"┗━━━━━━━━━━━━━━━━━━━━━━┛\n\n"
                        f"👤 <b>Клиент:</b> {full_name}\n"
                        f"📱 <b>Тел:</b> {phone}{tg_info}\n"
                        f"📍 <b>Адрес:</b> {address}"
                        f"{chr(10) + '💬 <b>Комментарий:</b> <i>' + comment + '</i>' if comment else ''}"
                        f"\n\n📦 <b>Состав заказа:</b>\n{items_list}\n\n"
                        f"┌──────────────────────┐\n"
                        f"  💰 <b>ИТОГО: {fmt_price(total)}</b>\n"
                        f"└──────────────────────┘"
                    )
                    for admin_id in ADMIN_CHAT_IDS:
                        try:
                            await bot.send_message(
                                chat_id=admin_id, text=admin_msg, parse_mode=ParseMode.HTML,
                            )
                        except Exception as e:
                            logger.error("Admin VIP notify #%d (chat %s): %s", oid, admin_id, e)

                # Notify user — VIP styled message
                if user_chat_id:
                    user_msg = (
                        f"┏━━━━━━━━━━━━━━━━━━━━━━┓\n"
                        f"   👑 <b>VIP ЗАКАЗ #{oid} ПРИНЯТ!</b>\n"
                        f"┗━━━━━━━━━━━━━━━━━━━━━━┛\n\n"
                        f"📦 <b>Состав заказа:</b>\n{items_list}\n\n"
                        f"┌──────────────────────┐\n"
                        f"  💰 <b>ИТОГО: {fmt_price(total)}</b>\n"
                        f"└──────────────────────┘\n\n"
                        f"⭐ Ваш VIP заказ будет обработан в приоритетном порядке!"
                    )
                    try:
                        await bot.send_message(
                            chat_id=user_chat_id, text=user_msg, parse_mode=ParseMode.HTML,
                            reply_markup=InlineKeyboardMarkup([
                                [InlineKeyboardButton("📦 Все заказы", callback_data="orders")],
                            ]),
                        )
                    except Exception as e:
                        logger.error("User VIP notify #%d (chat %s): %s", oid, user_chat_id, e)

                logger.info("✅ Notified VIP order #%d", oid)

        except Exception as e:
            logger.error("VIP order poll error: %s", e)


# ──────────────────────────────────────────────
# Startup & Shutdown
# ──────────────────────────────────────────────
async def post_init(app) -> None:
    global _poll_task
    # Load admin IDs from database (overrides env vars if DB has values)
    reload_admin_ids()
    await app.bot.set_my_commands([
        BotCommand("start", "Привязать аккаунт"),
        BotCommand("menu", "Главное меню"),
        BotCommand("orders", "Мои заказы"),
        BotCommand("status", "Статус заказа"),
        BotCommand("help", "Справка"),
    ])
    me = await app.bot.get_me()
    logger.info("✅ Бот @%s запущен (polling)", me.username)
    logger.info("   Database: %s", DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else DATABASE_URL)
    logger.info("   Website: %s", WEBSITE_URL or "(не задан)")
    logger.info("   Admins (%d): %s", len(ADMIN_CHAT_IDS), ", ".join(ADMIN_CHAT_IDS) if ADMIN_CHAT_IDS else "(не задан)")

    _poll_task = asyncio.create_task(poll_new_orders(app))
    asyncio.create_task(poll_new_vip_orders(app))


async def shutdown(app) -> None:
    global _poll_task
    if _poll_task and not _poll_task.done():
        _poll_task.cancel()
        try:
            await _poll_task
        except asyncio.CancelledError:
            pass
    logger.info("Bot stopped")


# ──────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────
def main():
    builder = ApplicationBuilder().token(BOT_TOKEN)
    builder.post_init(post_init)
    builder.post_shutdown(shutdown)
    application = builder.build()

    application.add_handler(CommandHandler("start", cmd_start))
    application.add_handler(CommandHandler("menu", cmd_menu))
    application.add_handler(CommandHandler("orders", cmd_orders))
    application.add_handler(CommandHandler("status", cmd_status))
    application.add_handler(CommandHandler("help", cmd_help))
    application.add_handler(CallbackQueryHandler(on_callback))

    logger.info("Starting bot polling…")
    application.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
