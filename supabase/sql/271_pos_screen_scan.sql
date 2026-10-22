-- ERP 2.18.68 — HDFC swipe machine: SCAN THE MACHINE SCREEN instead of typing (no cheating with made-up codes).
-- Run once in Supabase SQL Editor (after SQL 270). Safe to run again.
-- 1. pos_screen_scans: every scan attempt (passed or not) with both pictures, what was read and every check.
-- 2. Storage bucket pos-screen-scans (private) for the pictures.
-- 3. record_pos_card_payment_scan(): saves the payment ONLY from a PASSED scan — amount, RRN, Transaction ID,
--    approval code and Card / UPI come from the scan, never from the staff. A scan can be used once, within 30 minutes.
-- 4. pos_card_slips gains rrn / transaction_id / scan_id; the same RRN or Transaction ID can never be saved twice.
-- 5. Typed entry (record_pos_card_payment, 2.18.67) is now ADMIN ONLY — the fallback when a screen cannot be scanned.
begin;

create table if not exists public.pos_screen_scans(
  id uuid primary key,
  scanned_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  status text not null check(status in ('Verified','Rejected')),
  amount numeric(12,2),
  paid_by text check(paid_by is null or paid_by in ('Card','UPI on machine')),
  rrn text, transaction_id text, approval_code text, card_last4 text, utr text, mid text, tid text,
  txn_time timestamptz,
  image_paths text[] not null default '{}',
  read jsonb, checks jsonb, model text,
  used_at timestamptz, used_slip_id uuid
);
create index if not exists pos_screen_scans_created_idx on public.pos_screen_scans(created_at desc);
alter table public.pos_screen_scans enable row level security;
drop policy if exists pos_screen_scans_staff_read on public.pos_screen_scans;
create policy pos_screen_scans_staff_read on public.pos_screen_scans for select to authenticated
  using (exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.is_active,true) and p.role in ('Admin','Manager','Accounts')));
-- writes only by the pos-screen-scan Edge Function (service role) and the function below

alter table public.pos_card_slips add column if not exists rrn text;
alter table public.pos_card_slips add column if not exists transaction_id text;
alter table public.pos_card_slips add column if not exists scan_id uuid references public.pos_screen_scans(id);
alter table public.pos_card_slips add column if not exists entry_method text not null default 'Typed (Admin)';
create unique index if not exists pos_card_slips_rrn_unique on public.pos_card_slips(rrn) where rrn is not null;
create unique index if not exists pos_card_slips_txn_unique on public.pos_card_slips(transaction_id) where transaction_id is not null;
create unique index if not exists pos_card_slips_scan_unique on public.pos_card_slips(scan_id) where scan_id is not null;

-- Pictures: private bucket; Admin / Manager / Accounts may view (signed URLs from the ERP).
insert into storage.buckets(id,name,public) values('pos-screen-scans','pos-screen-scans',false) on conflict (id) do nothing;
drop policy if exists pos_screen_scans_pictures_read on storage.objects;
create policy pos_screen_scans_pictures_read on storage.objects for select to authenticated
  using (bucket_id='pos-screen-scans' and exists(select 1 from public.profiles p where p.id=auth.uid() and coalesce(p.is_active,true) and p.role in ('Admin','Manager','Accounts')));

create or replace function public.record_pos_card_payment_scan(
  p_patient_id uuid, p_transaction_type text, p_category text, p_description text, p_scan_id uuid)
returns table(transaction_id uuid, voucher_no text, slip_id uuid, amount numeric, paid_by text, reference text)
language plpgsql security definer set search_path to 'public' as $$
#variable_conflict use_column
declare v_role text; s record; v_tx uuid; v_voucher text; v_slip uuid; v_old record; v_code text;
begin
  select role into v_role from public.profiles where id=auth.uid() and coalesce(is_active,true);
  if v_role is null or v_role not in ('Admin','Manager','Accounts') then
    raise exception 'Only Admin, Manager or Accounts can record swipe machine payments.';
  end if;
  if p_transaction_type not in ('Payment','Advance') then
    raise exception 'Swipe machine entry is only for Payment or Advance.';
  end if;
  select * into s from public.pos_screen_scans where id=p_scan_id for update;
  if not found then raise exception 'Scan not found. Please scan the machine screen again.'; end if;
  if s.status<>'Verified' then raise exception 'This scan did not pass the checks. Please scan the machine screen again.'; end if;
  if s.used_at is not null then raise exception 'This scan has already been used for a payment.'; end if;
  if s.created_at < now()-interval '30 minutes' then raise exception 'This scan is older than 30 minutes. Please scan the machine screen again.'; end if;
  if s.amount is null or s.amount<=0 then raise exception 'The scanned amount is not valid. Please scan again.'; end if;

  select c.voucher_no, c.amount as amt into v_old from public.pos_card_slips c
   where (s.rrn is not null and c.rrn=s.rrn) or (s.transaction_id is not null and c.transaction_id=s.transaction_id) limit 1;
  if found then
    raise exception 'This swipe machine payment is already entered as % for ₹%. It cannot be entered twice.', v_old.voucher_no, v_old.amt;
  end if;

  v_code := coalesce(nullif(s.approval_code,''), s.rrn);
  select r.transaction_id, r.voucher_no into v_tx, v_voucher
    from public.record_voucher_transaction(p_patient_id,p_transaction_type,p_category,s.amount,'Card Payment',
      coalesce(nullif(trim(p_description),''), case when s.paid_by='UPI on machine' then 'UPI on HDFC swipe machine' else 'Card on HDFC swipe machine' end)
      ||' · RRN '||coalesce(s.rrn,'—')||' · Txn ID '||coalesce(s.transaction_id,'—'),auth.uid()) r;

  insert into public.pos_card_slips(billing_transaction_id,voucher_no,patient_id,amount,paid_by,approval_code,card_last4,terminal,slip_date,entered_by,
                                    rrn,transaction_id,scan_id,entry_method)
  values(v_tx,v_voucher,p_patient_id,s.amount,coalesce(s.paid_by,'Card'),v_code,
         case when s.paid_by='UPI on machine' then null else nullif(s.card_last4,'') end,
         'HDFC Mosambee MID '||coalesce(s.mid,'—')||' TID '||coalesce(s.tid,'—'),
         coalesce((s.txn_time at time zone 'Asia/Kolkata')::date,(now() at time zone 'Asia/Kolkata')::date),auth.uid(),
         s.rrn,s.transaction_id,s.id,'Screen scan')
  returning id into v_slip;

  update public.pos_screen_scans set used_at=now(), used_slip_id=v_slip where id=s.id;
  return query select v_tx, v_voucher, v_slip, s.amount, coalesce(s.paid_by,'Card'),
    case when s.paid_by='UPI on machine' then 'RRN '||coalesce(s.rrn,'') else 'Appr. '||v_code end;
end $$;
revoke all on function public.record_pos_card_payment_scan(uuid,text,text,text,uuid) from public, anon;
grant execute on function public.record_pos_card_payment_scan(uuid,text,text,text,uuid) to authenticated;

-- Typed entry (2.18.67) becomes ADMIN ONLY (fallback when the screen cannot be scanned).
do $$
declare src text;
begin
  select pg_get_functiondef('public.record_pos_card_payment(uuid,text,text,numeric,text,text,text,text)'::regprocedure) into src;
  if src like '%v_role not in (''Admin'',''Manager'',''Accounts'')%' then
    src := replace(src, 'v_role not in (''Admin'',''Manager'',''Accounts'')', 'v_role <> ''Admin''');
    src := replace(src, 'Only Admin, Manager or Accounts can record swipe machine payments.', 'Typed swipe machine entry is Admin only. Please use Scan machine screen.');
    execute src;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;

-- Check
select (select count(*) from public.pos_screen_scans) as scans,
       (select id from storage.buckets where id='pos-screen-scans') as bucket,
       (select count(*) from pg_proc where proname='record_pos_card_payment_scan') as scan_fn,
       position('v_role <> ''Admin''' in pg_get_functiondef('public.record_pos_card_payment(uuid,text,text,numeric,text,text,text,text)'::regprocedure))>0 as typed_admin_only;
