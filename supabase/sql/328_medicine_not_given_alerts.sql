-- 2.19.27 (31-10-2026): a dose recorded as "Not Given" (SQL 327) stops the Medicine Due alert, and the
-- Nursing Manager gets a one-time FOR INFORMATION alert (like "Medicine Given Late").
-- Found 31-10-2026: Mrs. Shanthi T — INJ. Lantus 10 PM recorded Not Given (medicine not provided by the family),
-- but the "Medicine Due" alert kept coming because the alert list did not know the new status.
-- A. get_current_clinical_alerts(): "Not Given" counts as a recorded dose (also for rescheduled doses).
-- B. Trigger: a Not Given dose → Clinical Escalations item "Medicine Not Given" for the Manager (Nursing Manager),
--    closed there with remarks; drops off the live list after 24 hours. No WhatsApp, no repeat.
-- C. get_current_clinical_alerts(): shows open "Medicine Not Given" items (overdue 0 → no escalation stages).
-- Safe to run more than once.

begin;

-- A
do $a$
declare def text; n int;
begin
  def := pg_get_functiondef('public.get_current_clinical_alerts()'::regprocedure);
  if position('''Delayed'',''Not Given'')' in def) > 0 then raise notice 'A: already done'; return; end if;
  n := (length(def)-length(replace(def,'''Delayed'')','')))/length('''Delayed'')');
  raise notice 'A: adding Not Given to % status list(s)', n;
  execute replace(def, '''Delayed'')', '''Delayed'',''Not Given'')');
end $a$;

-- B
create or replace function public.samara_med_not_given_alert()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_med text; v_key text := concat('Medicine Not Given:',new.id);
begin
  if coalesce(new.status,'') <> 'Not Given' then
    update public.clinical_alert_escalations set resolved_at=now(), resolution_action='Corrected',
           resolution_remarks='Automatically closed: the dose is no longer recorded as Not Given.'
     where alert_type='Medicine Not Given' and source_id=new.id and resolved_at is null;
    return new;
  end if;
  if tg_op='UPDATE' and old.status='Not Given' and old.not_given_reason is not distinct from new.not_given_reason then return new; end if;
  select concat_ws(' ',mo.medicine_name,nullif(btrim(coalesce(mo.strength,'')),'')) into v_med
    from public.medication_orders mo where mo.id=new.order_id;
  insert into public.clinical_alert_escalations(alert_key,patient_id,alert_type,source_id,due_at,priority,escalated_to_role,escalation_reason)
  values(v_key,new.patient_id,'Medicine Not Given',new.id,now(),'Urgent','Manager',
    concat(coalesce(v_med,'Medicine'),' (',to_char(new.scheduled_time::time,'HH12:MI AM'),') not given — ',
           coalesce(nullif(btrim(new.not_given_reason),''),nullif(btrim(new.remarks),''),'reason not entered')))
  on conflict (alert_key) do update set resolved_at=null, resolution_action=null, resolution_remarks=null,
        due_at=excluded.due_at, escalation_reason=excluded.escalation_reason;
  return new;
end $$;
revoke all on function public.samara_med_not_given_alert() from public, anon, authenticated;
drop trigger if exists samara_med_not_given_alert on public.medication_administrations;
create trigger samara_med_not_given_alert after insert or update of status, not_given_reason on public.medication_administrations
for each row execute function public.samara_med_not_given_alert();

-- C
do $c$
declare def text; updated text;
  marker constant text := '/* 2.19.27 medicine not given */';
  boundary constant text := '), allx(';
  union_old constant text := 'union all select * from medlate';
  block text := $cte$), mednotgiven as( /* 2.19.27 medicine not given */
   select 'Medicine Not Given'::text,ma.id,ma.patient_id,p.full_name,
     concat('Room ',coalesce(p.room_no,'—'),case when p.bed_no is not null then '-'||p.bed_no else '' end),
     concat('Medicine Not Given: ',coalesce(mo.medicine_name,'Medicine')),
     e.escalation_reason,
     e.due_at,
     0,
     'Urgent'::text,
     'Active'::text,'Medicines'::text,concat('Medicine not given for ',p.full_name,'. Please review.')
   from public.clinical_alert_escalations e
   join public.medication_administrations ma on ma.id=e.source_id
   left join public.medication_orders mo on mo.id=ma.order_id
   join pb p on p.id=ma.patient_id
   where e.alert_type='Medicine Not Given' and e.resolved_at is null and e.due_at>v_now-interval '24 hours'
 $cte$;
begin
  def := pg_get_functiondef('public.get_current_clinical_alerts()'::regprocedure);
  if position(marker in def) > 0 then raise notice 'C: already done'; return; end if;
  if (length(def)-length(replace(def,boundary,'')))/length(boundary) <> 1 then raise exception 'C: boundary not found once — nothing changed'; end if;
  if (length(def)-length(replace(def,union_old,'')))/length(union_old) <> 1 then raise exception 'C: medlate union not found once — nothing changed'; end if;
  updated := replace(def, boundary, block || boundary);
  updated := replace(updated, union_old, union_old || ' union all select * from mednotgiven');
  execute updated;
end $c$;

-- today's Not Given doses recorded before this update → inform the Nursing Manager now
insert into public.clinical_alert_escalations(alert_key,patient_id,alert_type,source_id,due_at,priority,escalated_to_role,escalation_reason)
select concat('Medicine Not Given:',a.id),a.patient_id,'Medicine Not Given',a.id,now(),'Urgent','Manager',
       concat(concat_ws(' ',mo.medicine_name,nullif(btrim(coalesce(mo.strength,'')),'')),' (',to_char(a.scheduled_time::time,'HH12:MI AM'),') not given — ',
              coalesce(nullif(btrim(a.not_given_reason),''),nullif(btrim(a.remarks),''),'reason not entered'))
  from public.medication_administrations a left join public.medication_orders mo on mo.id=a.order_id
 where a.status='Not Given' and a.scheduled_date >= (now() at time zone 'Asia/Kolkata')::date - 1
on conflict (alert_key) do nothing;

notify pgrst, 'reload schema';
commit;

select position('''Not Given''' in pg_get_functiondef('public.get_current_clinical_alerts()'::regprocedure))>0 as alerts_know_not_given,
       (select count(*) from public.clinical_alert_escalations where alert_type='Medicine Not Given' and resolved_at is null) as open_not_given_info;
