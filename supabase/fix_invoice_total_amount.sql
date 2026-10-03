-- Fix legacy invoice schema issues caused by older migrations or partial SQL runs.
-- This repairs the `total_amount` column and keeps it in sync with `total`.

ALTER TABLE IF EXISTS public.invoices
  ADD COLUMN IF NOT EXISTS total numeric(12,2) DEFAULT 0;

ALTER TABLE IF EXISTS public.invoices
  ADD COLUMN IF NOT EXISTS total_amount numeric(12,2) DEFAULT 0;

UPDATE public.invoices
SET total_amount = COALESCE(total_amount, total, 0)
WHERE total_amount IS NULL;

UPDATE public.invoices
SET total = COALESCE(total, total_amount, 0)
WHERE total IS NULL;

ALTER TABLE public.invoices
  ALTER COLUMN total SET DEFAULT 0,
  ALTER COLUMN total_amount SET DEFAULT 0;

ALTER TABLE public.invoices
  ALTER COLUMN total_amount DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid = 'public.invoices'::regclass
      AND c.conname = 'invoices_user_id_fkey'
      AND c.contype = 'f'
      AND c.confrelid = 'auth.users'::regclass
  ) THEN
    ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_user_id_fkey;
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
