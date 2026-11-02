-- 338 — Physiotherapist login: physiotherapy only + Physio Notes & Observations (ERP 2.19.57)
-- Run this whole file once in Supabase > SQL Editor. Safe to run again. Run AFTER 337.
--
-- Owner's decision (02-11-2026): the Physiotherapist does not need the Caregiver's access —
-- only physiotherapy work, plus notes / observations recorded by typing, voice or dictation
-- (Tamil / English).
--
-- 1. physiotherapy_notes  — new table: Physio Notes & Observations per Guest. Never edited or deleted
--    (a correction is a new note). Readable by Admin, Manager, Nurse, Caregiver, Physiotherapist.
-- 2. physio_guest_list()  — Guest name / ID / room / bed only, for the Physiotherapy screens, so the
--    Physiotherapist does not need to read the full Guest (patients) table.
-- 3. A "limit" rule (zz_physio_login_limit) on the Guest's clinical, billing, stores, HR and kitchen
--    tables: a Physiotherapist login can no longer read or change them directly.
--      * It touches ONLY the Physiotherapist role. Every other role works exactly as before.
--      * Existing security rules are not changed; this rule is added beside them.
--      * Automatic ERP steps (e.g. a Guest physio charge raised when a session is saved) still work,
--        because the limit does not apply inside those automatic steps.
--      * To undo: run the block at the very bottom of this file (commented out).

begin;

-- 0. Helpers -----------------------------------------------------------------------------------
create or replace function public.is_physiotherapist_login()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.profiles p
     where (p.id=auth.uid() or p.auth_user_id=auth.uid())
       and p.role='Physiotherapist'
       and coalesce(p.is_active,true));
$$;
revoke all on function public.is_physiotherapist_login() from public;
grant execute on function public.is_physiotherapist_login() to authenticated, service_role;

-- true = allowed. Inside an automatic step (trigger) it is always allowed.
create or replace function public.physio_login_may_use()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select pg_trigger_depth()>0 or not public.is_physiotherapist_login();
$$;
revoke all on function public.physio_login_may_use() from public;
grant execute on function public.physio_login_may_use() to authenticated, service_role;

create or replace function public.physio_notes_role_ok()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(
    select 1 from public.profiles p
     where (p.id=auth.uid() or p.auth_user_id=auth.uid())
       and p.role in ('Admin','Manager','Nurse','Caregiver','Physiotherapist')
       and coalesce(p.is_active,true));
$$;
revoke all on function public.physio_notes_role_ok() from public;
grant execute on function public.physio_notes_role_ok() to authenticated, service_role;

-- 1. Physio Notes & Observations ---------------------------------------------------------------
create table if not exists public.physiotherapy_notes(
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  plan_id uuid,
  note_type text not null default 'Observation'
    check (note_type in ('Observation','Progress','Treatment given','Advice / Precaution','Other')),
  note_text text not null check (length(btrim(note_text))>=3),
  observed_at timestamptz not null default now(),
  voice_used boolean not null default false,
  spoken_language text,
  heard_text text,
  recorded_by uuid,
  recorded_by_name text,
  recorded_by_role text,
  created_at timestamptz not null default now()
);
comment on table public.physiotherapy_notes is 'Physio Notes & Observations per Guest (typed / voice / dictation). Never edited or deleted; a correction is a new note. Internal — not shown to families.';
create index if not exists physiotherapy_notes_patient_time_idx on public.physiotherapy_notes(patient_id, observed_at desc);
create index if not exists physiotherapy_notes_time_idx on public.physiotherapy_notes(observed_at desc);

create or replace function public.physiotherapy_note_stamp()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_name text; v_role text;
begin
  select p.id, p.full_name, p.role into v_id, v_name, v_role from public.profiles p
   where p.id=auth.uid() or p.auth_user_id=auth.uid() limit 1;
  new.recorded_by := coalesce(v_id, auth.uid());
  new.recorded_by_name := coalesce(v_name, new.recorded_by_name);
  new.recorded_by_role := coalesce(v_role, new.recorded_by_role);
  new.created_at := now();
  new.observed_at := coalesce(new.observed_at, now());
  if new.observed_at > now() + interval '5 minutes' then
    raise exception 'The observation time cannot be in the future.';
  end if;
  if new.observed_at < now() - interval '2 days' then
    raise exception 'A note can be recorded only for the last 2 days.';
  end if;
  return new;
end $$;
drop trigger if exists physiotherapy_note_stamp on public.physiotherapy_notes;
create trigger physiotherapy_note_stamp before insert on public.physiotherapy_notes
  for each row execute function public.physiotherapy_note_stamp();

alter table public.physiotherapy_notes enable row level security;
drop policy if exists physiotherapy_notes_read on public.physiotherapy_notes;
create policy physiotherapy_notes_read on public.physiotherapy_notes for select to authenticated
  using (public.physio_notes_role_ok());
drop policy if exists physiotherapy_notes_add on public.physiotherapy_notes;
create policy physiotherapy_notes_add on public.physiotherapy_notes for insert to authenticated
  with check (public.physio_notes_role_ok());
revoke all on public.physiotherapy_notes from anon;
grant select, insert on public.physiotherapy_notes to authenticated;
grant all on public.physiotherapy_notes to service_role;

-- 2. Guest list for the Physiotherapy screens (name, ID, room, bed only) -----------------------
create or replace function public.physio_guest_list()
returns setof jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
           'id', p.id,
           'title', to_jsonb(p)->>'title',
           'full_name', to_jsonb(p)->>'full_name',
           'patient_id', to_jsonb(p)->>'patient_id',
           'room_no', to_jsonb(p)->>'room_no',
           'bed_no', to_jsonb(p)->>'bed_no',
           'is_active', coalesce((to_jsonb(p)->>'is_active')::boolean, true),
           'admission_status', to_jsonb(p)->>'admission_status')
    from public.patients p
   where public.physio_notes_role_ok()
     and (coalesce((to_jsonb(p)->>'is_active')::boolean, true)
          or exists(select 1 from public.physiotherapy_plans pl where pl.patient_id=p.id)
          or exists(select 1 from public.physiotherapy_sessions s where s.patient_id=p.id))
   order by to_jsonb(p)->>'full_name';
$$;
revoke all on function public.physio_guest_list() from public;
grant execute on function public.physio_guest_list() to authenticated;

commit;

-- 3. Limit the Physiotherapist login on non-physiotherapy tables -------------------------------
do $p$
declare
  t text; n_done int := 0; skipped text[] := '{}';
  tbls text[] := array[
    -- Guest record & clinical
    'patients','admission_draft_forms','spot_assessments','pre_admission_enquiries','patient_documents',
    'patient_communications','patient_family_communication_preferences','patient_daily_moments','patient_discharges',
    'family_portal_access','family_messages','family_visit_requests','vital_signs','io_entries','care_logs','care_orders',
    'medication_orders','medication_administrations','medication_entry_corrections','medication_errors',
    'medication_reviews','medication_review_items','nursing_notes','nursing_note_addenda','nursing_procedure_requests',
    'shift_handovers','general_handover_tasks','incidents','recovery_events','meal_records','beverage_records',
    'clinical_reports','clinical_report_sends','hospital_visit_records','special_nurse_assignments',
    'room_transfer_history','discharge_medication_reviews','discharge_departure_reviews','discharge_workflow_events',
    -- Billing & accounts
    'bill_charge_requests','bill_charge_store_allocations','billing_transactions','billing_discrepancies',
    'charge_tariff_master','charge_rate_history','room_tariff_changes','ledger_payment_receipts','payment_vouchers',
    'discharge_refund_requests','package_renewal_requests','patient_physio_rates','physio_supplier_ledger',
    'outside_bill_family_files','pos_card_slips','pos_scan_handoffs','pos_screen_scans','samara_monthly_expenses',
    'samara_payroll','nm_petty_cash_entries','nm_petty_cash_operations','nm_petty_cash_requests',
    -- Outside nursing
    'outside_nursing_patients','outside_nursing_visits','outside_nursing_payments','outside_nursing_rates',
    'outside_nursing_starts','outside_nursing_online_requests','outside_nursing_whatsapp_sends',
    -- Stores, equipment, kitchen, food vendor
    'patient_consumable_indents','patient_item_consumption','patient_store_returns','consumable_store_items',
    'consumable_store_ledger','consumable_store_receipts','consumable_store_stock','store_mrp_reviews',
    'store_stock_resets','store_stock_reset_items','store_item_snapshots','store_item_merges',
    'store_physical_verifications','store_physical_verification_lines','housekeeping_indents','housekeeping_item_usage',
    'biomedical_equipment','biomedical_equipment_items','biomedical_equipment_movements','biomedical_equipment_purchases',
    'bme_care_requests','bme_receive_operations','oxygen_cylinders','oxygen_cylinder_movements',
    'kitchen_cash_entries','kitchen_funding','kitchen_handovers','kitchen_operations','kitchen_purchases',
    'kitchen_reconciliations','kitchen_stock','kitchen_stock_moves','kitchen_wallet','kitchen_audit',
    'fv_orders','fv_messages','fv_ledger','fv_rates','fv_requests','fv_events',
    -- HR, enquiries, director's office, communication
    'employee_documents','employee_employment_history','career_applications','hr_whatsapp_communications',
    'enquiry_activity','director_office_items','director_office_positions','manager_personal_tasks',
    'nursing_manager_tasks','nurse_personal_todos','feedback','whatsapp_templates','mis_finding_closures'
  ];
begin
  foreach t in array tbls loop
    if to_regclass('public.'||t) is null then continue; end if;
    if not exists(select 1 from pg_class c join pg_namespace s on s.oid=c.relnamespace
                   where s.nspname='public' and c.relname=t and c.relkind in ('r','p') and c.relrowsecurity) then
      skipped := skipped || t;   -- security rules are off on this table: leave it alone, report it
      continue;
    end if;
    execute format('drop policy if exists zz_physio_login_limit on public.%I', t);
    execute format('create policy zz_physio_login_limit on public.%I as restrictive for all to authenticated '
                   'using (public.physio_login_may_use()) with check (public.physio_login_may_use())', t);
    n_done := n_done + 1;
  end loop;
  raise notice 'Physiotherapist limit added on % table(s).', n_done;
  if array_length(skipped,1) > 0 then
    raise notice 'Not limited (security rules are off on these tables, left unchanged): %', array_to_string(skipped, ', ');
  end if;
end
$p$;

notify pgrst, 'reload schema';

select 'Physiotherapist limited to physiotherapy + Physio Notes ready' as result,
       (select count(*) from pg_policies where schemaname='public' and policyname='zz_physio_login_limit') as tables_limited;

-- ---------------------------------------------------------------------------------------------
-- UNDO (only if ever needed): removes the Physiotherapist limit, keeps the notes table.
-- do $u$ declare r record; begin
--   for r in select tablename from pg_policies where schemaname='public' and policyname='zz_physio_login_limit' loop
--     execute format('drop policy zz_physio_login_limit on public.%I', r.tablename);
--   end loop; end $u$;
