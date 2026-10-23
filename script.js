// Client-side cart (localStorage) + auth via the backend API.
// Passwords and roles are handled server-side only.

const CART_KEY = 'pistonhub_cart_v1';

// ---------- CATALOG ----------
// Single source of truth for product data (keyed by product page slug).

const CATALOG = {
  'apex-venom-gloves':        { name: 'Apex Venom Gloves',        brand: 'Apex',  category: 'Gloves',  price: 1299 },
  'apex-marvel-gloves':       { name: 'Apex Marvel Gloves',       brand: 'Apex',  category: 'Gloves',  price: 1499 },
  'axor-gloves':              { name: 'Axor Gloves',              brand: 'Axor',  category: 'Gloves',  price: 1799 },
  'apex-boots':               { name: 'Apex Boots',               brand: 'Apex',  category: 'Boots',   price: 3499 },
  'apex-marvel-boots':        { name: 'Apex Marvel Boots',        brand: 'Apex',  category: 'Boots',   price: 4299 },
  'apex-marvel-venom-helmet': { name: 'Apex Marvel Venom Helmet', brand: 'Apex',  category: 'Helmets', price: 3299 },
  'apex-hunter-boots':        { name: 'Apex Hunter Boots',        brand: 'Apex',  category: 'Boots',   price: 4999 },
  'apex-solid-boots':         { name: 'Apex Solid Boots',         brand: 'Apex',  category: 'Boots',   price: 3999 },
  'apex-dynamo-helmet':       { name: 'Apex Dynamo Helmet',       brand: 'Apex',  category: 'Helmets', price: 2799 },
  'retro-jet-west-helmet':    { name: 'Retro Jet West Helmet',    brand: 'Retro', category: 'Helmets', price: 2499 },
  'vega-max':                 { name: 'Vega Max',                 brand: 'Vega',  category: 'Helmets', price: 1899 },
  'apex-solid-helmet':        { name: 'Apex Solid Helmet',        brand: 'Apex',  category: 'Helmets', price: 2299 },
};

function findProductId(name) {
  const key = (name || '').trim().toLowerCase();
  return Object.keys(CATALOG).find((id) => CATALOG[id].name.toLowerCase() === key) || null;
}

function currentPageSlug() {
  const file = window.location.pathname.split('/').pop() || 'index.html';
  return file.replace(/\.html$/, '') || 'index';
}

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
      const id = productEl.dataset.productId || findProductId(name) || name.toLowerCase().replace(/\s+/g, '-');
      const image = imgEl ? imgEl.getAttribute('src') || '' : '';

      addToCart({ id, name, price, image }, quantity);
      // Fallback feedback if page doesn't have its own fancy alert
      if (!document.getElementById('customAlert')) {
        window.alert(`${quantity} × ${name} added to cart`);
      }
    });
  });
}

// Product detail pages: wire "Add to Cart" / "Buy Now" from the catalog.
function wireProductPage() {
  const id = currentPageSlug();
  const product = CATALOG[id];
  if (!product) return;

  const imgEl = document.querySelector('.product-image');
  const item = { id, name: product.name, price: product.price, image: imgEl ? imgEl.getAttribute('src') : '' };

  const cartBtn = document.querySelector('.btn-cart');
  if (cartBtn) {
    cartBtn.addEventListener('click', () => {
      addToCart(item, 1);
      window.alert(`${product.name} added to cart`);
    });
  }
  const buyBtn = document.querySelector('.btn-buy');
  if (buyBtn) {
    buyBtn.addEventListener('click', () => {
      addToCart(item, 1);
      window.location.href = 'checkout.html';
    });
  }
}

// ---------- AUTH (backend API) ----------

let __currentUser = null;
let __currentUserLoaded = false;

async function apiFetch(path, options = {}) {
  let res;
  try {
    res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      ...options,
    });
  } catch (e) {
    return { ok: false, status: 0, data: null }; // network error / no backend
  }
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    /* non-JSON response */
  }
  return { ok: res.ok, status: res.status, data };
}

// ---------- DEMO AUTH (no backend) ----------
// GitHub Pages can't run the Node backend. When the API is unreachable
// (non-JSON response), auth falls back to a browser-only demo session.
// Demo mode never stores passwords — only name and email.

const DEMO_USERS_KEY = 'pistonhub_demo_users_v1';
const DEMO_SESSION_KEY = 'pistonhub_demo_session_v1';

function readStore(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeStore(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* storage unavailable */
  }
}

function demoSignup({ name, email }) {
  const users = readStore(DEMO_USERS_KEY, []);
  const key = email.toLowerCase();
  if (users.some((u) => u.email.toLowerCase() === key)) {
    return { ok: false, message: 'An account with this email already exists. Please log in.' };
  }
  const user = { name, email, isAdmin: false, demo: true };
  users.push({ name, email });
  writeStore(DEMO_USERS_KEY, users);
  writeStore(DEMO_SESSION_KEY, user);
  return { ok: true, user };
}

function demoLogin({ email }) {
  const key = email.toLowerCase();
  const found = readStore(DEMO_USERS_KEY, []).find((u) => u.email.toLowerCase() === key);
  if (!found) return { ok: false, message: 'No account found for this email. Please sign up first.' };
  const user = { name: found.name, email: found.email, isAdmin: false, demo: true };
  writeStore(DEMO_SESSION_KEY, user);
  return { ok: true, user };
}

async function fetchCurrentUser(force = false) {
  if (__currentUserLoaded && !force) return __currentUser;
  const { ok, data } = await apiFetch('/api/auth/me');
  if (!ok && data === null) {
    __currentUser = readStore(DEMO_SESSION_KEY, null);
  } else {
    __currentUser = ok && data ? data.user : null;
  }
  __currentUserLoaded = true;
  return __currentUser;
}

async function signupUser({ name, email, password }) {
  const { ok, data } = await apiFetch('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
  if (!ok && data === null) {
    const result = demoSignup({ name, email });
    if (result.ok) {
      __currentUser = result.user;
      __currentUserLoaded = true;
    }
    return result;
  }
  if (!ok) return { ok: false, message: (data && data.error) || 'Unable to sign up' };
  __currentUser = data.user;
  __currentUserLoaded = true;
  return { ok: true, user: data.user };
}

async function loginUser({ email, password }) {
  const { ok, data } = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!ok && data === null) {
    const result = demoLogin({ email });
    if (result.ok) {
      __currentUser = result.user;
      __currentUserLoaded = true;
    }
    return result;
  }
  if (!ok) return { ok: false, message: (data && data.error) || 'Unable to login' };
  __currentUser = data.user;
  __currentUserLoaded = true;
  return { ok: true, user: data.user };
}

async function logoutUser() {
  await apiFetch('/api/auth/logout', { method: 'POST' });
  writeStore(DEMO_SESSION_KEY, null);
  __currentUser = null;
  __currentUserLoaded = true;
}

async function updateAuthUI() {
  const nameEl = document.getElementById('navUserName');
  const linkEl = document.getElementById('navUserLink');
  if (!nameEl || !linkEl) return;

  const user = await fetchCurrentUser();
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

// ---------- ORDERS ----------

async function createOrder({ items, shipping }) {
  const { ok, status, data } = await apiFetch('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ items, shipping }),
  });
  if (!ok && data === null) {
    // No backend reachable (static GitHub Pages demo): simulate the order so
    // the storefront flow still completes end to end.
    const total = items.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 0), 0);
    return { ok: true, order: { id: 'DEMO-' + Date.now().toString(36).toUpperCase(), total, demo: true } };
  }
  if (!ok) {
    return {
      ok: false,
      loginRequired: status === 401,
      message: (data && data.error) || 'Unable to place order',
    };
  }
  return { ok: true, order: data.order };
}

// ---------- PRODUCTS ----------

async function fetchProducts() {
  const { ok, data } = await apiFetch('/api/products');
  return ok && data ? data.products : [];
}

// ---------- Page wiring ----------

document.addEventListener('DOMContentLoaded', () => {
  updateNavCartCount();
  updateAuthUI();
  wireProductAddToCart();
  wireProductPage();
});
