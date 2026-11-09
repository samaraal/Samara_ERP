-- ERP 2.19.96 — Bedside entries only from the phone / tablet for Nurse & Caregiver logins (09-11-2026). Run AFTER 363. Safe to run again.
-- Adds 1 column to the 363 bedside settings row + 1 Admin function. Nothing else is changed.
-- The switch is turned ON at the end of this file (asked by Admin on 09-11-2026).
-- TO UNDO: update public.bedside_verify_settings set block_computer=false where id=1;
--          (fully: drop function if exists public.set_bedside_block_computer(boolean); alter table public.bedside_verify_settings drop column if exists block_computer;)

begin;

alter table public.bedside_verify_settings add column if not exists block_computer boolean not null default false;

create or replace function public.set_bedside_block_computer(p_on boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_name text;
begin
  if not public.bedside_can('admin') then raise exception 'Only Admin / Director can change Bedside Verification.'; end if;
  select coalesce(nullif(full_name,''),'Admin') into v_name from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  update public.bedside_verify_settings set block_computer=coalesce(p_on,false), updated_at=now(), updated_by_name=v_name where id=1;
  return (select to_jsonb(s) from public.bedside_verify_settings s where id=1);
end $$;
revoke all on function public.set_bedside_block_computer(boolean) from public, anon;
grant execute on function public.set_bedside_block_computer(boolean) to authenticated;

update public.bedside_verify_settings set block_computer=true, updated_at=now(), updated_by_name='Admin (SQL 366)' where id=1;

commit;
