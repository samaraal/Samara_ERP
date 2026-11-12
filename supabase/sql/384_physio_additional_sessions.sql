-- ERP 2.20.50 — ADDITIONAL PHYSIOTHERAPY (Samara in-house, NO CHARGE), from 01-11-2026.
-- Besides the planned sessions (physiotherapy plan from Admission / Patient Edit, chargeable as agreed), Samara's in-house
-- physiotherapist gives extra physiotherapy to any Guest as needed. These are recorded here, in their own table, so they
-- can never create a charge, a physiotherapist fee, a missed-session alert or an escalation.
--   • Recorded only by the Physiotherapist login, for any active Guest, dated 01-11-2026 … today (no future dates).
--   • Seen in Physiotherapy → Sessions & Clinical Review, the Daily Family Report ("complimentary") and the doctor report.
--   • The person who recorded it may cancel it the same day with a reason; Admin any time.
-- Run once; safe to run again.
begin;

create table if not exists public.physio_additional_sessions(
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  session_date date not null check (session_date >= date '2026-11-01'),
  actual_time time not null,
  session_at timestamptz not null,
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 240),
  treatment_done text not null check (length(trim(treatment_done)) > 0),
  notes text,
  tolerance text,
  status text not null default 'Completed',
  physiotherapist_name text,
  performed_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by_name text,
  void_reason text
);
create index if not exists physio_additional_sessions_patient on public.physio_additional_sessions(patient_id, session_date);
alter table public.physio_additional_sessions enable row level security;
revoke all on public.physio_additional_sessions from anon, authenticated;
grant select on public.physio_additional_sessions to authenticated;
grant all on public.physio_additional_sessions to service_role;
drop policy if exists physio_additional_read on public.physio_additional_sessions;
create policy physio_additional_read on public.physio_additional_sessions for select to authenticated
  using (public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver','Physiotherapist']));

create or replace function public.physio_additional_me()
returns public.profiles language sql stable security definer set search_path=public,pg_temp as $$
  select p.* from public.profiles p where (p.id = auth.uid() or p.auth_user_id = auth.uid()) and coalesce(p.is_active,true) and coalesce(p.active,true) limit 1
$$;
revoke all on function public.physio_additional_me() from public, anon, authenticated;

-- save (Physiotherapist login only)
create or replace function public.physio_additional_save(p jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me public.profiles := public.physio_additional_me(); g public.patients; d date; t time; r public.physio_additional_sessions;
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if me.id is null or me.role <> 'Physiotherapist' then raise exception 'Only the Physiotherapist login can record additional (no-charge) physiotherapy.'; end if;
  select * into g from public.patients where id = (p->>'patient_id')::uuid;
  if g.id is null then raise exception 'Choose the Guest.'; end if;
  d := nullif(p->>'session_date','')::date; t := nullif(p->>'actual_time','')::time;
  if d is null or t is null then raise exception 'Enter the date and time of the session.'; end if;
  if d < date '2026-11-01' then raise exception 'Additional physiotherapy can be recorded from 01-11-2026.'; end if;
  if d > today or (d = today and t > (now() at time zone 'Asia/Kolkata')::time + interval '5 minutes') then raise exception 'The session time cannot be in the future.'; end if;
  if length(trim(coalesce(p->>'treatment_done',''))) = 0 then raise exception 'Enter what was done (e.g. passive movements, walking practice).'; end if;
  insert into public.physio_additional_sessions(patient_id, session_date, actual_time, session_at, duration_minutes, treatment_done, notes, tolerance,
                                                physiotherapist_name, performed_by)
  values (g.id, d, t, ((d + t) at time zone 'Asia/Kolkata'), nullif(p->>'duration_minutes','')::int, trim(p->>'treatment_done'),
          nullif(trim(coalesce(p->>'notes','')),''), nullif(trim(coalesce(p->>'tolerance','')),''), me.full_name, me.id)
  returning * into r;
  begin
    insert into public.audit_log(user_id, action, entity, entity_id, details)
    values (me.id, 'Additional physiotherapy (no charge)', 'physio_additional_sessions', r.id::text, jsonb_build_object('patient_id', g.id, 'date', d, 'time', t));
  exception when others then null; end;
  return to_jsonb(r);
end $$;
revoke all on function public.physio_additional_save(jsonb) from public, anon;
grant execute on function public.physio_additional_save(jsonb) to authenticated;

-- cancel: the recorder the same day, Admin any time
create or replace function public.physio_additional_void(p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me public.profiles := public.physio_additional_me(); r public.physio_additional_sessions;
begin
  select * into r from public.physio_additional_sessions where id = p_id and voided_at is null;
  if r.id is null then raise exception 'Session not found or already cancelled.'; end if;
  if length(trim(coalesce(p_reason,''))) < 3 then raise exception 'Give the reason for cancelling.'; end if;
  if not (me.role = 'Admin' or (me.id = r.performed_by and (r.created_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date)) then
    raise exception 'Only the physiotherapist who recorded it (on the same day) or Admin can cancel it.';
  end if;
  update public.physio_additional_sessions set voided_at = now(), voided_by_name = me.full_name, void_reason = trim(p_reason), updated_at = now() where id = r.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.physio_additional_void(uuid,text) from public, anon;
grant execute on function public.physio_additional_void(uuid,text) to authenticated;

notify pgrst, 'reload schema';
commit;
