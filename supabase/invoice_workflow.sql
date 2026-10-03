alter table public.profiles add column if not exists business_logo_url text;
alter table public.invoices add column if not exists document_type text not null default 'invoice';

alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices
  add constraint invoices_status_check check (status in ('draft', 'unpaid', 'partial', 'paid'));
alter table public.invoices drop constraint if exists invoices_document_type_check;
alter table public.invoices
  add constraint invoices_document_type_check check (document_type in ('invoice', 'quote'));

create table if not exists public.invoice_payments (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  payment_date date not null default current_date,
  method text not null default 'other' check (method in ('cash', 'bank_transfer', 'card', 'other')),
  reference text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists invoice_payments_invoice_idx
  on public.invoice_payments(invoice_id, payment_date desc);
create index if not exists invoice_payments_user_idx
  on public.invoice_payments(user_id, payment_date desc);

create table if not exists public.invoice_email_logs (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email_type text not null check (email_type in ('invoice', 'reminder', 'receipt')),
  recipient text not null,
  payment_id uuid references public.invoice_payments(id) on delete cascade,
  status text not null check (status in ('sending', 'sent', 'failed')),
  error text,
  reminder_date date,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invoice_email_logs_reminder_date_check
    check (email_type <> 'reminder' or reminder_date is not null)
);

alter table public.invoice_email_logs drop constraint if exists invoice_email_logs_email_type_check;
alter table public.invoice_email_logs
  add column if not exists payment_id uuid references public.invoice_payments(id) on delete cascade;
alter table public.invoice_email_logs
  add constraint invoice_email_logs_email_type_check check (email_type in ('invoice', 'reminder', 'receipt'));
create unique index if not exists invoice_email_logs_receipt_payment_idx
  on public.invoice_email_logs(payment_id) where email_type = 'receipt';

create table if not exists public.recurring_invoice_templates (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  frequency text not null check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  next_issue_date date not null,
  due_days integer not null default 14 check (due_days between 0 and 365),
  tax numeric(12,2) not null default 0 check (tax >= 0),
  notes text,
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists recurring_invoice_templates_due_idx
  on public.recurring_invoice_templates(next_issue_date) where active;
alter table public.recurring_invoice_templates enable row level security;
drop policy if exists "Users can view their recurring invoice templates" on public.recurring_invoice_templates;
create policy "Users can view their recurring invoice templates" on public.recurring_invoice_templates
for select using (auth.uid() = user_id);
drop policy if exists "Users can manage their recurring invoice templates" on public.recurring_invoice_templates;
create policy "Users can manage their recurring invoice templates" on public.recurring_invoice_templates
for all using (auth.uid() = user_id) with check (
  auth.uid() = user_id and exists (
    select 1 from public.customers c
    where c.id = customer_id and c.user_id = auth.uid()
  )
);

alter table public.invoices
  add column if not exists recurring_template_id uuid references public.recurring_invoice_templates(id) on delete set null,
  add column if not exists recurring_period date;
create unique index if not exists invoices_recurring_period_idx
  on public.invoices(recurring_template_id, recurring_period)
  where recurring_template_id is not null;

create unique index if not exists invoice_payments_paystack_reference_idx
  on public.invoice_payments(reference) where reference like 'PAYSTACK-%';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-logos', 'business-logos', true, 2097152, array['image/png', 'image/jpeg'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view business logos" on storage.objects;
create policy "Public can view business logos" on storage.objects
for select using (bucket_id = 'business-logos');
drop policy if exists "Users can upload their business logo" on storage.objects;
create policy "Users can upload their business logo" on storage.objects
for insert to authenticated with check (
  bucket_id = 'business-logos' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "Users can update their business logo" on storage.objects;
create policy "Users can update their business logo" on storage.objects
for update to authenticated using (
  bucket_id = 'business-logos' and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'business-logos' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "Users can delete their business logo" on storage.objects;
create policy "Users can delete their business logo" on storage.objects
for delete to authenticated using (
  bucket_id = 'business-logos' and (storage.foldername(name))[1] = auth.uid()::text
);

create unique index if not exists invoice_email_logs_daily_reminder_idx
  on public.invoice_email_logs(invoice_id, reminder_date)
  where email_type = 'reminder';
create index if not exists invoice_email_logs_invoice_idx
  on public.invoice_email_logs(invoice_id, created_at desc);

alter table public.invoice_payments enable row level security;
alter table public.invoice_email_logs enable row level security;

drop policy if exists "Users can view their invoice payments" on public.invoice_payments;
create policy "Users can view their invoice payments" on public.invoice_payments
for select using (auth.uid() = user_id);

drop policy if exists "Users can view their invoice email logs" on public.invoice_email_logs;
create policy "Users can view their invoice email logs" on public.invoice_email_logs
for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their invoice email logs" on public.invoice_email_logs;
create policy "Users can insert their invoice email logs" on public.invoice_email_logs
for insert with check (
  auth.uid() = user_id and exists (
    select 1 from public.invoices i
    where i.id = invoice_email_logs.invoice_id and i.user_id = auth.uid()
  )
);

create or replace function public.sync_invoice_payment_status()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  target_invoice_id uuid;
  invoice_total numeric(12,2);
  paid_total numeric(12,2);
begin
  if tg_op = 'DELETE' then
    target_invoice_id := old.invoice_id;
  else
    target_invoice_id := new.invoice_id;
  end if;

  select total into invoice_total
  from public.invoices
  where id = target_invoice_id;

  if not found then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select coalesce(sum(amount), 0) into paid_total
  from public.invoice_payments
  where invoice_id = target_invoice_id;

  update public.invoices
  set status = case
    when invoice_total > 0 and paid_total >= invoice_total then 'paid'
    when paid_total > 0 then 'partial'
    else 'unpaid'
  end
  where id = target_invoice_id;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists invoice_payments_sync_status on public.invoice_payments;
create trigger invoice_payments_sync_status
after insert or delete on public.invoice_payments
for each row execute function public.sync_invoice_payment_status();

create or replace function public.sync_invoice_status_after_total_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  paid_total numeric(12,2);
begin
  select coalesce(sum(amount), 0) into paid_total
  from public.invoice_payments
  where invoice_id = new.id;

  update public.invoices
  set status = case
    when new.total > 0 and paid_total >= new.total then 'paid'
    when paid_total > 0 then 'partial'
    else 'unpaid'
  end
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists invoices_sync_status_after_total_change on public.invoices;
create trigger invoices_sync_status_after_total_change
after update of total on public.invoices
for each row when (old.total is distinct from new.total)
execute function public.sync_invoice_status_after_total_change();

drop function if exists public.create_invoice_with_items(uuid, date, date, numeric, text, jsonb);

create or replace function public.create_invoice_with_items(
  p_customer_id uuid,
  p_issue_date date,
  p_due_date date,
  p_tax numeric,
  p_notes text,
  p_items jsonb,
  p_document_type text default 'invoice'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  new_invoice_id uuid := uuid_generate_v4();
  invoice_subtotal numeric(12,2);
  invoice_tax numeric(12,2);
  invoice_total numeric(12,2);
  invoice_issue_date date := coalesce(p_issue_date, current_date);
  item_record record;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to create an invoice';
  end if;
  if p_customer_id is null or not exists (
    select 1 from public.customers
    where id = p_customer_id and user_id = auth.uid()
  ) then
    raise exception 'Select a customer from your account';
  end if;
  if p_document_type is null or p_document_type not in ('invoice', 'quote') then
    raise exception 'Select a valid document type';
  end if;
  if p_tax is null or p_tax < 0 then
    raise exception 'Tax cannot be negative';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one invoice item';
  end if;

  for item_record in
    select * from jsonb_to_recordset(p_items)
      as item(description text, quantity numeric, unit_price numeric)
  loop
    if nullif(trim(item_record.description), '') is null
      or item_record.quantity is null or item_record.quantity <= 0
      or item_record.unit_price is null or item_record.unit_price < 0 then
      raise exception 'Invoice items need a description, positive quantity, and non-negative price';
    end if;
  end loop;

  select round(coalesce(sum(round(item.quantity * round(item.unit_price, 2), 2)), 0), 2)
    into invoice_subtotal
  from jsonb_to_recordset(p_items)
    as item(description text, quantity numeric, unit_price numeric);
  invoice_tax := round(p_tax, 2);
  invoice_total := round(invoice_subtotal + invoice_tax, 2);
  if invoice_total <= 0 then
    raise exception 'Invoice total must be greater than zero';
  end if;

  insert into public.invoices (
    id, user_id, customer_id, invoice_number, issue_date, due_date,
    subtotal, tax, total, total_amount, status, document_type, notes, description
  ) values (
    new_invoice_id,
    auth.uid(),
    p_customer_id,
    'INV-' || to_char(invoice_issue_date, 'YYYYMMDD') || '-' ||
      upper(substr(replace(new_invoice_id::text, '-', ''), 1, 8)),
    invoice_issue_date,
    p_due_date,
    invoice_subtotal,
    invoice_tax,
    invoice_total,
    invoice_total,
    case when p_document_type = 'quote' then 'draft' else 'unpaid' end,
    p_document_type,
    nullif(trim(p_notes), ''),
    null
  );

  insert into public.invoice_items (invoice_id, description, quantity, unit_price, amount)
  select new_invoice_id, trim(item.description), item.quantity,
    round(item.unit_price, 2), round(item.quantity * round(item.unit_price, 2), 2)
  from jsonb_to_recordset(p_items)
    as item(description text, quantity numeric, unit_price numeric);

  return new_invoice_id;
end;
$$;

create or replace function public.record_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_method text,
  p_reference text,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_row public.invoices%rowtype;
  paid_total numeric(12,2);
  new_payment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to record a payment';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero';
  end if;
  if p_method is null or p_method not in ('cash', 'bank_transfer', 'card', 'other') then
    raise exception 'Select a valid payment method';
  end if;

  select * into invoice_row
  from public.invoices
  where id = p_invoice_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Invoice not found';
  end if;
  if invoice_row.document_type <> 'invoice' or invoice_row.status = 'draft' then
    raise exception 'Only issued invoices can receive payments';
  end if;

  select coalesce(sum(amount), 0) into paid_total
  from public.invoice_payments
  where invoice_id = p_invoice_id;

  if invoice_row.status = 'paid' and paid_total < invoice_row.total then
    raise exception 'This invoice was already marked as paid';
  end if;

  if round(p_amount, 2) > invoice_row.total - paid_total then
    raise exception 'Payment exceeds the remaining invoice balance';
  end if;

  insert into public.invoice_payments (
    invoice_id, user_id, amount, payment_date, method, reference, notes
  ) values (
    p_invoice_id, auth.uid(), round(p_amount, 2), coalesce(p_payment_date, current_date),
    p_method, nullif(trim(p_reference), ''), nullif(trim(p_notes), '')
  )
  returning id into new_payment_id;

  return new_payment_id;
end;
$$;

revoke all on function public.record_invoice_payment(uuid, numeric, date, text, text, text) from public;
grant execute on function public.record_invoice_payment(uuid, numeric, date, text, text, text) to authenticated;

create or replace function public.generate_recurring_invoice_draft(
  p_template_id uuid,
  p_today date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  template_row public.recurring_invoice_templates%rowtype;
  new_invoice_id uuid := uuid_generate_v4();
  invoice_subtotal numeric(12,2);
  invoice_total numeric(12,2);
  next_month date;
  next_month_after date;
  month_day integer;
  next_issue date;
  month_increment integer;
begin
  select * into template_row
  from public.recurring_invoice_templates
  where id = p_template_id
  for update;

  if not found or not template_row.active or template_row.next_issue_date > p_today then
    return null;
  end if;
  if not exists (
    select 1 from public.customers
    where id = template_row.customer_id and user_id = template_row.user_id
  ) then
    raise exception 'Recurring invoice customer is not available';
  end if;

  select round(coalesce(sum(round((item->>'quantity')::numeric * round((item->>'unit_price')::numeric, 2), 2)), 0), 2)
    into invoice_subtotal
  from jsonb_array_elements(template_row.items) as entries(item);
  invoice_total := round(invoice_subtotal + template_row.tax, 2);
  if invoice_total <= 0 then
    raise exception 'Recurring invoice total must be greater than zero';
  end if;

  insert into public.invoices (
    id, user_id, customer_id, invoice_number, issue_date, due_date,
    subtotal, tax, total, total_amount, status, document_type, notes,
    recurring_template_id, recurring_period
  ) values (
    new_invoice_id,
    template_row.user_id,
    template_row.customer_id,
    'INV-' || to_char(template_row.next_issue_date, 'YYYYMMDD') || '-' ||
      upper(substr(replace(new_invoice_id::text, '-', ''), 1, 8)),
    template_row.next_issue_date,
    template_row.next_issue_date + template_row.due_days,
    invoice_subtotal,
    template_row.tax,
    invoice_total,
    invoice_total,
    'draft',
    'invoice',
    template_row.notes,
    template_row.id,
    template_row.next_issue_date
  );

  insert into public.invoice_items (invoice_id, description, quantity, unit_price, amount)
  select new_invoice_id, item->>'description', (item->>'quantity')::numeric,
    round((item->>'unit_price')::numeric, 2),
    round((item->>'quantity')::numeric * round((item->>'unit_price')::numeric, 2), 2)
  from jsonb_array_elements(template_row.items) as entries(item);

  if template_row.frequency = 'weekly' then
    next_issue := template_row.next_issue_date + 7;
  else
    month_increment := case template_row.frequency
      when 'monthly' then 1
      when 'quarterly' then 3
      else 12
    end;
    next_month := (date_trunc('month', template_row.next_issue_date)::date + make_interval(months => month_increment))::date;
    next_month_after := (next_month + interval '1 month')::date;
    month_day := least(
      extract(day from template_row.next_issue_date)::integer,
      extract(day from next_month_after - 1)::integer
    );
    next_issue := next_month + month_day - 1;
  end if;

  update public.recurring_invoice_templates
  set next_issue_date = next_issue
  where id = template_row.id;

  return new_invoice_id;
end;
$$;

revoke all on function public.generate_recurring_invoice_draft(uuid, date) from public, anon, authenticated;
grant execute on function public.generate_recurring_invoice_draft(uuid, date) to service_role;

notify pgrst, 'reload schema';
