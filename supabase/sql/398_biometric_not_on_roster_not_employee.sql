-- Samara ERP SQL 398 (app 2.20.74) — Biometric: whoever is NOT on the Duty Roster is NOT an employee.
-- Owner's rule (13-11-2026). Duty Roster staff = an ERP login with an EMP-number, not Admin, not a Director /
-- management account, and not kept off the roster (duty_roster_exclusions) — the same people the Duty Roster shows.
-- Effect in Biometric ▸ Staff Register and the Admin / HR pop-ups:
--   • a machine number with a name that matches nobody on the Duty Roster → "Not an employee", no pop-up;
--   • a machine number linked to someone not on the Duty Roster (Directors, etc.) → "Not an employee", no pop-up;
--   • a machine name that matches a Duty Roster person but is not linked → still flagged "link it to her".
-- Nothing is deleted; payroll and punches are unchanged. Run after 397. Safe to run again.
begin;

create or replace function public.samara_is_roster_staff(p_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.profiles p
     where p.id = p_id
       and p.employee_id ~* '^\s*EMP\s*-?\s*\d+\s*$'
       and coalesce(p.role,'') <> 'Admin'
       and lower(regexp_replace(coalesce(p.full_name,''),'[^A-Za-z0-9]','','g'))
           not in ('administrator','boomir','drchellaboomi','chellaboomi','maneeshaboominathan','mrram','ram')
       and lower(regexp_replace(coalesce(p.login_id,''),'[^A-Za-z0-9]','','g'))
           not in ('administrator','boomir','chellaboomi','maneeshaboominathan','ram','rajaiahboomi')
       and not exists(select 1 from public.duty_roster_exclusions x where x.profile_id::text in (p.id::text, coalesce(p.auth_user_id::text,'-'))));
$$;
revoke all on function public.samara_is_roster_staff(uuid) from public, anon;
grant execute on function public.samara_is_roster_staff(uuid) to authenticated;

create or replace function public.biometric_register_rows()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with st as (select * from public.attendance_push_settings where id = 1),
  lst as (select x from jsonb_array_elements(public.biometric_staff_list()) x),
  dev as (
    select u.*, pr.full_name as erp_name, pr.designation, pr.role as erp_role, pr.employee_id as erp_id,
           coalesce(pr.is_active, pr.active, true) as erp_active,
           (select l.x->>'status' from lst l where l.x->>'profile_id' = pr.id::text) as erp_status,
           public.samara_staff_last_day(pr.id) as last_day,
           (pr.id is not null and public.samara_is_roster_staff(pr.id)) as on_roster,
           exists(select 1 from public.profiles q where coalesce(q.is_active,q.active,true) and public.samara_is_roster_staff(q.id)
                   and public.samara_same_person(u.tp_name, q.full_name)) as tp_matches_roster,
           (select max(a.punch_at) from public.attendance_punches a where a.emp_code = u.emp_code) as last_punch,
           (select count(*) from public.attendance_punches a where a.emp_code = u.emp_code) as punches
      from public.attendance_device_users u left join public.profiles pr on pr.id = u.employee_id
  ),
  flagged as (
    select d.*,
      case
        when d.ignore then 'not_erp'
        -- 398: anyone not on the Duty Roster is not an employee — no alert, no action needed
        when d.employee_id is not null and not d.on_roster then 'not_employee'
        when d.employee_id is null and coalesce(d.tp_present,false) and not d.tp_matches_roster then 'not_employee'
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
        when 'new_on_machine' then 'Same name as a staff member on the Duty Roster, but not linked — link it to her.'
        when 'not_employee' then 'Not on the Duty Roster — not an employee. No action needed.'
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
      and public.samara_is_roster_staff((l.x->>'profile_id')::uuid)
  ) z;
$$;
revoke all on function public.biometric_register_rows() from public, anon, authenticated;

notify pgrst,'reload schema';
commit;

-- check: every machine number and what it is now
select r->>'emp_code' as no, r->>'tp_name' as in_timepro, r->>'erp_name' as erp, r->>'flag' as flag, r->>'alert' as alert
  from jsonb_array_elements(public.biometric_register_rows()) r order by r->>'sort';
