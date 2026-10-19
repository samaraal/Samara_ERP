-- Samara Care ERP 2.18.29 — fixed-time Nursing Procedures can be recorded more than once per shift
-- Issue (19-10-2026): care_logs had ONE unique rule: one record per care task per date per shift
-- (care_logs_order_date_shift_uidx). A fixed-time procedure such as Nebulization at 7:00 AM and 1:00 PM
-- has two times in the same Day shift, so the second record was refused (Shift Tasks / Daily Care and
-- the automatic link from Approval Requests, SQL 254).
-- New rules (no data is deleted or changed):
--   * records WITHOUT a time (ordinary care, any-time procedures): still one per task per date per shift
--   * records WITH a scheduled time (fixed-time procedures): one per task per date per time
-- Then today's / yesterday's procedures done through Approval Requests or Vitals are linked again.
-- Run AFTER 251, 252, 254. Safe to run more than once.

create unique index if not exists care_logs_order_date_shift_notime_uidx
  on public.care_logs (care_order_id, care_date, shift)
  where care_order_id is not null and scheduled_time is null;
create unique index if not exists care_logs_order_date_time_uidx
  on public.care_logs (care_order_id, care_date, scheduled_time)
  where care_order_id is not null and scheduled_time is not null;
-- the old rule is fully covered by the two above for every existing row (all have no time yet)
drop index if exists public.care_logs_order_date_shift_uidx;

do $$
declare r record;
begin
 for r in select * from public.nursing_procedure_requests
           where status='Started' and coalesce(category,'Nursing Procedures')='Nursing Procedures'
             and started_at >= now() - interval '2 days' order by started_at loop
   begin perform public.samara_link_procedure_done(r.patient_id,r.started_at,r.tariff_id,r.procedure_code,r.procedure_name,false,r.started_by,'done through Approval Request');
   exception when others then raise notice 'skipped request %: %', r.id, sqlerrm; end;
 end loop;
 for r in select * from public.vital_signs
           where coalesce(blood_sugar,blood_sugar_value) is not null and recorded_at >= now() - interval '2 days' order by recorded_at loop
   begin perform public.samara_link_procedure_done(r.patient_id,r.recorded_at,null,null,null,true,r.recorded_by,'blood sugar recorded in Vital Signs');
   exception when others then raise notice 'skipped vitals %: %', r.id, sqlerrm; end;
 end loop;
end $$;

notify pgrst, 'reload schema';
