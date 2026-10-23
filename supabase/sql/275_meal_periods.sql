-- Samara Care ERP 2.18.82 — Meal times become PERIODS (decided 23-10-2026)
--      Breakfast 7:30 AM – 9:30 AM · Lunch 12:30 PM – 2:30 PM · Dinner 7:30 PM – 9:30 PM
-- Applies to every Guest (existing and new) — meal times are not stored per Guest.
-- Run once in Supabase > SQL Editor AFTER file 249. Safe to run again.
--
-- What changes
--   * Staff may serve and record the meal any time within the period.
--   * Nurse reminder 30 minutes before the period ends (9:00 AM / 2:00 PM / 9:00 PM) if not yet recorded
--     (pop-up, voice, Clinical Alerts).
--   * Nursing Manager + Admin / Director escalation EXACTLY at the end of the period
--     (9:30 AM / 2:30 PM / 9:30 PM) — no extra 30-minute wait after the period. Same channels as before
--     (escalation register, phone, WhatsApp). "Critical pending" 30 minutes after the period ends.
--   * The alert stays on the live list until the next meal period starts (Breakfast till 12:30 PM,
--     Lunch till 7:30 PM, Dinner till 7:30 AM next day). Recording the meal closes it.
--   * Open Meal escalations made under the old fixed times (8 AM / 1 PM / 8 PM) are closed; if the meal
--     is still not recorded, the new period alert takes over.
-- Poor-intake alerts, medicines, vitals, care and physiotherapy are not changed.

begin;

-- Meal alert due time (IST) = 30 minutes before the period ends, so the normal 30-minute escalation rule
-- escalates exactly at the period end. Used by the meal-record trigger to close escalations.
create or replace function public.samara_meal_time(p_kind text)
returns time language sql immutable as $$
  select case p_kind when 'Tiffin' then time '09:00' when 'Lunch' then time '14:00' when 'Dinner' then time '21:00' end
$$;

create or replace function public.samara_meal_period_end(p_kind text)
returns time language sql immutable as $$
  select case p_kind when 'Tiffin' then time '09:30' when 'Lunch' then time '14:30' when 'Dinner' then time '21:30' end
$$;

create or replace function public.samara_meal_period_start(p_kind text)
returns time language sql immutable as $$
  select case p_kind when 'Tiffin' then time '07:30' when 'Lunch' then time '12:30' when 'Dinner' then time '19:30' end
$$;

-- A. Alert list: meal slots due 30 min before the period end, live until the next period starts.
do $patch$
declare
  def text;
  marker constant text := '/* 2.18.82 meal periods */';
  pairs text[][] := array[
    array['(''Tiffin'',''Breakfast'',time ''08:00'',interval ''5 hours'')', '(''Tiffin'',''Breakfast'',time ''09:00'',interval ''3 hours 30 minutes'')'],
    array['(''Lunch'',''Lunch'',time ''13:00'',interval ''7 hours'')',       '(''Lunch'',''Lunch'',time ''14:00'',interval ''5 hours 30 minutes'')'],
    array['(''Dinner'',''Dinner'',time ''20:00'',interval ''11 hours'')',    '(''Dinner'',''Dinner'',time ''21:00'',interval ''10 hours 30 minutes'')'],
    array['concat(ms.label,'' not yet recorded in Resident Food Intake'')',
          'concat(ms.label,'' not yet recorded in Resident Food Intake (period '',case ms.kind when ''Tiffin'' then ''7:30–9:30 AM'' when ''Lunch'' then ''12:30–2:30 PM'' else ''7:30–9:30 PM'' end,'')'') /* 2.18.82 meal periods */']
  ];
  i int;
begin
  def := pg_get_functiondef('public.get_current_clinical_alerts()'::regprocedure);
  if position(marker in def) > 0 then
    raise notice 'Meal periods already installed — alert function not changed.';
    return;
  end if;
  if position('2.17.10 meal alerts' in def) = 0 then
    raise exception 'Meal alerts (file 249) are not installed — run 249 first. Nothing changed.';
  end if;
  for i in 1..array_length(pairs,1) loop
    if (length(def)-length(replace(def,pairs[i][1],'')))/length(pairs[i][1]) <> 1 then
      raise exception 'Expected text not found exactly once: % — nothing changed.', pairs[i][1];
    end if;
    def := replace(def, pairs[i][1], pairs[i][2]);
  end loop;
  execute def;  -- CREATE OR REPLACE keeps owner, grants and security settings
  raise notice 'get_current_clinical_alerts updated: meal periods.';
end $patch$;

-- B. Close Meal escalations raised under the old fixed times (8 AM / 1 PM / 8 PM).
update public.clinical_alert_escalations e
   set resolved_at=now(), resolution_action='Meal time changed',
       resolution_remarks='Automatically closed: meal times changed to periods (Breakfast 7:30–9:30 AM, Lunch 12:30–2:30 PM, Dinner 7:30–9:30 PM). A new alert follows the period rule if the meal is still not recorded.',
       updated_at=now()
 where e.alert_type='Meal' and e.resolved_at is null
   and to_char(e.due_at at time zone 'Asia/Kolkata','HH24:MI') in ('08:00','13:00','20:00');

commit;
notify pgrst,'reload schema';

-- Check: all should be true.
select
  strpos(pg_get_functiondef('public.get_current_clinical_alerts()'::regprocedure),'2.18.82 meal periods')>0 as meal_periods_ready,
  public.samara_meal_time('Tiffin')=time '09:00' as breakfast_ok,
  public.samara_meal_time('Lunch')=time '14:00' as lunch_ok,
  public.samara_meal_time('Dinner')=time '21:00' as dinner_ok,
  (select coalesce(manager_escalation_minutes,30) from public.clinical_alert_settings where is_active=true order by updated_at desc limit 1)=30 as escalation_at_period_end_ok;
