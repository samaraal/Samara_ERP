-- ERP 2.20.7 — RENT RECEIPTS FROM THE OWNERS (10-11-2026). Run AFTER SQL 351. Run once; safe to run again.
--   • Rent Account (Samara · Hostel · Director House): for each rent payment / deposit-advance paid, the ERP prints a
--     "Rent Receipt" for the owner to sign. The signed copy (photo / PDF) is then uploaded against that same entry.
--   • rental_accounts: owner's address-of-property and PAN (printed on the receipt; optional).
--   • rental_entries: receipt_no (fixed once given, e.g. RR/SAM/2026-27/001), signed receipt file + who / when uploaded.
--   • New rent_receipt_rpc (Admin / Directors only): owner_details · receipt_no · attach_signed · remove_signed.
-- rental_account_rpc (SQL 351) is NOT changed — its 'load' already returns the new columns.
-- Signed receipts are kept in the existing private bucket expense-bills (Admin / Directors only), folder rent-receipts/.
begin;

alter table public.rental_accounts add column if not exists property_address text;
alter table public.rental_accounts add column if not exists owner_pan text;

alter table public.rental_entries add column if not exists receipt_no text;
alter table public.rental_entries add column if not exists signed_receipt_path text;
alter table public.rental_entries add column if not exists signed_receipt_at timestamptz;
alter table public.rental_entries add column if not exists signed_receipt_by_name text;
create unique index if not exists rental_entries_receipt_no on public.rental_entries(receipt_no) where receipt_no is not null;

create or replace function public.rent_receipt_rpc(p_action text, p jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $f$
declare a jsonb := public.samara_profit_admin();   -- Admin / Directors only (same as Rent Account)
  e public.rental_entries%rowtype; acc public.rental_accounts%rowtype; v_code text; v_fy text; v_fy_start int; v_n int; v_no text;
begin
  if p_action = 'owner_details' then
    update public.rental_accounts set
      property_address = nullif(btrim(coalesce(p->>'property_address','')),''),
      owner_pan = upper(nullif(btrim(coalesce(p->>'owner_pan','')),'')),
      updated_at = now(), updated_by_name = a->>'name'
     where id = (p->>'id')::uuid;
    if not found then raise exception 'Account not found.'; end if;
    return jsonb_build_object('ok',true);

  elsif p_action = 'receipt_no' then
    select * into e from public.rental_entries where id = (p->>'id')::uuid;
    if e.id is null then raise exception 'Entry not found.'; end if;
    if e.voided_at is not null then raise exception 'This entry was removed — no receipt.'; end if;
    if e.kind not in ('Rent payment','Deposit paid') then raise exception 'A receipt is only for rent paid or deposit / advance paid.'; end if;
    if e.receipt_no is not null then return jsonb_build_object('ok',true,'receipt_no',e.receipt_no); end if;
    select * into acc from public.rental_accounts where id = e.account_id;
    v_code := case acc.name when 'Samara' then 'SAM' when 'Hostel' then 'HOS' when 'Director House' then 'DIR' when 'Genset' then 'GEN'
                else upper(left(regexp_replace(acc.name,'[^A-Za-z]','','g'),3)) end;
    v_fy_start := case when extract(month from e.entry_date) >= 4 then extract(year from e.entry_date)::int else extract(year from e.entry_date)::int - 1 end;
    v_fy := v_fy_start::text || '-' || right((v_fy_start + 1)::text, 2);
    perform pg_advisory_xact_lock(hashtext('rent_receipt_no'));
    select coalesce(max(split_part(receipt_no,'/',4)::int),0) + 1 into v_n
      from public.rental_entries where receipt_no like 'RR/'||v_code||'/'||v_fy||'/%';
    v_no := 'RR/'||v_code||'/'||v_fy||'/'||lpad(v_n::text,3,'0');
    update public.rental_entries set receipt_no = v_no where id = e.id and receipt_no is null;
    select receipt_no into v_no from public.rental_entries where id = e.id;
    return jsonb_build_object('ok',true,'receipt_no',v_no);

  elsif p_action = 'attach_signed' then
    if nullif(btrim(coalesce(p->>'path','')),'') is null then raise exception 'Choose the signed receipt photo / PDF.'; end if;
    update public.rental_entries set signed_receipt_path = btrim(p->>'path'), signed_receipt_at = now(), signed_receipt_by_name = a->>'name'
     where id = (p->>'id')::uuid and voided_at is null and kind in ('Rent payment','Deposit paid');
    if not found then raise exception 'Entry not found (or removed).'; end if;
    return jsonb_build_object('ok',true);

  elsif p_action = 'remove_signed' then
    update public.rental_entries set signed_receipt_path = null, signed_receipt_at = null, signed_receipt_by_name = null
     where id = (p->>'id')::uuid;
    if not found then raise exception 'Entry not found.'; end if;
    return jsonb_build_object('ok',true);
  end if;
  raise exception 'Unknown action.';
end $f$;
revoke all on function public.rent_receipt_rpc(text,jsonb) from public, anon;
grant execute on function public.rent_receipt_rpc(text,jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;

-- Check
select name, vendor_name, property_address, owner_pan from public.rental_accounts where category = 'Rent' order by sort_order;
select count(*) filter (where receipt_no is not null) as receipts_given, count(*) filter (where signed_receipt_path is not null) as signed_uploaded
  from public.rental_entries;
