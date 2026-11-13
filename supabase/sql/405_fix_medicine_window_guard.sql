-- Samara ERP SQL 405 — URGENT FIX for SQL 403 / 404 (13-11-2026 20:55).
-- medication_administrations.scheduled_time is TEXT in this database, so "date + scheduled_time" failed and EVERY
-- "Given" dose was refused with "This part of the system needs an update". This version converts the time first.
-- Rule unchanged: staff may give from 30 min before the scheduled time; Nursing Manager's own login / Admin any time.
create or replace function public.medication_time_window_guard()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare me public.profiles; v_role text; v_des text; win int := 30; due timestamptz; given timestamptz; t time;
begin
  if auth.uid() is null or new.status <> 'Given' or new.scheduled_date is null or new.scheduled_time is null then return new; end if;
  begin t := left(trim(new.scheduled_time::text),5)::time; exception when others then return new; end;
  select * into me from public.profiles where (id = auth.uid() or auth_user_id = auth.uid()) limit 1;
  v_role := lower(trim(coalesce(me.role,'')));
  v_des  := lower(regexp_replace(trim(coalesce(me.designation,'')),'[._-]+',' ','g'));
  if v_role in ('admin','administrator','director') then return new; end if;
  if v_des in ('nurse manager','nursing manager') and not coalesce(me.nurse_mode_on,false) then return new; end if;
  due := (new.scheduled_date::date + t) at time zone 'Asia/Kolkata';
  given := coalesce(new.administered_at, now());
  if given < due - make_interval(mins => win) then
    raise exception 'Not yet — this dose is due at % and can be given from 30 minutes before. Early doses only by the Nursing Manager, with the reason.',
      to_char(t,'HH24:MI') using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.medication_time_window_guard() from public, anon, authenticated;
select 'fixed — doses can be saved again' as done;
