-- Explicit zero nursing tariffs mean no nursing charge. NULL retains legacy defaults.
-- Patch the existing function so departure/package safeguards remain intact.
-- Historical corrections must be individually reviewed; this migration changes no ledger rows.
begin;
do $patch$
declare s text; old text; replacement text; a int; b int; section text;
begin
 s:=pg_get_functiondef('public.run_daily_billing_automation(date,boolean)'::regprocedure);
 if position('-- ZERO_NURSING_TARIFF_V1' in s)>0 then return; end if;
 a:=position('-- NURSING: separately isolated' in s); b:=position('-- Special Nurse:' in s);
 if a=0 or b<=a then raise exception 'Unexpected nursing block'; end if;
 section:=substring(s from a for b-a);
 if (length(section)-length(replace(section,'end loop;','')))/length('end loop;')<>1 then raise exception 'Unexpected nursing loop'; end if;
 section:='if v_nursing_rate>0 then '||chr(10)||replace(section,'end loop;','end if; end loop;');
 s:=substring(s from 1 for a-1)||section||substring(s from b);
 for old,replacement in select * from (values
 ('nullif(rb.nursing_daily_rate,0)','rb.nursing_daily_rate'),
 (') start_date',') start_date, coalesce((select b.nursing_daily_rate from public.room_beds b where b.patient_id=p.id or (b.room_no=p.room_no and upper(coalesce(b.bed_no,''''))=upper(coalesce(p.bed_no,''''))) order by (b.patient_id=p.id) desc,b.updated_at desc nulls last limit 1),800)>0 nursing_required'),
 ('select ap.patient_id, gs::date charge_date','select ap.patient_id, ap.nursing_required, gs::date charge_date'),
 ('count(*) filter(where n.id is null)','count(*) filter(where n.id is null and e.nursing_required)')
 ) changes(old_text,new_text)
 loop
 if (length(s)-length(replace(s,old,'')))/length(old)<>1 then raise exception 'Unexpected billing function anchor: %',old; end if;
 s:=replace(s,old,replacement);
 end loop;
 s:=replace(s,'-- NURSING: separately isolated','-- ZERO_NURSING_TARIFF_V1'||chr(10)||' -- NURSING: separately isolated');
 execute s;
end $patch$;
commit;
