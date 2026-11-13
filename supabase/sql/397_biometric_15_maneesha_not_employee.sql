-- Samara ERP SQL 397 (app 2.20.73) — Biometric machine no. 15 = Dr Maneesha (Director, Admin login) — not an ERP employee.
-- Her number stays on the machine (door access) but is never linked to payroll / duty / attendance alerts.
-- Also: the pop-up no longer starts with a blank ": " when easy TimePro has no name for a number.
-- Run after 396. Safe to run again.
begin;

update public.attendance_device_users
   set ignore = true, employee_id = null,
       mapped_by_name = 'Boomi (13-11-2026: Dr Maneesha — Director, not an employee)', mapped_at = now()
 where emp_code = '15';

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
      'message', coalesce(nullif(trim(r->>'erp_name'),'') || ': ', nullif(trim(r->>'tp_name'),'') || ' (name in easy TimePro): ', 'No name in easy TimePro: ') || coalesce(r->>'message',''),
      'since', coalesce(r->>'tp_missing_since', r->>'last_punch')))
    from jsonb_array_elements(public.biometric_register_rows()) r where (r->>'alert')::boolean), '[]'::jsonb);
  return out;
end $$;
revoke all on function public.biometric_register_alerts() from public, anon;
grant execute on function public.biometric_register_alerts() to authenticated;

notify pgrst,'reload schema';
commit;

-- check: no. 15 should show flag not_erp and alert false
select r->>'emp_code' as no, r->>'tp_name' as in_timepro, r->>'flag' as flag, r->>'alert' as alert
  from jsonb_array_elements(public.biometric_register_rows()) r where r->>'emp_code' = '15';
