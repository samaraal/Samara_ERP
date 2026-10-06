  // 2.15.71: "On Duty Today" — quick view from the top bar (Admin, Manager, STD): who is on duty now, today's
  // duty by shift, weekly off and approved leave / permission today, with tap-to-call mobile numbers.
  // Reads the same Duty Assignment and leave records as the Duty Assignment page (no SQL needed).
  function odtShiftWindow(shift){
    const m=/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*[–-]\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i.exec(String(shift||''));
    if(!m)return null;
    const mins=(h,mm,ap)=>((Number(h)%12)+(/pm/i.test(ap)?12:0))*60+Number(mm||0);
    return {start:mins(m[1],m[2],m[3]),end:mins(m[4],m[5],m[6])};
  }
  function odtShiftGroup(shift){
    const s=String(shift||'');
    if(/^day/i.test(s))return 'Day Shift (7 AM–7 PM)';
    if(/^night/i.test(s))return 'Night Shift (7 PM–7 AM)';
    if(/^morning/i.test(s))return 'Morning Shift (7 AM–2 PM)';
    if(/^evening/i.test(s))return 'Evening Shift (1 PM–7 PM)';
    if(/^general/i.test(s))return 'General Shift (9 AM–6 PM)';
    return s||'Shift not set';
  }
  const ODT_ORDER=['Day Shift (7 AM–7 PM)','Night Shift (7 PM–7 AM)','Morning Shift (7 AM–2 PM)','Evening Shift (1 PM–7 PM)','General Shift (9 AM–6 PM)'];
  function odtNowIndia(){const d=new Date(Date.now()+19800000);return {date:d.toISOString().slice(0,10),mins:d.getUTCHours()*60+d.getUTCMinutes()}}
  function odtAddDays(iso,n){const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}

  function OnDutyToday({profile}){
    const allowed=['Admin','Manager','STD'].some(r=>hasDutyRole(profile,r));
    const [open,setOpen]=React.useState(false),[data,setData]=React.useState(null),[err,setErr]=React.useState(''),[dept,setDept]=React.useState('All'),[day,setDay]=React.useState('');
    async function load(target){
      setErr('');setData(null);
      try{
        const now=odtNowIndia(),date=target||now.date,prev=odtAddDays(date,-1);
        const pages=async q=>{const out=[];for(let o=0;;o+=500){const r=await q().range(o,o+499);if(r.error)throw r.error;out.push(...(r.data||[]));if((r.data||[]).length<500)return out}};
        const [duty,staff,leave]=await Promise.all([
          pages(()=>client.from('duty_assignments').select('*').gte('duty_date',prev).lte('duty_date',date).order('id')),
          pages(()=>client.from('profiles').select('id,title,full_name,role,department,designation,mobile,is_active').order('id')),
          pages(()=>client.from('absence_requests').select('*').eq('status','approved').lte('from_date',date).gte('to_date',date).order('id'))
        ]);
        setData({date,now,duty,staff:staff.filter(s=>s.is_active!==false),leave,today:date===now.date});
      }catch(e){setErr(e.message||'Unable to load duty.')}
    }
    function show(){setOpen(true);setDept('All');const d=odtNowIndia().date;setDay(d);load(d)}
    function move(n){const d=odtAddDays(day||odtNowIndia().date,n);setDay(d);load(d)}
    React.useEffect(()=>{if(!open)return;const k=e=>{if(e.key==='Escape')setOpen(false)};window.addEventListener('keydown',k);return()=>window.removeEventListener('keydown',k)},[open]);
    if(!allowed)return null;
    const button=h('button',{type:'button',className:'odt-top-button',onClick:show,title:'Who is on duty today','aria-label':'On Duty Today'},'👥 ',h('span',null,'On Duty Today'));
    if(!open)return button;

    let body=null;
    if(err)body=h('div',{className:'message error'},err);
    else if(!data)body=h('div',{className:'stores-view-only',style:{padding:'20px',textAlign:'center'}},'Loading…');
    else{
      const byId={};data.staff.forEach(s=>{byId[s.id]=s});
      const onLeave=new Map();
      data.leave.filter(l=>!(l.return_to_duty_date&&String(l.return_to_duty_date).slice(0,10)<=data.date)).forEach(l=>onLeave.set(l.employee_id,l));
      const todays=data.duty.filter(d=>String(d.duty_date).slice(0,10)===data.date&&byId[d.employee_id]);
      // Last night's Night Shift is still on duty until 7 AM today.
      const carry=data.today?data.duty.filter(d=>String(d.duty_date).slice(0,10)!==data.date&&byId[d.employee_id]&&/^night/i.test(d.shift||'')&&!d.is_weekly_off&&d.status!=='Weekly Off'):[];
      const isOff=d=>d.is_weekly_off||d.status==='Weekly Off';
      const working=todays.filter(d=>!isOff(d)&&!onLeave.has(d.employee_id));
      const weeklyOff=todays.filter(isOff);
      const leaveToday=[...onLeave.values()].filter(l=>byId[l.employee_id]);
      const nowOn=d=>{
        if(!data.today)return false;
        const w=odtShiftWindow(d.shift);if(!w)return false;const m=data.now.mins;
        if(String(d.duty_date).slice(0,10)!==data.date)return w.end<w.start&&m<w.end; // yesterday's night shift
        return w.end>w.start?(m>=w.start&&m<w.end):(m>=w.start);
      };
      const depts=['All',...[...new Set([...working,...weeklyOff].map(d=>byId[d.employee_id]?.department).filter(Boolean))].sort()];
      const deptOk=id=>dept==='All'||byId[id]?.department===dept;
      const onNow=[...carry,...working].filter(nowOn).filter(d=>deptOk(d.employee_id));
      const seen=new Set();const onNowUnique=onNow.filter(d=>!seen.has(d.employee_id)&&seen.add(d.employee_id));
      const person=(d,extra)=>{const s=byId[d.employee_id||d]||{};const phone=String(s.mobile||'').replace(/[^\d+]/g,'');
        return h('div',{key:(d.id||d)+(extra||''),className:'odt-person'},
          h('div',null,h('strong',{'data-no-translate':'true'},[s.title,s.full_name].filter(Boolean).join(' ')||'Staff'),
            h('small',null,[s.designation||s.role,s.department].filter(Boolean).join(' · ')),
            d.duty_type||d.ward_room||d.duty_task?h('small',{className:'odt-task'},[d.duty_type,d.ward_room,d.duty_task].filter(Boolean).join(' · ')):null,
            extra?h('small',{className:'odt-task'},extra):null),
          phone.replace(/\D/g,'').length>=10?h('a',{className:'btn btn-secondary odt-call',href:`tel:${phone}`,'data-no-translate':'true'},'📞 '+s.mobile):h('small',{className:'odt-nophone'},'No mobile'));
      };
      const groups={};working.filter(d=>deptOk(d.employee_id)).forEach(d=>{const g=odtShiftGroup(d.shift);(groups[g]=groups[g]||[]).push(d)});
      const keys=Object.keys(groups).sort((a,b)=>(ODT_ORDER.indexOf(a)+99)%99-(ODT_ORDER.indexOf(b)+99)%99||a.localeCompare(b));
      const leaveShown=leaveToday.filter(l=>deptOk(l.employee_id)),offShown=weeklyOff.filter(d=>deptOk(d.employee_id));
      body=h(React.Fragment,null,
        h('div',{className:'odt-bar'},
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>move(-1),'aria-label':'Previous day'},'‹'),
          h('strong',null,`${formatDateIN(data.date)}${data.today?' · Today':''}`),
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>move(1),'aria-label':'Next day'},'›'),
          !data.today&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{const d=odtNowIndia().date;setDay(d);load(d)}},'Today')),
        depts.length>2&&h('div',{className:'stores-mode-switch',role:'tablist',style:{margin:'8px 0'}},depts.map(x=>h('button',{key:x,type:'button',role:'tab','aria-selected':dept===x,className:dept===x?'active':'',onClick:()=>setDept(x)},x==='All'?'All':x))),
        data.today&&h('section',{className:'odt-section odt-now'},h('h4',null,`On duty now (${onNowUnique.length})`),
          onNowUnique.length?onNowUnique.map(d=>person(d,odtShiftGroup(d.shift)+(String(d.duty_date).slice(0,10)!==data.date?' · until 7 AM':''))):h('p',{className:'small-note'},'Nobody is marked on duty at this time.')),
        keys.length?keys.map(g=>h('section',{key:g,className:'odt-section'},h('h4',null,`${g} (${groups[g].length})`),groups[g].map(d=>person(d)))):h('p',{className:'small-note'},'No duty assigned for this day.'),
        offShown.length?h('section',{className:'odt-section odt-muted'},h('h4',null,`Weekly off (${offShown.length})`),offShown.map(d=>person(d))):null,
        leaveShown.length?h('section',{className:'odt-section odt-muted'},h('h4',null,`On leave / permission (${leaveShown.length})`),leaveShown.map(l=>person(l.employee_id,`${l.request_type||'Leave'}${l.leave_type?` · ${l.leave_type}`:''} · ${formatDateIN(l.from_date)}${l.to_date&&l.to_date!==l.from_date?` – ${formatDateIN(l.to_date)}`:''}`))):null,
        h('small',{className:'small-note'},'From Duty Assignment and approved Leave / Permission. Staff on approved leave are not counted as on duty.')
      );
    }
    return h(React.Fragment,null,button,
      h('div',{className:'modal-backdrop row-detail-backdrop',onClick:e=>{if(e.target===e.currentTarget)setOpen(false)}},
        h('div',{className:'card modal row-detail-modal odt-modal',role:'dialog','aria-modal':'true'},
          h('div',{className:'panel-head'},h('div',null,h('h3',null,'On Duty Today'),h('small',null,'Who is working, on weekly off or on leave')),
            h('div',{style:{display:'flex',gap:'8px'}},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>load(day)},'↻ Refresh'),h('button',{type:'button',className:'close',onClick:()=>setOpen(false),'aria-label':'Close'},'×'))),
          body,
          h('div',{className:'modal-bottom-actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setOpen(false)},'Close')))));
  }
  ;(function(){
    if(document.getElementById('odt-css'))return;
    const st=document.createElement('style');st.id='odt-css';
    st.textContent=`
      .odt-top-button{border:1px solid #e7acc8;background:#fff;color:#8e1b4f;border-radius:999px;padding:6px 12px;font-weight:700;cursor:pointer;white-space:nowrap;flex:0 0 auto}
      .odt-top-button:hover{background:#fdeef5}
      @media(max-width:760px){.odt-top-button span{display:none}}
      .odt-modal{max-width:760px}
      .odt-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:6px 0}
      .odt-section{margin:12px 0}
      .odt-section h4{margin:0 0 6px;color:#791346}
      .odt-person{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 12px;border:1px solid #f0d6e3;border-radius:12px;margin:6px 0;background:#fff;flex-wrap:wrap}
      .odt-person small{display:block;color:#725d68}
      .odt-person .odt-task{color:#5b2a9a}
      .odt-now .odt-person{border-color:#9fd8b4;background:#f3fbf6}
      .odt-muted .odt-person{opacity:.8;background:#fafafa}
      .odt-call{white-space:nowrap}
      .odt-nophone{color:#a08a95}
    `;
    document.head.appendChild(st);
  })();
