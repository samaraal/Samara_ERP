-- STEP 2 — PERMANENTLY deletes the employee Rama: her login, her employee record, her duty and leave rows.
-- This cannot be undone. Run STEP 1 first.
-- Safety: stops (and changes nothing) unless exactly ONE employee named Rama is found, and stops if any
-- clinical / billing record cannot be kept without her (that record is never deleted).
-- Entries she made elsewhere stay; they just no longer show her name.
do $$
declare v record; n int; ids text[]; fk record;
begin
  select count(*) into n from public.profiles where full_name ~* '\mrama\M';
  if n <> 1 then
    raise exception 'Expected exactly ONE employee named Rama, found %: %. Nothing was deleted — send this message to Claude.',
      n, coalesce((select string_agg(coalesce(employee_id,'no ID')||' · '||full_name, ' | ') from public.profiles where full_name ~* '\mrama\M'),'none');
  end if;
  select * into v from public.profiles where full_name ~* '\mrama\M';
  ids := array_remove(array[v.id::text, v.auth_user_id::text], null);

  -- Her own rows
  if to_regclass('public.duty_assignments') is not null then delete from public.duty_assignments where employee_id::text = any(ids); end if;
  if to_regclass('public.absence_requests') is not null then delete from public.absence_requests where employee_id::text = any(ids); end if;
  if to_regclass('public.duty_roster_exclusions') is not null then delete from public.duty_roster_exclusions where profile_id::text = any(ids); end if;
  if to_regclass('public.push_subscriptions') is not null then
    begin execute 'delete from public.push_subscriptions where user_id::text = any($1)' using ids; exception when undefined_column then null; end;
  end if;

  -- Every other link to her (public schema): empty optional links; stop if a required link has records.
  for fk in
    select c.conrelid::regclass as tbl, a.attname as col, a.attnotnull as notnull
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and array_length(c.conkey,1) = 1
       and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
       and c.connamespace = 'public'::regnamespace
  loop
    if fk.notnull then
      execute format('select count(*) from %s where %I::text = any($1)', fk.tbl, fk.col) into n using ids;
      if n > 0 and fk.tbl <> 'public.profiles'::regclass then
        raise exception 'Rama is linked to % record(s) in %.% that must be kept. Nothing was deleted — send this message to Claude.', n, fk.tbl, fk.col;
      end if;
    elsif fk.tbl <> 'public.profiles'::regclass or fk.col <> 'id' then
      execute format('update %s set %I = null where %I::text = any($1)', fk.tbl, fk.col, fk.col) using ids;
    end if;
  end loop;

  delete from public.profiles where id = v.id;
  delete from auth.users where id::text = any(ids);
  raise notice 'Deleted employee % (%) — login and employee record removed.', v.full_name, coalesce(v.employee_id,'no ID');
end $$;
