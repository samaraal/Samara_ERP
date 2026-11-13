  // ===== 2.20.23: HR → Biometric Attendance (Admin / Directors + Nursing Manager) =====
  // Punches come from easy TimePro (eSSL / ZKTeco machine at Samara) through the Edge Function
  // "attendance-push" (SQL 371). Staff are matched by the machine's Employee ID to the ERP employee
  // list — the names stored in easy TimePro are only shown for reference (they are out of date).
  const BIO_TEMPLATE='[{"emp_code":"{emp_code}","first_name":"{first_name}","last_name":"{last_name}","punch_datetime":"{punch_datetime}","punch_date":"{punch_date}","punch_time":"{punch_time}","punch_state":"{punch_state}","verify_type":"{verify_type}","terminal_sn":"{terminal_sn}","terminal_alias":"{terminal_alias}","area_name":"{area_name}","upload_time":"{upload_time}"}]';
  async function bioRpc(action,p={}){
    const {data,error}=await client.rpc('attendance_rpc',{p_action:action,p});
    if(error)throw new Error(/function .*attendance_rpc/i.test(error.message||'')?'Biometric Attendance needs SQL 371 to be run in Supabase first.':(error.message||'Could not load attendance.'));
    return data;
  }
  const bioISO=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  function bioPeriod(kind,month,from,to){
    const t=new Date(`${todayISOIndia()}T00:00:00`);
    if(kind==='Today')return [bioISO(t),bioISO(t)];
    if(kind==='Yesterday'){const y=new Date(t);y.setDate(y.getDate()-1);return [bioISO(y),bioISO(y)];}
    if(kind==='This Week'){const s=new Date(t);s.setDate(s.getDate()-((s.getDay()+6)%7));return [bioISO(s),bioISO(t)];}
    if(kind==='Month'){const [y,m]=String(month||bioISO(t).slice(0,7)).split('-').map(Number);return [bioISO(new Date(y,m-1,1)),bioISO(new Date(y,m,0))];}
    return [from||bioISO(t),to||from||bioISO(t)];
  }
  // 2.20.29: punches are grouped by SHIFT, not calendar day. A Night shift (7 PM - 7 AM) is shown under the
  // date it starts, with its morning out-punch; the Duty Roster decides the shift, punch times are the fallback.
  const bioAddDays=(iso,n)=>{const d=new Date(`${iso}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
  const bioHourOf=v=>{try{const pt=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(v));
    return Number(pt.find(x=>x.type==='hour')?.value||0)+Number(pt.find(x=>x.type==='minute')?.value||0)/60}catch(_){return 12}};
  function bioShiftGroups(punches,roster){
    const R=new Map();(roster||[]).forEach(r=>{R.set(`${r.employee_id}|${r.duty_date}`,r.shift)});
    const rs=(emp,d)=>emp?R.get(`${emp}|${d}`)||'':'';
    const groups=new Map(),byEmp=new Map();
    const take=(p,date,shift,fromRoster)=>{const who=p.employee_id||`code:${p.emp_code}`;const k=`${who}|${date}|${shift}`;
      if(!groups.has(k))groups.set(k,{key:k,who,employee_id:p.employee_id,emp_code:p.emp_code,device_name:p.device_name,date,shift,fromRoster,list:[]});
      const g=groups.get(k);g.list.push(p);byEmp.set(who,g);};
    [...punches].sort((a,b)=>String(a.punch_at).localeCompare(String(b.punch_at))).forEach(p=>{
      const who=p.employee_id||`code:${p.emp_code}`,D=p.punch_date,h=bioHourOf(p.punch_at);
      const rp=rs(p.employee_id,bioAddDays(D,-1)),rc=rs(p.employee_id,D);
      if((rp==='Night'||rp==='Both')&&h<12)return take(p,bioAddDays(D,-1),rp,true);       // out-punch of last night's shift
      if(rc==='Night')return take(p,D,'Night',true);
      if(rc==='Day'||rc==='Both')return take(p,D,rc,true);
      // not in the Duty Roster: decide from the punch times
      const last=byEmp.get(who);
      if(h<12&&last&&last.date===bioAddDays(D,-1)&&last.shift==='Night'&&!last.fromRoster)return take(p,last.date,'Night',false);
      const dayG=groups.get(`${who}|${D}|Day`);
      if(dayG||h<17)return take(p,D,'Day',false);
      return take(p,D,'Night',false);                                                         // first punch of the day after 5 PM = night shift starts
    });
    return [...groups.values()];
  }
  // 2.20.36: shared by the Duty Roster grid and Payroll — biometric shifts (employee_id = ERP profile id) for a period.
  // Returns [] when the user may not see Biometric Attendance or SQL 371 / 376 are missing.
  async function samaraAttendanceShifts(from,to){
    try{
      const [r,ro]=await Promise.all([client.rpc('attendance_rpc',{p_action:'punches',p:{from:bioAddDays(from,-1),to:bioAddDays(to,1)}}),
        client.rpc('attendance_roster',{p_from:bioAddDays(from,-1),p_to:bioAddDays(to,1)})]);
      if(r.error)return [];
      return bioShiftGroups(r.data?.punches||[],ro.error?[]:(ro.data||[])).filter(g=>g.employee_id&&g.date>=from&&g.date<=to).map(g=>{
        const first=g.list[0],last=g.list[g.list.length-1];
        return {...g,in:first.punch_at,out:g.list.length>1?last.punch_at:null,count:g.list.length};});
    }catch(_){return []}
  }
  // Shift times (IST): Day 07:00-19:00 on the date, Night 19:00 on the date - 07:00 next day.
  function samaraShiftWindow(date,shift){
    const night=shift==='Night'||shift==='N';
    return {start:new Date(`${date}T${night?'19':'07'}:00:00+05:30`),end:night?new Date(`${bioAddDays(date,1)}T07:00:00+05:30`):new Date(`${date}T19:00:00+05:30`)};
  }
  // minutes -> "45 min" / "1 hr" / "3 hrs 33 min"
  const bioDur=m=>{m=Math.max(0,Math.round(m));const hh=Math.floor(m/60),mm=m%60;return hh?`${hh} ${hh===1?'hr':'hrs'}${mm?` ${mm} min`:''}`:`${mm} min`};
  const bioTime=v=>{try{return new Date(v).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'Asia/Kolkata'})}catch(_){return '—'}};
  // 2.20.24: Staff Sync — the ERP employee list drives who can use the machine (SQL 372, Edge Function
  // "biometric-staff-sync", PC program tools/biometric-sync/Samara-Biometric-Sync.ps1 every 5 minutes).
  async function bioSyncRpc(action,p={}){
    const {data,error}=await client.rpc('biometric_staff_sync_rpc',{p_action:action,p});
    if(error)throw new Error(/function .*biometric_staff_sync_rpc/i.test(error.message||'')?'Staff Sync needs SQL 372 to be run in Supabase first.':(error.message||'Could not load Staff Sync.'));
    return data;
  }
  const BIO_SYNC_LABEL={active:'Active — on the machine',suspended:'Suspended — blocked (fingerprint kept)',exited:'Left — blocked & marked Resigned'};
  const BIO_ACTION_LABEL={added:'Added',restored:'Restored',blocked:'Blocked',resigned:'Resigned',updated:'Updated',not_in_erp:'Not in ERP'};
  const bioCopy=async(text,label)=>{try{await navigator.clipboard.writeText(text);alert(`${label} copied.`)}catch(_){window.prompt(`Copy the ${label}:`,text)}};

  // 2.20.42: Admin — preview / send the morning late & overtime WhatsApp (Edge Function attendance-daily-dispatch)
  function BioDailyWhatsApp(){
    const yday=bioAddDays(new Date(Date.now()+5.5*3600000).toISOString().slice(0,10),-1);
    const [day,setDay]=React.useState(yday),[busy,setBusy]=React.useState(''),[out,setOut]=React.useState(null),[err,setErr]=React.useState('');
    async function call(mode){
      if(mode==='send'&&!confirm(`Send the attendance WhatsApp for ${formatDateIN(day)} to all Admin / Directors now?`))return;
      setBusy(mode);setErr('');
      try{const {data,error}=await client.functions.invoke('attendance-daily-dispatch',{body:{mode,day}});
        if(error)throw error;if(data?.success===false)throw new Error(data.error||JSON.stringify(data.meta||data));setOut({mode,data});}
      catch(e){setErr(e?.message||String(e))}finally{setBusy('')}
    }
    const d=out?.data;
    return h('section',{className:'card'},
      h('h3',null,'Daily attendance WhatsApp to Admin / Directors'),
      h('p',{className:'muted'},'Sent automatically every morning (from 9:30 AM, once the machine has sent the Night shift Out punches; latest 11 AM) for yesterday’s Day shift and Night shift: who came late (more than 15 min after 7 AM / 7 PM), overtime (Out more than 15 min after 7 PM / 7 AM) and no punch without approved leave.'),
      h('div',{style:{display:'flex',gap:8,alignItems:'end',flexWrap:'wrap'}},
        h('div',{className:'field'},h('label',null,'Date'),h('input',{type:'date',value:day,max:yday,min:'2026-11-12',onChange:e=>setDay(e.target.value)})),
        h('button',{type:'button',className:'btn btn-secondary',disabled:!!busy,onClick:()=>call('preview')},busy==='preview'?'Loading…':'Preview message'),
        h('button',{type:'button',className:'btn btn-primary',disabled:!!busy,onClick:()=>call('send')},busy==='send'?'Sending…':'Send now'),
        h('button',{type:'button',className:'btn btn-secondary',disabled:!!busy,onClick:()=>call('template_status')},'Meta approval status')),
      err?h('div',{className:'error',style:{marginTop:10}},err):null,
      out?.mode==='preview'?h('pre',{style:{whiteSpace:'pre-wrap',background:'#e7fbe9',border:'1px solid #bfe8c6',borderRadius:12,padding:14,marginTop:12,fontFamily:'inherit',fontSize:14}},d?.message):null,
      out?.mode==='send'?h('div',{className:'success',style:{marginTop:10}},`Sent ${d?.sent||0} · failed ${d?.failed||0} · already sent ${d?.skipped||0}`+(d?.message?` · ${d.message}`:'')):null,
      out?.mode==='template_status'?h('div',{style:{marginTop:10}},(d?.meta?.data||[]).length?(d.meta.data.map(t=>h('div',{key:t.name},`${t.name}: `,h('strong',null,t.status),t.rejected_reason&&t.rejected_reason!=='NONE'?` · ${t.rejected_reason}`:''))):'Template not found on Meta yet.'):null);
  }
  // 2.20.70: STAFF REGISTER — one list of every machine number and every active employee, ERP <-> easy TimePro (SQL 396)
  const BIO_FLAG={new_on_machine:['New on machine — not linked','#b42318'],number_reused:['Number reused','#b42318'],removed_from_machine:['Removed from machine','#b42318'],
    different_name:['Different name in easy TimePro','#b45309'],left_still_active:['Left — being blocked','#b45309'],blocked_on_machine:['Blocked on machine','#b45309'],
    never_punched:['No punch yet','#b45309'],not_on_machine:['Not on machine yet','#b45309'],old_number:['Old number','#6b7280'],
    left:['Left','#6b7280'],suspended:['Suspended','#6b7280'],not_erp:['Not an ERP employee','#6b7280'],ok:['OK','#16703c']};
  function BioStaffRegister({emps}){
    const [d,setD]=React.useState(null),[err,setErr]=React.useState(''),[busy,setBusy]=React.useState(''),[pick,setPick]=React.useState({}),[show,setShow]=React.useState('problems');
    async function load(){try{const r=await client.rpc('biometric_register',{p_action:'list',p:{}});if(r.error)throw r.error;setD(r.data);setErr('')}catch(e){setErr(e.message||String(e))}}
    React.useEffect(()=>{load()},[]);
    async function act(action,row,extra={}){
      setBusy(row.emp_code+action);
      try{const r=await client.rpc('biometric_register',{p_action:action,p:{emp_code:row.emp_code,...extra}});if(r.error)throw r.error;await load();}
      catch(e){alert(e.message||String(e))}finally{setBusy('')}
    }
    const rows=d?.rows||[],can=Boolean(d?.can_act),sy=d?.sync||{};
    const ageMin=sy.last_at?Math.round((Date.now()-new Date(sy.last_at).getTime())/60000):null;
    const problem=r=>!['ok','left','not_erp','suspended'].includes(r.flag);
    const list=show==='problems'?rows.filter(problem):rows;
    const empOpts=(emps||[]).filter(e=>e.is_active!==false&&e.active!==false);
    const fmtAt=v=>v?`${formatDateIN(v)} ${bioTime(v)}`:'—';
    return h('section',{className:'card'},
      h('div',{style:{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center',marginBottom:10}},
        h('span',{className:'badge',style:{background:ageMin!==null&&ageMin<=30?'#e7f6ef':'#fde2e2',color:ageMin!==null&&ageMin<=30?'#17603a':'#a3122a'}},
          sy.last_at?`Last sync from the Samara PC: ${fmtAt(sy.last_at)}${ageMin!==null?` (${ageMin<60?ageMin+' min':Math.round(ageMin/60)+' h'} ago)`:''}`:'No sync received yet'),
        sy.last_list_at?h('span',{className:'badge'},`easy TimePro list received: ${fmtAt(sy.last_list_at)}`):h('span',{className:'badge warn'},'easy TimePro list not received yet — update the PC program (Staff Sync tab)'),
        sy.ok===false?h('span',{className:'badge warn'},`Last error: ${sy.error||''}`):null,
        h('select',{value:show,onChange:e=>setShow(e.target.value),'aria-label':'Show'},h('option',{value:'problems'},`Needs attention (${rows.filter(problem).length})`),h('option',{value:'all'},`All (${rows.length})`)),
        h('button',{type:'button',className:'btn btn-secondary',onClick:load},'↻ Refresh')),
      h('p',{className:'muted'},'ERP decides who works at Samara (join / leave / suspension, name, department); easy TimePro holds the machine number and fingerprint. Every change on either side shows here. A machine number is never given to another person.'),
      err?h('div',{className:'message error'},err):null,
      !d?h('p',{className:'muted'},err?'—':'Loading…'):
      h('div',{className:'table-wrap'},h('table',{className:'table'},
        h('thead',null,h('tr',null,['Machine no.','In easy TimePro','ERP employee','Last punch','Status','Action'].map(c=>h('th',{key:c},c)))),
        h('tbody',null,list.length?list.map(r=>{const f=BIO_FLAG[r.flag]||[r.flag,'#6b7280'];const k=r.emp_code||r.profile_id;
          return h('tr',{key:k},
            h('td',{'data-label':'Machine no.'},r.emp_code?h('strong',null,r.emp_code):'—'),
            h('td',{'data-label':'In easy TimePro'},r.emp_code?(r.tp_present===false?h('span',{style:{color:'#b42318'}},`Deleted${r.tp_missing_since?' '+formatDateIN(r.tp_missing_since):''}${r.tp_name?` (was ${r.tp_name})`:''}`):h('span',null,r.tp_name||'—',r.tp_status&&r.tp_status!=='active'?h('small',{style:{display:'block',color:'#8a5a70'}},r.tp_status==='blocked'?'Blocked area':'Resigned'):null)):'—'),
            h('td',{'data-label':'ERP employee'},r.erp_name?h('span',null,h('strong',null,r.erp_name),h('small',{style:{display:'block',color:'#8a5a70'}},[r.erp_id,r.designation,r.erp_active===false?`Left${r.last_day?' '+formatDateIN(r.last_day):''}`:''].filter(Boolean).join(' · '))):
              can&&r.emp_code&&r.flag!=='not_erp'?h('select',{value:pick[k]||'',onChange:e=>setPick({...pick,[k]:e.target.value}),'aria-label':`Employee for machine no. ${r.emp_code}`},h('option',{value:''},'— choose employee —'),empOpts.map(e=>h('option',{key:e.id,value:e.id},[e.title,e.full_name].filter(Boolean).join(' ')+(e.employee_id?` (${e.employee_id})`:'')))):'—'),
            h('td',{'data-label':'Last punch'},r.emp_code?fmtAt(r.last_punch):'—'),
            h('td',{'data-label':'Status'},h('span',{className:'badge',style:{background:f[1]+'18',color:f[1],borderColor:f[1]+'55',fontWeight:800}},f[0]),r.message?h('small',{style:{display:'block',marginTop:4,maxWidth:420}},r.message):null),
            h('td',{'data-label':'Action'},!can||!r.emp_code?null:h('div',{className:'employee-actions'},
              !r.erp_name&&r.flag!=='not_erp'?h('button',{type:'button',className:'btn btn-primary',disabled:!pick[k]||!!busy,onClick:()=>act('link',r,{profile_id:pick[k]})},'Link'):null,
              !r.erp_name&&r.flag!=='not_erp'?h('button',{type:'button',className:'btn btn-secondary',disabled:!!busy,onClick:()=>{if(confirm(`Mark machine no. ${r.emp_code} (${r.tp_name||'—'}) as not an ERP employee?`))act('not_erp',r)}},'Not an ERP employee'):null,
              r.flag==='removed_from_machine'&&!r.readd_requested?h('button',{type:'button',className:'btn btn-primary',disabled:!!busy,onClick:()=>{if(confirm(`Add ${r.erp_name} back to easy TimePro as machine no. ${r.emp_code}? The fingerprint must then be enrolled again on the machine.`))act('readd',r)}},'Re-add to machine'):null,
              r.flag==='different_name'&&!r.use_erp_name?h('button',{type:'button',className:'btn btn-primary',disabled:!!busy,onClick:()=>{if(confirm(`"${r.tp_name}" in easy TimePro is the same person as ${r.erp_name}? The next sync writes the ERP name into easy TimePro.`))act('use_erp_name',r)}},'Use ERP name'):null)));})
        :h('tr',null,h('td',{colSpan:6,className:'empty'},show==='problems'?'Nothing needs attention — ERP and easy TimePro agree.':'No machine numbers yet.'))))));
  }
  function BiometricAttendance({profile}){
    const isAdmin=profile?.role==='Admin';
    const [tab,setTab]=React.useState('Punches');
    const [status,setStatus]=React.useState(null),[codes,setCodes]=React.useState([]),[emps,setEmps]=React.useState([]);
    const [err,setErr]=React.useState(''),[busy,setBusy]=React.useState(false);
    const [draft,setDraft]=React.useState({shift:'',kind:'Today',month:todayISOIndia().slice(0,7),from:todayISOIndia(),to:todayISOIndia(),employee:''});
    const [filter,setFilter]=React.useState(draft);
    const [punches,setPunches]=React.useState([]),[open,setOpen]=React.useState('');
    const [roster,setRoster]=React.useState([]),[range,setRange]=React.useState(['','']);
    const [picks,setPicks]=React.useState({});
    const [sync,setSync]=React.useState(null),[syncErr,setSyncErr]=React.useState(''),[runOpen,setRunOpen]=React.useState('');
    async function loadSync(){try{setSync(await bioSyncRpc('status'));setSyncErr('');}catch(e){setSyncErr(e.message)}}
    async function loadBase(){
      try{
        setErr('');
        const [st,cd,em]=await Promise.all([bioRpc('status'),bioRpc('codes'),client.from('profiles').select('id,title,full_name,employee_id,designation,is_active,active').order('full_name')]);
        setStatus(st);setCodes(cd.codes||[]);setEmps((em.data||[]).filter(e=>e.full_name));
      }catch(e){setErr(e.message)}
    }
    async function loadPunches(f=filter){
      try{const [a,b]=bioPeriod(f.kind,f.month,f.from,f.to);if(b<a)throw new Error('The "To" date is before the "From" date.');
        setBusy(true);
        // one day either side, so night shifts that start before / end after the period are complete
        const [r,ro]=await Promise.all([bioRpc('punches',{from:bioAddDays(a,-1),to:bioAddDays(b,1),employee_id:f.employee||''}),
          client.rpc('attendance_roster',{p_from:bioAddDays(a,-1),p_to:bioAddDays(b,1)}).then(x=>x.error?[]:(x.data||[]))]);
        setRoster(Array.isArray(ro)?ro:[]);setRange([a,b]);setPunches(r.punches||[]);setErr('');}
      catch(e){setErr(e.message)}finally{setBusy(false)}
    }
    React.useEffect(()=>{loadBase();loadPunches(filter);loadSync();},[]);
    const empById=React.useMemo(()=>Object.fromEntries(emps.map(e=>[String(e.id),e])),[emps]);
    const empName=e=>e?`${[e.title,e.full_name].filter(Boolean).join(' ')}${e.employee_id?` (${e.employee_id})`:''}`:'';
    const activeEmps=emps.filter(e=>Boolean(e.is_active??e.active)).sort((a,b)=>String(a.full_name).localeCompare(String(b.full_name)));
    const unlinked=codes.filter(c=>!c.employee_id&&!c.ignore);
    const pushUrl=status?.push?.push_key?`${cfg.supabaseUrl}/functions/v1/attendance-push?key=${status.push.push_key}`:'';
    const syncUrl=status?.push?.push_key?`${cfg.supabaseUrl}/functions/v1/biometric-staff-sync?key=${status.push.push_key}`:'';
    const syncScript='tools/biometric-sync/Samara-Biometric-Sync.ps1';
    const syncSetupCmd="Set-ExecutionPolicy -Scope Process Bypass -Force; $f=Join-Path (New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path 'Samara-Biometric-Sync.ps1'; Unblock-File $f; & $f -Setup";
    const lastSync=sync?.sync?.last_at;
    const syncFresh=lastSync&&(Date.now()-new Date(lastSync).getTime()<20*60000);
    const staffList=sync?.staff||[];

    // Shift summary: one row per person per shift (In = first punch, Out = last punch), click shows every punch.
    const rows=React.useMemo(()=>{
      const [ra,rb]=range;
      const want=filter.shift||'';
      const ignored=new Set(codes.filter(c=>c.ignore&&!c.employee_id).map(c=>String(c.emp_code)));  // Link Staff → Ignore: shown in grey with the name in the machine
      return bioShiftGroups(punches,roster).filter(g=>(!ra||g.date>=ra)&&(!rb||g.date<=rb)&&(!want||g.shift===want||g.shift==='Both')).map(r=>{const first=r.list[0],last=r.list[r.list.length-1];
        const mins=r.list.length>1?Math.round((new Date(last.punch_at)-new Date(first.punch_at))/60000):0;
        return {...r,first,last,hours:mins?`${Math.floor(mins/60)}h ${String(mins%60).padStart(2,'0')}m`:'—',ignored:!r.employee_id&&ignored.has(String(r.emp_code)),
          name:r.employee_id?empName(empById[String(r.employee_id)])
            :ignored.has(String(r.emp_code))?`${r.device_name||'No name'} · machine no. ${r.emp_code} (not an ERP employee)`
            :`${r.device_name?`${r.device_name} · `:''}Machine code ${r.emp_code} — not linked`};})
        .sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(a.shift).localeCompare(String(b.shift))||String(a.name).localeCompare(String(b.name)));
    },[punches,roster,range,empById,filter.shift,codes]);
    const bioWhen=(p,date)=>p.punch_date===date?bioTime(p.punch_at):`${formatDateIN(p.punch_date).slice(0,5)} ${bioTime(p.punch_at)}`;
    // Out: next-morning Out shown as time + "next day"; no Out yet = On duty (shift still running) / No out punch (shift over)
    const bioShiftEnd=r=>new Date(r.shift==='Night'||r.shift==='Both'?`${bioAddDays(r.date,1)}T07:00:00+05:30`:`${r.date}T19:00:00+05:30`);
    const outCell=r=>{
      if(r.list.length>1){const p=r.last;
        return p.punch_date===r.date?bioTime(p.punch_at)
          :h('span',null,bioTime(p.punch_at),h('div',{style:{fontSize:'0.78em',color:'#8a5a70'}},`next day · ${formatDateIN(p.punch_date).slice(0,5)}`));}
      return Date.now()<bioShiftEnd(r).getTime()+60*60000
        ?h('span',{className:'badge',style:{background:'#e3f5ea',color:'#16703c'}},'On duty')
        :h('span',{className:'badge',style:{background:'#fde2e2',color:'#a3122a'}},'No out punch');
    };
    // Late / Early against 7 AM / 7 PM (15 min grace); "Both" = Day start + Night end
    const lateEarly=r=>{
      if(r.ignored||!['Day','Night','Both'].includes(r.shift))return '—';
      const st=new Date(r.shift==='Night'?`${r.date}T19:00:00+05:30`:`${r.date}T07:00:00+05:30`),en=bioShiftEnd(r);
      const late=Math.round((new Date(r.first.punch_at)-st)/60000),early=r.list.length>1&&Date.now()>=en.getTime()?Math.round((en-new Date(r.last.punch_at))/60000):0;
      const out=[];
      if(late>15)out.push(h('div',{key:'l',style:{color:'#a3122a',fontWeight:700}},`Came ${bioDur(late)} late`));
      if(early>15)out.push(h('div',{key:'e',style:{color:'#9a5b00',fontWeight:700}},`Left ${bioDur(early)} early`));
      if(!out.length&&Date.now()<en.getTime())return h('span',{style:{color:'#16703c',fontWeight:700}},'Came on time · on duty');
      return out.length?h('span',null,out):h('span',{style:{color:'#16703c',fontWeight:700}},'On time');
    };
    const shiftLabel=r=>r.shift==='Both'?'Day + Night':r.shift==='Night'?'Night (7 PM–7 AM)':r.shift==='Day'?'Day (7 AM–7 PM)':(r.shift||'—');

    async function saveLink(c,ignore=false){
      const employee_id=ignore?'':(picks[c.emp_code]??c.employee_id??'');
      if(!ignore&&!employee_id){alert('Choose the ERP employee for this machine code.');return;}
      try{setBusy(true);await bioRpc('map',{emp_code:c.emp_code,employee_id,ignore});await loadBase();await loadPunches();}
      catch(e){alert(e.message)}finally{setBusy(false)}
    }
    const lastPush=status?.push?.last_push_at;
    const receiverOk=lastPush&&(Date.now()-new Date(lastPush).getTime()<15*60000);

    return h('div',{className:'page bio-att'},
      h('style',null,`.bio-att .bio-status{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:12px 14px;border-radius:14px;border:1px solid #f0bfd6;background:linear-gradient(135deg,#ffe4f0,#fff6fa)}
        .bio-att .bio-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}
        .bio-att .bio-setup{margin-top:12px;padding:14px;border-radius:14px;border:1px dashed #e3b6cb;background:#fff}
        .bio-att .bio-setup code{display:block;white-space:pre-wrap;word-break:break-all;background:#fff4f9;border:1px solid #f0bfd6;border-radius:10px;padding:8px 10px;margin:4px 0 8px;font-size:12.5px}
        .bio-att .bio-filters{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-bottom:10px}
        .bio-att .bio-filters label{display:flex;flex-direction:column;gap:3px;font-size:12.5px;font-weight:700;color:#5b1235}
        .bio-att table td,.bio-att table th{white-space:normal;word-break:break-word}
        .bio-att tr.bio-row{cursor:pointer}.bio-att tr.bio-row:hover{background:#fff1f7}
        .bio-att .bio-detail{background:#fff8fb;padding:8px 12px;border-radius:10px}`),
      h('div',{className:'page-header'},h('div',null,h('h2',null,'Biometric Attendance'),h('p',{className:'muted'},'Punches from the ZKTeco machine (easy TimePro), matched to the ERP employee list.'))),
      err?h('div',{className:'message error'},err):null,
      h('div',{className:'bio-status'},
        h('span',{className:`badge ${receiverOk?'':'warn'}`},lastPush?`Last data from easy TimePro: ${formatDateIN(lastPush)} ${bioTime(lastPush)}`:'No data received from easy TimePro yet'),
        h('span',{className:'badge'},`Punches stored: ${status?.total_punches??'—'}`),
        status?.last_punch_at?h('span',{className:'badge'},`Latest punch: ${formatDateIN(status.last_punch_at)} ${bioTime(status.last_punch_at)}`):null,
        unlinked.length?h('span',{className:'badge warn'},`${unlinked.length} machine code(s) not linked to an employee`):null,
        sync?h('span',{className:`badge ${syncFresh&&sync?.sync?.ok!==false?'':'warn'}`},lastSync?`Staff sync: ${formatDateIN(lastSync)} ${bioTime(lastSync)}${sync?.sync?.ok===false?' — error':''}`:'Staff sync not set up yet'):null,
        status?.push?.last_push_error?h('span',{className:'badge off',style:{background:'#fde2e2',color:'#a3122a'}},`Last error: ${status.push.last_push_error}`):null),
      h('div',{className:'bio-tabs'},['Punches','Staff Register','Link Staff','Staff Sync',...(isAdmin?['Daily WhatsApp','Setup (easy TimePro)']:[])].map(t=>h('button',{key:t,type:'button',className:`btn ${tab===t?'btn-primary':'btn-secondary'}`,onClick:()=>setTab(t)},t==='Link Staff'&&unlinked.length?`${t} (${unlinked.length})`:t))),

      tab==='Punches'&&h('section',{className:'card'},
        h('div',{className:'bio-filters'},
          h('label',null,'Shift',h('select',{value:draft.shift||'',onChange:e=>setDraft({...draft,shift:e.target.value})},
            h('option',{value:''},'All shifts'),h('option',{value:'Day'},'Day (7 AM–7 PM)'),h('option',{value:'Night'},'Night (7 PM–7 AM)'))),
          h('label',null,'Period',h('select',{value:draft.kind,onChange:e=>setDraft({...draft,kind:e.target.value})},['Today','Yesterday','This Week','Month','Period'].map(k=>h('option',{key:k},k)))),
          draft.kind==='Month'?h('label',null,'Month',h('input',{type:'month',value:draft.month,min:'2026-08',onChange:e=>setDraft({...draft,month:e.target.value})})):null,
          draft.kind==='Period'?h('label',null,'From',h(StrictDateInput,{value:draft.from,onChange:e=>setDraft({...draft,from:e.target.value})})):null,
          draft.kind==='Period'?h('label',null,'To',h(StrictDateInput,{value:draft.to,onChange:e=>setDraft({...draft,to:e.target.value})})):null,
          h('label',null,'Employee',h('select',{value:draft.employee,onChange:e=>setDraft({...draft,employee:e.target.value})},h('option',{value:''},'All employees'),activeEmps.map(e=>h('option',{key:e.id,value:e.id},empName(e))))),
          h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>{setFilter(draft);loadPunches(draft);}},busy?'Loading…':'Apply')),
        h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['S.No','Shift date','Shift','Employee','In','Out','Timing','Time between','Punches'].map(c=>h('th',{key:c},c)))),
          h('tbody',null,rows.length?rows.flatMap((r,i)=>{
            const gk=`${r.date}|${r.shift}`,prev=rows[i-1],head=!filter.shift&&(!prev||`${prev.date}|${prev.shift}`!==gk);
            const n=head?rows.filter(x=>x.date===r.date&&x.shift===r.shift&&!x.ignored).length:0;
            const newDate=!prev||prev.date!==r.date;
            const sameDay=newDate?rows.filter(x=>x.date===r.date&&!x.ignored):[];
            const dayN=sameDay.filter(x=>x.shift==='Day'||x.shift==='Both').length,nightN=sameDay.filter(x=>x.shift==='Night').length;
            return [
            newDate?h('tr',{key:'d-'+r.date},h('td',{colSpan:9,style:{background:'#8e1b4f',color:'#fff',fontWeight:800}},
              `${formatDateIN(r.date)} · ${sameDay.length} present`+(filter.shift?'':` (Day ${dayN} · Night ${nightN})`))):null,
            head?h('tr',{key:'h-'+gk},h('td',{colSpan:9,style:{background:r.shift==='Night'?'#ede7f6':'#fdf0f5',fontWeight:700,color:'#5b1a3c'}},
              `${formatDateIN(r.date)} · ${r.shift==='Night'?'Night shift (7 PM – 7 AM, ends next morning)':r.shift==='Day'?'Day shift (7 AM – 7 PM)':shiftLabel(r)} · ${n} staff`)):null,
            h('tr',{key:r.key,className:'bio-row',onClick:()=>setOpen(open===r.key?'':r.key)},
              h('td',{'data-label':'S.No'},r.ignored?'—':String(rows.filter(x=>x.date===r.date&&!x.ignored).indexOf(r)+1)),
              h('td',{'data-label':'Shift date'},formatDateIN(r.date)),
              h('td',{'data-label':'Shift'},h('span',{className:`badge ${r.shift==='Night'?'warn':''}`,title:r.fromRoster?'From the Duty Roster':'Not in the Duty Roster — worked out from the punch times'},shiftLabel(r)+(r.fromRoster?'':' *'))),
              h('td',{'data-label':'Employee'},r.employee_id?r.name:r.ignored?h('span',{style:{color:'#7a6a72'}},r.name):h('span',{style:{color:'#a3122a',fontWeight:700}},r.name)),
              h('td',{'data-label':'In'},bioWhen(r.first,r.date)),
              h('td',{'data-label':'Out'},outCell(r)),
              h('td',{'data-label':'Timing'},lateEarly(r)),
              h('td',{'data-label':'Time between'},r.hours),
              h('td',{'data-label':'Punches'},String(r.list.length))),
            open===r.key?h('tr',{key:r.key+'-d'},h('td',{colSpan:9},h('div',{className:'bio-detail'},
              h('strong',null,`All punches — machine code ${r.emp_code}${r.device_name?` (name in machine: ${r.device_name})`:''}`),
              h('ul',{style:{margin:'6px 0 0 18px'}},r.list.map(p=>h('li',{key:p.id},`${bioWhen(p,r.date)} · ${p.punch_state||'Punch'}${p.verify_type?` · ${p.verify_type}`:''}${p.terminal_alias?` · ${p.terminal_alias}`:''}`)))))):null
          ];}):h('tr',null,h('td',{colSpan:9,className:'empty'},busy?'Loading…':'No punches for this period.'))))),
        h('div',{className:'small-note',style:{marginTop:8}},'Each row is one shift. A Night shift (7 PM – 7 AM) is shown under the date it starts, with its next-morning Out punch. The shift comes from the Duty Roster; * = not in the roster, worked out from the punch times.')),

      tab==='Staff Register'&&h(BioStaffRegister,{emps}),
      tab==='Link Staff'&&h('section',{className:'card'},
        h('p',{className:'muted'},'Each staff member has a number on the machine (Employee ID in easy TimePro). Link each number once to the right ERP employee. The name stored in the machine is shown only to help you.'),
        h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Machine code','Name in machine','Last punch','ERP employee','Action'].map(c=>h('th',{key:c},c)))),
          h('tbody',null,codes.length?codes.map(c=>h('tr',{key:c.emp_code,className:c.ignore?'employee-disabled':''},
            h('td',{'data-label':'Machine code'},h('strong',null,c.emp_code)),
            h('td',{'data-label':'Name in machine'},c.device_name||'—'),
            h('td',{'data-label':'Last punch'},c.last_punch_at?`${formatDateIN(c.last_punch_at)} ${bioTime(c.last_punch_at)}`:'—'),
            h('td',{'data-label':'ERP employee'},h('select',{value:picks[c.emp_code]??c.employee_id??'',onChange:e=>setPicks({...picks,[c.emp_code]:e.target.value})},
              h('option',{value:''},c.ignore?'— ignored —':'— choose employee —'),activeEmps.map(e=>h('option',{key:e.id,value:e.id},empName(e)))),
              c.employee_id&&c.mapped_by_name?h('div',{className:'small-note'},`Linked by ${c.mapped_by_name} on ${formatDateIN(c.mapped_at)}`):null),
            h('td',{'data-label':'Action'},h('div',{className:'employee-actions'},
              h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>saveLink(c)},'Save'),
              c.ignore?null:h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>{if(window.confirm(`Ignore machine code ${c.emp_code} (test / visitor / ex-staff)?`))saveLink(c,true)}},'Ignore')))))
          :h('tr',null,h('td',{colSpan:5,className:'empty'},'No machine codes yet — they appear here automatically when the first punches arrive from easy TimePro.')))))),

      tab==='Staff Sync'&&h('section',{className:'card'},
        h('h3',null,'Staff Sync — ERP employee list → easy TimePro → machine'),
        h('p',{className:'muted'},'Every 5 minutes the Samara PC program reads this list and updates easy TimePro: new employees are added; a Suspension blocks the person on the machine (fingerprint / face kept, restored on Reinstatement); Resignation / Termination / Left without notice / Disable blocks the person and marks them Resigned in easy TimePro (from the day the ERP login closes). Machine number = the number linked in Link Staff (the machine’s own numbers are kept); active staff with no machine number are added with the next free number and linked automatically — then enrol their fingerprint / face on the machine. Department = the ERP department (created in easy TimePro when missing). Machine numbers not linked to an ERP employee are only reported, never changed.'),
        syncErr?h('div',{className:'message error'},syncErr):null,
        h('div',{className:'bio-status',style:{marginBottom:12}},
          h('span',{className:`badge ${syncFresh?'':'warn'}`},lastSync?`Last sync: ${formatDateIN(lastSync)} ${bioTime(lastSync)}`:'No sync received yet — install the PC program (Admin, steps below)'),
          sync?.sync?.ok===false?h('span',{className:'badge off',style:{background:'#fde2e2',color:'#a3122a'}},`Last error: ${sync.sync.error||'see runs below'}`):null,
          lastSync&&!syncFresh?h('span',{className:'badge warn'},'No sync in the last 20 minutes — is the Samara PC on and easy TimePro open?'):null,
          h('button',{type:'button',className:'btn btn-secondary',onClick:loadSync},'↻ Refresh')),
        h('h4',null,`Staff as sent to the machine (${staffList.length})`),
        h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Machine no.','ERP ID','Name','Department','Status on machine','Reason'].map(c=>h('th',{key:c},c)))),
          h('tbody',null,staffList.length?staffList.map(x=>h('tr',{key:x.profile_id||x.emp_code,className:x.status==='active'?'':'bio-blocked-row',style:x.status==='active'?null:{background:'#fdecec'}},
            h('td',{'data-label':'Machine no.'},x.emp_code?h('strong',null,x.emp_code):h('span',{className:'badge warn'},'Not on machine yet — will be added')),
            h('td',{'data-label':'ERP ID'},x.employee_id||'—'),
            h('td',{'data-label':'Name'},[x.title,x.name].filter(Boolean).join(' ')),
            h('td',{'data-label':'Department'},x.department||'Mogappair (no ERP department)'),
            h('td',{'data-label':'Status on machine'},h('span',{className:'badge',style:x.status==='active'?null:{background:'#c8102e',color:'#fff',borderColor:'#c8102e'}},BIO_SYNC_LABEL[x.status]||x.status)),
            h('td',{'data-label':'Reason'},x.reason?h('span',{style:x.status==='active'?null:{color:'#b00020',fontWeight:700}},x.reason):'—')))
          :h('tr',null,h('td',{colSpan:6,className:'empty'},syncErr?'—':'Loading…'))))),
        h('h4',{style:{marginTop:16}},'Recent sync runs with changes'),
        (sync?.runs||[]).length?h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['When','Result','Changes'].map(c=>h('th',{key:c},c)))),
          h('tbody',null,(sync.runs||[]).flatMap((r,i)=>{const k=String(i);const acts=(r.actions||[]).filter(a=>a.type!=='not_in_erp');const s=r.summary||{};
            return [h('tr',{key:k,className:'bio-row',onClick:()=>setRunOpen(runOpen===k?'':k)},
              h('td',{'data-label':'When'},`${formatDateIN(r.at)} ${bioTime(r.at)}`),
              h('td',{'data-label':'Result'},h('span',{className:`badge ${r.ok?'':'warn'}`},r.dry_run?'Test run (nothing changed)':r.ok?'OK':'Error')),
              h('td',{'data-label':'Changes'},['added','restored','blocked','resigned','updated'].filter(t=>s[t]).map(t=>`${BIO_ACTION_LABEL[t]} ${s[t]}`).join(' · ')||(r.errors||[]).length&&`${r.errors.length} error(s)`||'—')),
              runOpen===k?h('tr',{key:k+'-d'},h('td',{colSpan:3},h('div',{className:'bio-detail'},
                h('ul',{style:{margin:'0 0 0 18px'}},
                  acts.map((a,j)=>h('li',{key:'a'+j},`${BIO_ACTION_LABEL[a.type]||a.type}: ${a.name||''} (machine ${a.emp_code}) — ${a.note||''}`)),
                  (r.actions||[]).filter(a=>a.type==='not_in_erp').map((a,j)=>h('li',{key:'n'+j,style:{color:'#8a5a00'}},`Machine no. ${a.emp_code} ${a.name||''} — not linked to an ERP employee, left unchanged`)),
                  (r.errors||[]).map((e,j)=>h('li',{key:'e'+j,style:{color:'#a3122a'}},`Error${e.name?` (${e.name})`:''}: ${e.message}`)))))):null];})))):h('div',{className:'muted'},'None yet.'),
        isAdmin&&h('div',{className:'bio-setup',style:{marginTop:16}},
          h('strong',null,'Install the sync program (one time, on the Samara PC where easy TimePro runs)'),
          h('ol',null,
            h('li',null,'On that PC open the ERP, come here and press ',h('a',{href:syncScript,download:'Samara-Biometric-Sync.ps1'},'Download sync program'),' (saved to Downloads).'),
            h('li',null,'Press Copy Staff Sync URL (keep it private — it has the same key as the punch API URL):',syncUrl?h('code',null,syncUrl):h('div',{className:'muted'},'Run SQL 371 first.'),syncUrl?h('button',{type:'button',className:'btn btn-secondary',onClick:()=>bioCopy(syncUrl,'Staff Sync URL')},'Copy Staff Sync URL'):null),
            h('li',null,'Press the Windows key, type PowerShell, open it, paste this command and press Enter:',h('code',null,syncSetupCmd),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>bioCopy(syncSetupCmd,'setup command')},'Copy setup command')),
            h('li',null,'Paste the Staff Sync URL when asked, then enter the easy TimePro login (e.g. admin and its password — saved encrypted on that PC only).'),
            h('li',null,'It shows a test run (nothing changed). Check it, type Y — it applies the changes and from then on runs every 5 minutes and when Windows starts. Results appear above.'),
            h('li',null,'In easy TimePro: put the biometric machine in the area "Samara Mogappair" (Device → Device → Area). Never put a machine in "Blocked - No Access".')),
          h('div',{className:'small-note'},'The PC is switched off at night: changes made after that reach the machine the next morning. For an urgent block at night, delete the person directly on the machine.'))),

      tab==='Daily WhatsApp'&&isAdmin&&h(BioDailyWhatsApp),
      tab==='Setup (easy TimePro)'&&isAdmin&&h('section',{className:'card'},
        h('h3',null,'Connect easy TimePro (one time, on the PC where easy TimePro runs)'),
        h('ol',null,
          h('li',null,'Open easy TimePro → System → Configuration → Api Settings.'),
          h('li',null,'User Name / Password: leave as they are (easy TimePro\'s own login).'),
          h('li',null,'API URL — paste this (keep it private):',pushUrl?h('code',null,pushUrl):h('div',{className:'muted'},'Run SQL 371 first.'),pushUrl?h('button',{type:'button',className:'btn btn-secondary',onClick:()=>bioCopy(pushUrl,'API URL')},'Copy API URL'):null),
          h('li',null,'Data Template — paste this exactly:',h('code',null,BIO_TEMPLATE),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>bioCopy(BIO_TEMPLATE,'Data Template')},'Copy Data Template')),
          h('li',null,'Interval Time: 1 (minute). To send older punches too, set Last Api Time to 01-11-2026 00:00 (or the date you want to start from).'),
          h('li',null,'Tick Enable and press Submit. Within 1–2 minutes "Last data from easy TimePro" above should show the time.')),
        h('div',{className:'bio-setup'},
          h('strong',null,'Recent data received (latest 5)'),
          (status?.recent_log||[]).length?h('ul',{style:{margin:'6px 0 0 18px'}},(status.recent_log||[]).map((l,i)=>h('li',{key:i},`${formatDateIN(l.received_at)} ${bioTime(l.received_at)} — ${l.ok?'OK':'ERROR'} · ${l.rows_in} punch(es) read, ${l.rows_saved} new${l.error?` · ${l.error}`:''}`,l.body?h('code',null,l.body):null))):h('div',{className:'muted'},'Nothing received yet.'),
          h('div',{className:'employee-actions',style:{marginTop:8}},
            h('button',{type:'button',className:'btn btn-secondary',onClick:loadBase},'↻ Check again'),
            h('button',{type:'button',className:'btn btn-secondary',onClick:async()=>{if(!window.confirm('Make a new private key? The old API URL stops working — paste the new URL into easy TimePro.'))return;try{await bioRpc('rotate_key');await loadBase();}catch(e){alert(e.message)}}},'New key'))))
    );
  }
