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
 pt:=coalesce(d->'patient','{}'::jsonb);
 begin pid:=coalesce(nullif(pt->>'id',''),nullif(pt->>'patient_uuid',''))::uuid; exception when others then pid:=null; end;
 if pid is null and nullif(pt->>'patient_id','') is not null then
  select id into pid from public.patients where patient_id=pt->>'patient_id' limit 1;
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

-- Check: should show beverages_ready = true
select to_regprocedure('public.family_portal_beverages(text)') is not null as beverages_ready;
