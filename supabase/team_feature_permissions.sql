create table if not exists public.business_role_features (
  business_id uuid not null references public.businesses(id) on delete cascade,
  role text not null check (role in ('manager', 'staff', 'viewer')),
  features text[] not null default array[
    'sales', 'inventory', 'expenses', 'customers', 'invoices', 'reports'
  ]::text[],
  updated_at timestamptz not null default now(),
  primary key (business_id, role),
  check (features <@ array[
    'sales', 'inventory', 'expenses', 'customers', 'invoices', 'reports'
  ]::text[])
);

insert into public.business_role_features (business_id, role)
select b.id, roles.role
from public.businesses b
cross join (values ('manager'), ('staff'), ('viewer')) as roles(role)
on conflict (business_id, role) do nothing;

alter table public.business_role_features enable row level security;
drop policy if exists "Business owners can view role features" on public.business_role_features;
create policy "Business owners can view role features" on public.business_role_features
for select to authenticated using (
  business_id = public.current_business_id()
  and public.current_business_role() = 'owner'
);

create or replace function public.has_business_feature(p_feature text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when auth.role() = 'service_role' then true
    when public.current_business_role() = 'owner' then true
    when p_feature is null or p_feature <> all(array[
      'sales', 'inventory', 'expenses', 'customers', 'invoices', 'reports'
    ]::text[]) then true
    else coalesce((
      select p_feature = any(coalesce(rf.features, array[
        'sales', 'inventory', 'expenses', 'customers', 'invoices', 'reports'
      ]::text[]))
      from public.business_memberships m
      left join public.business_role_features rf
        on rf.business_id = m.business_id and rf.role = m.role
      where m.user_id = auth.uid() and m.status = 'active'
      limit 1
    ), false)
  end
$$;

create or replace function public.get_business_features()
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public.current_business_role() = 'owner' then array[
      'sales', 'inventory', 'expenses', 'customers', 'invoices', 'reports'
    ]::text[]
    else coalesce((
      select coalesce(rf.features, array[
        'sales', 'inventory', 'expenses', 'customers', 'invoices', 'reports'
      ]::text[])
      from public.business_memberships m
      left join public.business_role_features rf
        on rf.business_id = m.business_id and rf.role = m.role
      where m.user_id = auth.uid() and m.status = 'active'
      limit 1
    ), array[]::text[])
  end
$$;

create or replace function public.get_business_role_features()
returns table (role text, features text[])
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if public.current_business_role() <> 'owner' then
    raise exception 'Only the business owner can view role feature settings';
  end if;

  return query
  select roles.role, coalesce(rf.features, array[
    'sales', 'inventory', 'expenses', 'customers', 'invoices', 'reports'
  ]::text[])
  from (values ('manager'), ('staff'), ('viewer')) as roles(role)
  left join public.business_role_features rf
    on rf.business_id = public.current_business_id() and rf.role = roles.role;
end;
$$;

create or replace function public.set_business_role_features(p_role text, p_features text[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  allowed_features constant text[] := array[
    'sales', 'inventory', 'expenses', 'customers', 'invoices', 'reports'
  ]::text[];
begin
  if public.current_business_role() <> 'owner' then
    raise exception 'Only the business owner can change role feature settings';
  end if;
  if p_role is null or p_role not in ('manager', 'staff', 'viewer') then
    raise exception 'Choose a valid team role';
  end if;
  if p_features is null or not p_features <@ allowed_features then
    raise exception 'The feature list contains an unsupported section';
  end if;

  insert into public.business_role_features (business_id, role, features, updated_at)
  values (public.current_business_id(), p_role, p_features, now())
  on conflict (business_id, role) do update
  set features = excluded.features, updated_at = now();
end;
$$;

revoke all on function public.has_business_feature(text) from public, anon;
grant execute on function public.has_business_feature(text) to authenticated;
revoke all on function public.get_business_features() from public, anon;
grant execute on function public.get_business_features() to authenticated;
revoke all on function public.get_business_role_features() from public, anon;
grant execute on function public.get_business_role_features() to authenticated;
revoke all on function public.set_business_role_features(text, text[]) from public, anon;
grant execute on function public.set_business_role_features(text, text[]) to authenticated;

do $$
declare
  table_name text;
  feature_name text;
  table_features record;
begin
  for table_features in
    select * from (values
      ('customers', 'customers'),
      ('inventory_products', 'inventory'),
      ('inventory_movements', 'inventory'),
      ('sales', 'sales'),
      ('expenses', 'expenses'),
      ('invoices', 'invoices'),
      ('invoice_payments', 'invoices'),
      ('invoice_email_logs', 'invoices'),
      ('recurring_invoice_templates', 'invoices')
    ) as feature_map(table_name, feature_name)
  loop
    table_name := table_features.table_name;
    feature_name := table_features.feature_name;
    execute format('drop policy if exists "Business members can read" on public.%I', table_name);
    execute format(
      'create policy "Business members can read" on public.%I for select to authenticated using (user_id = public.current_business_id() and public.has_active_access() and public.has_business_feature(%L))',
      table_name, feature_name
    );

    if table_name in ('inventory_movements', 'invoice_email_logs') then
      if table_name = 'inventory_movements' then
        execute 'drop policy if exists "Business staff can add movements" on public.inventory_movements';
        execute format(
          'create policy "Business staff can add movements" on public.%I for insert to authenticated with check (user_id = public.current_business_id() and public.can_write_business_data() and public.has_active_access() and public.has_business_feature(%L))',
          table_name, feature_name
        );
      else
        execute 'drop policy if exists "Business staff can add invoice logs" on public.invoice_email_logs';
        execute format(
          'create policy "Business staff can add invoice logs" on public.%I for insert to authenticated with check (user_id = public.current_business_id() and public.can_write_business_data() and public.has_active_access() and public.has_business_feature(%L))',
          table_name, feature_name
        );
      end if;
    else
      execute format('drop policy if exists "Business staff can insert" on public.%I', table_name);
      execute format(
        'create policy "Business staff can insert" on public.%I for insert to authenticated with check (user_id = public.current_business_id() and public.can_write_business_data() and public.has_active_access() and public.has_business_feature(%L))',
        table_name, feature_name
      );
      execute format('drop policy if exists "Business staff can update" on public.%I', table_name);
      execute format(
        'create policy "Business staff can update" on public.%I for update to authenticated using (user_id = public.current_business_id() and public.can_write_business_data() and public.has_active_access() and public.has_business_feature(%L)) with check (user_id = public.current_business_id() and public.can_write_business_data() and public.has_active_access() and public.has_business_feature(%L))',
        table_name, feature_name, feature_name
      );
      execute format('drop policy if exists "Business managers can delete" on public.%I', table_name);
      execute format(
        'create policy "Business managers can delete" on public.%I for delete to authenticated using (user_id = public.current_business_id() and public.can_manage_business() and public.has_active_access() and public.has_business_feature(%L))',
        table_name, feature_name
      );
    end if;
  end loop;
end;
$$;

drop policy if exists "Business members can view invoice items" on public.invoice_items;
create policy "Business members can view invoice items" on public.invoice_items
for select to authenticated using (
  public.has_business_feature('invoices')
  and exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id
      and i.user_id = public.current_business_id()
      and public.has_active_access()
  )
);
drop policy if exists "Business staff can insert invoice items" on public.invoice_items;
create policy "Business staff can insert invoice items" on public.invoice_items
for insert to authenticated with check (
  public.can_write_business_data()
  and public.has_business_feature('invoices')
  and exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id and i.user_id = public.current_business_id()
  )
);
drop policy if exists "Business staff can update invoice items" on public.invoice_items;
create policy "Business staff can update invoice items" on public.invoice_items
for update to authenticated using (
  public.can_write_business_data()
  and public.has_business_feature('invoices')
  and exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id and i.user_id = public.current_business_id()
  )
) with check (
  public.can_write_business_data()
  and public.has_business_feature('invoices')
  and exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id and i.user_id = public.current_business_id()
  )
);
drop policy if exists "Business managers can delete invoice items" on public.invoice_items;
create policy "Business managers can delete invoice items" on public.invoice_items
for delete to authenticated using (
  public.can_manage_business()
  and public.has_business_feature('invoices')
  and exists (
    select 1 from public.invoices i
    where i.id = invoice_items.invoice_id and i.user_id = public.current_business_id()
  )
);

drop policy if exists "Business members can view expense receipts" on storage.objects;
create policy "Business members can view expense receipts" on storage.objects
for select to authenticated using (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = public.current_business_id()::text
  and public.has_active_access()
  and public.has_business_feature('expenses')
);
drop policy if exists "Business staff can upload expense receipts" on storage.objects;
create policy "Business staff can upload expense receipts" on storage.objects
for insert to authenticated with check (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = public.current_business_id()::text
  and public.can_write_business_data()
  and public.has_active_access()
  and public.has_business_feature('expenses')
);
drop policy if exists "Business staff can delete expense receipts" on storage.objects;
create policy "Business staff can delete expense receipts" on storage.objects
for delete to authenticated using (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = public.current_business_id()::text
  and public.can_write_business_data()
  and public.has_active_access()
  and public.has_business_feature('expenses')
);

create or replace function public.enforce_business_feature_access()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  feature_name text;
begin
  feature_name := case tg_table_name
    when 'customers' then 'customers'
    when 'inventory_products' then 'inventory'
    when 'inventory_movements' then 'inventory'
    when 'sales' then 'sales'
    when 'expenses' then 'expenses'
    when 'invoices' then 'invoices'
    when 'invoice_payments' then 'invoices'
    when 'invoice_email_logs' then 'invoices'
    when 'recurring_invoice_templates' then 'invoices'
    when 'invoice_items' then 'invoices'
  end;
  if feature_name is null or public.has_business_feature(feature_name) then
    if tg_table_name in ('sales', 'invoices')
      and tg_op <> 'DELETE'
      and to_jsonb(new) ->> 'customer_id' is not null
      and not public.has_business_feature('customers') then
      raise exception 'Your business owner has disabled the Customers section for your role';
    end if;
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  raise exception 'Your business owner has disabled the % section for your role', feature_name;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'customers', 'inventory_products', 'inventory_movements', 'sales', 'expenses',
    'invoices', 'invoice_payments', 'invoice_email_logs', 'recurring_invoice_templates'
  ] loop
    execute format('drop trigger if exists enforce_business_feature_access on public.%I', table_name);
    execute format(
      'create trigger enforce_business_feature_access before insert or update or delete on public.%I for each row execute function public.enforce_business_feature_access()',
      table_name
    );
  end loop;
end;
$$;

drop trigger if exists enforce_business_feature_access on public.invoice_items;
create trigger enforce_business_feature_access
before insert or update or delete on public.invoice_items
for each row execute function public.enforce_business_feature_access();

revoke all on function public.enforce_business_feature_access() from public, anon, authenticated;

notify pgrst, 'reload schema';
