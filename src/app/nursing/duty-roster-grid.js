  // 2.16.1: Duty Roster grid — Excel-style table: staff in rows, dates in columns, tap a cell for
  // Day (7 AM–7 PM) / Night (7 PM–7 AM) / Weekly Off. For Admin / Director (all staff) and the
  // Nursing Manager (nursing staff). Uses the same duty_assignments rows as the list and weekly
  // form (one row per staff per date), so On Duty Today, acknowledgement and leave checks keep working.
  const ROSTER_DAY='Day Shift (7 AM–7 PM)',ROSTER_NIGHT='Night Shift (7 PM–7 AM)';
  // 2.19.50: Absent (A, red) — staff did not come and had no approved leave. Payroll counts it as loss of pay.
  const ROSTER_ABSENT='Absent';
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
      .rg-A{background:#d92d20;color:#fff}
      .rg-A .rg-ack{color:#fff}
      .rg-X{background:#e7f1ff;color:#1d4f91}
      .rg-M{background:#ffe7c2;color:#8a4b00}
      .rg-past{opacity:.55}
      .rg-prejoin{background:repeating-linear-gradient(135deg,#f6eef2 0 6px,#fbf7f9 6px 12px)!important;color:#b9a3af!important;cursor:not-allowed}
      .rg-join{position:absolute;left:3px;top:2px;font-size:9px;font-weight:900;color:#0b7a4b;background:#e3f6ec;border-radius:5px;padding:0 4px}
      .rg-changed{outline:3px dashed #a91360;outline-offset:-3px}
      .rg-ack{position:absolute;top:2px;right:4px;font-size:10px;color:#11643a}
      .rg-N .rg-ack{color:#9ff0c0}
      .rg-flag{position:absolute;top:2px;left:4px;font-size:10px}
      .rg-flag-half{color:#b42318;font-weight:800}
      .rg-cell.rg-half{background-image:linear-gradient(135deg,transparent 50%,rgba(253,226,226,.95) 50%)}
      .rg-att{display:block;font-size:9px;font-weight:800;line-height:1.15;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
      .rg-att.rg-att-wrap{white-space:normal;overflow:visible}.rg-att-ok{color:#0b7a4b}.rg-att-warn{color:#9a5b00}.rg-att-absent{color:#b42318}.rg-att-extra{color:#b45309}
      .rg-N .rg-att-ok{color:#9ff0c0}.rg-N .rg-att-warn{color:#ffd28a}.rg-N .rg-att-absent{color:#ffb3b3}
      .rg-cell.rg-extra{outline:2px solid #f59e0b;outline-offset:-2px}
      .rg-cell.rg-noshow{box-shadow:inset 0 0 0 2px #d92d20}
      .rg-att-row td{background:#f3fbf6;font-size:11px;font-weight:700;color:#14532d;padding:4px 2px}
      .rg-att-row .rg-name{background:#f3fbf6}
      .rg-total{font-size:12px;color:#5d4a54;padding:4px 2px!important;white-space:normal!important}
      .rg-table col.rg-c-name{width:170px}.rg-table col.rg-c-total{width:78px}
      .rg-s{display:none}.rg-compact .rg-l{display:none}.rg-compact .rg-s{display:inline}
      .rg-compact thead th{font-size:11px}.rg-compact thead th small{font-size:10px}.rg-compact .rg-cell{font-size:12px}
      .rg-compact .rg-cov td{font-size:10px}
      .rg-cov td{background:#fbf7f9;font-size:11px;font-weight:700;color:#5d4a54;padding:4px 2px}
      .rg-cov td.rg-short{background:#fde2e2;color:#b42318}
      .rg-cov .rg-name{background:#fbf7f9}
      .rg-unsaved{position:sticky;bottom:0;z-index:5;display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap;padding:10px 12px;margin-top:10px;background:#fff7fb;border:2px solid #a91360;border-radius:12px}
      /* 2.16.12: on phones the floating "unsaved changes" box covered › Next week, This week and Save roster
         (and the dates / last staff rows sat behind it and the bottom menu). On phones it is now a normal
         box under the grid; Save roster stays at the top of the roster. */
      @media (max-width:760px){
        .rg-unsaved{position:static!important;margin-top:10px}
        .rg-wrap{max-height:62vh}
        .rg-bar{gap:6px}
        .rg-bar .rg-spacer{display:none}
        .rg-roster-end{height:96px} /* room to scroll the last staff rows above the bottom menu / Back / Help buttons */
      }
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
    const [att,setAtt]=React.useState([]); // 2.20.36: biometric shifts (HR → Biometric Attendance)
    const [loading,setLoading]=React.useState(true);
    const [error,setError]=React.useState('');
    const [draft,setDraft]=React.useState({}); // key `${staffId}|${date}` -> 'D'|'N'|'O'|''
    const [busy,setBusy]=React.useState(false);
    const [search,setSearch]=React.useState('');
    // 2.19.34: Admin / Nursing Manager may fill MISSED past days (empty cells only, from 27-08-2026), with a reason
    const [pastMode,setPastMode]=React.useState(false);
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
        const [a,e,l,rosterOff]=await Promise.all([
          pages(()=>client.from('duty_assignments').select('*').gte('duty_date',from).lte('duty_date',end).order('id')),
          pages(()=>client.from('profiles').select('id,auth_user_id,title,full_name,employee_id,role,department,designation,is_active,date_of_joining,created_at').order('id')),
          pages(()=>client.from('absence_requests').select('id,employee_id,request_type,status,leave_type,from_date,to_date,permission_date,shift_part,permission_from,permission_to').in('status',['approved','pending_superior','pending_management']).order('id')),
          loadDutyRosterExclusions()
        ]);
        if(g!==gen.current)return;
        setRows(a);setStaff(e.filter(x=>x.is_active!==false&&!isNonPayrollManagementAccount(x)).filter(notExcludedFromRoster(rosterOff)));setLeave(l);
        if(start<=today)samaraAttendanceShifts(start,end<today?end:today).then(x=>{if(g===gen.current)setAtt(x)});else setAtt([]);
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

    // 2.19.35/36: date of joining (HR; if blank, the day the employee was added to the ERP)
    const joinOf=s=>s?.date_of_joining?String(s.date_of_joining).slice(0,10):(s?.created_at?new Date(new Date(s.created_at).getTime()+19800000).toISOString().slice(0,10):'');
    const isNursingTeam=s=>{
      const role=String(s?.role||'').toLowerCase(),dept=String(employeeDepartment(s)||'').toLowerCase(),des=String(s?.designation||'').toLowerCase();
      if(des==='nurse manager'||des==='nursing manager')return false;
      return role==='nurse'||role==='caregiver'||dept==='nursing'||dept==='caregiving'||des.includes('nursing supervisor');
    };
    const scope=React.useMemo(()=>{
      const list=(nursingManager&&profile?.role!=='Admin'?staff.filter(isNursingTeam):staff).filter(s=>s.id!==undefined);
      const q=search.trim().toLowerCase();
      return list.filter(s=>{const j=joinOf(s);return !j||j<=end||rows.some(r=>r.status!=='Cancelled'&&r.duty_date>=start&&[s.id,s.auth_user_id].filter(Boolean).map(String).includes(String(r.employee_id))&&r.duty_date<=end)})
        .filter(s=>!q||[formalName(s),s.full_name,s.employee_id,s.designation,employeeDepartment(s)].some(v=>String(v||'').toLowerCase().includes(q)))
        .sort((a,b)=>String(employeeDepartment(a)||'').localeCompare(String(employeeDepartment(b)||''))||String(a.full_name||'').localeCompare(String(b.full_name||'')));
    },[staff,search,nursingManager,profile?.role,rows,start,end]);
    const idsOf=s=>[s.id,s.auth_user_id].filter(Boolean).map(String);
    const byKey=React.useMemo(()=>{
      const map=new Map();const people=new Map();staff.forEach(s=>idsOf(s).forEach(id=>people.set(id,s.id)));
      rows.forEach(r=>{if(r.status==='Cancelled')return;const sid=people.get(String(r.employee_id))||r.employee_id;const k=`${sid}|${r.duty_date}`;map.set(k,[...(map.get(k)||[]),r])});
      return map;
    },[rows,staff]);
    const leaveFor=(s,date)=>{
      const ids=new Set(idsOf(s));
      const m=leave.filter(l=>ids.has(String(l.employee_id))&&(l.request_type==='Permission'?l.permission_date===date:(l.from_date&&l.to_date&&l.from_date<=date&&l.to_date>=date)));
      // 2.19.98: an approved FULL leave wins; a half-day leave or permission only flags the cell (duty stays editable)
      return m.find(l=>l.status==='approved'&&l.request_type!=='Permission'&&!isHalfLeave(l))||m.find(l=>l.status==='approved'&&isHalfLeave(l))||m.find(l=>l.status==='approved')||m[0]||null;
    };
    const isHalfLeave=l=>!!l&&l.request_type!=='Permission'&&/half/i.test(String(l.shift_part||''));
    const hhmm=t=>String(t||'').slice(0,5);
    const flagOf=lv=>!lv?null:lv.status!=='approved'?'⚠':isHalfLeave(lv)?'½L':'P';
    const lvTitle=lv=>!lv?'':lv.status!=='approved'?'Leave / permission pending approval':isHalfLeave(lv)?`Half-day leave approved (${lv.shift_part}, ${lv.leave_type||'Leave'}) — Payroll: ½ day worked + ½ day leave. Set her Day / Night duty for this date as usual.`:`Approved permission ${hhmm(lv.permission_from)}–${hhmm(lv.permission_to)}`;
    const codeOf=r=>{
      if(!r)return '';
      if(r.status===ROSTER_ABSENT||r.shift===ROSTER_ABSENT)return 'A';
      if(r.is_weekly_off||r.status==='Weekly Off'||r.shift==='Weekly Off')return 'O';
      if(r.shift===ROSTER_DAY)return 'D';
      if(r.shift===ROSTER_NIGHT)return 'N';
      return 'X';
    };
    function cellInfo(s,date){
      const k=`${s.id}|${date}`;const existing=byKey.get(k)||[];const lv=leaveFor(s,date);
      const onLeave=lv&&lv.status==='approved'&&lv.request_type!=='Permission'&&!isHalfLeave(lv);
      const saved=existing.length===1?codeOf(existing[0]):existing.length>1?'MULTI':'';
      const value=Object.prototype.hasOwnProperty.call(draft,k)?draft[k]:saved;
      const pastOpen=pastMode&&date<today&&date>='2026-08-27'&&!existing.length;
      const jd=joinOf(s),preJoin=!!jd&&date<jd&&!existing.length;
      // 2.19.50: in 'Fill missed past days' a saved past Day / Night can be changed to Absent (and back).
      const pastAbsent=pastMode&&date<today&&date>='2026-08-27'&&existing.length===1&&['D','N','A'].includes(saved);
      const locked=preJoin||(date<today&&!pastOpen&&!pastAbsent)||onLeave||saved==='MULTI'||existing.some(r=>r.status==='Leave granted');
      return {k,existing,lv,onLeave,saved,value,locked,preJoin,pastAbsent,joinDay:!!jd&&date===jd,changed:Object.prototype.hasOwnProperty.call(draft,k)};
    }
    // 2.20.36: biometric punches on the roster — ✓ present (In time), Late / Early / No out, ✗ no punch, ⚑ punched without a Day / Night duty
    const attByKey=React.useMemo(()=>{const m=new Map();att.forEach(g=>{const k=`${g.employee_id}|${g.date}`;m.set(k,[...(m.get(k)||[]),g])});return m},[att]);
    const attInfo=(s,date,code)=>{
      if(date>today)return null;
      const gs=attByKey.get(`${s.id}|${date}`)||[];
      const want=code==='D'?'Day':code==='N'?'Night':'';
      const shiftTxt=x=>x==='Night'?'Night (7 PM – 7 AM)':x==='Day'?'Day (7 AM – 7 PM)':x==='Both'?'Day + Night':(x||'—');
      const nextDay=(g,v)=>String(v).slice(0,10)!==String(g.in).slice(0,10)?' (next day)':'';
      if(want){
        const w=samaraShiftWindow(date,want),g=gs.find(x=>x.shift===want||x.shift==='Both')||gs[0];
        if(!g)return Date.now()<w.start.getTime()+30*60000?null:{kind:'absent',short:'✗',text:'✗ No punch',
          title:`Shift: ${shiftTxt(want)}\nIn: Not punched\nOut: Not punched`};
        const over=Date.now()>=w.end.getTime();
        const late=Math.round((new Date(g.in)-w.start)/60000),early=g.out&&over?Math.round((w.end-new Date(g.out))/60000):0;
        const flags=[];if(late>15)flags.push(`Came ${bioDur(late)} late`);if(early>15)flags.push(`Left ${bioDur(early)} early`);
        if(!g.out&&Date.now()>w.end.getTime()+60*60000)flags.push('No out punch');
        const inLine=`${bioTime(g.in)} — ${late>15?`${bioDur(late)} late`:'on time'}`;
        const outLine=!over?(g.out?`On duty (last punch ${bioTime(g.out)})`:'On duty')
          :g.out?`${bioTime(g.out)}${nextDay(g,g.out)} — ${early>15?`${bioDur(early)} early`:'on time'}`:'Not punched';
        return {kind:flags.length?'warn':'ok',present:true,short:flags.length?'!':'✓',text:over?`In ${bioTime(g.in)} · Out ${g.out?bioTime(g.out):'—'}`:`In ${bioTime(g.in)} · on duty`,flags:flags.join(' · '),
          title:`Shift: ${shiftTxt(want)}\nIn: ${inLine}\nOut: ${outLine}\nTotal: ${g.count} punch${g.count===1?'':'es'}`};
      }
      if(code==='A'){const r=(byKey.get(`${s.id}|${date}`)||[])[0];if(r&&r.auto_absent)return {kind:'absent',short:'auto',text:'auto: no punch',
        title:'Status: Absent (marked automatically)\nWhy: No punch and no approved leave\nChange: In “Fill missed past days”'}}
      if(gs.length){const g=gs[0];return {kind:'extra',short:'⚑',text:'⚑ Punched',
        title:`Shift: ${shiftTxt(g.shift)} — not in the roster\nIn: ${bioTime(g.in)}\nOut: ${g.out?bioTime(g.out)+nextDay(g,g.out):'Not punched'}\nTotal: ${g.count} punch${g.count===1?'':'es'}`}}
      return null;
    };
    const NEXT={'':'D',D:'N',N:'O',O:'A',A:'',X:'D'};
    const NEXT_PAST_SAVED={D:'N',N:'A',A:'D'}; // a saved past day is never emptied here
    function tap(s,date){
      const c=cellInfo(s,date);if(c.locked||busy)return;
      const next=c.pastAbsent?(NEXT_PAST_SAVED[c.value]??'A'):(NEXT[c.value]??'D');
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
      const n={...draft};dates.forEach(date=>{const c=cellInfo(s,date);if(c.locked||c.pastAbsent)return;if(code===c.saved)delete n[c.k];else n[c.k]=code});setDraft(n);
    }

    async function save(){
      if(busy||!dirtyCount)return;
      const pastKeys=Object.keys(draft).filter(k=>k.split('|')[1]<today&&draft[k]);
      let pastReason='';
      if(pastKeys.length){
        const ask=await samaraAsk({title:'Filling missed past days',message:`${pastKeys.length} past day(s) are being added or changed (e.g. marked Absent) in the roster. These count for Payroll (days worked / weekly offs). If a salary for that month is already saved, void it and save it again.`,
          fields:[{key:'reason',label:'Why were these days missed? (kept with each entry)',type:'textarea',value:'',required:true}],okLabel:'Save roster'});
        if(ask===null)return;
        pastReason=String(ask.reason||'').trim();
        if(pastReason.length<5){showSamaraActionToast('error','Reason needed','Write why these past days were missed (a few words).');return}
      }
      setBusy(true);
      try{
        // Re-read so nobody else's change is overwritten.
        const fresh=await pages(()=>client.from('duty_assignments').select('*').gte('duty_date',start).lte('duty_date',end).order('id'));
        const freshLeave=await pages(()=>client.from('absence_requests').select('id,employee_id,request_type,status,from_date,to_date,permission_date,shift_part').eq('status','approved').order('id'));
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
          if(code&&code!=='O'&&freshLeave.some(l=>idsOf(s).includes(String(l.employee_id))&&l.request_type!=='Permission'&&!/half/i.test(String(l.shift_part||''))&&l.from_date<=date&&l.to_date>=date)){problems.push(`${formalName(s)} is on approved leave on ${formatDateIN(date)}`);continue}
          const off=code==='O';
          const fields=code==='A'?{shift:ROSTER_ABSENT,duty_type:ROSTER_ABSENT,status:ROSTER_ABSENT,is_weekly_off:false,week_start:monday(date),weekly_off_day:null}:code?{shift:off?'Weekly Off':code==='D'?ROSTER_DAY:ROSTER_NIGHT,duty_type:off?'Weekly Off':'General Duty',status:off?'Weekly Off':'Assigned',is_weekly_off:off,week_start:monday(date),weekly_off_day:off?(parse(date).getUTCDay()+6)%7:null}:null;
          const existing=nowRows[0];
          if(!existing&&fields)inserts.push({employee_id:s.id,duty_date:date,...fields,assigned_by:actor,assigned_by_name:actorName,assigned_by_role:profile?.role,assigned_at:now,updated_at:now,remarks:date<today?`Past day filled later by ${actorName} on ${formatDateIN(todayISOIndia())}: ${pastReason}`:'Duty Roster grid'});
          else if(existing&&!fields)updates.push({id:existing.id,patch:{status:'Cancelled',updated_at:now,status_updated_at:now,status_updated_by:actor,status_updated_by_name:actorName}});
          else if(existing&&fields)updates.push({id:existing.id,patch:{...fields,...(date<today?{remarks:`${existing.remarks?`${existing.remarks} | `:''}Changed to ${code==='A'?'Absent':code==='D'?'Day':code==='N'?'Night':'Off'} later by ${actorName} on ${formatDateIN(todayISOIndia())}: ${pastReason}`}:{}),updated_at:now,status_updated_at:now,status_updated_by:actor,status_updated_by_name:actorName}});
        }
        if(problems.length&&!inserts.length&&!updates.length)throw new Error(`Nothing saved. ${problems.slice(0,4).join('; ')}${problems.length>4?` + ${problems.length-4} more`:''}. Press Reload and try again.`);
        if(inserts.length){const {error}=await client.from('duty_assignments').insert(inserts);if(error)throw error}
        for(let i=0;i<updates.length;i+=10){
          const res=await Promise.all(updates.slice(i,i+10).map(u=>client.from('duty_assignments').update(u.patch).eq('id',u.id)));
          const bad=res.find(r=>r.error);if(bad)throw bad.error;
        }
        writeAuditEvent('Duty Roster Saved','Duty Assignment',null,{from:start,to:end,added:inserts.length,changed:updates.length,skipped:problems.length,past_days_filled:pastKeys.length,past_reason:pastReason||undefined},'Success');
        setDraft({});
        showSamaraActionToast(problems.length?'warning':'success',problems.length?'Roster saved with skips':'Roster saved',
          `${inserts.length} added, ${updates.length} changed.${problems.length?` Skipped: ${problems.slice(0,3).join('; ')}${problems.length>3?' …':''}.`:''} Staff see the changes in My Duty and acknowledge as usual.`);
        await load();
      }catch(err){showSamaraActionToast('error','Roster not saved',err.message||'Unable to save the roster.')}
      finally{setBusy(false)}
    }

    // ---- render ----
    const label=code=>({D:'Day',N:'Night',O:'OFF',A:'ABSENT',X:'Other',M:'2×'}[code]||'');
    const groups=[];let lastDept=null;
    scope.forEach(s=>{const d=profile?.role==='Admin'?(employeeDepartment(s)||'Other'):'';if(d!==lastDept){groups.push({dept:d,staff:[]});lastDept=d}groups[groups.length-1].staff.push(s)});
    const coverage=date=>{let D=0,N=0;scope.forEach(s=>{const c=cellInfo(s,date);if(c.onLeave)return;if(c.value==='D')D++;else if(c.value==='N')N++});return {D,N}};
    const short=(date,cov)=>(Number(minCover.D)>0&&cov.D<Number(minCover.D))||(Number(minCover.N)>0&&cov.N<Number(minCover.N));
    const move=dir=>{if(dirtyCount&&!window.confirm('You have unsaved roster changes. Discard them?'))return;setDraft({});setStart(addDays(start,dir*days))};
    const setPeriod=n=>{if(n===days)return;if(dirtyCount&&!window.confirm('You have unsaved roster changes. Discard them?'))return;setDraft({});setDays(n)};

    return h(Section,{title:'Duty Roster',subtitle:nursingManager&&profile?.role!=='Admin'?'Nursing staff · tap a cell: Day → Night → Off → Absent → empty. Press Save roster when done.':'All staff · tap a cell: Day → Night → Off → Absent → empty. Press Save roster when done.'},
      h('div',{className:'rg-bar'},
        h('div',{role:'group','aria-label':'Period length',style:{display:'flex',gap:'4px'}},
          [7,30].map(n=>h('button',{key:n,type:'button',className:`btn ${days===n?'btn-primary':'btn-secondary'}`,'aria-pressed':days===n,disabled:n===30&&narrow,title:n===30&&narrow?'30 days needs a wider screen (computer or tablet)':undefined,onClick:()=>setPeriod(n)},`${n} days`))),
        h('button',{type:'button',className:'btn btn-secondary','aria-label':'Previous period',onClick:()=>move(-1)},'‹'),
        h('label',{'data-no-draft':'',style:{display:'flex',alignItems:'center',gap:'5px',fontSize:'12px',color:'#725d68'}},'From',h(StrictDateInput,{value:startDraft,onChange:e=>setStartDraft(e.target.value)})),
        startDraft&&startDraft!==start?h('button',{type:'button',className:'btn btn-primary',onClick:()=>{if(dirtyCount&&!window.confirm('You have unsaved roster changes. Discard them?'))return;setDraft({});setStart(startDraft)}},'Apply'):null,
        h('button',{type:'button',className:'btn btn-secondary','aria-label':'Next period',onClick:()=>move(1)},'›'),
        h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{if(dirtyCount&&!window.confirm('You have unsaved roster changes. Discard them?'))return;setDraft({});setStart(monday(today))}},'This week'),
        h('button',{type:'button',className:`btn ${pastMode?'btn-primary':'btn-secondary'}`,'aria-pressed':pastMode,title:'Fill empty past days that were missed (Payroll uses the roster)',
          onClick:()=>{if(pastMode&&Object.keys(draft).some(k=>k.split('|')[1]<today)){if(!window.confirm('Discard the unsaved past-day changes?'))return;setDraft(d=>{const n={};Object.entries(d).forEach(([k,v])=>{if(k.split('|')[1]>=today)n[k]=v});return n})}setPastMode(!pastMode)}},pastMode?'✓ Filling missed past days':'✎ Fill missed past days'),
        h('span',{className:'rg-spacer'}),
        // 2.16.6: Save is always visible (greyed until something changes)
        h('button',{type:'button',className:'btn btn-primary',disabled:busy||!dirtyCount,title:dirtyCount?'Save all changes':'Tap cells first — nothing to save yet',onClick:save},busy?'Saving…':dirtyCount?`Save roster (${dirtyCount})`:'Save roster'),
        h('input',{value:search,onChange:e=>setSearch(e.target.value),placeholder:'Search staff…',style:{maxWidth:'180px'}}),
        h('button',{type:'button',className:'btn btn-secondary',disabled:busy||loading,title:`Fill empty cells from the previous ${days} days`,onClick:copyPrevious},'Copy previous period'),
        h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>{if(dirtyCount&&!window.confirm('Reload and discard unsaved changes?'))return;setDraft({});load()}},'Reload')),
      pastMode&&h('div',{className:'notice',style:{margin:'8px 0'}},'Filling missed past days: EMPTY past cells can be tapped (Day / Night / Off / Absent). A saved past Day / Night can be changed to Absent (red) if the staff did not come — loss of pay in Payroll. Other saved past entries cannot be changed here. Use ‹ or the From date to go back to last month. You will be asked for the reason when you save.'),
      h('div',{className:'rg-legend'},
        h('span',null,h('b',{className:'rg-D',style:{padding:'2px 6px',borderRadius:'6px'}},'Day'),'7 AM–7 PM'),
        h('span',null,h('b',{className:'rg-N',style:{padding:'2px 6px',borderRadius:'6px'}},'Night'),'7 PM–7 AM'),
        h('span',null,h('b',{className:'rg-O',style:{padding:'2px 6px',borderRadius:'6px'}},'OFF'),'Weekly off (any day)'),
        h('span',null,h('b',{className:'rg-A',style:{padding:'2px 6px',borderRadius:'6px'}},'ABSENT'),'Did not come · loss of pay'),
        h('span',null,h('b',{className:'rg-L',style:{padding:'2px 6px',borderRadius:'6px'}},'LEAVE 🔒'),'Approved leave'),
        h('span',null,'30 days / phone: D = Day · N = Night · O = Off · A = Absent · L = Leave'),
        h('span',null,'Biometric: In 07:02 · Out 19:05 = punch times · “Came 20 min late” / “Left 1 hr early” (more than 15 min from 7 AM / 7 PM) · No out punch · ✗ No punch (rostered, did not punch) · auto = marked Absent by the machine check (no punch, no approved leave) · ⚑ Punched without a Day / Night duty'),
        h('span',null,'⚠ Leave pending · P Permission (time on hover) · ½L Half-day leave (½ worked + ½ leave) · ✓ Acknowledged by staff · Other = Morning / Evening / General (from the list)'),
        h('span',{'data-no-draft':'',style:{marginLeft:'auto',display:'inline-flex',gap:'6px',alignItems:'center'}},'Minimum per shift: Day', // 2.19.76: period / minimum boxes are settings, not an entry — no 'unsaved entry' reminder
          h('input',{type:'number',min:0,value:minCover.D||'',onChange:e=>setMinCover({...minCover,D:e.target.value}),style:{width:'52px',padding:'2px 4px'}}),'Night',
          h('input',{type:'number',min:0,value:minCover.N||'',onChange:e=>setMinCover({...minCover,N:e.target.value}),style:{width:'52px',padding:'2px 4px'}}))),
      error?h('div',{className:'message error'},error):null,
      loading&&!staff.length?h('p',{className:'empty'},'Loading roster…'):
      h('div',{className:'rg-wrap'},h('table',{className:`rg-table ${days>7?'rg-compact':''}`},
        h('colgroup',null,h('col',{className:'rg-c-name'}),dates.map(d=>h('col',{key:d})),h('col',{className:'rg-c-total'})),
        h('thead',null,h('tr',null,
          h('th',{className:'rg-name'},`Staff (${scope.length})`),
          dates.map(date=>h('th',{key:date,className:date===today?'rg-today':'',title:formatDateIN(date)},h('span',{className:'rg-l'},DAY_NAMES[parse(date).getUTCDay()]),h('span',{className:'rg-s'},DAY_NAMES[parse(date).getUTCDay()].slice(0,2)),h('small',null,h('span',{className:'rg-l'},formatDateIN(date).slice(0,5)),h('span',{className:'rg-s'},formatDateIN(date).slice(0,2))))),
          h('th',{title:'Days / Nights / Offs / Absent in this period'},'D/N/O/A'))),
        h('tbody',null,
          groups.map(g=>[
            g.dept?h('tr',{key:`g-${g.dept}`,className:'rg-group'},h('td',{colSpan:dates.length+2},g.dept)):null,
            ...g.staff.map(s=>{
              let D=0,N=0,O=0,A=0;
              const cells=dates.map(date=>{
                const c=cellInfo(s,date);
                if(c.value==='D')D++;else if(c.value==='N')N++;else if(c.value==='O')O++;else if(c.value==='A')A++;
                const ack=c.existing.length===1&&c.existing[0].status==='Acknowledged'&&!c.changed;
                const code=c.onLeave?'L':c.saved==='MULTI'?'M':c.value;
                const ai=c.changed?null:attInfo(s,date,c.onLeave?'L':c.value);
                const title=c.preJoin?`Not yet joined — joined on ${formatDateIN(joinOf(s))}`:c.onLeave?`Approved leave (${c.lv.leave_type||'Leave'})`:c.saved==='MULTI'?'More than one duty on this day — fix it in the List tab':c.pastAbsent?'Past day: tap to change Day / Night / Absent (reason asked on save)':date<today?`Past date (view only)${c.lv?` · ${lvTitle(c.lv)}`:''}`:c.lv?`${lvTitle(c.lv)} · Tap: Day → Night → Off → Absent → empty`:'Tap: Day → Night → Off → Absent → empty';
                return h('td',{key:date},h('button',{type:'button',className:`rg-cell ${code?`rg-${code}`:''} ${c.preJoin?'rg-prejoin':''} ${!c.onLeave&&isHalfLeave(c.lv)&&c.lv.status==='approved'?'rg-half':''} ${date<today?'rg-past':''} ${c.changed?'rg-changed':''} ${ai?.kind==='extra'?'rg-extra':ai?.kind==='absent'?'rg-noshow':''}`,disabled:c.locked||busy,title:ai?undefined:title,'data-hover-info':ai?ai.title:undefined,'aria-label':`${formalName(s)} ${formatDateIN(date)}: ${c.onLeave?'leave':label(c.value)||'empty'}`,onClick:()=>tap(s,date)},
                  c.joinDay?h('span',{className:'rg-join',title:`Joined on ${formatDateIN(date)}`},'Joined'):null,
                  !c.onLeave&&c.lv?h('span',{className:`rg-flag ${isHalfLeave(c.lv)&&c.lv.status==='approved'?'rg-flag-half':''}`},flagOf(c.lv)):null,
                  ack?h('span',{className:'rg-ack'},'✓'):null,
                  c.onLeave?h(React.Fragment,null,h('span',{className:'rg-l'},'LEAVE'),h('span',{className:'rg-s'},'L')):c.saved==='MULTI'?'2×':h(React.Fragment,null,h('span',{className:'rg-l'},label(c.value)),h('span',{className:'rg-s'},({D:'D',N:'N',O:'O',A:'A',X:'•'})[c.value]||'')),
                  c.value==='X'&&!c.changed&&c.existing[0]?h('small',{className:'rg-l'},String(c.existing[0].shift||'').split(' ')[0]):null,
                  ai?h(React.Fragment,null,h('span',{className:`rg-att rg-att-${ai.kind}`},h('span',{className:'rg-l'},ai.text),h('span',{className:'rg-s'},ai.short)),ai.flags?ai.flags.split(' · ').map((f,i)=>h('span',{key:i,className:'rg-att rg-att-warn rg-att-wrap rg-l'},f)):null):null));
              });
              return h('tr',{key:s.id},
                h('td',{className:'rg-name'},formalName(s),h('small',null,[s.designation,s.employee_id].filter(Boolean).join(' · ')),
                  joinOf(s)>=start&&joinOf(s)<=end?h('small',{style:{display:'block',color:'#0b7a4b',fontWeight:800}},`Joined ${formatDateIN(joinOf(s))}${s.date_of_joining?'':' (added to ERP — enter Date of Joining in HR)'}`):null,
                  h('span',{style:{display:'flex',gap:'3px',marginTop:'3px'}},
                    h('button',{type:'button',className:'btn btn-secondary',style:{padding:'1px 6px',fontSize:'10px'},title:'Set every open day in this period to Day',onClick:()=>fillRow(s,'D')},'All Day'),
                    h('button',{type:'button',className:'btn btn-secondary',style:{padding:'1px 6px',fontSize:'10px'},title:'Set every open day in this period to Night',onClick:()=>fillRow(s,'N')},'All Night'))),
                cells,
                h('td',{className:'rg-total'},`${D}/${N}/${O}/${A}`));
            })
          ]),
          h('tr',{className:'rg-cov'},
            h('td',{className:'rg-name'},'On duty (Day · Night)'),
            dates.map(date=>{const cov=coverage(date);return h('td',{key:date,className:short(date,cov)?'rg-short':'',title:short(date,cov)?'Below the minimum per shift':''},`${cov.D}·${cov.N}`)}),
            h('td',null,'')),
          h('tr',{className:'rg-att-row'},
            h('td',{className:'rg-name'},'Present by biometric (Day · Night)'),
            dates.map(date=>{
              if(date>today)return h('td',{key:date},'');
              let rD=0,pD=0,rN=0,pN=0,x=0;
              scope.forEach(s=>{const c=cellInfo(s,date);if(c.onLeave)return;const ai=attInfo(s,date,c.value);
                if(c.value==='D'){rD++;if(ai?.present)pD++}else if(c.value==='N'){rN++;if(ai?.present)pN++}else if(ai?.kind==='extra')x++;});
              return h('td',{key:date,title:`Day: ${pD} of ${rD} rostered punched · Night: ${pN} of ${rN} rostered punched${x?` · ${x} punched without a Day / Night duty`:''}`},
                date>today?'':h(React.Fragment,null,h('span',{className:'rg-l'},`D ${pD}/${rD} · N ${pN}/${rN}${x?` · ⚑${x}`:''}`),h('span',{className:'rg-s'},`${pD+pN}/${rD+rN}`)));
            }),
            h('td',null,''))))),
      h('div',{className:'rg-unsaved',role:'status',style:dirtyCount?undefined:{borderColor:'#ead7e1',background:'#fff'}},
        h('strong',{style:{color:dirtyCount?'#790c44':'#7b6871'}},dirtyCount?`${dirtyCount} unsaved change${dirtyCount===1?'':'s'}`:'No changes yet — tap cells to plan, then Save roster'),
        h('button',{type:'button',className:'btn btn-secondary',disabled:busy||!dirtyCount,onClick:()=>setDraft({})},'Discard'),
        h('button',{type:'button',className:'btn btn-primary',disabled:busy||!dirtyCount,onClick:save},busy?'Saving…':'Save roster')),
      h('p',{className:'small-note',style:{marginTop:'8px'}},'Past dates are view only (use ✎ Fill missed past days to add a missed day or mark Absent). Staff on approved leave are locked (mark Back on Duty in Staff Leave Calendar to roster them). Changing a shift a staff member already acknowledged asks them to acknowledge again. Patient, ward and task details can still be added from the List tab.'),
      h('div',{className:'rg-roster-end','aria-hidden':'true'}));
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
        h('button',{type:'button',role:'tab','aria-selected':view==='list',className:`btn ${view==='list'?'btn-primary':'btn-secondary'}`,onClick:()=>setView('list')},'Duty list'),
        h('button',{type:'button',role:'tab','aria-selected':view==='guests',className:`btn ${view==='guests'?'btn-primary':'btn-secondary'}`,onClick:()=>setView('guests')},'Guests ↔ Nurses')),
      // 2.16.3: in the Duty list, "Assign Duty" opens the Roster grid (the long weekly form is no longer used here)
      view==='guests'?h(GuestNurseAssignment,{profile}):view==='grid'?h(DutyRosterGrid,{profile}):h(DutyAssignment,{profile,viewMode,onOpenGrid:()=>setView('grid')}));
  }
