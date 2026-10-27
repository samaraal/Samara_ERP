-- Samara Care ERP 2.18.171 — No Meal Due alerts / escalations for Tube-fed Guests (27-10-2026)
-- Run once in Supabase > SQL Editor AFTER file 275. Safe to run again.
--
-- Problem: the Meal Due alert skipped a Guest only when the DIET PLAN text contained "tube".
--   A Guest whose Diet Plan is e.g. "High-protein diet" but whose FEEDING ROUTE is "NG / Ryles tube"
--   (Mr. Joseph A A E Fernando, Room 106) was still alerted and escalated for Breakfast / Lunch / Dinner.
-- Fix: a Guest counts as tube-fed if ANY of these says so —
--   * Diet Plan contains "tube"  (e.g. "Tube feeding")
--   * Feeding route is a tube route: NG / Ryles tube, PEG, NJ tube, Jejunostomy, Other tube
--   * the saved feeding summary says "Feeding route: … tube / PEG / Jejunostomy"
--   Feeding route "Oral" (or empty) = normal meal alerts, as before.
-- Open Meal Due escalations already raised for tube-fed Guests are closed automatically.
-- Poor-intake alerts, medicines, vitals, care and physiotherapy are not changed.

begin;

create or replace function public.samara_guest_tube_fed(p_diet text, p_feeding_plan jsonb, p_feeding_instruction text)
returns boolean language sql immutable as $$
  select coalesce(p_diet,'') ilike '%tube%'
      or coalesce(p_feeding_plan->>'route','') ~* '(tube|peg|jejunostomy)'
      or coalesce(p_feeding_instruction,'') ~* 'feeding route:[^\n]*(tube|peg|jejunostomy)'
$$;
grant execute on function public.samara_guest_tube_fed(text,jsonb,text) to authenticated;

-- A. Alert list: use the full tube-fed check instead of the Diet Plan text only.
do $patch$
declare
  def text;
  marker constant text := '/* 2.18.171 tube fed */';
  old_txt constant text := 'coalesce(pt.diet_plan,'''') not ilike ''%tube%''';
  new_txt constant text := 'not public.samara_guest_tube_fed(pt.diet_plan,to_jsonb(pt)->''feeding_plan'',pt.feeding_instruction) /* 2.18.171 tube fed */';
begin
  def := pg_get_functiondef('public.get_current_clinical_alerts()'::regprocedure);
  if position(marker in def) > 0 then
    raise notice 'Tube-fed check already installed — alert function not changed.';
    return;
  end if;
  if (length(def)-length(replace(def,old_txt,'')))/length(old_txt) <> 1 then
    raise exception 'Expected meal tube check not found exactly once — nothing changed.';
  end if;
  execute replace(def, old_txt, new_txt);  -- CREATE OR REPLACE keeps owner, grants and security settings
  raise notice 'get_current_clinical_alerts updated: tube-fed Guests skip Meal Due.';
end $patch$;

-- B. Close open Meal Due escalations for tube-fed Guests.
update public.clinical_alert_escalations e
   set resolved_at=now(), resolution_action='Tube-fed Guest',
       resolution_remarks='Automatically closed: Guest is on tube feeding (feeds are recorded in the I/O chart), so Meal Due alerts do not apply.',
       updated_at=now()
  from public.patients pt
 where e.alert_type='Meal' and e.resolved_at is null
   and e.patient_id=pt.id
   and public.samara_guest_tube_fed(pt.diet_plan,to_jsonb(pt)->'feeding_plan',pt.feeding_instruction);

commit;
notify pgrst,'reload schema';

-- Check: first column should be true; the list shows Guests now treated as tube-fed.
select strpos(pg_get_functiondef('public.get_current_clinical_alerts()'::regprocedure),'2.18.171 tube fed')>0 as tube_fed_check_ready;
select full_name, room_no, diet_plan, to_jsonb(p)->'feeding_plan'->>'route' as feeding_route
  from public.patients p
 where coalesce(is_active,true)
   and public.samara_guest_tube_fed(diet_plan,to_jsonb(p)->'feeding_plan',feeding_instruction);
