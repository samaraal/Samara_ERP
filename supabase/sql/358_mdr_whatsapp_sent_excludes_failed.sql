-- ERP 2.19.86 — DAILY REPORT, slide "Family & communication" (08-11-2026). Run AFTER 349 / 355. Safe to run again.
-- "WhatsApp messages sent" counted every attempt, including the failed ones (07-11-2026: 1,047 "sent" of which
-- 1,012 had failed). Now: "WhatsApp sent" = accepted by WhatsApp (not Failed), a separate "WhatsApp attempts"
-- number, and the "WhatsApp by type" table shows Attempts · Sent · Failed. Patches the live mis_daily_report_core
-- in place; nothing else changes. After running: Daily Report → pick the day → "↻ Prepare again".
begin;
do $do$
declare def text; newdef text;
  a1 text := $a$k := k || public.mdr_k('WhatsApp messages sent','', $q$select count(*) from public.hr_whatsapp_communications w where w.direction='outbound' and (w.created_at at time zone 'Asia/Kolkata')::date = $1$q$, d);$a$;
  b1 text := $b$k := k || public.mdr_k('WhatsApp sent','', $q$select count(*) from public.hr_whatsapp_communications w where w.direction='outbound' and coalesce(w.status,'') <> 'Failed' and (w.created_at at time zone 'Asia/Kolkata')::date = $1$q$, d, 'accepted by WhatsApp');
  k := k || public.mdr_k('WhatsApp attempts','', $q$select count(*) from public.hr_whatsapp_communications w where w.direction='outbound' and (w.created_at at time zone 'Asia/Kolkata')::date = $1$q$, d, 'including failed tries');$b$;
  a2 text := $a$'["Type","Sent","Failed"]'::jsonb$a$;
  b2 text := $b$'["Type","Attempts","Sent","Failed"]'::jsonb$b$;
  a3 text := $a$count(*), count(*) filter (where w.status='Failed')) as r$a$;
  b3 text := $b$count(*), count(*) filter (where coalesce(w.status,'') <> 'Failed'), count(*) filter (where w.status='Failed')) as r$b$;
begin
  select pg_get_functiondef('public.mis_daily_report_core(date)'::regprocedure) into def;
  if position('WhatsApp attempts' in def) > 0 then raise notice 'Already patched.'; return; end if;
  if position(a1 in def)=0 or position(a2 in def)=0 or position(a3 in def)=0 then
    raise exception 'Could not find the WhatsApp lines in mis_daily_report_core — nothing changed. Send this message to Claude.';
  end if;
  newdef := replace(replace(replace(def, a1, b1), a2, b2), a3, b3);
  execute newdef;
end $do$;
commit;
notify pgrst, 'reload schema';
select position('WhatsApp attempts' in pg_get_functiondef('public.mis_daily_report_core(date)'::regprocedure)) > 0 as whatsapp_patched;
