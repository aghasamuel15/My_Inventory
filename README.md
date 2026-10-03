# SME Tracker

A Nigerian SME finance tracker for recording sales, expenses, customer debt, invoices, and profit reports using Next.js and Supabase.

## Features
- Record daily sales
- Track products, stock levels, restocks, removals, and low-stock alerts
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

## Local setup
1. Copy `.env.example` to `.env.local`.
2. Add your Supabase, Paystack, SMTP, and `CRON_SECRET` values.
3. Install dependencies:
   npm install
4. Run the app:
   npm run dev
5. Open http://localhost:3000

## Supabase database
Run the entire SQL file in `supabase/schema.sql` in the Supabase SQL Editor for a new project. Then run `supabase/invoice_workflow.sql` to enable itemized invoices, quotes, online payment records, payment receipts, business-logo storage, recurring invoice drafts, delivery history, and scheduled reminders. For an existing project, run both files in full and in that order. In the SQL Editor, use Ctrl+A before Run; running only a selected excerpt will omit functions and policies defined later in the files. The scripts retain existing customer and sales data.

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

Invoices and quotes can be sent by email with a PDF attachment. Configure the SMTP values above and add each customer's email address. For Gmail SMTP, use a Google App Password (with 2-Step Verification enabled), not the account sign-in password. An optional invoice download and Paystack checkout link requires a publicly reachable HTTPS `NEXT_PUBLIC_SITE_URL`; signed links expire after seven days. Paystack invoice checkout also requires `PAYSTACK_SECRET_KEY`; configure the Paystack dashboard webhook to call `/api/paystack/webhook` so completed payments are recorded even if the customer does not return to the site. Overdue reminders and recurring-draft generation run daily at 09:00 UTC. Set a long random `CRON_SECRET` in `.env.local` and Vercel; Vercel sends it to the scheduled endpoint. Recurring schedules only create drafts; review and issue them before sending. On Vercel, set `NEXT_PUBLIC_SITE_URL` to the production HTTPS URL and redeploy after changing environment variables. Keep SMTP, `CRON_SECRET`, signing, and Supabase service-role values server-side in `.env.local` and Vercel settings.
