-- 292 — Physiotherapist phone numbers for staff (📞 Call / 💬 WhatsApp buttons, ERP 2.18.124).
--  • physio_contact_directory(): active physiotherapy organisations (desk number) and physiotherapists (mobile),
--    readable by Admin, Manager, Nurse, Caregiver and STD. Names and phones only — no fees, salaries or ledger.
--  • physio_today_contacts(date): which physiotherapist is expected for which Guest on a day (On Duty Today).
--  • Saves the numbers given on 25-10-2026: Dr. Lukkysh Kumar, Dr. Hemavathi, Dr. Anisha, Vinayaga Physio Point (desk).
-- Run once in Supabase SQL Editor after 291. Safe to re-run. Numbers can be changed later in
-- Physiotherapy → Therapist Accounts (Admin only), as before.
begin;

create or replace function public.physio_contact_directory() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver','STD']) then raise exception 'Staff access required';end if;
 return jsonb_build_object(
  'organisations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'org_type',o.org_type,'contact_person',o.contact_person,'phone',o.phone) order by o.name)
     from public.physio_organisations o where o.is_active),'[]'),
  'practitioners',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'organisation_id',p.organisation_id,'full_name',p.full_name,'phone',p.phone) order by p.full_name)
     from public.physio_practitioners p join public.physio_organisations o on o.id=p.organisation_id where p.is_active and o.is_active),'[]'));
end $$;
revoke all on function public.physio_contact_directory() from public;
grant execute on function public.physio_contact_directory() to authenticated;

-- Today's expected physiotherapy (active plans) — Guest, room, therapist name and window times. No fees.
create or replace function public.physio_today_contacts(p_date date default null) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare d date:=coalesce(p_date,(now() at time zone 'Asia/Kolkata')::date);
begin
 if not public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver','STD']) then raise exception 'Staff access required';end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
   'plan_id',pl.id,'patient_id',pa.id,'guest',concat_ws(' ',pa.title,pa.full_name),'room',concat_ws('-',pa.room_no,pa.bed_no),
   'physiotherapist_name',pl.physiotherapist_name,'frequency',pl.frequency,'session_times',to_jsonb(pl.session_times),'preferred_time',pl.preferred_time,
   'last_organisation_id',(select s.organisation_id from public.physiotherapy_sessions s where coalesce(s.plan_id,s.order_id)=pl.id and s.organisation_id is not null order by s.session_date desc,s.created_at desc limit 1),
   'last_practitioner_id',(select s.practitioner_id from public.physiotherapy_sessions s where coalesce(s.plan_id,s.order_id)=pl.id and s.practitioner_id is not null order by s.session_date desc,s.created_at desc limit 1),
   'last_physiotherapist',(select s.physiotherapist_name from public.physiotherapy_sessions s where coalesce(s.plan_id,s.order_id)=pl.id and nullif(trim(s.physiotherapist_name),'') is not null order by s.session_date desc,s.created_at desc limit 1)
  ) order by pa.room_no,pa.full_name)
  from public.physiotherapy_plans pl join public.patients pa on pa.id=pl.patient_id
  where coalesce(pl.is_active,true) and coalesce(pl.start_date,d)<=d and (pl.end_date is null or pl.end_date>=d)
    and pa.is_active is distinct from false and pa.admission_status is distinct from 'Discharged'),'[]');
end $$;
revoke all on function public.physio_today_contacts(date) from public;
grant execute on function public.physio_today_contacts(date) to authenticated;

-- Numbers given by the Director on 25-10-2026 ("Dr." / spaces / dots ignored when matching names).
do $$
declare r record; n int; missing text:='';
begin
 for r in select * from (values ('lukkyshkumar','7305918945'),('hemavathi','9344674273'),('anisha','7010200016')) v(norm,phone) loop
  update public.physio_practitioners set phone=r.phone
   where is_active and regexp_replace(lower(regexp_replace(full_name,'^\s*dr\.?\s*','','i')),'[^a-z]','','g')=r.norm;
  get diagnostics n=row_count;
  if n=0 then missing:=missing||' '||r.norm;end if;
 end loop;
 update public.physio_organisations set phone='9840115962',updated_at=now() where lower(name) like 'vinayaga%';
 get diagnostics n=row_count;
 if n=0 then missing:=missing||' vinayaga-physio-point';end if;
 if missing<>'' then raise notice 'Not found (add them in Physiotherapy → Therapist Accounts with the phone number):%',missing;
 else raise notice 'All four phone numbers saved.';end if;
end $$;

commit;
notify pgrst,'reload schema';

-- Check (optional): who has a number now
-- select o.name organisation,o.phone desk,p.full_name,p.phone from public.physio_organisations o left join public.physio_practitioners p on p.organisation_id=o.id and p.is_active where o.is_active order by 1,3;
