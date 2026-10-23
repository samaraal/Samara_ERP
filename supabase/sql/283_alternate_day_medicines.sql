-- Samara Care ERP 2.18.96 — "Alternate Days" medicines (every other day) (23-10-2026)
-- Run once in Supabase > SQL Editor AFTER file 279. Safe to run again.
--
-- WHAT IT DOES
--   1. medication_orders.dose_anchor_date = one day on which the alternate-day medicine is given.
--      Doses are then due every 2nd day from that day (before and after it).
--   2. Filled automatically on every new / changed prescription (Admission, Doctor Review, scan):
--        the date written in the instruction ("Alternate days from 23-10-2026", the ERP form writes it)
--        → the value already on the row → the previous version's day (Doctor Review keeps the same cycle)
--        → the first dose date of the order.
--      So a doctor review on an "off" day never shifts the cycle (the Weekly lesson from file 279).
--   3. The server alert list (Medicine Due / escalations) skips the "off" days, like the app screens.

begin;

alter table public.medication_orders add column if not exists dose_anchor_date date;
comment on column public.medication_orders.dose_anchor_date is 'Alternate Days medicine: a day the dose is given; due every 2nd day from it';

create or replace function public.samara_is_alternate_days(p text)
returns boolean language sql immutable as $$
  select coalesce(lower(btrim(p)) ~ '^(alternate\s*days?|alternate\s*day\M.*|every\s*other\s*day|eod|a/?d)$', false)
$$;

-- "Alternate days from 23-10-2026" → 2026-10-23 (NULL when not written or not a real date).
create or replace function public.samara_alternate_start_from_text(p text)
returns date language plpgsql immutable as $$
declare m text[];
begin
  m := regexp_match(coalesce(p,''), 'alternate\s+days?\s+(?:from|starting|start)\s*:?\s*(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})', 'i');
  if m is null then return null; end if;
  return make_date(m[3]::int, m[2]::int, m[1]::int);
exception when others then return null;
end $$;

-- Same trigger as file 279, plus the alternate-day dose day.
create or replace function public.samara_medication_order_dose_day()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare
  v_freq text := lower(btrim(coalesce(new.frequency,'')));
  v_anchor date := coalesce((new.effective_from at time zone 'Asia/Kolkata')::date, new.start_date);
  v_src public.medication_orders%rowtype;
begin
  if new.source_order_id is not null then
    select * into v_src from public.medication_orders where id=new.source_order_id;
  end if;
  if v_freq='weekly' then
    new.dose_weekday := coalesce(public.samara_weekday_from_text(new.special_instruction),
                                 new.dose_weekday, v_src.dose_weekday,
                                 case when v_anchor is not null then extract(dow from v_anchor)::smallint end);
  else
    new.dose_weekday := null;
  end if;
  if v_freq='monthly' then
    new.dose_month_day := coalesce(public.samara_month_day_from_text(new.special_instruction), new.dose_month_day, v_src.dose_month_day,
                                   case when v_anchor is not null then extract(day from v_anchor)::smallint end);
  else
    new.dose_month_day := null;
  end if;
  if public.samara_is_alternate_days(v_freq) then
    new.dose_anchor_date := coalesce(public.samara_alternate_start_from_text(new.special_instruction),
                                     new.dose_anchor_date, v_src.dose_anchor_date, v_anchor);
  else
    new.dose_anchor_date := null;
  end if;
  return new;
end $$;

drop trigger if exists samara_medication_order_dose_day on public.medication_orders;
create trigger samara_medication_order_dose_day
before insert or update of frequency, special_instruction, effective_from, start_date, source_order_id, dose_weekday, dose_month_day, dose_anchor_date
on public.medication_orders
for each row execute function public.samara_medication_order_dose_day();

-- Existing Alternate Days prescriptions (normally none yet).
do $$
declare r record;
begin
  for r in select id from public.medication_orders
           where public.samara_is_alternate_days(frequency)
           order by coalesce(version_no,1), created_at loop
    update public.medication_orders set frequency=frequency where id=r.id;
  end loop;
end $$;

-- Due-day rule for the server alerts: file 279's rule + alternate days.
create or replace function public.samara_medication_due_on_order(p_frequency text, p_weekday smallint, p_month_day smallint, p_anchor date, p_day date, p_alt_anchor date)
returns boolean language sql immutable as $$
  select case
    when public.samara_is_alternate_days(p_frequency) then
         p_day is null or coalesce(p_alt_anchor, p_anchor) is null or ((p_day - coalesce(p_alt_anchor, p_anchor)) % 2) = 0
    else public.samara_medication_due_on_order(p_frequency, p_weekday, p_month_day, p_anchor, p_day)
  end
$$;

do $patch$
declare
  def text;
  old_call constant text := 'public.samara_medication_due_on_order(mo.frequency,mo.dose_weekday,mo.dose_month_day,coalesce((mo.effective_from at time zone ''Asia/Kolkata'')::date,mo.start_date),v_today) /* 2.18.91 fixed weekday */';
  new_call constant text := 'public.samara_medication_due_on_order(mo.frequency,mo.dose_weekday,mo.dose_month_day,coalesce((mo.effective_from at time zone ''Asia/Kolkata'')::date,mo.start_date),v_today,mo.dose_anchor_date) /* 2.18.96 alternate days */';
begin
  def := pg_get_functiondef('public.get_current_clinical_alerts()'::regprocedure);
  if position('2.18.96 alternate days' in def) > 0 then
    raise notice 'Alert list already handles alternate-day medicines.';
  elsif (length(def)-length(replace(def,old_call,'')))/length(old_call) <> 1 then
    raise exception 'The medicine day rule (file 279) was not found exactly once in get_current_clinical_alerts — run file 279 first. Nothing changed.';
  else
    execute replace(def, old_call, new_call);
    raise notice 'get_current_clinical_alerts updated: alternate-day medicines alert only on their dose days.';
  end if;
end $patch$;

commit;
notify pgrst,'reload schema';

-- Quick self-check (should show true, false, true):
select public.samara_medication_due_on_order('Alternate Days',null,null,date '2026-10-23',date '2026-10-25',date '2026-10-23') as due_25,
       public.samara_medication_due_on_order('Alternate Days',null,null,date '2026-10-23',date '2026-10-26',date '2026-10-23') as due_26,
       public.samara_medication_due_on_order('Once Daily (OD)',1::smallint,null,date '2026-10-23',date '2026-10-26',null) as od_every_day;
