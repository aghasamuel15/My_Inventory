alter table public.expenses
  add column if not exists receipt_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users can view their expense receipts" on storage.objects;
create policy "Users can view their expense receipts" on storage.objects
for select to authenticated using (
  bucket_id = 'expense-receipts' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can upload their expense receipts" on storage.objects;
create policy "Users can upload their expense receipts" on storage.objects
for insert to authenticated with check (
  bucket_id = 'expense-receipts' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their expense receipts" on storage.objects;
create policy "Users can delete their expense receipts" on storage.objects
for delete to authenticated using (
  bucket_id = 'expense-receipts' and (storage.foldername(name))[1] = auth.uid()::text
);

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
    coalesce(p_sale_id, gen_random_uuid()), auth.uid(), p_customer_id, product_row.id,
    product_row.name, p_quantity, product_row.selling_price,
    product_row.cost_price * p_quantity, product_row.selling_price * p_quantity,
    coalesce(p_sale_date, current_date), p_description
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
