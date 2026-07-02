const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'pistonhub.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    image TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'other',
    description TEXT NOT NULL DEFAULT '',
    stock INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    items_json TEXT NOT NULL,
    total REAL NOT NULL,
    shipping_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

function slugify(name) {
  return String(name).toLowerCase().trim().replace(/\s+/g, '-');
}

// Products that already exist as static cards on the shop page,
// seeded so the server can verify prices at checkout.
const SEED_PRODUCTS = [
  ['Apex Venom Gloves', 19.99, 'all images/Untitled design - 2024-05-07T124153.645.png', 'gloves'],
  ['Apex Marvel Gloves', 19.99, 'all images/Untitled design - 2024-05-07T124348.301.png', 'gloves'],
  ['Axor Gloves', 19.99, 'all images/Untitled design - 2024-05-07T124335.968.png', 'gloves'],
  ['Apex Boots', 19.99, 'all images/Untitled design - 2024-05-07T124400.733.png', 'boots'],
  ['Apex Marvel Boots', 19.99, 'all images/Untitled design - 2024-05-07T124411.595.png', 'boots'],
  ['Apex Marvel Venom Helmet', 19.99, 'all images/axor venom.png', 'helmet'],
  ['Apex Hunter Boots', 19.99, 'all images/Untitled design - 2024-05-07T124425.284.png', 'boots'],
  ['Apex solid Boots', 29.99, 'all images/Untitled design - 2024-05-07T124517.576.png', 'boots'],
  ['Apex Dynamo Helmet', 39.99, 'all images/axor helmet3.png', 'helmet'],
  ['Retro Jet West Helmet', 49.99, 'all images/axor helmet4.png', 'helmet'],
  ['Vega Max', 59.99, 'all images/axor helmet5.png', 'helmet'],
  ['Apex Solid Helmet', 69.99, 'all images/axor pr6.png', 'helmet'],
];

function seedProducts() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  if (count > 0) return;
  const insert = db.prepare(
    'INSERT INTO products (id, name, price, image, category, stock) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const tx = db.transaction(() => {
    for (const [name, price, image, category] of SEED_PRODUCTS) {
      insert.run(slugify(name), name, price, image, category, 50);
    }
  });
  tx();
}

function seedAdmin(email, password) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return false;
  const hash = bcrypt.hashSync(password, 12);
  db.prepare(
    'INSERT INTO users (name, email, password_hash, is_admin) VALUES (?, ?, ?, 1)'
  ).run('Admin', email, hash);
  return true;
}

module.exports = { db, slugify, seedProducts, seedAdmin };
