-- Samara Care ERP V8.1
-- Rooms & Beds master — safe to run more than once

create extension if not exists pgcrypto;

create table if not exists public.room_beds (
  id uuid primary key default gen_random_uuid(),
  room_no text not null,
  bed_no text not null,
  room_type text not null default 'Twin Sharing',
  floor text,
  wing text,
  daily_rate numeric(12,2) not null default 0,
  status text not null default 'Available',
  patient_id uuid references public.patients(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint room_beds_room_bed_unique unique(room_no,bed_no),
  constraint room_beds_status_check check(status in ('Available','Occupied','Reserved','Maintenance'))
);

alter table public.room_beds
  add column if not exists room_no text,
  add column if not exists bed_no text,
  add column if not exists room_type text default 'Twin Sharing',
  add column if not exists floor text,
  add column if not exists wing text,
  add column if not exists daily_rate numeric(12,2) default 0,
  add column if not exists status text default 'Available',
  add column if not exists patient_id uuid references public.patients(id) on delete set null,
  add column if not exists notes text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create unique index if not exists room_beds_room_bed_unique_idx on public.room_beds(room_no,bed_no);

create unique index if not exists room_beds_patient_unique
on public.room_beds(patient_id)
where patient_id is not null;

alter table public.room_beds enable row level security;
drop policy if exists "room beds authenticated read" on public.room_beds;
drop policy if exists "room beds authenticated insert" on public.room_beds;
drop policy if exists "room beds authenticated update" on public.room_beds;
drop policy if exists "room beds authenticated delete" on public.room_beds;
create policy "room beds authenticated read" on public.room_beds for select to authenticated using(true);
create policy "room beds authenticated insert" on public.room_beds for insert to authenticated with check(true);
create policy "room beds authenticated update" on public.room_beds for update to authenticated using(true) with check(true);
create policy "room beds authenticated delete" on public.room_beds for delete to authenticated using(true);

-- Seed the initial 25-bed layout only when the master is empty.
do $$
begin
  if not exists(select 1 from public.room_beds) then
    insert into public.room_beds(room_no,bed_no,room_type,daily_rate,status)
    values ('100','A','Private',2000,'Available');
    for n in 101..112 loop
      insert into public.room_beds(room_no,bed_no,room_type,daily_rate,status)
      values (n::text,'A','Twin Sharing',0,'Available'),(n::text,'B','Twin Sharing',0,'Available');
    end loop;
  end if;
end $$;

-- Add any room/bed combinations already recorded in Patient Master.
insert into public.room_beds(room_no,bed_no,room_type,daily_rate,status,patient_id)
select distinct p.room_no,p.bed_no,'Twin Sharing',0,'Occupied',p.id
from public.patients p
where p.is_active is true and nullif(trim(p.room_no),'') is not null and nullif(trim(p.bed_no),'') is not null
on conflict(room_no,bed_no) do update
set patient_id=excluded.patient_id,status='Occupied',updated_at=now();

-- Keep status aligned with the linked patient.
update public.room_beds
set status=case when patient_id is not null then 'Occupied' when status='Occupied' then 'Available' else status end,
    updated_at=now();

notify pgrst,'reload schema';

select room_no,bed_no,room_type,daily_rate,status,patient_id
from public.room_beds
order by room_no,bed_no;
