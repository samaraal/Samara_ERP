-- SAMARA CARE v3: TWO 12-HOUR SHIFTS AND SPECIAL NURSE REQUIREMENT
alter table public.patients add column if not exists special_nurse_required boolean not null default false;
alter table public.patients add column if not exists special_nurse_name text;
alter table public.patients add column if not exists special_nurse_shift text;
alter table public.patients add column if not exists special_nurse_instructions text;

-- Convert earlier three-shift values into the new two-shift system.
update public.care_orders set shift='Day Shift (7 AM–7 PM)' where shift in ('Morning','Afternoon');
update public.care_orders set shift='Night Shift (7 PM–7 AM)' where shift='Night';
update public.care_orders set shift='Both shifts' where shift='All shifts';

update public.care_logs set shift='Day Shift (7 AM–7 PM)' where shift in ('Morning','Afternoon');
update public.care_logs set shift='Night Shift (7 PM–7 AM)' where shift='Night';
update public.care_logs set shift='Both shifts' where shift='All shifts';

alter table public.care_orders drop constraint if exists care_orders_shift_check;
alter table public.care_orders add constraint care_orders_shift_check
  check (shift in ('Day Shift (7 AM–7 PM)','Night Shift (7 PM–7 AM)','Both shifts'));

alter table public.care_logs drop constraint if exists care_logs_shift_check;
alter table public.care_logs add constraint care_logs_shift_check
  check (shift in ('Day Shift (7 AM–7 PM)','Night Shift (7 PM–7 AM)','Both shifts'));
