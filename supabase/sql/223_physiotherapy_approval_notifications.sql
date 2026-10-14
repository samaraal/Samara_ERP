begin;
create or replace function public.physiotherapy_correction_alerts()
returns table(request_id uuid,action text,reason text,patient_name text,session_date date,requested_at timestamptz,requested_by_name text)
language sql stable security definer set search_path=public,pg_temp as $$
 select r.id,r.action,r.reason,
   coalesce(nullif(concat_ws(' ',p.title,p.full_name),''),'Patient'),
   (r.original->>'session_date')::date,r.requested_at,
   coalesce(staff.full_name,'Care team')
 from public.physiotherapy_corrections r
 left join public.patients p on p.id=(r.original->>'patient_id')::uuid
 left join lateral (select pr.full_name from public.profiles pr where pr.id=r.requested_by or pr.auth_user_id=r.requested_by limit 1) staff on true
 where public.physiotherapy_can_review() and r.state='Pending' and r.requested_by<>auth.uid()
 order by r.requested_at;
$$;
revoke all on function public.physiotherapy_correction_alerts() from public;
grant execute on function public.physiotherapy_correction_alerts() to authenticated;
commit;
notify pgrst,'reload schema';
select to_regprocedure('public.physiotherapy_correction_alerts()') is not null as notification_alerts_ready;
