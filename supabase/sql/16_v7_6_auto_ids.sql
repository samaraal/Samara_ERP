-- Samara Care ERP V7.6: automatic employee and patient identification codes
create sequence if not exists public.employee_code_seq start 1;
create sequence if not exists public.patient_code_seq start 1;

alter table public.patients add column if not exists patient_id text;
create unique index if not exists patients_patient_id_unique on public.patients(patient_id) where patient_id is not null;

create or replace function public.next_employee_code()
returns text
language plpgsql
security definer
set search_path=public
as $$
declare v_code text;
begin
  loop
    v_code := 'EMP-' || lpad(nextval('public.employee_code_seq')::text,4,'0');
    exit when not exists(select 1 from public.profiles where employee_id=v_code);
  end loop;
  return v_code;
end;$$;

create or replace function public.next_patient_code()
returns text
language plpgsql
security definer
set search_path=public
as $$
declare v_code text;
begin
  loop
    v_code := 'PAT-' || lpad(nextval('public.patient_code_seq')::text,4,'0');
    exit when not exists(select 1 from public.patients where patient_id=v_code);
  end loop;
  return v_code;
end;$$;

grant execute on function public.next_employee_code() to authenticated;
grant execute on function public.next_patient_code() to authenticated;

-- Give IDs to older records that do not yet have one.
do $$
declare r record;
begin
  for r in select id from public.profiles where employee_id is null or btrim(employee_id)='' order by created_at loop
    update public.profiles set employee_id=public.next_employee_code() where id=r.id;
  end loop;
  for r in select id from public.patients where patient_id is null or btrim(patient_id)='' order by created_at loop
    update public.patients set patient_id=public.next_patient_code() where id=r.id;
  end loop;
end$$;

notify pgrst,'reload schema';
select id,full_name,employee_id from public.profiles order by created_at;
select id,full_name,patient_id from public.patients order by created_at;
