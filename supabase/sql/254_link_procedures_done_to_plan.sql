-- Samara Care ERP 2.18.29 — planned Nursing Procedures are marked DONE when they are done another way
-- Issue (Boomi, 19-10-2026): for Mrs. SHANTHI.T (109-C), Nebulization and Blood Glucose Monitoring were
-- carried out and recorded — through NURSING → Approval Requests (Confirm & Start) and the sugar in
-- Vital Signs — but the planned procedure (care_orders, order_kind 'Nursing Procedure') only counted
-- records made from Shift Tasks / Daily Care, so the screensaver showed every time as Late, and the
-- Clinical Alerts engine (which reads care_orders) would escalate them.
--
-- Fix: one source of truth. When a procedure is done elsewhere, the database writes the matching care
-- record for the plan automatically:
--   * Approval Request → status 'Started' (Confirm & Start): matched to the Guest's active planned
--     procedure with the same Charge Master item (tariff), code or name;
--   * Vital Signs with a blood sugar value: matched to a planned "Blood Glucose / Sugar / GRBS / CBG" procedure.
-- Fixed-time procedures: the record goes to the nearest not-yet-done time within 3 hours (e.g. started
-- 6:26 AM → the 6:00 AM time). Any-time procedures: one record per shift.
-- Never blocks the start / the vitals entry (errors become warnings). Records of the last 2 days are
-- linked once when this file runs. Safe to run more than once (a record is never linked twice).
-- Run AFTER 251, 252. Charging is unchanged.


-- The existing shift-time check (nurses may record Day care only in the Day shift, Night care only at night)
-- stays for manual entries. Records written by samara_link_procedure_done carry the ACTUAL time the
-- procedure was done (from the Approval Request / Vitals), so they are allowed through (flag set only inside it).
create or replace function public.validate_care_log_shift_time()
returns trigger language plpgsql set search_path to 'public' as $function$
declare v_local_time time := (now() at time zone 'Asia/Kolkata')::time; v_local_date date := (now() at time zone 'Asia/Kolkata')::date;
begin
 if coalesce(current_setting('samara.system_link',true),'')='on' then return new; end if;
 if new.care_date>v_local_date then raise exception 'Future care dates are not permitted.'; end if;
 if new.care_date=v_local_date then
  if new.shift='Day Shift (7 AM–7 PM)' and not (v_local_time>=time '07:00' and v_local_time<time '19:00') then raise exception 'Day Shift care can be recorded only between 7:00 AM and 7:00 PM.'; end if;
  if new.shift='Night Shift (7 PM–7 AM)' and not (v_local_time>=time '19:00' or v_local_time<time '07:00') then raise exception 'Night Shift care can be recorded only between 7:00 PM and 7:00 AM.'; end if;
 end if;
 return new;
end; $function$;

create or replace function public.samara_norm_procedure_name(p text)
returns text language sql immutable as $$ select lower(regexp_replace(coalesce(p,''),'[^A-Za-z0-9]+','','g')) $$;

create or replace function public.samara_link_procedure_done(
  p_patient uuid, p_at timestamptz, p_tariff uuid, p_code text, p_name text, p_glucose boolean,
  p_by uuid, p_note text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare o record; v_local timestamp; v_date date; t text; d date; v_slot timestamptz; v_best timestamptz; v_best_t text;
        v_best_date date; v_hour int; v_shift text; v_shift_start timestamptz; v_id uuid;
begin
 if p_patient is null or p_at is null then return null; end if;
 v_local := p_at at time zone 'Asia/Kolkata';
 for o in
   select c.* from public.care_orders c
    where c.patient_id=p_patient and c.order_kind='Nursing Procedure' and coalesce(c.is_active,true)
      and (c.start_date is null or c.start_date <= v_local::date)
      and ( (p_glucose and c.care_type ~* '(glucose|sugar|grbs|cbg)')
         or (not p_glucose and (
              (p_tariff is not null and c.tariff_id = p_tariff)
           or (nullif(btrim(p_code),'') is not null and lower(btrim(c.procedure_code)) = lower(btrim(p_code)))
           or (public.samara_norm_procedure_name(c.care_type) = public.samara_norm_procedure_name(p_name)
               and public.samara_norm_procedure_name(p_name) <> ''))))
    order by c.created_at
 loop
   -- already linked (same moment) → nothing to do
   if exists (select 1 from public.care_logs l where l.care_order_id=o.id and l.completed_at=p_at) then return null; end if;
   if coalesce(array_length(o.scheduled_times,1),0) > 0 then
     v_best := null;
     foreach t in array o.scheduled_times loop
       if t !~ '^\d{1,2}:\d{2}' then continue; end if;
       for d in select generate_series(v_local::date - 1, v_local::date + 1, interval '1 day')::date loop
         v_slot := (d + t::time) at time zone 'Asia/Kolkata';
         if abs(extract(epoch from (v_slot - p_at))) > 3*3600 then continue; end if;
         if exists (select 1 from public.care_logs l where l.care_order_id=o.id and l.care_date=d and l.scheduled_time=t::time) then continue; end if;
         if v_best is null or abs(extract(epoch from (v_slot - p_at))) < abs(extract(epoch from (v_best - p_at))) then
           v_best := v_slot; v_best_t := t; v_best_date := d;
         end if;
       end loop;
     end loop;
     if v_best is null then continue; end if; -- no open time near this moment
     v_hour := extract(hour from v_best_t::time);
     v_shift := case when v_hour >= 7 and v_hour < 19 then 'Day Shift (7 AM–7 PM)' else 'Night Shift (7 PM–7 AM)' end;
     perform set_config('samara.system_link','on',true);
     insert into public.care_logs(care_order_id,patient_id,care_date,shift,status,completed_at,completed_by,remarks,scheduled_time)
       values (o.id,p_patient,v_best_date,v_shift,'Completed',p_at,p_by,o.care_type||': '||p_note,v_best_t::time)
       returning id into v_id;
     perform set_config('samara.system_link','off',true);
     return v_id;
   else
     v_hour := extract(hour from v_local);
     if v_hour >= 7 and v_hour < 19 then
       v_shift := 'Day Shift (7 AM–7 PM)'; v_shift_start := (v_local::date + time '07:00') at time zone 'Asia/Kolkata';
     else
       v_shift := 'Night Shift (7 PM–7 AM)';
       v_shift_start := ((case when v_hour >= 19 then v_local::date else v_local::date - 1 end) + time '19:00') at time zone 'Asia/Kolkata';
     end if;
     if exists (select 1 from public.care_logs l where l.care_order_id=o.id and l.completed_at >= v_shift_start and l.completed_at < v_shift_start + interval '12 hours') then continue; end if;
     perform set_config('samara.system_link','on',true);
     insert into public.care_logs(care_order_id,patient_id,care_date,shift,status,completed_at,completed_by,remarks)
       values (o.id,p_patient,v_local::date,v_shift,'Completed',p_at,p_by,o.care_type||': '||p_note)
       returning id into v_id;
     perform set_config('samara.system_link','off',true);
     return v_id;
   end if;
 end loop;
 return null;
end $$;
revoke all on function public.samara_link_procedure_done(uuid,timestamptz,uuid,text,text,boolean,uuid,text) from public, anon, authenticated;

-- Approval Request started → planned procedure done
create or replace function public.samara_trg_procedure_request_started()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.status='Started' and (tg_op='INSERT' or old.status is distinct from 'Started')
    and coalesce(new.category,'Nursing Procedures')='Nursing Procedures' then
   begin
     perform public.samara_link_procedure_done(new.patient_id,coalesce(new.started_at,now()),new.tariff_id,new.procedure_code,new.procedure_name,false,new.started_by,'done through Approval Request');
   exception when others then raise warning 'Samara: procedure plan link skipped: %', sqlerrm;
   end;
 end if;
 return new;
end $$;
do $t$ begin
 if not exists (select 1 from pg_trigger where tgname='samara_procedure_request_started_link') then
  create trigger samara_procedure_request_started_link after insert or update of status on public.nursing_procedure_requests
    for each row execute function public.samara_trg_procedure_request_started();
 end if; end $t$;

-- Blood sugar in Vital Signs → planned Blood Glucose Monitoring done
create or replace function public.samara_trg_vitals_sugar_link()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if coalesce(new.blood_sugar,new.blood_sugar_value) is not null then
   begin
     perform public.samara_link_procedure_done(new.patient_id,coalesce(new.recorded_at,now()),null,null,null,true,new.recorded_by,'blood sugar recorded in Vital Signs');
   exception when others then raise warning 'Samara: glucose plan link skipped: %', sqlerrm;
   end;
 end if;
 return new;
end $$;
do $t$ begin
 if not exists (select 1 from pg_trigger where tgname='samara_vitals_sugar_link') then
  create trigger samara_vitals_sugar_link after insert on public.vital_signs
    for each row execute function public.samara_trg_vitals_sugar_link();
 end if; end $t$;

-- Family Portal: a request already shown through its linked plan record is not listed twice.
do $$
declare f text;
begin
 f := pg_get_functiondef('public.family_portal_nursing_procedures(text)'::regprocedure);
 if position('samara_link_dedupe' in f)=0 then
   f := replace(f, $x$     and coalesce(r.started_at,r.requested_at)>=now()-interval '120 days';$x$,
     $x$     and coalesce(r.started_at,r.requested_at)>=now()-interval '120 days'
     and not exists (select 1 from public.care_logs l2 join public.care_orders c2 on c2.id=l2.care_order_id -- samara_link_dedupe
                      where l2.patient_id=pid and c2.order_kind='Nursing Procedure' and l2.completed_at=r.started_at);$x$);
   execute f;
 end if;
end $$;

-- One-time link of the last 2 days (requests in time order, then sugars)
do $$
declare r record;
begin
 for r in select * from public.nursing_procedure_requests
           where status='Started' and coalesce(category,'Nursing Procedures')='Nursing Procedures'
             and started_at >= now() - interval '2 days' order by started_at loop
   begin perform public.samara_link_procedure_done(r.patient_id,r.started_at,r.tariff_id,r.procedure_code,r.procedure_name,false,r.started_by,'done through Approval Request');
   exception when others then raise notice 'skipped request %: %', r.id, sqlerrm; end;
 end loop;
 for r in select * from public.vital_signs
           where coalesce(blood_sugar,blood_sugar_value) is not null and recorded_at >= now() - interval '2 days' order by recorded_at loop
   begin perform public.samara_link_procedure_done(r.patient_id,r.recorded_at,null,null,null,true,r.recorded_by,'blood sugar recorded in Vital Signs');
   exception when others then raise notice 'skipped vitals %: %', r.id, sqlerrm; end;
 end loop;
end $$;

notify pgrst, 'reload schema';
