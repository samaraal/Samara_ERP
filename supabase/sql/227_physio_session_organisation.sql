begin;
alter table public.physiotherapy_sessions add column if not exists organisation_id uuid references public.physio_organisations(id);
insert into public.physio_organisations(name) values('Vinayaga Physio Point') on conflict do nothing;
-- Expose only active organisation IDs/names to clinical staff; financial tables remain Admin-only.
create or replace function public.physio_organisation_options() returns table(id uuid,name text)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not public.current_user_has_role(array['Admin','Nurse','Caregiver','Manager']) then raise exception 'Clinical staff access required';end if;
 return query select o.id,o.name from public.physio_organisations o where o.is_active order by o.name;
end $$;
revoke all on function public.physio_organisation_options() from public;
grant execute on function public.physio_organisation_options() to authenticated;
create or replace function public.guard_physiotherapy_correction() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' then
   if (to_jsonb(new)-array['billable','billing_rate','charge_request_id','updated_at'])=(to_jsonb(old)-array['billable','billing_rate','charge_request_id','updated_at']) then return new;end if;
   -- Recording an actual outcome for a planned Pending session is routine care.
   if old.status='Pending' and old.session_at is null and new.status in ('Completed','Not Done')
      and new.session_date<=(now() at time zone 'Asia/Kolkata')::date
      and (new.status<>'Completed' or new.session_at is not null)
      and public.current_user_has_role(array['Nurse','Caregiver','Admin','Manager'])
      and (to_jsonb(new)-array['status','session_at','performed_by','reason','notes','updated_at','organisation_id','physiotherapist_name'])=(to_jsonb(old)-array['status','session_at','performed_by','reason','notes','updated_at','organisation_id','physiotherapist_name']) then return new;end if;
 end if;
 if auth.uid() is null or not public.physiotherapy_can_review() or not exists(
 select 1 from public.physiotherapy_corrections where session_id=old.id and state='Applying' and reviewed_by=auth.uid()) then
 raise exception 'Existing sessions require a correction request and Nursing Manager/Admin approval';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;

create or replace function public.guard_physio_supplier_fee() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' then
   if new.status='Completed' and new.session_date=old.session_date and new.patient_id=old.patient_id and new.physiotherapist_name is not distinct from old.physiotherapist_name and new.organisation_id is not distinct from old.organisation_id then return new;end if;
 end if;
 if exists(select 1 from public.physio_supplier_ledger where session_id=old.id and kind='Session fee' and reversed_at is null) then raise exception 'Admin must reverse the posted physiotherapist fee before changing or deleting this session';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;

create or replace function public.physio_session_counts(p_from date,p_to date)
returns table(organisation_name text,physiotherapist_name text,completed bigint,pending bigint,not_done bigint)
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not public.current_user_has_role(array['Admin','Nurse','Caregiver','Manager']) then raise exception 'Clinical staff access required';end if;
 if p_from is null or p_to is null or p_from>p_to then raise exception 'Invalid period';end if;
 return query select coalesce(f.snapshot->>'organisation',o.name,nullif(trim(s.physiotherapist_name),''),nullif(trim(pp.physiotherapist_name),''),'Unassigned')::text,
 coalesce(f.snapshot->>'physiotherapist',case when s.organisation_id is not null then nullif(trim(s.physiotherapist_name),'') end,'Not recorded')::text,
 count(*) filter(where s.status='Completed'),count(*) filter(where s.status='Pending'),count(*) filter(where s.status='Not Done')
 from public.physiotherapy_sessions s left join public.physiotherapy_plans pp on pp.id=coalesce(s.plan_id,s.order_id)
 left join public.physio_organisations o on o.id=s.organisation_id
 left join public.physio_supplier_ledger f on f.session_id=s.id and f.kind='Session fee' and f.reversed_at is null
 where s.session_date between p_from and p_to group by 1,2 order by 1,2;
end $$;


create or replace function public.physio_accounts(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare org public.physio_organisations%rowtype; practitioner public.physio_practitioners%rowtype;
 s public.physiotherapy_sessions%rowtype; entry public.physio_supplier_ledger%rowtype;
 oid uuid; pid uuid; sid uuid; eid uuid; key uuid; value numeric(12,2); day date; firstday date; lastday date;
 snapshot jsonb; method text;
begin
 if not public.current_user_has_role(array['Admin']) then raise exception 'Admin-only physiotherapy accounts';end if;
 oid:=nullif(p_data->>'organisation_id','')::uuid;
 if p_action='load' then
   firstday:=coalesce((p_data->>'from')::date,date_trunc('month',now() at time zone 'Asia/Kolkata')::date);
   lastday:=coalesce((p_data->>'to')::date,(now() at time zone 'Asia/Kolkata')::date);
   if firstday>lastday then raise exception 'Invalid period';end if;
   return jsonb_build_object(
     'organisations',coalesce((select jsonb_agg(to_jsonb(o) order by o.name) from public.physio_organisations o),'[]'),
     'practitioners',coalesce((select jsonb_agg(to_jsonb(p) order by p.full_name) from public.physio_practitioners p where p.organisation_id=oid),'[]'),
     'opening',coalesce((select sum(l.amount) from public.physio_supplier_ledger l where l.organisation_id=oid and l.entry_date<firstday),0),
     'balance',coalesce((select sum(l.amount) from public.physio_supplier_ledger l where l.organisation_id=oid),0),
     'entries',coalesce((select jsonb_agg(to_jsonb(l) order by l.entry_date,l.voucher_number) from public.physio_supplier_ledger l where l.organisation_id=oid and l.entry_date between firstday and lastday),'[]'),
     'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'date',x.session_date,'time',x.scheduled_time,'physiotherapy_name',coalesce(o.name,x.physiotherapist_name),'physiotherapist_name',x.physiotherapist_name,'patient_name',concat_ws(' ',p.title,p.full_name),'resident_id',p.patient_id,'room',concat_ws('-',p.room_no,p.bed_no),'notes',x.notes) order by x.session_date,x.created_at)
       from public.physiotherapy_sessions x join public.patients p on p.id=x.patient_id
       join public.physio_organisations o on o.id=oid
       where x.status='Completed' and x.session_date between firstday and lastday
       and (x.organisation_id=oid or (x.organisation_id is null and (lower(trim(coalesce(x.physiotherapist_name,'')))=lower(trim(o.name)) or exists(select 1 from public.physio_practitioners pr where pr.organisation_id=oid and lower(trim(pr.full_name))=lower(trim(coalesce(x.physiotherapist_name,'')))))))
       and not exists(select 1 from public.physio_supplier_ledger l where l.session_id=x.id and l.kind='Session fee' and l.reversed_at is null)),'[]'));
 end if;
 if p_action='save_organisation' then
   oid:=coalesce(oid,gen_random_uuid());value:=coalesce((p_data->>'default_fee')::numeric,0);
   if nullif(trim(p_data->>'name'),'') is null or value<0 then raise exception 'Organisation name and non-negative rate required';end if;
   select * into org from public.physio_organisations where id=oid for update;
   if found then
     if org.name<>trim(p_data->>'name') and exists(select 1 from public.physio_supplier_ledger where organisation_id=oid) then raise exception 'Keep the organisation name once ledger entries exist';end if;
     update public.physio_organisations set name=trim(p_data->>'name'),contact_person=p_data->>'contact_person',phone=p_data->>'phone',email=p_data->>'email',address=p_data->>'address',gst_number=p_data->>'gst_number',payment_terms=p_data->>'payment_terms',default_fee=value,is_active=coalesce((p_data->>'is_active')::boolean,true),updated_at=now() where id=oid;
   else
     insert into public.physio_organisations(id,name,contact_person,phone,email,address,gst_number,payment_terms,default_fee,is_active)
     values(oid,trim(p_data->>'name'),p_data->>'contact_person',p_data->>'phone',p_data->>'email',p_data->>'address',p_data->>'gst_number',p_data->>'payment_terms',value,coalesce((p_data->>'is_active')::boolean,true));
     value:=coalesce((p_data->>'opening_amount')::numeric,0);
     if value<>0 then
       day:=coalesce((p_data->>'opening_date')::date,(now() at time zone 'Asia/Kolkata')::date);
       if day>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Opening balance date cannot be future';end if;
       insert into public.physio_supplier_ledger(organisation_id,entry_date,kind,amount,notes,created_by,request_key,request_data)
       values(oid,day,'Opening',value,'Opening balance',auth.uid(),oid,p_data);
     end if;
   end if;
   perform public.record_audit_event('Physiotherapy Organisation Saved','Physiotherapy Accounts',oid::text,p_data,'Success');
   return jsonb_build_object('id',oid);
 end if;
 select * into org from public.physio_organisations where id=oid for update;
 if not found then raise exception 'Select an organisation';end if;
 if p_action='save_practitioner' then
   pid:=coalesce(nullif(p_data->>'id','')::uuid,gen_random_uuid());
   if nullif(trim(p_data->>'full_name'),'') is null then raise exception 'Physiotherapist name required';end if;
   if exists(select 1 from public.physio_practitioners where id=pid and organisation_id<>oid) then raise exception 'Physiotherapist belongs to another organisation';end if;
   if exists(select 1 from public.physio_supplier_ledger where practitioner_id=pid) and exists(select 1 from public.physio_practitioners where id=pid and full_name<>trim(p_data->>'full_name')) then raise exception 'Keep the name once fees exist';end if;
   insert into public.physio_practitioners(id,organisation_id,full_name,phone,qualification,is_active)
   values(pid,oid,trim(p_data->>'full_name'),p_data->>'phone',p_data->>'qualification',coalesce((p_data->>'is_active')::boolean,true))
   on conflict(id) do update set full_name=excluded.full_name,phone=excluded.phone,qualification=excluded.qualification,is_active=excluded.is_active;
   perform public.record_audit_event('Physiotherapist Saved','Physiotherapy Accounts',pid::text,p_data,'Success');return jsonb_build_object('id',pid);
 end if;
 key:=nullif(p_data->>'request_key','')::uuid;if key is null then raise exception 'Request key required';end if;
 select * into entry from public.physio_supplier_ledger where request_key=key;
 if found then
   if entry.request_data<>p_data or entry.kind<>(case p_action when 'post_fee' then 'Session fee' when 'payment' then 'Payment' when 'refund' then 'Refund' when 'reverse' then 'Reversal' else '' end) then raise exception 'This request already recorded different details. Reload before making another entry';end if;
   return jsonb_build_object('id',entry.id,'voucher',entry.voucher_number,'already_recorded',true);
 end if;
 if p_action='post_fee' then
   if not org.is_active then raise exception 'Organisation inactive';end if;
   pid:=nullif(p_data->>'practitioner_id','')::uuid;sid:=nullif(p_data->>'session_id','')::uuid;
   select * into practitioner from public.physio_practitioners where id=pid and organisation_id=oid and is_active;
   if not found then raise exception 'Select the attending physiotherapist';end if;
   select * into s from public.physiotherapy_sessions where id=sid for update;
   if not found or s.status<>'Completed' or s.session_date>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Only actual completed sessions can be charged';end if;
   if (s.organisation_id is not null and s.organisation_id<>oid) or (s.organisation_id is null and lower(trim(coalesce(s.physiotherapist_name,''))) not in (lower(trim(org.name)),lower(trim(practitioner.full_name)))) then raise exception 'Session organisation/physiotherapist does not match';end if;
   value:=(p_data->>'rate')::numeric;if value is null or value<=0 then raise exception 'Enter a positive per-session fee';end if;
   select jsonb_build_object('organisation',org.name,'physiotherapist',practitioner.full_name,'patient_id',p.id,'patient_name',concat_ws(' ',p.title,p.full_name),'resident_id',p.patient_id,'room',concat_ws('-',p.room_no,p.bed_no),'session_date',s.session_date,'session_time',s.scheduled_time,'notes',s.notes) into snapshot from public.patients p where p.id=s.patient_id;
   insert into public.physio_supplier_ledger(organisation_id,practitioner_id,session_id,entry_date,kind,amount,rate,snapshot,created_by,request_key,request_data,notes)
   values(oid,pid,sid,s.session_date,'Session fee',value,value,snapshot,auth.uid(),key,p_data,p_data->>'notes') returning id into eid;
 elsif p_action in ('payment','refund') then
   value:=(p_data->>'amount')::numeric;day:=(p_data->>'entry_date')::date;method:=p_data->>'method';
   if value is null or value<=0 or day is null or day>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Enter positive amount and actual payment date';end if;
   if method is null or method not in ('Bank transfer','UPI','Cheque','Cash','Other') then raise exception 'Select payment method';end if;
   if method='Cash' and nullif(trim(p_data->>'recipient'),'') is null then raise exception 'Enter cash recipient/payer';end if;
   if method<>'Cash' and nullif(trim(p_data->>'reference'),'') is null then raise exception 'Enter transaction reference';end if;
   insert into public.physio_supplier_ledger(organisation_id,entry_date,kind,amount,method,reference,recipient,notes,snapshot,created_by,request_key,request_data)
   values(oid,day,case when p_action='payment' then 'Payment' else 'Refund' end,case when p_action='payment' then -value else value end,method,p_data->>'reference',p_data->>'recipient',p_data->>'notes',jsonb_build_object('organisation',org.name),auth.uid(),key,p_data) returning id into eid;
 elsif p_action='reverse' then
   select * into entry from public.physio_supplier_ledger where id=(p_data->>'entry_id')::uuid and organisation_id=oid for update;
   if not found or entry.kind='Reversal' or entry.reversed_at is not null then raise exception 'Entry unavailable or already reversed';end if;
   if nullif(trim(p_data->>'reason'),'') is null then raise exception 'Reversal reason required';end if;
   insert into public.physio_supplier_ledger(organisation_id,practitioner_id,session_id,entry_date,kind,amount,notes,snapshot,reverses,created_by,request_key,request_data)
   values(oid,entry.practitioner_id,entry.session_id,(now() at time zone 'Asia/Kolkata')::date,'Reversal',-entry.amount,p_data->>'reason',entry.snapshot,entry.id,auth.uid(),key,p_data) returning id into eid;
   update public.physio_supplier_ledger set reversed_at=now(),reversed_by=auth.uid() where id=entry.id;
 else raise exception 'Unknown account action';end if;
 perform public.record_audit_event('Physiotherapy Account '||p_action,'Physiotherapy Accounts',eid::text,p_data,'Success');
 return (select jsonb_build_object('id',l.id,'voucher',l.voucher_number) from public.physio_supplier_ledger l where l.id=eid);
end $$;


-- Approved Modify requests can correct provider details while preserving older requests.
do $$ declare def text;begin
 def:=pg_get_functiondef('public.review_physiotherapy_correction(uuid,boolean,text)'::regprocedure);
 if strpos(def,'-- Provider correction fields')=0 then
 if strpos(def,'reason=r.reason, notes=')=0 then raise exception 'Review function boundary missing';end if;
 def:=replace(def,'reason=r.reason, notes=','-- Provider correction fields'||chr(10)||'organisation_id=case when r.action=''Modify'' and r.proposed ? ''organisation_id'' then nullif(r.proposed->>''organisation_id'','''')::uuid else s.organisation_id end, physiotherapist_name=case when r.action=''Modify'' and r.proposed ? ''physiotherapist_name'' then nullif(trim(r.proposed->>''physiotherapist_name''),'''') else s.physiotherapist_name end, reason=r.reason, notes=');
 execute def;end if;end $$;
create or replace function public.validate_physio_session_provider() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.organisation_id is not null then
   if tg_op='INSERT' or new.organisation_id is distinct from old.organisation_id then
     if not exists(select 1 from public.physio_organisations o where o.id=new.organisation_id and o.is_active) then raise exception 'Choose an active physiotherapy organisation';end if;
   end if;
   if new.status='Completed' and nullif(trim(new.physiotherapist_name),'') is null then raise exception 'Enter the attending physiotherapist name';end if;
 end if;
 return new;
end $$;
revoke all on function public.validate_physio_session_provider() from public;
drop trigger if exists physio_session_provider_validation on public.physiotherapy_sessions;
create trigger physio_session_provider_validation before insert or update on public.physiotherapy_sessions for each row execute function public.validate_physio_session_provider();
commit;
notify pgrst,'reload schema';
select 'Organisation dropdown ready' as result;
