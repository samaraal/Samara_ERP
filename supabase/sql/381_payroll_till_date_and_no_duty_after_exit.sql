-- ERP 2.20.45 — (1) Payroll counts days only TILL DATE: for the running month up to today, and for staff who left only
-- up to their last working day (planned future duties are not paid). (2) No duty after a staff member leaves: future
-- duties after the last working day are removed automatically, and new ones are blocked.
-- Last working day = HR exit (Employee Register → Exit): Resignation / Termination → last working day;
-- Left without notice → the day before "absent from". If no exit is recorded but the login was disabled → the day it
-- was disabled. Needs SQL 331, 335, 368, 370. Run once; safe to run again.
begin;

create or replace function public.samara_staff_last_day(p_profile uuid)
returns date language plpgsql stable security definer set search_path=public,pg_temp as $$
declare pr public.profiles; d date;
begin
  select * into pr from public.profiles where id = p_profile or auth_user_id = p_profile limit 1;
  if pr.id is null then return null; end if;
  select case when s.exit_type = 'Left without notice' then coalesce(s.absent_from - 1, s.last_working_day) else s.last_working_day end
    into d from public.employee_separations s
   where s.employee_id = pr.id and s.status not in ('Withdrawn','Cancelled')
   order by s.created_at desc limit 1;
  if d is null and not (coalesce(pr.is_active,true) and coalesce(pr.active,true)) then
    select (max(a.created_at) at time zone 'Asia/Kolkata')::date into d from public.audit_log a
     where a.entity_id::text = pr.id::text and a.action ilike '%disable%';
  end if;
  return d;
end $$;
revoke all on function public.samara_staff_last_day(uuid) from public, anon;
grant execute on function public.samara_staff_last_day(uuid) to authenticated, service_role;

-- last day Payroll may count for this employee in a month
create or replace function public.samara_payroll_cutoff(p_profile uuid, p_end date)
returns date language sql stable security definer set search_path=public,pg_temp as $$
  select least(p_end, (now() at time zone 'Asia/Kolkata')::date, coalesce(public.samara_staff_last_day(p_profile), p_end))
$$;
-- payable days on the 30-day month: full month = 30 (from joining if joined that month); a part month = calendar days
create or replace function public.samara_payroll_avail(p_profile uuid, p_month date, p_join date, p_end date)
returns numeric language plpgsql stable security definer set search_path=public,pg_temp as $$
declare c date := public.samara_payroll_cutoff(p_profile, p_end); s date := greatest(p_month, coalesce(p_join, p_month));
begin
  if c < s then return 0; end if;
  if c >= p_end then return greatest(1, 30 - (extract(day from s)::int - 1)); end if;
  return greatest(0, least(30, extract(day from c)::int - extract(day from s)::int + 1));
end $$;
revoke all on function public.samara_payroll_cutoff(uuid,date), public.samara_payroll_avail(uuid,date,date,date) from public, anon;
grant execute on function public.samara_payroll_cutoff(uuid,date), public.samara_payroll_avail(uuid,date,date,date) to authenticated, service_role;

-- live-patch samara_payroll_rpc (keeps every earlier live edit)
do $patch$
declare def text; a int; b int; c int; sect text; n int;
begin
  select pg_get_functiondef('public.samara_payroll_rpc(text,jsonb)'::regprocedure) into def;
  if position('samara_payroll_cutoff' in def) > 0 then raise notice 'samara_payroll_rpc already patched'; return; end if;
  a := position($q$if p_action = 'month' then$q$ in def);
  b := position($q$elsif p_action = 'save' then$q$ in def);
  if a = 0 or b = 0 then raise exception 'samara_payroll_rpc: month / save sections not found — nothing changed'; end if;
  c := a + position('return coalesce((' in substr(def, a)) - 1;
  if c <= a or c >= b then raise exception 'samara_payroll_rpc: month query not found — nothing changed'; end if;
  sect := substr(def, c, b - c);
  n := (length(sect) - length(replace(sect, $q$'avail_days', case when$q$, ''))) / length($q$'avail_days', case when$q$);
  if n <> 1 then raise exception 'samara_payroll_rpc: avail_days not in the expected form — nothing changed'; end if;
  sect := regexp_replace(sect, $q$'avail_days', case when .*? else 30 end$q$, $q$'avail_days', __AVAIL__$q$);
  sect := replace(sect, 'v_end', 'public.samara_payroll_cutoff(pr.id, v_end)');
  sect := replace(sect, '__AVAIL__', $q$public.samara_payroll_avail(pr.id, v_month, coalesce(pr.date_of_joining, (pr.created_at at time zone 'Asia/Kolkata')::date), v_end), 'last_day', public.samara_staff_last_day(pr.id), 'cutoff', public.samara_payroll_cutoff(pr.id, v_end)$q$);
  def := substr(def, 1, c - 1) || sect || substr(def, b);
  -- save: payable days the same way (a leaver is paid only up to the last working day)
  if def !~ $q$v_avail := case when v_join between v_month and v_end then .*? else 30 end;$q$ then
    raise exception 'samara_payroll_rpc: save v_avail not in the expected form — nothing changed';
  end if;
  def := regexp_replace(def, $q$v_avail := case when v_join between v_month and v_end then .*? else 30 end;$q$,
                        $q$v_avail := public.samara_payroll_avail(v_emp.id, v_month, v_join, v_end);$q$);
  execute def;
end
$patch$;

-- ---------- no duty after the last working day ----------
create or replace function public.samara_clear_duties_after_exit(p_profile uuid)
returns int language plpgsql security definer set search_path=public,pg_temp as $$
declare last date := public.samara_staff_last_day(p_profile); pr public.profiles; r record; n int := 0;
begin
  if last is null then return 0; end if;
  select * into pr from public.profiles where id = p_profile or auth_user_id = p_profile limit 1;
  for r in select id from public.duty_assignments where employee_id in (pr.id, pr.auth_user_id) and duty_date > last loop
    begin
      delete from public.duty_assignments where id = r.id;
    exception when others then
      update public.duty_assignments set status = 'Cancelled', remarks = left(concat_ws(' · ', nullif(remarks,''), 'Cancelled: staff left (last working day ' || to_char(last,'DD-MM-YYYY') || ')'), 1000) where id = r.id;
    end;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.samara_clear_duties_after_exit(uuid) from public, anon, authenticated;

create or replace function public.samara_duty_block_after_exit()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare last date; nm text;
begin
  if coalesce(new.status,'') = 'Cancelled' then return new; end if;
  last := public.samara_staff_last_day(new.employee_id);
  if last is not null and new.duty_date > last then
    select full_name into nm from public.profiles where id = new.employee_id or auth_user_id = new.employee_id limit 1;
    raise exception '% has left Samara (last working day %) — no duty can be assigned after that date.', coalesce(nm,'This staff member'), to_char(last,'DD-MM-YYYY');
  end if;
  return new;
end $$;
drop trigger if exists samara_duty_block_after_exit on public.duty_assignments;
create trigger samara_duty_block_after_exit before insert or update of duty_date, employee_id, status on public.duty_assignments
  for each row execute function public.samara_duty_block_after_exit();

-- when an exit is recorded / changed, or a login is disabled: remove the duties after the last working day
create or replace function public.samara_exit_clear_duties_trg()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform public.samara_clear_duties_after_exit(case when tg_table_name = 'profiles' then new.id else new.employee_id end);
  return new;
end $$;
drop trigger if exists samara_exit_clear_duties on public.employee_separations;
create trigger samara_exit_clear_duties after insert or update on public.employee_separations
  for each row execute function public.samara_exit_clear_duties_trg();
drop trigger if exists samara_disable_clear_duties on public.profiles;
create trigger samara_disable_clear_duties after update of is_active, active on public.profiles
  for each row when ((coalesce(new.is_active,true) and coalesce(new.active,true)) is false and (coalesce(old.is_active,true) and coalesce(old.active,true)) is true)
  execute function public.samara_exit_clear_duties_trg();

-- now: everyone who has already left
do $$ declare r record; n int := 0; begin
  for r in select p.id from public.profiles p
            where not (coalesce(p.is_active,true) and coalesce(p.active,true))
               or exists(select 1 from public.employee_separations s where s.employee_id = p.id and s.status not in ('Withdrawn','Cancelled')) loop
    n := n + public.samara_clear_duties_after_exit(r.id);
  end loop;
  raise notice 'Duties removed after last working day: %', n;
end $$;

notify pgrst, 'reload schema';
commit;

select p.full_name, public.samara_staff_last_day(p.id) as last_working_day,
       (select count(*) from public.duty_assignments d where d.employee_id in (p.id, p.auth_user_id) and d.duty_date > public.samara_staff_last_day(p.id)) as duties_after
  from public.profiles p where public.samara_staff_last_day(p.id) is not null;
