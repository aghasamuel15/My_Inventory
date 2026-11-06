do $$
begin
  if exists (
    select 1
    from public.business_memberships
    where role = 'owner'
    group by business_id
    having count(*) > 1
  ) then
    raise exception 'A business has multiple owner accounts. Resolve duplicate owners before applying the single-Admin constraint.';
  end if;
end;
$$;

create unique index if not exists business_memberships_one_owner_per_business_idx
  on public.business_memberships(business_id) where role = 'owner';
