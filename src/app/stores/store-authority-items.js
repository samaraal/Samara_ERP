  function useStoreAuthority(profile){
    const [assignments,setAssignments]=React.useState([]),[ready,setReady]=React.useState(false),[canApprove,setCanApprove]=React.useState(false);
    const reload=React.useCallback(async()=>{
      const [res,permission]=await Promise.all([
        client.from('store_incharge_assignments').select('*').order('created_at',{ascending:false}).limit(100),
        client.rpc('stores_return_approval_allowed')
      ]);
      if(!res.error)setAssignments(res.data||[]);else console.warn(res.error);
      setCanApprove(!permission.error&&permission.data===true);setReady(true);
    },[]);
    React.useEffect(()=>{
      reload();const timer=setInterval(reload,30000);window.addEventListener('focus',reload);
      const ch=client.channel('stores-return-authority-'+profile.id).on('postgres_changes',{event:'*',schema:'public',table:'store_incharge_assignments'},reload).subscribe();
      return()=>{clearInterval(timer);window.removeEventListener('focus',reload);client.removeChannel(ch)};
    },[reload,profile.id]);
    const now=Date.now();
    const active=assignments.find(x=>x.status==='Active'&&new Date(x.effective_from).getTime()<=now)||null;
    const scheduled=assignments.find(x=>x.status==='Active'&&new Date(x.effective_from).getTime()>now)||null;
    const delegated=Boolean(active),isSTD=profile?.role==='STD';
    const controller=(isNursingManagerProfile(profile)&&!delegated)||(isSTD&&delegated);
    return {assignments,active,scheduled,delegated,controller,canApprove,ready,reload};
  }

  const displayStoreItemName=value=>String(value||'').trim().toLowerCase()==='examination'?'Examination Gloves':String(value||'').trim();

  function StoreInchargeAssignment({profile,authority}){
    const canAssign=authority.canApprove,current=authority.active||authority.scheduled;
    const [busy,setBusy]=React.useState(false),[editing,setEditing]=React.useState(false),[returnOpen,setReturnOpen]=React.useState(false),[returnError,setReturnError]=React.useState('');
    const actionLock=React.useRef(false);
    const localInput=value=>{const d=value?new Date(value):new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
    const defaultUntil=()=>localInput(Date.now()+12*60*60*1000);
    const [form,setForm]=React.useState({effective_from:localInput(),effective_until:defaultUntil(),reason:''});
    const [returnedAt,setReturnedAt]=React.useState(localInput()),[returnReason,setReturnReason]=React.useState('');
    async function assign(e){
      e.preventDefault();if(!canAssign||actionLock.current)return;
      if(!form.reason.trim())return showSamaraActionToast('error','Reason required','Enter the reason for temporary delegation.');
      actionLock.current=true;setBusy(true);
      try{
        const rpc=editing&&current?'modify_stores_std_assignment':'assign_stores_to_std';
        const payload={p_effective_from:new Date(form.effective_from).toISOString(),p_effective_until:new Date(form.effective_until).toISOString(),p_reason:form.reason.trim()};
        if(editing&&current)payload.p_assignment_id=current.id;
        const res=await client.rpc(rpc,payload);if(res.error)throw res.error;
        showSamaraActionToast('success','Assignment saved','STD retains Stores and Food & Diet control until Admin/Director approves Return to Duty.');
        setEditing(false);setForm({effective_from:localInput(),effective_until:defaultUntil(),reason:''});await authority.reload();
      }catch(error){showSamaraActionToast('error','Unable to save assignment',error.message)}finally{actionLock.current=false;setBusy(false)}
    }
    function beginEdit(){if(!current)return;setForm({effective_from:localInput(current.effective_from),effective_until:localInput(current.effective_until),reason:current.reason||''});setEditing(true)}
    function openReturn(){setReturnedAt(localInput());setReturnReason('');setReturnError('');setReturnOpen(true)}
    async function approveReturn(e){
      e.preventDefault();if(!canAssign||!authority.active||actionLock.current)return;
      if(!returnedAt||!Number.isFinite(new Date(returnedAt).getTime())||new Date(returnedAt).getTime()>Date.now())return setReturnError('Enter the actual return date and time, no later than now.');
      if(!returnReason.trim())return setReturnError('Please enter return confirmation remarks.');
      actionLock.current=true;setBusy(true);setReturnError('');
      try{
        const {data,error}=await client.rpc('approve_stores_return_to_duty',{p_assignment_id:authority.active.id,p_returned_at:new Date(returnedAt).toISOString(),p_reason:returnReason.trim()});
        if(error)throw error;
        setReturnOpen(false);setEditing(false);await authority.reload();
        showSamaraActionToast('success','Return to Duty approved',data.message+(data.leave_shortened?' Approved leave has also been shortened to the actual period taken.':''));
      }catch(error){setReturnError(error.message||'Unable to approve return.')}finally{actionLock.current=false;setBusy(false)}
    }
    async function cancelScheduled(){
      if(!canAssign||busy||!authority.scheduled)return;
      const reason=prompt('Reason for cancelling the future delegation:','');if(!reason?.trim())return;
      setBusy(true);try{const {error}=await client.rpc('end_stores_std_assignment',{p_assignment_id:authority.scheduled.id,p_reason:reason.trim()});if(error)throw error;await authority.reload();setEditing(false)}catch(error){showSamaraActionToast('error','Unable to cancel',error.message)}finally{setBusy(false)}
    }
    const awaiting=authority.active&&new Date(authority.active.effective_until).getTime()<=Date.now();
    return h(React.Fragment,null,h(StaffReturnToDuty,{profile,reviewOnly:true,onChanged:authority.reload}),h(StaffLeaveChanges,{profile,reviewOnly:true,onChanged:authority.reload}),h(Section,{title:'Stores In-charge Assignment',subtitle:'Stores and Food & Diet handover · STD continues until Admin/Director approves the Nursing Manager’s return.'},
      h('div',{className:'card',style:{padding:'14px',marginBottom:'14px',borderLeft:`5px solid ${authority.active?'#f28c28':'#b30b5d'}`}},
        h('strong',null,authority.active?'Current In-charge: STD — awaiting approved return':'Current In-charge: Nurse Manager'),
        current&&h('div',{style:{marginTop:'6px'}},`Delegation starts: ${formatDateTimeIN(current.effective_from)} · Expected return: ${formatDateTimeIN(current.effective_until)} · ${current.reason}`),
        awaiting&&h('p',{className:'message',role:'status'},'Expected return time has passed. STD remains in charge. Admin/Director: confirm the actual return or update the expected return if leave is extended.'),
        canAssign&&current&&h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',marginTop:'10px'}},
          h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:beginEdit},'Update Expected Return / Assignment'),
          authority.active?h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:openReturn},'Approve Return to Duty'):h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:cancelScheduled},'Cancel Future Assignment'))
      ),
      canAssign&&(!current||editing)&&h('form',{onSubmit:assign},h('div',{className:'grid two'},
        h('div',{className:'field'},h('label',null,'Effective From *'),h('input',{type:'datetime-local',value:form.effective_from,onChange:e=>setForm({...form,effective_from:e.target.value}),required:true})),
        h('div',{className:'field'},h('label',null,'Expected Return *'),h('input',{type:'datetime-local',value:form.effective_until,onChange:e=>setForm({...form,effective_until:e.target.value}),required:true})),
        h('div',{className:'field'},h('label',null,'Reason for Delegation / Extension *'),h('textarea',{rows:2,value:form.reason,onChange:e=>setForm({...form,reason:e.target.value}),required:true,placeholder:'Example: Nursing Manager on leave / leave extended'}))
      ),h('p',null,'Expected return is for planning. STD’s operational rights will not expire automatically.'),h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':editing?'Save Modification':'Assign Stores & Food to STD'),editing&&h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>setEditing(false)},'Close Without Change'))),
      h('div',{className:'table-wrap'},h('table',{className:'table'},h('thead',null,h('tr',null,['Start / Expected Return','Position','Reason','Assigned By','Status / Return Approval'].map(x=>h('th',{key:x},x)))),h('tbody',null,
        authority.assignments.length?authority.assignments.map(r=>{const displayStatus=r.status==='Active'?(new Date(r.effective_from).getTime()>Date.now()?'Scheduled':new Date(r.effective_until).getTime()<Date.now()?'Awaiting return approval · STD continues':'STD continues until return approval'):r.return_approved_at?'Return approved':'Ended';return h('tr',{key:r.id},h('td',null,`${formatDateTimeIN(r.effective_from)} — ${formatDateTimeIN(r.effective_until)}`),h('td',null,'STD'),h('td',null,r.reason),h('td',null,r.assigned_by_name||'—'),h('td',null,displayStatus,r.return_approved_at&&h('div',null,`Returned: ${formatDateTimeIN(r.returned_at)} · Approved by ${r.return_approved_by_name||'Management'} at ${formatDateTimeIN(r.return_approved_at)} · ${r.end_reason||''}`)))}):h('tr',null,h('td',{colSpan:5,style:{textAlign:'center'}},'No temporary assignment history.')))))
    ),returnOpen&&h('div',{className:'modal-backdrop'},h('form',{className:'card modal',onSubmit:approveReturn},
      h('h3',null,'Approve Return to Duty'),
      h('p',null,'Confirm that the Nursing Manager has actually resumed duty. Approval transfers Stores and Food & Diet control back from STD immediately.'),
      h('div',{className:'field'},h('label',{htmlFor:'stores-actual-return'},'Actual Return Date & Time *'),h('input',{id:'stores-actual-return',type:'datetime-local',required:true,value:returnedAt,max:localInput(),min:authority.active?localInput(authority.active.effective_from):undefined,disabled:busy,onChange:e=>setReturnedAt(e.target.value)})),
      h('div',{className:'field'},h('label',{htmlFor:'stores-return-reason'},'Confirmation Remarks *'),h('textarea',{id:'stores-return-reason',required:true,rows:3,value:returnReason,disabled:busy,onChange:e=>setReturnReason(e.target.value),placeholder:'Confirm the return and handover'})),
      h('small',null,'For an early return, approved leave covering the return date is shortened to the previous day and the original approval is preserved. Record attendance and duty assignments separately.'),
      returnError&&h('p',{className:'message error',role:'alert'},returnError),
      h('div',{className:'modal-actions'},h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>setReturnOpen(false)},'Cancel'),h('button',{type:'submit',className:'btn btn-primary',disabled:busy},busy?'Approving…':'Approve & Transfer Control'))
    )));
  }

  function StoresInchargeAssignmentPage({profile}){
    const authority=useStoreAuthority(profile);
    return h('div',null,h(StoreInchargeAssignment,{profile,authority}));
  }

// Shared non-financial stock display for charge requests and patient indents.
// Stock is informational here; only the existing handover workflow issues stock.
function stockAvailability(item, quantity, unit){
  if(!item)return {status:'Select an inventory item',shortage:false};
  if(item.balance_qty===null||item.balance_qty===undefined||item.balance_qty===''||!Number.isFinite(Number(item.balance_qty)))return {status:'Stock balance unavailable',shortage:false};
  const balance=Number(item.balance_qty);
  if(balance<=0)return {status:'Out of stock',shortage:Number(quantity)>0};
  if(String(unit||'').trim().toLowerCase()!==String(item.unit||'').trim().toLowerCase())return {status:'Different units — quantity cannot be compared',shortage:false};
  if(Number.isFinite(Number(quantity))&&Number(quantity)>balance)return {status:'Requested quantity exceeds store balance',shortage:true};
  return {status:Number(item.reorder_level)>0&&balance<=Number(item.reorder_level)?'Low stock':'In stock',shortage:false};
}

function usePharmacyStock(){
  const [items,setItems]=React.useState([]);
  const [state,setState]=React.useState({loading:true,error:'',checkedAt:null});
  const reload=React.useCallback(async()=>{
    const result=await client.from('consumable_store_stock')
      .select('item_id,item_name,unit,balance_qty,reorder_level,active')
      .eq('active',true).order('item_name');
    if(result.error){setState({loading:false,error:'Stock could not be refreshed. Check with Stores before issue.',checkedAt:null});return}
    setItems(result.data||[]);
    setState({loading:false,error:'',checkedAt:new Date()});
  },[]);
  React.useEffect(()=>{
    let alive=true;
    const refresh=()=>{if(alive)reload()};
    refresh();
    const timer=setInterval(refresh,15000);
    window.addEventListener('focus',refresh);
    return()=>{alive=false;clearInterval(timer);window.removeEventListener('focus',refresh)};
  },[reload]);
  return {items,...state,reload};
}

function PharmacyStockPanel({stock,itemId,quantity,unit,onSelect,showSelector=true}){
  const item=stock.items.find(row=>row.item_id===itemId);
  const availability=stockAvailability(item,quantity,unit);
  return h('div',{className:'field span-2',style:{padding:'12px',border:'1px solid #ead2dd',borderRadius:'10px'}},
    showSelector&&h('label',null,'Specific stock item'),
    showSelector&&h('select',{'aria-label':'Specific stock item',value:itemId||'',onChange:event=>onSelect(event.target.value),disabled:stock.loading},
      h('option',{value:''},'Select exact item / brand / strength'),
      stock.items.map(row=>h('option',{key:row.item_id,value:row.item_id},`${row.item_name} · ${row.unit}`))
    ),
    stock.loading?h('p',{'aria-live':'polite'},'Checking stock…'):
    stock.error?h('p',{role:'status'},stock.error):
    h('div',{'aria-live':'polite'},
      item&&h('p',null,h('strong',null,`Store balance: ${item.balance_qty??'Unavailable'} ${item.unit}`)),
      h('p',{style:{fontWeight:700,color:availability.shortage?'#a32c32':undefined}},availability.status),
      stock.checkedAt&&h('small',null,`Checked ${formatTimeIN(stock.checkedAt)}. Stock is not reserved by this request.`)
    ),
    h('button',{type:'button',className:'btn btn-secondary',onClick:stock.reload},'Refresh stock')
  );
}


  function StoreItemMaster({profile}){
    const [rows,setRows]=React.useState([]),[busy,setBusy]=React.useState(false),[filter,setFilter]=React.useState('All'),[search,setSearch]=React.useState(''),[editing,setEditing]=React.useState(null),[adding,setAdding]=React.useState(null),[moveTargets,setMoveTargets]=React.useState({});
    const load=React.useCallback(async()=>{const r=await client.from('consumable_store_items').select('id,item_name,unit,active,item_category,strength,dosage_form,charge_rate').order('item_name');if(r.error)showSamaraActionToast('error','Stores Master','Run 132_store_item_master.sql first. '+r.error.message);else setRows(r.data||[])},[]);
    React.useEffect(()=>{load()},[load]);
    const visible=rows.filter(r=>{const c=r.item_category||'Consumables',q=search.trim().toLowerCase();return (filter==='All'||filter===c||(filter==='Inactive'&&r.active===false))&&(q.length<3||String(r.item_name||'').toLowerCase().includes(q))});
    const save=async()=>{if(!editing?.item_name?.trim())return showSamaraActionToast('error','Stores Master','Item name is required.');setBusy(true);const r=await client.rpc('admin_update_store_item',{p_item_id:editing.id,p_item_name:editing.item_name.trim(),p_category:editing.item_category||'Consumables',p_unit:editing.unit,p_strength:editing.strength||null,p_dosage_form:editing.dosage_form||null});setBusy(false);if(r.error)showSamaraActionToast('error','Stores Master',r.error.message);else{showSamaraActionToast('success','Stores Master','Item details updated.');setEditing(null);load()}};
    const savePrice=async(itemId,value)=>{const rate=Number(value);if(!Number.isFinite(rate)||rate<0)return showSamaraActionToast('error','Stores Master','Enter a valid charge rate of zero or more.');setBusy(true);const r=await client.rpc('admin_set_store_item_charge_rate',{p_item_id:itemId,p_charge_rate:rate});setBusy(false);if(r.error)showSamaraActionToast('error','Stores Master',r.error.message);else{showSamaraActionToast('success','Stores Master','Charge rate updated for future patient charges.');load()}};
    const openAdd=()=>setAdding({item_name:'',item_category:'Consumables',unit:'Nos',strength:'',dosage_form:'',charge_rate:''});
    const addItem=async()=>{if(!adding?.item_name?.trim())return showSamaraActionToast('error','Add New Item','Item name is required.');if(!adding?.unit?.trim())return showSamaraActionToast('error','Add New Item','Unit is required.');setBusy(true);const r=await client.rpc('admin_add_store_item',{p_item_name:adding.item_name.trim(),p_category:adding.item_category||'Consumables',p_unit:adding.unit.trim(),p_strength:adding.strength||null,p_dosage_form:adding.dosage_form||null});if(!r.error&&String(adding.charge_rate||'').trim()!==''){const created=await client.from('consumable_store_items').select('id').ilike('item_name',adding.item_name.trim()).limit(1).maybeSingle();if(!created.error&&created.data?.id)await client.rpc('admin_set_store_item_charge_rate',{p_item_id:created.data.id,p_charge_rate:Number(adding.charge_rate||0)})}setBusy(false);if(r.error)showSamaraActionToast('error','Add New Item',r.error.message);else{showSamaraActionToast('success','Add New Item',`${adding.item_name.trim()} added under ${adding.item_category||'Consumables'}.`);setAdding(null);load()}};
    const moveItem=async row=>{const current=row.item_category||'Consumables',target=moveTargets[row.id];if(!target)return showSamaraActionToast('error','Move Item','Please select where to move this item.');if(target===current)return showSamaraActionToast('error','Move Item',`${row.item_name} is already under ${current}.`);if(!confirm(`Move ${row.item_name} from ${current} to ${target}? Stock and transaction history will be preserved.`))return;setBusy(true);const r=await client.rpc('admin_update_store_item',{p_item_id:row.id,p_item_name:row.item_name,p_category:target,p_unit:row.unit,p_strength:row.strength||null,p_dosage_form:row.dosage_form||null});setBusy(false);if(r.error)showSamaraActionToast('error','Move Item',r.error.message);else{showSamaraActionToast('success','Move Item',`${row.item_name} moved to ${target}. Stock and history are preserved.`);setMoveTargets(x=>({...x,[row.id]:''}));load()}};
    const active=async(row,value)=>{if(!confirm(value?`Reactivate ${row.item_name}?`:`Deactivate ${row.item_name}? Old history will be preserved.`))return;setBusy(true);const r=await client.rpc('admin_set_store_item_active',{p_item_id:row.id,p_active:value});setBusy(false);if(r.error)showSamaraActionToast('error','Stores Master',r.error.message);else load()};
    const remove=async row=>{if(!confirm(`Delete ${row.item_name}? This is permitted only if it has never been used.`))return;setBusy(true);const r=await client.rpc('admin_delete_unused_store_item',{p_item_id:row.id});setBusy(false);if(r.error)showSamaraActionToast('error','Delete blocked',r.error.message);else{showSamaraActionToast('success','Stores Master','Unused item deleted.');load()}};
    const moveSelect=row=>h('select',{value:moveTargets[row.id]||'',disabled:busy||row.active===false,onChange:e=>setMoveTargets(x=>({...x,[row.id]:e.target.value})),style:{minWidth:'130px'}},h('option',{value:''},'Select…'),['Pharmacy','Consumables'].filter(x=>x!==(row.item_category||'Consumables')).map(x=>h('option',{key:x,value:x},x)));
    const editButton=row=>h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>setEditing({...row,item_category:row.item_category||'Consumables'})},'Edit');
    return h('div',null,h(Section,{title:'Stores Master',subtitle:'Admin control: classify, move, edit, deactivate or delete unused items. Moving keeps the same item history.'},
      h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'12px'}},h('input',{value:search,onChange:e=>setSearch(e.target.value),placeholder:'Search 3+ characters',style:{minWidth:'210px',flex:1}}),['All','Pharmacy','Consumables','Inactive'].map(x=>h('button',{key:x,className:`btn ${filter===x?'btn-primary':'btn-secondary'}`,onClick:()=>setFilter(x)},x)),h('button',{className:'btn btn-primary',onClick:openAdd},'+ Add New'),h('button',{className:'btn btn-secondary',onClick:load},'↻ Refresh')),
      h('div',{className:'stores-ledger-mobile'},visible.map(r=>h('article',{className:'stores-ledger-card',key:r.id},
        h('div',{className:'stores-ledger-card-head'},h('strong',null,r.item_name),h('span',null,r.active===false?'Inactive':'Active')),
        h('p',null,`${r.unit||'—'}${r.strength?` · ${r.strength}`:''}${r.dosage_form?` · ${r.dosage_form}`:''}`),
        h('div',{style:{display:'grid',gridTemplateColumns:'1fr',gap:'8px'}},
          h('div',null,h('small',{style:{display:'block',fontWeight:700,marginBottom:'3px'}},'Currently Under'),h('strong',null,r.item_category||'Consumables')),
          h('div',null,h('small',{style:{display:'block',fontWeight:700,marginBottom:'3px'}},'Charge Rate'),h('div',{style:{display:'flex',gap:'6px',alignItems:'center',flexWrap:'wrap'}},h('strong',null,`₹${Number(r.charge_rate||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`),h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>{const v=prompt(`Charge rate for ${r.item_name}:`,String(r.charge_rate??0));if(v!==null)savePrice(r.id,v)}},'Edit Price'))),
          h('div',null,h('small',{style:{display:'block',fontWeight:700,marginBottom:'3px'}},'Move to'),h('div',{style:{display:'flex',gap:'6px',alignItems:'center',flexWrap:'wrap'}},moveSelect(r),h('button',{className:'btn btn-primary',disabled:busy||!moveTargets[r.id]||r.active===false,onClick:()=>moveItem(r)},'Move'))),
          h('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap'}},editButton(r),h('button',{className:'btn btn-secondary',onClick:()=>active(r,r.active===false)},r.active===false?'Reactivate':'Deactivate'),h('button',{className:'btn btn-secondary',onClick:()=>remove(r)},'Delete if unused'))
        )
      ))),
      h('div',{className:'table-wrap stores-ledger-desktop'},h('table',{className:'table'},h('thead',null,h('tr',null,['Item','Currently Under','Charge Rate','Move to','Status','Edit'].map(x=>h('th',{key:x},x)))),h('tbody',null,visible.map(r=>h('tr',{key:r.id},
        h('td',null,h('strong',null,r.item_name),h('div',{style:{fontSize:'12px',opacity:.72,marginTop:'3px'}},[r.unit,r.strength,r.dosage_form].filter(Boolean).join(' · ')||'—')),
        h('td',null,r.item_category||'Consumables'),
        h('td',null,h('div',{style:{display:'flex',gap:'6px',alignItems:'center',minWidth:'170px'}},h('strong',null,`₹${Number(r.charge_rate||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}`),h('button',{className:'btn btn-secondary',disabled:busy,onClick:()=>{const v=prompt(`Charge rate for ${r.item_name}:`,String(r.charge_rate??0));if(v!==null)savePrice(r.id,v)}},'Edit Price'))),
        h('td',null,h('div',{style:{display:'flex',gap:'6px',alignItems:'center'}},moveSelect(r),h('button',{className:'btn btn-primary',disabled:busy||!moveTargets[r.id]||r.active===false,onClick:()=>moveItem(r)},'Move'))),
        h('td',null,r.active===false?'Inactive':'Active'),
        h('td',null,h('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap'}},editButton(r),h('button',{className:'btn btn-secondary',onClick:()=>active(r,r.active===false)},r.active===false?'Reactivate':'Deactivate'),h('button',{className:'btn btn-secondary',onClick:()=>remove(r)},'Delete'))
      )))))
    ),adding&&h('div',{className:'modal-backdrop',style:{background:'rgba(45,18,31,.48)',backdropFilter:'blur(1px)'}},h('div',{className:'modal-card',style:{maxWidth:'620px',background:'#fffafd',opacity:1,border:'1px solid #e7bfd1',borderRadius:'18px',boxShadow:'0 22px 60px rgba(55,18,35,.28)',padding:'22px'}},h('h3',null,'Add New Item'),h('div',{className:'form-grid'},
      h('div',{className:'field span-2'},h('label',null,'Item Name *'),h('input',{value:adding.item_name||'',onChange:e=>setAdding({...adding,item_name:e.target.value})})),
      h('div',{className:'field'},h('label',null,'Currently Under *'),h('select',{value:adding.item_category||'Consumables',onChange:e=>setAdding({...adding,item_category:e.target.value})},h('option',{value:'Consumables'},'Consumables'),h('option',{value:'Pharmacy'},'Pharmacy'))),
      h('div',{className:'field'},h('label',null,'Unit *'),h('input',{value:adding.unit||'',onChange:e=>setAdding({...adding,unit:e.target.value})})),
      h('div',{className:'field'},h('label',null,'Strength / Specification'),h('input',{value:adding.strength||'',onChange:e=>setAdding({...adding,strength:e.target.value})})),
      h('div',{className:'field'},h('label',null,'Dosage Form'),h('input',{value:adding.dosage_form||'',onChange:e=>setAdding({...adding,dosage_form:e.target.value})})),
      h('div',{className:'field'},h('label',null,'Charge Rate (₹)'),h('input',{type:'number',min:'0',step:'0.01',value:adding.charge_rate||'',onChange:e=>setAdding({...adding,charge_rate:e.target.value})}))
    ),h('div',{style:{display:'flex',gap:'8px',justifyContent:'flex-end',flexWrap:'wrap'}},h('button',{className:'btn btn-secondary',onClick:()=>setAdding(null)},'Close'),h('button',{className:'btn btn-primary',disabled:busy,onClick:addItem},busy?'Adding…':'Add Item')))),editing&&h('div',{className:'modal-backdrop',style:{background:'rgba(45,18,31,.48)',backdropFilter:'blur(1px)'}},h('div',{className:'modal-card',style:{maxWidth:'620px',background:'#fffafd',opacity:1,border:'1px solid #e7bfd1',borderRadius:'18px',boxShadow:'0 22px 60px rgba(55,18,35,.28)',padding:'22px'}},h('h3',null,'Edit Item'),h('p',{style:{marginTop:'-4px',opacity:.75}},`Currently Under: ${editing.item_category||'Consumables'}`),h('div',{className:'form-grid'},
      h('div',{className:'field span-2'},h('label',null,'Item Name *'),h('input',{value:editing.item_name||'',onChange:e=>setEditing({...editing,item_name:e.target.value})})),
      h('div',{className:'field'},h('label',null,'Unit *'),h('input',{value:editing.unit||'',onChange:e=>setEditing({...editing,unit:e.target.value})})),
      h('div',{className:'field'},h('label',null,'Strength / Specification'),h('input',{value:editing.strength||'',onChange:e=>setEditing({...editing,strength:e.target.value})})),
      h('div',{className:'field'},h('label',null,'Dosage Form'),h('input',{value:editing.dosage_form||'',onChange:e=>setEditing({...editing,dosage_form:e.target.value})}))
    ),h('div',{style:{display:'flex',gap:'8px',justifyContent:'flex-end',flexWrap:'wrap'}},h('button',{className:'btn btn-secondary',onClick:()=>setEditing(null)},'Close'),h('button',{className:'btn btn-primary',disabled:busy,onClick:save},busy?'Saving…':'Save Changes'))))))
  }

