  // 2.18.26: Nursing Procedure plan (SQL 251).
  // Planned procedures (e.g. Ryle's tube feeding, catheter care, nebulization, dressing) are kept in
  // care_orders with order_kind = 'Nursing Procedure', next to the Master Care Plan, so that
  // Shift Tasks / Daily Care recording, care reminders & escalations, the screensaver and the
  // Daily Intelligent Report all see them. Items come from Charge Master → Nursing Procedures
  // (same names and codes). Charging is NOT done here: a procedure is charged only through
  // NURSING → Approval Requests, as before.
  // Used by: Admissions (Section 5), Patient file → Nursing tab (add / stop after admission),
  // Patient edit (care plan save keeps procedures), nurse screensaver, Shift Tasks, Daily Care.
  const NURSING_PROC_KIND='Nursing Procedure';
  const NURSING_PROC_SHIFTS=['Day Shift (7 AM–7 PM)','Night Shift (7 PM–7 AM)','Both shifts'];
  const NURSING_PROC_FREQUENCIES=['Daily','Each shift','Twice daily','As required'];
  const NURSING_PROC_OTHER='__other__';
  const NURSING_PROC_SQL_HINT='Database update pending: run supabase/sql/251_nursing_procedure_plan.sql in Supabase, then try again.';
  const isNursingProcedureOrder=o=>String(o?.order_kind||'')===NURSING_PROC_KIND;
  const isCareOnlyOrder=o=>!isNursingProcedureOrder(o);
  function blankNursingProcedure(){
    return {tariff_id:'',procedure_code:'',care_type:'',custom:false,shift:'Both shifts',frequency:'Daily',instruction:'',preferred_from:'',preferred_to:'',is_locked:false};
  }
  function nursingProcedureRowComplete(row){return Boolean(String(row?.care_type||'').trim())}
  function nursingProcedureLabel(o){return `${o?.procedure_code?`${o.procedure_code} · `:''}${o?.care_type||'Nursing procedure'}`}
  function nursingProcedureDetail(o){return [o?.shift,o?.frequency,careWindowLabel(o),o?.instruction].filter(Boolean).join(' · ')}
  function nursingProcedureOrderRow(row,patientId,userId){
    return {
      patient_id:patientId,order_kind:NURSING_PROC_KIND,
      care_type:String(row.care_type||'').trim(),
      procedure_code:row.procedure_code||null,tariff_id:row.tariff_id||null,
      shift:NURSING_PROC_SHIFTS.includes(row.shift)?row.shift:'Both shifts',
      frequency:row.frequency||'Daily',
      instruction:String(row.instruction||'').trim()||null,
      preferred_from:careTimeValue(row.preferred_from)||null,
      preferred_to:careTimeValue(row.preferred_to)||null,
      start_date:row.start_date||todayISOIndia(),
      is_active:true,entered_by:userId||null
    };
  }
  // True once SQL 251 has been run (care_orders.order_kind exists).
  async function nursingProcedureColumnReady(){
    const {error}=await client.from('care_orders').select('order_kind').limit(1);
    return !error;
  }
  // Patient edit replaces the Master Care Plan: delete CARE rows only, never the planned procedures.
  async function deleteCareOnlyOrders(patientId){
    let res=await client.from('care_orders').delete().eq('patient_id',patientId).or('order_kind.is.null,order_kind.neq."Nursing Procedure"');
    if(res.error&&/order_kind/i.test(String(res.error.message||'')))res=await client.from('care_orders').delete().eq('patient_id',patientId); // before SQL 251: no procedures exist yet
    return res;
  }
  // Charge Master → Nursing Procedures items (code + name only; nurses never see the rate).
  function useNursingProcedureCatalog(){
    const [items,setItems]=React.useState([]);
    const [error,setError]=React.useState('');
    React.useEffect(()=>{
      let live=true;
      (async()=>{
        let rows=[],failed='';
        const a=await client.rpc('get_approval_catalog');
        if(!a.error)rows=(a.data||[]).filter(x=>x.category==='Nursing Procedures');else failed=a.error.message||'';
        if(!rows.length){
          const b=await client.from('charge_tariff_master').select('id,charge_code,service_name,category,is_active').eq('category','Nursing Procedures');
          if(!b.error){rows=(b.data||[]).filter(x=>x.is_active!==false);failed=''}else if(!failed)failed=b.error.message||'';
        }
        const other=x=>/^other/i.test(String(x.service_name||'').trim());
        rows=rows.filter(x=>String(x.service_name||'').trim()).sort((x,y)=>(other(x)?1:0)-(other(y)?1:0)||String(x.service_name).localeCompare(String(y.service_name),'en',{sensitivity:'base',numeric:true}));
        if(live){setItems(rows);setError(rows.length?'':failed?`Procedure list could not be loaded (${failed}). You can still type the procedure name.`:'')}
      })();
      return()=>{live=false};
    },[]);
    return [items,error];
  }
  // One editable procedure row (procedure from Charge Master, or typed when not in the list).
  function NursingProcedureRowFields({row,catalog,onChange,onRemove,removeLabel='Remove'}){
    const set=(patch)=>onChange({...row,...patch});
    const selectValue=row.custom?NURSING_PROC_OTHER:(row.tariff_id||'');
    return h('div',{className:'nproc-row',style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:'10px',alignItems:'end',padding:'8px 0'}},
      h('div',{className:'field',style:{gridColumn:'span 2'}},
        h('label',null,'Nursing procedure *'),
        h('select',{value:selectValue,onChange:e=>{
          const v=e.target.value;
          if(v===NURSING_PROC_OTHER)return set({custom:true,tariff_id:'',procedure_code:'',care_type:''});
          const item=catalog.find(x=>String(x.id)===String(v));
          set({custom:false,tariff_id:item?item.id:'',procedure_code:item?.charge_code||'',care_type:item?.service_name||''});
        }},
          h('option',{value:''},catalog.length?`Select procedure (${catalog.length})`:'Select procedure'),
          catalog.map(x=>h('option',{key:x.id,value:x.id},`${x.charge_code?`${x.charge_code} · `:''}${x.service_name}`)),
          h('option',{value:NURSING_PROC_OTHER},'Not in the list — type the name'))),
      row.custom?h('div',{className:'field'},h('label',null,'Procedure name *'),h('input',{type:'text',value:row.care_type||'',placeholder:'Type the procedure',onChange:e=>set({care_type:e.target.value})})):null,
      miniSelect('Shift',row.shift,NURSING_PROC_SHIFTS,v=>set({shift:v})),
      miniSelect('Frequency',row.frequency,NURSING_PROC_FREQUENCIES,v=>set({frequency:v})),
      miniInput('Preferred from (optional)',careTimeValue(row.preferred_from),v=>set({preferred_from:v}),false,'time'),
      miniInput('Preferred to (optional)',careTimeValue(row.preferred_to),v=>set({preferred_to:v}),false,'time'),
      h('div',{className:'field',style:{gridColumn:'span 2'}},h('label',null,'Instruction (optional)'),h('input',{type:'text',value:row.instruction||'',placeholder:'e.g. 200 ml feed, flush with 30 ml water',onChange:e=>set({instruction:e.target.value})})),
      onRemove?h('button',{type:'button',className:'btn btn-danger',onClick:onRemove},removeLabel):null
    );
  }
  // Admission form, Section 5. rows / setRows live in the Admission form (saved with the draft).
  function AdmissionNursingProcedureSection({rows,setRows,setMsg}){
    const [catalog,catalogError]=useNursingProcedureCatalog();
    const list=Array.isArray(rows)?rows:[];
    const filled=list.filter(nursingProcedureRowComplete).length;
    function add(){
      const open=list.findIndex(r=>!r.is_locked);
      if(open>=0){
        if(!nursingProcedureRowComplete(list[open])){setMsg&&setMsg('Select (or type) the nursing procedure before adding the next one.');return}
        setRows([...list.map((r,i)=>i===open?{...r,is_locked:true}:r),blankNursingProcedure()]);
      }else setRows([...list,blankNursingProcedure()]);
      setMsg&&setMsg('');
    }
    function edit(index){
      if(list.some((r,i)=>i!==index&&!r.is_locked)){setMsg&&setMsg('Complete or remove the open nursing-procedure row before editing another one.');return}
      setRows(list.map((r,i)=>i===index?{...r,is_locked:false}:r));
    }
    const remove=index=>setRows(list.filter((_,i)=>i!==index));
    return h('div',{className:'section-card',id:'admission-nursing-procedures'},
      h('div',{className:'section-title'},h('div',null,
        h('h4',null,'5. Nursing procedures'),
        h('small',null,filled?`${filled} procedure(s) planned · shown in Shift Tasks, the screensaver and the patient file → Nursing`:'Optional · procedures this Guest needs regularly (e.g. Ryle’s tube feeding, catheter care, nebulization, dressing). More can be added after admission from the patient file → Nursing.'))),
      catalogError?h('p',{className:'small-note',style:{color:'#b42318'}},catalogError):null,
      list.map((r,i)=>r.is_locked
        ?h('div',{className:'admission-locked-row',key:`nproc-${i}`},
          h('span',{className:'number'},i+1),
          h('div',{className:'summary'},h('strong',null,nursingProcedureLabel(r)),h('small',null,nursingProcedureDetail(r))),
          h('div',{className:'admission-row-actions'},
            h('button',{type:'button',className:'btn btn-secondary',onClick:()=>edit(i)},'Edit'),
            h('button',{type:'button',className:'btn btn-danger',onClick:()=>remove(i)},'Remove')))
        :h('div',{key:`nproc-${i}`,style:{borderTop:i?'1px dashed #ecc6d8':'none'}},
          h('strong',{style:{fontSize:'13px',color:'#7a1247'}},`Procedure ${i+1}`),
          h(NursingProcedureRowFields,{row:r,catalog,onChange:next=>setRows(list.map((x,n)=>n===i?next:x)),onRemove:()=>remove(i)}))),
      h('div',{className:'admission-add-bottom'},h('button',{type:'button',className:'btn btn-secondary',onClick:add},'+ Add Nursing Procedure')),
      h('p',{className:'small-note'},'Charges are not raised from here. A chargeable procedure is still requested and charged through NURSING → Approval Requests.')
    );
  }
  // Patient file → Nursing tab: planned procedures (add / stop after admission) + every procedure record.
  function PatientNursingProcedurePanel({patient,orders,logs,charges,canManage,onChanged}){
    const [catalog,catalogError]=useNursingProcedureCatalog();
    const [adding,setAdding]=React.useState(false);
    const [row,setRow]=React.useState(blankNursingProcedure());
    const [busy,setBusy]=React.useState(false);
    const procOrders=(orders||[]).filter(isNursingProcedureOrder);
    const active=procOrders.filter(o=>o.is_active!==false);
    const stopped=procOrders.filter(o=>o.is_active===false);
    const procIds=new Set(procOrders.map(o=>o.id));
    const fmtWhen=v=>{const d=v?new Date(v):null;return d&&!isNaN(d)?formatDateTimeIN(v):''};
    const records=[
      ...(logs||[]).filter(x=>procIds.has(x.care_order_id)).map(x=>{const o=procOrders.find(p=>p.id===x.care_order_id)||{};return {id:`log-${x.id}`,at:x.completed_at||x.created_at||x.care_date,title:`${formatDateIN(x.care_date)} · ${x.shift||''} · ${x.status||'Recorded'}`,name:nursingProcedureLabel(o),note:x.remarks||'',source:'Plan'}}),
      ...(charges||[]).map(x=>({id:`chg-${x.id}`,at:x.service_datetime||x.raised_at||x.created_at||x.charge_date,title:`${x.service_datetime?fmtWhen(x.service_datetime):formatDateIN(x.charge_date||String(x.created_at||'').slice(0,10))} · ${x.status||'Recorded'}`,name:x.service_name||'Nursing procedure',note:[x.quantity?`Qty ${x.quantity}${x.unit?` ${x.unit}`:''}`:'',x.raised_by_name?`by ${x.raised_by_name}`:'',x.remarks||x.description||''].filter(Boolean).join(' · '),source:'Approval Request'}))
    ].sort((a,b)=>new Date(b.at||0)-new Date(a.at||0));
    async function save(){
      if(busy)return;
      if(!nursingProcedureRowComplete(row))return showSamaraActionToast('error','Nursing Procedure','Select (or type) the nursing procedure.');
      if(active.some(o=>String(o.care_type||'').trim().toLowerCase()===String(row.care_type).trim().toLowerCase()&&o.shift===row.shift))return showSamaraActionToast('error','Nursing Procedure','This procedure is already planned for the same shift. Stop the old one first if it changes.');
      setBusy(true);
      try{
        if(!(await nursingProcedureColumnReady()))throw new Error(NURSING_PROC_SQL_HINT);
        const {data:{user}}=await client.auth.getUser();
        const {data,error}=await client.from('care_orders').insert(nursingProcedureOrderRow(row,patient.id,user?.id)).select('id').single();
        if(error)throw error;
        await writeAuditEvent('Add Nursing Procedure Plan','CareOrder',data?.id||null,{patient_id:patient.id,procedure:row.care_type,code:row.procedure_code||null,shift:row.shift,frequency:row.frequency});
        showSamaraActionToast('success','Nursing Procedure',`${row.care_type} added to the plan. It now shows in Shift Tasks and on the screensaver.`);
        setRow(blankNursingProcedure());setAdding(false);onChanged&&onChanged();
      }catch(error){showSamaraActionToast('error','Nursing Procedure',error.message||String(error))}
      finally{setBusy(false)}
    }
    async function stop(o){
      if(busy)return;
      const reason=prompt(`Stop "${o.care_type}" for this Guest?\n\nReason (e.g. doctor advised, tube removed):`,'');
      if(reason===null)return;
      setBusy(true);
      try{
        const {data:{user}}=await client.auth.getUser();
        const {error}=await client.from('care_orders').update({is_active:false,stopped_at:new Date().toISOString(),stopped_by:user?.id||null,stop_reason:reason.trim()||null}).eq('id',o.id);
        if(error)throw error;
        await writeAuditEvent('Stop Nursing Procedure Plan','CareOrder',o.id,{patient_id:patient.id,procedure:o.care_type,reason:reason.trim()||null});
        showSamaraActionToast('success','Nursing Procedure',`${o.care_type} stopped.`);
        onChanged&&onChanged();
      }catch(error){showSamaraActionToast('error','Nursing Procedure',error.message||String(error))}
      finally{setBusy(false)}
    }
    return h('div',{className:'section-card'},
      h('div',{className:'panel-head'},
        h('div',null,h('h4',null,`Nursing Procedures (${active.length} planned)`),h('small',null,'Planned at admission or added later. Recorded from Shift Tasks / Daily Care like care.')),
        canManage&&!adding?h('button',{type:'button',className:'btn btn-primary',onClick:()=>{setRow(blankNursingProcedure());setAdding(true)}},'＋ Add Nursing Procedure'):null),
      canManage&&adding&&h('div',{style:{border:'1px solid #ecc6d8',borderRadius:'12px',padding:'10px 12px',margin:'8px 0',background:'#fff7fb'}},
        catalogError?h('p',{className:'small-note',style:{color:'#b42318'}},catalogError):null,
        h(NursingProcedureRowFields,{row,catalog,onChange:setRow}),
        h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
          h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:save},busy?'Saving…':'Save Procedure'),
          h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>setAdding(false)},'Cancel')),
        h('p',{className:'small-note'},'Charges are not raised from here — a chargeable procedure is still charged through NURSING → Approval Requests.')),
      active.length?active.map(o=>h('div',{className:'timeline-item',key:o.id},
        h('strong',null,nursingProcedureLabel(o)),
        h('span',null,`${nursingProcedureDetail(o)}${o.start_date?` · from ${formatDateIN(o.start_date)}`:''}`),
        o.instruction&&typeof TamilAssist==='function'?h(TamilAssist,{text:o.instruction,context:'Nursing Procedure Instruction'}):null,
        canManage?h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>stop(o)},'Stop'):null))
        :h('p',{className:'small-note'},'No nursing procedure planned for this Guest.'),
      stopped.length?h('details',{style:{marginTop:'8px'}},h('summary',null,`Stopped procedures (${stopped.length})`),
        stopped.map(o=>h('div',{className:'timeline-item',key:o.id},h('strong',null,nursingProcedureLabel(o)),h('span',null,`Stopped ${o.stopped_at?fmtWhen(o.stopped_at):''}${o.stop_reason?` · ${o.stop_reason}`:''}`)))):null,
      h('h4',{style:{marginTop:'18px'}},`Nursing Procedure Records (${records.length})`),
      records.length?records.slice(0,40).map(x=>h('div',{className:'timeline-item',key:x.id},
        h('strong',null,`${x.title} · ${x.name}`),
        h('span',{className:'patient-file-detail'},` · ${x.source==='Plan'?'Planned procedure':'Approval Request'}${x.note?` · ${x.note}`:''}`)))
        :h('p',{className:'small-note'},'No nursing procedure recorded yet.')
    );
  }
