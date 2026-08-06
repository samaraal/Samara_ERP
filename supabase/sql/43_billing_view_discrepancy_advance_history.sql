-- Samara Care ERP 1.3.19
-- Billing view, discrepancy queries, advances and history

alter table public.billing_transactions
  drop constraint if exists billing_transactions_transaction_type_check;

create table if not exists public.billing_discrepancies (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  billing_transaction_id uuid not null,
  discrepancy_type text not null,
  description text not null,
  status text not null default 'Open',
  decision text,
  raised_by uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_discrepancies_patient_idx
  on public.billing_discrepancies(patient_id,created_at desc);

alter table public.billing_discrepancies enable row level security;

drop policy if exists billing_discrepancies_authorised_select on public.billing_discrepancies;
create policy billing_discrepancies_authorised_select
on public.billing_discrepancies for select
to authenticated
using (public.current_user_has_role(array['Admin','Manager','Accounts','Nurse','Caregiver']));

drop policy if exists billing_discrepancies_clinical_insert on public.billing_discrepancies;
create policy billing_discrepancies_clinical_insert
on public.billing_discrepancies for insert
to authenticated
with check (public.current_user_has_role(array['Admin','Manager','Nurse','Caregiver']));

drop policy if exists billing_discrepancies_management_update on public.billing_discrepancies;
create policy billing_discrepancies_management_update
on public.billing_discrepancies for update
to authenticated
using (public.current_user_has_role(array['Admin','Manager','Accounts']))
with check (public.current_user_has_role(array['Admin','Manager','Accounts']));

-- Permit clinical users to view billing transactions without changing them.
drop policy if exists billing_transactions_clinical_select on public.billing_transactions;
create policy billing_transactions_clinical_select
on public.billing_transactions for select
to authenticated
using (public.current_user_has_role(array['Admin','Manager','Accounts','Nurse','Caregiver']));

notify pgrst, 'reload schema';

select
  to_regclass('public.billing_discrepancies') is not null as discrepancy_table_ready;
