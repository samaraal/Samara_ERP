  // 2.19.51: Assign Guests to nurses, shift-wise (SQL 336).
  // The Nursing Manager / Admin sets a standing Day nurse and Night nurse for each Guest. A nurse then sees
  // "My Guests" first in every Guest dropdown and in Medicines (MAR). Recording for a Guest assigned to
  // ANOTHER nurse who is on duty that shift asks for a short reason once per Guest per shift (kept in
  // guest_cover_records and listed in MIS). If the assigned nurse is not on duty (off / absent / leave /
  // not rostered) or the Guest has no nurse, any nurse may attend without a reason.
  // Clinical alerts, notifications and the nurse-station screensaver are NOT affected: they still show all Guests.
  const GUEST_SCOPE={profile:null,assign:[],onDuty:new Set(),shift:'',dutyDate:'',loadedAt:0,loading:null,ready:false,listeners:new Set(),pending:{}};
  function nursingShiftNow(){
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
    const hour=Number(parts.find(p=>p.type==='hour')?.value||0);
    const today=todayISOIndia();
    if(hour>=7&&hour<19)return {shift:'Day',dutyDate:today};
    if(hour>=19)return {shift:'Night',dutyDate:today};
    const d=new Date(`${today}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-1); // before 7 AM = last night's shift
    return {shift:'Night',dutyDate:d.toISOString().slice(0,10)};
  }
  // Only staff nurses are scoped. Nursing Manager, Managers, Admin and others see everything as before.
  function guestScopedNurse(p){return !!p&&String(p.role||'').trim()==='Nurse'&&!isNursingManagerProfile(p)}
  function guestScopeNotify(){GUEST_SCOPE.listeners.forEach(fn=>{try{fn()}catch(_){}})}
  function useGuestScopeTick(){
    const [,setTick]=React.useState(0);
    React.useEffect(()=>{const fn=()=>setTick(t=>t+1);GUEST_SCOPE.listeners.add(fn);return()=>GUEST_SCOPE.listeners.delete(fn)},[]);
    return GUEST_SCOPE;
  }
  // Roster shift text → 'Day' / 'Night' / '' (off, absent, cancelled)
  function rosterShiftKind(r){
    if(!r||['Cancelled','Rejected','Absent','Weekly Off','Leave granted'].includes(r.status)||r.is_weekly_off||r.shift==='Weekly Off'||r.shift==='Absent')return '';
    return /^night/i.test(String(r.shift||''))?'Night':'Day';
  }
  async function loadGuestScope(force=false){
    const p=GUEST_SCOPE.profile;
    const now=nursingShiftNow();
    if(!p||!guestScopedNurse(p)){GUEST_SCOPE.ready=true;return}
    if(!force&&GUEST_SCOPE.loading)return GUEST_SCOPE.loading;
    if(!force&&GUEST_SCOPE.ready&&GUEST_SCOPE.shift===now.shift&&GUEST_SCOPE.dutyDate===now.dutyDate&&Date.now()-GUEST_SCOPE.loadedAt<5*60000)return;
    GUEST_SCOPE.loading=(async()=>{
      try{
        const {data:assign,error}=await client.from('guest_nurse_assignments').select('patient_id,shift,nurse_id,nurse_name').is('ended_at',null);
        if(error)throw error;
        const nurseIds=[...new Set((assign||[]).map(a=>a.nurse_id))];
        const onDuty=new Set();
        if(nurseIds.length){
          let alias={};
          try{const {data:pr}=await client.from('profiles').select('id,auth_user_id').in('id',nurseIds);(pr||[]).forEach(x=>{if(x.auth_user_id)alias[String(x.auth_user_id)]=String(x.id)})}catch(_){}
          const empIds=[...nurseIds,...Object.keys(alias)];
          const [{data:duty},{data:leave}]=await Promise.all([
            client.from('duty_assignments').select('employee_id,shift,status,is_weekly_off').eq('duty_date',now.dutyDate).in('employee_id',empIds),
            client.from('absence_requests').select('employee_id,request_type,status,from_date,to_date').eq('status','approved').eq('request_type','Leave').lte('from_date',now.dutyDate).gte('to_date',now.dutyDate).in('employee_id',empIds)
          ]);
          const onLeave=new Set((leave||[]).map(l=>alias[String(l.employee_id)]||String(l.employee_id)));
          (duty||[]).forEach(r=>{const id=alias[String(r.employee_id)]||String(r.employee_id);if(rosterShiftKind(r)===now.shift&&!onLeave.has(id))onDuty.add(`${id}|${now.shift}`)});
        }
        Object.assign(GUEST_SCOPE,{assign:assign||[],onDuty,shift:now.shift,dutyDate:now.dutyDate,loadedAt:Date.now(),ready:true});
      }catch(error){
        // Table not created yet (SQL 336 not run) or offline: no scoping, nobody is blocked.
        console.warn('Guest assignment not available:',error?.message||error);
        Object.assign(GUEST_SCOPE,{assign:[],onDuty:new Set(),shift:now.shift,dutyDate:now.dutyDate,loadedAt:Date.now(),ready:true});
      }finally{GUEST_SCOPE.loading=null;guestScopeNotify()}
    })();
    return GUEST_SCOPE.loading;
  }
  function setGuestScopeProfile(p){
    const changed=(GUEST_SCOPE.profile?.id||'')!==(p?.id||'');
    GUEST_SCOPE.profile=p||null;
    if(changed){GUEST_SCOPE.ready=false;GUEST_SCOPE.assign=[];loadGuestScope(true)}
  }
  window.addEventListener('samara-guest-assign-changed',()=>loadGuestScope(true));
  setInterval(()=>{if(GUEST_SCOPE.profile)loadGuestScope(false)},60000);
  // 'all' (not a scoped nurse) · 'mine' · 'open' (no nurse / assigned nurse not on duty) · 'other'
  function guestAccess(patientId){
    const p=GUEST_SCOPE.profile;
    if(!guestScopedNurse(p)||!patientId)return {kind:'all'};
    const now=nursingShiftNow();
    if(GUEST_SCOPE.shift!==now.shift||GUEST_SCOPE.dutyDate!==now.dutyDate)loadGuestScope(true);
    const a=GUEST_SCOPE.assign.find(x=>String(x.patient_id)===String(patientId)&&x.shift===now.shift);
    if(!a)return {kind:'open'};
    if([p.id,p.auth_user_id].filter(Boolean).map(String).includes(String(a.nurse_id)))return {kind:'mine',a};
    if(!GUEST_SCOPE.onDuty.has(`${a.nurse_id}|${now.shift}`))return {kind:'open',a};
    return {kind:'other',a};
  }
  function guestNeedsCover(patientId){return guestAccess(patientId).kind==='other'}
  // Ask the reason once per Guest per shift. Resolves true (go ahead) or false (nurse cancelled).
  function ensureGuestCover(patientId,where=''){
    const acc=guestAccess(patientId);
    if(acc.kind!=='other')return Promise.resolve(true);
    const now=nursingShiftNow();
    const key=`samara_guest_cover|${GUEST_SCOPE.profile?.id}|${now.dutyDate}|${now.shift}|${patientId}`;
    try{if(sessionStorage.getItem(key))return Promise.resolve(true)}catch(_){}
    if(GUEST_SCOPE.pending[key])return GUEST_SCOPE.pending[key];
    const run=(async()=>{
      const ans=await samaraAsk({title:'Guest assigned to another nurse',
        message:`This Guest is assigned to ${acc.a?.nurse_name||'another nurse'} for the ${now.shift} shift, and she is on duty. Why are you attending this Guest? (asked once this shift)`,
        fields:[{key:'reason',label:'Reason',type:'textarea',value:'',placeholder:'e.g. She is on break / asked me to cover / emergency',required:true}],okLabel:'Continue'});
      if(ans===null)return false;
      const reason=String(ans.reason||'').trim();
      if(reason.length<3){showSamaraActionToast('error','Reason needed','Write a few words — why you are attending this Guest.');return false}
      const {error}=await client.rpc('record_guest_cover',{p_patient:patientId,p_shift:now.shift,p_reason:reason,p_page:where||null});
      if(error){console.warn('Guest cover record:',error.message);if(!/function|does not exist|schema cache/i.test(error.message||'')){showSamaraActionToast('error','Not recorded',error.message);return false}}
      try{sessionStorage.setItem(key,'1')}catch(_){}
      return true;
    })();
    GUEST_SCOPE.pending[key]=run;run.finally(()=>{delete GUEST_SCOPE.pending[key]});
    return run;
  }
  // Group Guests for a scoped nurse: [{label, rows}] or null when not scoped.
  function guestScopeGroups(rows){
    if(!guestScopedNurse(GUEST_SCOPE.profile)||!GUEST_SCOPE.ready)return null;
    const mine=[],open=[],other=[];
    (rows||[]).forEach(p=>{const k=guestAccess(p.id).kind;(k==='mine'?mine:k==='other'?other:open).push(p)});
    const sh=nursingShiftNow().shift;
    return [
      {label:`My Guests · ${sh} shift (${mine.length})`,rows:mine},
      {label:`No nurse on duty for them (${open.length})`,rows:open},
      {label:`Other nurses' Guests — reason asked (${other.length})`,rows:other}
    ].filter(g=>g.rows.length);
  }

  // Before saving a record for a Guest (Medicines, Vitals, Daily Care, Intake / Output, Food, Nursing Notes),
  // ask the cover reason if the Guest belongs to another nurse on duty. One place, every page.
  const GUEST_COVER_TABLES={medication_administrations:'Medicines',vital_signs:'Vital Signs',care_logs:'Daily Care',io_entries:'Intake / Output',meal_records:'Food',beverage_records:'Food'};
  function guestCoverGuard(builder,values,where){
    const ids=[...new Set((Array.isArray(values)?values:[values]).map(v=>v&&v.patient_id).filter(Boolean).map(String))];
    if(!ids.length||!builder||typeof builder.then!=='function')return builder;
    const origThen=builder.then.bind(builder);
    builder.then=function(onOk,onFail){
      return (async()=>{
        for(const id of ids){if(guestNeedsCover(id)&&!(await ensureGuestCover(id,where)))return {data:null,error:{message:'Not saved — no reason given for attending another nurse\'s Guest.'},count:null,status:0,statusText:'Cancelled'}}
        return origThen(r=>r);
      })().then(onOk,onFail);
    };
    return builder;
  }
  (function installGuestCoverGuard(){
    if(client.__samaraGuestGuard)return;client.__samaraGuestGuard=true;
    const origFrom=client.from.bind(client);
    client.from=function(table){
      const qb=origFrom(table);
      const where=GUEST_COVER_TABLES[table];
      if(!where||!guestScopedNurse(GUEST_SCOPE.profile))return qb;
      ['insert','upsert'].forEach(m=>{const orig=qb[m].bind(qb);qb[m]=(values,...rest)=>guestCoverGuard(orig(values,...rest),values,where)});
      return qb;
    };
    const origRpc=client.rpc.bind(client);
    client.rpc=function(fn,args,...rest){
      const b=origRpc(fn,args,...rest);
      if(fn==='save_nursing_note'&&args?.p_patient&&guestScopedNurse(GUEST_SCOPE.profile))return guestCoverGuard(b,[{patient_id:args.p_patient}],'Nursing Notes');
      return b;
    };
  })();

  // ---- Assignment screen (Staff Duty Assignment → "Guests ↔ Nurses") — Admin / Director and Nursing Manager ----
  function GuestNurseAssignment({profile}){
    const [patients]=usePatients();
    const [nurses,setNurses]=React.useState([]);
    const [assign,setAssign]=React.useState([]);
    const [duty,setDuty]=React.useState([]);
    const [leave,setLeave]=React.useState([]);
    const [covers,setCovers]=React.useState([]);
    const [draft,setDraft]=React.useState({});
    const [picked,setPicked]=React.useState({});
    const [bulk,setBulk]=React.useState({Day:'',Night:''});
    const [busy,setBusy]=React.useState(false);
    const [error,setError]=React.useState('');
    const [tab,setTab]=React.useState('assign');
    const [search,setSearch]=React.useState('');
    const today=todayISOIndia();
    async function load(){
      setError('');
      try{
        const [a,pr,d,l,c]=await Promise.all([
          client.from('guest_nurse_assignments').select('*').is('ended_at',null),
          client.from('profiles').select('id,auth_user_id,title,full_name,designation,role,department,is_active').order('full_name'),
          client.from('duty_assignments').select('employee_id,duty_date,shift,status,is_weekly_off').eq('duty_date',today),
          client.from('absence_requests').select('employee_id,request_type,status,from_date,to_date').eq('status','approved').eq('request_type','Leave').lte('from_date',today).gte('to_date',today),
          client.from('guest_cover_records').select('*').gte('duty_date',(()=>{const x=new Date(`${today}T00:00:00Z`);x.setUTCDate(x.getUTCDate()-30);return x.toISOString().slice(0,10)})()).order('created_at',{ascending:false}).limit(300)
        ]);
        if(a.error)throw new Error(/does not exist|schema cache/i.test(a.error.message||'')?'Run supabase/sql/336_guest_nurse_assignment.sql in Supabase → SQL Editor first.':a.error.message);
        setAssign(a.data||[]);
        setNurses((pr.data||[]).filter(x=>x.is_active!==false&&(String(x.role||'')==='Nurse'||isNursingManagerProfile(x))));
        setDuty(d.data||[]);setLeave(l.data||[]);setCovers(c.data||[]);
      }catch(e){setError(e.message||String(e))}
    }
    React.useEffect(()=>{load()},[]);
    const nurseById=id=>nurses.find(n=>String(n.id)===String(id));
    const dutyToday=(nurseId,shift)=>{
      const n=nurseById(nurseId);if(!n)return 'Not found';
      const ids=[n.id,n.auth_user_id].filter(Boolean).map(String);
      if(leave.some(l=>ids.includes(String(l.employee_id))))return 'On leave';
      const rows=duty.filter(r=>ids.includes(String(r.employee_id))&&r.status!=='Cancelled');
      if(!rows.length)return 'Not rostered';
      if(rows.some(r=>r.status==='Absent'||r.shift==='Absent'))return 'Absent';
      if(rows.every(r=>r.is_weekly_off||r.status==='Weekly Off'))return 'Weekly off';
      return rows.some(r=>rosterShiftKind(r)===shift)?'On duty':`On ${shift==='Day'?'Night':'Day'} shift`;
    };
    const saved=(pid,shift)=>assign.find(a=>String(a.patient_id)===String(pid)&&a.shift===shift)?.nurse_id||'';
    const value=(pid,shift)=>{const k=`${pid}|${shift}`;return Object.prototype.hasOwnProperty.call(draft,k)?draft[k]:saved(pid,shift)};
    const setVal=(pid,shift,v)=>setDraft(d=>{const k=`${pid}|${shift}`;const n={...d};if(v===saved(pid,shift))delete n[k];else n[k]=v;return n});
    const roomKey=p=>`${String(p.room_no||'zzz').padStart(6,'0')}-${p.bed_no||''}`;
    const guests=[...(patients||[])].sort((a,b)=>roomKey(a).localeCompare(roomKey(b),'en',{numeric:true}));
    const q=search.trim().toLowerCase();
    const shown=q.length>=3?guests.filter(p=>[formalName(p),p.patient_id,p.room_no].join(' ').toLowerCase().includes(q)):guests;
    const dirty=Object.keys(draft).length;
    function applyBulk(){
      const ids=Object.keys(picked).filter(k=>picked[k]);
      if(!ids.length){showSamaraActionToast('warning','Select Guests','Tick the Guests first, then choose the nurse.');return}
      setDraft(d=>{const n={...d};ids.forEach(pid=>['Day','Night'].forEach(sh=>{if(!bulk[sh])return;const v=bulk[sh]==='__none'?'':bulk[sh];const k=`${pid}|${sh}`;if(v===saved(pid,sh))delete n[k];else n[k]=v}));return n});
      setPicked({});
    }
    async function save(){
      if(busy||!dirty)return;setBusy(true);
      try{
        const rows=Object.entries(draft).map(([k,v])=>{const [patient_id,shift]=k.split('|');return {patient_id,shift,nurse_id:v||null}});
        const {data,error:e}=await client.rpc('set_guest_nurse_assignments',{p_rows:rows});
        if(e)throw e;
        setDraft({});showSamaraActionToast('success','Assignments saved',`${data?.changed??rows.length} change(s). Nurses see their Guests first from now.`);
        window.dispatchEvent(new Event('samara-guest-assign-changed'));
        await load();
      }catch(e){showSamaraActionToast('error','Not saved',e.message||String(e))}finally{setBusy(false)}
    }
    const nurseOptions=[h('option',{key:'',value:''},'— Not assigned —'),...nurses.map(n=>h('option',{key:n.id,value:n.id},formalName(n)))];
    const badge=(txt)=>h('small',{style:{display:'block',fontWeight:700,color:txt==='On duty'?'#11643a':'#b42318'}},txt);
    // per-nurse counts for the summary
    const counts={};guests.forEach(p=>['Day','Night'].forEach(sh=>{const v=value(p.id,sh);if(v){counts[v]=counts[v]||{Day:0,Night:0};counts[v][sh]++}}));
    const uncovered=sh=>guests.filter(p=>{const v=value(p.id,sh);return !v||dutyToday(v,sh)!=='On duty'}).length;
    const patientName=id=>{const p=(patients||[]).find(x=>String(x.id)===String(id));return p?`${formalName(p)}${p.room_no?` · Room ${p.room_no}${p.bed_no?`-${p.bed_no}`:''}`:''}`:'Guest'};

    return h(Section,{title:'Guests ↔ Nurses',subtitle:'Standing Day and Night nurse for each Guest. Nurses see their Guests first; for another nurse\'s Guest they give a reason. Alerts, notifications and the screensaver still show all Guests to every nurse.',
        actions:h('div',{style:{display:'flex',gap:'6px'}},
          h('button',{type:'button',className:`btn ${tab==='assign'?'btn-primary':'btn-secondary'}`,onClick:()=>setTab('assign')},'Assign'),
          h('button',{type:'button',className:`btn ${tab==='cover'?'btn-primary':'btn-secondary'}`,onClick:()=>setTab('cover')},`Cover records (${covers.length})`))},
      error?h('div',{className:'message error'},error):null,
      tab==='cover'?h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Date & time','Nurse','Guest','Shift','Assigned nurse','Page','Reason'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,covers.length?covers.map(c=>h('tr',{key:c.id},
            h('td',null,formatDateTimeIN(c.created_at)),
            h('td',null,c.nurse_name||'—'),h('td',null,patientName(c.patient_id)),h('td',null,c.shift||'—'),
            h('td',null,c.assigned_nurse_name||'—'),h('td',null,c.page||'—'),h('td',null,c.reason))):h('tr',null,h('td',{colSpan:7,className:'empty'},'No cover records in the last 30 days.')))))
      :h(React.Fragment,null,
        h('div',{className:'notice',style:{margin:'0 0 10px'}},
          `Today (${formatDateIN(today)}): Day shift — ${uncovered('Day')} Guest(s) without an assigned nurse on duty · Night shift — ${uncovered('Night')}. Those Guests can be attended by any nurse without a reason.`),
        nurses.length?h('div',{style:{display:'flex',flexWrap:'wrap',gap:'6px',margin:'0 0 10px'}},
          nurses.filter(n=>counts[n.id]).map(n=>h('span',{key:n.id,className:'pill'},`${formalName(n)}: Day ${counts[n.id].Day} · Night ${counts[n.id].Night}`))):null,
        h('div',{className:'rg-bar',style:{display:'flex',flexWrap:'wrap',gap:'8px',alignItems:'flex-end',margin:'0 0 10px'}},
          h('input',{value:search,onChange:e=>setSearch(e.target.value),placeholder:'Search Guest / room (3+ letters)…',style:{maxWidth:'240px'}}),
          h('div',{className:'field',style:{margin:0}},h('label',null,'Ticked Guests → Day nurse'),h('select',{value:bulk.Day,onChange:e=>setBulk({...bulk,Day:e.target.value})},h('option',{value:''},'(leave as is)'),h('option',{value:'__none'},'— Not assigned —'),nurses.map(n=>h('option',{key:n.id,value:n.id},formalName(n))))),
          h('div',{className:'field',style:{margin:0}},h('label',null,'Night nurse'),h('select',{value:bulk.Night,onChange:e=>setBulk({...bulk,Night:e.target.value})},h('option',{value:''},'(leave as is)'),h('option',{value:'__none'},'— Not assigned —'),nurses.map(n=>h('option',{key:n.id,value:n.id},formalName(n))))),
          h('button',{type:'button',className:'btn btn-secondary',onClick:applyBulk},'Apply to ticked'),
          h('span',{style:{flex:'1 1 auto'}}),
          h('button',{type:'button',className:'btn btn-secondary',disabled:busy||!dirty,onClick:()=>setDraft({})},'Discard'),
          h('button',{type:'button',className:'btn btn-primary',disabled:busy||!dirty,onClick:save},busy?'Saving…':dirty?`Save (${dirty})`:'Save')),
        h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,
            h('th',{style:{width:'34px'}},h('input',{type:'checkbox','aria-label':'Tick all shown',checked:shown.length>0&&shown.every(p=>picked[p.id]),onChange:e=>{const v=e.target.checked;setPicked(pk=>{const n={...pk};shown.forEach(p=>{n[p.id]=v});return n})}})),
            h('th',null,'Room'),h('th',null,'Guest'),h('th',null,'Day nurse (7 AM–7 PM)'),h('th',null,'Night nurse (7 PM–7 AM)'))),
          h('tbody',null,shown.length?shown.map(p=>h('tr',{key:p.id},
            h('td',null,h('input',{type:'checkbox','aria-label':`Tick ${formalName(p)}`,checked:!!picked[p.id],onChange:e=>setPicked(pk=>({...pk,[p.id]:e.target.checked}))})),
            h('td',null,p.room_no?`${p.room_no}${p.bed_no?`-${p.bed_no}`:''}`:'—'),
            h('td',null,h('strong',null,formalName(p)),h('small',{style:{display:'block',color:'#7b6871'}},p.patient_id||'')),
            ['Day','Night'].map(sh=>{const v=value(p.id,sh);const changed=Object.prototype.hasOwnProperty.call(draft,`${p.id}|${sh}`);
              return h('td',{key:sh,style:changed?{outline:'2px dashed #a91360',outlineOffset:'-2px'}:undefined},
                h('select',{value:v,onChange:e=>setVal(p.id,sh,e.target.value),'aria-label':`${sh} nurse for ${formalName(p)}`},nurseOptions),
                v?badge(`Today: ${dutyToday(v,sh)}`):null)}))):h('tr',null,h('td',{colSpan:5,className:'empty'},'No active Guests.')))))));
  }
