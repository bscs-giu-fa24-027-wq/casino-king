# 🎰 Casino King

A full-stack online casino platform built with Node.js + Express, React (Vite), PostgreSQL + Prisma, Stripe payments, and JWT authentication.

---

## 📁 Monorepo Structure

```
casino-king/
├── client/          # React frontend (Vite + Tailwind CSS)
├── server/          # Express API backend
│   ├── controllers/ # Route handler functions
│   ├── middleware/  # auth, errorHandler, kycCheck, geofence
│   ├── routes/      # Express route definitions
│   ├── services/    # tokenService, gameService, paymentService, bonusService, referralService
│   └── utils/       # rng.js, logger.js, prisma.js
├── prisma/          # Prisma schema & seed script
└── shared/          # Shared constants (CKC_RATE, etc.)
```

---

## 🛠 Tech Stack

| Layer       | Technology                        |
|-------------|-----------------------------------|
| Frontend    | React 18, Vite, Tailwind CSS      |
| Backend     | Node.js 18+, Express 4            |
| Database    | PostgreSQL 14+, Prisma ORM        |
| Auth        | JWT (jsonwebtoken) + bcrypt       |
| Payments    | Stripe                            |
| Logging     | Winston                           |

---

## ⚡ Prerequisites

- **Node.js** ≥ 18  
- **npm** ≥ 9  
- **PostgreSQL** ≥ 14 running locally (or a connection string to a hosted DB)  
- A **Stripe** account for payment processing  

---

## 🚀 Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/bscs-giu-fa24-027-wq/casino-king.git
cd casino-king
```

### 2. Install server dependencies

```bash
cd server
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `server/.env` and fill in the required values:

| Variable               | Description                                      |
|------------------------|--------------------------------------------------|
| `DATABASE_URL`         | PostgreSQL connection string                     |
| `JWT_SECRET`           | Random secret string for signing JWTs            |
| `JWT_EXPIRES_IN`       | Access token TTL (e.g. `15m`)                    |
| `STRIPE_SECRET_KEY`    | Stripe secret key (`sk_test_...`)                |
| `STRIPE_WEBHOOK_SECRET`| Stripe webhook signing secret (`whsec_...`)      |
| `FRONTEND_URL`         | Client origin for CORS (e.g. `http://localhost:5173`) |
| `PORT`                 | Server port (default `4000`)                     |
| `NODE_ENV`             | `development` or `production`                    |
| `BLOCKED_COUNTRIES`    | Comma-separated ISO country codes to block       |

### 4. Set up the database

```bash
# Inside /server
npm run migrate      # Run Prisma migrations
npm run seed         # Seed demo admin + player accounts + bonus codes
```

> Seed credentials:  
> **Admin** — `admin@casinoking.com` / `Admin1234!`  
> **Player** — `player@casinoking.com` / `Player1234!`

### 5. Start the backend

```bash
# Development (auto-restart with nodemon)
npm run dev

# Production
npm start
```

The API will be available at `http://localhost:4000`.

---

### 6. Install client dependencies

```bash
cd ../client
npm install
```

### 7. Start the frontend

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.  
The Vite dev server automatically proxies `/api/*` requests to the backend on port 4000.

---

## 📦 Server npm Scripts

| Script            | Description                                  |
|-------------------|----------------------------------------------|
| `npm start`       | Start server with `node index.js`            |
| `npm run dev`     | Start with nodemon (hot-reload)              |
| `npm run migrate` | Run Prisma database migrations               |
| `npm run seed`    | Seed the database with demo data             |
| `npm run studio`  | Open Prisma Studio (DB GUI)                  |

---

## 🔌 API Endpoints

### Auth — `/api/auth`
| Method | Path         | Description              |
|--------|--------------|--------------------------|
| POST   | `/register`  | Create a new account     |
| POST   | `/login`     | Login, returns JWT pair  |
| POST   | `/refresh`   | Refresh access token     |
| POST   | `/logout`    | Revoke refresh token     |

### Users — `/api/users` *(auth required)*
| Method | Path  | Description               |
|--------|-------|---------------------------|
| GET    | `/me` | Get current user profile  |
| PATCH  | `/me` | Update username / country |

### Wallet — `/api/wallet` *(auth required)*
| Method | Path             | Description              |
|--------|------------------|--------------------------|
| GET    | `/`              | Get wallet balance       |
| GET    | `/transactions`  | Paginated tx history     |

### Games — `/api/games`
| Method | Path          | Description                          |
|--------|---------------|--------------------------------------|
| GET    | `/`           | List available games                 |
| GET    | `/history`    | Game session history *(auth)*        |
| POST   | `/slots`      | Play slots *(auth + KYC)*            |
| POST   | `/roulette`   | Play roulette *(auth + KYC)*         |
| POST   | `/blackjack`  | Play blackjack *(auth + KYC)*        |

### Payments — `/api/payments`
| Method | Path        | Description                          |
|--------|-------------|--------------------------------------|
| POST   | `/deposit`  | Create Stripe PaymentIntent *(auth)* |
| POST   | `/webhook`  | Stripe webhook handler               |

### Bonuses — `/api/bonuses` *(auth required)*
| Method | Path       | Description          |
|--------|------------|----------------------|
| GET    | `/`        | List claimed bonuses |
| POST   | `/redeem`  | Redeem a bonus code  |

### Referrals — `/api/referrals` *(auth required)*
| Method | Path | Description          |
|--------|------|----------------------|
| GET    | `/`  | List your referrals  |
| POST   | `/`  | Create a referral    |

### Admin — `/api/admin` *(auth + ADMIN role required)*
| Method | Path                  | Description       |
|--------|-----------------------|-------------------|
| GET    | `/users`              | List all users    |
| PATCH  | `/users/:id/kyc`      | Approve/reject KYC|
| PATCH  | `/users/:id/suspend`  | Suspend a user    |

---

## 🪙 Shared Constants

```js
// shared/constants.js
const CKC_RATE = 10; // 1 USD = 10 CKC tokens
```

---

## 🔒 Security Features

- **Helmet** — HTTP security headers  
- **CORS** — Restricted to `FRONTEND_URL`  
- **Rate limiting** — 200 req/15min globally; 20 req/15min on auth routes  
- **Geofencing** — Blocks requests from `BLOCKED_COUNTRIES` (reads `CF-IPCountry` header)  
- **JWT** — Short-lived access tokens (15m) + long-lived refresh tokens (7d, stored in DB)  
- **KYC guard** — All betting routes require approved KYC status  
- **bcrypt** — Passwords hashed with cost factor 12  

---

## 🗄 Database Schema (Prisma)

Models: `User`, `Wallet`, `Transaction`, `GameSession`, `Bonus`, `UserBonus`, `Referral`, `RefreshToken`

View the full schema at [`prisma/schema.prisma`](prisma/schema.prisma).

---

## 📜 License

MIT
