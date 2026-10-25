-- ONE-TIME 293 — Physiotherapist phone numbers where the saved name has initials (e.g. "ANISHA.U").
-- SQL 292 matched names exactly, so "ANISHA.U" did not get 7010200016. This matches names that start with the
-- given name ("Dr." / dots / spaces ignored) and saves the number only where none is saved yet.
-- Run once in Supabase SQL Editor after 292. Safe to re-run.
begin;
do $$
declare r record; n int; report text:='';
begin
 for r in select * from (values ('lukkyshkumar','7305918945'),('hemavathi','9344674273'),('anisha','7010200016')) v(norm,phone) loop
  update public.physio_practitioners set phone=r.phone
   where is_active and coalesce(nullif(trim(phone),''),'')=''
     and regexp_replace(lower(regexp_replace(full_name,'^\s*dr\.?\s*','','i')),'[^a-z]','','g') like r.norm||'%';
  get diagnostics n=row_count;
  report:=report||' '||r.norm||'='||n;
 end loop;
 raise notice 'Numbers added (rows):%',report;
end $$;
commit;
notify pgrst,'reload schema';

-- Check: every active physiotherapist and number
-- select o.name organisation,o.phone desk,p.full_name,p.phone from public.physio_organisations o left join public.physio_practitioners p on p.organisation_id=o.id and p.is_active where o.is_active order by 1,3;
