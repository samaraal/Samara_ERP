-- Samara Care ERP 2.18.28 / Family Portal v1.0.42 — Nursing Procedures in the Family Portal
-- Issue (Boomi, 19-10-2026): after 2.18.26/27 the planned Nursing Procedures (care_orders with
-- order_kind 'Nursing Procedure') were not shown under "Nursing Procedures" in the Family Portal —
-- family_portal_dashboard never returned any procedure data, and planned procedures mixed into Care.
--
-- family_portal_nursing_procedures(session token) returns, for the family's OWN Guest only:
--   proc_order_ids : ids of the Guest's procedure plan rows (the portal moves their care records out of Care)
--   plan           : active planned procedures (name, times / frequency) — no codes, no rates
--   records        : procedures done in the last 120 days — planned procedure records (Shift Tasks /
--                    Daily Care) + procedures started through Approval Requests. No staff names.
-- Same session check as the existing family_portal_beverages (via family_portal_dashboard, unchanged).
-- Run AFTER 251 and 252. Safe to run again.

create or replace function public.family_portal_nursing_procedures(p_session_token text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare d jsonb; pid uuid; argtype text; pt jsonb; v_ids jsonb; v_plan jsonb; v_logs jsonb; v_req jsonb;
begin
 if coalesce(trim(p_session_token),'')='' then return '{}'::jsonb;end if;
 select format_type(p.proargtypes[0],null) into argtype from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='family_portal_dashboard' and p.pronargs=1 limit 1;
 if argtype is null then return '{}'::jsonb;end if;
 begin
  execute format('select to_jsonb(public.family_portal_dashboard($1::%s))',argtype) into d using p_session_token;
 exception when others then return '{}'::jsonb;
 end;
 if d is null or jsonb_typeof(d)<>'object' then return '{}'::jsonb;end if;
 pt:=coalesce(d->'patient',d->'resident',d->'guest','{}'::jsonb);
 select p.id into pid from public.patients p
  where p.id::text in (pt->>'id',pt->>'patient_uuid',pt->>'patient_db_id',pt->>'uuid',pt->>'patient_id') limit 1;
 if pid is null then
  select p.id into pid from public.patients p
   where p.patient_id in (pt->>'patient_id',pt->>'resident_id',pt->>'patient_code',pt->>'id') limit 1;
 end if;
 if pid is null then return '{}'::jsonb;end if;

 select coalesce(jsonb_agg(c.id),'[]'::jsonb) into v_ids
  from public.care_orders c where c.patient_id=pid and c.order_kind='Nursing Procedure';

 select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'procedure_name',c.care_type,'shift',c.shift,'frequency',c.frequency,
    'scheduled_times',to_jsonb(c.scheduled_times),'instruction',c.instruction,'start_date',c.start_date)
   order by c.created_at),'[]'::jsonb) into v_plan
  from public.care_orders c where c.patient_id=pid and c.order_kind='Nursing Procedure' and coalesce(c.is_active,true);

 select coalesce(jsonb_agg(jsonb_build_object(
    'id','log-'||l.id,'procedure_name',c.care_type,'status',coalesce(l.status,'Recorded'),
    'completed_at',coalesce(l.completed_at,l.created_at),'care_date',l.care_date,'shift',l.shift,
    'scheduled_time',to_char(l.scheduled_time,'HH24:MI'),
    -- the nurse's note without the leading "Procedure name:" the ERP adds
    'details',nullif(btrim(case when c.care_type is not null and lower(left(coalesce(l.remarks,''),length(c.care_type)))=lower(c.care_type)
                   then regexp_replace(substr(l.remarks,length(c.care_type)+1),'^\s*:\s*','') else coalesce(l.remarks,'') end),''))
   order by coalesce(l.completed_at,l.created_at) desc),'[]'::jsonb) into v_logs
  from (select * from public.care_logs where patient_id=pid and care_date>=current_date-120 order by coalesce(completed_at,created_at) desc limit 400) l
  join public.care_orders c on c.id=l.care_order_id and c.order_kind='Nursing Procedure';

 v_req:='[]'::jsonb;
 if to_regclass('public.nursing_procedure_requests') is not null then
  select coalesce(jsonb_agg(jsonb_build_object(
     'id','req-'||r.id,'procedure_name',r.procedure_name,'status','Done',
     'completed_at',coalesce(r.started_at,r.scheduled_at,r.requested_at),'details',null)
    order by coalesce(r.started_at,r.requested_at) desc),'[]'::jsonb) into v_req
   from public.nursing_procedure_requests r
   where r.patient_id=pid and r.status='Started' and coalesce(r.category,'Nursing Procedures')='Nursing Procedures'
     and coalesce(r.started_at,r.requested_at)>=now()-interval '120 days';
 end if;

 return jsonb_build_object('proc_order_ids',v_ids,'plan',v_plan,'records',v_logs||v_req);
end $$;
revoke all on function public.family_portal_nursing_procedures(text) from public;
grant execute on function public.family_portal_nursing_procedures(text) to anon, authenticated;
notify pgrst, 'reload schema';
