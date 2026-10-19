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
  const NURSING_PROC_SQL_HINT='Database update pending: run supabase/sql/251_nursing_procedure_plan.sql and 252_nursing_procedure_fixed_times.sql in Supabase, then try again.';
  const NURSING_PROC_TIMING_FIXED='Fixed times';
  const NURSING_PROC_TIMING_ANY='Any time in shift';
  // 2.18.27: fixed times (HH:MM), like medicines. Empty = any time in the shift.
  const nprocHHMM=v=>{const m=String(v||'').match(/^(\d{1,2}):(\d{2})/);return m?`${m[1].padStart(2,'0')}:${m[2]}`:''};
  function nursingProcedureTimes(o){return [...new Set((Array.isArray(o?.scheduled_times)?o.scheduled_times:[]).map(nprocHHMM).filter(Boolean))].sort((a,b)=>((Number(a.slice(0,2))+17)%24*60+Number(a.slice(3)))-((Number(b.slice(0,2))+17)%24*60+Number(b.slice(3))))}
  function nprocTime12(t){const v=nprocHHMM(t);if(!v)return '';const [hh,mm]=v.split(':').map(Number);return `${hh%12||12}:${String(mm).padStart(2,'0')} ${hh>=12?'PM':'AM'}`}
  const nprocShiftOfTime=t=>{const hh=Number(nprocHHMM(t).slice(0,2));return hh>=7&&hh<19?'Day Shift (7 AM–7 PM)':'Night Shift (7 PM–7 AM)'};
  function nprocShiftForTimes(times){const s=new Set(times.map(nprocShiftOfTime));return s.size===1?[...s][0]:'Both shifts'}
  function nprocFrequencyForTimes(times){return times.length===1?'Once daily':times.length===2?'Twice daily':`${times.length} times daily`}
  const isNursingProcedureOrder=o=>String(o?.order_kind||'')===NURSING_PROC_KIND;
  const isCareOnlyOrder=o=>!isNursingProcedureOrder(o);
  function blankNursingProcedure(){
    return {tariff_id:'',procedure_code:'',care_type:'',custom:false,timing:NURSING_PROC_TIMING_FIXED,scheduled_times:[],shift:'Both shifts',frequency:'Daily',instruction:'',preferred_from:'',preferred_to:'',is_locked:false};
  }
  const nprocIsFixed=row=>(row?.timing||(nursingProcedureTimes(row).length?NURSING_PROC_TIMING_FIXED:NURSING_PROC_TIMING_ANY))===NURSING_PROC_TIMING_FIXED;
  function nursingProcedureRowComplete(row){return Boolean(String(row?.care_type||'').trim())&&(!nprocIsFixed(row)||nursingProcedureTimes(row).length>0)}
  function nursingProcedureRowProblem(row){if(!String(row?.care_type||'').trim())return 'Select (or type) the nursing procedure.';if(nprocIsFixed(row)&&!nursingProcedureTimes(row).length)return 'Add at least one time (e.g. 8:00 AM), or choose "Any time in shift".';return ''}
  function nursingProcedureLabel(o){return `${o?.procedure_code?`${o.procedure_code} · `:''}${o?.care_type||'Nursing procedure'}`}
  function nursingProcedureDetail(o){const t=nursingProcedureTimes(o);return (t.length?[`At ${t.map(nprocTime12).join(', ')}`,o?.frequency||nprocFrequencyForTimes(t),o?.instruction]:[o?.shift,o?.frequency,careWindowLabel(o),o?.instruction]).filter(Boolean).join(' · ')}
  function nursingProcedureOrderRow(row,patientId,userId){
    const times=nprocIsFixed(row)?nursingProcedureTimes(row):[];
    if(times.length)return {
      patient_id:patientId,order_kind:NURSING_PROC_KIND,
      care_type:String(row.care_type||'').trim(),
      procedure_code:row.procedure_code||null,tariff_id:row.tariff_id||null,
      scheduled_times:times,shift:nprocShiftForTimes(times),frequency:nprocFrequencyForTimes(times),
      instruction:String(row.instruction||'').trim()||null,preferred_from:null,preferred_to:null,
      start_date:row.start_date||todayISOIndia(),is_active:true,entered_by:userId||null
    };
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
    const {error}=await client.from('care_orders').select('order_kind,scheduled_times').limit(1);
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
    const fixed=nprocIsFixed(row);
    const times=nursingProcedureTimes(row);
    const [draftTime,setDraftTime]=React.useState('');
    function addTime(){const t=nprocHHMM(draftTime);if(!t)return;set({timing:NURSING_PROC_TIMING_FIXED,scheduled_times:[...times.filter(x=>x!==t),t]});setDraftTime('')}
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
      miniSelect('Timing',fixed?NURSING_PROC_TIMING_FIXED:NURSING_PROC_TIMING_ANY,[NURSING_PROC_TIMING_FIXED,NURSING_PROC_TIMING_ANY],v=>set({timing:v})),
      // 2.18.27: with fixed times the Shift is locked — it is set from the times (Day / Night / Both).
      fixed?h('div',{className:'field'},h('label',null,'Shift (set from the times)'),
        h('select',{value:times.length?nprocShiftForTimes(times):'',disabled:true,title:'Set automatically from the times',style:{background:'#f3eef1',color:'#6b5560',cursor:'not-allowed'}},
          h('option',{value:''},'— add a time —'),NURSING_PROC_SHIFTS.map(x=>h('option',{key:x,value:x},x)))):null,
      fixed?h('div',{className:'field',style:{gridColumn:'1 / -1'}},
        h('label',null,'Times * (like medicines — each time is a separate task)'),
        h('div',{style:{display:'flex',flexWrap:'wrap',gap:'8px',alignItems:'center'}},
          times.map(t=>h('span',{key:t,style:{display:'inline-flex',alignItems:'center',gap:'6px',padding:'6px 10px',borderRadius:'999px',background:'#fde7f1',color:'#7a1247',fontWeight:700}},
            nprocTime12(t),h('small',{style:{fontWeight:500,color:'#8a5a70'}},nprocShiftOfTime(t).startsWith('Day')?'Day':'Night'),
            h('button',{type:'button','aria-label':`Remove ${nprocTime12(t)}`,onClick:()=>set({scheduled_times:times.filter(x=>x!==t)}),style:{border:'none',background:'transparent',color:'#a91360',fontSize:'16px',cursor:'pointer',padding:0}},'×'))),
          h('input',{type:'time',value:draftTime,onChange:e=>setDraftTime(e.target.value),style:{maxWidth:'150px'}}),
          h('button',{type:'button',className:'btn btn-secondary',onClick:addTime},'+ Add time')),
        h('small',{style:{display:'block',marginTop:'6px',color:'#6b5560'}},times.length?`${nprocFrequencyForTimes(times)} · Day = 7 AM–7 PM, Night = 7 PM–7 AM`:'Pick a time and press "+ Add time". Add as many times as needed (e.g. 8:00 AM, 2:00 PM, 8:00 PM).'),
        h('div',{style:{display:'flex',flexWrap:'wrap',gap:'6px',marginTop:'6px'}},h('small',{style:{color:'#6b5560',alignSelf:'center'}},'Quick:'),
          [['Once','08:00'],['Twice','08:00,20:00'],['3 times','08:00,14:00,20:00'],['4 times','06:00,12:00,18:00,00:00'],['Every 6 h','06:00,12:00,18:00,00:00'],['Every 4 h','06:00,10:00,14:00,18:00,22:00,02:00']].filter((x,i,a)=>a.findIndex(y=>y[1]===x[1])===i).map(([l,v])=>h('button',{type:'button',key:l,className:'btn btn-secondary',style:{padding:'4px 10px',fontSize:'12px'},onClick:()=>set({scheduled_times:v.split(',')})},l)))
      ):h(React.Fragment,null,
        miniSelect('Shift',row.shift,NURSING_PROC_SHIFTS,v=>set({shift:v})),
        miniSelect('Frequency',row.frequency,NURSING_PROC_FREQUENCIES,v=>set({frequency:v})),
        miniInput('Preferred from (optional)',careTimeValue(row.preferred_from),v=>set({preferred_from:v}),false,'time'),
        miniInput('Preferred to (optional)',careTimeValue(row.preferred_to),v=>set({preferred_to:v}),false,'time')),
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
        if(!nursingProcedureRowComplete(list[open])){setMsg&&setMsg(`Nursing procedure ${open+1}: ${nursingProcedureRowProblem(list[open])}`);return}
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
    const [editing,setEditing]=React.useState(null); // 2.18.30: the planned procedure being edited
    const [row,setRow]=React.useState(blankNursingProcedure());
    const [busy,setBusy]=React.useState(false);
    const procOrders=(orders||[]).filter(isNursingProcedureOrder);
    const active=procOrders.filter(o=>o.is_active!==false);
    const stopped=procOrders.filter(o=>o.is_active===false);
    const procIds=new Set(procOrders.map(o=>o.id));
    const fmtWhen=v=>{const d=v?new Date(v):null;return d&&!isNaN(d)?formatDateTimeIN(v):''};
    const records=[
      ...(logs||[]).filter(x=>procIds.has(x.care_order_id)).map(x=>{const o=procOrders.find(p=>p.id===x.care_order_id)||{};return {id:`log-${x.id}`,at:x.completed_at||x.created_at||x.care_date,title:`${formatDateIN(x.care_date)}${x.scheduled_time?` · ${nprocTime12(x.scheduled_time)}`:''} · ${x.shift||''} · ${x.status||'Recorded'}`,name:nursingProcedureLabel(o),note:x.remarks||'',source:'Plan'}}),
      ...(charges||[]).map(x=>({id:`chg-${x.id}`,at:x.service_datetime||x.raised_at||x.created_at||x.charge_date,title:`${x.service_datetime?fmtWhen(x.service_datetime):formatDateIN(x.charge_date||String(x.created_at||'').slice(0,10))} · ${x.status||'Recorded'}`,name:x.service_name||'Nursing procedure',note:[x.quantity?`Qty ${x.quantity}${x.unit?` ${x.unit}`:''}`:'',x.raised_by_name?`by ${x.raised_by_name}`:'',x.remarks||x.description||''].filter(Boolean).join(' · '),source:'Approval Request'}))
    ].sort((a,b)=>new Date(b.at||0)-new Date(a.at||0));
    async function save(){
      if(busy)return;
      if(!nursingProcedureRowComplete(row))return showSamaraActionToast('error','Nursing Procedure',nursingProcedureRowProblem(row));
      const newRow=nursingProcedureOrderRow(row,patient.id,null);
      if(active.some(o=>o.id!==editing?.id&&String(o.care_type||'').trim().toLowerCase()===String(row.care_type).trim().toLowerCase()&&(nursingProcedureTimes(o).some(t=>(newRow.scheduled_times||[]).includes(t))||(!nursingProcedureTimes(o).length&&!(newRow.scheduled_times||[]).length&&o.shift===newRow.shift))))return showSamaraActionToast('error','Nursing Procedure','This procedure is already planned for the same shift. Stop the old one first if it changes.');
      setBusy(true);
      if(editing){
        // 2.18.30: edit in place — records already made stay as they are (each keeps its own time).
        try{
          const {patient_id,entered_by,start_date,is_active,...changes}=newRow;
          const before={procedure:editing.care_type,code:editing.procedure_code||null,shift:editing.shift,frequency:editing.frequency,times:editing.scheduled_times||null,window:[editing.preferred_from||null,editing.preferred_to||null],instruction:editing.instruction||null};
          const {error}=await client.from('care_orders').update(changes).eq('id',editing.id);
          if(error)throw error;
          await writeAuditEvent('Edit Nursing Procedure Plan','CareOrder',editing.id,{patient_id:patient.id,before,after:{procedure:changes.care_type,code:changes.procedure_code||null,shift:changes.shift,frequency:changes.frequency,times:changes.scheduled_times||null,window:[changes.preferred_from||null,changes.preferred_to||null],instruction:changes.instruction||null}});
          showSamaraActionToast('success','Nursing Procedure',`${changes.care_type} updated. Shift Tasks and the screensaver use the new plan from now on.`);
          setEditing(null);setRow(blankNursingProcedure());onChanged&&onChanged();
        }catch(error){showSamaraActionToast('error','Nursing Procedure',error.message||String(error))}
        finally{setBusy(false)}
        return;
      }
      try{
        if(!(await nursingProcedureColumnReady()))throw new Error(NURSING_PROC_SQL_HINT);
        const {data:{user}}=await client.auth.getUser();
        const {data,error}=await client.from('care_orders').insert(nursingProcedureOrderRow(row,patient.id,user?.id)).select('id').single();
        if(error)throw error;
        await writeAuditEvent('Add Nursing Procedure Plan','CareOrder',data?.id||null,{patient_id:patient.id,procedure:row.care_type,code:row.procedure_code||null,shift:newRow.shift,frequency:newRow.frequency,times:newRow.scheduled_times||null});
        showSamaraActionToast('success','Nursing Procedure',`${row.care_type} added to the plan. It now shows in Shift Tasks and on the screensaver.`);
        setRow(blankNursingProcedure());setAdding(false);onChanged&&onChanged();
      }catch(error){showSamaraActionToast('error','Nursing Procedure',error.message||String(error))}
      finally{setBusy(false)}
    }
    function startEdit(o){
      const times=nursingProcedureTimes(o);
      const item=catalog.find(x=>(o.tariff_id&&String(x.id)===String(o.tariff_id))||(!o.tariff_id&&String(x.service_name||'').trim().toLowerCase()===String(o.care_type||'').trim().toLowerCase()));
      setAdding(false);setEditing(o);
      setRow({...blankNursingProcedure(),tariff_id:item?item.id:'',procedure_code:item?.charge_code||o.procedure_code||'',care_type:o.care_type||'',custom:!item,
        timing:times.length?NURSING_PROC_TIMING_FIXED:NURSING_PROC_TIMING_ANY,scheduled_times:times,
        shift:o.shift||'Both shifts',frequency:o.frequency||'Daily',instruction:o.instruction||'',
        preferred_from:careTimeValue(o.preferred_from),preferred_to:careTimeValue(o.preferred_to)});
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
        canManage&&!adding&&!editing?h('button',{type:'button',className:'btn btn-primary',onClick:()=>{setRow(blankNursingProcedure());setAdding(true)}},'＋ Add Nursing Procedure'):null),
      canManage&&(adding||editing)&&h('div',{style:{border:'1px solid #ecc6d8',borderRadius:'12px',padding:'10px 12px',margin:'8px 0',background:'#fff7fb'}},
        editing?h('h4',{style:{margin:'0 0 4px',color:'#7a1247'}},`Edit: ${nursingProcedureLabel(editing)}`):null,
        editing?h('p',{className:'small-note',style:{margin:'0 0 6px'}},'Changes apply from now on. Records already made keep their own time.'):null,
        catalogError?h('p',{className:'small-note',style:{color:'#b42318'}},catalogError):null,
        h(NursingProcedureRowFields,{row,catalog,onChange:setRow}),
        h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
          h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:save},busy?'Saving…':editing?'Save Changes':'Save Procedure'),
          h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>{setAdding(false);setEditing(null);setRow(blankNursingProcedure())}},'Cancel')),
        h('p',{className:'small-note'},'Charges are not raised from here — a chargeable procedure is still charged through NURSING → Approval Requests.')),
      // 2.18.29: name, times and buttons on separate lines so the Stop button is always visible.
      active.length?active.map(o=>h('div',{key:o.id,style:{display:'flex',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:'8px 12px',padding:'10px 0 10px 14px',borderLeft:'3px solid #9fd3c7',margin:'6px 0'}},
        h('div',{style:{flex:'1 1 280px',minWidth:0}},
          h('strong',{style:{display:'block'}},nursingProcedureLabel(o)),
          h('small',{style:{display:'block',color:'#5b4a55',marginTop:'2px'}},`${nursingProcedureDetail(o)}${o.start_date?` · from ${formatDateIN(o.start_date)}`:''}`)),
        h('div',{style:{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}},
          o.instruction&&typeof TamilAssist==='function'?h(TamilAssist,{text:o.instruction,context:'Nursing Procedure Instruction'}):null,
          canManage?h('button',{type:'button',className:'btn btn-primary',disabled:busy||!!editing,onClick:()=>startEdit(o)},'Edit'):null,
          canManage?h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>stop(o)},'Stop'):null)))
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
