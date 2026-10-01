  // 2.14.95: Biomedical Equipment register and Oxygen Cylinders register (SQL 161).
  // Same dashboard shell as Pharmacy & Stores: navigable boxes → one section at a time,
  // "← Back to Dashboard" / Close, phone back button returns to the dashboard.
  // Equipment pieces are linked to their Charge Master "Biomedical Equipment" item (BIO- code), so the
  // same item, code and rate are used in Bills & Charges, Accounts approval and the Patient Ledger.
  // Oxygen is tracked here; it is still charged through Approval Requests (Oxygen Therapy – B/D-type).
  function equipmentPatientName(patients,id){
    const p=(patients||[]).find(x=>String(x.id)===String(id));
    return p?[formalName(p)||p.full_name,p.patient_id&&`(${p.patient_id})`,p.room_no&&`Room ${p.room_no}${p.bed_no?`/${p.bed_no}`:''}`].filter(Boolean).join(' · '):'—';
  }
  function equipmentDaysSince(ts){if(!ts)return null;return Math.max(1,Math.ceil((Date.now()-new Date(ts).getTime())/86400000))}
  function equipmentHoursSince(ts){if(!ts)return null;return Math.round((Date.now()-new Date(ts).getTime())/360000)/10}
  const EQUIP_NOT_INSTALLED='The Biomedical Equipment / Oxygen registers are not installed yet. Please run supabase/sql/161_biomedical_equipment_oxygen_cylinders.sql once in Supabase.';
  function equipmentNotify(type,text){showSamaraActionToast(type,type==='success'?'Register updated':'Action not completed',text)}
  function equipmentErrorText(error){const m=String(error?.message||error||'');if(/bme_delete|oxy_delete/i.test(m)&&/does not exist|schema cache|could not find/i.test(m))return 'Delete is not installed yet. Please run supabase/sql/163_equipment_cylinder_delete_wrong_entry.sql once in Supabase.';return /does not exist|schema cache|could not find/i.test(m)?EQUIP_NOT_INSTALLED:m}
  function useEquipmentPeople(profile){
    const authority=useStoreAuthority(profile);
    const controller=!!authority.controller||profile?.role==='Admin';
    const nurse=profile?.role==='Nurse'&&!isNursingManagerProfile(profile);
    return {controller,nurse,canView:controller||nurse||['Admin','Manager','STD'].includes(profile?.role)};
  }
  function EquipmentStatusPill({status}){
    const tone={'Available':'#e7f6ef','Full':'#e7f6ef','In Use':'#eaf2ff','Empty':'#fff1d6','At Refill':'#f3e8fa','Under Repair':'#fff1d6','Out of Service':'#fdebec'}[status]||'#eef1f0';
    return h('span',{className:'equip-pill',style:{background:tone}},status);
  }
  function PatientPicker({patients,value,onChange,required=true}){
    return h('select',{value:value||'',required,onChange:e=>onChange(e.target.value)},h('option',{value:''},'Select resident'),
      (patients||[]).map(p=>h('option',{key:p.id,value:p.id},equipmentPatientName(patients,p.id))));
  }

  // ------------------------------------------------------------------ Biomedical Equipment
  function BiomedicalEquipmentDashboard({profile}){
    const [access,setAccess]=React.useState(null),[error,setError]=React.useState('');
    React.useEffect(()=>{
      let active=true;
      async function refresh(){try{const res=await client.rpc('bme_access');if(!active)return;if(res.error||res.data?.version!==1)throw res.error||Error('Equipment permissions are updating.');setAccess(res.data);setError('')}catch(e){if(active){setAccess(null);setError('Unable to verify equipment access. Install SQL 184 before using this update. '+e.message)}}}
      refresh();const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);
      return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh)};
    },[profile?.id]);
    if(!access)return h(Section,{title:'Biomedical Equipment'},h('p',{role:'status'},error||'Checking equipment access…'));
    if(access.controller)return h(BiomedicalEquipmentAdminDashboard,{profile});
    if(access.nurse)return h(NurseEquipmentWorkspace,{profile});
    return h(Section,{title:'Biomedical Equipment'},h('p',null,'This workspace is for Nursing and authorised Stores/Admin staff.'));
  }

  function EquipmentCareRequests({controller=false,patients=[]}){
    const [rows,setRows]=React.useState([]),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
    async function load(){const res=await client.rpc('bme_care_requests_list');if(res.error){setError(res.error.message);return}setRows(res.data||[]);setError('')}
    React.useEffect(()=>{load()},[]);
    async function resolve(row){const note=prompt('Record the action taken. Issue, return and maintenance actions must be recorded in the equipment register separately.','');if(note===null||!note.trim()||busy)return;setBusy(true);try{const res=await client.rpc('bme_care_resolve',{p_id:row.id,p_resolution:note.trim()});if(res.error)throw res.error;equipmentNotify('success','Request resolved.');await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
    return h(Section,{title:controller?'Nursing Equipment Requests':'My Equipment Requests'},
      h('button',{type:'button',className:'btn btn-secondary',onClick:load,disabled:busy},'Refresh'),error&&h('p',{role:'alert'},error),
      rows.length?rows.map(row=>h('article',{key:row.id,className:'stores-ledger-card'},
        h('strong',null,row.kind+' · '+row.item_name+' · '+row.status),h('p',null,row.details),
        h('p',null,equipmentPatientName(patients,row.patient_id)),h('small',null,formatDateTimeIN(row.requested_at)+' · '+row.requested_by_name),
        row.resolution&&h('p',null,'Action taken: '+row.resolution+' · '+row.resolved_by_name),
        controller&&row.status==='Pending'&&h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>resolve(row)},'Resolve request')
      )):h('p',null,'No requests yet.'));
  }

  function NurseEquipmentWorkspace({profile}){
    const {view,openView,backToDashboard}=useDashboardView();
    const [rows,setRows]=React.useState([]),[moves,setMoves]=React.useState([]),[patients,setPatients]=React.useState([]),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
    const [form,setForm]=React.useState({kind:'Equipment',equipment_id:'',patient_id:'',item_name:'',details:''});
    const [notice,setNotice]=React.useState(''),[saved,setSaved]=React.useState(false);
    const lock=React.useRef(false),request=React.useRef(null);
    const change=(key,value)=>{setForm(f=>({...f,[key]:value}));setSaved(false);setNotice('');setError('')};
    async function load(){
      const [e,m,p]=await Promise.all([client.rpc('bme_clinical_equipment'),client.rpc('bme_clinical_movements'),client.from('patients').select('id,title,full_name,patient_id,room_no,bed_no').eq('is_active',true).order('full_name')]);
      if(e.error||m.error||p.error){setError((e.error||m.error||p.error).message);return}
      setRows(e.data||[]);setMoves(m.data||[]);setPatients(p.data||[]);setError('');
    }
    React.useEffect(()=>{load()},[]);
    async function submit(e){e.preventDefault();if(lock.current||saved)return;lock.current=true;setBusy(true);setError('');
      try{const signature=JSON.stringify(form);if(request.current?.signature!==signature)request.current={signature,id:crypto.randomUUID()};
        const res=await client.rpc('bme_care_request',{p_id:request.current.id,p_kind:form.kind,p_equipment_id:form.equipment_id||null,p_patient_id:form.patient_id||null,p_item_name:form.item_name,p_details:form.details});if(res.error)throw res.error;
        request.current=null;setSaved(true);setNotice('✓ Request sent to the Store In-charge. Track it in My Requests.');await load();
      }catch(e){setError(e.message)}finally{lock.current=false;setBusy(false)}
    }
    async function returnEquipment(x){const note=prompt('Return '+x.asset_no+' to Stores? Enter any remarks.','');if(note===null||lock.current)return;lock.current=true;setBusy(true);try{const res=await client.rpc('bme_return',{p_equipment_id:x.id,p_remarks:note||null});if(res.error)throw res.error;equipmentNotify('success',x.asset_no+' returned.');await load()}catch(e){setError(e.message)}finally{lock.current=false;setBusy(false)}}
    const tiles=[
      {key:'inuse',icon:'♿',title:'In Use',value:rows.filter(x=>x.status==='In Use').length,unit:'with residents',lines:['View and return equipment']},
      {key:'request',icon:'＋',title:'Request Equipment',value:rows.filter(x=>x.status==='Available'&&!x.fault_reported).length,unit:'available pieces',lines:['View availability and send a request']},
      {key:'care',icon:'⚠',title:'Return / Report Fault',valueText:'Open',lines:['Report problems to the Store In-charge']},
      {key:'requests',icon:'▤',title:'My Requests',valueText:'Track',lines:['Requests, faults and responses']},
      {key:'history',icon:'↕',title:'Issue / Return History',valueText:'View',lines:['Resident equipment movements']}
    ];
    const safeView=tiles.some(t=>t.key===view)?view:null;
    const visible=safeView==='inuse'?rows.filter(x=>x.status==='In Use'):safeView==='request'?rows.filter(x=>x.status==='Available'&&!x.fault_reported):rows.filter(x=>x.status!=='Out of Service');
    function selectEquipment(x,kind){setForm({kind,equipment_id:x.id,patient_id:x.current_patient_id||'',item_name:x.equipment_name,details:''});setSaved(false);setNotice('');setError('');openView(kind==='Fault'?'care':'request')}
    return h('div',{className:'stores-dash-wrap'},
      error&&h('p',{className:'message error',role:'alert'},error),
      !safeView?h(React.Fragment,null,h(DashboardHero,{title:'Biomedical Equipment — Nursing',blurb:'Equipment for resident care: view availability, request equipment, return items and report faults.',onRefresh:load}),h(DashboardTiles,{tiles,onOpen:key=>{if(key==='care')change('kind','Fault');if(key==='request')change('kind','Equipment');openView(key)}})):h(DashboardBackBar,{title:'Biomedical Equipment',viewTitle:tiles.find(t=>t.key===safeView)?.title,onBack:backToDashboard}),
      ['request','care'].includes(safeView)&&h(Section,{title:safeView==='care'?'Report an equipment fault':'Request equipment'},
        notice&&h('p',{className:'message success',role:'status'},notice),
        h('form',{onSubmit:submit},h('fieldset',{disabled:busy,style:{border:0,padding:0}},
          h('div',{className:'field'},h('label',null,'Request type'),h('select',{value:form.kind,onChange:e=>change('kind',e.target.value)},h('option',{value:'Equipment'},'Equipment request'),h('option',{value:'Fault'},'Report fault'))),
          h('div',{className:'field'},h('label',null,'Equipment piece'+(form.kind==='Fault'?' *':'')),h('select',{required:form.kind==='Fault',value:form.equipment_id,onChange:e=>{const x=rows.find(r=>r.id===e.target.value);change('equipment_id',e.target.value);change('item_name',x?.equipment_name||'')}},h('option',{value:''},'Select a piece, or describe the equipment needed'),rows.map(x=>h('option',{key:x.id,value:x.id},x.asset_no+' · '+x.equipment_name+' · '+x.status)))),
          !form.equipment_id&&h('div',{className:'field'},h('label',null,'Equipment needed *'),h('input',{required:true,maxLength:200,value:form.item_name,onChange:e=>change('item_name',e.target.value)})),
          h('div',{className:'field'},h('label',null,'Resident (optional)'),h(PatientPicker,{patients,required:false,value:form.patient_id,onChange:v=>change('patient_id',v)})),
          h('div',{className:'field'},h('label',null,'Details *'),h('textarea',{required:true,minLength:3,maxLength:2000,value:form.details,onChange:e=>change('details',e.target.value)})),
          h('button',{className:'btn btn-primary',disabled:busy||saved},busy?'Sending…':saved?'Sent':'Send request'))),
        form.kind==='Fault'&&h('p',null,'For an urgent problem, contact the Store In-charge directly. A report does not confirm repair or safe use.')),
      ['inuse','request','care'].includes(safeView)&&h(Section,{title:safeView==='request'?'Available equipment':'Resident equipment'},
        visible.length?visible.map(x=>h('article',{key:x.id,className:'stores-ledger-card'},h('strong',null,x.asset_no+' · '+x.equipment_name),h(EquipmentStatusPill,{status:x.status}),x.fault_reported&&h('p',null,'Fault reported — awaiting Stores review'),h('p',null,x.status==='Under Repair'?'Unavailable — under repair':x.current_patient_id?equipmentPatientName(patients,x.current_patient_id):x.current_location||'Stores'),
          h('div',{className:'equip-actions'},x.status==='In Use'&&h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>returnEquipment(x)},'Return'),x.status==='Available'&&!x.fault_reported&&h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>selectEquipment(x,'Equipment')},'Request'),h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>selectEquipment(x,'Fault')},'Report fault')))):h('p',null,'No equipment in this view.')),
      safeView==='requests'&&h(EquipmentCareRequests,{patients}),
      safeView==='history'&&h(Section,{title:'Issue / Return History'},moves.length?[...moves].reverse().slice(0,300).map(m=>h('article',{key:m.id,className:'stores-ledger-card'},h('strong',null,(rows.find(x=>x.id===m.equipment_id)?.asset_no||'Equipment')+' · '+m.action),h('p',null,equipmentPatientName(patients,m.patient_id)),h('small',null,formatDateTimeIN(m.moved_at)+' · '+(m.actor_name||'Staff')))):h('p',null,'No issue or return history.'))
    );
  }

  function BiomedicalEquipmentAdminDashboard({profile}){
    const {view,openView,backToDashboard}=useDashboardView();
    const who={controller:true,nurse:false,canView:true};
    const [rows,setRows]=React.useState(null),[moves,setMoves]=React.useState([]),[patients,setPatients]=React.useState([]),[bio,setBio]=React.useState([]);
    const [error,setError]=React.useState(''),[busy,setBusy]=React.useState(false),[search,setSearch]=React.useState('');
    const [regStatus,setRegStatus]=React.useState('All'); // 2.15.3: Equipment Register status filter
    const [issueFor,setIssueFor]=React.useState(null),[issueForm,setIssueForm]=React.useState({patient_id:'',location:'',remarks:''});
    // 2.15.4: Item Master (BME-001 …) + Receive / Purchase from vendor; pieces are numbered after their item (BME-001-01 …). SQL 164.
    const [items,setItems]=React.useState([]),[purchases,setPurchases]=React.useState([]),[itemsMissing,setItemsMissing]=React.useState(false);
    const [itemFilter,setItemFilter]=React.useState('All');
    const blankItem={id:null,item_name:'',charge_key:'',notes:'',active:true};
    const [itemForm,setItemForm]=React.useState(blankItem);
    const blankRecv={item_id:'',source:'Purchase',quantity:'1',vendor_name:'',bill_no:'',bill_date:'',unit_cost:'',warranty_until:'',serials:'',next_service_due:'',location:'Stores',remarks:''};
    const [recv,setRecv]=React.useState(blankRecv),[recvDone,setRecvDone]=React.useState(null);
    const [pPeriod,setPPeriod]=React.useState('month'),[pFrom,setPFrom]=React.useState(''),[pTo,setPTo]=React.useState('');
    const pf=useAppliedFilters({period:pPeriod,from:pFrom,to:pTo});
    const [purchaseDetail,setPurchaseDetail]=React.useState(null);
    async function load(){
      const [e,m,p,c,it,pu]=await Promise.all([
        client.from('biomedical_equipment').select('*').order('asset_no'),
        client.from('biomedical_equipment_movements').select('*').order('moved_at',{ascending:false}).limit(1000),
        client.from('patients').select('id,title,full_name,patient_id,room_no,bed_no,is_active').eq('is_active',true).order('full_name'),
        client.rpc('get_charge_service_catalog'),
        client.from('biomedical_equipment_items').select('*').order('item_code'),
        client.from('biomedical_equipment_purchases').select('*').order('received_at',{ascending:false}).limit(1000)
      ]);
      if(e.error){setError(equipmentErrorText(e.error));setRows([]);return}
      setError('');setRows(e.data||[]);if(!m.error)setMoves(m.data||[]);if(!p.error)setPatients(p.data||[]);
      if(!c.error)setBio((c.data||[]).filter(x=>x.category==='Biomedical Equipment'&&x.is_active!==false));
      setItemsMissing(!!it.error);if(!it.error)setItems(it.data||[]);if(!pu.error)setPurchases(pu.data||[]);
    }
    React.useEffect(()=>{load()},[]);
    async function run(fn,args,ok){
      if(busy)return false;setBusy(true);const res=await client.rpc(fn,args);setBusy(false);
      if(res.error){equipmentNotify('error',equipmentErrorText(res.error));return false}
      equipmentNotify('success',ok);await load();return true;
    }
    const list=rows||[];
    const active=list.filter(x=>x.status!=='Out of Service');
    const today=todayISOIndia(),soonLimit=addDaysISO(today,7);
    const serviceDue=active.filter(x=>x.next_service_due&&String(x.next_service_due).slice(0,10)<=soonLimit);
    const monthStart=today.slice(0,8)+'01';
    const monthMoves=moves.filter(m=>String(m.moved_at).slice(0,10)>=monthStart);
    const counts={inuse:list.filter(x=>x.status==='In Use').length,available:list.filter(x=>x.status==='Available').length,repair:list.filter(x=>x.status==='Under Repair').length,overdue:serviceDue.filter(x=>String(x.next_service_due).slice(0,10)<today).length};
    const ready=rows!==null;
    const tiles=[
      {key:'requests',icon:'▤',title:'Nursing Requests',valueText:'Open',lines:['Equipment requests and fault reports']},
      {key:'inuse',icon:'♿︎',title:'In Use',value:ready?counts.inuse:null,unit:'with residents',lines:[`${new Set(list.filter(x=>x.status==='In Use').map(x=>x.current_patient_id).filter(Boolean)).size} resident(s)`,'Return from here']},
      {key:'available',icon:'✓',title:'Available',value:ready?counts.available:null,unit:'ready to issue',lines:[who.controller?'Issue to a resident / room':'In Stores']},
      {key:'service',icon:'🛠︎',title:'Service Due',value:ready?serviceDue.length:null,unit:'within 7 days',lines:[`${counts.overdue} overdue`],alert:counts.overdue>0,warn:serviceDue.length>0},
      {key:'repair',icon:'⚠︎',title:'Under Repair',value:ready?counts.repair:null,unit:'pieces',lines:['Back in service from here'],warn:counts.repair>0},
      {key:'register',icon:'▤',title:'Equipment Register',value:ready?list.length:null,unit:'pieces',lines:[`${active.length} in service · ${list.length-active.length} out of service`,'Every piece, grouped by item']},
      {key:'items',icon:'🏷︎',title:'Equipment Items',value:ready?items.filter(x=>x.active).length:null,unit:'items',lines:['Item codes BME-001, BME-002 …','Create a name once, link its Charge Master rate']},
      ...(who.controller?[{key:'receive',icon:'＋',title:'Receive / Purchase',valueText:'New',unit:'piece(s)',lines:['From a vendor, or already owned','Piece codes BME-001-01, -02 …']}]:[]),
      {key:'purchases',icon:'₹',title:'Purchase Register',value:ready?purchases.filter(x=>String(x.received_at).slice(0,10)>=monthStart).length:null,unit:'receipts this month',lines:[`₹${purchases.filter(x=>String(x.received_at).slice(0,10)>=monthStart).reduce((a,x)=>a+Number(x.unit_cost||0)*Number(x.quantity||0),0).toLocaleString('en-IN')} this month`,'Vendor, bill, cost, warranty']},
      {key:'history',icon:'↕',title:'Movement History',value:ready?monthMoves.length:null,unit:'movements this month',lines:['Issued, returned, repair, service']}
    ];
    const viewTitle=(tiles.find(t=>t.key===view)||{}).title||'';
    const q=search.trim().toLowerCase();
    const shown=(view==='inuse'?list.filter(x=>x.status==='In Use'):view==='available'?list.filter(x=>x.status==='Available'):view==='service'?serviceDue:view==='repair'?list.filter(x=>x.status==='Under Repair'):list.filter(x=>(regStatus==='All'||x.status===regStatus)&&(itemFilter==='All'||String(x.item_id)===String(itemFilter))))
      .filter(x=>q.length<2||`${x.asset_no} ${x.equipment_name} ${x.serial_no||''} ${x.charge_code||''} ${x.vendor_name||''} ${x.bill_no||''} ${equipmentPatientName(patients,x.current_patient_id)}`.toLowerCase().includes(q));
    async function doIssue(e){
      e.preventDefault();if(!issueFor)return;
      const ok=await run('bme_issue',{p_equipment_id:issueFor.id,p_patient_id:issueForm.patient_id||null,p_location:issueForm.location||null,p_remarks:issueForm.remarks||null},`${issueFor.asset_no} ${issueFor.equipment_name} issued.`);
      if(ok){setIssueFor(null);setIssueForm({patient_id:'',location:'',remarks:''})}
    }
    function doReturn(x){const r=prompt(`Return ${x.asset_no} ${x.equipment_name} from ${equipmentPatientName(patients,x.current_patient_id)}? Remarks (optional):`,'');if(r===null)return;run('bme_return',{p_equipment_id:x.id,p_remarks:r||null},`${x.asset_no} returned to Stores.`)}
    function askDate(label,current){const v=prompt(`${label} (DD-MM-YYYY), or leave blank:`,current?formatDateIN(current):'');if(v===null)return undefined;const t=v.trim();if(!t)return null;const m=t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);if(!m){alert('Please enter the date as DD-MM-YYYY.');return undefined}return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`}
    // 2.15.3: a piece that was never given to a resident can be deleted (wrong entry); the server keeps an audit copy.
    const everIssued=x=>moves.some(m=>String(m.equipment_id)===String(x.id)&&(m.patient_id||m.action==='Issued'));
    function doDelete(x){
      const r=prompt(`DELETE ${x.asset_no} · ${x.equipment_name} from the register?\nUse this only for a wrong / duplicate entry. Reason:`,'Wrong entry');
      if(r===null)return;if(!r.trim())return equipmentNotify('error','Please give a reason for deleting.');
      run('bme_delete',{p_equipment_id:x.id,p_reason:r.trim()},`${x.asset_no} deleted from the register.`);
    }
    function doStatus(x,status){
      let due=null;
      if(status==='Serviced'){due=askDate('Next service due date',x.next_service_due);if(due===undefined)return}
      const r=prompt(`${status==='Under Repair'?'Send for repair':status==='Out of Service'?'Mark out of service':status==='Serviced'?'Mark serviced':'Back in service'}: ${x.asset_no} ${x.equipment_name}. Remarks:`,'');if(r===null)return;
      run('bme_set_status',{p_equipment_id:x.id,p_status:status,p_next_service_due:due,p_remarks:r||null},`${x.asset_no} updated.`);
    }
    const itemOf=x=>items.find(i=>String(i.id)===String(x.item_id));
    const piecesOf=i=>list.filter(x=>String(x.item_id)===String(i.id));
    async function saveItem(e){
      e.preventDefault();if(busy)return;
      const ch=bio.find(b=>`${b.charge_code||''}|${b.service_name}`===itemForm.charge_key);
      const name=String(itemForm.item_name||'').trim();
      if(!name)return equipmentNotify('error','Enter the equipment name.');
      setBusy(true);const res=await client.rpc('bme_item_save',{p_id:itemForm.id,p_item_name:name,p_charge_code:ch?.charge_code||null,p_charge_service_name:ch?.service_name||null,p_notes:itemForm.notes||null,p_active:itemForm.active!==false});setBusy(false);
      if(res.error)return equipmentNotify('error',equipmentErrorText(res.error));
      equipmentNotify('success',`${res.data?.item_code||''} · ${res.data?.item_name||name} ${itemForm.id?'updated':'created'}.`);setItemForm(blankItem);await load();
    }
    function editItem(i){setItemForm({id:i.id,item_name:i.item_name,charge_key:i.charge_code||i.charge_service_name?`${i.charge_code||''}|${i.charge_service_name||''}`:'',notes:i.notes||'',active:i.active!==false});try{window.scrollTo({top:0,behavior:'smooth'})}catch(_){}}
    function deleteItem(i){if(!confirm(`Delete ${i.item_code} · ${i.item_name}? (Only possible when it has no pieces.)`))return;run('bme_item_delete',{p_id:i.id},`${i.item_code} deleted.`)}
    async function doReceive(e){
      e.preventDefault();if(busy)return;
      const item=items.find(i=>String(i.id)===String(recv.item_id));
      if(!item)return equipmentNotify('error','Choose the equipment item (create it first in Equipment Items if it is new).');
      const n=parseInt(recv.quantity,10)||0;if(n<1||n>100)return equipmentNotify('error','Quantity must be between 1 and 100.');
      if(recv.source==='Purchase'&&!recv.vendor_name.trim())return equipmentNotify('error','Enter the vendor name.');
      const serials=String(recv.serials||'').split(/[\n,]+/).map(x=>x.trim()).filter(Boolean);
      if(serials.length&&serials.length!==n)return equipmentNotify('error',`You entered ${serials.length} serial number(s) for ${n} piece(s). Enter one per piece, or leave it blank.`);
      setBusy(true);
      const res=await client.rpc('bme_receive',{p_item_id:item.id,p_source:recv.source,p_quantity:n,p_vendor_name:recv.vendor_name||null,p_bill_no:recv.bill_no||null,p_bill_date:recv.bill_date||null,
        p_unit_cost:recv.unit_cost===''?null:Number(recv.unit_cost),p_warranty_until:recv.warranty_until||null,p_serials:serials.length?serials:null,p_next_service_due:recv.next_service_due||null,p_location:recv.location||null,p_remarks:recv.remarks||null});
      setBusy(false);
      if(res.error)return equipmentNotify('error',equipmentErrorText(res.error));
      const nos=res.data?.asset_nos||[];setRecvDone({item,nos});
      equipmentNotify('success',`${n} × ${item.item_name} received: ${nos.join(', ')}`);setRecv(blankRecv);await load();
    }
    const PA=pf.applied;
    const pBounds=(()=>{const t=today;if(PA.period==='today')return [t,t];if(PA.period==='week')return [mondayOfWeek(t),t];if(PA.period==='lastmonth'){const d=new Date(`${t.slice(0,8)}01T12:00:00`);d.setMonth(d.getMonth()-1);const f=d.toISOString().slice(0,10);const x=new Date(`${t.slice(0,8)}01T12:00:00`);x.setDate(0);return [f,x.toISOString().slice(0,10)]}if(PA.period==='year')return [t.slice(0,4)+'-01-01',t];if(PA.period==='all')return ['0000-01-01','9999-12-31'];if(PA.period==='custom')return [PA.from||t,PA.to||t];return [monthStart,t]})();
    const purchaseDate=x=>String(x.bill_date||x.received_at||'').slice(0,10);
    const shownPurchases=purchases.filter(x=>{const d=String(x.received_at).slice(0,10);return d>=pBounds[0]&&d<=pBounds[1]});
    const money=v=>v===null||v===undefined||v===''?'—':`₹${Number(v).toLocaleString('en-IN',{maximumFractionDigits:2})}`;
    function purchaseFields(x){const it=items.find(i=>String(i.id)===String(x.item_id));return [
      ['Receipt No.',`BMR-${String(x.receipt_no).padStart(4,'0')}`],['Item',it?`${it.item_code} · ${it.item_name}`:''],['Type',x.source==='Purchase'?'Purchase from vendor':'Already owned (opening stock)'],
      ['Quantity',`${x.quantity} piece(s)`],['Piece codes',(x.asset_nos||[]).join(', ')],['Vendor',x.vendor_name],['Bill No.',x.bill_no],['Bill date',x.bill_date?formatDateIN(x.bill_date):''],
      ['Cost per piece',x.unit_cost!=null?money(x.unit_cost):''],['Total cost',x.unit_cost!=null?money(Number(x.unit_cost)*Number(x.quantity)):''],['Warranty until',x.warranty_until?formatDateIN(x.warranty_until):''],
      ['Remarks',x.remarks],['Received by',x.received_by_name],['Entered on',formatDateTimeIN(x.received_at)]]}
    function EquipmentCard(x){
      const days=x.status==='In Use'?equipmentDaysSince(x.issued_at):null;
      const due=x.next_service_due?String(x.next_service_due).slice(0,10):'';
      return h('article',{key:x.id,className:'stores-ledger-card equip-card'},
        h('div',{className:'stores-ledger-card-head'},h('strong',null,`${x.asset_no} · ${x.equipment_name}`),h(EquipmentStatusPill,{status:x.status})),
        h('div',{className:'stores-ledger-card-fields'},
          h('div',null,h('small',null,'Charge Master'),h('strong',null,x.charge_code?`${x.charge_code} · ${x.charge_service_name||''}`:'Not charged to residents')),
          x.serial_no&&h('div',null,h('small',null,'Serial No.'),h('strong',null,x.serial_no)),
          x.vendor_name&&h('div',null,h('small',null,'Vendor'),h('strong',null,[x.vendor_name,x.bill_no&&`Bill ${x.bill_no}`,x.bill_date&&formatDateIN(x.bill_date)].filter(Boolean).join(' · '))),
          x.warranty_until&&h('div',null,h('small',null,'Warranty until'),h('strong',{style:String(x.warranty_until).slice(0,10)<today?{color:'#b42318'}:null},formatDateIN(x.warranty_until))),
          x.status==='In Use'&&h('div',null,h('small',null,'With'),h('strong',null,x.current_patient_id?equipmentPatientName(patients,x.current_patient_id):(x.current_location||'—'))),
          x.status==='In Use'&&h('div',null,h('small',null,'Since'),h('strong',null,`${formatDateIN(String(x.issued_at).slice(0,10))} · ${days} day(s)`)),
          x.status!=='In Use'&&h('div',null,h('small',null,'Location'),h('strong',null,x.current_location||'Stores')),
          h('div',null,h('small',null,'Next Service'),h('strong',{style:due&&due<today?{color:'#b42318'}:due&&due<=soonLimit?{color:'#9a6700'}:null},due?formatDateIN(due):'Not set'))
        ),
        h('div',{className:'equip-actions'},
          who.controller&&x.status==='Available'&&h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>{setIssueFor(x);setIssueForm({patient_id:'',location:'',remarks:''})}},'Issue'),
          (who.controller||who.nurse)&&x.status==='In Use'&&h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>doReturn(x)},'Return'),
          who.controller&&x.status==='Available'&&h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>doStatus(x,'Serviced')},'Mark Serviced'),
          who.controller&&x.status==='Available'&&h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>doStatus(x,'Under Repair')},'Send for Repair'),
          who.controller&&x.status==='Under Repair'&&h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>doStatus(x,'Available')},'Back in Service'),
          who.controller&&['Available','Under Repair'].includes(x.status)&&h('button',{type:'button',className:'btn btn-danger',disabled:busy,onClick:()=>doStatus(x,'Out of Service')},'Out of Service'),
          who.controller&&x.status==='Out of Service'&&h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>doStatus(x,'Available')},'Back in Service'),
          who.controller&&x.status!=='In Use'&&!everIssued(x)&&h('button',{type:'button',className:'btn btn-danger',disabled:busy,title:'Only for a wrong / duplicate entry — never issued to a resident',onClick:()=>doDelete(x)},'🗑︎ Delete (wrong entry)')
        ),
        issueFor&&issueFor.id===x.id&&h('form',{className:'equip-inline-form',onSubmit:doIssue},
          h('div',{className:'grid two'},
            h('div',{className:'field'},h('label',null,'Resident'),h(PatientPicker,{patients,value:issueForm.patient_id,required:false,onChange:v=>setIssueForm({...issueForm,patient_id:v})})),
            h('div',{className:'field'},h('label',null,'Room / Location (if not for one resident)'),h('input',{value:issueForm.location,onChange:e=>setIssueForm({...issueForm,location:e.target.value}),placeholder:'Blank = resident’s room'}))
          ),
          h('div',{className:'field'},h('label',null,'Remarks'),h('input',{value:issueForm.remarks,onChange:e=>setIssueForm({...issueForm,remarks:e.target.value})})),
          h('div',{className:'equip-actions'},h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':'Issue Equipment'),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setIssueFor(null)},'Cancel'))
        )
      );
    }
    if(!who.canView)return h(Section,{title:'Biomedical Equipment'},h('p',null,'Access is for Nursing, the Nursing Manager / Store In-charge and Admin.'));
    return h('div',{className:'stores-dash-wrap'},
      error&&h('div',{className:'message error',style:{marginBottom:'12px'}},error),
      !view&&h('div',{className:'stores-dash'},
        h(DashboardHero,{title:'Biomedical Equipment',blurb:'Air mattresses, oxygen concentrators, suction machines, nebulizers, BP apparatus, pulse oximeters, wheelchairs — every piece tracked: who has it, since when, service due.',onRefresh:()=>{setRows(null);load()}}),
        h(DashboardTiles,{tiles,onOpen:openView})
      ),
      view&&h(DashboardBackBar,{title:'Biomedical Equipment',viewTitle,onBack:backToDashboard}),
      view&&itemsMissing&&['items','receive','purchases','register'].includes(view)&&h('div',{className:'message warning',style:{marginBottom:'12px'}},'Equipment Items and Receive / Purchase are not installed yet. Please run supabase/sql/164_equipment_item_master_purchases.sql once in Supabase.'),
      view==='requests'&&h(EquipmentCareRequests,{controller:true,patients}),
      view==='items'&&h(Section,{title:'Equipment Items',subtitle:'Each kind of equipment is created ONCE and gets its item code (BME-001, BME-002 …). Its pieces are numbered after it (BME-001-01, BME-001-02 …). Link the Charge Master rate if residents are charged for it.'},
        who.controller&&h('form',{onSubmit:saveItem,className:'equip-inline-form',style:{marginTop:0,marginBottom:'14px'}},
          h('h4',{style:{margin:'0 0 10px'}},itemForm.id?`Edit ${(items.find(i=>i.id===itemForm.id)||{}).item_code||''}`:'New equipment item'),
          h('div',{className:'grid two'},
            h('div',{className:'field'},h('label',null,'Equipment name *'),h('input',{required:true,value:itemForm.item_name,onChange:e=>setItemForm({...itemForm,item_name:e.target.value}),placeholder:'e.g. Pulse Oximeter, Air Mattress'})),
            h('div',{className:'field'},h('label',null,'Charge Master rate'),h('select',{value:itemForm.charge_key,onChange:e=>{const it=bio.find(b=>`${b.charge_code||''}|${b.service_name}`===e.target.value);setItemForm({...itemForm,charge_key:e.target.value,item_name:itemForm.item_name||String(it?.service_name||'').replace(/\s*\(per day\)\s*$/i,'')})}},h('option',{value:''},'Not charged to residents'),bio.map(b=>h('option',{key:`${b.charge_code}|${b.service_name}`,value:`${b.charge_code||''}|${b.service_name}`},`${b.charge_code?b.charge_code+' · ':''}${b.service_name}`)))),
            h('div',{className:'field'},h('label',null,'Notes'),h('input',{value:itemForm.notes,onChange:e=>setItemForm({...itemForm,notes:e.target.value}),placeholder:'Model, size, etc. (optional)'})),
            itemForm.id&&h('div',{className:'field'},h('label',null,'Status'),h('select',{value:itemForm.active?'1':'0',onChange:e=>setItemForm({...itemForm,active:e.target.value==='1'})},h('option',{value:'1'},'Active'),h('option',{value:'0'},'Inactive (no new pieces)')))
          ),
          h('div',{className:'equip-actions'},h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':itemForm.id?'Save Changes':'Create Item'),itemForm.id&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setItemForm(blankItem)},'Cancel'))
        ),
        items.length?h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Item code','Equipment','Charge Master','Pieces','Available','In use','Status',''].map(x=>h('th',{key:x},x)))),
          h('tbody',null,items.map(i=>{const ps=piecesOf(i);return h('tr',{key:i.id,className:'row-clickable',onClick:()=>{setItemFilter(i.id);setRegStatus('All');openView('register')}},
            h('td',null,h('strong',null,i.item_code)),h('td',null,i.item_name),h('td',null,i.charge_code?`${i.charge_code} · ${i.charge_service_name||''}`:'Not charged'),
            h('td',null,ps.length),h('td',null,ps.filter(x=>x.status==='Available').length),h('td',null,ps.filter(x=>x.status==='In Use').length),
            h('td',null,h('span',{className:'equip-pill',style:{background:i.active?'#e7f6ef':'#eef1f0'}},i.active?'Active':'Inactive')),
            h('td',{onClick:e=>e.stopPropagation()},who.controller&&h('div',{className:'equip-actions',style:{marginTop:0}},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>editItem(i)},'Edit'),!ps.length&&!purchases.some(x=>String(x.item_id)===String(i.id))&&h('button',{type:'button',className:'btn btn-danger',disabled:busy,onClick:()=>deleteItem(i)},'Delete'))))}))
        )):h('div',{className:'stores-view-only',style:{padding:'20px',textAlign:'center'}},'No equipment items yet. Create the first one above.'),
        h('p',{className:'small-note',style:{marginTop:'8px'}},'Tap an item to see its pieces in the Equipment Register.')
      ),
      view==='receive'&&who.controller&&h(Section,{title:'Receive / Purchase',subtitle:'Pieces come into the register only from here. Each piece gets its code automatically after the item code (BME-001-01, BME-001-02 …).'},
        recvDone&&h('div',{className:'message success',style:{marginBottom:'12px'}},`Received ${recvDone.nos.length} × ${recvDone.item.item_name}: `,h('strong',null,recvDone.nos.join(', ')),'. Write these codes on the pieces.'),
        !items.filter(i=>i.active).length&&h('p',{className:'message',style:{marginBottom:'10px'}},'Create the equipment item first in ',h('button',{type:'button',className:'btn btn-secondary',onClick:()=>openView('items')},'Equipment Items'),'.'),
        h('form',{onSubmit:doReceive},
          h('div',{className:'stores-mode-switch',role:'tablist',style:{marginBottom:'12px'}},[['Purchase','Purchase from vendor'],['Opening stock','Already owned (opening stock)']].map(([k,l])=>h('button',{key:k,type:'button',role:'tab','aria-selected':recv.source===k,className:recv.source===k?'active':'',onClick:()=>setRecv({...recv,source:k})},l))),
          h('div',{className:'grid two'},
            h('div',{className:'field'},h('label',null,'Equipment item *'),h('select',{required:true,value:recv.item_id,onChange:e=>setRecv({...recv,item_id:e.target.value})},h('option',{value:''},'Select item'),items.filter(i=>i.active).map(i=>h('option',{key:i.id,value:i.id},`${i.item_code} · ${i.item_name}${i.charge_code?'':' (not charged)'}`)))),
            h('div',{className:'field'},h('label',null,'Quantity (pieces) *'),h('input',{type:'number',min:'1',max:'100',required:true,value:recv.quantity,onChange:e=>setRecv({...recv,quantity:e.target.value})})),
            h('div',{className:'field'},h('label',null,recv.source==='Purchase'?'Vendor *':'Vendor (if known)'),h('input',{required:recv.source==='Purchase',value:recv.vendor_name,onChange:e=>setRecv({...recv,vendor_name:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Bill / Invoice No.'),h('input',{value:recv.bill_no,onChange:e=>setRecv({...recv,bill_no:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Bill date'),h(StrictDateInput,{value:recv.bill_date,onChange:e=>setRecv({...recv,bill_date:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Cost per piece (₹)'),h('input',{type:'number',min:'0',step:'0.01',value:recv.unit_cost,onChange:e=>setRecv({...recv,unit_cost:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Warranty until'),h(StrictDateInput,{value:recv.warranty_until,onChange:e=>setRecv({...recv,warranty_until:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Next service due'),h(StrictDateInput,{value:recv.next_service_due,onChange:e=>setRecv({...recv,next_service_due:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Keep at (location)'),h('input',{value:recv.location,onChange:e=>setRecv({...recv,location:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Serial numbers (one per line, optional)'),h('textarea',{rows:3,value:recv.serials,onChange:e=>setRecv({...recv,serials:e.target.value}),placeholder:'Leave blank, or one per piece in order'}))
          ),
          recv.unit_cost!==''&&(parseInt(recv.quantity,10)||0)>0&&h('p',{className:'small-note'},`Total: ${money(Number(recv.unit_cost||0)*(parseInt(recv.quantity,10)||0))}`),
          h('div',{className:'field'},h('label',null,'Remarks'),h('input',{value:recv.remarks,onChange:e=>setRecv({...recv,remarks:e.target.value})})),
          h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':'Receive into Register')
        )
      ),
      purchaseDetail&&h(RowDetailModal,{title:`BMR-${String(purchaseDetail.receipt_no).padStart(4,'0')} · ${(items.find(i=>String(i.id)===String(purchaseDetail.item_id))||{}).item_name||'Equipment'}`,subtitle:purchaseDetail.source==='Purchase'?'Purchase from vendor':'Already owned (opening stock)',fields:purchaseFields(purchaseDetail),onClose:()=>setPurchaseDetail(null)}),
      view==='purchases'&&h(Section,{title:'Purchase Register',subtitle:`${shownPurchases.length} receipt(s) · ${money(shownPurchases.reduce((a,x)=>a+Number(x.unit_cost||0)*Number(x.quantity||0),0))}`},
        h('div',{className:'cm-period-bar'},
          h('div',{className:'field'},h('label',null,'Period'),h('select',{value:pPeriod,onChange:e=>setPPeriod(e.target.value)},[['today','Today'],['week','This Week'],['month','This Month'],['lastmonth','Last Month'],['year','This Year'],['all','All'],['custom','Custom Date Range']].map(([v,l])=>h('option',{key:v,value:v},l)))),
          pPeriod==='custom'&&h('div',{className:'field'},h('label',null,'From'),h(StrictDateInput,{value:pFrom,onChange:e=>setPFrom(e.target.value)})),
          pPeriod==='custom'&&h('div',{className:'field'},h('label',null,'To'),h(StrictDateInput,{value:pTo,onChange:e=>setPTo(e.target.value)})),
          h(ApplyFilterButton,{dirty:pf.dirty,onApply:pf.apply})
        ),
        shownPurchases.length?h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Receipt','Date','Item','Type','Qty','Vendor / Bill','Cost / piece','Total','Pieces'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,shownPurchases.map(x=>{const it=items.find(i=>String(i.id)===String(x.item_id));return h('tr',{key:x.id,className:'row-clickable',onClick:()=>setPurchaseDetail(x)},
            h('td',null,h('strong',null,`BMR-${String(x.receipt_no).padStart(4,'0')}`)),h('td',null,formatDateIN(purchaseDate(x))),h('td',null,it?`${it.item_code} · ${it.item_name}`:'—'),
            h('td',null,x.source==='Purchase'?'Purchase':'Opening stock'),h('td',null,x.quantity),h('td',null,[x.vendor_name,x.bill_no&&`Bill ${x.bill_no}`].filter(Boolean).join(' · ')||'—'),
            h('td',null,money(x.unit_cost)),h('td',null,x.unit_cost!=null?money(Number(x.unit_cost)*Number(x.quantity)):'—'),h('td',null,(x.asset_nos||[]).join(', ')||'—'))}))
        )):h('div',{className:'stores-view-only',style:{padding:'20px',textAlign:'center'}},'No receipts in this period.')
      ),
      ['inuse','available','service','repair','register'].includes(view)&&h(Section,{title:viewTitle,subtitle:view==='inuse'?'Charge in Bills & Charges → Biomedical Equipment: quantity = days in use.':null},
        view==='register'&&items.length>0&&h('div',{className:'equip-item-summary'},
          h('button',{type:'button',className:itemFilter==='All'?'active':'',onClick:()=>setItemFilter('All')},h('strong',null,'All items'),h('small',null,`${list.length} piece(s)`)),
          items.filter(i=>piecesOf(i).length||i.active).map(i=>{const ps=piecesOf(i);return h('button',{key:i.id,type:'button',className:String(itemFilter)===String(i.id)?'active':'',onClick:()=>setItemFilter(i.id)},
            h('strong',null,`${i.item_code} · ${i.item_name}`),h('small',null,`${ps.length} piece(s) · ${ps.filter(x=>x.status==='Available').length} available · ${ps.filter(x=>x.status==='In Use').length} in use${ps.filter(x=>x.status==='Out of Service').length?` · ${ps.filter(x=>x.status==='Out of Service').length} out of service`:''}`))})),
        view==='register'&&h('div',{className:'stores-mode-switch',role:'tablist',style:{marginBottom:'10px',flexWrap:'wrap'}},['All','Available','In Use','Under Repair','Out of Service'].map(k=>h('button',{key:k,type:'button',role:'tab','aria-selected':regStatus===k,className:regStatus===k?'active':'',onClick:()=>setRegStatus(k)},`${k} (${(itemFilter==='All'?list:list.filter(x=>String(x.item_id)===String(itemFilter))).filter(x=>k==='All'||x.status===k).length})`))),
        h('div',{className:'field',style:{marginBottom:'12px'}},h('input',{type:'search',value:search,onChange:e=>setSearch(e.target.value),placeholder:'Search piece code, name, serial, vendor, resident'})),
        shown.length?h('div',{className:'stores-expiry-list'},shown.map(EquipmentCard)):h('div',{className:'stores-view-only',style:{padding:'20px',textAlign:'center'}},list.length?'Nothing here.':'No equipment in the register yet.')
      ),
      view==='history'&&h(Section,{title:'Movement History'},
        moves.length?h('div',{className:'stores-expiry-list'},moves.slice(0,300).map(m=>{const x=list.find(e=>String(e.id)===String(m.equipment_id));return h('article',{key:m.id,className:'stores-ledger-card'},
          h('div',{className:'stores-ledger-card-head'},h('strong',null,`${x?.asset_no||''} · ${x?.equipment_name||'Equipment'}`),h('span',null,formatDateTimeIN(m.moved_at))),
          h('div',{className:'stores-ledger-card-fields'},h('div',null,h('small',null,'Action'),h('strong',null,m.action)),m.patient_id&&h('div',null,h('small',null,'Resident'),h('strong',null,equipmentPatientName(patients,m.patient_id))),m.location&&h('div',null,h('small',null,'Location'),h('strong',null,m.location)),h('div',null,h('small',null,'By'),h('strong',null,m.actor_name||'—')),m.remarks&&h('div',null,h('small',null,'Remarks'),h('strong',null,m.remarks))))})):h('div',{className:'stores-view-only',style:{padding:'20px',textAlign:'center'}},'No movements yet.')
      )
    );
  }

  // ------------------------------------------------------------------ Oxygen Cylinders
  function OxygenCylindersDashboard({profile}){
    const {view,openView,backToDashboard}=useDashboardView();
    const who=useEquipmentPeople(profile);
    const [rows,setRows]=React.useState(null),[moves,setMoves]=React.useState([]),[patients,setPatients]=React.useState([]);
    const [error,setError]=React.useState(''),[busy,setBusy]=React.useState(false),[sizeFilter,setSizeFilter]=React.useState('All');
    const [regStatus,setRegStatus]=React.useState('All'); // 2.15.3
    const [putOn,setPutOn]=React.useState(null),[putForm,setPutForm]=React.useState({patient_id:'',location:'',remarks:''});
    const [addForm,setAddForm]=React.useState({size:'D-type',status:'Full',count:'1',serial_no:'',vendor:'',notes:''});
    async function load(){
      const [c,m,p]=await Promise.all([
        client.from('oxygen_cylinders').select('*').order('cylinder_no'),
        client.from('oxygen_cylinder_movements').select('*').order('moved_at',{ascending:false}).limit(1000),
        client.from('patients').select('id,title,full_name,patient_id,room_no,bed_no,is_active').eq('is_active',true).order('full_name')
      ]);
      if(c.error){setError(equipmentErrorText(c.error));setRows([]);return}
      setError('');setRows(c.data||[]);if(!m.error)setMoves(m.data||[]);if(!p.error)setPatients(p.data||[]);
    }
    React.useEffect(()=>{load()},[]);
    async function move(c,action,extra,ok){
      if(busy)return false;setBusy(true);
      const res=await client.rpc('oxy_move',{p_cylinder_id:c.id,p_action:action,p_patient_id:extra?.patient_id||null,p_location:extra?.location||null,p_vendor:extra?.vendor||null,p_remarks:extra?.remarks||null});
      setBusy(false);
      if(res.error){equipmentNotify('error',equipmentErrorText(res.error));return false}
      equipmentNotify('success',ok);await load();return true;
    }
    const list=rows||[];const ready=rows!==null;
    const by=(st,size)=>list.filter(x=>x.status===st&&(!size||x.cylinder_size===size));
    const fullB=by('Full','B-type').length,fullD=by('Full','D-type').length;
    const tiles=[
      {key:'full',icon:'◉',title:'Full — Ready',value:ready?fullB+fullD:null,unit:'cylinders',lines:[`B-type: ${ready?fullB:'…'} · D-type: ${ready?fullD:'…'}`,fullB<2||fullD<2?'Low — arrange refill':'Put on a resident from here'],alert:ready&&list.length>0&&(fullB+fullD===0),warn:ready&&list.length>0&&(fullB<2||fullD<2)},
      {key:'inuse',icon:'🫁︎',title:'In Use',value:ready?by('In Use').length:null,unit:'on residents',lines:['Hours in use shown for Oxygen Therapy charge','Take off (empty / still full)']},
      {key:'empty',icon:'○',title:'Empty',value:ready?by('Empty').length:null,unit:'to refill',lines:[who.controller?'Send for refill from here':'Waiting for refill'],warn:by('Empty').length>0},
      {key:'refill',icon:'⟳',title:'At Refill',value:ready?by('At Refill').length:null,unit:'with vendor',lines:['Mark received back full']},
      {key:'register',icon:'▤',title:'Cylinder Register',value:ready?list.length:null,unit:'cylinders',lines:[`${list.filter(x=>x.status==='Out of Service').length} out of service`,`B-type: ${list.filter(x=>x.cylinder_size==='B-type').length} · D-type: ${list.filter(x=>x.cylinder_size==='D-type').length}`]},
      ...(who.controller?[{key:'add',icon:'＋',title:'Add Cylinders',valueText:'New',unit:'cylinder(s)',lines:['B-type (OXB-…) or D-type (OXD-…)']}]:[]),
      {key:'history',icon:'↕',title:'Movement History',value:ready?moves.filter(m=>String(m.moved_at).slice(0,10)>=todayISOIndia().slice(0,8)+'01').length:null,unit:'movements this month',lines:['Put on, taken off, refill']}
    ];
    const viewTitle=(tiles.find(t=>t.key===view)||{}).title||'';
    const statusFor={full:'Full',inuse:'In Use',empty:'Empty',refill:'At Refill'};
    const shown=(statusFor[view]?list.filter(x=>x.status===statusFor[view]):list.filter(x=>regStatus==='All'||x.status===regStatus)).filter(x=>sizeFilter==='All'||x.cylinder_size===sizeFilter);
    const cylEverUsed=c=>moves.some(m=>String(m.cylinder_id)===String(c.id)&&m.patient_id);
    async function doDeleteCyl(c){
      const r=prompt(`DELETE ${c.cylinder_no} (${c.cylinder_size}) from the register?\nUse this only for a wrong / duplicate entry. Reason:`,'Wrong entry');
      if(r===null)return;if(!r.trim())return equipmentNotify('error','Please give a reason for deleting.');
      if(busy)return;setBusy(true);const res=await client.rpc('oxy_delete',{p_cylinder_id:c.id,p_reason:r.trim()});setBusy(false);
      if(res.error)return equipmentNotify('error',equipmentErrorText(res.error));
      equipmentNotify('success',`${c.cylinder_no} deleted from the register.`);await load();
    }
    async function doPutOn(e){e.preventDefault();if(!putOn)return;const ok=await move(putOn,'put_on',putForm,`${putOn.cylinder_no} put on ${equipmentPatientName(patients,putForm.patient_id)}.`);if(ok){setPutOn(null);setPutForm({patient_id:'',location:'',remarks:''})}}
    async function doAdd(e){
      e.preventDefault();if(busy)return;const n=Math.min(50,Math.max(1,parseInt(addForm.count,10)||1));setBusy(true);let done=0,err=null;
      for(let i=0;i<n;i++){const r=await client.rpc('oxy_add',{p_size:addForm.size,p_status:addForm.status,p_serial_no:n===1?(addForm.serial_no||null):null,p_vendor:addForm.vendor||null,p_notes:addForm.notes||null});if(r.error){err=r.error;break}done++}
      setBusy(false);if(err)equipmentNotify('error',equipmentErrorText(err));
      if(done){equipmentNotify('success',`${done} ${addForm.size} cylinder(s) added.`);setAddForm({...addForm,count:'1',serial_no:'',notes:''});await load()}
    }
    function CylinderCard(c){
      const hrs=c.status==='In Use'?equipmentHoursSince(c.status_since):null;
      return h('article',{key:c.id,className:'stores-ledger-card equip-card'},
        h('div',{className:'stores-ledger-card-head'},h('strong',null,`${c.cylinder_no} · ${c.cylinder_size}`),h(EquipmentStatusPill,{status:c.status})),
        h('div',{className:'stores-ledger-card-fields'},
          c.status==='In Use'&&h('div',null,h('small',null,'Resident'),h('strong',null,equipmentPatientName(patients,c.current_patient_id))),
          c.status==='In Use'&&h('div',null,h('small',null,'In use since'),h('strong',null,`${formatDateTimeIN(c.status_since)} · ${hrs} h`)),
          c.status!=='In Use'&&h('div',null,h('small',null,'Location'),h('strong',null,c.current_location||'Stores')),
          c.status!=='In Use'&&h('div',null,h('small',null,`${c.status} since`),h('strong',null,formatDateTimeIN(c.status_since))),
          c.serial_no&&h('div',null,h('small',null,'Serial No.'),h('strong',null,c.serial_no)),
          c.refill_vendor&&h('div',null,h('small',null,'Refill vendor'),h('strong',null,c.refill_vendor))
        ),
        c.status==='In Use'&&h('p',{className:'small-note',style:{margin:'6px 0 0'}},`Charge through Approval Requests → Oxygen Therapy – ${c.cylinder_size} Cylinder – 6 / 12 / 24 Hours.`),
        h('div',{className:'equip-actions'},
          (who.controller||who.nurse)&&c.status==='Full'&&h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>{setPutOn(c);setPutForm({patient_id:'',location:'',remarks:''})}},'Put on Resident'),
          (who.controller||who.nurse)&&c.status==='In Use'&&h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>{const r=prompt(`Take ${c.cylinder_no} off — it is EMPTY. Remarks (optional):`,'');if(r!==null)move(c,'take_off_empty',{remarks:r},`${c.cylinder_no} marked Empty.`)}},'Take Off — Empty'),
          (who.controller||who.nurse)&&c.status==='In Use'&&h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>{const r=prompt(`Take ${c.cylinder_no} off — still FULL / not used. Remarks:`,'');if(r!==null)move(c,'take_off_unused',{remarks:r},`${c.cylinder_no} back to Full.`)}},'Take Off — Still Full'),
          who.controller&&c.status==='Empty'&&h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>{const v=prompt(`Send ${c.cylinder_no} for refill. Vendor name:`,c.refill_vendor||'');if(v!==null)move(c,'send_refill',{vendor:v},`${c.cylinder_no} sent for refill.`)}},'Send for Refill'),
          who.controller&&c.status==='At Refill'&&h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>{const r=prompt(`${c.cylinder_no} received back FULL from ${c.refill_vendor||'vendor'}? Remarks (bill no. etc.):`,'');if(r!==null)move(c,'receive_full',{remarks:r},`${c.cylinder_no} is Full again.`)}},'Received Back Full'),
          who.controller&&['Full','Empty'].includes(c.status)&&h('button',{type:'button',className:'btn btn-danger',disabled:busy,onClick:()=>{const r=prompt(`Mark ${c.cylinder_no} OUT OF SERVICE (damaged / test due). Reason:`,'');if(r)move(c,'out_of_service',{remarks:r},`${c.cylinder_no} out of service.`)}},'Out of Service'),
          who.controller&&c.status==='Out of Service'&&h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>move(c,'back_in_service',{},`${c.cylinder_no} back in service (Empty).`)},'Back in Service'),
          who.controller&&c.status!=='In Use'&&!cylEverUsed(c)&&h('button',{type:'button',className:'btn btn-danger',disabled:busy,title:'Only for a wrong / duplicate entry — never used for a resident',onClick:()=>doDeleteCyl(c)},'🗑︎ Delete (wrong entry)')
        ),
        putOn&&putOn.id===c.id&&h('form',{className:'equip-inline-form',onSubmit:doPutOn},
          h('div',{className:'grid two'},
            h('div',{className:'field'},h('label',null,'Resident *'),h(PatientPicker,{patients,value:putForm.patient_id,onChange:v=>setPutForm({...putForm,patient_id:v})})),
            h('div',{className:'field'},h('label',null,'Room / Location'),h('input',{value:putForm.location,onChange:e=>setPutForm({...putForm,location:e.target.value}),placeholder:'Blank = resident’s room'}))
          ),
          h('div',{className:'field'},h('label',null,'Remarks (flow rate, doctor advice)'),h('input',{value:putForm.remarks,onChange:e=>setPutForm({...putForm,remarks:e.target.value})})),
          h('div',{className:'equip-actions'},h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':'Put on Resident'),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setPutOn(null)},'Cancel'))
        )
      );
    }
    if(!who.canView)return h(Section,{title:'Oxygen Cylinders'},h('p',null,'Access is for Nursing, the Nursing Manager / Store In-charge and Admin.'));
    return h('div',{className:'stores-dash-wrap'},
      error&&h('div',{className:'message error',style:{marginBottom:'12px'}},error),
      !view&&h('div',{className:'stores-dash'},
        h(DashboardHero,{title:'Oxygen Cylinders',blurb:'B-type and D-type cylinders: Full → In use (resident / room) → Empty → At refill → Full. Oxygen is charged through Approval Requests (Oxygen Therapy).',onRefresh:()=>{setRows(null);load()}}),
        h(DashboardTiles,{tiles,onOpen:openView})
      ),
      view&&h(DashboardBackBar,{title:'Oxygen Cylinders',viewTitle,onBack:backToDashboard}),
      view==='add'&&who.controller&&h(Section,{title:'Add Cylinders',subtitle:'Each cylinder gets its own number (OXB-001 for B-type, OXD-001 for D-type) — paint or tag it on the cylinder.'},
        h('form',{onSubmit:doAdd},
          h('div',{className:'grid two'},
            h('div',{className:'field'},h('label',null,'Size *'),h('select',{value:addForm.size,onChange:e=>setAddForm({...addForm,size:e.target.value})},['B-type','D-type'].map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field'},h('label',null,'Condition now'),h('select',{value:addForm.status,onChange:e=>setAddForm({...addForm,status:e.target.value})},['Full','Empty'].map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field'},h('label',null,'How many'),h('input',{type:'number',min:'1',max:'50',value:addForm.count,onChange:e=>setAddForm({...addForm,count:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Serial No. (single cylinder only)'),h('input',{value:addForm.serial_no,disabled:(parseInt(addForm.count,10)||1)>1,onChange:e=>setAddForm({...addForm,serial_no:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Refill vendor'),h('input',{value:addForm.vendor,onChange:e=>setAddForm({...addForm,vendor:e.target.value})}))
          ),
          h('div',{className:'field'},h('label',null,'Notes'),h('textarea',{rows:2,value:addForm.notes,onChange:e=>setAddForm({...addForm,notes:e.target.value})})),
          h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':'Add Cylinders')
        )
      ),
      ['full','inuse','empty','refill','register'].includes(view)&&h(Section,{title:viewTitle,actions:h('div',{className:'stores-mode-switch',role:'tablist'},['All','B-type','D-type'].map(k=>h('button',{key:k,type:'button',role:'tab','aria-selected':sizeFilter===k,className:sizeFilter===k?'active':'',onClick:()=>setSizeFilter(k)},k)))},
        view==='register'&&h('div',{className:'stores-mode-switch',role:'tablist',style:{marginBottom:'10px',flexWrap:'wrap'}},['All','Full','In Use','Empty','At Refill','Out of Service'].map(k=>h('button',{key:k,type:'button',role:'tab','aria-selected':regStatus===k,className:regStatus===k?'active':'',onClick:()=>setRegStatus(k)},`${k} (${k==='All'?list.length:list.filter(x=>x.status===k).length})`))),
        shown.length?h('div',{className:'stores-expiry-list'},shown.map(CylinderCard)):h('div',{className:'stores-view-only',style:{padding:'20px',textAlign:'center'}},list.length?'Nothing here.':'No cylinders in the register yet.')
      ),
      view==='history'&&h(Section,{title:'Movement History'},
        moves.length?h('div',{className:'stores-expiry-list'},moves.slice(0,300).map(m=>{const c=list.find(x=>String(x.id)===String(m.cylinder_id));return h('article',{key:m.id,className:'stores-ledger-card'},
          h('div',{className:'stores-ledger-card-head'},h('strong',null,`${c?.cylinder_no||''} · ${c?.cylinder_size||''}`),h('span',null,formatDateTimeIN(m.moved_at))),
          h('div',{className:'stores-ledger-card-fields'},h('div',null,h('small',null,'Action'),h('strong',null,m.action)),m.patient_id&&h('div',null,h('small',null,'Resident'),h('strong',null,equipmentPatientName(patients,m.patient_id))),m.vendor&&h('div',null,h('small',null,'Vendor'),h('strong',null,m.vendor)),h('div',null,h('small',null,'By'),h('strong',null,m.actor_name||'—')),m.remarks&&h('div',null,h('small',null,'Remarks'),h('strong',null,m.remarks))))})):h('div',{className:'stores-view-only',style:{padding:'20px',textAlign:'center'}},'No movements yet.')
      )
    );
  }
