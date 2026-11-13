-- Samara ERP SQL 404 (app 2.20.96) — Medicine time window: 30 minutes before for EVERY medicine (Admin, 13-11-2026).
-- Late doses: unchanged (never blocked; reason needed when 30+ min late). Nursing Manager's own login / Admin may still
-- give early with a reason. Replaces only the guard function from SQL 403. Safe to run again.
create or replace function public.medication_time_window_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare me public.profiles; v_role text; v_des text; win int := 30; due timestamptz; given timestamptz;
begin
  if auth.uid() is null or new.status <> 'Given' or new.scheduled_date is null or new.scheduled_time is null then return new; end if;
  select * into me from public.profiles where (id = auth.uid() or auth_user_id = auth.uid()) limit 1;
  v_role := lower(trim(coalesce(me.role,'')));
  v_des  := lower(regexp_replace(trim(coalesce(me.designation,'')),'[._-]+',' ','g'));
  if v_role in ('admin','administrator','director') then return new; end if;
  if v_des in ('nurse manager','nursing manager') and not coalesce(me.nurse_mode_on,false) then return new; end if;
  due := (new.scheduled_date + new.scheduled_time) at time zone 'Asia/Kolkata';
  given := coalesce(new.administered_at, now());
  if given < due - make_interval(mins => win) then
    raise exception 'Not yet — this dose is due at % and can be given from 30 minutes before. Early doses only by the Nursing Manager, with the reason.',
      to_char(new.scheduled_time,'HH24:MI') using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.medication_time_window_guard() from public, anon, authenticated;
select 'window = 30 min for all medicines' as done;
