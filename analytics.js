// Analytics layer: pushes GA4 e-commerce events to the dataLayer for GTM (GTM-WHBDV6TQ).
// Load after script.js — it wraps the cart/order/auth functions defined there,
// so every add/remove/purchase is tracked no matter which page triggered it.

window.dataLayer = window.dataLayer || [];

const CURRENCY = 'INR';

const LIST_NAMES = {
  slider: 'All Products',
  AXOR: 'Brand - Axor',
  steelbird: 'Brand - Steelbird',
  pulsar: 'Bike - Pulsar',
  royalenfield: 'Bike - Royal Enfield',
  triumph: 'Bike - Triumph',
  yamaha: 'Bike - Yamaha',
};

function track(event, params) {
  if (params && params.ecommerce) window.dataLayer.push({ ecommerce: null }); // clear previous ecommerce object
  window.dataLayer.push({ event, ...params });
}

// Build a GA4 item from a catalog id (falls back to cart data for unknown ids).
function toItem(id, fallback = {}, extra = {}) {
  const p = CATALOG[id] || {};
  return {
    item_id: id,
    item_name: p.name || fallback.name || id,
    item_brand: p.brand || 'Unknown',
    item_category: p.category || 'Unknown',
    price: p.price || fallback.price || 0,
    quantity: fallback.quantity || 1,
    ...extra,
  };
}

function itemsValue(items) {
  return items.reduce((sum, i) => sum + i.price * i.quantity, 0);
}

function cartItems() {
  return getCart().map((c) => toItem(c.id, c));
}

// ---------- Wrap cart / order / auth functions from script.js ----------

const _addToCart = addToCart;
addToCart = function (product, quantity = 1) {
  _addToCart(product, quantity);
  if (!product || !product.id) return;
  const item = toItem(product.id, { ...product, quantity });
  track('add_to_cart', { ecommerce: { currency: CURRENCY, value: itemsValue([item]), items: [item] } });
};

const _removeFromCart = removeFromCart;
removeFromCart = function (id) {
  const existing = getCart().find((c) => c.id === id);
  _removeFromCart(id);
  if (!existing) return;
  const item = toItem(id, existing);
  track('remove_from_cart', { ecommerce: { currency: CURRENCY, value: itemsValue([item]), items: [item] } });
};

const _createOrder = createOrder;
createOrder = async function ({ items, shipping }) {
  const result = await _createOrder({ items, shipping });
  if (result.ok) {
    const gaItems = items.map((c) => toItem(c.id, c));
    track('purchase', {
      ecommerce: {
        transaction_id: result.order.id,
        currency: CURRENCY,
        value: itemsValue(gaItems),
        shipping: 0,
        items: gaItems,
      },
      // City only — no name, address or PIN is sent to analytics.
      shipping_city: (shipping && shipping.city) || '',
      order_type: result.order.demo ? 'demo' : 'live',
    });
  }
  return result;
};

const _loginUser = loginUser;
loginUser = async function (creds) {
  const result = await _loginUser(creds);
  if (result.ok) track('login', { method: 'email' });
  return result;
};

const _signupUser = signupUser;
signupUser = async function (details) {
  const result = await _signupUser(details);
  if (result.ok) track('sign_up', { method: 'email' });
  return result;
};

// ---------- Page-level events ----------

document.addEventListener('DOMContentLoaded', () => {
  const slug = currentPageSlug();

  // Product detail page
  if (CATALOG[slug]) {
    const item = toItem(slug);
    track('view_item', { ecommerce: { currency: CURRENCY, value: item.price, items: [item] } });
  }

  // Product listing pages (shop, brand and bike pages)
  const cards = document.querySelectorAll('.product[data-product-id]');
  if (cards.length) {
    const listName = LIST_NAMES[slug] || slug;
    const items = Array.from(cards).map((card, index) =>
      toItem(card.dataset.productId, {}, { item_list_id: slug, item_list_name: listName, index })
    );
    track('view_item_list', { ecommerce: { item_list_id: slug, item_list_name: listName, items } });

    cards.forEach((card, index) => {
      card.querySelectorAll('a[href]').forEach((link) => {
        link.addEventListener('click', () => {
          track('select_item', {
            ecommerce: { item_list_id: slug, item_list_name: listName, items: [items[index]] },
          });
        });
      });
    });
  }

  if (slug === 'cart') {
    const items = cartItems();
    track('view_cart', { ecommerce: { currency: CURRENCY, value: itemsValue(items), items } });
  }

  if (slug === 'checkout') {
    const items = cartItems();
    if (items.length) {
      track('begin_checkout', { ecommerce: { currency: CURRENCY, value: itemsValue(items), items } });
    }
  }

  // Home page: which bike / brand collection the visitor picks
  if (slug === 'index') {
    document.querySelectorAll('a[href]').forEach((link) => {
      const target = (link.getAttribute('href') || '').replace(/\.html$/, '');
      if (LIST_NAMES[target] && target !== 'slider') {
        link.addEventListener('click', () => {
          track('select_content', { content_type: 'collection', content_id: LIST_NAMES[target] });
        });
      }
    });
  }

  // Contact form = lead
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    // Only the form name is sent — free-text fields could contain personal data.
    contactForm.addEventListener('submit', () => {
      track('generate_lead', { form_name: 'contact' });
    });
  }
});
