-- Samara Care ERP 2.18.87 / Family Portal 1.0.47 — Intake / Output history for families (23-10-2026)
-- Run once in Supabase > SQL Editor AFTER file 211 (Intake / Output chart). Safe to run again.
--
-- family_portal_io_history(session, from, to): for the family's OWN Guest only (same secure session check as
-- family_portal_fluid_balance), one row per chart day (7 AM to 7 AM) with:
--   total intake, total output, balance (intake − output) and a simple breakdown —
--   intake: Oral (incl. tea / milk / juice from Food Intake), IV, Tube feed, Other;
--   output: Urine (incl. catheter), Drain, Vomit, Stool (count + type), Other.
-- No staff names, no remarks, no alert limits. Only days on which the nurses kept the I/O chart are returned.
-- Period: at most 93 days, never before 27-08-2026. Read-only; nothing else is changed.

create or replace function public.family_portal_io_history(p_session_token text, p_from date default null, p_to date default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d jsonb; pid uuid; argtype text; pt jsonb; v_to date; v_from date; v_today date := public.io_chart_day(now());
        st public.io_chart_settings%rowtype; v_days jsonb;
begin
  if coalesce(trim(p_session_token),'')='' then return jsonb_build_object('on_chart',false); end if;
  select format_type(p.proargtypes[0],null) into argtype from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='family_portal_dashboard' and p.pronargs=1 limit 1;
  if argtype is null then return jsonb_build_object('on_chart',false); end if;
  begin
    execute format('select to_jsonb(public.family_portal_dashboard($1::%s))',argtype) into d using p_session_token;
  exception when others then return jsonb_build_object('on_chart',false);
  end;
  if d is null or jsonb_typeof(d)<>'object' then return jsonb_build_object('on_chart',false); end if;
  pt := coalesce(d->'patient',d->'resident',d->'guest','{}'::jsonb);
  select p.id into pid from public.patients p
   where p.id::text in (pt->>'id',pt->>'patient_uuid',pt->>'patient_db_id',pt->>'uuid',pt->>'patient_id') limit 1;
  if pid is null then
    select p.id into pid from public.patients p
     where p.patient_id in (pt->>'patient_id',pt->>'resident_id',pt->>'patient_code',pt->>'id') limit 1;
  end if;
  if pid is null then return jsonb_build_object('on_chart',false); end if;
  select * into st from public.io_chart_settings s where s.patient_id=pid;
  if not found then return jsonb_build_object('on_chart',false); end if;

  v_to := least(coalesce(p_to, v_today), v_today);
  v_from := greatest(coalesce(p_from, v_to - 6), v_to - 92, date '2026-08-27');
  if v_from > v_to then v_from := v_to; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'chart_date',x.io_date,'complete',x.io_date < v_today,
           'intake_ml',x.intake,'output_ml',x.output,'balance_ml',x.intake-x.output,
           'oral_ml',x.oral,'iv_ml',x.iv,'tube_ml',x.tube,'other_in_ml',x.other_in,
           'urine_ml',x.urine,'drain_ml',x.drain,'vomit_ml',x.vomit,'stool_ml',x.stool_ml,'other_out_ml',x.other_out,
           'stool_count',x.stool_count,
           'stool_types',(select coalesce(jsonb_agg(distinct e.stool_type),'[]'::jsonb) from public.io_entries e
                           where e.patient_id=pid and e.io_date=x.io_date and not e.voided and e.category='Stool'
                             and coalesce(btrim(e.stool_type),'')<>''))
         order by x.io_date desc),'[]'::jsonb)
    into v_days
  from (
    select r.io_date,
      round(coalesce(sum(r.ml) filter (where r.direction='Intake'),0)) as intake,
      round(coalesce(sum(r.ml) filter (where r.direction='Output'),0)) as output,
      round(coalesce(sum(r.ml) filter (where r.category='Oral fluids'),0)) as oral,
      round(coalesce(sum(r.ml) filter (where r.category='IV fluids'),0)) as iv,
      round(coalesce(sum(r.ml) filter (where r.category='Tube feed'),0)) as tube,
      round(coalesce(sum(r.ml) filter (where r.category='Other intake'),0)) as other_in,
      round(coalesce(sum(r.ml) filter (where r.category in ('Urine','Catheter urine')),0)) as urine,
      round(coalesce(sum(r.ml) filter (where r.category='Drain'),0)) as drain,
      round(coalesce(sum(r.ml) filter (where r.category='Vomit'),0)) as vomit,
      round(coalesce(sum(r.ml) filter (where r.category='Stool'),0)) as stool_ml,
      round(coalesce(sum(r.ml) filter (where r.category='Other output'),0)) as other_out,
      coalesce(sum(r.stool_count) filter (where r.category='Stool'),0)::int as stool_count
    from public.io_rows(pid, v_from, v_to) r
    where exists (select 1 from public.io_entries e where e.patient_id=pid and e.io_date=r.io_date and not e.voided)
    group by r.io_date
  ) x;

  return jsonb_build_object('on_chart',true,'chart_on_now',st.enabled,
    'started_on',public.io_chart_day(st.started_at),'stopped_on',case when st.enabled then null else public.io_chart_day(st.stopped_at) end,
    'from',v_from,'to',v_to,'today',v_today,'days',v_days);
end $$;
revoke all on function public.family_portal_io_history(text,date,date) from public;
grant execute on function public.family_portal_io_history(text,date,date) to anon, authenticated;

notify pgrst, 'reload schema';

-- Check: should be true.
select to_regprocedure('public.family_portal_io_history(text,date,date)') is not null as family_io_history_ready;
