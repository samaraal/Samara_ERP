-- Samara Care ERP 2.8.91
-- Patient identity protection: the same 10-digit mobile number cannot belong to two different patient rows.
-- Safe to run with existing data: this creates a trigger for future INSERT/UPDATE operations and does not alter existing patient data.

create or replace function public.prevent_duplicate_patient_mobile()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_mobile text;
  v_conflict record;
begin
  v_mobile := regexp_replace(coalesce(new.mobile,''), '[^0-9]', '', 'g');
  if length(v_mobile) >= 10 then
    v_mobile := right(v_mobile,10);
  end if;

  if length(v_mobile) = 10 then
    select p.id,p.patient_id,p.patient_code,p.title,p.full_name
      into v_conflict
    from public.patients p
    where p.id is distinct from new.id
      and right(regexp_replace(coalesce(p.mobile,''), '[^0-9]', '', 'g'),10)=v_mobile
    limit 1;

    if found then
      raise exception using
        errcode='23505',
        message=format(
          'This mobile number is already registered to %s%s. A different patient cannot use the same mobile number.',
          trim(concat_ws(' ',v_conflict.title,v_conflict.full_name)),
          case when coalesce(v_conflict.patient_id,v_conflict.patient_code) is not null
               then ' · '||coalesce(v_conflict.patient_id,v_conflict.patient_code)
               else '' end
        );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_duplicate_patient_mobile on public.patients;
create trigger trg_prevent_duplicate_patient_mobile
before insert or update of mobile on public.patients
for each row execute function public.prevent_duplicate_patient_mobile();

notify pgrst,'reload schema';
