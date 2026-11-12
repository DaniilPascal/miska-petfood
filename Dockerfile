FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    MISKA_DB_PATH=/app/data/miska.db \
    MISKA_CORS_ORIGINS=* \
    MISKA_DEMO_EMAIL=demo@miska.shop \
    MISKA_DEMO_PASSWORD=demo1234 \
    MISKA_DEMO_NAME=Демо Пользователь

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY . /app

RUN mkdir -p /app/data

EXPOSE 8000

# PORT задаёт хостинг (Render, Railway и т.п.)
CMD ["sh", "-c", "uvicorn backend.app:app --host 0.0.0.0 --port ${PORT:-8000}"]
