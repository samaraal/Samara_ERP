-- ERP 2.18.172 — AUTOMATIC WhatsApp receipt (+ PDF) for payments families make themselves in the Family Portal,
-- and an Admin / Director alert whenever ANY automatic payment receipt could not be sent.
-- Run once in Supabase SQL Editor (after SQL 270). Safe to run again. Needs Edge Function staff-payment-request 2.18.172.
--
-- Why: Family Portal payments (Razorpay, "Family Portal online advance / payment") are posted straight into the
--   ledger, not through a staff payment request, so no automatic receipt was ever sent for them
--   (17-10, 23-10, 26-10 and the ₹25,000 advance of 27-10-2026).
-- 1. ledger_payment_receipts: one row per Family Portal ledger payment — sent once, retried after 10 min, 3 tries.
-- 2. Receipts start from 27-10-2026 00:00 IST, so today's ₹25,000 advance gets its receipt; older payments are not re-sent.
-- 3. payment_receipt_problems(): every automatic receipt route (Family Portal, staff payment link / QR, swipe machine)
--    whose receipt failed 3 times, is stuck, or was never attempted within 15 minutes (e.g. background job stopped).
--    Shown to Admin / Director as a pop-up in the ERP.

begin;

create table if not exists public.ledger_payment_receipts(
  billing_transaction_id uuid primary key references public.billing_transactions(id) on delete cascade,
  source text not null default 'Family Portal',
  receipt_status text not null check (receipt_status in ('Sending','Sent','Failed','Unknown','Before auto receipt')),
  receipt_tries int not null default 0,
  receipt_claimed_at timestamptz,
  receipt_sent_at timestamptz,
  receipt_phone text,
  receipt_no text,
  receipt_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ledger_payment_receipts enable row level security;
revoke all on public.ledger_payment_receipts from anon, authenticated;
grant select on public.ledger_payment_receipts to authenticated;
grant all on public.ledger_payment_receipts to service_role;
drop policy if exists ledger_payment_receipts_read on public.ledger_payment_receipts;
create policy ledger_payment_receipts_read on public.ledger_payment_receipts for select to authenticated
  using (exists(select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid())
                and coalesce(p.is_active,true) and lower(trim(p.role)) in ('admin','administrator','director','manager','accounts')));

create table if not exists public.ledger_receipt_settings(
  id int primary key default 1 check (id=1),
  family_portal_from timestamptz not null,
  updated_at timestamptz not null default now()
);
insert into public.ledger_receipt_settings(id,family_portal_from)
values (1, timestamptz '2026-10-27 00:00:00+05:30')
on conflict (id) do nothing;
grant select on public.ledger_receipt_settings to authenticated;
grant all on public.ledger_receipt_settings to service_role;

-- Every automatic receipt that did not go — for Admin / Director only.
create or replace function public.payment_receipt_problems()
returns table(route text, ref_id uuid, guest_name text, amount numeric, paid_at timestamptz, problem text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not exists (select 1 from public.profiles p
                 where (p.id=auth.uid() or p.auth_user_id=auth.uid())
                   and coalesce(p.is_active,true)
                   and lower(trim(p.role)) in ('admin','administrator','director')) then
    return;
  end if;
  return query
  -- Family Portal payments
  select 'Family Portal'::text, t.id, nullif(trim(concat_ws(' ',pt.title,pt.full_name)),''), t.amount, t.transaction_date,
         case when r.billing_transaction_id is null then 'Receipt not attempted (background check may have stopped)'
              when r.receipt_status='Failed' then 'Receipt failed 3 times: '||coalesce(r.receipt_error,'')
              when r.receipt_status in ('Sending','Unknown') then 'Receipt status unclear: '||coalesce(r.receipt_error,'stuck while sending') end
    from public.billing_transactions t
    join public.ledger_receipt_settings s on s.id=1
    left join public.ledger_payment_receipts r on r.billing_transaction_id=t.id
    left join public.patients pt on pt.id=t.patient_id
   where t.payment_mode='Razorpay Online' and t.transaction_type in ('Payment','Advance')
     and t.description ilike 'Family Portal%'
     and t.transaction_date>=greatest(s.family_portal_from, now()-interval '7 days')
     and t.transaction_date<=now()-interval '15 minutes'
     and (r.billing_transaction_id is null
          or (r.receipt_status='Failed' and r.receipt_tries>=3)
          or r.receipt_status='Unknown'
          or (r.receipt_status='Sending' and r.receipt_claimed_at<now()-interval '15 minutes'))
  union all
  -- Staff payment link / UPI QR
  select 'Payment link / QR', q.id, nullif(trim(concat_ws(' ',pt.title,pt.full_name)),''), q.amount, q.paid_at,
         case when q.receipt_status is null then 'Receipt not attempted (background check may have stopped)'
              when q.receipt_status='Failed' then 'Receipt failed 3 times: '||coalesce(q.receipt_error,'')
              else 'Receipt status unclear: '||coalesce(q.receipt_error,'stuck while sending') end
    from public.staff_payment_requests q
    left join public.patients pt on pt.id=q.patient_id
   where q.status='Paid' and q.paid_at>=now()-interval '7 days' and q.paid_at<=now()-interval '15 minutes'
     and (q.receipt_status is null
          or (q.receipt_status='Failed' and q.receipt_tries>=3)
          or q.receipt_status='Unknown'
          or (q.receipt_status='Sending' and q.receipt_claimed_at<now()-interval '15 minutes'))
  union all
  -- HDFC swipe machine
  select 'Swipe machine', c.id, nullif(trim(concat_ws(' ',pt.title,pt.full_name)),''), c.amount, c.created_at,
         case when c.receipt_status is null then 'Receipt not attempted (background check may have stopped)'
              when c.receipt_status='Failed' then 'Receipt failed 3 times: '||coalesce(c.receipt_error,'')
              else 'Receipt status unclear: '||coalesce(c.receipt_error,'stuck while sending') end
    from public.pos_card_slips c
    left join public.patients pt on pt.id=c.patient_id
   where c.created_at>=now()-interval '7 days' and c.created_at<=now()-interval '15 minutes'
     and (c.receipt_status is null
          or (c.receipt_status='Failed' and c.receipt_tries>=3)
          or c.receipt_status='Unknown'
          or (c.receipt_status='Sending' and c.receipt_claimed_at<now()-interval '15 minutes'));
end $$;
revoke all on function public.payment_receipt_problems() from public, anon;
grant execute on function public.payment_receipt_problems() to authenticated;

notify pgrst, 'reload schema';
commit;

-- Check: the receipt background job must be active; today's Family Portal payments are listed.
select jobname, schedule, active from cron.job where jobname='samara-guest-payment-auto-receipt';
select t.transaction_date at time zone 'Asia/Kolkata' as paid_ist, t.amount, t.transaction_type, r.receipt_status
  from public.billing_transactions t left join public.ledger_payment_receipts r on r.billing_transaction_id=t.id
 where t.payment_mode='Razorpay Online' and t.description ilike 'Family Portal%'
   and t.transaction_date>=timestamptz '2026-10-27 00:00:00+05:30';
