-- ERP 2.18.66 — AUTOMATIC WhatsApp receipt (with PDF) for ALL Guest Razorpay payments (advance / outstanding, link or UPI QR).
-- Outside Samara Nursing already has it (SQL 268). Run once in Supabase SQL Editor. Safe to run again.
-- 1. Receipt tracking on each Guest online payment request (sent once only; who / when / WhatsApp message id / error).
-- 2. Requests ALREADY paid are marked "Before auto receipt" — no old family gets a message —
--    EXCEPT PAY-EF9B336B55 (₹10,000 advance, 22-10-2026), whose missed receipt is sent once (approved by Boomi).
-- 3. Every 2 minutes the staff-payment-request Edge Function records pending Guest payments (even if nobody has the
--    ERP open) and sends the receipt. The job copies the URL + secret header of the existing clinical push job (as SQL 268).
-- Needs the updated Edge Function staff-payment-request (2.18.66).
begin;

alter table public.staff_payment_requests add column if not exists receipt_status text;
alter table public.staff_payment_requests add column if not exists receipt_tries int not null default 0;
alter table public.staff_payment_requests add column if not exists receipt_claimed_at timestamptz;
alter table public.staff_payment_requests add column if not exists receipt_sent_at timestamptz;
alter table public.staff_payment_requests add column if not exists receipt_phone text;
alter table public.staff_payment_requests add column if not exists receipt_message_id text;
alter table public.staff_payment_requests add column if not exists receipt_error text;
alter table public.staff_payment_requests drop constraint if exists staff_payment_receipt_status_check;
alter table public.staff_payment_requests add constraint staff_payment_receipt_status_check
  check (receipt_status is null or receipt_status in ('Sending','Sent','Failed','Unknown','Before auto receipt'));

-- Old paid requests: never auto-send (handled by hand before this version) — except today's missed ₹10,000.
update public.staff_payment_requests set receipt_status='Before auto receipt'
 where status='Paid' and receipt_status is null and request_code <> 'PAY-EF9B336B55';

-- Background check every 2 minutes.
do $$
declare base_cmd text; new_cmd text;
begin
  select command into base_cmd from cron.job where jobname = 'samara-clinical-push-dispatch' limit 1;
  if base_cmd is null or base_cmd not like '%/functions/v1/clinical-push-dispatch%' then
    raise notice 'samara-clinical-push-dispatch cron job not found; Guest payment check NOT scheduled (receipts still go when a payment is recorded from the ERP).';
    return;
  end if;
  new_cmd := replace(base_cmd, '/functions/v1/clinical-push-dispatch', '/functions/v1/staff-payment-request');
  perform cron.unschedule(jobid) from cron.job where jobname = 'samara-guest-payment-auto-receipt';
  perform cron.schedule('samara-guest-payment-auto-receipt', '*/2 * * * *', new_cmd);
end $$;

notify pgrst, 'reload schema';
commit;

-- Check
select jobname, schedule, active from cron.job where jobname like 'samara-%payment-auto-receipt' order by 1;
select status, receipt_status, count(*) from public.staff_payment_requests group by 1,2 order by 1,2;
