-- ERP 2.18.173 — Payments entered by Accounts (Cash, UPI / GPay, bank, cheque…) get the receipt from the SERVER:
-- WhatsApp receipt + PDF to every family contact, retried automatically, covered by the Admin "receipt not sent" alert.
-- Also sends the three missed Family Portal receipts (approved by Boomi, 27-10-2026):
--   17-10-2026 ₹15,000 and 23-10-2026 ₹10,000 (Mrs. Shanthi T), 26-10-2026 ₹9,999 (Mr. Krishnamoorthy P C).
-- Run once in Supabase SQL Editor (after SQL 307). Safe to run again. Needs Edge Function staff-payment-request 2.18.173.

begin;

alter table public.ledger_receipt_settings add column if not exists accounts_from timestamptz;
update public.ledger_receipt_settings set accounts_from=now(), updated_at=now() where id=1 and accounts_from is null;

alter table public.ledger_payment_receipts drop constraint if exists ledger_payment_receipts_receipt_status_check;
alter table public.ledger_payment_receipts add constraint ledger_payment_receipts_receipt_status_check
  check (receipt_status in ('Queued','Sending','Sent','Failed','Unknown','Before auto receipt'));

-- The three missed Family Portal receipts: queued once (the 2-minute background check sends them).
insert into public.ledger_payment_receipts(billing_transaction_id, source, receipt_status, receipt_tries)
select t.id, 'Family Portal', 'Queued', 0
  from public.billing_transactions t
 where t.payment_mode='Razorpay Online' and t.transaction_type in ('Payment','Advance')
   and t.description ilike 'Family Portal%'
   and t.transaction_date < timestamptz '2026-10-27 00:00:00+05:30'
   and t.transaction_date >= timestamptz '2026-10-17 00:00:00+05:30'
on conflict (billing_transaction_id) do nothing;

-- Admin / Director alert: every automatic receipt that did not go — now also Accounts entries and queued receipts.
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
  -- Family Portal payments and Accounts entries (ledger)
  select case when t.payment_mode='Razorpay Online' then 'Family Portal' else 'Accounts ('||coalesce(t.payment_mode,'payment')||')' end,
         t.id, nullif(trim(concat_ws(' ',pt.title,pt.full_name)),''), t.amount, t.transaction_date,
         case when r.billing_transaction_id is null then 'Receipt not attempted (background check may have stopped)'
              when r.receipt_status='Queued' then 'Receipt queued but not sent yet'
              when r.receipt_status='Failed' then 'Receipt failed 3 times: '||coalesce(r.receipt_error,'')
              else 'Receipt status unclear: '||coalesce(r.receipt_error,'stuck while sending') end
    from public.billing_transactions t
    join public.ledger_receipt_settings s on s.id=1
    left join public.ledger_payment_receipts r on r.billing_transaction_id=t.id
    left join public.patients pt on pt.id=t.patient_id
   where t.transaction_type in ('Payment','Advance')
     and t.transaction_date<=now()-interval '15 minutes'
     and (
          (t.payment_mode='Razorpay Online' and t.description ilike 'Family Portal%'
             and t.transaction_date>=greatest(s.family_portal_from, now()-interval '7 days'))
       or (coalesce(t.payment_mode,'')<>'Razorpay Online' and s.accounts_from is not null
             and t.transaction_date>=greatest(s.accounts_from, now()-interval '7 days')
             and not exists(select 1 from public.pos_card_slips c where c.billing_transaction_id=t.id))
       or (r.receipt_status='Queued')
         )
     and (r.billing_transaction_id is null
          or (r.receipt_status='Failed' and r.receipt_tries>=3)
          or r.receipt_status='Unknown'
          or (r.receipt_status='Queued' and r.created_at<now()-interval '15 minutes')
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

-- Check: accounts_from is set; three receipts are queued.
select accounts_from at time zone 'Asia/Kolkata' as accounts_receipts_from_ist from public.ledger_receipt_settings;
select to_char(t.transaction_date at time zone 'Asia/Kolkata','DD-MM-YYYY HH24:MI') paid, t.amount, r.receipt_status
  from public.ledger_payment_receipts r join public.billing_transactions t on t.id=r.billing_transaction_id
 order by t.transaction_date;
