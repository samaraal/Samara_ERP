-- SAMARA CARE ERP 2.8.4
-- Run once in Supabase SQL Editor.

alter table public.patients
  add column if not exists undergoing_prescribed_medication boolean not null default true;

alter table public.medication_orders
  add column if not exists prescribed_by_doctor text;

comment on column public.patients.undergoing_prescribed_medication is
  'True when the resident is undergoing prescribed medication at the current admission; false when no prescribed medication is declared.';

comment on column public.medication_orders.prescribed_by_doctor is
  'Name of the doctor who prescribed this individual medication.';
