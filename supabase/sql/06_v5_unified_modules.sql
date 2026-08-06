-- SAMARA CARE ERP V5: UNIFIED MODULES
-- Run once after the earlier setup/upgrade scripts.
create extension if not exists pgcrypto;

-- Allow manually recorded care activities that are not generated from an admission care order.
alter table if exists public.care_logs alter column care_order_id drop not null;

create table if not exists public.vital_signs (
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete cascade,
 temperature numeric, systolic integer, diastolic integer, pulse integer, spo2 integer, blood_sugar numeric,
 remarks text, alert_level text not null default 'Normal', recorded_by uuid references public.profiles(id),
 recorded_at timestamptz not null default now()
);
create table if not exists public.meal_records (
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete cascade,
 meal_date date not null default current_date, meal_type text not null, menu text not null,
 consumption_status text not null, remarks text, served_at timestamptz not null default now(), recorded_by uuid references public.profiles(id)
);
create table if not exists public.shift_handovers (
 id uuid primary key default gen_random_uuid(), handover_date date not null default current_date, shift text not null,
 patient_summary text not null, pending_tasks text, special_instructions text, priority text not null default 'Routine',
 submitted_by uuid references public.profiles(id), acknowledged_by uuid references public.profiles(id), acknowledged_at timestamptz,
 created_at timestamptz not null default now()
);
create table if not exists public.incidents (
 id uuid primary key default gen_random_uuid(), patient_id uuid references public.patients(id) on delete set null,
 incident_type text not null, description text not null, immediate_action text, severity text not null default 'Low',
 status text not null default 'Open', incident_at timestamptz not null default now(), reported_by uuid references public.profiles(id),
 reviewed_by uuid references public.profiles(id), closure_note text, closed_at timestamptz
);
create table if not exists public.patient_documents (
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete cascade,
 document_type text not null, document_name text not null, document_url text not null,
 uploaded_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.billing_transactions (
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete cascade,
 transaction_type text not null check(transaction_type in ('Charge','Payment','Discount','Refund')),
 category text not null, amount numeric(12,2) not null check(amount>=0), description text, payment_mode text,
 transaction_date timestamptz not null default now(), entered_by uuid references public.profiles(id), approved_by uuid references public.profiles(id)
);
create table if not exists public.recovery_events (
 id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id) on delete cascade,
 event_type text not null, note text not null, event_at timestamptz not null default now(), recorded_by uuid references public.profiles(id)
);
create table if not exists public.notifications (
 id uuid primary key default gen_random_uuid(), title text not null, message text not null, priority text not null default 'Normal',
 created_by uuid references public.profiles(id), created_at timestamptz not null default now(), expires_at timestamptz
);

-- Add missing audit timestamp if an earlier audit table did not include it.
alter table if exists public.audit_log add column if not exists created_at timestamptz not null default now();

-- Row Level Security: authenticated employees may read shared operational data.
do $$ declare t text; begin
 foreach t in array array['vital_signs','meal_records','shift_handovers','incidents','patient_documents','billing_transactions','recovery_events','notifications'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('drop policy if exists authenticated_read on public.%I',t);
   execute format('create policy authenticated_read on public.%I for select to authenticated using (true)',t);
   execute format('drop policy if exists authenticated_insert on public.%I',t);
   execute format('create policy authenticated_insert on public.%I for insert to authenticated with check (true)',t);
   execute format('drop policy if exists authenticated_update on public.%I',t);
   execute format('create policy authenticated_update on public.%I for update to authenticated using (true) with check (true)',t);
 end loop;
end $$;

-- Realtime publication (safe if already added).
do $$ declare t text; begin
 foreach t in array array['vital_signs','meal_records','shift_handovers','incidents','patient_documents','billing_transactions','recovery_events','notifications'] loop
   begin execute format('alter publication supabase_realtime add table public.%I',t); exception when duplicate_object then null; end;
 end loop;
end $$;
