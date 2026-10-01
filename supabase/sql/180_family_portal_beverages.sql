-- SAMARA FAMILY PORTAL v1.0.24 — beverages in Food & Diet.
-- family_portal_beverages(session token) returns the beverage servings of the family's own Guest.
-- The session is checked by the existing family_portal_dashboard (unchanged), so a family can only
-- ever see its own Guest. Returns only what was given, how much, when and whether it was taken —
-- no staff names. Run AFTER 177 (and 179). Run this whole file once in Supabase > SQL Editor. Safe to run again.

create or replace function public.family_portal_beverages(p_session_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d jsonb; pid uuid; argtype text; pt jsonb;
begin
 if coalesce(trim(p_session_token),'')='' then return '[]'::jsonb;end if;
 if to_regclass('public.beverage_records') is null then return '[]'::jsonb;end if;
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
 -- 1) a patient uuid on the dashboard's patient object
 select p.id into pid from public.patients p
  where p.id::text in (pt->>'id',pt->>'patient_uuid',pt->>'patient_db_id',pt->>'uuid',pt->>'patient_id') limit 1;
 -- 2) the Resident ID (e.g. MOG-2026-09-0018)
 if pid is null then
  select p.id into pid from public.patients p
   where p.patient_id in (pt->>'patient_id',pt->>'resident_id',pt->>'patient_code',pt->>'id') limit 1;
 end if;
 -- 3) the patient_id most used in the dashboard's own records (meals, vitals, medicines …)
 if pid is null then
  select p.id into pid from (
    select v #>> '{}' as val from jsonb_path_query(d,'strict $.**.patient_id') v) x
   join public.patients p on p.id::text=x.val or p.patient_id=x.val
   group by p.id order by count(*) desc limit 1;
 end if;
 if pid is null then return '[]'::jsonb;end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
    'id',b.id,'given_at',b.given_at,'given_date',b.given_date,'given_time',b.given_time,
    'beverage',b.beverage,'juice_name',b.juice_name,
    'quantity',coalesce(to_jsonb(b)->'quantity',to_jsonb(b.quantity_ml)),
    'quantity_unit',coalesce(to_jsonb(b)->>'quantity_unit',case when b.quantity_ml is not null then 'ml' end),
    'consumption_status',b.consumption_status,'remarks',b.remarks) order by b.given_at desc)
   from (select * from public.beverage_records where patient_id=pid and given_at>=now()-interval '120 days' order by given_at desc limit 300) b),'[]'::jsonb);
end $$;
revoke all on function public.family_portal_beverages(text) from public;
grant execute on function public.family_portal_beverages(text) to anon, authenticated;
notify pgrst, 'reload schema';

-- Check 1: beverages_ready = true
-- Check 2 (below): beverages recorded per Guest in the last 3 days — if Shylaja shows 0, none has been saved yet.
select to_regprocedure('public.family_portal_beverages(text)') is not null as beverages_ready;
select p.patient_id as resident_id, p.full_name, count(b.id) as beverages_last_3_days, max(b.given_at) as latest
from public.patients p left join public.beverage_records b on b.patient_id=p.id and b.given_at>=now()-interval '3 days'
where p.is_active group by p.patient_id,p.full_name order by p.full_name;
