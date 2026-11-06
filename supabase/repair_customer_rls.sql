create or replace function public.set_business_owner_id()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_id uuid := public.current_business_id();
begin
  if owner_id is null then
    raise exception 'Your account is not linked to an active business';
  end if;

  new.user_id := owner_id;
  return new;
end;
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

revoke all on function public.has_active_access() from public, anon;
grant execute on function public.has_active_access() to authenticated, service_role;

drop trigger if exists set_business_owner_id on public.customers;
create trigger set_business_owner_id
before insert on public.customers
for each row execute function public.set_business_owner_id();

alter table public.customers enable row level security;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'customers'
  loop
    execute format('drop policy %I on public.customers', policy_row.policyname);
  end loop;
end;
$$;

create policy "Business members can read" on public.customers
for select to authenticated using (
  user_id = public.current_business_id()
  and public.has_active_access()
  and public.has_business_feature('customers')
);

create policy "Business staff can insert" on public.customers
for insert to authenticated with check (
  user_id = public.current_business_id()
  and public.can_write_business_data()
  and public.has_active_access()
  and public.has_business_feature('customers')
);

create policy "Business staff can update" on public.customers
for update to authenticated using (
  user_id = public.current_business_id()
  and public.can_write_business_data()
  and public.has_active_access()
  and public.has_business_feature('customers')
) with check (
  user_id = public.current_business_id()
  and public.can_write_business_data()
  and public.has_active_access()
  and public.has_business_feature('customers')
);

create policy "Business managers can delete" on public.customers
for delete to authenticated using (
  user_id = public.current_business_id()
  and public.can_manage_business()
  and public.has_active_access()
  and public.has_business_feature('customers')
);

revoke all on function public.set_business_owner_id() from public, anon, authenticated;

notify pgrst, 'reload schema';
