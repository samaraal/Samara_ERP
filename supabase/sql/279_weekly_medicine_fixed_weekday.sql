-- Samara Care ERP 2.18.91 — Weekly / Monthly medicines are due on their OWN day (23-10-2026)
-- Run once in Supabase > SQL Editor. Safe to run again.
--
-- ROOT CAUSE (Mrs. Shanthi T, Inj. Anfoe 4000 IU, Friday 23-10-2026 missed):
--   A Weekly medicine had no "day of week". The ERP counted every 7 days from the date the CURRENT
--   prescription version started. Anfoe's version started on Sunday 18-10 (after doctor reviews), while the
--   doctor's note said "EVERY FRIDAY FOR 4 WEEKS" (only free text, never read). So MAR, Shift Tasks,
--   screensaver and alerts all expected Sundays, and the Friday dose appeared nowhere.
--
-- FIX:
--   1. medication_orders.dose_weekday (0 = Sunday … 6 = Saturday) and dose_month_day (1–31).
--   2. Filled automatically on every new / changed prescription (Admission, Doctor Review, scan):
--        the day written in the instruction ("Every Friday") → the previous version's day (Doctor Review
--        keeps it) → the weekday of the first dose date.  The ERP form now makes the Day of week compulsory
--        and writes it into the instruction, so it always travels with the prescription.
--   3. Existing Weekly / Monthly prescriptions are filled the same way now (Anfoe → Friday).
--   4. The server alert list (Medicine Due / escalations) uses the fixed day, like the app screens.
-- The list at the end shows every active Weekly / Monthly medicine and the day now used — please check it.

begin;

alter table public.medication_orders add column if not exists dose_weekday smallint check (dose_weekday between 0 and 6);
alter table public.medication_orders add column if not exists dose_month_day smallint check (dose_month_day between 1 and 31);
comment on column public.medication_orders.dose_weekday is 'Weekly medicine: day of week the dose is due (0=Sunday … 6=Saturday)';
comment on column public.medication_orders.dose_month_day is 'Monthly medicine: day of month the dose is due (1–31; last day in shorter months)';

-- Weekday written in a text ("Every Friday", "fri", "FRIDAYS"). NULL when none or more than one day is written.
create or replace function public.samara_weekday_from_text(p text)
returns smallint language sql immutable as $$
  select case when count(distinct d)=1 then min(d)::smallint end
  from (
    select case lower(m[1]) when 'sun' then 0 when 'mon' then 1 when 'tue' then 2 when 'tues' then 2 when 'wed' then 3 when 'wednes' then 3
                            when 'thu' then 4 when 'thur' then 4 when 'thurs' then 4 when 'fri' then 5 when 'sat' then 6 when 'satur' then 6 end as d
    from regexp_matches(coalesce(p,''), '\m(sun|mon|tue|tues|wed|wednes|thu|thur|thurs|fri|sat|satur)(?:day)?s?\M', 'gi') as m
  ) x
$$;

create or replace function public.samara_month_day_from_text(p text)
returns smallint language sql immutable as $$
  select case when n between 1 and 31 then n::smallint end
  from (select coalesce((regexp_match(coalesce(p,''), '\mday\s*(\d{1,2})\M', 'i'))[1],
                        (regexp_match(coalesce(p,''), '\m(\d{1,2})(?:st|nd|rd|th)\s+(?:of\s+)?(?:every|each)\s+month\M', 'i'))[1])::int as n) x
$$;

-- Fill the day on every insert / change.
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
  return new;
end $$;

drop trigger if exists samara_medication_order_dose_day on public.medication_orders;
create trigger samara_medication_order_dose_day
before insert or update of frequency, special_instruction, effective_from, start_date, source_order_id, dose_weekday, dose_month_day
on public.medication_orders
for each row execute function public.samara_medication_order_dose_day();

-- Existing Weekly / Monthly prescriptions (oldest first so later versions can inherit from earlier ones).
do $$
declare r record;
begin
  for r in select id from public.medication_orders
           where lower(btrim(coalesce(frequency,''))) in ('weekly','monthly')
           order by coalesce(version_no,1), created_at loop
    update public.medication_orders set frequency=frequency where id=r.id;
  end loop;
end $$;

-- Due-day rule for the server alerts (same as the app): fixed weekday / month day when known.
create or replace function public.samara_medication_due_on_order(p_frequency text, p_weekday smallint, p_month_day smallint, p_anchor date, p_day date)
returns boolean language sql immutable as $$
  select case
    when lower(btrim(coalesce(p_frequency,''))) not in ('weekly','monthly') or p_day is null then true
    when p_anchor is not null and p_day < p_anchor then false
    when lower(btrim(p_frequency))='weekly' and p_weekday is not null then extract(dow from p_day)=p_weekday
    when lower(btrim(p_frequency))='monthly' and p_month_day is not null then
         extract(day from p_day)=least(p_month_day, extract(day from (date_trunc('month',p_day)+interval '1 month - 1 day')))
    else public.samara_medication_due_on(p_frequency, p_anchor, p_day)
  end
$$;

do $patch$
declare
  def text;
  old_call constant text := 'public.samara_medication_due_on(mo.frequency,coalesce((mo.effective_from at time zone ''Asia/Kolkata'')::date,mo.start_date),v_today)';
  new_call constant text := 'public.samara_medication_due_on_order(mo.frequency,mo.dose_weekday,mo.dose_month_day,coalesce((mo.effective_from at time zone ''Asia/Kolkata'')::date,mo.start_date),v_today) /* 2.18.91 fixed weekday */';
begin
  def := pg_get_functiondef('public.get_current_clinical_alerts()'::regprocedure);
  if position('2.18.91 fixed weekday' in def) > 0 then
    raise notice 'Alert list already uses the fixed weekday.';
  elsif (length(def)-length(replace(def,old_call,'')))/length(old_call) <> 1 then
    raise exception 'The medicine day rule (file 155) was not found exactly once in get_current_clinical_alerts — nothing changed.';
  else
    execute replace(def, old_call, new_call);
    raise notice 'get_current_clinical_alerts updated: weekly / monthly medicines use their fixed day.';
  end if;
end $patch$;

commit;
notify pgrst,'reload schema';

-- Please check: every ACTIVE Weekly / Monthly medicine and the day now used.
select p.full_name as guest, p.room_no, mo.medicine_name, mo.frequency,
       case when mo.dose_weekday is not null then (array['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])[mo.dose_weekday+1]
            when mo.dose_month_day is not null then 'Day '||mo.dose_month_day||' of each month' end as due_day,
       to_char(mo.start_date,'DD-MM-YYYY') as start_date, to_char(mo.end_date,'DD-MM-YYYY') as end_date, mo.duration, mo.special_instruction
from public.medication_orders mo join public.patients p on p.id=mo.patient_id
where mo.is_active and lower(btrim(coalesce(mo.frequency,''))) in ('weekly','monthly')
order by p.room_no, mo.medicine_name;
