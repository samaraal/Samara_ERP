-- Samara ERP: serialize financial changes and verify unposted requests at clearance.
begin;

create or replace function public.samara_assert_discharge_financial_ready(p_patient_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_count integer; v_balance numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_patient_id::text,105));
  select count(*) into v_count from public.bill_charge_requests r
  where r.patient_id=p_patient_id and coalesce(r.approval_status,'Pending')<>'Rejected'
    and (coalesce(r.approval_status,'Pending') not in ('Approved','Partially Approved')
      or not exists(select 1 from public.billing_transactions t
        where t.id=r.billing_transaction_id and t.patient_id=r.patient_id
          and t.transaction_type='Charge' and t.amount=r.final_amount));
  if v_count>0 then
    raise exception '% unresolved charge request(s). Resolve Charge Approvals and ledger posting before financial clearance.',v_count;
  end if;
  select coalesce(sum(case when transaction_type in ('Charge','Refund') then amount
    when transaction_type in ('Payment','Advance','Discount') then -amount else 0 end),0)
    into v_balance from public.billing_transactions where patient_id=p_patient_id;
  if abs(v_balance)>0.009 then
    raise exception 'Financial clearance blocked: current balance is %. Complete payment or the controlled refund workflow.',round(v_balance,2);
  end if;
end $$;
revoke all on function public.samara_assert_discharge_financial_ready(uuid) from public,anon,authenticated;

create or replace function public.samara_guard_financial_clearance()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if (new.accounts_status='Cleared' and old.accounts_status is distinct from 'Cleared')
     or (new.status='Completed' and old.status is distinct from 'Completed') then
    perform public.samara_assert_discharge_financial_ready(new.patient_id);
  end if;
  return new;
end $$;
revoke all on function public.samara_guard_financial_clearance() from public,anon,authenticated;
drop trigger if exists samara_financial_clearance_guard on public.patient_discharges;
create trigger samara_financial_clearance_guard before update on public.patient_discharges
  for each row execute function public.samara_guard_financial_clearance();

-- New financial activity invalidates clearance while the resident awaits departure.
-- Both tables share the same lock as clearance, so a racing request cannot be lost.
create or replace function public.samara_financial_activity_guard()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_patient uuid;
begin
  if TG_OP='UPDATE' and new.patient_id is distinct from old.patient_id then
    raise exception 'A financial record cannot be moved to another patient.';
  end if;
  if TG_OP='DELETE' then v_patient:=old.patient_id; else v_patient:=new.patient_id; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_patient::text,105));
  update public.patient_discharges set accounts_status='Pending',billing_clearance_status='Pending',
    status='Management Approved',accounts_cleared_at=null,accounts_cleared_by=null,
    accounts_cleared_by_name=null,updated_at=now(),
    accounts_remarks=concat_ws(' | ',accounts_remarks,'Financial activity changed after clearance; Accounts recheck required.')
    where patient_id=v_patient and accounts_status='Cleared' and status<>'Completed';
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.samara_financial_activity_guard() from public,anon,authenticated;
drop trigger if exists samara_charge_activity_guard on public.bill_charge_requests;
create trigger samara_charge_activity_guard before insert or update or delete on public.bill_charge_requests
  for each row execute function public.samara_financial_activity_guard();
drop trigger if exists samara_ledger_activity_guard on public.billing_transactions;
create trigger samara_ledger_activity_guard before insert or update or delete on public.billing_transactions
  for each row execute function public.samara_financial_activity_guard();

create or replace function public.close_patient_discharge_accounts_v2(p_discharge_id uuid,p_remarks text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_role text; v_name text; v_d public.patient_discharges%rowtype; v_patient uuid;
begin
  select role,coalesce(nullif(trim(full_name),''),'Accounts') into v_role,v_name
    from public.profiles where id=auth.uid();
  if v_role is null or v_role not in ('Admin','Accounts') then
    raise exception 'Only Admin or Accounts may verify payment and clear the account.';
  end if;
  if length(trim(coalesce(p_remarks,'')))=0 then raise exception 'Accounts closure remarks are required.'; end if;
  select patient_id into v_patient from public.patient_discharges where id=p_discharge_id;
  if v_patient is null then raise exception 'Discharge request not found.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_patient::text,105));
  select * into v_d from public.patient_discharges where id=p_discharge_id for update;
  if v_d.management_status is distinct from 'Approved' then raise exception 'Management approval is required before financial clearance.'; end if;
  if v_d.status='Completed' then raise exception 'This discharge is already completed.'; end if;
  perform public.samara_assert_discharge_financial_ready(v_d.patient_id);
  if v_d.accounts_status is distinct from 'Cleared' then
    update public.patient_discharges set billing_clearance_status='Cleared',accounts_status='Cleared',
      accounts_cleared_by=auth.uid(),accounts_cleared_by_name=v_name,accounts_cleared_at=now(),
      accounts_remarks=trim(p_remarks),final_outstanding=0,
      status='Accounts Cleared - Awaiting Patient Departure',updated_at=now() where id=p_discharge_id;
  end if;
  return jsonb_build_object('discharge_id',p_discharge_id,'patient_id',v_d.patient_id,
    'outstanding',0,'cleared_by',v_name,'cleared_at',now(),'room_released',false,
    'next_action','Nurse to confirm patient departure');
end $$;
notify pgrst,'reload schema';
commit;
