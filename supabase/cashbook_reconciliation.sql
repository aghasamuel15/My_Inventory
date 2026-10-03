alter table public.sales add column if not exists payment_account text;
alter table public.sales alter column payment_account set default 'cash';
update public.sales set payment_account = 'unassigned' where payment_account is null;
alter table public.sales alter column payment_account set not null;
create index if not exists sales_user_account_date_idx
  on public.sales(user_id, payment_account, sale_date);

alter table public.expenses add column if not exists payment_account text;
alter table public.expenses alter column payment_account set default 'cash';
update public.expenses set payment_account = 'unassigned' where payment_account is null;
alter table public.expenses alter column payment_account set not null;
create index if not exists expenses_user_account_date_idx
  on public.expenses(user_id, payment_account, expense_date);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sales_payment_account_check' and conrelid = 'public.sales'::regclass) then
    alter table public.sales add constraint sales_payment_account_check check (payment_account in ('cash', 'bank', 'unassigned'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_payment_account_check' and conrelid = 'public.expenses'::regclass) then
    alter table public.expenses add constraint expenses_payment_account_check check (payment_account in ('cash', 'bank', 'unassigned'));
  end if;
end;
$$;

alter table public.invoice_payments add column if not exists cashbook_account text;
update public.invoice_payments
set cashbook_account = case
  when method = 'cash' then 'cash'
  when method in ('bank_transfer', 'card') then 'bank'
  else 'unassigned'
end
where cashbook_account is null;
alter table public.invoice_payments alter column cashbook_account set default 'unassigned';
alter table public.invoice_payments alter column cashbook_account set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoice_payments_cashbook_account_check' and conrelid = 'public.invoice_payments'::regclass) then
    alter table public.invoice_payments add constraint invoice_payments_cashbook_account_check check (cashbook_account in ('cash', 'bank', 'unassigned'));
  end if;
end;
$$;

create index if not exists invoice_payments_user_cashbook_date_idx
  on public.invoice_payments(user_id, cashbook_account, payment_date);

create or replace function public.set_invoice_payment_cashbook_account()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.method = 'cash' then
    new.cashbook_account := 'cash';
  elsif new.method in ('bank_transfer', 'card') then
    new.cashbook_account := 'bank';
  elsif tg_op = 'INSERT' or old.method is distinct from new.method then
    new.cashbook_account := 'unassigned';
  end if;
  return new;
end;
$$;

drop trigger if exists invoice_payments_set_cashbook_account on public.invoice_payments;
create trigger invoice_payments_set_cashbook_account
before insert or update of method on public.invoice_payments
for each row execute function public.set_invoice_payment_cashbook_account();

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

alter table public.cashbook_reconciliations enable row level security;
revoke all on public.cashbook_reconciliations from anon, authenticated;
grant select on public.cashbook_reconciliations to authenticated;

drop policy if exists "Users can view their cashbook reconciliations" on public.cashbook_reconciliations;
create policy "Users can view their cashbook reconciliations"
  on public.cashbook_reconciliations for select using (auth.uid() = user_id);

drop policy if exists "Users can create their cashbook reconciliations" on public.cashbook_reconciliations;

create table if not exists public.cashbook_account_openings (
  user_id uuid not null references auth.users(id) on delete cascade,
  account text not null check (account in ('cash', 'bank')),
  initial_balance numeric(14,2) not null,
  created_at timestamptz not null default now(),
  primary key (user_id, account)
);

alter table public.cashbook_account_openings enable row level security;
revoke all on public.cashbook_account_openings from anon, authenticated;
grant select on public.cashbook_account_openings to authenticated;
drop policy if exists "Users can view their cashbook account openings" on public.cashbook_account_openings;
create policy "Users can view their cashbook account openings"
  on public.cashbook_account_openings for select using (auth.uid() = user_id);

create table if not exists public.cashbook_adjustments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account text not null check (account in ('cash', 'bank')),
  direction text not null check (direction in ('income', 'expense')),
  amount numeric(14,2) not null check (amount > 0),
  transaction_date date not null,
  description text not null,
  created_at timestamptz not null default now()
);

create index if not exists cashbook_adjustments_user_account_date_idx
  on public.cashbook_adjustments(user_id, account, transaction_date);
alter table public.cashbook_adjustments enable row level security;
revoke all on public.cashbook_adjustments from anon;
grant select, insert, update, delete on public.cashbook_adjustments to authenticated;
drop policy if exists "Users can manage their cashbook adjustments" on public.cashbook_adjustments;
create policy "Users can manage their cashbook adjustments"
  on public.cashbook_adjustments for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and account in ('cash', 'bank') and direction in ('income', 'expense') and amount > 0);

drop function if exists public.get_cashbook_period_totals(date, date);
drop function if exists public.get_cashbook_period_totals(date, date, text);
create function public.get_cashbook_period_totals(
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
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to view cashbook totals';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'Enter a valid cashbook date range';
  end if;
  if p_account is null or p_account not in ('cash', 'bank') then
    raise exception 'Choose cash or bank as the account';
  end if;

  return query
  select
    accounts.account_name,
    (
      coalesce((
        select sum(s.amount)
        from public.sales s
        where s.user_id = auth.uid()
          and s.payment_account = accounts.account_name
          and s.sale_date between p_start_date and p_end_date
      ), 0)
      +
      coalesce((
        select sum(ip.amount)
        from public.invoice_payments ip
        where ip.user_id = auth.uid()
          and ip.cashbook_account = accounts.account_name
          and ip.payment_date between p_start_date and p_end_date
      ), 0)
    )::numeric,
    coalesce((
      select sum(e.amount)
      from public.expenses e
      where e.user_id = auth.uid()
        and e.payment_account = accounts.account_name
        and e.expense_date between p_start_date and p_end_date
    ), 0)::numeric,
    coalesce((
      select sum(a.amount)
      from public.cashbook_adjustments a
      where a.user_id = auth.uid()
        and a.account = accounts.account_name
        and a.direction = 'income'
        and a.transaction_date between p_start_date and p_end_date
    ), 0)::numeric,
    coalesce((
      select sum(a.amount)
      from public.cashbook_adjustments a
      where a.user_id = auth.uid()
        and a.account = accounts.account_name
        and a.direction = 'expense'
        and a.transaction_date between p_start_date and p_end_date
    ), 0)::numeric,
    coalesce((
      select r.actual_closing_balance
      from public.cashbook_reconciliations r
      where r.user_id = auth.uid()
        and r.account = accounts.account_name
        and r.end_date < p_start_date
      order by r.end_date desc, r.reconciled_at desc
      limit 1
    ), (
      select o.initial_balance
      from public.cashbook_account_openings o
      where o.user_id = auth.uid() and o.account = accounts.account_name
    )),
    not exists (
      select 1
      from public.cashbook_reconciliations r
      where r.user_id = auth.uid()
        and r.account = accounts.account_name
        and r.end_date < p_start_date
    ),
    (
      select count(*)::bigint
      from (
        select s.id
        from public.sales s
        where s.user_id = auth.uid()
          and s.payment_account = 'unassigned'
          and s.sale_date between p_start_date and p_end_date
        union all
        select e.id
        from public.expenses e
        where e.user_id = auth.uid()
          and e.payment_account = 'unassigned'
          and e.expense_date between p_start_date and p_end_date
        union all
        select ip.id
        from public.invoice_payments ip
        where ip.user_id = auth.uid()
          and ip.cashbook_account = 'unassigned'
          and ip.payment_date between p_start_date and p_end_date
        union all
        select a.id
        from public.cashbook_adjustments a
        where a.user_id = auth.uid()
          and a.account = 'unassigned'
          and a.transaction_date between p_start_date and p_end_date
      ) unassigned
    )
  from (values (p_account::text)) as accounts(account_name);
end;
$$;

drop function if exists public.reconcile_cashbook(text, date, date, numeric, numeric, text);
drop function if exists public.reconcile_cashbook(text, date, date, numeric, text, numeric);
create function public.reconcile_cashbook(
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
  current_user_id uuid := auth.uid();
  total_sales numeric(14,2);
  total_expenses numeric(14,2);
  total_invoice_payments numeric(14,2);
  opening_balance_value numeric(14,2);
  reconciliation_id uuid;
  calculated_balance numeric(14,2);
begin
  if current_user_id is null then
    raise exception 'You must be signed in to save a reconciliation';
  end if;
  if p_account is null or p_account not in ('cash', 'bank') then
    raise exception 'Choose cash or bank as the account';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'Enter a valid reconciliation date range';
  end if;
  if p_actual_closing_balance is null then
    raise exception 'Enter the actual closing balance';
  end if;

  perform pg_advisory_xact_lock(hashtext(current_user_id::text), hashtext(p_account || p_start_date::text || p_end_date::text));

  select coalesce(sum(s.amount), 0)
  into total_sales
  from public.sales s
  where s.user_id = current_user_id
    and s.payment_account = p_account
    and s.sale_date between p_start_date and p_end_date;

  select coalesce(sum(e.amount), 0)
  into total_expenses
  from public.expenses e
  where e.user_id = current_user_id
    and e.payment_account = p_account
    and e.expense_date between p_start_date and p_end_date;

  select coalesce(sum(ip.amount), 0)
  into total_invoice_payments
  from public.invoice_payments ip
  where ip.user_id = current_user_id
    and ip.cashbook_account = p_account
    and ip.payment_date between p_start_date and p_end_date;

  total_sales := total_sales + total_invoice_payments;

  select r.actual_closing_balance
  into opening_balance_value
  from public.cashbook_reconciliations r
  where r.user_id = current_user_id
    and r.account = p_account
    and r.end_date < p_start_date
  order by r.end_date desc, r.reconciled_at desc
  limit 1;

  if opening_balance_value is null then
    select initial_balance
    into opening_balance_value
    from public.cashbook_account_openings
    where user_id = current_user_id and account = p_account;

    if opening_balance_value is null then
      if p_initial_opening_balance is null then
        raise exception 'Enter the initial opening balance for this account';
      end if;
      insert into public.cashbook_account_openings (user_id, account, initial_balance)
      values (current_user_id, p_account, p_initial_opening_balance)
      on conflict (user_id, account) do nothing;

      select initial_balance
      into opening_balance_value
      from public.cashbook_account_openings
      where user_id = current_user_id and account = p_account;
    end if;
  end if;

  if opening_balance_value is null then
    raise exception 'Enter the initial opening balance for this account';
  end if;

  if exists (
    select 1 from public.sales s
    where s.user_id = current_user_id and s.payment_account = 'unassigned'
      and s.sale_date between p_start_date and p_end_date
    union all
    select 1 from public.expenses e
    where e.user_id = current_user_id and e.payment_account = 'unassigned'
      and e.expense_date between p_start_date and p_end_date
    union all
    select 1 from public.invoice_payments ip
    where ip.user_id = current_user_id and ip.cashbook_account = 'unassigned'
      and ip.payment_date between p_start_date and p_end_date
  ) then
    raise exception 'Assign every transaction in the date range to cash or bank before reconciling';
  end if;

  select coalesce(sum(a.amount) filter (where a.direction = 'income'), 0)
       - coalesce(sum(a.amount) filter (where a.direction = 'expense'), 0)
  into calculated_balance
  from public.cashbook_adjustments a
  where a.user_id = current_user_id
    and a.account = p_account
    and a.transaction_date between p_start_date and p_end_date;

  calculated_balance := opening_balance_value + total_sales - total_expenses + calculated_balance;

  select r.id
  into reconciliation_id
  from public.cashbook_reconciliations r
  where r.user_id = current_user_id
    and r.account = p_account
    and r.start_date = p_start_date
    and r.end_date = p_end_date
  order by r.reconciled_at desc
  limit 1
  for update;

  if reconciliation_id is null then
    insert into public.cashbook_reconciliations (
    user_id, account, start_date, end_date, opening_balance, sales_total,
    expenses_total, calculated_closing_balance, actual_closing_balance,
    variance, notes
    ) values (
      current_user_id, p_account, p_start_date, p_end_date, opening_balance_value,
      total_sales, total_expenses, calculated_balance, p_actual_closing_balance,
      p_actual_closing_balance - calculated_balance, nullif(trim(p_notes), '')
    ) returning id into reconciliation_id;
  else
    update public.cashbook_reconciliations
    set opening_balance = opening_balance_value,
        sales_total = total_sales,
        expenses_total = total_expenses,
        calculated_closing_balance = calculated_balance,
        actual_closing_balance = p_actual_closing_balance,
        variance = p_actual_closing_balance - calculated_balance,
        notes = nullif(trim(p_notes), ''),
        reconciled_at = now()
    where id = reconciliation_id;
  end if;

  return reconciliation_id;
end;
$$;

revoke all on function public.reconcile_cashbook(text, date, date, numeric, text, numeric) from public;
grant execute on function public.reconcile_cashbook(text, date, date, numeric, text, numeric) to authenticated;

drop function if exists public.assign_invoice_payment_cashbook_account(uuid, text);
create function public.assign_invoice_payment_cashbook_account(
  p_payment_id uuid,
  p_account text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to categorize invoice payments';
  end if;
  if p_account is null or p_account not in ('cash', 'bank') then
    raise exception 'Choose cash or bank for the invoice payment';
  end if;

  update public.invoice_payments
  set cashbook_account = p_account
  where id = p_payment_id
    and user_id = auth.uid()
    and method = 'other'
    and cashbook_account = 'unassigned';

  if not found then
    raise exception 'Invoice payment not found or already categorized';
  end if;
end;
$$;

revoke all on function public.assign_invoice_payment_cashbook_account(uuid, text) from public;
grant execute on function public.assign_invoice_payment_cashbook_account(uuid, text) to authenticated;

drop function if exists public.record_product_sale(uuid, uuid, numeric, date, text);
drop function if exists public.record_product_sale(uuid, uuid, numeric, date, text, uuid);
drop function if exists public.record_product_sale(uuid, uuid, numeric, date, text, uuid, text);
create function public.record_product_sale(
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
  if p_payment_account is null or p_payment_account not in ('cash', 'bank') then
    raise exception 'Choose cash or bank for the sale';
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
    unit_price, cost_amount, amount, sale_date, description, payment_account
  ) values (
    coalesce(p_sale_id, gen_random_uuid()), auth.uid(), p_customer_id, product_row.id,
    product_row.name, p_quantity, product_row.selling_price,
    product_row.cost_price * p_quantity, product_row.selling_price * p_quantity,
    coalesce(p_sale_date, current_date), p_description, p_payment_account
  ) returning id into sale_id;

  update public.inventory_products
  set quantity = quantity - p_quantity
  where id = product_row.id;

  insert into public.inventory_movements (user_id, product_id, quantity_change, reason)
  values (auth.uid(), product_row.id, -p_quantity, 'Sale');

  return sale_id;
end;
$$;

notify pgrst, 'reload schema';
