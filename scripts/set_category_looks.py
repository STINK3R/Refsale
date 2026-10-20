"""Give the four storefront categories their colour and hero picture.

Only fills fields that are still empty, so anything set in the admin panel
stays. Runs inside the backend container:
    docker compose exec -T backend python - < scripts/set_category_looks.py
"""
from app.db import get_db
from app.schema import ensure_schema

# name fragment (lower case) → (accent colour, bold colour or "" to derive it, hero picture)
LOOKS = [
    ("парфюм", "#FFE45C", "", ""),  # keeps the built-in bottles picture
    # peach on its own derives to orange; the care photo reads pink, so say so
    ("уход", "#F6D9C8", "#F2A3BC", "/img/hero-uhod-1000.webp"),
    ("еда", "#DDF2B2", "", "/img/hero-eda-1000.webp"),
    ("кита", "#C8E8FF", "", "/img/hero-china-1000.webp"),
]


def main():
    ensure_schema()
    with get_db() as cur:
        cur.execute("SELECT id, name, accent_color, accent_strong, hero_image FROM coop_categories")
        for c in cur.fetchall():
            name = (c["name"] or "").lower()
            look = next((l for l in LOOKS if l[0] in name), None)
            if not look:
                print(f"  {c['name']}: не знаю, какой цвет — пропускаю")
                continue
            _, accent, strong, hero = look
            new_accent = c["accent_color"] or accent
            new_strong = c["accent_strong"] or strong
            new_hero = c["hero_image"] or hero
            cur.execute(
                "UPDATE coop_categories SET accent_color = %s, accent_strong = %s, hero_image = %s WHERE id = %s",
                (new_accent, new_strong, new_hero, c["id"]),
            )
            print(f"  {c['name']}: цвет {new_accent}, насыщенный {new_strong or 'авто'}, картинка {new_hero or 'стандартная'}")
    print("Готово.")


main()
