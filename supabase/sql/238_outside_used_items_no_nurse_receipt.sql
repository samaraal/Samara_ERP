begin;
alter table public.patient_consumable_indents add column if not exists outside_usage_approved_at timestamptz;
-- Preserve existing Stores authorization, stock ledger and in-house workflows.
do $$ begin
 if to_regprocedure('public.approve_patient_consumable_indent_base_238(uuid,numeric,text,text)') is null then alter function public.approve_patient_consumable_indent_v2(uuid,numeric,text,text) rename to approve_patient_consumable_indent_base_238; end if;
 if to_regprocedure('public.handover_patient_consumable_indent_base_238(uuid,numeric,text)') is null then alter function public.handover_patient_consumable_indent_v2(uuid,numeric,text) rename to handover_patient_consumable_indent_base_238; end if;
 if to_regprocedure('public.receive_patient_consumable_indent_base_238(uuid,numeric,text)') is null then alter function public.receive_patient_consumable_indent(uuid,numeric,text) rename to receive_patient_consumable_indent_base_238; end if;
 if to_regprocedure('public.outside_nursing_base_238(text,jsonb)') is null then alter function public.outside_nursing(text,jsonb) rename to outside_nursing_base_238; end if;
end $$;
revoke all on function public.approve_patient_consumable_indent_base_238(uuid,numeric,text,text),public.handover_patient_consumable_indent_base_238(uuid,numeric,text),public.receive_patient_consumable_indent_base_238(uuid,numeric,text),public.outside_nursing_base_238(text,jsonb) from public,anon,authenticated;
create or replace function public.guard_outside_nursing_indent_roles() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.outside_visit_id is not null then
  if exists(select 1 from public.outside_nursing_visits where id=new.outside_visit_id and review_status='Voided') then raise exception 'Cannot change indents of a voided procedure'; end if;
  if TG_OP='INSERT' then
   if not public.current_user_has_role(array['Nurse']) then raise exception 'Only nurses can raise outside procedure indents'; end if;
  elsif new.received_qty is distinct from old.received_qty or (new.status='Received' and old.status is distinct from new.status) then
   if not public.stores_controller_authorised() or old.status<>'Handed Over' or new.status<>'Received' or new.received_qty is distinct from new.handed_over_qty or new.received_qty is distinct from new.requested_qty or new.outside_usage_approved_at is null then
    raise exception 'Outside procedure usage is completed by Stores approval; nurse receipt is not required';
   end if;
  end if;
 end if;
 return new;
end $$;
create or replace function public.complete_outside_used_indent_238(p_indent_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.patient_consumable_indents%rowtype; a record; vid uuid;
begin
 if not public.stores_controller_authorised() then raise exception 'Only the currently assigned Store In-charge can approve used items'; end if;
 select outside_visit_id into vid from public.patient_consumable_indents where id=p_indent_id;
 if vid is null then raise exception 'Outside used-item indent required'; end if;
 perform 1 from public.outside_nursing_visits where id=vid for update;
 select * into v from public.patient_consumable_indents where id=p_indent_id for update;
 if v.status='Received' then return jsonb_build_object('success',true,'status','Received','already_completed',true); end if;
 if v.approved_qty is distinct from v.requested_qty then raise exception 'Approve the full used quantity, or reject the indent with a correction reason'; end if;
 if v.status='Approved' then
  perform public.handover_patient_consumable_indent_base_238(v.id,v.requested_qty,'Outside procedure: reconcile items already used. No new physical handover or nurse receipt.');
  select * into v from public.patient_consumable_indents where id=p_indent_id;
 end if;
 if v.status<>'Handed Over' or v.handed_over_qty is distinct from v.requested_qty then raise exception 'Stores must reconcile the full recorded used quantity'; end if;
 select * into a from public.stores_actor();
 update public.patient_consumable_indents set status='Received',received_qty=v.handed_over_qty,received_by=a.actor_id,received_by_name=a.actor_name,received_at=now(),receipt_remarks='Stores approved items already used in outside care. Nurse receipt not required.',outside_usage_approved_at=now(),updated_at=now() where id=v.id;
 perform public.record_audit_event('Outside Nursing Used Items Approved','Outside Nursing',v.id::text,jsonb_build_object('used_qty',v.outside_used_qty,'wastage_qty',v.outside_wastage_qty,'stock_qty',v.handed_over_qty,'nurse_receipt_required',false),'Success');
 return jsonb_build_object('success',true,'status','Received','used_items_approved',true);
end $$;
revoke all on function public.complete_outside_used_indent_238(uuid) from public,anon,authenticated;
create or replace function public.approve_patient_consumable_indent_v2(p_indent_id uuid,p_approved_qty numeric,p_decision text,p_remarks text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.patient_consumable_indents%rowtype; vid uuid; result jsonb;
begin
 select outside_visit_id into vid from public.patient_consumable_indents where id=p_indent_id;
 if vid is null then return public.approve_patient_consumable_indent_base_238(p_indent_id,p_approved_qty,p_decision,p_remarks); end if;
 if not public.stores_controller_authorised() then raise exception 'Only the currently assigned Store In-charge can approve this indent'; end if;
 perform 1 from public.outside_nursing_visits where id=vid for update;
 select * into v from public.patient_consumable_indents where id=p_indent_id for update;
 if trim(p_decision)='Approved' then
  if p_approved_qty is distinct from v.requested_qty then raise exception 'Approve the full used quantity, or reject the indent with a correction reason'; end if;
  if v.status in ('Approved','Handed Over','Received') then return public.complete_outside_used_indent_238(v.id); end if;
 end if;
 result:=public.approve_patient_consumable_indent_base_238(p_indent_id,p_approved_qty,p_decision,p_remarks);
 if trim(p_decision)='Approved' then return public.complete_outside_used_indent_238(p_indent_id); end if;
 return result;
end $$;
create or replace function public.handover_patient_consumable_indent_v2(p_indent_id uuid,p_handed_over_qty numeric,p_remarks text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.patient_consumable_indents%rowtype;
begin
 select * into v from public.patient_consumable_indents where id=p_indent_id;
 if v.outside_visit_id is null then return public.handover_patient_consumable_indent_base_238(p_indent_id,p_handed_over_qty,p_remarks); end if;
 if p_handed_over_qty is distinct from v.requested_qty then raise exception 'Reconcile the full recorded used quantity'; end if;
 return public.complete_outside_used_indent_238(p_indent_id);
end $$;
create or replace function public.receive_patient_consumable_indent(p_indent_id uuid,p_received_qty numeric,p_remarks text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from public.patient_consumable_indents where id=p_indent_id and outside_visit_id is not null) then raise exception 'No nurse receipt needed for outside care. Stores approves the recorded used items'; end if;
 return public.receive_patient_consumable_indent_base_238(p_indent_id,p_received_qty,p_remarks);
end $$;
create or replace function public.outside_nursing(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_action='receive_indent' then raise exception 'No nurse receipt needed for outside care. Stores approves the recorded used items'; end if;
 return public.outside_nursing_base_238(p_action,p_data);
end $$;
revoke all on function public.approve_patient_consumable_indent_v2(uuid,numeric,text,text),public.handover_patient_consumable_indent_v2(uuid,numeric,text),public.receive_patient_consumable_indent(uuid,numeric,text),public.outside_nursing(text,jsonb) from public,anon;
grant execute on function public.approve_patient_consumable_indent_v2(uuid,numeric,text,text),public.handover_patient_consumable_indent_v2(uuid,numeric,text),public.receive_patient_consumable_indent(uuid,numeric,text),public.outside_nursing(text,jsonb) to authenticated;
-- Update only obsolete wording in the preserved pricing implementation.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.outside_nursing_base_238(text,jsonb)'::regprocedure);
 definition:=replace(definition,'Stores must approve and hand over the indents, then the nurse confirms receipt before invoicing','Stores must approve the used-item indents before invoicing');
 execute definition;
end $$;
notify pgrst,'reload schema';
commit;
