const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const ROOT = path.join(__dirname, '..');
const ENV_PATH = path.join(ROOT, '.env');

// First local run: generate a .env with random secrets so nothing is
// hardcoded. Skipped when secrets come from the environment (e.g. Render).
if (!fs.existsSync(ENV_PATH) && !process.env.SESSION_SECRET) {
  const sessionSecret = crypto.randomBytes(32).toString('hex');
  const adminPassword = crypto.randomBytes(9).toString('base64url');
  fs.writeFileSync(
    ENV_PATH,
    `PORT=3000\nSESSION_SECRET=${sessionSecret}\nADMIN_EMAIL=admin@pistonhub.com\nADMIN_PASSWORD=${adminPassword}\n`,
    'utf8'
  );
  console.log('[setup] Generated .env with random secrets.');
  console.log(`[setup] Admin login: admin@pistonhub.com / ${adminPassword}`);
  console.log('[setup] (Saved in .env — change it there if you want your own.)');
}
// Existing environment variables take precedence over .env values.
if (fs.existsSync(ENV_PATH)) process.loadEnvFile(ENV_PATH);

const { db, slugify, seedProducts, seedAdmin } = require('./db');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@pistonhub.com';

seedProducts();
if (process.env.ADMIN_PASSWORD) {
  const created = seedAdmin(ADMIN_EMAIL, process.env.ADMIN_PASSWORD);
  if (created) console.log(`[setup] Admin account created: ${ADMIN_EMAIL}`);
}

const app = express();
app.disable('x-powered-by');
// Behind a reverse proxy (e.g. Render) trust X-Forwarded-* so secure
// cookies and req.ip (rate limiting) work correctly.
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    name: 'pistonhub.sid',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: 'auto',
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
    },
  })
);

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src https://fonts.gstatic.com; img-src 'self' data: https:; " +
      "connect-src 'self'; frame-ancestors 'none'"
  );
  next();
});

// ---------- helpers ----------

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, isAdmin: !!row.is_admin };
}

function currentUser(req) {
  if (!req.session.userId) return null;
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  return row || null;
}

function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Login required' });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  const user = currentUser(req);
  if (!user || !user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  req.user = user;
  next();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validCredentials(email, password) {
  if (typeof email !== 'string' || !EMAIL_RE.test(email) || email.length > 254) {
    return 'Please enter a valid email address';
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return 'Password must be 8-128 characters';
  }
  return null;
}

// Simple in-memory login rate limit: 5 failures per 15 minutes per IP.
const loginAttempts = new Map();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function tooManyAttempts(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry || Date.now() - entry.first > WINDOW_MS) {
    loginAttempts.set(ip, { first: Date.now(), count: 1 });
  } else {
    entry.count += 1;
  }
}

// ---------- auth ----------

app.post('/api/auth/signup', (req, res) => {
  const { name, email, password } = req.body || {};
  const err = validCredentials(email, password);
  if (err) return res.status(400).json({ error: err });
  const cleanName = typeof name === 'string' ? name.trim().slice(0, 80) : '';

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const hash = bcrypt.hashSync(password, 12);
  const info = db
    .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run(cleanName, email, hash);

  req.session.regenerate((regenErr) => {
    if (regenErr) return res.status(500).json({ error: 'Session error' });
    req.session.userId = info.lastInsertRowid;
    res.status(201).json({ user: { id: info.lastInsertRowid, name: cleanName, email, isAdmin: false } });
  });
});

app.post('/api/auth/login', (req, res) => {
  const ip = req.ip;
  if (tooManyAttempts(ip)) {
    return res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });
  }
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  // Compare against a dummy hash when the user doesn't exist so response
  // timing doesn't reveal which emails are registered.
  const hash = row ? row.password_hash : '$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZBpDLhAuxr8v/JD9UkfEfLavZHhKPa';
  const ok = bcrypt.compareSync(password, hash) && !!row;

  if (!ok) {
    recordFailure(ip);
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  req.session.regenerate((regenErr) => {
    if (regenErr) return res.status(500).json({ error: 'Session error' });
    req.session.userId = row.id;
    res.json({ user: publicUser(row) });
  });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('pistonhub.sid');
    res.json({ ok: true });
  });
});

app.get('/api/auth/me', (req, res) => {
  const user = currentUser(req);
  res.json({ user: user ? publicUser(user) : null });
});

// ---------- products ----------

app.get('/api/products', (req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  res.json({ products: rows });
});

function validateProduct(body) {
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
  const price = Number(body.price);
  const image = typeof body.image === 'string' ? body.image.trim().slice(0, 500) : '';
  const category = typeof body.category === 'string' ? body.category.trim().slice(0, 40) : 'other';
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 1000) : '';
  const stock = Number.isInteger(Number(body.stock)) ? Math.max(0, Number(body.stock)) : 0;

  if (!name) return { error: 'Product name is required' };
  if (!Number.isFinite(price) || price < 0 || price > 1000000) {
    return { error: 'Price must be a number between 0 and 1,000,000' };
  }
  if (image && !/^(images\/|https:\/\/)/.test(image)) {
    return { error: 'Image must be a path under "images/" or an https:// URL' };
  }
  return { product: { name, price, image, category: category || 'other', description, stock } };
}

app.post('/api/admin/products', requireAdmin, (req, res) => {
  const result = validateProduct(req.body || {});
  if (result.error) return res.status(400).json({ error: result.error });
  const p = result.product;
  const id = slugify(p.name);
  const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(id);
  if (existing) return res.status(409).json({ error: 'A product with this name already exists' });

  db.prepare(
    'INSERT INTO products (id, name, price, image, category, description, stock) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, p.name, p.price, p.image, p.category, p.description, p.stock);
  res.status(201).json({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(id) });
});

app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });

  const result = validateProduct({ ...existing, ...(req.body || {}) });
  if (result.error) return res.status(400).json({ error: result.error });
  const p = result.product;

  db.prepare(
    'UPDATE products SET name = ?, price = ?, image = ?, category = ?, description = ?, stock = ? WHERE id = ?'
  ).run(p.name, p.price, p.image, p.category, p.description, p.stock, req.params.id);
  res.json({ product: db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id) });
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Product not found' });
  res.json({ ok: true });
});

// ---------- orders ----------

app.post('/api/orders', requireAuth, (req, res) => {
  const { items, shipping } = req.body || {};
  if (!Array.isArray(items) || !items.length || items.length > 100) {
    return res.status(400).json({ error: 'Cart is empty' });
  }

  const ship = shipping && typeof shipping === 'object' ? shipping : {};
  const cleanShipping = {
    fullName: String(ship.fullName || '').trim().slice(0, 120),
    address: String(ship.address || '').trim().slice(0, 500),
    city: String(ship.city || '').trim().slice(0, 80),
    pin: String(ship.pin || '').trim().slice(0, 20),
  };
  if (!cleanShipping.fullName || !cleanShipping.address || !cleanShipping.city || !cleanShipping.pin) {
    return res.status(400).json({ error: 'All shipping fields are required' });
  }

  const getProduct = db.prepare('SELECT * FROM products WHERE id = ?');
  const cleanItems = [];
  let total = 0;

  for (const item of items) {
    const quantity = Math.min(99, Math.max(1, parseInt(item && item.quantity, 10) || 1));
    const id = String((item && item.id) || '').slice(0, 200);
    const product = getProduct.get(id);
    if (product) {
      // Price always comes from the database, never the client.
      cleanItems.push({ id: product.id, name: product.name, price: product.price, quantity, verified: true });
      total += product.price * quantity;
    } else {
      // Item not in catalog (legacy static page) — clamp the client price and mark it.
      const price = Math.min(1000000, Math.max(0, Number(item && item.price) || 0));
      const name = String((item && item.name) || 'Item').slice(0, 120);
      cleanItems.push({ id, name, price, quantity, verified: false });
      total += price * quantity;
    }
  }

  const order = {
    id: 'ORD-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'),
    user_id: req.user.id,
    items_json: JSON.stringify(cleanItems),
    total: Math.round(total * 100) / 100,
    shipping_json: JSON.stringify(cleanShipping),
  };
  db.prepare(
    'INSERT INTO orders (id, user_id, items_json, total, shipping_json) VALUES (?, ?, ?, ?, ?)'
  ).run(order.id, order.user_id, order.items_json, order.total, order.shipping_json);

  res.status(201).json({ order: { id: order.id, total: order.total, items: cleanItems } });
});

app.get('/api/orders/mine', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.user.id);
  res.json({ orders: rows.map(orderToJson) });
});

function orderToJson(row) {
  return {
    id: row.id,
    userId: row.user_id,
    items: JSON.parse(row.items_json),
    total: row.total,
    shipping: JSON.parse(row.shipping_json),
    createdAt: row.created_at,
  };
}

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT o.*, u.name AS user_name, u.email AS user_email
       FROM orders o JOIN users u ON u.id = o.user_id
       ORDER BY o.created_at DESC LIMIT 200`
    )
    .all();
  res.json({
    orders: rows.map((row) => ({
      ...orderToJson(row),
      user: { name: row.user_name, email: row.user_email },
    })),
  });
});

app.delete('/api/admin/orders', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM orders').run();
  res.json({ ok: true });
});

// ---------- static site ----------

// Never serve backend internals or secrets.
const BLOCKED = /^\/(server|node_modules|data|\.env|\.git|package(-lock)?\.json)/i;
app.use((req, res, next) => {
  if (BLOCKED.test(req.path)) return res.status(404).send('Not found');
  next();
});

app.use(express.static(ROOT, { extensions: ['html'] }));

app.use((req, res) => res.status(404).send('Not found'));

app.listen(PORT, () => {
  console.log(`Piston Hub running at http://localhost:${PORT}`);
});
