-- Samara Care ERP · ONE-TIME FIX (not a migration — run once, do not re-run later)
-- Guest: MOG-2026-09-0018 (Mrs. Shylaja Nanu, Room 109-B)
-- Moves her CONSUMABLES charges dated 07-10-2026 to 06-10-2026.
--
-- Why they show 07-10: a store charge is dated when Accounts approves it, not when the
-- nurse raised / used it. These were approved just after midnight, so they landed on 07-10.
--
-- Run in Supabase SQL Editor in three steps (select each block and Run):
--   STEP 1  look at what will move          (read only)
--   STEP 2  check the glove entries for duplicates (read only)
--   STEP 3  move the dates                  (writes; keeps a log of old dates)
-- Only billing dates change. Amounts, items and approvals stay exactly as they are.


-- ═══ STEP 1 · Preview: every 07-10-2026 store/manual charge for this Guest ═══════════
select bt.id,
       bt.category,
       split_part(bt.description,' · ',1)                                         as item,
       bt.amount,
       to_char(bt.transaction_date at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as billed_at_ist,
       to_char(r.created_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM')        as raised_at_ist,
       r.quantity,
       case when bt.category = 'Consumables' then 'WILL MOVE to 06-10' else 'stays' end as action
from public.billing_transactions bt
join public.patients p on p.id = bt.patient_id
left join public.bill_charge_requests r on r.billing_transaction_id = bt.id
where p.patient_id = 'MOG-2026-09-0018'
  and bt.transaction_type = 'Charge'
  and coalesce(bt.auto_generated,false) = false
  and (bt.transaction_date at time zone 'Asia/Kolkata')::date = date '2026-10-07'
order by bt.category, bt.transaction_date;


-- ═══ STEP 2 · Duplicate check for the Examination Gloves entries ═════════════════════
-- possible_duplicate = YES when another glove request for her has the same quantity and
-- amount and was raised within 10 minutes of this one. Every line should say "no".
with g as (
  select bt.id, bt.amount, r.id as request_id, r.quantity, r.created_at, r.raised_by,
         r.store_item_id, r.status
  from public.billing_transactions bt
  join public.patients p on p.id = bt.patient_id
  left join public.bill_charge_requests r on r.billing_transaction_id = bt.id
  where p.patient_id = 'MOG-2026-09-0018'
    and bt.transaction_type = 'Charge'
    and bt.description ilike 'Examination Gloves%'
    and (bt.transaction_date at time zone 'Asia/Kolkata')::date = date '2026-10-07'
)
select to_char(g.created_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as raised_at_ist,
       coalesce(pr.full_name,'—') as raised_by,
       g.quantity, g.amount, g.status,
       case when g.request_id is null then 'NO REQUEST LINKED — check manually'
            when exists (select 1 from g g2
                         where g2.id <> g.id and g2.quantity = g.quantity and g2.amount = g.amount
                           and abs(extract(epoch from g2.created_at - g.created_at)) <= 600)
            then 'YES — check' else 'no' end as possible_duplicate
from g
left join lateral (select full_name from public.profiles x
                   where x.id = g.raised_by or x.auth_user_id = g.raised_by limit 1) pr on true
order by g.created_at;


-- ═══ STEP 3 · Move the Consumables charges to 06-10-2026 ══════════════════════════════
-- Each charge keeps the time it was raised if that was on 06-10; otherwise it is set to
-- 06-10-2026 11:59 PM. Old dates are saved in billing_date_fix_log.
begin;

create table if not exists public.billing_date_fix_log (
  id uuid primary key default gen_random_uuid(),
  billing_transaction_id uuid not null,
  patient_code text,
  old_transaction_date timestamptz not null,
  new_transaction_date timestamptz not null,
  reason text,
  fixed_at timestamptz not null default now()
);
alter table public.billing_date_fix_log enable row level security;

with target as (
  select bt.id, bt.transaction_date as old_date,
         case when r.created_at is not null
                   and (r.created_at at time zone 'Asia/Kolkata')::date = date '2026-10-06'
              then r.created_at
              else timestamptz '2026-10-06 23:59:00+05:30' end as new_date
  from public.billing_transactions bt
  join public.patients p on p.id = bt.patient_id
  left join public.bill_charge_requests r on r.billing_transaction_id = bt.id
  where p.patient_id = 'MOG-2026-09-0018'
    and bt.transaction_type = 'Charge'
    and bt.category = 'Consumables'
    and coalesce(bt.auto_generated,false) = false
    and (bt.transaction_date at time zone 'Asia/Kolkata')::date = date '2026-10-07'
), logged as (
  insert into public.billing_date_fix_log(billing_transaction_id,patient_code,old_transaction_date,new_transaction_date,reason)
  select id,'MOG-2026-09-0018',old_date,new_date,'One-time: consumables used 06-10, approved after midnight'
  from target
  returning billing_transaction_id
)
update public.billing_transactions bt
   set transaction_date = t.new_date
  from target t
 where bt.id = t.id;

commit;

-- After STEP 3: should list the moved charges, now on 06-10-2026
select to_char(l.new_transaction_date at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as now_dated,
       to_char(l.old_transaction_date at time zone 'Asia/Kolkata','DD-MM-YYYY HH12:MI AM') as was_dated,
       split_part(bt.description,' · ',1) as item, bt.amount
from public.billing_date_fix_log l
join public.billing_transactions bt on bt.id = l.billing_transaction_id
where l.patient_code = 'MOG-2026-09-0018'
order by l.new_transaction_date;
