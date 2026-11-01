-- 329 — Physiotherapy: session fee posted AUTOMATICALLY when the nurse marks the session Completed (ERP 2.19.31)
-- Uses only the fee Admin / Director already agreed for that physiotherapist + Guest (the last posted, not reversed
-- session fee). First session of a new physiotherapist + Guest (no agreed fee yet) stays in "Completed sessions
-- awaiting fee posting" for Admin to enter the fee once; from then on every session for that pair posts itself.
-- Salaried physiotherapists: nothing posted (as before). Nurses never see or set the fee.
-- Never blocks the nurse: any problem just leaves the session for manual "Post session fee".
-- Run once in Supabase SQL Editor after 328. Safe to re-run.
begin;
create or replace function public.physio_auto_post_fee() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare org public.physio_organisations%rowtype; pr public.physio_practitioners%rowtype;
 agreed numeric(12,2); snap jsonb; who uuid;
begin
 if new.status is distinct from 'Completed' then return new;end if;
 if tg_op='UPDATE' and old.status='Completed' then return new;end if;
 if new.practitioner_id is null or new.organisation_id is null or new.patient_id is null then return new;end if;
 if new.session_date>(now() at time zone 'Asia/Kolkata')::date then return new;end if;
 begin
   if exists(select 1 from public.physio_supplier_ledger where session_id=new.id and kind='Session fee' and reversed_at is null) then return new;end if;
   select * into org from public.physio_organisations where id=new.organisation_id and is_active;
   if not found then return new;end if;
   select * into pr from public.physio_practitioners where id=new.practitioner_id and organisation_id=org.id and is_active;
   if not found or coalesce(pr.pay_basis,'Session fee')='Salary' then return new;end if;
   -- the fee Admin agreed for this physiotherapist + Guest (latest posted, not reversed)
   select l.rate into agreed from public.physio_supplier_ledger l
    where l.practitioner_id=pr.id and l.kind='Session fee' and l.reversed_at is null and l.rate is not null and l.rate>0
      and l.snapshot->>'patient_id'=new.patient_id::text
    order by l.entry_date desc,l.voucher_number desc limit 1;
   if agreed is null then return new;end if; -- no agreed fee yet: Admin posts the first one by hand
   who:=coalesce(auth.uid(),new.performed_by,(select l.created_by from public.physio_supplier_ledger l where l.practitioner_id=pr.id order by l.created_at desc limit 1));
   if who is null then return new;end if;
   select jsonb_build_object('organisation',org.name,'physiotherapist',pr.full_name,'patient_id',p.id,'patient_name',concat_ws(' ',p.title,p.full_name),
     'resident_id',p.patient_id,'room',concat_ws('-',p.room_no,p.bed_no),'session_date',new.session_date,'session_time',new.scheduled_time,
     'actual_time',new.actual_time,'notes',new.notes,'auto_posted',true) into snap from public.patients p where p.id=new.patient_id;
   insert into public.physio_supplier_ledger(organisation_id,practitioner_id,session_id,entry_date,kind,amount,rate,snapshot,created_by,request_key,request_data,notes)
   values(org.id,pr.id,new.id,new.session_date,'Session fee',agreed,agreed,coalesce(snap,'{}'),who,gen_random_uuid(),
     jsonb_build_object('auto',true,'session_id',new.id,'rate',agreed),'Auto-posted on session completion (agreed fee for this Guest)');
 exception when others then
   return new; -- never block the nurse's session entry
 end;
 return new;
end $$;
revoke all on function public.physio_auto_post_fee() from public,anon,authenticated;
drop trigger if exists z_physio_auto_post_fee on public.physiotherapy_sessions;
create trigger z_physio_auto_post_fee after insert or update of status on public.physiotherapy_sessions
 for each row execute function public.physio_auto_post_fee();
commit;
notify pgrst,'reload schema';
select 'Physiotherapy session fee now auto-posts at the agreed fee' as result;
