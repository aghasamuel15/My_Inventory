create table if not exists public.accounting_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  name text not null,
  account_type text not null check (account_type in ('asset', 'liability', 'equity', 'income', 'expense')),
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, code)
);

create table if not exists public.accounting_journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  description text not null,
  source_type text not null,
  source_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, source_type, source_id)
);

create index if not exists accounting_journal_entries_user_date_idx
  on public.accounting_journal_entries(user_id, entry_date desc);

create table if not exists public.accounting_journal_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  journal_entry_id uuid not null references public.accounting_journal_entries(id) on delete cascade,
  account_id uuid not null references public.accounting_accounts(id) on delete restrict,
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create index if not exists accounting_journal_lines_user_account_idx
  on public.accounting_journal_lines(user_id, account_id);
create index if not exists accounting_journal_lines_entry_idx
  on public.accounting_journal_lines(journal_entry_id);

alter table public.accounting_accounts enable row level security;
alter table public.accounting_journal_entries enable row level security;
alter table public.accounting_journal_lines enable row level security;

revoke all on public.accounting_accounts, public.accounting_journal_entries, public.accounting_journal_lines from anon, authenticated;
grant select, insert, update, delete on public.accounting_accounts to authenticated;
grant select on public.accounting_journal_entries, public.accounting_journal_lines to authenticated;

drop policy if exists "Business members can read accounting accounts" on public.accounting_accounts;
create policy "Business members can read accounting accounts" on public.accounting_accounts
  for select to authenticated
  using (user_id = public.current_business_id() and public.has_active_access());
drop policy if exists "Business staff can add custom accounting accounts" on public.accounting_accounts;
create policy "Business staff can add custom accounting accounts" on public.accounting_accounts
  for insert to authenticated
  with check (user_id = public.current_business_id() and public.can_write_business_data() and public.has_active_access() and not is_system);
drop policy if exists "Business staff can update custom accounting accounts" on public.accounting_accounts;
create policy "Business staff can update custom accounting accounts" on public.accounting_accounts
  for update to authenticated
  using (user_id = public.current_business_id() and public.can_write_business_data() and public.has_active_access() and not is_system)
  with check (user_id = public.current_business_id() and public.can_write_business_data() and public.has_active_access() and not is_system);
drop policy if exists "Business managers can delete custom accounting accounts" on public.accounting_accounts;
create policy "Business managers can delete custom accounting accounts" on public.accounting_accounts
  for delete to authenticated
  using (user_id = public.current_business_id() and public.can_manage_business() and public.has_active_access() and not is_system);

drop policy if exists "Business members can read accounting journal entries" on public.accounting_journal_entries;
create policy "Business members can read accounting journal entries" on public.accounting_journal_entries
  for select to authenticated
  using (user_id = public.current_business_id() and public.has_active_access());
drop policy if exists "Business members can read accounting journal lines" on public.accounting_journal_lines;
create policy "Business members can read accounting journal lines" on public.accounting_journal_lines
  for select to authenticated
  using (user_id = public.current_business_id() and public.has_active_access());

create or replace function public.ensure_accounting_accounts(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.accounting_accounts (user_id, code, name, account_type, is_system)
  values
    (p_user_id, '1000', 'Cash', 'asset', true),
    (p_user_id, '1010', 'Bank', 'asset', true),
    (p_user_id, '1020', 'Unassigned funds', 'asset', true),
    (p_user_id, '1100', 'Accounts receivable', 'asset', true),
    (p_user_id, '1200', 'Inventory', 'asset', true),
    (p_user_id, '2000', 'Accounts payable', 'liability', true),
    (p_user_id, '2100', 'VAT payable', 'liability', true),
    (p_user_id, '3000', 'Owner equity', 'equity', true),
    (p_user_id, '4000', 'Sales revenue', 'income', true),
    (p_user_id, '4100', 'Other income', 'income', true),
    (p_user_id, '5000', 'Cost of goods sold', 'expense', true),
    (p_user_id, '6000', 'Operating expenses', 'expense', true),
    (p_user_id, '6100', 'Other expense', 'expense', true)
  on conflict (user_id, code) do nothing;
end;
$$;

revoke all on function public.ensure_accounting_accounts(uuid) from public, anon, authenticated;

create or replace function public.initialize_accounting_chart()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  business_id_value uuid := public.current_business_id();
begin
  if auth.uid() is null or business_id_value is null or not public.has_active_access() then
    raise exception 'Your business does not have access to accounting tools';
  end if;
  perform public.ensure_accounting_accounts(business_id_value);
end;
$$;

revoke all on function public.initialize_accounting_chart() from public, anon;
grant execute on function public.initialize_accounting_chart() to authenticated;

create or replace function public.create_accounting_journal(
  p_entry_date date,
  p_description text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  business_id_value uuid := public.current_business_id();
  journal_id uuid := gen_random_uuid();
  line_row record;
  debit_total numeric(14,2) := 0;
  credit_total numeric(14,2) := 0;
begin
  if business_id_value is null or not public.can_write_business_data() or not public.has_active_access() then
    raise exception 'You do not have permission to create accounting journals';
  end if;
  if p_entry_date is null or p_description is null or nullif(trim(p_description), '') is null
    or p_lines is null or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'Enter a date, description, and at least two journal lines';
  end if;

  for line_row in
    select item.account_id, item.debit, item.credit
    from jsonb_to_recordset(p_lines) as item(account_id uuid, debit numeric, credit numeric)
  loop
    if line_row.account_id is null or coalesce(line_row.debit, 0) < 0 or coalesce(line_row.credit, 0) < 0
      or ((coalesce(line_row.debit, 0) > 0) = (coalesce(line_row.credit, 0) > 0))
      or not exists (
        select 1 from public.accounting_accounts a
        where a.id = line_row.account_id and a.user_id = business_id_value and a.is_active
      ) then
      raise exception 'Each journal line needs an active account and either a debit or a credit';
    end if;
    debit_total := debit_total + round(coalesce(line_row.debit, 0), 2);
    credit_total := credit_total + round(coalesce(line_row.credit, 0), 2);
  end loop;

  if round(debit_total, 2) <= 0 or round(debit_total, 2) <> round(credit_total, 2) then
    raise exception 'Journal debits and credits must be equal and greater than zero';
  end if;

  insert into public.accounting_journal_entries (id, user_id, entry_date, description, source_type)
  values (journal_id, business_id_value, p_entry_date, trim(p_description), 'manual');

  insert into public.accounting_journal_lines (user_id, journal_entry_id, account_id, debit, credit)
  select business_id_value, journal_id, item.account_id,
    round(coalesce(item.debit, 0), 2), round(coalesce(item.credit, 0), 2)
  from jsonb_to_recordset(p_lines) as item(account_id uuid, debit numeric, credit numeric);

  return journal_id;
end;
$$;

revoke all on function public.create_accounting_journal(date, text, jsonb) from public, anon;
grant execute on function public.create_accounting_journal(date, text, jsonb) to authenticated;

create or replace function public.get_accounting_balances(p_start_date date, p_end_date date)
returns table (
  account_id uuid,
  code text,
  name text,
  account_type text,
  balance numeric,
  period_debits numeric,
  period_credits numeric
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_active_access() then
    raise exception 'Your business does not have access to accounting tools';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'Enter a valid accounting date range';
  end if;

  return query
  select
    a.id,
    a.code,
    a.name,
    a.account_type,
    coalesce(sum(case when e.entry_date <= p_end_date then l.debit - l.credit else 0 end), 0)::numeric,
    coalesce(sum(case when e.entry_date between p_start_date and p_end_date then l.debit else 0 end), 0)::numeric,
    coalesce(sum(case when e.entry_date between p_start_date and p_end_date then l.credit else 0 end), 0)::numeric
  from public.accounting_accounts a
  left join public.accounting_journal_lines l on l.account_id = a.id and l.user_id = a.user_id
  left join public.accounting_journal_entries e on e.id = l.journal_entry_id and e.user_id = a.user_id
  where a.user_id = public.current_business_id() and a.is_active
  group by a.id, a.code, a.name, a.account_type
  order by a.code;
end;
$$;

revoke all on function public.get_accounting_balances(date, date) from public, anon;
grant execute on function public.get_accounting_balances(date, date) to authenticated;

create or replace function public.create_accounting_account(
  p_code text,
  p_name text,
  p_account_type text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  business_id_value uuid := public.current_business_id();
  account_id uuid;
begin
  if business_id_value is null or not public.can_write_business_data() or not public.has_active_access() then
    raise exception 'You do not have permission to add accounting accounts';
  end if;
  if p_code is null or nullif(trim(p_code), '') is null
    or p_name is null or nullif(trim(p_name), '') is null
    or p_account_type is null or p_account_type not in ('asset', 'liability', 'equity', 'income', 'expense') then
    raise exception 'Enter a code, name, and valid account type';
  end if;
  insert into public.accounting_accounts (user_id, code, name, account_type)
  values (business_id_value, trim(p_code), trim(p_name), p_account_type)
  returning id into account_id;
  return account_id;
end;
$$;

revoke all on function public.create_accounting_account(text, text, text) from public, anon;
grant execute on function public.create_accounting_account(text, text, text) to authenticated;

create or replace function public.accounting_sync_source(
  p_user_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_entry_date date,
  p_description text,
  p_lines jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  journal_id uuid;
  item record;
  account_id_value uuid;
begin
  perform public.ensure_accounting_accounts(p_user_id);
  delete from public.accounting_journal_entries
  where user_id = p_user_id and source_type = p_source_type and source_id = p_source_id;

  if p_lines is null or jsonb_array_length(p_lines) = 0 then return; end if;
  insert into public.accounting_journal_entries (user_id, entry_date, description, source_type, source_id)
  values (p_user_id, p_entry_date, coalesce(nullif(trim(p_description), ''), 'Imported transaction'), p_source_type, p_source_id)
  returning id into journal_id;

  for item in
    select line.code, line.debit, line.credit
    from jsonb_to_recordset(p_lines) as line(code text, debit numeric, credit numeric)
  loop
    select a.id into account_id_value
    from public.accounting_accounts a
    where a.user_id = p_user_id and a.code = item.code and a.is_active;
    if account_id_value is null then raise exception 'Accounting account % is not configured', item.code; end if;
    if coalesce(item.debit, 0) > 0 then
      insert into public.accounting_journal_lines (user_id, journal_entry_id, account_id, debit)
      values (p_user_id, journal_id, account_id_value, round(item.debit, 2));
    elsif coalesce(item.credit, 0) > 0 then
      insert into public.accounting_journal_lines (user_id, journal_entry_id, account_id, credit)
      values (p_user_id, journal_id, account_id_value, round(item.credit, 2));
    end if;
    account_id_value := null;
  end loop;
end;
$$;

revoke all on function public.accounting_sync_source(uuid, text, uuid, date, text, jsonb) from public, anon, authenticated;

create or replace function public.accounting_sync_transaction(p_source_table text, p_row jsonb, p_deleted boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  business_id_value uuid := (p_row->>'user_id')::uuid;
  source_id_value uuid := (p_row->>'id')::uuid;
  entry_date_value date;
  description_value text;
  source_type_value text := p_source_table;
  lines jsonb;
  amount_value numeric;
  tax_value numeric;
  subtotal_value numeric;
  cost_value numeric;
  payment_account_value text;
  direction_value text;
  cash_code text;
begin
  if p_deleted then
    delete from public.accounting_journal_entries
    where user_id = business_id_value and source_type = source_type_value and source_id = source_id_value;
    return;
  end if;

  if p_source_table = 'sales' then
    entry_date_value := (p_row->>'sale_date')::date;
    amount_value := coalesce((p_row->>'amount')::numeric, 0);
    cost_value := coalesce((p_row->>'cost_amount')::numeric, 0);
    payment_account_value := coalesce(p_row->>'payment_account', 'unassigned');
    cash_code := case payment_account_value when 'cash' then '1000' when 'bank' then '1010' else '1020' end;
    description_value := coalesce(nullif(p_row->>'product_name', ''), nullif(p_row->>'description', ''), 'Sale');
    lines := jsonb_build_array(
      jsonb_build_object('code', cash_code, 'debit', amount_value, 'credit', 0),
      jsonb_build_object('code', '4000', 'debit', 0, 'credit', amount_value)
    );
    if cost_value > 0 then
      lines := lines || jsonb_build_array(
        jsonb_build_object('code', '5000', 'debit', cost_value, 'credit', 0),
        jsonb_build_object('code', '1200', 'debit', 0, 'credit', cost_value)
      );
    end if;
  elsif p_source_table = 'expenses' then
    entry_date_value := (p_row->>'expense_date')::date;
    amount_value := coalesce((p_row->>'amount')::numeric, 0);
    payment_account_value := coalesce(p_row->>'payment_account', 'unassigned');
    cash_code := case payment_account_value when 'cash' then '1000' when 'bank' then '1010' else '1020' end;
    description_value := coalesce(nullif(p_row->>'category', ''), nullif(p_row->>'description', ''), 'Expense');
    lines := jsonb_build_array(
      jsonb_build_object('code', '6000', 'debit', amount_value, 'credit', 0),
      jsonb_build_object('code', cash_code, 'debit', 0, 'credit', amount_value)
    );
  elsif p_source_table = 'invoices' then
    entry_date_value := coalesce((p_row->>'issue_date')::date, ((p_row->>'created_at')::timestamptz)::date);
    if p_row->>'document_type' <> 'invoice' or p_row->>'status' = 'draft' then
      perform public.accounting_sync_source(business_id_value, source_type_value, source_id_value, entry_date_value, 'Invoice', null);
      return;
    end if;
    tax_value := coalesce((p_row->>'tax')::numeric, 0);
    amount_value := coalesce(nullif((p_row->>'total')::numeric, 0), (p_row->>'total_amount')::numeric, 0);
    subtotal_value := coalesce(nullif((p_row->>'subtotal')::numeric, 0), amount_value - tax_value);
    description_value := coalesce(nullif(p_row->>'invoice_number', ''), 'Invoice');
    lines := jsonb_build_array(
      jsonb_build_object('code', '1100', 'debit', amount_value, 'credit', 0),
      jsonb_build_object('code', '4000', 'debit', 0, 'credit', subtotal_value)
    );
    if tax_value > 0 then
      lines := lines || jsonb_build_array(jsonb_build_object('code', '2100', 'debit', 0, 'credit', tax_value));
    end if;
  elsif p_source_table = 'invoice_payments' then
    entry_date_value := (p_row->>'payment_date')::date;
    amount_value := coalesce((p_row->>'amount')::numeric, 0);
    payment_account_value := coalesce(p_row->>'cashbook_account', 'unassigned');
    cash_code := case payment_account_value when 'cash' then '1000' when 'bank' then '1010' else '1020' end;
    description_value := coalesce(nullif(p_row->>'reference', ''), nullif(p_row->>'notes', ''), 'Invoice payment');
    lines := jsonb_build_array(
      jsonb_build_object('code', cash_code, 'debit', amount_value, 'credit', 0),
      jsonb_build_object('code', '1100', 'debit', 0, 'credit', amount_value)
    );
  elsif p_source_table = 'cashbook_adjustments' then
    entry_date_value := (p_row->>'transaction_date')::date;
    amount_value := coalesce((p_row->>'amount')::numeric, 0);
    direction_value := p_row->>'direction';
    payment_account_value := coalesce(p_row->>'account', 'cash');
    cash_code := case payment_account_value when 'bank' then '1010' else '1000' end;
    description_value := coalesce(nullif(p_row->>'description', ''), 'Cashbook adjustment');
    if direction_value = 'income' then
      lines := jsonb_build_array(
        jsonb_build_object('code', cash_code, 'debit', amount_value, 'credit', 0),
        jsonb_build_object('code', '4100', 'debit', 0, 'credit', amount_value)
      );
    else
      lines := jsonb_build_array(
        jsonb_build_object('code', '6100', 'debit', amount_value, 'credit', 0),
        jsonb_build_object('code', cash_code, 'debit', 0, 'credit', amount_value)
      );
    end if;
  else
    raise exception 'Unsupported accounting source: %', p_source_table;
  end if;

  if amount_value > 0 then
    perform public.accounting_sync_source(
      business_id_value, source_type_value, source_id_value,
      entry_date_value, description_value, lines
    );
  else
    delete from public.accounting_journal_entries
    where user_id = business_id_value and source_type = source_type_value and source_id = source_id_value;
  end if;
end;
$$;

revoke all on function public.accounting_sync_transaction(text, jsonb, boolean) from public, anon, authenticated;

create or replace function public.sync_accounting_transaction_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    perform public.accounting_sync_transaction(tg_table_name, to_jsonb(old), true);
    return old;
  end if;
  perform public.accounting_sync_transaction(tg_table_name, to_jsonb(new), false);
  return new;
end;
$$;

revoke all on function public.sync_accounting_transaction_trigger() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['sales', 'expenses', 'invoices', 'invoice_payments', 'cashbook_adjustments'] loop
    execute format('drop trigger if exists sync_accounting_transaction on public.%I', table_name);
    execute format(
      'create trigger sync_accounting_transaction after insert or update or delete on public.%I for each row execute function public.sync_accounting_transaction_trigger()',
      table_name
    );
  end loop;
end;
$$;

do $$
declare
  business_row record;
  source_row record;
begin
  for business_row in select id from public.businesses loop
    perform public.ensure_accounting_accounts(business_row.id);
  end loop;

  for source_row in select to_jsonb(row_data) as row_data from public.sales row_data loop
    perform public.accounting_sync_transaction('sales', source_row.row_data, false);
  end loop;
  for source_row in select to_jsonb(row_data) as row_data from public.expenses row_data loop
    perform public.accounting_sync_transaction('expenses', source_row.row_data, false);
  end loop;
  for source_row in select to_jsonb(row_data) as row_data from public.invoices row_data loop
    perform public.accounting_sync_transaction('invoices', source_row.row_data, false);
  end loop;
  for source_row in select to_jsonb(row_data) as row_data from public.invoice_payments row_data loop
    perform public.accounting_sync_transaction('invoice_payments', source_row.row_data, false);
  end loop;
  for source_row in select to_jsonb(row_data) as row_data from public.cashbook_adjustments row_data loop
    perform public.accounting_sync_transaction('cashbook_adjustments', source_row.row_data, false);
  end loop;
end;
$$;

create or replace function public.seed_new_business_accounting_chart()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.ensure_accounting_accounts(new.id);
  return new;
end;
$$;

revoke all on function public.seed_new_business_accounting_chart() from public, anon, authenticated;
drop trigger if exists seed_new_business_accounting_chart on public.businesses;
create trigger seed_new_business_accounting_chart
  after insert on public.businesses
  for each row execute function public.seed_new_business_accounting_chart();

notify pgrst, 'reload schema';
