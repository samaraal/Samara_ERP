-- v2.14.39: Oxygen Therapy is charged by cylinder type and duration.
-- Replaces the single "Oxygen Therapy" Charge Master line with six specific services.
-- Rates are left blank for Admin to fix in Charge Master (Nursing never sees amounts).
-- Past bills keep their original text, so removing the old master line does not change history.
insert into public.charge_tariff_master(category,service_name,amount,is_active,display_order) values
  ('Nursing Procedures','Oxygen Therapy – B-type Cylinder – 6 Hours',null,true,9),
  ('Nursing Procedures','Oxygen Therapy – B-type Cylinder – 12 Hours',null,true,9),
  ('Nursing Procedures','Oxygen Therapy – B-type Cylinder – 24 Hours',null,true,9),
  ('Nursing Procedures','Oxygen Therapy – D-type Cylinder – 6 Hours',null,true,9),
  ('Nursing Procedures','Oxygen Therapy – D-type Cylinder – 12 Hours',null,true,9),
  ('Nursing Procedures','Oxygen Therapy – D-type Cylinder – 24 Hours',null,true,9)
on conflict (category,service_name) do update set is_active=true, updated_at=now();

delete from public.charge_tariff_master where service_name='Oxygen Therapy';

select category, service_name, amount, is_active from public.charge_tariff_master
where service_name ilike 'oxygen%' order by service_name;
