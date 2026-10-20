"""Give the four storefront categories their colour and hero picture.

Only fills fields that are still empty, so anything set in the admin panel
stays. Runs inside the backend container:
    docker compose exec -T backend python - < scripts/set_category_looks.py
"""
from app.db import get_db
from app.routes.store import ensure_store_schema

# name fragment (lower case) → (accent colour, hero picture shipped in frontend/public/img)
LOOKS = [
    ("парфюм", "#FFE45C", ""),  # keeps the built-in bottles picture
    ("уход", "#F6D9C8", "/img/hero-uhod-1000.webp"),
    ("еда", "#DDF2B2", "/img/hero-eda-1000.webp"),
    ("кита", "#C8E8FF", "/img/hero-china-1000.webp"),
]


def main():
    ensure_store_schema()
    with get_db() as cur:
        cur.execute("SELECT id, name, accent_color, hero_image FROM coop_categories")
        for c in cur.fetchall():
            name = (c["name"] or "").lower()
            look = next((l for l in LOOKS if l[0] in name), None)
            if not look:
                print(f"  {c['name']}: не знаю, какой цвет — пропускаю")
                continue
            _, accent, hero = look
            new_accent = c["accent_color"] or accent
            new_hero = c["hero_image"] or hero
            cur.execute(
                "UPDATE coop_categories SET accent_color = %s, hero_image = %s WHERE id = %s",
                (new_accent, new_hero, c["id"]),
            )
            print(f"  {c['name']}: цвет {new_accent}, картинка {new_hero or 'стандартная'}")
    print("Готово.")


main()
