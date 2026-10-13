"""
RefSale — Python Backend (Flask)
Thin entrypoint — all logic lives in the app/ package.
"""

import os
from app import create_app

app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    # debug=True exposes the Werkzeug console (arbitrary code execution), so it
    # is opt-in via env and never the default.
    debug = os.environ.get("FLASK_DEBUG", "").lower() in ("1", "true", "yes")
    print(f"🚀 Server starting on http://localhost:{port}")
    app.run(host="0.0.0.0", port=port, debug=debug)
