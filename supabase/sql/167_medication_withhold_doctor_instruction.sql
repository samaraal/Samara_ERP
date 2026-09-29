-- 2.15.11: Clinical withholding of a medicine dose + doctor's instruction follow-up.
--
-- A nurse may WITHHOLD a dose after her assessment (e.g. low BP before an antihypertensive,
-- low blood sugar before a diabetes medicine). She records the reason, the reading that
-- triggered it, and which doctor was informed, how and when. The withheld dose stays OPEN
-- (alert to Nurses, Nursing Manager, Managers and Admin/Directors) until the doctor's
-- instruction is recorded: Give now / Give at a later time / Skip this dose /
-- Change prescription (which then goes through Doctor Review / Modify as usual).
--
-- Safe to run more than once. Changes nothing that already works.

begin;

-- 1) Columns on the administration record (nullable; only used for Withheld doses)
alter table public.medication_administrations
  add column if not exists withhold_reason text,
  add column if not exists withhold_reading text,
  add column if not exists doctor_informed_name text,
  add column if not exists doctor_informed_via text,
  add column if not exists doctor_informed_at timestamptz,
  add column if not exists doctor_instruction text,
  add column if not exists doctor_instruction_notes text,
  add column if not exists doctor_instruction_at timestamptz,
  add column if not exists doctor_instruction_by uuid,
  add column if not exists doctor_instruction_by_name text;

create index if not exists medication_administrations_withheld_open_idx
  on public.medication_administrations(scheduled_date)
  where status = 'Withheld' and doctor_instruction is null;

-- 2) Make sure the status check allows 'Withheld' (keeps every status already in use)
do $st$
declare c record; allowed text[]; needs boolean := false;
begin
  for c in
    select con.conname, pg_get_constraintdef(con.oid) as def
      from pg_constraint con
     where con.conrelid = 'public.medication_administrations'::regclass
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    if position('Withheld' in c.def) = 0 then needs := true; end if;
  end loop;
  if needs then
    select array_agg(distinct s) into allowed from (
      select unnest(array['Given','Refused','Withheld','Unavailable','Missed','Delayed']) s
      union select distinct status from public.medication_administrations where status is not null
    ) x;
    for c in
      select con.conname from pg_constraint con
       where con.conrelid = 'public.medication_administrations'::regclass
         and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%status%'
    loop
      execute format('alter table public.medication_administrations drop constraint %I', c.conname);
    end loop;
    execute format('alter table public.medication_administrations add constraint medication_administrations_status_check check (status = any (%L::text[]))', allowed);
    raise notice 'medication_administrations status check now allows: %', allowed;
  end if;
end
$st$;

-- 3) Record the doctor's instruction for a withheld dose (Nurse / Manager / Admin)
create or replace function public.record_withheld_dose_instruction(
  p_id uuid,
  p_instruction text,
  p_notes text,
  p_give_at time default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_row public.medication_administrations%rowtype;
  v_name text;
  v_now_ist timestamp := (now() at time zone 'Asia/Kolkata');
  v_give time;
begin
  if not public.current_user_has_role(array['Admin','Manager','Nurse','Director']) then
    raise exception 'Only a Nurse, Manager or Admin can record the doctor''s instruction.';
  end if;
  if p_instruction not in ('Give now','Give at a later time','Skip this dose','Change prescription (Doctor Review)') then
    raise exception 'Choose a valid doctor''s instruction.';
  end if;
  if coalesce(btrim(p_notes),'') = '' then
    raise exception 'Enter the doctor''s instruction (what the doctor said).';
  end if;

  select * into v_row from public.medication_administrations where id = p_id for update;
  if not found then raise exception 'Withheld dose not found.'; end if;
  if v_row.status <> 'Withheld' then raise exception 'This dose is not recorded as withheld.'; end if;
  if v_row.doctor_instruction is not null then
    raise exception 'The doctor''s instruction for this dose was already recorded (%).', v_row.doctor_instruction;
  end if;

  select coalesce(nullif(full_name,''),'Staff') into v_name
    from public.profiles where id = auth.uid() or auth_user_id = auth.uid() limit 1;

  if p_instruction in ('Give now','Give at a later time') then
    v_give := case when p_instruction = 'Give now' then date_trunc('minute', v_now_ist)::time else p_give_at end;
    if v_give is null then raise exception 'Choose the time to give the dose.'; end if;
    -- the re-medication time must fall after the original dose time (same rule as rescheduling)
    if v_give <= v_row.scheduled_time::time and v_row.scheduled_date = v_now_ist::date then
      v_give := (v_row.scheduled_time::time + interval '1 minute')::time;
    end if;
  end if;

  update public.medication_administrations set
    doctor_instruction = p_instruction,
    doctor_instruction_notes = btrim(p_notes),
    doctor_instruction_at = now(),
    doctor_instruction_by = auth.uid(),
    doctor_instruction_by_name = coalesce(v_name,'Staff'),
    rescheduled_time = coalesce(v_give, rescheduled_time),
    reschedule_reason = case when v_give is not null
                             then 'Doctor''s instruction after withholding: ' || btrim(p_notes)
                             else reschedule_reason end
  where id = p_id;

  return jsonb_build_object('success', true, 'instruction', p_instruction,
                            'give_at', case when v_give is null then null else to_char(v_give,'HH24:MI') end);
end $$;

revoke all on function public.record_withheld_dose_instruction(uuid,text,text,time) from public, anon;
grant execute on function public.record_withheld_dose_instruction(uuid,text,text,time) to authenticated;

commit;

-- 4) Clinical alert engine: a withheld dose that the doctor said to give later is a
--    "Re-medication Due" like other rescheduled doses (so it alerts if not given).
--    Tolerant patch; if the live text differs it is skipped with a notice (nothing breaks).
do $eng$
declare d text; d2 text; f oid;
begin
  select p.oid into f from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_current_clinical_alerts' limit 1;
  if f is null then raise notice 'get_current_clinical_alerts not found, skipped'; return; end if;
  d := pg_get_functiondef(f);
  if position('''Withheld'',''Refused'',''Missed'',''Delayed''' in d) > 0 then
    raise notice 'alert engine already covers withheld re-medication'; return;
  end if;
  d2 := regexp_replace(d,
    'rescheduled_time\s+is\s+not\s+null\s+and\s+ma\.status\s+in\s*\(\s*''Refused''\s*,\s*''Missed''\s*,\s*''Delayed''\s*\)',
    'rescheduled_time is not null and ma.status in(''Withheld'',''Refused'',''Missed'',''Delayed'')', 'i');
  if d2 = d then raise notice 'alert engine text not matched, skipped (withheld re-medication still shows in Today''s MAR)'; return; end if;
  execute d2;
  raise notice 'alert engine now covers withheld re-medication';
end
$eng$;

notify pgrst, 'reload schema';

select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='medication_administrations' and column_name='doctor_instruction') = 1
    as withhold_columns_installed,
  exists(select 1 from pg_proc where proname='record_withheld_dose_instruction') as instruction_function_installed;
