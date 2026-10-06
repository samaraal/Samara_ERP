-- Samara ERP v2.15.70 — screen language (EN | தமிழ்) remembered per user on every device.
-- Run after 197. Safe to run again.
begin;
alter table public.profiles add column if not exists ui_language text not null default 'en';
do $$ begin
 if not exists(select 1 from pg_constraint where conname='profiles_ui_language_check') then
  alter table public.profiles add constraint profiles_ui_language_check check (ui_language in ('en','ta'));
 end if;
end $$;
create or replace function public.set_my_ui_language(p_lang text) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_lang not in ('en','ta') then raise exception 'Language must be en or ta'; end if;
 update public.profiles set ui_language=p_lang where id=auth.uid() or auth_user_id=auth.uid();
 return p_lang;
end $$;
revoke all on function public.set_my_ui_language(text) from public, anon;
grant execute on function public.set_my_ui_language(text) to authenticated;
notify pgrst,'reload schema';
commit;
