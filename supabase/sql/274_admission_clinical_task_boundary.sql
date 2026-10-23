-- Samara Care ERP 2.18.74 — same-day clinical tasks start at the admission time.
-- Apply in Supabase SQL Editor after migration 272.
-- A pre-admission care reminder must not start an alert or escalation during the new stay.

begin;

-- Daily Care alerts are due at their reminder time. The old check compared admission against
-- the later escalation threshold, allowing a morning task to become overdue after an afternoon admission.
do $patch$
declare
  def text;
  old_gate constant text := 'and (p.admission_boundary is null or p.admission_boundary<w.esc_at-interval ''30 minutes'')';
  new_gate constant text := 'and (p.admission_boundary is null or p.admission_boundary<=w.remind_at)';
begin
  def := pg_get_functiondef('public.get_current_clinical_alerts()'::regprocedure);
  if position(new_gate in def)>0 then
    raise notice 'Admission-time Daily Care alert gate already installed.';
    return;
  end if;
  if (length(def)-length(replace(def,old_gate,'')))/length(old_gate)<>1 then
    raise exception 'Expected one Daily Care admission gate in get_current_clinical_alerts; no function changed.';
  end if;
  execute replace(def,old_gate,new_gate);
end $patch$;

-- Do not leave an open escalation for a task whose due time predates the active admission.
-- The escalation processor runs this cleanup before returning, including for rows already registered.
do $patch$
declare
  def text;
  marker constant text := '-- 2.18.74 admission boundary cleanup';
  anchor constant text := 'return jsonb_build_object(''success'',true,''processed'',n,';
  cleanup constant text := $sql$update public.clinical_alert_escalations e
     set resolved_at=now(), resolution_action='Not applicable before admission',
         resolution_remarks='Automatically closed: the scheduled clinical task was before the admission time.', updated_at=now()
    from public.patients p
   where e.patient_id=p.id and e.resolved_at is null
     and e.alert_type in ('Medication','Vital Signs','Daily Care','Physiotherapy','Meal')
     and (e.due_at at time zone 'Asia/Kolkata')::date=p.admission_date
     and e.due_at < ((p.admission_date+coalesce(p.admission_time,(p.created_at at time zone 'Asia/Kolkata')::time)) at time zone 'Asia/Kolkata');
$sql$;
begin
  def := pg_get_functiondef('public.process_clinical_alert_escalations()'::regprocedure);
  if position(marker in def)>0 then
    raise notice 'Admission-time escalation cleanup already installed.';
    return;
  end if;
  if (length(def)-length(replace(def,anchor,'')))/length(anchor)<>1 then
    raise exception 'Escalation processor return point was not found exactly once; no function changed.';
  end if;
  def := replace(def,anchor,cleanup||marker||chr(10)||anchor);
  execute def;
end $patch$;

commit;
notify pgrst,'reload schema';

select
  strpos(pg_get_functiondef('public.get_current_clinical_alerts()'::regprocedure),'p.admission_boundary<=w.remind_at')>0 as daily_care_admission_gate_ready,
  strpos(pg_get_functiondef('public.process_clinical_alert_escalations()'::regprocedure),'2.18.74 admission boundary cleanup')>0 as old_escalations_auto_close_ready;
