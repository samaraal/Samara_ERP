-- Samara Care ERP 2.15.77 · Family Portal 1.0.30 — bill lines as "units × price"
-- family_portal_bill_units(session token) returns, for the family's own Guest only,
-- the quantity and unit price of each charge that came through Bills & Charges / Stores
-- (e.g. Examination Gloves 2 × ₹30). No staff names, approvals or remarks.
-- The session is checked by the existing family_portal_dashboard (unchanged), exactly as
-- family_portal_beverages does. Run this whole file once in Supabase SQL Editor. Safe to run again.

create or replace function public.family_portal_bill_units(p_session_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d jsonb; pid uuid; argtype text; pt jsonb;
begin
 if coalesce(trim(p_session_token),'')='' then return '[]'::jsonb;end if;
 select format_type(p.proargtypes[0],null) into argtype from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='family_portal_dashboard' and p.pronargs=1 limit 1;
 if argtype is null then return '[]'::jsonb;end if;
 -- Same session check as the dashboard; an expired / invalid session gives nothing.
 begin
  execute format('select to_jsonb(public.family_portal_dashboard($1::%s))',argtype) into d using p_session_token;
 exception when others then return '[]'::jsonb;
 end;
 if d is null or jsonb_typeof(d)<>'object' then return '[]'::jsonb;end if;
 pt:=coalesce(d->'patient',d->'resident',d->'guest','{}'::jsonb);
 select p.id into pid from public.patients p
  where p.id::text in (pt->>'id',pt->>'patient_uuid',pt->>'patient_db_id',pt->>'uuid',pt->>'patient_id') limit 1;
 if pid is null then
  select p.id into pid from public.patients p
   where p.patient_id in (pt->>'patient_id',pt->>'resident_id',pt->>'patient_code',pt->>'id') limit 1;
 end if;
 if pid is null then return '[]'::jsonb;end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
    'id',bt.id,
    'transaction_date',bt.transaction_date,
    'amount',bt.amount,
    'quantity',r.quantity,
    'unit_price',round(bt.amount/r.quantity,2)))
   from public.billing_transactions bt
   join public.bill_charge_requests r on r.billing_transaction_id=bt.id
  where bt.patient_id=pid and bt.transaction_type='Charge'
    and coalesce(r.quantity,0)>0 and coalesce(bt.amount,0)>0),'[]'::jsonb);
end $$;
revoke all on function public.family_portal_bill_units(text) from public;
grant execute on function public.family_portal_bill_units(text) to anon, authenticated;
notify pgrst, 'reload schema';

-- Check: bill_units_ready = true
select to_regprocedure('public.family_portal_bill_units(text)') is not null as bill_units_ready;
