(function () {
  "use strict";

  var API_BASE = window.MISKA_API_BASE;
  if (API_BASE === undefined) {
    // file:// или Live Server → локальный API; иначе same-origin (Docker/хостинг)
    var localStatic =
      location.protocol === "file:" ||
      location.port === "5500" ||
      location.port === "5501" ||
      location.port === "8080";
    API_BASE = localStatic ? "http://127.0.0.1:8000" : "";
  }

  var CART_KEY = "miska_cart";
  var USER_KEY = "miska_user";
  var CURRENCY_KEY = "miska_currency";
  var CBR_URL = "https://www.cbr-xml-daily.ru/daily_json.js";

  var labels = window.MISKA_LABELS || { animal: {}, age: {} };
  var rates = { RUB: 1, USD: null, EUR: null, date: "" };
  var currentCurrency = localStorage.getItem(CURRENCY_KEY) || "RUB";

  function money(valueRub) {
    var currency = currentCurrency;
    if (currency === "USD" && rates.USD) {
      return new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2
      }).format(valueRub / rates.USD);
    }
    if (currency === "EUR" && rates.EUR) {
      return new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 2
      }).format(valueRub / rates.EUR);
    }
    return new Intl.NumberFormat("ru-RU").format(valueRub) + " ₽";
  }

  function getCart() {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function saveCart(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    updateCartCount();
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "null");
    } catch (e) {
      return null;
    }
  }

  function saveUser(user) {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
    updateUserChip();
    updateAuthPanels();
    updateAdminPanels();
  }

  function authHeaders() {
    var user = getUser();
    if (!user || !user.token) return { "Content-Type": "application/json" };
    return {
      "Content-Type": "application/json",
      Authorization: "Bearer " + user.token
    };
  }

  function updateCartCount() {
    var count = getCart().reduce(function (sum, item) {
      return sum + item.qty;
    }, 0);
    document.querySelectorAll("[data-cart-count]").forEach(function (el) {
      el.textContent = String(count);
    });
  }

  function updateUserChip() {
    var user = getUser();
    document.querySelectorAll("[data-user-chip]").forEach(function (el) {
      if (user) {
        el.hidden = false;
        el.textContent = user.name || user.email;
      } else {
        el.hidden = true;
        el.textContent = "";
      }
    });
    var logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) logoutBtn.hidden = !user;
    var isAdmin = !!(user && user.is_admin);
    document.querySelectorAll("[data-admin-db-link]").forEach(function (el) {
      el.hidden = !isAdmin;
    });
    document.querySelectorAll("[data-open-auth]").forEach(function (el) {
      if (el.classList.contains("nav-auth-btn")) el.hidden = !!user;
    });
    document.querySelectorAll("[data-cabinet-link]").forEach(function (el) {
      el.hidden = !user;
    });
    var hint = document.getElementById("checkout-auth-hint");
    if (hint) {
      hint.innerHTML = user
        ? "Вы вошли как <strong>" + (user.name || user.email) + "</strong>. Можно оформлять заказ."
        : 'Чтобы оформить заказ, сначала <button type="button" class="linkish" data-open-auth>войдите</button>.';
    }
  }

  function updateAuthPanels() {
    var user = getUser();
    var guest = document.getElementById("guest-panel");
    var panel = document.getElementById("user-panel");
    if (!guest && !panel) return;
    if (guest) guest.hidden = !!user;
    if (panel) panel.hidden = !user;
    if (user) {
      var nameEl = document.getElementById("profile-name");
      var emailEl = document.getElementById("profile-email");
      if (nameEl) nameEl.textContent = user.name || "—";
      if (emailEl) emailEl.textContent = user.email || "—";
      loadOrders();
    }
  }

  function formatOrderDate(value) {
    try {
      return new Date(value).toLocaleString("ru-RU");
    } catch (e) {
      return value;
    }
  }

  async function loadOrders() {
    var box = document.getElementById("orders-list");
    if (!box) return;
    var user = getUser();
    if (!user || !user.token) {
      box.innerHTML = '<p class="lead">Войдите, чтобы увидеть заказы.</p>';
      return;
    }
    box.innerHTML = '<p class="lead loading-line">Загрузка заказов</p>';
    try {
      var orders = await api("/api/orders", { headers: authHeaders() });
      if (!orders.length) {
        box.innerHTML =
          '<p class="empty-state">Заказов пока нет. Добавьте товары в <a href="cart.html">корзину</a>.</p>';
        return;
      }
      box.innerHTML = orders
        .map(function (order) {
          var items = order.items
            .map(function (item) {
              return "<li>" + item.name + " × " + item.qty + " — " + money(item.sum) + "</li>";
            })
            .join("");
          return (
            '<article class="order-card">' +
            "<h3>Заказ №" +
            order.id +
            " · " +
            formatOrderDate(order.created_at) +
            "</h3>" +
            "<p>Статус: <strong>" +
            order.status +
            "</strong> · " +
            order.delivery +
            "</p>" +
            "<ul>" +
            items +
            "</ul>" +
            "<p><strong>Итого: " +
            money(order.total) +
            "</strong></p>" +
            "</article>"
          );
        })
        .join("");
    } catch (err) {
      box.innerHTML =
        '<p class="form-status error">Не удалось загрузить заказы: ' +
        (err.message || "ошибка сети") +
        ". Проверьте подключение и попробуйте снова.</p>";
    }
  }

  function findProduct(id) {
    var list = window.MISKA_PRODUCTS || [];
    return list.find(function (p) {
      return String(p.id) === String(id) || p.slug === id;
    });
  }

  function clearFieldErrors(form) {
    form.querySelectorAll(".field-error").forEach(function (el) {
      el.textContent = "";
    });
    form.querySelectorAll(".is-invalid").forEach(function (el) {
      el.classList.remove("is-invalid");
    });
  }

  function showFieldError(input, message) {
    if (!input) return;
    input.classList.add("is-invalid");
    var errorId = input.getAttribute("aria-describedby");
    var errorEl = errorId ? document.getElementById(errorId) : null;
    if (errorEl) errorEl.textContent = message;
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function isValidLogin(value) {
    var login = String(value || "").trim().toLowerCase();
    return login === "admin" || isValidEmail(login);
  }

  function isValidPhone(value) {
    var digits = String(value).replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 12;
  }

  function productCard(product) {
    return (
      '<article class="product-card" data-id="' +
      product.id +
      '">' +
      '<a class="media" href="product.html?id=' +
      product.id +
      '">' +
      '<img src="' +
      product.image +
      '" alt="' +
      product.name +
      '" width="400" height="400" loading="lazy">' +
      "</a>" +
      '<div class="product-body">' +
      "<h3><a href=\"product.html?id=" +
      product.id +
      '">' +
      product.name +
      "</a></h3>" +
      '<div class="meta">' +
      '<span class="tag">' +
      (labels.animal[product.animal] || product.animal) +
      "</span>" +
      '<span class="tag">' +
      (labels.age[product.age] || product.age) +
      "</span>" +
      "</div>" +
      "<p>" +
      product.short +
      "</p>" +
      '<div class="price" data-price-rub="' +
      product.price +
      '">' +
      money(product.price) +
      "</div>" +
      '<div class="card-actions">' +
      '<button class="btn btn-primary" type="button" data-add="' +
      product.id +
      '">В корзину</button>' +
      '<a class="btn btn-secondary" href="product.html?id=' +
      product.id +
      '">Подробнее</a>' +
      "</div>" +
      "</div>" +
      "</article>"
    );
  }

  function refreshPrices() {
    document.querySelectorAll("[data-price-rub]").forEach(function (el) {
      el.textContent = money(Number(el.getAttribute("data-price-rub")));
    });
    document.querySelectorAll("[data-currency]").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-currency") === currentCurrency);
    });
    if (document.getElementById("cart-root")) renderCart();
    if (document.getElementById("product-page") && document.querySelector(".product-info")) {
      // цена на карточке товара уже в data-price-rub через rerender при смене валюты
      var priceEl = document.querySelector(".product-info .price");
      if (priceEl && priceEl.getAttribute("data-price-rub")) {
        priceEl.textContent = money(Number(priceEl.getAttribute("data-price-rub")));
      }
    }
  }

  function addToCart(id, qty) {
    qty = qty || 1;
    var product = findProduct(id);
    if (!product) return;
    var cart = getCart();
    var existing = cart.find(function (item) {
      return item.id === product.id;
    });
    if (existing) existing.qty += qty;
    else {
      cart.push({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
        qty: qty
      });
    }
    saveCart(cart);
  }

  function setupNav() {
    var toggle = document.querySelector(".nav-toggle");
    var nav = document.getElementById("site-nav");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  function setupAddButtons(root) {
    (root || document).addEventListener("click", function (event) {
      var btn = event.target.closest("[data-add]");
      if (!btn) return;
      addToCart(btn.getAttribute("data-add"), 1);
      btn.textContent = "Добавлено";
      setTimeout(function () {
        btn.textContent = "В корзину";
      }, 900);
    });
  }

  function setupCurrencySwitch() {
    document.querySelectorAll("#currency-switch").forEach(function (box) {
      box.hidden = false;
      box.addEventListener("click", function (event) {
        var btn = event.target.closest("[data-currency]");
        if (!btn) return;
        var next = btn.getAttribute("data-currency");
        if ((next === "USD" || next === "EUR") && !rates[next]) {
          var note = document.getElementById("rates-note") || document.getElementById("currency-rates");
          if (note) {
            note.textContent = "Сначала дождитесь загрузки курсов ЦБ или нажмите «Обновить курсы».";
          }
          return;
        }
        currentCurrency = next;
        localStorage.setItem(CURRENCY_KEY, currentCurrency);
        refreshPrices();
      });
    });
  }

  function setupFaq() {
    var list = document.getElementById("faq-list");
    if (!list) return;
    list.addEventListener("click", function (event) {
      var trigger = event.target.closest(".faq-trigger");
      if (!trigger) return;
      var item = trigger.closest(".faq-item");
      var panel = item.querySelector(".faq-panel");
      var open = trigger.getAttribute("aria-expanded") === "true";
      list.querySelectorAll(".faq-item").forEach(function (other) {
        other.querySelector(".faq-trigger").setAttribute("aria-expanded", "false");
        other.querySelector(".faq-panel").hidden = true;
      });
      if (!open) {
        trigger.setAttribute("aria-expanded", "true");
        panel.hidden = false;
      }
    });
  }

  function renderHome() {
    var box = document.getElementById("home-products");
    if (!box) return;
    var items = (window.MISKA_PRODUCTS || []).slice(0, 6);
    box.innerHTML = items.map(productCard).join("");
  }

  function renderCatalog() {
    var grid = document.getElementById("catalog-grid");
    var form = document.getElementById("catalog-filters");
    if (!grid || !form) return;

    function apply() {
      var animal = form.animal.value;
      var age = form.age.value;
      var maxPrice = form.price.value ? Number(form.price.value) : null;
      var sort = form.sort.value;
      var list = (window.MISKA_PRODUCTS || []).filter(function (p) {
        if (animal && p.animal !== animal) return false;
        if (age && p.age !== age) return false;
        if (maxPrice !== null && p.price > maxPrice) return false;
        return true;
      });

      list.sort(function (a, b) {
        if (sort === "price-asc") return a.price - b.price;
        if (sort === "price-desc") return b.price - a.price;
        return a.name.localeCompare(b.name, "ru");
      });

      grid.innerHTML = list.length
        ? list.map(productCard).join("")
        : '<p class="empty-state">Ничего не найдено. Измените фильтры.</p>';
      var counter = document.getElementById("catalog-count");
      if (counter) counter.textContent = "Найдено: " + list.length;
    }

    form.addEventListener("input", apply);
    form.addEventListener("change", apply);
    var reset = document.getElementById("reset-filters");
    if (reset) {
      reset.addEventListener("click", function () {
        form.reset();
        apply();
      });
    }
    apply();
  }

  function renderProduct() {
    var root = document.getElementById("product-page");
    if (!root) return;
    var params = new URLSearchParams(window.location.search);
    var product = findProduct(params.get("id") || "1") || (window.MISKA_PRODUCTS || [])[0];
    if (!product) {
      root.innerHTML = '<p class="empty-state">Товар не найден.</p>';
      return;
    }
    document.title = product.name + " — Миска";
    root.innerHTML =
      '<article class="product-layout">' +
      '<div class="product-gallery">' +
      '<img src="' +
      product.image +
      '" alt="' +
      product.name +
      '">' +
      "</div>" +
      '<div class="product-info">' +
      "<h1>" +
      product.name +
      "</h1>" +
      '<div class="meta">' +
      '<span class="tag">' +
      (labels.animal[product.animal] || product.animal) +
      "</span>" +
      '<span class="tag">' +
      (labels.age[product.age] || product.age) +
      "</span>" +
      '<span class="tag">' +
      product.weight +
      "</span>" +
      "</div>" +
      '<p class="price" data-price-rub="' +
      product.price +
      '">' +
      money(product.price) +
      "</p>" +
      "<p>" +
      product.description +
      "</p>" +
      '<details class="accordion">' +
      "<summary>Состав и характеристики</summary>" +
      "<table class=\"specs\"><tbody>" +
      "<tr><th>Состав</th><td>" +
      product.composition +
      "</td></tr>" +
      "<tr><th>Фасовка</th><td>" +
      product.weight +
      "</td></tr>" +
      "<tr><th>Особенности</th><td>" +
      product.features.join(", ") +
      "</td></tr>" +
      "</tbody></table>" +
      "</details>" +
      '<div class="qty-row">' +
      '<label for="product-qty">Количество</label>' +
      '<input id="product-qty" type="number" min="1" value="1">' +
      '<button class="btn btn-primary" type="button" id="add-product-btn">Добавить в корзину</button>' +
      '<a class="btn btn-secondary" href="catalog.html">К каталогу</a>' +
      "</div>" +
      "</div>" +
      "</article>";

    document.getElementById("add-product-btn").addEventListener("click", function () {
      var qty = Number(document.getElementById("product-qty").value) || 1;
      addToCart(product.id, qty);
      this.textContent = "В корзине";
    });
  }

  function renderCart() {
    var root = document.getElementById("cart-root");
    if (!root) return;
    var cart = getCart();
    var checkout = document.getElementById("cart-checkout-block");

    if (!cart.length) {
      root.innerHTML =
        '<div class="empty-state">Корзина пока пуста. Загляните в <a href="catalog.html">каталог</a>.</div>';
      if (checkout) checkout.hidden = true;
      return;
    }

    if (checkout) checkout.hidden = false;
    root.innerHTML =
      '<div class="cart-table-wrap"><table class="cart-table"><thead><tr>' +
      "<th>Товар</th><th>Цена</th><th>Кол-во</th><th>Сумма</th><th></th>" +
      "</tr></thead><tbody>" +
      cart
        .map(function (item) {
          return (
            "<tr data-cart-id=\"" +
            item.id +
            '">' +
            '<td><div class="cart-product">' +
            '<img src="' +
            item.image +
            '" alt="' +
            item.name +
            '">' +
            "<div><strong>" +
            item.name +
            '</strong><br><a href="product.html?id=' +
            item.id +
            '">Открыть</a></div></div></td>' +
            '<td data-price-rub="' +
            item.price +
            '">' +
            money(item.price) +
            "</td>" +
            '<td><input type="number" min="1" value="' +
            item.qty +
            '" data-qty="' +
            item.id +
            '"></td>' +
            '<td data-price-rub="' +
            item.price * item.qty +
            '">' +
            money(item.price * item.qty) +
            "</td>" +
            '<td><button class="btn btn-ghost" type="button" data-remove="' +
            item.id +
            '">Удалить</button></td>' +
            "</tr>"
          );
        })
        .join("") +
      "</tbody></table></div>";

    var total = cart.reduce(function (sum, item) {
      return sum + item.price * item.qty;
    }, 0);
    var count = cart.reduce(function (sum, item) {
      return sum + item.qty;
    }, 0);
    var summaryCount = document.getElementById("summary-count");
    var summaryTotal = document.getElementById("summary-total");
    if (summaryCount) summaryCount.textContent = String(count);
    if (summaryTotal) {
      summaryTotal.setAttribute("data-price-rub", String(total));
      summaryTotal.textContent = money(total);
    }

    root.querySelectorAll("[data-qty]").forEach(function (input) {
      input.addEventListener("change", function () {
        var id = Number(input.getAttribute("data-qty"));
        var next = getCart();
        var row = next.find(function (item) {
          return item.id === id;
        });
        if (!row) return;
        row.qty = Math.max(1, Number(input.value) || 1);
        saveCart(next);
        renderCart();
      });
    });

    root.querySelectorAll("[data-remove]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = Number(btn.getAttribute("data-remove"));
        saveCart(
          getCart().filter(function (item) {
            return item.id !== id;
          })
        );
        renderCart();
      });
    });
  }

  function setStatus(el, text, ok) {
    if (!el) return;
    el.textContent = text;
    el.className = "form-status " + (ok ? "ok" : "error");
  }

  async function api(path, options) {
    options = options || {};
    var headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    var response = await fetch(
      API_BASE + path,
      Object.assign({}, options, { headers: headers })
    );
    var data = null;
    try {
      data = await response.json();
    } catch (e) {
      data = null;
    }
    if (!response.ok) {
      var message = (data && data.detail) || "Не удалось выполнить запрос";
      throw new Error(typeof message === "string" ? message : JSON.stringify(message));
    }
    return data;
  }

  function setupForms() {
    var feedback = document.getElementById("feedback-form");
    if (feedback) {
      feedback.addEventListener("submit", function (event) {
        event.preventDefault();
        clearFieldErrors(feedback);
        var status = document.getElementById("feedback-status");
        var name = feedback.name.value.trim();
        var email = feedback.email.value.trim();
        var message = feedback.message.value.trim();
        var ok = true;

        if (name.length < 2) {
          showFieldError(feedback.name, "Введите имя (минимум 2 символа)");
          ok = false;
        }
        if (!isValidEmail(email)) {
          showFieldError(feedback.email, "Введите корректный email, например name@mail.ru");
          ok = false;
        }
        if (message.length < 10) {
          showFieldError(feedback.message, "Сообщение слишком короткое (минимум 10 символов)");
          ok = false;
        }

        if (!ok) {
          setStatus(status, "Исправьте ошибки в форме", false);
          return;
        }

        setStatus(
          status,
          "Спасибо, " + name + "! Мы получили сообщение и ответим на почту в течение дня.",
          true
        );
        feedback.reset();
      });
    }

    var checkout = document.getElementById("checkout-form");
    if (checkout) {
      checkout.addEventListener("submit", async function (event) {
        event.preventDefault();
        clearFieldErrors(checkout);
        var status = document.getElementById("checkout-status");
        var name = checkout.name.value.trim();
        var phone = checkout.phone.value.trim();
        var delivery = checkout.delivery.value;
        var comment = checkout.comment.value.trim();
        var ok = true;
        var cart = getCart();

        if (!cart.length) {
          setStatus(status, "Корзина пуста — добавьте товар из каталога", false);
          return;
        }
        if (name.length < 2) {
          showFieldError(checkout.name, "Укажите имя получателя");
          ok = false;
        }
        if (!isValidPhone(phone)) {
          showFieldError(checkout.phone, "Укажите телефон: не меньше 10 цифр");
          ok = false;
        }
        if (!delivery) {
          showFieldError(checkout.delivery, "Выберите способ получения");
          ok = false;
        }
        if (!ok) {
          setStatus(status, "Исправьте ошибки в форме", false);
          return;
        }

        var user = getUser();
        if (!user || !user.token) {
          setStatus(status, "Сначала войдите в кабинет, чтобы оформить заказ", false);
          return;
        }

        try {
          var order = await api("/api/orders", {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
              name: name,
              phone: phone,
              delivery: delivery,
              comment: comment,
              items: cart.map(function (item) {
                return { product_id: item.id, qty: item.qty };
              })
            })
          });
          setStatus(
            status,
            "Заказ №" + order.id + " принят. Сумма: " + money(order.total) + ". Статус можно смотреть в кабинете.",
            true
          );
          saveCart([]);
          checkout.reset();
          renderCart();
        } catch (err) {
          setStatus(status, err.message || "Не удалось сохранить заказ", false);
        }
      });
    }

    var logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async function () {
        try {
          await api("/api/logout", { method: "POST", headers: authHeaders() });
        } catch (e) {
          // даже если сервер недоступен, выходим локально
        }
        saveUser(null);
      });
    }

    var reloadOrders = document.getElementById("reload-orders");
    if (reloadOrders) reloadOrders.addEventListener("click", loadOrders);

    setupAuthModal();
    setupAdminPanel();
  }

  function ensureAuthModal() {
    if (document.getElementById("auth-modal")) return;
    var modal = document.createElement("div");
    modal.id = "auth-modal";
    modal.className = "auth-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "auth-modal-title");
    modal.innerHTML =
      '<div class="auth-modal-dialog">' +
      '<div class="auth-modal-head">' +
      '<div><h2 id="auth-modal-title">Вход и регистрация</h2>' +
      '<p class="lead">Войдите в аккаунт или создайте новый</p></div>' +
      '<button class="auth-modal-close" type="button" data-close-auth aria-label="Закрыть">×</button>' +
      "</div>" +
      '<div class="auth-modal-tabs">' +
      '<button class="btn btn-secondary is-active" type="button" data-auth-tab="login">Вход</button>' +
      '<button class="btn btn-secondary" type="button" data-auth-tab="register">Регистрация</button>' +
      "</div>" +
      '<form class="auth-modal-pane" id="modal-login-form" data-auth-pane="login" novalidate>' +
      '<div class="field"><label for="modal-login-email">Email или логин</label>' +
      '<input id="modal-login-email" name="email" type="text" autocomplete="username" aria-describedby="modal-login-email-error">' +
      '<p class="field-error" id="modal-login-email-error" role="alert"></p></div>' +
      '<div class="field"><label for="modal-login-password">Пароль</label>' +
      '<input id="modal-login-password" name="password" type="password" autocomplete="current-password" aria-describedby="modal-login-password-error">' +
      '<p class="field-error" id="modal-login-password-error" role="alert"></p></div>' +
      '<button class="btn btn-primary" type="submit">Войти</button>' +
      '<p class="form-status" id="modal-login-status" role="status"></p>' +
      "</form>" +
      '<form class="auth-modal-pane" id="modal-register-form" data-auth-pane="register" hidden novalidate>' +
      '<div class="field"><label for="modal-reg-name">Имя</label>' +
      '<input id="modal-reg-name" name="name" type="text" autocomplete="name" aria-describedby="modal-reg-name-error">' +
      '<p class="field-error" id="modal-reg-name-error" role="alert"></p></div>' +
      '<div class="field"><label for="modal-reg-email">Email</label>' +
      '<input id="modal-reg-email" name="email" type="email" autocomplete="username" aria-describedby="modal-reg-email-error">' +
      '<p class="field-error" id="modal-reg-email-error" role="alert"></p></div>' +
      '<div class="field"><label for="modal-reg-password">Пароль</label>' +
      '<input id="modal-reg-password" name="password" type="password" autocomplete="new-password" aria-describedby="modal-reg-password-error">' +
      '<p class="field-error" id="modal-reg-password-error" role="alert"></p></div>' +
      '<button class="btn btn-accent" type="submit">Создать аккаунт</button>' +
      '<p class="form-status" id="modal-register-status" role="status"></p>' +
      "</form>" +
      "</div>";
    document.body.appendChild(modal);
  }

  function openAuthModal(tab) {
    ensureAuthModal();
    var modal = document.getElementById("auth-modal");
    modal.classList.add("is-open");
    document.body.classList.add("auth-modal-open");
    switchAuthTab(tab || "login");
  }

  function closeAuthModal() {
    var modal = document.getElementById("auth-modal");
    if (!modal) return;
    modal.classList.remove("is-open");
    document.body.classList.remove("auth-modal-open");
  }

  function switchAuthTab(tab) {
    var modal = document.getElementById("auth-modal");
    if (!modal) return;
    modal.querySelectorAll("[data-auth-tab]").forEach(function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-auth-tab") === tab);
    });
    modal.querySelectorAll("[data-auth-pane]").forEach(function (pane) {
      pane.hidden = pane.getAttribute("data-auth-pane") !== tab;
    });
  }

  function setupAuthModal() {
    ensureAuthModal();
    var modal = document.getElementById("auth-modal");

    document.addEventListener("click", function (event) {
      var openBtn = event.target.closest("[data-open-auth]");
      if (openBtn) {
        event.preventDefault();
        openAuthModal(openBtn.getAttribute("data-auth-tab") || "login");
        return;
      }
      if (event.target.closest("[data-close-auth]")) {
        closeAuthModal();
        return;
      }
      if (event.target === modal) closeAuthModal();
      var tabBtn = event.target.closest("[data-auth-tab]");
      if (tabBtn && modal.contains(tabBtn)) {
        switchAuthTab(tabBtn.getAttribute("data-auth-tab"));
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeAuthModal();
    });

    var login = document.getElementById("modal-login-form");
    if (login && !login.dataset.bound) {
      login.dataset.bound = "1";
      login.addEventListener("submit", async function (event) {
        event.preventDefault();
        clearFieldErrors(login);
        var status = document.getElementById("modal-login-status");
        var email = login.email.value.trim();
        var password = login.password.value;
        var ok = true;
        if (!isValidLogin(email)) {
          showFieldError(login.email, "Введите email или логин");
          ok = false;
        }
        if (password.length < 4) {
          showFieldError(login.password, "Пароль не короче 4 символов");
          ok = false;
        }
        if (!ok) {
          setStatus(status, "Исправьте ошибки в форме", false);
          return;
        }
        try {
          var user = await api("/api/login", {
            method: "POST",
            body: JSON.stringify({ email: email, password: password })
          });
          saveUser(user);
          setStatus(status, "Вы вошли как " + user.name, true);
          setTimeout(function () {
            closeAuthModal();
            if (user.is_admin && !/admin\.html$/i.test(location.pathname)) {
              // пункт БД уже в меню; на странице БД обновится панель
            }
          }, 400);
        } catch (err) {
          setStatus(status, err.message || "Неверный email или пароль", false);
        }
      });
    }

    var register = document.getElementById("modal-register-form");
    if (register && !register.dataset.bound) {
      register.dataset.bound = "1";
      register.addEventListener("submit", async function (event) {
        event.preventDefault();
        clearFieldErrors(register);
        var status = document.getElementById("modal-register-status");
        var name = register.name.value.trim();
        var email = register.email.value.trim();
        var password = register.password.value;
        var ok = true;
        if (name.length < 2) {
          showFieldError(register.name, "Введите имя");
          ok = false;
        }
        if (!isValidEmail(email)) {
          showFieldError(register.email, "Введите корректный email");
          ok = false;
        }
        if (password.length < 4) {
          showFieldError(register.password, "Пароль не короче 4 символов");
          ok = false;
        }
        if (!ok) {
          setStatus(status, "Исправьте ошибки в форме", false);
          return;
        }
        try {
          var user = await api("/api/register", {
            method: "POST",
            body: JSON.stringify({ name: name, email: email, password: password })
          });
          saveUser(user);
          setStatus(status, "Аккаунт создан. Добро пожаловать, " + user.name + "!", true);
          register.reset();
          setTimeout(closeAuthModal, 500);
        } catch (err) {
          setStatus(status, err.message || "Не удалось зарегистрироваться", false);
        }
      });
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderDbTable(tableName, tableData) {
    var root = document.getElementById("db-table-root");
    if (!root) return;
    if (!tableData || !tableData.columns.length) {
      root.innerHTML = '<p class="empty-state">Таблица пуста</p>';
      return;
    }
    var head = tableData.columns
      .map(function (col) {
        return "<th>" + escapeHtml(col) + "</th>";
      })
      .join("");
    var body = tableData.rows
      .map(function (row) {
        return (
          "<tr>" +
          tableData.columns
            .map(function (col) {
              var cell = row[col];
              if (cell === null || cell === undefined) cell = "";
              return "<td>" + escapeHtml(cell) + "</td>";
            })
            .join("") +
          "</tr>"
        );
      })
      .join("");
    root.innerHTML =
      '<div class="db-table-wrap"><table class="db-table"><caption>' +
      escapeHtml(tableName) +
      " · " +
      tableData.count +
      " записей</caption><thead><tr>" +
      head +
      "</tr></thead><tbody>" +
      body +
      "</tbody></table></div>";
  }

  async function loadAdminDb(preferredTable) {
    var meta = document.getElementById("admin-db-meta");
    var tabs = document.getElementById("db-tabs");
    var root = document.getElementById("db-table-root");
    if (!root) return;
    root.innerHTML = '<p class="lead loading-line">Загрузка базы данных</p>';
    try {
      var data = await api("/api/admin/db", { headers: authHeaders() });
      var names = Object.keys(data.tables || {});
      if (meta) {
        meta.textContent =
          "Файл: " +
          data.db_file +
          " · админ: " +
          data.admin.email +
          " · таблиц: " +
          names.length;
      }
      if (tabs) {
        tabs.innerHTML = names
          .map(function (name, index) {
            var active =
              name === preferredTable || (!preferredTable && index === 0);
            return (
              '<button class="btn btn-secondary db-tab' +
              (active ? " is-active" : "") +
              '" type="button" data-db-table="' +
              escapeHtml(name) +
              '">' +
              escapeHtml(name) +
              " (" +
              data.tables[name].count +
              ")</button>"
            );
          })
          .join("");
        tabs.onclick = function (event) {
          var btn = event.target.closest("[data-db-table]");
          if (!btn) return;
          tabs.querySelectorAll(".db-tab").forEach(function (el) {
            el.classList.remove("is-active");
          });
          btn.classList.add("is-active");
          renderDbTable(btn.getAttribute("data-db-table"), data.tables[btn.getAttribute("data-db-table")]);
        };
      }
      var first = preferredTable && data.tables[preferredTable] ? preferredTable : names[0];
      if (first) renderDbTable(first, data.tables[first]);
      else root.innerHTML = '<p class="empty-state">В базе пока нет таблиц</p>';
    } catch (err) {
      if (meta) meta.textContent = "Не удалось загрузить БД";
      root.innerHTML =
        '<p class="form-status error">' +
        escapeHtml(err.message || "Ошибка доступа") +
        "</p>";
    }
  }

  function updateAdminPanels() {
    var user = getUser();
    var isAdmin = !!(user && user.is_admin);
    var loginPanel = document.getElementById("admin-login-panel");
    var dbPanel = document.getElementById("admin-db-panel");
    var logoutBtn = document.getElementById("admin-logout-btn");
    if (!loginPanel && !dbPanel) return;
    if (loginPanel) loginPanel.hidden = isAdmin;
    if (dbPanel) dbPanel.hidden = !isAdmin;
    if (logoutBtn) logoutBtn.hidden = !isAdmin;
    if (isAdmin) loadAdminDb();
  }

  function setupAdminPanel() {
    var logoutBtn = document.getElementById("admin-logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async function () {
        try {
          await api("/api/logout", { method: "POST", headers: authHeaders() });
        } catch (e) {
          // локальный выход
        }
        saveUser(null);
        updateAdminPanels();
      });
    }

    var reloadDb = document.getElementById("reload-db-btn");
    if (reloadDb) {
      reloadDb.addEventListener("click", function () {
        var active = document.querySelector(".db-tab.is-active");
        loadAdminDb(active ? active.getAttribute("data-db-table") : null);
      });
    }

    updateAdminPanels();
  }

  async function loadCurrencyRates() {
    var box = document.getElementById("currency-rates");
    var note = document.getElementById("rates-note");
    if (box) box.innerHTML = '<p class="lead loading-line">Загрузка курсов ЦБ РФ…</p>';
    if (note) note.textContent = "Курсы ЦБ подгружаются…";

    try {
      var response = await fetch(CBR_URL);
      if (!response.ok) throw new Error("HTTP " + response.status);
      var data = await response.json();
      rates.USD = data.Valute.USD.Value;
      rates.EUR = data.Valute.EUR.Value;
      rates.date = data.Date;

      var html =
        "<ul class=\"rates-list\">" +
        "<li><strong>Дата курса:</strong> " +
        new Date(rates.date).toLocaleDateString("ru-RU") +
        "</li>" +
        "<li><strong>USD:</strong> " +
        rates.USD.toFixed(2) +
        " ₽</li>" +
        "<li><strong>EUR:</strong> " +
        rates.EUR.toFixed(2) +
        " ₽</li>" +
        "</ul>" +
        "<p class=\"lead\">Курсы обновляются автоматически по данным Центрального банка РФ</p>";

      if (box) box.innerHTML = html;
      if (note) {
        note.textContent =
          "Курсы на " +
          new Date(rates.date).toLocaleDateString("ru-RU") +
          ": USD " +
          rates.USD.toFixed(2) +
          " ₽, EUR " +
          rates.EUR.toFixed(2) +
          " ₽";
      }
      refreshPrices();
    } catch (e) {
      var errorText =
        "Не удалось загрузить курсы ЦБ. Проверьте интернет (в DevTools можно отключить сеть). Цены остаются в рублях, сайт работает.";
      if (box) box.innerHTML = '<p class="form-status error">' + errorText + "</p>";
      if (note) note.textContent = errorText;
      if (currentCurrency !== "RUB") {
        currentCurrency = "RUB";
        localStorage.setItem(CURRENCY_KEY, "RUB");
        refreshPrices();
      }
    }
  }

  async function loadProductsFromServer() {
    var noteTargets = [];
    var catalogCount = document.getElementById("catalog-count");
    if (catalogCount) noteTargets.push(catalogCount);
    try {
      var data = await api("/api/products");
      if (Array.isArray(data) && data.length) {
        window.MISKA_PRODUCTS = data;
        window.MISKA_FROM_API = true;
        return true;
      }
    } catch (e) {
      window.MISKA_FROM_API = false;
      if (catalogCount) {
        catalogCount.textContent =
          "Каталог временно из кэша. Обновите страницу чуть позже.";
      }
    }
    return false;
  }

  document.addEventListener("DOMContentLoaded", async function () {
    setupNav();
    setupAddButtons(document);
    setupCurrencySwitch();
    setupFaq();
    updateCartCount();
    updateUserChip();
    updateAuthPanels();
    await loadProductsFromServer();
    renderHome();
    renderCatalog();
    renderProduct();
    renderCart();
    setupForms();
    loadCurrencyRates();

    var reloadRates = document.getElementById("reload-rates");
    if (reloadRates) reloadRates.addEventListener("click", loadCurrencyRates);
  });
})();
