create table if not exists public.businesses (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'My Business',
  created_at timestamptz not null default now()
);

create table if not exists public.business_memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'manager', 'staff', 'viewer')),
  status text not null default 'active' check (status in ('active', 'pending')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists business_memberships_email_idx
  on public.business_memberships(business_id, lower(email));
create unique index if not exists business_memberships_one_owner_per_business_idx
  on public.business_memberships(business_id) where role = 'owner';
create index if not exists business_memberships_business_idx
  on public.business_memberships(business_id, status);

create table if not exists public.business_access_settings (
  id boolean primary key default true check (id),
  entitlements_enabled boolean not null default false
);
insert into public.business_access_settings (id, entitlements_enabled)
values (true, to_regprocedure('public.has_active_access()') is not null)
on conflict (id) do update
set entitlements_enabled = excluded.entitlements_enabled;

alter table public.profiles
  add column if not exists business_id uuid references public.businesses(id) on delete set null;

insert into public.businesses (id, name)
select p.id, coalesce(nullif(trim(p.business_name), ''), 'My Business')
from public.profiles p
on conflict (id) do update set name = excluded.name;

insert into public.business_memberships (business_id, user_id, email, role, status)
select p.id, p.id, coalesce(u.email, p.id::text || '@invalid.local'), 'owner', 'active'
from public.profiles p
left join auth.users u on u.id = p.id
on conflict (user_id) do update
set business_id = excluded.business_id, role = 'owner', status = 'active';

update public.profiles set business_id = id where business_id is null;

create or replace function public.current_business_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.business_id
  from public.business_memberships m
  where m.user_id = auth.uid() and m.status = 'active'
  limit 1
$$;

create or replace function public.current_business_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.role
  from public.business_memberships m
  where m.user_id = auth.uid() and m.status = 'active'
  limit 1
$$;

create or replace function public.can_write_business_data()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_business_role() in ('owner', 'manager', 'staff')
$$;

create or replace function public.can_manage_business()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_business_role() in ('owner', 'manager')
$$;

create or replace function public.has_active_access()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_business_role() = 'owner'
    or not coalesce((
      select entitlements_enabled from public.business_access_settings where id
    ), false)
    or exists (
      select 1
      from public.profiles p
      where p.id = public.current_business_id()
        and p.subscription_status = 'active'
    )
$$;

create or replace function public.set_business_owner_id()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_id uuid;
begin
  owner_id := coalesce(public.current_business_id(), new.user_id);
  if owner_id is null then
    raise exception 'Your account is not linked to an active business and no business owner ID was provided';
  end if;

  new.user_id := owner_id;
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'customers', 'inventory_products', 'inventory_movements', 'sales', 'expenses',
    'invoices', 'invoice_payments', 'invoice_email_logs',
    'recurring_invoice_templates', 'cashbook_reconciliations',
    'cashbook_account_openings', 'cashbook_adjustments'
  ] loop
    execute format('drop trigger if exists set_business_owner_id on public.%I', table_name);
    execute format(
      'create trigger set_business_owner_id before insert on public.%I for each row execute function public.set_business_owner_id()',
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'businesses', 'business_memberships', 'customers', 'inventory_products',
        'inventory_movements', 'sales', 'expenses', 'invoices', 'invoice_items',
        'invoice_payments', 'invoice_email_logs', 'recurring_invoice_templates',
        'cashbook_reconciliations', 'cashbook_account_openings', 'cashbook_adjustments'
      )
  loop
    execute format('drop policy %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end;
$$;

alter table public.businesses enable row level security;
alter table public.business_memberships enable row level security;

create policy "Business members can view their business" on public.businesses
for select to authenticated using (id = public.current_business_id());
create policy "Business managers can update their business" on public.businesses
for update to authenticated using (id = public.current_business_id() and public.can_manage_business())
with check (id = public.current_business_id() and public.can_manage_business());

create policy "Members can view own membership or managers can view team" on public.business_memberships
for select to authenticated using (
  user_id = auth.uid() or (business_id = public.current_business_id() and public.can_manage_business())
);
create policy "Managers can update non-owner memberships" on public.business_memberships
for update to authenticated using (
  business_id = public.current_business_id() and public.can_manage_business() and role <> 'owner'
) with check (
  business_id = public.current_business_id() and public.can_manage_business() and role <> 'owner'
);
create policy "Managers can remove non-owner memberships" on public.business_memberships
for delete to authenticated using (
  business_id = public.current_business_id() and public.can_manage_business() and role <> 'owner'
);

drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;
drop policy if exists "Business members can view profiles" on public.profiles;
create policy "Business members can view profiles" on public.profiles
for select to authenticated using (id = auth.uid() or business_id = public.current_business_id());
create policy "Users can update their own profile" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
grant update (business_name, business_logo_url) on public.profiles to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'customers', 'inventory_products', 'inventory_movements', 'sales', 'expenses',
    'invoices', 'invoice_payments', 'invoice_email_logs',
    'recurring_invoice_templates', 'cashbook_reconciliations',
    'cashbook_account_openings', 'cashbook_adjustments'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy "Business members can read" on public.%I for select to authenticated using (user_id = public.current_business_id() and public.has_active_access())',
      table_name
    );
    if table_name in ('cashbook_reconciliations', 'cashbook_account_openings') then
      continue;
    end if;
    if table_name = 'inventory_movements' then
      execute format(
        'create policy "Business staff can add movements" on public.%I for insert to authenticated with check (user_id = public.current_business_id() and public.can_write_business_data() and public.has_active_access())',
        table_name
      );
    elsif table_name = 'invoice_email_logs' then
      execute format(
        'create policy "Business staff can add invoice logs" on public.%I for insert to authenticated with check (user_id = public.current_business_id() and public.can_write_business_data() and public.has_active_access())'
        , table_name
      );
    else
      execute format(
        'create policy "Business staff can insert" on public.%I for insert to authenticated with check (user_id = public.current_business_id() and public.can_write_business_data() and public.has_active_access())',
        table_name
      );
      execute format(
        'create policy "Business staff can update" on public.%I for update to authenticated using (user_id = public.current_business_id() and public.can_write_business_data() and public.has_active_access()) with check (user_id = public.current_business_id() and public.can_write_business_data() and public.has_active_access())',
        table_name
      );
      execute format(
        'create policy "Business managers can delete" on public.%I for delete to authenticated using (user_id = public.current_business_id() and public.can_manage_business() and public.has_active_access())',
        table_name
      );
    end if;
  end loop;
end;
$$;

alter table public.invoice_items enable row level security;
create policy "Business members can view invoice items" on public.invoice_items
for select to authenticated using (exists (
  select 1 from public.invoices i
  where i.id = invoice_items.invoice_id and i.user_id = public.current_business_id()
));
create policy "Business staff can insert invoice items" on public.invoice_items
for insert to authenticated with check (public.can_write_business_data() and exists (
  select 1 from public.invoices i
  where i.id = invoice_items.invoice_id and i.user_id = public.current_business_id()
));
create policy "Business staff can update invoice items" on public.invoice_items
for update to authenticated using (public.can_write_business_data() and exists (
  select 1 from public.invoices i
  where i.id = invoice_items.invoice_id and i.user_id = public.current_business_id()
)) with check (public.can_write_business_data() and exists (
  select 1 from public.invoices i
  where i.id = invoice_items.invoice_id and i.user_id = public.current_business_id()
));
create policy "Business managers can delete invoice items" on public.invoice_items
for delete to authenticated using (public.can_manage_business() and exists (
  select 1 from public.invoices i
  where i.id = invoice_items.invoice_id and i.user_id = public.current_business_id()
));

create or replace function public.adjust_inventory(
  p_product_id uuid,
  p_quantity_change numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  business_id_value uuid := public.current_business_id();
  product_row public.inventory_products%rowtype;
begin
  if business_id_value is null or not public.can_write_business_data() or not public.has_active_access() then
    raise exception 'You do not have permission to adjust inventory';
  end if;
  if p_quantity_change is null or p_quantity_change = 0 then
    raise exception 'Enter a non-zero stock adjustment';
  end if;

  select * into product_row
  from public.inventory_products
  where id = p_product_id and user_id = business_id_value and is_active
  for update;
  if not found then raise exception 'Product not found or inactive'; end if;
  if product_row.quantity + p_quantity_change < 0 then
    raise exception 'Stock cannot be reduced below zero';
  end if;

  update public.inventory_products
  set quantity = quantity + p_quantity_change
  where id = p_product_id;
  insert into public.inventory_movements (user_id, product_id, quantity_change, reason)
  values (business_id_value, p_product_id, p_quantity_change, coalesce(nullif(trim(p_reason), ''), 'Stock adjustment'));
end;
$$;

create or replace function public.record_product_sale(
  p_product_id uuid,
  p_customer_id uuid,
  p_quantity numeric,
  p_sale_date date,
  p_description text,
  p_sale_id uuid default null,
  p_payment_account text default 'cash'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  business_id_value uuid := public.current_business_id();
  product_row public.inventory_products%rowtype;
  sale_id uuid;
begin
  if business_id_value is null or not public.can_write_business_data() or not public.has_active_access() then
    raise exception 'You do not have permission to record a sale';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;
  if p_payment_account is null or p_payment_account not in ('cash', 'bank') then
    raise exception 'Choose cash or bank for the sale';
  end if;
  if p_sale_id is not null and exists (
    select 1 from public.sales where id = p_sale_id and user_id = business_id_value
  ) then return p_sale_id; end if;

  select * into product_row
  from public.inventory_products
  where id = p_product_id and user_id = business_id_value and is_active
  for update;
  if not found then raise exception 'Product not found or inactive'; end if;
  if product_row.quantity < p_quantity then
    raise exception 'Not enough stock. Available: %', product_row.quantity;
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers
    where id = p_customer_id and user_id = business_id_value
  ) then raise exception 'Customer does not belong to this business'; end if;

  insert into public.sales (
    id, user_id, customer_id, product_id, product_name, quantity,
    unit_price, cost_amount, amount, sale_date, description, payment_account
  ) values (
    coalesce(p_sale_id, gen_random_uuid()), business_id_value, p_customer_id,
    product_row.id, product_row.name, p_quantity, product_row.selling_price,
    product_row.cost_price * p_quantity, product_row.selling_price * p_quantity,
    coalesce(p_sale_date, current_date), p_description, p_payment_account
  ) returning id into sale_id;

  update public.inventory_products
  set quantity = quantity - p_quantity
  where id = product_row.id;
  insert into public.inventory_movements (user_id, product_id, quantity_change, reason)
  values (business_id_value, product_row.id, -p_quantity, 'Sale');
  return sale_id;
end;
$$;

create or replace function public.create_invoice_with_items(
  p_customer_id uuid,
  p_issue_date date,
  p_due_date date,
  p_tax numeric,
  p_notes text,
  p_items jsonb,
  p_document_type text default 'invoice'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  business_id_value uuid := public.current_business_id();
  new_invoice_id uuid := gen_random_uuid();
  invoice_subtotal numeric(12,2);
  invoice_tax numeric(12,2);
  invoice_total numeric(12,2);
  invoice_issue_date date := coalesce(p_issue_date, current_date);
  item_record record;
begin
  if business_id_value is null or not public.can_write_business_data() or not public.has_active_access() then
    raise exception 'You do not have permission to create invoices';
  end if;
  if p_customer_id is null or not exists (
    select 1 from public.customers where id = p_customer_id and user_id = business_id_value
  ) then raise exception 'Select a customer from this business'; end if;
  if p_document_type is null or p_document_type not in ('invoice', 'quote') then
    raise exception 'Select a valid document type';
  end if;
  if p_tax is null or p_tax < 0 then raise exception 'Tax cannot be negative'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one invoice item';
  end if;

  for item_record in
    select * from jsonb_to_recordset(p_items)
      as item(description text, quantity numeric, unit_price numeric)
  loop
    if nullif(trim(item_record.description), '') is null
      or item_record.quantity is null or item_record.quantity <= 0
      or item_record.unit_price is null or item_record.unit_price < 0 then
      raise exception 'Invoice items need a description, positive quantity, and non-negative price';
    end if;
  end loop;

  select round(coalesce(sum(round(item.quantity * round(item.unit_price, 2), 2)), 0), 2)
    into invoice_subtotal
  from jsonb_to_recordset(p_items)
    as item(description text, quantity numeric, unit_price numeric);
  invoice_tax := round(p_tax, 2);
  invoice_total := round(invoice_subtotal + invoice_tax, 2);
  if invoice_total <= 0 then raise exception 'Invoice total must be greater than zero'; end if;

  insert into public.invoices (
    id, user_id, customer_id, invoice_number, issue_date, due_date,
    subtotal, tax, total, total_amount, status, document_type, notes, description
  ) values (
    new_invoice_id, business_id_value, p_customer_id,
    'INV-' || to_char(invoice_issue_date, 'YYYYMMDD') || '-' ||
      upper(substr(replace(new_invoice_id::text, '-', ''), 1, 8)),
    invoice_issue_date, p_due_date, invoice_subtotal, invoice_tax,
    invoice_total, invoice_total,
    case when p_document_type = 'quote' then 'draft' else 'unpaid' end,
    p_document_type, nullif(trim(p_notes), ''), null
  );
  insert into public.invoice_items (invoice_id, description, quantity, unit_price, amount)
  select new_invoice_id, trim(item.description), item.quantity,
    round(item.unit_price, 2), round(item.quantity * round(item.unit_price, 2), 2)
  from jsonb_to_recordset(p_items)
    as item(description text, quantity numeric, unit_price numeric);
  return new_invoice_id;
end;
$$;

create or replace function public.record_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_method text,
  p_reference text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  business_id_value uuid := public.current_business_id();
  invoice_row public.invoices%rowtype;
  paid_total numeric(12,2);
  new_payment_id uuid;
begin
  if business_id_value is null or not public.can_write_business_data() or not public.has_active_access() then
    raise exception 'You do not have permission to record invoice payments';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Payment amount must be greater than zero'; end if;
  if p_method is null or p_method not in ('cash', 'bank_transfer', 'card', 'other') then
    raise exception 'Select a valid payment method';
  end if;
  select * into invoice_row
  from public.invoices
  where id = p_invoice_id and user_id = business_id_value
  for update;
  if not found then raise exception 'Invoice not found'; end if;
  if invoice_row.document_type <> 'invoice' or invoice_row.status = 'draft' then
    raise exception 'Only issued invoices can receive payments';
  end if;
  select coalesce(sum(amount), 0) into paid_total
  from public.invoice_payments where invoice_id = p_invoice_id;
  if round(p_amount, 2) > invoice_row.total - paid_total then
    raise exception 'Payment exceeds the remaining invoice balance';
  end if;
  insert into public.invoice_payments (
    invoice_id, user_id, amount, payment_date, method, reference, notes
  ) values (
    p_invoice_id, business_id_value, round(p_amount, 2), coalesce(p_payment_date, current_date),
    p_method, nullif(trim(p_reference), ''), nullif(trim(p_notes), '')
  ) returning id into new_payment_id;
  return new_payment_id;
end;
$$;

create or replace function public.assign_invoice_payment_cashbook_account(
  p_payment_id uuid,
  p_account text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.can_write_business_data() or not public.has_active_access() then
    raise exception 'You do not have permission to categorize invoice payments';
  end if;
  if p_account is null or p_account not in ('cash', 'bank') then
    raise exception 'Choose cash or bank for the invoice payment';
  end if;
  update public.invoice_payments
  set cashbook_account = p_account
  where id = p_payment_id
    and user_id = public.current_business_id()
    and method = 'other'
    and cashbook_account = 'unassigned';
  if not found then raise exception 'Invoice payment not found or already categorized'; end if;
end;
$$;

create or replace function public.get_cashbook_period_totals(
  p_start_date date,
  p_end_date date,
  p_account text
)
returns table (
  account text,
  sales_total numeric,
  expenses_total numeric,
  adjustment_income numeric,
  adjustment_expenses numeric,
  opening_balance numeric,
  opening_is_initial boolean,
  unassigned_count bigint
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
declare
  business_id_value uuid := public.current_business_id();
begin
  if business_id_value is null or not public.has_active_access() then
    raise exception 'Your business does not have access to Cashbook';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'Enter a valid cashbook date range';
  end if;
  if p_account is null or p_account not in ('cash', 'bank') then
    raise exception 'Choose cash or bank as the account';
  end if;

  return query
  select
    p_account,
    (
      coalesce((select sum(s.amount) from public.sales s
        where s.user_id = business_id_value and s.payment_account = p_account
          and s.sale_date between p_start_date and p_end_date), 0)
      + coalesce((select sum(ip.amount) from public.invoice_payments ip
        where ip.user_id = business_id_value and ip.cashbook_account = p_account
          and ip.payment_date between p_start_date and p_end_date), 0)
    )::numeric,
    coalesce((select sum(e.amount) from public.expenses e
      where e.user_id = business_id_value and e.payment_account = p_account
        and e.expense_date between p_start_date and p_end_date), 0)::numeric,
    coalesce((select sum(a.amount) from public.cashbook_adjustments a
      where a.user_id = business_id_value and a.account = p_account
        and a.direction = 'income' and a.transaction_date between p_start_date and p_end_date), 0)::numeric,
    coalesce((select sum(a.amount) from public.cashbook_adjustments a
      where a.user_id = business_id_value and a.account = p_account
        and a.direction = 'expense' and a.transaction_date between p_start_date and p_end_date), 0)::numeric,
    coalesce(
      (select r.actual_closing_balance from public.cashbook_reconciliations r
        where r.user_id = business_id_value and r.account = p_account and r.end_date < p_start_date
        order by r.end_date desc, r.reconciled_at desc limit 1),
      (select o.initial_balance from public.cashbook_account_openings o
        where o.user_id = business_id_value and o.account = p_account)
    ),
    not exists (select 1 from public.cashbook_reconciliations r
      where r.user_id = business_id_value and r.account = p_account and r.end_date < p_start_date),
    (
      select count(*)::bigint from (
        select s.id from public.sales s where s.user_id = business_id_value
          and s.payment_account = 'unassigned' and s.sale_date between p_start_date and p_end_date
        union all
        select e.id from public.expenses e where e.user_id = business_id_value
          and e.payment_account = 'unassigned' and e.expense_date between p_start_date and p_end_date
        union all
        select ip.id from public.invoice_payments ip where ip.user_id = business_id_value
          and ip.cashbook_account = 'unassigned' and ip.payment_date between p_start_date and p_end_date
      ) unassigned
    );
end;
$$;

create or replace function public.reconcile_cashbook(
  p_account text,
  p_start_date date,
  p_end_date date,
  p_actual_closing_balance numeric,
  p_notes text default null,
  p_initial_opening_balance numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  business_id_value uuid := public.current_business_id();
  total_sales numeric(14,2);
  total_expenses numeric(14,2);
  opening_balance_value numeric(14,2);
  calculated_balance numeric(14,2);
  reconciliation_id uuid;
begin
  if business_id_value is null or not public.can_write_business_data() or not public.has_active_access() then
    raise exception 'You do not have permission to reconcile the Cashbook';
  end if;
  if p_account is null or p_account not in ('cash', 'bank')
    or p_start_date is null or p_end_date is null or p_start_date > p_end_date
    or p_actual_closing_balance is null then
    raise exception 'Enter a valid account, date range, and actual closing balance';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(business_id_value::text),
    hashtext(p_account || p_start_date::text || p_end_date::text)
  );
  select coalesce(sum(s.amount), 0) + coalesce((
    select sum(ip.amount) from public.invoice_payments ip
    where ip.user_id = business_id_value and ip.cashbook_account = p_account
      and ip.payment_date between p_start_date and p_end_date
  ), 0) into total_sales
  from public.sales s
  where s.user_id = business_id_value and s.payment_account = p_account
    and s.sale_date between p_start_date and p_end_date;
  select coalesce(sum(e.amount), 0) into total_expenses
  from public.expenses e
  where e.user_id = business_id_value and e.payment_account = p_account
    and e.expense_date between p_start_date and p_end_date;

  select r.actual_closing_balance into opening_balance_value
  from public.cashbook_reconciliations r
  where r.user_id = business_id_value and r.account = p_account and r.end_date < p_start_date
  order by r.end_date desc, r.reconciled_at desc limit 1;
  if opening_balance_value is null then
    select o.initial_balance into opening_balance_value
    from public.cashbook_account_openings o
    where o.user_id = business_id_value and o.account = p_account;
    if opening_balance_value is null then
      if p_initial_opening_balance is null then
        raise exception 'Enter the initial opening balance for this account';
      end if;
      insert into public.cashbook_account_openings (user_id, account, initial_balance)
      values (business_id_value, p_account, p_initial_opening_balance)
      on conflict (user_id, account) do nothing;
      select o.initial_balance into opening_balance_value
      from public.cashbook_account_openings o
      where o.user_id = business_id_value and o.account = p_account;
    end if;
  end if;

  if exists (
    select 1 from public.sales s where s.user_id = business_id_value
      and s.payment_account = 'unassigned' and s.sale_date between p_start_date and p_end_date
    union all
    select 1 from public.expenses e where e.user_id = business_id_value
      and e.payment_account = 'unassigned' and e.expense_date between p_start_date and p_end_date
    union all
    select 1 from public.invoice_payments ip where ip.user_id = business_id_value
      and ip.cashbook_account = 'unassigned' and ip.payment_date between p_start_date and p_end_date
  ) then raise exception 'Assign every transaction in the date range to cash or bank before reconciling'; end if;

  select opening_balance_value + total_sales - total_expenses
    + coalesce(sum(a.amount) filter (where a.direction = 'income'), 0)
    - coalesce(sum(a.amount) filter (where a.direction = 'expense'), 0)
  into calculated_balance
  from public.cashbook_adjustments a
  where a.user_id = business_id_value and a.account = p_account
    and a.transaction_date between p_start_date and p_end_date;

  select r.id into reconciliation_id
  from public.cashbook_reconciliations r
  where r.user_id = business_id_value and r.account = p_account
    and r.start_date = p_start_date and r.end_date = p_end_date
  order by r.reconciled_at desc limit 1 for update;
  if reconciliation_id is null then
    insert into public.cashbook_reconciliations (
      user_id, account, start_date, end_date, opening_balance, sales_total,
      expenses_total, calculated_closing_balance, actual_closing_balance, variance, notes
    ) values (
      business_id_value, p_account, p_start_date, p_end_date, opening_balance_value,
      total_sales, total_expenses, calculated_balance, p_actual_closing_balance,
      p_actual_closing_balance - calculated_balance, nullif(trim(p_notes), '')
    ) returning id into reconciliation_id;
  else
    update public.cashbook_reconciliations
    set opening_balance = opening_balance_value, sales_total = total_sales,
      expenses_total = total_expenses, calculated_closing_balance = calculated_balance,
      actual_closing_balance = p_actual_closing_balance,
      variance = p_actual_closing_balance - calculated_balance,
      notes = nullif(trim(p_notes), ''), reconciled_at = now()
    where id = reconciliation_id;
  end if;
  return reconciliation_id;
end;
$$;

revoke all on function public.adjust_inventory(uuid, numeric, text) from public, anon;
grant execute on function public.adjust_inventory(uuid, numeric, text) to authenticated;
revoke all on function public.record_product_sale(uuid, uuid, numeric, date, text, uuid, text) from public, anon;
grant execute on function public.record_product_sale(uuid, uuid, numeric, date, text, uuid, text) to authenticated;
revoke all on function public.create_invoice_with_items(uuid, date, date, numeric, text, jsonb, text) from public, anon;
grant execute on function public.create_invoice_with_items(uuid, date, date, numeric, text, jsonb, text) to authenticated;
revoke all on function public.record_invoice_payment(uuid, numeric, date, text, text, text) from public, anon;
grant execute on function public.record_invoice_payment(uuid, numeric, date, text, text, text) to authenticated;
revoke all on function public.assign_invoice_payment_cashbook_account(uuid, text) from public, anon;
grant execute on function public.assign_invoice_payment_cashbook_account(uuid, text) to authenticated;
revoke all on function public.get_cashbook_period_totals(date, date, text) from public, anon;
grant execute on function public.get_cashbook_period_totals(date, date, text) to authenticated;
revoke all on function public.reconcile_cashbook(text, date, date, numeric, text, numeric) from public, anon;
grant execute on function public.reconcile_cashbook(text, date, date, numeric, text, numeric) to authenticated;

create table if not exists public.bank_statement_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_date date not null,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  direction text not null check (direction in ('income', 'expense')),
  fingerprint text not null,
  matched_type text check (matched_type in ('sale', 'expense', 'invoice_payment')),
  matched_id uuid,
  adjustment_id uuid references public.cashbook_adjustments(id) on delete set null,
  status text not null check (status in ('matched', 'imported')),
  created_at timestamptz not null default now(),
  unique (user_id, fingerprint),
  check ((status = 'matched' and matched_type is not null and matched_id is not null and adjustment_id is null)
    or (status = 'imported' and matched_type is null and matched_id is null and adjustment_id is not null))
);

create unique index if not exists bank_statement_match_once_idx
  on public.bank_statement_transactions(user_id, matched_type, matched_id)
  where matched_type is not null and matched_id is not null;
create index if not exists bank_statement_transactions_date_idx
  on public.bank_statement_transactions(user_id, transaction_date desc);
alter table public.bank_statement_transactions enable row level security;
drop policy if exists "Business members can view bank statement transactions" on public.bank_statement_transactions;
create policy "Business members can view bank statement transactions" on public.bank_statement_transactions
for select to authenticated using (user_id = public.current_business_id() and public.has_active_access());

create or replace function public.update_business_profile(p_name text, p_logo_url text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  business_id_value uuid := public.current_business_id();
begin
  if business_id_value is null or not public.can_manage_business() then
    raise exception 'Only business owners and managers can update the business profile';
  end if;
  if nullif(trim(p_name), '') is null or length(trim(p_name)) > 120 then
    raise exception 'Enter a business name of 1 to 120 characters';
  end if;
  update public.businesses set name = trim(p_name) where id = business_id_value;
  update public.profiles
  set business_name = trim(p_name), business_logo_url = p_logo_url
  where id = business_id_value;
end;
$$;
revoke all on function public.update_business_profile(text, text) from public, anon;
grant execute on function public.update_business_profile(text, text) to authenticated;

drop policy if exists "Users can upload their business logo" on storage.objects;
drop policy if exists "Business managers can upload business logo" on storage.objects;
create policy "Business managers can upload business logo" on storage.objects
for insert to authenticated with check (
  bucket_id = 'business-logos'
  and (storage.foldername(name))[1] = public.current_business_id()::text
  and public.can_manage_business()
);
drop policy if exists "Users can update their business logo" on storage.objects;
drop policy if exists "Business managers can update business logo" on storage.objects;
create policy "Business managers can update business logo" on storage.objects
for update to authenticated using (
  bucket_id = 'business-logos'
  and (storage.foldername(name))[1] = public.current_business_id()::text
  and public.can_manage_business()
) with check (
  bucket_id = 'business-logos'
  and (storage.foldername(name))[1] = public.current_business_id()::text
  and public.can_manage_business()
);
drop policy if exists "Users can delete their business logo" on storage.objects;
drop policy if exists "Business managers can delete business logo" on storage.objects;
create policy "Business managers can delete business logo" on storage.objects
for delete to authenticated using (
  bucket_id = 'business-logos'
  and (storage.foldername(name))[1] = public.current_business_id()::text
  and public.can_manage_business()
);

drop policy if exists "Users can view their expense receipts" on storage.objects;
drop policy if exists "Business members can view expense receipts" on storage.objects;
create policy "Business members can view expense receipts" on storage.objects
for select to authenticated using (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = public.current_business_id()::text
  and public.has_active_access()
);
drop policy if exists "Users can upload their expense receipts" on storage.objects;
drop policy if exists "Business staff can upload expense receipts" on storage.objects;
create policy "Business staff can upload expense receipts" on storage.objects
for insert to authenticated with check (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = public.current_business_id()::text
  and public.can_write_business_data()
  and public.has_active_access()
);
drop policy if exists "Users can delete their expense receipts" on storage.objects;
drop policy if exists "Business staff can delete expense receipts" on storage.objects;
create policy "Business staff can delete expense receipts" on storage.objects
for delete to authenticated using (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = public.current_business_id()::text
  and public.can_write_business_data()
  and public.has_active_access()
);

create or replace function public.import_bank_statement_transaction(
  p_transaction_date date,
  p_description text,
  p_amount numeric,
  p_direction text,
  p_fingerprint text,
  p_matched_type text default null,
  p_matched_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_id uuid := public.current_business_id();
  transaction_id uuid;
  adjustment_id uuid;
begin
  if owner_id is null or not public.can_write_business_data() then
    raise exception 'You do not have permission to import bank transactions';
  end if;
  if p_transaction_date is null or p_amount is null or p_amount <= 0
    or p_direction not in ('income', 'expense') or nullif(trim(p_description), '') is null
    or nullif(trim(p_fingerprint), '') is null then
    raise exception 'The bank transaction has invalid date, amount, direction, description, or fingerprint';
  end if;

  if p_matched_type is not null then
    if p_matched_id is null then raise exception 'Choose a transaction to match'; end if;
    if p_matched_type not in ('sale', 'expense', 'invoice_payment') then
      raise exception 'Choose a valid transaction to match';
    end if;
    if p_matched_type = 'sale' and not exists (
      select 1 from public.sales where id = p_matched_id and user_id = owner_id
        and round(amount, 2) = round(p_amount, 2) and p_direction = 'income'
        and abs(sale_date - p_transaction_date) <= 3
    ) then raise exception 'The selected sale does not match this bank transaction'; end if;
    if p_matched_type = 'expense' and not exists (
      select 1 from public.expenses where id = p_matched_id and user_id = owner_id
        and round(amount, 2) = round(p_amount, 2) and p_direction = 'expense'
        and abs(expense_date - p_transaction_date) <= 3
    ) then raise exception 'The selected expense does not match this bank transaction'; end if;
    if p_matched_type = 'invoice_payment' and not exists (
      select 1 from public.invoice_payments where id = p_matched_id and user_id = owner_id
        and round(amount, 2) = round(p_amount, 2) and p_direction = 'income'
        and abs(payment_date - p_transaction_date) <= 3
    ) then raise exception 'The selected invoice payment does not match this bank transaction'; end if;
    insert into public.bank_statement_transactions (
      user_id, transaction_date, description, amount, direction, fingerprint,
      matched_type, matched_id, status
    ) values (
      owner_id, p_transaction_date, trim(p_description), round(p_amount, 2), p_direction,
      p_fingerprint, p_matched_type, p_matched_id, 'matched'
    ) on conflict (user_id, fingerprint) do nothing returning id into transaction_id;
  else
    insert into public.cashbook_adjustments (user_id, account, direction, amount, transaction_date, description)
    values (owner_id, 'bank', p_direction, round(p_amount, 2), p_transaction_date, trim(p_description))
    returning id into adjustment_id;
    insert into public.bank_statement_transactions (
      user_id, transaction_date, description, amount, direction, fingerprint,
      adjustment_id, status
    ) values (
      owner_id, p_transaction_date, trim(p_description), round(p_amount, 2), p_direction,
      p_fingerprint, adjustment_id, 'imported'
    ) on conflict (user_id, fingerprint) do nothing returning id into transaction_id;
    if transaction_id is null then
      delete from public.cashbook_adjustments where id = adjustment_id;
      select id into transaction_id from public.bank_statement_transactions
      where user_id = owner_id and fingerprint = p_fingerprint;
    end if;
  end if;

  if transaction_id is null then
    select id into transaction_id from public.bank_statement_transactions
    where user_id = owner_id and fingerprint = p_fingerprint;
  end if;
  return transaction_id;
end;
$$;

revoke all on function public.import_bank_statement_transaction(date, text, numeric, text, text, text, uuid) from public, anon;
grant execute on function public.import_bank_statement_transaction(date, text, numeric, text, text, text, uuid) to authenticated;

create or replace function public.accept_business_invitation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invited_business_id uuid;
begin
  if new.email is null then return new; end if;
  update public.business_memberships
  set user_id = new.id, status = 'active'
  where lower(email) = lower(new.email) and status = 'pending'
  returning business_id into invited_business_id;
  if invited_business_id is not null then
    update public.profiles set business_id = invited_business_id where id = new.id;
  end if;
  return new;
end;
$$;

create or replace function public.create_personal_business()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  business_name_value text;
begin
  if exists (select 1 from public.business_memberships where user_id = new.id) then
    return new;
  end if;

  if new.email is not null and exists (
    select 1 from public.business_memberships
    where lower(email) = lower(new.email) and status = 'pending'
  ) then
    return new;
  end if;

  business_name_value := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'business_name'), ''),
    'My Business'
  );
  insert into public.businesses (id, name) values (new.id, business_name_value)
  on conflict (id) do nothing;
  insert into public.business_memberships (business_id, user_id, email, role, status)
  values (new.id, new.id, coalesce(new.email, new.id::text || '@invalid.local'), 'owner', 'active')
  on conflict (user_id) do nothing;
  update public.profiles set business_id = new.id where id = new.id;
  return new;
end;
$$;

drop trigger if exists z_create_personal_business on auth.users;
create trigger z_create_personal_business
after insert on auth.users
for each row execute function public.create_personal_business();

drop trigger if exists z_accept_business_invitation on auth.users;
create trigger z_accept_business_invitation
after insert on auth.users
for each row execute function public.accept_business_invitation();

create or replace function public.invite_business_member(p_email text, p_role text)
returns table (membership_id uuid, invited_email text, member_role text, invitation_status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  business_id_value uuid := public.current_business_id();
  email_value text := lower(trim(p_email));
  user_id_value uuid;
begin
  if business_id_value is null or not public.can_manage_business() then
    raise exception 'Only business owners and managers can invite team members';
  end if;
  if email_value !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'Enter a valid email address';
  end if;
  if p_role not in ('manager', 'staff', 'viewer') then
    raise exception 'Choose manager, staff, or viewer for the new member';
  end if;
  if exists (
    select 1 from public.business_memberships
    where lower(email) = email_value
      and status in ('active', 'pending')
      and business_id <> business_id_value
  ) then
    raise exception 'This account already belongs to another business';
  end if;
  if exists (
    select 1 from public.business_memberships
    where business_id = business_id_value
      and lower(email) = email_value
      and role = 'owner'
  ) then
    raise exception 'The business owner cannot be changed through an invitation';
  end if;

  select u.id into user_id_value from auth.users u where lower(u.email) = email_value limit 1;
  return query
  insert into public.business_memberships (business_id, user_id, email, role, status, invited_by)
  values (business_id_value, user_id_value, email_value, p_role,
    case when user_id_value is null then 'pending' else 'active' end, auth.uid())
  on conflict (business_id, (lower(email))) do update
    set role = excluded.role,
        user_id = coalesce(public.business_memberships.user_id, excluded.user_id),
        status = case when coalesce(public.business_memberships.user_id, excluded.user_id) is null then 'pending' else 'active' end,
        invited_by = excluded.invited_by
  returning id, email, role, status;
  if user_id_value is not null then
    update public.profiles set business_id = business_id_value where id = user_id_value;
  end if;
end;
$$;

revoke all on function public.invite_business_member(text, text) from public, anon;
grant execute on function public.invite_business_member(text, text) to authenticated;

notify pgrst, 'reload schema';
