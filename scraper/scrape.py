"""Собирает каталог maniolini.ru в data/products.json для мини-приложения.

Только стандартная библиотека Python — запускается локально и в GitHub Actions:
    python scraper/scrape.py
"""
import html
import json
import re
import sys
import time
import urllib.request
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
        stickers = {k: v for k, v in STICKER.findall(chunk)}
        images = []
        for src in IMG.findall(chunk):
            if src not in images:
                images.append(src)
        items.append({
            "id": data["ID"],
            "name": html.unescape(data["NAME"]).strip(),
            "url": BASE + url,
            # /catalog/<категория>/<подраздел>/<товар>/
            "path": url.split("?")[0].strip("/").split("/")[1:-1],
            "price": int(float(price.group(1))) if price else None,
            "oldPrice": int(re.sub(r"\D", "", html.unescape(old.group(1)))) if old and re.sub(r"\D", "", html.unescape(old.group(1))) else None,
            "images": [BASE + s for s in images[:4]],
            "hit": "hit" in stickers,
            "new": "new" in stickers,
            "sale": "stock" in stickers,
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


def main() -> None:
    products: dict[int, dict] = {}
    sections: dict[str, dict] = {}

    for slug, title in CATEGORIES.items():
        print(f"[{slug}]")
        subs: dict[str, str] = {}
        for n in range(1, MAX_PAGES + 1):
            url = f"{BASE}/catalog/{slug}/" + (f"?PAGEN_1={n}" if n > 1 else "")
            page = fetch(url)
            if n == 1:
                subs = subsection_names(page, slug)
            cards = parse_cards(page)
            new = [c for c in cards if c["id"] not in products]
            print(f"  page {n}: {len(cards)} cards, {len(new)} new")
            for c in new:
                c["category"] = slug
                products[c["id"]] = c
            # Bitrix отдаёт последнюю страницу на «лишних» номерах — новых товаров нет, значит конец
            if not new or f"PAGEN_1={n + 1}" not in page:
                break
            time.sleep(0.5)
        sections[slug] = {"title": title, "subsections": subs}

    # Хиты с главной: там стоят метки «Хит» на витрине
    home = parse_cards(fetch(BASE + "/"))
    for c in home:
        if c["id"] in products:
            products[c["id"]]["hit"] = products[c["id"]]["hit"] or c["hit"]
        else:
            c["category"] = c["path"][0] if c["path"] else ""
            products[c["id"]] = c

    for p in products.values():
        sub = p["path"][1] if len(p["path"]) > 1 else ""
        p["subsection"] = sub
        p["subsectionTitle"] = sections.get(p["category"], {}).get("subsections", {}).get(sub, "")
        del p["path"]

    items = [p for p in products.values() if p["images"]]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": BASE,
        "categories": [{"slug": s, "title": t} for s, t in CATEGORIES.items()],
        "products": items,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"saved {len(items)} products, hits: {sum(p['hit'] for p in items)} -> {OUT}")


if __name__ == "__main__":
    main()
