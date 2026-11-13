-- ERP 2.20.70 — BIOMETRIC: TWO-WAY ERP <-> easy TimePro and one proper staff register (13-11-2026).
-- Needs SQL 371-373, 378. Works with "Samara Biometric Sync" 1.3 on the Samara PC.
--
-- Rules agreed with Boomi (13-11-2026):
--   ERP is master for employment (join / leave / suspension, name, department); easy TimePro is master for the machine
--   number and the fingerprint. Joins / leaves in the ERP reach easy TimePro (as before).
--   easy TimePro -> ERP (new): every run the PC program sends easy TimePro's user list when it changed (and in full once an
--   hour). The ERP then shows, in Biometric Attendance -> Staff Register, and as alerts to Admin / Directors / HR:
--     • Removed from machine   — linked active employee deleted in easy TimePro (ERP not changed; Admin re-adds or records the exit)
--     • New on machine         — a number in easy TimePro linked to nobody (Admin links it or marks "Not an ERP employee")
--     • Number reused          — a number of someone who LEFT now carries another person's name in easy TimePro
--     • Different name         — easy TimePro shows another person's name on a linked number (the program no longer
--                                overwrites it; Admin confirms "Use ERP name" when it is the same person)
--     • Sync stopped           — no report from the Samara PC for 30 min between 7 AM and 10:30 PM
--   The program no longer re-adds a number deleted in easy TimePro by itself (only after Admin presses "Re-add to machine").
--   A machine number is never given to another person.
-- Also: Madhu Mithra stays on machine no. 32 (her punch of 13-11 on Akshi's old no. 23 is moved to 32).
-- Run once; safe to run again.
begin;

alter table public.attendance_device_users
  add column if not exists tp_present boolean,          -- in easy TimePro's last full list
  add column if not exists tp_name text,                -- name in easy TimePro
  add column if not exists tp_status text,              -- active | blocked | resigned
  add column if not exists tp_seen_at timestamptz,
  add column if not exists tp_missing_since timestamptz,
  add column if not exists readd_requested_at timestamptz,
  add column if not exists readd_requested_by text,
  add column if not exists use_erp_name_at timestamptz,
  add column if not exists use_erp_name_by text;
alter table public.attendance_push_settings
  add column if not exists last_tp_list_at timestamptz;

-- same person? letters only, lower case: one contains the other, or the first 4 letters match
create or replace function public.samara_same_person(a text, b text)
returns boolean language sql immutable as $$
  with x as (select regexp_replace(lower(coalesce(a,'')),'^(dr|mr|mrs|ms|miss|smt|sr)\.?\s+','') a1,
                    regexp_replace(lower(coalesce(b,'')),'^(dr|mr|mrs|ms|miss|smt|sr)\.?\s+','') b1),
       y as (select regexp_replace(a1,'[^a-z]','','g') a2, regexp_replace(b1,'[^a-z]','','g') b2 from x)
  select case when a2 = '' or b2 = '' then true
              else position(a2 in b2) > 0 or position(b2 in a2) > 0 or left(a2,4) = left(b2,4) end from y
$$;

-- staff list for the PC program: + readd / use_erp_name instructions from Admin
create or replace function public.biometric_staff_feed()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare l jsonb := public.biometric_staff_list();
begin
  l := coalesce((select jsonb_agg(x || jsonb_build_object(
          'readd', coalesce((select u.readd_requested_at is not null from public.attendance_device_users u where u.emp_code = x->>'emp_code'), false),
          'use_erp_name', coalesce((select u.use_erp_name_at is not null from public.attendance_device_users u where u.emp_code = x->>'emp_code'), false)))
        from jsonb_array_elements(l) x), '[]'::jsonb);
  return jsonb_build_object('ok', true, 'generated_at', now(), 'today', (now() at time zone 'Asia/Kolkata')::date, 'employees', l);
end $$;
revoke all on function public.biometric_staff_feed() from public, anon, authenticated;

-- result of each run (+ easy TimePro's list: full_list = true means "this is everyone")
create or replace function public.biometric_staff_sync_record(p jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_ok boolean := coalesce((p->>'ok')::boolean, jsonb_array_length(coalesce(p->'errors','[]'::jsonb)) = 0);
        v_dry boolean := coalesce((p->>'dry_run')::boolean, false);
        v_full boolean := coalesce((p->>'full_list')::boolean, false);
        v_changed int := jsonb_array_length(coalesce(p->'actions','[]'::jsonb));
        r jsonb; codes text[] := '{}';
begin
  if not v_dry then
    for r in select * from jsonb_array_elements(coalesce(p->'device_users','[]'::jsonb)) loop
      if coalesce(r->>'emp_code','') = '' then continue; end if;
      codes := codes || (r->>'emp_code');
      insert into public.attendance_device_users(emp_code, device_name, tp_present, tp_name, tp_status, tp_seen_at)
      values (r->>'emp_code', nullif(btrim(coalesce(r->>'name','')),''), true, nullif(btrim(coalesce(r->>'name','')),''), coalesce(r->>'status','active'), now())
      on conflict (emp_code) do update set
        device_name = coalesce(excluded.device_name, attendance_device_users.device_name),
        tp_present = true, tp_name = excluded.tp_name, tp_status = excluded.tp_status, tp_seen_at = now(), tp_missing_since = null,
        readd_requested_at = null, readd_requested_by = null,
        use_erp_name_at = case when public.samara_same_person(excluded.tp_name,
                                  (select pr.full_name from public.profiles pr where pr.id = attendance_device_users.employee_id))
                               then null else attendance_device_users.use_erp_name_at end;
    end loop;
    if v_full then
      update public.attendance_device_users set tp_present = false, tp_missing_since = coalesce(tp_missing_since, now())
       where not (emp_code = any(codes)) and tp_present is distinct from false;
      update public.attendance_push_settings set last_tp_list_at = now() where id = 1;
    end if;
    for r in select * from jsonb_array_elements(coalesce(p->'links','[]'::jsonb)) loop
      if coalesce(r->>'emp_code','') = '' or coalesce(r->>'profile_id','') = '' then continue; end if;
      if exists(select 1 from public.attendance_device_users x where x.employee_id = (r->>'profile_id')::uuid and not x.ignore) then continue; end if;
      insert into public.attendance_device_users(emp_code, employee_id, device_name, mapped_by_name, mapped_at)
      values (r->>'emp_code', (r->>'profile_id')::uuid, nullif(r->>'name',''), 'Auto (added by staff sync)', now())
      on conflict (emp_code) do update set employee_id = excluded.employee_id, mapped_by_name = excluded.mapped_by_name, mapped_at = now()
       where attendance_device_users.employee_id is null;
    end loop;
  end if;
  if v_changed > 0 or not v_ok or v_dry then
    insert into public.biometric_staff_sync_log(ok, dry_run, summary, actions, errors, agent)
    values (v_ok, v_dry, coalesce(p->'summary','{}'::jsonb), coalesce(p->'actions','[]'::jsonb), coalesce(p->'errors','[]'::jsonb), left(p->>'agent',120));
  end if;
  update public.attendance_push_settings set last_staff_sync_at = now(), last_staff_sync_ok = v_ok,
    last_staff_sync_summary = coalesce(p->'summary','{}'::jsonb) || jsonb_build_object('dry_run', v_dry, 'agent', left(p->>'agent',120)),
    last_staff_sync_error = case when v_ok then null else left(coalesce(p->'errors'->0->>'message', p->'errors'->>0, 'Error'),300) end
   where id = 1;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.biometric_staff_sync_record(jsonb) from public, anon, authenticated;

-- who may see / act: Admin (Directors), HR, Managers (view)
create or replace function public.biometric_register_viewer(p_act boolean default false)
returns public.profiles language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me public.profiles;
begin
  select * into me from public.profiles where (id = auth.uid() or auth_user_id = auth.uid()) and coalesce(is_active,true) limit 1;
  if me.id is null or not (me.role in ('Admin','HR') or (not p_act and me.role = 'Manager')) then
    raise exception 'Only Admin / Director / HR can do this.';
  end if;
  return me;
end $$;
revoke all on function public.biometric_register_viewer(boolean) from public, anon, authenticated;

-- THE REGISTER: one row per machine number (+ active staff not on the machine yet), with its flag
create or replace function public.biometric_register_rows()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with st as (select * from public.attendance_push_settings where id = 1),
  lst as (select x from jsonb_array_elements(public.biometric_staff_list()) x),
  dev as (
    select u.*, pr.full_name as erp_name, pr.designation, pr.role as erp_role, pr.employee_id as erp_id,
           coalesce(pr.is_active, pr.active, true) as erp_active,
           (select l.x->>'status' from lst l where l.x->>'profile_id' = pr.id::text) as erp_status,
           public.samara_staff_last_day(pr.id) as last_day,
           (select max(a.punch_at) from public.attendance_punches a where a.emp_code = u.emp_code) as last_punch,
           (select count(*) from public.attendance_punches a where a.emp_code = u.emp_code) as punches
      from public.attendance_device_users u left join public.profiles pr on pr.id = u.employee_id
  ),
  flagged as (
    select d.*,
      case
        when d.ignore then 'not_erp'
        when d.employee_id is null and coalesce(d.tp_present,false) then 'new_on_machine'
        when d.employee_id is null and d.punches > 0 then 'old_number'
        when d.employee_id is null then null
        when not d.erp_active and coalesce(d.tp_present,false) and d.tp_status = 'active'
             and not public.samara_same_person(d.tp_name, d.erp_name) then 'number_reused'
        when not d.erp_active and coalesce(d.tp_present,false) and d.tp_status = 'active' then 'left_still_active'
        when not d.erp_active then 'left'
        when coalesce(d.erp_status,'active') = 'suspended' then 'suspended'
        when d.tp_present is false and (select last_tp_list_at from st) is not null then 'removed_from_machine'
        when coalesce(d.tp_present,false) and not public.samara_same_person(d.tp_name, d.erp_name) then 'different_name'
        when coalesce(d.tp_present,false) and d.tp_status in ('blocked','resigned') then 'blocked_on_machine'
        when d.punches = 0 then 'never_punched'
        else 'ok' end as flag
    from dev d
  )
  select coalesce(jsonb_agg(r order by r->>'sort'), '[]'::jsonb) from (
    select jsonb_build_object(
      'sort', lpad(coalesce(nullif(regexp_replace(f.emp_code,'\D','','g'),''),'0'),6,'0'),
      'emp_code', f.emp_code, 'tp_name', coalesce(f.tp_name, f.device_name), 'tp_status', f.tp_status, 'tp_present', f.tp_present,
      'tp_missing_since', f.tp_missing_since, 'profile_id', f.employee_id, 'erp_name', f.erp_name, 'erp_id', f.erp_id,
      'designation', coalesce(f.designation, f.erp_role), 'erp_active', f.erp_active, 'last_day', f.last_day,
      'last_punch', f.last_punch, 'punches', f.punches, 'mapped_by', f.mapped_by_name, 'mapped_at', f.mapped_at,
      'readd_requested', f.readd_requested_at is not null, 'use_erp_name', f.use_erp_name_at is not null,
      'flag', f.flag,
      'alert', f.flag in ('new_on_machine','number_reused','removed_from_machine','different_name') and not (f.flag = 'removed_from_machine' and f.readd_requested_at is not null)
                 and not (f.flag = 'different_name' and f.use_erp_name_at is not null),
      'message', case f.flag
        when 'new_on_machine' then 'In easy TimePro but not linked to any ERP employee — link it, or mark "Not an ERP employee".'
        when 'number_reused' then 'This number belongs to ' || coalesce(f.erp_name,'a staff member who left') || ' (left), but easy TimePro now shows "' || coalesce(f.tp_name,'?') || '". Numbers are never reused: the sync blocks it again — enrol ' || coalesce(f.tp_name,'the new person') || ' on her own number.'
        when 'removed_from_machine' then case when f.readd_requested_at is not null then 'Deleted in easy TimePro — will be added back by the next sync; then enrol the fingerprint.'
             else 'Deleted in easy TimePro, but still an active ERP employee. Re-add to machine, or record the exit in HR.' end
        when 'different_name' then case when f.use_erp_name_at is not null then 'The next sync writes the ERP name into easy TimePro.'
             else 'easy TimePro shows "' || coalesce(f.tp_name,'?') || '" on this number, the ERP has ' || coalesce(f.erp_name,'?') || '. Same person → "Use ERP name"; another person → enrol her on her own number.' end
        when 'left_still_active' then 'Left — the next sync blocks this number on the machine.'
        when 'left' then 'Left' || coalesce(' (last working day ' || to_char(f.last_day,'DD-MM-YYYY') || ')','') || ' — blocked on the machine.'
        when 'suspended' then 'Under suspension — blocked on the machine.'
        when 'blocked_on_machine' then 'Active in the ERP but blocked in easy TimePro — the next sync unblocks it.'
        when 'never_punched' then 'No punch yet — enrol the fingerprint / face on the machine.'
        when 'old_number' then 'Not in easy TimePro any more; had punches earlier. Link or mark "Not an ERP employee" to tidy.'
        when 'not_erp' then 'Not an ERP employee (marked by Admin).'
        else null end) r
    from flagged f where f.flag is not null
    union all
    select jsonb_build_object('sort','999999'||coalesce(l.x->>'name',''),'emp_code',null,'profile_id',l.x->>'profile_id','erp_name',l.x->>'name','erp_id',l.x->>'employee_id',
      'designation',l.x->>'designation','erp_active',true,'flag','not_on_machine','alert',false,
      'message','Active employee with no machine number — the next sync adds her to easy TimePro; then enrol the fingerprint.')
    from lst l where l.x->>'emp_code' is null and l.x->>'status' = 'active'
  ) z;
$$;
revoke all on function public.biometric_register_rows() from public, anon, authenticated;

create or replace function public.biometric_register(p_action text default 'list', p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me public.profiles; v_code text := nullif(btrim(coalesce(p->>'emp_code','')),''); v_pid uuid := nullif(p->>'profile_id','')::uuid; u public.attendance_device_users;
begin
  if p_action = 'list' then
    me := public.biometric_register_viewer(false);
    return jsonb_build_object('ok', true, 'rows', public.biometric_register_rows(),
      'sync', (select jsonb_build_object('last_at', last_staff_sync_at, 'ok', last_staff_sync_ok, 'error', last_staff_sync_error,
                 'last_list_at', last_tp_list_at, 'agent', last_staff_sync_summary->>'agent') from public.attendance_push_settings where id = 1),
      'can_act', me.role in ('Admin','HR'));
  end if;
  me := public.biometric_register_viewer(true);
  select * into u from public.attendance_device_users where emp_code = v_code;
  if u.emp_code is null then raise exception 'Machine number % not found.', v_code; end if;
  if p_action = 'link' then
    if v_pid is null then raise exception 'Choose the employee.'; end if;
    if u.employee_id is not null and u.employee_id <> v_pid and exists(select 1 from public.attendance_punches a where a.emp_code = v_code) then
      raise exception 'Machine no. % already has punches of another employee — a number is never given to someone else. Enrol this person on a new number.', v_code;
    end if;
    if exists(select 1 from public.attendance_device_users x where x.employee_id = v_pid and x.emp_code <> v_code and not x.ignore) then
      raise exception 'This employee already has machine no. % — one number per person.', (select x.emp_code from public.attendance_device_users x where x.employee_id = v_pid and x.emp_code <> v_code and not x.ignore limit 1);
    end if;
    update public.attendance_device_users set employee_id = v_pid, ignore = false, mapped_by_name = me.full_name, mapped_at = now() where emp_code = v_code;
  elsif p_action = 'not_erp' then
    update public.attendance_device_users set ignore = true, mapped_by_name = me.full_name, mapped_at = now() where emp_code = v_code;
  elsif p_action = 'readd' then
    if u.employee_id is null then raise exception 'Link the number to an employee first.'; end if;
    update public.attendance_device_users set readd_requested_at = now(), readd_requested_by = me.full_name where emp_code = v_code;
  elsif p_action = 'use_erp_name' then
    update public.attendance_device_users set use_erp_name_at = now(), use_erp_name_by = me.full_name where emp_code = v_code;
  else raise exception 'Unknown action.';
  end if;
  begin
    insert into public.audit_log(user_id, action, entity, entity_id, details)
    values (me.id, 'Biometric register: ' || p_action, 'attendance_device_users', v_code, p);
  exception when others then null; end;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.biometric_register(text,jsonb) from public, anon;
grant execute on function public.biometric_register(text,jsonb) to authenticated;

-- pop-up alerts for Admin / Directors / HR (ERP bell): flagged numbers + sync stopped
create or replace function public.biometric_register_alerts()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me public.profiles; st record; ist timestamp := now() at time zone 'Asia/Kolkata'; out jsonb := '[]'::jsonb;
begin
  select * into me from public.profiles where (id = auth.uid() or auth_user_id = auth.uid()) and coalesce(is_active,true) limit 1;
  if me.id is null or me.role not in ('Admin','HR') then return '[]'::jsonb; end if;
  select * into st from public.attendance_push_settings where id = 1;
  if st.last_staff_sync_at is not null and st.last_staff_sync_at < now() - interval '30 minutes'
     and ist::time between time '07:30' and time '22:30' then
    out := out || jsonb_build_array(jsonb_build_object('kind','sync_stopped','emp_code',null,
      'title','Biometric staff sync has stopped',
      'message','No report from the Samara PC since ' || to_char(st.last_staff_sync_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH24:MI') ||
                '. Check that the PC is on, easy TimePro is open and the task "Samara Biometric Sync" is running.',
      'since', st.last_staff_sync_at));
  end if;
  out := out || coalesce((select jsonb_agg(jsonb_build_object('kind', r->>'flag', 'emp_code', r->>'emp_code',
      'title', 'Biometric machine no. ' || coalesce(r->>'emp_code','?') || ' — ' ||
               case r->>'flag' when 'new_on_machine' then 'new on machine, not linked'
                               when 'number_reused' then 'number reused'
                               when 'removed_from_machine' then 'removed from machine'
                               else 'different name in easy TimePro' end,
      'message', coalesce(r->>'erp_name', r->>'tp_name', '') || ': ' || coalesce(r->>'message',''),
      'since', coalesce(r->>'tp_missing_since', r->>'last_punch')))
    from jsonb_array_elements(public.biometric_register_rows()) r where (r->>'alert')::boolean), '[]'::jsonb);
  return out;
end $$;
revoke all on function public.biometric_register_alerts() from public, anon;
grant execute on function public.biometric_register_alerts() to authenticated;

-- Madhu Mithra stays on 32: her punch(es) on Akshi's old number 23 from 13-11-2026 are moved to 32
update public.attendance_punches set emp_code = '32'
 where emp_code = '23' and punch_at >= timestamptz '2026-11-13 00:00+05:30'
   and coalesce(device_name,'') ilike '%madhu%'
   and not exists(select 1 from public.attendance_punches b where b.emp_code = '32' and b.punch_at = attendance_punches.punch_at);
update public.attendance_device_users set use_erp_name_at = now(), use_erp_name_by = 'Boomi (13-11-2026: Madhu Mithra stays on 32)'
 where emp_code = '32' and employee_id = (select id from public.profiles where full_name ~* '^\s*madhu\s*mithra\s*$' limit 1);

notify pgrst, 'reload schema';
commit;

select r->>'emp_code' as no, r->>'tp_name' as in_timepro, r->>'erp_name' as erp, r->>'flag' as flag, r->>'message' as message
  from jsonb_array_elements(public.biometric_register_rows()) r;
