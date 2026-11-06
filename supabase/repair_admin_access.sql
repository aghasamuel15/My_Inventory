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

notify pgrst, 'reload schema';
