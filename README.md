# SME Tracker — Nigerian SME Expense & Invoice Tracker

Next.js (App Router) + Supabase + Paystack. Record sales & expenses, track
customer debt, generate invoices, see daily/weekly profit, and export CSV
reports. Access is gated behind a one-time ₦5,000 Paystack payment.

## 1. Stack

- **Frontend/Backend**: Next.js 14 (App Router, JS, Tailwind CSS) — Route
  Handlers under `app/api/**` act as your backend API.
- **Database & Auth**: Supabase (Postgres + Row Level Security + Auth)
- **Payments**: Paystack (one-time access fee)
- **Hosting**: Vercel

## 2. Set up Supabase

1. Create a project at https://supabase.com.
2. Go to **SQL Editor** → paste the contents of `supabase/schema.sql` → Run.
   This creates all tables (`profiles`, `customers`, `sales`, `expenses`,
   `invoices`, `invoice_items`, `payments`), RLS policies, and a trigger that
   auto-creates a `profiles` row when someone signs up.
3. Go to **Project Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only, never
     expose this in client code)
4. Go to **Authentication → Providers** and confirm Email is enabled. For
   quick local testing you can disable "Confirm email" under
   **Authentication → Settings**, but keep it on for production.

## 3. Set up Paystack

1. Create an account at https://paystack.com and switch to **Test mode**
   while developing.
2. Go to **Settings → API Keys & Webhooks** and copy:
   - Secret key → `PAYSTACK_SECRET_KEY`
   - Public key → `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`
3. Once deployed, set the webhook URL in the same page to:
   `https://YOUR-DOMAIN.vercel.app/api/paystack/webhook`
   (the webhook is what actually flips a user's account to "active" — the
   redirect-based `/api/paystack/verify` route is a convenience fallback).
4. Use Paystack's test card `4084 0840 8408 4081`, any future expiry, CVV
   `408`, PIN `0000`, OTP `123456` to simulate a successful payment.

## 4. Local development

```bash
npm install
cp .env.local.example .env.local   # then fill in real values
npm run dev
```

Visit http://localhost:3000. For Paystack callbacks to work locally, set
`NEXT_PUBLIC_SITE_URL=http://localhost:3000` in `.env.local` — the webhook
itself needs a public URL, so test full payment flow end-to-end after
deploying, or use a tunnel (e.g. `ngrok http 3000`) and point Paystack's
webhook at the tunnel URL temporarily.

## 5. Deploy to Vercel

1. Push this folder to a new GitHub repository.
2. On https://vercel.com, "Add New Project" → import the repo.
3. Framework preset: Next.js (auto-detected).
4. Add all six environment variables from `.env.local.example` under
   **Settings → Environment Variables** (use your real Supabase/Paystack
   values, and set `NEXT_PUBLIC_SITE_URL` to your Vercel URL, e.g.
   `https://sme-tracker.vercel.app`).
5. Deploy. Then go back to Paystack and set the webhook URL to
   `https://YOUR-VERCEL-URL/api/paystack/webhook`.
6. When you're ready for real payments, switch Paystack to **Live mode** and
   swap in the live secret/public keys.

## 6. How access control works

- `middleware.js` protects every `/dashboard/*` route — logged-out users are
  redirected to `/login`.
- `app/dashboard/layout.js` (a server component) then checks
  `profiles.subscription_status`. If it isn't `'active'`, the user is sent to
  `/pricing` to pay the ₦5,000 fee.
- Paying calls `POST /api/paystack/initialize`, which creates a `pending`
  row in `payments` and redirects the user to Paystack's hosted checkout.
- On success, Paystack calls your webhook (`POST /api/paystack/webhook`),
  which verifies the signature, marks the payment `success`, and sets
  `profiles.subscription_status = 'active'` using the service-role key
  (bypassing RLS, since this runs server-side with no logged-in user
  session). The user is then let into `/dashboard`.

## 7. API reference (Route Handlers you can call)

All routes live under `app/api/`. Data reads/writes for sales, expenses,
customers, and invoices happen directly from the frontend via the Supabase
JS client (protected by Row Level Security), so you generally don't need
extra CRUD endpoints — Supabase *is* your CRUD API. The two custom routes
are for payments:

### `POST /api/paystack/initialize`
Starts a Paystack transaction for the access fee.
```json
// Request body
{ "email": "owner@business.com", "userId": "uuid-of-logged-in-user" }

// Response
{ "authorization_url": "https://checkout.paystack.com/...", "reference": "sme_xxx_169..." }
```

### `GET /api/paystack/verify?reference=...`
Paystack redirects the browser here after checkout. Verifies the
transaction server-side and redirects to `/dashboard?payment=success` or
`/pricing?status=failed`.

### `POST /api/paystack/webhook`
Called by Paystack's servers (not the browser) on `charge.success`. Verifies
the `x-paystack-signature` header against your secret key, then activates
the user's account. Configure this URL in your Paystack dashboard.

### Supabase (used directly from the frontend, table-by-table)
Because RLS restricts every table to `auth.uid() = user_id`, calling these
from the browser with the anon key is safe. Example calls used throughout
the app (`lib/supabaseClient.js`):

```js
// Record a sale
await supabase.from("sales").insert({ user_id, description, amount, payment_method, customer_id, sale_date });

// List this month's expenses
await supabase.from("expenses").select("*").eq("user_id", user.id).gte("expense_date", "2026-09-01");

// Create an invoice + line items
await supabase.from("invoices").insert({ ... }).select().single();
await supabase.from("invoice_items").insert([{ invoice_id, description, quantity, unit_price, amount }]);

// Customers who owe money — derived from invoices with status in ('unpaid','partial')
await supabase.from("invoices").select("customer_id, total, status").eq("user_id", user.id).in("status", ["unpaid", "partial"]);
```

## 8. Project structure

```
app/
  page.js                     Landing page
  login/, signup/             Auth pages
  pricing/                    ₦5,000 paywall page
  dashboard/
    layout.js                 Auth + subscription gate, sidebar shell
    page.js                   Overview: daily/weekly profit
    sales/page.js
    expenses/page.js
    customers/page.js
    invoices/page.js
    invoices/new/page.js
    invoices/[id]/page.js     Printable invoice view
    reports/page.js           Date-range summary + CSV export
  api/paystack/
    initialize/route.js
    verify/route.js
    webhook/route.js
lib/
  supabaseClient.js           Browser client (anon key)
  supabaseServer.js           Server client (cookies) + admin client (service role)
components/
  Sidebar.js, StatCard.js
supabase/
  schema.sql                  Run this in Supabase SQL Editor
middleware.js                 Protects /dashboard routes
```

## 9. Next steps you may want to add

- Password reset flow (`supabase.auth.resetPasswordForEmail`)
- Editing sales/expenses/invoices (currently create + delete only)
- Multi-currency support if you expand beyond Naira
- Recurring (monthly) subscription instead of one-time fee — change
  `subscription_expires_at` logic and add a cron/Edge Function to expire it
- Move to Paystack's inline JS popup instead of hosted redirect for a
  smoother in-app payment experience
