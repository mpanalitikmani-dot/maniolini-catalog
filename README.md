# MANIOLINI — мини-каталог

Мини-версия сайта [maniolini.ru](https://maniolini.ru) для соцсетей: открывается как Telegram Mini App
(кнопка «Каталог» в боте) или обычной ссылкой во ВКонтакте / Instagram / WhatsApp.

- **Хиты продаж** — горизонтальная галерея (товары с меткой «Хит» на сайте)
- **Каталог** — Одежда, Верхняя одежда, Обувь, Для дома + подразделы и поиск
- **Карточка товара** — листаемые фото, цена, «Открыть на сайте»
- **Написать нам** — общий вопрос или про конкретный товар (текст с названием, ценой и ссылкой
  копируется сам). В Telegram это нижняя синяя кнопка.

Товары берутся с сайта автоматически: GitHub Actions каждый день в 06:00 МСК запускает
`scraper/scrape.py` и обновляет `data/products.json`.

## Настройка

Контакты менеджера и тексты — в [`config.js`](config.js):

```js
manager: {
  telegram: "",               // username менеджера без @ — тогда в Telegram сразу откроется чат
  vk: "maniolini_brand",
  whatsapp: "",
  phone: "+7 906-265-77-22",
}
```

## Публикация (один раз)

1. Settings → Pages → Source: **GitHub Actions**.
2. Actions → «Обновить каталог и опубликовать» → Run workflow.
3. Адрес: `https://mpanalitikmani-dot.github.io/maniolini-catalog/`

## Подключить к боту

```bash
set BOT_TOKEN=<токен от @BotFather>
python bot/setup_bot.py https://mpanalitikmani-dot.github.io/maniolini-catalog/ --send <ваш chat_id>
```

Скрипт ставит кнопку меню «Каталог» и присылает тестовое сообщение с кнопками.
Токен в репозиторий не попадает.

## Ссылки на раздел или товар

- `…/maniolini-catalog/?cat=obuv` — сразу раздел (odezhda, verkhnyaya_odezhda, obuv, dlya_doma)
- `…/maniolini-catalog/?item=35595` — сразу карточка товара
- В Telegram то же через `startapp`: `t.me/<бот>/<app>?startapp=cat_obuv` или `item_35595`

## Локально

```bash
python scraper/scrape.py
python -m http.server 8765
```
