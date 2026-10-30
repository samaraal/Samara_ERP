-- 2.19.21 (31-10-2026): MIS & Audit — every dated finding follows the chosen period.
-- Before: many "still open" checks (telephone/verbal orders, indents, incidents, charges waiting …) listed items
-- from ANY date, so choosing "Yesterday" still showed records from 2-Oct / 15-Oct.
-- Now: those checks show only items whose date (the date shown in the DATE column) falls inside the period.
-- A few checks describe the CURRENT state and have no meaningful date (stock levels, items with no rate,
-- current Guests' balance, consent not uploaded, equipment service due) — they still show for every period
-- and say so in their description.
-- Also used by the morning WhatsApp summary (SQL 318) through mis_audit_report_core.
-- Safe to run more than once. Changes only the helper public.mis_check (same name and arguments).

begin;

create or replace function public.mis_check(p_key text, p_title text, p_severity text, p_page text, p_detail text,
                                            p_sql text, p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare n int; amt numeric; rows jsonb; v_sql text := p_sql; v_detail text := p_detail;
  -- checks that describe the current state (shown whatever the period)
  current_keys constant text[] := array['rate_not_set','store_rate_not_set','high_dues','consent_pending',
                                        'stock_out','stock_low','stock_expired','stock_expiring','equipment_service'];
begin
  if p_key = any(current_keys) then
    v_detail := concat_ws(' ', p_detail, '(Current status — shown for every period.)');
  elsif position('$1' in p_sql) = 0 then
    -- a dated "still open" list: keep only items dated inside the chosen period
    v_sql := format($w$select * from (%s) z0 where z0.sort_at is not null
                       and (z0.sort_at at time zone 'Asia/Kolkata')::date between $1 and $2$w$, p_sql);
  end if;
  execute format($q$
    with q as (%s)
    select count(*)::int, sum(amount),
           coalesce((select jsonb_agg(jsonb_build_object('date',z.date,'who',z.who,'detail',z.detail,'amount',z.amount))
                       from (select * from q order by sort_at desc nulls last limit 25) z), '[]'::jsonb)
      from q $q$, v_sql)
  into n, amt, rows using p_from, p_to;
  return jsonb_build_object('key',p_key,'title',p_title,'severity',p_severity,'page',p_page,'detail',v_detail,
                            'count',coalesce(n,0),'amount',amt,'rows',rows);
exception when others then
  return jsonb_build_object('key',p_key,'title',p_title,'severity',p_severity,'page',p_page,'detail',v_detail,
                            'count',0,'rows','[]'::jsonb,'error',left(sqlerrm,300));
end $f$;
revoke all on function public.mis_check(text,text,text,text,text,text,date,date) from public, anon, authenticated;

commit;
