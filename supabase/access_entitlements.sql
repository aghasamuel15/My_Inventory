create or replace function public.has_active_access()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.subscription_status = 'active'
  );
$$;

revoke all on function public.has_active_access() from public, anon;
grant execute on function public.has_active_access() to authenticated, service_role;

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.inventory_products enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.sales enable row level security;
alter table public.expenses enable row level security;
alter table public.invoices enable row level security;
alter table public.access_payments enable row level security;
alter table public.invoice_items enable row level security;
alter table public.invoice_payments enable row level security;
alter table public.invoice_email_logs enable row level security;
alter table public.recurring_invoice_templates enable row level security;
alter table public.cashbook_reconciliations enable row level security;
alter table public.cashbook_account_openings enable row level security;
alter table public.cashbook_adjustments enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select to authenticated using (auth.uid() = id);
create policy "Users can update their own profile"
  on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
revoke insert, update on public.profiles from public, anon, authenticated;
grant update (business_name, business_logo_url) on public.profiles to authenticated;

create or replace function public.prevent_client_entitlement_changes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() is not null
    and auth.role() <> 'service_role'
    and new.subscription_status is distinct from old.subscription_status then
    raise exception 'Only verified payment processing can change account access'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_client_entitlement_changes() from public, anon, authenticated;
drop trigger if exists prevent_client_entitlement_changes on public.profiles;
create trigger prevent_client_entitlement_changes
before update of subscription_status on public.profiles
for each row execute function public.prevent_client_entitlement_changes();

drop policy if exists "Users can view their customers" on public.customers;
drop policy if exists "Users can insert their customers" on public.customers;
drop policy if exists "Users can update their customers" on public.customers;
drop policy if exists "Users can delete their customers" on public.customers;
create policy "Users can view their customers" on public.customers for select to authenticated
  using (auth.uid() = user_id and public.has_active_access());
create policy "Users can insert their customers" on public.customers for insert to authenticated
  with check (auth.uid() = user_id and public.has_active_access());
create policy "Users can update their customers" on public.customers for update to authenticated
  using (auth.uid() = user_id and public.has_active_access())
  with check (auth.uid() = user_id and public.has_active_access());
create policy "Users can delete their customers" on public.customers for delete to authenticated
  using (auth.uid() = user_id and public.has_active_access());

drop policy if exists "Users can view their inventory products" on public.inventory_products;
drop policy if exists "Users can insert their inventory products" on public.inventory_products;
drop policy if exists "Users can update their inventory products" on public.inventory_products;
drop policy if exists "Users can delete their inventory products" on public.inventory_products;
create policy "Users can view their inventory products" on public.inventory_products for select to authenticated
  using (auth.uid() = user_id and public.has_active_access());
create policy "Users can insert their inventory products" on public.inventory_products for insert to authenticated
  with check (auth.uid() = user_id and public.has_active_access());
create policy "Users can update their inventory products" on public.inventory_products for update to authenticated
  using (auth.uid() = user_id and public.has_active_access())
  with check (auth.uid() = user_id and public.has_active_access());
create policy "Users can delete their inventory products" on public.inventory_products for delete to authenticated
  using (auth.uid() = user_id and public.has_active_access());

drop policy if exists "Users can view their inventory movements" on public.inventory_movements;
drop policy if exists "Users can insert their inventory movements" on public.inventory_movements;
create policy "Users can view their inventory movements" on public.inventory_movements for select to authenticated
  using (auth.uid() = user_id and public.has_active_access());
create policy "Users can insert their inventory movements" on public.inventory_movements for insert to authenticated
  with check (
    auth.uid() = user_id
    and public.has_active_access()
    and exists (
      select 1 from public.inventory_products p
      where p.id = inventory_movements.product_id and p.user_id = auth.uid()
    )
  );

drop policy if exists "Users can view their sales" on public.sales;
drop policy if exists "Users can insert their sales" on public.sales;
drop policy if exists "Users can update their sales" on public.sales;
drop policy if exists "Users can delete their sales" on public.sales;
create policy "Users can view their sales" on public.sales for select to authenticated
  using (auth.uid() = user_id and public.has_active_access());
create policy "Users can insert their sales" on public.sales for insert to authenticated
  with check (auth.uid() = user_id and public.has_active_access());
create policy "Users can update their sales" on public.sales for update to authenticated
  using (auth.uid() = user_id and public.has_active_access())
  with check (auth.uid() = user_id and public.has_active_access());
create policy "Users can delete their sales" on public.sales for delete to authenticated
  using (auth.uid() = user_id and public.has_active_access());

drop policy if exists "Users can view their expenses" on public.expenses;
drop policy if exists "Users can insert their expenses" on public.expenses;
drop policy if exists "Users can update their expenses" on public.expenses;
drop policy if exists "Users can delete their expenses" on public.expenses;
create policy "Users can view their expenses" on public.expenses for select to authenticated
  using (auth.uid() = user_id and public.has_active_access());
create policy "Users can insert their expenses" on public.expenses for insert to authenticated
  with check (auth.uid() = user_id and public.has_active_access());
create policy "Users can update their expenses" on public.expenses for update to authenticated
  using (auth.uid() = user_id and public.has_active_access())
  with check (auth.uid() = user_id and public.has_active_access());
create policy "Users can delete their expenses" on public.expenses for delete to authenticated
  using (auth.uid() = user_id and public.has_active_access());

drop policy if exists "Users can view their invoices" on public.invoices;
drop policy if exists "Users can insert their invoices" on public.invoices;
drop policy if exists "Users can update their invoices" on public.invoices;
drop policy if exists "Users can delete their invoices" on public.invoices;
create policy "Users can view their invoices" on public.invoices for select to authenticated
  using (auth.uid() = user_id and public.has_active_access());
create policy "Users can insert their invoices" on public.invoices for insert to authenticated
  with check (auth.uid() = user_id and public.has_active_access());
create policy "Users can update their invoices" on public.invoices for update to authenticated
  using (auth.uid() = user_id and public.has_active_access())
  with check (auth.uid() = user_id and public.has_active_access());
create policy "Users can delete their invoices" on public.invoices for delete to authenticated
  using (auth.uid() = user_id and public.has_active_access());

drop policy if exists "Users can view their access payments" on public.access_payments;
drop policy if exists "Users can insert their access payments" on public.access_payments;
create policy "Users can view their access payments" on public.access_payments for select to authenticated
  using (auth.uid() = user_id);
revoke insert, update, delete on public.access_payments from public, anon, authenticated;
create unique index if not exists access_payments_reference_unique_idx
  on public.access_payments(reference);

drop policy if exists "Users can view invoice items for their invoices" on public.invoice_items;
drop policy if exists "Users can insert invoice items for their invoices" on public.invoice_items;
drop policy if exists "Users can update invoice items for their invoices" on public.invoice_items;
drop policy if exists "Users can delete invoice items for their invoices" on public.invoice_items;
create policy "Users can view invoice items for their invoices" on public.invoice_items for select to authenticated
  using (public.has_active_access() and exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id and i.user_id = auth.uid()
  ));
create policy "Users can insert invoice items for their invoices" on public.invoice_items for insert to authenticated
  with check (public.has_active_access() and exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id and i.user_id = auth.uid()
  ));
create policy "Users can update invoice items for their invoices" on public.invoice_items for update to authenticated
  using (public.has_active_access() and exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id and i.user_id = auth.uid()
  ))
  with check (public.has_active_access() and exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id and i.user_id = auth.uid()
  ));
create policy "Users can delete invoice items for their invoices" on public.invoice_items for delete to authenticated
  using (public.has_active_access() and exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id and i.user_id = auth.uid()
  ));

drop policy if exists "Users can view their invoice payments" on public.invoice_payments;
create policy "Users can view their invoice payments" on public.invoice_payments for select to authenticated
  using (auth.uid() = user_id and public.has_active_access());

drop policy if exists "Users can view their invoice email logs" on public.invoice_email_logs;
drop policy if exists "Users can insert their invoice email logs" on public.invoice_email_logs;
create policy "Users can view their invoice email logs" on public.invoice_email_logs for select to authenticated
  using (auth.uid() = user_id and public.has_active_access());
create policy "Users can insert their invoice email logs" on public.invoice_email_logs for insert to authenticated
  with check (auth.uid() = user_id and public.has_active_access() and exists (
    select 1 from public.invoices i
    where i.id = invoice_email_logs.invoice_id and i.user_id = auth.uid()
  ));

drop policy if exists "Users can view their recurring invoice templates" on public.recurring_invoice_templates;
drop policy if exists "Users can manage their recurring invoice templates" on public.recurring_invoice_templates;
create policy "Users can view their recurring invoice templates" on public.recurring_invoice_templates for select to authenticated
  using (auth.uid() = user_id and public.has_active_access());
create policy "Users can manage their recurring invoice templates" on public.recurring_invoice_templates for all to authenticated
  using (auth.uid() = user_id and public.has_active_access())
  with check (
    auth.uid() = user_id
    and public.has_active_access()
    and exists (
      select 1 from public.customers c
      where c.id = customer_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "Users can view their cashbook reconciliations" on public.cashbook_reconciliations;
create policy "Users can view their cashbook reconciliations" on public.cashbook_reconciliations for select to authenticated
  using (auth.uid() = user_id and public.has_active_access());

drop policy if exists "Users can view their cashbook account openings" on public.cashbook_account_openings;
create policy "Users can view their cashbook account openings" on public.cashbook_account_openings for select to authenticated
  using (auth.uid() = user_id and public.has_active_access());

drop policy if exists "Users can manage their cashbook adjustments" on public.cashbook_adjustments;
create policy "Users can manage their cashbook adjustments" on public.cashbook_adjustments for all to authenticated
  using (auth.uid() = user_id and public.has_active_access())
  with check (
    auth.uid() = user_id
    and public.has_active_access()
    and account in ('cash', 'bank')
    and direction in ('income', 'expense')
    and amount > 0
  );

create or replace function public.enforce_paid_account_writes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  row_user_id uuid;
  row_invoice_id uuid;
begin
  if auth.role() = 'service_role' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if not public.has_active_access() then
    raise exception 'An active paid account is required for this operation'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    if tg_table_name = 'invoice_items' then
      row_invoice_id := old.invoice_id;
      select i.user_id into row_user_id from public.invoices i where i.id = row_invoice_id;
    else
      row_user_id := (to_jsonb(old)->>'user_id')::uuid;
    end if;
  else
    if tg_table_name = 'invoice_items' then
      row_invoice_id := new.invoice_id;
      select i.user_id into row_user_id from public.invoices i where i.id = row_invoice_id;
    else
      row_user_id := (to_jsonb(new)->>'user_id')::uuid;
    end if;
  end if;

  if row_user_id is distinct from auth.uid() then
    raise exception 'You cannot change another account''s data'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.enforce_paid_account_writes() from public, anon, authenticated;

drop trigger if exists require_paid_access_on_invoice_writes on public.invoices;
create trigger require_paid_access_on_invoice_writes
before insert or update or delete on public.invoices
for each row execute function public.enforce_paid_account_writes();

drop trigger if exists require_paid_access_on_invoice_item_writes on public.invoice_items;
create trigger require_paid_access_on_invoice_item_writes
before insert or update on public.invoice_items
for each row execute function public.enforce_paid_account_writes();

drop trigger if exists require_paid_access_on_invoice_payment_writes on public.invoice_payments;
create trigger require_paid_access_on_invoice_payment_writes
before insert or update on public.invoice_payments
for each row execute function public.enforce_paid_account_writes();

drop trigger if exists require_paid_access_on_recurring_template_writes on public.recurring_invoice_templates;
create trigger require_paid_access_on_recurring_template_writes
before insert or update on public.recurring_invoice_templates
for each row execute function public.enforce_paid_account_writes();

drop trigger if exists require_paid_access_on_cashbook_reconciliation_writes on public.cashbook_reconciliations;
create trigger require_paid_access_on_cashbook_reconciliation_writes
before insert or update on public.cashbook_reconciliations
for each row execute function public.enforce_paid_account_writes();

drop trigger if exists require_paid_access_on_cashbook_opening_writes on public.cashbook_account_openings;
create trigger require_paid_access_on_cashbook_opening_writes
before insert or update on public.cashbook_account_openings
for each row execute function public.enforce_paid_account_writes();

drop policy if exists "Users can view their expense receipts" on storage.objects;
create policy "Users can view their expense receipts" on storage.objects for select to authenticated
  using (
    bucket_id = 'expense-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_active_access()
  );
drop policy if exists "Users can upload their expense receipts" on storage.objects;
create policy "Users can upload their expense receipts" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'expense-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_active_access()
  );
drop policy if exists "Users can delete their expense receipts" on storage.objects;
create policy "Users can delete their expense receipts" on storage.objects for delete to authenticated
  using (
    bucket_id = 'expense-receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_active_access()
  );

drop policy if exists "Users can upload their business logo" on storage.objects;
create policy "Users can upload their business logo" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'business-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_active_access()
  );
drop policy if exists "Users can update their business logo" on storage.objects;
create policy "Users can update their business logo" on storage.objects for update to authenticated
  using (
    bucket_id = 'business-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_active_access()
  )
  with check (
    bucket_id = 'business-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_active_access()
  );
drop policy if exists "Users can delete their business logo" on storage.objects;
create policy "Users can delete their business logo" on storage.objects for delete to authenticated
  using (
    bucket_id = 'business-logos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.has_active_access()
  );

notify pgrst, 'reload schema';
