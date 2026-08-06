-- Samara Care ERP 1.2.3 - Late MAR Entry Audit Compatibility
-- Adds audit-safe fields only. Existing records and tables are not deleted.

alter table if exists public.medication_administrations
  add column if not exists entry_recorded_at timestamptz default now(),
  add column if not exists late_entry boolean default false,
  add column if not exists entry_delay_minutes integer default 0,
  add column if not exists late_entry_reason text,
  add column if not exists late_entry_justification text;

update public.medication_administrations
set entry_recorded_at = coalesce(entry_recorded_at, created_at, administered_at, now()),
    late_entry = coalesce(late_entry, false),
    entry_delay_minutes = coalesce(entry_delay_minutes, 0)
where entry_recorded_at is null
   or late_entry is null
   or entry_delay_minutes is null;

comment on column public.medication_administrations.entry_recorded_at is 'Automatic immutable-style system timestamp when the MAR record was entered';
comment on column public.medication_administrations.late_entry is 'True when entry was recorded more than 30 minutes after claimed administration time';
comment on column public.medication_administrations.entry_delay_minutes is 'Minutes between claimed administration time and system entry time';
comment on column public.medication_administrations.late_entry_reason is 'Mandatory category for late MAR entry';
comment on column public.medication_administrations.late_entry_justification is 'Mandatory detailed explanation for late MAR entry';

notify pgrst, 'reload schema';

select
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='medication_administrations' and column_name='entry_recorded_at') as entry_time_ready,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='medication_administrations' and column_name='late_entry') as late_entry_ready,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='medication_administrations' and column_name='late_entry_reason') as late_reason_ready,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='medication_administrations' and column_name='late_entry_justification') as late_justification_ready;
