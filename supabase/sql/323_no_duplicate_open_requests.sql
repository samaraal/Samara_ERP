-- ERP 2.19.18 — Approval Requests: no second OPEN request for the same Guest + item (30-10-2026).
-- Run once in Supabase SQL Editor. Safe to run again.
--
-- Found 29-10-2026 evening: items that need no Nursing Manager approval (e.g. Nebulization) are approved automatically
--   and go straight to "Ready to Start". Mrs. Sobana Mannathan (Nurse + Nursing Manager) did not see the first request
--   under Pending Approval and raised it again; the second was started, the first stayed open:
--     Mr. JOSEPH A A E FERNANDO (8:43 PM), Mr. S. SWAMINATHAN (8:48 PM), Mrs. SHANTHI.T (8:48 PM) — not started, not charged.
-- Fix:
--   1. A new request is refused while the same item is already open (Pending Approval / Ready to Start) for that Guest:
--      "already waiting under Ready to Start (requested 8:43 PM by …) — open that one".
--   2. Those three leftover duplicates are Cancelled with a note (nothing is charged or removed).
begin;

create or replace function public.guard_duplicate_open_request()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $f$
declare prev record;
begin
  if coalesce(new.category,'Nursing Procedures') = 'Biomedical Equipment' then return new; end if;  -- has its own check
  if lower(trim(coalesce(new.procedure_name,''))) in ('others','other') then return new; end if;
  select r.status, r.requested_at, r.requested_by_name into prev
    from public.nursing_procedure_requests r
   where r.patient_id = new.patient_id and r.status in ('Requested','Approved')
     and (coalesce(r.procedure_code,'') = coalesce(new.procedure_code,'~') or lower(trim(r.procedure_name)) = lower(trim(new.procedure_name)))
   order by r.requested_at desc limit 1;
  if found then
    raise exception '% is already waiting for this Guest under % (requested % by %). Open that request instead of raising a new one.',
      new.procedure_name, case prev.status when 'Approved' then '"Ready to Start"' else '"Pending Approval"' end,
      to_char(prev.requested_at at time zone 'Asia/Kolkata','DD-MM HH12:MI AM'), coalesce(prev.requested_by_name,'staff');
  end if;
  return new;
end $f$;
revoke all on function public.guard_duplicate_open_request() from public, anon, authenticated;
drop trigger if exists trg_duplicate_open_request on public.nursing_procedure_requests;
create trigger trg_duplicate_open_request before insert on public.nursing_procedure_requests
  for each row execute function public.guard_duplicate_open_request();

-- 2. Cancel the three leftover duplicates of 29-10-2026 evening (each has a later request for the same Guest + item
--    that WAS started). Only rows still open are touched.
with dup as (
  select r.id
    from public.nursing_procedure_requests r
   where r.status in ('Requested','Approved')
     and r.requested_at between timestamptz '2026-10-29 15:10:00+00' and timestamptz '2026-10-29 15:20:00+00'   -- 8:40–8:50 PM IST
     and coalesce(r.category,'Nursing Procedures') <> 'Biomedical Equipment'
     and exists(select 1 from public.nursing_procedure_requests s
                 where s.patient_id=r.patient_id and s.id<>r.id and s.status='Started'
                   and (s.procedure_code=r.procedure_code or lower(trim(s.procedure_name))=lower(trim(r.procedure_name)))
                   and s.requested_at between r.requested_at - interval '30 minutes' and r.requested_at + interval '45 minutes')
)
update public.nursing_procedure_requests r
   set status='Cancelled',
       decision_remarks=concat_ws(' · ', r.decision_remarks, 'Cancelled 30-10-2026: duplicate request — the same item was requested again and that one was started (Admin)'),
       updated_at=now()
  from dup where r.id=dup.id;

notify pgrst, 'reload schema';
commit;

-- Check: open requests now (the three duplicates should be gone)
select p.full_name, r.procedure_code, r.procedure_name, r.status, to_char(r.requested_at at time zone 'Asia/Kolkata','DD-MM HH12:MI AM') as requested
  from public.nursing_procedure_requests r join public.patients p on p.id=r.patient_id
 where r.status in ('Requested','Approved') order by r.requested_at;
