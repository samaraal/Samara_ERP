-- Samara Care ERP 1.3.50
-- Shift Handover check-constraint repair.

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid='public.shift_handovers'::regclass
      and contype='c'
      and (
        conname='shift_handovers_shift_check'
        or pg_get_constraintdef(oid) ilike '%shift%'
      )
  loop
    execute format(
      'alter table public.shift_handovers drop constraint if exists %I',
      constraint_row.conname
    );
  end loop;
end $$;

alter table public.shift_handovers
  add constraint shift_handovers_shift_check
  check (
    shift in (
      'Day',
      'Night',
      'Day Shift',
      'Night Shift',
      'Day Shift (7 AM–7 PM)',
      'Night Shift (7 PM–7 AM)'
    )
  );

-- Normalise existing short labels without breaking old reports.
update public.shift_handovers
set shift=case
  when shift='Day' then 'Day Shift (7 AM–7 PM)'
  when shift='Night' then 'Night Shift (7 PM–7 AM)'
  when shift='Day Shift' then 'Day Shift (7 AM–7 PM)'
  when shift='Night Shift' then 'Night Shift (7 PM–7 AM)'
  else shift
end
where shift in ('Day','Night','Day Shift','Night Shift');

notify pgrst,'reload schema';

select
  conname,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid='public.shift_handovers'::regclass
  and conname='shift_handovers_shift_check';
