alter table public.business_memberships
  add column if not exists member_name text not null default '';

drop function if exists public.invite_business_member(text, text);
create or replace function public.invite_business_member(p_email text, p_role text, p_name text)
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
  if nullif(trim(p_name), '') is null or length(trim(p_name)) > 120 then
    raise exception 'Enter a teammate name of 1 to 120 characters';
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

  select u.id into user_id_value
  from auth.users u
  where lower(u.email) = email_value
  limit 1;

  return query
  insert into public.business_memberships (
    business_id, user_id, member_name, email, role, status, invited_by
  )
  values (
    business_id_value,
    user_id_value,
    trim(p_name),
    email_value,
    p_role,
    case when user_id_value is null then 'pending' else 'active' end,
    auth.uid()
  )
  on conflict (business_id, (lower(email))) do update
    set role = excluded.role,
        member_name = excluded.member_name,
        user_id = coalesce(public.business_memberships.user_id, excluded.user_id),
        status = case
          when coalesce(public.business_memberships.user_id, excluded.user_id) is null then 'pending'
          else 'active'
        end,
        invited_by = excluded.invited_by
  returning id, email, role, status;

  if user_id_value is not null then
    update public.profiles
    set business_id = business_id_value
    where id = user_id_value;
  end if;
end;
$$;

revoke all on function public.invite_business_member(text, text, text) from public, anon;
grant execute on function public.invite_business_member(text, text, text) to authenticated;

notify pgrst, 'reload schema';
