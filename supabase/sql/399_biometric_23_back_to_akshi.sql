-- Samara ERP SQL 399 (app 2.20.74) — Machine no. 23 is Akshi's number (STD, left 11-11-2026), not Madhu Mithra's.
-- Madhu Mithra's own number is 32 (linked, OK). On 13-11 someone re-enrolled Madhu on 23 in easy TimePro.
-- This puts 23 back on Akshi so her punches stay with her (final salary), and asks the PC sync to write
-- "Akshi" back into easy TimePro on 23 (it stays blocked — she has left).
-- Still to do on the machine: delete Madhu's fingerprint / face from user 23 (she punches on 32).
-- Run after 398. Safe to run again.
begin;
do $$
declare ak public.profiles; n int;
begin
  select * into ak from public.profiles where role = 'STD' and full_name ~* '\mAkshi\M' order by created_at desc limit 1;
  if ak.id is null then raise exception 'Akshi (STD) not found — nothing changed. Send this message to Claude.'; end if;
  if exists(select 1 from public.attendance_device_users where employee_id = ak.id and emp_code <> '23' and not ignore) then
    raise exception 'Akshi is already linked to another machine number — nothing changed. Send this message to Claude.';
  end if;
  update public.attendance_device_users
     set employee_id = ak.id, ignore = false,
         mapped_by_name = 'Boomi (13-11-2026: no. 23 is Akshi''s number; Madhu Mithra is on 32)', mapped_at = now(),
         use_erp_name_at = now(), use_erp_name_by = 'Boomi (13-11-2026: write Akshi back on 23)'
   where emp_code = '23';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Machine no. 23 not found — nothing changed.'; end if;
end $$;
-- any remaining Madhu punches that landed on 23 from 13-11 onward go to her number 32
update public.attendance_punches set emp_code = '32'
 where emp_code = '23' and punch_at >= timestamptz '2026-11-13 00:00+05:30'
   and not exists(select 1 from public.attendance_punches b where b.emp_code = '32' and b.punch_at = attendance_punches.punch_at);
notify pgrst,'reload schema';
commit;

-- check: 23 → Akshi (left), 32 → Madhu Mithra (ok)
select r->>'emp_code' as no, r->>'tp_name' as in_timepro, r->>'erp_name' as erp, r->>'flag' as flag, r->>'alert' as alert
  from jsonb_array_elements(public.biometric_register_rows()) r where r->>'emp_code' in ('23','32');
