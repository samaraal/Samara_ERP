-- Samara Care ERP 1.3.35
-- Shift-wise Daily Care validation

create or replace function public.validate_care_log_shift_time()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  v_local_time time := (now() at time zone 'Asia/Kolkata')::time;
  v_local_date date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if new.care_date>v_local_date then
    raise exception 'Future care dates are not permitted.';
  end if;

  if new.care_date=v_local_date then
    if new.shift='Day Shift (7 AM–7 PM)'
       and not (v_local_time>=time '07:00' and v_local_time<time '19:00') then
      raise exception 'Day Shift care can be recorded only between 7:00 AM and 7:00 PM.';
    end if;

    if new.shift='Night Shift (7 PM–7 AM)'
       and not (v_local_time>=time '19:00' or v_local_time<time '07:00') then
      raise exception 'Night Shift care can be recorded only between 7:00 PM and 7:00 AM.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_care_log_shift_time_trigger on public.care_logs;
create trigger validate_care_log_shift_time_trigger
before insert or update on public.care_logs
for each row execute function public.validate_care_log_shift_time();

notify pgrst,'reload schema';

select exists(
  select 1 from pg_trigger
  where tgname='validate_care_log_shift_time_trigger'
) as shift_validation_ready;
