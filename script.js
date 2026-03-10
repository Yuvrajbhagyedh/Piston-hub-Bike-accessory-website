// Simple client-side cart and auth handling using localStorage

const CART_KEY = 'pistonhub_cart_v1';
const USERS_KEY = 'pistonhub_users_v1';
const CURRENT_USER_KEY = 'pistonhub_current_user_v1';
const ORDERS_KEY = 'pistonhub_orders_v1';

const ADMIN_DEFAULT = {
  name: 'Admin',
  email: 'admin@pistonhub.com',
  password: 'admin123',
  isAdmin: true,
};

// ---------- CART ----------

function getCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateNavCartCount();
}

function getCartItemCount() {
  const cart = getCart();
  return cart.reduce((sum, item) => sum + (item.quantity || 0), 0);
}

function addToCart(product, quantity = 1) {
  if (!product || !product.id) return;
  const cart = getCart();
  const existing = cart.find((item) => item.id === product.id);
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.push({
      id: product.id,
      name: product.name || 'Item',
      price: product.price || 0,
      image: product.image || '',
      quantity: quantity,
    });
  }
  saveCart(cart);
}

function updateCartQuantity(id, quantity) {
  const cart = getCart();
  const item = cart.find((i) => i.id === id);
  if (!item) return;
  item.quantity = Math.max(1, quantity);
  saveCart(cart);
}

function removeFromCart(id) {
  let cart = getCart();
  cart = cart.filter((i) => i.id !== id);
  saveCart(cart);
}

function clearCart() {
  saveCart([]);
}

function updateNavCartCount() {
  const countEl = document.getElementById('navCartCount');
  if (!countEl) return;
  countEl.textContent = getCartItemCount();
}

// Attach "Add to Cart" behavior for product cards on pages that use .product
function wireProductAddToCart() {
  const buttons = document.querySelectorAll('.add-to-cart');
  if (!buttons.length) return;

  buttons.forEach((btn) => {
    // Avoid double-binding
    if (btn.dataset.cartBound === 'true') return;
    btn.dataset.cartBound = 'true';

    btn.addEventListener('click', () => {
      const productEl = btn.closest('.product');
      if (!productEl) return;

      const titleEl = productEl.querySelector('.product-title');
      const priceEl = productEl.querySelector('.product-price');
      const imgEl = productEl.querySelector('.product-image');
      const qtyInput = productEl.querySelector('.quantity-input');

      const name = titleEl ? titleEl.textContent.trim() : 'Item';
      const rawPrice = priceEl ? priceEl.textContent : '0';
      const price = parseFloat(rawPrice.replace(/[^0-9.]/g, '')) || 0;
      const quantity = qtyInput ? Math.max(1, parseInt(qtyInput.value, 10) || 1) : 1;
      const id = name.toLowerCase().replace(/\s+/g, '-');
      const image = imgEl ? imgEl.getAttribute('src') || '' : '';

      addToCart({ id, name, price, image }, quantity);
      // Fallback feedback if page doesn't have its own fancy alert
      if (!document.getElementById('customAlert')) {
        window.alert(`${quantity} × ${name} added to cart`);
      }
    });
  });
}

// ---------- AUTH (demo only, not secure) ----------

function getUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function seedAdminUser() {
  const users = getUsers();
  const existing = users.find((u) => u.email === ADMIN_DEFAULT.email);
  if (existing) return;
  users.push({ ...ADMIN_DEFAULT });
  saveUsers(users);
}

function getCurrentUser() {
  try {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function setCurrentUser(user) {
  if (user) {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(CURRENT_USER_KEY);
  }
}

function signupUser({ name, email, password }) {
  const users = getUsers();
  if (users.find((u) => u.email === email)) {
    return { ok: false, message: 'Email already registered' };
  }
  const user = { name: name || '', email, password, isAdmin: false };
  users.push(user);
  saveUsers(users);
  setCurrentUser({ name: user.name, email: user.email });
  return { ok: true };
}

function loginUser({ email, password }) {
  const users = getUsers();
  const match = users.find((u) => u.email === email && u.password === password);
  if (!match) {
    return { ok: false, message: 'Invalid email or password' };
  }
  setCurrentUser({ name: match.name, email: match.email, isAdmin: !!match.isAdmin });
  return { ok: true };
}

function logoutUser() {
  setCurrentUser(null);
}

function updateAuthUI() {
  const user = getCurrentUser();
  const nameEl = document.getElementById('navUserName');
  const linkEl = document.getElementById('navUserLink');
  if (!nameEl || !linkEl) return;

  if (!user) {
    nameEl.textContent = 'Login';
    linkEl.setAttribute('href', 'login.html');
    return;
  }

  const displayName = (user.name && user.name.trim()) ? user.name.trim() : user.email.split('@')[0];
  nameEl.textContent = displayName;
  if (user.isAdmin) {
    linkEl.setAttribute('href', 'admin.html');
  } else {
    linkEl.setAttribute('href', 'account.html');
  }
}

function isAdmin() {
  const user = getCurrentUser();
  return !!(user && user.isAdmin);
}

// ---------- ORDERS (for admin dashboard) ----------

function getOrders() {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveOrders(orders) {
  localStorage.setItem(ORDERS_KEY, JSON.stringify(orders));
}

function createOrder({ items, total, shipping }) {
  const user = getCurrentUser();
  const order = {
    id: 'ORD-' + Date.now(),
    createdAt: new Date().toISOString(),
    user: user ? { name: user.name || '', email: user.email || '' } : null,
    items: items || [],
    total: total || 0,
    shipping: shipping || null,
  };
  const orders = getOrders();
  orders.unshift(order);
  saveOrders(orders);
  return order;
}

// ---------- Page wiring ----------

document.addEventListener('DOMContentLoaded', () => {
  seedAdminUser();
  updateNavCartCount();
  updateAuthUI();
  wireProductAddToCart();
});

