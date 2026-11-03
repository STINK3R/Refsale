"""Search engines: proving the site is ours, and telling Yandex about pages.

- Yandex.Webmaster and Google Search Console check ownership with a small
  HTML file at the site root. The admin pastes the code into the panel and
  nginx hands /yandex_<code>.html and /google<code>.html to these routes, so
  no redeploy is needed.
- IndexNow (Yandex, Bing): the site posts its addresses and Yandex fetches them
  soon after, instead of waiting for its robot. The key lives in settings and
  is served as /<key>.txt.
"""
import json
import re
import secrets
import urllib.request

from flask import Blueprint, Response, jsonify

from ..db import get_db

bp = Blueprint('seo', __name__)

SITE = "https://refsale.ru"


def _setting(cur, key: str) -> str:
    cur.execute("SELECT value FROM coop_settings WHERE key = %s", (key,))
    row = cur.fetchone()
    return ((row or {}).get("value") or "").strip()


@bp.route("/api/verify/yandex/<code>")
def verify_yandex(code):
    with get_db() as cur:
        want = _setting(cur, "yandex_verification")
    # The panel may hold the code alone or the whole file name
    want = re.sub(r"^yandex_|\.html$", "", want)
    if not want or code != want:
        return Response("Not found", status=404)
    html = (
        "<html>\n    <head>\n        <meta http-equiv=\"Content-Type\" content=\"text/html; charset=UTF-8\">\n"
        f"    </head>\n    <body>Verification: {want}</body>\n</html>\n"
    )
    return Response(html, mimetype="text/html")


@bp.route("/api/verify/google/<name>")
def verify_google(name):
    with get_db() as cur:
        want = _setting(cur, "google_verification")
    want = re.sub(r"\.html$", "", want)
    if not want.startswith("google"):
        want = "google" + want
    if name != want:
        return Response("Not found", status=404)
    return Response(f"google-site-verification: {want}.html", mimetype="text/html")


def indexnow_key(cur) -> str:
    key = _setting(cur, "indexnow_key")
    if not re.fullmatch(r"[a-f0-9]{32}", key):
        key = secrets.token_hex(16)
        cur.execute(
            """INSERT INTO coop_settings (key, value) VALUES ('indexnow_key', %s)
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value""",
            (key,),
        )
    return key


@bp.route("/api/indexnow/<key>.txt")
def indexnow_key_file(key):
    with get_db() as cur:
        want = _setting(cur, "indexnow_key")
    if not want or key != want:
        return Response("Not found", status=404)
    return Response(want, mimetype="text/plain")


@bp.route("/api/admin/seo/indexnow", methods=["POST"])
def admin_indexnow():
    """Sends the site's pages (the same list as the sitemap) to Yandex."""
    with get_db() as cur:
        key = indexnow_key(cur)
        cur.execute("SELECT id FROM coop_categories ORDER BY sort_order ASC, created_at ASC")
        cats = [r["id"] for r in cur.fetchall()]
    urls = [f"{SITE}/", f"{SITE}/catalog", f"{SITE}/forums", f"{SITE}/privacy", f"{SITE}/terms"]
    urls += [f"{SITE}/catalog?c={c}" for c in cats]
    body = json.dumps({"host": "refsale.ru", "key": key, "keyLocation": f"{SITE}/{key}.txt", "urlList": urls}).encode()
    req = urllib.request.Request("https://yandex.com/indexnow", data=body,
                                 headers={"Content-Type": "application/json; charset=utf-8"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            status = r.status
    except urllib.error.HTTPError as e:
        status = e.code
    except Exception as e:
        print(f"[indexnow] {e}")
        return jsonify({"ok": False, "error": "Яндекс не ответил, попробуйте позже"}), 502
    # 200/202 — accepted; 403 — the key file is not reachable yet (before deploy)
    ok = status in (200, 202)
    return jsonify({"ok": ok, "status": status, "count": len(urls),
                    "error": None if ok else f"Яндекс ответил {status}: проверьте, что сайт выложен и открывается {SITE}/{key}.txt"})
