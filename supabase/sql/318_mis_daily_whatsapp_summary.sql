-- ERP 2.19.11 — MIS: MORNING WHATSAPP SUMMARY to Admin / Directors (29-10-2026). Run AFTER SQL 317. Safe to run again.
--
-- Every morning at about 7:30 AM IST each active Admin / Director with a mobile number gets ONE WhatsApp:
--   the previous day's MIS audit — number of high / medium findings and the top findings in Clinical, Financial and
--   Operational — and is asked to open MIS & Audit in the ERP for the list. Re-tried at 8:00, 8:30 and 9:00 AM for anyone
--   it did not reach; never sent twice in a day.
-- Sending needs: Edge Function "mis-daily-summary-dispatch" deployed, Meta template "samara_mis_daily_summary" approved
--   (see docs/META_TEMPLATE_samara_mis_daily_summary.md), then the secret MIS_WHATSAPP_ENABLED=true.
--   Until then the job runs silently and sends nothing.
begin;

create table if not exists public.mis_whatsapp_summaries(
  id uuid primary key default gen_random_uuid(),
  summary_day date not null,
  recipient_profile_id uuid,
  recipient_name text,
  recipient_number text not null,
  status text not null default 'Sending' check (status in ('Sending','Sent','Failed')),
  high_count int, medium_count int,
  meta_message_id text, error_text text,
  created_at timestamptz not null default now(), sent_at timestamptz, updated_at timestamptz not null default now()
);
create index if not exists mis_whatsapp_summaries_day on public.mis_whatsapp_summaries(summary_day, recipient_number);
alter table public.mis_whatsapp_summaries enable row level security;
revoke all on public.mis_whatsapp_summaries from public, anon, authenticated;
grant select on public.mis_whatsapp_summaries to authenticated;
drop policy if exists mis_whatsapp_summaries_admin_read on public.mis_whatsapp_summaries;
create policy mis_whatsapp_summaries_admin_read on public.mis_whatsapp_summaries for select to authenticated
  using (exists(select 1 from public.profiles p where (p.id=auth.uid() or p.auth_user_id=auth.uid()) and p.role='Admin'));
grant all on public.mis_whatsapp_summaries to service_role;

-- The WhatsApp text for one day: one line per area (no line breaks inside a WhatsApp template value).
create or replace function public.mis_daily_summary(p_day date default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare d date := coalesce(p_day, (now() at time zone 'Asia/Kolkata')::date - 1);
  r jsonb; s jsonb; c jsonb; line text; parts text[]; hi int := 0; me int := 0; lines jsonb := '{}'::jsonb; nrun int := 0;
begin
  r := public.mis_audit_report_core(d, d);
  for s in select * from jsonb_array_elements(r->'sections') loop
    parts := '{}';
    for c in select x from jsonb_array_elements(s->'checks') x
              where coalesce((x->>'count')::int,0) > 0 and not (x ? 'error')
              order by case x->>'severity' when 'high' then 0 when 'medium' then 1 else 2 end, (x->>'count')::int desc loop
      if c->>'severity'='high' then hi := hi + 1; elsif c->>'severity'='medium' then me := me + 1; end if;
      if coalesce(array_length(parts,1),0) < 4 then
        parts := parts || ((c->>'count')||' × '||(c->>'title'));
      end if;
    end loop;
    nrun := nrun + (select count(*) from jsonb_array_elements(s->'checks') x where x ? 'error');
    line := case when coalesce(array_length(parts,1),0)=0 then 'All clear ✓' else array_to_string(parts,'; ') end;
    lines := lines || jsonb_build_object(s->>'key', left(regexp_replace(line,'\s+',' ','g'), 300));
  end loop;
  return jsonb_build_object('day', d, 'day_label', to_char(d,'DD-MM-YYYY'), 'high', hi, 'medium', me, 'not_run', nrun,
                            'clinical', coalesce(lines->>'clinical','—'), 'financial', coalesce(lines->>'financial','—'),
                            'operational', coalesce(lines->>'operational','—'));
end $f$;
revoke all on function public.mis_daily_summary(date) from public, anon, authenticated;
grant execute on function public.mis_daily_summary(date) to service_role;

-- 7:31, 8:01, 8:31 and 9:01 AM IST (02:01 … 03:31 UTC), same URL + secret header as the clinical push job.
do $$
declare base_cmd text; new_cmd text;
begin
  if not exists(select 1 from pg_namespace where nspname='cron') then raise notice 'pg_cron not installed; MIS WhatsApp job not scheduled.'; return; end if;
  select command into base_cmd from cron.job where jobname = 'samara-clinical-push-dispatch' limit 1;
  if base_cmd is null or base_cmd not like '%/functions/v1/clinical-push-dispatch%' then
    raise notice 'samara-clinical-push-dispatch cron job not found; MIS WhatsApp job not scheduled.';
    return;
  end if;
  new_cmd := replace(base_cmd, '/functions/v1/clinical-push-dispatch', '/functions/v1/mis-daily-summary-dispatch');
  perform cron.unschedule(jobid) from cron.job where jobname = 'samara-mis-daily-summary';
  perform cron.schedule('samara-mis-daily-summary', '1,31 2-3 * * *', new_cmd);
end $$;

notify pgrst, 'reload schema';
commit;

-- Check: the job, and the text that would go for yesterday
select jobname, schedule from cron.job where jobname = 'samara-mis-daily-summary';
select public.mis_daily_summary();
