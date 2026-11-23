"""Reading a supplier's price list (Excel .xlsx, Word .docx or .csv).

The list is a table: a header row (Наименование · Бренд · Вес коробки ·
Фасовка · Цена безнал · Цена нал), section rows that span the table and name
a category («Полуфабрикаты замороженные», «Пицца «Zotman» (цена за 1 шт.)»),
and the products under them. Columns are found by their headers, so their
order and a missing column do not matter; without a header the order above
is assumed.
"""
import csv
import io
import re

FIELDS = ("name", "brand", "box_weight", "packing", "price_cashless", "price_cash")

_NUM = re.compile(r"\d[\d\s ]*(?:[.,]\d+)?")


def _text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        return f"{value:.2f}"
    return re.sub(r"\s+", " ", str(value)).strip()


def parse_price(value):
    """(price, note): «75.00р за шт.» → (75.0, 'за шт.'); empty → (None, '')."""
    if value is None:
        return None, ""
    if isinstance(value, (int, float)):
        return (float(value) if value > 0 else None), ""
    s = _text(value)
    m = _NUM.search(s)
    if not m:
        return None, ""
    try:
        price = float(re.sub(r"[\s ]", "", m.group(0)).replace(",", "."))
    except ValueError:
        return None, ""
    rest = (s[:m.start()] + " " + s[m.end():]).strip()
    rest = re.sub(r"^(р\.?|руб\.?|₽)\s*", "", rest, flags=re.I).strip(" .,")
    note = rest if re.search(r"[а-яa-z]{2,}", rest, re.I) else ""
    return (price if price > 0 else None), note[:100]


def _header_map(cells):
    """Column index per field, or None when the row is not a header."""
    low = [c.lower() for c in cells]
    if not any(c.startswith("наимен") or c == "название" or c == "товар" for c in low):
        return None
    m = {}
    for i, c in enumerate(low):
        if not c:
            continue
        if "name" not in m and (c.startswith("наимен") or c in ("название", "товар")):
            m["name"] = i
        elif "brand" not in m and ("бренд" in c or "производ" in c or "марка" in c):
            m["brand"] = i
        elif "box_weight" not in m and "вес" in c:
            m["box_weight"] = i
        elif "packing" not in m and "фасов" in c:
            m["packing"] = i
        elif "безнал" in c:
            m.setdefault("price_cashless", i)
        elif "нал" in c:
            m.setdefault("price_cash", i)
        elif "цен" in c:
            m.setdefault("price_cash", i)
    return m


def _strip_quotes(s: str) -> str:
    return s.strip().strip("«»\"“”'").strip()


def parse_rows(rows):
    """Rows of cell values → (categories in order, items)."""
    colmap = {f: i for i, f in enumerate(FIELDS)}
    category = "Без категории"
    categories, items, skipped = [], [], 0
    for raw in rows:
        cells = [_text(c) for c in raw]
        nonempty = [c for c in cells if c]
        if not nonempty:
            continue
        header = _header_map(cells)
        if header:
            colmap = header
            continue
        # A section row: one text across the table (Word repeats a merged
        # cell's text in every column it spans, Excel leaves the rest empty)
        if len(set(nonempty)) == 1:
            text = nonempty[0]
            letters = re.findall(r"[A-Za-zА-Яа-яЁё]", text)
            if len(letters) >= 3 and not re.match(r"^\d", text):
                category = text[:255]
                if category not in categories:
                    categories.append(category)
            else:
                skipped += 1
            continue

        def cell(field):
            i = colmap.get(field)
            return raw[i] if i is not None and i < len(raw) else None

        name = _text(cell("name"))
        if not name or len(re.findall(r"[A-Za-zА-Яа-яЁё]", name)) < 2:
            skipped += 1
            continue
        cashless, note1 = parse_price(cell("price_cashless"))
        cash, note2 = parse_price(cell("price_cash"))
        if category not in categories:
            categories.append(category)
        items.append({
            "category": category,
            "name": name[:500],
            "brand": _strip_quotes(_text(cell("brand")))[:255],
            "box_weight": _text(cell("box_weight"))[:100],
            "packing": _text(cell("packing"))[:100],
            "price_cashless": cashless,
            "price_cash": cash,
            "price_note": note1 or note2,
        })
    return categories, items, skipped


def read_table_file(filename: str, data: bytes):
    """All table rows of an .xlsx, .docx or .csv file."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext in ("xlsx", "xlsm"):
        from openpyxl import load_workbook
        wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        rows = []
        for ws in wb.worksheets:
            rows.extend(list(r) for r in ws.iter_rows(values_only=True))
        return rows
    if ext == "docx":
        from docx import Document
        doc = Document(io.BytesIO(data))
        rows = []
        for table in doc.tables:
            for row in table.rows:
                rows.append([cell.text for cell in row.cells])
        return rows
    if ext in ("csv", "txt"):
        text = data.decode("utf-8-sig", errors="replace")
        try:
            dialect = csv.Sniffer().sniff(text[:4096], delimiters=";,\t")
        except csv.Error:
            dialect = csv.excel
        return [row for row in csv.reader(io.StringIO(text), dialect)]
    raise ValueError("Поддерживаются файлы Excel (.xlsx), Word (.docx) и CSV. Старый .xls сохраните как .xlsx.")
