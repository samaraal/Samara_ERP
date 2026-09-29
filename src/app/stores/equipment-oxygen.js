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
  function equipmentErrorText(error){const m=String(error?.message||error||'');return /does not exist|schema cache|could not find/i.test(m)?EQUIP_NOT_INSTALLED:m}
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
    const {view,openView,backToDashboard}=useDashboardView();
    const who=useEquipmentPeople(profile);
    const [rows,setRows]=React.useState(null),[moves,setMoves]=React.useState([]),[patients,setPatients]=React.useState([]),[bio,setBio]=React.useState([]);
    const [error,setError]=React.useState(''),[busy,setBusy]=React.useState(false),[search,setSearch]=React.useState('');
    const [issueFor,setIssueFor]=React.useState(null),[issueForm,setIssueForm]=React.useState({patient_id:'',location:'',remarks:''});
    const blankAdd={charge_key:'',equipment_name:'',serial_no:'',next_service_due:'',location:'Stores',notes:'',count:'1'};
    const [addForm,setAddForm]=React.useState(blankAdd);
    async function load(){
      const [e,m,p,c]=await Promise.all([
        client.from('biomedical_equipment').select('*').order('asset_no'),
        client.from('biomedical_equipment_movements').select('*').order('moved_at',{ascending:false}).limit(1000),
        client.from('patients').select('id,title,full_name,patient_id,room_no,bed_no,is_active').eq('is_active',true).order('full_name'),
        client.rpc('get_charge_service_catalog')
      ]);
      if(e.error){setError(equipmentErrorText(e.error));setRows([]);return}
      setError('');setRows(e.data||[]);if(!m.error)setMoves(m.data||[]);if(!p.error)setPatients(p.data||[]);
      if(!c.error)setBio((c.data||[]).filter(x=>x.category==='Biomedical Equipment'&&x.is_active!==false));
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
      {key:'inuse',icon:'♿︎',title:'In Use',value:ready?counts.inuse:null,unit:'with residents',lines:[`${new Set(list.filter(x=>x.status==='In Use').map(x=>x.current_patient_id).filter(Boolean)).size} resident(s)`,'Return from here']},
      {key:'available',icon:'✓',title:'Available',value:ready?counts.available:null,unit:'ready to issue',lines:[who.controller?'Issue to a resident / room':'In Stores']},
      {key:'service',icon:'🛠︎',title:'Service Due',value:ready?serviceDue.length:null,unit:'within 7 days',lines:[`${counts.overdue} overdue`],alert:counts.overdue>0,warn:serviceDue.length>0},
      {key:'repair',icon:'⚠︎',title:'Under Repair',value:ready?counts.repair:null,unit:'pieces',lines:['Back in service from here'],warn:counts.repair>0},
      {key:'register',icon:'▤',title:'Equipment Register',value:ready?active.length:null,unit:'pieces',lines:[`${bio.length} Charge Master Biomedical item(s)`,'Search by asset no., name, serial']},
      ...(who.controller?[{key:'add',icon:'＋',title:'Add Equipment',valueText:'New',unit:'piece(s)',lines:['Linked to its Charge Master item and BIO code']}]:[]),
      {key:'history',icon:'↕',title:'Movement History',value:ready?monthMoves.length:null,unit:'movements this month',lines:['Issued, returned, repair, service']}
    ];
    const viewTitle=(tiles.find(t=>t.key===view)||{}).title||'';
    const q=search.trim().toLowerCase();
    const shown=(view==='inuse'?list.filter(x=>x.status==='In Use'):view==='available'?list.filter(x=>x.status==='Available'):view==='service'?serviceDue:view==='repair'?list.filter(x=>x.status==='Under Repair'):list)
      .filter(x=>q.length<2||`${x.asset_no} ${x.equipment_name} ${x.serial_no||''} ${x.charge_code||''} ${equipmentPatientName(patients,x.current_patient_id)}`.toLowerCase().includes(q));
    async function doIssue(e){
      e.preventDefault();if(!issueFor)return;
      const ok=await run('bme_issue',{p_equipment_id:issueFor.id,p_patient_id:issueForm.patient_id||null,p_location:issueForm.location||null,p_remarks:issueForm.remarks||null},`${issueFor.asset_no} ${issueFor.equipment_name} issued.`);
      if(ok){setIssueFor(null);setIssueForm({patient_id:'',location:'',remarks:''})}
    }
    function doReturn(x){const r=prompt(`Return ${x.asset_no} ${x.equipment_name} from ${equipmentPatientName(patients,x.current_patient_id)}? Remarks (optional):`,'');if(r===null)return;run('bme_return',{p_equipment_id:x.id,p_remarks:r||null},`${x.asset_no} returned to Stores.`)}
    function askDate(label,current){const v=prompt(`${label} (DD-MM-YYYY), or leave blank:`,current?formatDateIN(current):'');if(v===null)return undefined;const t=v.trim();if(!t)return null;const m=t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);if(!m){alert('Please enter the date as DD-MM-YYYY.');return undefined}return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`}
    function doStatus(x,status){
      let due=null;
      if(status==='Serviced'){due=askDate('Next service due date',x.next_service_due);if(due===undefined)return}
      const r=prompt(`${status==='Under Repair'?'Send for repair':status==='Out of Service'?'Mark out of service':status==='Serviced'?'Mark serviced':'Back in service'}: ${x.asset_no} ${x.equipment_name}. Remarks:`,'');if(r===null)return;
      run('bme_set_status',{p_equipment_id:x.id,p_status:status,p_next_service_due:due,p_remarks:r||null},`${x.asset_no} updated.`);
    }
    async function doAdd(e){
      e.preventDefault();if(busy)return;
      const item=bio.find(b=>`${b.charge_code||''}|${b.service_name}`===addForm.charge_key);
      const name=String(addForm.equipment_name||item?.service_name||'').trim();
      if(!name)return equipmentNotify('error','Enter the equipment name or choose its Charge Master item.');
      const n=Math.min(50,Math.max(1,parseInt(addForm.count,10)||1));
      setBusy(true);let done=0,err=null;
      for(let i=0;i<n;i++){
        const res=await client.rpc('bme_add',{p_equipment_name:name,p_charge_code:item?.charge_code||null,p_charge_service_name:item?.service_name||null,p_serial_no:n===1?(addForm.serial_no||null):null,p_next_service_due:addForm.next_service_due||null,p_notes:addForm.notes||null,p_location:addForm.location||null});
        if(res.error){err=res.error;break}done++;
      }
      setBusy(false);
      if(err)equipmentNotify('error',equipmentErrorText(err));
      if(done){equipmentNotify('success',`${done} × ${name} added to the register.`);setAddForm(blankAdd);await load()}
    }
    function EquipmentCard(x){
      const days=x.status==='In Use'?equipmentDaysSince(x.issued_at):null;
      const due=x.next_service_due?String(x.next_service_due).slice(0,10):'';
      return h('article',{key:x.id,className:'stores-ledger-card equip-card'},
        h('div',{className:'stores-ledger-card-head'},h('strong',null,`${x.asset_no} · ${x.equipment_name}`),h(EquipmentStatusPill,{status:x.status})),
        h('div',{className:'stores-ledger-card-fields'},
          h('div',null,h('small',null,'Charge Master'),h('strong',null,x.charge_code?`${x.charge_code} · ${x.charge_service_name||''}`:'Not charged to residents')),
          x.serial_no&&h('div',null,h('small',null,'Serial No.'),h('strong',null,x.serial_no)),
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
          who.controller&&['Available','Under Repair'].includes(x.status)&&h('button',{type:'button',className:'btn btn-danger',disabled:busy,onClick:()=>doStatus(x,'Out of Service')},'Out of Service')
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
      view==='add'&&who.controller&&h(Section,{title:'Add Equipment',subtitle:'Choose the Charge Master "Biomedical Equipment" item this piece is charged as (same item, BIO code and rate in Bills & Charges and Accounts). Add several identical pieces at once with "How many".'},
        !bio.length&&h('p',{className:'message',style:{marginBottom:'10px'}},'No Biomedical Equipment items in Charge Master yet. Admin can add them in Charge Master (category "Biomedical Equipment", daily rate). Equipment that is never charged can still be added.'),
        h('form',{onSubmit:doAdd},
          h('div',{className:'grid two'},
            h('div',{className:'field'},h('label',null,'Charge Master item'),h('select',{value:addForm.charge_key,onChange:e=>{const it=bio.find(b=>`${b.charge_code||''}|${b.service_name}`===e.target.value);setAddForm({...addForm,charge_key:e.target.value,equipment_name:addForm.equipment_name||it?.service_name||''})}},h('option',{value:''},'Not charged to residents'),bio.map(b=>h('option',{key:`${b.charge_code}|${b.service_name}`,value:`${b.charge_code||''}|${b.service_name}`},`${b.charge_code?b.charge_code+' · ':''}${b.service_name}`)))),
            h('div',{className:'field'},h('label',null,'Equipment name *'),h('input',{required:true,value:addForm.equipment_name,onChange:e=>setAddForm({...addForm,equipment_name:e.target.value}),placeholder:'e.g. Air Mattress, Pulse Oximeter'})),
            h('div',{className:'field'},h('label',null,'How many pieces'),h('input',{type:'number',min:'1',max:'50',value:addForm.count,onChange:e=>setAddForm({...addForm,count:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Serial No. (single piece only)'),h('input',{value:addForm.serial_no,disabled:(parseInt(addForm.count,10)||1)>1,onChange:e=>setAddForm({...addForm,serial_no:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Next service due'),h(StrictDateInput,{value:addForm.next_service_due,onChange:e=>setAddForm({...addForm,next_service_due:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Location'),h('input',{value:addForm.location,onChange:e=>setAddForm({...addForm,location:e.target.value})}))
          ),
          h('div',{className:'field'},h('label',null,'Notes'),h('textarea',{rows:2,value:addForm.notes,onChange:e=>setAddForm({...addForm,notes:e.target.value})})),
          h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':'Add to Register')
        )
      ),
      ['inuse','available','service','repair','register'].includes(view)&&h(Section,{title:viewTitle,subtitle:view==='inuse'?'Charge in Bills & Charges → Biomedical Equipment: quantity = days in use.':null},
        h('div',{className:'field',style:{marginBottom:'12px'}},h('input',{type:'search',value:search,onChange:e=>setSearch(e.target.value),placeholder:'Search asset no., name, serial, resident'})),
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
      {key:'register',icon:'▤',title:'Cylinder Register',value:ready?list.filter(x=>x.status!=='Out of Service').length:null,unit:'cylinders',lines:[`B-type: ${list.filter(x=>x.cylinder_size==='B-type').length} · D-type: ${list.filter(x=>x.cylinder_size==='D-type').length}`]},
      ...(who.controller?[{key:'add',icon:'＋',title:'Add Cylinders',valueText:'New',unit:'cylinder(s)',lines:['B-type (OXB-…) or D-type (OXD-…)']}]:[]),
      {key:'history',icon:'↕',title:'Movement History',value:ready?moves.filter(m=>String(m.moved_at).slice(0,10)>=todayISOIndia().slice(0,8)+'01').length:null,unit:'movements this month',lines:['Put on, taken off, refill']}
    ];
    const viewTitle=(tiles.find(t=>t.key===view)||{}).title||'';
    const statusFor={full:'Full',inuse:'In Use',empty:'Empty',refill:'At Refill'};
    const shown=(statusFor[view]?list.filter(x=>x.status===statusFor[view]):list).filter(x=>sizeFilter==='All'||x.cylinder_size===sizeFilter);
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
          who.controller&&c.status==='Out of Service'&&h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>move(c,'back_in_service',{},`${c.cylinder_no} back in service (Empty).`)},'Back in Service')
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
        shown.length?h('div',{className:'stores-expiry-list'},shown.map(CylinderCard)):h('div',{className:'stores-view-only',style:{padding:'20px',textAlign:'center'}},list.length?'Nothing here.':'No cylinders in the register yet.')
      ),
      view==='history'&&h(Section,{title:'Movement History'},
        moves.length?h('div',{className:'stores-expiry-list'},moves.slice(0,300).map(m=>{const c=list.find(x=>String(x.id)===String(m.cylinder_id));return h('article',{key:m.id,className:'stores-ledger-card'},
          h('div',{className:'stores-ledger-card-head'},h('strong',null,`${c?.cylinder_no||''} · ${c?.cylinder_size||''}`),h('span',null,formatDateTimeIN(m.moved_at))),
          h('div',{className:'stores-ledger-card-fields'},h('div',null,h('small',null,'Action'),h('strong',null,m.action)),m.patient_id&&h('div',null,h('small',null,'Resident'),h('strong',null,equipmentPatientName(patients,m.patient_id))),m.vendor&&h('div',null,h('small',null,'Vendor'),h('strong',null,m.vendor)),h('div',null,h('small',null,'By'),h('strong',null,m.actor_name||'—')),m.remarks&&h('div',null,h('small',null,'Remarks'),h('strong',null,m.remarks))))})):h('div',{className:'stores-view-only',style:{padding:'20px',textAlign:'center'}},'No movements yet.')
      )
    );
  }
