-- Samara Care ERP 2.15.57 — Erase Trial Guest: allow its room-tariff adjustment rows
-- Run once in Supabase > SQL Editor (file 191), after 182 and 171. Safe to run again.
--
-- Problem: "Erase Trial Guest" stopped with "Tariff adjustments are permanent audit entries…"
-- because the Trial Guest's ledger had room-tariff adjustment rows (SQL 182), which the
-- tariff guard never allows to be deleted.
--
-- Fix: the guard now lets those rows go ONLY inside the Trial Guest erase
-- (purge_trial_guest / purge_all_trial_guests set samara.trial_purge = that Guest's id), and
-- only when the row belongs to that Guest and the Guest is marked Trial.
-- Real Guests: nothing changes — their tariff adjustments stay permanent.
-- The room's tariff history (room_tariff_changes) is kept; only the Guest's ledger rows go.

begin;

create or replace function public.guard_tariff_adjustment() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare purge_id text:=coalesce(current_setting('samara.trial_purge',true),'');
begin
 -- 2.15.57: Trial Guest erase — remove this Trial Guest's ledger rows without the tariff checks.
 if tg_op='DELETE' and purge_id<>'' and old.patient_id::text=purge_id
    and exists(select 1 from public.patients p where p.id::text=purge_id and p.is_trial) then
   return old;
 end if;
 if tg_op<>'DELETE' and (new.tariff_original_source_key is not null or new.source_type='Room Tariff Adjustment') and new.tariff_change_id is null then
   raise exception 'A tariff adjustment must reference its tariff audit record.';
 end if;
 if tg_op<>'INSERT' and old.tariff_change_id is not null then
   raise exception 'Tariff adjustments are permanent audit entries. Save a new dated tariff to correct them.';
 end if;
 if tg_op<>'DELETE' and new.tariff_change_id is not null and
 coalesce(current_setting('samara.tariff_adjustment',true),'')<>new.tariff_change_id::text then
   raise exception 'Tariff adjustments must be posted by the dated tariff workflow.';
 end if;
 if tg_op='DELETE' and old.auto_generated and exists(select 1 from public.billing_transactions a where a.tariff_original_source_key=old.source_key) then return null;end if;
 if tg_op='UPDATE' and old.auto_generated and (new.amount,new.source_key,new.patient_id,new.source_date) is distinct from (old.amount,old.source_key,old.patient_id,old.source_date)
 and exists(select 1 from public.billing_transactions a where a.tariff_original_source_key=old.source_key) then
   raise exception 'This original charge has tariff adjustments. Correct it using a new dated tariff.';
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function public.guard_tariff_adjustment() from public,anon,authenticated;

commit;
