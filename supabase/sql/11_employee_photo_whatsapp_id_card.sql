-- Samara Care ERP V5.7
-- Employee photograph support for personnel file and printed ID card.

alter table public.profiles add column if not exists photo_storage_path text;

-- Existing employee-documents bucket and policies from V5.6 are reused.
select full_name, employee_id, login_id, role, mobile, photo_storage_path
from public.profiles
order by full_name;
