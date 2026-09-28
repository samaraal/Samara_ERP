-- Samara Care ERP 2.14.79 — Help / உதவி assistant: question log
-- Staff questions to the ERP Help assistant (text or voice transcript, page, role). Screenshots are NEVER stored.
-- Rows are written only by the erp-help-ai Edge Function (service role). Only Admin can read them.
-- Safe to run more than once.

create table if not exists public.erp_help_questions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid,
  staff_name text,
  staff_role text,
  page text,
  question text not null,
  answer text,
  language text,
  via_voice boolean not null default false,
  had_screenshot boolean not null default false,
  helpful boolean
);
create index if not exists erp_help_questions_created_idx on public.erp_help_questions (created_at desc);
create index if not exists erp_help_questions_user_idx on public.erp_help_questions (user_id, created_at desc);

alter table public.erp_help_questions enable row level security;
revoke all on public.erp_help_questions from anon;
grant select on public.erp_help_questions to authenticated;

drop policy if exists "admin reads erp help questions" on public.erp_help_questions;
create policy "admin reads erp help questions" on public.erp_help_questions
  for select to authenticated using (public.current_user_has_role(array['Admin']));

-- Staff may mark their own answer helpful / not helpful (only that column).
create or replace function public.erp_help_feedback(p_id uuid, p_helpful boolean)
returns void language sql security definer set search_path=public as $$
  update public.erp_help_questions set helpful=p_helpful
  where id=p_id and user_id=auth.uid() and created_at > now() - interval '1 day';
$$;
revoke all on function public.erp_help_feedback(uuid,boolean) from public, anon;
grant execute on function public.erp_help_feedback(uuid,boolean) to authenticated;

notify pgrst,'reload schema';

-- Check: should return the table name
select to_regclass('public.erp_help_questions') as help_table;
