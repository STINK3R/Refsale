"""The cooperative inside RefSale (refsale.ru/kokonkoop): on or off.

The edge nginx asks /api/kokonkoop/gate before serving the section (its
auth_request): 204 lets the visitor in, 403 turns them back to the main page.
The admin switches it with a checkbox; the cooperative's own admin panel
works either way.
"""
from flask import Blueprint, Response

from ..db import get_db

bp = Blueprint('kokonkoop', __name__)


def kokonkoop_enabled(cur) -> bool:
    cur.execute("SELECT value FROM coop_settings WHERE key = 'kokonkoop_enabled'")
    row = cur.fetchone()
    return ((row or {}).get("value") or "").strip() == "true"


@bp.route("/api/kokonkoop/gate")
def kokonkoop_gate():
    try:
        with get_db() as cur:
            on = kokonkoop_enabled(cur)
    except Exception:
        on = False
    return Response(status=204 if on else 403)
