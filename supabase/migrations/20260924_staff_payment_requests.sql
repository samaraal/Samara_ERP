-- Samara secure staff-generated online payment requests.
create table if not exists public.staff_payment_requests (
  id uuid primary key default gen_random_uuid(),
  request_code text not null unique default ('PAY-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  public_token text not null unique,
  patient_id uuid not null references public.patients(id) on delete restrict,
  payment_type text not null check (payment_type in ('advance','outstanding')),
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'Pending' check (status in ('Pending','Paid','Expired','Cancelled')),
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  paid_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists staff_payment_requests_patient_idx on public.staff_payment_requests(patient_id,created_at desc);
create index if not exists staff_payment_requests_status_idx on public.staff_payment_requests(status,expires_at);
alter table public.staff_payment_requests enable row level security;
-- ERP authenticated staff may read request history; writes are performed by the secured Edge Function.
drop policy if exists staff_payment_requests_staff_read on public.staff_payment_requests;
create policy staff_payment_requests_staff_read on public.staff_payment_requests for select to authenticated using (true);
