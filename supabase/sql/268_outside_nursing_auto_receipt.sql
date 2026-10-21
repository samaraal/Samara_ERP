-- ERP 2.18.64 — Outside Samara Nursing: AUTOMATIC WhatsApp receipt for Razorpay payments (run once in Supabase SQL Editor).
-- 1. Receipt tracking on each online payment request (sent once only; who / when / WhatsApp message id / error).
-- 2. Requests ALREADY paid before today are marked "Before auto receipt" — no old family gets a message.
-- 3. Every 2 minutes the outside-nursing-payment Edge Function checks unpaid Razorpay links (so a payment is recorded
--    even if the family closes the browser) and sends the WhatsApp receipt (approved template samara_payment_receipt).
--    The job copies the URL + secret header of the existing clinical push job (same as SQL 124 / 188 / 205).
-- Needs the updated Edge Function outside-nursing-payment (2.18.64). Safe to run again.
begin;

alter table public.outside_nursing_online_requests add column if not exists receipt_status text;
alter table public.outside_nursing_online_requests add column if not exists receipt_tries int not null default 0;
alter table public.outside_nursing_online_requests add column if not exists receipt_claimed_at timestamptz;
alter table public.outside_nursing_online_requests add column if not exists receipt_sent_at timestamptz;
alter table public.outside_nursing_online_requests add column if not exists receipt_phone text;
alter table public.outside_nursing_online_requests add column if not exists receipt_message_id text;
alter table public.outside_nursing_online_requests add column if not exists receipt_error text;
alter table public.outside_nursing_online_requests drop constraint if exists outside_nursing_online_receipt_status_check;
alter table public.outside_nursing_online_requests add constraint outside_nursing_online_receipt_status_check
  check (receipt_status is null or receipt_status in ('Sending','Sent','Failed','Unknown','Before auto receipt'));

-- Old paid requests: never auto-send (they were handled by hand before this version).
update public.outside_nursing_online_requests set receipt_status='Before auto receipt'
 where status='Paid' and receipt_status is null;

-- Background check every 2 minutes.
do $$
declare base_cmd text; new_cmd text;
begin
  select command into base_cmd from cron.job where jobname = 'samara-clinical-push-dispatch' limit 1;
  if base_cmd is null or base_cmd not like '%/functions/v1/clinical-push-dispatch%' then
    raise notice 'samara-clinical-push-dispatch cron job not found; outside payment check NOT scheduled (payments still record when the family returns to the page or Accounts presses Sync).';
    return;
  end if;
  new_cmd := replace(base_cmd, '/functions/v1/clinical-push-dispatch', '/functions/v1/outside-nursing-payment');
  perform cron.unschedule(jobid) from cron.job where jobname = 'samara-outside-payment-auto-receipt';
  perform cron.schedule('samara-outside-payment-auto-receipt', '*/2 * * * *', new_cmd);
end $$;

notify pgrst, 'reload schema';
commit;

-- Check
select jobname, schedule from cron.job where jobname = 'samara-outside-payment-auto-receipt';
select status, receipt_status, count(*) from public.outside_nursing_online_requests group by 1,2 order by 1,2;
