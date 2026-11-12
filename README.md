# Миска — интернет-магазин корма для животных

Собственный вариант проекта по дисциплине «Введение в интернет-технологии».  
Тема: продажа еды и лакомств для животных. Особенность: подбор по виду животного, возрасту и цене.

## Публичный адрес (ПР 4)

Репозиторий: https://github.com/DaniilPascal/miska-petfood

Деплой на Render (одна кнопка после входа):  
https://dashboard.render.com/blueprints/new?repo=https%3A%2F%2Fgithub.com%2FDaniilPascal%2Fmiska-petfood

После деплоя адрес будет вида `https://miska-petfood.onrender.com` (HTTPS автоматически).

### Тестовые учётные записи
- Покупатель: `demo@miska.shop` / `demo1234`
- Админ (раздел БД): `admin@miska.shop` / `admin1234`

## Стек по практикам

| Шаг | Практика | Что сделано |
|-----|----------|-------------|
| 1 | ПР 1 | HTML/CSS, 6 страниц, адаптив, логотип |
| 2 | ПР 2 | JS-формы с валидацией, фильтры/корзина/FAQ; курсы ЦБ РФ |
| 3 | ПР 3 | FastAPI + SQLite, 4 таблицы, 15 товаров, заказы, bcrypt |
| 4 | ПР 4 | env-настройки, Docker, HTTPS-адрес, демо-аккаунт |

Документы: `docs/TZ.md`, `docs/PR2.md`, `docs/PR3.md`, `docs/PR4.md`

## База данных

```
users 1──∞ orders 1──∞ order_items ∞──1 products
```

Пароль только как bcrypt-хеш. SQL параметризованный.  
Путь к БД и другие настройки — через переменные окружения (см. `.env.example`).

## Запуск локально (без Docker)

```bash
cd /Users/admin/Desktop/Sergey
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.app:app --host 0.0.0.0 --port 8000
```

Сайт: http://127.0.0.1:8000

## Запуск через Docker (ПР 4)

```bash
docker compose up --build
```

Сайт: http://127.0.0.1:8000

## Постоянный хостинг на Render (HTTPS)

1. Загрузите проект на GitHub.
2. На [render.com](https://render.com) → **New** → **Blueprint** → выберите репозиторий (`render.yaml` уже в проекте).
3. После деплоя получите адрес `https://….onrender.com`.
4. Впишите этот адрес сюда вместо временного туннеля.

### Временный HTTPS без аккаунта хостинга

```bash
# терминал 1
uvicorn backend.app:app --host 127.0.0.1 --port 8000

# терминал 2
npx localtunnel --port 8000
```

## Демо на защите ПР 4

1. Открыть сайт по HTTPS-ссылке
2. Войти как `demo@miska.shop` / `demo1234`
3. Оформить заказ и показать «Мои заказы»
4. Показать `Dockerfile`, `.env.example` и этот README
