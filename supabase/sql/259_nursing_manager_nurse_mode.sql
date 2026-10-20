-- ERP 2.18.43 — Nursing Manager "Switch to Nurse" (run once, before or with the 2.18.43 frontend).
-- Same login and same employee record. While her Nurse switch is ON, the Nursing Manager is
-- accepted by the server checks that were limited to role 'Nurse'. Switch OFF = exactly as before.
-- The live functions are patched in place (only their role check line), so any later live changes
-- to those functions are kept. Safe to run again: already-patched functions are skipped.
begin;

alter table public.profiles add column if not exists nurse_mode_on boolean not null default false;
alter table public.profiles add column if not exists nurse_mode_changed_at timestamptz;

-- True only for an active Nursing Manager (role Manager + designation Nurse/Nursing Manager) whose switch is ON.
create or replace function public.acting_as_nurse()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.profiles p
    where (p.id=auth.uid() or p.auth_user_id=auth.uid())
      and coalesce(p.nurse_mode_on,false)
      and coalesce(p.is_active,true) and coalesce(p.active,true)
      and p.role='Manager'
      and lower(regexp_replace(trim(coalesce(p.designation,'')),'[._-]+',' ','g')) in ('nurse manager','nursing manager')
  )
$$;
revoke all on function public.acting_as_nurse() from public,anon;
grant execute on function public.acting_as_nurse() to authenticated,service_role;

create or replace function public.set_nurse_mode(p_on boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select * into p from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  if not found or not coalesce(p.is_active,true) or not coalesce(p.active,true) or p.role<>'Manager'
     or lower(regexp_replace(trim(coalesce(p.designation,'')),'[._-]+',' ','g')) not in ('nurse manager','nursing manager') then
    raise exception 'Only the Nursing Manager can switch to Nurse mode.';
  end if;
  update public.profiles set nurse_mode_on=coalesce(p_on,false), nurse_mode_changed_at=now() where id=p.id;
  perform public.record_audit_event(case when coalesce(p_on,false) then 'Nurse Mode On' else 'Nurse Mode Off' end,'Authentication',p.id::text,jsonb_build_object('nurse_mode',coalesce(p_on,false)),'Success');
  return jsonb_build_object('success',true,'nurse_mode_on',coalesce(p_on,false));
end $$;
revoke all on function public.set_nurse_mode(boolean) from public,anon;
grant execute on function public.set_nurse_mode(boolean) to authenticated;

-- Patch each nurse-only check in the LIVE function bodies.
create temporary table nurse_mode_patch_result(function_name text, result text) on commit drop;
do $patch$
declare
  r record; d text; n text;
  patches constant text[][] := array[
    -- function name, regex of the role check, replacement
    array['start_nursing_procedure',            $r$if\s+v_role\s+is\s+distinct\s+from\s+'Nurse'\s+then$r$, $r$if v_role is distinct from 'Nurse' and not public.acting_as_nurse() then$r$],
    array['request_approval_item',              $r$if\s+v_role\s+is\s+distinct\s+from\s+'Nurse'\s+then$r$, $r$if v_role is distinct from 'Nurse' and not public.acting_as_nurse() then$r$],
    array['guard_outside_nursing_indent_roles', $r$if\s+not\s+public\.current_user_has_role\(array\['Nurse'\]\)\s+then$r$, $r$if not (public.current_user_has_role(array['Nurse']) or public.acting_as_nurse()) then$r$],
    array['record_patient_item_consumption',    $r$p\.role\s*=\s*'Nurse'\s+and\s+coalesce\(p\.is_active,\s*true\)$r$, $r$(p.role='Nurse' or public.acting_as_nurse()) and coalesce(p.is_active,true)$r$],
    array['request_patient_store_return',       $r$p\.role\s*=\s*'Nurse'\s+and\s+coalesce\(p\.is_active,\s*true\)$r$, $r$(p.role='Nurse' or public.acting_as_nurse()) and coalesce(p.is_active,true)$r$],
    array['bme_access',                         $r$'nurse',\s*coalesce\(a\.actor_role\s*=\s*'Nurse',\s*false\)$r$, $r$'nurse',(coalesce(a.actor_role='Nurse',false) or public.acting_as_nurse())$r$],
    array['confirm_patient_departure_v3',       $r$if\s+coalesce\(v_role,\s*''\)\s+not\s+in\s+\('Nurse',\s*'Admin'\)\s+then$r$, $r$if coalesce(v_role,'') not in ('Nurse','Admin') and not public.acting_as_nurse() then$r$],
    array['confirm_patient_departure_v4',       $r$if\s+coalesce\(v_role,\s*''\)\s+not\s+in\s+\('Nurse',\s*'Admin'\)\s+then$r$, $r$if coalesce(v_role,'') not in ('Nurse','Admin') and not public.acting_as_nurse() then$r$]
  ];
  i int;
begin
  for i in 1..array_length(patches,1) loop
    n := patches[i][1];
    if not exists(select 1 from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname=n) then
      insert into nurse_mode_patch_result values(n,'not found in database — skipped');
      continue;
    end if;
    for r in select p.oid from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname=n loop
      d := pg_get_functiondef(r.oid);
      if position('acting_as_nurse' in d)>0 then
        insert into nurse_mode_patch_result values(n,'already patched');
      elsif d !~ patches[i][2] then
        insert into nurse_mode_patch_result values(n,'role check not found — NOT changed (tell Claude)');
      else
        execute regexp_replace(d, patches[i][2], patches[i][3], 'g');
        insert into nurse_mode_patch_result values(n,'patched');
      end if;
    end loop;
  end loop;
end
$patch$;

select function_name, result from nurse_mode_patch_result order by function_name;
notify pgrst,'reload schema';
commit;
