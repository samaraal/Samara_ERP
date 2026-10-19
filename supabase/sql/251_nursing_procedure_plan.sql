-- Samara Care ERP · 2.18.26 — Nursing Procedure plan (Admission section 5 + patient file → Nursing)
-- Request (Boomi, 19-10-2026): Admission gets a "Nursing Procedure" section; procedures can also be
-- added after admission; they show in the patient file (Nursing tab), on the nurse screensaver and in
-- Shift Tasks, and every procedure done is recorded with the Guest's care.
--
-- Planned procedures are kept in the SAME table as the Master Care Plan (care_orders) with
-- order_kind = 'Nursing Procedure', so recording (Shift Tasks / Daily Care → care_logs), the shift
-- reminders / escalations and the Daily Intelligent Report work for them exactly as for care.
-- Existing care rows become order_kind = 'Care'. Nothing is deleted.
--
-- Charging is unchanged: a Nursing Procedure is still CHARGED only through
-- NURSING → Approval Requests (request → Nursing Manager approval → Confirm & Start).
-- Safe to run more than once.

alter table public.care_orders add column if not exists order_kind text;
alter table public.care_orders add column if not exists procedure_code text;
alter table public.care_orders add column if not exists tariff_id uuid;
alter table public.care_orders add column if not exists start_date date;
alter table public.care_orders add column if not exists stopped_at timestamptz;
alter table public.care_orders add column if not exists stopped_by uuid;
alter table public.care_orders add column if not exists stop_reason text;

update public.care_orders set order_kind = 'Care' where order_kind is null or btrim(order_kind) = '';
alter table public.care_orders alter column order_kind set default 'Care';

alter table public.care_orders drop constraint if exists care_orders_order_kind_check;
alter table public.care_orders add constraint care_orders_order_kind_check
  check (order_kind in ('Care', 'Nursing Procedure'));

create index if not exists care_orders_patient_kind_active_idx
  on public.care_orders (patient_id, order_kind, is_active);

-- Read access for the screensaver / Shift Tasks is unchanged (policy "clinical manage care orders":
-- Admin, Manager, Nurse). Adding / stopping a planned procedure after admission is done from the
-- patient file by Admin / Manager (Nursing Manager) — the screen enforces that; the table policy
-- stays as it is for care.

notify pgrst, 'reload schema';
