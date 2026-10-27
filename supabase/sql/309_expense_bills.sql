-- ERP 2.18.178 — Expenses recorded the moment they are spent (Admin / Directors), with a compulsory bill photo
-- or "No bill" + reason. Run once in Supabase SQL Editor (after SQL 305). Safe to run again.
-- 1. samara_monthly_expenses: bill_path (photo / PDF in private bucket expense-bills) and no_bill_reason.
-- 2. Private storage bucket expense-bills — Admin / Directors only (upload + view).
-- 3. samara_expense_rpc 'add': every expense except Salaries needs a bill photo OR a "No bill" reason;
--    new 'bill_url'-free design: the page opens the photo with a short signed link (Admin only by storage policy).

begin;

alter table public.samara_monthly_expenses add column if not exists bill_path text;
alter table public.samara_monthly_expenses add column if not exists no_bill_reason text;

create or replace function public.samara_is_admin()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.profiles p
                 where (p.id=auth.uid() or p.auth_user_id=auth.uid())
                   and coalesce(p.is_active,true) and p.role='Admin')
$$;
revoke all on function public.samara_is_admin() from public, anon;
grant execute on function public.samara_is_admin() to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('expense-bills','expense-bills',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists expense_bills_insert on storage.objects;
create policy expense_bills_insert on storage.objects for insert to authenticated
  with check (bucket_id='expense-bills' and public.samara_is_admin());
drop policy if exists expense_bills_read on storage.objects;
create policy expense_bills_read on storage.objects for select to authenticated
  using (bucket_id='expense-bills' and public.samara_is_admin());

-- 'add' now stores the bill and enforces bill-or-reason. Other actions unchanged.
do $patch$
declare def text;
begin
  def := pg_get_functiondef('public.samara_expense_rpc(text,jsonb)'::regprocedure);
  if position('2.18.178 bills' in def) > 0 then raise notice 'Expense bills already installed.'; return; end if;
  def := replace(def,
    $a$    if (p->>'date')::date < date '2026-08-27' then raise exception 'Dates before 27-08-2026 are not allowed.'; end if;$a$,
    $b$    if (p->>'date')::date < date '2026-08-27' then raise exception 'Dates before 27-08-2026 are not allowed.'; end if;
    /* 2.18.178 bills */
    if v_head<>'Salaries' and nullif(btrim(coalesce(p->>'bill_path','')),'') is null
       and length(btrim(coalesce(p->>'no_bill_reason','')))<3 then
      raise exception 'Add a photo of the bill, or tick "No bill" and give the reason.';
    end if;$b$);
  def := replace(def,
    $a$insert into public.samara_monthly_expenses(expense_date,head,description,amount,paid_mode,paid_to,employee_profile_id,reference,created_by,created_by_name)$a$,
    $b$insert into public.samara_monthly_expenses(expense_date,head,description,amount,paid_mode,paid_to,employee_profile_id,reference,created_by,created_by_name,bill_path,no_bill_reason)$b$);
  def := replace(def,
    $a$           (a->>'id')::uuid, a->>'name')
    returning id into v_id;$a$,
    $b$           (a->>'id')::uuid, a->>'name',
           nullif(btrim(coalesce(p->>'bill_path','')),''), nullif(btrim(coalesce(p->>'no_bill_reason','')),''))
    returning id into v_id;$b$);
  if position('2.18.178 bills' in def)=0 or position('bill_path,no_bill_reason)' in def)=0 or position($x$p->>'no_bill_reason','')),''))$x$ in def)=0 then
    raise exception 'samara_expense_rpc did not look as expected — nothing changed.';
  end if;
  execute def;
end $patch$;

notify pgrst,'reload schema';
commit;

-- Check
select (select count(*) from storage.buckets where id='expense-bills')=1 as bucket_ready,
       strpos(pg_get_functiondef('public.samara_expense_rpc(text,jsonb)'::regprocedure),'2.18.178 bills')>0 as rpc_ready;
