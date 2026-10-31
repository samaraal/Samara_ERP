-- 2.19.22 (31-10-2026): MIS & Audit — Admin can close a finding with remarks; findings open the exact record;
-- physiotherapy session held back by a manual charge is billed once that manual charge is rejected.
--
-- Found on 31-10-2026 (Mr. JOSEPH A A E FERNANDO): the 2nd physiotherapy session of the day (Dr. Satheesh S,
-- 4:10–5:10 PM, recorded 6:39 PM) was NOT charged. At 10:51 AM a nurse had raised a manual "Additional
-- Physiotherapy Session" charge for the same day. While that manual charge was still Pending, the automatic
-- session charge stepped back (to avoid charging twice). At 9:00 PM Accounts rejected the manual charge
-- ("already charged for regular physiotherapy") — but nothing re-raised the evening session, so it stayed unbilled.
--
-- A. Fix: when a manual Physiotherapy charge is Rejected / Returned / deleted, the completed sessions of that
--    Guest on that date that were held back are sent to Accounts automatically (normal Pending charge request).
-- B. Now: every such held-back session is sent to Accounts (Mr. Fernando's 31-10-2026 evening session, ₹800 at
--    his agreed rate). Accounts still approves it before it reaches the bill.
-- C. MIS findings can be CLOSED by Admin / Directors with remarks (who / when kept). A closed item no longer
--    counts (also not in the morning WhatsApp summary); it is listed under "Closed" with the remarks and can be
--    reopened with a reason.
-- D. Each finding row carries a reference to its record. The physiotherapy checks open the exact Guest and
--    session in Physiotherapy Dashboard → Patient Rates & Billing.
-- Safe to run more than once.

begin;

-- C. closures --------------------------------------------------------------------------------------------------
create table if not exists public.mis_finding_closures(
  id uuid primary key default gen_random_uuid(),
  check_key text not null,
  ref text not null,
  check_title text,
  row_snapshot jsonb,
  remarks text not null check (length(trim(remarks)) >= 5),
  closed_by uuid,
  closed_by_name text,
  closed_at timestamptz not null default now(),
  reopened_at timestamptz,
  reopened_by uuid,
  reopened_by_name text,
  reopen_remarks text
);
create unique index if not exists mis_finding_closures_open_uq on public.mis_finding_closures(check_key, ref) where reopened_at is null;
alter table public.mis_finding_closures enable row level security;
revoke all on public.mis_finding_closures from public, anon, authenticated;

create or replace function public.mis_is_admin() returns boolean language sql stable security definer
set search_path=public,pg_temp as $$
  select auth.uid() is not null and exists(select 1 from public.profiles p
    where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and coalesce(p.is_active,true) and p.role='Admin')
$$;
revoke all on function public.mis_is_admin() from public, anon;

create or replace function public.mis_close_finding(p_check_key text, p_ref text, p_remarks text,
                                                   p_title text default null, p_row jsonb default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_name text;
begin
  if not public.mis_is_admin() then raise exception 'Only Admin / Directors can close MIS findings'; end if;
  if nullif(trim(coalesce(p_check_key,'')),'') is null or nullif(trim(coalesce(p_ref,'')),'') is null then
    raise exception 'Finding not identified — press Re-check and try again'; end if;
  if length(trim(coalesce(p_remarks,''))) < 5 then raise exception 'Enter remarks (at least 5 letters) to close this finding'; end if;
  select coalesce(nullif(full_name,''),'Admin') into v_name from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  select id into v_id from public.mis_finding_closures where check_key=p_check_key and ref=p_ref and reopened_at is null;
  if v_id is not null then return jsonb_build_object('id',v_id,'already_closed',true); end if;
  insert into public.mis_finding_closures(check_key,ref,check_title,row_snapshot,remarks,closed_by,closed_by_name)
  values(p_check_key,p_ref,p_title,p_row,trim(p_remarks),auth.uid(),coalesce(v_name,'Admin')) returning id into v_id;
  perform public.record_audit_event('MIS Finding Closed','MIS & Audit',v_id::text,
    jsonb_build_object('check',p_check_key,'title',p_title,'row',p_row,'remarks',trim(p_remarks)),'Success');
  return jsonb_build_object('id',v_id);
end $$;
revoke all on function public.mis_close_finding(text,text,text,text,jsonb) from public, anon;
grant execute on function public.mis_close_finding(text,text,text,text,jsonb) to authenticated;

create or replace function public.mis_reopen_finding(p_id uuid, p_remarks text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_name text;
begin
  if not public.mis_is_admin() then raise exception 'Only Admin / Directors can reopen MIS findings'; end if;
  if length(trim(coalesce(p_remarks,''))) < 5 then raise exception 'Enter the reason for reopening (at least 5 letters)'; end if;
  select coalesce(nullif(full_name,''),'Admin') into v_name from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  update public.mis_finding_closures set reopened_at=now(), reopened_by=auth.uid(), reopened_by_name=coalesce(v_name,'Admin'),
         reopen_remarks=trim(p_remarks)
   where id=p_id and reopened_at is null;
  if not found then raise exception 'This finding is not closed (already reopened?)'; end if;
  perform public.record_audit_event('MIS Finding Reopened','MIS & Audit',p_id::text,jsonb_build_object('remarks',trim(p_remarks)),'Success');
  return jsonb_build_object('id',p_id);
end $$;
revoke all on function public.mis_reopen_finding(uuid,text) from public, anon;
grant execute on function public.mis_reopen_finding(uuid,text) to authenticated;

-- C + D. mis_check: same as SQL 324 (period rule) plus a reference per row and closed items left out of the count.
--   A check query may add optional columns: ref_id (the record), patient_id, ref_kind, ref_page, ref_date.
--   Without ref_id the row is identified by its date + Guest/Staff + detail.
create or replace function public.mis_check(p_key text, p_title text, p_severity text, p_page text, p_detail text,
                                            p_sql text, p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare n int; amt numeric; rows jsonb; nc int; crows jsonb; v_sql text := p_sql; v_detail text := p_detail;
  current_keys constant text[] := array['rate_not_set','store_rate_not_set','high_dues','consent_pending',
                                        'stock_out','stock_low','stock_expired','stock_expiring','equipment_service'];
begin
  if p_key = any(current_keys) then
    v_detail := concat_ws(' ', p_detail, '(Current status — shown for every period.)');
  elsif position('$1' in p_sql) = 0 then
    v_sql := format($w$select * from (%s) z0 where z0.sort_at is not null
                       and (z0.sort_at at time zone 'Asia/Kolkata')::date between $1 and $2$w$, p_sql);
  end if;
  execute format($q$
    with q0 as (%s),
    q as (select q0.*, coalesce(nullif(to_jsonb(q0)->>'ref_id',''), md5(concat_ws('|',q0.date,q0.who,q0.detail))) as mis_ref from q0),
    cl as (select c.id as cl_id, c.ref, c.remarks, c.closed_by_name, c.closed_at from public.mis_finding_closures c
            where c.check_key = %L and c.reopened_at is null),
    o as (select q.* from q where not exists(select 1 from cl where cl.ref = q.mis_ref)),
    x as (select q.*, cl.cl_id, cl.remarks as cl_remarks, cl.closed_by_name as cl_by, cl.closed_at as cl_at from q join cl on cl.ref = q.mis_ref)
    select (select count(*)::int from o), (select sum(amount) from o),
           coalesce((select jsonb_agg(jsonb_build_object('date',z.date,'who',z.who,'detail',z.detail,'amount',z.amount,'ref',z.mis_ref)
                                      || jsonb_strip_nulls(jsonb_build_object('ref_id',to_jsonb(z)->>'ref_id','patient_id',to_jsonb(z)->>'patient_id',
                                           'ref_kind',to_jsonb(z)->>'ref_kind','ref_page',to_jsonb(z)->>'ref_page','ref_date',to_jsonb(z)->>'ref_date')))
                       from (select * from o order by sort_at desc nulls last limit 25) z), '[]'::jsonb),
           (select count(*)::int from x),
           coalesce((select jsonb_agg(jsonb_build_object('date',z.date,'who',z.who,'detail',z.detail,'amount',z.amount,'ref',z.mis_ref,
                                        'closure_id',z.cl_id,'remarks',z.cl_remarks,'closed_by',z.cl_by,'closed_at',z.cl_at))
                       from (select * from x order by cl_at desc limit 25) z), '[]'::jsonb) $q$, v_sql, p_key)
  into n, amt, rows, nc, crows using p_from, p_to;
  return jsonb_build_object('key',p_key,'title',p_title,'severity',p_severity,'page',p_page,'detail',v_detail,
                            'count',coalesce(n,0),'amount',amt,'rows',rows,'closed_count',coalesce(nc,0),'closed_rows',crows);
exception when others then
  return jsonb_build_object('key',p_key,'title',p_title,'severity',p_severity,'page',p_page,'detail',v_detail,
                            'count',0,'rows','[]'::jsonb,'error',left(sqlerrm,300));
end $f$;
revoke all on function public.mis_check(text,text,text,text,text,text,date,date) from public, anon, authenticated;

-- D. physiotherapy checks carry the session / Guest so a tap opens that exact record (text patch, each once)
do $patch$
declare
  fn text; def text; upd text; i int;
  refs constant text := $r$, s.id::text as ref_id, s.patient_id, 'physio_billing'::text as ref_kind, 'Physiotherapy Dashboard'::text as ref_page, s.session_date as ref_date$r$;
  patches text[][] := array[
    array['public.mis_section_financial(date,date)', 'f.fee as amount',
          'f.fee as amount'||refs],
    array['public.mis_section_financial(date,date)', $o$left(r.notes,60) as detail, null::numeric as amount$o$,
          $o$left(r.notes,60) as detail, null::numeric as amount, r.id::text as ref_id, r.patient_id, 'physio_rate'::text as ref_kind, 'Physiotherapy Dashboard'::text as ref_page, r.effective_from as ref_date$o$],
    array['public.mis_section_clinical(date,date)', $o$s.status||coalesce(' · '||nullif(s.reason,''),'') as detail, null::numeric as amount$o$,
          $o$s.status||coalesce(' · '||nullif(s.reason,''),'') as detail, null::numeric as amount, s.id::text as ref_id, s.patient_id, 'physio_session'::text as ref_kind, 'Physiotherapy Dashboard'::text as ref_page, s.session_date as ref_date$o$],
    array['public.mis_section_analysis(date,date)', 'l.amount as amount',
          $o$l.amount as amount, coalesce(s.id::text, l.id::text) as ref_id, s.patient_id, 'physio_billing'::text as ref_kind, 'Physiotherapy Dashboard'::text as ref_page, s.session_date as ref_date$o$],
    array['public.mis_section_analysis(date,date)', 'f.fee - coalesce(b.approved_amount,b.final_amount,b.requested_amount) as amount',
          'f.fee - coalesce(b.approved_amount,b.final_amount,b.requested_amount) as amount'||refs]
  ];
begin
  for i in 1..array_length(patches,1) loop
    fn := patches[i][1];
    def := pg_get_functiondef(fn::regprocedure);
    if position(patches[i][3] in def) > 0 then continue; end if;          -- already patched
    if (length(def) - length(replace(def, patches[i][2], ''))) / length(patches[i][2]) <> 1 then
      raise notice 'MIS patch % skipped in %: text not found exactly once', i, fn; continue;
    end if;
    upd := replace(def, patches[i][2], patches[i][3]);
    execute upd;
  end loop;
end $patch$;

-- A. re-queue physiotherapy sessions held back by a manual charge once that charge is rejected / returned / removed
create or replace function public.physio_requeue_after_manual_charge() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; v_patient uuid; v_date date;
begin
  if tg_op = 'DELETE' then
    if old.category is distinct from 'Physiotherapy' or old.physiotherapy_session_id is not null then return old; end if;
    v_patient := old.patient_id; v_date := old.charge_date;
  else
    if new.category is distinct from 'Physiotherapy' or new.physiotherapy_session_id is not null then return new; end if;
    if coalesce(new.approval_status,'Pending') not in ('Rejected','Returned') and coalesce(new.status,'') not in ('Rejected','Returned') then return new; end if;
    v_patient := new.patient_id; v_date := new.charge_date;
  end if;
  for r in select s.id from public.physiotherapy_sessions s
            where s.patient_id = v_patient and s.session_date = v_date and s.status = 'Completed' and s.charge_request_id is null
            order by s.session_at nulls last, s.id loop
    perform public.queue_patient_physio_charge(r.id);
  end loop;
  return coalesce(new, old);
exception when others then
  -- never block the Accounts decision itself
  raise warning 'physio re-queue after manual charge: %', sqlerrm;
  return coalesce(new, old);
end $$;
revoke all on function public.physio_requeue_after_manual_charge() from public, anon, authenticated;
drop trigger if exists physio_requeue_after_manual_charge on public.bill_charge_requests;
create trigger physio_requeue_after_manual_charge
  after update of approval_status, status or delete on public.bill_charge_requests
  for each row execute function public.physio_requeue_after_manual_charge();

-- B. send every completed session that is now free to bill (no manual charge pending, Guest rate set) to Accounts
do $$
declare r record; n int := 0; v uuid;
begin
  for r in select s.id from public.physiotherapy_sessions s join public.patients p on p.id = s.patient_id
            where s.status = 'Completed' and s.charge_request_id is null and p.is_active is true
              and coalesce(p.admission_status,'') <> 'Discharged' and not coalesce(p.is_trial,false)
              and s.session_date <= (now() at time zone 'Asia/Kolkata')::date
            order by s.session_date, s.id loop
    v := public.queue_patient_physio_charge(r.id);
    if v is not null then n := n + 1; end if;
  end loop;
  raise notice 'Physiotherapy sessions sent to Accounts: %', n;
end $$;

notify pgrst, 'reload schema';
commit;

-- Check: physiotherapy sessions still not billed (should be none unless the Guest rate is not set)
select p.full_name, s.session_date, s.physiotherapist_name, s.status, s.charge_request_id,
       b.approval_status, b.requested_amount
  from public.physiotherapy_sessions s join public.patients p on p.id = s.patient_id
  left join public.bill_charge_requests b on b.id = s.charge_request_id
 where s.session_date >= (now() at time zone 'Asia/Kolkata')::date - 2 and s.status = 'Completed'
 order by s.session_date desc, s.session_at desc;
