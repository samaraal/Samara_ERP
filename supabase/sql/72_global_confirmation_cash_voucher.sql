-- Samara Care ERP v2.8.29 — REVISED PAYMENT MODES
-- Accepted payment modes only:
--   Cash | UPI | RTGS | Card Payment
--
-- Automatic voucher:
--   Cash         -> CV-YYYY-000001
--   Card Payment -> CARDV-YYYY-000001
--
-- UPI and RTGS require manual transaction reference.

create sequence if not exists public.cash_voucher_number_seq start 1;
create sequence if not exists public.card_voucher_number_seq start 1;

alter table public.billing_transactions
  add column if not exists payment_reference text;

create table if not exists public.payment_vouchers (
  id uuid primary key default gen_random_uuid(),
  voucher_no text not null unique,
  billing_transaction_id uuid not null,
  patient_id uuid not null,
  payment_mode text not null,
  transaction_type text not null,
  category text,
  amount numeric(12,2) not null,
  description text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists payment_vouchers_patient_idx
  on public.payment_vouchers(patient_id, created_at desc);

create index if not exists payment_vouchers_transaction_idx
  on public.payment_vouchers(billing_transaction_id);

alter table public.payment_vouchers enable row level security;

drop policy if exists payment_vouchers_authenticated_select on public.payment_vouchers;
create policy payment_vouchers_authenticated_select
  on public.payment_vouchers
  for select
  to authenticated
  using (true);

grant select on public.payment_vouchers to authenticated;
grant usage, select on sequence public.cash_voucher_number_seq to authenticated;
grant usage, select on sequence public.card_voucher_number_seq to authenticated;

-- If the first v2.8.29 cash-only SQL was already run, remove its RPC safely.
drop function if exists public.record_cash_transaction_with_voucher(uuid,text,text,numeric,text,uuid);

create or replace function public.record_voucher_transaction(
  p_patient_id uuid,
  p_transaction_type text,
  p_category text,
  p_amount numeric,
  p_payment_mode text,
  p_description text,
  p_entered_by uuid
)
returns table(transaction_id uuid, voucher_no text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number bigint;
  v_voucher_no text;
  v_transaction_id uuid;
  v_description text;
begin
  if p_patient_id is null then
    raise exception 'Patient is required.';
  end if;

  if coalesce(p_amount,0) <= 0 then
    raise exception 'Amount must be greater than zero.';
  end if;

  if p_transaction_type not in ('Payment','Advance','Refund') then
    raise exception 'Automatic voucher is available only for Payment, Advance or Refund.';
  end if;

  if p_payment_mode not in ('Cash','Card Payment') then
    raise exception 'Automatic voucher is available only for Cash or Card Payment.';
  end if;

  if p_payment_mode='Cash' then
    v_number := nextval('public.cash_voucher_number_seq');
    v_voucher_no := 'CV-' || to_char(current_date,'YYYY') || '-' || lpad(v_number::text,6,'0');
  else
    v_number := nextval('public.card_voucher_number_seq');
    v_voucher_no := 'CARDV-' || to_char(current_date,'YYYY') || '-' || lpad(v_number::text,6,'0');
  end if;

  v_description := concat_ws(
    ' | ',
    nullif(trim(coalesce(p_description,'')),''),
    'Reference: ' || v_voucher_no
  );

  insert into public.billing_transactions(
    patient_id,
    transaction_type,
    category,
    amount,
    payment_mode,
    payment_reference,
    description,
    transaction_date,
    entered_by
  )
  values(
    p_patient_id,
    p_transaction_type,
    p_category,
    p_amount,
    p_payment_mode,
    v_voucher_no,
    v_description,
    now(),
    p_entered_by
  )
  returning id into v_transaction_id;

  insert into public.payment_vouchers(
    voucher_no,
    billing_transaction_id,
    patient_id,
    payment_mode,
    transaction_type,
    category,
    amount,
    description,
    created_by
  )
  values(
    v_voucher_no,
    v_transaction_id,
    p_patient_id,
    p_payment_mode,
    p_transaction_type,
    p_category,
    p_amount,
    p_description,
    p_entered_by
  );

  return query select v_transaction_id, v_voucher_no;
end;
$$;

revoke all on function public.record_voucher_transaction(uuid,text,text,numeric,text,text,uuid) from public;
grant execute on function public.record_voucher_transaction(uuid,text,text,numeric,text,text,uuid) to authenticated;

notify pgrst, 'reload schema';
