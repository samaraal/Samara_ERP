-- Samara Care ERP 2.15.93 — Final Nursing Discharge: realistic handover checklist
-- Run once in Supabase > SQL Editor (file 207). Safe to run again.
--
-- Before: every handover box had to be ticked (form + confirm_patient_departure_v4), even when the
-- Guest had no take-home medicines, no reports, and Samara held no belongings or valuables.
-- Now (confirm_patient_departure_v5):
--   * Discharge summary — no tick: it is generated and sent automatically on WhatsApp after discharge;
--     optional "printed copy also handed over".
--   * Medicines / Reports — "Handed over" or "None to hand over" (one must be chosen).
--   * Belongings — "Handed over" or "None held by Samara"; Valuables — "Handed over" or "None held".
--   * Instructions explained and Patient condition fit for departure — must still be ticked.
-- The real answers are saved in patient_discharges.handover_details (with nurse name and time) and shown
-- in Discharge history and the Discharge Summary PDF. v5 then completes the discharge through the
-- existing v4 (unchanged), so room/bed release, WhatsApp and the summary work exactly as before.

begin;

alter table public.patient_discharges
  add column if not exists handover_details jsonb;

create or replace function public.confirm_patient_departure_v5(
  p_discharge_id uuid, p_received_by_name text, p_received_by_contact text, p_relationship text,
  p_actual_departure_at timestamptz, p_transport_mode text, p_transport_details text,
  p_accompanied_by_name text, p_accompanied_by_relationship text, p_accompanied_by_contact text,
  p_review_appointment_date date, p_review_appointment_time time, p_review_doctor_name text,
  p_review_hospital_clinic text, p_review_instructions text, p_departure_remarks text,
  p_handover jsonb, p_final_instructions_explained boolean, p_patient_condition_confirmed boolean,
  p_late_entry_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_name text;
  v_med text := trim(coalesce(p_handover->>'medicines',''));
  v_rep text := trim(coalesce(p_handover->>'reports',''));
  v_bel text := trim(coalesce(p_handover->>'belongings',''));
  v_val text := trim(coalesce(p_handover->>'valuables',''));
  v_printed boolean := coalesce((p_handover->>'summary_printed_copy')::boolean, false);
begin
  select coalesce(nullif(trim(full_name),''),'Nurse') into v_name
  from public.duty_profiles where id = auth.uid() or auth_user_id = auth.uid() limit 1;

  if v_med not in ('Handed over','None to hand over') then raise exception 'Medicines: choose Handed over or None to hand over.'; end if;
  if v_rep not in ('Handed over','None to hand over') then raise exception 'Reports / documents: choose Handed over or None to hand over.'; end if;
  if v_bel not in ('Handed over','None held by Samara') then raise exception 'Belongings: choose Handed over or None held by Samara.'; end if;
  if v_val not in ('Handed over','None held') then raise exception 'Valuables: choose Handed over or None held.'; end if;
  if not coalesce(p_final_instructions_explained,false) then raise exception 'Confirm that medication, diet and follow-up instructions were explained.'; end if;
  if not coalesce(p_patient_condition_confirmed,false) then raise exception 'Confirm that the patient condition was checked and fit for departure / transfer.'; end if;

  -- Save the real answers first; v4 (below) checks the role, completes the discharge and releases the bed.
  update public.patient_discharges set handover_details = jsonb_build_object(
      'discharge_summary', case when v_printed then 'Sent on WhatsApp automatically + printed copy handed over' else 'Sent on WhatsApp automatically' end,
      'summary_printed_copy', v_printed,
      'medicines', v_med, 'reports', v_rep, 'belongings', v_bel, 'valuables', v_val,
      'instructions_explained', true, 'condition_confirmed', true,
      'recorded_by', v_name, 'recorded_at', now())
  where id = p_discharge_id and status <> 'Completed';
  if not found then raise exception 'Discharge request not found or already completed.'; end if;

  -- The v4 booleans mean "checklist item resolved" (handed over or confirmed none).
  return public.confirm_patient_departure_v4(
    p_discharge_id, p_received_by_name, p_received_by_contact, p_relationship, p_actual_departure_at,
    p_transport_mode, p_transport_details, p_accompanied_by_name, p_accompanied_by_relationship,
    p_accompanied_by_contact, p_review_appointment_date, p_review_appointment_time, p_review_doctor_name,
    p_review_hospital_clinic, p_review_instructions, p_departure_remarks,
    true, true, true, true, true, true, true, p_late_entry_reason)
    || jsonb_build_object('handover_details', (select handover_details from public.patient_discharges where id = p_discharge_id));
end $$;
revoke all on function public.confirm_patient_departure_v5(uuid,text,text,text,timestamptz,text,text,text,text,text,date,time,text,text,text,text,jsonb,boolean,boolean,text) from public, anon;
grant execute on function public.confirm_patient_departure_v5(uuid,text,text,text,timestamptz,text,text,text,text,text,date,time,text,text,text,text,jsonb,boolean,boolean,text) to authenticated;

notify pgrst, 'reload schema';
commit;

-- Check (should list confirm_patient_departure_v5):
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and proname = 'confirm_patient_departure_v5';
