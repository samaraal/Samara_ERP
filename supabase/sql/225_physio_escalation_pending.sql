begin;
create or replace function public.physio_due_slots()
returns table(plan_id uuid,patient_id uuid,due_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 with clock as(select (now() at time zone 'Asia/Kolkata')::date as today)
 select pp.id,pp.patient_id,((slot.day+slot.at_time) at time zone 'Asia/Kolkata')::timestamptz
 from public.physiotherapy_plans pp join public.patients p on p.id=pp.patient_id cross join clock c
 cross join lateral(select case when btrim(coalesce(pp.preferred_time::text,'')) ~* '^\d{1,2}:\d{2}(:\d{2})?(\s*(AM|PM))?$' then btrim(pp.preferred_time::text)::time else time '10:00' end as pt) ptx
 cross join lateral(
   select x.session_date as day,coalesce(x.scheduled_time,ptx.pt) as at_time from public.physiotherapy_sessions x
   where (x.plan_id=pp.id or x.order_id=pp.id) and x.status='Pending' and x.session_date<=c.today
   union all select c.today,ptx.pt
   where not exists(select 1 from public.physiotherapy_sessions x where (x.plan_id=pp.id or x.order_id=pp.id) and x.session_date=c.today)
   and not exists(select 1 from public.physiotherapy_corrections r join public.physiotherapy_sessions x on x.id=r.session_id
     where r.state in ('Applying','Approved') and r.action='Reschedule' and (r.original->>'session_date')::date=c.today
     and (x.plan_id=pp.id or x.order_id=pp.id) and x.session_date>c.today)
 ) slot
 where pp.is_active=true and p.is_active=true and coalesce(p.admission_status,'Active')<>'Discharged'
 and (p.admission_date<>c.today or p.admission_date is null or ((slot.day+slot.at_time) at time zone 'Asia/Kolkata')>=((p.admission_date+coalesce(p.admission_time,(p.created_at at time zone 'Asia/Kolkata')::time)) at time zone 'Asia/Kolkata'));
$$;
revoke all on function public.physio_due_slots() from public,authenticated;

create or replace function public.sync_physio_escalations(p_plan uuid default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.clinical_alert_escalations e set resolved_at=now(),resolved_by=(select p.id from public.profiles p where p.id=auth.uid() or p.auth_user_id=auth.uid() limit 1),
 resolution_action='Physiotherapy schedule/outcome updated',resolution_remarks='Automatically closed: this scheduled slot is completed, not done, rescheduled or no longer active.'
 where e.alert_type='Physiotherapy' and e.resolved_at is null and (p_plan is null or e.source_id=p_plan)
 and not exists(select 1 from public.physio_due_slots() slot where slot.plan_id=e.source_id and slot.due_at=e.due_at);
end $$;
revoke all on function public.sync_physio_escalations(uuid) from public,authenticated;

create or replace function public.reopen_physio_escalation(p_plan uuid,p_due timestamptz) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare e public.clinical_alert_escalations%rowtype;
begin
 for e in select * from public.clinical_alert_escalations where alert_type='Physiotherapy' and source_id=p_plan and due_at=p_due and resolved_at is not null and resolution_action in ('Physiotherapy schedule/outcome updated','Completed') for update loop
   perform public.record_audit_event('Physiotherapy Escalation Reopened','Clinical Escalations',e.id::text,jsonb_build_object('previous',to_jsonb(e)),'Success');
   update public.clinical_alert_escalations set resolved_at=null,resolved_by=null,resolution_action=null,resolution_remarks=null where id=e.id;
 end loop;
end $$;
revoke all on function public.reopen_physio_escalation(uuid,timestamptz) from public,authenticated;

create or replace function public.physio_escalation_session_sync() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare plan uuid;
begin
 plan:=case when tg_op='DELETE' then coalesce(old.plan_id,old.order_id) else coalesce(new.plan_id,new.order_id) end;
 perform public.sync_physio_escalations(plan);
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function public.physio_escalation_session_sync() from public,authenticated;
drop trigger if exists physio_escalation_session_sync on public.physiotherapy_sessions;
create trigger physio_escalation_session_sync after insert or update or delete on public.physiotherapy_sessions for each row execute function public.physio_escalation_session_sync();
-- Replace only the Physiotherapy CTE in the deployed alert function.
-- Medication, vitals, care, acknowledgement and escalation rules are preserved.
do $patch$
declare olddef text; updated text; firstpos int; lastpos int; block text:=$cte$phy as(
   select 'Physiotherapy'::text,pp.id,pp.patient_id,p.full_name,
     concat('Room ',coalesce(p.room_no,'—'),case when p.bed_no is not null then '-'||p.bed_no else '' end),
     concat('Physiotherapy Due: ',pp.therapy_type),coalesce(pp.precautions,''),slot.due_at,
     greatest(0,floor(extract(epoch from(v_now-slot.due_at))/60))::int,
     case when v_now>slot.due_at then 'Urgent' else 'Routine' end,
     'Active'::text,'Physiotherapy'::text,concat('Physiotherapy is due for ',p.full_name)
   from public.physiotherapy_plans pp join pb p on p.id=pp.patient_id
   join public.physio_due_slots() slot on slot.plan_id=pp.id
   where slot.due_at<=v_now+interval '10 minutes'
 )$cte$;
begin
 olddef:=pg_get_functiondef('public.get_current_clinical_alerts()'::regprocedure);
 firstpos:=strpos(olddef,'phy as(');
 if firstpos=0 then raise exception 'Physiotherapy alert block not found; no alert function changed';end if;
 lastpos:=strpos(substr(olddef,firstpos),'), allx(');
 if lastpos=0 then raise exception 'Alert block boundary not found; no alert function changed';end if;
 lastpos:=firstpos+lastpos-1;
 updated:=left(olddef,firstpos-1)||block||substr(olddef,lastpos+1);
 execute updated;
end $patch$;

-- Keep automatic escalation history in step with changed clinical slots.
do $patch$
declare definition text; looptext text:='for a in select * from public.get_current_clinical_alerts() loop'; inserttext text:='insert into public.clinical_alert_escalations(';
begin
 definition:=pg_get_functiondef('public.process_clinical_alert_escalations()'::regprocedure);
 if strpos(definition,'-- Physiotherapy escalation lifecycle')=0 then
   if strpos(definition,looptext)=0 or strpos(definition,inserttext)=0 then raise exception 'Escalation processor boundary not found; no processor changed';end if;
   definition:=replace(definition,looptext,'-- Physiotherapy escalation lifecycle'||chr(10)||'perform public.sync_physio_escalations(null);'||chr(10)||looptext);
   definition:=replace(definition,inserttext,'if a.alert_type=''Physiotherapy'' then perform public.reopen_physio_escalation(a.source_id,a.due_at);end if;'||chr(10)||inserttext);
   execute definition;
 end if;
end $patch$;
commit;
notify pgrst,'reload schema';
select strpos(pg_get_functiondef('public.get_current_clinical_alerts()'::regprocedure),'physio_due_slots')>0 as pending_escalation_ready;

