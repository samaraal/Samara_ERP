  function ChargeMasterPage({profile}){
    const [serviceRows,setServiceRows]=React.useState([]),[storeRows,setStoreRows]=React.useState([]),[busy,setBusy]=React.useState(false),[search,setSearch]=React.useState('');
    const notify=(type,text)=>showSamaraActionToast(type,type==='success'?'Saved successfully':'Action failed',text);
    const stockCategories=['Consumables','Pharmacy','Pharmacy & Basic Supplies'];
    async function load(){
      const [services,stores]=await Promise.all([
        client.from('charge_tariff_master').select('*').order('category').order('display_order').order('service_name'),
        client.from('consumable_store_items').select('id,item_code,item_name,unit,active,item_category,charge_rate').order('item_category').order('item_name')
      ]);
      if(services.error){notify('error',services.error.message);return}
      if(stores.error){notify('error',stores.error.message);return}
      setServiceRows((services.data||[]).filter(row=>!stockCategories.includes(String(row.category||'').trim())));
      setStoreRows(stores.data||[]);
    }
    React.useEffect(()=>{load()},[]);
    const normalizeChargeName=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
    const chargeNameTokens=value=>new Set(normalizeChargeName(value).split(' ').filter(Boolean).map(x=>x.length>3&&x.endsWith('s')?x.slice(0,-1):x));
    const findSimilarService=(category,name,excludeId='')=>{const n=normalizeChargeName(name),a=chargeNameTokens(name);let best=null,bestScore=0;for(const x of serviceRows){if(String(x.id)===String(excludeId)||String(x.category)!==String(category))continue;const xn=normalizeChargeName(x.service_name);if(xn===n)return {...x,_score:1};const b=chargeNameTokens(x.service_name),intersection=[...a].filter(t=>b.has(t)).length,union=new Set([...a,...b]).size,score=union?intersection/union:0;const numsA=[...a].filter(t=>/^\d+(?:\.\d+)?$/.test(t)).sort().join('|'),numsB=[...b].filter(t=>/^\d+(?:\.\d+)?$/.test(t)).sort().join('|');if(numsA!==numsB)continue;if(score>bestScore){bestScore=score;best=x}}return bestScore>=0.72?best:null};
    async function saveService(row){
      const category=prompt('Charge category:',row?.category||'Nursing Procedures'); if(category===null||!String(category).trim())return;
      if(stockCategories.includes(String(category).trim())){notify('error','Consumables and Pharmacy items are controlled only from Stores Master. Add or edit the item there so the same item name, ID and rate are used everywhere.');return}
      const serviceName=prompt('Chargeable service / item:',row?.service_name||''); if(serviceName===null||!String(serviceName).trim())return;
      const duplicate=findSimilarService(String(category).trim(),String(serviceName).trim(),row?.id||'');if(duplicate){notify('error',`${duplicate.charge_code?duplicate.charge_code+' · ':''}${duplicate.service_name} already exists or is too similar under ${duplicate.category}. Use/edit the existing procedure instead; genuine variants must include their distinguishing detail.`);return}
      const entered=prompt('Admin-fixed tariff when no external bill is available (leave blank to set later):',row?.amount!=null?String(row.amount):''); if(entered===null)return;
      const amount=String(entered).trim()===''?null:Number(entered); if(amount!==null&&(!Number.isFinite(amount)||amount<=0)){notify('error','Enter a valid tariff greater than zero, or leave it blank.');return}
      setBusy(true); const payload={category:String(category).trim(),service_name:String(serviceName).trim(),amount,is_active:row?.is_active!==false,updated_by:profile.id,updated_at:new Date().toISOString()};
      const result=row?.id?await client.from('charge_tariff_master').update(payload).eq('id',row.id):await client.from('charge_tariff_master').insert(payload); setBusy(false);
      if(result.error)notify('error',result.error.message); else {notify('success',row?.id?'Charge Master service updated.':'Charge Master service added.');load()}
    }
    async function toggleService(row){setBusy(true);const {error}=await client.from('charge_tariff_master').update({is_active:row.is_active===false,updated_by:profile.id,updated_at:new Date().toISOString()}).eq('id',row.id);setBusy(false);if(error)notify('error',error.message);else load()}
    async function editStoreRate(row){
      const entered=prompt(`Fixed patient charge rate for ${row.item_name}:`,row?.charge_rate!=null?String(row.charge_rate):'');
      if(entered===null)return;
      const rate=String(entered).trim()===''?null:Number(entered);
      if(rate!==null&&(!Number.isFinite(rate)||rate<=0)){notify('error','Enter a valid rate greater than zero, or leave it blank.');return}
      setBusy(true);
      const {error}=await client.from('consumable_store_items').update({charge_rate:rate,updated_at:new Date().toISOString()}).eq('id',row.id);
      if(error){setBusy(false);notify('error',error.message);return}
      const verify=await client.from('consumable_store_items').select('charge_rate').eq('id',row.id).maybeSingle();setBusy(false);
      if(verify.error||!verify.data||((rate===null)!=(verify.data.charge_rate===null))||(rate!==null&&Math.abs(Number(verify.data.charge_rate)-rate)>0.009)){notify('error','The database did not confirm the new rate. No success has been recorded.');return}
      notify('success','Stores / Pharmacy charge rate saved and verified.');load()
    }
    if(profile?.role!=='Admin')return h(Section,{title:'Charge Master'},h('p',null,'Administrator access only.'));
    const q=String(search||'').trim().toLowerCase();
    const match=row=>q.length<3||`${row.category||row.item_category||''} ${row.service_name||row.item_name||''}`.toLowerCase().includes(q);
    const visibleStores=storeRows.filter(match),visibleServices=serviceRows.filter(match);
    return h(React.Fragment,null,
      h(Section,{title:'Charge Master',subtitle:'Stores / Pharmacy items use the exact live Stores Master item name, ID and charge rate. Separate aliases are not permitted. Non-stock service tariffs remain controlled here.'},
        h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'end',gap:'12px',marginBottom:'10px',flexWrap:'wrap'}},
          h('div',{className:'field',style:{minWidth:'280px',margin:0}},h('label',null,'Search Charge Items'),h('input',{type:'search',value:search,onChange:e=>setSearch(e.target.value),placeholder:'Type at least 3 letters...'}),q.length>0&&q.length<3?h('small',null,'Enter at least 3 letters to filter.'):null),
          h('button',{className:'btn btn-primary',disabled:busy,onClick:()=>saveService(null)},'+ Add Service Charge')
        ),
        h(LogTable,{title:`Stores / Pharmacy Items (${visibleStores.length})`,heads:['Item ID','Category','Exact Stores Item','Unit','Fixed Charge Rate','Status','Action'],rows:visibleStores.map(row=>[row.item_code||'—',row.item_category||'Consumables',row.item_name,row.unit||'—',row.charge_rate!=null?`₹${Number(row.charge_rate||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`:'Not set',row.active===false?'Inactive':'Active',h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>editStoreRate(row)},'Edit Rate')])}),
        h(LogTable,{title:`Non-stock Service Charges (${visibleServices.length})`,heads:['ID','Category','Service','Fixed Tariff (No Bill)','Status','Action'],rows:visibleServices.map(row=>[row.charge_code||'—',row.category,row.service_name,row.amount!=null?`₹${Number(row.amount||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`:'Not set',row.is_active===false?'Inactive':'Active',h('div',{className:'employee-actions'},h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>saveService(row)},'Edit'),h('button',{className:row.is_active===false?'btn btn-primary':'btn btn-danger',disabled:busy,onClick:()=>toggleService(row)},row.is_active===false?'Activate':'Deactivate'))])})
      )
    );
  }
  function ClinicalCharges({profile,initialPatientId=''}){
    const chargeStock=usePharmacyStock();
    const storeCategories=['Consumables','Pharmacy','Pharmacy & Basic Supplies'];
    const normalStoreName=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
    const matchingStock=name=>{const wanted=normalStoreName(name);const matches=chargeStock.items.filter(x=>normalStoreName(x.item_name)===wanted);return matches.length===1?matches[0]:null};
    const matchingStoreMaster=(category,name,itemId)=>{
      if(itemId){const byId=(storeMaster||[]).find(x=>String(x.id)===String(itemId));if(byId)return byId;}
      const wanted=normalStoreName(name);if(!wanted)return null;
      const matches=(storeMaster||[]).filter(x=>x.active!==false&&normalStoreName(x.item_name)===wanted);
      if(matches.length===1)return matches[0];
      const categoryMatches=matches.filter(x=>normalStoreName(x.item_category)===normalStoreName(category)||
        (category==='Pharmacy & Basic Supplies'&&normalStoreName(x.item_category)==='pharmacy'));
      return categoryMatches.length===1?categoryMatches[0]:null;
    };
    const stockDefaults=(category,name)=>{const stockItem=storeCategories.includes(category)?matchingStock(name):null;const masterItem=matchingStoreMaster(category,name,stockItem?.item_id);const rate=Number(masterItem?.charge_rate||0);return {store_item_id:stockItem?.item_id||masterItem?.id||'',charge_item_code:masterItem?.item_code||'',unit:stockItem?.unit||masterItem?.unit||'Service',unit_cost:rate||'',requested_amount:rate||''}};
    const canRaise=['Admin','Manager','Nurse','Accounts'].includes(profile?.role);
    const canApprove=profile?.role==='Accounts';
    const canManageTariffs=profile?.role==='Admin';
    const [patients]=usePatients();
    const [rows,setRows]=React.useState([]);
    const [patientLedgerRows,setPatientLedgerRows]=React.useState([]);
    const [diagnostics,setDiagnostics]=React.useState([]);
    const [show,setShow]=React.useState(false);
    const [busy,setBusy]=React.useState(false);
    const [toast,setToast]=React.useState(null);
    const [files,setFiles]=React.useState([]);
    const [batchItems,setBatchItems]=React.useState([]);
    const [tariffs,setTariffs]=React.useState([]);
    const [catalog,setCatalog]=React.useState([]);
    const [storeMaster,setStoreMaster]=React.useState([]);
    const [receivedIndents,setReceivedIndents]=React.useState([]);
    const [patientReturns,setPatientReturns]=React.useState([]);
    const [storeAllocations,setStoreAllocations]=React.useState([]);
    const [tariffBusy,setTariffBusy]=React.useState(false);
    const [isChargeMobile,setIsChargeMobile]=React.useState(()=>typeof window!=='undefined'&&window.matchMedia('(max-width: 760px)').matches);
    React.useEffect(()=>{if(typeof window==='undefined')return;const mq=window.matchMedia('(max-width: 760px)');const sync=()=>setIsChargeMobile(mq.matches);sync();mq.addEventListener?.('change',sync);return()=>mq.removeEventListener?.('change',sync)},[]);
    const defaultCategories={
      'Doctor Services':['General Physician Visit','Emergency Doctor Visit','Specialist Consultation','Teleconsultation','Home Visit','Follow-up Consultation'],
      'Nursing Procedures':['Blood Glucose Monitoring','Blood Sample Collection','Blood Transfusion Assistance','Bladder Wash','Catheterization','Urinary Catheterization / Change','Dressing','Dressing - Minor','Dressing - Major','Wound / Pressure Sore Dressing','ECG','Enema','Injection','Injection - IM / IV / SC','IV Cannulation','IV Fluid Administration','Nebulization - Own Nebulizer','Nebulization - Samara Nebulizer','Oxygen Therapy','Pressure Sore Care','Ryle’s Tube Feeding','Ryle’s / NG Tube Insertion','Ryle’s / NG Tube Change','Stoma Care','Suctioning','Tracheostomy Suctioning','Tracheostomy Dressing / Care','Wound Care','Other Nursing Procedure'],
      'Physiotherapy':['Regular Physiotherapy Session','Additional Physiotherapy Session','Walking Training','Gait Training','Balance Training','Respiratory Physiotherapy','Electrotherapy','Home Exercise Training','Mobility Assessment','Wheelchair Training','Other Physiotherapy Service'],
      'Laboratory Services':['Blood Sample Collection','Urine Sample Collection','Stool Sample Collection','Sputum Sample Collection','Swab Collection','Complete Blood Count (CBC)','Blood Sugar','HbA1c','Renal Function Test (RFT)','Liver Function Test (LFT)','Lipid Profile','Thyroid Profile','Electrolytes','Coagulation Profile','Urine Routine','Urine Culture','Blood Culture','COVID / Influenza Test','Other Laboratory Test'],
      'Diagnostic / Imaging':['X-Ray','Ultrasound','CT Scan','MRI','ECG','Echo','Doppler','Endoscopy','Colonoscopy','Other Imaging'],
      'Hospital Visits':['Patient Taken to Hospital','Hospital Bill Paid by Samara','Hospital Registration Fee','Investigation Charges','Outside Pharmacy Purchase','Radiology Charges'],
      'Transport':['Ambulance','Samara Vehicle','Taxi','Auto','Fuel','Toll','Parking'],
      'Special Care':['Special Nurse','Extra Caregiver','Additional Nursing Hours','Night Duty Charges'],
      'Pharmacy & Basic Supplies':["Glucometer Strips", "Lancets", "Alcohol Swabs", "Digital Thermometer", "Thermometer Probe Covers", "Pulse Oximeter", "BP Cuff / Spare Cuff", "Sterile Gauze Pads - 2 x 2", "Sterile Gauze Pads - 4 x 4", "Cotton Rolls", "Cotton Balls", "Micropore Adhesive Tape", "Sterile Dressing Pads", "Crepe Bandage - 2 inch", "Crepe Bandage - 4 inch", "Crepe Bandage - 6 inch", "Roller / Gauze Bandages", "Disposable Examination Gloves - S", "Disposable Examination Gloves - M", "Disposable Examination Gloves - L", "Surgical Masks", "Disposable Syringe - 1 mL", "Disposable Syringe - 2 mL", "Disposable Syringe - 3 mL", "Disposable Syringe - 5 mL", "Disposable Syringe - 10 mL", "Disposable Syringe - 20 mL", "Needle - 18G", "Needle - 20G", "Needle - 21G", "Needle - 22G", "Needle - 23G", "Needle - 24G", "Needle - 25G", "Needle - 26G", "Insulin Syringe - U-40", "Insulin Syringe - U-100", "Insulin Pen Needle - 4 mm", "Insulin Pen Needle - 5 mm", "Insulin Pen Needle - 6 mm", "Insulin Pen Needle - 8 mm", "IV Cannula - 18G", "IV Cannula - 20G", "IV Cannula - 22G", "IV Cannula - 24G", "IV Sets", "IV Extension Lines", "Normal Saline Flush Syringes", "Urine Specimen Containers", "Disposable Urine Measuring Containers", "Adult Urine Bags", "Nebulizer Mask / Kit - Adult", "Oxygen Nasal Cannula", "Oxygen Masks", "Suction Catheter - 10 Fr", "Suction Catheter - 12 Fr", "Suction Catheter - 14 Fr", "Suction Catheter - 16 Fr", "Feeding Syringe - 50 mL", "Feeding Syringe - 60 mL", "Disposable Underpads", "Tongue Depressors", "Hand Sanitizer", "Povidone-iodine Solution", "Chlorhexidine Antiseptic - As per Samara Protocol", "Normal Saline for Wound Cleansing", "Sharps Disposal Containers", "Biomedical-waste Bags"],
      'Consumables':['Adult Diapers','Gloves','Syringes','Dressing Materials','PPE','Feeding Tubes','Catheters','Oxygen Consumables','Other Consumables'],
      'Food & Nutrition':['Special Diet','Nutritional Supplements','Tube Feed Formula','Outside Food Purchase'],
      'Miscellaneous':['Laundry','Courier','Miscellaneous Expense']
    };
    const catalogCategories=React.useMemo(()=>{
      const map={};
      (catalog||[]).filter(row=>row.is_active!==false).forEach(row=>{
        const category=String(row.category||'Miscellaneous').trim()||'Miscellaneous';
        const service=String(row.service_name||'').trim();
        if(!service)return;
        if(!map[category])map[category]=[];
        if(!map[category].includes(service))map[category].push(service);
      });
      Object.keys(map).forEach(category=>{
        map[category].sort((a,b)=>a.localeCompare(b));
        if(!map[category].includes('Others'))map[category].push('Others');
      });
      return map;
    },[catalog]);
    const fallbackCategories=Object.fromEntries(Object.entries(defaultCategories).map(([category,services])=>[category,services.includes('Others')?services:[...services,'Others']]));
    const categories=React.useMemo(()=>{
      // Nurses may raise Nursing Procedure service charges plus patient-specific
      // Consumables/Pharmacy charges. Inventory categories must still come only
      // from the live Stores master; Nursing Procedures are services and do not
      // require an indent/received stock balance.
      if(profile?.role==='Nurse'){
        const nurseCategories={};
        const nursingProcedures=(catalogCategories['Nursing Procedures']||fallbackCategories['Nursing Procedures']||[]).filter(Boolean);
        if(nursingProcedures.length)nurseCategories['Nursing Procedures']=[...new Set(nursingProcedures)];
        ['Consumables','Pharmacy'].forEach(cat=>{
          const names=storeMaster.filter(x=>(x.item_category||'Consumables')===cat&&x.active!==false&&Number(x.charge_rate)>0).map(x=>x.item_name).filter(Boolean).sort((a,b)=>a.localeCompare(b));
          if(names.length)nurseCategories[cat]=[...new Set(names)];
        });
        return nurseCategories;
      }
      const base=Object.keys(catalogCategories).length?{...catalogCategories}:{...fallbackCategories};
      ['Consumables','Pharmacy'].forEach(cat=>{
        const names=storeMaster.filter(x=>(x.item_category||'Consumables')===cat&&x.active!==false&&Number(x.charge_rate)>0).map(x=>x.item_name).filter(Boolean).sort((a,b)=>a.localeCompare(b));
        if(names.length)base[cat]=[...new Set([...names,'Others'])];
      });
      return base;
    },[catalogCategories,storeMaster,profile?.role]);

    const fresh=()=>({
      patient_id:'',store_item_id:'',charge_item_code:'',charge_date:todayISOIndia(),service_datetime:localDateTimeValue(),
      category:'Doctor Services',service_name:'General Physician Visit',other_service_name:'',
      service_provider:'',doctor_name:'',description:'General Physician Visit',
      quantity:'1',unit:'Service',unit_cost:'',requested_amount:'',urgency:'Routine',
      billable:true,bill_available:false,bill_number:'',bill_date:'',
      hospital_name:'',visit_reason:'',out_time:'',return_time:'',escort_staff:'',
      relative_accompanied:false,admission_required:false,
      laboratory_name:'',test_name:'',sample_type:'',sample_collected_at:'',
      report_status:'Ordered',report_received_at:'',transport_type:'',paid_by_samara:false,remarks:''
    });
    const [form,setForm]=React.useState(fresh());
    const [filter,setFilter]=React.useState({patient_id:initialPatientId,status:initialPatientId?'Pending':'All',category:'All'});
    const [quickView,setQuickView]=React.useState('All');
    const [workflowRequestId,setWorkflowRequestId]=React.useState('');
    React.useEffect(()=>{
      if(profile?.role!=='Accounts')return;
      try{
        const raw=sessionStorage.getItem('samara-workflow-target');
        if(!raw)return;
        const target=JSON.parse(raw);
        if(target?.type==='charge-request'&&target?.request_id){
          setWorkflowRequestId(String(target.request_id));
          setQuickView('All');
          setFilter(current=>({...current,patient_id:'',status:'All',category:'All'}));
          sessionStorage.removeItem('samara-workflow-target');
        }
      }catch(_error){}
    },[profile?.id,profile?.role]);
    React.useEffect(()=>{
      if(!workflowRequestId||!rows.some(row=>String(row.id)===workflowRequestId))return;
      const timer=setTimeout(()=>{
        const node=document.getElementById(`charge-request-${workflowRequestId}`)||document.getElementById('bill-charge-register');
        if(node)node.scrollIntoView({behavior:'smooth',block:'center'});
      },80);
      return()=>clearTimeout(timer);
    },[workflowRequestId,rows]);

    const notify=(type,text)=>{showSamaraActionToast(type,type==='success'?'Saved successfully':'Action failed',text);setToast({type,text});setTimeout(()=>setToast(null),4500)};
    function openChargeView(view){
      setQuickView(view);
      if(view==='Pending')setFilter(current=>({...current,status:'Pending'}));
      else if(view==='Approved')setFilter(current=>({...current,status:'All'}));
      else if(view==='Approved Today')setFilter(current=>({...current,status:'All'}));
      else if(view==='Today')setFilter(current=>({...current,status:'All'}));
      else setFilter(current=>({...current,status:'All'}));
      setTimeout(()=>{
        const node=document.getElementById('bill-charge-register');
        if(node)node.scrollIntoView({behavior:'smooth',block:'start'});
      },60);
    }
    const pFor=id=>patients.find(p=>p.id===id)||{};
    const pLabel=id=>{const p=pFor(id);return p.id?`${formalName(p)} · ${p.patient_id||'—'} · Room ${p.room_no||'—'}-${p.bed_no||'—'}`:'—'};
    const money=v=>v!==null&&v!==undefined&&v!==''?`₹${Number(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`:'—';

    async function load(){
      const authResult=await client.auth.getUser();
      const authUserId=authResult.data?.user?.id||null;

      const masterRequest=['Admin','Accounts'].includes(profile?.role)
        ?client.from('charge_tariff_master').select('*').order('category').order('display_order').order('service_name')
        :client.rpc('get_charge_service_catalog');
      const [a,b,c,d,e,f,g]=await Promise.all([
        client.from('bill_charge_requests')
          .select('*')
          .order('created_at',{ascending:false})
          .limit(1000),
        client.from('diagnostic_services')
          .select('*')
          .order('ordered_at',{ascending:false})
          .limit(500),
        masterRequest,
        client.from('consumable_store_items').select('id,item_code,item_name,unit,active,item_category,strength,dosage_form,charge_rate').eq('active',true).order('item_name'),
        client.from('patient_consumable_indents').select('id,patient_id,store_item_id,item_name,unit,status,received_qty,received_at').eq('status','Received').order('received_at',{ascending:true}),
        client.from('bill_charge_store_allocations').select('id,charge_request_id,indent_id,patient_id,store_item_id,allocated_qty').order('created_at',{ascending:true}),
        client.from('patient_store_returns').select('id,indent_id,patient_id,store_item_id,quantity,status').neq('status','Rejected')
      ]);

      if(a.error)notify('error',a.error.message);

      const allRequests=a.data||[];
      const visibleRequests=profile?.role==='Nurse'
        ?allRequests.filter(row=>
            row.raised_by===authUserId||
            row.raised_by===profile.id||
            String(row.raised_by_name||'').trim().toLowerCase()===
              String(formalName(profile)||profile?.full_name||profile?.username||'').trim().toLowerCase()
          )
        :allRequests;

      setRows(visibleRequests);
      if(!d?.error)setStoreMaster(d.data||[]);
      if(!e?.error)setReceivedIndents(e.data||[]);
      if(!f?.error)setStoreAllocations(f.data||[]);
      if(!g?.error)setPatientReturns(g.data||[]);
      if(!c.error){
        const masterRows=(c.data||[]).map(row=>({...row,is_active:row.is_active!==false}));
        setCatalog(masterRows);
        if(['Admin','Accounts'].includes(profile?.role))setTariffs(masterRows);
      }
      const visibleRequestIds=new Set(visibleRequests.map(row=>row.id));
      setDiagnostics(
        profile?.role==='Nurse'
          ?(b.data||[]).filter(row=>visibleRequestIds.has(row.charge_request_id))
          :(b.data||[])
      );
    }
    React.useEffect(()=>{
      load();
      const refreshTimer=setInterval(load,15000);
      window.addEventListener('focus',load);
      const ch=client.channel('clinical-charges-v2')
        .on('postgres_changes',{event:'*',schema:'public',table:'bill_charge_requests'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'diagnostic_services'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'charge_tariff_master'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'consumable_store_items'},load)
        .subscribe();
      return()=>{clearInterval(refreshTimer);window.removeEventListener('focus',load);client.removeChannel(ch)};
    },[]);

    function openNew(){const base=fresh();const availableCategories=Object.keys(categories);if(profile?.role==='Nurse'&&!availableCategories.length){notify('error','No active Stores / Pharmacy items are available. Add or activate an item in Stores before raising a charge.');return}const firstCategory=availableCategories[0]||base.category;const firstService=(categories[firstCategory]||[])[0]||base.service_name;setFiles([]);setBatchItems([]);setForm({...base,category:firstCategory,service_name:firstService,description:firstService,...stockDefaults(firstCategory,firstService)});setShow(true)}
    function changeCategory(value){
      const first=(categories[value]||[])[0]||'Others';
      setForm(current=>({...current,category:value,service_name:first,...stockDefaults(value,first),other_service_name:'',description:first==='Others'?'':first,test_name:['Laboratory Services','Diagnostic / Imaging'].includes(value)&&first!=='Others'?first:''}));
    }
    function changeService(value){
      setForm(current=>({...current,service_name:value,...stockDefaults(current.category,value),other_service_name:value==='Others'?current.other_service_name:'',description:value==='Others'?current.other_service_name:value,test_name:['Laboratory Services','Diagnostic / Imaging'].includes(current.category)&&value!=='Others'?value:current.test_name}));
    }
    function receivedUnchargedAvailability(patientId,itemId){
      const matching=(receivedIndents||[]).filter(r=>String(r.patient_id)===String(patientId)&&String(r.store_item_id)===String(itemId)&&r.status==='Received');
      const received=matching.reduce((sum,r)=>sum+Number(r.received_qty||0),0);
      const indentIds=new Set(matching.map(r=>String(r.id)));
      const allocated=(storeAllocations||[]).filter(a=>String(a.patient_id)===String(patientId)&&String(a.store_item_id)===String(itemId)&&indentIds.has(String(a.indent_id))).reduce((sum,a)=>sum+Number(a.allocated_qty||0),0);
      const returning=(patientReturns||[]).filter(r=>String(r.patient_id)===String(patientId)&&String(r.store_item_id)===String(itemId)&&indentIds.has(String(r.indent_id))&&r.status!=='Rejected').reduce((sum,r)=>sum+Number(r.quantity||0),0);
      return Math.max(0,received-allocated-returning);
    }
    function validateDraft(draft,draftFiles){
      if(!draft.patient_id)return 'Select the patient.';
      if(profile?.role==='Nurse'&&!['Nursing Procedures','Consumables','Pharmacy'].includes(draft.category))return 'Nursing Bills & Charges can use Nursing Procedures and active patient-received items from Stores / Pharmacy.';
      if(!Number.isFinite(Number(draft.quantity))||Number(draft.quantity)<=0)return 'Enter a valid positive quantity.';
      if(draft.store_item_id){const item=chargeStock.items.find(x=>String(x.item_id)===String(draft.store_item_id));if(!item)return 'Selected stock item is no longer available. Refresh and select again.';if(item.unit!==draft.unit)return 'Use the selected stock item unit.';}
      if(profile?.role==='Nurse'&&storeCategories.includes(draft.category)){
        const stockItem=chargeStock.items.find(x=>String(x.item_id)===String(draft.store_item_id))||matchingStock(draft.service_name==='Others'?draft.other_service_name:draft.service_name);
        const masterItem=matchingStoreMaster(draft.category,draft.service_name==='Others'?draft.other_service_name:draft.service_name,draft.store_item_id||stockItem?.item_id);
        if(!draft.store_item_id||!stockItem)return 'This item is not linked to Stores stock. Refresh and select the item from the Stores list.';
        if(!(Number(masterItem?.charge_rate)>0))return 'Charge rate is not fixed for this item. Ask Admin / Stores In-charge to set the rate before raising the charge.';
        const receivedAvailable=receivedUnchargedAvailability(draft.patient_id,draft.store_item_id);
        if(!(receivedAvailable>0))return 'This item has not been received for this patient through the Indent → Hand Over → Received workflow. Complete the patient indent and receipt before raising the charge.';
        if(Number(draft.quantity)>receivedAvailable)return `Only ${receivedAvailable} ${stockItem.unit||draft.unit||''} received and not yet charged for this patient. Reduce the quantity or complete another indent.`;
      }
      if(draft.service_name==='Others'&&!String(draft.other_service_name||'').trim())return 'Enter the Other charge / service item.';
      if(isFutureDateIndia(draft.charge_date)||isFutureDateIndia(draft.bill_date))return 'Future dates are not permitted.';
      if(draft.bill_available&&(draftFiles||[]).length===0)return 'Upload the supporting bill / invoice when Bill available is selected.';
      if(draft.bill_available&&!String(draft.bill_number||'').trim())return 'Enter the bill / invoice number.';
      if(draft.bill_available&&!draft.bill_date)return 'Enter the bill date.';
      return '';
    }
    function draftSignature(draft,draftFiles){
      return JSON.stringify({
        ...draft,
        files:(draftFiles||[]).map(f=>[f.name,f.size,f.lastModified])
      });
    }
    function addChargeToBatch(){
      const error=validateDraft(form,files);
      if(error){notify('error',error);return}
      const signature=draftSignature(form,files);
      if(batchItems.some(item=>item.signature===signature)){notify('error','This charge is already added to the list. Change the service/details before adding another.');return}
      setBatchItems(current=>[...current,{form:{...form},files:[...files],signature}]);
      setFiles([]);
      notify('success',`${form.service_name==='Others'?(form.other_service_name||'Other item'):form.service_name} added. You can now change the service/details and add another charge.`);
    }
    function removeBatchItem(index){setBatchItems(current=>current.filter((_,i)=>i!==index))}
    async function uploadFiles(requestId,draft,draftFiles){
      for(const file of (draftFiles||[])){
        const safe=String(file.name||'bill').replace(/[^a-zA-Z0-9._-]/g,'_');
        const path=`${draft.patient_id}/clinical-charges/${requestId}/${Date.now()}-${safe}`;
        const up=await client.storage.from('patient-documents').upload(path,file,{contentType:file.type||undefined});
        if(up.error)throw up.error;
        const doc=await client.from('patient_documents').insert({
          patient_id:draft.patient_id,document_type:'Clinical Charge Bill / Report',
          document_name:file.name,storage_path:path,mime_type:file.type||null,file_size:file.size||null,
          remarks:`Clinical charge ${requestId}`,uploaded_by:profile.id,is_verified:true
        });
        if(doc.error)throw doc.error;
      }
    }
    async function saveOne(draft,draftFiles,user){
      const qty=Number(draft.quantity);
      const nurseRaised=profile?.role==='Nurse';
      const isOther=draft.service_name==='Others';
      const effectiveService=isOther?String(draft.other_service_name||'').trim():draft.service_name;
      const masterItem=matchingStoreMaster(draft.category,effectiveService,draft.store_item_id);
      const masterRate=Number(masterItem?.charge_rate||0);
      const rate=nurseRaised?masterRate:Number(draft.unit_cost||masterRate||0);
      const amount=nurseRaised?(qty*rate):Number(draft.requested_amount||qty*rate||0);
      const payload={
        patient_id:draft.patient_id,charge_date:draft.charge_date,store_item_id:draft.store_item_id||null,
        service_datetime:new Date(draft.service_datetime).toISOString(),
        category:draft.category,service_code:isOther?'OTHER':effectiveService.toUpperCase().replace(/[^A-Z0-9]+/g,'_'),
        charge_item_code:storeCategories.includes(draft.category)?(masterItem?.item_code||draft.charge_item_code||null):(draft.category==='Nursing Procedures'?(catalog.find(x=>x.category==='Nursing Procedures'&&x.service_name===effectiveService&&x.is_active!==false)?.charge_code||null):null),
        service_name:effectiveService,service_provider:draft.service_provider||null,
        doctor_name:draft.doctor_name||null,description:draft.description||effectiveService,
        quantity:qty,unit:draft.unit,
        unit_cost:rate||null,
        estimated_amount:qty*rate||null,
        requested_amount:amount||null,
        billable:draft.billable,bill_available:draft.bill_available,
        bill_number:draft.bill_number||null,bill_date:draft.bill_date||null,
        urgency:draft.urgency,status:'Raised',approval_status:'Pending',
        hospital_name:draft.hospital_name||null,visit_reason:draft.visit_reason||null,
        out_time:draft.out_time?new Date(draft.out_time).toISOString():null,
        return_time:draft.return_time?new Date(draft.return_time).toISOString():null,
        escort_staff:draft.escort_staff||null,relative_accompanied:draft.relative_accompanied,
        admission_required:draft.admission_required,laboratory_name:draft.laboratory_name||null,
        test_name:draft.test_name||null,sample_type:draft.sample_type||null,
        sample_collected_at:draft.sample_collected_at?new Date(draft.sample_collected_at).toISOString():null,
        report_status:draft.report_status||null,
        report_received_at:draft.report_received_at?new Date(draft.report_received_at).toISOString():null,
        transport_type:draft.transport_type||null,paid_by_samara:draft.paid_by_samara,
        remarks:draft.remarks||null,raised_by:user?.id||profile.id,raised_by_name:formalName(profile)||profile?.full_name||profile?.username||'Nursing staff',raised_at:new Date().toISOString(),returned_to_nurse_at:null,updated_at:new Date().toISOString()
      };
      const saved=await client.from('bill_charge_requests').insert(payload).select('*').single();
      if(saved.error)throw saved.error;
      if(nurseRaised&&storeCategories.includes(draft.category)&&draft.store_item_id){
        let remaining=qty;
        const eligible=(receivedIndents||[]).filter(r=>String(r.patient_id)===String(draft.patient_id)&&String(r.store_item_id)===String(draft.store_item_id)&&r.status==='Received').sort((x,y)=>new Date(x.received_at||0)-new Date(y.received_at||0));
        for(const indent of eligible){
          if(remaining<=0)break;
          const already=(storeAllocations||[]).filter(a=>String(a.indent_id)===String(indent.id)).reduce((sum,a)=>sum+Number(a.allocated_qty||0),0);
          const available=Math.max(0,Number(indent.received_qty||0)-already);
          if(available<=0)continue;
          const useQty=Math.min(available,remaining);
          const alloc=await client.from('bill_charge_store_allocations').insert({charge_request_id:saved.data.id,indent_id:indent.id,patient_id:draft.patient_id,store_item_id:draft.store_item_id,allocated_qty:useQty,created_by:user?.id||profile.id}).select('*').single();
          if(alloc.error){await client.from('bill_charge_requests').delete().eq('id',saved.data.id);throw alloc.error;}
          storeAllocations.push(alloc.data);
          remaining-=useQty;
        }
        if(remaining>0){await client.from('bill_charge_store_allocations').delete().eq('charge_request_id',saved.data.id);await client.from('bill_charge_requests').delete().eq('id',saved.data.id);throw new Error('Received patient stock changed while saving. Refresh and try again.');}
      }
      if((draftFiles||[]).length)await uploadFiles(saved.data.id,draft,draftFiles);
      if(['Laboratory Services','Diagnostic / Imaging'].includes(draft.category)){
        const diag=await client.from('diagnostic_services').insert({
          charge_request_id:saved.data.id,patient_id:draft.patient_id,service_type:draft.category,
          test_name:draft.test_name||effectiveService,laboratory_name:draft.laboratory_name||draft.service_provider||null,
          sample_type:draft.sample_type||null,ordered_at:payload.service_datetime,
          sample_collected_at:payload.sample_collected_at,report_status:draft.report_status,
          report_received_at:payload.report_received_at,
          bill_amount:nurseRaised?null:(amount||null),
          paid_by_samara:draft.paid_by_samara,requested_by:user?.id||profile.id
        });
        if(diag.error)throw diag.error;
      }
      return saved.data;
    }
    async function save(e){
      e.preventDefault();
      if(busy)return;
      const currentError=validateDraft(form,files);
      const currentSignature=draftSignature(form,files);
      const currentAlreadyAdded=batchItems.some(item=>item.signature===currentSignature);
      const items=[...batchItems];
      if(!currentAlreadyAdded){
        if(currentError){notify('error',currentError);return}
        items.push({form:{...form},files:[...files],signature:currentSignature});
      }
      if(items.length===0){notify('error','Add at least one charge.');return}
      setBusy(true);
      try{
        const auth=await client.auth.getUser();
        const user=auth.data?.user;
        for(const item of items)await saveOne(item.form,item.files,user);
        notify('success',`${items.length} bill / charge request${items.length===1?'':'s'} forwarded for approval.`);
        setBatchItems([]);setFiles([]);
        finishSuccessfulAction({close:()=>setShow(false),refresh:load});
      }catch(error){notify('error',error.message||'Unable to save clinical charges.')}
      setBusy(false);
    }
    function currentStoreMasterItem(row){
      if(!row)return null;
      // Permanent charge code is the authoritative link for Stores / Pharmacy charges.
      // This also supports older requests whose store_item_id may be absent/stale after migration.
      if(row.charge_item_code){
        const byCode=(storeMaster||[]).find(x=>x.active!==false&&String(x.item_code||'')===String(row.charge_item_code));
        if(byCode)return byCode;
      }
      return matchingStoreMaster(row.category,row.service_name||row.description,row.store_item_id);
    }
    function currentStoreRequestAmount(row){
      const saved=Number(row?.requested_amount||row?.estimated_amount||0);
      if(saved>0)return {amount:saved,fromMaster:false};
      const item=currentStoreMasterItem(row);
      const rate=Number(item?.charge_rate||0);
      const qty=Number(row?.quantity||1);
      return rate>0&&qty>0?{amount:rate*qty,fromMaster:true,rate,item}: {amount:0,fromMaster:false,rate:rate||0,item};
    }
    async function decide(row,decision){
      if(!canApprove||busy)return;
      const isOther=String(row.service_code||'').toUpperCase()==='OTHER';
      const tariff=(isOther||storeCategories.includes(row.category))?null:tariffs.find(t=>(row.charge_item_code&&t.charge_code===row.charge_item_code)||(t.category===row.category&&t.service_name===row.service_name&&t.is_active!==false));
      const storeAmount=currentStoreRequestAmount(row);
      let amount=row.bill_available?Number(row.requested_amount||0):(storeAmount.amount>0?storeAmount.amount:Number(tariff?.amount||0));
      if(['Approved','Partially Approved'].includes(decision)){
        if(!row.bill_available&&!isOther&&!(amount>0)){
          notify('error',storeCategories.includes(row.category)
            ?'Approval blocked: this Stores / Pharmacy item has no active fixed charge rate. Ask Admin / Stores In-charge to fix the rate before approval.'
            :'Approval blocked: this charge item has no active fixed tariff. Ask Admin to fix the tariff before approval.');
          return;
        }
        const defaultAmount=amount>0?String(amount):'';
        const entered=prompt(
          row.bill_available
            ?'Verify the uploaded bill and enter the actual bill amount:'
            :isOther
              ?'Enter the verified amount for this custom / Other charge:'
              :`Fixed rate is ${money(amount)}. Verify the approved amount:`,
          defaultAmount
        );
        if(entered===null)return;
        amount=Number(entered);
        if(!Number.isFinite(amount)||amount<=0){
          notify('error','Enter a valid approved amount greater than zero.');
          return;
        }
      }
      const remarks=prompt('Decision remarks:',decision)||decision;
      setBusy(true);
      const result=await client.rpc('decide_bill_charge_request_v5',{
        p_request_id:row.id,
        p_decision:decision,
        p_approved_amount:decision==='Rejected'?0:amount,
        p_remarks:remarks
      });
      setBusy(false);
      if(result.error)notify('error',result.error.message);
      else{
        notify('success',`Charge ${decision.toLowerCase()} by ${formalName(profile)||profile?.full_name||profile?.role} at ${fmt(new Date())}. Returned automatically to Nursing.`);
        await load();
      }
    }

    const filtered=rows.filter(r=>
      (!workflowRequestId||String(r.id)===workflowRequestId)&&
      (!filter.patient_id||r.patient_id===filter.patient_id)&&
      (filter.status==='All'||(r.approval_status||'Pending')===filter.status)&&
      (filter.category==='All'||r.category===filter.category)&&
      (quickView!=='Today'||r.charge_date===todayISOIndia())&&
      (quickView!=='Approved'||['Approved','Partially Approved'].includes(r.approval_status))&&
      (quickView!=='Approved Today'||isApprovedToday(r))
    );
    const pending=rows.filter(r=>(r.approval_status||'Pending')==='Pending').length;
    const approved=rows.filter(r=>['Approved','Partially Approved'].includes(r.approval_status));

    // Dashboard summary should be operational, not a lifetime cumulative total.
    // "Approved Today" is based on the actual decision timestamp when available.
    // For legacy approved rows without decision_at, charge_date is used only as a fallback.
    const isApprovedToday=row=>{
      if(!['Approved','Partially Approved'].includes(row.approval_status))return false;
      if(row.decision_at){
        const d=new Date(row.decision_at);
        if(!Number.isNaN(d.getTime())){
          const now=new Date();
          return d.getFullYear()===now.getFullYear()&&
                 d.getMonth()===now.getMonth()&&
                 d.getDate()===now.getDate();
        }
      }
      return row.charge_date===todayISOIndia();
    };
    const approvedToday=rows.filter(isApprovedToday);
    const approvedTodayValue=approvedToday.reduce((sum,row)=>{
      const value=row.approved_amount!==null&&row.approved_amount!==undefined
        ?Number(row.approved_amount)
        :row.final_amount!==null&&row.final_amount!==undefined
          ?Number(row.final_amount)
          :0;
      return sum+(Number.isFinite(value)?value:0);
    },0);

    const navCard=(label,value,view,subtitle)=>h('button',{
      type:'button',
      className:'card stat',
      onClick:()=>openChargeView(view),
      title:`Open ${label}`,
      style:{
        textAlign:'left',
        cursor:'pointer',
        width:'100%',
        border:'1px solid #e8c3d2',
        background:quickView===view?'linear-gradient(135deg,#f9dce8,#fff7fa)':'linear-gradient(145deg,#fffafd,#fdf1f6)',
        boxShadow:quickView===view?'0 8px 20px rgba(166,16,78,.12)':'0 4px 12px rgba(109,24,61,.05)'
      }
    },
      h('span',null,label),
      h('strong',null,value),
      h('small',{style:{display:'block',marginTop:'4px',color:'#8b6b79'}},subtitle||'Click to view details')
    );

    const summary=h('div',{className:'grid stats'},
      navCard('Today’s Entries',rows.filter(r=>r.charge_date===todayISOIndia()).length,'Today','Click to show today’s charges'),
      navCard('Pending Approval',pending,'Pending','Click to show pending approvals'),
      navCard('Approved Today',approvedToday.length,'Approved Today','Click to show approvals made today'),
      navCard('Approved Value Today',money(approvedTodayValue),'Approved Today','Actual value approved today')
    );

    const chargeMobileCard=r=>h('article',{key:r.id||`${r.patient_id}-${r.charge_date}-${r.service_name}`,className:'card',style:{padding:'14px',marginBottom:'10px',width:'100%',maxWidth:'100%',boxSizing:'border-box',overflow:'hidden'}},
      h('div',{style:{display:'flex',justifyContent:'space-between',gap:'10px',alignItems:'flex-start'}},
        h('div',{style:{minWidth:0,flex:'1 1 auto'}},h('strong',{style:{display:'block',fontSize:'16px',overflowWrap:'anywhere'}},`${r.charge_item_code?`${r.charge_item_code} · `:''}${r.service_name||r.description||'Charge'}`),h('small',{style:{display:'block',marginTop:'3px',overflowWrap:'anywhere'}},pLabel(r.patient_id))),
        h('span',{className:'badge',style:{flex:'0 0 auto'}},r.approval_status||'Pending')
      ),
      h('div',{style:{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:'8px 12px',marginTop:'12px'}},
        h('div',{style:{minWidth:0}},h('small',null,'Date'),h('div',{style:{overflowWrap:'anywhere'}},formatDateIN(r.charge_date))),
        h('div',{style:{minWidth:0}},h('small',null,'Quantity'),h('div',{style:{overflowWrap:'anywhere'}},`${r.quantity||1} ${r.unit||''}`)),
        h('div',{style:{minWidth:0}},h('small',null,'Category'),h('div',{style:{overflowWrap:'anywhere'}},r.category||'—')),
        h('div',{style:{minWidth:0}},h('small',null,'Provider'),h('div',{style:{overflowWrap:'anywhere'}},r.service_provider||r.hospital_name||r.laboratory_name||'—')),
        h('div',{style:{gridColumn:'1 / -1',minWidth:0}},h('small',null,'Patient'),h('div',{style:{overflowWrap:'anywhere',wordBreak:'break-word'}},pLabel(r.patient_id))),
        h('div',{style:{gridColumn:'1 / -1',minWidth:0}},h('small',null,'Service'),h('div',{style:{overflowWrap:'anywhere',wordBreak:'break-word'}},r.service_name||r.description||'—')),
        h('div',{style:{minWidth:0}},h('small',null,'Request Amount'),h('div',null,profile?.role==='Nurse'?'Hidden':(()=>{const store=currentStoreRequestAmount(r);return store.amount>0?money(store.amount):'—'})())),
        h('div',{style:{minWidth:0}},h('small',null,'Approved Amount'),h('div',null,profile?.role==='Nurse'?'Hidden':money(r.approved_amount??r.final_amount))),
        h('div',{style:{gridColumn:'1 / -1',minWidth:0}},h('small',null,'Decision'),h('div',{style:{overflowWrap:'anywhere'}},[r.decision_by_name,r.decision_at&&fmt(r.decision_at)].filter(Boolean).join(' · ')||'—')),
        h('div',{style:{gridColumn:'1 / -1',minWidth:0}},h('small',null,'Remarks'),h('div',{style:{overflowWrap:'anywhere',wordBreak:'break-word'}},r.decision_remarks||r.approval_remarks||r.remarks||'—'))
      ),
      canApprove&&(r.approval_status||'Pending')==='Pending'&&h('div',{style:{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:'6px',marginTop:'12px'}},
        h('button',{className:'btn btn-primary',disabled:busy,onClick:()=>decide(r,'Approved')},'Approve'),
        h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>decide(r,'Partially Approved')},'Partial'),
        h('button',{className:'btn btn-danger',disabled:busy,onClick:()=>decide(r,'Rejected')},'Reject')
      )
    );

    const desktopRegister=h(LogTable,{
      title:`Bill & Charge Requests (${filtered.length})`,
      heads:['Date','Patient','Category','Service','Qty','Decision','Action','Request Amount','Approved Amount','Provider','Decision By','Decision Time','Remarks'],
      rows:filtered.map(r=>[
        formatDateIN(r.charge_date),pLabel(r.patient_id),r.category,`${r.charge_item_code?`${r.charge_item_code} · `:''}${r.service_name||r.description||'—'}`,
        `${r.quantity||1} ${r.unit||''}`,
        h('span',{className:'badge'},r.approval_status||'Pending'),
        h('div',{className:'employee-actions',style:{display:'flex',gap:'6px',flexWrap:'wrap',minWidth:canApprove?'235px':'80px'}},
          canApprove&&(r.approval_status||'Pending')==='Pending'&&h('button',{className:'btn btn-primary',disabled:busy,onClick:()=>decide(r,'Approved')},'Approve'),
          canApprove&&(r.approval_status||'Pending')==='Pending'&&h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>decide(r,'Partially Approved')},'Partial'),
          canApprove&&(r.approval_status||'Pending')==='Pending'&&h('button',{className:'btn btn-danger',disabled:busy,onClick:()=>decide(r,'Rejected')},'Reject'),
          !canApprove&&h('span',{style:{color:'#8b7780'}},'—')
        ),
        profile?.role==='Nurse'?'Hidden':(()=>{const store=currentStoreRequestAmount(r);return store.amount>0?h('span',null,money(store.amount),store.fromMaster?h('small',{style:{display:'block',color:'#7b6570',marginTop:'2px'}},`Store rate ₹${Number(store.rate).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})} × ${Number(r.quantity||1)}`):null):'—'})(),
        profile?.role==='Nurse'?'Hidden':money(r.approved_amount??r.final_amount),
        r.service_provider||r.hospital_name||r.laboratory_name||'—',
        r.decision_by_name||'—',r.decision_at?fmt(r.decision_at):'—',r.decision_remarks||r.approval_remarks||'—'
      ])
    });
    const mobileRegister=h(Section,{title:`Bill & Charge Requests (${filtered.length})`,subtitle:'Mobile view — each request is contained within the screen. No horizontal scrolling.'},
      h('div',{style:{width:'100%',maxWidth:'100%',overflowX:'hidden'}},filtered.length?filtered.map(chargeMobileCard):h('div',{className:'empty',style:{padding:'18px'}},'No records found'))
    );
    const register=h(React.Fragment,null,
      workflowRequestId&&h('div',{className:'message warning',style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'10px',marginBottom:'10px'}},
        h('span',null,'Showing the exact charge request opened from the notification.'),
        h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setWorkflowRequestId('')},'Show All Charge Requests')
      ),
      isChargeMobile?mobileRegister:desktopRegister
    );

    const diagTable=h(LogTable,{
      title:'Diagnostic Services Timeline',
      heads:['Patient','Type','Test / Investigation','Centre','Ordered','Sample','Report Status','Report Received','Amount'],
      rows:diagnostics.map(d=>[
        pLabel(d.patient_id),d.service_type,d.test_name,d.laboratory_name||'—',
        fmt(d.ordered_at),fmt(d.sample_collected_at),d.report_status||'—',fmt(d.report_received_at),money(d.bill_amount)
      ])
    });

    const basicFields=[
      patientSelect(patients,form.patient_id,v=>setForm({...form,patient_id:v})),
      h('div',{className:'field'},h('label',null,'Category'),h('select',{value:form.category,onChange:e=>changeCategory(e.target.value)},Object.keys(categories).map(x=>h('option',{key:x,value:x},x)))),
      h('div',{className:'field'},h('label',null,'Service / Item'),h('select',{value:form.service_name,onChange:e=>changeService(e.target.value)},(categories[form.category]||['Others']).map(x=>h('option',{key:x,value:x},x)))),
      form.service_name==='Others'&&miniInput('Other Charge / Service Item',form.other_service_name,v=>setForm({...form,other_service_name:v,description:v}),true),
      miniInput('Service Date',form.charge_date,v=>setForm({...form,charge_date:v}),true,'date'),
      miniInput('Service Date & Time',form.service_datetime,v=>setForm({...form,service_datetime:v}),true,'datetime-local'),
      miniInput('Provider / Organisation',form.service_provider,v=>setForm({...form,service_provider:v})),
      miniInput('Doctor / Consultant',form.doctor_name,v=>setForm({...form,doctor_name:v})),
      miniInput('Quantity',form.quantity,v=>setForm({...form,quantity:v}),true,'number'),
      form.store_item_id?h('div',{className:'field'},h('label',null,'Unit'),h('input',{value:form.unit,readOnly:true})):miniInput('Unit',form.unit,v=>setForm({...form,unit:v})),
      ['Consumables','Pharmacy','Pharmacy & Basic Supplies'].includes(form.category)&&h(PharmacyStockPanel,{stock:chargeStock,itemId:form.store_item_id,quantity:form.quantity,unit:form.unit,onSelect:id=>{const item=chargeStock.items.find(x=>x.item_id===id);setForm(current=>({...current,store_item_id:id,unit:item?.unit||current.unit}))}}),
      ['Consumables','Pharmacy','Pharmacy & Basic Supplies'].includes(form.category)&&h('p',{className:'span-2'},'Only the quantity already Received for this patient and not yet charged can be raised here. Stores stock was already deducted at Hand Over; raising the charge will not deduct Stores again.'),
      form.category==='Pharmacy & Basic Supplies'&&h('p',{className:'span-2'},'Record the exact brand, size, concentration or pack size in Remarks where applicable. Reusable equipment and general supplies are subject to Accounts review before patient billing.'),
      profile?.role==='Accounts'&&miniInput('Unit Cost',form.unit_cost,v=>setForm({...form,unit_cost:v}),false,'number'),
      profile?.role==='Accounts'&&miniInput('Total Amount',form.requested_amount,v=>setForm({...form,requested_amount:v}),false,'number'),
      miniSelect('Urgency',form.urgency,['Routine','Urgent','Emergency'],v=>setForm({...form,urgency:v})),
      h('label',{className:'check-card'},h('input',{type:'checkbox',checked:form.billable,onChange:e=>setForm({...form,billable:e.target.checked})}),h('span',null,'Billable')),
      h('label',{className:'check-card'},h('input',{type:'checkbox',checked:form.bill_available,onChange:e=>setForm({...form,bill_available:e.target.checked})}),h('span',null,'Bill available'))
    ];
    if(form.bill_available){
      basicFields.push(miniInput('Bill Number',form.bill_number,v=>setForm({...form,bill_number:v})));
      basicFields.push(miniInput('Bill Date',form.bill_date,v=>setForm({...form,bill_date:v}),false,'date'));
    }
    if(form.category==='Hospital Visits'){
      basicFields.push(miniInput('Hospital Name',form.hospital_name,v=>setForm({...form,hospital_name:v})));
      basicFields.push(miniInput('Reason for Visit',form.visit_reason,v=>setForm({...form,visit_reason:v})));
      basicFields.push(miniInput('Out Time',form.out_time,v=>setForm({...form,out_time:v}),false,'datetime-local'));
      basicFields.push(miniInput('Return Time',form.return_time,v=>setForm({...form,return_time:v}),false,'datetime-local'));
      basicFields.push(miniInput('Escort Staff',form.escort_staff,v=>setForm({...form,escort_staff:v})));
    }
    if(['Laboratory Services','Diagnostic / Imaging'].includes(form.category)){
      basicFields.push(miniInput('Lab / Diagnostic Centre',form.laboratory_name,v=>setForm({...form,laboratory_name:v})));
      basicFields.push(miniInput('Test / Investigation',form.test_name,v=>setForm({...form,test_name:v}),true));
      basicFields.push(miniSelect('Report Status',form.report_status,['Ordered','Sample Collected','In Process','Report Received','Cancelled'],v=>setForm({...form,report_status:v})));
    }
    basicFields.push(miniInput('Description',form.description,v=>setForm({...form,description:v}),true));
    basicFields.push(miniInput('Remarks',form.remarks,v=>setForm({...form,remarks:v})));
    basicFields.push(h('div',{className:'field span-2'},
      h('label',null,profile?.role==='Nurse'?'Upload Supporting Bill / Report (when available)':'Supporting Bill / Report'),
      h('input',{
        type:'file',
        multiple:true,
        accept:'image/*,.pdf',
        onChange:e=>setFiles(Array.from(e.target.files||[]))
      }),
      profile?.role==='Nurse'&&h('small',{className:'small-note'},form.bill_available?'Bill / invoice upload is mandatory because Bill available is selected.':'No amount is shown or entered by Nursing. Accounts will apply the Admin-fixed tariff.')
    ));

    const modal=show?h('div',{className:'modal-backdrop'},
      h('form',{className:'card modal clinical-charge-modal',onSubmit:save},
        h('div',{className:'panel-head'},
          h('div',null,
            h('h3',null,profile?.role==='Nurse'?'Raise Bill / Charge Request':'Raise Bill / Charge'),
            h('small',null,profile?.role==='Nurse'
              ?'Record the service and upload the supporting bill when available. Management/Accounts will enter and approve the amount.'
              :'The form closes automatically after successful save.'
            )
          ),
          h('button',{type:'button',className:'close',onClick:()=>setShow(false)},'×')
        ),
        h('div',{className:'modal-grid'},
          profile?.role==='Nurse'&&h('div',{className:'clinical-charge-note'},
            'Nursing staff record only the service/expense occurrence. Financial amounts are not visible here. Pharmacy / Consumable charges can be raised only after the item has been handed over and the Nurse has confirmed Received for that patient, and the Stores item has a fixed charge rate. If a bill is available, upload it; Accounts will verify it.'
          ),
          ...basicFields.filter(Boolean)
        ),
        batchItems.length>0&&h('div',{className:'card',style:{margin:'10px 0',padding:'10px'}},
          h('strong',null,`Charges added (${batchItems.length})`),
          ...batchItems.map((item,index)=>h('div',{key:index,style:{display:'flex',justifyContent:'space-between',gap:'10px',alignItems:'center',padding:'8px 0',borderBottom:'1px solid #ead6df'}},
            h('span',null,`${index+1}. ${item.form.service_name==='Others'?(item.form.other_service_name||'Others'):item.form.service_name}${item.form.bill_available?' · Bill attached':''}`),
            h('button',{type:'button',className:'btn btn-secondary',onClick:()=>removeBatchItem(index)},'Remove')
          ))
        ),
        h('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}},
          h('button',{type:'button',className:'btn btn-secondary full',disabled:busy,onClick:addChargeToBatch},'＋ Add Charge'),
          h('button',{className:'btn btn-primary full',disabled:busy},busy?'Saving…':batchItems.length?`Submit ${batchItems.length + (batchItems.some(item=>item.signature===draftSignature(form,files))?0:1)} Charges for Approval`:'Submit for Approval')
        )
      )
    ):null;

    async function saveMasterItem(row){
      if(!canManageTariffs)return;
      const category=prompt('Charge category:',row?.category||'Miscellaneous');
      if(category===null||!String(category).trim())return;
      if(storeCategories.includes(String(category).trim())){notify('error','Consumables and Pharmacy items are controlled only from Stores Master. Use the exact Stores item and rate.');return}
      const serviceName=prompt('Chargeable service / item:',row?.service_name||'');
      if(serviceName===null||!String(serviceName).trim())return;
      const entered=prompt('Admin-fixed tariff when no external bill is available (leave blank to set later):',row?.amount!==null&&row?.amount!==undefined?String(row.amount):'');
      if(entered===null)return;
      const amount=String(entered).trim()===''?null:Number(entered);
      if(amount!==null&&(!Number.isFinite(amount)||amount<=0)){notify('error','Enter a valid tariff greater than zero, or leave it blank to set later.');return}
      setTariffBusy(true);
      const payload={id:row?.id||undefined,category:String(category).trim(),service_name:String(serviceName).trim(),amount,is_active:row?.is_active!==false,updated_by:profile.id,updated_at:new Date().toISOString()};
      if(!payload.id)delete payload.id;
      const result=row?.id
        ?await client.from('charge_tariff_master').update(payload).eq('id',row.id)
        :await client.from('charge_tariff_master').insert(payload);
      setTariffBusy(false);
      if(result.error)notify('error',result.error.message);else{notify('success',row?.id?'Charge Master item updated.':'Charge Master item added.');await load();}
    }
    async function toggleMasterItem(row){
      if(!canManageTariffs)return;
      setTariffBusy(true);
      const result=await client.from('charge_tariff_master').update({is_active:row.is_active===false,updated_by:profile.id,updated_at:new Date().toISOString()}).eq('id',row.id);
      setTariffBusy(false);
      if(result.error)notify('error',result.error.message);else{notify('success',row.is_active===false?'Charge item activated.':'Charge item deactivated.');await load();}
    }
    const tariffPanel=canManageTariffs?h(Section,{title:'Charge Master',subtitle:'Admin-controlled list of all chargeable services/items. Fixed tariffs and amounts are visible only to Admin/Accounts; Nursing sees item names only. “Others” remains editable for Nursing and Accounts.'},
      h('div',{style:{display:'flex',justifyContent:'flex-end',marginBottom:'10px'}},h('button',{type:'button',className:'btn btn-primary',disabled:tariffBusy,onClick:()=>saveMasterItem(null)},'+ Add Charge Item')),
      h(LogTable,{title:'Chargeable Items',heads:['Category','Service / Item','Fixed Tariff (No Bill)','Status','Action'],rows:(tariffs||[]).filter(row=>!storeCategories.includes(String(row.category||'').trim())).map(row=>[
        row.category,row.service_name,row.amount!==null&&row.amount!==undefined?money(row.amount):'Not set',row.is_active===false?'Inactive':'Active',
        h('div',{className:'employee-actions'},
          h('button',{className:'btn btn-secondary',disabled:tariffBusy,onClick:()=>saveMasterItem(row)},'Edit'),
          h('button',{className:row.is_active===false?'btn btn-primary':'btn btn-danger',disabled:tariffBusy,onClick:()=>toggleMasterItem(row)},row.is_active===false?'Activate':'Deactivate')
        )
      ])})
    ):null;


    return h(React.Fragment,null,
      h('div',{className:'clinical-charges-hero'},
        h('div',null,h('small',null,'DOCUMENT ONCE · BILL ACCURATELY'),h('h3',null,'Bills & Charges'),h('p',null,'Nurses and Accounts raise charges from the Admin-controlled Charge Master. Nursing never sees amounts; Accounts verifies fixed tariffs or actual bills and posts approved charges to the patient ledger.')),
        canRaise&&h('button',{className:'btn btn-primary',onClick:openNew},'+ Raise Bill / Charge')
      ),
      summary,
      tariffPanel,
      h(Section,{title:'Bills & Charges Register',subtitle:'Doctor, nursing, physiotherapy, laboratory, hospital, transport and other expenses'},
        h('div',{className:'clinical-charge-filters'},
          patientSelect(patients,filter.patient_id,v=>setFilter({...filter,patient_id:v})),
          miniSelect('Status',filter.status,['All','Pending','Approved','Partially Approved','Rejected'],v=>{setQuickView('All');setFilter({...filter,status:v})}),
          miniSelect('Category',filter.category,['All',...Object.keys(categories)],v=>{setQuickView('All');setFilter({...filter,category:v})})
        )
      ),
      h('div',{id:'bill-charge-register',style:{scrollMarginTop:'90px'}},
        quickView!=='All'&&h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'10px',margin:'0 0 10px',padding:'9px 12px',borderRadius:'12px',background:'#f9e7ef',border:'1px solid #e8bfd0'}},
          h('strong',{style:{color:'#801747'}},`Showing: ${quickView}`),
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setQuickView('All');setFilter(current=>({...current,status:'All'}))}},'Show All')
        ),
        register
      ),
      diagTable,
      modal,
      toast&&h('div',{className:`samara-toast ${toast.type}`},
        h('span',{className:'samara-toast-icon'},toast.type==='success'?'✓':'!'),
        h('div',null,h('strong',null,toast.type==='success'?'Saved':'Failed'),h('span',null,toast.text)),
        h('button',{onClick:()=>setToast(null)},'×')
      )
    );
  }
