"""Собирает каталог maniolini.ru в data/products.json для мини-приложения.

Только стандартная библиотека Python — запускается локально и в GitHub Actions:
    python scraper/scrape.py

На сайте (Bitrix, шаблон Aspro Premier) каждая карточка в списке — один цвет товара:
в ней фото и цена этого цвета, а в <template class="offers-template-json"> — какие
сочетания размер/цвет есть в продаже. Здесь карточки склеиваются в один товар с цветами.
"""
import html
import json
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://maniolini.ru"
UA = "Mozilla/5.0 (compatible; ManioliniMiniApp/1.0)"
OUT = Path(__file__).resolve().parent.parent / "data" / "products.json"

# Разделы каталога: slug -> название в мини-приложении
CATEGORIES = {
    "odezhda": "Одежда",
    "verkhnyaya_odezhda": "Верхняя одежда",
    "obuv": "Обувь",
    "dlya_doma": "Для дома",
}
MAX_PAGES = 30

CARD_SPLIT = re.compile(r'<div class="catalog-block__item\s')
DATA_ITEM = re.compile(r'data-item="([^"]+)"')
IMG = re.compile(r'data-src="(/upload/[^"]+\.(?:jpe?g|png|webp))"', re.I)
PRICE = re.compile(r'<meta itemprop="price" content="([\d.]+)"')
OLD_PRICE = re.compile(r'price__old-val[^>]*>\s*([\d\s&nbsp;]+)')
STICKER = re.compile(r'sticker__item--(\w+)[^>]*>\s*([^<]+?)\s*<')
PRODUCT_ID = re.compile(r'class="sku-props[^"]*"[^>]*?data-item-id="(\d+)"', re.S)
SKU_PROP = re.compile(r'sku-props__inner([^"]*)"[^>]*data-id="(\d+)">(.*?)</div>\s*</div>\s*</div>', re.S)
SKU_VALUE = re.compile(r'<button[^>]*class="sku-props__value([^"]*)"[^>]*data-onevalue="(\d+)"[^>]*data-title="([^"]*)"([^>]*)>')
SWATCH = re.compile(r'background-image:\s*url\(([^)]+)\)')
TREE = re.compile(r'offers-template-json">\s*(\[.*?\])\s*</template>', re.S)


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # сеть иногда моргает — пробуем ещё раз
            if attempt == 2:
                raise
            print(f"  retry {url}: {e}", file=sys.stderr)
            time.sleep(2)
    return ""


def parse_sku(chunk: str) -> dict:
    """Размеры и цвет карточки: все значения, активный цвет и размеры в наличии."""
    sizes, colors, active = [], {}, {}
    size_prop = color_prop = None
    for cls, prop_id, body in SKU_PROP.findall(chunk):
        is_color = "pict" in cls
        if is_color:
            color_prop = prop_id
        else:
            size_prop = prop_id
        for vcls, vid, title, rest in SKU_VALUE.findall(body):
            title = html.unescape(title).strip()
            if "--active" in vcls:
                active[prop_id] = int(vid)
            if is_color:
                sw = SWATCH.search(rest)
                colors[int(vid)] = {"title": title, "swatch": BASE + sw.group(1) if sw else ""}
            else:
                sizes.append((int(vid), title))

    tree = TREE.search(chunk)
    tree = [t.get("TREE") or {} for t in json.loads(tree.group(1))] if tree else []
    color_id = active.get(color_prop)
    # Размеры этого цвета, которые реально продаются
    in_stock = {
        t.get(f"PROP_{size_prop}")
        for t in tree
        if color_prop is None or t.get(f"PROP_{color_prop}") == color_id
    }
    # У части товаров сайт не отдаёт TREE — тогда считаем доступными все показанные размеры
    if not any(tree):
        in_stock = {v for v, _ in sizes}
    return {
        "allSizes": [t for _, t in sizes],
        "sizes": [t for v, t in sizes if v in in_stock],
        "color": colors.get(color_id, {"title": "", "swatch": ""}),
        "sku": {"sizeProp": size_prop, "colorProp": color_prop, "colorId": color_id, "sizeIds": dict(sizes)},
    }


def detail_sizes(card: dict) -> dict[int, list[int]] | None:
    """Со страницы товара: id цвета -> id размеров в продаже. В списке это есть не всегда."""
    sku = card["sku"]
    if not sku["sizeProp"]:
        return None
    m = TREE.search(fetch(card["url"]))
    if not m:
        return None
    tree = [t.get("TREE") or {} for t in json.loads(m.group(1))]
    if not any(tree):
        return None
    out: dict[int, list[int]] = {}
    for t in tree:
        size = t.get(f"PROP_{sku['sizeProp']}")
        color = t.get(f"PROP_{sku['colorProp']}") if sku["colorProp"] else None
        if size is not None:
            out.setdefault(color, []).append(size)
    return out


def parse_cards(page: str) -> list[dict]:
    items = []
    for chunk in CARD_SPLIT.split(page)[1:]:
        m = DATA_ITEM.search(chunk)
        if not m:
            continue
        data = json.loads(html.unescape(m.group(1)))
        url = data["DETAIL_PAGE_URL"]
        price = PRICE.search(chunk)
        old = OLD_PRICE.search(chunk)
        old_digits = re.sub(r"\D", "", html.unescape(old.group(1))) if old else ""
        stickers = {k: v for k, v in STICKER.findall(chunk)}
        pid = PRODUCT_ID.search(chunk)
        images = []
        for src in IMG.findall(chunk):
            if src not in images:
                images.append(src)
        items.append({
            "oid": data["ID"],
            "productId": int(pid.group(1)) if pid else data["ID"],
            "name": html.unescape(data["NAME"]).strip(),
            "url": BASE + url,
            # /catalog/<категория>/<подраздел>/<товар>/
            "path": url.split("?")[0].strip("/").split("/")[1:-1],
            "price": int(float(price.group(1))) if price else None,
            "oldPrice": int(old_digits) if old_digits else None,
            "images": [BASE + s for s in images[:4]],
            "hit": "hit" in stickers,
            "new": "new" in stickers,
            "sale": "stock" in stickers,
            **parse_sku(chunk),
        })
    return items


def subsection_names(page: str, slug: str) -> dict[str, str]:
    """Названия подразделов берём из ссылок вида /catalog/<slug>/<sub>/">Название<."""
    names = {}
    pat = re.compile(rf'href="/catalog/{slug}/([a-z0-9_]+)/"[^>]*>\s*(?:<span[^>]*>)?\s*([^<]{{2,40}}?)\s*<')
    for sub, name in pat.findall(page):
        name = html.unescape(name).strip()
        if name and sub not in names:
            names[sub] = name
    return names


def group(cards: list[dict], sections: dict) -> list[dict]:
    """Карточки-цвета одного товара -> один товар со списком цветов."""
    products: dict[int, dict] = {}
    for c in cards:
        if not c["images"]:
            continue
        p = products.get(c["productId"])
        if p is None:
            path = c["path"]
            cat = c.get("category") or (path[0] if path else "")
            sub = path[1] if len(path) > 1 else ""
            p = products[c["productId"]] = {
                "id": c["productId"],
                "name": c["name"],
                "category": cat,
                "subsection": sub,
                "subsectionTitle": sections.get(cat, {}).get("subsections", {}).get(sub, ""),
                "hit": False, "new": False, "sale": False,
                "allSizes": [],
                "colors": [],
            }
        for flag in ("hit", "new", "sale"):
            p[flag] = p[flag] or c[flag]
        for s in c["allSizes"]:
            if s not in p["allSizes"]:
                p["allSizes"].append(s)
        p["colors"].append({
            "oid": c["oid"],
            "title": c["color"]["title"],
            "swatch": c["color"]["swatch"],
            "url": c["url"],
            "price": c["price"],
            "oldPrice": c["oldPrice"],
            "images": c["images"],
            "sizes": c["sizes"],
        })
    for p in products.values():
        prices = [c["price"] for c in p["colors"] if c["price"]]
        p["price"] = min(prices) if prices else None
    return list(products.values())


def _safe(fn, *args):
    """Страница одного товара не должна ронять весь сбор каталога."""
    try:
        return fn(*args)
    except Exception as e:
        print(f"  skip: {e}", file=sys.stderr)
        return None


def main() -> None:
    cards: dict[int, dict] = {}
    sections: dict[str, dict] = {}

    for slug, title in CATEGORIES.items():
        print(f"[{slug}]")
        subs: dict[str, str] = {}
        for n in range(1, MAX_PAGES + 1):
            url = f"{BASE}/catalog/{slug}/" + (f"?PAGEN_1={n}" if n > 1 else "")
            page = fetch(url)
            if n == 1:
                subs = subsection_names(page, slug)
            found = parse_cards(page)
            new = [c for c in found if c["oid"] not in cards]
            print(f"  page {n}: {len(found)} cards, {len(new)} new")
            for c in new:
                c["category"] = slug
                cards[c["oid"]] = c
            # Bitrix отдаёт последнюю страницу на «лишних» номерах — новых товаров нет, значит конец
            if not new or f"PAGEN_1={n + 1}" not in page:
                break
            time.sleep(0.5)
        sections[slug] = {"title": title, "subsections": subs}

    # Хиты с главной: там стоят метки «Хит» на витрине
    for c in parse_cards(fetch(BASE + "/")):
        if c["oid"] in cards:
            cards[c["oid"]]["hit"] = cards[c["oid"]]["hit"] or c["hit"]
        else:
            cards[c["oid"]] = c

    # Точное наличие размеров по цветам — со страницы товара (одна страница на товар)
    first: dict[int, dict] = {}
    for c in cards.values():
        first.setdefault(c["productId"], c)
    print(f"[sizes] {len(first)} product pages")
    with ThreadPoolExecutor(max_workers=4) as pool:
        trees = dict(zip(first, pool.map(lambda c: _safe(detail_sizes, c), first.values())))
    for c in cards.values():
        tree = trees.get(c["productId"])
        if tree is None:
            continue
        ids = tree.get(c["sku"]["colorId"], [])
        c["sizes"] = [t for v, t in c["sku"]["sizeIds"].items() if v in ids]
    print(f"  exact sizes for {sum(t is not None for t in trees.values())} products")

    items = group(list(cards.values()), sections)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": BASE,
        "categories": [{"slug": s, "title": t} for s, t in CATEGORIES.items()],
        "products": items,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"saved {len(items)} products ({len(cards)} color cards), hits: {sum(p['hit'] for p in items)} -> {OUT}")


if __name__ == "__main__":
    main()
