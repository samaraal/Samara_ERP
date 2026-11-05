-- 340 — Physiotherapy session charge RETURNED by Accounts goes back to Nursing to check, correct and return — ERP 2.19.64
-- Run once in Supabase > SQL Editor. Safe to run more than once.
--
-- Before: a session charge (raised automatically when a session is marked Completed) that Accounts RETURNED was a
-- dead end — the nurse got no alert, "Correct & Resubmit" was blocked, and Session options was blocked too
-- ("Billing-linked session: Accounts must review the charge first").
--
-- Now:
--  1. When Accounts return a session charge, the session is freed from it (the returned request keeps a reference
--     to the session in physio_session_ref for audit). The nurse who recorded the session gets the usual Return
--     alert; Nursing Manager and Admin see it too. The session is NOT re-billed automatically while it is returned.
--  2. The nurse checks the session in Physiotherapy → "Returned by Accounts":
--       • wrong date / time / therapist / status → Session options → Modify (or Delete if it never happened);
--         Nursing Manager / Admin approve as usual. On approval:
--           – still Completed      → a fresh charge goes to Accounts at the Guest's agreed rate, linked to the returned one
--           – Pending / Not Done / deleted → no charge; the return is closed
--       • session is correct → "Send back to Accounts" with a remark (goes straight to Accounts).
--  3. Wrong rate is for Admin / Director: fix the Guest rate in Patient Rates & Billing, then "Send back to Accounts".
--  4. Returns that already exist (made before this file) are opened for correction the same way.
-- Accounts still approve every charge before it reaches the bill / Family Portal. Nurses never see prices.

begin;

alter table public.bill_charge_requests add column if not exists physio_session_ref uuid;
alter table public.bill_charge_requests add column if not exists physio_return_closed_at timestamptz;
alter table public.bill_charge_requests add column if not exists physio_return_closed_by uuid;
alter table public.bill_charge_requests add column if not exists physio_return_note text;
create index if not exists bill_charge_requests_physio_session_ref on public.bill_charge_requests(physio_session_ref) where physio_session_ref is not null;

-- A. Let only this file's own functions move a returned request off its session (the guard keeps everything else fixed).
do $patch$
declare def text;
begin
  def := pg_get_functiondef('public.guard_patient_physio_charge()'::regprocedure);
  if strpos(def, '-- 340 return unlink') = 0 then
    if def !~ '\mbegin\M' then raise exception 'guard_patient_physio_charge: begin not found'; end if;
    def := regexp_replace(def, '\mbegin\M',
      'begin' || chr(10) || ' -- 340 return unlink' || chr(10) ||
      ' if tg_op=''UPDATE'' and coalesce(current_setting(''samara.physio_return_unlink'',true),'''')=''on'' then return new;end if;');
    execute def;
  end if;
end $patch$;

-- B. A session with an open return is not billed again automatically — only when Nursing / Admin send it back.
do $patch$
declare def text; anchor text := 'if s.charge_request_id is not null then return s.charge_request_id;end if;';
begin
  def := pg_get_functiondef('public.queue_patient_physio_charge(uuid)'::regprocedure);
  if strpos(def, '-- 340 hold returned') = 0 then
    if strpos(def, anchor) = 0 then raise exception 'queue_patient_physio_charge: anchor text not found (schema drift) — stop and check'; end if;
    def := replace(def, anchor, anchor || chr(10) || ' -- 340 hold returned' || chr(10) ||
      ' if coalesce(current_setting(''samara.physio_resend'',true),'''')<>''on'' and exists(select 1 from public.bill_charge_requests x where x.physio_session_ref=s.id and x.approval_status=''Rejected'' and x.resubmitted_as is null and x.physio_return_closed_at is null) then return null;end if;');
    execute def;
  end if;
end $patch$;

-- C. Free a returned request's session.
create or replace function public.physio_unlink_returned_charge(p_request uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.bill_charge_requests%rowtype; s public.physiotherapy_sessions%rowtype;
begin
  select * into r from public.bill_charge_requests where id=p_request for update;
  if not found or r.physiotherapy_session_id is null or coalesce(r.approval_status,'')<>'Rejected' then return; end if;
  perform set_config('samara.physio_return_unlink','on',true);
  update public.bill_charge_requests set physio_session_ref=r.physiotherapy_session_id, physiotherapy_session_id=null, updated_at=now() where id=r.id;
  select * into s from public.physiotherapy_sessions where id=r.physiotherapy_session_id for update;
  if not found then
    update public.bill_charge_requests set physio_return_closed_at=now(), physio_return_note='Session no longer exists' where id=r.id;
  elsif s.charge_request_id is not null and s.charge_request_id<>r.id then
    update public.bill_charge_requests set physio_return_closed_at=now(), physio_return_note='Session already has another charge request' where id=r.id;
  else
    update public.physiotherapy_sessions set charge_request_id=null, billable=false, billing_rate=null, updated_at=now() where id=s.id;
  end if;
  perform set_config('samara.physio_return_unlink','off',true);
  perform public.record_audit_event('Physiotherapy Charge Returned — session opened for correction','Physiotherapy',r.physiotherapy_session_id::text,
    jsonb_build_object('request_id',r.id,'returned_by',r.decision_by_name,'reason',r.approval_remarks),'Success');
end $$;
revoke all on function public.physio_unlink_returned_charge(uuid) from public, anon, authenticated;

create or replace function public.physio_charge_returned_trigger() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.physiotherapy_session_id is not null and new.approval_status='Rejected' and old.approval_status is distinct from 'Rejected' then
    begin
      perform public.physio_unlink_returned_charge(new.id);
    exception when others then
      raise warning 'physio return unlink failed for %: %', new.id, sqlerrm;   -- never block the Accounts decision
    end;
  end if;
  return null;
end $$;
revoke all on function public.physio_charge_returned_trigger() from public, anon, authenticated;
drop trigger if exists physio_charge_returned on public.bill_charge_requests;
create trigger physio_charge_returned after update of approval_status on public.bill_charge_requests
  for each row execute function public.physio_charge_returned_trigger();

-- D. Send a returned session to Accounts again (after correction, or unchanged with a remark). Returns the new request id or null.
create or replace function public.physio_resend_returned_internal(p_session uuid, p_note text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare nid uuid; v_name text;
begin
  perform set_config('samara.physio_resend','on',true);
  nid := public.queue_patient_physio_charge(p_session);
  perform set_config('samara.physio_resend','off',true);
  if nid is null then return null; end if;
  select coalesce(nullif(full_name,''),'Staff') into v_name from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  perform set_config('samara.physio_return_unlink','on',true);
  update public.bill_charge_requests set resubmitted_as=nid, resubmitted_at=now(), resubmitted_by_name=coalesce(v_name,'Staff'),
         physio_return_note=nullif(trim(coalesce(p_note,'')),''), updated_at=now()
   where physio_session_ref=p_session and approval_status='Rejected' and resubmitted_as is null and physio_return_closed_at is null;
  update public.bill_charge_requests set resubmitted_from=(select x.id from public.bill_charge_requests x where x.resubmitted_as=nid order by x.updated_at desc limit 1),
         remarks=concat_ws(' · ',remarks,'Sent again after Accounts return'||coalesce(': '||nullif(trim(coalesce(p_note,'')),''),'')), updated_at=now()
   where id=nid;
  perform set_config('samara.physio_return_unlink','off',true);
  perform public.record_audit_event('Physiotherapy Returned Charge Sent Again','Physiotherapy',p_session::text,jsonb_build_object('request_id',nid,'note',p_note),'Success');
  return nid;
end $$;
revoke all on function public.physio_resend_returned_internal(uuid,text) from public, anon, authenticated;

create or replace function public.physio_close_returned_internal(p_session uuid, p_note text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform set_config('samara.physio_return_unlink','on',true);
  update public.bill_charge_requests set physio_return_closed_at=now(), physio_return_closed_by=auth.uid(), physio_return_note=p_note, updated_at=now()
   where physio_session_ref=p_session and approval_status='Rejected' and resubmitted_as is null and physio_return_closed_at is null;
  perform set_config('samara.physio_return_unlink','off',true);
  perform public.record_audit_event('Physiotherapy Returned Charge Closed','Physiotherapy',p_session::text,jsonb_build_object('note',p_note),'Success');
end $$;
revoke all on function public.physio_close_returned_internal(uuid,text) from public, anon, authenticated;

-- Nurse / Nursing Manager / Admin: session checked and correct → send back to Accounts.
create or replace function public.physio_resend_returned_charge(p_session uuid, p_note text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.physiotherapy_sessions%rowtype; nid uuid;
begin
  if auth.uid() is null or not (public.current_user_has_role(array['Nurse','Manager','Admin']) or public.physiotherapy_can_review()) then
    raise exception 'Only Nursing or Admin can send a returned physiotherapy charge back to Accounts'; end if;
  if length(trim(coalesce(p_note,''))) < 5 then raise exception 'Enter a remark for Accounts (what you checked)'; end if;
  if not exists(select 1 from public.bill_charge_requests where physio_session_ref=p_session and approval_status='Rejected' and resubmitted_as is null and physio_return_closed_at is null) then
    raise exception 'This session has no returned charge waiting'; end if;
  select * into s from public.physiotherapy_sessions where id=p_session for update;
  if not found then raise exception 'Session no longer exists'; end if;
  if s.status<>'Completed' then raise exception 'Only a Completed session can be charged. Use Session options to correct it'; end if;
  if exists(select 1 from public.physiotherapy_corrections where session_id=s.id and state in ('Pending','Applying')) then
    raise exception 'A correction for this session is waiting for approval. It goes to Accounts automatically once approved'; end if;
  nid := public.physio_resend_returned_internal(s.id, trim(p_note));
  if nid is null then
    raise exception 'Not sent: no Guest physiotherapy rate set by Admin / Director for this date, the Guest is discharged, or a manual physiotherapy charge exists for that day';
  end if;
  return jsonb_build_object('request_id',nid);
end $$;
revoke all on function public.physio_resend_returned_charge(uuid,text) from public, anon;
grant execute on function public.physio_resend_returned_charge(uuid,text) to authenticated;

-- E. When a correction of a returned session is approved: still Completed → to Accounts; otherwise close the return.
create or replace function public.physio_correction_resolves_return() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.physiotherapy_sessions%rowtype; nid uuid;
begin
  if new.state<>'Approved' or old.state='Approved' then return null; end if;
  if not exists(select 1 from public.bill_charge_requests where physio_session_ref=new.session_id and approval_status='Rejected' and resubmitted_as is null and physio_return_closed_at is null) then return null; end if;
  begin
    select * into s from public.physiotherapy_sessions where id=new.session_id;
    if not found then
      perform public.physio_close_returned_internal(new.session_id, 'Session deleted after correction: '||new.reason);
    elsif s.status='Completed' then
      nid := public.physio_resend_returned_internal(s.id, 'Corrected ('||new.action||'): '||new.reason);
      -- nid null = no Guest rate yet → stays in "Returned by Accounts" for Admin
    else
      perform public.physio_close_returned_internal(s.id, 'Corrected to '||s.status||' — no charge: '||new.reason);
    end if;
  exception when others then
    raise warning 'physio return follow-up failed for session %: %', new.session_id, sqlerrm;  -- never block the approval
  end;
  return null;
end $$;
revoke all on function public.physio_correction_resolves_return() from public, anon, authenticated;
drop trigger if exists physio_correction_resolves_return on public.physiotherapy_corrections;
create trigger physio_correction_resolves_return after update of state on public.physiotherapy_corrections
  for each row execute function public.physio_correction_resolves_return();

-- F. List for the Physiotherapy page (prices only for Admin / Accounts).
create or replace function public.physio_returned_charges() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare can_price boolean;
begin
  if auth.uid() is null or not (public.current_user_has_role(array['Nurse','Caregiver','Manager','Admin','Accounts']) or public.physiotherapy_can_review()) then return '[]'::jsonb; end if;
  can_price := public.current_user_has_role(array['Admin','Accounts']);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'request_id',b.id,'session_id',b.physio_session_ref,'patient_id',b.patient_id,
      'guest_name',nullif(trim(concat_ws(' ',p.title,p.full_name)),''),'room_no',p.room_no,
      'session_date',coalesce(s.session_date,b.charge_date),'actual_time',s.actual_time,'session_status',s.status,
      'physiotherapist',coalesce(s.physiotherapist_name,b.service_provider),
      'raised_by_name',b.raised_by_name,'returned_by_name',b.decision_by_name,
      'reason',nullif(trim(coalesce(b.approval_remarks,'')),''),'returned_at',coalesce(b.decision_date,b.approved_at,b.updated_at),
      'correction_pending',exists(select 1 from public.physiotherapy_corrections c where c.session_id=b.physio_session_ref and c.state in ('Pending','Applying')),
      'has_rate',exists(select 1 from public.patient_physio_rates r where r.patient_id=b.patient_id and r.effective_from<=coalesce(s.session_date,b.charge_date)),
      'amount',case when can_price then b.requested_amount end) order by coalesce(b.decision_date,b.approved_at,b.updated_at) desc)
    from public.bill_charge_requests b
    join public.patients p on p.id=b.patient_id
    left join public.physiotherapy_sessions s on s.id=b.physio_session_ref
    where b.physio_session_ref is not null and b.approval_status='Rejected' and b.resubmitted_as is null and b.physio_return_closed_at is null
  ),'[]'::jsonb);
end $$;
revoke all on function public.physio_returned_charges() from public, anon;
grant execute on function public.physio_returned_charges() to authenticated;

-- G. Return alerts (SQL 301): include physiotherapy returns, stop when closed, and tell the app which session to open.
do $patch$
declare def text;
begin
  def := pg_get_functiondef('public.charge_return_rows(timestamptz)'::regprocedure);
  if strpos(def, 'physio_return_closed_at is null') = 0 then
    if strpos(def, 'and r.resubmitted_as is null') = 0 then raise notice 'charge_return_rows: anchor not found — physio returns not added to alerts';
    else
      def := replace(def, 'and r.resubmitted_as is null', 'and r.resubmitted_as is null and r.physio_return_closed_at is null');
      execute def;
    end if;
  end if;
  def := pg_get_functiondef('public.charge_return_alerts()'::regprocedure);
  if strpos(def, 'physio_session_id') = 0 then
    if strpos(def, 'jsonb_build_object(''audience'',') = 0 then raise notice 'charge_return_alerts: anchor not found — alert opens Bills & Charges';
    else
      def := replace(def, 'jsonb_build_object(''audience'',',
        'jsonb_build_object(''physio_session_id'',(select b.physio_session_ref from public.bill_charge_requests b where b.id=x.request_id),''audience'',');
      execute def;
    end if;
  end if;
end $patch$;

-- H. Bills & Charges "Correct & Resubmit" must not be used for a physiotherapy session charge (it is corrected in Physiotherapy).
do $patch$
declare fn text; def text; anchor text := 'if o.resubmitted_as is not null then raise exception ''This returned request has already been resubmitted''; end if;';
begin
  foreach fn in array array['public.mark_charge_request_resubmitted(uuid,uuid)','public.resubmit_returned_charge_as_service(uuid,text,numeric,timestamptz,text)'] loop
    if to_regprocedure(fn) is null then continue; end if;
    def := pg_get_functiondef(fn::regprocedure);
    if strpos(def, '-- 340 physio') > 0 then continue; end if;
    if strpos(def, anchor) = 0 then raise notice '% : anchor not found — skipped', fn; continue; end if;
    def := replace(def, anchor, anchor || chr(10) || '  -- 340 physio' || chr(10) ||
      '  if o.physio_session_ref is not null then raise exception ''Physiotherapy session charges are corrected in Physiotherapy → Returned by Accounts''; end if;');
    execute def;
  end loop;
end $patch$;

-- I. Admin / Accounts unbilled list: say why a returned session is waiting.
do $patch$
declare def text; anchor text := 'case when public.charge_category_requires_approval(''Physiotherapy'') then';
begin
  def := pg_get_functiondef('public.physio_unbilled_alerts()'::regprocedure);
  if strpos(def, '-- 340') = 0 and strpos(def, anchor) > 0 then
    def := replace(def, anchor, 'case /* -- 340 */ when exists(select 1 from public.bill_charge_requests rb where rb.physio_session_ref=x.id and rb.approval_status=''Rejected'' and rb.resubmitted_as is null and rb.physio_return_closed_at is null) then ''Returned by Accounts — waiting for Nursing to check / correct (Physiotherapy → Returned by Accounts)'' when public.charge_category_requires_approval(''Physiotherapy'') then');
    execute def;
  end if;
end $patch$;

-- J. Returns that already exist: open each one for correction now.
do $$
declare r record; n int := 0;
begin
  for r in select id from public.bill_charge_requests where physiotherapy_session_id is not null and approval_status='Rejected' order by updated_at loop
    perform public.physio_unlink_returned_charge(r.id); n := n + 1;
  end loop;
  raise notice 'Returned physiotherapy session charges opened for correction: %', n;
end $$;

notify pgrst, 'reload schema';
commit;

-- Check: returned physiotherapy sessions now waiting for Nursing to check and correct.
select coalesce(s.session_date,b.charge_date) as session_date, concat_ws(' ',p.title,p.full_name) as guest,
       s.physiotherapist_name, s.status as session_status, s.charge_request_id is null as session_unlocked,
       b.decision_by_name as returned_by, b.approval_remarks as reason, b.raised_by_name
  from public.bill_charge_requests b join public.patients p on p.id=b.patient_id
  left join public.physiotherapy_sessions s on s.id=b.physio_session_ref
 where b.physio_session_ref is not null and b.approval_status='Rejected' and b.resubmitted_as is null and b.physio_return_closed_at is null
 order by 1 desc;
