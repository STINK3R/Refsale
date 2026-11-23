"""The owner's register of what admins did (ref_admin_audit).

Every request that changes something through the admin API is written down:
who (from the signed admin token), what (a readable label), on which record,
the request body with passwords masked and — for edits and deletions — the
record as it was before, read just before the handler runs. So when a review,
a chat message or a product disappears, the register shows who removed it,
when, from which address, and what exactly it said.

The hook is app-level (app/__init__.py): new admin endpoints are covered
without touching their handlers. Requests from an admin to the shared chat
endpoints (/api/support/…, /api/orders/…) are covered as well.
"""
import json
import re

from flask import g, request

from .db import get_db, _row_to_dict

_MUTATING = {"POST", "PUT", "PATCH", "DELETE"}
_SECRET_KEYS = re.compile(r"pass|token|secret|pem|key", re.I)
_MAX_TEXT = 20000

# (method, path regex, action, label, entity, snapshot table or None)
# The first match wins; the id in the path is the record's id.
_RULES = [
    ("DELETE", r"^/api/admin/reviews/(\d+)$", "review.delete", "Удаление отзыва", "review", "coop_reviews"),
    ("PATCH", r"^/api/admin/reviews/(\d+)$", "review.update", "Отзыв перенесён в другой раздел", "review", "coop_reviews"),
    ("POST", r"^/api/admin/products$", "product.create", "Создание товара", "product", None),
    ("PATCH", r"^/api/admin/products/(\d+)$", "product.update", "Изменение товара", "product", "coop_products"),
    ("DELETE", r"^/api/admin/products/(\d+)$", "product.delete", "Удаление товара", "product", "coop_products"),
    ("PATCH", r"^/api/admin/store/products/(\d+)$", "product.price", "Изменение цен товара", "product", "coop_products"),
    ("PUT", r"^/api/admin/store/products/(\d+)/variants$", "product.variants", "Изменение вариантов товара", "product", "coop_products"),
    ("POST", r"^/api/admin/products/(\d+)/images$", "product.image_add", "Добавление фото товара", "product", None),
    ("POST", r"^/api/admin/product-images/(\d+)/set-main$", "product.image_main", "Смена обложки товара", "product_image", "coop_product_images"),
    ("DELETE", r"^/api/admin/product-images/(\d+)$", "product.image_delete", "Удаление фото товара", "product_image", "coop_product_images"),
    ("POST", r"^/api/admin/store/supplier-products/(\d+)/moderate$", "product.moderate", "Модерация товара поставщика", "product", "coop_products"),
    ("POST", r"^/api/admin/categories$", "category.create", "Создание категории", "category", None),
    ("PATCH", r"^/api/admin/categories/(\d+)$", "category.update", "Изменение категории", "category", "coop_categories"),
    ("DELETE", r"^/api/admin/categories/(\d+)$", "category.delete", "Удаление категории", "category", "coop_categories"),
    ("POST", r"^/api/admin/subcategories$", "subcategory.create", "Создание подкатегории", "subcategory", None),
    ("PATCH", r"^/api/admin/subcategories/(\d+)$", "subcategory.update", "Изменение подкатегории", "subcategory", "coop_subcategories"),
    ("DELETE", r"^/api/admin/subcategories/(\d+)$", "subcategory.delete", "Удаление подкатегории", "subcategory", "coop_subcategories"),
    ("DELETE", r"^/api/admin/users/(\d+)$", "user.delete", "Удаление аккаунта покупателя", "user", "coop_users"),
    ("PATCH", r"^/api/admin/users/(\d+)/block$", "user.block", "Блокировка покупателя", "user", "coop_users"),
    ("PATCH", r"^/api/admin/users/(\d+)/unblock$", "user.unblock", "Разблокировка покупателя", "user", "coop_users"),
    ("PATCH", r"^/api/admin/store/users/(\d+)/leader$", "user.leader", "Изменение статуса лидера мнений", "user", "coop_users"),
    ("POST", r"^/api/admin/admins$", "admin.create", "Добавление администратора", "admin", None),
    ("DELETE", r"^/api/admin/admins/(\d+)$", "admin.delete", "Удаление администратора", "admin", "coop_admins"),
    ("DELETE", r"^/api/admin/forums/posts/(\d+)$", "forum.post_delete", "Удаление сообщения форума", "forum_post", "coop_forum_posts"),
    ("DELETE", r"^/api/admin/forums/(\d+)$", "forum.delete", "Удаление форума", "forum", "coop_forums"),
    ("DELETE", r"^/api/admin/support/messages/(\d+)$", "support.message_delete", "Удаление сообщения в обращении", "support_message", "coop_support_messages"),
    ("PATCH", r"^/api/admin/support/tickets/(\d+)/status$", "support.status", "Смена статуса обращения", "support_ticket", "coop_support_tickets"),
    ("DELETE", r"^/api/admin/order-messages/(\d+)$", "order_chat.message_delete", "Удаление сообщения в чате заказа", "order_message", "coop_order_messages"),
    ("POST", r"^/api/admin/orders/(\d+)/messages$", "order_chat.reply", "Ответ в чате заказа", "order", None),
    ("POST", r"^/api/admin/store/orders/(\d+)/confirm$", "order.confirm", "Подтверждение заказа", "order", "coop_orders"),
    ("POST", r"^/api/admin/store/orders/(\d+)/status$", "order.status", "Смена статуса заказа", "order", "coop_orders"),
    ("POST", r"^/api/admin/store/promos$", "promo.create", "Создание промокода", "promo", None),
    ("PATCH", r"^/api/admin/store/promos/(\d+)$", "promo.update", "Изменение промокода", "promo", "ref_promos"),
    ("DELETE", r"^/api/admin/store/promos/(\d+)$", "promo.delete", "Удаление промокода", "promo", "ref_promos"),
    ("PATCH", r"^/api/admin/store/first-purchase-promo$", "settings.first_purchase", "Настройка подарка за первую покупку", "settings", None),
    ("PATCH", r"^/api/admin/settings$", "settings.update", "Изменение настроек сайта", "settings", None),
    ("POST", r"^/api/admin/upload$", "file.upload", "Загрузка файла", "file", None),
    ("POST", r"^/api/admin/news$", "news.create", "Публикация новости", "news", None),
    ("PATCH", r"^/api/admin/news/(\d+)$", "news.update", "Изменение новости", "news", "ref_news_posts"),
    ("DELETE", r"^/api/admin/news/(\d+)$", "news.delete", "Удаление новости", "news", "ref_news_posts"),
    ("DELETE", r"^/api/admin/news/comments/(\d+)$", "news.comment_delete", "Удаление комментария к новости", "news_comment", "ref_news_comments"),
    ("POST", r"^/api/admin/compare-shops$", "compare_shop.create", "Добавление магазина сравнения", "compare_shop", None),
    ("PATCH", r"^/api/admin/compare-shops/(\d+)$", "compare_shop.update", "Изменение магазина сравнения", "compare_shop", "ref_compare_shops"),
    ("DELETE", r"^/api/admin/compare-shops/(\d+)$", "compare_shop.delete", "Удаление магазина сравнения", "compare_shop", "ref_compare_shops"),
    ("POST", r"^/api/admin/vote/import$", "vote.import", "Загрузка прайса для голосования", "vote", None),
    ("PATCH", r"^/api/admin/vote/settings$", "vote.settings", "Настройки голосования", "vote", None),
    ("PATCH", r"^/api/admin/vote/categories/(\d+)$", "vote.category", "Наценка категории голосования", "vote_category", "ref_vote_categories"),
    ("DELETE", r"^/api/admin/vote/categories/(\d+)$", "vote.category_delete", "Удаление категории голосования", "vote_category", "ref_vote_categories"),
    ("PATCH", r"^/api/admin/vote/items/(\d+)$", "vote.item", "Изменение товара голосования", "vote_item", "ref_vote_items"),
    ("DELETE", r"^/api/admin/vote/items/(\d+)$", "vote.item_delete", "Удаление товара голосования", "vote_item", "ref_vote_items"),
    ("POST", r"^/api/admin/vote/reset$", "vote.reset", "Сброс голосов", "vote", None),
    ("POST", r"^/api/admin/vote/clear$", "vote.clear", "Очистка списка голосования", "vote", None),
    ("POST", r"^/api/admin/seo/indexnow$", "seo.indexnow", "Отправка страниц в IndexNow", "seo", None),
    # Shared chat endpoints, when the caller is an admin
    ("POST", r"^/api/support/tickets/(\d+)/messages$", "support.reply", "Ответ в обращении", "support_ticket", None),
    ("POST", r"^/api/orders/(\d+)/messages$", "order_chat.reply", "Ответ в чате заказа", "order", None),
]
_COMPILED = [(m, re.compile(p), a, l, e, t) for m, p, a, l, e, t in _RULES]

# Tables a snapshot may be read from (the names above, nothing from a request)
_SNAPSHOT_TABLES = {t for *_, t in _RULES if t}
# Never copied into the register
_HIDDEN_COLUMNS = {"password", "vapid_private_pem"}


def _client_ip() -> str:
    fwd = request.headers.get("X-Forwarded-For", "")
    return (fwd.split(",")[0].strip() if fwd else (request.remote_addr or ""))[:64]


def _mask(value):
    if isinstance(value, dict):
        return {k: ("***" if _SECRET_KEYS.search(str(k)) else _mask(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [_mask(v) for v in value[:200]]
    if isinstance(value, str) and len(value) > 2000:
        return value[:2000] + "…"
    return value


def _request_details() -> dict:
    details: dict = {}
    body = request.get_json(silent=True)
    if body is not None:
        details["body"] = _mask(body)
    if request.form:
        details["form"] = _mask({k: v for k, v in request.form.items()})
    if request.files:
        details["files"] = [f.filename for f in request.files.values() if f and f.filename][:20]
    if request.args:
        details["query"] = _mask(dict(request.args))
    return details


def _match():
    for method, rx, action, label, entity, table in _COMPILED:
        if request.method != method:
            continue
        m = rx.match(request.path)
        if m:
            return action, label, entity, (m.group(1) if m.groups() else ""), table
    return None


def _snapshot(table: str, record_id: str):
    if table not in _SNAPSHOT_TABLES or not record_id.isdigit():
        return None
    try:
        with get_db() as cur:
            cur.execute(f"SELECT * FROM {table} WHERE id = %s", (int(record_id),))
            row = _row_to_dict(cur.fetchone())
            if row and table == "coop_products":
                cur.execute("SELECT url, is_main FROM coop_product_images WHERE product_id = %s ORDER BY sort_order, id", (int(record_id),))
                row["gallery"] = [dict(r) for r in cur.fetchall()]
            if row and table in ("coop_reviews", "coop_forum_posts", "coop_support_messages", "coop_order_messages"):
                # Whose words they were, so a deleted message has an author
                uid = row.get("user_id") or row.get("sender_user_id")
                if uid:
                    cur.execute("SELECT full_name, email FROM coop_users WHERE id = %s", (uid,))
                    u = cur.fetchone()
                    if u:
                        row["_author"] = {"id": uid, "full_name": u.get("full_name"), "email": u.get("email")}
        if not row:
            return None
        for col in _HIDDEN_COLUMNS:
            row.pop(col, None)
        return row
    except Exception as e:
        print(f"[audit] snapshot {table}#{record_id} failed: {e}")
        return None


def before_request():
    """Remember what this admin request is about to change."""
    if request.method not in _MUTATING or request.path == "/api/admin/login":
        return
    path = request.path
    if not path.startswith("/api/"):
        return
    if not path.startswith("/api/admin"):
        # Shared endpoints: only an admin's own request is written down
        from .auth import is_admin_request
        if not _match() or not is_admin_request():
            return
    payload = getattr(g, "admin_payload", None)
    if not payload:
        return
    found = _match()
    if found:
        action, label, entity, record_id, table = found
    else:
        action, label, entity, record_id, table = (
            f"{request.method.lower()}", f"{request.method} {path}", "", "", None)
    g.audit = {
        "action": action, "label": label, "entity": entity, "entity_id": record_id,
        "details": _request_details(),
        "snapshot": _snapshot(table, record_id) if table and request.method in ("PATCH", "PUT", "DELETE", "POST") and record_id else None,
    }


def after_request(response):
    pending = getattr(g, "audit", None)
    if not pending:
        return response
    g.audit = None
    payload = getattr(g, "admin_payload", None) or {}
    details = pending["details"]
    # The id of a record a POST created, when the handler returns it
    entity_id = pending["entity_id"]
    if not entity_id and response.is_json and response.status_code < 300:
        try:
            data = response.get_json(silent=True)
            if isinstance(data, dict):
                if data.get("id") is not None:
                    entity_id = str(data.get("id"))
                elif isinstance(data.get("post"), dict) and data["post"].get("id") is not None:
                    entity_id = str(data["post"]["id"])
                if data.get("url") and pending["action"] == "file.upload":
                    details["result_url"] = data.get("url")
                if pending["action"] == "vote.import":
                    details["result"] = {k: data.get(k) for k in ("categories", "items", "skipped") if k in data}
        except Exception:
            pass
    if response.status_code >= 400:
        try:
            data = response.get_json(silent=True)
            if isinstance(data, dict) and data.get("error"):
                details["error"] = str(data["error"])[:500]
        except Exception:
            pass
    record(
        admin_id=int(payload.get("id") or 0), admin_username=str(payload.get("u") or ""),
        action=pending["action"], label=pending["label"], entity=pending["entity"],
        entity_id=entity_id, status=response.status_code, details=details, snapshot=pending["snapshot"],
    )
    return response


def record(*, admin_id: int, admin_username: str, action: str, label: str, entity: str = "",
           entity_id: str = "", status: int = 200, details=None, snapshot=None, admin_name: str = ""):
    """Write one line of the register. Never breaks the request it describes."""
    try:
        details_s = json.dumps(details or {}, ensure_ascii=False, default=str)[:_MAX_TEXT]
        snap_s = json.dumps(snapshot, ensure_ascii=False, default=str)[:_MAX_TEXT] if snapshot is not None else None
        with get_db() as cur:
            if not admin_name:
                if admin_id:
                    cur.execute("SELECT display_name FROM coop_admins WHERE id = %s", (admin_id,))
                    row = cur.fetchone()
                    admin_name = (row or {}).get("display_name") or admin_username
                else:
                    admin_name = "Владелец" if admin_username == "admin" else admin_username
            cur.execute(
                """INSERT INTO ref_admin_audit (admin_id, admin_username, admin_name, action, action_label,
                       entity, entity_id, method, path, status_code, details, snapshot, ip, user_agent)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                (admin_id, admin_username[:100], (admin_name or "")[:255], action[:60], label[:255],
                 entity[:60], str(entity_id or "")[:60], request.method, request.path[:1000], status,
                 details_s, snap_s, _client_ip(), (request.headers.get("User-Agent") or "")[:500]),
            )
    except Exception as e:
        print(f"[audit] write failed: {e}")


def is_owner() -> bool:
    """The owner signs in with the master password (id 0, login admin)."""
    payload = getattr(g, "admin_payload", None) or {}
    return int(payload.get("id") or 0) == 0 and str(payload.get("u") or "") == "admin"
