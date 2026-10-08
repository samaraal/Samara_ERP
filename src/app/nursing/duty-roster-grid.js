  // 2.16.1: Duty Roster grid — Excel-style table: staff in rows, dates in columns, tap a cell for
  // Day (7 AM–7 PM) / Night (7 PM–7 AM) / Weekly Off. For Admin / Director (all staff) and the
  // Nursing Manager (nursing staff). Uses the same duty_assignments rows as the list and weekly
  // form (one row per staff per date), so On Duty Today, acknowledgement and leave checks keep working.
  const ROSTER_DAY='Day Shift (7 AM–7 PM)',ROSTER_NIGHT='Night Shift (7 PM–7 AM)';
  function rosterGridAllowed(profile){return profile?.role==='Admin'||isNursingManagerProfile(profile)}
  function ensureDutyRosterStyles(){
    if(document.getElementById('samara-roster-grid-css-v2'))return;
    const s=document.createElement('style');s.id='samara-roster-grid-css-v2';
    s.textContent=`
      .rg-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:4px 0 12px}
      .rg-bar .rg-spacer{flex:1 1 auto}
      .rg-legend{display:flex;flex-wrap:wrap;gap:6px;font-size:12px;color:#5d4a54;margin:0 0 10px}
      .rg-legend span{display:inline-flex;align-items:center;gap:4px}
      .rg-wrap{overflow-x:hidden;overflow-y:auto;max-height:70vh;border:1px solid #ead7e1;border-radius:12px;background:#fff}
      .rg-table{border-collapse:separate;border-spacing:0;font-size:13px;width:100%;table-layout:fixed} /* 2.16.4: equal date columns, no sideways scroll */
      .rg-table th,.rg-table td{border-bottom:1px solid #f0e4ea;border-right:1px solid #f0e4ea;padding:0;text-align:center;white-space:nowrap}
      .rg-table thead th{position:sticky;top:0;z-index:3;background:#fbf2f7;color:#5d1039;font-weight:800;padding:6px 2px;overflow:hidden}
      .rg-table thead th.rg-today{background:#a91360;color:#fff}
      .rg-table thead th small{display:block;font-weight:600;font-size:11px;opacity:.85}
      .rg-table .rg-name{position:sticky;left:0;z-index:2;background:#fff;text-align:left;padding:6px 8px;width:170px;white-space:normal;overflow-wrap:anywhere;font-weight:700;color:#2e252a}
      .rg-table thead .rg-name{z-index:4;background:#fbf2f7}
      .rg-table .rg-name small{display:block;font-weight:500;color:#7b6871;font-size:11px}
      .rg-table .rg-group td{background:#f6eaf0;color:#790c44;font-weight:800;text-align:left;padding:5px 10px;position:sticky;left:0}
      .rg-cell{display:flex;align-items:center;justify-content:center;flex-direction:column;width:100%;min-width:0;overflow:hidden;height:42px;border:0;background:transparent;font-weight:800;font-size:13px;cursor:pointer;position:relative;color:#2e252a}
      .rg-cell:disabled{cursor:not-allowed}
      .rg-cell small{font-size:9px;font-weight:700;opacity:.8}
      .rg-D{background:#fff4c7;color:#7a5200}
      .rg-N{background:#1f2a5a;color:#fff}
      .rg-O{background:#eee9ff;color:#5940aa}
      .rg-L{background:#fde2e2;color:#b42318}
      .rg-X{background:#e7f1ff;color:#1d4f91}
      .rg-M{background:#ffe7c2;color:#8a4b00}
      .rg-past{opacity:.55}
      .rg-changed{outline:3px dashed #a91360;outline-offset:-3px}
      .rg-ack{position:absolute;top:2px;right:4px;font-size:10px;color:#11643a}
      .rg-N .rg-ack{color:#9ff0c0}
      .rg-flag{position:absolute;top:2px;left:4px;font-size:10px}
      .rg-total{font-size:12px;color:#5d4a54;padding:4px 2px!important;white-space:normal!important}
      .rg-table col.rg-c-name{width:170px}.rg-table col.rg-c-total{width:78px}
      .rg-s{display:none}.rg-compact .rg-l{display:none}.rg-compact .rg-s{display:inline}
      .rg-compact thead th{font-size:11px}.rg-compact thead th small{font-size:10px}.rg-compact .rg-cell{font-size:12px}
      .rg-compact .rg-cov td{font-size:10px}
      .rg-cov td{background:#fbf7f9;font-size:11px;font-weight:700;color:#5d4a54;padding:4px 2px}
      .rg-cov td.rg-short{background:#fde2e2;color:#b42318}
      .rg-cov .rg-name{background:#fbf7f9}
      .rg-unsaved{position:sticky;bottom:0;z-index:5;display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap;padding:10px 12px;margin-top:10px;background:#fff7fb;border:2px solid #a91360;border-radius:12px}
      @media (max-width:700px){.rg-table .rg-name{font-size:11px;padding:4px}.rg-table col.rg-c-name{width:92px}.rg-table col.rg-c-total{width:44px}.rg-l{display:none}.rg-s{display:inline}.rg-cell{height:38px;font-size:11px}.rg-table thead th{font-size:10px}.rg-name .btn{display:none!important}.rg-total{font-size:10px}}
    `;
    document.head.appendChild(s);
  }

  function DutyRosterGrid({profile}){
    React.useEffect(()=>{ensureDutyRosterStyles()},[]);
    const nursingManager=isNursingManagerProfile(profile);
    const iso=d=>d.toISOString().slice(0,10);
    const parse=s=>{const [y,m,d]=String(s||'').slice(0,10).split('-').map(Number);return new Date(Date.UTC(y,m-1,d))};
    const addDays=(s,n)=>{const d=parse(s);d.setUTCDate(d.getUTCDate()+n);return iso(d)};
    const monday=s=>{const d=parse(s);const w=d.getUTCDay();d.setUTCDate(d.getUTCDate()+(w===0?-6:1-w));return iso(d)};
    const DAY_NAMES=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const today=todayISOIndia();
    const [days,setDays]=React.useState(7);
    // 2.16.5: a month cannot fit a phone without sideways scrolling, so phones stay on 7 days.
    const [narrow,setNarrow]=React.useState(()=>window.matchMedia?.('(max-width:700px)').matches||false);
    React.useEffect(()=>{const mq=window.matchMedia?.('(max-width:700px)');if(!mq)return;const f=()=>setNarrow(mq.matches);mq.addEventListener?.('change',f);return()=>mq.removeEventListener?.('change',f)},[]);
    React.useEffect(()=>{if(narrow&&days!==7){setDraft({});setDays(7)}},[narrow]);
    const [start,setStart]=React.useState(()=>monday(today));
    const [startDraft,setStartDraft]=React.useState(start);
    React.useEffect(()=>setStartDraft(start),[start]);
    const dates=React.useMemo(()=>Array.from({length:days},(_,i)=>addDays(start,i)),[start,days]);
    const end=dates[dates.length-1];
    const [staff,setStaff]=React.useState([]);
    const [rows,setRows]=React.useState([]); // duty_assignments for [start-days, end]
    const [leave,setLeave]=React.useState([]);
    const [loading,setLoading]=React.useState(true);
    const [error,setError]=React.useState('');
    const [draft,setDraft]=React.useState({}); // key `${staffId}|${date}` -> 'D'|'N'|'O'|''
    const [busy,setBusy]=React.useState(false);
    const [search,setSearch]=React.useState('');
    const MIN_KEY=`samara_roster_min_v1_${profile?.id||''}`;
    const [minCover,setMinCover]=React.useState(()=>{try{return JSON.parse(localStorage.getItem(MIN_KEY)||'{}')||{}}catch(_){return {}}});
    React.useEffect(()=>{try{localStorage.setItem(MIN_KEY,JSON.stringify(minCover))}catch(_){}},[minCover]);
    const gen=React.useRef(0);
    const dirtyCount=Object.keys(draft).length;

    async function pages(make){const out=[];for(let p=0;;p++){const r=await make().range(p*500,p*500+499);if(r.error)throw r.error;out.push(...(r.data||[]));if((r.data||[]).length<500)return out}}
    async function load(){
      const g=++gen.current;setLoading(true);setError('');
      try{
        const from=addDays(start,-days);
        const [a,e,l]=await Promise.all([
          pages(()=>client.from('duty_assignments').select('*').gte('duty_date',from).lte('duty_date',end).order('id')),
          pages(()=>client.from('profiles').select('id,auth_user_id,title,full_name,employee_id,role,department,designation,is_active').order('id')),
          pages(()=>client.from('absence_requests').select('id,employee_id,request_type,status,leave_type,from_date,to_date,permission_date').in('status',['approved','pending_superior','pending_management']).order('id'))
        ]);
        if(g!==gen.current)return;
        setRows(a);setStaff(e.filter(x=>x.is_active!==false&&!isNonPayrollManagementAccount(x)));setLeave(l);
      }catch(err){if(g===gen.current)setError(err.message||'Unable to load the roster.')}
      finally{if(g===gen.current)setLoading(false)}
    }
    React.useEffect(()=>{load()},[start,days]);
    React.useEffect(()=>{
      const ch=client.channel('duty-roster-grid-live')
        .on('postgres_changes',{event:'*',schema:'public',table:'duty_assignments'},()=>{if(!Object.keys(draftRef.current).length)load()})
        .on('postgres_changes',{event:'*',schema:'public',table:'absence_requests'},()=>{if(!Object.keys(draftRef.current).length)load()}).subscribe();
      return()=>{gen.current++;client.removeChannel(ch)};
    },[start,days]);
    const draftRef=React.useRef(draft);draftRef.current=draft;

    const isNursingTeam=s=>{
      const role=String(s?.role||'').toLowerCase(),dept=String(employeeDepartment(s)||'').toLowerCase(),des=String(s?.designation||'').toLowerCase();
      if(des==='nurse manager'||des==='nursing manager')return false;
      return role==='nurse'||role==='caregiver'||dept==='nursing'||dept==='caregiving'||des.includes('nursing supervisor');
    };
    const scope=React.useMemo(()=>{
      const list=(nursingManager&&profile?.role!=='Admin'?staff.filter(isNursingTeam):staff).filter(s=>s.id!==undefined);
      const q=search.trim().toLowerCase();
      return list.filter(s=>!q||[formalName(s),s.full_name,s.employee_id,s.designation,employeeDepartment(s)].some(v=>String(v||'').toLowerCase().includes(q)))
        .sort((a,b)=>String(employeeDepartment(a)||'').localeCompare(String(employeeDepartment(b)||''))||String(a.full_name||'').localeCompare(String(b.full_name||'')));
    },[staff,search,nursingManager,profile?.role]);
    const idsOf=s=>[s.id,s.auth_user_id].filter(Boolean).map(String);
    const byKey=React.useMemo(()=>{
      const map=new Map();const people=new Map();staff.forEach(s=>idsOf(s).forEach(id=>people.set(id,s.id)));
      rows.forEach(r=>{if(r.status==='Cancelled')return;const sid=people.get(String(r.employee_id))||r.employee_id;const k=`${sid}|${r.duty_date}`;map.set(k,[...(map.get(k)||[]),r])});
      return map;
    },[rows,staff]);
    const leaveFor=(s,date)=>{
      const ids=new Set(idsOf(s));
      const m=leave.filter(l=>ids.has(String(l.employee_id))&&(l.request_type==='Permission'?l.permission_date===date:(l.from_date&&l.to_date&&l.from_date<=date&&l.to_date>=date)));
      return m.find(l=>l.status==='approved'&&l.request_type!=='Permission')||m.find(l=>l.status==='approved')||m[0]||null;
    };
    const codeOf=r=>{
      if(!r)return '';
      if(r.is_weekly_off||r.status==='Weekly Off'||r.shift==='Weekly Off')return 'O';
      if(r.shift===ROSTER_DAY)return 'D';
      if(r.shift===ROSTER_NIGHT)return 'N';
      return 'X';
    };
    function cellInfo(s,date){
      const k=`${s.id}|${date}`;const existing=byKey.get(k)||[];const lv=leaveFor(s,date);
      const onLeave=lv&&lv.status==='approved'&&lv.request_type!=='Permission';
      const saved=existing.length===1?codeOf(existing[0]):existing.length>1?'MULTI':'';
      const value=Object.prototype.hasOwnProperty.call(draft,k)?draft[k]:saved;
      const locked=date<today||onLeave||saved==='MULTI'||existing.some(r=>r.status==='Leave granted');
      return {k,existing,lv,onLeave,saved,value,locked,changed:Object.prototype.hasOwnProperty.call(draft,k)};
    }
    const NEXT={'':'D',D:'N',N:'O',O:'',X:'D'};
    function tap(s,date){
      const c=cellInfo(s,date);if(c.locked||busy)return;
      const next=NEXT[c.value]??'D';
      setDraft(d=>{const n={...d};if(next===c.saved)delete n[c.k];else n[c.k]=next;return n});
    }
    function copyPrevious(){
      let filled=0;const n={...draft};
      scope.forEach(s=>dates.forEach(date=>{
        const c=cellInfo(s,date);if(c.locked||c.value)return;
        const prev=byKey.get(`${s.id}|${addDays(date,-days)}`)||[];if(prev.length!==1)return;
        const code=codeOf(prev[0]);if(!['D','N','O'].includes(code))return;
        n[c.k]=code;filled++;
      }));
      setDraft(n);
      showSamaraActionToast(filled?'success':'warning',filled?'Previous period copied':'Nothing to copy',filled?`${filled} empty cells filled from the previous ${days} days. Review, then press Save roster.`:'No empty, unlocked cells had a Day / Night / Off in the previous period.');
    }
    function fillRow(s,code){
      const n={...draft};dates.forEach(date=>{const c=cellInfo(s,date);if(c.locked)return;if(code===c.saved)delete n[c.k];else n[c.k]=code});setDraft(n);
    }

    async function save(){
      if(busy||!dirtyCount)return;
      setBusy(true);
      try{
        // Re-read so nobody else's change is overwritten.
        const fresh=await pages(()=>client.from('duty_assignments').select('*').gte('duty_date',start).lte('duty_date',end).order('id'));
        const freshLeave=await pages(()=>client.from('absence_requests').select('id,employee_id,request_type,status,from_date,to_date,permission_date').eq('status','approved').order('id'));
        const people=new Map();staff.forEach(s=>idsOf(s).forEach(id=>people.set(id,s)));
        const freshBy=new Map();fresh.forEach(r=>{if(r.status==='Cancelled')return;const s=people.get(String(r.employee_id));const k=`${s?.id||r.employee_id}|${r.duty_date}`;freshBy.set(k,[...(freshBy.get(k)||[]),r])});
        const {data:{user}}=await client.auth.getUser();
        const now=new Date().toISOString(),actor=user?.id||profile?.id,actorName=formalName(profile)||profile?.full_name||'Authorised user';
        const inserts=[],updates=[],problems=[];
        for(const [k,code] of Object.entries(draft)){
          const [sid,date]=k.split('|');const s=staff.find(x=>x.id===sid);if(!s)continue;
          const before=(byKey.get(k)||[]).map(r=>`${r.id}:${r.updated_at||''}`).join(',');
          const nowRows=freshBy.get(k)||[];
          if(nowRows.map(r=>`${r.id}:${r.updated_at||''}`).join(',')!==before){problems.push(`${formalName(s)} ${formatDateIN(date)} was changed by someone else`);continue}
          if(code&&code!=='O'&&freshLeave.some(l=>idsOf(s).includes(String(l.employee_id))&&l.request_type!=='Permission'&&l.from_date<=date&&l.to_date>=date)){problems.push(`${formalName(s)} is on approved leave on ${formatDateIN(date)}`);continue}
          const off=code==='O';
          const fields=code?{shift:off?'Weekly Off':code==='D'?ROSTER_DAY:ROSTER_NIGHT,duty_type:off?'Weekly Off':'General Duty',status:off?'Weekly Off':'Assigned',is_weekly_off:off,week_start:monday(date),weekly_off_day:off?(parse(date).getUTCDay()+6)%7:null}:null;
          const existing=nowRows[0];
          if(!existing&&fields)inserts.push({employee_id:s.id,duty_date:date,...fields,assigned_by:actor,assigned_by_name:actorName,assigned_by_role:profile?.role,assigned_at:now,updated_at:now,remarks:'Duty Roster grid'});
          else if(existing&&!fields)updates.push({id:existing.id,patch:{status:'Cancelled',updated_at:now,status_updated_at:now,status_updated_by:actor,status_updated_by_name:actorName}});
          else if(existing&&fields)updates.push({id:existing.id,patch:{...fields,updated_at:now,status_updated_at:now,status_updated_by:actor,status_updated_by_name:actorName}});
        }
        if(problems.length&&!inserts.length&&!updates.length)throw new Error(`Nothing saved. ${problems.slice(0,4).join('; ')}${problems.length>4?` + ${problems.length-4} more`:''}. Press Reload and try again.`);
        if(inserts.length){const {error}=await client.from('duty_assignments').insert(inserts);if(error)throw error}
        for(let i=0;i<updates.length;i+=10){
          const res=await Promise.all(updates.slice(i,i+10).map(u=>client.from('duty_assignments').update(u.patch).eq('id',u.id)));
          const bad=res.find(r=>r.error);if(bad)throw bad.error;
        }
        writeAuditEvent('Duty Roster Saved','Duty Assignment',null,{from:start,to:end,added:inserts.length,changed:updates.length,skipped:problems.length},'Success');
        setDraft({});
        showSamaraActionToast(problems.length?'warning':'success',problems.length?'Roster saved with skips':'Roster saved',
          `${inserts.length} added, ${updates.length} changed.${problems.length?` Skipped: ${problems.slice(0,3).join('; ')}${problems.length>3?' …':''}.`:''} Staff see the changes in My Duty and acknowledge as usual.`);
        await load();
      }catch(err){showSamaraActionToast('error','Roster not saved',err.message||'Unable to save the roster.')}
      finally{setBusy(false)}
    }

    // ---- render ----
    const label=code=>({D:'Day',N:'Night',O:'OFF',X:'Other',M:'2×'}[code]||'');
    const groups=[];let lastDept=null;
    scope.forEach(s=>{const d=profile?.role==='Admin'?(employeeDepartment(s)||'Other'):'';if(d!==lastDept){groups.push({dept:d,staff:[]});lastDept=d}groups[groups.length-1].staff.push(s)});
    const coverage=date=>{let D=0,N=0;scope.forEach(s=>{const c=cellInfo(s,date);if(c.onLeave)return;if(c.value==='D')D++;else if(c.value==='N')N++});return {D,N}};
    const short=(date,cov)=>(Number(minCover.D)>0&&cov.D<Number(minCover.D))||(Number(minCover.N)>0&&cov.N<Number(minCover.N));
    const move=dir=>{if(dirtyCount&&!window.confirm('You have unsaved roster changes. Discard them?'))return;setDraft({});setStart(addDays(start,dir*days))};
    const setPeriod=n=>{if(n===days)return;if(dirtyCount&&!window.confirm('You have unsaved roster changes. Discard them?'))return;setDraft({});setDays(n)};

    return h(Section,{title:'Duty Roster',subtitle:nursingManager&&profile?.role!=='Admin'?'Nursing staff · tap a cell: Day → Night → Off → empty. Press Save roster when done.':'All staff · tap a cell: Day → Night → Off → empty. Press Save roster when done.'},
      h('div',{className:'rg-bar'},
        h('div',{role:'group','aria-label':'Period length',style:{display:'flex',gap:'4px'}},
          [7,30].map(n=>h('button',{key:n,type:'button',className:`btn ${days===n?'btn-primary':'btn-secondary'}`,'aria-pressed':days===n,disabled:n===30&&narrow,title:n===30&&narrow?'30 days needs a wider screen (computer or tablet)':undefined,onClick:()=>setPeriod(n)},`${n} days`))),
        h('button',{type:'button',className:'btn btn-secondary','aria-label':'Previous period',onClick:()=>move(-1)},'‹'),
        h('label',{style:{display:'flex',alignItems:'center',gap:'5px',fontSize:'12px',color:'#725d68'}},'From',h(StrictDateInput,{value:startDraft,onChange:e=>setStartDraft(e.target.value)})),
        startDraft&&startDraft!==start?h('button',{type:'button',className:'btn btn-primary',onClick:()=>{if(dirtyCount&&!window.confirm('You have unsaved roster changes. Discard them?'))return;setDraft({});setStart(startDraft)}},'Apply'):null,
        h('button',{type:'button',className:'btn btn-secondary','aria-label':'Next period',onClick:()=>move(1)},'›'),
        h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{if(dirtyCount&&!window.confirm('You have unsaved roster changes. Discard them?'))return;setDraft({});setStart(monday(today))}},'This week'),
        h('span',{className:'rg-spacer'}),
        h('input',{value:search,onChange:e=>setSearch(e.target.value),placeholder:'Search staff…',style:{maxWidth:'180px'}}),
        h('button',{type:'button',className:'btn btn-secondary',disabled:busy||loading,title:`Fill empty cells from the previous ${days} days`,onClick:copyPrevious},'Copy previous period'),
        h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>{if(dirtyCount&&!window.confirm('Reload and discard unsaved changes?'))return;setDraft({});load()}},'Reload')),
      h('div',{className:'rg-legend'},
        h('span',null,h('b',{className:'rg-D',style:{padding:'2px 6px',borderRadius:'6px'}},'Day'),'7 AM–7 PM'),
        h('span',null,h('b',{className:'rg-N',style:{padding:'2px 6px',borderRadius:'6px'}},'Night'),'7 PM–7 AM'),
        h('span',null,h('b',{className:'rg-O',style:{padding:'2px 6px',borderRadius:'6px'}},'OFF'),'Weekly off (any day)'),
        h('span',null,h('b',{className:'rg-L',style:{padding:'2px 6px',borderRadius:'6px'}},'LEAVE 🔒'),'Approved leave'),
        h('span',null,'30 days / phone: D = Day · N = Night · O = Off · L = Leave'),
        h('span',null,'⚠ Leave pending · P Permission · ✓ Acknowledged by staff · Other = Morning / Evening / General (from the list)'),
        h('span',{style:{marginLeft:'auto',display:'inline-flex',gap:'6px',alignItems:'center'}},'Minimum per shift: Day',
          h('input',{type:'number',min:0,value:minCover.D||'',onChange:e=>setMinCover({...minCover,D:e.target.value}),style:{width:'52px',padding:'2px 4px'}}),'Night',
          h('input',{type:'number',min:0,value:minCover.N||'',onChange:e=>setMinCover({...minCover,N:e.target.value}),style:{width:'52px',padding:'2px 4px'}}))),
      error?h('div',{className:'message error'},error):null,
      loading&&!staff.length?h('p',{className:'empty'},'Loading roster…'):
      h('div',{className:'rg-wrap'},h('table',{className:`rg-table ${days>7?'rg-compact':''}`},
        h('colgroup',null,h('col',{className:'rg-c-name'}),dates.map(d=>h('col',{key:d})),h('col',{className:'rg-c-total'})),
        h('thead',null,h('tr',null,
          h('th',{className:'rg-name'},`Staff (${scope.length})`),
          dates.map(date=>h('th',{key:date,className:date===today?'rg-today':'',title:formatDateIN(date)},h('span',{className:'rg-l'},DAY_NAMES[parse(date).getUTCDay()]),h('span',{className:'rg-s'},DAY_NAMES[parse(date).getUTCDay()].slice(0,2)),h('small',null,h('span',{className:'rg-l'},formatDateIN(date).slice(0,5)),h('span',{className:'rg-s'},formatDateIN(date).slice(0,2))))),
          h('th',{title:'Days / Nights / Offs in this period'},'D/N/O'))),
        h('tbody',null,
          groups.map(g=>[
            g.dept?h('tr',{key:`g-${g.dept}`,className:'rg-group'},h('td',{colSpan:dates.length+2},g.dept)):null,
            ...g.staff.map(s=>{
              let D=0,N=0,O=0;
              const cells=dates.map(date=>{
                const c=cellInfo(s,date);
                if(c.value==='D')D++;else if(c.value==='N')N++;else if(c.value==='O')O++;
                const ack=c.existing.length===1&&c.existing[0].status==='Acknowledged'&&!c.changed;
                const code=c.onLeave?'L':c.saved==='MULTI'?'M':c.value;
                const title=c.onLeave?`Approved leave (${c.lv.leave_type||'Leave'})`:c.saved==='MULTI'?'More than one duty on this day — fix it in the List tab':date<today?'Past date (view only)':c.lv?(c.lv.status==='approved'?'Approved permission':'Leave / permission pending approval'):'Tap: Day → Night → Off → empty';
                return h('td',{key:date},h('button',{type:'button',className:`rg-cell ${code?`rg-${code}`:''} ${date<today?'rg-past':''} ${c.changed?'rg-changed':''}`,disabled:c.locked||busy,title,'aria-label':`${formalName(s)} ${formatDateIN(date)}: ${c.onLeave?'leave':label(c.value)||'empty'}`,onClick:()=>tap(s,date)},
                  !c.onLeave&&c.lv?h('span',{className:'rg-flag'},c.lv.status==='approved'?'P':'⚠'):null,
                  ack?h('span',{className:'rg-ack'},'✓'):null,
                  c.onLeave?h(React.Fragment,null,h('span',{className:'rg-l'},'LEAVE'),h('span',{className:'rg-s'},'L')):c.saved==='MULTI'?'2×':h(React.Fragment,null,h('span',{className:'rg-l'},label(c.value)),h('span',{className:'rg-s'},({D:'D',N:'N',O:'O',X:'•'})[c.value]||'')),
                  c.value==='X'&&!c.changed&&c.existing[0]?h('small',{className:'rg-l'},String(c.existing[0].shift||'').split(' ')[0]):null));
              });
              return h('tr',{key:s.id},
                h('td',{className:'rg-name'},formalName(s),h('small',null,[s.designation,s.employee_id].filter(Boolean).join(' · ')),
                  h('span',{style:{display:'flex',gap:'3px',marginTop:'3px'}},
                    h('button',{type:'button',className:'btn btn-secondary',style:{padding:'1px 6px',fontSize:'10px'},title:'Set every open day in this period to Day',onClick:()=>fillRow(s,'D')},'All Day'),
                    h('button',{type:'button',className:'btn btn-secondary',style:{padding:'1px 6px',fontSize:'10px'},title:'Set every open day in this period to Night',onClick:()=>fillRow(s,'N')},'All Night'))),
                cells,
                h('td',{className:'rg-total'},`${D}/${N}/${O}`));
            })
          ]),
          h('tr',{className:'rg-cov'},
            h('td',{className:'rg-name'},'On duty (Day · Night)'),
            dates.map(date=>{const cov=coverage(date);return h('td',{key:date,className:short(date,cov)?'rg-short':'',title:short(date,cov)?'Below the minimum per shift':''},`${cov.D}·${cov.N}`)}),
            h('td',null,''))))),
      dirtyCount?h('div',{className:'rg-unsaved',role:'status'},
        h('strong',{style:{color:'#790c44'}},`${dirtyCount} unsaved change${dirtyCount===1?'':'s'}`),
        h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>setDraft({})},'Discard'),
        h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:save},busy?'Saving…':'Save roster')):null,
      h('p',{className:'small-note',style:{marginTop:'8px'}},'Past dates are view only. Staff on approved leave are locked (mark Back on Duty in Staff Leave Calendar to roster them). Changing a shift a staff member already acknowledged asks them to acknowledge again. Patient, ward and task details can still be added from the List tab.'));
  }

  // Duty Assignment page: Roster grid (Admin / Nursing Manager) + the existing list and weekly form.
  function DutyAssignmentPage({profile,viewMode='assignment'}){
    // 'Duty Assignment' is the Nursing Manager's own 'My Duty' page, so there the grid is for Admin only;
    // 'Staff Duty Assignment' (team) has the grid for Admin and the Nursing Manager.
    const allowed=viewMode==='team'?rosterGridAllowed(profile):profile?.role==='Admin';
    const [view,setView]=React.useState(()=>{try{return sessionStorage.getItem('samara_duty_view')||'grid'}catch(_){return 'grid'}});
    React.useEffect(()=>{try{sessionStorage.setItem('samara_duty_view',view)}catch(_){}},[view]);
    if(!allowed)return h(DutyAssignment,{profile,viewMode});
    return h(React.Fragment,null,
      h('div',{role:'tablist','aria-label':'Duty views',style:{display:'flex',gap:'6px',margin:'0 0 10px'}},
        h('button',{type:'button',role:'tab','aria-selected':view==='grid',className:`btn ${view==='grid'?'btn-primary':'btn-secondary'}`,onClick:()=>setView('grid')},'＋ Assign Duty (Roster grid)'),
        h('button',{type:'button',role:'tab','aria-selected':view==='list',className:`btn ${view==='list'?'btn-primary':'btn-secondary'}`,onClick:()=>setView('list')},'Duty list')),
      // 2.16.3: in the Duty list, "Assign Duty" opens the Roster grid (the long weekly form is no longer used here)
      view==='grid'?h(DutyRosterGrid,{profile}):h(DutyAssignment,{profile,viewMode,onOpenGrid:()=>setView('grid')}));
  }
