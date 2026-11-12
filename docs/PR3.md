# ПР 3 — сервер и база данных

## Структура БД (SQLite: `backend/miska.db`)

```
users 1──∞ orders 1──∞ order_items ∞──1 products
```

| Таблица | Поля | Связи |
|---------|------|-------|
| `users` | id, name, email, password_hash, token | заказы пользователя |
| `products` | id, slug, name, animal, age, weight, price, image, short, description, composition, features | позиции заказа |
| `orders` | id, user_id, created_at, status, customer_name, phone, delivery, comment, total | `user_id → users.id` |
| `order_items` | id, order_id, product_id, qty, price | `order_id → orders.id`, `product_id → products.id` |

В основной таблице `products` — **15** осмысленных товаров.

## Безопасность
- пароль хранится только как **bcrypt-хеш** (`passlib`)
- все SQL-запросы **параметризованные** (`?`, без склейки строк)
- заказы и профиль доступны только с `Authorization: Bearer <token>`

## API
| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/api/products` | список товаров |
| GET | `/api/products/{id}` | один товар |
| POST | `/api/register` | регистрация |
| POST | `/api/login` | вход |
| POST | `/api/logout` | выход |
| GET | `/api/me` | профиль |
| POST | `/api/orders` | создать заказ |
| GET | `/api/orders` | мои заказы |

## Как показать на защите
1. Открыть http://127.0.0.1:8000/api/products — данные из БД
2. Зарегистрировать пользователя на `auth.html`
3. Добавить товары в корзину и оформить заказ
4. В кабинете показать блок «Мои заказы»
5. По желанию открыть `miska.db` и показать, что `password_hash` — не открытый пароль
