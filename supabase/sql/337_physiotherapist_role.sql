-- 337 — New ERP access role "Physiotherapist" (ERP 2.19.55)
--   A physiotherapist login sees only Physiotherapy (her sessions), My Duty, Leave and Profile.
--   Samara's own physiotherapists are salaried: no session fee is paid to them (set "Paid by: Salary"
--   in Physiotherapy Dashboard → Therapist Accounts → Physiotherapists, as before).
--   This only ADDS 'Physiotherapist' next to 'Caregiver' where the live database lists clinical roles:
--     1. the allowed values of profiles.role
--     2. the physiotherapy functions that check the caller's role
--     3. the duty-roster and physiotherapy-session security rules
--   Nothing else is changed. Safe to re-run (skips anything already done).

do $p$
declare c record; f record; pol record; def text; n_con int := 0; n_fn int := 0; n_pol int := 0;
  q text; w text; stmt text;
begin
  -- 1. role check constraints (profiles, and any other table with the same role list)
  for c in
    select con.conrelid::regclass as tbl, con.conname, pg_get_constraintdef(con.oid) as d
      from pg_constraint con join pg_namespace ns on ns.oid = con.connamespace
     where ns.nspname = 'public' and con.contype = 'c'
       and pg_get_constraintdef(con.oid) like '%''Caregiver''::text%'
       and pg_get_constraintdef(con.oid) like '%''Nurse''::text%'
       and pg_get_constraintdef(con.oid) not like '%Physiotherapist%'
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
    execute format('alter table %s add constraint %I %s', c.tbl, c.conname,
                   replace(c.d, '''Caregiver''::text', '''Caregiver''::text, ''Physiotherapist''::text'));
    n_con := n_con + 1;
  end loop;

  -- 2. physiotherapy functions with a role list
  for f in
    select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('physio_organisation_options','physio_practitioner_options','physio_session_counts',
                         'physio_session_details','physio_session_locks','physio_contact_directory',
                         'physio_today_contacts','request_physiotherapy_correction','guard_physiotherapy_correction')
  loop
    def := pg_get_functiondef(f.oid);
    if position('Physiotherapist' in def) > 0 or position('''Caregiver''' in def) = 0 then continue; end if;
    execute replace(def, '''Caregiver''', '''Caregiver'',''Physiotherapist''');
    n_fn := n_fn + 1;
  end loop;

  -- 3. security rules on the duty roster (acknowledge My Duty) and physiotherapy sessions
  for pol in
    select tablename, policyname, cmd, qual, with_check from pg_policies
     where schemaname = 'public' and tablename in ('duty_assignments','physiotherapy_sessions')
       and (coalesce(qual,'') like '%''Caregiver''::text%' or coalesce(with_check,'') like '%''Caregiver''::text%')
       and coalesce(qual,'')||coalesce(with_check,'') not like '%Physiotherapist%'
  loop
    q := replace(pol.qual, '''Caregiver''::text', '''Caregiver''::text, ''Physiotherapist''::text');
    w := replace(pol.with_check, '''Caregiver''::text', '''Caregiver''::text, ''Physiotherapist''::text');
    stmt := format('alter policy %I on public.%I', pol.policyname, pol.tablename);
    if q is not null then stmt := stmt || format(' using (%s)', q); end if;
    if w is not null then stmt := stmt || format(' with check (%s)', w); end if;
    execute stmt;
    n_pol := n_pol + 1;
  end loop;

  raise notice 'Physiotherapist role: % role list(s), % function(s), % security rule(s) updated.', n_con, n_fn, n_pol;
end
$p$;

notify pgrst, 'reload schema';
select 'Physiotherapist role ready' as result;
