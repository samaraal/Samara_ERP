-- Reopen financial clearance only for changes that actually reach the ledger.
-- BEFORE INSERT fires even when ON CONFLICT DO NOTHING discards the candidate.
begin;
create or replace function public.samara_financial_activity_guard()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_patient uuid;
begin
  if TG_OP='UPDATE' then
    if new.patient_id is distinct from old.patient_id then
      raise exception 'A financial record cannot be moved to another patient.';
    end if;
    if new is not distinct from old then return new; end if;
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
create trigger samara_charge_activity_guard after insert or update or delete on public.bill_charge_requests
  for each row execute function public.samara_financial_activity_guard();
drop trigger if exists samara_ledger_activity_guard on public.billing_transactions;
create trigger samara_ledger_activity_guard after insert or update or delete on public.billing_transactions
  for each row execute function public.samara_financial_activity_guard();
commit;
