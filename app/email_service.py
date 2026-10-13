"""
Email sending and HTML templates.
"""

import os
import json
import socket
import smtplib
import threading
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from .config import SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_ENABLED, ADMIN_NOTIFY_EMAIL, SITE_DOMAIN

# Ошибка "Network is unreachable" в Docker часто связана с попыткой Python использовать IPv6.
# Принудительно заставляем socket возвращать только IPv4 адреса:
_orig_getaddrinfo = socket.getaddrinfo
def _ipv4_getaddrinfo(*args, **kwargs):
    res = _orig_getaddrinfo(*args, **kwargs)
    return [r for r in res if r[0] == socket.AF_INET]
socket.getaddrinfo = _ipv4_getaddrinfo

def _send_email_sync(to: str, subject: str, html_body: str):
    if not SMTP_ENABLED or not to:
        print(f"📧 Email skipped: SMTP_ENABLED={SMTP_ENABLED}, to={to or 'empty'}, SMTP_HOST={SMTP_HOST}, SMTP_USER={SMTP_USER}")
        return
    print(f"📧 Sending email to {to}: {subject} (SMTP: {SMTP_HOST}:{SMTP_PORT}, from: {SMTP_FROM})")
    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = SMTP_FROM
        msg["To"] = to
        msg["Subject"] = subject
        msg.attach(MIMEText(html_body, "html", "utf-8"))
        port = SMTP_PORT
        # Port 465 = implicit SSL, others = STARTTLS
        if port == 465:
            with smtplib.SMTP_SSL(SMTP_HOST, port, timeout=15) as s:
                s.login(SMTP_USER, SMTP_PASS)
                s.send_message(msg)
        else:
            with smtplib.SMTP(SMTP_HOST, port, timeout=15) as s:
                s.ehlo()
                s.starttls()
                s.ehlo()
                s.login(SMTP_USER, SMTP_PASS)
                s.send_message(msg)
        print(f"✅ Email sent to {to}")
    except Exception as e:
        print(f"❌ Email send error to {to}: {e} (SMTP: {SMTP_HOST}:{SMTP_PORT}, user: {SMTP_USER})")
        import traceback
        traceback.print_exc()


def send_email(to: str, subject: str, html_body: str):
    threading.Thread(target=_send_email_sync, args=(to, subject, html_body), daemon=True).start()


def _email_wrapper(content: str) -> str:
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:'Segoe UI',Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:32px 16px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
  <tr><td style="background:linear-gradient(135deg,#C9A24A 0%,#9F7A3B 100%);padding:28px 32px;border-radius:16px 16px 0 0;text-align:center">
    <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.3px">RefSale</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:4px;text-transform:uppercase;letter-spacing:1.5px">Оригинальная парфюмерия и уход</div>
  </td></tr>
  <tr><td style="background:#ffffff;padding:32px;border-left:1px solid #e8e8e8;border-right:1px solid #e8e8e8">
    {content}
  </td></tr>
  <tr><td style="background:#fafafa;padding:20px 32px;border-radius:0 0 16px 16px;border:1px solid #e8e8e8;border-top:none;text-align:center">
    <p style="margin:0;color:#999;font-size:12px;line-height:1.5">С уважением, команда <b style="color:#C9A24A">RefSale</b></p>
    <p style="margin:6px 0 0;color:#bbb;font-size:11px">Это автоматическое письмо, пожалуйста, не отвечайте на него</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>"""


def email_welcome(name: str, email: str):
    content = f"""
    <div style="text-align:center;margin-bottom:24px">
      <table width="64" height="64" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 12px auto">
        <tr><td align="center" valign="middle" width="64" height="64" style="width:64px;height:64px;background:#F7F0E1;border-radius:50%;text-align:center;vertical-align:middle;font-size:28px;line-height:64px">
          &#128075;
        </td></tr>
      </table>
      <h2 style="margin:0;color:#8A6A2F;font-size:22px;font-weight:700">Добро пожаловать, {name}!</h2>
    </div>
    <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 16px">Вы успешно зарегистрировались в закрытом потребительском кооперативе <b style="color:#C9A24A">RefSale</b>.</p>
    <div style="background:#FFF8E1;border:1px solid #FFE082;border-radius:12px;padding:16px 20px;margin:20px 0">
      <p style="margin:0;font-size:14px;color:#F57F17;font-weight:600">&#9203; Заявка на рассмотрении</p>
      <p style="margin:6px 0 0;font-size:13px;color:#795548;line-height:1.5">Администратор рассмотрит вашу заявку. После одобрения вы получите уведомление и сможете оформлять заказы.</p>
    </div>
    <p style="color:#888;font-size:13px;line-height:1.5;margin:20px 0 0">Следите за обновлениями — мы скоро вернёмся к вам!</p>"""
    send_email(email, "Добро пожаловать в RefSale!", _email_wrapper(content))


def email_order_confirmation(name: str, email: str, order_id: int, total: float, items_str: str):
    try:
        items = json.loads(items_str) if isinstance(items_str, str) else items_str
        rows = "".join(
            f"<tr><td style='padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333'>{it.get('name','')}</td>"
            f"<td style='padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:14px;color:#666'>{it.get('qty',1)}</td>"
            f"<td style='padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:14px;font-weight:600;color:#333'>{int(float(it.get('price',0)) * it.get('qty',1)):,} ₽</td></tr>"
            for it in items
        )
    except:
        rows = ""
    content = f"""
    <div style="text-align:center;margin-bottom:24px">
      <table width="64" height="64" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 12px auto">
        <tr><td align="center" valign="middle" width="64" height="64" style="width:64px;height:64px;background:#F7F0E1;border-radius:50%;text-align:center;vertical-align:middle;font-size:28px;line-height:64px">
          &#9989;
        </td></tr>
      </table>
      <h2 style="margin:0;color:#8A6A2F;font-size:22px;font-weight:700">Заказ #{order_id} принят!</h2>
      <p style="margin:6px 0 0;color:#888;font-size:14px">Здравствуйте, {name}!</p>
    </div>
    <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 20px">Ваш заказ успешно оформлен и будет обработан в ближайшее время.</p>
    <div style="background:#fafafa;border-radius:12px;overflow:hidden;border:1px solid #eee">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <thead><tr style="background:linear-gradient(135deg,#C9A24A 0%,#9F7A3B 100%)">
          <th style="padding:12px;text-align:left;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Товар</th>
          <th style="padding:12px;text-align:center;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Кол-во</th>
          <th style="padding:12px;text-align:right;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Сумма</th>
        </tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
    <div style="background:linear-gradient(135deg,#C9A24A,#9F7A3B);border-radius:12px;padding:16px 20px;margin:20px 0;text-align:center">
      <span style="color:rgba(255,255,255,0.8);font-size:13px">Итого к оплате</span>
      <div style="color:#fff;font-size:26px;font-weight:800;margin-top:4px">{int(total):,} ₽</div>
    </div>
    <p style="color:#888;font-size:13px;line-height:1.5;margin:0">Уведомление об изменении статуса заказа придёт на вашу электронную почту.</p>"""
    send_email(email, f"Заказ #{order_id} принят — RefSale", _email_wrapper(content))


def email_order_status_change(name: str, email: str, order_id: int, total: float, new_status: str, payment_info: dict = None):
    """Send email when order status changes to processing/done/cancelled."""
    status_map = {
        "processing": ("В обработке", "#d4ac0d", "&#9881;", "#FEF9E7",
                        "Ваш заказ принят в обработку. Мы готовим вашу посылку."),
        "ready": ("Готов к выдаче", "#0d9488", "&#128236;", "#f0fdfa",
                  "Ваш заказ собран и готов к выдаче! Ниже вы найдёте реквизиты для оплаты."),
        "done": ("Выполнен", "#27ae60", "&#9989;", "#EAFAF1",
                 "Ваш заказ выполнен. Спасибо за покупку!"),
        "cancelled": ("Отменён", "#e74c3c", "&#10060;", "#FDEDEC",
                       "К сожалению, ваш заказ был отменён. Свяжитесь с администрацией, если это ошибка."),
    }
    info = status_map.get(new_status)
    if not info:
        return
    label, color, icon, bg_color, desc = info
    content = f"""
    <div style="text-align:center;margin-bottom:24px">
      <table width="64" height="64" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 12px auto">
        <tr><td align="center" valign="middle" width="64" height="64" style="width:64px;height:64px;background:{bg_color};border-radius:50%;text-align:center;vertical-align:middle;font-size:28px;line-height:64px">
          {icon}
        </td></tr>
      </table>
      <h2 style="margin:0;color:{color};font-size:22px;font-weight:700">Заказ #{order_id} — {label}</h2>
      <p style="margin:6px 0 0;color:#888;font-size:14px">Здравствуйте, {name}!</p>
    </div>
    <div style="background:{bg_color};border:1px solid {color}40;border-radius:12px;padding:16px 20px;margin:20px 0">
      <p style="margin:0;font-size:14px;color:{color};font-weight:600">Статус: {label}</p>
      <p style="margin:6px 0 0;font-size:13px;color:#444;line-height:1.5">{desc}</p>
    </div>
    <div style="background:linear-gradient(135deg,#C9A24A,#9F7A3B);border-radius:12px;padding:14px 20px;margin:16px 0;text-align:center">
      <span style="color:rgba(255,255,255,0.8);font-size:12px">Сумма заказа</span>
      <div style="color:#fff;font-size:22px;font-weight:800;margin-top:2px">{int(total):,} ₽</div>
    </div>"""
    # Add payment details block for "ready" status (requisites sent at ready, not done)
    if new_status == "ready" and payment_info:
        rows = ""
        if payment_info.get("bank_name"):
            rows += f'<tr><td style="padding:4px 0;color:#888;font-size:13px;width:140px">Банк:</td><td style="padding:4px 0;font-size:13px;font-weight:600;color:#333">{payment_info["bank_name"]}</td></tr>'
        if payment_info.get("recipient_name"):
            rows += f'<tr><td style="padding:4px 0;color:#888;font-size:13px">Получатель:</td><td style="padding:4px 0;font-size:13px;font-weight:600;color:#333">{payment_info["recipient_name"]}</td></tr>'
        if payment_info.get("card_number"):
            rows += f'<tr><td style="padding:4px 0;color:#888;font-size:13px">Номер карты:</td><td style="padding:4px 0;font-size:15px;font-weight:700;color:#8A6A2F;font-family:monospace;letter-spacing:1px">{payment_info["card_number"]}</td></tr>'
        if payment_info.get("phone_number"):
            rows += f'<tr><td style="padding:4px 0;color:#888;font-size:13px">Телефон:</td><td style="padding:4px 0;font-size:13px;font-weight:600;color:#333">{payment_info["phone_number"]}</td></tr>'
        if payment_info.get("account_number"):
            rows += f'<tr><td style="padding:4px 0;color:#888;font-size:13px">Счёт:</td><td style="padding:4px 0;font-size:13px;font-weight:600;color:#333">{payment_info["account_number"]}</td></tr>'
        if payment_info.get("bik"):
            rows += f'<tr><td style="padding:4px 0;color:#888;font-size:13px">БИК:</td><td style="padding:4px 0;font-size:13px;font-weight:600;color:#333">{payment_info["bik"]}</td></tr>'
        if payment_info.get("inn"):
            rows += f'<tr><td style="padding:4px 0;color:#888;font-size:13px">ИНН:</td><td style="padding:4px 0;font-size:13px;font-weight:600;color:#333">{payment_info["inn"]}</td></tr>'
        if payment_info.get("extra_info"):
            rows += f'<tr><td colspan="2" style="padding:8px 0 0;font-size:12px;color:#666;line-height:1.5">{payment_info["extra_info"]}</td></tr>'
        if rows:
            content += f"""
    <div style="background:#FBF6EA;border:1.5px solid #E6D3A3;border-radius:12px;padding:18px 20px;margin:16px 0">
      <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#8A6A2F">💳 Реквизиты для оплаты</p>
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%">{rows}</table>
    </div>"""
    send_email(email, f"Заказ #{order_id} — {label} | RefSale", _email_wrapper(content))


def email_order_new_message(name: str, email: str, order_id: int):
    """Notify the buyer that the administration replied in the order chat."""
    website_url = SITE_DOMAIN
    content = f"""
    <div style="text-align:center;margin-bottom:24px">
      <table width="64" height="64" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 12px auto">
        <tr><td align="center" valign="middle" width="64" height="64" style="width:64px;height:64px;background:#FBF6EA;border-radius:50%;text-align:center;vertical-align:middle;font-size:28px;line-height:64px">
          &#128172;
        </td></tr>
      </table>
      <h2 style="margin:0;color:#8A6A2F;font-size:22px;font-weight:700">Новое сообщение по заказу #{order_id}</h2>
      <p style="margin:6px 0 0;color:#888;font-size:14px">Здравствуйте, {name}!</p>
    </div>
    <div style="background:#FBF6EA;border:1px solid #E6D3A3;border-radius:12px;padding:16px 20px;margin:20px 0">
      <p style="margin:0;font-size:13px;color:#444;line-height:1.5">Администрация ответила вам в чате по заказу. Откройте заказ на сайте, чтобы прочитать и ответить.</p>
    </div>
    <div style="text-align:center;margin:20px 0">
      <a href="{website_url}/orders" style="display:inline-block;background:linear-gradient(135deg,#C9A24A,#9F7A3B);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 28px;border-radius:10px">Открыть чат по заказу</a>
    </div>"""
    send_email(email, f"Новое сообщение по заказу #{order_id} | RefSale", _email_wrapper(content))


def email_forgot_password(name: str, email: str, reset_url: str):
    content = f"""
    <div style="text-align:center;margin-bottom:24px">
      <table width="64" height="64" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 12px auto">
        <tr><td align="center" valign="middle" width="64" height="64" style="width:64px;height:64px;background:#FFF3E0;border-radius:50%;text-align:center;vertical-align:middle;font-size:28px;line-height:64px">
          &#128273;
        </td></tr>
      </table>
      <h2 style="margin:0;color:#8A6A2F;font-size:22px;font-weight:700">Восстановление пароля</h2>
      <p style="margin:6px 0 0;color:#888;font-size:14px">Здравствуйте, {name}!</p>
    </div>
    <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 16px">Был запрошен сброс пароля для вашего аккаунта. Нажмите кнопку ниже, чтобы задать новый пароль:</p>
    <div style="text-align:center;margin:24px 0">
      <a href="{reset_url}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#C9A24A,#9F7A3B);color:#fff;text-decoration:none;border-radius:10px;font-size:16px;font-weight:700;letter-spacing:0.3px">Сбросить пароль</a>
    </div>
    <p style="color:#888;font-size:13px;line-height:1.5;margin:0 0 16px">Или скопируйте ссылку:<br><a href="{reset_url}" style="color:#C9A24A;word-break:break-all">{reset_url}</a></p>
    <p style="color:#888;font-size:13px;line-height:1.5;margin:0 0 16px">Ссылка действительна в течение 1 часа.</p>
    <div style="background:#FFEBEE;border:1px solid #EF9A9A;border-radius:10px;padding:12px 16px;margin:16px 0">
      <p style="margin:0;font-size:13px;color:#C62828">⚠️ Если вы не запрашивали сброс пароля — проигнорируйте это письмо. Ваш аккаунт в безопасности.</p>
    </div>"""
    send_email(email, "Восстановление пароля — RefSale", _email_wrapper(content))


def email_admin_new_order(order_id: int, full_name: str, phone: str, total: float, items_str: str):
    """Send email notification to admin about a new order."""
    if not ADMIN_NOTIFY_EMAIL:
        return
    try:
        items = json.loads(items_str) if isinstance(items_str, str) else items_str
        rows = "".join(
            f"<tr><td style='padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#333'>{it.get('name','')}</td>"
            f"<td style='padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:13px;color:#666'>{it.get('qty',1)}</td>"
            f"<td style='padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;font-weight:600;color:#333'>{int(float(it.get('price',0)) * it.get('qty',1)):,} ₽</td></tr>"
            for it in items
        )
    except:
        rows = ""
    website_url = SITE_DOMAIN
    content = f"""
    <div style="text-align:center;margin-bottom:24px">
      <table width="64" height="64" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 12px auto">
        <tr><td align="center" valign="middle" width="64" height="64" style="width:64px;height:64px;background:#E3F2FD;border-radius:50%;text-align:center;vertical-align:middle;font-size:28px;line-height:64px">
          &#128230;
        </td></tr>
      </table>
      <h2 style="margin:0;color:#1565C0;font-size:22px;font-weight:700">Новый заказ #{order_id}</h2>
    </div>
    <div style="background:#f8f9fa;border-radius:12px;padding:16px 20px;margin:0 0 16px">
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#444">
        <tr><td style="padding:4px 0;font-weight:600;width:100px">Клиент:</td><td>{full_name}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600">Телефон:</td><td>{phone}</td></tr>
      </table>
    </div>
    <div style="background:#fafafa;border-radius:12px;overflow:hidden;border:1px solid #eee">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <thead><tr style="background:#E3F2FD">
          <th style="padding:10px;text-align:left;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Товар</th>
          <th style="padding:10px;text-align:center;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Кол-во</th>
          <th style="padding:10px;text-align:right;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Сумма</th>
        </tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
    <div style="background:linear-gradient(135deg,#1565C0,#1976D2);border-radius:12px;padding:16px 20px;margin:16px 0;text-align:center">
      <span style="color:rgba(255,255,255,0.8);font-size:13px">Сумма заказа</span>
      <div style="color:#fff;font-size:26px;font-weight:800;margin-top:4px">{int(total):,} ₽</div>
    </div>
    <p style="color:#888;font-size:12px;line-height:1.5;margin:0;text-align:center">Откройте <a href="{website_url}/admin.html" style="color:#1565C0;font-weight:600">админ-панель</a> для обработки заказа</p>"""
    send_email(ADMIN_NOTIFY_EMAIL, f"Новый заказ #{order_id} — {int(total):,} ₽ | RefSale", _email_wrapper(content))


def email_seller_new_order(seller_name: str, seller_email: str, order_id: int,
                            customer_name: str, customer_phone: str,
                            items_str: str, total: float):
    """Send email notification to a seller about a new marketplace order for their products."""
    if not seller_email:
        return
    try:
        items = json.loads(items_str) if isinstance(items_str, str) else items_str
        rows = "".join(
            f"<tr><td style='padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#333'>{it.get('name','')}</td>"
            f"<td style='padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:13px;color:#666'>{it.get('qty',1)}</td>"
            f"<td style='padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:13px;font-weight:600;color:#333'>{int(float(it.get('price',0)) * it.get('qty',1)):,} ₽</td></tr>"
            for it in items
        )
    except Exception:
        rows = ""
    website_url = SITE_DOMAIN
    greeting = f"Здравствуйте, {seller_name}!" if seller_name else "Здравствуйте!"
    content = f"""
    <div style="text-align:center;margin-bottom:24px">
      <table width="64" height="64" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 12px auto">
        <tr><td align="center" valign="middle" width="64" height="64" style="width:64px;height:64px;background:#E3F2FD;border-radius:50%;text-align:center;vertical-align:middle;font-size:28px;line-height:64px">
          &#128722;
        </td></tr>
      </table>
      <h2 style="margin:0;color:#1565C0;font-size:22px;font-weight:700">Новый заказ #{order_id}</h2>
      <p style="margin:6px 0 0;color:#888;font-size:14px">{greeting}</p>
    </div>
    <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 16px">У вас новый заказ в маркетплейсе. Ниже — контакты покупателя и ваши позиции из этого заказа.</p>
    <div style="background:#f8f9fa;border-radius:12px;padding:16px 20px;margin:0 0 16px">
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#444">
        <tr><td style="padding:4px 0;font-weight:600;width:100px">Покупатель:</td><td>{customer_name}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600">Телефон:</td><td>{customer_phone}</td></tr>
      </table>
    </div>
    <div style="background:#fafafa;border-radius:12px;overflow:hidden;border:1px solid #eee">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <thead><tr style="background:#E3F2FD">
          <th style="padding:10px;text-align:left;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Товар</th>
          <th style="padding:10px;text-align:center;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Кол-во</th>
          <th style="padding:10px;text-align:right;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Сумма</th>
        </tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
    <div style="background:linear-gradient(135deg,#C9A24A,#9F7A3B);border-radius:12px;padding:16px 20px;margin:16px 0;text-align:center">
      <span style="color:rgba(255,255,255,0.8);font-size:13px">Ваша выручка с заказа</span>
      <div style="color:#fff;font-size:26px;font-weight:800;margin-top:4px">{int(total):,} ₽</div>
    </div>
    <p style="color:#888;font-size:12px;line-height:1.5;margin:0;text-align:center">Откройте <a href="{website_url}/seller" style="color:#1565C0;font-weight:600">кабинет продавца</a>, чтобы принять заказ в обработку.</p>"""
    send_email(seller_email, f"Новый заказ #{order_id} — {int(total):,} ₽ | RefSale", _email_wrapper(content))


def _vip_email_wrapper(content: str) -> str:
    """VIP-branded email wrapper with gold/amber color scheme."""
    return f"""<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#faf8f3;font-family:'Segoe UI',Roboto,Arial,sans-serif;-webkit-font-smoothing:antialiased">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f3;padding:32px 16px">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
  <tr><td style="background:linear-gradient(135deg,#B8860B 0%,#D4A017 50%,#F5C842 100%);padding:28px 32px;border-radius:16px 16px 0 0;text-align:center">
    <div style="font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.3px">&#128081; RefSale VIP</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:4px;text-transform:uppercase;letter-spacing:1.5px">Премиальный закрытый кооператив</div>
  </td></tr>
  <tr><td style="background:#ffffff;padding:32px;border-left:1px solid #e8e0c8;border-right:1px solid #e8e0c8">
    {content}
  </td></tr>
  <tr><td style="background:#fefcf5;padding:20px 32px;border-radius:0 0 16px 16px;border:1px solid #e8e0c8;border-top:none;text-align:center">
    <p style="margin:0;color:#999;font-size:12px;line-height:1.5">С уважением, команда <b style="color:#B8860B">RefSale VIP</b></p>
    <p style="margin:6px 0 0;color:#bbb;font-size:11px">Это автоматическое письмо, пожалуйста, не отвечайте на него</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>"""


def email_vip_order_confirmation(name: str, email: str, order_id: int, total: float, items_str: str):
    """Send VIP-branded order confirmation email."""
    try:
        items = json.loads(items_str) if isinstance(items_str, str) else items_str
        rows = "".join(
            f"<tr><td style='padding:10px 12px;border-bottom:1px solid #f0ead8;font-size:14px;color:#333'>{it.get('name','')}</td>"
            f"<td style='padding:10px 12px;border-bottom:1px solid #f0ead8;text-align:center;font-size:14px;color:#666'>{it.get('qty',1)}</td>"
            f"<td style='padding:10px 12px;border-bottom:1px solid #f0ead8;text-align:right;font-size:14px;font-weight:600;color:#333'>{int(float(it.get('price',0)) * it.get('qty',1)):,} ₽</td></tr>"
            for it in items
        )
    except:
        rows = ""
    content = f"""
    <div style="text-align:center;margin-bottom:24px">
      <table width="64" height="64" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 12px auto">
        <tr><td align="center" valign="middle" width="64" height="64" style="width:64px;height:64px;background:#FEF9E7;border-radius:50%;text-align:center;vertical-align:middle;font-size:28px;line-height:64px">
          &#128081;
        </td></tr>
      </table>
      <h2 style="margin:0;color:#B8860B;font-size:22px;font-weight:700">VIP Заказ #{order_id} принят!</h2>
      <p style="margin:6px 0 0;color:#888;font-size:14px">Здравствуйте, {name}!</p>
    </div>
    <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 20px">Ваш VIP заказ успешно оформлен и будет обработан в приоритетном порядке.</p>
    <div style="background:#fefcf5;border-radius:12px;overflow:hidden;border:1px solid #e8e0c8">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <thead><tr style="background:linear-gradient(135deg,#FEF9E7,#fefcf5)">
          <th style="padding:12px;text-align:left;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Товар</th>
          <th style="padding:12px;text-align:center;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Кол-во</th>
          <th style="padding:12px;text-align:right;font-size:12px;color:#666;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Сумма</th>
        </tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
    <div style="background:linear-gradient(135deg,#B8860B,#D4A017);border-radius:12px;padding:16px 20px;margin:20px 0;text-align:center">
      <span style="color:rgba(255,255,255,0.8);font-size:13px">Итого к оплате</span>
      <div style="color:#fff;font-size:26px;font-weight:800;margin-top:4px">{int(total):,} ₽</div>
    </div>
    <p style="color:#888;font-size:13px;line-height:1.5;margin:0">Уведомление об изменении статуса заказа придёт на вашу электронную почту.</p>"""
    send_email(email, f"VIP Заказ #{order_id} принят — RefSale", _vip_email_wrapper(content))


def email_admin_new_vip_order(order_id: int, full_name: str, phone: str, total: float, items_str: str):
    """Send VIP-branded email notification to admin about a new VIP order."""
    if not ADMIN_NOTIFY_EMAIL:
        return
    try:
        items = json.loads(items_str) if isinstance(items_str, str) else items_str
        rows = "".join(
            f"<tr><td style='padding:8px 12px;border-bottom:1px solid #f0ead8;font-size:13px;color:#333'>{it.get('name','')}</td>"
            f"<td style='padding:8px 12px;border-bottom:1px solid #f0ead8;text-align:center;font-size:13px;color:#666'>{it.get('qty',1)}</td>"
            f"<td style='padding:8px 12px;border-bottom:1px solid #f0ead8;text-align:right;font-size:13px;font-weight:600;color:#333'>{int(float(it.get('price',0)) * it.get('qty',1)):,} ₽</td></tr>"
            for it in items
        )
    except:
        rows = ""
    website_url = SITE_DOMAIN
    content = f"""
    <div style="text-align:center;margin-bottom:24px">
      <table width="64" height="64" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 12px auto">
        <tr><td align="center" valign="middle" width="64" height="64" style="width:64px;height:64px;background:#FEF9E7;border-radius:50%;text-align:center;vertical-align:middle;font-size:28px;line-height:64px">
          &#128081;
        </td></tr>
      </table>
      <h2 style="margin:0;color:#B8860B;font-size:22px;font-weight:700">VIP Заказ #{order_id}</h2>
      <p style="margin:6px 0 0;color:#888;font-size:13px">Новый VIP заказ требует внимания!</p>
    </div>
    <div style="background:#fefcf5;border-radius:12px;padding:16px 20px;margin:0 0 16px">
      <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#444">
        <tr><td style="padding:4px 0;font-weight:600;width:100px">Клиент:</td><td>{full_name}</td></tr>
        <tr><td style="padding:4px 0;font-weight:600">Телефон:</td><td>{phone}</td></tr>
      </table>
    </div>
    <div style="background:#fefcf5;border-radius:12px;overflow:hidden;border:1px solid #e8e0c8">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
        <thead><tr style="background:linear-gradient(135deg,#FEF9E7,#fefcf5)">
          <th style="padding:10px;text-align:left;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Товар</th>
          <th style="padding:10px;text-align:center;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Кол-во</th>
          <th style="padding:10px;text-align:right;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Сумма</th>
        </tr></thead>
        <tbody>{rows}</tbody>
      </table>
    </div>
    <div style="background:linear-gradient(135deg,#B8860B,#D4A017);border-radius:12px;padding:16px 20px;margin:16px 0;text-align:center">
      <span style="color:rgba(255,255,255,0.8);font-size:13px">Сумма VIP заказа</span>
      <div style="color:#fff;font-size:26px;font-weight:800;margin-top:4px">{int(total):,} ₽</div>
    </div>
    <p style="color:#888;font-size:12px;line-height:1.5;margin:0;text-align:center">Откройте <a href="{website_url}/admin.html" style="color:#B8860B;font-weight:600">админ-панель</a> для обработки VIP заказа</p>"""
    send_email(ADMIN_NOTIFY_EMAIL, f"👑 VIP Заказ #{order_id} — {int(total):,} ₽ | RefSale", _vip_email_wrapper(content))


def email_vip_order_status_change(name: str, email: str, order_id: int, total: float, new_status: str, payment_info: dict = None):
    """Send VIP-branded email when VIP order status changes."""
    status_map = {
        "processing": ("В обработке", "#d4ac0d", "&#9881;", "#FEF9E7",
                        "Ваш VIP заказ принят в обработку. Мы готовим вашу посылку в приоритетном порядке."),
        "ready": ("Готов к выдаче", "#0d9488", "&#128236;", "#f0fdfa",
                  "Ваш VIP заказ собран и готов к выдаче! Ниже вы найдёте реквизиты для оплаты."),
        "done": ("Выполнен", "#B8860B", "&#9989;", "#FEF9E7",
                 "Ваш VIP заказ выполнен. Спасибо за покупку!"),
        "cancelled": ("Отменён", "#e74c3c", "&#10060;", "#FDEDEC",
                       "К сожалению, ваш VIP заказ был отменён. Свяжитесь с администрацией."),
    }
    info = status_map.get(new_status)
    if not info:
        return
    label, color, icon, bg_color, desc = info
    content = f"""
    <div style="text-align:center;margin-bottom:24px">
      <table width="64" height="64" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 12px auto">
        <tr><td align="center" valign="middle" width="64" height="64" style="width:64px;height:64px;background:{bg_color};border-radius:50%;text-align:center;vertical-align:middle;font-size:28px;line-height:64px">
          {icon}
        </td></tr>
      </table>
      <h2 style="margin:0;color:{color};font-size:22px;font-weight:700">VIP Заказ #{order_id} — {label}</h2>
      <p style="margin:6px 0 0;color:#888;font-size:14px">Здравствуйте, {name}!</p>
    </div>
    <div style="background:{bg_color};border:1px solid {color}40;border-radius:12px;padding:16px 20px;margin:20px 0">
      <p style="margin:0;font-size:14px;color:{color};font-weight:600">&#128081; VIP Статус: {label}</p>
      <p style="margin:6px 0 0;font-size:13px;color:#444;line-height:1.5">{desc}</p>
    </div>
    <div style="background:linear-gradient(135deg,#B8860B,#D4A017);border-radius:12px;padding:14px 20px;margin:16px 0;text-align:center">
      <span style="color:rgba(255,255,255,0.8);font-size:12px">Сумма заказа</span>
      <div style="color:#fff;font-size:22px;font-weight:800;margin-top:2px">{int(total):,} ₽</div>
    </div>"""
    # Add payment details block for "ready" VIP status
    if new_status == "ready" and payment_info:
        rows = ""
        if payment_info.get("bank_name"):
            rows += f'<tr><td style="padding:4px 0;color:#888;font-size:13px;width:140px">Банк:</td><td style="padding:4px 0;font-size:13px;font-weight:600;color:#333">{payment_info["bank_name"]}</td></tr>'
        if payment_info.get("recipient_name"):
            rows += f'<tr><td style="padding:4px 0;color:#888;font-size:13px">Получатель:</td><td style="padding:4px 0;font-size:13px;font-weight:600;color:#333">{payment_info["recipient_name"]}</td></tr>'
        if payment_info.get("card_number"):
            rows += f'<tr><td style="padding:4px 0;color:#888;font-size:13px">Номер карты:</td><td style="padding:4px 0;font-size:15px;font-weight:700;color:#B8860B;font-family:monospace;letter-spacing:1px">{payment_info["card_number"]}</td></tr>'
        if payment_info.get("phone_number"):
            rows += f'<tr><td style="padding:4px 0;color:#888;font-size:13px">Телефон:</td><td style="padding:4px 0;font-size:13px;font-weight:600;color:#333">{payment_info["phone_number"]}</td></tr>'
        if payment_info.get("account_number"):
            rows += f'<tr><td style="padding:4px 0;color:#888;font-size:13px">Счёт:</td><td style="padding:4px 0;font-size:13px;font-weight:600;color:#333">{payment_info["account_number"]}</td></tr>'
        if payment_info.get("bik"):
            rows += f'<tr><td style="padding:4px 0;color:#888;font-size:13px">БИК:</td><td style="padding:4px 0;font-size:13px;font-weight:600;color:#333">{payment_info["bik"]}</td></tr>'
        if payment_info.get("inn"):
            rows += f'<tr><td style="padding:4px 0;color:#888;font-size:13px">ИНН:</td><td style="padding:4px 0;font-size:13px;font-weight:600;color:#333">{payment_info["inn"]}</td></tr>'
        if payment_info.get("extra_info"):
            rows += f'<tr><td colspan="2" style="padding:8px 0 0;font-size:12px;color:#666;line-height:1.5">{payment_info["extra_info"]}</td></tr>'
        if rows:
            content += f"""
    <div style="background:#fefcf5;border:1.5px solid #e8d5a0;border-radius:12px;padding:18px 20px;margin:16px 0">
      <p style="margin:0 0 10px;font-size:15px;font-weight:700;color:#B8860B">💳 Реквизиты для оплаты</p>
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%">{rows}</table>
    </div>"""
    send_email(email, f"VIP Заказ #{order_id} — {label} | RefSale", _vip_email_wrapper(content))


def email_user_approved(full_name: str, email: str):
    """Send approval notification email."""
    website_url = SITE_DOMAIN
    content = f"""
    <div style="text-align:center;margin-bottom:24px">
      <table width="64" height="64" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 12px auto">
        <tr><td align="center" valign="middle" width="64" height="64" style="width:64px;height:64px;background:#F7F0E1;border-radius:50%;text-align:center;vertical-align:middle;font-size:28px;line-height:64px">
          &#127881;
        </td></tr>
      </table>
      <h2 style="margin:0;color:#8A6A2F;font-size:22px;font-weight:700">Добро пожаловать в кооператив!</h2>
      <p style="margin:6px 0 0;color:#888;font-size:14px">Здравствуйте, {full_name}!</p>
    </div>
    <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 16px">Ваша заявка на вступление в кооператив <b style="color:#C9A24A">RefSale</b> одобрена.</p>
    <div style="background:#F7F0E1;border:1px solid #E6D3A3;border-radius:12px;padding:16px 20px;margin:20px 0">
      <p style="margin:0;font-size:14px;color:#C9A24A;font-weight:600">&#9989; Заявка одобрена</p>
      <p style="margin:6px 0 0;font-size:13px;color:#444;line-height:1.5">Теперь вы можете войти на сайт и оформлять заказы по выгодным ценам.</p>
    </div>
    <div style="text-align:center;margin:24px 0">
      <a href="{website_url}"
         style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#C9A24A,#9F7A3B);color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;box-shadow:0 4px 16px rgba(107,165,215,0.25)">
        Войти на сайт
      </a>
    </div>
    <p style="color:#888;font-size:13px;line-height:1.5;margin:20px 0 0">Добро пожаловать в сообщество! Мы рады видеть вас среди участников.</p>"""
    send_email(email, "Заявка одобрена — RefSale", _email_wrapper(content))


def email_verification_code(email: str, code: str):
    """Send email verification code."""
    content = f"""
    <div style="text-align:center;margin-bottom:24px">
      <table width="64" height="64" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 12px auto">
        <tr><td align="center" valign="middle" width="64" height="64" style="width:64px;height:64px;background:#F7F0E1;border-radius:50%;text-align:center;vertical-align:middle;font-size:28px;line-height:64px">
          &#128274;
        </td></tr>
      </table>
      <h2 style="margin:0;color:#C9A24A;font-size:22px;font-weight:700">Подтверждение email</h2>
      <p style="margin:6px 0 0;color:#888;font-size:14px">Код для подтверждения вашего адреса</p>
    </div>
    <div style="text-align:center;margin:24px 0">
      <div style="display:inline-block;background:linear-gradient(135deg,#C9A24A,#9F7A3B);color:#fff;font-size:32px;font-weight:800;letter-spacing:8px;padding:16px 32px;border-radius:12px">{code}</div>
    </div>
    <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 16px;text-align:center">Введите этот код на странице регистрации для подтверждения email.</p>
    <div style="background:#FFF8E1;border:1px solid #FFE082;border-radius:12px;padding:16px 20px;margin:20px 0">
      <p style="margin:0;font-size:13px;color:#F57F17;line-height:1.5">&#9888; Код действителен 10 минут. Если вы не запрашивали код, проигнорируйте это письмо.</p>
    </div>"""
    send_email(email, f"Код подтверждения: {code} — RefSale", _email_wrapper(content))


def email_referral_promo_earned(full_name: str, email: str, promo_code: str, discount_amount: float):
    """Send notification when user earns a referral promo code."""
    content = f"""
    <div style="text-align:center;margin-bottom:24px">
      <table width="64" height="64" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 12px auto">
        <tr><td align="center" valign="middle" width="64" height="64" style="width:64px;height:64px;background:#F7F0E1;border-radius:50%;text-align:center;vertical-align:middle;font-size:28px;line-height:64px">
          &#127873;
        </td></tr>
      </table>
      <h2 style="margin:0;color:#C9A24A;font-size:22px;font-weight:700">Вы получили промокод!</h2>
      <p style="margin:6px 0 0;color:#888;font-size:14px">Здравствуйте, {full_name}!</p>
    </div>
    <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 16px">Ваши приглашённые друзья сделали покупки, и вы заработали промокод на скидку!</p>
    <div style="text-align:center;margin:24px 0">
      <div style="display:inline-block;background:linear-gradient(135deg,#C9A24A,#9F7A3B);color:#fff;font-size:28px;font-weight:800;letter-spacing:6px;padding:16px 32px;border-radius:12px">{promo_code}</div>
      <p style="margin:12px 0 0;font-size:18px;font-weight:700;color:#C9A24A">Скидка {int(discount_amount)} ₽</p>
    </div>
    <div style="background:#F7F0E1;border:1px solid #E6D3A3;border-radius:12px;padding:16px 20px;margin:20px 0">
      <p style="margin:0;font-size:13px;color:#C9A24A;line-height:1.5">Введите промокод при оформлении заказа на сайте. Промокод также доступен в вашем профиле, во вкладке «Рефералы».</p>
    </div>"""
    send_email(email, f"Вы получили промокод {promo_code} — RefSale", _email_wrapper(content))


def email_user_blocked(full_name: str, email: str):
    """Send block notification email."""
    content = f"""
    <div style="text-align:center;margin-bottom:24px">
      <table width="64" height="64" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 12px auto">
        <tr><td align="center" valign="middle" width="64" height="64" style="width:64px;height:64px;background:#FFEBEE;border-radius:50%;text-align:center;vertical-align:middle;font-size:28px;line-height:64px">
          &#128683;
        </td></tr>
      </table>
      <h2 style="margin:0;color:#C62828;font-size:22px;font-weight:700">Аккаунт заблокирован</h2>
      <p style="margin:6px 0 0;color:#888;font-size:14px">Здравствуйте, {full_name}.</p>
    </div>
    <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 16px">Ваш аккаунт в кооперативе <b style="color:#C9A24A">RefSale</b> был заблокирован администратором.</p>
    <div style="background:#FFEBEE;border:1px solid #EF9A9A;border-radius:12px;padding:16px 20px;margin:20px 0">
      <p style="margin:0;font-size:13px;color:#C62828;line-height:1.5">Если вы считаете это ошибкой, свяжитесь с администрацией кооператива.</p>
    </div>"""
    send_email(email, "Аккаунт заблокирован — RefSale", _email_wrapper(content))


# ══════════════════════════════════════════════════
# STOREFRONT (RefSale)
# ══════════════════════════════════════════════════
STORE_STATUS_INFO = {
    "new": ("Ожидает подтверждения", "#8A6A2F", "&#9203;", "#FBF6EA",
            "Мы получили заказ. Менеджер напишет в чат на сайте: подтвердит наличие и пришлёт реквизиты для предоплаты."),
    "accepted": ("Принят", "#8A6A2F", "&#9989;", "#FBF6EA",
                 "Оплата получена, заказ подтверждён и принят в работу. Дальше вы будете получать письма о каждом шаге: "
                 "в обработке → в доставке → выдан."),
    "processing": ("В обработке", "#B7791F", "&#9881;", "#FEF9E7",
                   "Собираем и проверяем ваш заказ."),
    "shipping": ("В доставке", "#2B6CB0", "&#128666;", "#EBF4FF",
                 "Заказ передан в доставку и уже едет к вам."),
    "done": ("Выдан", "#27ae60", "&#127873;", "#EAFAF1",
             "Заказ выдан. Спасибо, что выбрали нас! Будем рады вашему отзыву на сайте."),
    "cancelled": ("Отменён", "#e74c3c", "&#10060;", "#FDEDEC",
                  "Заказ отменён. Если это ошибка — напишите нам в чат заказа."),
}


def _store_items_table(items_str) -> str:
    try:
        items = json.loads(items_str) if isinstance(items_str, str) else (items_str or [])
    except Exception:
        items = []
    rows = ""
    for it in items:
        qty = int(it.get("qty", 1) or 1)
        price = float(it.get("price", 0) or 0)
        base = float(it.get("base_price", price) or price)
        old = (f"<span style='color:#aaa;text-decoration:line-through;font-weight:400;margin-right:6px'>{int(base * qty):,} ₽</span>"
               if base > price else "")
        rows += (f"<tr><td style='padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333'>{it.get('name','')}</td>"
                 f"<td style='padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:14px;color:#666'>{qty}</td>"
                 f"<td style='padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:14px;font-weight:600;color:#333;white-space:nowrap'>{old}{int(price * qty):,} ₽</td></tr>")
    if not rows:
        return ""
    return f"""
    <div style="background:#fafafa;border-radius:12px;overflow:hidden;border:1px solid #eee;margin:16px 0">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tbody>{rows}</tbody></table>
    </div>"""


def email_store_welcome(name: str, email: str):
    content = f"""
    <h2 style="margin:0 0 12px;color:#8A6A2F;font-size:22px;font-weight:700;text-align:center">Добро пожаловать, {name}!</h2>
    <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 16px">Аккаунт на <b>RefSale</b> создан и уже активен. Теперь вы можете оформлять заказы, задавать вопросы продавцу и следить за статусами заказов.</p>
    <div style="text-align:center;margin:24px 0">
      <a href="{SITE_DOMAIN}" style="display:inline-block;padding:13px 30px;background:linear-gradient(135deg,#C9A24A,#9F7A3B);color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:700">Перейти в каталог</a>
    </div>
    <p style="color:#888;font-size:13px;line-height:1.5;margin:0">Есть промокод от блогера или друга? Введите его на сайте — цены сразу станут ниже.</p>"""
    send_email(email, "Добро пожаловать в RefSale", _email_wrapper(content))


def email_store_order_received(name: str, email: str, order_id: int, total: float, items_str):
    content = f"""
    <h2 style="margin:0 0 6px;color:#8A6A2F;font-size:22px;font-weight:700;text-align:center">Заказ #{order_id} получен</h2>
    <p style="margin:0 0 18px;color:#888;font-size:14px;text-align:center">Здравствуйте, {name}!</p>
    <p style="color:#444;font-size:15px;line-height:1.6;margin:0">Менеджер уже видит ваш заказ и напишет в чат на сайте: подтвердит наличие, сроки и пришлёт реквизиты для предоплаты. После оплаты заказ будет подтверждён, и мы сообщим о каждом изменении статуса.</p>
    {_store_items_table(items_str)}
    <div style="background:linear-gradient(135deg,#C9A24A,#9F7A3B);border-radius:12px;padding:14px 20px;margin:16px 0;text-align:center">
      <span style="color:rgba(255,255,255,0.85);font-size:12px">Сумма заказа</span>
      <div style="color:#fff;font-size:24px;font-weight:800;margin-top:2px">{int(total):,} ₽</div>
    </div>
    <div style="text-align:center;margin:20px 0 0">
      <a href="{SITE_DOMAIN}/orders?order={order_id}" style="display:inline-block;padding:12px 28px;background:#1a1a1a;color:#E2C27A;text-decoration:none;border-radius:10px;font-size:15px;font-weight:700">Открыть чат заказа</a>
    </div>"""
    send_email(email, f"Заказ #{order_id} получен — RefSale", _email_wrapper(content))


def email_store_order_status(name: str, email: str, order_id: int, total: float, status: str, items_str=None):
    info = STORE_STATUS_INFO.get(status)
    if not info:
        return
    label, color, icon, bg, desc = info
    steps = ["accepted", "processing", "shipping", "done"]
    track = ""
    if status in steps:
        reached = steps.index(status)
        cells = "".join(
            f"<td style='padding:6px 4px;text-align:center;font-size:11px;font-weight:700;"
            f"color:{'#fff' if i <= reached else '#999'};background:{'#9F7A3B' if i <= reached else '#eee'};"
            f"border-radius:6px'>{STORE_STATUS_INFO[s][0]}</td>"
            for i, s in enumerate(steps)
        )
        track = f"<table width='100%' cellpadding='0' cellspacing='4' style='margin:14px 0'><tr>{cells}</tr></table>"
    content = f"""
    <div style="text-align:center;margin-bottom:18px">
      <div style="font-size:30px;line-height:1">{icon}</div>
      <h2 style="margin:8px 0 0;color:{color};font-size:22px;font-weight:700">Заказ #{order_id} — {label}</h2>
      <p style="margin:6px 0 0;color:#888;font-size:14px">Здравствуйте, {name}!</p>
    </div>
    <div style="background:{bg};border:1px solid {color}40;border-radius:12px;padding:16px 20px;margin:0 0 8px">
      <p style="margin:0;font-size:14px;color:#444;line-height:1.55">{desc}</p>
    </div>
    {track}
    {_store_items_table(items_str) if status == "accepted" else ""}
    <p style="text-align:center;color:#888;font-size:13px;margin:16px 0 0">Сумма заказа: <b style="color:#333">{int(total):,} ₽</b></p>
    <div style="text-align:center;margin:18px 0 0">
      <a href="{SITE_DOMAIN}/orders?order={order_id}" style="display:inline-block;padding:12px 28px;background:#1a1a1a;color:#E2C27A;text-decoration:none;border-radius:10px;font-size:14px;font-weight:700">Статус и чат заказа</a>
    </div>"""
    send_email(email, f"Заказ #{order_id} — {label} | RefSale", _email_wrapper(content))


# ══════════════════════════════════════════════════
# STOREFRONT (RefSale)
# ══════════════════════════════════════════════════
STORE_STATUS_INFO = {
    "new": ("Ожидает подтверждения", "#8A6A2F", "&#9203;", "#FBF6EA",
            "Мы получили заказ. Менеджер напишет в чат на сайте: подтвердит наличие и пришлёт реквизиты для предоплаты."),
    "accepted": ("Принят", "#8A6A2F", "&#9989;", "#FBF6EA",
                 "Оплата получена, заказ подтверждён и принят в работу. Дальше вы будете получать письма о каждом шаге: "
                 "в обработке → в доставке → выдан."),
    "processing": ("В обработке", "#B7791F", "&#9881;", "#FEF9E7",
                   "Собираем и проверяем ваш заказ."),
    "shipping": ("В доставке", "#2B6CB0", "&#128666;", "#EBF4FF",
                 "Заказ передан в доставку и уже едет к вам."),
    "done": ("Выдан", "#27ae60", "&#127873;", "#EAFAF1",
             "Заказ выдан. Спасибо, что выбрали нас! Будем рады вашему отзыву на сайте."),
    "cancelled": ("Отменён", "#e74c3c", "&#10060;", "#FDEDEC",
                  "Заказ отменён. Если это ошибка — напишите нам в чат заказа."),
}


def _store_items_table(items_str) -> str:
    try:
        items = json.loads(items_str) if isinstance(items_str, str) else (items_str or [])
    except Exception:
        items = []
    rows = ""
    for it in items:
        qty = int(it.get("qty", 1) or 1)
        price = float(it.get("price", 0) or 0)
        base = float(it.get("base_price", price) or price)
        old = (f"<span style='color:#aaa;text-decoration:line-through;font-weight:400;margin-right:6px'>{int(base * qty):,} ₽</span>"
               if base > price else "")
        rows += (f"<tr><td style='padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:14px;color:#333'>{it.get('name','')}</td>"
                 f"<td style='padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:center;font-size:14px;color:#666'>{qty}</td>"
                 f"<td style='padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-size:14px;font-weight:600;color:#333;white-space:nowrap'>{old}{int(price * qty):,} ₽</td></tr>")
    if not rows:
        return ""
    return f"""
    <div style="background:#fafafa;border-radius:12px;overflow:hidden;border:1px solid #eee;margin:16px 0">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tbody>{rows}</tbody></table>
    </div>"""


def email_store_welcome(name: str, email: str):
    content = f"""
    <h2 style="margin:0 0 12px;color:#8A6A2F;font-size:22px;font-weight:700;text-align:center">Добро пожаловать, {name}!</h2>
    <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 16px">Аккаунт на <b>RefSale</b> создан и уже активен. Теперь вы можете оформлять заказы, задавать вопросы продавцу и следить за статусами заказов.</p>
    <div style="text-align:center;margin:24px 0">
      <a href="{SITE_DOMAIN}" style="display:inline-block;padding:13px 30px;background:linear-gradient(135deg,#C9A24A,#9F7A3B);color:#fff;text-decoration:none;border-radius:10px;font-size:15px;font-weight:700">Перейти в каталог</a>
    </div>
    <p style="color:#888;font-size:13px;line-height:1.5;margin:0">Есть промокод от блогера или друга? Введите его на сайте — цены сразу станут ниже.</p>"""
    send_email(email, "Добро пожаловать в RefSale", _email_wrapper(content))


def email_store_order_received(name: str, email: str, order_id: int, total: float, items_str):
    content = f"""
    <h2 style="margin:0 0 6px;color:#8A6A2F;font-size:22px;font-weight:700;text-align:center">Заказ #{order_id} получен</h2>
    <p style="margin:0 0 18px;color:#888;font-size:14px;text-align:center">Здравствуйте, {name}!</p>
    <p style="color:#444;font-size:15px;line-height:1.6;margin:0">Менеджер уже видит ваш заказ и напишет в чат на сайте: подтвердит наличие, сроки и пришлёт реквизиты для предоплаты. После оплаты заказ будет подтверждён, и мы сообщим о каждом изменении статуса.</p>
    {_store_items_table(items_str)}
    <div style="background:linear-gradient(135deg,#C9A24A,#9F7A3B);border-radius:12px;padding:14px 20px;margin:16px 0;text-align:center">
      <span style="color:rgba(255,255,255,0.85);font-size:12px">Сумма заказа</span>
      <div style="color:#fff;font-size:24px;font-weight:800;margin-top:2px">{int(total):,} ₽</div>
    </div>
    <div style="text-align:center;margin:20px 0 0">
      <a href="{SITE_DOMAIN}/orders?order={order_id}" style="display:inline-block;padding:12px 28px;background:#1a1a1a;color:#E2C27A;text-decoration:none;border-radius:10px;font-size:15px;font-weight:700">Открыть чат заказа</a>
    </div>"""
    send_email(email, f"Заказ #{order_id} получен — RefSale", _email_wrapper(content))


def email_store_order_status(name: str, email: str, order_id: int, total: float, status: str, items_str=None):
    info = STORE_STATUS_INFO.get(status)
    if not info:
        return
    label, color, icon, bg, desc = info
    steps = ["accepted", "processing", "shipping", "done"]
    track = ""
    if status in steps:
        reached = steps.index(status)
        cells = "".join(
            f"<td style='padding:6px 4px;text-align:center;font-size:11px;font-weight:700;"
            f"color:{'#fff' if i <= reached else '#999'};background:{'#9F7A3B' if i <= reached else '#eee'};"
            f"border-radius:6px'>{STORE_STATUS_INFO[s][0]}</td>"
            for i, s in enumerate(steps)
        )
        track = f"<table width='100%' cellpadding='0' cellspacing='4' style='margin:14px 0'><tr>{cells}</tr></table>"
    content = f"""
    <div style="text-align:center;margin-bottom:18px">
      <div style="font-size:30px;line-height:1">{icon}</div>
      <h2 style="margin:8px 0 0;color:{color};font-size:22px;font-weight:700">Заказ #{order_id} — {label}</h2>
      <p style="margin:6px 0 0;color:#888;font-size:14px">Здравствуйте, {name}!</p>
    </div>
    <div style="background:{bg};border:1px solid {color}40;border-radius:12px;padding:16px 20px;margin:0 0 8px">
      <p style="margin:0;font-size:14px;color:#444;line-height:1.55">{desc}</p>
    </div>
    {track}
    {_store_items_table(items_str) if status == "accepted" else ""}
    <p style="text-align:center;color:#888;font-size:13px;margin:16px 0 0">Сумма заказа: <b style="color:#333">{int(total):,} ₽</b></p>
    <div style="text-align:center;margin:18px 0 0">
      <a href="{SITE_DOMAIN}/orders?order={order_id}" style="display:inline-block;padding:12px 28px;background:#1a1a1a;color:#E2C27A;text-decoration:none;border-radius:10px;font-size:14px;font-weight:700">Статус и чат заказа</a>
    </div>"""
    send_email(email, f"Заказ #{order_id} — {label} | RefSale", _email_wrapper(content))
