  // 2.15.1: Admission Register — every admission (active and discharged), with period filter + Apply,
  // quick status filters, search, and full details per row. "Open Patient Card" opens that resident's card.
  function AdmissionRegister({profile,onNavigate}){
    const [rows,setRows]=React.useState(null),[discharges,setDischarges]=React.useState([]),[detail,setDetail]=React.useState(null);
    const [status,setStatus]=React.useState('All'),[search,setSearch]=React.useState('');
    const [period,setPeriod]=React.useState('month'),[from,setFrom]=React.useState(''),[to,setTo]=React.useState('');
    const pa=useAppliedFilters({period,from,to});const PA=pa.applied;
    React.useEffect(()=>{(async()=>{
      const [p,d]=await Promise.all([
        client.from('patients').select('*').order('admission_date',{ascending:false}),
        client.from('patient_discharges').select('*')
      ]);
      setRows(p.error?[]:(p.data||[]));if(!d.error)setDischarges(d.data||[]);
    })()},[]);
    const today=todayISOIndia();
    const bounds=(()=>{
      if(PA.period==='today')return [today,today];
      if(PA.period==='week')return [mondayOfWeek(today),today];
      if(PA.period==='lastmonth'){const d=new Date(`${today.slice(0,8)}01T12:00:00`);d.setMonth(d.getMonth()-1);const f=d.toISOString().slice(0,10);const e=new Date(`${today.slice(0,8)}01T12:00:00`);e.setDate(0);return [f,e.toISOString().slice(0,10)]}
      if(PA.period==='year')return [today.slice(0,4)+'-01-01',today];
      if(PA.period==='all')return ['0000-01-01','9999-12-31'];
      if(PA.period==='custom')return [PA.from||today,PA.to||today];
      return [today.slice(0,8)+'01',today];
    })();
    const dischargeOf=p=>discharges.filter(d=>String(d.patient_id)===String(p.id)).sort((a,b)=>String(b.discharge_date||b.created_at||'').localeCompare(String(a.discharge_date||a.created_at||'')))[0]||null;
    const consentPending=p=>/awaiting|pending/i.test(String(p.admission_consent_status||''));
    const stateOf=p=>p.is_active?'Active':(dischargeOf(p)||/discharg/i.test(String(p.admission_status||''))?'Discharged':(p.admission_status||'Inactive'));
    const list=(rows||[]).filter(p=>p.admission_date);
    const inPeriod=list.filter(p=>String(p.admission_date).slice(0,10)>=bounds[0]&&String(p.admission_date).slice(0,10)<=bounds[1]);
    const q=search.trim().toLowerCase();
    const shown=inPeriod.filter(p=>(status==='All'||(status==='Consent pending'?consentPending(p):stateOf(p)===status))&&(q.length<2||[p.patient_id,p.title,p.full_name,p.room_no,p.admission_type,p.patient_category,p.mobile].join(' ').toLowerCase().includes(q)));
    const counts={all:inPeriod.length,active:inPeriod.filter(p=>stateOf(p)==='Active').length,discharged:inPeriod.filter(p=>stateOf(p)==='Discharged').length,consent:inPeriod.filter(consentPending).length};
    function openCard(p){try{sessionStorage.setItem('samara-open-patient-id',p.id)}catch(_){}if(typeof onNavigate==='function')onNavigate('Patients')}
    function details(p){
      const d=dischargeOf(p);
      return {title:formalName(p)||p.full_name,subtitle:`${p.patient_id||''} · Admitted ${formatDateIN(p.admission_date)}`,patient:p,fields:[
        ['Resident ID',p.patient_id],['Name',formalName(p)||p.full_name],['Gender / Age',[p.gender,p.age].filter(Boolean).join(' / ')],
        ['Admission date',formatDateIN(p.admission_date)],['Admission time',p.admission_time],['Admission type',p.admission_type],['Category',p.patient_category],
        ['Room / Bed',[p.room_no,p.bed_no].filter(Boolean).join(' / ')],['Status',stateOf(p)],['Consent',p.admission_consent_status],
        ['Hospital / Source',p.hospital_name||p.referral_source],['Treating doctor',p.treating_doctor],['Care package',p.billing_package],['Package ends',p.package_end_date?formatDateIN(p.package_end_date):''],
        ['Mobile',p.mobile],['Attendant',[p.attendant_name,p.attendant_phone].filter(Boolean).join(' · ')],
        ['Discharge date',d?.discharge_date?formatDateIN(d.discharge_date):''],['Discharge type',d?.discharge_type],['Discharge status',d?.status],
        ['Record created',p.created_at?formatDateTimeIN(p.created_at):'']]};
    }
    const chip=(k,label,n)=>h('button',{key:k,type:'button',role:'tab','aria-selected':status===k,className:status===k?'active':'',onClick:()=>setStatus(k)},`${label} (${n})`);
    return h('div',null,
      detail&&h(RowDetailModal,{title:detail.title,subtitle:detail.subtitle,fields:detail.fields,onClose:()=>setDetail(null)},
        h('div',{className:'equip-actions'},h('button',{type:'button',className:'btn btn-primary',onClick:()=>openCard(detail.patient)},'Open Patient Card'))),
      h('div',{className:'stores-dash'},h(DashboardHero,{kicker:'ADMISSION',title:'Admission Register',blurb:'Every admission — active and discharged — with type, room, consent and discharge. Tap a row for full details or to open the Patient Card.'})),
      h(Section,{title:`Admissions · ${PA.period==='all'?'All dates':`${formatDateIN(bounds[0])} – ${formatDateIN(bounds[1])}`}`,subtitle:`${shown.length} shown`},
        h('div',{className:'cm-period-bar'},
          h('div',{className:'field'},h('label',null,'Admission period'),h('select',{value:period,onChange:e=>setPeriod(e.target.value)},[['today','Today'],['week','This Week'],['month','This Month'],['lastmonth','Last Month'],['year','This Year'],['all','All Admissions'],['custom','Custom Date Range']].map(([v,l])=>h('option',{key:v,value:v},l)))),
          period==='custom'&&h('div',{className:'field'},h('label',null,'From'),h(StrictDateInput,{value:from,onChange:e=>setFrom(e.target.value)})),
          period==='custom'&&h('div',{className:'field'},h('label',null,'To'),h(StrictDateInput,{value:to,onChange:e=>setTo(e.target.value)})),
          h(ApplyFilterButton,{dirty:pa.dirty,onApply:pa.apply}),
          h('div',{className:'field',style:{flex:'1 1 220px'}},h('label',null,'Search'),h('input',{type:'search',value:search,onChange:e=>setSearch(e.target.value),placeholder:'Name, Resident ID, room, type'}))
        ),
        h('div',{className:'stores-mode-switch',role:'tablist',style:{marginBottom:'12px'}},chip('All','All',counts.all),chip('Active','Active',counts.active),chip('Discharged','Discharged',counts.discharged),chip('Consent pending','Consent pending',counts.consent)),
        rows===null?h('div',{className:'stores-view-only',style:{padding:'20px',textAlign:'center'}},'Loading…'):
        shown.length?h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Admitted','Resident ID','Name','Type','Category','Room / Bed','Status','Consent','Discharged'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,shown.map(p=>{const d=dischargeOf(p);return h('tr',{key:p.id,className:'row-clickable',onClick:()=>setDetail(details(p))},
            h('td',null,formatDateIN(p.admission_date)),h('td',null,p.patient_id||'—'),h('td',null,h('strong',null,formalName(p)||p.full_name)),
            h('td',null,p.admission_type||'—'),h('td',null,p.patient_category||'—'),h('td',null,[p.room_no,p.bed_no].filter(Boolean).join(' / ')||'—'),
            h('td',null,h('span',{className:'equip-pill',style:{background:stateOf(p)==='Active'?'#e7f6ef':stateOf(p)==='Discharged'?'#eef1f0':'#fff1d6'}},stateOf(p))),
            h('td',null,consentPending(p)?h('span',{className:'unit-warn'},p.admission_consent_status):(p.admission_consent_status||'—')),
            h('td',null,d?.discharge_date?formatDateIN(d.discharge_date):'—'))}))
        )):h('div',{className:'stores-view-only',style:{padding:'20px',textAlign:'center'}},'No admissions in this period / filter.')
      )
    );
  }
