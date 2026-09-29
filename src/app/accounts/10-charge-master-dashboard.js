  // 2.14.99: Charge Master — one dashboard per category (sidebar → CHARGE MASTER → category), same pattern as
  // Pharmacy & Stores: navigable boxes → one section at a time, "← Back to Dashboard" / Close, period filter with
  // Apply, and every charge row opens its full details (resident, raised by, when, amount, approval).
  // Items, codes and rates are still edited with the existing Charge Master screen (ChargeMasterPage), shown one
  // section at a time, so there is ONE place where rates are kept.
  function cmPeriodBounds(f){
    const today=todayISOIndia();
    if(f.period==='today')return [today,today];
    if(f.period==='week')return [mondayOfWeek(today),today];
    if(f.period==='lastmonth'){const d=new Date(`${today.slice(0,8)}01T12:00:00`);d.setMonth(d.getMonth()-1);const from=d.toISOString().slice(0,10);const e=new Date(`${today.slice(0,8)}01T12:00:00`);e.setDate(0);return [from,e.toISOString().slice(0,10)]}
    if(f.period==='custom')return [f.from||today,f.to||today];
    return [today.slice(0,8)+'01',today];
  }
  const cmMoney=v=>`₹${Number(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  function ChargeMasterDashboard({profile,category,onNavigate}){
    const {view,openView,backToDashboard}=useDashboardView();
    const storesMode=category==='Stores Item Rates';
    const [summary,setSummary]=React.useState(null),[refreshKey,setRefreshKey]=React.useState(0);
    const [charges,setCharges]=React.useState(null),[patients,setPatients]=React.useState([]),[equipment,setEquipment]=React.useState([]);
    const [detail,setDetail]=React.useState(null);
    const [period,setPeriod]=React.useState('month'),[from,setFrom]=React.useState(''),[to,setTo]=React.useState('');
    const periodApply=useAppliedFilters({period,from,to});const PA=periodApply.applied;
    async function load(){
      let q=client.from('bill_charge_requests').select('*').order('created_at',{ascending:false}).limit(3000);
      q=storesMode?q.in('category',STORE_CHARGE_CATEGORIES):q.eq('category',category);
      const [c,p,e]=await Promise.all([
        q,
        client.from('patients').select('id,title,full_name,patient_id,room_no,bed_no').limit(2000),
        category==='Biomedical Equipment'?client.from('biomedical_equipment').select('id,asset_no,equipment_name,charge_code,charge_service_name,status,current_patient_id,issued_at'):Promise.resolve({data:[]})
      ]);
      setCharges(c.error?[]:(c.data||[]));if(!p.error)setPatients(p.data||[]);if(!e.error)setEquipment(e.data||[]);
    }
    React.useEffect(()=>{load()},[refreshKey]);
    const patientText=id=>{const x=patients.find(p=>String(p.id)===String(id));return x?[formalName(x)||x.full_name,x.patient_id&&`(${x.patient_id})`,x.room_no&&`Room ${x.room_no}${x.bed_no?'/'+x.bed_no:''}`].filter(Boolean).join(' · '):'—'};
    const [pFrom,pTo]=cmPeriodBounds(PA);
    const dayOf=r=>String(r.charge_date||r.raised_at||r.created_at||'').slice(0,10);
    const list=charges||[];
    const posted=list.filter(r=>['Approved','Partially Approved'].includes(r.approval_status)&&dayOf(r)>=pFrom&&dayOf(r)<=pTo);
    const pending=list.filter(r=>(r.approval_status||'Pending')==='Pending'&&r.status!=='Rejected');
    const s=summary||{};const ready=!!summary&&charges!==null;
    const tiles=[
      {key:'items',icon:'▤',title:'Items & Rates',value:ready?s.active:null,unit:'active items',lines:[storesMode?'Rates of Stores items (edit rate here)':'Add, edit, rate, turn off',`${dashNum(summary?.missing)} without a rate`],alert:Number(s.missing||0)>0},
      {key:'missing',icon:'⚠︎',title:'Rates Not Set',value:ready?s.missing:null,unit:'items',lines:['Cannot be approved by Accounts until a rate is set'],alert:Number(s.missing||0)>0},
      {key:'inactive',icon:'⏻',title:'Inactive Items',value:ready?s.inactive:null,unit:'turned off',lines:['Turn ON → reappears in Bills & Charges at once']},
      ...(!storesMode?[{key:'approval',icon:'✓',title:'Approval Routing',valueText:ready?(s.approvalOn?'ON':'OFF'):'…',unit:s.approvalOn?'Approval Requests':'Bills & Charges',lines:[s.registerControlled?'Always OFF — equipment register controls charges':s.approvalOn?'Nursing Manager approves first':'Raised directly by nurses']}]:[]),
      {key:'charges',icon:'₹',title:'Charges Posted',value:ready?posted.length:null,unit:`this period`,lines:[ready?cmMoney(posted.reduce((n,r)=>n+Number(r.final_amount||r.approved_amount||0),0)):'…',`${formatDateIN(pFrom)} – ${formatDateIN(pTo)}`]},
      {key:'awaiting',icon:'⏳',title:'Awaiting Accounts',value:ready?pending.length:null,unit:'charges',lines:['Raised, not yet approved by Accounts'],warn:pending.length>0},
      ...(category==='Biomedical Equipment'?[{key:'equipment',icon:'⚕︎',title:'Equipment Linked',value:ready?equipment.filter(x=>x.charge_code).length:null,unit:'pieces',lines:[`${equipment.filter(x=>x.status==='In Use').length} in use now`,'Pieces per Charge Master item']}]:[])
    ];
    const viewTitle=(tiles.find(t=>t.key===view)||{}).title||'';
    const cmSection=['items','missing','inactive','approval'].includes(view)?view:'none';
    function chargeDetail(r){
      return {title:`${r.service_name||'Charge'}${r.quantity?` × ${r.quantity}${r.unit?' '+r.unit:''}`:''}`,subtitle:patientText(r.patient_id),fields:[
        ['Resident',patientText(r.patient_id)],['Category',r.category],['Item / service',[r.charge_item_code||r.service_code,r.service_name].filter(Boolean).join(' · ')],
        ['Quantity',r.quantity!=null?`${r.quantity} ${r.unit||''}`:''],['Charge date',r.charge_date?formatDateIN(r.charge_date):''],['Service time',r.service_datetime?formatDateTimeIN(r.service_datetime):''],
        ['Raised by',[r.raised_by_name,r.raised_at?formatDateTimeIN(r.raised_at):''].filter(Boolean).join(' · ')],['Status',[r.status,r.approval_status].filter(Boolean).join(' · ')],
        ['Amount approved',r.final_amount!=null||r.approved_amount!=null?cmMoney(r.final_amount??r.approved_amount):''],
        ['Decided by (Accounts)',[r.decision_by_name,r.decision_date||r.approved_at?formatDateTimeIN(r.decision_date||r.approved_at):''].filter(Boolean).join(' · ')],
        ['Approval remarks',r.approval_remarks],['Bill',[r.bill_number,r.bill_date&&formatDateIN(r.bill_date)].filter(Boolean).join(' · ')],
        ['Description',r.description],['Remarks',r.remarks]]};
    }
    function ChargeRows({rows}){
      return rows.length?h('div',{className:'stores-expiry-list'},rows.map(r=>h('article',{key:r.id,className:'stores-ledger-card row-clickable',onClick:()=>setDetail(chargeDetail(r))},
        h('div',{className:'stores-ledger-card-head'},h('strong',null,`${r.service_name||'Charge'}${r.quantity?` × ${r.quantity}`:''}`),h('span',null,r.charge_date?formatDateIN(r.charge_date):formatDateTimeIN(r.created_at))),
        h('div',{className:'stores-ledger-card-fields'},
          h('div',null,h('small',null,'Resident'),h('strong',null,patientText(r.patient_id))),
          h('div',null,h('small',null,'Raised by'),h('strong',null,r.raised_by_name||'—')),
          h('div',null,h('small',null,'Status'),h('strong',null,r.approval_status||r.status||'—')),
          h('div',null,h('small',null,'Amount'),h('strong',null,r.final_amount!=null||r.approved_amount!=null?cmMoney(r.final_amount??r.approved_amount):'—'))
        )))):h('div',{className:'stores-view-only',style:{padding:'20px',textAlign:'center'}},charges===null?'Loading…':'Nothing in this list.');
    }
    const byCode=React.useMemo(()=>{const m={};equipment.forEach(x=>{const k=x.charge_code||'(not charged)';(m[k]=m[k]||[]).push(x)});return m},[equipment]);
    if(profile?.role!=='Admin')return h(Section,{title:'Charge Master'},h('p',null,'Administrator access only.'));
    return h('div',{className:'stores-dash-wrap'},
      detail&&h(RowDetailModal,{title:detail.title,subtitle:detail.subtitle,fields:detail.fields,onClose:()=>setDetail(null)}),
      !view&&h('div',{className:'stores-dash'},
        h(DashboardHero,{kicker:'CHARGE MASTER',title:category,blurb:storesMode?'Charge rates of Consumables, Pharmacy, Housekeeping and Kitchen items — same item and code as Stores Master, used in Bills & Charges and Accounts approval.':`Items, codes and Admin-fixed rates for ${category}, and the charges raised with them — one source for Bills & Charges, Accounts approval and the Patient Ledger.`,onRefresh:()=>{setSummary(null);setCharges(null);setRefreshKey(k=>k+1)}}),
        h('div',{className:'cm-period-bar'},
          h('div',{className:'field'},h('label',null,'Period (charges)'),h('select',{value:period,onChange:e=>setPeriod(e.target.value)},[['today','Today'],['week','This Week'],['month','This Month'],['lastmonth','Last Month'],['custom','Custom Date Range']].map(([v,l])=>h('option',{key:v,value:v},l)))),
          period==='custom'&&h('div',{className:'field'},h('label',null,'From'),h(StrictDateInput,{value:from,onChange:e=>setFrom(e.target.value)})),
          period==='custom'&&h('div',{className:'field'},h('label',null,'To'),h(StrictDateInput,{value:to,onChange:e=>setTo(e.target.value)})),
          h(ApplyFilterButton,{dirty:periodApply.dirty,onApply:periodApply.apply})
        ),
        h(DashboardTiles,{tiles,onOpen:openView})
      ),
      view&&h(DashboardBackBar,{title:category,viewTitle,onBack:backToDashboard}),
      view==='charges'&&h(Section,{title:`Charges Posted · ${formatDateIN(pFrom)} – ${formatDateIN(pTo)}`,subtitle:`${posted.length} charge(s) · ${cmMoney(posted.reduce((n,r)=>n+Number(r.final_amount||r.approved_amount||0),0))}. Tap a row for full details.`},h(ChargeRows,{rows:posted})),
      view==='awaiting'&&h(Section,{title:'Awaiting Accounts approval',subtitle:'Tap a row for full details.'},h(ChargeRows,{rows:pending})),
      view==='equipment'&&h(Section,{title:'Equipment linked to Charge Master items',subtitle:'Pieces in the Biomedical Equipment register, grouped by their Charge Master code.'},
        Object.keys(byCode).length?h('div',{className:'stores-expiry-list'},Object.keys(byCode).sort().map(code=>h('article',{key:code,className:'stores-ledger-card'},
          h('div',{className:'stores-ledger-card-head'},h('strong',null,code==='(not charged)'?'Not charged to residents':`${code} · ${byCode[code][0].charge_service_name||''}`),h('span',null,`${byCode[code].length} piece(s)`)),
          h('small',null,byCode[code].map(x=>`${x.asset_no} ${x.status}${x.status==='In Use'?' · '+patientText(x.current_patient_id):''}`).join(' · '))))):h('div',{className:'stores-view-only',style:{padding:'20px',textAlign:'center'}},'No equipment in the register yet.'),
        h('div',{className:'equip-actions'},typeof onNavigate==='function'&&h('button',{type:'button',className:'btn btn-primary',onClick:()=>onNavigate('Biomedical Equipment')},'Open Biomedical Equipment register'))
      ),
      h(React.Fragment,{key:`cm-${category}-${refreshKey}`},h(ChargeMasterPage,{profile,lockedCategory:category,section:cmSection,onSummary:setSummary}))
    );
  }

  // All Categories: one box per Charge Master category (new categories appear here automatically)
  function ChargeMasterOverview({profile,onNavigate}){
    const [rows,setRows]=React.useState(null),[stores,setStores]=React.useState([]),[settings,setSettings]=React.useState({}),[openCat,setOpenCat]=React.useState(''),[classic,setClassic]=React.useState(false);
    React.useEffect(()=>{(async()=>{
      const [t,s,a]=await Promise.all([
        client.from('charge_tariff_master').select('category,is_active,amount'),
        client.from('consumable_store_items').select('active,charge_rate'),
        client.from('charge_category_settings').select('category,requires_approval')
      ]);
      setRows(t.error?[]:(t.data||[]).filter(r=>!STORE_CHARGE_CATEGORIES.includes(String(r.category||'').trim())));if(!s.error)setStores(s.data||[]);
      if(!a.error)setSettings(Object.fromEntries((a.data||[]).map(r=>[r.category,r.requires_approval===true])));
    })()},[]);
    if(profile?.role!=='Admin')return h(Section,{title:'Charge Master'},h('p',null,'Administrator access only.'));
    if(classic)return h('div',null,h('div',{className:'equip-actions',style:{marginBottom:'10px'}},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setClassic(false)},'← All Categories')),h(ChargeMasterPage,{profile}));
    if(openCat)return h('div',null,h('div',{className:'equip-actions',style:{marginBottom:'10px'}},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setOpenCat('')},'← All Categories')),h(ChargeMasterDashboard,{profile,category:openCat,onNavigate}));
    const cats=[...new Set([...CHARGE_MASTER_CATEGORIES,...(rows||[]).map(r=>String(r.category||'').trim()).filter(Boolean)])].sort(samaraAlpha);
    const tiles=[...cats.map(c=>{const r=(rows||[]).filter(x=>String(x.category||'').trim()===c);const active=r.filter(x=>x.is_active!==false);const missing=active.filter(x=>!(Number(x.amount)>0)).length;
        return {key:c,icon:'₹',title:c,value:rows?active.length:null,unit:'active items',lines:[`${missing} without a rate`,settings[c]?'Approval Requests':'Bills & Charges'],alert:missing>0}}),
      {key:'Stores Item Rates',icon:'▦',title:'Stores Item Rates',value:stores.filter(x=>x.active!==false).length,unit:'items',lines:[`${stores.filter(x=>x.active!==false&&!(Number(x.charge_rate)>0)).length} without a rate`,'Consumables · Pharmacy · Housekeeping · Kitchen']},
      {key:'__classic',icon:'☰',title:'Full List (all categories)',valueText:'All',unit:'items',lines:['The complete Charge Master table, Assign Codes']}];
    return h('div',{className:'stores-dash-wrap'},h('div',{className:'stores-dash'},
      h(DashboardHero,{kicker:'CHARGE MASTER',title:'All Categories',blurb:'Every chargeable item, code and Admin-fixed rate — the single source for Bills & Charges, Approval Requests, Accounts approval and the Patient Ledger. Tap a category.'}),
      h(DashboardTiles,{tiles,onOpen:key=>{if(key==='__classic')return setClassic(true);const page=CM_PAGE_PREFIX+key;if(CHARGE_MASTER_PAGES.includes(page)&&typeof onNavigate==='function')onNavigate(page);else setOpenCat(key)}})
    ));
  }
