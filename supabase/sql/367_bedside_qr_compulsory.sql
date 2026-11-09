-- ERP 2.19.97 — Bedside Verification: "QR compulsory" mode (09-11-2026). Run AFTER 363. Safe to run again.
-- Allows a 4th mode 'qr_required' on the 363 bedside settings row (check constraint + the Admin switch function).
-- Then switches the mode to 'qr_required' (asked by Admin on 09-11-2026). Nothing else is changed.
-- TO GO BACK to record-only: update public.bedside_verify_settings set mode='qr_trial' where id=1;  (or use the Admin page)

begin;

do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid='public.bedside_verify_settings'::regclass and contype='c' and pg_get_constraintdef(oid) ilike '%mode%'
  loop execute format('alter table public.bedside_verify_settings drop constraint %I', c); end loop;
end $$;
alter table public.bedside_verify_settings add constraint bedside_verify_settings_mode_check check (mode in ('off','qr_trial','qr_required','nfc'));

create or replace function public.set_bedside_verify_settings(p_mode text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_name text;
begin
  if not public.bedside_can('admin') then raise exception 'Only Admin / Director can change Bedside Verification.'; end if;
  if p_mode not in ('off','qr_trial','qr_required','nfc') then raise exception 'Unknown mode %', p_mode; end if;
  select coalesce(nullif(full_name,''),'Admin') into v_name from public.profiles where id=auth.uid() or auth_user_id=auth.uid() limit 1;
  update public.bedside_verify_settings set mode=p_mode, updated_at=now(), updated_by_name=v_name where id=1;
  return (select to_jsonb(s) from public.bedside_verify_settings s where id=1);
end $$;
revoke all on function public.set_bedside_verify_settings(text) from public, anon;
grant execute on function public.set_bedside_verify_settings(text) to authenticated;

update public.bedside_verify_settings set mode='qr_required', updated_at=now(), updated_by_name='Admin (SQL 367)' where id=1;

commit;
