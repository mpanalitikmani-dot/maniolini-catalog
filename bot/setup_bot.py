"""Подключает мини-каталог к Telegram-боту: кнопка меню «Каталог» + описание.

Токен не хранится в репозитории — передайте его через переменную окружения:
    set BOT_TOKEN=123:ABC          (Windows)
    python bot/setup_bot.py https://<user>.github.io/<repo>/

Чтобы проверить, что бот жив, и прислать себе сообщение с кнопкой:
    python bot/setup_bot.py <url> --send <ваш chat_id>
"""
import json
import os
import sys
import urllib.request


def call(token: str, method: str, **params):
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/{method}",
        data=json.dumps(params).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=20) as r:
        res = json.load(r)
    if not res.get("ok"):
        raise SystemExit(f"{method}: {res}")
    return res["result"]


def main() -> None:
    token = os.environ.get("BOT_TOKEN")
    if not token or len(sys.argv) < 2:
        raise SystemExit(__doc__)
    url = sys.argv[1]
    if not url.startswith("https://"):
        raise SystemExit("Telegram принимает только https-адрес мини-приложения")

    me = call(token, "getMe")
    print(f"Бот: @{me['username']}")

    call(token, "setChatMenuButton", menu_button={
        "type": "web_app", "text": "Каталог", "web_app": {"url": url},
    })
    call(token, "setMyShortDescription", short_description="Каталог MANIOLINI: хиты, одежда, обувь. Менеджер поможет с размером.")
    call(token, "setMyDescription", description="Откройте каталог MANIOLINI прямо в Telegram: хиты продаж, одежда, обувь. Понравилась вещь — напишите менеджеру в один тап.")
    print("Кнопка меню «Каталог» установлена")

    if "--send" in sys.argv:
        chat_id = sys.argv[sys.argv.index("--send") + 1]
        call(token, "sendMessage", chat_id=chat_id,
             text="Наш каталог 👗 Хиты, одежда и обувь — выберите вещь и напишите менеджеру.",
             reply_markup={"inline_keyboard": [
                 [{"text": "Открыть каталог", "web_app": {"url": url}}],
                 [{"text": "👗 Одежда", "web_app": {"url": url + "?cat=odezhda"}},
                  {"text": "👢 Обувь", "web_app": {"url": url + "?cat=obuv"}}],
             ]})
        print(f"Сообщение с кнопками отправлено в чат {chat_id}")


if __name__ == "__main__":
    main()
