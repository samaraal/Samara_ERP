-- ERP 2.19.95 — "SCAN & ADMINISTER" on the Nursing Dashboard (09-11-2026). Run AFTER 363 / 364. Safe to run again.
-- Adds ONE read-only function: a scanned bed sticker → that bed and the active Guest in it.
-- Nothing is written and nothing existing is changed.
-- TO UNDO: drop function if exists public.bedside_resolve_tag(text);

begin;

create or replace function public.bedside_resolve_tag(p_code text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare t record; v_code text; g jsonb;
begin
  if not public.bedside_can('record') then raise exception 'Not allowed.'; end if;
  v_code := upper(trim(regexp_replace(coalesce(p_code,''),'^SAMARA-BED:','','i')));
  select room_no, bed_no into t from public.bedside_bed_tags where tag_code=v_code and is_active limit 1;
  if t.room_no is null then return jsonb_build_object('result','unknown_tag'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'patient_id',p.patient_id,'title',p.title,'full_name',p.full_name,'room_no',p.room_no,'bed_no',p.bed_no)),'[]'::jsonb)
    into g
    from public.patients p
   where coalesce(p.is_active,true)
     and coalesce(p.admission_status,'')<>'Discharged'
     and trim(coalesce(p.room_no,''))=trim(t.room_no)
     and upper(trim(coalesce(p.bed_no,'')))=upper(trim(t.bed_no));
  return jsonb_build_object('result', case when jsonb_array_length(g)=1 then 'ok' when jsonb_array_length(g)=0 then 'empty_bed' else 'many' end,
                            'room_no',t.room_no,'bed_no',t.bed_no,'guests',g);
end $$;
revoke all on function public.bedside_resolve_tag(text) from public, anon;
grant execute on function public.bedside_resolve_tag(text) to authenticated;

commit;
