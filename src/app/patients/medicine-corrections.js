  // ---------------------------------------------------------------------------------------------
  // 2.18.133 Admission prescription corrections ("Edit with reason").
  // A wrong medicine entry made at admission is corrected here — by Nurse, Nursing Manager or Admin,
  // within 48 hours of admission — instead of through Doctor Review / Modify. Every correction keeps
  // old → new values, the reason, who and when (table medication_entry_corrections, SQL 296).
  // Changes after 48 hours, and every real doctor's change, still go through Doctor Review.
  // ---------------------------------------------------------------------------------------------
  const MED_CORRECTION_FREQUENCIES=['Once Daily (OD)','Twice Daily (BD)','Three Times Daily (TDS)','Four Times Daily (QID)','HS','STAT','SOS / PRN','Alternate Days','Weekly','Monthly'];
  const MED_CORRECTION_ROUTES=['Oral','NG / Ryles Tube','IV','IM','Subcutaneous','Topical','Inhalation','Nasal','Other'];
  const MED_CORRECTION_FOOD=['Before food','After food','With food','No restriction'];
  const medCorrectionTimes=v=>(Array.isArray(v)?v:String(v||'').replace(/[{}"]/g,'').split(',')).map(x=>normalizeMedicationTime(String(x).trim().slice(0,5))).filter(Boolean);

  // Is this order still an admission entry (never changed by a real doctor's review)?
  function isAdmissionEntryOrder(order,reviews){
    if(!order||order.is_active===false)return false;
    if(!order.review_id)return true;
    const r=(reviews||[]).find(x=>x.id===order.review_id);
    return Boolean(r&&r.is_admission_correction);
  }

  // Short "old → new" text for the correction log
  function medicineCorrectionSummary(row){
    const o=row.old_snapshot||{},n=row.new_snapshot||{};
    if(row.action==='Re-marked from Doctor Review'){
      const ch=Array.isArray(n.changes)?n.changes:[];
      return ch.length?ch.map(c=>`${c.action} ${c.medicine||''} ${c.strength||''}`.trim()).join('; '):'—';
    }
    if(row.action==='Added (missed at admission)')return [n.medicine_name,n.strength||n.dose,n.frequency,medCorrectionTimes(n.scheduled_times).map(medicationTimeLabel).join(', ')].filter(Boolean).join(' · ');
    if(row.action==='Removed (wrong entry)')return [o.medicine_name,o.strength||o.dose,o.frequency].filter(Boolean).join(' · ');
    const parts=[];
    const cmp=(label,a,b)=>{if(String(a??'')!==String(b??''))parts.push(`${label}: ${a||'—'} → ${b||'—'}`)};
    cmp('Medicine',o.medicine_name,n.medicine_name);cmp('Strength',o.strength||o.dose,n.strength||n.dose);cmp('Frequency',o.frequency,n.frequency);cmp('Route',o.route,n.route);
    cmp('Time',medCorrectionTimes(o.scheduled_times).map(medicationTimeLabel).join(', '),medCorrectionTimes(n.scheduled_times).map(medicationTimeLabel).join(', '));
    cmp('Food',o.food_instruction,n.food_instruction);cmp('Instruction',o.special_instruction,n.special_instruction);
    return parts.join(' · ')||'No field changed';
  }

  // mode: 'correct' | 'add' | 'remove'
  function MedicineCorrectionDialog({patient,order,mode,onClose,onSaved}){
    const start=order||{};
    const [f,setF]=React.useState({
      medicine_name:start.medicine_name||'',strength:start.strength||start.dose||'',
      frequency:start.frequency||'Once Daily (OD)',route:start.route||'Oral',
      times:medCorrectionTimes(start.scheduled_times).join(', ')||(mode==='add'?'08:00':''),
      food_instruction:start.food_instruction||'After food',special_instruction:start.special_instruction||'',
      prescribed_by_doctor:''
    });
    const [reason,setReason]=React.useState('');
    const [busy,setBusy]=React.useState(false);
    const [error,setError]=React.useState('');
    const set=(k,v)=>setF(cur=>({...cur,[k]:v}));
    const title=mode==='add'?'Add a medicine missed at admission':mode==='remove'?'Remove a wrong admission entry':'Edit admission entry (with reason)';
    async function save(e){
      e?.preventDefault?.();
      if(busy)return;
      if(String(reason).trim().length<3)return setError('Please write the reason for this correction.');
      if(mode!=='remove'){
        if(!String(f.medicine_name).trim())return setError('Medicine name is required.');
        if(!['SOS / PRN','STAT'].includes(f.frequency)&&!medCorrectionTimes(f.times).length)return setError('Select at least one time.');
      }
      if(mode==='remove'&&!confirm(`Remove ${start.medicine_name||'this medicine'} from the admission prescription? It will stop appearing in the MAR.`))return;
      setBusy(true);setError('');
      const med=mode==='remove'?null:{medicine_name:String(f.medicine_name).trim(),strength:String(f.strength).trim(),dose:String(f.strength).trim(),frequency:f.frequency,route:f.route,
        scheduled_times:medCorrectionTimes(f.times),food_instruction:f.food_instruction,special_instruction:String(f.special_instruction).trim(),prescribed_by_doctor:String(f.prescribed_by_doctor).trim()};
      const {error:err}=await client.rpc('correct_admission_medicine',{p_action:mode,p_patient:patient.id,p_order_id:order?.id||null,p_med:med,p_reason:String(reason).trim()});
      setBusy(false);
      if(err)return setError(/correct_admission_medicine|does not exist/i.test(err.message)?'Admission corrections are not installed yet (SQL 296).':err.message);
      onSaved?.();
    }
    return h('div',{className:'modal-backdrop',style:{zIndex:12000},onClick:e=>{if(e.target===e.currentTarget&&!busy)onClose()}},h('form',{className:'card modal',style:{maxWidth:'680px'},onSubmit:save},
      h('div',{className:'panel-head'},h('div',null,h('h3',null,title),h('small',null,`${formalName(patient)||patient?.full_name||''} · ${patient?.patient_id||''}`)),h('button',{type:'button',className:'close',onClick:onClose},'×')),
      h('p',{className:'small-note',style:{marginTop:0}},'For mistakes made while entering the admission prescription. This is not a doctor\'s change — any change ordered by the doctor must go through Doctor Review / Modify. Old and new values, your reason and your name are saved.'),
      mode==='remove'
        ?h('div',{className:'message warning'},`${start.medicine_name||'Medicine'} ${start.strength||start.dose||''} · ${start.frequency||''} · ${medCorrectionTimes(start.scheduled_times).map(medicationTimeLabel).join(', ')}`)
        :h('div',{className:'modal-grid'},
          h('div',{className:'field'},h('label',null,'Medicine *'),h('input',{value:f.medicine_name,onChange:e=>set('medicine_name',e.target.value),required:true})),
          h(MedicationStrengthInput,{label:'Strength / Dose',value:f.strength,onChange:v=>set('strength',v)}),
          h('div',{className:'field'},h('label',null,'Frequency'),h('select',{value:f.frequency,onChange:e=>{const v=e.target.value;setF(cur=>({...cur,frequency:v,times:medicationTimesForFrequency(v,cur.times)}))}},MED_CORRECTION_FREQUENCIES.map(x=>h('option',{key:x,value:x},x)))),
          h('div',{className:'field'},h('label',null,'Route'),h('select',{value:f.route,onChange:e=>set('route',e.target.value)},MED_CORRECTION_ROUTES.map(x=>h('option',{key:x,value:x},x)))),
          h(MedicationTimeSelector,{label:'Time',value:f.times,frequency:f.frequency,onChange:v=>set('times',v)}),
          h('div',{className:'field'},h('label',null,'Food'),h('select',{value:f.food_instruction,onChange:e=>set('food_instruction',e.target.value)},MED_CORRECTION_FOOD.map(x=>h('option',{key:x,value:x},x)))),
          h('div',{className:'field',style:{gridColumn:'1 / -1'}},h('label',null,'Special instruction'),h('input',{value:f.special_instruction,onChange:e=>set('special_instruction',e.target.value)})),
          mode==='add'&&h('div',{className:'field'},h('label',null,'Prescribed doctor (as on the admission prescription)'),h('input',{value:f.prescribed_by_doctor,onChange:e=>set('prescribed_by_doctor',e.target.value)}))),
      h('div',{className:'field',style:{marginTop:'10px'}},h('label',null,'Reason for correction *'),h('textarea',{rows:2,value:reason,placeholder:'e.g. Time entered wrongly at admission; prescription says 12 AM / 12 PM',onChange:e=>setReason(e.target.value),required:true})),
      error&&h('div',{className:'message error',style:{marginTop:'8px'}},error),
      h('div',{className:'modal-bottom-actions'},
        h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:onClose},'Cancel'),
        h('button',{type:'submit',className:`btn ${mode==='remove'?'btn-danger':'btn-primary'}`,disabled:busy},busy?'Saving…':mode==='remove'?'Remove entry':mode==='add'?'Add medicine':'Save correction'))
    ));
  }
