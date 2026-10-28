-- ERP 2.18.185 — Razorpay safety net for Family Portal payments (28-10-2026).
-- Run once in Supabase SQL Editor AFTER deploying the new Edge Function razorpay-reconcile
-- (Verify JWT = OFF; it checks the cron secret itself). Safe to run again.
--
-- Why: MOG-2026-10-0013 paid ₹8,083 in the Family Portal on 26-10-2026 (Razorpay: Captured) but the ERP never
--   recorded it — the portal posts a payment only when the family's phone returns to the portal page.
-- What: every 5 minutes razorpay-reconcile posts any captured Family Portal payment missing from the ledger
--   (at its real payment time) and queues its WhatsApp receipt. The job copies the URL + secret header of the
--   existing clinical push job, exactly as SQL 269 does for staff-payment-request.
begin;

do $$
declare base_cmd text; new_cmd text;
begin
  select command into base_cmd from cron.job where jobname = 'samara-clinical-push-dispatch' limit 1;
  if base_cmd is null or base_cmd not like '%/functions/v1/clinical-push-dispatch%' then
    raise exception 'samara-clinical-push-dispatch cron job not found — Razorpay safety net NOT scheduled.';
  end if;
  new_cmd := replace(base_cmd, '/functions/v1/clinical-push-dispatch', '/functions/v1/razorpay-reconcile');
  perform cron.unschedule(jobid) from cron.job where jobname = 'samara-razorpay-family-portal-safety-net';
  perform cron.schedule('samara-razorpay-family-portal-safety-net', '*/5 * * * *', new_cmd);
end $$;

commit;

-- Check
select jobname, schedule, active from cron.job where jobname = 'samara-razorpay-family-portal-safety-net';
