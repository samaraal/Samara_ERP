  function patientIndentQuantities(ind,entries,returns,allocations,charges=[]){
    const n=v=>Number(v)||0,linked=allocations.filter(a=>a.indent_id===ind.id);
    const used=entries.filter(e=>e.indent_id===ind.id&&!e.voided_at).reduce((s,e)=>s+n(e.quantity),0);
    const confirmed=returns.filter(r=>r.indent_id===ind.id&&r.status==='Confirmed').reduce((s,r)=>s+n(r.quantity),0);
    const pending=returns.filter(r=>r.indent_id===ind.id&&r.status==='Pending').reduce((s,r)=>s+n(r.quantity),0);
    const charged=linked.length?linked.reduce((s,a)=>s+n(a.allocated_qty),0):charges.filter(c=>(c.consumable_indent_id===ind.id||c.id===ind.charge_request_id)&&['Posted','Partially Approved'].includes(c.status)&&['Approved','Partially Approved'].includes(c.approval_status)).reduce((s,c)=>s+n(c.quantity),0);
    const remaining=n(ind.received_qty)-used-confirmed;
    return {used,confirmed,pending,charged,remaining,available:remaining-pending,balance:Math.max(0,remaining-pending)};
  }
  function ResidentItemConsumption({profile,rows,patients,entries,returns,allocations,charges,onReload,onReturn,onConfirm,busy,error}){
    const today=todayISOIndia(),[patient,setPatient]=React.useState(''),[search,setSearch]=React.useState(''),[item,setItem]=React.useState('');
    const [period,setPeriod]=React.useState('month'),[month,setMonth]=React.useState(today.slice(0,7)),[from,setFrom]=React.useState(today.slice(0,8)+'01'),[to,setTo]=React.useState(today);
    const [form,setForm]=React.useState(null),[saving,setSaving]=React.useState(false),[message,setMessage]=React.useState('');
    const nurse=profile?.role==='Nurse',manager=isNursingManagerProfile(profile)||profile?.role==='Admin';
    const label=id=>{const p=patients.find(p=>p.id===id);return p?`${formalName(p)||p.full_name} · ${p.patient_id||''}${p.is_active===false?' · Inactive / Discharged':''}`:id;};
    const pq=search.trim().toLowerCase(),options=patients.filter(p=>pq.length<3||label(p.id).toLowerCase().includes(pq));
    const received=rows.filter(r=>r.status==='Received'&&!r.outside_visit_id&&(!patient||r.patient_id===patient)&&(pq.length<3||label(r.patient_id).toLowerCase().includes(pq))&&(!item||r.store_item_id===item));
    let start=from,end=to;
    if(period==='today')start=end=today;
    if(period==='week'){const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));start=d.toISOString().slice(0,10);end=today;}
    if(period==='month'){start=month+'-01';const d=new Date(start+'T12:00:00Z');if(Number.isFinite(d.getTime())){d.setUTCMonth(d.getUTCMonth()+1);d.setUTCDate(0);end=d.toISOString().slice(0,10);}else end='';}
    const valid=/^\d{4}-\d{2}-\d{2}$/.test(start)&&/^\d{4}-\d{2}-\d{2}$/.test(end)&&start<=end;
    const ids=new Set(received.map(r=>r.id)),history=valid?entries.filter(e=>ids.has(e.indent_id)&&e.used_on>=start&&e.used_on<=end).sort((a,b)=>b.used_on.localeCompare(a.used_on)||b.recorded_at.localeCompare(a.recorded_at)):[];
    const totals={};history.filter(e=>!e.voided_at).forEach(e=>{const u=rows.find(r=>r.id===e.indent_id)?.unit||'Nos';totals[u]=(totals[u]||0)+Number(e.quantity);});
    const field=(name,input)=>h('div',{className:'field'},h('label',null,name),input);
    const sel=(name,value,set,opts)=>field(name,h('select',{'aria-label':name,value,onChange:e=>set(e.target.value)},opts.map(([v,l])=>h('option',{key:v,value:v},l))));
    const table=(heads,body)=>h('div',{className:'table-wrap'},h('table',{className:'table'},h('thead',null,h('tr',null,heads.map(x=>h('th',{key:x},x)))),h('tbody',null,body.length?body:h('tr',null,h('td',{colSpan:heads.length},'No records for these filters.')))));
    const tr=(key,cells)=>h('tr',{key},cells.map((x,i)=>h('td',{key:i},x)));
    const quantities=r=>patientIndentQuantities(r,entries,returns,allocations,charges);
    function open(r){setMessage('');setForm({id:crypto.randomUUID(),indent:r,quantity:'',used_on:today,remarks:''});}
    async function save(e){e.preventDefault();if(saving||busy||!form||!nurse||error)return;const q=Number(form.quantity),u=quantities(form.indent);
      if(!Number.isFinite(q)||q<=0||Number(q.toFixed(2))!==q||q>u.available){setMessage(`Enter a quantity above 0 and up to ${u.available} ${form.indent.unit} (maximum two decimal places).`);return;}
      setSaving(true);setMessage('');
      try{const res=await client.rpc('record_patient_item_consumption',{p_entry_id:form.id,p_indent_id:form.indent.id,p_quantity:q,p_used_on:form.used_on,p_remarks:form.remarks||null});if(res.error)throw res.error;setForm(null);await onReload();showSamaraActionToast('success','Consumption recorded',`${q} ${form.indent.unit} used. Patient balance updated; no new bill charge.`);}catch(e){setMessage(e.message||'Could not save. Retry with the same entry reference.');}finally{setSaving(false);}
    }
    async function voidEntry(entry){if(saving||busy)return;const reason=prompt('Reason for voiding this consumption entry (history is retained):');if(!reason?.trim())return;setSaving(true);setMessage('');try{const r=await client.rpc('void_patient_item_consumption',{p_entry_id:entry.id,p_reason:reason.trim()});if(r.error)throw r.error;await onReload();showSamaraActionToast('success','Consumption corrected','Entry voided. Record the corrected quantity if required.');}catch(e){setMessage(e.message);}finally{setSaving(false);}}
    return h(Section,{title:'Patient Item Consumption / Remaining Balance',subtitle:'Record actual use against received patient stock. Billing quantity is separate. No stock or bill is posted again.',actions:h('button',{type:'button',className:'btn btn-secondary',disabled:busy||saving,onClick:onReload},busy?'Loading…':'Refresh balances')},
      h('div',{className:'payment-filter-grid'},field('Search patient / ID',h('input',{'aria-label':'Consumption patient search',placeholder:'At least 3 characters',value:search,onChange:e=>{setSearch(e.target.value);setPatient('');setForm(null);}})),sel('Consumption patient',patient,v=>{setPatient(v);setForm(null);},[['','All matching patients'],...options.map(p=>[p.id,label(p.id)])]),sel('Consumption item',item,v=>{setItem(v);setForm(null);},[['','All received items'],...[...new Map(rows.filter(r=>!r.outside_visit_id&&r.status==='Received').map(r=>[r.store_item_id,[r.store_item_id,r.item_name]])).values()].sort((a,b)=>a[1].localeCompare(b[1]))])),
      error&&h('p',{role:'alert',className:'message error'},error),message&&h('p',{role:'alert',className:'message error'},message),
      h('p',{className:'small-note'},'Current patient balance = received − recorded use − confirmed returns. Pending returns are reserved and cannot be consumed. Historical use is not inferred from billing: check physical stock and record any missing usage before relying on the remaining balance. Billed returns still require Accounts reconciliation.'),
      !error&&table(['Patient','Item / Indent','Received','Recorded use (all dates)','Charged quantity','Confirmed returns','Remaining patient balance','Pending returns','Available to use / return','Action'],received.map(r=>{const u=quantities(r);return tr(r.id,[label(r.patient_id),`${r.item_name} · CI-${String(r.indent_no).padStart(5,'0')}`,`${r.received_qty} ${r.unit}`,u.used,u.charged,u.confirmed,u.remaining,u.pending,u.available,h('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap'}},nurse&&h('button',{type:'button',className:'btn btn-primary',disabled:busy||saving||u.available<=0,onClick:()=>open(r)},'Record Use'),nurse&&u.available>0&&h('button',{type:'button',className:'btn btn-secondary',disabled:busy||saving,onClick:()=>onReturn(r)},'Return Unused'),returns.filter(x=>x.indent_id===r.id&&x.status==='Pending').map(ret=>onConfirm&&h('button',{key:ret.id,type:'button',className:'btn btn-secondary',disabled:busy||saving,onClick:()=>onConfirm(ret)},`Confirm Return ${ret.quantity}`)))]);})),
      form&&h('form',{onSubmit:save,className:'card',style:{padding:'16px',marginTop:'12px'}},h('h4',null,`Record Use · ${label(form.indent.patient_id)} · ${form.indent.item_name}`),h('p',null,`CI-${String(form.indent.indent_no).padStart(5,'0')} · Available ${quantities(form.indent).available} ${form.indent.unit}`),h('div',{className:'grid two'},field('Used on',h(StrictDateInput,{'aria-label':'Consumption date',required:true,value:form.used_on,min:storeUsageDay(form.indent.received_at),max:today,onChange:e=>setForm({...form,used_on:e.target.value})})),field(`Used quantity (${form.indent.unit})`,h('input',{'aria-label':'Actual used quantity',type:'number',required:true,min:'.01',step:'.01',max:quantities(form.indent).available,value:form.quantity,onChange:e=>setForm({...form,quantity:e.target.value})})),field('Remarks / purpose',h('textarea',{'aria-label':'Consumption remarks',value:form.remarks,maxLength:2000,onChange:e=>setForm({...form,remarks:e.target.value})}))),h('button',{className:'btn btn-primary',disabled:saving||busy},saving?'Saving…':'Save Consumption'),h('button',{type:'button',className:'btn btn-secondary',disabled:saving,onClick:()=>{setForm(null);setMessage('');}},'Cancel')),
      h('h4',null,'Recorded consumption history'),h('div',{className:'payment-filter-grid'},sel('Consumption period',period,setPeriod,[['today','Today'],['week','This Week'],['month','Month'],['custom','Period (From–To)']]),period==='month'&&field('Month',h('input',{type:'month','aria-label':'Consumption month',value:month,onChange:e=>setMonth(e.target.value)})),period==='custom'&&field('From',h(StrictDateInput,{'aria-label':'Consumption From',value:from,onChange:e=>setFrom(e.target.value)})),period==='custom'&&field('To',h(StrictDateInput,{'aria-label':'Consumption To',value:to,onChange:e=>setTo(e.target.value)}))),
      !valid&&h('p',{role:'alert'},'Enter a valid date range; From must not be after To.'),valid&&!error&&h(React.Fragment,null,h('p',null,`${formatDateIN(start)} to ${formatDateIN(end)} · Used in period: ${Object.entries(totals).map(([u,q])=>`${q} ${u}`).join(' · ')||'0 recorded'}. Current balances above cover all dates.`),table(['Used on','Patient','Item / Indent','Quantity','Recorded by / at','Remarks','Status / correction','Action'],history.map(e=>{const r=rows.find(r=>r.id===e.indent_id);return tr(e.id,[formatDateIN(e.used_on),label(e.patient_id),`${r?.item_name||'Item'} · CI-${String(r?.indent_no||'').padStart(5,'0')}`,`${e.quantity} ${r?.unit||''}`,`${e.recorded_by_name} · ${formatDateTimeIN(e.recorded_at)}`,e.remarks||'—',e.voided_at?`Voided · ${e.voided_by_name} · ${formatDateTimeIN(e.voided_at)} · ${e.void_reason}`:'Recorded',!e.voided_at&&(manager||(nurse&&e.recorded_by===profile.id))?h('button',{type:'button',className:'btn btn-secondary',disabled:saving||busy,onClick:()=>voidEntry(e)},'Void / Correct'):'—']);})))
    );
  }

  function PatientConsumables({profile,initialView=null,categoryFilter='',section='',registerFilter='',onSummary=null}){
    // 2.14.91: categoryFilter = 'Consumables' | 'Pharmacy' (indents of that section only); section = '' (full page) | 'none' | 'register' | 'balance' — used by the Pharmacy & Stores dashboard
    const authority=useStoreAuthority(profile);
    const [patients,setPatients]=React.useState([]),[allIndentRows,setRows]=React.useState([]);
    const stockInfo=usePharmacyStock(),stock=stockInfo.items;
    const [busy,setBusy]=React.useState(false),[filter,setFilter]=React.useState('Open');
    const [allocations,setAllocations]=React.useState([]),[returns,setReturns]=React.useState([]),[consumptions,setConsumptions]=React.useState([]),[usageCharges,setUsageCharges]=React.useState([]),[consumptionError,setConsumptionError]=React.useState('Loading patient consumption…');
    const [form,setForm]=React.useState({patient_id:'',category:'',store_item_id:'',item_name:'',requested_qty:'1',unit:'Nos',request_remarks:''});
    const [masterItems,setMasterItems]=React.useState([]);
    const indentCategoryOf=r=>{const m=(masterItems||[]).find(x=>String(x.id)===String(r.store_item_id));return m?.item_category||'Consumables'};
    const rows=categoryFilter?(masterItems.length?allIndentRows.filter(r=>indentCategoryOf(r)===categoryFilter):[]):allIndentRows;
    const storeController=authority.controller,nurse=profile?.role==='Nurse'&&!isNursingManagerProfile(profile);
    const fallbackItems=['Adult Diapers','Examination Gloves','Sterile Gloves','Syringes','Dressing Materials','PPE','Feeding Tubes','Catheters','Oxygen Consumables','Underpads','Cotton / Gauze','Other Consumables'];
    const actorName=formalName(profile)||profile?.full_name||profile?.login_id||profile?.role||'Staff';
    const notify=(type,text)=>showSamaraActionToast(type,type==='success'?'Consumables updated':'Consumables action failed',text);
    const patientLabel=(id,row)=>{if(row?.outside_visit_id)return 'Outside · '+(row.outside_patient_name||'Patient')+' · Procedure '+String(row.outside_visit_id).slice(0,8);const p=patients.find(x=>x.id===id);return p?[formalName(p),p.patient_id&&`(${p.patient_id})`,p.room_no&&`Room ${p.room_no}${p.bed_no?`/${p.bed_no}`:''}`].filter(Boolean).join(' · '):'—'};
    const stockFor=r=>stock.find(x=>x.item_id===r.store_item_id)||stock.find(x=>String(x.item_name).toLowerCase()===String(r.item_name).toLowerCase());
    // 2.14.96: click an indent row for its full details (who, when, every step)
    const [indentDetail,setIndentDetail]=React.useState(null);
    // 2.15.89: a notification for one indent opens only that indent (global record-focus rule);
    // indents handed over but not received within 20 minutes are marked in red (SQL 205).
    // Only the full Patient Consumables page takes the focus (not Raise Indent / dashboard copies of this component).
    const [recordFocus,clearRecordFocus]=useRecordFocus(!section&&!initialView?'Patient Consumables':'__patient-consumables-embedded__');
    const [receiptOverdue,setReceiptOverdue]=React.useState({});
    async function loadReceiptOverdue(){
      try{const {data,error}=await client.rpc('indent_receipt_overdue_alerts');if(error)throw error;const map={};(Array.isArray(data)?data:[]).forEach(a=>{map[String(a.indent_id)]=a});setReceiptOverdue(map);}
      catch(_error){/* Needs SQL 205; the register works without it. */}
    }
    const rowClick=fn=>e=>{if(e&&e.target&&e.target.closest&&e.target.closest('button,a,input,select,textarea,label'))return;fn()};
    function indentFields(r){
      const u=indentUsage(r);const m=(masterItems||[]).find(x=>String(x.id)===String(r.store_item_id));const when=v=>v?formatDateTimeIN(v):'';
      const rel=returns.filter(x=>String(x.indent_id)===String(r.id));
      return {title:`CI-${String(r.indent_no||'').padStart(5,'0')} · ${r.status}`,subtitle:patientLabel(r.patient_id,r),fields:[
        ['Resident',patientLabel(r.patient_id,r)],['Item',`${m?.item_code?m.item_code+' · ':''}${r.item_name}`],['Section',m?.item_category||''],
        ['Requested',`${r.requested_qty} ${r.unit}`],['Raised by (nurse)',[r.initiated_by_name,when(r.initiated_at||r.created_at)].filter(Boolean).join(' · ')],['Request remarks',r.request_remarks],
        ['Approved',r.approved_qty!=null?`${r.approved_qty} ${r.unit}`:''],['Approved by',[r.approved_by_name,when(r.approved_at)].filter(Boolean).join(' · ')],['Approval remarks',r.approval_remarks],
        [r.outside_usage_approved_at?'Stock usage posted':'Handed over',r.handed_over_qty!=null?`${r.handed_over_qty} ${r.unit}`:''],['Handed over by',[r.handed_over_by_name,when(r.handed_over_at)].filter(Boolean).join(' · ')],['Handover remarks',r.handover_remarks],
        ['Received',r.received_qty!=null?`${r.received_qty} ${r.unit}`:''],[r.outside_usage_approved_at?'Usage approved by Stores':'Received by (nurse)',[r.received_by_name,when(r.received_at)].filter(Boolean).join(' · ')],['Receipt remarks',r.receipt_remarks],
        ['Charged',r.status==='Received'?`${u.charged} ${r.unit}`:''],['Returned / return pending',rel.length?rel.map(x=>`${x.quantity} ${x.unit||r.unit} ${x.status}${x.requested_by_name?' · by '+x.requested_by_name:''}${x.confirmed_by_name?' · confirmed '+x.confirmed_by_name:''}`).join('; '):''],
        ['Recorded actual use',r.status==='Received'?`${u.used??r.outside_used_qty??0} ${r.unit}`:''],['Remaining patient balance',r.status==='Received'?`${u.remaining??0} ${r.unit}`:''],['Available after pending returns',r.status==='Received'?`${u.balance} ${r.unit}`:'']]};
    }
    const stageStyle=status=>({display:'inline-block',padding:'5px 9px',borderRadius:'999px',fontWeight:800,fontSize:'12px',background:status==='Received'?'#e7f6ef':status==='Rejected'||status==='Receipt Discrepancy'?'#fdebec':status==='Handed Over'?'#eaf2ff':'#fff4dc',color:'#5d3146'});
    function navigateIndentFilter(target){
      setFilter(target);
      setTimeout(()=>document.getElementById('consumables-indent-register')?.scrollIntoView({behavior:'smooth',block:'start'}),40);
    }
    async function load(){
      setConsumptionError('Loading patient consumption…');
      async function all(table,columns='*',order='id'){let rows=[];for(let offset=0;;offset+=500){const r=await client.from(table).select(columns).order(order).range(offset,offset+499);if(r.error)throw r.error;rows.push(...(r.data||[]));if((r.data||[]).length<500)return rows;}}
      try{const [entries,charges,indents,allPatients,allReturns,allAllocations]=await Promise.all([all('patient_item_consumption'),all('bill_charge_requests'),all('patient_consumable_indents'),all('patients','id,title,full_name,patient_id,room_no,bed_no,is_active'),all('patient_store_returns'),all('bill_charge_store_allocations')]);setConsumptions(entries);setUsageCharges(charges);setRows(indents);setPatients(allPatients);setReturns(allReturns);setAllocations(allAllocations);setConsumptionError('');}catch(e){setConsumptionError('Patient balances are unavailable: '+e.message);}

      await stockInfo.reload();
      // v2.14.67: Stores Master (code + category) so the indent form matches Stores & Pharmacy.
      const mRes=await client.from('consumable_store_items').select('id,item_code,item_name,item_category,unit,active').eq('active',true);
      if(!mRes.error)setMasterItems(mRes.data||[]);
      await loadReceiptOverdue();

    }
    async function refreshIndents(){
      if(busy)return;
      setBusy(true);
      await load();
      setBusy(false);
      notify('success','Patient Consumables refreshed.');
    }
    React.useEffect(()=>{load()},[]);
    React.useEffect(()=>{const timer=setInterval(loadReceiptOverdue,60000);return()=>clearInterval(timer)},[]);
    React.useEffect(()=>{if(registerFilter)setFilter(registerFilter)},[registerFilter,section]);
    function chooseItem(id){const st=stock.find(x=>x.item_id===id);setForm(f=>({...f,store_item_id:id,item_name:displayStoreItemName(st?.item_name)||'',unit:st?.unit||'Nos'}))}
    // 2.16.15: several items in one go. The nurse adds items to a list (same patient), then one tap
    // initiates one indent per item — each item keeps its own approval / handover / receipt / balance, as before.
    const [indentLines,setIndentLines]=React.useState([]);
    function lineFromForm(){
      const st=stock.find(x=>x.item_id===form.store_item_id),qty=Number(form.requested_qty);
      if(!st||!form.item_name)return {error:'Select category and item.'};
      if(!Number.isFinite(qty)||qty<=0)return {error:'Enter a valid quantity.'};
      return {line:{key:`${form.store_item_id}-${Date.now()}`,store_item_id:form.store_item_id,item_name:form.item_name,category:form.category||categoryOfStock(st),code:codeOfStock(st),unit:form.unit||st.unit||'Nos',requested_qty:qty}};
    }
    // Same item added twice → quantities are added together on one line.
    const mergeLine=(list,line)=>{const i=list.findIndex(l=>String(l.store_item_id)===String(line.store_item_id));if(i<0)return [...list,line];const c=list.slice();c[i]={...c[i],requested_qty:Number(c[i].requested_qty||0)+Number(line.requested_qty||0)};return c};
    function addIndentLine(){
      const r=lineFromForm();if(r.error){notify('error',r.error);return}
      setIndentLines(ls=>mergeLine(ls,r.line));
      setForm(f=>({...f,store_item_id:'',item_name:'',requested_qty:'1',unit:'Nos'}));
    }
    const setLineQty=(key,v)=>setIndentLines(ls=>ls.map(l=>l.key===key?{...l,requested_qty:v}:l));
    const removeIndentLine=key=>setIndentLines(ls=>ls.filter(l=>l.key!==key));
    async function initiate(e){
      e.preventDefault();if(!nurse||busy)return;
      if(!form.patient_id){notify('error','Select patient.');return}
      let all=indentLines.slice();
      // An item still selected in the boxes (not yet added) is included too.
      if(form.store_item_id){const r=lineFromForm();if(r.error){notify('error',r.error);return}all=mergeLine(all,r.line)}
      if(!all.length){notify('error','Select patient, consumable and valid quantity.');return}
      const bad=all.find(l=>!stock.some(x=>x.item_id===l.store_item_id)||!Number.isFinite(Number(l.requested_qty))||Number(l.requested_qty)<=0);
      if(bad){notify('error',`Check the quantity / item for ${bad.item_name||'an item'}.`);return}
      const payload=all.map(l=>({patient_id:form.patient_id,store_item_id:l.store_item_id||null,item_name:l.item_name,requested_qty:Number(l.requested_qty),unit:l.unit||'Nos',request_remarks:form.request_remarks||null,initiated_by:profile.id,initiated_by_name:actorName,status:'Initiated'}));
      // One insert for the whole list: either all items are saved or none (no half-saved list).
      setBusy(true);const result=await client.from('patient_consumable_indents').insert(payload);setBusy(false);
      if(result.error)notify('error',result.error.message);
      else{notify('success',payload.length===1?'Patient consumable indent initiated and sent to Nurse Manager.':`${payload.length} indents initiated for ${patientLabel(form.patient_id)} and sent to Nurse Manager.`);setIndentLines([]);setForm(f=>({...f,store_item_id:'',item_name:'',requested_qty:'1',unit:'Nos',request_remarks:''}));await load()}
    }
    async function approve(row,reject=false){
      if(!storeController||busy)return;let qty=0,remarks='';const st=stockFor(row);
      if(!reject&&row.outside_visit_id){qty=Number(row.requested_qty);if(!confirm(`Approve ${qty} ${row.unit} of ${row.item_name} already used in outside care? Stock usage will be posted; no nurse receipt is needed.`))return;}
      if(!reject&&!row.outside_visit_id){const input=prompt(`Requested: ${row.requested_qty} ${row.unit}. Current Stores balance: ${st?.balance_qty??'—'} ${st?.unit||row.unit}. Enter quantity to approve:`,String(row.requested_qty));if(input===null)return;qty=Number(input);if(!qty||qty<=0||qty>Number(row.requested_qty)){notify('error','Enter a valid quantity not exceeding the requested quantity.');return}}
      remarks=prompt(reject?'Reason for rejection:':'Approval remarks (optional):',reject?'Not approved':'')||'';
      setBusy(true);const res=await client.rpc('approve_patient_consumable_indent_v2',{p_indent_id:row.id,p_approved_qty:qty,p_decision:reject?'Rejected':'Approved',p_remarks:remarks||null});setBusy(false);
      if(res.error)notify('error',res.error.message);else{notify('success',reject?'Indent rejected.':row.outside_visit_id?'Used items approved and stock usage posted. Ready for invoice.':'Indent approved.');await load()}
    }
    async function handover(row){
      if(!storeController||busy)return;if(row.outside_visit_id){if(!confirm('Confirm these recorded outside-care items were already used? No nurse receipt is required.'))return;setBusy(true);const res=await client.rpc('handover_patient_consumable_indent_v2',{p_indent_id:row.id,p_handed_over_qty:Number(row.requested_qty),p_remarks:'Reconcile already-used outside items'});setBusy(false);if(res.error)notify('error',res.error.message);else{notify('success','Used items approved. Ready for invoice.');await load();}return;}const st=stockFor(row);const input=prompt(`Approved: ${row.approved_qty} ${row.unit}. Stores available: ${st?.balance_qty??'—'} ${st?.unit||row.unit}. Enter actual quantity handed over:`,String(row.approved_qty||''));if(input===null)return;
      const qty=Number(input);if(!qty||qty<=0||qty>Number(row.approved_qty||0)){notify('error','Enter a valid quantity not exceeding the approved quantity.');return}
      const remarks=prompt('Handover remarks (optional):','')||'';setBusy(true);const res=await client.rpc('handover_patient_consumable_indent_v2',{p_indent_id:row.id,p_handed_over_qty:qty,p_remarks:remarks||null});setBusy(false);
      if(res.error)notify('error',res.error.message);else{notify('success','Handed over and deducted from Stores. Awaiting Nurse receipt.');await load()}
    }
    // 2.16.16: Nursing Manager approves / hands over all items of a Guest together (instead of item by item).
    // Each item still goes through the same approve / handover function as the single-row buttons.
    const [bulkQty,setBulkQty]=React.useState({}),[bulkOff,setBulkOff]=React.useState({});
    const bulkKey=(mode,r)=>`${mode}-${r.id}`;
    const bulkDefault=(mode,r)=>mode==='approve'?Number(r.requested_qty||0):Number(r.approved_qty||0);
    const bulkQtyOf=(mode,r)=>bulkQty[bulkKey(mode,r)]??String(bulkDefault(mode,r));
    function bulkGroups(statuses){
      const m=new Map();
      rows.filter(r=>statuses.includes(r.status)).forEach(r=>{const k=String(r.outside_visit_id||r.patient_id);if(!m.has(k))m.set(k,{patient_id:r.patient_id,items:[]});m.get(k).items.push(r)});
      const t=r=>String(r.initiated_at||r.created_at||'');
      return [...m.values()].filter(g=>g.items.length>1).map(g=>({...g,items:g.items.slice().sort((a,b)=>t(a).localeCompare(t(b))||Number(a.indent_no||0)-Number(b.indent_no||0))})).sort((a,b)=>t(a.items[0]).localeCompare(t(b.items[0])));
    }
    async function bulkRun(group,mode,reject=false){
      if(!storeController||busy)return;
      const picked=group.items.filter(r=>!bulkOff[bulkKey(mode,r)]);
      if(!picked.length){notify('error','Tick at least one item.');return}
      if(!reject){
        const bad=picked.find(r=>{const q=Number(bulkQtyOf(mode,r));return !Number.isFinite(q)||q<=0||q>bulkDefault(mode,r)});
        if(bad){notify('error',`${bad.item_name}: enter a quantity more than 0 and not more than ${mode==='approve'?'requested':'approved'} (${bulkDefault(mode,bad)} ${bad.unit}).`);return}
      }
      const verb=reject?'Reject':mode==='approve'?'Approve':'Hand over';
      if(!confirm(`${verb} ${picked.length} item(s) for ${patientLabel(group.patient_id,group.items[0])}?`))return;
      const remarks=prompt(reject?'Reason for rejection:':mode==='approve'?'Approval remarks (optional):':'Handover remarks (optional):',reject?'Not approved':'');
      if(remarks===null)return;
      if(reject&&!String(remarks).trim()){notify('error','Enter the reason for rejection.');return}
      setBusy(true);let ok=0;const fails=[];
      for(const r of picked){
        const q=Number(bulkQtyOf(mode,r));
        const res=mode==='approve'
          ?await client.rpc('approve_patient_consumable_indent_v2',{p_indent_id:r.id,p_approved_qty:reject?0:q,p_decision:reject?'Rejected':'Approved',p_remarks:remarks||null})
          :await client.rpc('handover_patient_consumable_indent_v2',{p_indent_id:r.id,p_handed_over_qty:q,p_remarks:remarks||null});
        if(res.error)fails.push(`${r.item_name}: ${res.error.message}`);else ok++;
      }
      setBusy(false);
      const done=reject?'rejected':mode==='approve'?'approved':'handed over';
      if(fails.length)notify('error',`${ok} item(s) ${done}. Not done — ${fails.join(' · ')}`);
      else notify('success',group.items[0]?.outside_visit_id&&!reject?`${ok} used-item indent(s) approved and stock usage reconciled. No nurse receipt required.`:mode==='handover'?`${ok} item(s) handed over and deducted from Stores. Awaiting Nurse receipt.`:`${ok} item(s) ${done}.`);
      setBulkQty(x=>{const c={...x};picked.forEach(r=>delete c[bulkKey(mode,r)]);return c});
      setBulkOff(x=>{const c={...x};picked.forEach(r=>delete c[bulkKey(mode,r)]);return c});
      await load();
    }
    function bulkCard(group,mode){
      const picked=group.items.filter(r=>!bulkOff[bulkKey(mode,r)]).length;
      const first=group.items[0];
      return h('div',{key:`${mode}-${group.items[0]?.outside_visit_id||group.patient_id}`,className:'card',style:{padding:'12px',marginBottom:'12px',border:'1px solid #ead2dd'}},
        h('div',{style:{display:'flex',justifyContent:'space-between',gap:'8px',flexWrap:'wrap',alignItems:'baseline'}},
          h('strong',null,patientLabel(group.patient_id,group.items[0])),
          h('small',{style:{color:'#7a5566'}},`${group.items.length} items · ${first.initiated_by_name||'—'}${first.initiated_at||first.created_at?` · ${formatDateTimeIN(first.initiated_at||first.created_at)}`:''}`)
        ),
        h('div',{className:'table-wrap',style:{marginTop:'8px'}},h('table',{className:'table'},
          h('thead',null,h('tr',null,['✓','Indent','Item','Requested',mode==='approve'?'Store balance':'Approved','Store balance',mode==='approve'?'Approve qty':'Hand over qty'].filter((x,i)=>!(mode==='approve'&&i===5)).map((x,i)=>h('th',{key:i},x)))),
          h('tbody',null,group.items.map(r=>{const st=stockFor(r);const bal=Number(st?.balance_qty??0);const k=bulkKey(mode,r);const on=!bulkOff[k];const q=Number(bulkQtyOf(mode,r));const short=on&&q>bal;
            return h('tr',{key:k,style:{opacity:on?1:.55}},
              h('td',null,h('input',{type:'checkbox',checked:on,disabled:busy,'aria-label':`Include ${r.item_name}`,onChange:e=>setBulkOff(x=>({...x,[k]:!e.target.checked}))})),
              h('td',null,`CI-${String(r.indent_no||'').padStart(5,'0')}`),
              h('td',null,h('strong',null,r.item_name),r.request_remarks&&h('small',{style:{display:'block'}},r.request_remarks)),
              h('td',null,`${r.requested_qty} ${r.unit}`),
              mode==='handover'&&h('td',null,`${r.approved_qty??'—'} ${r.unit}`),
              h('td',{style:{color:short?'#b42318':undefined,fontWeight:short?800:undefined}},st?`${bal} ${st.unit||r.unit}${short?' — less than this':''}`:'—'),
              h('td',null,h('input',{type:'number',min:'0.01',step:'0.01',disabled:busy||!on,readOnly:!!r.outside_visit_id,'aria-label':`Quantity for ${r.item_name}`,value:bulkQtyOf(mode,r),onChange:e=>setBulkQty(x=>({...x,[k]:e.target.value})),style:{width:'90px'}}),' ',r.unit)
            )}))
        )),
        h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',marginTop:'10px'}},
          mode==='approve'
            ?[h('button',{key:'a',type:'button',className:'btn btn-primary',disabled:busy||!picked,onClick:()=>bulkRun(group,'approve',false)},busy?'Saving…':`Approve ticked (${picked})`),h('button',{key:'r',type:'button',className:'btn btn-secondary',disabled:busy||!picked,onClick:()=>bulkRun(group,'approve',true)},`Reject ticked (${picked})`)]
            :h('button',{type:'button',className:'btn btn-primary',disabled:busy||!picked,onClick:()=>bulkRun(group,'handover',false)},busy?'Saving…':`Hand over ticked (${picked})`)
        )
      );
    }
    function bulkPanel(){
      if(!storeController)return null;
      const ap=bulkGroups(['Initiated']),ho=bulkGroups(['Approved','Partially Approved']);
      if(!ap.length&&!ho.length)return null;
      return h('div',{style:{marginBottom:'16px'}},
        ap.length>0&&h('div',null,h('h3',{style:{margin:'4px 0 4px',fontSize:'16px'}},'Approve together — Guests with several items waiting'),h('small',{style:{display:'block',marginBottom:'8px',color:'#7a5566'}},'Untick an item to leave it for later; change the quantity if needed.'),ap.map(g=>bulkCard(g,'approve'))),
        ho.length>0&&h('div',null,h('h3',{style:{margin:'10px 0 8px',fontSize:'16px'}},'Hand over together — approved items waiting'),ho.map(g=>bulkCard(g,'handover')))
      );
    }
    async function receive(row){
      if(!nurse||busy||row.outside_visit_id)return;const input=prompt(`Handed over: ${row.handed_over_qty} ${row.unit}. Confirm actual quantity physically received:`,String(row.handed_over_qty||''));if(input===null)return;
      const qty=Number(input);if(!qty||qty<=0||qty>Number(row.handed_over_qty||0)){notify('error','Enter a valid quantity not exceeding the handed-over quantity.');return}
      const remarks=prompt(qty<Number(row.handed_over_qty||0)?'Quantity differs from handover. Please state the discrepancy:':'Receipt remarks (optional):','')||'';
      setBusy(true);const res=await client.rpc('receive_patient_consumable_indent',{p_indent_id:row.id,p_received_qty:qty,p_remarks:remarks||null});setBusy(false);
      if(res.error)notify('error',res.error.message);else{notify('success',qty<Number(row.handed_over_qty||0)?'Receipt recorded with discrepancy. Nurse Manager must reconcile the difference.':'Consumables received. Indent completed.');await load()}
    }
    async function resolveDiscrepancy(row){
      if(!storeController||busy)return;const diff=Number(row.handed_over_qty||0)-Number(row.received_qty||0);const remarks=prompt(`Discrepancy: ${diff} ${row.unit}. Confirm this balance has been physically returned to Stores and enter remarks:`,`Returned ${diff} ${row.unit} to Stores`);if(!String(remarks||'').trim())return;
      setBusy(true);const res=await client.rpc('resolve_patient_consumable_discrepancy',{p_indent_id:row.id,p_remarks:String(remarks).trim()});setBusy(false);
      if(res.error)notify('error',res.error.message);else{notify('success','Discrepancy returned to Stores and reconciled.');await load()}
    }
    function indentUsage(row){
      if(row.outside_visit_id)return {charged:Math.min(Number(row.outside_used_qty||0),Math.max(0,Number(row.received_qty||0)-Number(row.outside_wastage_qty||0))),returned:0,balance:0};
      return patientIndentQuantities(row,consumptions,returns,allocations,usageCharges);
    }
    async function requestUnusedReturn(row){
      if(profile?.role!=='Nurse'||busy||consumptionError)return;const u=indentUsage(row);if(!(u.balance>0)){notify('error','No unused received balance is available to return.');return}
      const input=prompt(`Unused received balance: ${u.balance} ${row.unit}. Enter quantity to return to Stores:`,String(u.balance));if(input===null)return;
      const qty=Number(input);if(!qty||qty<=0||qty>u.balance){notify('error',`Enter a valid quantity up to ${u.balance} ${row.unit}.`);return}
      const remarks=prompt('Return remarks (optional):','Unused patient item returned')||'';setBusy(true);
      const res=await client.rpc('request_patient_store_return',{p_indent_id:row.id,p_quantity:qty,p_remarks:remarks||null});setBusy(false);
      if(res.error)notify('error',res.error.message);else{notify('success','Unused item return sent to Stores Manager for confirmation.');await load()}
    }
    async function confirmUnusedReturn(ret){
      if(!storeController||busy)return;const remarks=prompt(`Confirm ${ret.quantity} ${ret.unit} physically received back into Stores?`,'Returned unused patient stock received')||'';if(!String(remarks).trim())return;
      setBusy(true);const res=await client.rpc('confirm_patient_store_return',{p_return_id:ret.id,p_remarks:String(remarks).trim()});setBusy(false);
      if(res.error)notify('error',res.error.message);else{notify('success','Return confirmed and quantity added back to Stores.');await load()}
    }
    const openStatuses=['Initiated','Approved','Partially Approved','Handed Over','Receipt Discrepancy'];
    const focusId=recordFocus?.id?String(recordFocus.id):'';
    const visible=focusId?allIndentRows.filter(r=>String(r.id)===focusId):rows.filter(r=>filter==='All'||(filter==='Open'?openStatuses.includes(r.status):filter==='Awaiting Handover'?['Approved','Partially Approved'].includes(r.status):r.status===filter));
    const counts={initiated:rows.filter(r=>r.status==='Initiated').length,handover:rows.filter(r=>['Approved','Partially Approved'].includes(r.status)).length,receipt:rows.filter(r=>r.status==='Handed Over').length,discrepancy:rows.filter(r=>r.status==='Receipt Discrepancy').length};
    // 2.14.91: numbers for the Pharmacy & Stores dashboard boxes
    const indentToday=todayISOIndia();
    const indentWeekStart=(()=>{const d=new Date(`${indentToday}T12:00:00`);d.setDate(d.getDate()-((d.getDay()+6)%7));return d.toISOString().slice(0,10)})();
    const indentDay=r=>{try{return r.initiated_at||r.created_at?new Date(r.initiated_at||r.created_at).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}):''}catch(_){return String(r.created_at||'').slice(0,10)}};
    const indentRowIds=new Set(rows.map(r=>String(r.id)));
    const indentSummary={
      loaded:!categoryFilter||masterItems.length>0,
      ...counts,
      open:rows.filter(r=>openStatuses.includes(r.status)).length,
      total:rows.length,
      today:rows.filter(r=>indentDay(r)===indentToday).length,
      week:rows.filter(r=>indentDay(r)>=indentWeekStart).length,
      withBalance:rows.filter(r=>r.status==='Received'&&indentUsage(r).balance>0).length,
      returnsPending:returns.filter(x=>x.status==='Pending'&&indentRowIds.has(String(x.indent_id))).length
    };
    const indentSummaryKey=JSON.stringify(indentSummary);
    React.useEffect(()=>{if(typeof onSummary==='function')onSummary(indentSummary)},[indentSummaryKey]);
    // v2.14.67: Category (Consumables / Pharmacy) first, then the item with its Stores code
    // and live store balance — the same code, name and category as Stores & Pharmacy.
    const masterById=new Map((masterItems||[]).map(m=>[String(m.id),m]));
    const categoryOfStock=x=>masterById.get(String(x.item_id))?.item_category||'Consumables';
    const codeOfStock=x=>masterById.get(String(x.item_id))?.item_code||'';
    const alphaSort=(a,b)=>String(a||'').localeCompare(String(b||''),'en',{sensitivity:'base',numeric:true});
    const indentCategories=[...new Set(stock.map(categoryOfStock))].sort(alphaSort);
    const options=stock.filter(x=>!form.category||categoryOfStock(x)===form.category).slice().sort((a,b)=>alphaSort(a.item_name,b.item_name));
    useScrollToFocused(focusId?`indent-row-${focusId}`:'',!!focusId&&visible.length>0);
    if(section==='none')return null;
    return h('div',null,
      indentDetail&&h(RowDetailModal,{title:indentDetail.title,subtitle:indentDetail.subtitle,fields:indentDetail.fields,onClose:()=>setIndentDetail(null)}),
      !section&&h(Section,{title:'Patient Consumables',subtitle:'Nurse initiates for a patient → Store In-charge approves and hands over → Nurse confirms actual receipt.'},
        h('div',{className:'grid stats'},
          [['Awaiting Approval',counts.initiated,'Initiated'],['Awaiting Handover',counts.handover,'Awaiting Handover'],['Awaiting Receipt',counts.receipt,'Handed Over'],['Discrepancies',counts.discrepancy,'Receipt Discrepancy']].map(([label,count,target])=>h('button',{key:label,type:'button',className:'card stat',onClick:()=>navigateIndentFilter(target),style:{width:'100%',textAlign:'left',cursor:'pointer',border:filter===target?'2px solid #b30b5d':'1px solid #ead2dd',fontFamily:'inherit'}},h('span',null,label),h('strong',null,count),h('small',{style:{display:'block',marginTop:'7px',color:'#9b1456',fontWeight:800}},'Tap to view →')))
        )
      ),
      !section&&nurse&&h('div',{id:'patient-raise-indent',style:{scrollMarginTop:'90px'}},h(Section,{title:'New Patient Indent',subtitle:'Select an active patient and a consumable or pharmacy item. Available store balance refreshes automatically; stock is issued at handover.'},
        h('form',{onSubmit:initiate},h('div',{className:'grid two'},
          h('div',{className:'field'},h('label',null,'Patient *'),h('select',{value:form.patient_id,onChange:e=>setForm({...form,patient_id:e.target.value}),required:true},h('option',{value:''},'Select active patient'),patients.filter(p=>p.is_active!==false).map(p=>h('option',{key:p.id,value:p.id},patientLabel(p.id))))),
          h('div',{className:'field'},h('label',null,'Category *'),h('select',{'aria-label':'Category',value:form.category,onChange:e=>setForm(f=>({...f,category:e.target.value,store_item_id:'',item_name:''}))},h('option',{value:''},'Select category'),indentCategories.map(c=>h('option',{key:c,value:c},`${c} (${stock.filter(x=>categoryOfStock(x)===c).length})`)))),
          h('div',{className:'field'},h('label',null,'Item *'),h('select',{'aria-label':'Consumable / Pharmacy Item',value:form.store_item_id,onChange:e=>chooseItem(e.target.value),disabled:!form.category},h('option',{value:''},form.category?`Select ${form.category} item (${options.length})`:'Select a category first'),options.map(x=>h('option',{key:x.item_id,value:x.item_id},`${codeOfStock(x)?`${codeOfStock(x)} · `:''}${x.item_name} · Store balance ${x.balance_qty} ${x.unit}`)))),
          h('div',{className:'field'},h('label',null,'Quantity *'),h('input',{type:'number',min:'0.01',step:'0.01',value:form.requested_qty,onChange:e=>setForm({...form,requested_qty:e.target.value})})),
          h('div',{className:'field'},h('label',null,'Unit'),h('input',{value:form.unit,readOnly:true}))
        ),h(PharmacyStockPanel,{stock:stockInfo,itemId:form.store_item_id,quantity:form.requested_qty,unit:form.unit,showSelector:false}),
        h('div',{style:{margin:'8px 0 14px'}},h('button',{type:'button',className:'btn btn-secondary',disabled:busy||!form.item_name,onClick:addIndentLine},'+ Add item to list'),h('small',{style:{marginLeft:'10px',color:'#7a5566'}},'Add each item, then initiate all together.')),
        indentLines.length>0&&h('div',{className:'field'},h('label',null,`Items in this indent (${indentLines.length})`),
          h('div',{className:'table-wrap'},h('table',{className:'table'},
            h('thead',null,h('tr',null,['#','Item','Category','Quantity','Store balance',''].map((x,i)=>h('th',{key:i},x)))),
            h('tbody',null,indentLines.map((l,i)=>{const st=stock.find(x=>x.item_id===l.store_item_id);const bal=Number(st?.balance_qty??0);const short=Number(l.requested_qty)>bal;return h('tr',{key:l.key},
              h('td',null,i+1),
              h('td',null,h('strong',null,l.item_name),l.code&&h('small',{style:{display:'block',color:'#7a5566'}},l.code)),
              h('td',null,l.category||'—'),
              h('td',null,h('input',{type:'number',min:'0.01',step:'0.01','aria-label':`Quantity for ${l.item_name}`,value:l.requested_qty,onChange:e=>setLineQty(l.key,e.target.value),style:{width:'90px'}}),' ',l.unit),
              h('td',{style:{color:short?'#b42318':undefined,fontWeight:short?800:undefined}},st?`${bal} ${st.unit||l.unit}${short?' — less than asked':''}`:'—'),
              h('td',null,h('button',{type:'button',className:'btn btn-danger',disabled:busy,onClick:()=>removeIndentLine(l.key)},'Remove'))
            )}))
          ))
        ),
        h('div',{className:'field'},h('label',null,indentLines.length?'Reason / Remarks (for all items above)':'Reason / Remarks'),h('textarea',{rows:2,value:form.request_remarks,onChange:e=>setForm({...form,request_remarks:e.target.value}),placeholder:'Optional clinical/use note'})),
        (()=>{const n=indentLines.length+(form.item_name&&!indentLines.some(l=>String(l.store_item_id)===String(form.store_item_id))?1:0);return h('button',{className:'btn btn-primary',disabled:busy||n===0},busy?'Saving…':n>1?`Initiate ${n} Indents`:'Initiate Indent')})())
      )),
      (!section||section==='balance')&&h(ResidentItemConsumption,{profile,rows,patients,entries:consumptions,returns,allocations,charges:usageCharges,onReload:refreshIndents,onReturn:requestUnusedReturn,onConfirm:storeController?confirmUnusedReturn:null,busy,error:consumptionError}),
      (!section||section==='register')&&h('div',{id:'consumables-indent-register',style:{scrollMarginTop:'90px'}},h(Section,{title:categoryFilter?`${categoryFilter} Indent Register`:'Consumables Indent Register',actions:h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:refreshIndents},busy?'Refreshing…':'↻ Refresh'),['Open','Initiated','Awaiting Handover','Handed Over','Receipt Discrepancy','Received','Rejected','All'].map(x=>h('button',{type:'button',key:x,className:`btn ${filter===x?'btn-primary':'btn-secondary'}`,onClick:()=>navigateIndentFilter(x),'aria-pressed':filter===x},x)))},
        focusId?h(RecordFocusBanner,{focus:recordFocus,onShowAll:clearRecordFocus}):null,
        !focusId&&bulkPanel(),
        h('div',{className:'table-wrap'},h('table',{className:'table'},h('thead',null,h('tr',null,['Indent','Patient','Item / Store Balance','Requested','Approved','Handed Over','Received','Status','Initiated By / Time','Approval / Handover','Receipt','Action'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,visible.length?visible.map(r=>{const st=stockFor(r);const late=!r.outside_visit_id&&r.status==='Handed Over'?receiptOverdue[String(r.id)]:null;return h('tr',{key:r.id,id:`indent-row-${r.id}`,className:'row-clickable',onClick:rowClick(()=>setIndentDetail(indentFields(r)))},
            h('td',null,`CI-${String(r.indent_no||'').padStart(5,'0')}`),h('td',null,patientLabel(r.patient_id,r)),h('td',null,h('strong',null,r.item_name),h('small',{style:{display:'block'}},`Store: ${st?.balance_qty??'—'} ${st?.unit||r.unit}`),r.request_remarks&&h('small',{style:{display:'block'}},r.request_remarks)),
            h('td',null,`${r.requested_qty} ${r.unit}`),h('td',null,r.approved_qty!=null?`${r.approved_qty} ${r.unit}`:'—'),h('td',null,r.handed_over_qty!=null?`${r.handed_over_qty} ${r.unit}`:'—'),h('td',null,r.received_qty!=null?`${r.received_qty} ${r.unit}`:'—'),h('td',null,h('span',{style:stageStyle(r.status)},r.outside_visit_id&&r.status==='Received'?'Used items approved':r.status),late&&h('small',{style:{display:'block',marginTop:'5px',color:'#b2192d',fontWeight:800}},`Not received · ${late.minutes} min`)),
            h('td',null,h('strong',null,r.initiated_by_name||'—'),h('small',{style:{display:'block'}},r.initiated_at?formatDateTimeIN(r.initiated_at):'—')),
            h('td',null,r.approved_by_name&&h('div',null,h('strong',null,`Approved: ${r.approved_by_name}`),h('small',{style:{display:'block'}},r.approved_at?formatDateTimeIN(r.approved_at):'')),r.handed_over_by_name&&h('div',{style:{marginTop:'5px'}},h('strong',null,`${r.outside_usage_approved_at?'Usage posted':'Handed over'}: ${r.handed_over_by_name}`),h('small',{style:{display:'block'}},r.handed_over_at?formatDateTimeIN(r.handed_over_at):''))),
            h('td',null,r.received_by_name?h('div',null,h('strong',null,r.received_by_name),h('small',{style:{display:'block'}},r.received_at?formatDateTimeIN(r.received_at):''),r.receipt_remarks&&h('small',{style:{display:'block'}},r.receipt_remarks)):'—'),
            h('td',null,h('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap'}},storeController&&r.status==='Initiated'&&h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>approve(r,false)},r.outside_visit_id?'Approve used items':'Approve'),storeController&&r.status==='Initiated'&&h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>approve(r,true)},'Reject'),storeController&&(['Approved','Partially Approved'].includes(r.status)||(r.outside_visit_id&&r.status==='Handed Over'))&&h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>handover(r)},r.outside_visit_id?'Confirm used items':'Hand Over'),nurse&&!r.outside_visit_id&&r.status==='Handed Over'&&h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>receive(r)},'Received'),storeController&&r.status==='Receipt Discrepancy'&&h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>resolveDiscrepancy(r)},'Return & Reconcile'),!((storeController&&['Initiated','Approved','Partially Approved','Receipt Discrepancy'].includes(r.status))||(nurse&&!r.outside_visit_id&&r.status==='Handed Over'))&&h('span',null,'—')))
          )}):h('tr',null,h('td',{colSpan:12,style:{textAlign:'center',padding:'24px'}},'No consumable indents in this view.')))
        ))
      ))
    );
  }

