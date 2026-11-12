# ПР 4 — развёртывание

## Что сделано
1. Настройки вынесены в переменные окружения (`.env.example`)
2. `Dockerfile` + `docker-compose.yml` для запуска на чистой машине
3. `render.yaml` — деплой на Render с автоматическим HTTPS
4. README дополнен адресом, Docker-инструкцией и тестовым аккаунтом
5. При старте создаётся демо-пользователь

## Текущий HTTPS-адрес
https://witty-spies-sink.loca.lt

## Тестовая учётная запись
- email: `demo@miska.shop`
- пароль: `demo1234`

## Переменные окружения
| Переменная | Назначение | Пример |
|------------|------------|--------|
| `MISKA_DB_PATH` | путь к SQLite | `/app/data/miska.db` |
| `MISKA_CORS_ORIGINS` | CORS | `*` |
| `MISKA_DEMO_EMAIL` | демо-логин | `demo@miska.shop` |
| `MISKA_DEMO_PASSWORD` | демо-пароль | `demo1234` |
| `PORT` | порт HTTP | `8000` |

## Docker
```bash
docker compose up --build
```

## Render (постоянный хостинг + HTTPS)
1. GitHub → Render Blueprint (`render.yaml`)
2. Дождаться деплоя
3. Обновить URL в README

## Временный туннель
```bash
uvicorn backend.app:app --host 127.0.0.1 --port 8000
npx localtunnel --port 8000
```
