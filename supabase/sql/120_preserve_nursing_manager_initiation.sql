begin;
-- Preserve the existing Manager initiation right unless that person is Director.
-- Admin/Director remain approvers; final departure remains nursing-only.
create or replace function public.enforce_discharge_initiator()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare allowed boolean; nursing_final boolean;
begin
 select exists(select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and coalesce(p.is_active,true) and p.role in ('Nurse','Manager')
 and not exists(select 1 from public.director_office_positions d where d.position_key='director' and d.assigned_profile_id=p.id)) into allowed;
 select allowed and exists(select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and p.role='Nurse') into nursing_final;
 if tg_op='INSERT' then
   if not allowed then raise exception 'Only nursing staff or the Nursing Manager may initiate discharge. Admin/Director may review and approve.';end if;
   if new.status<>'Initiated' or coalesce(new.management_status,'Pending')<>'Pending' or coalesce(new.accounts_status,'Pending')<>'Pending' then raise exception 'Discharge must start with the existing approval workflow';end if;
 elsif new.status='Completed' and old.status is distinct from 'Completed' then
   if not nursing_final then raise exception 'Final departure must be confirmed by nursing staff after accounts clearance';end if;
   if new.management_status<>'Approved' or new.accounts_status<>'Cleared' then raise exception 'Management approval and accounts clearance are required before departure';end if;
 elsif (new.status='Initiated' and old.status is distinct from new.status) or
       (new.management_status='Pending' and old.management_status is distinct from new.management_status) then
   if not allowed then raise exception 'Only nursing staff or the Nursing Manager may re-initiate discharge';end if;
 end if;
 return new;
end $$;
commit;
