-- Samara Care ERP 1.3.13
-- Special Nurse source: own employee or outsourced provider

alter table public.special_nurse_assignments
  add column if not exists nurse_source text not null default 'Our Employee';

alter table public.special_nurse_assignments
  add column if not exists outsourced_company_name text;

alter table public.special_nurse_assignments
  add column if not exists outsourced_contact_person text;

alter table public.special_nurse_assignments
  add column if not exists outsourced_contact_number text;

alter table public.special_nurse_assignments
  add column if not exists outsourced_agreement_reference text;

update public.special_nurse_assignments
set nurse_source='Our Employee'
where nurse_source is null or nurse_source='';

notify pgrst, 'reload schema';

select
  exists(
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='special_nurse_assignments'
      and column_name='nurse_source'
  ) as nurse_source_ready,
  exists(
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='special_nurse_assignments'
      and column_name='outsourced_company_name'
  ) as outsourced_company_ready;
