-- =====================================================================
-- SAMARA CARE ERP 1.1.0 - MASTER DATABASE BASELINE
-- Idempotent compatibility migration for the current React application.
-- Creates only missing objects/columns. Existing data is preserved.
-- Safe to run repeatedly.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- CARE ORDERS
-- ---------------------------------------------------------------------
create table if not exists public.care_orders (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  care_type text not null,
  shift text default 'Both shifts',
  frequency text default 'Daily',
  instruction text,
  is_active boolean default true,
  entered_by uuid,
  created_at timestamptz not null default now()
);
alter table public.care_orders
  add column if not exists patient_id uuid,
  add column if not exists care_type text,
  add column if not exists shift text,
  add column if not exists frequency text,
  add column if not exists instruction text,
  add column if not exists is_active boolean,
  add column if not exists entered_by uuid,
  add column if not exists created_at timestamptz;
update public.care_orders set shift='Both shifts' where shift is null or btrim(shift)='';
update public.care_orders set frequency='Daily' where frequency is null or btrim(frequency)='';
update public.care_orders set is_active=true where is_active is null;
update public.care_orders set created_at=now() where created_at is null;
alter table public.care_orders alter column shift set default 'Both shifts';
alter table public.care_orders alter column frequency set default 'Daily';
alter table public.care_orders alter column is_active set default true;
alter table public.care_orders alter column created_at set default now();

-- ---------------------------------------------------------------------
-- DAILY CARE LOGS
-- ---------------------------------------------------------------------
create table if not exists public.care_logs (
  id uuid primary key default gen_random_uuid(),
  care_order_id uuid,
  patient_id uuid not null,
  care_date date not null default current_date,
  shift text,
  status text,
  completed_at timestamptz,
  completed_by uuid,
  remarks text,
  created_at timestamptz not null default now()
);
alter table public.care_logs
  add column if not exists care_order_id uuid,
  add column if not exists patient_id uuid,
  add column if not exists care_date date,
  add column if not exists shift text,
  add column if not exists status text,
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid,
  add column if not exists remarks text,
  add column if not exists created_at timestamptz;
update public.care_logs set care_date=current_date where care_date is null;
update public.care_logs set created_at=now() where created_at is null;
alter table public.care_logs alter column care_date set default current_date;
alter table public.care_logs alter column created_at set default now();
create unique index if not exists care_logs_order_date_shift_uidx
  on public.care_logs(care_order_id,care_date,shift)
  where care_order_id is not null;

-- ---------------------------------------------------------------------
-- MEDICATION ORDERS / PRESCRIPTION
-- ---------------------------------------------------------------------
create table if not exists public.medication_orders (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  medicine_name text not null,
  strength text,
  dose text not null,
  route text,
  food_instruction text,
  special_instruction text,
  scheduled_times text[] default '{}',
  frequency text default 'Once Daily (OD)',
  duration text default 'Long Term',
  duration_days integer,
  start_date date default current_date,
  end_date date,
  is_active boolean default true,
  entered_by uuid,
  verified_by uuid,
  created_at timestamptz not null default now()
);
alter table public.medication_orders
  add column if not exists patient_id uuid,
  add column if not exists medicine_name text,
  add column if not exists strength text,
  add column if not exists dose text,
  add column if not exists route text,
  add column if not exists food_instruction text,
  add column if not exists special_instruction text,
  add column if not exists scheduled_times text[],
  add column if not exists frequency text,
  add column if not exists duration text,
  add column if not exists duration_days integer,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists is_active boolean,
  add column if not exists entered_by uuid,
  add column if not exists verified_by uuid,
  add column if not exists created_at timestamptz;
update public.medication_orders set scheduled_times='{}'::text[] where scheduled_times is null;
update public.medication_orders set frequency='Once Daily (OD)' where frequency is null or btrim(frequency)='';
update public.medication_orders set duration='Long Term' where duration is null or btrim(duration)='';
update public.medication_orders set start_date=coalesce(created_at::date,current_date) where start_date is null;
update public.medication_orders set is_active=true where is_active is null;
update public.medication_orders set created_at=now() where created_at is null;
alter table public.medication_orders alter column scheduled_times set default '{}';
alter table public.medication_orders alter column frequency set default 'Once Daily (OD)';
alter table public.medication_orders alter column duration set default 'Long Term';
alter table public.medication_orders alter column start_date set default current_date;
alter table public.medication_orders alter column is_active set default true;
alter table public.medication_orders alter column created_at set default now();

-- ---------------------------------------------------------------------
-- MEDICATION ADMINISTRATION RECORD (MAR)
-- ---------------------------------------------------------------------
create table if not exists public.medication_administrations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid,
  patient_id uuid not null,
  scheduled_date date not null default current_date,
  scheduled_time text not null,
  status text default 'Due',
  administered_at timestamptz,
  administered_by uuid,
  remarks text,
  created_at timestamptz not null default now()
);
alter table public.medication_administrations
  add column if not exists order_id uuid,
  add column if not exists patient_id uuid,
  add column if not exists scheduled_date date,
  add column if not exists scheduled_time text,
  add column if not exists status text,
  add column if not exists administered_at timestamptz,
  add column if not exists administered_by uuid,
  add column if not exists remarks text,
  add column if not exists created_at timestamptz;
update public.medication_administrations set scheduled_date=current_date where scheduled_date is null;
update public.medication_administrations set status='Due' where status is null or btrim(status)='';
update public.medication_administrations set created_at=now() where created_at is null;
alter table public.medication_administrations alter column scheduled_date set default current_date;
alter table public.medication_administrations alter column status set default 'Due';
alter table public.medication_administrations alter column created_at set default now();
create unique index if not exists mar_order_date_time_uidx
  on public.medication_administrations(order_id,scheduled_date,scheduled_time)
  where order_id is not null;

-- ---------------------------------------------------------------------
-- VITAL SIGNS
-- ---------------------------------------------------------------------
create table if not exists public.vital_signs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  temperature numeric,
  systolic integer,
  diastolic integer,
  pulse integer,
  respiration integer,
  spo2 integer,
  blood_sugar_type text default 'Not Taken',
  blood_sugar numeric,
  weight numeric,
  pain_score numeric,
  remarks text,
  alert_level text default 'Normal',
  status text,
  recorded_by uuid,
  recorded_at timestamptz default now()
);
alter table public.vital_signs
  add column if not exists patient_id uuid,
  add column if not exists temperature numeric,
  add column if not exists systolic integer,
  add column if not exists diastolic integer,
  add column if not exists pulse integer,
  add column if not exists respiration integer,
  add column if not exists spo2 integer,
  add column if not exists blood_sugar_type text,
  add column if not exists blood_sugar numeric,
  add column if not exists weight numeric,
  add column if not exists pain_score numeric,
  add column if not exists remarks text,
  add column if not exists alert_level text,
  add column if not exists status text,
  add column if not exists recorded_by uuid,
  add column if not exists recorded_at timestamptz;
update public.vital_signs set blood_sugar_type=case when blood_sugar is null then 'Not Taken' else 'RBS' end where blood_sugar_type is null or btrim(blood_sugar_type)='';
update public.vital_signs set alert_level='Normal' where alert_level is null or btrim(alert_level)='';
update public.vital_signs set recorded_at=now() where recorded_at is null;
alter table public.vital_signs alter column blood_sugar_type set default 'Not Taken';
alter table public.vital_signs alter column alert_level set default 'Normal';
alter table public.vital_signs alter column recorded_at set default now();

-- ---------------------------------------------------------------------
-- PHYSIOTHERAPY
-- ---------------------------------------------------------------------
create table if not exists public.physiotherapy_orders (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  advised_by text,
  therapy_type text,
  frequency text,
  preferred_time text,
  precautions text,
  start_date date default current_date,
  end_date date,
  is_active boolean default true,
  entered_by uuid,
  created_at timestamptz not null default now()
);
alter table public.physiotherapy_orders
  add column if not exists patient_id uuid,
  add column if not exists advised_by text,
  add column if not exists therapy_type text,
  add column if not exists frequency text,
  add column if not exists preferred_time text,
  add column if not exists precautions text,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists is_active boolean,
  add column if not exists entered_by uuid,
  add column if not exists created_at timestamptz;
update public.physiotherapy_orders set start_date=current_date where start_date is null;
update public.physiotherapy_orders set is_active=true where is_active is null;
update public.physiotherapy_orders set created_at=now() where created_at is null;
alter table public.physiotherapy_orders alter column start_date set default current_date;
alter table public.physiotherapy_orders alter column is_active set default true;
alter table public.physiotherapy_orders alter column created_at set default now();

create table if not exists public.physiotherapy_sessions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid,
  patient_id uuid not null,
  session_date date not null default current_date,
  status text default 'Pending',
  session_at timestamptz,
  performed_by uuid,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.physiotherapy_sessions
  add column if not exists order_id uuid,
  add column if not exists patient_id uuid,
  add column if not exists session_date date,
  add column if not exists status text,
  add column if not exists session_at timestamptz,
  add column if not exists performed_by uuid,
  add column if not exists notes text,
  add column if not exists created_at timestamptz;
update public.physiotherapy_sessions set session_date=current_date where session_date is null;
update public.physiotherapy_sessions set status='Pending' where status is null or btrim(status)='';
update public.physiotherapy_sessions set created_at=now() where created_at is null;
alter table public.physiotherapy_sessions alter column session_date set default current_date;
alter table public.physiotherapy_sessions alter column status set default 'Pending';
alter table public.physiotherapy_sessions alter column created_at set default now();
create unique index if not exists physio_order_date_uidx
  on public.physiotherapy_sessions(order_id,session_date)
  where order_id is not null;

-- ---------------------------------------------------------------------
-- SHIFT HANDOVER
-- ---------------------------------------------------------------------
create table if not exists public.shift_handovers (
  id uuid primary key default gen_random_uuid(),
  handover_date date not null default current_date,
  shift text,
  patient_summary text,
  pending_tasks text,
  special_instructions text,
  priority text default 'Routine',
  submitted_by uuid,
  acknowledged_by uuid,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.shift_handovers
  add column if not exists handover_date date,
  add column if not exists shift text,
  add column if not exists patient_summary text,
  add column if not exists pending_tasks text,
  add column if not exists special_instructions text,
  add column if not exists priority text,
  add column if not exists submitted_by uuid,
  add column if not exists acknowledged_by uuid,
  add column if not exists acknowledged_at timestamptz,
  add column if not exists created_at timestamptz;
update public.shift_handovers set handover_date=current_date where handover_date is null;
update public.shift_handovers set priority='Routine' where priority is null or btrim(priority)='';
update public.shift_handovers set created_at=now() where created_at is null;
alter table public.shift_handovers alter column handover_date set default current_date;
alter table public.shift_handovers alter column priority set default 'Routine';
alter table public.shift_handovers alter column created_at set default now();

-- ---------------------------------------------------------------------
-- INCIDENTS
-- ---------------------------------------------------------------------
create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid,
  incident_type text,
  description text,
  immediate_action text,
  severity text default 'Low',
  status text default 'Open',
  incident_at timestamptz default now(),
  reported_by uuid,
  reviewed_by uuid,
  closure_note text,
  closed_at timestamptz
);
alter table public.incidents
  add column if not exists patient_id uuid,
  add column if not exists incident_type text,
  add column if not exists description text,
  add column if not exists immediate_action text,
  add column if not exists severity text,
  add column if not exists status text,
  add column if not exists incident_at timestamptz,
  add column if not exists reported_by uuid,
  add column if not exists reviewed_by uuid,
  add column if not exists closure_note text,
  add column if not exists closed_at timestamptz;
update public.incidents set severity='Low' where severity is null or btrim(severity)='';
update public.incidents set status='Open' where status is null or btrim(status)='';
update public.incidents set incident_at=now() where incident_at is null;
alter table public.incidents alter column severity set default 'Low';
alter table public.incidents alter column status set default 'Open';
alter table public.incidents alter column incident_at set default now();

-- ---------------------------------------------------------------------
-- FOOD & DIET
-- ---------------------------------------------------------------------
create table if not exists public.meal_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  meal_date date default current_date,
  meal_type text,
  menu text,
  consumption_status text,
  remarks text,
  served_at timestamptz default now(),
  recorded_by uuid
);
alter table public.meal_records
  add column if not exists patient_id uuid,
  add column if not exists meal_date date,
  add column if not exists meal_type text,
  add column if not exists menu text,
  add column if not exists consumption_status text,
  add column if not exists remarks text,
  add column if not exists served_at timestamptz,
  add column if not exists recorded_by uuid;
update public.meal_records set meal_date=current_date where meal_date is null;
update public.meal_records set served_at=now() where served_at is null;
alter table public.meal_records alter column meal_date set default current_date;
alter table public.meal_records alter column served_at set default now();

-- ---------------------------------------------------------------------
-- BILLING
-- ---------------------------------------------------------------------
create table if not exists public.billing_transactions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  transaction_type text,
  category text,
  amount numeric(12,2),
  description text,
  payment_mode text,
  transaction_date timestamptz default now(),
  entered_by uuid,
  approved_by uuid
);
alter table public.billing_transactions
  add column if not exists patient_id uuid,
  add column if not exists transaction_type text,
  add column if not exists category text,
  add column if not exists amount numeric(12,2),
  add column if not exists description text,
  add column if not exists payment_mode text,
  add column if not exists transaction_date timestamptz,
  add column if not exists entered_by uuid,
  add column if not exists approved_by uuid;
update public.billing_transactions set transaction_date=now() where transaction_date is null;
alter table public.billing_transactions alter column transaction_date set default now();

-- ---------------------------------------------------------------------
-- RECOVERY EVENTS (used by patient timeline)
-- ---------------------------------------------------------------------
create table if not exists public.recovery_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null,
  event_date timestamptz default now(),
  event_type text,
  title text,
  description text,
  recorded_by uuid,
  created_at timestamptz not null default now()
);
alter table public.recovery_events
  add column if not exists patient_id uuid,
  add column if not exists event_date timestamptz,
  add column if not exists event_type text,
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists recorded_by uuid,
  add column if not exists created_at timestamptz;
update public.recovery_events set event_date=now() where event_date is null;
update public.recovery_events set created_at=now() where created_at is null;
alter table public.recovery_events alter column event_date set default now();
alter table public.recovery_events alter column created_at set default now();

-- ---------------------------------------------------------------------
-- SAFE AUTHENTICATED ACCESS FOR OPERATIONAL TABLES
-- Existing role-specific patient/profile policies are not changed.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'care_orders','care_logs','medication_orders','medication_administrations',
    'vital_signs','physiotherapy_orders','physiotherapy_sessions',
    'shift_handovers','incidents','meal_records','billing_transactions','recovery_events'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('drop policy if exists samara_authenticated_select on public.%I',t);
    execute format('create policy samara_authenticated_select on public.%I for select to authenticated using (true)',t);
    execute format('drop policy if exists samara_authenticated_insert on public.%I',t);
    execute format('create policy samara_authenticated_insert on public.%I for insert to authenticated with check (true)',t);
    execute format('drop policy if exists samara_authenticated_update on public.%I',t);
    execute format('create policy samara_authenticated_update on public.%I for update to authenticated using (true) with check (true)',t);
    execute format('grant select, insert, update on public.%I to authenticated',t);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- VERIFICATION: every value below should be TRUE.
-- ---------------------------------------------------------------------
select
  to_regclass('public.care_orders') is not null as care_orders,
  to_regclass('public.care_logs') is not null as care_logs,
  to_regclass('public.medication_orders') is not null as medication_orders,
  to_regclass('public.medication_administrations') is not null as medication_administrations,
  to_regclass('public.vital_signs') is not null as vital_signs,
  to_regclass('public.physiotherapy_orders') is not null as physiotherapy_orders,
  to_regclass('public.physiotherapy_sessions') is not null as physiotherapy_sessions,
  to_regclass('public.shift_handovers') is not null as shift_handovers,
  to_regclass('public.incidents') is not null as incidents,
  to_regclass('public.meal_records') is not null as meal_records,
  to_regclass('public.billing_transactions') is not null as billing_transactions,
  to_regclass('public.recovery_events') is not null as recovery_events,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='medication_orders' and column_name='frequency') as medication_frequency,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='medication_orders' and column_name='duration') as medication_duration,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='vital_signs' and column_name='blood_sugar') as vital_blood_sugar,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='shift_handovers' and column_name='handover_date') as handover_date,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='incidents' and column_name='severity') as incident_severity,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='meal_records' and column_name='consumption_status') as meal_consumption,
  exists(select 1 from information_schema.columns where table_schema='public' and table_name='billing_transactions' and column_name='category') as billing_category;
