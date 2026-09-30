-- SAMARA CARE ERP 2.15.24 — WhatsApp Inbox works like a real WhatsApp inbox.
--  1. Delete = hide from the ERP inbox (Meta cannot delete a message from the recipient's phone).
--     Admin and Manager can hide; only Admin can see hidden messages and restore them.
--  2. whatsapp_templates: copy of Samara's APPROVED Meta templates (filled by the
--     whatsapp-templates-sync Edge Function) so the inbox shows exactly what was received.
--  3. whatsapp-media storage bucket (private) for copies of photos / PDFs sent from the inbox.
-- Run once in Supabase > SQL Editor. Safe to run again.

-- 1. hide / restore -------------------------------------------------------------------------
alter table public.hr_whatsapp_communications
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid,
  add column if not exists deleted_by_name text,
  add column if not exists delete_reason text;

create or replace function public.wa_hide_message(p_id uuid, p_hide boolean default true, p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare who_name text; n int;
begin
  if p_hide and not public.current_user_has_role(array['Admin','Manager']) then
    raise exception 'Only Admin or Manager can delete WhatsApp messages from the inbox.'; end if;
  if not p_hide and not public.current_user_has_role(array['Admin']) then
    raise exception 'Only Admin can restore deleted WhatsApp messages.'; end if;
  select coalesce(nullif(trim(concat_ws(' ', to_jsonb(pr)->>'title', to_jsonb(pr)->>'full_name')),''), to_jsonb(pr)->>'email', 'Staff')
    into who_name from public.profiles pr where pr.id=auth.uid() or pr.auth_user_id=auth.uid() limit 1;
  update public.hr_whatsapp_communications
     set deleted_at = case when p_hide then now() else null end,
         deleted_by = case when p_hide then auth.uid() else null end,
         deleted_by_name = case when p_hide then who_name else null end,
         delete_reason = case when p_hide then nullif(trim(coalesce(p_reason,'')),'') else null end,
         updated_at = now()
   where id = p_id and (p_hide = (deleted_at is null));
  get diagnostics n = row_count;
  insert into public.audit_log(user_id, action, entity, entity_id, details)
  values (auth.uid(), case when p_hide then 'WhatsApp message deleted (hidden)' else 'WhatsApp message restored' end,
          'WhatsApp', p_id, jsonb_build_object('reason', p_reason, 'by', who_name, 'changed', n));
  return jsonb_build_object('ok', true, 'changed', n);
end $$;
revoke all on function public.wa_hide_message(uuid, boolean, text) from public, anon;
grant execute on function public.wa_hide_message(uuid, boolean, text) to authenticated;

-- 2. approved template texts ---------------------------------------------------------------
create table if not exists public.whatsapp_templates (
  name text not null,
  language text not null default 'en',
  status text,
  category text,
  components jsonb not null default '[]'::jsonb,
  synced_at timestamptz not null default now(),
  primary key (name, language)
);
alter table public.whatsapp_templates enable row level security;
drop policy if exists whatsapp_templates_read on public.whatsapp_templates;
create policy whatsapp_templates_read on public.whatsapp_templates for select to authenticated using (true);
-- Written only by the whatsapp-templates-sync Edge Function (service role).

-- 3. private bucket for inbox attachments ------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('whatsapp-media', 'whatsapp-media', false)
on conflict (id) do nothing;
-- No storage policies are added: files are written and read only by the Edge Functions.

-- Check: all three should be true
select exists(select 1 from information_schema.columns where table_schema='public' and table_name='hr_whatsapp_communications' and column_name='deleted_at') as hide_ready,
       to_regclass('public.whatsapp_templates') is not null as templates_ready,
       exists(select 1 from storage.buckets where id='whatsapp-media') as bucket_ready;
