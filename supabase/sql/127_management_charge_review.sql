-- Management must review both the posted ledger and raised charge requests.
begin;
create or replace function public.discharge_management_snapshot(p_discharge_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.patient_discharges%rowtype; ledger jsonb; requests jsonb; pending integer; balance numeric;
begin
  if not (public.stores_return_approval_allowed() or exists(select 1 from public.profiles
    where (id=auth.uid() or auth_user_id=auth.uid()) and coalesce(is_active,true) and role='Manager')) then
    raise exception 'Management review permission required.';
  end if;
  select * into d from public.patient_discharges where id=p_discharge_id;
  if not found then raise exception 'Discharge request not found.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(d.patient_id::text,105));
  select coalesce(jsonb_agg(to_jsonb(t) order by t.transaction_date desc,t.id),'[]'::jsonb),
    coalesce(sum(case when transaction_type in ('Charge','Refund') then amount
      when transaction_type in ('Payment','Advance','Discount') then -amount else 0 end),0)
    into ledger,balance from public.billing_transactions t where patient_id=d.patient_id;
  select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('unresolved',
    coalesce(r.approval_status,'Pending')<>'Rejected' and
    (coalesce(r.approval_status,'Pending') not in ('Approved','Partially Approved') or not exists(
      select 1 from public.billing_transactions t where t.id=r.billing_transaction_id
      and t.patient_id=r.patient_id and t.transaction_type='Charge' and t.amount=r.final_amount)))
    order by r.id),'[]'::jsonb) into requests from public.bill_charge_requests r where patient_id=d.patient_id;
  select count(*) into pending from jsonb_array_elements(requests) r where (r->>'unresolved')::boolean;
  return jsonb_build_object('patient_id',d.patient_id,'ledger',ledger,'requests',requests,
    'pending_count',pending,'balance',balance,
    'token',md5(ledger::text||requests::text||to_jsonb(d)::text));
end $$;

create or replace function public.review_patient_discharge(p_discharge_id uuid,p_decision text,
  p_remarks text,p_discount numeric,p_discount_reason text,p_review_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d public.patient_discharges%rowtype; snap jsonb; result jsonb; actor uuid; role_name text; remarks text;
begin
  select * into d from public.patient_discharges where id=p_discharge_id;
  if not found then raise exception 'Discharge request not found.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(d.patient_id::text,105));
  select * into d from public.patient_discharges where id=p_discharge_id for update;
  snap:=public.discharge_management_snapshot(p_discharge_id);
  if d.status='Completed' then raise exception 'Completed discharge cannot be approved again.'; end if;
  if p_decision not in ('Approved','Rejected') or p_decision is null then raise exception 'Invalid decision.'; end if;
  if p_decision='Rejected' and nullif(trim(p_remarks),'') is null then raise exception 'Rejection reason required.'; end if;
  if p_decision='Approved' and (p_review_token is null or p_review_token is distinct from snap->>'token') then
    raise exception 'The patient account or discharge request changed. Refresh and review all charges again.';
  end if;
  if p_discount is null or p_discount<0 or p_discount::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid discount.'; end if;
  select actor_id,actor_role into actor,role_name from public.stores_actor();
  if p_discount>0 then
    if p_decision<>'Approved' or role_name is distinct from 'Admin' then raise exception 'Only Admin may approve a discharge discount.'; end if;
    if (snap->>'pending_count')::integer>0 then raise exception 'Discount blocked: Accounts must resolve every pending charge and ledger posting first.'; end if;
    if p_discount>greatest(0,(snap->>'balance')::numeric) then raise exception 'Discount exceeds the current outstanding balance.'; end if;
    if nullif(trim(p_discount_reason),'') is null then raise exception 'Discount reason required.'; end if;
  end if;
  remarks:=concat_ws(' | ',nullif(trim(p_remarks),''),
    case when p_discount>0 then 'Admin-approved discount: INR '||p_discount::text end,
    case when p_discount>0 then 'Discount reason: '||trim(p_discount_reason) end);
  perform set_config('samara.management_review_patient',d.patient_id::text,true);
  result:=public.approve_patient_discharge_v2(p_discharge_id,p_decision,remarks);
  if p_discount>0 then
    insert into public.billing_transactions(patient_id,transaction_type,category,amount,payment_mode,description,transaction_date,entered_by)
    values(d.patient_id,'Discount','Discharge Discount',p_discount,'Not applicable',
      'Approved during discharge management review | Discharge ID: '||d.id::text||' | Reason: '||trim(p_discount_reason),now(),actor);
  end if;
  perform set_config('samara.management_review_patient','',true);
  insert into public.audit_log(user_id,action,entity,entity_id,details)
  values(actor,'Management Financial Review','Discharge',d.id::text,jsonb_build_object(
    'review_token',snap->>'token','reviewed_balance',snap->'balance',
    'pending_charge_count',snap->'pending_count','decision',p_decision,'discount_amount',p_discount));
  return result;
end $$;

-- Older screens must not bypass the refreshed review or save discounts separately.
create or replace function public.guard_management_financial_review()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if TG_TABLE_NAME='patient_discharges' then
    if new.management_status<>'Approved' then return new; end if;
    if TG_OP='UPDATE' then
      if new.management_status is not distinct from old.management_status
        and new.management_approved_at is not distinct from old.management_approved_at then return new; end if;
    end if;
  else
    if new.transaction_type<>'Discount' or new.category is distinct from 'Discharge Discount' then return new; end if;
    if TG_OP='UPDATE' and new is not distinct from old then return new; end if;
  end if;
  if current_setting('samara.management_review_patient',true) is distinct from new.patient_id::text then
    raise exception 'Refresh the ERP and use Management Discharge Review to approve the current account.';
  end if;
  return new;
end $$;
drop trigger if exists management_financial_review_guard on public.patient_discharges;
create trigger management_financial_review_guard before insert or update on public.patient_discharges
for each row execute function public.guard_management_financial_review();
drop trigger if exists management_discount_review_guard on public.billing_transactions;
create trigger management_discount_review_guard before insert or update on public.billing_transactions
for each row execute function public.guard_management_financial_review();
revoke all on function public.guard_management_financial_review() from public,anon,authenticated;
revoke all on function public.discharge_management_snapshot(uuid),public.review_patient_discharge(uuid,text,text,numeric,text,text) from public,anon;
grant execute on function public.discharge_management_snapshot(uuid),public.review_patient_discharge(uuid,text,text,numeric,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
