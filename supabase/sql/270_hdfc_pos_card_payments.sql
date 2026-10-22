-- ERP 2.18.67 — HDFC swipe machine (Mosambee POS) payments: slip register + one-step ledger credit + automatic receipt.
-- Run once in Supabase SQL Editor (after SQL 269). Safe to run again.
-- 1. pos_card_slips: one row per swipe — approval code / RRN from the slip, card last 4, Card or UPI on the machine,
--    linked to its ledger entry and CARDV voucher. Same slip (date + approval code) can never be entered twice.
-- 2. record_pos_card_payment(): saves the ledger entry (Card Payment, CARDV voucher) and the slip together — never half.
-- 3. The WhatsApp receipt (+ PDF) is sent by the staff-payment-request Edge Function (2.18.67), at once after saving
--    and again by the 2-minute background check (SQL 269) if it could not go at first.
begin;

create table if not exists public.pos_card_slips(
  id uuid primary key default gen_random_uuid(),
  billing_transaction_id uuid not null unique references public.billing_transactions(id) on delete restrict,
  voucher_no text not null,
  patient_id uuid not null references public.patients(id) on delete restrict,
  amount numeric(12,2) not null check(amount>0),
  paid_by text not null default 'Card' check(paid_by in ('Card','UPI on machine')),
  approval_code text not null check(approval_code ~ '^[A-Z0-9]{4,12}$'),
  card_last4 text check(card_last4 is null or card_last4 ~ '^[0-9]{4}$'),
  terminal text not null default 'HDFC Mosambee P5F2T230309003481',
  slip_date date not null default (now() at time zone 'Asia/Kolkata')::date,
  entered_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  receipt_status text check(receipt_status is null or receipt_status in ('Sending','Sent','Failed','Unknown')),
  receipt_tries int not null default 0,
  receipt_claimed_at timestamptz,
  receipt_sent_at timestamptz,
  receipt_phone text,
  receipt_error text
);
create unique index if not exists pos_card_slips_no_duplicate on public.pos_card_slips(slip_date, approval_code);
create index if not exists pos_card_slips_patient_idx on public.pos_card_slips(patient_id, created_at desc);
alter table public.pos_card_slips enable row level security;
drop policy if exists pos_card_slips_staff_read on public.pos_card_slips;
create policy pos_card_slips_staff_read on public.pos_card_slips for select to authenticated
  using (exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.is_active,true) and p.role in ('Admin','Manager','Accounts')));
-- writes only through the function below / the Edge Function (service role)

create or replace function public.record_pos_card_payment(
  p_patient_id uuid, p_transaction_type text, p_category text, p_amount numeric, p_description text,
  p_approval_code text, p_card_last4 text, p_paid_by text)
returns table(transaction_id uuid, voucher_no text, slip_id uuid)
language plpgsql security definer set search_path to 'public' as $$
declare v_role text; v_code text; v_last4 text; v_tx uuid; v_voucher text; v_slip uuid; v_old record;
begin
  select role into v_role from public.profiles where id=auth.uid() and coalesce(is_active,true);
  if v_role is null or v_role not in ('Admin','Manager','Accounts') then
    raise exception 'Only Admin, Manager or Accounts can record swipe machine payments.';
  end if;
  if p_transaction_type not in ('Payment','Advance') then
    raise exception 'Swipe machine entry is only for Payment or Advance.';
  end if;
  v_code := upper(regexp_replace(coalesce(p_approval_code,''),'[^A-Za-z0-9]','','g'));
  if v_code !~ '^[A-Z0-9]{4,12}$' then
    raise exception 'Enter the Approval Code (card) or RRN (UPI) exactly as printed on the swipe machine slip.';
  end if;
  v_last4 := nullif(regexp_replace(coalesce(p_card_last4,''),'\D','','g'),'');
  if v_last4 is not null and v_last4 !~ '^[0-9]{4}$' then
    raise exception 'Card last 4 digits must be exactly 4 numbers (or leave it empty).';
  end if;
  select s.voucher_no, s.amount into v_old from public.pos_card_slips s
   where s.slip_date=(now() at time zone 'Asia/Kolkata')::date and s.approval_code=v_code limit 1;
  if found then
    raise exception 'This slip (approval code %) is already entered today as % for ₹%. It cannot be entered twice.', v_code, v_old.voucher_no, v_old.amount;
  end if;

  select r.transaction_id, r.voucher_no into v_tx, v_voucher
    from public.record_voucher_transaction(p_patient_id,p_transaction_type,p_category,p_amount,'Card Payment',p_description,auth.uid()) r;

  insert into public.pos_card_slips(billing_transaction_id,voucher_no,patient_id,amount,paid_by,approval_code,card_last4,entered_by)
  values(v_tx,v_voucher,p_patient_id,p_amount,case when p_paid_by='UPI on machine' then 'UPI on machine' else 'Card' end,v_code,
         case when p_paid_by='UPI on machine' then null else v_last4 end,auth.uid())
  returning id into v_slip;

  return query select v_tx, v_voucher, v_slip;
end $$;
revoke all on function public.record_pos_card_payment(uuid,text,text,numeric,text,text,text,text) from public, anon;
grant execute on function public.record_pos_card_payment(uuid,text,text,numeric,text,text,text,text) to authenticated;

notify pgrst, 'reload schema';
commit;

-- Check
select count(*) as slips from public.pos_card_slips;
