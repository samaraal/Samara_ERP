-- v2.14.35: Nurses may allot an AVAILABLE room while completing a new admission or
-- re-admission. Room shifting / transfer of an admitted patient stays Admin/Manager only.
do $mig$
declare d text; d2 text;
begin
  d := pg_get_functiondef('public.assign_patient_room(uuid,uuid,text)'::regprocedure);
  if position('v_nurse_admission' in d) > 0 then return; end if;
  d2 := replace(d,
$o$raise exception 'Only Admin or Manager can allot a room.';$o$,
$n$-- v_nurse_admission: a Nurse may give the first room during admission only.
    if v_role = 'Nurse'
       and not exists (select 1 from public.room_beds rb where rb.patient_id = p_patient_id)
       and exists (select 1 from public.patients pt where pt.id = p_patient_id
                   and coalesce(pt.admission_status,'') in ('Admission Pending','Draft','Discharged')) then
      null;
    else
      raise exception 'Only Admin or Manager can allot or change a room. Nurses can allot a room only while completing a new admission.';
    end if;$n$);
  if d2 = d or (length(d2)-length(replace(d2,'v_nurse_admission','')))/17 <> 1 then
    raise exception 'assign_patient_room: role check text not found exactly once, nothing changed';
  end if;
  execute d2;
end
$mig$;

select position('v_nurse_admission' in pg_get_functiondef('public.assign_patient_room(uuid,uuid,text)'::regprocedure))>0 as nurse_admission_fix_installed;
