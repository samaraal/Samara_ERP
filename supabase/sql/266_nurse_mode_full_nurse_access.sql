-- ERP 2.18.62 — Nursing Manager "Switch to Nurse": FULL Nurse access on the server (run once in Supabase SQL Editor).
-- Problem: SQL 259 patched only 8 named functions. Every other server check that allows only 'Nurse'
-- (e.g. Outside Samara Nursing Procedures: "Only nurses can enter procedures and indents") still refused
-- Sobana while her Nurse switch was ON.
-- Fix (additive — her Manager rights are unchanged; Switch OFF = exactly as before):
--   1. public.current_user_has_role(...) — whenever 'Nurse' is in the allowed list, a Nursing Manager in
--      Nurse mode is accepted too. The LIVE body is wrapped (duty-swap / leave-cover logic is kept).
--   2. Every public function: nurse-only checks on the SIGNED-IN person's role (v_role / a.actor_role) also accept
--      Nurse mode. Checks that look up OTHER staff (e.g. "notify all nurses") are never touched.
--   3. Two discharge checks that read the signed-in person's own profile row (named, exact text).
-- Safe to run again: anything already patched is skipped. The last result lists every change.
begin;

create temporary table nurse_mode_266_result(function_name text, change text) on commit drop;

-- 0. acting_as_nurse() must exist (SQL 259).
do $$ begin
  if to_regprocedure('public.acting_as_nurse()') is null then
    raise exception 'Run SQL 259 (Nursing Manager nurse mode) first — public.acting_as_nurse() is missing.';
  end if;
end $$;

-- 1. Role helper: wrap the live body.
do $h$
declare
  fn regprocedure := to_regprocedure('public.current_user_has_role(text[])');
  d text; body text; lang text; newdef text;
begin
  if fn is null then insert into nurse_mode_266_result values('current_user_has_role','not found — skipped'); return; end if;
  d := pg_get_functiondef(fn);
  select l.lanname into lang from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=fn;
  if position('acting_as_nurse' in d)>0 then
    insert into nurse_mode_266_result values('current_user_has_role','already accepts Nurse mode');
  elsif lang<>'sql' then
    insert into nurse_mode_266_result values('current_user_has_role','language '||lang||' — NOT changed (tell Claude)');
  else
    body := substring(d from '\$function\$(.*)\$function\$');
    if body is null or body !~* '^\s*select' then
      insert into nurse_mode_266_result values('current_user_has_role','body not recognised — NOT changed (tell Claude)');
    else
      body := regexp_replace(body,';\s*$','');
      newdef := replace(d,'$function$'||substring(d from '\$function\$(.*)\$function\$')||'$function$',
        '$function$'||chr(10)||'  select coalesce(('||body||chr(10)||'  ),false)'||chr(10)||
        '  -- 2.18.62: a Nursing Manager with her Nurse switch ON is accepted wherever Nurse is allowed'||chr(10)||
        '  or (''nurse'' = any(select lower(trim(x)) from unnest($1) as x) and public.acting_as_nurse());'||chr(10)||'$function$');
      execute newdef;
      insert into nurse_mode_266_result values('current_user_has_role','patched: accepts Nurse mode when Nurse is allowed');
    end if;
  end if;
end
$h$;

-- 2. Signed-in-person role checks in every public function (live bodies).
do $p$
declare
  r record; d text; n text; i int; cnt int; before text;
  -- pattern (with a negative look-ahead so already-patched text is skipped), replacement, label
  rules constant text[][] := array[
    array[$r$\mv_role\s+is\s+distinct\s+from\s+'Nurse'(?!\s+and\s+not\s+public\.acting_as_nurse)$r$,
          $r$(v_role is distinct from 'Nurse' and not public.acting_as_nurse())$r$, 'v_role is distinct from Nurse'],
    array[$r$\mv_role\s*<>\s*'Nurse'(?!\s+and\s+not\s+public\.acting_as_nurse)$r$,
          $r$(v_role<>'Nurse' and not public.acting_as_nurse())$r$, 'v_role <> Nurse'],
    array[$r$\mv_role\s*=\s*'Nurse'(?!\s+or\s+public\.acting_as_nurse)$r$,
          $r$(v_role='Nurse' or public.acting_as_nurse())$r$, 'v_role = Nurse'],
    array[$r$coalesce\(v_role,\s*''\)\s+not\s+in\s+\('Nurse',\s*'Admin'\)(?!\s+and\s+not\s+public\.acting_as_nurse)$r$,
          $r$(coalesce(v_role,'') not in ('Nurse','Admin') and not public.acting_as_nurse())$r$, 'v_role not in (Nurse, Admin)'],
    array[$r$\ma\.actor_role\s*=\s*'Nurse'(?!\s*(,\s*false\))?\s*or\s+public\.acting_as_nurse)$r$,
          $r$(a.actor_role='Nurse' or public.acting_as_nurse())$r$, 'actor_role = Nurse'],
    array[$r$\ma\.actor_role\s+not\s+in\s+\('Nurse',\s*'Admin'\)(?!\s+and\s+not\s+public\.acting_as_nurse)$r$,
          $r$(a.actor_role not in ('Nurse','Admin') and not public.acting_as_nurse())$r$, 'actor_role not in (Nurse, Admin)']
  ];
begin
  for r in
    select p.oid, p.proname from pg_proc p join pg_namespace s on s.oid=p.pronamespace join pg_language l on l.oid=p.prolang
    where s.nspname='public' and p.prokind='f' and l.lanname in ('plpgsql','sql')
      and p.proname not in ('acting_as_nurse','set_nurse_mode','current_user_has_role')
      and not exists(select 1 from pg_depend dp where dp.objid=p.oid and dp.deptype='e')
  loop
    d := pg_get_functiondef(r.oid);
    if position('''Nurse''' in d)=0 then continue; end if;
    before := d; n := '';
    for i in 1..array_length(rules,1) loop
      select count(*) into cnt from regexp_matches(d, rules[i][1], 'g');
      if cnt>0 then
        d := regexp_replace(d, rules[i][1], rules[i][2], 'g');
        n := n||case when n='' then '' else '; ' end||rules[i][3]||' ×'||cnt;
      end if;
    end loop;
    if d<>before then
      execute d;
      insert into nurse_mode_266_result values(r.proname,'patched: '||n);
    end if;
  end loop;
end
$p$;

-- 3. Discharge checks that read the signed-in person's own profile row (exact text; skipped if not found).
do $x$
declare
  t record; d text; d2 text; fn regprocedure;
  targets constant text[][] := array[
    array['public.enforce_discharge_initiator()',
          $o$and p.role='Nurse') into nursing_final$o$,
          $n$and (p.role='Nurse' or public.acting_as_nurse())) into nursing_final$n$],
    array['public.discharge_workflow_authority()',
          $o$x.id=p.id and x.role='Nurse')$o$,
          $n$x.id=p.id and (x.role='Nurse' or public.acting_as_nurse()))$n$]
  ];
  i int;
begin
  for i in 1..array_length(targets,1) loop
    fn := to_regprocedure(targets[i][1]);
    if fn is null then insert into nurse_mode_266_result values(targets[i][1],'not found — skipped'); continue; end if;
    d := pg_get_functiondef(fn);
    if position(targets[i][3] in d)>0 then insert into nurse_mode_266_result values(targets[i][1],'already accepts Nurse mode'); continue; end if;
    if position(targets[i][2] in d)=0 then insert into nurse_mode_266_result values(targets[i][1],'check text not found — NOT changed (tell Claude)'); continue; end if;
    d2 := replace(d, targets[i][2], targets[i][3]);
    execute d2;
    insert into nurse_mode_266_result values(targets[i][1],'patched: own-profile Nurse check accepts Nurse mode');
  end loop;
end
$x$;

notify pgrst,'reload schema';
select function_name, change from nurse_mode_266_result order by function_name;
commit;
