-- Samara Care ERP 1.3.47
-- Shift Handover patient linkage and automatic Incident Number generation.

-- 1. Incident number sequence.
create sequence if not exists public.incident_number_seq start with 1 increment by 1;

create or replace function public.generate_incident_number()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if new.incident_no is null or trim(new.incident_no)='' then
    new.incident_no :=
      'INC-' ||
      to_char(coalesce(new.incident_at,now()) at time zone 'Asia/Kolkata','YYYYMMDD') ||
      '-' ||
      lpad(nextval('public.incident_number_seq')::text,4,'0');
  end if;
  return new;
end;
$$;

drop trigger if exists incidents_generate_number_trigger on public.incidents;
create trigger incidents_generate_number_trigger
before insert on public.incidents
for each row execute function public.generate_incident_number();

-- Backfill any old incident records without an incident number.
update public.incidents
set incident_no=
  'INC-' ||
  to_char(coalesce(incident_at,created_at,now()) at time zone 'Asia/Kolkata','YYYYMMDD') ||
  '-' ||
  lpad(nextval('public.incident_number_seq')::text,4,'0')
where incident_no is null or trim(incident_no)='';

-- 2. Ensure patient linkage is available in shift handovers.
alter table public.shift_handovers
  add column if not exists patient_id uuid references public.patients(id);

-- Existing rows may not have patient linkage. Keep them readable,
-- while new entries are validated by the application.
-- Do not force NOT NULL here because historical rows may be general handovers.

notify pgrst,'reload schema';

select
  exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='shift_handovers' and column_name='patient_id'
  ) as handover_patient_ready,
  exists(
    select 1 from pg_trigger where tgname='incidents_generate_number_trigger'
  ) as incident_number_trigger_ready;
