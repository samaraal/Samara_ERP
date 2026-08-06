-- Samara Care ERP 1.3.5
-- Focused Daily Care save fix.
-- This removes only the database audit trigger from care_logs.
-- Daily Care is logged by the application after the clinical record saves.

drop trigger if exists audit_care_logs_changes on public.care_logs;

notify pgrst, 'reload schema';

select
  to_regclass('public.care_logs') is not null as care_logs_ready,
  not exists (
    select 1
    from pg_trigger
    where tgname='audit_care_logs_changes'
      and not tgisinternal
  ) as blocking_care_audit_trigger_removed;
