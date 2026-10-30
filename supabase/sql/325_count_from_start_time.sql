-- 2.19.21 (31-10-2026): count medicines and care only from the moment they start.
-- Rule (Admin): if a Guest is admitted, or a medicine is added / changed after a doctor review, at 12:30 PM,
-- nothing scheduled before 12:30 PM that day is due, late or missed.
--
-- Found on 30-10-2026 (Mr. S. Swaminathan): a doctor review was effective 10:02 PM and saved 10:11 PM. The nurse
-- gave the first doses at 10:11–10:13 PM, but the Administer form had pre-picked the morning times (09:00, 10:00,
-- 2:00 PM), so the doses were saved as "13 hours late" and alerted the Nursing Manager.
--
-- A. public.samara_med_order_start(): when a medicine starts counting — its Effective From time; for a medicine
--    added / changed by a doctor review, not before the moment the review was saved (no back-dated slots).
-- B. Live alerts: medicine slots before that start are not due (was: Effective From only).
-- C. Live alerts: a care item added part-way through a shift is not reminded / escalated for that shift's
--    deadline if it was added after the reminder time (was: admission time only).
-- D. Guard: a dose cannot be saved against a time before the medicine started (clear message for old screens).
-- E. Data: the 4 doses of 30-10-2026 are moved to the time they were really given (first doses), the
--    "given late" reason is cleared, and their "Medicine Late" alerts close automatically (trigger, SQL 276).
-- Safe to run more than once.

begin;

-- A
create or replace function public.samara_med_order_start(p_effective timestamptz, p_created timestamptz, p_action text)
returns timestamptz language sql immutable as $$
  select case when coalesce(p_action,'') ilike '%doctor review%' and p_created is not null
              then greatest(coalesce(p_effective, p_created), p_created)
              else p_effective end
$$;
grant execute on function public.samara_med_order_start(timestamptz,timestamptz,text) to authenticated;

-- B + C: patch the live alert function (text replace, each exactly once)
do $patch$
declare
  def text; updated text;
  marker constant text := '/* 2.19.21 start time */';
  med_old constant text := $o$(mo.effective_from is null or ((v_today+t.x) at time zone 'Asia/Kolkata')>=mo.effective_from)$o$;
  med_new constant text := $o$(public.samara_med_order_start(mo.effective_from,mo.created_at,mo.change_action) is null or ((v_today+t.x) at time zone 'Asia/Kolkata')>=public.samara_med_order_start(mo.effective_from,mo.created_at,mo.change_action)) /* 2.19.21 start time */$o$;
  care_old constant text := 'and (p.admission_boundary is null or p.admission_boundary<=w.remind_at)';
  care_new constant text := 'and (p.admission_boundary is null or p.admission_boundary<=w.remind_at) and c.created_at<=w.remind_at';
begin
  def := pg_get_functiondef('public.get_current_clinical_alerts()'::regprocedure);
  if position(marker in def) > 0 then
    raise notice 'Start-time rule already installed — alert function not changed.';
    return;
  end if;
  if (length(def)-length(replace(def,med_old,'')))/length(med_old) <> 1 then
    raise exception 'Medicine start condition not found exactly once — nothing changed.';
  end if;
  if (length(def)-length(replace(def,care_old,'')))/length(care_old) <> 1 then
    raise exception 'Care admission condition not found exactly once — nothing changed.';
  end if;
  updated := replace(def, med_old, med_new);
  updated := replace(updated, care_old, care_new);
  execute updated;
  raise notice 'get_current_clinical_alerts updated: medicines and care counted from their start.';
end $patch$;

-- B2: MIS & Audit (SQL 317) — doses due / not recorded use the same start rule
do $patch$
declare
  def text;
  old_t constant text := $o$(mo.effective_from is null or ((gd.d + t.x::time) at time zone 'Asia/Kolkata') >= mo.effective_from)$o$;
  new_t constant text := $o$(public.samara_med_order_start(mo.effective_from, mo.created_at, mo.change_action) is null or ((gd.d + t.x::time) at time zone 'Asia/Kolkata') >= public.samara_med_order_start(mo.effective_from, mo.created_at, mo.change_action))$o$;
begin
  def := pg_get_functiondef('public.mis_section_clinical(date,date)'::regprocedure);
  if position('samara_med_order_start' in def) > 0 then raise notice 'MIS already uses the start rule.'; return; end if;
  if (length(def)-length(replace(def,old_t,'')))/length(old_t) <> 1 then
    raise notice 'MIS dose condition not found exactly once — MIS not changed (alerts and guard still applied).'; return;
  end if;
  execute replace(def, old_t, new_t);
  raise notice 'mis_section_clinical updated.';
end $patch$;

-- D: guard on new dose entries
create or replace function public.samara_med_dose_after_start()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_start timestamptz; v_slot timestamptz;
begin
  select public.samara_med_order_start(mo.effective_from, mo.created_at, mo.change_action) into v_start
    from public.medication_orders mo where mo.id=new.order_id;
  if v_start is null or new.scheduled_date is null or new.scheduled_time is null then return new; end if;
  v_slot := (new.scheduled_date + new.scheduled_time::time) at time zone 'Asia/Kolkata';
  if v_slot < v_start - interval '1 minute' then
    raise exception 'This dose time (% %) is before the medicine started (%). Choose "Now — first dose" or a later time.',
      to_char(new.scheduled_date,'DD-MM-YYYY'), to_char(new.scheduled_time::time,'HH12:MI AM'),
      to_char(v_start at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM');
  end if;
  return new;
end $$;
drop trigger if exists samara_med_dose_after_start on public.medication_administrations;
create trigger samara_med_dose_after_start
before insert on public.medication_administrations
for each row execute function public.samara_med_dose_after_start();

-- E: data correction — doses recorded against times before their medicine started (30-10-2026 onwards)
update public.medication_administrations a
   set scheduled_time = to_char(a.administered_at at time zone 'Asia/Kolkata','HH24:MI'),
       scheduled_date = (a.administered_at at time zone 'Asia/Kolkata')::date,
       late_given_reason = null, late_given_details = null,
       remarks = concat_ws(' · ', nullif(a.remarks,''),
                 'First dose after doctor review — was saved against '||to_char(a.scheduled_time::time,'HH12:MI AM')||' by mistake (corrected 31-10-2026, SQL 325)')
  from public.medication_orders mo
 where mo.id = a.order_id
   and a.status = 'Given'
   and a.scheduled_date >= date '2026-10-30'
   and a.administered_at is not null
   and ((a.scheduled_date + a.scheduled_time::time) at time zone 'Asia/Kolkata')
         < public.samara_med_order_start(mo.effective_from, mo.created_at, mo.change_action) - interval '1 minute'
   and a.administered_at >= public.samara_med_order_start(mo.effective_from, mo.created_at, mo.change_action) - interval '15 minutes';

-- any "Medicine Late" alert still open for a dose now recorded on time
update public.clinical_alert_escalations e
   set resolved_at=now(), resolution_action='Corrected',
       resolution_remarks='Automatically closed: first dose after doctor review — not late (SQL 325).'
  from public.medication_administrations a
 where e.alert_type='Medicine Late' and e.source_id=a.id and e.resolved_at is null
   and coalesce(btrim(a.late_given_reason),'')='';

commit;
notify pgrst,'reload schema';

-- Check (read-only): the corrected doses
select a.scheduled_date, a.scheduled_time, a.status, a.remarks
  from public.medication_administrations a
 where a.remarks like '%SQL 325%' order by a.administered_at;
