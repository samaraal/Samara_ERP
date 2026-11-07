-- ERP 2.19.75 — DAILY REPORT (PowerPoint deck + morning WhatsApp PDF) (07-11-2026). Run AFTER SQL 317 / 318 / 326.
-- Run once in Supabase SQL Editor. Safe to run again. Read-only for the ERP: it only adds the report and its own tables.
--
-- What: "all happenings of the day" (midnight to midnight, IST) in 12 slides — Day at a glance (with yesterday and the
--   7-day average), Guest movement, Clinical care, Escalations & incidents, Care services, Guests needing attention,
--   Billing, Money, Staff, Stores / food / equipment, Family & communication, Exceptions (the MIS & Audit findings).
-- Who:  Admin / Directors see everything. The Nursing Manager sees the same report WITHOUT the money slides / numbers.
-- Saved copy: the first time a finished day is prepared (normally by the 7 AM WhatsApp run) the report is saved in
--   mis_daily_reports, so the 10-Nov report always shows the same numbers even if an entry is edited later.
--   Admin can press "Prepare again" to replace the saved copy. Today's report (day not finished) is never saved.
-- Functions:
--   mis_daily_report(p_day, p_refresh)        → ERP page (Admin full; Nursing Manager without money)
--   mis_daily_report_service(p_day, p_variant) → Edge Function mis-daily-report-dispatch only ('full' / 'care')
--   mis_daily_report_recipients()              → Edge Function only: Admin (full) + Nursing Manager (care)
-- Every number / list runs on its own: if one cannot run on the live database it shows "Not available" and the rest
-- of the report still comes out (same safety as MIS & Audit).
begin;

-- ───────────────────────────── saved copies + WhatsApp send log ─────────────────────────────
create table if not exists public.mis_daily_reports(
  report_day date primary key,
  payload jsonb not null,
  generated_at timestamptz not null default now(),
  generated_by uuid,
  generated_by_name text,
  prepared_count int not null default 1
);
alter table public.mis_daily_reports enable row level security;
revoke all on public.mis_daily_reports from public, anon, authenticated;
grant all on public.mis_daily_reports to service_role;

create table if not exists public.mis_daily_report_sends(
  id uuid primary key default gen_random_uuid(),
  report_day date not null,
  recipient_profile_id uuid,
  recipient_name text,
  recipient_number text not null,
  variant text not null default 'full' check (variant in ('full','care')),
  status text not null default 'Sending' check (status in ('Sending','Sent','Failed')),
  route text, meta_message_id text, error_text text,
  created_at timestamptz not null default now(), sent_at timestamptz, updated_at timestamptz not null default now()
);
create index if not exists mis_daily_report_sends_day on public.mis_daily_report_sends(report_day, recipient_number);
alter table public.mis_daily_report_sends enable row level security;
revoke all on public.mis_daily_report_sends from public, anon, authenticated;
grant select on public.mis_daily_report_sends to authenticated;
drop policy if exists mis_daily_report_sends_admin_read on public.mis_daily_report_sends;
create policy mis_daily_report_sends_admin_read on public.mis_daily_report_sends for select to authenticated
  using (exists(select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and p.role='Admin'));
grant all on public.mis_daily_report_sends to service_role;

-- ───────────────────────────── helpers ─────────────────────────────
-- 'full' = Admin / Director, 'care' = Nursing Manager (same rule as the ERP menu), null = not allowed
create or replace function public.mdr_viewer_variant(p_profile public.profiles)
returns text language sql immutable set search_path=public,pg_temp as $f$
  select case
    when p_profile.role = 'Admin' then 'full'
    when regexp_replace(lower(trim(coalesce(p_profile.designation,''))),'[._-]+',' ','g') in ('nurse manager','nursing manager') then 'care'
    when coalesce(trim(p_profile.designation),'') = '' and lower(trim(coalesce(p_profile.department,''))) = 'nursing'
         and p_profile.role = 'Manager' then 'care'
  end
$f$;
revoke all on function public.mdr_viewer_variant(public.profiles) from public, anon, authenticated;

-- One number with an optional "good" direction ('up' / 'down') and money flag.
create or replace function public.mdr_k(p_label text, p_unit text, p_sql text, p_day date,
                                        p_note text default null, p_good text default null, p_money boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
begin
  return public.mis_kpi(p_label, p_unit, p_sql, p_day, p_day, p_note)
         || jsonb_build_object('good', p_good, 'money', p_money);
end $f$;
revoke all on function public.mdr_k(text,text,text,date,text,text,boolean) from public, anon, authenticated;

-- Same number for each of the 8 days ending on p_day → value, yesterday, 7-day average and the series (for charts).
create or replace function public.mdr_series(p_label text, p_unit text, p_sql text, p_day date,
                                             p_good text default null, p_money boolean default false, p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare i int; v jsonb; vals jsonb := '[]'; days jsonb := '[]'; cur numeric; prev numeric; avg7 numeric; err text;
begin
  for i in reverse 7..0 loop
    v := public.mis_kpi(p_label, p_unit, p_sql, p_day - i, p_day - i, null);
    vals := vals || coalesce(v->'value','null'::jsonb);
    days := days || to_jsonb(to_char(p_day - i,'DD-MM'));
    if v->'value' = 'null'::jsonb and err is null then err := v->>'note'; end if;
  end loop;
  cur  := nullif(vals->>7,'')::numeric;
  prev := nullif(vals->>6,'')::numeric;
  select round(avg(nullif(x,'')::numeric),1) into avg7 from jsonb_array_elements_text(vals) with ordinality t(x,n) where n <= 7;
  return jsonb_build_object('label',p_label,'unit',p_unit,'value',cur,'prev',prev,'avg7',avg7,
                            'series',vals,'series_days',days,'good',p_good,'money',p_money,
                            'note',coalesce(case when cur is null then err end, p_note));
end $f$;
revoke all on function public.mdr_series(text,text,text,date,text,boolean,text) from public, anon, authenticated;

-- One table. p_sql returns one column r = jsonb array (one cell per column) and is ordered; $1 = $2 = the day.
create or replace function public.mdr_table(p_title text, p_cols jsonb, p_sql text, p_day date,
                                            p_max int default 14, p_money boolean default false, p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare n int; rows jsonb;
begin
  execute format('select count(*)::int from (%s) s', p_sql) into n using p_day, p_day;
  execute format('select coalesce(jsonb_agg(z.r),''[]''::jsonb) from (select s.r from (%s) s limit %s) z', p_sql, p_max)
    into rows using p_day, p_day;
  return jsonb_build_object('title',p_title,'cols',p_cols,'rows',rows,'total',coalesce(n,0),'money',p_money,'note',p_note);
exception when others then
  return jsonb_build_object('title',p_title,'cols',p_cols,'rows','[]'::jsonb,'total',0,'money',p_money,
                            'note',p_note,'error','Not available: '||left(sqlerrm,200));
end $f$;
revoke all on function public.mdr_table(text,jsonb,text,date,int,boolean,text) from public, anon, authenticated;

-- Rows of one MIS & Audit check (from an already-run audit) as a table.
create or replace function public.mdr_audit_rows(p_audit jsonb, p_keys text[], p_title text, p_money boolean default false, p_max int default 14)
returns jsonb language plpgsql immutable set search_path=public,pg_temp as $f$
declare rows jsonb := '[]'; n int := 0; c jsonb; r jsonb;
begin
  for c in select x from jsonb_array_elements(coalesce(p_audit->'sections','[]')) s, jsonb_array_elements(coalesce(s->'checks','[]')) x
            where x->>'key' = any(p_keys) and not (x ? 'error') loop
    n := n + coalesce((c->>'count')::int,0);
    for r in select y from jsonb_array_elements(coalesce(c->'rows','[]')) y loop
      if jsonb_array_length(rows) < p_max then
        rows := rows || jsonb_build_array(
          case when p_money then jsonb_build_array(r->>'date', r->>'who', coalesce(r->>'detail', c->>'title'), r->'amount')
               else jsonb_build_array(r->>'date', r->>'who', coalesce(r->>'detail', c->>'title')) end);
      end if;
    end loop;
  end loop;
  return jsonb_build_object('title',p_title,
    'cols', case when p_money then '["Date","Guest / item","Detail","₹"]'::jsonb else '["Date","Guest / item","Detail"]'::jsonb end,
    'rows',rows,'total',n,'money',p_money);
end $f$;
revoke all on function public.mdr_audit_rows(jsonb,text[],text,boolean,int) from public, anon, authenticated;

-- ───────────────────────────── the report ─────────────────────────────
create or replace function public.mis_daily_report_core(p_day date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare d date := p_day;
  secs jsonb := '[]'; k jsonb; t jsonb; audit jsonb; s jsonb; c jsonb;
  hi int := 0; me int := 0; lo int := 0; fhi int := 0; fme int := 0; frows jsonb := '[]'; crows jsonb := '[]';
  -- shared pieces ($1 = $2 = the day)
  gname constant text := $q$concat_ws(' ', nullif(p.title,''), p.full_name)$q$;
  groom constant text := $q$nullif(concat_ws('-', nullif(p.room_no,''), nullif(p.bed_no,'')),'')$q$;
  beds  constant text := $q$ select b.* from public.room_beds b
     where lower(regexp_replace(concat_ws('|',b.status,b.room_type,b.room_no,b.bed_no),'[^a-z|]','','gi')) !~ '(^|\|)(samaraoffice|samarastore)(\||$)' $q$;
  -- vitals slots / doses due on the day (same rules as MIS & Audit, SQL 317)
  v_slots constant text := $q$
    select gd.patient_id, gd.guest, gd.room, ((gd.d + s.t) at time zone 'Asia/Kolkata') as due
      from public.mis_guest_days($1,$2) gd
      join public.patients p on p.id = gd.patient_id
      cross join lateral (select x::time as t from unnest(coalesce(p.vitals_schedule::text[], array['06:00','14:00','22:00'])) x) s
     where ((gd.d + s.t) at time zone 'Asia/Kolkata') >= gd.adm_at
       and ((gd.d + s.t) at time zone 'Asia/Kolkata') + interval '4 hours' < now()
       and coalesce(p.admission_status,'Active') <> 'Temporarily Hospitalised' $q$;
  v_doses constant text := $q$
    select mo.id as order_id, gd.patient_id, gd.guest, gd.room, gd.d, t.x::time as slot,
           ((gd.d + t.x::time) at time zone 'Asia/Kolkata') as due, mo.medicine_name
      from public.mis_guest_days($1,$2) gd
      join public.medication_orders mo on mo.patient_id = gd.patient_id and mo.is_active = true
      cross join lateral unnest(mo.scheduled_times) t(x)
     where (mo.start_date is null or mo.start_date <= gd.d) and (mo.end_date is null or mo.end_date >= gd.d)
       and (mo.effective_from is null or ((gd.d + t.x::time) at time zone 'Asia/Kolkata') >= mo.effective_from)
       and (mo.stopped_at is null or ((gd.d + t.x::time) at time zone 'Asia/Kolkata') < mo.stopped_at)
       and public.samara_medication_due_on_order(mo.frequency, mo.dose_weekday, mo.dose_month_day,
             coalesce((mo.effective_from at time zone 'Asia/Kolkata')::date, mo.start_date), gd.d, mo.dose_anchor_date)
       and ((gd.d + t.x::time) at time zone 'Asia/Kolkata') >= gd.adm_at
       and ((gd.d + t.x::time) at time zone 'Asia/Kolkata') < now() - interval '1 hour' $q$;
  ntrial constant text := $q$not coalesce(p.is_trial,false)$q$;
begin
  perform set_config('statement_timeout','150s',true);
  audit := public.mis_audit_report_core(d, d);

  -- findings counts (care & operations / money) from the audit
  for s in select x from jsonb_array_elements(coalesce(audit->'sections','[]')) x loop
    for c in select y from jsonb_array_elements(coalesce(s->'checks','[]')) y
              where coalesce((y->>'count')::int,0) > 0 and not (y ? 'error')
              order by case y->>'severity' when 'high' then 0 when 'medium' then 1 else 2 end, (y->>'count')::int desc loop
      if s->>'key' in ('financial','analysis') then
        if c->>'severity'='high' then fhi := fhi + (c->>'count')::int; elsif c->>'severity'='medium' then fme := fme + (c->>'count')::int; end if;
        frows := frows || jsonb_build_array(jsonb_build_array(initcap(c->>'severity'), s->>'title', c->>'title', (c->>'count')::int, c->'amount'));
      else
        if c->>'severity'='high' then hi := hi + (c->>'count')::int; elsif c->>'severity'='medium' then me := me + (c->>'count')::int; else lo := lo + (c->>'count')::int; end if;
        crows := crows || jsonb_build_array(jsonb_build_array(initcap(c->>'severity'), s->>'title', c->>'title', (c->>'count')::int));
      end if;
    end loop;
  end loop;

  -- 1. DAY AT A GLANCE ───────────────────────────────────────────────
  k := '[]';
  k := k || public.mdr_series('Guests in house','', $q$select count(*) from public.mis_guest_days($1,$2)$q$, d, 'up');
  k := k || public.mdr_series('Occupancy','%', format($q$select round(100.0*(select count(*) from public.mis_guest_days($1,$2))/nullif((select count(*) from (%s) b),0),1)$q$, beds), d, 'up');
  k := k || public.mdr_series('Admissions','', $q$select count(*) from public.patients p where not coalesce(p.is_trial,false) and p.admission_date::date between $1 and $2 and coalesce(p.admission_status,'Active') not in ('Draft','Admission Pending')$q$, d, 'up');
  k := k || public.mdr_series('Discharges','', $q$select count(*) from public.patient_discharges d join public.patients p on p.id=d.patient_id where not coalesce(p.is_trial,false) and d.status='Completed' and (coalesce(d.actual_departure_at,d.completed_at) at time zone 'Asia/Kolkata')::date between $1 and $2$q$, d);
  k := k || public.mdr_series('Escalations raised','', $q$select count(*) from public.clinical_alert_escalations e left join public.patients p on p.id=e.patient_id where not coalesce(p.is_trial,false) and (e.created_at at time zone 'Asia/Kolkata')::date between $1 and $2$q$, d, 'down');
  k := k || public.mdr_series('Incidents & falls','', $q$select count(*) from public.incidents i where (i.incident_at at time zone 'Asia/Kolkata')::date between $1 and $2$q$, d, 'down');
  k := k || public.mdr_series('Collected','₹', $q$select coalesce(sum(t.amount),0) from public.billing_transactions t join public.patients p on p.id=t.patient_id where not coalesce(p.is_trial,false) and t.transaction_type in ('Payment','Advance') and (t.transaction_date at time zone 'Asia/Kolkata')::date between $1 and $2$q$, d, 'up', true, 'payments + advances');
  k := k || public.mdr_series('Charged to Guest bills','₹', $q$select coalesce(sum(t.amount),0) from public.billing_transactions t join public.patients p on p.id=t.patient_id where not coalesce(p.is_trial,false) and t.transaction_type='Charge' and coalesce(t.source_date,(t.transaction_date at time zone 'Asia/Kolkata')::date) between $1 and $2$q$, d, 'up', true);
  k := k || jsonb_build_object('label','Open findings — High','unit','','value',hi,'good','down','money',false,'note','care & operations');
  k := k || jsonb_build_object('label','Billing findings — High','unit','','value',fhi,'good','down','money',true,'note','billing & money');
  secs := secs || jsonb_build_object('key','glance','title','Day at a glance','subtitle','The day in numbers, compared with the day before and the 7-day average',
                                     'money',false,'kpis',k,'tables','[]'::jsonb,'chart','Guests in house');

  -- 2. GUEST MOVEMENT ─────────────────────────────────────────────────
  k := '[]'; t := '[]';
  k := k || public.mdr_k('Guest beds','', format($q$select count(*) from (%s) b$q$, beds), d);
  k := k || public.mdr_k('Guests on the day','', $q$select count(*) from public.mis_guest_days($1,$2)$q$, d);
  k := k || public.mdr_k('Beds free','', format($q$select (select count(*) from (%s) b) - (select count(*) from public.mis_guest_days($1,$2))$q$, beds), d, 'at the end of the day');
  k := k || public.mdr_k('Hospital visits','', $q$select count(*) from public.hospital_visit_records h join public.patients p on p.id=h.patient_id where not coalesce(p.is_trial,false) and (coalesce(h.out_time,h.created_at) at time zone 'Asia/Kolkata')::date = $1$q$, d, 'went out to a hospital');
  k := k || public.mdr_k('In hospital now','', $q$select count(*) from public.patients p where coalesce(p.is_active,true) and not coalesce(p.is_trial,false) and p.admission_status='Temporarily Hospitalised'$q$, d, 'Temporarily Hospitalised', 'down');
  k := k || public.mdr_k('New enquiries','', $q$select count(*) from public.pre_admission_enquiries e where (e.created_at at time zone 'Asia/Kolkata')::date = $1$q$, d, null, 'up');
  t := t || public.mdr_table('Admitted','["Guest","Resident ID","Room","Time"]'::jsonb, format($q$
      select jsonb_build_array(%1$s, coalesce(p.patient_id,'—'), coalesce(%2$s,'—'), coalesce(to_char(p.admission_time,'HH24:MI'),'—')) as r
        from public.patients p
       where %3$s and p.admission_date::date = $1 and coalesce(p.admission_status,'Active') not in ('Draft','Admission Pending')
       order by p.admission_time nulls last$q$, gname, groom, ntrial), d);
  t := t || public.mdr_table('Discharged','["Guest","Resident ID","Left at","Account"]'::jsonb, format($q$
      select jsonb_build_array(%1$s, coalesce(p.patient_id,'—'),
               to_char(coalesce(dc.actual_departure_at,dc.completed_at) at time zone 'Asia/Kolkata','HH24:MI'),
               case when dc.dues_status='Pending' then 'Left with dues' else 'Settled' end) as r
        from public.patient_discharges dc join public.patients p on p.id=dc.patient_id
       where %2$s and dc.status='Completed' and (coalesce(dc.actual_departure_at,dc.completed_at) at time zone 'Asia/Kolkata')::date = $1
       order by coalesce(dc.actual_departure_at,dc.completed_at)$q$, gname, ntrial), d);
  t := t || public.mdr_table('Hospital visits','["Guest","Hospital","Reason","Out","Back"]'::jsonb, format($q$
      select jsonb_build_array(%1$s, h.hospital_name, left(coalesce(h.visit_reason,''),60),
               coalesce(to_char(h.out_time at time zone 'Asia/Kolkata','HH24:MI'),'—'),
               coalesce(to_char(h.return_time at time zone 'Asia/Kolkata','DD-MM HH24:MI'),'Not back')) as r
        from public.hospital_visit_records h join public.patients p on p.id=h.patient_id
       where %2$s and (coalesce(h.out_time,h.created_at) at time zone 'Asia/Kolkata')::date = $1
       order by coalesce(h.out_time,h.created_at)$q$, gname, ntrial), d);
  t := t || public.mdr_table('New enquiries','["Enquiry","Name","Source","Status"]'::jsonb, $q$
      select jsonb_build_array(coalesce(e.enquiry_no,'—'), coalesce(e.patient_name,'—'), coalesce(e.source,'—'), coalesce(e.status,'New')) as r
        from public.pre_admission_enquiries e where (e.created_at at time zone 'Asia/Kolkata')::date = $1 order by e.created_at$q$, d);
  secs := secs || jsonb_build_object('key','movement','title','Guest movement','subtitle','Admissions, discharges, hospital visits, beds and enquiries',
                                     'money',false,'kpis',k,'tables',t);

  -- 3. CLINICAL CARE ──────────────────────────────────────────────────
  k := '[]'; t := '[]';
  k := k || public.mdr_k('Vitals rounds due','', format($q$select count(*) from (%s) s$q$, v_slots), d);
  k := k || public.mdr_k('Vitals recorded on time','%', format($q$with s as (%s) select round(100.0*count(*) filter (where exists(select 1 from public.vital_signs v where v.patient_id=s.patient_id and v.recorded_at>=s.due-interval '90 minutes' and v.recorded_at<s.due+interval '4 hours'))/nullif(count(*),0),1) from s$q$, v_slots), d, null, 'up');
  k := k || public.mdr_k('Critical readings','', $q$select count(*) from public.vital_signs v join public.patients p on p.id=v.patient_id where not coalesce(p.is_trial,false) and v.alert_level='Critical' and (v.recorded_at at time zone 'Asia/Kolkata')::date = $1$q$, d, null, 'down');
  k := k || public.mdr_k('Medicine doses due','', format($q$select count(*) from (%s) s$q$, v_doses), d);
  k := k || public.mdr_k('Doses recorded','%', format($q$with s as (%s) select round(100.0*count(*) filter (where exists(select 1 from public.medication_administrations a where a.order_id=s.order_id and a.scheduled_date=s.d and a.scheduled_time::time=s.slot))/nullif(count(*),0),1) from s$q$, v_doses), d, 'doses with an entry', 'up');
  k := k || public.mdr_k('Given 30+ min late','', $q$select count(*) from public.medication_administrations a join public.patients p on p.id=a.patient_id where not coalesce(p.is_trial,false) and a.status='Given' and a.scheduled_date = $1 and public.samara_med_given_late_minutes(a.scheduled_date, a.scheduled_time::time, a.administered_at) >= 30$q$, d, null, 'down');
  k := k || public.mdr_k('Missed / refused','', $q$select count(*) from public.medication_administrations a join public.patients p on p.id=a.patient_id where not coalesce(p.is_trial,false) and a.status in ('Missed','Refused') and a.scheduled_date = $1$q$, d, null, 'down');
  k := k || public.mdr_k('Doses with no entry','', format($q$with s as (%s) select count(*) from s where not exists(select 1 from public.medication_administrations a where a.order_id=s.order_id and a.scheduled_date=s.d and a.scheduled_time::time=s.slot)$q$, v_doses), d, null, 'down');
  t := t || public.mdr_table('Medicine rounds by status','["Status","Doses"]'::jsonb, $q$
      select jsonb_build_array(coalesce(a.status,'—'), count(*)) as r
        from public.medication_administrations a join public.patients p on p.id=a.patient_id
       where not coalesce(p.is_trial,false) and a.scheduled_date = $1
       group by a.status order by count(*) desc$q$, d);
  t := t || public.mdr_table('Readings outside normal','["Time","Guest","Reading","Level"]'::jsonb, format($q$
      select jsonb_build_array(to_char(v.recorded_at at time zone 'Asia/Kolkata','HH24:MI'), %1$s,
               concat_ws(' · ', case when v.systolic is not null then 'BP '||v.systolic||'/'||coalesce(v.diastolic::text,'?') end,
                         case when v.pulse is not null then 'Pulse '||v.pulse end, case when v.spo2 is not null then 'SpO2 '||v.spo2||'%%' end,
                         case when v.temperature is not null then 'Temp '||v.temperature end,
                         case when v.blood_sugar is not null then 'Sugar '||v.blood_sugar end),
               v.alert_level) as r
        from public.vital_signs v join public.patients p on p.id=v.patient_id
       where %2$s and coalesce(v.alert_level,'Normal') not in ('Normal','') and (v.recorded_at at time zone 'Asia/Kolkata')::date = $1
       order by case when v.alert_level='Critical' then 0 else 1 end, v.recorded_at$q$, gname, ntrial), d);
  secs := secs || jsonb_build_object('key','clinical','title','Clinical care','subtitle','Vitals rounds and medicine rounds — done, late, missed',
                                     'money',false,'kpis',k,'tables',t);

  -- 4. ESCALATIONS & INCIDENTS ───────────────────────────────────────
  k := '[]'; t := '[]';
  k := k || public.mdr_k('Escalations raised','', $q$select count(*) from public.clinical_alert_escalations e left join public.patients p on p.id=e.patient_id where not coalesce(p.is_trial,false) and (e.created_at at time zone 'Asia/Kolkata')::date = $1$q$, d, 'to Manager / Admin', 'down');
  k := k || public.mdr_k('Attended','', $q$select count(*) from public.clinical_alert_escalations e left join public.patients p on p.id=e.patient_id where not coalesce(p.is_trial,false) and e.resolved_at is not null and (e.created_at at time zone 'Asia/Kolkata')::date = $1$q$, d, null, 'up');
  k := k || public.mdr_k('Still open','', $q$select count(*) from public.clinical_alert_escalations e left join public.patients p on p.id=e.patient_id where not coalesce(p.is_trial,false) and e.resolved_at is null and (e.created_at at time zone 'Asia/Kolkata')::date = $1$q$, d, null, 'down');
  k := k || public.mdr_k('Average time to attend','min', $q$select round(avg(extract(epoch from (e.resolved_at-e.created_at))/60)) from public.clinical_alert_escalations e where e.resolved_at is not null and (e.created_at at time zone 'Asia/Kolkata')::date = $1$q$, d, null, 'down');
  k := k || public.mdr_k('Incidents','', $q$select count(*) from public.incidents i where (i.incident_at at time zone 'Asia/Kolkata')::date = $1$q$, d, null, 'down');
  k := k || public.mdr_k('Falls','', $q$select count(*) from public.incidents i where i.incident_type='Fall' and (i.incident_at at time zone 'Asia/Kolkata')::date = $1$q$, d, null, 'down');
  k := k || public.mdr_k('Medication errors','', $q$select count(*) from public.medication_errors m where (m.occurred_at at time zone 'Asia/Kolkata')::date = $1$q$, d, 'reported', 'down');
  t := t || public.mdr_table('Escalations','["Time","Guest","Alert","Outcome"]'::jsonb, format($q$
      select jsonb_build_array(to_char(e.created_at at time zone 'Asia/Kolkata','HH24:MI'), coalesce(%1$s,'—'),
               concat_ws(' · ', e.alert_type, e.priority, 'to '||e.escalated_to_role),
               case when e.resolved_at is null then 'OPEN'
                    else 'Attended in '||round(extract(epoch from (e.resolved_at-e.created_at))/60)||' min'||coalesce(' · '||nullif(e.resolution_action,''),'') end) as r
        from public.clinical_alert_escalations e left join public.patients p on p.id=e.patient_id
       where %2$s and (e.created_at at time zone 'Asia/Kolkata')::date = $1 order by e.created_at$q$, gname, ntrial), d);
  t := t || public.mdr_table('Incidents & falls','["Time","Guest","Type","Severity","Status","What happened"]'::jsonb, format($q$
      select jsonb_build_array(to_char(i.incident_at at time zone 'Asia/Kolkata','HH24:MI'), coalesce(%1$s,'—'), coalesce(i.incident_type,'—'),
               coalesce(i.severity,'—'), coalesce(i.status,'Open'), left(coalesce(i.description,''),90)) as r
        from public.incidents i left join public.patients p on p.id=i.patient_id
       where (i.incident_at at time zone 'Asia/Kolkata')::date = $1 order by i.incident_at$q$, gname), d);
  t := t || public.mdr_table('Medication errors','["Time","Guest","Type","Severity","Status"]'::jsonb, format($q$
      select jsonb_build_array(to_char(m.occurred_at at time zone 'Asia/Kolkata','HH24:MI'), coalesce(%1$s,'—'), coalesce(m.error_type,'—'),
               coalesce(m.severity,'—'), coalesce(m.status,'Open')) as r
        from public.medication_errors m left join public.patients p on p.id=m.patient_id
       where (m.occurred_at at time zone 'Asia/Kolkata')::date = $1 order by m.occurred_at$q$, gname), d);
  secs := secs || jsonb_build_object('key','escalations','title','Escalations & incidents','subtitle','What reached the Manager / Admin, how fast it was attended, incidents and falls',
                                     'money',false,'kpis',k,'tables',t);

  -- 5. CARE SERVICES ──────────────────────────────────────────────────
  k := '[]'; t := '[]';
  k := k || public.mdr_k('Nursing procedures done','', $q$select count(*) from public.nursing_procedure_requests r join public.patients p on p.id=r.patient_id where not coalesce(p.is_trial,false) and r.status='Started' and coalesce(r.category,'Nursing Procedures')<>'Biomedical Equipment' and (r.started_at at time zone 'Asia/Kolkata')::date = $1$q$, d);
  k := k || public.mdr_k('Physiotherapy sessions done','', $q$select count(*) from public.physiotherapy_sessions s join public.patients p on p.id=s.patient_id where not coalesce(p.is_trial,false) and s.status='Completed' and s.session_date = $1$q$, d, null, 'up');
  k := k || public.mdr_k('Physiotherapy not done','', $q$select count(*) from public.physiotherapy_sessions s join public.patients p on p.id=s.patient_id where not coalesce(p.is_trial,false) and s.session_date = $1 and s.status in ('Not Done','Pending')$q$, d, null, 'down');
  k := k || public.mdr_k('Doctor consultations','', $q$select count(*) from public.bill_charge_requests b join public.patients p on p.id=b.patient_id where not coalesce(p.is_trial,false) and b.category ilike '%doctor%' and coalesce(b.status,'') not in ('Cancelled') and coalesce(b.approval_status,'') <> 'Rejected' and coalesce(b.charge_date,(coalesce(b.raised_at,b.created_at) at time zone 'Asia/Kolkata')::date) = $1$q$, d, 'raised as Doctor Services');
  k := k || public.mdr_k('Lab / scans ordered','', $q$select count(*) from public.diagnostic_services x join public.patients p on p.id=x.patient_id where not coalesce(p.is_trial,false) and (x.ordered_at at time zone 'Asia/Kolkata')::date = $1$q$, d);
  k := k || public.mdr_k('Reports received','', $q$select count(*) from public.diagnostic_services x join public.patients p on p.id=x.patient_id where not coalesce(p.is_trial,false) and (x.report_received_at at time zone 'Asia/Kolkata')::date = $1$q$, d);
  t := t || public.mdr_table('Nursing procedures done','["Procedure","Times","Guests"]'::jsonb, format($q$
      select jsonb_build_array(coalesce(r.procedure_name,'—'), count(*), string_agg(distinct %1$s, ', ')) as r
        from public.nursing_procedure_requests r join public.patients p on p.id=r.patient_id
       where %2$s and r.status='Started' and coalesce(r.category,'Nursing Procedures')<>'Biomedical Equipment'
         and (r.started_at at time zone 'Asia/Kolkata')::date = $1
       group by r.procedure_name order by count(*) desc$q$, gname, ntrial), d);
  t := t || public.mdr_table('Physiotherapy','["Guest","Physiotherapist","Status","Time"]'::jsonb, format($q$
      select jsonb_build_array(%1$s, coalesce(s.physiotherapist_name,'—'), s.status||coalesce(' · '||nullif(s.reason,''),''),
               coalesce(to_char(s.scheduled_time,'HH24:MI'),'—')) as r
        from public.physiotherapy_sessions s join public.patients p on p.id=s.patient_id
       where %2$s and s.session_date = $1 order by s.scheduled_time nulls last$q$, gname, ntrial), d);
  t := t || public.mdr_table('Lab / scans','["Guest","Test","Lab","Status"]'::jsonb, format($q$
      select jsonb_build_array(%1$s, concat_ws(' · ', x.service_type, x.test_name), coalesce(x.laboratory_name,'—'), coalesce(x.report_status,'Ordered')) as r
        from public.diagnostic_services x join public.patients p on p.id=x.patient_id
       where %2$s and ((x.ordered_at at time zone 'Asia/Kolkata')::date = $1 or (x.report_received_at at time zone 'Asia/Kolkata')::date = $1)
       order by x.ordered_at$q$, gname, ntrial), d);
  secs := secs || jsonb_build_object('key','services','title','Care services','subtitle','Nursing procedures, physiotherapy, doctor consultations, lab and scans',
                                     'money',false,'kpis',k,'tables',t);

  -- 6. GUESTS NEEDING ATTENTION ──────────────────────────────────────
  k := '[]'; t := '[]';
  t := t || public.mdr_table('Guests needing attention','["Guest","Room","What happened"]'::jsonb, format($q$
      with ev as (
        select v.patient_id, 1 as w, 'Critical reading at '||to_char(v.recorded_at at time zone 'Asia/Kolkata','HH24:MI') as what
          from public.vital_signs v where v.alert_level='Critical' and (v.recorded_at at time zone 'Asia/Kolkata')::date = $1
        union all
        select a.patient_id, 2, a.status||' dose · '||coalesce(mo.medicine_name,'medicine')||' '||to_char(a.scheduled_time::time,'HH24:MI')
          from public.medication_administrations a left join public.medication_orders mo on mo.id=a.order_id
         where a.status in ('Missed','Refused','Withheld') and a.scheduled_date = $1
        union all
        select i.patient_id, 1, coalesce(i.incident_type,'Incident')||coalesce(' ('||i.severity||')','')
          from public.incidents i where i.patient_id is not null and (i.incident_at at time zone 'Asia/Kolkata')::date = $1
        union all
        select e.patient_id, 3, 'Escalation · '||coalesce(e.alert_type,'alert')||case when e.resolved_at is null then ' (open)' else '' end
          from public.clinical_alert_escalations e where e.patient_id is not null and (e.created_at at time zone 'Asia/Kolkata')::date = $1
        union all
        select h.patient_id, 1, 'Hospital visit · '||coalesce(h.hospital_name,'')
          from public.hospital_visit_records h where (coalesce(h.out_time,h.created_at) at time zone 'Asia/Kolkata')::date = $1
        union all
        select m.patient_id, 1, 'Medication error'||coalesce(' · '||m.error_type,'')
          from public.medication_errors m where m.patient_id is not null and (m.occurred_at at time zone 'Asia/Kolkata')::date = $1
      )
      select jsonb_build_array(%1$s, coalesce(%2$s,'—'), string_agg(ev.what, '; ' order by ev.w, ev.what)) as r
        from ev join public.patients p on p.id=ev.patient_id
       where %3$s
       group by p.id, p.title, p.full_name, p.room_no, p.bed_no
       order by min(ev.w), count(*) desc$q$, gname, groom, ntrial), d, 18);
  k := k || jsonb_build_object('label','Guests needing attention','unit','','value',coalesce((t->0->>'total')::int,0),'good','down','money',false,
                               'note','critical reading, missed / refused / withheld dose, incident, escalation, hospital visit');
  secs := secs || jsonb_build_object('key','attention','title','Guests needing attention','subtitle','Only the Guests with something to follow up today',
                                     'money',false,'kpis',k,'tables',t);

  -- 7. BILLING (money) ───────────────────────────────────────────────
  k := '[]'; t := '[]';
  k := k || public.mdr_k('Charged to Guest bills','₹', $q$select coalesce(sum(t.amount),0) from public.billing_transactions t join public.patients p on p.id=t.patient_id where not coalesce(p.is_trial,false) and t.transaction_type='Charge' and coalesce(t.source_date,(t.transaction_date at time zone 'Asia/Kolkata')::date) = $1$q$, d, null, 'up', true);
  k := k || public.mdr_k('Charge requests raised','', $q$select count(*) from public.bill_charge_requests b join public.patients p on p.id=b.patient_id where not coalesce(p.is_trial,false) and coalesce(b.status,'')<>'Cancelled' and (coalesce(b.raised_at,b.created_at) at time zone 'Asia/Kolkata')::date = $1$q$, d, 'Bills & Charges', null, true);
  k := k || public.mdr_k('Approved','₹', $q$select coalesce(sum(coalesce(b.approved_amount,b.final_amount,0)),0) from public.bill_charge_requests b join public.patients p on p.id=b.patient_id where not coalesce(p.is_trial,false) and b.approval_status in ('Approved','Partially Approved') and (coalesce(b.decision_date,b.approved_at) at time zone 'Asia/Kolkata')::date = $1$q$, d, 'by Accounts on the day', 'up', true);
  k := k || public.mdr_k('Returned to Nursing','', $q$select count(*) from public.bill_charge_requests b join public.patients p on p.id=b.patient_id where not coalesce(p.is_trial,false) and b.approval_status='Rejected' and (coalesce(b.decision_date,b.approved_at,b.updated_at) at time zone 'Asia/Kolkata')::date = $1$q$, d, null, 'down', true);
  k := k || public.mdr_k('Waiting with Accounts','₹', $q$select coalesce(sum(coalesce(b.requested_amount,b.estimated_amount,0)),0) from public.bill_charge_requests b join public.patients p on p.id=b.patient_id where not coalesce(p.is_trial,false) and coalesce(b.approval_status,'Pending')='Pending' and coalesce(b.status,'Raised') not in ('Posted','Rejected','Cancelled','Recorded') and b.billing_transaction_id is null$q$, d, 'now', 'down', true);
  t := t || public.mdr_table('Charges posted by category','["Category","Entries","₹"]'::jsonb, $q$
      select jsonb_build_array(coalesce(nullif(t.category,''),'Other'), count(*), sum(t.amount)) as r
        from public.billing_transactions t join public.patients p on p.id=t.patient_id
       where not coalesce(p.is_trial,false) and t.transaction_type='Charge'
         and coalesce(t.source_date,(t.transaction_date at time zone 'Asia/Kolkata')::date) = $1
       group by coalesce(nullif(t.category,''),'Other') order by sum(t.amount) desc$q$, d, 14, true);
  t := t || public.mdr_audit_rows(audit, array['physio_unbilled','np_started_not_charged','room_charge_missing','nursing_charge_missing'],
                                  'Care given but not charged', true);
  secs := secs || jsonb_build_object('key','billing','title','Billing','subtitle','What was charged, approved, returned — and care given but not charged',
                                     'money',true,'kpis',k,'tables',t);

  -- 8. MONEY (money) ─────────────────────────────────────────────────
  k := '[]'; t := '[]';
  k := k || public.mdr_k('Collected','₹', $q$select coalesce(sum(t.amount),0) from public.billing_transactions t join public.patients p on p.id=t.patient_id where not coalesce(p.is_trial,false) and t.transaction_type in ('Payment','Advance') and (t.transaction_date at time zone 'Asia/Kolkata')::date = $1$q$, d, 'payments + advances', 'up', true);
  k := k || public.mdr_k('Online (Razorpay)','₹', $q$select coalesce(sum(t.amount),0) from public.billing_transactions t join public.patients p on p.id=t.patient_id where not coalesce(p.is_trial,false) and t.transaction_type in ('Payment','Advance') and (coalesce(t.payment_mode,'') ilike '%razorpay%' or coalesce(t.payment_mode,'') ilike '%portal%') and (t.transaction_date at time zone 'Asia/Kolkata')::date = $1$q$, d, 'Family Portal', null, true);
  k := k || public.mdr_k('Discounts','₹', $q$select coalesce(sum(t.amount),0) from public.billing_transactions t join public.patients p on p.id=t.patient_id where not coalesce(p.is_trial,false) and t.transaction_type='Discount' and coalesce(t.source_date,(t.transaction_date at time zone 'Asia/Kolkata')::date) = $1$q$, d, null, 'down', true);
  k := k || public.mdr_k('Refunds paid','₹', $q$select coalesce(sum(t.amount),0) from public.billing_transactions t join public.patients p on p.id=t.patient_id where not coalesce(p.is_trial,false) and t.transaction_type='Refund' and (t.transaction_date at time zone 'Asia/Kolkata')::date = $1$q$, d, null, null, true);
  k := k || public.mdr_k('Expenses','₹', $q$select coalesce(sum(e.amount),0) from public.samara_monthly_expenses e where e.voided_at is null and e.expense_date = $1 and e.head !~* 'facility development'$q$, d, 'excl. Facility Development', null, true);
  k := k || public.mdr_k('Due from current Guests','₹', $q$select coalesce(sum(greatest(b,0)),0) from (select t.patient_id, sum(case when t.transaction_type in ('Charge','Refund') then t.amount when t.transaction_type in ('Payment','Advance','Discount') then -t.amount else 0 end) b from public.billing_transactions t join public.patients p on p.id=t.patient_id where not coalesce(p.is_trial,false) and coalesce(p.is_active,true) group by 1) x$q$, d, 'now, net of advances', 'down', true);
  t := t || public.mdr_table('Receipts by mode','["Mode","Receipts","₹"]'::jsonb, $q$
      select jsonb_build_array(coalesce(nullif(t.payment_mode,''),'—'), count(*), sum(t.amount)) as r
        from public.billing_transactions t join public.patients p on p.id=t.patient_id
       where not coalesce(p.is_trial,false) and t.transaction_type in ('Payment','Advance') and (t.transaction_date at time zone 'Asia/Kolkata')::date = $1
       group by coalesce(nullif(t.payment_mode,''),'—') order by sum(t.amount) desc$q$, d, 10, true);
  t := t || public.mdr_table('Receipts','["Time","Guest","Type","Mode","₹"]'::jsonb, format($q$
      select jsonb_build_array(to_char(t.transaction_date at time zone 'Asia/Kolkata','HH24:MI'), %1$s, t.transaction_type, coalesce(t.payment_mode,'—'), t.amount) as r
        from public.billing_transactions t join public.patients p on p.id=t.patient_id
       where %2$s and t.transaction_type in ('Payment','Advance','Refund') and (t.transaction_date at time zone 'Asia/Kolkata')::date = $1
       order by t.transaction_date$q$, gname, ntrial), d, 14, true);
  t := t || public.mdr_table('Expenses by head','["Head","Entries","₹"]'::jsonb, $q$
      select jsonb_build_array(coalesce(nullif(e.head,''),'Other'), count(*), sum(e.amount)) as r
        from public.samara_monthly_expenses e where e.voided_at is null and e.expense_date = $1
       group by coalesce(nullif(e.head,''),'Other') order by sum(e.amount) desc$q$, d, 10, true);
  secs := secs || jsonb_build_object('key','money','title','Money','subtitle','Collections, online payments, discounts, refunds, expenses and dues',
                                     'money',true,'kpis',k,'tables',t);

  -- 9. STAFF ──────────────────────────────────────────────────────────
  k := '[]'; t := '[]';
  k := k || public.mdr_k('Staff on the roster','', $q$select count(distinct a.employee_id) from public.duty_assignments a where a.duty_date = $1 and coalesce(a.status,'Assigned') not in ('Cancelled','Rejected','Absent') and coalesce(a.shift,'') <> 'Absent' and not coalesce(a.is_weekly_off,false)$q$, d);
  k := k || public.mdr_k('Absent','', $q$select count(distinct a.employee_id) from public.duty_assignments a where a.duty_date = $1 and (a.status='Absent' or a.shift='Absent')$q$, d, 'loss of pay', 'down');
  k := k || public.mdr_k('On leave','', $q$select count(distinct a.employee_id) from public.absence_requests a where lower(coalesce(a.status,''))='approved' and $1 between a.from_date and a.to_date$q$, d);
  k := k || public.mdr_k('Weekly off','', $q$select count(distinct a.employee_id) from public.duty_assignments a where a.duty_date = $1 and coalesce(a.is_weekly_off,false)$q$, d);
  t := t || public.mdr_table('Duty roster by shift','["Shift","Staff","Names"]'::jsonb, $q$
      select jsonb_build_array(coalesce(nullif(a.shift,''),'—'), count(distinct a.employee_id),
               string_agg(distinct coalesce(pr.full_name,'?')||coalesce(' ('||nullif(pr.role,'')||')',''), ', ')) as r
        from public.duty_assignments a left join public.profiles pr on pr.id=a.employee_id or pr.auth_user_id=a.employee_id
       where a.duty_date = $1 and coalesce(a.status,'Assigned') not in ('Cancelled','Rejected','Absent') and coalesce(a.shift,'') <> 'Absent'
         and not coalesce(a.is_weekly_off,false)
       group by coalesce(nullif(a.shift,''),'—') order by coalesce(nullif(a.shift,''),'—')$q$, d);
  t := t || public.mdr_table('Absent or on leave','["Staff","Role","Reason"]'::jsonb, $q$
      select r from (
        select jsonb_build_array(coalesce(pr.full_name,'?'), coalesce(pr.role,'—'), 'Absent (roster)') as r, 0 as o, pr.full_name as n
          from public.duty_assignments a left join public.profiles pr on pr.id=a.employee_id or pr.auth_user_id=a.employee_id
         where a.duty_date = $1 and (a.status='Absent' or a.shift='Absent')
        union all
        select jsonb_build_array(coalesce(pr.full_name,'?'), coalesce(pr.role,'—'), concat_ws(' · ', coalesce(a.leave_type, a.request_type,'Leave'),
                 to_char(a.from_date,'DD-MM')||' to '||to_char(a.to_date,'DD-MM'))), 1, pr.full_name
          from public.absence_requests a left join public.profiles pr on pr.id=a.employee_id or pr.auth_user_id=a.employee_id
         where lower(coalesce(a.status,''))='approved' and $1 between a.from_date and a.to_date
      ) z order by o, n$q$, d);
  t := t || public.mdr_audit_rows(audit, array['no_nurse_rostered','staff_not_back'], 'Roster gaps');
  secs := secs || jsonb_build_object('key','staff','title','Staff','subtitle','Who was on duty, absent or on leave — and any roster gaps',
                                     'money',false,'kpis',k,'tables',t);

  -- 10. STORES, FOOD & EQUIPMENT ─────────────────────────────────────
  k := '[]'; t := '[]';
  k := k || public.mdr_k('Indents raised','', $q$select count(*) from public.patient_consumable_indents n where (n.initiated_at at time zone 'Asia/Kolkata')::date = $1$q$, d, 'by Nursing');
  k := k || public.mdr_k('Stock received','', $q$select count(*) from public.consumable_store_receipts r where r.voided_at is null and (r.received_at at time zone 'Asia/Kolkata')::date = $1$q$, d, 'receipt lines');
  k := k || public.mdr_k('Out of stock now','', $q$select count(*) from public.consumable_store_stock s join public.consumable_store_items i on i.id=s.item_id where coalesce(s.active,true) and i.item_category in ('Consumables','Pharmacy') and s.balance_qty<=0 and s.total_in>0$q$, d, null, 'down');
  k := k || public.mdr_k('Food orders','', $q$select count(*) from public.fv_orders o where nullif(o.data->>'date','')::date = $1$q$, d, 'for the day');
  k := k || public.mdr_k('Food orders not received','', $q$select count(*) from public.fv_orders o where nullif(o.data->>'date','')::date = $1 and o.status in ('Ordered','Partial')$q$, d, null, 'down');
  k := k || public.mdr_k('Equipment faults open','', $q$select count(*) from public.bme_care_requests r where r.kind='Fault' and r.status='Pending'$q$, d, 'now', 'down');
  t := t || public.mdr_table('Indents','["Status","Indents","Items"]'::jsonb, $q$
      select jsonb_build_array(coalesce(n.status,'—'), count(*), left(string_agg(distinct n.item_name, ', '),120)) as r
        from public.patient_consumable_indents n where (n.initiated_at at time zone 'Asia/Kolkata')::date = $1
       group by n.status order by count(*) desc$q$, d);
  t := t || public.mdr_table('Food orders','["Meal","Vendor","Status"]'::jsonb, $q$
      select jsonb_build_array(coalesce(o.data->>'slot','—'), coalesce(o.data->>'vendor_name','—'), coalesce(o.status,'—')) as r
        from public.fv_orders o where nullif(o.data->>'date','')::date = $1 order by o.created_at$q$, d);
  t := t || public.mdr_audit_rows(audit, array['stock_out','stock_expired','equipment_faults'], 'Out of stock, expired, equipment faults');
  secs := secs || jsonb_build_object('key','stores','title','Stores, food & equipment','subtitle','Indents, stock, food vendor orders and equipment',
                                     'money',false,'kpis',k,'tables',t);

  -- 11. FAMILY & COMMUNICATION ───────────────────────────────────────
  k := '[]'; t := '[]';
  k := k || public.mdr_k('WhatsApp messages sent','', $q$select count(*) from public.hr_whatsapp_communications w where w.direction='outbound' and (w.created_at at time zone 'Asia/Kolkata')::date = $1$q$, d);
  k := k || public.mdr_k('WhatsApp failed','', $q$select count(*) from public.hr_whatsapp_communications w where w.direction='outbound' and w.status='Failed' and (w.created_at at time zone 'Asia/Kolkata')::date = $1$q$, d, null, 'down');
  k := k || public.mdr_k('Messages received','', $q$select count(*) from public.hr_whatsapp_communications w where w.direction='inbound' and (w.created_at at time zone 'Asia/Kolkata')::date = $1$q$, d, 'from families / vendors');
  k := k || public.mdr_k('Payment receipts sent','', $q$select count(*) from public.ledger_payment_receipts r where r.receipt_status not in ('Failed','Unknown') and (r.created_at at time zone 'Asia/Kolkata')::date = $1$q$, d);
  k := k || public.mdr_k('Family visit requests','', $q$select count(*) from public.family_visit_requests f where (f.created_at at time zone 'Asia/Kolkata')::date = $1$q$, d);
  t := t || public.mdr_table('WhatsApp by type','["Type","Sent","Failed"]'::jsonb, $q$
      select jsonb_build_array(coalesce(nullif(w.source_type,''),'WhatsApp')||' · '||coalesce(nullif(w.template_name,''),nullif(w.communication_type,''),'message'),
               count(*), count(*) filter (where w.status='Failed')) as r
        from public.hr_whatsapp_communications w
       where w.direction='outbound' and (w.created_at at time zone 'Asia/Kolkata')::date = $1
       group by coalesce(nullif(w.source_type,''),'WhatsApp')||' · '||coalesce(nullif(w.template_name,''),nullif(w.communication_type,''),'message')
       order by count(*) desc$q$, d);
  t := t || public.mdr_table('Failed messages','["Time","To","Type","Reason"]'::jsonb, $q$
      select jsonb_build_array(to_char(w.created_at at time zone 'Asia/Kolkata','HH24:MI'), coalesce(nullif(w.contact_name,''),w.recipient_number,'—'),
               coalesce(nullif(w.template_name,''),w.communication_type,'—'), left(coalesce(w.error_message,'Failed'),90)) as r
        from public.hr_whatsapp_communications w
       where w.direction='outbound' and w.status='Failed' and (w.created_at at time zone 'Asia/Kolkata')::date = $1
       order by w.created_at$q$, d);
  secs := secs || jsonb_build_object('key','family','title','Family & communication','subtitle','WhatsApp sent and failed, receipts, messages and visit requests',
                                     'money',false,'kpis',k,'tables',t);

  -- 12. EXCEPTIONS (MIS & Audit) ─────────────────────────────────────
  k := '[]'; t := '[]';
  k := k || jsonb_build_object('label','High','unit','','value',hi,'good','down','money',false,'note','care & operations');
  k := k || jsonb_build_object('label','Medium','unit','','value',me,'good','down','money',false,'note','care & operations');
  k := k || jsonb_build_object('label','Low','unit','','value',lo,'good','down','money',false,'note','care & operations');
  k := k || jsonb_build_object('label','Billing — High','unit','','value',fhi,'good','down','money',true,'note','billing & money');
  k := k || jsonb_build_object('label','Billing — Medium','unit','','value',fme,'good','down','money',true,'note','billing & money');
  t := t || jsonb_build_object('title','Care & operations findings','cols','["Level","Area","Finding","Count"]'::jsonb,
                               'rows',(select coalesce(jsonb_agg(x),'[]') from (select x from jsonb_array_elements(crows) x limit 16) z),
                               'total',jsonb_array_length(crows),'money',false,'note','Open MIS & Audit → fix each one there');
  t := t || jsonb_build_object('title','Billing & money findings','cols','["Level","Area","Finding","Count","₹"]'::jsonb,
                               'rows',(select coalesce(jsonb_agg(x),'[]') from (select x from jsonb_array_elements(frows) x limit 16) z),
                               'total',jsonb_array_length(frows),'money',true);
  secs := secs || jsonb_build_object('key','exceptions','title','Exceptions to fix','subtitle','MIS & Audit findings for the day — open MIS & Audit to fix and close each one',
                                     'money',false,'kpis',k,'tables',t);

  return jsonb_build_object('day', d, 'day_label', to_char(d,'DD-MM-YYYY'), 'weekday', trim(to_char(d,'Day')),
                            'generated_at', now(), 'generated_label', to_char(now() at time zone 'Asia/Kolkata','DD-MM-YYYY HH24:MI'),
                            'partial', d >= (now() at time zone 'Asia/Kolkata')::date, 'sections', secs);
end $f$;
revoke all on function public.mis_daily_report_core(date) from public, anon, authenticated;

-- Nursing Manager copy: money slides, money numbers and money tables removed.
create or replace function public.mdr_redact_care(p jsonb)
returns jsonb language sql immutable set search_path=public,pg_temp as $f$
  select p || jsonb_build_object('variant','care','sections',
    coalesce((select jsonb_agg(s || jsonb_build_object(
        'kpis',   coalesce((select jsonb_agg(k) from jsonb_array_elements(coalesce(s->'kpis','[]')) k where not coalesce((k->>'money')::boolean,false)),'[]'::jsonb),
        'tables', coalesce((select jsonb_agg(t) from jsonb_array_elements(coalesce(s->'tables','[]')) t where not coalesce((t->>'money')::boolean,false)),'[]'::jsonb))
        order by o)
      from jsonb_array_elements(coalesce(p->'sections','[]')) with ordinality x(s,o)
     where not coalesce((s->>'money')::boolean,false)),'[]'::jsonb))
$f$;
revoke all on function public.mdr_redact_care(jsonb) from public, anon, authenticated;

-- Saved copy for a finished day (prepared once; p_refresh replaces it).
create or replace function public.mdr_get_or_prepare(p_day date, p_refresh boolean, p_by uuid, p_by_name text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare today date := (now() at time zone 'Asia/Kolkata')::date; r jsonb; saved public.mis_daily_reports%rowtype;
begin
  if p_day > today then raise exception 'The report for % is not available yet.', to_char(p_day,'DD-MM-YYYY'); end if;
  if p_day = today then return public.mis_daily_report_core(p_day) || jsonb_build_object('saved',false); end if;
  select * into saved from public.mis_daily_reports where report_day = p_day;
  if found and not coalesce(p_refresh,false) then
    return saved.payload || jsonb_build_object('saved',true,'saved_label',to_char(saved.generated_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH24:MI'),
                                               'saved_by',saved.generated_by_name,'prepared_count',saved.prepared_count);
  end if;
  r := public.mis_daily_report_core(p_day);
  insert into public.mis_daily_reports(report_day, payload, generated_at, generated_by, generated_by_name)
  values (p_day, r, now(), p_by, p_by_name)
  on conflict (report_day) do update set payload=excluded.payload, generated_at=now(), generated_by=excluded.generated_by,
         generated_by_name=excluded.generated_by_name, prepared_count=public.mis_daily_reports.prepared_count+1;
  return r || jsonb_build_object('saved',true,'saved_label',to_char(now() at time zone 'Asia/Kolkata','DD-MM-YYYY HH24:MI'),'saved_by',p_by_name);
end $f$;
revoke all on function public.mdr_get_or_prepare(date,boolean,uuid,text) from public, anon, authenticated;

-- ERP page: Admin = full, Nursing Manager = without money. Only Admin can "Prepare again".
create or replace function public.mis_daily_report(p_day date default null, p_refresh boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare me public.profiles%rowtype; v text; d date := coalesce(p_day, (now() at time zone 'Asia/Kolkata')::date - 1); r jsonb;
begin
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  select * into me from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and coalesce(p.is_active,true)
   order by (p.role='Admin') desc limit 1;
  v := case when me.id is null then null else public.mdr_viewer_variant(me) end;
  if v is null then raise exception 'The Daily Report is available to Admin / Directors and the Nursing Manager only.'; end if;
  perform set_config('statement_timeout','170s',true);
  r := public.mdr_get_or_prepare(d, coalesce(p_refresh,false) and v='full', me.id, me.full_name);
  if v = 'care' then return public.mdr_redact_care(r); end if;
  return r || jsonb_build_object('variant','full');
end $f$;
revoke all on function public.mis_daily_report(date,boolean) from public, anon;
grant execute on function public.mis_daily_report(date,boolean) to authenticated;

-- Edge Function (service role): the saved copy for the WhatsApp PDF.
-- (also used by the ERP page when its own call takes too long: p_refresh / p_by / p_by_name then come from the page)
drop function if exists public.mis_daily_report_service(date,text);
create or replace function public.mis_daily_report_service(p_day date default null, p_variant text default 'full',
                                                           p_refresh boolean default false, p_by uuid default null, p_by_name text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare d date := coalesce(p_day, (now() at time zone 'Asia/Kolkata')::date - 1); r jsonb;
begin
  perform set_config('statement_timeout','170s',true);
  r := public.mdr_get_or_prepare(d, coalesce(p_refresh,false) and p_variant='full', p_by, coalesce(p_by_name,'Morning WhatsApp run'));
  if p_variant = 'care' then return public.mdr_redact_care(r); end if;
  return r || jsonb_build_object('variant','full');
end $f$;
revoke all on function public.mis_daily_report_service(date,text,boolean,uuid,text) from public, anon, authenticated;
grant execute on function public.mis_daily_report_service(date,text,boolean,uuid,text) to service_role;

-- Edge Function (service role): who gets it. Admin → full; Nursing Manager → care (Admin wins if both).
create or replace function public.mis_daily_report_recipients()
returns table(profile_id uuid, recipient_name text, phone text, variant text)
language sql stable security definer set search_path=public,pg_temp as $f$
  with x as (
    select p.id, coalesce(p.full_name, p.login_id) as nm,
           case when length(regexp_replace(coalesce(p.mobile,''),'\D','','g')) = 10 then '91'||regexp_replace(p.mobile,'\D','','g')
                else regexp_replace(coalesce(p.mobile,''),'\D','','g') end as ph,
           public.mdr_viewer_variant(p) as v
      from public.profiles p
     where coalesce(p.is_active,true) and coalesce(p.active,true)
  )
  select distinct on (ph) id, nm, ph, v from x
   where v is not null and length(ph) >= 12
   order by ph, (v='full') desc
$f$;
revoke all on function public.mis_daily_report_recipients() from public, anon, authenticated;
grant execute on function public.mis_daily_report_recipients() to service_role;

-- 07:01, 07:31, 08:01, 08:31, 09:01 IST (the function skips anyone already sent; sends nothing until enabled).
do $$
declare base_cmd text; new_cmd text;
begin
  if not exists(select 1 from pg_namespace where nspname='cron') then raise notice 'pg_cron not installed; Daily Report job not scheduled.'; return; end if;
  select command into base_cmd from cron.job where jobname = 'samara-clinical-push-dispatch' limit 1;
  if base_cmd is null or base_cmd not like '%/functions/v1/clinical-push-dispatch%' then
    raise notice 'samara-clinical-push-dispatch cron job not found; Daily Report job not scheduled.';
    return;
  end if;
  new_cmd := replace(base_cmd, '/functions/v1/clinical-push-dispatch', '/functions/v1/mis-daily-report-dispatch');
  perform cron.unschedule(jobid) from cron.job where jobname = 'samara-mis-daily-report';
  perform cron.schedule('samara-mis-daily-report', '1,31 1-3 * * *', new_cmd);
end $$;

notify pgrst, 'reload schema';
commit;

-- Check: the job, who would receive it, and yesterday's report (prepares and saves it)
select jobname, schedule from cron.job where jobname = 'samara-mis-daily-report';
select * from public.mis_daily_report_recipients();
select jsonb_path_query_array(public.mis_daily_report_service(null,'full'), '$.sections[*].title') as slides;
