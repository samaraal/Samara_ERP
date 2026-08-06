-- Samara Care ERP 1.3.48
-- Shift Handover summary-column compatibility repair.

alter table public.shift_handovers
  add column if not exists summary text;

alter table public.shift_handovers
  add column if not exists patient_summary text;

update public.shift_handovers
set
  summary=coalesce(nullif(trim(summary),''),nullif(trim(patient_summary),''),'No summary recorded'),
  patient_summary=coalesce(nullif(trim(patient_summary),''),nullif(trim(summary),''),'No summary recorded')
where summary is null
   or trim(summary)=''
   or patient_summary is null
   or trim(patient_summary)='';

-- Keep both legacy and current columns synchronised.
create or replace function public.sync_shift_handover_summary()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  new.summary:=coalesce(nullif(trim(new.summary),''),nullif(trim(new.patient_summary),''));
  new.patient_summary:=coalesce(nullif(trim(new.patient_summary),''),nullif(trim(new.summary),''));

  if new.summary is null then
    raise exception 'Patient summary is required.';
  end if;

  return new;
end;
$$;

drop trigger if exists shift_handover_summary_sync_trigger on public.shift_handovers;
create trigger shift_handover_summary_sync_trigger
before insert or update on public.shift_handovers
for each row execute function public.sync_shift_handover_summary();

notify pgrst,'reload schema';

select
  exists(
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='shift_handovers'
      and column_name='summary'
  ) as summary_ready,
  exists(
    select 1 from pg_trigger
    where tgname='shift_handover_summary_sync_trigger'
  ) as summary_sync_ready;
