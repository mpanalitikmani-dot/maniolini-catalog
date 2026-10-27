"""Подключает мини-каталог к Telegram-боту: кнопка меню «Каталог».

Токены не хранятся в репозитории — они в bot/.env (файл в .gitignore) или в переменной окружения:
    python bot/setup_bot.py https://<адрес каталога>/                  # токен из BOT_TOKEN
    python bot/setup_bot.py <url> --token-env BOT_TOKEN_C              # другой бот из bot/.env

По умолчанию меняется ТОЛЬКО кнопка меню: у боевых ботов (Senler, Битрикс24) свои описания
и подключения, их не трогаем. Описание бота — только с флагом --describe (для тестового бота).

Прислать себе сообщение с кнопками каталога:
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


def load_env() -> None:
    env = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(env):
        for line in open(env, encoding="utf-8"):
            k, _, v = line.strip().partition("=")
            if k and v and not k.startswith("#"):
                os.environ.setdefault(k, v)


def main() -> None:
    load_env()
    name = sys.argv[sys.argv.index("--token-env") + 1] if "--token-env" in sys.argv else "BOT_TOKEN"
    token = os.environ.get(name)
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
    print("Кнопка меню «Каталог» установлена")
    if "--describe" not in sys.argv:
        return send_test(token, url)

    call(token, "setMyShortDescription", short_description="Каталог MANIOLINI: хиты, одежда, обувь. Поможем с размером.")
    call(token, "setMyDescription", description="Откройте каталог MANIOLINI прямо в Telegram: хиты продаж, одежда, обувь. Понравилась вещь — напишите нам в один тап.")
    print("Описание бота обновлено")
    send_test(token, url)


def send_test(token: str, url: str) -> None:
    if "--send" in sys.argv:
        chat_id = sys.argv[sys.argv.index("--send") + 1]
        sep = "&" if "?" in url else "?"
        call(token, "sendMessage", chat_id=chat_id,
             text="Наш каталог 👗 Хиты, одежда и обувь — выберите вещь и напишите нам.",
             reply_markup={"inline_keyboard": [
                 [{"text": "Открыть каталог", "web_app": {"url": url}}],
                 [{"text": "👗 Одежда", "web_app": {"url": url + sep + "cat=odezhda"}},
                  {"text": "👢 Обувь", "web_app": {"url": url + sep + "cat=obuv"}}],
             ]})
        print(f"Сообщение с кнопками отправлено в чат {chat_id}")


if __name__ == "__main__":
    main()
