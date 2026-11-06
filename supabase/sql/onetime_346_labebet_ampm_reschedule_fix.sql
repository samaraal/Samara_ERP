-- ONE-TIME FIX (06-11-2026) — AM/PM mix-up in a rescheduled dose (Admin's instruction).
-- Run once in Supabase → SQL Editor. Safe to run again (second run finds nothing to change).
--
-- Found: Guest Mr. S. SWAMINATHAN (MOG-2026-10-0013), T.Labebet 100 mg, BD at 08:00 / 20:00.
--   • 05-11-2026 19:46 — the 20:00 dose was marked Delayed ("Patient take diet later") and rescheduled to 08:30
--     (login: sobana). 08:30 is earlier than 20:00, so the ERP moved it to the NEXT morning, 06-11-2026 08:30.
--     It was meant to be 20:30 the same evening.
--   • 05-11-2026 20:23 — the dose was given (login: saranya) and saved against that 06-11-2026 08:30 slot,
--     so it showed "Given 12 h 7 min early" and counted as an extra dose on 06-11-2026.
--   The Guest received the correct doses (05-11 20:23, 06-11 07:40, 06-11 20:05) — only the record was wrong.
-- What this does (all or nothing; exactly these two entries must match):
--   • the Delayed entry's new time becomes 20:30 (same evening),
--   • the Given entry moves to 05-11-2026 20:30 (given 20:23 — on time); "Given at" is NOT changed,
--   • a note is added to both entries and a full before-copy is written to the audit trail.
begin;
do $$
declare d public.medication_administrations%rowtype; g public.medication_administrations%rowtype;
begin
  select a.* into d from public.medication_administrations a
   where a.order_id::text like '09a97821%' and a.scheduled_date='2026-11-05' and a.scheduled_time::time='20:00'
     and a.status='Delayed' for update;
  if not found then raise exception 'Delayed 20:00 entry of 05-11-2026 not found — nothing changed.'; end if;
  select a.* into g from public.medication_administrations a
   where a.order_id=d.order_id and a.scheduled_date='2026-11-06' and a.scheduled_time::time='08:30'
     and a.status='Given' for update;
  if not found then
    if d.rescheduled_time::time='20:30' then raise notice 'Already corrected.'; return; end if;
    raise exception 'Given 08:30 entry of 06-11-2026 not found — nothing changed.';
  end if;
  if d.rescheduled_time::time<>'08:30' or (g.administered_at at time zone 'Asia/Kolkata')::date<>'2026-11-05' then
    raise exception 'Entries do not match the 05-11-2026 AM/PM case — nothing changed.';
  end if;
  if exists(select 1 from public.medication_administrations where order_id=d.order_id and scheduled_date='2026-11-05' and scheduled_time::time='20:30') then
    raise exception 'A 20:30 entry already exists on 05-11-2026 — nothing changed.';
  end if;

  update public.medication_administrations
     set rescheduled_time='20:30',
         remarks=concat_ws(' · ', nullif(remarks,''), 'New time corrected 06-11-2026: 08:30 was an AM/PM error, meant 20:30 (Admin instruction)')
   where id=d.id;
  update public.medication_administrations
     set scheduled_date='2026-11-05', scheduled_time='20:30',
         remarks=concat_ws(' · ', nullif(remarks,''), 'Was saved against 06-11-2026 08:30 by mistake (AM/PM error in the reschedule); moved to 05-11-2026 20:30 on 06-11-2026 (Admin instruction)')
   where id=g.id;

  perform public.record_audit_event('MAR Entry Corrected','Medication Administration',g.id::text,
    jsonb_build_object('reason','AM/PM error: 20:00 dose of 05-11-2026 rescheduled to 08:30 (next day) instead of 20:30; dose given 05-11-2026 20:23 was saved against 06-11-2026 08:30. Corrected on Admin instruction 06-11-2026.',
                       'delayed_entry_before',to_jsonb(d),'given_entry_before',to_jsonb(g)),'Success');
  raise notice 'Corrected.';
end $$;
commit;

-- Check
select a.scheduled_date, a.scheduled_time, a.status, a.rescheduled_time,
       to_char(a.administered_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH24:MI') as given_at, a.remarks
  from public.medication_administrations a
 where a.order_id::text like '09a97821%' and a.scheduled_date between '2026-11-05' and '2026-11-06'
 order by a.scheduled_date, a.scheduled_time;
