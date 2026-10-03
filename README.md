# SME Tracker

A Nigerian SME finance tracker for recording sales, expenses, customer debt, invoices, and profit reports using Next.js and Supabase.

## Features
- Record daily sales
- Track products, stock levels, restocks, removals, and low-stock alerts
- Show prioritized reorder alerts and suggested restock quantities
- Record whether sales and expenses affect cash or bank balances
- Automatically carry forward cash and bank opening balances, reconcile against counted/statement closing balances, and review per-account transaction details
- Add, edit, and review cashbook adjustments for missing receipts or payments; matching reconciliations update automatically
- Automatically deduct inventory when a product sale is recorded
- Record expenses
- Track customers who owe money
- Create and manage invoices
- Draft quotes and convert approved quotes into invoices
- Collect invoice payments online through Paystack
- Send payment receipts and print customer statements
- Share payment links by WhatsApp
- Create recurring schedules that generate reviewable invoice drafts
- Add a business name and logo to invoice PDFs
- Compare daily, weekly, monthly, and yearly sales, expenses, and profit
- Rank top customers and best-selling products; review tracked product margins
- Export report CSVs
- Access gating with a ₦5,000 fee flow
- Paystack-ready payment routes
- Save sales and expenses offline and sync them when online
- Attach private receipt photos to expense records
- Send invoice payment reminders through WhatsApp
- See 30-day cash-flow forecasts and suggested stock reorders
- Review a weekly business health snapshot

## Local setup
1. Copy `.env.example` to `.env.local`.
2. Add your Supabase, Paystack, SMTP, and `CRON_SECRET` values.
3. Install dependencies:
   npm install
4. Run the app:
   npm run dev
5. Open http://localhost:3000

## Supabase database
For a new project, run the entire `supabase/schema.sql`, then `supabase/invoice_workflow.sql`, `supabase/mobile_features.sql`, and `supabase/cashbook_reconciliation.sql` in the Supabase SQL Editor. For an existing project, run `supabase/mobile_features.sql` if not already applied, then run `supabase/cashbook_reconciliation.sql` to enable cash/bank account tracking and reconciliations. In the SQL Editor, use Ctrl+A before Run; running only a selected excerpt will omit functions and policies defined later in the files. The scripts retain existing customer and sales data. Existing sales and expenses are marked “unassigned” because their payment account was not previously recorded; invoice payments are mapped to cash or bank based on their payment method, while “other” payments remain unassigned. Assign unassigned transactions in Cashbook before reconciling those periods. Enter the initial opening balance for each account on its first reconciliation; later opening balances carry forward automatically from the prior saved actual closing balance. Reconciliations auto-save after all transactions have been assigned and an actual closing balance is entered.

If you hit the exact error `Could not find the 'address' column of 'customers' in the schema cache`, run the minimal repair script in `supabase/repair_missing_customer_address.sql` first, then rerun the full schema script if needed. This ensures the column exists and forces PostgREST to refresh its schema cache.

The script requests a PostgREST schema-cache refresh. If Supabase still reports a missing function immediately afterward, run `NOTIFY pgrst, 'reload schema';` in the SQL Editor and retry. The app blocks writes without a valid authenticated session.

## Paystack API endpoints
- POST /api/paystack/initialize
- POST /api/paystack/verify
- POST /api/paystack/webhook
- POST /api/invoices/pay/[token]/initialize
- POST /api/invoices/pay/verify

## Deployment
This project is set up for deployment to Vercel. Add the same environment variables in your Vercel project settings.

## Environment variables
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- INVOICE_LINK_SECRET (optional; defaults to SUPABASE_SERVICE_ROLE_KEY)
- EMAIL_SMTP_HOST
- EMAIL_SMTP_PORT
- EMAIL_SMTP_USER
- EMAIL_SMTP_PASS
- EMAIL_FROM
- CRON_SECRET
- PAYSTACK_SECRET_KEY
- NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY
- NEXT_PUBLIC_SITE_URL
- NEXT_PUBLIC_ACCESS_FEE_KOBO

Invoices and quotes can be sent by email with a PDF attachment. Configure the SMTP values above and add each customer's email address. For Gmail SMTP, use `smtp.gmail.com` with port `465` (SSL) or `587` (STARTTLS), set `EMAIL_SMTP_USER` to the full Gmail address, and use a Google App Password—not the account sign-in password. App Passwords require 2-Step Verification. If Gmail returns `535-5.7.8`, generate a new App Password in the Google Account security settings, replace `EMAIL_SMTP_PASS` in Vercel, and redeploy; never share the password. An optional invoice download and Paystack checkout link requires a publicly reachable HTTPS `NEXT_PUBLIC_SITE_URL`; signed links expire after seven days. Paystack invoice checkout also requires `PAYSTACK_SECRET_KEY`; configure the Paystack dashboard webhook to call `/api/paystack/webhook` so completed payments are recorded even if the customer does not return to the site. Overdue reminders and recurring-draft generation run daily at 09:00 UTC. Set a long random `CRON_SECRET` in `.env.local` and Vercel; Vercel sends it to the scheduled endpoint. Recurring schedules only create drafts; review and issue them before sending. On Vercel, set `NEXT_PUBLIC_SITE_URL` to the production HTTPS URL and redeploy after changing environment variables. Keep SMTP, `CRON_SECRET`, signing, and Supabase service-role values server-side in `.env.local` and Vercel settings.

Sales and expenses created while offline are stored in the browser's local storage for the signed-in account and sync when the connection returns. Keep the Sales or Expenses page open to record entries while offline; offline-created sales still validate stock when they sync. Receipt photos require an internet connection and are stored in a private bucket. Cash-flow forecasts use invoice due dates and the previous 30 days of expenses; actual collections and future spending can differ from estimates. Restock suggestions use the last 30 days of recorded product sales plus the configured low-stock threshold.
