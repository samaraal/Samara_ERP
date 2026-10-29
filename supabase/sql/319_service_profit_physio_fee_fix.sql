-- ERP 2.19.17 — Profit by Service: Physiotherapy counted twice when a physiotherapist fee was reversed and posted again (29-10-2026).
-- Run once in Supabase SQL Editor. Safe to run again. Replaces get_service_profit only (same name and inputs).
-- Found: October had 2 such sessions — the Guest charge appeared twice (₹500 + ₹800 extra income, one copy with no fee),
-- so Physiotherapy income showed ₹19,900 instead of ₹18,600. Net Profit Statement was already right.
create or replace function public.get_service_profit(p_from date, p_to date, p_patient uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare a jsonb := public.samara_profit_admin(); v_lines jsonb;
begin
  if p_from is null or p_to is null or p_from>p_to then raise exception 'Invalid period'; end if;
  with avg_cost as (
    select r.item_id, sum(r.quantity*r.unit_cost)/nullif(sum(r.quantity),0) as unit_cost
      from public.consumable_store_receipts r left join public.consumable_store_items i on i.id=r.item_id
     where r.voided_at is null and r.unit_cost>0 and r.quantity>0
       and not (coalesce(i.charge_rate,0)>0 and r.unit_cost>2*i.charge_rate)
     group by r.item_id),
  -- 2.19.17: ONE row per session — a fee reversed and posted again used to give two rows, so the session's
  -- charge was counted twice (income doubled, one copy at cost 0).
  physio_fee as (
    select f.session_id, sum(f.amount + coalesce((select sum(v.amount) from public.physio_supplier_ledger v where v.kind='Reversal' and v.reverses=f.id),0)) as fee
      from public.physio_supplier_ledger f where f.kind='Session fee' and f.session_id is not null
     group by f.session_id),
  lines as (
    select t.id, t.patient_id, coalesce(t.source_date,t.transaction_date::date) as charge_date,
           case when t.category in ('Consumables','Pharmacy & Basic Supplies') then 'Consumables'
                when t.category='Nursing Procedures' then 'Nursing Procedures' else 'Physiotherapy' end as head,
           t.category,
           coalesce(nullif(btrim(concat_ws(' · ',b.charge_item_code,coalesce(b.service_name,i.item_name))),''),t.description,'—') as item,
           coalesce(b.quantity,1)::numeric as qty, t.amount::numeric as income,
           case when t.category in ('Consumables','Pharmacy & Basic Supplies') then round(coalesce(b.quantity,1)*ac.unit_cost,2)
                when t.category='Physiotherapy' then round(coalesce(pf.fee,0),2)
                else 0 end as cost,
           (t.category='Physiotherapy' and pf.session_id is null) as no_fee
      from public.billing_transactions t
      join public.patients pt on pt.id=t.patient_id
      left join public.bill_charge_requests b on b.billing_transaction_id=t.id
      left join public.consumable_store_items i on i.id=b.store_item_id
      left join avg_cost ac on ac.item_id=b.store_item_id
      left join physio_fee pf on pf.session_id=b.physiotherapy_session_id
     where t.transaction_type='Charge' and not coalesce(pt.is_trial,false)
       and t.category in ('Consumables','Pharmacy & Basic Supplies','Nursing Procedures','Physiotherapy')
       and coalesce(t.source_date,t.transaction_date::date) between p_from and p_to
       and (p_patient is null or t.patient_id=p_patient))
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'patient_id',patient_id,'date',charge_date,'head',head,'category',category,
           'item',item,'qty',qty,'income',income,'cost',cost,'no_fee',no_fee) order by charge_date, head, item),'[]'::jsonb)
    into v_lines from lines;
  return jsonb_build_object('from',p_from,'to',p_to,'patient_id',p_patient,'generated_by',a->>'name','generated_at',now(),'lines',v_lines);
end $$;
revoke all on function public.get_service_profit(date,date,uuid) from public, anon;
grant execute on function public.get_service_profit(date,date,uuid) to authenticated;
notify pgrst, 'reload schema';
