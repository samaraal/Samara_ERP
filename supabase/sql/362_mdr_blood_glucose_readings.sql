-- ERP 2.19.90 — DAILY REPORT, slide "Clinical care": blood glucose (08-11-2026). Run AFTER 349 / 351. Safe to run again.
-- Blood glucose values are saved in Vital Signs (sugar). "Readings outside normal" listed only vitals rounds marked
-- Warning / Critical, so a sugar reading entered in a normal round never showed. Now:
--  * "Readings outside normal" also lists any sugar above 200 or below 70 mg/dL (Level shown as Warning if the round
--    itself was Normal); the PowerPoint shows that value in red bold.
--  * New table "Blood glucose readings": every sugar check of the day — Time · Guest · Reading · Result (High / Low / Normal).
-- Patches the live mis_daily_report_core in place; nothing else changes. After running: "↻ Prepare again".
begin;

create or replace function public.mdr_sugar_table(p_day date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
begin
  return public.mdr_table('Blood glucose readings','["Time","Guest","Reading","Result"]'::jsonb, $q$
      with s as (
        select v.recorded_at, concat_ws(' ', nullif(p.title,''), p.full_name) as guest,
               coalesce(v.blood_sugar, nullif(regexp_replace(coalesce(to_jsonb(v)->>'blood_sugar_value',''),'[^0-9.]','','g'),'')::numeric) as sugar
          from public.vital_signs v join public.patients p on p.id = v.patient_id
         where not coalesce(p.is_trial,false) and (v.recorded_at at time zone 'Asia/Kolkata')::date = $1
      )
      select jsonb_build_array(to_char(s.recorded_at at time zone 'Asia/Kolkata','HH24:MI'), s.guest,
               'Sugar ' || trim(to_char(s.sugar,'FM99990.##')) || ' mg/dL',
               case when s.sugar > 200 then 'High' when s.sugar < 70 then 'Low' else 'Normal' end) as r
        from s where s.sugar > 0
       order by case when s.sugar > 200 or s.sugar < 70 then 0 else 1 end, s.recorded_at$q$, p_day, 20, false,
      'Normal 70–200 mg/dL (random). From Vital Signs — the readings taken for Blood Glucose Monitoring.');
end $f$;
revoke all on function public.mdr_sugar_table(date) from public, anon, authenticated;

do $do$
declare def text; newdef text;
  a1 text := $a$where %2$s and coalesce(v.alert_level,'Normal') not in ('Normal','') and$a$;
  b1 text := $b$where %2$s and (coalesce(v.alert_level,'Normal') not in ('Normal','') or coalesce(v.blood_sugar,0) > 200 or (v.blood_sugar > 0 and v.blood_sugar < 70)) and$b$;
  a2 text := $a$v.alert_level) as r$a$;
  b2 text := $b$case when coalesce(v.alert_level,'Normal') in ('Normal','') then 'Warning' else v.alert_level end) as r$b$;
  a3 text := $a$secs := secs || jsonb_build_object('key','clinical'$a$;
  b3 text := $b$t := t || public.mdr_sugar_table(d);
  secs := secs || jsonb_build_object('key','clinical'$b$;
begin
  select pg_get_functiondef('public.mis_daily_report_core(date)'::regprocedure) into def;
  if position('mdr_sugar_table' in def) > 0 then raise notice 'Already patched.'; return; end if;
  if position(a1 in def)=0 or position(a2 in def)=0 or position(a3 in def)=0 then
    raise exception 'Could not find the Clinical care lines in mis_daily_report_core — nothing changed. Send this message to Claude.';
  end if;
  newdef := replace(replace(replace(def, a1, b1), a2, b2), a3, b3);
  execute newdef;
end $do$;

commit;
notify pgrst, 'reload schema';

-- Check: the blood glucose readings of 07-11-2026
select jsonb_pretty(public.mdr_sugar_table(date '2026-11-07')) as blood_glucose_07_11;
