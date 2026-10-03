-- Safe one-off repair for stale Supabase schema caches
-- Run this in the Supabase SQL Editor if the app reports:
-- "Could not find the 'address' column of 'customers' in the schema cache"

alter table if exists public.customers
  add column if not exists address text;

-- Force PostgREST to refresh its schema cache after the change.
notify pgrst, 'reload schema';
