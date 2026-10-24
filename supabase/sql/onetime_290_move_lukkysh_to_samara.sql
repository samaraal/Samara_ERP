-- ONE-TIME 290 — Move Dr. Lukkysh Kumar from Vinayaga Physio Point to Samara Physio (Samara own team, paid per session).
--  • His sessions recorded under Vinayaga move to Samara Physio and his Samara panel entry.
--  • He is set to "Session fee" in Samara (fee agreed per Guest when posting).
--  • His Vinayaga entry is removed (or made inactive if it already has ledger entries). Vinayaga itself stays (Dr. Hemavathi).
-- Stops without changing anything if any of his sessions already has a posted fee. Run once in Supabase SQL Editor.
begin;
do $$
declare samara uuid; vin uuid; sp uuid; vp uuid; moved int:=0; norm text:='lukkyshkumar';
begin
  select id into samara from public.physio_organisations where org_type='Samara' order by (lower(name) like 'samara%') desc, created_at limit 1;
  select id into vin from public.physio_organisations where lower(name) like 'vinayaga%' order by created_at limit 1;
  if samara is null or vin is null then raise exception 'Samara Physio or Vinayaga Physio Point not found — nothing changed';end if;
  -- Dr. Lukkysh Kumar in each organisation ("Dr." / "DR." / spaces / dots ignored)
  select id into sp from public.physio_practitioners where organisation_id=samara and regexp_replace(lower(regexp_replace(full_name,'^\s*dr\.?\s*','','i')),'[^a-z]','','g')=norm limit 1;
  select id into vp from public.physio_practitioners where organisation_id=vin and regexp_replace(lower(regexp_replace(full_name,'^\s*dr\.?\s*','','i')),'[^a-z]','','g')=norm limit 1;
  if sp is null then insert into public.physio_practitioners(organisation_id,full_name,pay_basis,is_active) values(samara,'Dr. Lukkysh Kumar','Session fee',true) returning id into sp;
  else update public.physio_practitioners set pay_basis='Session fee',is_active=true where id=sp;end if;
  if exists(select 1 from public.physio_supplier_ledger l join public.physiotherapy_sessions x on x.id=l.session_id
            where l.kind='Session fee' and l.reversed_at is null and x.organisation_id=vin
              and (x.practitioner_id=vp or regexp_replace(lower(regexp_replace(coalesce(x.physiotherapist_name,''),'^\s*dr\.?\s*','','i')),'[^a-z]','','g')=norm)) then
    raise exception 'Some of his Vinayaga sessions already have a posted fee — reverse those in Therapist Accounts → Ledger first. Nothing changed.';end if;
  -- Session edits normally need a correction approval; this approved one-time move bypasses that guard only here.
  alter table public.physiotherapy_sessions disable trigger physiotherapy_correction_guard;
  -- The SQL Editor has no staff login; this script sets the physiotherapist link itself, so the name-link check is paused too.
  alter table public.physiotherapy_sessions disable trigger a_physio_practitioner_link;
  update public.physiotherapy_sessions x set organisation_id=samara,practitioner_id=sp,physiotherapist_name=(select full_name from public.physio_practitioners where id=sp),updated_at=now()
   where x.organisation_id=vin and (x.practitioner_id=vp or regexp_replace(lower(regexp_replace(coalesce(x.physiotherapist_name,''),'^\s*dr\.?\s*','','i')),'[^a-z]','','g')=norm);
  get diagnostics moved=row_count;
  alter table public.physiotherapy_sessions enable trigger physiotherapy_correction_guard;
  alter table public.physiotherapy_sessions enable trigger a_physio_practitioner_link;
  if vp is not null then
    if exists(select 1 from public.physio_supplier_ledger where practitioner_id=vp) or exists(select 1 from public.physiotherapy_sessions where practitioner_id=vp)
      then update public.physio_practitioners set is_active=false where id=vp;
      else delete from public.physio_practitioners where id=vp;end if;
  end if;
  perform public.record_audit_event('Physiotherapist Moved','Physiotherapy Accounts',sp::text,jsonb_build_object('physiotherapist','Dr. Lukkysh Kumar','from','Vinayaga Physio Point','to','Samara Physio (per session)','sessions_moved',moved),'Success');
  raise notice 'Dr. Lukkysh Kumar: % session(s) moved to Samara Physio', moved;
end $$;
commit;
notify pgrst,'reload schema';
select o.name as organisation,p.full_name,p.pay_basis,p.is_active,(select count(*) from public.physiotherapy_sessions x where x.practitioner_id=p.id) as sessions
from public.physio_practitioners p join public.physio_organisations o on o.id=p.organisation_id order by 1,2;
