  function PatientConsumables({profile,initialView=null}){
    const authority=useStoreAuthority(profile);
    const [patients,setPatients]=React.useState([]),[rows,setRows]=React.useState([]);
    const stockInfo=usePharmacyStock(),stock=stockInfo.items;
    const [busy,setBusy]=React.useState(false),[filter,setFilter]=React.useState('Open');
    const [allocations,setAllocations]=React.useState([]),[returns,setReturns]=React.useState([]);
    const [form,setForm]=React.useState({patient_id:'',store_item_id:'',item_name:'',requested_qty:'1',unit:'Nos',request_remarks:''});
    const storeController=authority.controller,nurse=profile?.role==='Nurse'&&!isNursingManagerProfile(profile);
    const fallbackItems=['Adult Diapers','Examination Gloves','Sterile Gloves','Syringes','Dressing Materials','PPE','Feeding Tubes','Catheters','Oxygen Consumables','Underpads','Cotton / Gauze','Other Consumables'];
    const actorName=formalName(profile)||profile?.full_name||profile?.login_id||profile?.role||'Staff';
    const notify=(type,text)=>showSamaraActionToast(type,type==='success'?'Consumables updated':'Consumables action failed',text);
    const patientLabel=id=>{const p=patients.find(x=>x.id===id);return p?[formalName(p),p.patient_id&&`(${p.patient_id})`,p.room_no&&`Room ${p.room_no}${p.bed_no?`/${p.bed_no}`:''}`].filter(Boolean).join(' · '):'—'};
    const stockFor=r=>stock.find(x=>x.item_id===r.store_item_id)||stock.find(x=>String(x.item_name).toLowerCase()===String(r.item_name).toLowerCase());
    const stageStyle=status=>({display:'inline-block',padding:'5px 9px',borderRadius:'999px',fontWeight:800,fontSize:'12px',background:status==='Received'?'#e7f6ef':status==='Rejected'||status==='Receipt Discrepancy'?'#fdebec':status==='Handed Over'?'#eaf2ff':'#fff4dc',color:'#5d3146'});
    function navigateIndentFilter(target){
      setFilter(target);
      setTimeout(()=>document.getElementById('consumables-indent-register')?.scrollIntoView({behavior:'smooth',block:'start'}),40);
    }
    async function load(){
      const [pRes,iRes,aRes,rRes]=await Promise.all([
        client.from('patients').select('id,title,full_name,patient_id,room_no,bed_no,is_active').eq('is_active',true).order('full_name'),
        client.from('patient_consumable_indents').select('*').order('created_at',{ascending:false}).limit(500),
        client.from('bill_charge_store_allocations').select('indent_id,patient_id,store_item_id,allocated_qty'),
        client.from('patient_store_returns').select('*').order('requested_at',{ascending:false}),
        stockInfo.reload()
      ]);
      if(!pRes.error)setPatients(pRes.data||[]);
      if(iRes.error){console.warn(iRes.error);notify('error','Consumables workflow database is not installed yet.')} else setRows(iRes.data||[]);
      if(!aRes.error)setAllocations(aRes.data||[]);
      if(!rRes.error)setReturns(rRes.data||[]);

    }
    async function refreshIndents(){
      if(busy)return;
      setBusy(true);
      await load();
      setBusy(false);
      notify('success','Patient Consumables refreshed.');
    }
    React.useEffect(()=>{load()},[]);
    function chooseItem(id){const st=stock.find(x=>x.item_id===id);setForm(f=>({...f,store_item_id:id,item_name:displayStoreItemName(st?.item_name)||'',unit:st?.unit||'Nos'}))}
    async function initiate(e){
      e.preventDefault();if(!nurse||busy)return;
      if(!form.patient_id||!stock.some(x=>x.item_id===form.store_item_id)||!form.item_name||!Number.isFinite(Number(form.requested_qty))||Number(form.requested_qty)<=0){notify('error','Select patient, consumable and valid quantity.');return}
      setBusy(true);const result=await client.from('patient_consumable_indents').insert({patient_id:form.patient_id,store_item_id:form.store_item_id||null,item_name:form.item_name,requested_qty:Number(form.requested_qty),unit:form.unit||'Nos',request_remarks:form.request_remarks||null,initiated_by:profile.id,initiated_by_name:actorName,status:'Initiated'});setBusy(false);
      if(result.error)notify('error',result.error.message);else{notify('success','Patient consumable indent initiated and sent to Nurse Manager.');setForm(f=>({...f,store_item_id:'',item_name:'',requested_qty:'1',unit:'Nos',request_remarks:''}));await load()}
    }
    async function approve(row,reject=false){
      if(!storeController||busy)return;let qty=0,remarks='';const st=stockFor(row);
      if(!reject){const input=prompt(`Requested: ${row.requested_qty} ${row.unit}. Current Stores balance: ${st?.balance_qty??'—'} ${st?.unit||row.unit}. Enter quantity to approve:`,String(row.requested_qty));if(input===null)return;qty=Number(input);if(!qty||qty<=0||qty>Number(row.requested_qty)){notify('error','Enter a valid quantity not exceeding the requested quantity.');return}}
      remarks=prompt(reject?'Reason for rejection:':'Approval remarks (optional):',reject?'Not approved':'')||'';
      setBusy(true);const res=await client.rpc('approve_patient_consumable_indent_v2',{p_indent_id:row.id,p_approved_qty:qty,p_decision:reject?'Rejected':'Approved',p_remarks:remarks||null});setBusy(false);
      if(res.error)notify('error',res.error.message);else{notify('success',reject?'Indent rejected.':'Indent approved.');await load()}
    }
    async function handover(row){
      if(!storeController||busy)return;const st=stockFor(row);const input=prompt(`Approved: ${row.approved_qty} ${row.unit}. Stores available: ${st?.balance_qty??'—'} ${st?.unit||row.unit}. Enter actual quantity handed over:`,String(row.approved_qty||''));if(input===null)return;
      const qty=Number(input);if(!qty||qty<=0||qty>Number(row.approved_qty||0)){notify('error','Enter a valid quantity not exceeding the approved quantity.');return}
      const remarks=prompt('Handover remarks (optional):','')||'';setBusy(true);const res=await client.rpc('handover_patient_consumable_indent_v2',{p_indent_id:row.id,p_handed_over_qty:qty,p_remarks:remarks||null});setBusy(false);
      if(res.error)notify('error',res.error.message);else{notify('success','Handed over and deducted from Stores. Awaiting Nurse receipt.');await load()}
    }
    async function receive(row){
      if(!nurse||busy)return;const input=prompt(`Handed over: ${row.handed_over_qty} ${row.unit}. Confirm actual quantity physically received:`,String(row.handed_over_qty||''));if(input===null)return;
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
      const charged=allocations.filter(a=>String(a.indent_id)===String(row.id)).reduce((n,a)=>n+Number(a.allocated_qty||0),0);
      const returned=returns.filter(x=>String(x.indent_id)===String(row.id)&&x.status!=='Rejected').reduce((n,x)=>n+Number(x.quantity||0),0);
      return {charged,returned,balance:Math.max(0,Number(row.received_qty||0)-charged-returned)};
    }
    async function requestUnusedReturn(row){
      if(!nurse||busy)return;const u=indentUsage(row);if(!(u.balance>0)){notify('error','No unused received balance is available to return.');return}
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
    const visible=rows.filter(r=>filter==='All'||(filter==='Open'?openStatuses.includes(r.status):filter==='Awaiting Handover'?['Approved','Partially Approved'].includes(r.status):r.status===filter));
    const counts={initiated:rows.filter(r=>r.status==='Initiated').length,handover:rows.filter(r=>['Approved','Partially Approved'].includes(r.status)).length,receipt:rows.filter(r=>r.status==='Handed Over').length,discrepancy:rows.filter(r=>r.status==='Receipt Discrepancy').length};
    const options=stock;
    return h('div',null,
      h(Section,{title:'Patient Consumables',subtitle:'Nurse initiates for a patient → Store In-charge approves and hands over → Nurse confirms actual receipt.'},
        h('div',{className:'grid stats'},
          [['Awaiting Approval',counts.initiated,'Initiated'],['Awaiting Handover',counts.handover,'Awaiting Handover'],['Awaiting Receipt',counts.receipt,'Handed Over'],['Discrepancies',counts.discrepancy,'Receipt Discrepancy']].map(([label,count,target])=>h('button',{key:label,type:'button',className:'card stat',onClick:()=>navigateIndentFilter(target),style:{width:'100%',textAlign:'left',cursor:'pointer',border:filter===target?'2px solid #b30b5d':'1px solid #ead2dd',fontFamily:'inherit'}},h('span',null,label),h('strong',null,count),h('small',{style:{display:'block',marginTop:'7px',color:'#9b1456',fontWeight:800}},'Tap to view →')))
        )
      ),
      nurse&&h('div',{id:'patient-raise-indent',style:{scrollMarginTop:'90px'}},h(Section,{title:'New Patient Indent',subtitle:'Select an active patient and a consumable or pharmacy item. Available store balance refreshes automatically; stock is issued at handover.'},
        h('form',{onSubmit:initiate},h('div',{className:'grid two'},
          h('div',{className:'field'},h('label',null,'Patient *'),h('select',{value:form.patient_id,onChange:e=>setForm({...form,patient_id:e.target.value}),required:true},h('option',{value:''},'Select active patient'),patients.map(p=>h('option',{key:p.id,value:p.id},patientLabel(p.id))))),
          h('div',{className:'field'},h('label',null,'Consumable / Pharmacy Item *'),h('select',{'aria-label':'Consumable / Pharmacy Item',value:form.store_item_id,onChange:e=>chooseItem(e.target.value),required:stock.length>0},h('option',{value:''},'Select consumable / pharmacy item'),options.map(x=>h('option',{key:x.item_id,value:x.item_id},`${x.item_name}${stock.length?` · Store balance ${x.balance_qty} ${x.unit}`:''}`)))),
          h('div',{className:'field'},h('label',null,'Quantity *'),h('input',{type:'number',min:'0.01',step:'0.01',value:form.requested_qty,onChange:e=>setForm({...form,requested_qty:e.target.value}),required:true})),
          h('div',{className:'field'},h('label',null,'Unit'),h('input',{value:form.unit,readOnly:true}))
        ),h(PharmacyStockPanel,{stock:stockInfo,itemId:form.store_item_id,quantity:form.requested_qty,unit:form.unit,showSelector:false}),h('div',{className:'field'},h('label',null,'Reason / Remarks'),h('textarea',{rows:2,value:form.request_remarks,onChange:e=>setForm({...form,request_remarks:e.target.value}),placeholder:'Optional clinical/use note'})),h('button',{className:'btn btn-primary',disabled:busy||!form.item_name},busy?'Saving…':'Initiate Indent'))
      )),
      h('div',{id:'patient-received-balance',style:{scrollMarginTop:'90px'}},h(Section,{title:'Received Indents / Used Balance',subtitle:'Patient-specific received stock. Charge Raised automatically reduces this balance; unused items can be returned only after Stores Manager confirms physical receipt.'},
        h('div',{className:'table-wrap'},h('table',{className:'table'},h('thead',null,h('tr',null,['Patient','Indent','Item','Received','Charged','Return Pending / Returned','Balance','Action'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,rows.filter(r=>r.status==='Received').map(r=>{const u=indentUsage(r);const related=returns.filter(x=>String(x.indent_id)===String(r.id));const pending=related.filter(x=>x.status==='Pending').reduce((n,x)=>n+Number(x.quantity||0),0);const confirmed=related.filter(x=>x.status==='Confirmed').reduce((n,x)=>n+Number(x.quantity||0),0);return h('tr',{key:`balance-${r.id}`},
            h('td',null,patientLabel(r.patient_id)),h('td',null,`CI-${String(r.indent_no||'').padStart(5,'0')}`),h('td',null,r.item_name),h('td',null,`${r.received_qty||0} ${r.unit}`),h('td',null,`${u.charged} ${r.unit}`),h('td',null,`${pending} pending / ${confirmed} returned`),h('td',null,h('strong',null,`${u.balance} ${r.unit}`)),
            h('td',null,h('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap'}},nurse&&u.balance>0&&h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>requestUnusedReturn(r)},'Return Unused'),storeController&&related.filter(x=>x.status==='Pending').map(ret=>h('button',{type:'button',key:ret.id,className:'btn btn-primary',disabled:busy,onClick:()=>confirmUnusedReturn(ret)},`Confirm Return ${ret.quantity}`)),(!nurse&&!related.some(x=>x.status==='Pending'))&&h('span',null,'—')))
          )}),rows.filter(r=>r.status==='Received').length===0?h('tr',null,h('td',{colSpan:8,style:{textAlign:'center',padding:'24px'}},'No received patient indents yet.')):null)
        ))
      )),
      h('div',{id:'consumables-indent-register',style:{scrollMarginTop:'90px'}},h(Section,{title:'Consumables Indent Register',actions:h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:refreshIndents},busy?'Refreshing…':'↻ Refresh'),['Open','Initiated','Awaiting Handover','Handed Over','Receipt Discrepancy','Received','Rejected','All'].map(x=>h('button',{type:'button',key:x,className:`btn ${filter===x?'btn-primary':'btn-secondary'}`,onClick:()=>navigateIndentFilter(x),'aria-pressed':filter===x},x)))},
        h('div',{className:'table-wrap'},h('table',{className:'table'},h('thead',null,h('tr',null,['Indent','Patient','Item / Store Balance','Requested','Approved','Handed Over','Received','Status','Initiated By / Time','Approval / Handover','Receipt','Action'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,visible.length?visible.map(r=>{const st=stockFor(r);return h('tr',{key:r.id},
            h('td',null,`CI-${String(r.indent_no||'').padStart(5,'0')}`),h('td',null,patientLabel(r.patient_id)),h('td',null,h('strong',null,r.item_name),h('small',{style:{display:'block'}},`Store: ${st?.balance_qty??'—'} ${st?.unit||r.unit}`),r.request_remarks&&h('small',{style:{display:'block'}},r.request_remarks)),
            h('td',null,`${r.requested_qty} ${r.unit}`),h('td',null,r.approved_qty!=null?`${r.approved_qty} ${r.unit}`:'—'),h('td',null,r.handed_over_qty!=null?`${r.handed_over_qty} ${r.unit}`:'—'),h('td',null,r.received_qty!=null?`${r.received_qty} ${r.unit}`:'—'),h('td',null,h('span',{style:stageStyle(r.status)},r.status)),
            h('td',null,h('strong',null,r.initiated_by_name||'—'),h('small',{style:{display:'block'}},r.initiated_at?formatDateTimeIN(r.initiated_at):'—')),
            h('td',null,r.approved_by_name&&h('div',null,h('strong',null,`Approved: ${r.approved_by_name}`),h('small',{style:{display:'block'}},r.approved_at?formatDateTimeIN(r.approved_at):'')),r.handed_over_by_name&&h('div',{style:{marginTop:'5px'}},h('strong',null,`Handed over: ${r.handed_over_by_name}`),h('small',{style:{display:'block'}},r.handed_over_at?formatDateTimeIN(r.handed_over_at):''))),
            h('td',null,r.received_by_name?h('div',null,h('strong',null,r.received_by_name),h('small',{style:{display:'block'}},r.received_at?formatDateTimeIN(r.received_at):''),r.receipt_remarks&&h('small',{style:{display:'block'}},r.receipt_remarks)):'—'),
            h('td',null,h('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap'}},storeController&&r.status==='Initiated'&&h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>approve(r,false)},'Approve'),storeController&&r.status==='Initiated'&&h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>approve(r,true)},'Reject'),storeController&&['Approved','Partially Approved'].includes(r.status)&&h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>handover(r)},'Hand Over'),nurse&&r.status==='Handed Over'&&h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>receive(r)},'Received'),storeController&&r.status==='Receipt Discrepancy'&&h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>resolveDiscrepancy(r)},'Return & Reconcile'),!((storeController&&['Initiated','Approved','Partially Approved','Receipt Discrepancy'].includes(r.status))||(nurse&&r.status==='Handed Over'))&&h('span',null,'—')))
          )}):h('tr',null,h('td',{colSpan:12,style:{textAlign:'center',padding:'24px'}},'No consumable indents in this view.')))
        ))
      ))
    );
  }

