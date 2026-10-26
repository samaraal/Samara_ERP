-- 300 — Bills & Charges: "Return" to the nurse for correction + "Correct & Resubmit" — ERP 2.18.147
-- Owner's rule (26-10-2026): Accounts no longer "Reject" a charge request; they RETURN it to Nursing with a
-- reason. The nurse corrects it and resubmits; the resubmission is a NEW request (all the usual checks: Charge
-- Master / Stores rate, received-stock balance) linked to the returned one, so nothing is overwritten.
-- The decision value stored stays 'Rejected' (every existing stock / billing rule already treats it as
-- "not charged — items free to charge again"); the ERP shows it as "Returned".
-- Safe to run more than once. Nothing is deleted.

alter table public.bill_charge_requests add column if not exists resubmitted_from uuid references public.bill_charge_requests(id) on delete set null;
alter table public.bill_charge_requests add column if not exists resubmitted_as uuid references public.bill_charge_requests(id) on delete set null;
alter table public.bill_charge_requests add column if not exists resubmitted_at timestamptz;
alter table public.bill_charge_requests add column if not exists resubmitted_by_name text;
create index if not exists bill_charge_requests_resubmitted_from on public.bill_charge_requests(resubmitted_from);

-- Link a nurse's corrected request to the returned one (one resubmission per returned request).
create or replace function public.mark_charge_request_resubmitted(p_returned uuid, p_new uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.bill_charge_requests%rowtype; n public.bill_charge_requests%rowtype; v_name text;
begin
  if auth.uid() is null or not public.current_user_has_role(array['Nurse','Manager','Admin']) then
    raise exception 'Only Nursing can resubmit a returned charge request';
  end if;
  select * into o from public.bill_charge_requests where id=p_returned for update;
  if not found then raise exception 'Returned request not found'; end if;
  select * into n from public.bill_charge_requests where id=p_new for update;
  if not found then raise exception 'Corrected request not found'; end if;
  if coalesce(o.approval_status,'')<>'Rejected' then raise exception 'Only a returned request can be resubmitted'; end if;
  if o.resubmitted_as is not null then raise exception 'This returned request has already been resubmitted'; end if;
  if n.patient_id is distinct from o.patient_id then raise exception 'The corrected request must be for the same Guest'; end if;
  if coalesce(n.approval_status,'Pending')<>'Pending' or n.resubmitted_from is not null then raise exception 'The corrected request is not a new pending request'; end if;
  select coalesce(nullif(full_name,''),'Nursing') into v_name from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  update public.bill_charge_requests set resubmitted_as=n.id,resubmitted_at=now(),resubmitted_by_name=v_name,updated_at=now() where id=o.id;
  update public.bill_charge_requests set resubmitted_from=o.id,updated_at=now() where id=n.id;
  return jsonb_build_object('returned',o.id,'resubmitted_as',n.id);
end $$;
revoke all on function public.mark_charge_request_resubmitted(uuid,uuid) from public,anon;
grant execute on function public.mark_charge_request_resubmitted(uuid,uuid) to authenticated;

-- Check: 4 new columns and the function
select count(*) filter (where column_name in ('resubmitted_from','resubmitted_as','resubmitted_at','resubmitted_by_name')) as new_columns,
       (select count(*) from pg_proc where proname='mark_charge_request_resubmitted') as function_installed
from information_schema.columns where table_schema='public' and table_name='bill_charge_requests';
