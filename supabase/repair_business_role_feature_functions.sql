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
  if public.current_business_role() is distinct from 'owner' then
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
  if public.current_business_role() is distinct from 'owner' then
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

notify pgrst, 'reload schema';

select
  to_regprocedure('public.get_business_role_features()') is not null as function_exists,
  has_function_privilege(
    'authenticated',
    'public.get_business_role_features()',
    'execute'
  ) as authenticated_can_execute;
