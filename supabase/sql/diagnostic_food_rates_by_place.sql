-- READ-ONLY check: food vendor rates per place and how October receipts were priced. Changes nothing.
-- Run in Supabase > SQL Editor and send a screenshot of the result.
with s as (select data from public.fv_settings where id),
places as (
  select p->>'key' k, p->>'name' place, p->>'vendor_id' vendor_id from s, jsonb_array_elements(s.data->'places') p
),
orders_v as (
  select coalesce(o.data->>'place','(no place)') place, o.data->>'vendor_id' vendor_id, count(*) n
  from public.fv_orders o where (o.data->>'date')>='2026-10-01' group by 1,2
)
select 1 ord,'1 Place → vendor id' section, place||' → '||vendor_id detail from places
union all
select 2,'2 Orders since 01-10 (place / vendor id / count)', place||' / '||coalesce(vendor_id,'-')||' / '||n from orders_v
union all
select 3,'3 Rates saved', coalesce((select place from places where vendor_id=r.vendor_id),'(unknown vendor '||left(r.vendor_id,8)||')')
  ||' · '||r.item||' · ₹'||r.price||' from '||to_char(r.effective,'DD-MM-YYYY')||' · saved '||to_char(r.created_at at time zone 'Asia/Kolkata','DD-MM-YYYY HH24:MI')
from public.fv_rates r
union all
select 4,'4 Receipts since 01-10 (priced)', coalesce((select place from places where vendor_id=l.vendor_id),'(unknown vendor '||left(l.vendor_id,8)||')')
  ||' · '||to_char(l.day,'DD-MM-YYYY')||' '||coalesce(l.data->>'slot','')||' · G '||coalesce(l.data->>'residents','0')||' @ '||coalesce(l.data->>'unit_price','-')
  ||' · E '||coalesce(l.data->>'employees','0')||' @ '||coalesce(l.data->>'employee_unit_price','-')||' · ₹'||coalesce(l.amount::text,'-')
from public.fv_ledger l where l.kind='Receipt' and l.day>='2026-10-01'
order by 1,2,3;
