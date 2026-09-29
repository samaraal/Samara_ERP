-- 2.15.6: Room allotment no longer blocked by a stale / half-finished admission.
--
-- Problem: assign_patient_room() refused any bed whose room_beds.patient_id was set,
-- even when that link pointed to the SAME resident (an earlier interrupted attempt),
-- or to a resident who is no longer active (discharged / abandoned "Admission Pending").
-- The admission screen treats such beds as Available, so every retry failed with
-- "Selected room/bed is no longer available."
--
-- New rule (decided in one place, on the server):
--   * Maintenance beds are never allotted.
--   * Reserved beds are allotted only for a reserved-room admission (as before).
--   * A bed is truly taken only if ANOTHER resident who is ACTIVE holds it
--     (linked, or recorded in that room/bed), or another resident's admission is
--     still in progress on it (Admission Pending, updated in the last 30 minutes).
--   * A link to the same resident, or to an inactive / abandoned resident, is stale
--     and is simply replaced.
--   * The error now names who holds the bed.
--
-- Patched in place (same safe method as SQL 141 / 148): only the exact availability
-- check text is replaced; if that text is not found, nothing changes and it says so.
-- Safe to run more than once.

do $mig$
declare d text; d2 text;
begin
  d := pg_get_functiondef('public.assign_patient_room(uuid,uuid,text)'::regprocedure);
  if position('v_bed_guard_2_15_6' in d) > 0 then
    raise notice 'assign_patient_room: 2.15.6 bed guard already installed, nothing to do';
    return;
  end if;

  d2 := replace(d,
$o$  if v_bed.status<>'Available' or v_bed.patient_id is not null then
    raise exception 'Selected room/bed is no longer available.';
  end if;$o$,
$n$  -- v_bed_guard_2_15_6: one availability rule, stale holds ignored
  declare v_holder text;
  begin
    if v_bed.status = 'Maintenance' then
      raise exception 'Room % bed % is under maintenance. Please choose another bed.', v_bed.room_no, v_bed.bed_no;
    end if;
    if v_bed.status = 'Reserved' and coalesce(p_reason,'') not ilike 'Reserved room admission%' then
      raise exception 'Room % bed % is reserved. Please choose another bed, or admit from the reservation.',
        v_bed.room_no, v_bed.bed_no;
    end if;
    select hp.full_name || ' (' || coalesce(nullif(hp.patient_code,''),hp.patient_id,'-') || ', ' ||
           case when coalesce(hp.is_active,false) then 'admitted' else 'admission in progress' end || ')'
      into v_holder
      from public.patients hp
     where hp.id <> p_patient_id
       and ( hp.id = v_bed.patient_id
             or ( upper(coalesce(hp.room_no,'')) = upper(coalesce(v_bed.room_no,''))
                  and upper(coalesce(hp.bed_no,'')) = upper(coalesce(v_bed.bed_no,'')) ) )
       and ( coalesce(hp.is_active,false)
             or ( hp.id = v_bed.patient_id
                  and coalesce(hp.admission_status,'') = 'Admission Pending'
                  and coalesce(hp.updated_at,hp.created_at) > now() - interval '30 minutes' ) )
     limit 1;
    if v_holder is not null then
      raise exception 'Selected room/bed is no longer available. Room % bed % is held by %.', v_bed.room_no, v_bed.bed_no, v_holder;
    end if;
  end;$n$);

  if d2 = d or (length(d2)-length(replace(d2,'v_bed_guard_2_15_6','')))/18 <> 1 then
    raise exception 'assign_patient_room: availability check text not found exactly once -- nothing changed. Share this message with the developer.';
  end if;
  execute d2;
end
$mig$;

notify pgrst, 'reload schema';

select position('v_bed_guard_2_15_6' in pg_get_functiondef('public.assign_patient_room(uuid,uuid,text)'::regprocedure))>0
       as bed_guard_2_15_6_installed;
