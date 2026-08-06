-- SAMARA CARE ERP 1.0.19
-- PASSWORD-CHANGE COMPLETION ONLY
-- Safe to run more than once.
-- This does not alter patients, clinical data, vitals, medicines, billing,
-- reports, rooms, documents, dashboard, employee details or UI layout.

create or replace function public.complete_my_first_login()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_updated integer := 0;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles
     set must_change_password = false,
         updated_at = now()
   where id = v_uid
      or auth_user_id = v_uid;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'Employee profile is not linked to this login';
  end if;

  -- Keep Authentication metadata consistent where permitted by the database.
  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                              || jsonb_build_object('must_change_password', false),
         updated_at = now()
   where id = v_uid;

  return true;
end;
$$;

revoke all on function public.complete_my_first_login() from public;
grant execute on function public.complete_my_first_login() to authenticated;

notify pgrst, 'reload schema';
