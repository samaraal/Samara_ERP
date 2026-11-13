-- Samara ERP SQL 403 (app 2.20.95) — Medicine time window (Admin, 13-11-2026).
-- • Time-critical medicines (insulin, antibiotics, Parkinson's, epilepsy, blood thinners): may be given from 30 min before.
-- • All other medicines: from 60 min before.
-- • Earlier than that: refused for staff (Nurse / Caregiver / Nursing Manager in Nurse mode). Only Admin or the Nursing
--   Manager's own login can record an early dose (the app asks her for the reason).
-- • Late doses are never blocked (the app already asks for a reason when given 30+ min late; alerts unchanged).
-- • medication_orders.time_critical: leave empty = decided from the medicine name; tick true / false to override.
-- Only new "Given" entries are checked. Nothing already saved is changed. Safe to run again.
begin;

alter table public.medication_orders add column if not exists time_critical boolean;

create or replace function public.samara_med_time_critical(p_order uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(o.time_critical,
    concat_ws(' ',o.medicine_name,o.strength) ~* '(insulin|lantus|glargine|basalog|toujeo|tresiba|degludec|actrapid|humulin|huminsulin|mixtard|novomix|novorapid|aspart|humalog|lispro|apidra|glulisine|ryzodeg|wosulin|insugen|amoxi|augmentin|clavam|moxikind|azithro|azee|cef|cipro|levoflo|oflox|norflox|metronid|flagyl|doxy|linezolid|meropenem|piperacillin|tazo|clindamycin|vancomycin|nitrofurantoin|cotrimoxazole|septran|levodopa|syndopa|carbidopa|tidomet|pramipexole|ropinirole|rasagiline|levetiracetam|levipil|keppra|phenytoin|eptoin|valpro|encorate|valparin|carbamazepine|tegretol|oxcarbazepine|oxetol|lacosamide|clobazam|frisium|warfarin|acitrom|acenocoumarol|apixaban|eliquis|rivaroxaban|xarelto|dabigatran|enoxaparin|clexane|heparin)')
  from public.medication_orders o where o.id = p_order;
$$;
revoke all on function public.samara_med_time_critical(uuid) from public, anon;
grant execute on function public.samara_med_time_critical(uuid) to authenticated;

create or replace function public.medication_time_window_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare me public.profiles; v_role text; v_des text; win int; due timestamptz; given timestamptz;
begin
  if auth.uid() is null or new.status <> 'Given' or new.scheduled_date is null or new.scheduled_time is null then return new; end if;
  select * into me from public.profiles where (id = auth.uid() or auth_user_id = auth.uid()) limit 1;
  v_role := lower(trim(coalesce(me.role,'')));
  v_des  := lower(regexp_replace(trim(coalesce(me.designation,'')),'[._-]+',' ','g'));
  if v_role in ('admin','administrator','director') then return new; end if;
  if v_des in ('nurse manager','nursing manager') and not coalesce(me.nurse_mode_on,false) then return new; end if;
  win := case when coalesce(public.samara_med_time_critical(new.order_id),false) then 30 else 60 end;
  due := (new.scheduled_date + new.scheduled_time) at time zone 'Asia/Kolkata';
  given := coalesce(new.administered_at, now());
  if given < due - make_interval(mins => win) then
    raise exception 'Not yet — this dose is due at % and can be given from % minutes before. Early doses only by the Nursing Manager, with the reason.',
      to_char(new.scheduled_time,'HH24:MI'), win using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.medication_time_window_guard() from public, anon, authenticated;

drop trigger if exists medication_time_window_guard on public.medication_administrations;
create trigger medication_time_window_guard before insert on public.medication_administrations
  for each row execute function public.medication_time_window_guard();

notify pgrst,'reload schema';
commit;

-- check: today's prescriptions marked time-critical by name
select o.medicine_name, o.scheduled_times::text as times, public.samara_med_time_critical(o.id) as time_critical
  from public.medication_orders o join public.patients p on p.id = o.patient_id
 where o.is_active and coalesce(p.is_active,true) and public.samara_med_time_critical(o.id) order by 1;
