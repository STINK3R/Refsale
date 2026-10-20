"""
RefSale — Flask Application Factory
"""

import os
import gzip as _gzip
from io import BytesIO

from flask import Flask, request, send_from_directory
from flask_cors import CORS

from .config import UPLOAD_DIR, FRONTEND_DIST, BASE_DIR
from .auth import admin_token_refresh, _verify_admin_token


def _bootstrap_admin_password():
    """Make sure a fresh install has an admin password nobody else knows.

    Historically db/init.sql seeded a plaintext default that is public in this
    repository. Now the row is created on first boot: from ADMIN_PASSWORD when
    provided, otherwise a random one printed once to the container log.
    """
    import secrets
    from .db import get_db
    from .utils import hash_password
    try:
        with get_db() as cur:
            cur.execute("SELECT value FROM coop_settings WHERE key = 'admin_password' LIMIT 1")
            row = cur.fetchone()
            if row and (row.get("value") or "").strip():
                return
            plain = os.environ.get("ADMIN_PASSWORD", "").strip() or secrets.token_urlsafe(12)
            cur.execute(
                "INSERT INTO coop_settings (key, value) VALUES ('admin_password', %s) "
                "ON CONFLICT (key) DO NOTHING",
                (hash_password(plain),)
            )
            created = cur.rowcount == 1
        if created and not os.environ.get("ADMIN_PASSWORD"):
            print("=" * 62)
            print(f"🔑 Admin password generated: {plain}")
            print("   Log in at /admin as 'admin' and change it. Shown once.")
            print("=" * 62)
    except Exception as e:
        print(f"⚠️  Admin password bootstrap skipped: {e}")


def create_app():
    app = Flask(__name__, static_folder=None)
    app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50 MB
    from .config import CORS_ORIGINS
    CORS(app, resources={r"/api/*": {"origins": CORS_ORIGINS}})

    # ── Gzip compression middleware ────────────────
    @app.after_request
    def compress_response(response):
        if (
            response.status_code < 200 or response.status_code >= 300
            or response.direct_passthrough
            or 'Content-Encoding' in response.headers
            or len(response.get_data()) < 500
        ):
            return response
        accept_enc = request.headers.get('Accept-Encoding', '')
        if 'gzip' not in accept_enc.lower():
            return response
        ct = response.content_type or ''
        if not any(t in ct for t in ('text/', 'json', 'javascript', 'css', 'svg', 'xml')):
            return response
        buf = BytesIO()
        with _gzip.GzipFile(fileobj=buf, mode='wb', compresslevel=6) as gz:
            gz.write(response.get_data())
        response.set_data(buf.getvalue())
        response.headers['Content-Encoding'] = 'gzip'
        response.headers['Content-Length'] = len(response.get_data())
        response.headers['Vary'] = 'Accept-Encoding'
        return response

    # ── Security headers ──────────────────────────
    @app.after_request
    def add_security_headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
        return response

    # ── Admin token auto-refresh middleware ────────
    @app.after_request
    def _admin_token_refresh(response):
        return admin_token_refresh(response)

    # ── Admin auth guard (app-level, protects all blueprints) ──
    @app.before_request
    def admin_auth_guard():
        from flask import jsonify
        path = request.path
        if path.startswith("/api/admin") and path != "/api/admin/login":
            if not _verify_admin_token():
                return jsonify({"error": "Unauthorized"}), 401

    # ── Static file routes ─────────────────────────
    @app.route("/")
    def serve_index():
        return send_from_directory(FRONTEND_DIST, "index.html")

    # Client-side routes of the SPA. Anything else that is not a real file or
    # an API call stays a 404 instead of silently rendering the storefront.
    _SPA_ROOTS = {"forums", "orders", "cabinet", "favorites"}

    @app.route("/<path:spa_path>")
    def serve_spa(spa_path):
        if spa_path.split("/", 1)[0] not in _SPA_ROOTS:
            from flask import abort
            abort(404)
        return send_from_directory(FRONTEND_DIST, "index.html")

    @app.route("/assets/<path:filename>")
    def serve_assets(filename):
        resp = send_from_directory(os.path.join(FRONTEND_DIST, "assets"), filename)
        resp.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
        return resp

    @app.route("/admin")
    @app.route("/admin.html")
    def serve_admin():
        return send_from_directory(BASE_DIR, "admin.html")

    @app.route("/uploads/<path:filename>")
    def serve_upload(filename):
        resp = send_from_directory(UPLOAD_DIR, filename)
        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
        if ext in ('mp4', 'webm', 'ogg', 'mov'):
            resp.headers['Accept-Ranges'] = 'bytes'
            resp.headers['Cache-Control'] = 'public, max-age=86400'
        elif ext in ('jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'):
            resp.headers['Cache-Control'] = 'public, max-age=604800, immutable'
        elif ext in ('mp3', 'wav', 'flac'):
            resp.headers['Cache-Control'] = 'public, max-age=86400'
        return resp

    # ── Register blueprints ────────────────────────
    from .routes.public import bp as public_bp
    from .routes.admin import bp as admin_bp
    from .routes.support import bp as support_bp
    from .routes.order_chat import bp as order_chat_bp
    from .routes.store import bp as store_bp
    from .schema import ensure_schema

    app.register_blueprint(public_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(support_bp)
    app.register_blueprint(order_chat_bp)
    app.register_blueprint(store_bp)

    ensure_schema()
    _bootstrap_admin_password()

    return app
