-- ERP 2.18.183: the Nursing Manager's server-confirmed Nurse switch permits
-- all Nurse workflows. Preserve role identity, existing approvals and other staff access.
begin;
do $patch$
declare r record; fn regprocedure; d text;
begin
 for r in select * from (values
  ('public.request_approval_item(uuid,uuid,timestamptz,text)',
   $old$if v_role is distinct from 'Nurse' then$old$,
   $new$if v_role is distinct from 'Nurse' and not public.acting_as_nurse() then$new$),
  ('public.confirm_patient_departure_v2(uuid,text,text)',
   $old$if v_role not in ('Nurse','Admin') then$old$,
   $new$if v_role not in ('Nurse','Admin') and not public.acting_as_nurse() then$new$),
  ('public.void_patient_item_consumption(uuid,text)',
   $old$(p.role='Admin' or (p.role='Nurse' and (v.recorded_by=p.id or public.current_user_is_nurse_manager())))$old$,
   $new$(p.role='Admin' or (p.role='Nurse' and (v.recorded_by=p.id or public.current_user_is_nurse_manager())) or (public.acting_as_nurse() and v.recorded_by=p.id))$new$)
 ) as targets(signature,old_check,new_check) loop
  fn:=to_regprocedure(r.signature);
  if fn is null then raise exception 'Required Nurse workflow is missing: %',r.signature; end if;
  d:=pg_get_functiondef(fn);
  if position(r.new_check in d)>0 then continue; end if;
  if position(r.old_check in d)=0 then raise exception 'Nurse role check changed; review before applying: %',r.signature; end if;
  execute replace(d,r.old_check,r.new_check);
 end loop;
end $patch$;
notify pgrst,'reload schema';
commit;
