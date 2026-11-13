-- Samara Care ERP 2.20.101 (Admin, 13-11-2026) — Bills & Charges: no Accounts approval for fixed-rate charges
--
-- Rule: a bill / charge raised by Nursing goes STRAIGHT into the Guest's account (Patient Ledger + Family Portal)
-- when the amount is fixed by Admin:
--   • Stores items — Consumables, Pharmacy, Housekeeping & General, Kitchen / Food Stores (incl. Ward Stock cupboard
--     items): live Stores Master charge rate × quantity
--   • every other Charge Master item with an active Admin-fixed tariff: tariff × quantity
--   • Nursing Procedures and completed Physiotherapy sessions: unchanged from SQL 374 (already automatic)
-- Still waiting for Accounts, as before: "Others" / custom items, bill-based charges (uploaded bill), outside bills
-- Samara pays (handling fee), items with no rate fixed yet, and Physiotherapy charges not linked to a completed session.
-- Charges already Pending with Accounts when this is run stay with Accounts (not posted by this file).
-- Problems are logged in samara_auto_charge_issues and the charge simply stays Pending with Accounts.

create or replace function public.samara_auto_post_charge(p_id uuid)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.bill_charge_requests%rowtype; v_amount numeric; v_rate numeric; v_tid uuid; v_note text; v_cat text;
        v_qty numeric; v_rule text;
begin
  select * into r from public.bill_charge_requests where id=p_id for update;
  if not found or coalesce(r.approval_status,'Pending')<>'Pending' or r.billing_transaction_id is not null
     or coalesce(r.status,'') in ('Cancelled','Removed','Rejected','Posted') then return null; end if;
  if coalesce(r.bill_available,false) or r.outside_paid_by is not null
     or upper(coalesce(r.service_code,''))='OTHER' or lower(trim(coalesce(r.service_name,''))) in ('others','other') then return null; end if;
  v_qty := greatest(coalesce(r.quantity,1),1);

  if r.physiotherapy_session_id is not null then
    if coalesce(r.unit_cost,0)<=0 then return null; end if;   -- no agreed rate yet → Accounts / Admin as before
    if not exists (select 1 from public.physiotherapy_sessions s where s.id=r.physiotherapy_session_id and s.status='Completed'
                    and s.patient_id=r.patient_id and s.charge_request_id=r.id) then return null; end if;
    v_amount := r.unit_cost; v_cat := 'Physiotherapy'; v_note := 'Guest agreed rate'; v_rule := 'rule 11-11-2026';
  elsif r.category='Physiotherapy' then
    return null;                                              -- physio without a completed session → Accounts
  elsif r.category in ('Consumables','Pharmacy','Pharmacy & Basic Supplies','Housekeeping & General','Kitchen / Food Stores') then
    select charge_rate into v_rate from public.consumable_store_items
     where active=true
       and ((nullif(r.charge_item_code,'') is not null and item_code=r.charge_item_code) or item_name=r.service_name)
     order by (nullif(r.charge_item_code,'') is not null and item_code=r.charge_item_code) desc
     limit 1;
    if coalesce(v_rate,0)<=0 then return null; end if;         -- no Stores rate fixed → Accounts
    v_amount := v_rate * v_qty; v_cat := r.category; v_note := 'Stores Master rate'; v_rule := 'rule 13-11-2026';
  else
    select amount into v_rate from public.charge_tariff_master
     where is_active and ((nullif(r.charge_item_code,'') is not null and charge_code=r.charge_item_code)
                          or (category=r.category and service_name=r.service_name))
     order by (charge_code is not distinct from r.charge_item_code) desc limit 1;
    if coalesce(v_rate,0)<=0 then return null; end if;         -- no Admin-fixed tariff → Accounts
    v_amount := v_rate * v_qty; v_cat := r.category; v_note := 'Admin-fixed tariff';
    v_rule := case when r.category='Nursing Procedures' then 'rule 11-11-2026' else 'rule 13-11-2026' end;
  end if;
  v_amount := round(v_amount, 2);
  if coalesce(v_amount,0)<=0 then return null; end if;

  insert into public.billing_transactions(patient_id,transaction_type,category,amount,payment_mode,description,transaction_date,entered_by)
  values (r.patient_id,'Charge',v_cat,v_amount,'Not applicable',
          concat(r.description,' · Auto-posted when raised (no Accounts approval needed) · ',v_note),
          now(), coalesce(r.raised_by, auth.uid()))
  returning id into v_tid;
  update public.bill_charge_requests
     set unit_cost=coalesce(unit_cost, v_amount/v_qty), estimated_amount=coalesce(estimated_amount,v_amount),
         requested_amount=coalesce(requested_amount,v_amount), final_amount=v_amount, approved_amount=v_amount,
         approval_status='Approved', status='Posted', approved_at=now(), decision_date=now(),
         decision_by_name='Auto-posted (no Accounts approval)', decision_by_role='System',
         approval_remarks=concat_ws(' · ', nullif(approval_remarks,''), 'Auto-posted on raising — '||v_rule),
         billing_transaction_id=v_tid, auto_posted=true, updated_at=now()
   where id=r.id;
  return v_tid;
exception when others then
  insert into public.samara_auto_charge_issues(source, ref, patient_id, message) values ('Auto-post charge', p_id::text, r.patient_id, sqlerrm);
  return null;
end $$;
revoke all on function public.samara_auto_post_charge(uuid) from public, anon, authenticated;

-- The trigger from SQL 374 (after insert / update of unit_cost, physiotherapy_session_id, deferred) already calls
-- this function for every new charge, so nothing else changes. Re-create it to be safe.
drop trigger if exists samara_auto_post_charge on public.bill_charge_requests;
create constraint trigger samara_auto_post_charge after insert or update of unit_cost, physiotherapy_session_id on public.bill_charge_requests
  deferrable initially deferred for each row execute function public.samara_trg_auto_post_charge();

select 'SQL 403 installed — fixed-rate charges now post directly to the Guest account' as result;
