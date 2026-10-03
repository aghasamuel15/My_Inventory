create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  business_name text,
  business_logo_url text,
  subscription_status text default 'pending' check (subscription_status in ('pending', 'active', 'cancelled')),
  created_at timestamptz default now()
);

alter table public.profiles add column if not exists business_logo_url text;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  created_at timestamptz default now()
);

alter table public.customers add column if not exists address text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.customers'::regclass
      and constraint_row.conname = 'customers_user_id_fkey'
      and constraint_row.contype = 'f'
      and constraint_row.confrelid = 'auth.users'::regclass
  ) then
    alter table public.customers drop constraint if exists customers_user_id_fkey;
    alter table public.customers
      add constraint customers_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade not valid;
  end if;
end;
$$;

create table if not exists public.inventory_products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sku text,
  unit text not null default 'unit',
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0),
  selling_price numeric(12,2) not null default 0 check (selling_price >= 0),
  quantity numeric(12,2) not null default 0 check (quantity >= 0),
  low_stock_threshold numeric(12,2) not null default 5 check (low_stock_threshold >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, sku)
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.inventory_products(id) on delete restrict,
  quantity_change numeric(12,2) not null check (quantity_change <> 0),
  reason text not null default 'Stock adjustment',
  created_at timestamptz not null default now()
);

create index if not exists inventory_products_user_active_idx
  on public.inventory_products(user_id, is_active, name);
create index if not exists inventory_movements_user_created_idx
  on public.inventory_movements(user_id, created_at desc);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  product_id uuid references public.inventory_products(id) on delete set null,
  product_name text,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  cost_amount numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0,
  payment_account text not null default 'cash' check (payment_account in ('cash', 'bank', 'unassigned')),
  sale_date date not null default current_date,
  description text,
  created_at timestamptz default now()
);

alter table public.sales
  add column if not exists product_id uuid references public.inventory_products(id) on delete set null,
  add column if not exists product_name text,
  add column if not exists quantity numeric(12,2) not null default 1,
  add column if not exists unit_price numeric(12,2) not null default 0,
  add column if not exists cost_amount numeric(12,2) not null default 0,
  add column if not exists payment_account text;

update public.sales set payment_account = 'unassigned' where payment_account is null;
alter table public.sales alter column payment_account set default 'cash';
alter table public.sales alter column payment_account set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sales_payment_account_check' and conrelid = 'public.sales'::regclass) then
    alter table public.sales add constraint sales_payment_account_check check (payment_account in ('cash', 'bank', 'unassigned'));
  end if;
end;
$$;

create index if not exists sales_user_date_idx on public.sales(user_id, sale_date desc);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null default 0,
  expense_date date not null default current_date,
  category text,
  description text,
  receipt_path text,
  payment_account text not null default 'cash' check (payment_account in ('cash', 'bank', 'unassigned')),
  created_at timestamptz default now()
);
alter table public.expenses add column if not exists receipt_path text;
alter table public.expenses add column if not exists payment_account text;
update public.expenses set payment_account = 'unassigned' where payment_account is null;
alter table public.expenses alter column payment_account set default 'cash';
alter table public.expenses alter column payment_account set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'expenses_payment_account_check' and conrelid = 'public.expenses'::regclass) then
    alter table public.expenses add constraint expenses_payment_account_check check (payment_account in ('cash', 'bank', 'unassigned'));
  end if;
end;
$$;

create table if not exists public.cashbook_reconciliations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account text not null check (account in ('cash', 'bank')),
  start_date date not null,
  end_date date not null,
  opening_balance numeric(14,2) not null,
  sales_total numeric(14,2) not null,
  expenses_total numeric(14,2) not null,
  calculated_closing_balance numeric(14,2) not null,
  actual_closing_balance numeric(14,2) not null,
  variance numeric(14,2) not null,
  notes text,
  reconciled_at timestamptz not null default now(),
  constraint cashbook_reconciliations_dates_check check (start_date <= end_date)
);

create index if not exists cashbook_reconciliations_user_date_idx
  on public.cashbook_reconciliations(user_id, reconciled_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.expenses'::regclass
      and constraint_row.conname = 'expenses_user_id_fkey'
      and constraint_row.contype = 'f'
      and constraint_row.confrelid = 'auth.users'::regclass
  ) then
    alter table public.expenses drop constraint if exists expenses_user_id_fkey;
    alter table public.expenses
      add constraint expenses_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade not valid;
  end if;
end;
$$;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  total numeric(12,2) not null default 0,
  status text default 'unpaid' check (status in ('draft', 'unpaid', 'partial', 'paid')),
  document_type text not null default 'invoice' check (document_type in ('invoice', 'quote')),
  due_date date,
  description text,
  created_at timestamptz default now()
);

alter table public.invoices
  add column if not exists document_type text not null default 'invoice';

do $$
begin
  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.invoices'::regclass
      and constraint_row.conname = 'invoices_user_id_fkey'
      and constraint_row.contype = 'f'
      and constraint_row.confrelid = 'auth.users'::regclass
  ) then
    alter table public.invoices drop constraint if exists invoices_user_id_fkey;
    alter table public.invoices
      add constraint invoices_user_id_fkey
      foreign key (user_id) references auth.users(id) on delete cascade not valid;
  end if;
end;
$$;

create table if not exists public.access_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  amount numeric(12,2) not null default 0,
  reference text not null,
  status text default 'pending' check (status in ('pending', 'success', 'failed')),
  gateway text default 'paystack',
  created_at timestamptz default now()
);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit_price numeric(12,2) not null default 0,
  amount numeric(12,2) not null default 0,
  created_at timestamptz default now()
);

alter table public.invoices
  add column if not exists total numeric(12,2) not null default 0,
  add column if not exists invoice_number text,
  add column if not exists issue_date date default current_date,
  add column if not exists subtotal numeric(12,2) default 0,
  add column if not exists tax numeric(12,2) default 0,
  add column if not exists notes text,
  add column if not exists description text;

alter table public.invoices
  add column if not exists total_amount numeric(12,2) default 0;

update public.invoices
set total_amount = coalesce(total_amount, total, 0)
where total_amount is null;

alter table public.invoices
  alter column total_amount set default 0;

alter table public.invoices
  alter column total_amount drop not null;

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.inventory_products enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.sales enable row level security;
alter table public.expenses enable row level security;
alter table public.invoices enable row level security;
alter table public.access_payments enable row level security;
alter table public.invoice_items enable row level security;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, business_name, subscription_status)
  values (
    new.id,
    new.raw_user_meta_data ->> 'business_name',
    'pending'
  )
  on conflict (id) do update
    set business_name = excluded.business_name,
        subscription_status = coalesce(public.profiles.subscription_status, 'pending');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

drop policy if exists "Users can view their own profile" on public.profiles;
drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;

drop policy if exists "Users can view their customers" on public.customers;
drop policy if exists "Users can insert their customers" on public.customers;
drop policy if exists "Users can update their customers" on public.customers;
drop policy if exists "Users can delete their customers" on public.customers;
drop policy if exists "Users can view their inventory products" on public.inventory_products;
drop policy if exists "Users can insert their inventory products" on public.inventory_products;
drop policy if exists "Users can update their inventory products" on public.inventory_products;
drop policy if exists "Users can delete their inventory products" on public.inventory_products;
drop policy if exists "Users can view their inventory movements" on public.inventory_movements;
drop policy if exists "Users can insert their inventory movements" on public.inventory_movements;

drop policy if exists "Users can view their sales" on public.sales;
drop policy if exists "Users can insert their sales" on public.sales;
drop policy if exists "Users can update their sales" on public.sales;
drop policy if exists "Users can delete their sales" on public.sales;

drop policy if exists "Users can view their expenses" on public.expenses;
drop policy if exists "Users can insert their expenses" on public.expenses;
drop policy if exists "Users can update their expenses" on public.expenses;
drop policy if exists "Users can delete their expenses" on public.expenses;

drop policy if exists "Users can view their invoices" on public.invoices;
drop policy if exists "Users can insert their invoices" on public.invoices;
drop policy if exists "Users can update their invoices" on public.invoices;
drop policy if exists "Users can delete their invoices" on public.invoices;

drop policy if exists "Users can view their access payments" on public.access_payments;
drop policy if exists "Users can insert their access payments" on public.access_payments;

drop policy if exists "Users can view invoice items for their invoices" on public.invoice_items;
drop policy if exists "Users can insert invoice items for their invoices" on public.invoice_items;
drop policy if exists "Users can update invoice items for their invoices" on public.invoice_items;
drop policy if exists "Users can delete invoice items for their invoices" on public.invoice_items;

create policy "Users can view their own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can insert their own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "Users can view their customers" on public.customers for select using (auth.uid() = user_id);
create policy "Users can insert their customers" on public.customers for insert with check (auth.uid() = user_id);
create policy "Users can update their customers" on public.customers for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their customers" on public.customers for delete using (auth.uid() = user_id);

create policy "Users can view their inventory products" on public.inventory_products for select using (auth.uid() = user_id);
create policy "Users can insert their inventory products" on public.inventory_products for insert with check (auth.uid() = user_id);
create policy "Users can update their inventory products" on public.inventory_products for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their inventory products" on public.inventory_products for delete using (auth.uid() = user_id);
create policy "Users can view their inventory movements" on public.inventory_movements for select using (auth.uid() = user_id);
create policy "Users can insert their inventory movements" on public.inventory_movements for insert with check (
  auth.uid() = user_id and exists (
    select 1 from public.inventory_products p
    where p.id = inventory_movements.product_id and p.user_id = auth.uid()
  )
);

create policy "Users can view their sales" on public.sales for select using (auth.uid() = user_id);
create policy "Users can insert their sales" on public.sales for insert with check (auth.uid() = user_id);
create policy "Users can update their sales" on public.sales for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their sales" on public.sales for delete using (auth.uid() = user_id);

create or replace function public.adjust_inventory(
  p_product_id uuid,
  p_quantity_change numeric,
  p_reason text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  product_row public.inventory_products%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to adjust inventory';
  end if;
  if p_quantity_change = 0 then
    raise exception 'Enter a non-zero stock adjustment';
  end if;

  select * into product_row
  from public.inventory_products
  where id = p_product_id and user_id = auth.uid() and is_active
  for update;

  if not found then
    raise exception 'Product not found or inactive';
  end if;
  if product_row.quantity + p_quantity_change < 0 then
    raise exception 'Stock cannot be reduced below zero';
  end if;

  update public.inventory_products
  set quantity = quantity + p_quantity_change
  where id = p_product_id;

  insert into public.inventory_movements (user_id, product_id, quantity_change, reason)
  values (auth.uid(), p_product_id, p_quantity_change, coalesce(nullif(trim(p_reason), ''), 'Stock adjustment'));
end;
$$;

drop function if exists public.record_product_sale(uuid, uuid, numeric, date, text);
create or replace function public.record_product_sale(
  p_product_id uuid,
  p_customer_id uuid,
  p_quantity numeric,
  p_sale_date date,
  p_description text,
  p_sale_id uuid default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  product_row public.inventory_products%rowtype;
  sale_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to record a sale';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be greater than zero';
  end if;
  if p_sale_id is not null and exists (
    select 1 from public.sales where id = p_sale_id and user_id = auth.uid()
  ) then
    return p_sale_id;
  end if;

  select * into product_row
  from public.inventory_products
  where id = p_product_id and user_id = auth.uid() and is_active
  for update;

  if not found then
    raise exception 'Product not found or inactive';
  end if;
  if product_row.quantity < p_quantity then
    raise exception 'Not enough stock. Available: %', product_row.quantity;
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers c where c.id = p_customer_id and c.user_id = auth.uid()
  ) then
    raise exception 'Customer does not belong to this account';
  end if;

  insert into public.sales (
    id, user_id, customer_id, product_id, product_name, quantity,
    unit_price, cost_amount, amount, sale_date, description
  ) values (
    coalesce(p_sale_id, gen_random_uuid()), auth.uid(), p_customer_id, product_row.id, product_row.name, p_quantity,
    product_row.selling_price, product_row.cost_price * p_quantity,
    product_row.selling_price * p_quantity, coalesce(p_sale_date, current_date), p_description
  ) returning id into sale_id;

  update public.inventory_products
  set quantity = quantity - p_quantity
  where id = product_row.id;

  insert into public.inventory_movements (user_id, product_id, quantity_change, reason)
  values (auth.uid(), product_row.id, -p_quantity, 'Sale');

  return sale_id;
end;
$$;

create policy "Users can view their expenses" on public.expenses for select using (auth.uid() = user_id);
create policy "Users can insert their expenses" on public.expenses for insert with check (auth.uid() = user_id);
create policy "Users can update their expenses" on public.expenses for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their expenses" on public.expenses for delete using (auth.uid() = user_id);

create policy "Users can view their invoices" on public.invoices for select using (auth.uid() = user_id);
create policy "Users can insert their invoices" on public.invoices for insert with check (auth.uid() = user_id);
create policy "Users can update their invoices" on public.invoices for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their invoices" on public.invoices for delete using (auth.uid() = user_id);

create policy "Users can view their access payments" on public.access_payments for select using (auth.uid() = user_id);
create policy "Users can insert their access payments" on public.access_payments for insert with check (auth.uid() = user_id);

create policy "Users can view invoice items for their invoices" on public.invoice_items
for select using (exists (
  select 1 from public.invoices i
  where i.id = invoice_items.invoice_id and i.user_id = auth.uid()
));

create policy "Users can insert invoice items for their invoices" on public.invoice_items
for insert with check (exists (
  select 1 from public.invoices i
  where i.id = invoice_items.invoice_id and i.user_id = auth.uid()
));

create policy "Users can update invoice items for their invoices" on public.invoice_items
for update using (exists (
  select 1 from public.invoices i
  where i.id = invoice_items.invoice_id and i.user_id = auth.uid()
)) with check (exists (
  select 1 from public.invoices i
  where i.id = invoice_items.invoice_id and i.user_id = auth.uid()
));

create policy "Users can delete invoice items for their invoices" on public.invoice_items
for delete using (exists (
  select 1 from public.invoices i
  where i.id = invoice_items.invoice_id and i.user_id = auth.uid()
));

notify pgrst, 'reload schema';
