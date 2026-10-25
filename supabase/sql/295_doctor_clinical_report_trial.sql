-- 295 — Doctor's Daily Clinical Report (trial) — ERP 2.18.127
-- Adds a per-Guest choice of which report the treating doctor receives:
--   'family_copy' (default) = the same Intelligent Patient Report the family gets (unchanged for everyone)
--   'clinical'              = the new Daily Clinical Report for doctors (7-day trends, AI clinical observations)
-- Then turns the trial ON for Guest Ranjith Kumar only.
-- Safe to run more than once. Run in Supabase → SQL Editor.

alter table public.patient_family_communication_preferences
  add column if not exists doctor_report_style text not null default 'family_copy';

do $$ begin
  if not exists (select 1 from pg_constraint where conname='pfcp_doctor_report_style_check') then
    alter table public.patient_family_communication_preferences
      add constraint pfcp_doctor_report_style_check check (doctor_report_style in ('family_copy','clinical'));
  end if;
end $$;

-- Trial: Ranjith Kumar (active Guest). Stops if the name matches no Guest or more than one.
do $$
declare n int; pid uuid;
begin
  select count(*), min(id::text)::uuid into n, pid from public.patients
   where is_active is not false
     and regexp_replace(lower(full_name),'[^a-z]','','g') like '%ranjithkumar%';
  if n=0 then raise exception 'No active Guest named Ranjith Kumar found — nothing changed for the trial (the new column is added).'; end if;
  if n>1 then raise exception '% active Guests match "Ranjith Kumar" — tell Claude which one; nothing changed for the trial.', n; end if;
  update public.patient_family_communication_preferences set doctor_report_style='clinical', updated_at=now() where patient_id=pid;
  if not found then raise notice 'Ranjith Kumar has no Daily Report settings yet. Open his Patient File → Daily Report settings, tick "Send to doctor" with the doctor''s WhatsApp number, save, then run this script again.'; end if;
end $$;

-- Result: check doctor_report_enabled = true and a doctor mobile is present for the scheduled send.
select p.full_name as guest, p.patient_id, c.doctor_report_style, c.doctor_report_enabled,
       c.doctor_recipient_name, c.doctor_recipient_mobile, c.daily_whatsapp_enabled, c.daily_report_time
  from public.patients p
  left join public.patient_family_communication_preferences c on c.patient_id=p.id
 where p.is_active is not false and regexp_replace(lower(p.full_name),'[^a-z]','','g') like '%ranjithkumar%';
