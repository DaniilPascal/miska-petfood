"""
Миска — API (ПР 3–4)
Таблицы: users, products, orders, order_items
Пароли только в виде bcrypt-хеша, SQL только параметризованный.
Настройки вынесены в переменные окружения (ПР 4).
"""

from __future__ import annotations

import os
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from passlib.context import CryptContext
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent

# --- настройки из окружения (ПР 4) ---
DB_PATH = Path(os.getenv("MISKA_DB_PATH", str(Path(__file__).resolve().parent / "miska.db")))
CORS_ORIGINS = [
    item.strip()
    for item in os.getenv("MISKA_CORS_ORIGINS", "*").split(",")
    if item.strip()
]
DEMO_EMAIL = os.getenv("MISKA_DEMO_EMAIL", "demo@miska.shop")
DEMO_PASSWORD = os.getenv("MISKA_DEMO_PASSWORD", "demo1234")
DEMO_NAME = os.getenv("MISKA_DEMO_NAME", "Демо Пользователь")
APP_VERSION = os.getenv("MISKA_APP_VERSION", "4.0.0")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

app = FastAPI(title="Миска API", version=APP_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS if CORS_ORIGINS != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=4, max_length=128)


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=120)
    password: str = Field(min_length=4, max_length=128)


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    token: str


class OrderItemIn(BaseModel):
    product_id: int
    qty: int = Field(ge=1, le=99)


class OrderIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(min_length=10, max_length=32)
    delivery: str = Field(min_length=1, max_length=32)
    comment: str = Field(default="", max_length=500)
    items: list[OrderItemIn] = Field(min_length=1)


SEED_PRODUCTS = [
    (1, "dog-adult", "Миска Adult — сухой корм для собак", "dog", "adult", "12 кг", 3490,
     "images/products/dog-adult.jpg",
     "Сбалансированный рацион для взрослых собак средних и крупных пород.",
     "Полнорационный сухой корм с курицей и рисом. Поддерживает иммунитет и блеск шерсти.",
     "Курица (28%), рис, кукуруза, жир птицы, свёкла, витамины A, D3, E.",
     "Для взрослых собак|Курица|Без красителей"),
    (2, "dog-puppy", "Миска Puppy — корм для щенков", "dog", "junior", "3 кг", 1890,
     "images/products/dog-puppy.jpg",
     "Рост костей и мышц для щенков от 2 до 12 месяцев.",
     "Формула с повышенным содержанием белка и кальция.",
     "Индейка (32%), лосось, рис, яйцо, рыбий жир, пребиотики.",
     "Для щенков|Высокий белок|Омега-3"),
    (3, "dog-senior", "Миска Senior — корм для пожилых собак", "dog", "senior", "10 кг", 3290,
     "images/products/dog-senior.jpg",
     "Мягкая нагрузка на суставы и контроль веса после 7 лет.",
     "Сниженная калорийность и добавки для суставов.",
     "Ягнёнок (24%), ячмень, горох, глюкозамин, хондроитин.",
     "7+ лет|Контроль веса|Суставы"),
    (4, "cat-adult", "Миска Cat — сухой корм для кошек", "cat", "adult", "7 кг", 2790,
     "images/products/cat-adult.jpg",
     "Высокое содержание мяса для взрослых кошек.",
     "Поддерживает мочевыводящие пути и снижает комки шерсти.",
     "Курица (40%), печень, рис, таурин, юкка.",
     "Для кошек|Таурин|Hairball control"),
    (5, "cat-kitten", "Миска Kitten — корм для котят", "cat", "junior", "2 кг", 1490,
     "images/products/cat-kitten.jpg",
     "Нежные гранулы для котят от 1 до 12 месяцев.",
     "Обогащён DHA для развития мозга и зрения.",
     "Лосось (30%), курица, рис, молоко сухое, DHA.",
     "Для котят|DHA|Мелкие гранулы"),
    (6, "cat-pouch", "Миска Паучи — набор для кошек", "cat", "adult", "12×85 г", 990,
     "images/products/cat-pouch.jpg",
     "Влажный корм в соусе: курица, говядина, рыба.",
     "Ассорти из 12 паучей для ежедневного меню.",
     "Мясо и субпродукты (45%), бульон, злаки, минералы.",
     "Влажный корм|Микс вкусов|Удобные порции"),
    (7, "bird-mix", "Миска Aviary — смесь для птиц", "bird", "adult", "1 кг", 490,
     "images/products/bird-mix.jpg",
     "Зерновая смесь для волнистых попугаев и канареек.",
     "Просо, овёс, семена подсолнечника и минералы.",
     "Просо, канареечное семя, овёс, подсолнечник.",
     "Для птиц|Натуральные зёрна|Минералы"),
    (8, "rodent", "Миска Rodent — корм для грызунов", "rodent", "adult", "800 г", 420,
     "images/products/rodent.jpg",
     "Для хомяков, морских свинок и кроликов.",
     "Злаки, сушёные овощи и травы для стачивания зубов.",
     "Пшеница, кукуруза, горох, морковь, сено.",
     "Грызуны|Овощи и травы|Для зубов"),
    (9, "treats-dog", "Миска Treats — лакомства для собак", "dog", "adult", "200 г", 390,
     "images/products/treats-dog.jpg",
     "Мясные палочки для дрессировки и поощрения.",
     "Мягкие лакомства с говядиной без сахара.",
     "Говядина (70%), глицерин растительный, рис.",
     "Лакомства|Для дрессировки|Без сахара"),
    (10, "hypo", "Миска Hypo — гипоаллергенный корм", "dog", "adult", "8 кг", 4190,
     "images/products/hypo.jpg",
     "Для собак с чувствительным пищеварением.",
     "Монобелок на основе утки и картофеля.",
     "Утка (26%), картофель, жир утки, пребиотики.",
     "Гипоаллергенный|Монобелок|Утка"),
    (11, "ferret", "Миска Ferret — корм для хорьков", "other", "adult", "2 кг", 1590,
     "images/products/ferret.jpg",
     "Высокобелковый рацион для хорьков.",
     "Мясная формула с низким содержанием углеводов.",
     "Курица (50%), индейка, жир птицы, яйцо.",
     "Хорьки|Высокий белок|Низкие углеводы"),
    (12, "vitamins", "Миска Vita — витаминный комплекс", "dog", "adult", "60 табл.", 690,
     "images/products/vitamins.jpg",
     "Добавка для кожи, шерсти и иммунитета.",
     "Витамины группы B, биотин и цинк.",
     "Биотин, цинк, витамины B1–B12, рыбий жир.",
     "Витамины|Шерсть и кожа|Иммунитет"),
    (13, "cat-senior", "Миска Cat Senior — корм для пожилых кошек", "cat", "senior", "4 кг", 2590,
     "images/products/cat-senior.jpg",
     "Мягкая формула для кошек старше 7 лет.",
     "Контроль почек и комфортное пищеварение.",
     "Индейка (30%), рис, клетчатка, таурин.",
     "Кошки 7+|Почки|Легкое усвоение"),
    (14, "dog-wet", "Миска Dog Wet — влажный корм для собак", "dog", "adult", "6×400 г", 1190,
     "images/products/dog-wet.jpg",
     "Паштет с говядиной для ежедневного меню.",
     "Высокая влажность помогает питьевому балансу.",
     "Говядина (40%), бульон, рис, минералы.",
     "Влажный корм|Говядина|Порционные банки"),
    (15, "fish-flakes", "Миска Aqua — хлопья для аквариумных рыб", "other", "adult", "100 г", 320,
     "images/products/fish-flakes.jpg",
     "Основной корм для тропических рыбок.",
     "Хлопья хорошо держатся на поверхности воды.",
     "Рыбная мука, спирулина, витамины, злаки.",
     "Для рыб|Хлопья|Спирулина"),
]


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            token TEXT
        )
        """
    )
    user_cols = [r["name"] for r in cur.execute("PRAGMA table_info(users)").fetchall()]
    if "token" not in user_cols:
        cur.execute("ALTER TABLE users ADD COLUMN token TEXT")
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY,
            slug TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            animal TEXT NOT NULL,
            age TEXT NOT NULL,
            weight TEXT NOT NULL,
            price INTEGER NOT NULL,
            image TEXT NOT NULL,
            short TEXT NOT NULL,
            description TEXT NOT NULL,
            composition TEXT NOT NULL,
            features TEXT NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            status TEXT NOT NULL,
            customer_name TEXT NOT NULL,
            phone TEXT NOT NULL,
            delivery TEXT NOT NULL,
            comment TEXT NOT NULL DEFAULT '',
            total INTEGER NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS order_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            qty INTEGER NOT NULL,
            price INTEGER NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id),
            FOREIGN KEY (product_id) REFERENCES products(id)
        )
        """
    )

    count = cur.execute("SELECT COUNT(*) AS c FROM products").fetchone()["c"]
    if count == 0:
        cur.executemany(
            """
            INSERT INTO products (
                id, slug, name, animal, age, weight, price, image,
                short, description, composition, features
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            SEED_PRODUCTS,
        )
    elif count < 15:
        for row in SEED_PRODUCTS:
            exists = cur.execute("SELECT id FROM products WHERE id = ?", (row[0],)).fetchone()
            if not exists:
                cur.execute(
                    """
                    INSERT INTO products (
                        id, slug, name, animal, age, weight, price, image,
                        short, description, composition, features
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    row,
                )

    # тестовая учётная запись для проверки на хостинге (ПР 4)
    demo = cur.execute("SELECT id FROM users WHERE email = ?", (DEMO_EMAIL.lower(),)).fetchone()
    if not demo:
        cur.execute(
            "INSERT INTO users (name, email, password_hash, token) VALUES (?, ?, ?, NULL)",
            (DEMO_NAME, DEMO_EMAIL.lower(), pwd_context.hash(DEMO_PASSWORD)),
        )

    conn.commit()
    conn.close()


def row_to_product(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "slug": row["slug"],
        "name": row["name"],
        "animal": row["animal"],
        "age": row["age"],
        "weight": row["weight"],
        "price": row["price"],
        "image": row["image"],
        "short": row["short"],
        "description": row["description"],
        "composition": row["composition"],
        "features": row["features"].split("|"),
    }


def user_out(row: sqlite3.Row) -> UserOut:
    return UserOut(
        id=row["id"],
        name=row["name"],
        email=row["email"],
        token=row["token"] or "",
    )


def issue_token(conn: sqlite3.Connection, user_id: int) -> str:
    token = secrets.token_hex(24)
    conn.execute("UPDATE users SET token = ? WHERE id = ?", (token, user_id))
    conn.commit()
    return token


def get_current_user(authorization: Optional[str] = Header(default=None)) -> sqlite3.Row:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Нужна авторизация")
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Нужна авторизация")
    conn = get_conn()
    row = conn.execute("SELECT * FROM users WHERE token = ?", (token,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=401, detail="Сессия недействительна, войдите снова")
    return row


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "project": "Миска",
        "practice": 4,
        "version": APP_VERSION,
        "db": str(DB_PATH.name),
    }


@app.get("/api/products")
def list_products() -> list[dict]:
    conn = get_conn()
    rows = conn.execute("SELECT * FROM products ORDER BY id").fetchall()
    conn.close()
    return [row_to_product(row) for row in rows]


@app.get("/api/products/{product_id}")
def get_product(product_id: int) -> dict:
    conn = get_conn()
    row = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Товар не найден")
    return row_to_product(row)


@app.post("/api/register", response_model=UserOut)
def register(payload: RegisterIn) -> UserOut:
    email = payload.email.strip().lower()
    name = payload.name.strip()
    if "@" not in email:
        raise HTTPException(status_code=400, detail="Некорректный email")

    conn = get_conn()
    exists = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if exists:
        conn.close()
        raise HTTPException(status_code=400, detail="Такой email уже зарегистрирован")

    password_hash = pwd_context.hash(payload.password)
    cur = conn.execute(
        "INSERT INTO users (name, email, password_hash, token) VALUES (?, ?, ?, NULL)",
        (name, email, password_hash),
    )
    user_id = cur.lastrowid
    token = issue_token(conn, user_id)
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return user_out(row)


@app.post("/api/login", response_model=UserOut)
def login(payload: LoginIn) -> UserOut:
    email = payload.email.strip().lower()
    conn = get_conn()
    row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not row or not pwd_context.verify(payload.password, row["password_hash"]):
        conn.close()
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    token = issue_token(conn, row["id"])
    row = conn.execute("SELECT * FROM users WHERE id = ?", (row["id"],)).fetchone()
    conn.close()
    return user_out(row)


@app.post("/api/logout")
def logout(user: sqlite3.Row = Depends(get_current_user)) -> dict:
    conn = get_conn()
    conn.execute("UPDATE users SET token = NULL WHERE id = ?", (user["id"],))
    conn.commit()
    conn.close()
    return {"ok": True}


@app.get("/api/me")
def me(user: sqlite3.Row = Depends(get_current_user)) -> dict:
    return {"id": user["id"], "name": user["name"], "email": user["email"]}


@app.post("/api/orders")
def create_order(payload: OrderIn, user: sqlite3.Row = Depends(get_current_user)) -> dict:
    conn = get_conn()
    total = 0
    prepared_items = []
    for item in payload.items:
        product = conn.execute(
            "SELECT id, price, name FROM products WHERE id = ?",
            (item.product_id,),
        ).fetchone()
        if not product:
            conn.close()
            raise HTTPException(status_code=400, detail=f"Товар {item.product_id} не найден")
        line_total = product["price"] * item.qty
        total += line_total
        prepared_items.append((product["id"], item.qty, product["price"], product["name"]))

    created_at = datetime.now(timezone.utc).isoformat()
    cur = conn.execute(
        """
        INSERT INTO orders (
            user_id, created_at, status, customer_name, phone, delivery, comment, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user["id"],
            created_at,
            "new",
            payload.name.strip(),
            payload.phone.strip(),
            payload.delivery.strip(),
            payload.comment.strip(),
            total,
        ),
    )
    order_id = cur.lastrowid
    for product_id, qty, price, _name in prepared_items:
        conn.execute(
            """
            INSERT INTO order_items (order_id, product_id, qty, price)
            VALUES (?, ?, ?, ?)
            """,
            (order_id, product_id, qty, price),
        )
    conn.commit()
    conn.close()
    return {
        "id": order_id,
        "status": "new",
        "total": total,
        "created_at": created_at,
        "items_count": len(prepared_items),
    }


@app.get("/api/orders")
def list_my_orders(user: sqlite3.Row = Depends(get_current_user)) -> list[dict]:
    conn = get_conn()
    orders = conn.execute(
        """
        SELECT * FROM orders
        WHERE user_id = ?
        ORDER BY id DESC
        """,
        (user["id"],),
    ).fetchall()
    result = []
    for order in orders:
        items = conn.execute(
            """
            SELECT oi.qty, oi.price, p.name
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = ?
            """,
            (order["id"],),
        ).fetchall()
        result.append(
            {
                "id": order["id"],
                "created_at": order["created_at"],
                "status": order["status"],
                "customer_name": order["customer_name"],
                "phone": order["phone"],
                "delivery": order["delivery"],
                "comment": order["comment"],
                "total": order["total"],
                "items": [
                    {
                        "name": item["name"],
                        "qty": item["qty"],
                        "price": item["price"],
                        "sum": item["qty"] * item["price"],
                    }
                    for item in items
                ],
            }
        )
    conn.close()
    return result


if (ROOT / "index.html").exists():
    app.mount("/css", StaticFiles(directory=ROOT / "css"), name="css")
    app.mount("/js", StaticFiles(directory=ROOT / "js"), name="js")
    app.mount("/images", StaticFiles(directory=ROOT / "images"), name="images")
    app.mount("/docs", StaticFiles(directory=ROOT / "docs"), name="docs")


@app.get("/")
def index_page() -> FileResponse:
    return FileResponse(ROOT / "index.html")


@app.get("/{page_name}.html")
def html_page(page_name: str) -> FileResponse:
    path = ROOT / f"{page_name}.html"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Страница не найдена")
    return FileResponse(path)
