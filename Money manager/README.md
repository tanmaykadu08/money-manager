# MyPocket — Money Manager

MyPocket is a modern, serverless money management application. It features a blazing-fast frontend deployed on Vercel, and a scalable backend powered by Cloudflare Workers and a Turso database.

---

## Project Structure

```
mypocket/
├── backend/                  ← Cloudflare Worker Backend (Hono)
│   ├── src/
│   │   ├── index.js          ← Main Hono application & CORS setup
│   │   ├── db.js             ← Turso Database connection client
│   │   ├── auth.js           ← JWT authentication middleware
│   │   └── routes/           ← API Route Handlers
│   ├── package.json          ← Backend dependencies
│   └── wrangler.toml         ← Cloudflare Worker configuration
├── frontend/                 ← Vercel Frontend (Static HTML/JS)
│   └── index.html            ← Main user interface
└── README.md
```

---

## Deployment Guide

### 1. Backend (Cloudflare Workers + Turso)

Your backend runs on the Edge using Cloudflare Workers and connects to a Turso database.

**Prerequisites:**
- Node.js installed locally
- A Turso Database URL and Auth Token
- A Cloudflare account

**Steps:**
1. Open your terminal and navigate to the backend directory:
   ```bash
   cd backend
   npm install
   ```
2. Add your secrets to Cloudflare securely:
   ```bash
   npx wrangler secret put TURSO_URL
   npx wrangler secret put TURSO_TOKEN
   npx wrangler secret put JWT_SECRET
   ```
   *(Paste the values when prompted by Wrangler).*
3. Deploy the worker:
   ```bash
   npx wrangler deploy
   ```
4. Copy the deployed Cloudflare Worker URL provided in the terminal output.

### 2. Frontend (Vercel)

The frontend is a lightweight, blazing-fast single-page application.

**Steps:**
1. Open your terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Deploy using the Vercel CLI:
   ```bash
   npx vercel
   ```
3. Follow the prompts to link and deploy your project.

### 3. Connect Frontend to Backend
Once your frontend is deployed, visit the Vercel URL in your browser. On the login screen, enter your deployed Cloudflare Worker URL into the **Backend Syncer URL** input box. The frontend will immediately connect to your new backend and database!

---

## API Reference

All routes except `/api/auth/*` require `Authorization: Bearer <token>` header.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login, get JWT token |
| GET | `/api/income?month=YYYY-MM` | Get income for month |
| POST | `/api/income` | Add income entry |
| DELETE | `/api/income/:id` | Delete income entry |
| GET | `/api/expenses?month=YYYY-MM` | Get expenses for month |
| POST | `/api/expenses` | Add expense |
| DELETE | `/api/expenses/:id` | Delete expense |
| GET | `/api/autopay` | Get all auto payments |
| POST | `/api/autopay` | Add auto payment |
| PATCH | `/api/autopay/:id/toggle` | Toggle active/inactive |
| DELETE | `/api/autopay/:id` | Delete auto payment |
| GET | `/api/settings` | Get bank balance |
| PUT | `/api/settings` | Update bank balance |
| GET | `/api/health` | Health check |
