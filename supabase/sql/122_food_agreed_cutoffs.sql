-- Agreed deadlines for new orders, draft saves/finalisation and revisions.
-- Breakfast is stored as Tiffin by the ERP. All deadlines are in India time.
begin;
create or replace function public.fv_order_deadline(order_data jsonb)
returns timestamptz language sql immutable set search_path=public,pg_temp as $$
 select case order_data->>'slot'
 when 'Tiffin' then (((order_data->>'date')::date - 1) + time '21:00') at time zone 'Asia/Kolkata'
 when 'Breakfast' then (((order_data->>'date')::date - 1) + time '21:00') at time zone 'Asia/Kolkata'
 when 'Lunch' then ((order_data->>'date')::date + time '08:00') at time zone 'Asia/Kolkata'
 when 'Dinner' then ((order_data->>'date')::date + time '17:00') at time zone 'Asia/Kolkata'
 else null end
$$;
create or replace function public.fv_assert_order_cutoff(order_data jsonb, at_time timestamptz default clock_timestamp())
returns void language plpgsql set search_path=public,pg_temp as $$
declare deadline timestamptz:=public.fv_order_deadline(order_data); meal text:=order_data->>'slot';
begin
 if deadline is not null and at_time>=deadline then
  if meal='Tiffin' then meal:='Breakfast';end if;
  raise exception 'Cutoff passed for % (% IST). No new orders or modifications are allowed.',meal,to_char(deadline at time zone 'Asia/Kolkata','DD/MM/YYYY "at" FMHH12:MI AM');
 end if;
end $$;
do $patch$
declare src text:=pg_get_functiondef('public.fv_rpc(text,jsonb)'::regprocedure); updated text; anchor text:='if action in(''save'',''finalise'',''modify'') then';
begin
 if position('perform public.fv_assert_order_cutoff(p->''data'');' in src)=0 then
  if position(anchor in src)=0 or position('cut:=(cfg->''cutoffs''->>(o.data->>''slot''))::numeric;' in src)=0 or position('if d->>''date''<>o.data->>''date''' in src)=0 then
   raise exception 'Cutoff migration stopped: unexpected current fv_rpc definition';
  end if;
  updated:=replace(src,anchor,anchor||E'\n   perform public.fv_assert_order_cutoff(p->''data'');\n   if oid is not null then perform public.fv_assert_order_cutoff(o.data);end if;');
  updated:=replace(updated,'cut:=(cfg->''cutoffs''->>(o.data->>''slot''))::numeric;',E'if (o.data->>''slot'') not in (''Tiffin'',''Breakfast'',''Lunch'',''Dinner'') then\n    cut:=(cfg->''cutoffs''->>(o.data->>''slot''))::numeric;');
  updated:=replace(updated,'if d->>''date''<>o.data->>''date''',E'end if;\n    if d->>''date''<>o.data->>''date''');
 else updated:=src;
 end if;
 updated:=replace(updated,'update public.fv_settings set data=d;','update public.fv_settings set data=d where id=true;');
 execute updated;
end $patch$;
-- Boundary tests: only pure helper calls; no orders or messages are created.
do $tests$
declare sample jsonb; deadline timestamptz; slot text; blocked boolean; stamp timestamptz;
begin
 foreach slot in array array['Tiffin','Lunch','Dinner'] loop
  sample:=jsonb_build_object('date','2026-09-19','slot',slot,'delivery','23:59');
  deadline:=public.fv_order_deadline(sample);
  if deadline is distinct from (case slot when 'Tiffin' then timestamptz '2026-09-18 21:00:00+05:30' when 'Lunch' then timestamptz '2026-09-19 08:00:00+05:30' else timestamptz '2026-09-19 17:00:00+05:30' end) then raise exception 'Incorrect deadline for %',slot;end if;
  perform public.fv_assert_order_cutoff(sample,deadline-interval '1 millisecond');
  foreach stamp in array array[deadline,deadline+interval '1 millisecond'] loop
   blocked:=false;
   begin perform public.fv_assert_order_cutoff(sample,stamp);
   exception when raise_exception then
    if sqlerrm like 'Cutoff passed for %' then blocked:=true;else raise;end if;
   end;
   if not blocked then raise exception 'Deadline not enforced for %',slot;end if;
  end loop;
 end loop;
 if public.fv_order_deadline('{"date":"2027-01-01","slot":"Tiffin"}'::jsonb)<>timestamptz '2026-12-31 21:00+05:30' then raise exception 'Year boundary failure';end if;
end $tests$;
commit;
select 'Fixed India-time cutoffs installed; boundary tests passed' as result;
