-- 336 — Assign Guests to nurses, shift-wise (ERP 2.19.51)
--   guest_nurse_assignments : standing Day / Night nurse for each Guest (one open row per Guest per shift;
--                             changing it closes the old row, so the history is kept).
--   guest_cover_records     : when a nurse records for a Guest assigned to another nurse, the reason she gave.
--   Only Admin / Director and the Nursing Manager can assign. Everyone signed in can read the assignments.
-- Run once in Supabase SQL Editor. Safe to re-run.
begin;

create table if not exists public.guest_nurse_assignments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  shift text not null check (shift in ('Day','Night')),
  nurse_id uuid not null references public.profiles(id),
  nurse_name text,
  assigned_by uuid,
  assigned_by_name text,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  ended_by_name text
);
create unique index if not exists guest_nurse_assignments_open_uq
  on public.guest_nurse_assignments(patient_id, shift) where ended_at is null;
create index if not exists guest_nurse_assignments_nurse_idx
  on public.guest_nurse_assignments(nurse_id) where ended_at is null;

create table if not exists public.guest_cover_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  nurse_id uuid not null,
  nurse_name text,
  shift text,
  duty_date date not null default ((now() at time zone 'Asia/Kolkata')::date),
  assigned_nurse_id uuid,
  assigned_nurse_name text,
  reason text not null,
  page text,
  created_at timestamptz not null default now()
);
create index if not exists guest_cover_records_date_idx on public.guest_cover_records(duty_date desc);

alter table public.guest_nurse_assignments enable row level security;
alter table public.guest_cover_records enable row level security;
drop policy if exists gna_read on public.guest_nurse_assignments;
create policy gna_read on public.guest_nurse_assignments for select to authenticated using (true);
drop policy if exists gcr_read on public.guest_cover_records;
create policy gcr_read on public.guest_cover_records for select to authenticated using (true);
revoke insert, update, delete on public.guest_nurse_assignments from anon, authenticated;
revoke insert, update, delete on public.guest_cover_records from anon, authenticated;
grant select on public.guest_nurse_assignments, public.guest_cover_records to authenticated;

-- Who is calling, and may they assign? (Admin / Administrator / Director, or the Nursing Manager)
create or replace function public.guest_assign_caller()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare p record; d text;
begin
  select pr.* into p from public.profiles pr
   where (pr.id = auth.uid() or pr.auth_user_id = auth.uid())
   order by (pr.id = auth.uid()) desc limit 1;
  if p.id is null then return null; end if;
  d := trim(regexp_replace(lower(coalesce(to_jsonb(p)->>'designation','')),'[._ -]+',' ','g'));
  return jsonb_build_object(
    'id', p.id,
    'name', coalesce(nullif(btrim(concat_ws(' ', p.title, p.full_name)),''), p.full_name),
    'can_assign', lower(trim(coalesce(p.role,''))) in ('admin','administrator','director')
                  or d in ('nurse manager','nursing manager')
                  or (d = '' and lower(coalesce(to_jsonb(p)->>'department','')) = 'nursing' and lower(trim(coalesce(p.role,''))) = 'manager'));
end $$;
revoke all on function public.guest_assign_caller() from public, anon;
grant execute on function public.guest_assign_caller() to authenticated;

-- Save assignments. p_rows = [{"patient_id":"…","shift":"Day","nurse_id":"…" or null}, …]
-- nurse_id null = remove the assignment for that Guest + shift.
create or replace function public.set_guest_nurse_assignments(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me jsonb := public.guest_assign_caller(); r jsonb; v_pat uuid; v_shift text; v_nurse uuid; v_name text;
        cur record; changed int := 0;
begin
  if me is null or not coalesce((me->>'can_assign')::boolean,false) then
    raise exception 'Only Admin / Director or the Nursing Manager can assign Guests to nurses.';
  end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    v_pat := (r->>'patient_id')::uuid;
    v_shift := r->>'shift';
    v_nurse := nullif(r->>'nurse_id','')::uuid;
    if v_shift not in ('Day','Night') then raise exception 'Shift must be Day or Night.'; end if;
    select * into cur from public.guest_nurse_assignments
     where patient_id = v_pat and shift = v_shift and ended_at is null for update;
    if cur.id is not null and cur.nurse_id is not distinct from v_nurse then continue; end if;
    if cur.id is not null then
      update public.guest_nurse_assignments set ended_at = now(), ended_by_name = me->>'name' where id = cur.id;
      changed := changed + 1;
    end if;
    if v_nurse is not null then
      select coalesce(nullif(btrim(concat_ws(' ', p.title, p.full_name)),''), p.full_name) into v_name
        from public.profiles p where p.id = v_nurse;
      if v_name is null then raise exception 'Nurse not found.'; end if;
      insert into public.guest_nurse_assignments(patient_id, shift, nurse_id, nurse_name, assigned_by, assigned_by_name)
      values (v_pat, v_shift, v_nurse, v_name, (me->>'id')::uuid, me->>'name');
      if cur.id is null then changed := changed + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'changed', changed);
end $$;
revoke all on function public.set_guest_nurse_assignments(jsonb) from public, anon;
grant execute on function public.set_guest_nurse_assignments(jsonb) to authenticated;

-- A nurse records care for a Guest assigned to another nurse: keep the reason.
create or replace function public.record_guest_cover(p_patient uuid, p_shift text, p_reason text, p_page text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare me jsonb := public.guest_assign_caller(); a record; v_id uuid;
begin
  if me is null then raise exception 'Sign in again.'; end if;
  if length(btrim(coalesce(p_reason,''))) < 3 then raise exception 'Give the reason (a few words).'; end if;
  select nurse_id, nurse_name into a from public.guest_nurse_assignments
   where patient_id = p_patient and shift = p_shift and ended_at is null;
  insert into public.guest_cover_records(patient_id, nurse_id, nurse_name, shift, assigned_nurse_id, assigned_nurse_name, reason, page)
  values (p_patient, (me->>'id')::uuid, me->>'name', p_shift, a.nurse_id, a.nurse_name, btrim(p_reason), nullif(btrim(coalesce(p_page,'')),''))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke all on function public.record_guest_cover(uuid,text,text,text) from public, anon;
grant execute on function public.record_guest_cover(uuid,text,text,text) to authenticated;

notify pgrst, 'reload schema';
commit;

-- MIS (Operational): list every time a nurse recorded for a Guest assigned to another nurse, with her reason.
-- Live-patches public.mis_section_operational (adds one check before "Nursing shifts with no nurse rostered").
-- If the MIS function has a different layout, this part is skipped with a notice — the assignment above still works.
do $mis$
declare def text;
  anchor constant text := $a$  c := c || public.mis_check('no_nurse_rostered'$a$;
  addition constant text := $b$  c := c || public.mis_check('guest_cover','Guest attended by a nurse not assigned to her','medium','Staff Duty Assignment',
    'A nurse recorded care for a Guest assigned to another nurse on that shift (reason given by the nurse).',
    $q$select c.created_at as sort_at, to_char(c.created_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH24:MI') as date,
              c.nurse_name as who,
              concat_ws(' · ', nullif(btrim(concat_ws(' ', p.title, p.full_name)),''), c.shift||' shift', 'assigned: '||coalesce(c.assigned_nurse_name,'—'), c.page, 'reason: '||c.reason) as detail,
              null::numeric as amount
         from public.guest_cover_records c left join public.patients p on p.id = c.patient_id
        where c.duty_date between $1 and $2$q$,
    p_from, p_to);

$b$;
begin
  select pg_get_functiondef(f.oid) into def from pg_proc f join pg_namespace n on n.oid=f.pronamespace
   where n.nspname='public' and f.proname='mis_section_operational' limit 1;
  if def is null then raise notice 'MIS not found — skipped.'; return; end if;
  if position($k$'guest_cover'$k$ in def) > 0 then raise notice 'MIS already lists Guest cover — nothing to do.'; return; end if;
  if position(anchor in def) = 0 then raise notice 'MIS layout differs — Guest cover check not added (assignment still works).'; return; end if;
  execute replace(def, anchor, addition || anchor);
  raise notice 'MIS: Guest cover check added.';
end
$mis$;

select 'Guest ↔ nurse assignment ready' as result;
