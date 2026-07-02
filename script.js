// Client-side cart (localStorage) + auth via the backend API.
// Passwords and roles are handled server-side only.

const CART_KEY = 'pistonhub_cart_v1';

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
      const id = productEl.dataset.productId || name.toLowerCase().replace(/\s+/g, '-');
      const image = imgEl ? imgEl.getAttribute('src') || '' : '';

      addToCart({ id, name, price, image }, quantity);
      // Fallback feedback if page doesn't have its own fancy alert
      if (!document.getElementById('customAlert')) {
        window.alert(`${quantity} × ${name} added to cart`);
      }
    });
  });
}

// ---------- AUTH (backend API) ----------

let __currentUser = null;
let __currentUserLoaded = false;

async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    /* non-JSON response */
  }
  return { ok: res.ok, status: res.status, data };
}

async function fetchCurrentUser(force = false) {
  if (__currentUserLoaded && !force) return __currentUser;
  const { ok, data } = await apiFetch('/api/auth/me');
  __currentUser = ok && data ? data.user : null;
  __currentUserLoaded = true;
  return __currentUser;
}

async function signupUser({ name, email, password }) {
  const { ok, data } = await apiFetch('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
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
  if (!ok) return { ok: false, message: (data && data.error) || 'Unable to login' };
  __currentUser = data.user;
  __currentUserLoaded = true;
  return { ok: true, user: data.user };
}

async function logoutUser() {
  await apiFetch('/api/auth/logout', { method: 'POST' });
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
});
