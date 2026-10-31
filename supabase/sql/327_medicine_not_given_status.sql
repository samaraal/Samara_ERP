-- 2.19.23 (31-10-2026): Medication Administration — new status "Not Given" with a reason
-- (e.g. medicine not available, medicine not provided by the family).
-- A. medication_administrations.status now also allows 'Not Given'; new column not_given_reason.
-- B. MIS & Audit "Doses recorded as Missed or Refused" now also lists Not Given doses (the reason is in the remarks).
-- Family Daily Report and Discharge Summary already count "Not Given" as missed / omitted.
-- Safe to run more than once.

begin;

alter table public.medication_administrations add column if not exists not_given_reason text;

do $st$
declare c record; allowed text[];
begin
  select array_agg(distinct s) into allowed from (
    select unnest(array['Given','Refused','Withheld','Unavailable','Missed','Delayed','Not Given']) s
    union select distinct status from public.medication_administrations where status is not null
  ) x;
  for c in select con.conname from pg_constraint con
            where con.conrelid='public.medication_administrations'::regclass and con.contype='c'
              and pg_get_constraintdef(con.oid) ilike '%status%' and pg_get_constraintdef(con.oid) not ilike '%not given%'
  loop
    execute format('alter table public.medication_administrations drop constraint %I', c.conname);
    execute format('alter table public.medication_administrations add constraint medication_administrations_status_check check (status = any (%L::text[]))', allowed);
  end loop;
end $st$;

-- B. MIS check (text patch, once)
do $patch$
declare def text;
  o1 constant text := $o$a.status in ('Missed','Refused') and a.scheduled_date between $1 and $2$o$;
  n1 constant text := $o$a.status in ('Missed','Refused','Not Given') and a.scheduled_date between $1 and $2$o$;
  o3 constant text := $o$'Doses recorded as Missed or Refused'$o$;
  n3 constant text := $o$'Doses recorded as Missed, Refused or Not Given'$o$;
begin
  def := pg_get_functiondef('public.mis_section_clinical(date,date)'::regprocedure);
  if position(n1 in def) > 0 then raise notice 'MIS already patched'; return; end if;
  if position(o1 in def) = 0 then raise notice 'MIS doses check text not found — skipped'; return; end if;
  def := replace(replace(def, o1, n1), o3, n3);
  execute def;
end $patch$;

notify pgrst, 'reload schema';
commit;

select pg_get_constraintdef(oid) from pg_constraint where conname='medication_administrations_status_check';
