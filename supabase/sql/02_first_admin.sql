-- FIRST: create a user in Authentication > Users with email:
-- admin@users.samaracare.local
-- Turn ON "Auto Confirm User" when creating it.
-- THEN replace YOUR_AUTH_USER_UUID below with that user's UUID and run this statement.
insert into public.profiles(id,full_name,employee_id,login_id,role,is_active)
values ('YOUR_AUTH_USER_UUID','Administrator','ADM001','admin','Admin',true)
on conflict (id) do update set full_name=excluded.full_name,login_id=excluded.login_id,role='Admin',is_active=true;
