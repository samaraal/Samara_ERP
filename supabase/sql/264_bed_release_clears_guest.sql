-- Samara Care ERP — Rooms: a bed marked Available must not keep a Guest linked (Boomi, 20-10-2026)
-- Problem: Edit Room / Bed & Tariff for Room 106 A failed with "An occupied bed must remain occupied."
-- The bed showed Available, but the discharged Guest (Sadek Hossen, MOG-2026-10-0009) was still linked
-- to it: the discharge step set status = 'Available' without clearing room_beds.patient_id.
-- 108 B had the same leftover link (S. Sarojini, MOG-2026-09-0006, discharged 29-09-2026).
--
-- Fix:
--  1. From now on, whenever a bed is set to Available (by discharge or anything else), its Guest link is
--     cleared automatically (trigger) — so every discharge path is covered.
--  2. The two stuck beds are released now (only beds that are Available AND whose linked Guest is no
--     longer active). Guests' bills, ledger and history are not touched.
-- Run once in Supabase → SQL Editor. Safe to run again.
begin;

create or replace function public.room_bed_release_clears_guest() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if new.status='Available' and new.patient_id is not null then
    new.patient_id := null;
  end if;
  return new;
end $$;
drop trigger if exists room_bed_release_clears_guest on public.room_beds;
create trigger room_bed_release_clears_guest before update on public.room_beds
  for each row execute function public.room_bed_release_clears_guest();

-- release the beds stuck with a discharged Guest
update public.room_beds rb set patient_id=null, updated_at=now()
  from public.patients p
 where p.id=rb.patient_id and rb.status='Available' and coalesce(p.is_active,true)=false;

commit;

-- check: should return no rows
select rb.room_no, rb.bed_no, rb.status, p.patient_id, p.full_name
  from public.room_beds rb join public.patients p on p.id=rb.patient_id
 where rb.status is distinct from 'Occupied' or coalesce(p.is_active,true)=false;
