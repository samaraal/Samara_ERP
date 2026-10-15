begin;
alter table public.outside_nursing_visits add column if not exists repeat_reason text not null default '';
alter table public.outside_nursing_visits add column if not exists void_reason text;
alter table public.outside_nursing_visits add column if not exists voided_by uuid;
alter table public.outside_nursing_visits add column if not exists voided_at timestamptz;
alter table public.outside_nursing_visits add column if not exists duplicate_of uuid references public.outside_nursing_visits(id);
alter table public.outside_nursing_visits drop constraint if exists outside_nursing_visits_review_status_check;
alter table public.outside_nursing_visits add constraint outside_nursing_visits_review_status_check check(review_status in ('Submitted','Returned','Approved','Voided'));
-- Retain the installed invoice/indent implementation, inaccessible to direct callers.
do $$ begin
 if to_regprocedure('public.outside_nursing_base_234(text,jsonb)') is null then
  alter function public.outside_nursing(text,jsonb) rename to outside_nursing_base_234;
 end if;
end $$;
revoke all on function public.outside_nursing_base_234(text,jsonb) from public,anon,authenticated;
create or replace function public.outside_nursing(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.outside_nursing_visits%rowtype; keeper public.outside_nursing_visits%rowtype;
 pid uuid; eid uuid; day date; reason text; result jsonb;
begin
 if auth.uid() is null or not public.current_user_has_role(array['Admin','Accounts','Nurse','Manager']) then raise exception 'Nursing services access required'; end if;
 if p_action in ('patient','visit','resubmit','indent','receive_indent') and not public.current_user_has_role(array['Nurse']) then
  raise exception 'Only nurses can enter procedures, patients, indents and indent receipts';
 end if;
 if p_action in ('visit','resubmit') then
  eid:=(p_data->>'id')::uuid;
  if p_action='resubmit' then
   select * into v from public.outside_nursing_visits where id=eid for update;
   if not found or v.recorded_by<>auth.uid() or v.review_status<>'Returned' or v.billed_at is not null then raise exception 'Only the submitting nurse can correct a returned form'; end if;
   pid:=v.patient_id;
  else
   pid:=(p_data->>'patient_id')::uuid;
  end if;
  -- Serialise new submissions for this patient, including concurrent nurse sessions.
  perform 1 from public.outside_nursing_patients where id=pid for update;
  if not found then raise exception 'Outside patient not found'; end if;
  if p_action='visit' and exists(select 1 from public.outside_nursing_visits where id=eid) then
   if exists(select 1 from public.outside_nursing_visits where id=eid and recorded_by=auth.uid() and patient_id=pid and service_date=(p_data->>'service_date')::date and procedure_name=trim(p_data->>'procedure_name') and nurse_name=trim(p_data->>'nurse_name') and location=p_data->>'location' and notes=coalesce(p_data->>'notes','') and items_expected=coalesce((p_data->>'items_expected')::boolean,false) and review_status<>'Voided') then return jsonb_build_object('id',eid); end if;
   raise exception 'Submission key already used; refresh the register';
  end if;
  day:=(p_data->>'service_date')::date;
  reason:=trim(coalesce(p_data->>'repeat_reason',''));
  -- Deliberately warn for all same-day care: spelling variations must not evade the check.
  if exists(select 1 from public.outside_nursing_visits where patient_id=pid and service_date=day and id<>eid and review_status<>'Voided') and length(reason)<10 then
   raise exception 'Another procedure exists for this patient on this date. Review the register and give a repeat / separate care reason (at least 10 characters) if this is a genuine separate visit';
  end if;
  result:=public.outside_nursing_base_234(p_action,p_data);
  update public.outside_nursing_visits set repeat_reason=reason where id=eid;
  return result;
 end if;
 if p_action='void_duplicate' then
  if not public.current_user_has_role(array['Admin']) then raise exception 'Only Admin can void a duplicate'; end if;
  -- Stable lock order prevents opposite duplicate selections from deadlocking.
  perform 1 from public.outside_nursing_visits where id in ((p_data->>'visit_id')::uuid,(p_data->>'duplicate_of')::uuid) order by id for update;
  select * into v from public.outside_nursing_visits where id=(p_data->>'visit_id')::uuid;
  select * into keeper from public.outside_nursing_visits where id=(p_data->>'duplicate_of')::uuid;
  reason:=trim(coalesce(p_data->>'void_reason',''));
  if v.id is null or keeper.id is null or v.id=keeper.id or keeper.patient_id<>v.patient_id or keeper.review_status='Voided' then raise exception 'Select the retained record for this same patient'; end if;
  if length(reason)<10 then raise exception 'Explain why this is a duplicate (at least 10 characters)'; end if;
  if v.review_status not in ('Submitted','Returned') or v.billed_at is not null or exists(select 1 from public.outside_nursing_payments where visit_id=v.id) or exists(select 1 from public.outside_nursing_online_requests where visit_id=v.id and status in ('Creating','Pending','Paid')) then raise exception 'Invoiced or paid procedures cannot be voided as duplicates'; end if;
  if exists(select 1 from public.outside_nursing_visits where duplicate_of=v.id) then raise exception 'This is already the retained record for another duplicate'; end if;
  if exists(select 1 from public.patient_consumable_indents where outside_visit_id=v.id and status<>'Rejected') then raise exception 'Linked indents must be reviewed first. Retain the record with used items, or return it to the nurse for correction. Stock and used-item history cannot be discarded'; end if;
  update public.outside_nursing_visits set review_status='Voided',void_reason=reason,voided_by=auth.uid(),voided_at=now(),duplicate_of=keeper.id where id=v.id;
  perform public.record_audit_event('Outside Nursing Duplicate Voided','Outside Nursing',v.id::text,jsonb_build_object('reason',reason,'retained_visit_id',keeper.id,'previous_status',v.review_status),'Success');
  return jsonb_build_object('id',v.id);
 end if;
 if p_action in ('indent','receive_indent','bill','return','payment') then
  select * into v from public.outside_nursing_visits where id=(p_data->>'visit_id')::uuid for update;
  if not found or v.review_status='Voided' then raise exception 'Voided or missing procedures cannot be changed or billed'; end if;
 end if;
 return public.outside_nursing_base_234(p_action,p_data);
end $$;
revoke all on function public.outside_nursing(text,jsonb) from public,anon;
grant execute on function public.outside_nursing(text,jsonb) to authenticated;
-- Also protect generic Stores / receipt entry points, not just the nursing RPC.
create or replace function public.guard_outside_nursing_indent_roles() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.outside_visit_id is not null then
  if exists(select 1 from public.outside_nursing_visits where id=new.outside_visit_id and review_status='Voided') then raise exception 'Cannot change indents of a voided procedure'; end if;
  if TG_OP='INSERT' then
   if not public.current_user_has_role(array['Nurse']) then raise exception 'Only nurses can raise outside procedure indents'; end if;
  elsif new.received_qty is distinct from old.received_qty or (new.status='Received' and old.status is distinct from new.status) then
   if not public.current_user_has_role(array['Nurse']) then raise exception 'Only nurses can confirm outside procedure indent receipt'; end if;
  end if;
 end if;
 return new;
end $$;
drop trigger if exists outside_nursing_indent_roles on public.patient_consumable_indents;
create trigger outside_nursing_indent_roles before insert or update on public.patient_consumable_indents for each row execute function public.guard_outside_nursing_indent_roles();
notify pgrst,'reload schema';
commit;
