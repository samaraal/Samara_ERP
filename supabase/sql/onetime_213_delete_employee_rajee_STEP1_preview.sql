-- STEP 1 (read only — changes nothing). Run this first and check it shows the right Rajee.
select id, employee_id, title, full_name, role, designation, department, login_id, is_active
  from public.profiles
 where full_name ~* '\mraj(ee|i)\M';
