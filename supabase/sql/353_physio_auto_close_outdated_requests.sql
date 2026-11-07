-- Samara Care ERP 2.19.84 — Physiotherapy: out-of-date correction / reschedule requests close by themselves (07-11-2026)
-- Run once in Supabase > SQL Editor. Safe to run again.
--
-- Problem: a reschedule was requested at 08:54 for Mr. S. Swaminathan's 08:00 session; the session was then done and
-- recorded at 09:30. The request stayed waiting, and Approve failed with "Session changed since this request".
-- Fix: when a waiting (Pending) session gets its outcome recorded (Completed / Not Done), any request still waiting for
-- that session is closed automatically ("Closed automatically — session recorded …"). It disappears from the bell,
-- the pop-up and the approval list, and stays on record for audit. Requests already waiting are tidied once below.
-- Nothing else changes: approving / rejecting, the guard on sessions and billing work as before.

begin;

create or replace function public.physio_close_outdated_requests() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer; note text;
begin
  if (old.status='Pending' and old.session_at is null) and (new.status<>'Pending' or new.session_at is not null) then
    note:='Closed automatically — session recorded as '||coalesce(new.status,'done')
          ||coalesce(' at '||to_char(coalesce(new.actual_time,(new.session_at at time zone 'Asia/Kolkata')::time),'HH24:MI'),'')
          ||' after this request was made';
    update public.physiotherapy_corrections
       set state='Rejected', reviewed_at=now(), reviewed_by=null, review_note=note
     where session_id=new.id and state='Pending';
    get diagnostics n=row_count;
    if n>0 then
      begin
        perform public.record_audit_event('Physiotherapy Request Auto-closed','Physiotherapy',new.id::text,jsonb_build_object('reason',note,'requests',n),'Success');
      exception when others then null; -- audit is best-effort; never block recording care
      end;
    end if;
  end if;
  return null;
end $$;
revoke all on function public.physio_close_outdated_requests() from public, anon, authenticated;

drop trigger if exists physio_close_outdated_requests on public.physiotherapy_sessions;
create trigger physio_close_outdated_requests after update on public.physiotherapy_sessions
  for each row execute function public.physio_close_outdated_requests();

-- one-time tidy: requests made while the session was waiting, whose session has since been recorded (or removed)
update public.physiotherapy_corrections r
   set state='Rejected', reviewed_at=now(), reviewed_by=null,
       review_note=case when s.id is null then 'Closed automatically — the session no longer exists'
                        else 'Closed automatically — session recorded as '||s.status
                             ||coalesce(' at '||to_char(coalesce(s.actual_time,(s.session_at at time zone 'Asia/Kolkata')::time),'HH24:MI'),'')
                             ||' after this request was made' end
  from public.physiotherapy_corrections r2
  left join public.physiotherapy_sessions s on s.id=r2.session_id
 where r.id=r2.id and r.state='Pending'
   and coalesce(r.original->>'status','')='Pending' and nullif(r.original->>'session_at','') is null
   and (s.id is null or s.status<>'Pending' or s.session_at is not null);

commit;
notify pgrst,'reload schema';

-- Check: trigger ready = true; still_waiting lists requests that remain open (should all be genuine).
select exists(select 1 from pg_trigger where tgname='physio_close_outdated_requests') as auto_close_ready,
       (select count(*) from public.physiotherapy_corrections where state='Pending') as still_waiting;
