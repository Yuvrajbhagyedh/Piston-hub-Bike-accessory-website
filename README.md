# Piston Hub — Bike Accessory Store

Static HTML/CSS/JS storefront with a Node.js (Express + SQLite) backend for
authentication, product management, and orders.

## Run it

```bash
npm install
npm start
```

Then open http://localhost:3000

On first run the server creates a `.env` file with a random session secret and
a random admin password, and prints the admin login to the console:

```
[setup] Admin login: admin@pistonhub.com / <generated-password>
```

The password is also saved in `.env` (`ADMIN_PASSWORD=...`) — edit it there
*before the first run* if you want your own. `.env` and the `data/` database
folder are gitignored and must never be committed.

## Features

- **Auth** — signup/login with bcrypt-hashed passwords, httpOnly session
  cookies, login rate limiting (5 attempts / 15 min per IP)
- **Admin dashboard** (`/admin.html`) — orders overview (count, revenue,
  unique customers) and full product management: add / edit / delete products
  with name, price, category, image, stock, and description. Admin access is
  enforced **server-side** on every `/api/admin/*` route.
- **Shop** (`/slider.html`) — static product cards plus products added from
  the admin dashboard, loaded from the API
- **Checkout** — demo "pay on delivery" order (no card details are collected);
  totals are recomputed server-side from database prices
- **Security headers** — CSP, X-Frame-Options, nosniff; backend files
  (`server/`, `data/`, `.env`) are blocked from being served

## API

| Method | Route | Access |
|---|---|---|
| POST | `/api/auth/signup` | public |
| POST | `/api/auth/login` | public (rate limited) |
| POST | `/api/auth/logout` | public |
| GET | `/api/auth/me` | public |
| GET | `/api/products` | public |
| POST/PUT/DELETE | `/api/admin/products[/:id]` | admin |
| POST | `/api/orders` | logged-in users |
| GET | `/api/orders/mine` | logged-in users |
| GET/DELETE | `/api/admin/orders` | admin |

## Known limitations (demo scope)

- Sessions use the in-memory store, so restarting the server logs everyone
  out. Use a persistent session store (e.g. `connect-sqlite3`) for production.
- No real payment integration — wire up a hosted provider (Stripe/Razorpay)
  if this ever takes real orders. Never collect raw card numbers yourself.
- Serve over HTTPS in production so session cookies get the `Secure` flag.
