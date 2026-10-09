-- Samara Care ERP 2.16.11 — Intake / Output (fluid balance) chart for nurses.
-- Run this whole file once in Supabase > SQL Editor. Safe to run again. Run AFTER 177/179 (beverages) and 205.
--
-- * The chart is switched ON per Guest (catheter, bedridden, doctor's order …) by a nurse / Nursing Manager,
--   with that Guest's alert limits (low urine per 12-hour shift, 24-hour balance).
-- * Nurses record Intake (oral fluids, IV fluids, tube feed) and Output (urine, catheter urine, drain, vomit,
--   stool, other) in ml; stool by count and type.
-- * Beverages already recorded in Resident Food Intake (tea, milk, juice …) count automatically as oral intake,
--   so they are never entered twice: ml as entered; cup 150 ml, tumbler 200 ml, glass 250 ml, mug 250 ml;
--   "Consumed partially" counts half; "Refused" counts nothing. Other units (tsp, g …) are not counted.
-- * Chart day = 7 AM to 7 AM. Shifts: Day 7 AM–7 PM, Night 7 PM–7 AM (India time).
-- * Alerts (ERP pop-up + Alerts page) for nurses, caregivers and the Nursing Manager; Admin sees the list:
--     - Low urine: urine in the shift that has just ended is below the Guest's limit;
--     - Imbalance: the 24-hour balance (intake − output) of the chart day that has just ended is beyond the limit.
-- * Family Portal / Daily Report: one simple line per chart day, e.g. "Fluid intake 1,800 ml, output 1,500 ml".
-- Nothing else in the ERP is changed.

begin;

-- 1. Which Guests have the chart on, and their alert limits.
create table if not exists public.io_chart_settings(
  patient_id uuid primary key references public.patients(id) on delete cascade,
  enabled boolean not null default true,
  reason text,
  urine_min_ml_shift integer not null default 300 check (urine_min_ml_shift between 0 and 3000),
  balance_limit_ml integer not null default 1000 check (balance_limit_ml between 200 and 5000),
  started_at timestamptz not null default now(),
  started_by uuid,
  started_by_name text,
  stopped_at timestamptz,
  stopped_by_name text,
  updated_at timestamptz not null default now(),
  updated_by_name text
);
comment on table public.io_chart_settings is 'Intake/Output chart: ON per Guest, with low-urine (per 12 h shift) and 24 h balance alert limits.';

-- 2. Intake / Output entries (one row per measurement).
create table if not exists public.io_entries(
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  entry_at timestamptz not null default now(),
  io_date date,               -- chart day (7 AM to 7 AM), set by trigger
  shift text,                 -- 'Day Shift (7 AM–7 PM)' / 'Night Shift (7 PM–7 AM)', set by trigger
  direction text not null check (direction in ('Intake','Output')),
  category text not null,
  item text,
  volume_ml numeric(7,1) check (volume_ml is null or (volume_ml >= 0 and volume_ml <= 5000)),
  stool_count integer check (stool_count is null or stool_count between 0 and 20),
  stool_type text,
  remarks text,
  recorded_by uuid,
  recorded_by_name text,
  created_at timestamptz not null default now(),
  voided boolean not null default false,
  voided_reason text,
  voided_by_name text,
  voided_at timestamptz,
  constraint io_entries_category_check check (
    (direction = 'Intake'  and category in ('Oral fluids','IV fluids','Tube feed','Other intake')) or
    (direction = 'Output' and category in ('Urine','Catheter urine','Drain','Vomit','Stool','Other output'))),
  constraint io_entries_amount_check check (
    case when category = 'Stool' then coalesce(stool_count,0) > 0 or coalesce(volume_ml,0) > 0
         else coalesce(volume_ml,0) > 0 end)
);
comment on table public.io_entries is 'Intake/Output chart entries (ml; stool by count). Chart day 7 AM–7 AM India time.';
create index if not exists io_entries_patient_date_idx on public.io_entries(patient_id, io_date);
create index if not exists io_entries_entry_at_idx on public.io_entries(entry_at desc);

-- Chart day and shift for any time (India time, 7 AM boundary).
create or replace function public.io_chart_day(p_at timestamptz)
returns date language sql stable set search_path=public,pg_temp as $$
  select ((p_at at time zone 'Asia/Kolkata') - interval '7 hours')::date
$$;
create or replace function public.io_shift_of(p_at timestamptz)
returns text language sql stable set search_path=public,pg_temp as $$
  select case when extract(hour from (p_at at time zone 'Asia/Kolkata')) between 7 and 18
              then 'Day Shift (7 AM–7 PM)' else 'Night Shift (7 PM–7 AM)' end
$$;
grant execute on function public.io_chart_day(timestamptz) to authenticated, service_role;
grant execute on function public.io_shift_of(timestamptz) to authenticated, service_role;

create or replace function public.io_entries_fill()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  new.entry_at := coalesce(new.entry_at, now());
  if new.entry_at > now() + interval '10 minutes' then
    raise exception 'The time of an Intake/Output entry cannot be in the future.';
  end if;
  new.io_date := public.io_chart_day(new.entry_at);
  new.shift := public.io_shift_of(new.entry_at);
  if new.category <> 'Stool' then new.stool_count := null; new.stool_type := null; end if;
  return new;
end $$;
drop trigger if exists io_entries_fill on public.io_entries;
create trigger io_entries_fill before insert or update of entry_at, category on public.io_entries
  for each row execute function public.io_entries_fill();

-- Row level security (same style as beverage_records). Entries are corrected by "void with reason", not deleted.
alter table public.io_chart_settings enable row level security;
alter table public.io_entries enable row level security;
drop policy if exists io_settings_select on public.io_chart_settings;
create policy io_settings_select on public.io_chart_settings for select to authenticated using (true);
drop policy if exists io_settings_insert on public.io_chart_settings;
create policy io_settings_insert on public.io_chart_settings for insert to authenticated with check (true);
drop policy if exists io_settings_update on public.io_chart_settings;
create policy io_settings_update on public.io_chart_settings for update to authenticated using (true) with check (true);
drop policy if exists io_entries_select on public.io_entries;
create policy io_entries_select on public.io_entries for select to authenticated using (true);
drop policy if exists io_entries_insert on public.io_entries;
create policy io_entries_insert on public.io_entries for insert to authenticated with check (true);
drop policy if exists io_entries_update on public.io_entries;
create policy io_entries_update on public.io_entries for update to authenticated using (true) with check (true);
grant select, insert, update on public.io_chart_settings to authenticated;
grant select, insert, update on public.io_entries to authenticated;
grant all on public.io_chart_settings, public.io_entries to service_role;

-- 3. Beverage ml (from Resident Food Intake) — the same rule the ERP screen uses.
create or replace function public.io_beverage_ml(p_quantity numeric, p_unit text, p_quantity_ml numeric, p_status text)
returns numeric language sql immutable as $$
  select round(
    coalesce(case lower(coalesce(p_unit,'ml'))
               when 'ml' then coalesce(p_quantity, p_quantity_ml)
               when 'cup' then p_quantity * 150
               when 'tumbler' then p_quantity * 200
               when 'glass' then p_quantity * 250
               when 'mug' then p_quantity * 250
               else null end, 0)
    * case when p_status = 'Refused' then 0
           when p_status = 'Consumed partially' then 0.5
           else 1 end, 1)
$$;
grant execute on function public.io_beverage_ml(numeric,text,numeric,text) to authenticated, service_role;

-- 4. Every intake / output row for one Guest (entries + beverages), used by alerts and the family summary.
create or replace function public.io_rows(p_patient uuid, p_from date, p_to date)
returns table(at timestamptz, io_date date, shift text, direction text, category text, ml numeric, stool_count integer, source text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  return query
    select e.entry_at, e.io_date, e.shift, e.direction, e.category, coalesce(e.volume_ml,0), e.stool_count, 'Chart'::text
    from public.io_entries e
    where e.patient_id = p_patient and not e.voided and e.io_date between p_from and p_to;
  if to_regclass('public.beverage_records') is not null then
    return query execute $q$
      select b.given_at, public.io_chart_day(b.given_at), public.io_shift_of(b.given_at), 'Intake'::text, 'Oral fluids'::text,
             public.io_beverage_ml((to_jsonb(b)->>'quantity')::numeric, to_jsonb(b)->>'quantity_unit', b.quantity_ml::numeric, b.consumption_status),
             null::integer, 'Food Intake'::text
      from public.beverage_records b
      where b.patient_id = $1 and public.io_chart_day(b.given_at) between $2 and $3$q$
    using p_patient, p_from, p_to;
  end if;
end $$;
revoke all on function public.io_rows(uuid,date,date) from public, anon;
grant execute on function public.io_rows(uuid,date,date) to authenticated, service_role;

-- 5. Alerts for the signed-in user. Nurses / caregivers / Nursing Manager get the pop-up (audience 'nursing');
--    Admin / Director see the list only (audience 'admin').
create or replace function public.io_chart_alerts()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid; my_role text; is_nm boolean; aud text; nowi timestamp; today_chart date;
        shift_end timestamptz; shift_start timestamptz; shift_name text; shift_day date;
        day_end timestamptz; out jsonb := '[]'::jsonb;
begin
  select p.id, lower(trim(coalesce(p.role,''))) into me, my_role
  from public.profiles p
  where (p.id = auth.uid() or p.auth_user_id = auth.uid())
    and coalesce(p.active,true) and coalesce(p.is_active,true)
  limit 1;
  if me is null then return '[]'::jsonb; end if;
  is_nm := coalesce(public.indent_is_nursing_manager(me), false);
  aud := case when my_role in ('nurse','caregiver') or is_nm then 'nursing'
              when my_role in ('admin','administrator','director') or my_role = 'manager' then 'admin' end;
  if aud is null then return '[]'::jsonb; end if;

  nowi := now() at time zone 'Asia/Kolkata';
  today_chart := public.io_chart_day(now());
  -- The shift that has just ended (alerts stay for the 12 hours of the next shift).
  if extract(hour from nowi) between 7 and 18 then
    shift_name := 'Night Shift (7 PM–7 AM)'; shift_day := today_chart - 1;
    shift_start := ((today_chart - 1)::timestamp + interval '19 hours') at time zone 'Asia/Kolkata';
  else
    shift_name := 'Day Shift (7 AM–7 PM)'; shift_day := today_chart;
    shift_start := (today_chart::timestamp + interval '7 hours') at time zone 'Asia/Kolkata';
  end if;
  shift_end := shift_start + interval '12 hours';
  day_end := ((today_chart)::timestamp + interval '7 hours') at time zone 'Asia/Kolkata'; -- end of the previous chart day

  with g as (
    select s.*, p.title, p.full_name, p.room_no, p.bed_no
    from public.io_chart_settings s
    join public.patients p on p.id = s.patient_id
    where s.enabled and coalesce(p.is_active, true)
  ),
  low_urine as (
    select g.patient_id, g.title, g.full_name, g.room_no, g.bed_no, g.urine_min_ml_shift as lim,
           coalesce((select sum(r.ml) from public.io_rows(g.patient_id, shift_day, shift_day) r
                     where r.shift = shift_name and r.category in ('Urine','Catheter urine')),0) as urine
    from g where g.started_at <= shift_start and g.urine_min_ml_shift > 0
  ),
  day_bal as (
    select g.patient_id, g.title, g.full_name, g.room_no, g.bed_no, g.balance_limit_ml as lim,
           coalesce((select sum(r.ml) filter (where r.direction='Intake') from public.io_rows(g.patient_id, today_chart-1, today_chart-1) r),0) as intake,
           coalesce((select sum(r.ml) filter (where r.direction='Output') from public.io_rows(g.patient_id, today_chart-1, today_chart-1) r),0) as output
    from g where g.started_at <= day_end - interval '24 hours'
  )
  select coalesce(jsonb_agg(a order by a->>'kind', a->>'guest_name'),'[]'::jsonb) into out from (
    select jsonb_build_object('kind','Low urine','patient_id',u.patient_id,
             'guest_name',nullif(trim(concat_ws(' ',u.title,u.full_name)),''),
             'room_label',case when nullif(trim(coalesce(u.room_no::text,'')),'') is not null then 'Room '||u.room_no||coalesce('-'||nullif(trim(u.bed_no::text),''),'') end,
             'shift',shift_name,'chart_date',shift_day,'ended_at',shift_end,
             'value_ml',u.urine,'limit_ml',u.lim,'audience',aud,
             'alert_key','io-urine-'||u.patient_id||'-'||shift_day||'-'||left(shift_name,3)) as a
    from low_urine u where u.urine < u.lim
    union all
    select jsonb_build_object('kind','Fluid imbalance','patient_id',d.patient_id,
             'guest_name',nullif(trim(concat_ws(' ',d.title,d.full_name)),''),
             'room_label',case when nullif(trim(coalesce(d.room_no::text,'')),'') is not null then 'Room '||d.room_no||coalesce('-'||nullif(trim(d.bed_no::text),''),'') end,
             'chart_date',today_chart-1,'ended_at',day_end,
             'intake_ml',d.intake,'output_ml',d.output,'value_ml',d.intake-d.output,'limit_ml',d.lim,'audience',aud,
             'alert_key','io-balance-'||d.patient_id||'-'||(today_chart-1)) as a
    from day_bal d where abs(d.intake - d.output) > d.lim and (d.intake > 0 or d.output > 0)
  ) x;
  return out;
end $$;
revoke all on function public.io_chart_alerts() from public, anon;
grant execute on function public.io_chart_alerts() to authenticated;

-- 6. Family Portal: one simple line per chart day for the family's own Guest (same session check as
--    family_portal_beverages / family_portal_dashboard). No staff names, no categories.
create or replace function public.family_portal_fluid_balance(p_session_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d jsonb; pid uuid; argtype text; pt jsonb;
begin
  if coalesce(trim(p_session_token),'')='' then return '[]'::jsonb; end if;
  select format_type(p.proargtypes[0],null) into argtype from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='family_portal_dashboard' and p.pronargs=1 limit 1;
  if argtype is null then return '[]'::jsonb; end if;
  begin
    execute format('select to_jsonb(public.family_portal_dashboard($1::%s))',argtype) into d using p_session_token;
  exception when others then return '[]'::jsonb;
  end;
  if d is null or jsonb_typeof(d)<>'object' then return '[]'::jsonb; end if;
  pt := coalesce(d->'patient',d->'resident',d->'guest','{}'::jsonb);
  select p.id into pid from public.patients p
   where p.id::text in (pt->>'id',pt->>'patient_uuid',pt->>'patient_db_id',pt->>'uuid',pt->>'patient_id') limit 1;
  if pid is null then
    select p.id into pid from public.patients p
     where p.patient_id in (pt->>'patient_id',pt->>'resident_id',pt->>'patient_code',pt->>'id') limit 1;
  end if;
  if pid is null or not exists (select 1 from public.io_chart_settings s where s.patient_id = pid) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('chart_date',x.io_date,'intake_ml',x.intake,'output_ml',x.output,
                     'complete',x.io_date < public.io_chart_day(now())) order by x.io_date desc)
    from (
      select r.io_date,
             round(coalesce(sum(r.ml) filter (where r.direction='Intake'),0)) as intake,
             round(coalesce(sum(r.ml) filter (where r.direction='Output'),0)) as output
      from public.io_rows(pid, public.io_chart_day(now()) - 60, public.io_chart_day(now())) r
      where exists (select 1 from public.io_entries e where e.patient_id = pid and e.io_date = r.io_date and not e.voided)
      group by r.io_date
    ) x), '[]'::jsonb);
end $$;
revoke all on function public.family_portal_fluid_balance(text) from public;
grant execute on function public.family_portal_fluid_balance(text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;

-- Checks: all should be true, then the alerts for you right now (empty is fine).
select to_regclass('public.io_entries') is not null as io_entries_ready,
       to_regclass('public.io_chart_settings') is not null as io_settings_ready,
       to_regprocedure('public.io_chart_alerts()') is not null as io_alerts_ready,
       to_regprocedure('public.family_portal_fluid_balance(text)') is not null as family_summary_ready;
