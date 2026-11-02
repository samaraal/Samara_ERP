-- 339 — New ERP access role "Housekeeping" (ERP 2.19.58)
-- Run this whole file once in Supabase > SQL Editor. Safe to run again. Run AFTER 337 and 338.
--
-- Owner's decision (02-11-2026): Housekeeping staff get their own login with only
--   * Housekeeping & General supplies — request items, confirm receipt, record use (same as STD does today;
--     Nursing Manager approval and Stores handover stay exactly as they are),
--   * Talk to Guest (interpreter; it keeps no Guest records),
--   * My Duty, My Leave & Permission, My Profile, duty swap / leave cover.
--   No Guest records, clinical, billing, stores (other than Housekeeping), HR or kitchen data. No clinical alerts.
--
-- What this file changes:
--   1. adds 'Housekeeping' to the allowed values of profiles.role (and any table with the same role list),
--   2. housekeeping_permissions(): Housekeeping may request / receive / record use / read, like STD,
--   3. duty roster security rules: Housekeeping may see / acknowledge her own duty, like Caregiver,
--   4. the same "limit" rule as 338 (zz_housekeeping_login_limit) on the Guest's clinical, billing, stores,
--      physiotherapy, HR and kitchen tables, for the Housekeeping role ONLY. Every other role is unchanged.
-- Housekeeping supplies themselves go through the housekeeping_workflow function, so they keep working.

-- 0. Helpers -----------------------------------------------------------------------------------
create or replace function public.is_housekeeping_login()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.profiles p
     where (p.id=auth.uid() or p.auth_user_id=auth.uid())
       and p.role='Housekeeping'
       and coalesce(p.is_active,true));
$$;
revoke all on function public.is_housekeeping_login() from public;
grant execute on function public.is_housekeeping_login() to authenticated, service_role;

create or replace function public.housekeeping_login_may_use()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select pg_trigger_depth()>0 or not public.is_housekeeping_login();
$$;
revoke all on function public.housekeeping_login_may_use() from public;
grant execute on function public.housekeeping_login_may_use() to authenticated, service_role;

do $p$
declare c record; v_oid oid; pol record; def text; newdef text; t text;
  n_con int := 0; n_fn int := 0; n_pol int := 0; n_lim int := 0; q text; w text; stmt text;
  tbls text[];
begin
  -- 1. role check constraints ------------------------------------------------------------------
  for c in
    select con.conrelid::regclass as tbl, con.conname, pg_get_constraintdef(con.oid) as d
      from pg_constraint con join pg_namespace ns on ns.oid = con.connamespace
     where ns.nspname = 'public' and con.contype = 'c'
       and pg_get_constraintdef(con.oid) like '%''Caregiver''::text%'
       and pg_get_constraintdef(con.oid) like '%''Nurse''::text%'
       and pg_get_constraintdef(con.oid) not like '%''Housekeeping''::text%'
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
    execute format('alter table %s add constraint %I %s', c.tbl, c.conname,
                   replace(c.d, '''Caregiver''::text', '''Caregiver''::text, ''Housekeeping''::text'));
    n_con := n_con + 1;
  end loop;

  -- 2. Housekeeping supplies rights (patch the live function in place) -------------------------
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='housekeeping_permissions' limit 1;
  if v_oid is null then
    raise notice 'housekeeping_permissions() not found — Housekeeping supplies rights NOT added.';
  else
    def := pg_get_functiondef(v_oid);
    if position('Housekeeping''' in def) = 0 then
      newdef := replace(def, 'a.actor_role=''STD''', 'a.actor_role in (''STD'',''Housekeeping'')');
      newdef := replace(newdef, 'a.actor_role in (''STD'',''Admin'',''Manager'',''Accounts'')',
                                'a.actor_role in (''STD'',''Housekeeping'',''Admin'',''Manager'',''Accounts'')');
      if newdef = def then
        raise notice 'housekeeping_permissions() does not look as expected — Housekeeping supplies rights NOT added. Send this message to Claude.';
      else
        execute newdef; n_fn := n_fn + 1;
      end if;
    end if;
  end if;
  -- clearer wording in the workflow messages (only the message text changes)
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='housekeeping_workflow' limit 1;
  if v_oid is not null then
    def := pg_get_functiondef(v_oid);
    newdef := replace(def, 'Only STD Housekeeping In-charge', 'Only STD / Housekeeping staff');
    if newdef <> def then execute newdef; end if;
  end if;

  -- 3. duty roster security rules (see / acknowledge own duty, like Caregiver) ----------------
  for pol in
    select tablename, policyname, qual, with_check from pg_policies
     where schemaname = 'public' and tablename = 'duty_assignments'
       and (coalesce(qual,'') like '%''Caregiver''::text%' or coalesce(with_check,'') like '%''Caregiver''::text%')
       and coalesce(qual,'')||coalesce(with_check,'') not like '%Housekeeping''::text%'
  loop
    q := replace(pol.qual, '''Caregiver''::text', '''Caregiver''::text, ''Housekeeping''::text');
    w := replace(pol.with_check, '''Caregiver''::text', '''Caregiver''::text, ''Housekeeping''::text');
    stmt := format('alter policy %I on public.%I', pol.policyname, pol.tablename);
    if q is not null then stmt := stmt || format(' using (%s)', q); end if;
    if w is not null then stmt := stmt || format(' with check (%s)', w); end if;
    execute stmt;
    n_pol := n_pol + 1;
  end loop;

  -- 4. limit the Housekeeping login on everything else -----------------------------------------
  --    Same tables as 338's Physiotherapist limit (except the two Housekeeping supply tables), plus physiotherapy.
  select coalesce(array_agg(tablename::text), '{}') into tbls from pg_policies
   where schemaname='public' and policyname='zz_physio_login_limit'
     and tablename not in ('housekeeping_indents','housekeeping_item_usage');
  tbls := tbls || array['physiotherapy_plans','physiotherapy_sessions','physiotherapy_corrections','physiotherapy_notes',
                        'physio_organisations','physio_practitioners','guest_nurse_assignments','guest_cover_records'];
  foreach t in array tbls loop
    if to_regclass('public.'||t) is null then continue; end if;
    if not exists(select 1 from pg_class c2 join pg_namespace s on s.oid=c2.relnamespace
                   where s.nspname='public' and c2.relname=t and c2.relkind in ('r','p') and c2.relrowsecurity) then continue; end if;
    execute format('drop policy if exists zz_housekeeping_login_limit on public.%I', t);
    execute format('create policy zz_housekeeping_login_limit on public.%I as restrictive for all to authenticated '
                   'using (public.housekeeping_login_may_use()) with check (public.housekeeping_login_may_use())', t);
    n_lim := n_lim + 1;
  end loop;

  raise notice 'Housekeeping role: % role list(s), % function(s), % duty rule(s), % table(s) limited.', n_con, n_fn, n_pol, n_lim;
end
$p$;

notify pgrst, 'reload schema';

select 'Housekeeping role ready' as result,
       (select count(*) from pg_policies where schemaname='public' and policyname='zz_housekeeping_login_limit') as tables_limited,
       (select position('Housekeeping' in pg_get_functiondef('public.housekeeping_permissions()'::regprocedure))>0) as supplies_rights_added;

-- ---------------------------------------------------------------------------------------------
-- UNDO of the limit only (if ever needed):
-- do $u$ declare r record; begin
--   for r in select tablename from pg_policies where schemaname='public' and policyname='zz_housekeeping_login_limit' loop
--     execute format('drop policy zz_housekeeping_login_limit on public.%I', r.tablename);
--   end loop; end $u$;
