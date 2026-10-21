  // 2.18.60: sliding-scale / sugar-based insulin (no fixed dose on the prescription). Such doses are never part of
  // "Give checked": the nurse checks the sugar first and records the reading + units given in the MAR form.
  function marIsVariableDose(order){
    const text=[order?.medicine_name,order?.strength,order?.dose,order?.special_instruction,order?.special_instructions,order?.instructions,order?.remarks].filter(Boolean).join(' ');
    return /sliding\s*scale|as\s+per\s+(the\s+)?(blood\s*)?sugar|according\s+to\s+(the\s+)?(blood\s*)?sugar|depend(s|ing)?\s+on\s+(the\s+)?(blood\s*)?sugar|\b(grbs|cbg|rbs)\b/i.test(text)
      ||(/insulin|actrapid|lantus|novorapid|mixtard|humulin|tresiba|basalog|glargine/i.test(String(order?.medicine_name||''))&&!String(order?.strength||order?.dose||'').trim());
  }
  function DischargeMedicationReview(){
    const [rows,setRows]=React.useState([]),[target,setTarget]=React.useState(null),[note,setNote]=React.useState(''),[busy,setBusy]=React.useState(false),[error,setError]=React.useState('');
    async function load(){const r=await client.rpc('discharge_medication_review_list');if(r.error)setError(r.error.message);else setRows(r.data||[])}
    React.useEffect(()=>{load()},[]);
    async function save(e){e.preventDefault();if(busy)return;setBusy(true);const r=await client.rpc('review_discharge_medication',{p_id:target.id,p_note:note.trim()});setBusy(false);if(r.error){setError(r.error.message);return}setTarget(null);setNote('');await load()}
    if(!rows.length&&!error)return null;
    return h(Section,{title:`Discharged Patients — Medication Review (${rows.length})`,subtitle:'Unresolved doses before actual departure. Review the history; these are not current administration tasks.'},
      error&&h('div',{className:'message error'},error),
      h('details',null,h('summary',null,'Show pre-departure review list'),rows.map(r=>h('div',{key:r.id,className:'absence-card'},h('strong',null,`${r.patient_name} · ${r.medicine_name} ${r.strength||''}`),h('p',null,`${formatDateIN(r.scheduled_date)} ${r.scheduled_time} · ${r.previous_status}`),h('button',{className:'btn btn-secondary',onClick:()=>{setTarget(r);setNote('');setError('')}},'Record Review')))),
      target&&h('div',{className:'modal-backdrop'},h('form',{className:'card modal',onSubmit:save},h('h3',null,'Review Pre-departure Dose'),h('p',null,`${target.patient_name} · ${target.medicine_name} · ${formatDateIN(target.scheduled_date)} ${target.scheduled_time}`),h('p',null,'Recording a review does not mark this dose as given or change its original administration record.'),h('label',{htmlFor:'discharge-review-note'},'Review outcome / follow-up'),h('textarea',{id:'discharge-review-note',required:true,value:note,onChange:e=>setNote(e.target.value)}),h('div',{className:'modal-actions'},h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>setTarget(null)},'Cancel'),h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':'Save Review')))));
  }

  function Medicines({profile,onNavigate}){
    const today=todayISOIndia();
    const [state,setState]=React.useState({loading:true,orders:[],mar:[],patients:[],reviews:[],reviewItems:[],error:'',reviewSetupError:''});
    const isFrontlineClinical=['Nurse','Caregiver'].includes(profile?.role);
    const [compactMedicationView,setCompactMedicationView]=React.useState(()=>{
      try{return window.matchMedia('(max-width:700px)').matches;}catch(_error){return (window.innerWidth||1024)<=700;}
    });
    React.useEffect(()=>{
      let media;try{media=window.matchMedia('(max-width:700px)');}catch(_error){return;}
      const sync=event=>setCompactMedicationView(Boolean(event.matches));
      if(media.addEventListener)media.addEventListener('change',sync);else media.addListener?.(sync);
      return()=>{if(media.removeEventListener)media.removeEventListener('change',sync);else media.removeListener?.(sync);};
    },[]);
    const useFrontlinePriority=isFrontlineClinical&&compactMedicationView;
    const [tab,setTab]=React.useState(()=>isFrontlineClinical?'Today’s MAR':'Active Prescriptions');
    const [patientFilter,setPatientFilter]=React.useState('');
    const [periodFilter,setPeriodFilter]=React.useState('All');
    const [dateFrom,setDateFrom]=React.useState('');
    const [dateTo,setDateTo]=React.useState('');
    const [appliedMedicationFilter,setAppliedMedicationFilter]=React.useState({period:'All',from:'',to:''});
    const [marTarget,setMarTarget]=React.useState(null);
    const [marForm,setMarForm]=React.useState({scheduled_time:'',status:'Given',administered_at:'',remarks:'',late_entry_reason:'',late_entry_justification:'',reschedule:false,rescheduled_time:'',withhold_reason:'',withhold_reading:'',doctor_informed_name:'',doctor_informed_via:'Phone call',doctor_informed_at:'',sugar_reading:'',units_given:''});
    // 2.18.60: Today's MAR grouped by dose time — open / closed rounds, rooms, "Give checked" per Guest per round
    const [slotOpen,setSlotOpen]=React.useState({});
    const [uncheckedDoses,setUncheckedDoses]=React.useState({});
    const [attentionOnly,setAttentionOnly]=React.useState(false);
    const [batchTarget,setBatchTarget]=React.useState(null);
    const [batchBusy,setBatchBusy]=React.useState(false);
    const [batchMessage,setBatchMessage]=React.useState('');
    const [doseDetail,setDoseDetail]=React.useState(null);
    const [prescriptionView,setPrescriptionView]=React.useState('all');
    const [showHistoryMobile,setShowHistoryMobile]=React.useState(false);
    // 2.15.11: withheld dose → doctor's instruction
    const [instructionTarget,setInstructionTarget]=React.useState(null);
    const [instructionForm,setInstructionForm]=React.useState({instruction:'',notes:'',give_at:''});
    const [instructionBusy,setInstructionBusy]=React.useState(false);
    const [instructionMessage,setInstructionMessage]=React.useState('');
    // 2.16.10: a withheld-dose pop-up / notification opens Medicines showing only that dose (global rule)
    const [withheldFocus,clearWithheldFocus]=useRecordFocus('Medicines');
    const [marBusy,setMarBusy]=React.useState(false);
    const [marMessage,setMarMessage]=React.useState('');
    const [showShiftMedication,setShowShiftMedication]=React.useState(false);
    const [returnPage,setReturnPage]=React.useState('');
    const taskNavigationHandled=React.useRef(false);
    const canReviseMedication=['Admin','Manager','Nurse'].includes(profile?.role);
    const [reviewOpen,setReviewOpen]=React.useState(false);
    // 2.14.76: "Add New Medicine" popup — several new medicines entered together, then added to the review.
    const [addMedOpen,setAddMedOpen]=React.useState(false);
    const [addMedRows,setAddMedRows]=React.useState([]);
    const [addMedEditIndex,setAddMedEditIndex]=React.useState(null);
    const [addMedMessage,setAddMedMessage]=React.useState('');
    const [reviewBusy,setReviewBusy]=React.useState(false);
    const [reviewMessage,setReviewMessage]=React.useState('');
    const [reviewFile,setReviewFile]=React.useState(null);
    const [reviewForm,setReviewForm]=React.useState({patient_id:'',reviewed_at:'',doctor_name:'',doctor_contact:'',review_type:'Routine Doctor Review',order_mode:'Written Prescription',effective_from:'',clinical_notes:'',received_by_name:'',confirmation_due_at:'',changes:[]});
    const medicationDurations=['Single Dose','1 Day','3 Days','5 Days','7 Days','10 Days','14 Days','21 Days','30 Days','Until Doctor Review','Long Term','Custom'];
    const medicationFrequencies=['Once Daily (OD)','Twice Daily (BD)','Three Times Daily (TDS)','Four Times Daily (QID)','HS','STAT','SOS / PRN','Weekly','Monthly'];
    const medicationRoutes=['Oral','IV','IM','SC','Sublingual','Inhalation','Nasal','Topical','Eye','Ear','Other'];
    const medicationFood=['Before food','After food','With food','No restriction'];

    function localDateTimeValue(date=new Date()){
      const pad=n=>String(n).padStart(2,'0');
      return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
    function parseTimes(value){
      if(Array.isArray(value))return value.filter(Boolean).map(normalizeMedicationTime).filter(Boolean);
      return String(value||'').split(',').map(normalizeMedicationTime).filter(Boolean);
    }
    // 2.14.73: a doctor's change can take effect later. The old order is saved as Stopped with stopped_at = that later time,
    // so it stays current until then; the new order is 'upcoming' until its effective_from.
    function stopIsScheduled(order){const s=order?.stopped_at?new Date(order.stopped_at).getTime():NaN;return Number.isFinite(s)&&s>Date.now()}
    function orderUpcoming(order){
      if(!order||order.is_active===false||stopIsScheduled(order)||order.stopped_at)return false;
      const patient=patientFor(order);if(!patient?.id||patient.is_active===false||patient.admission_status==='Discharged')return false;
      if(['completed','discontinued','stopped','inactive'].includes(String(order.status||'').trim().toLowerCase()))return false;
      const e=order.effective_from?new Date(order.effective_from).getTime():NaN;return Number.isFinite(e)&&e>Date.now();
    }
    function orderActive(order){
      const scheduledStop=stopIsScheduled(order);
      if(order.is_active===false&&!scheduledStop)return false;
      const patient=patientFor(order);
      if(!patient?.id||patient.is_active===false||patient.admission_status==='Discharged')return false;
      const status=String(order.status||'').trim().toLowerCase();
      if(['completed','discontinued','stopped','inactive'].includes(status)&&!scheduledStop)return false;
      const end=order.end_date||'';
      if(end&&end<today)return false;
      const now=Date.now();
      const effective=order.effective_from?new Date(order.effective_from):null;
      if(effective&&!Number.isNaN(effective.getTime())&&effective.getTime()>now)return false;
      const stopped=order.stopped_at?new Date(order.stopped_at):null;
      if(stopped&&!Number.isNaN(stopped.getTime())&&stopped.getTime()<=now)return false;
      return true;
    }
    function blankReviewMedicine(action='Add'){
      return {client_id:`new-${Date.now()}-${Math.random()}`,action,original_order_id:null,medicine_name:'',strength:'',frequency:'Once Daily (OD)',route:'Oral',times:'08:00',food_instruction:'After food',duration:'Long Term',custom_duration_days:'',special_instruction:'',change_note:'',effective_from:''};
    }
    function orderToReviewChange(order){
      return {client_id:order.id,effective_from:'',action:'Continue',original_order_id:order.id,medicine_name:order.medicine_name||'',strength:order.strength||order.dose||'',frequency:order.frequency||'Once Daily (OD)',route:order.route||'Oral',times:parseTimes(order.scheduled_times).join(', '),food_instruction:order.food_instruction||'After food',duration:order.duration||'Long Term',custom_duration_days:order.duration_days||'',special_instruction:order.special_instruction||order.special_instructions||'',change_note:''};
    }
    function initializeReviewPatient(patientId){
      const p=state.patients.find(row=>row.id===patientId)||{};
      const current=state.orders.filter(o=>o.patient_id===patientId&&(orderActive(o)||orderUpcoming(o))).map(orderToReviewChange);
      const nowValue=localDateTimeValue();
      setReviewForm(currentForm=>({...currentForm,patient_id:patientId,reviewed_at:nowValue,effective_from:nowValue,doctor_name:p.treating_doctor||p.referring_doctor||'',doctor_contact:p.doctor_phone||'',changes:current}));
    }
    function openMedicationReview(patientId=''){
      if(!canReviseMedication)return;
      const nowValue=localDateTimeValue();
      setReviewMessage('');setReviewFile(null);
      setReviewForm({patient_id:patientId,reviewed_at:nowValue,doctor_name:'',doctor_contact:'',review_type:'Routine Doctor Review',order_mode:'Written Prescription',effective_from:nowValue,clinical_notes:'',received_by_name:'',confirmation_due_at:'',changes:[]});
      setReviewOpen(true);
      if(patientId)setTimeout(()=>initializeReviewPatient(patientId),0);
    }
    function updateReviewChange(index,patch){setReviewForm(current=>({...current,changes:current.changes.map((row,i)=>i===index?{...row,...patch}:row)}));}
    function openAddMedicines(editIndex=null){
      setAddMedMessage('');
      setAddMedEditIndex(editIndex);
      setAddMedRows(editIndex===null?[blankReviewMedicine('Add')]:[{...reviewForm.changes[editIndex]}]);
      setAddMedOpen(true);
    }
    React.useEffect(()=>{if(!reviewOpen)setAddMedOpen(false)},[reviewOpen]);
    function updateAddMedRow(index,patch){setAddMedRows(rows=>rows.map((row,i)=>i===index?{...row,...patch}:row));}
    function addMedRowProblem(row){
      const name=String(row.medicine_name||'').trim()||'this medicine';
      if(!String(row.medicine_name||'').trim())return 'Enter the medicine name.';
      if(!medicationStrengthValid(row.strength))return `Enter the Strength (number and unit) for ${name}.`;
      if(!row.frequency||!row.route||!parseTimes(row.times).length)return `Complete Frequency, Route and Time for ${name}.`;
      if(row.duration==='Custom'&&Number(row.custom_duration_days||0)<=0)return `Enter valid custom duration days for ${name}.`;
      const t=new Date(String(row.effective_from||'').trim()||reviewForm.effective_from).getTime();
      if(!Number.isFinite(t))return `Enter a valid start date & time for ${name}.`;
      if(t>Date.now()+REVIEW_EFFECTIVE_MAX_DAYS*86400000)return `Start date & time for ${name} can be at most ${REVIEW_EFFECTIVE_MAX_DAYS} days ahead.`;
      return '';
    }
    function saveAddMedicines(){
      const rows=addMedRows.filter(row=>String(row.medicine_name||'').trim()||String(row.strength||'').trim());
      if(!rows.length)return setAddMedMessage('Enter at least one medicine, or press Cancel.');
      for(const row of rows){const problem=addMedRowProblem(row);if(problem)return setAddMedMessage(problem);}
      const names=rows.map(row=>`${row.medicine_name} ${row.strength}`.trim());
      if(addMedEditIndex!==null){
        setReviewForm(current=>({...current,changes:current.changes.map((row,i)=>i===addMedEditIndex?{...rows[0],action:'Add'}:row)}));
      }else{
        setReviewForm(current=>({...current,changes:[...current.changes,...rows.map(row=>({...row,action:'Add'}))]}));
      }
      setAddMedOpen(false);setAddMedRows([]);setAddMedEditIndex(null);setAddMedMessage('');
      showSamaraActionToast('success',addMedEditIndex!==null?'Medicine updated':`${rows.length} new medicine${rows.length>1?'s':''} added`,
        `${names.join(', ')}. Press "Apply Doctor Review & Update Medication" to save to the patient record.`);
    }
    const REVIEW_EFFECTIVE_MAX_DAYS=30; // 2.14.73: a doctor's change may be ordered to start up to 30 days ahead
    function durationEndDate(change,effectiveAt){
      const start=String(effectiveAt||'').slice(0,10)||today;
      const days=change.duration==='Custom'?Number(change.custom_duration_days||0):({'Single Dose':0,'1 Day':1,'3 Days':3,'5 Days':5,'7 Days':7,'10 Days':10,'14 Days':14,'21 Days':21,'30 Days':30}[change.duration]??null);
      if(days===null)return null;
      const d=new Date(`${start}T00:00:00`);d.setDate(d.getDate()+Math.max(days-1,0));return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }
    async function uploadReviewPrescription(patientId){
      if(!reviewFile)return {path:null,name:null};
      const safe=String(reviewFile.name||'prescription').replace(/[^a-zA-Z0-9._-]/g,'_');
      const token=(globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}`);
      const path=`${patientId}/medication-reviews/${token}/${safe}`;
      const uploaded=await client.storage.from('patient-documents').upload(path,reviewFile,{contentType:reviewFile.type||undefined});
      if(uploaded.error)throw uploaded.error;
      return {path,name:reviewFile.name};
    }
    // Editable fields of a new / modified medicine (used in the review list and in the Add New Medicine popup).
    function reviewMedicineFields(row,patch){
      return h(React.Fragment,null,
        h('div',{className:'medication-review-fields'},

                miniInput('Medicine',row.medicine_name,v=>patch({medicine_name:v}),true),
                h(MedicationStrengthInput,{label:'Strength',value:row.strength,onChange:v=>patch({strength:v}),required:true}),
                miniSelect('Frequency',row.frequency,medicationFrequencies,v=>patch({frequency:v,times:(MEDICATION_FREQUENCY_TIMES[v]||parseTimes(row.times)).join(', ') })),
                miniSelect('Route',row.route,medicationRoutes,v=>patch({route:v})),
                h(MedicationTimeSelector,{label:'Time',value:row.times,onChange:v=>patch({times:v}),required:true}),
                miniSelect('Food',row.food_instruction,medicationFood,v=>patch({food_instruction:v})),
                miniSelect('Duration',row.duration,medicationDurations,v=>patch({duration:v})),
                row.duration==='Custom'&&miniInput('Custom days',row.custom_duration_days,v=>patch({custom_duration_days:v}),true,'number'),
                miniInput('Special instruction',row.special_instruction,v=>patch({special_instruction:v}))
        ),
(()=>{
                // 2.14.74: start / stop date & time for this medicine only (defaults to the review's Effective From).
                const own=String(row.effective_from||'').trim();const value=own||reviewForm.effective_from;
                const t=new Date(value).getTime();const isStop=row.action==='Stop';
                return h('div',{className:'field medication-review-row-effective',style:{marginTop:'8px'}},
                  h('label',null,isStop?'Stop from (date & time)':'Starts from (date & time)'),
                  h('input',{type:'datetime-local',required:true,max:localDateTimeValue(new Date(Date.now()+REVIEW_EFFECTIVE_MAX_DAYS*86400000)),value,onChange:e=>patch({effective_from:e.target.value})}),
                  Number.isFinite(t)&&t>Date.now()+60000
                    ?h('small',{style:{display:'block',marginTop:'4px',color:'#7a1247',fontWeight:700}},isStop?`Stops ${fmt(new Date(t).toISOString())}. Doses continue until then.`:`Future start: first dose from ${fmt(new Date(t).toISOString())}. No dose before that.`)
                    :h('small',{style:{display:'block',marginTop:'4px'}},own?'Set for this medicine only.':'Same as Effective From above. Change it to give this medicine its own time.'),
                  own&&own!==reviewForm.effective_from?h('button',{type:'button',className:'btn btn-secondary',style:{marginTop:'6px'},onClick:()=>patch({effective_from:''})},'Use review Effective From'):null
                );
              })()
      );
    }
    function reviewStopTime(row,index){
      const own=String(row.effective_from||'').trim();const value=own||reviewForm.effective_from;const t=new Date(value).getTime();
      return h('div',{className:'field medication-review-row-effective',style:{marginTop:'8px'}},
        h('label',null,'Stop from (date & time)'),
        h('input',{type:'datetime-local',required:true,max:localDateTimeValue(new Date(Date.now()+REVIEW_EFFECTIVE_MAX_DAYS*86400000)),value,onChange:e=>updateReviewChange(index,{effective_from:e.target.value})}),
        Number.isFinite(t)&&t>Date.now()+60000?h('small',{style:{display:'block',marginTop:'4px',color:'#7a1247',fontWeight:700}},`Stops ${fmt(new Date(t).toISOString())}. Doses continue until then.`):h('small',{style:{display:'block',marginTop:'4px'}},own?'Set for this medicine only.':'Same as Effective From above.'));
    }
    async function saveMedicationReview(e){
      e.preventDefault();setReviewMessage('');
      if(!reviewForm.patient_id)return setReviewMessage('Select the patient.');
      if(!String(reviewForm.doctor_name||'').trim())return setReviewMessage('Doctor name is required.');
      const reviewedAt=new Date(reviewForm.reviewed_at),effectiveAt=new Date(reviewForm.effective_from),now=new Date();
      if(Number.isNaN(reviewedAt.getTime())||Number.isNaN(effectiveAt.getTime()))return setReviewMessage('Enter valid review and effective date/time.');
      // 2.14.73: the review itself cannot be in the future, but the doctor may order the change to start later (up to 30 days).
      // No dose is scheduled under the new order before Effective From; the current prescription continues until then.
      if(reviewedAt.getTime()>now.getTime()+60000)return setReviewMessage('Doctor Review Date & Time cannot be in the future.');
      if(effectiveAt.getTime()>now.getTime()+REVIEW_EFFECTIVE_MAX_DAYS*86400000)return setReviewMessage(`Effective From can be at most ${REVIEW_EFFECTIVE_MAX_DAYS} days ahead.`);
      if(reviewForm.order_mode==='Written Prescription'&&!reviewFile)return setReviewMessage('Upload the doctor’s written prescription / order before applying the medication change.');
      if(reviewForm.order_mode!=='Written Prescription'){
        if(!String(reviewForm.received_by_name||'').trim())return setReviewMessage('Enter the staff member who received the verbal / telephone order.');
        if(!reviewForm.confirmation_due_at)return setReviewMessage('Enter when written confirmation is due for the verbal / telephone order.');
      }
      const changed=reviewForm.changes.filter(row=>row.action!=='Continue');
      // 2.14.74: each changed medicine may have its own start / stop date & time (blank = the review's Effective From).
      const rowEffectiveValue=row=>String(row.effective_from||'').trim()||reviewForm.effective_from;
      for(const row of changed){
        const t=new Date(rowEffectiveValue(row));
        const name=row.medicine_name||'the new medicine';
        if(Number.isNaN(t.getTime()))return setReviewMessage(`Enter a valid ${row.action==='Stop'?'stop':'start'} date & time for ${name}.`);
        if(t.getTime()>now.getTime()+REVIEW_EFFECTIVE_MAX_DAYS*86400000)return setReviewMessage(`${row.action==='Stop'?'Stop':'Start'} date & time for ${name} can be at most ${REVIEW_EFFECTIVE_MAX_DAYS} days ahead.`);
      }
      if(!changed.length)return setReviewMessage('No medication change is selected. Choose Modify, Stop, or Add New Medicine.');
      for(const row of reviewForm.changes){
        if(!['Modify','Add'].includes(row.action))continue;
        if(!String(row.medicine_name||'').trim()||!medicationStrengthValid(row.strength)||!row.frequency||!row.route||!parseTimes(row.times).length)return setReviewMessage('Complete Medicine, Strength (number and unit), Frequency, Route and Time for every modified/new medicine.');
        if(row.duration==='Custom'&&Number(row.custom_duration_days||0)<=0)return setReviewMessage('Enter valid custom duration days.');
      }
      setReviewBusy(true);let uploaded=null;
      try{
        uploaded=await uploadReviewPrescription(reviewForm.patient_id);
        const {data:{user}}=await client.auth.getUser();
        const reviewPayloadBase={patient_id:reviewForm.patient_id,reviewed_at:reviewedAt.toISOString(),doctor_name:String(reviewForm.doctor_name).trim(),doctor_contact:String(reviewForm.doctor_contact||'').trim()||null,review_type:reviewForm.review_type,order_mode:reviewForm.order_mode,effective_from:effectiveAt.toISOString(),clinical_notes:String(reviewForm.clinical_notes||'').trim()||null,prescription_storage_path:uploaded.path,prescription_document_name:uploaded.name,received_by_name:reviewForm.order_mode==='Written Prescription'?null:String(reviewForm.received_by_name||'').trim(),verbal_confirmation_status:reviewForm.order_mode==='Written Prescription'?'Not Required':'Pending',verbal_confirmation_due_at:reviewForm.order_mode==='Written Prescription'?null:new Date(reviewForm.confirmation_due_at).toISOString()};
        const toChange=(row,effectiveLocal)=>({
          action:row.action,original_order_id:row.original_order_id||null,medicine_name:row.medicine_name,strength:row.strength,dose:row.strength,frequency:row.frequency,route:row.route,
          scheduled_times:parseTimes(row.times),food_instruction:row.food_instruction||null,duration:row.duration||'Long Term',duration_days:row.duration==='Custom'?Number(row.custom_duration_days||0):null,
          start_date:String(effectiveLocal).slice(0,10),end_date:durationEndDate(row,effectiveLocal),special_instruction:row.special_instruction||null,change_note:row.change_note||null
        });
        // Group the changed medicines by their start / stop time. Each group is applied as its own doctor-review record
        // (same doctor, same prescription document), because the database applies one effective time per review.
        // With one common time this sends exactly the same single request as before.
        const groupMap=new Map();
        for(const row of changed){
          const local=rowEffectiveValue(row);const iso=new Date(local).toISOString();
          if(!groupMap.has(iso))groupMap.set(iso,{iso,local,rows:[]});
          groupMap.get(iso).rows.push(row);
        }
        const groups=[...groupMap.values()].sort((a,b)=>a.iso.localeCompare(b.iso));
        const continueRows=reviewForm.changes.filter(row=>row.action==='Continue');
        const applied=[];
        for(let g=0;g<groups.length;g++){
          const group=groups[g];
          const groupChanges=[...(g===0?continueRows.map(row=>toChange(row,group.local)):[]),...group.rows.map(row=>toChange(row,group.local))];
          const partNote=groups.length>1?`[Part ${g+1} of ${groups.length} of this doctor review — changes effective ${fmt(group.iso)}]`:'';
          const notes=[String(reviewForm.clinical_notes||'').trim(),partNote].filter(Boolean).join('\n')||null;
          const payload={...reviewPayloadBase,effective_from:group.iso,clinical_notes:notes};
          const rpc=await client.rpc('apply_medication_review',{p_review:payload,p_changes:groupChanges,p_user_id:user?.id||profile?.auth_user_id||profile?.id});
          if(rpc.error){
            if(applied.length){
              const done=applied.map(x=>x.rows.map(r=>r.medicine_name).join(', ')).join('; ');
              const pending=groups.slice(g).map(x=>x.rows.map(r=>r.medicine_name).join(', ')).join('; ');
              rpc.error.partial=true;
              rpc.error.message=`Saved: ${done}. NOT saved: ${pending} (${rpc.error.message}). Open Doctor Review again and apply only the medicines not saved.`;
            }
            throw rpc.error;
          }
          applied.push(group);
        }
        if(uploaded.path){
          const doc=await client.from('patient_documents').insert({patient_id:reviewForm.patient_id,document_type:'Medication Review Prescription',document_name:uploaded.name||'Doctor prescription',storage_path:uploaded.path,mime_type:reviewFile?.type||null,file_size:reviewFile?.size||null,remarks:`Doctor medication review · ${reviewForm.doctor_name} · effective ${reviewForm.effective_from}`,uploaded_by:user?.id||profile?.id,is_verified:true});
          if(doc.error)console.warn('Medication review document index failed:',doc.error.message);
        }
        await client.from('audit_log').insert({user_id:user?.id||profile?.id,action:'MEDICATION_REVIEW_APPLIED',entity:'patients',entity_id:reviewForm.patient_id,details:{doctor:reviewForm.doctor_name,order_mode:reviewForm.order_mode,effective_from:effectiveAt.toISOString(),changed_items:changed.length,effective_groups:groups.map(x=>({effective_from:x.iso,medicines:x.rows.map(r=>`${r.action}: ${r.medicine_name}`)}))}});
        showSamaraActionToast('success','Medication review applied','Current medication has been updated without overwriting the previous prescription or MAR history.');
        setReviewOpen(false);setReviewFile(null);setTab('Prescription History');await load();
      }catch(error){
        // Keep the uploaded prescription when part of the review was already saved (those saved reviews point to it).
        if(uploaded?.path&&!error?.partial)try{await client.storage.from('patient-documents').remove([uploaded.path]);}catch(_error){}
        const text=error?.message||'Unable to apply medication review.';setReviewMessage(text);showSamaraActionToast('error',error?.partial?'Medication review partly applied':'Medication review failed',text);
        if(error?.partial){setReviewOpen(false);setReviewFile(null);setTab('Prescription History');await load();}
      }finally{setReviewBusy(false);}
    }
    async function confirmVerbalReview(review){
      const note=prompt('Written confirmation received. Enter confirmation note / prescription reference:')||'';
      if(!note.trim())return;
      const {data:{user}}=await client.auth.getUser();
      const {error}=await client.from('medication_reviews').update({verbal_confirmation_status:'Confirmed',verbal_confirmed_at:new Date().toISOString(),verbal_confirmed_by:user?.id||profile?.id,verbal_confirmation_note:note.trim()}).eq('id',review.id);
      if(error)return showSamaraActionToast('error','Confirmation failed',error.message);
      showSamaraActionToast('success','Order confirmed','Written confirmation has been recorded.');load();
    }
    function patientFor(order){return state.patients.find(p=>p.id===order.patient_id)||{};}
    function admissionBoundaryForPatient(patient){
      if(!patient||String(patient.admission_date||'').slice(0,10)!==today)return null;
      // Do not let an ordinary same-day patient edit redefine admission time.
      // created_at is preferred for a first admission; updated_at is retained
      // only as a re-admission fallback when the patient record is older.
      const explicit=[patient.admission_datetime,patient.admission_timestamp,patient.admitted_at,patient.admission_time?`${patient.admission_date}T${String(patient.admission_time).slice(0,5)}:00`:null].filter(Boolean);
      const createdDate=String(patient.created_at||'').slice(0,10);
      const fallback=createdDate===today?[patient.created_at]:[patient.updated_at,patient.created_at];
      const candidates=[...explicit,...fallback].filter(Boolean);
      for(const value of candidates){
        const stamp=new Date(value);
        if(Number.isNaN(stamp.getTime()))continue;
        const localDate=`${stamp.getFullYear()}-${String(stamp.getMonth()+1).padStart(2,'0')}-${String(stamp.getDate()).padStart(2,'0')}`;
        if(localDate!==today)continue;
        const boundary=new Date(`${today}T${String(stamp.getHours()).padStart(2,'0')}:${String(stamp.getMinutes()).padStart(2,'0')}:${String(stamp.getSeconds()).padStart(2,'0')}`);
        if(!Number.isNaN(boundary.getTime()))return boundary;
      }
      return null;
    }
    function doseWasBeforeAdmission(order,time){
      const boundary=admissionBoundaryForPatient(patientFor(order));
      if(!boundary)return false;
      const normalized=normalizeMedicationTime(time);
      const due=new Date(`${today}T${normalized}:00`);
      return !Number.isNaN(due.getTime())&&due.getTime()<boundary.getTime();
    }
    function patientLabel(order){
      const p=patientFor(order);
      const name=formalName(p)||p.full_name||'Patient';
      const room=p.room_no?`Room ${p.room_no}${p.bed_no?`-${p.bed_no}`:''}`:'Room not assigned';
      return `${name} · ${p.patient_id||'No ID'} · ${room}`;
    }
    function medicineLabel(order){return [order.medicine_name,order.strength||order.dose].filter(Boolean).join(' ');}
    function marFor(order){return state.mar.filter(x=>x.order_id===order.id);}
    function latestMar(order){return [...marFor(order)].sort((a,b)=>String(b.administered_at||b.created_at||'').localeCompare(String(a.administered_at||a.created_at||'')))[0];}
    function doseStatus(order,time,dateISO=today){
      return state.mar.find(x=>x.order_id===order.id&&String(x.scheduled_date||'').slice(0,10)===dateISO&&String(x.scheduled_time||'').slice(0,5)===String(time||'').slice(0,5));
    }
    function firstPendingTime(order){
      const times=parseTimes(order.scheduled_times).filter(time=>!doseWasBeforeAdmission(order,time));
      if(times.length){
        const pending=times.find(time=>!doseStatus(order,time));
        return pending||'';
      }
      return normalizeMedicationTime(`${String(new Date().getHours()).padStart(2,'0')}:00`);
    }
    function openMar(order,time=''){
      const p=patientFor(order);if(!p.id||p.is_active===false||p.admission_status==='Discharged'||order.discharge_closed_at){showSamaraActionToast('error','Patient discharged','Current administration is unavailable. Pre-departure records are retained for management review.');return}
      const scheduled=time||firstPendingTime(order);
      if(!scheduled){
        showSamaraActionToast('success','Already recorded','All scheduled doses for this prescription have already been recorded today.');
        return;
      }
      const existing=doseStatus(order,scheduled);
      if(existing&&isFrontlineClinical){
        showSamaraActionToast('success','Dose already recorded',`${medicineLabel(order)} at ${medicationTimeLabel(scheduled)} is already recorded as ${existing.status||'completed'}.`);
        return;
      }
      setMarTarget(order);
      setMarForm({
        scheduled_time:scheduled,
        status:existing?.status||'Given',
        administered_at:existing?.administered_at?localDateTimeValue(new Date(existing.administered_at)):localDateTimeValue(),
        remarks:existing?.remarks||'',
        late_entry_reason:existing?.late_entry_reason||'',
        late_entry_justification:existing?.late_entry_justification||'',
        reschedule:false,rescheduled_time:'',
        withhold_reason:'',withhold_reading:'',
        doctor_informed_name:String(p.treating_doctor||'').trim(),doctor_informed_via:'Phone call',doctor_informed_at:localDateTimeValue(),
        sugar_reading:'',units_given:''
      });
      setMarMessage('');
    }
    function closeMar(){if(!marBusy){setMarTarget(null);setMarMessage('');}}
    async function saveMar(e){
      e.preventDefault();
      setMarMessage('');
      if(!marTarget)return;
      const fresh=await client.from('patients').select('is_active,admission_status').eq('id',marTarget.patient_id).single();
      if(fresh.error||!fresh.data||fresh.data.is_active===false||fresh.data.admission_status==='Discharged'){setMarMessage('Patient is discharged or status could not be verified. Refresh the medication list.');await load();return}
      if(!marForm.scheduled_time){const text='Please select the scheduled medicine time.';setMarMessage(text);showSamaraActionToast('error','Cannot save medication',text);return;}
      if(marForm.status==='Withheld'){
        const need=(ok,text)=>{if(ok)return false;setMarMessage(text);showSamaraActionToast('error','Cannot withhold medicine',text);return true;};
        if(need(marForm.withhold_reason,'Select the reason for withholding this dose.'))return;
        if(need(String(marForm.withhold_reading||'').trim(),'Enter the reading / observation that led to withholding (e.g. BP 90/58 mmHg).'))return;
        if(need(String(marForm.doctor_informed_name||'').trim(),'Enter the name of the treating doctor who was / will be informed.'))return;
        if(need(marForm.doctor_informed_via,'Select how the doctor was informed.'))return;
      }
      // 2.18.60: sliding-scale / sugar-based insulin — the nurse records the sugar reading and the units actually given
      const variableDose=marIsVariableDose(marTarget)&&marForm.status==='Given';
      if(variableDose&&(!String(marForm.sugar_reading||'').trim()||!String(marForm.units_given||'').trim())){
        const text='Enter the blood sugar reading and the units given for this sliding-scale insulin.';setMarMessage(text);showSamaraActionToast('error','Cannot save medication',text);return;
      }
      if(['Refused','Missed','Delayed'].includes(marForm.status)&&!String(marForm.remarks||'').trim()){
        const text=`Please enter the reason for medicine status “${marForm.status}”.`;setMarMessage(text);showSamaraActionToast('error','Cannot save medication',text);return;
      }
      const canReschedule=MEDICATION_RESCHEDULE_STATUSES.includes(marForm.status)&&marForm.reschedule;
      if(canReschedule&&!marForm.rescheduled_time){const text='Please select the re-medication time.';setMarMessage(text);showSamaraActionToast('error','Cannot reschedule medication',text);return;}
      if(canReschedule){const gap=medicationRescheduleGapMinutes(marForm.scheduled_time,marForm.rescheduled_time);if(!(gap>=15&&gap<=12*60)){const text='Re-medication time must be 15 minutes to 12 hours after the original dose time (it may be after midnight).';setMarMessage(text);showSamaraActionToast('error','Cannot reschedule medication',text);return;}}
      const entryTime=new Date();
      const administrationTime=marForm.administered_at?new Date(marForm.administered_at):entryTime;
      if(Number.isNaN(administrationTime.getTime())){const text='Please enter a valid administration time.';setMarMessage(text);showSamaraActionToast('error','Cannot save medication',text);return;}
      if(administrationTime.getTime()>entryTime.getTime()+5*60*1000){const text='Administration time cannot be in the future.';setMarMessage(text);showSamaraActionToast('error','Cannot save medication',text);return;}
      const entryDelayMinutes=Math.max(0,Math.round((entryTime.getTime()-administrationTime.getTime())/60000));
      const isLateEntry=entryDelayMinutes>30;
      if(isLateEntry&&!String(marForm.late_entry_reason||'').trim()){
        const text='This is a late entry. Please select a justification category.';setMarMessage(text);showSamaraActionToast('error','Cannot save medication',text);return;
      }
      if(isLateEntry&&!String(marForm.late_entry_justification||'').trim()){
        const text='Please enter a detailed justification for the late entry.';setMarMessage(text);showSamaraActionToast('error','Cannot save medication',text);return;
      }
      const alreadyRecorded=doseStatus(marTarget,marForm.scheduled_time);
      if(alreadyRecorded&&isFrontlineClinical){
        const text=`This dose has already been recorded as ${alreadyRecorded.status||'completed'}. It cannot be administered twice.`;
        setMarMessage(text);showSamaraActionToast('success','Dose already recorded',text);return;
      }
      setMarBusy(true);
      const {data:{user}}=await client.auth.getUser();
      const payload={
        order_id:marTarget.id,
        patient_id:marTarget.patient_id,
        scheduled_date:today,
        scheduled_time:normalizeMedicationTime(marForm.scheduled_time),
        status:marForm.status,
        administered_at:administrationTime.toISOString(),
        administered_by:user?.id||profile?.auth_user_id||profile?.id,
        remarks:variableDose?[`Blood sugar ${String(marForm.sugar_reading).trim()} mg/dL · ${String(marForm.units_given).trim()} units given`,String(marForm.remarks||'').trim()].filter(Boolean).join(' · '):String(marForm.remarks||'').trim(),
        entry_recorded_at:entryTime.toISOString(),
        late_entry:isLateEntry,
        entry_delay_minutes:entryDelayMinutes,
        late_entry_reason:isLateEntry?String(marForm.late_entry_reason||'').trim():null,
        late_entry_justification:isLateEntry?String(marForm.late_entry_justification||'').trim():null,
        rescheduled_time:canReschedule?normalizeMedicationTime(marForm.rescheduled_time):null,
        reschedule_reason:canReschedule?String(marForm.remarks||'').trim():null,
        ...(marForm.status==='Withheld'?{
          withhold_reason:marForm.withhold_reason,
          withhold_reading:String(marForm.withhold_reading||'').trim(),
          doctor_informed_name:String(marForm.doctor_informed_name||'').trim(),
          doctor_informed_via:marForm.doctor_informed_via,
          doctor_informed_at:marForm.doctor_informed_via==='Not reachable yet — will retry'?null:(marForm.doctor_informed_at?new Date(marForm.doctor_informed_at).toISOString():new Date().toISOString())
        }:{})
      };
      const {error}=await client.from('medication_administrations').insert(payload);
      if(error&&marForm.status==='Withheld'&&/withhold_|doctor_informed|column/i.test(error.message||'')){const text='Withholding needs the database update SQL 167. Please ask Admin to run it, then try again.';setMarMessage(text);showSamaraActionToast('error','Medication save failed',text);setMarBusy(false);return;}
      if(error){const text=error.message||'Unable to save the Medication Administration Record.';setMarMessage(text);showSamaraActionToast('error','Medication save failed',text);setMarBusy(false);return;}
      if(marForm.status==='Withheld')showSamaraActionToast('success','Dose withheld','Recorded. Nursing Manager and Admin are alerted. Record the doctor\'s instruction as soon as it is received.');
      else showSamaraActionToast('success','Medication saved','Medication administration has been recorded successfully.');setMarBusy(false);setTab('Today’s MAR');await load();
      finishSuccessfulAction({
        close:()=>setMarTarget(null),
        returnPage,
        onNavigate
      });
    }

    async function load(){
      setState(current=>({...current,loading:true,error:''}));
      const [ordersResult,marResult,patientsResult,reviewsResult,reviewItemsResult,vitalsResult]=await Promise.all([
        client.from('medication_orders').select('*').order('created_at',{ascending:false}),
        client.from('medication_administrations').select('*').order('scheduled_date',{ascending:false}).order('scheduled_time',{ascending:false}).limit(1000),
        client.from('patients').select('*').order('full_name'),
        client.from('medication_reviews').select('*').order('reviewed_at',{ascending:false}).limit(500),
        client.from('medication_review_items').select('*').order('created_at',{ascending:false}).limit(2000),
        client.from('vital_signs').select('patient_id,systolic,diastolic,pulse,blood_sugar,blood_sugar_type,recorded_at').gte('recorded_at',new Date(Date.now()-12*3600*1000).toISOString()).order('recorded_at',{ascending:false}).limit(1000)
      ]);
      const errors=[ordersResult.error,marResult.error,patientsResult.error].filter(Boolean);
      const reviewSetupError=[reviewsResult.error,reviewItemsResult.error].filter(Boolean).map(e=>e.message).join(' | ');
      setState({loading:false,orders:ordersResult.data||[],mar:marResult.data||[],patients:patientsResult.data||[],reviews:reviewsResult.data||[],reviewItems:reviewItemsResult.data||[],vitals:vitalsResult?.error?[]:(vitalsResult?.data||[]),error:errors.map(e=>e.message).join(' | '),reviewSetupError});
    }
    React.useEffect(()=>{
      load();
      const timer=setInterval(load,30000);window.addEventListener('focus',load);
      const ch=client.channel('medicines-register-live')
        .on('postgres_changes',{event:'*',schema:'public',table:'patients'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'patient_discharges'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'medication_orders'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'medication_administrations'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'medication_reviews'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'medication_review_items'},load)
        .subscribe();
      return()=>{clearInterval(timer);window.removeEventListener('focus',load);client.removeChannel(ch)};
    },[]);

    React.useEffect(()=>{
      if(state.loading||taskNavigationHandled.current)return;
      const context=readTaskNavigationContext('Medicines');
      if(!context)return;
      taskNavigationHandled.current=true;
      setReturnPage(context.return_page||'');
      setPatientFilter(context.patient_id||'');
      if(context.doctor_review){
        setTab('Prescription History');
        openMedicationReview(context.patient_id||'');
        clearTaskNavigationContext();
        return;
      }
      setTab('Today’s MAR');
      const target=state.orders.find(order=>order.id===context.order_id)
        ||state.orders.find(order=>order.patient_id===context.patient_id);
      if(target){
        openMar(target,context.scheduled_time||'');
        setMarForm(current=>({...current,status:context.status||current.status}));
      }
      clearTaskNavigationContext();
    },[state.loading,state.orders]);

    function dateInSelectedPeriod(value){
      const period=appliedMedicationFilter.period||'All';
      let from=appliedMedicationFilter.from||'',to=appliedMedicationFilter.to||'';
      if(!value)return period==='All'&&!from&&!to;
      const day=String(value).slice(0,10);
      if(period!=='All'){
        const end=today;
        const days=period==='Today'?0:period==='7 Days'?6:period==='30 Days'?29:null;
        // 2.14.68: date arithmetic in plain ISO dates (no IST→UTC shift of one day)
        if(days!==null){from=addDaysISODate(today,-days);to=end;}
      }
      if(from&&day<from)return false;
      if(to&&day>to)return false;
      return true;
    }
    function orderDate(order){return order.effective_from||order.start_date||order.created_at||'';}
    const activeOrders=state.orders.filter(o=>orderActive(o)||orderUpcoming(o));
    const todayRows=[];
    state.orders.forEach(order=>parseTimes(order.scheduled_times).forEach(time=>{
      const patient=patientFor(order);if(!patient.id||patient.is_active===false||patient.admission_status==='Discharged')return;
      if(!medicationOrderDoseEligible(order,today,time))return;
      if(doseWasBeforeAdmission(order,time))return;
      todayRows.push({order,time,date:today,log:doseStatus(order,time,today)});
    }));
    // A refused dose may be explicitly rescheduled. Keep the original refusal in MAR,
    // and expose the new time as a separate actionable dose for the same patient/order.
    state.mar.filter(log=>log.rescheduled_time&&rescheduledDoseDate(log)===today).forEach(log=>{
      const order=state.orders.find(item=>item.id===log.order_id);
      if(!order)return;
      const time=normalizeMedicationTime(log.rescheduled_time).slice(0,5);
      if(!time||todayRows.some(item=>item.order.id===order.id&&normalizeMedicationTime(item.time)===time))return;
      const patient=patientFor(order);if(!patient.id||patient.is_active===false||patient.admission_status==='Discharged')return;
      todayRows.push({order,time,date:today,log:doseStatus(order,time,today),rescheduledFrom:normalizeMedicationTime(log.scheduled_time)});
    });
    const completedOrders=state.orders.filter(o=>String(o.status||'').toLowerCase()==='completed'||(o.end_date&&o.end_date<today&&o.is_active!==false));
    const discontinuedOrders=state.orders.filter(o=>!stopIsScheduled(o)&&(o.is_active===false||['discontinued','stopped','inactive'].includes(String(o.status||'').toLowerCase())));
    const patientMatches=item=>!patientFilter||(item.order||item).patient_id===patientFilter;
    const filtered=rows=>rows.filter(patientMatches);
    const periodOrders=rows=>filtered(rows).filter(order=>dateInSelectedPeriod(orderDate(order)));
    const visibleActive=filtered(activeOrders);
    // 2.18.60: Today's MAR is always today (grouped by dose time); past doses are in Medication History.
    // The Period filter now applies only to the prescription lists (Prescription History tab).
    const visibleHistory=periodOrders(state.orders);
    const visibleCompleted=periodOrders(completedOrders);
    const visibleDiscontinued=periodOrders(discontinuedOrders);
    const historyCount=visibleHistory.length;
    const tabs=[['Today’s MAR',filtered(todayRows).length],['Active Prescriptions',visibleActive.length],['Medication History',null],['Prescription History',historyCount]];

    function scheduledDoseDate(time,dateISO=today){
      const raw=String(time||'').slice(0,8);
      if(!raw)return null;
      const d=new Date(`${dateISO}T${raw.length===5?raw+':00':raw}`);
      return Number.isNaN(d.getTime())?null:d;
    }
    function pendingDoseState(item){
      if(item.log&&item.log.status==='Withheld')return {status:medicationWithholdOpen(item.log)?'Withheld · awaiting doctor':'Withheld',audit:[item.log.withhold_reason,item.log.withhold_reading,item.log.doctor_instruction?`Dr: ${item.log.doctor_instruction}`:'Doctor\'s instruction pending'].filter(Boolean).join(' · '),minutes:0};
      if(item.log)return {status:item.log.status||'Recorded',audit:item.log.late_entry?`Late entry (${item.log.entry_delay_minutes||0} min) · ${item.log.late_entry_reason||'Justification recorded'}`:'On-time entry',minutes:0};
      const due=scheduledDoseDate(item.time,item.date||today);if(!due)return {status:'Pending',audit:'Not recorded',minutes:0};
      const minutes=Math.floor((Date.now()-due.getTime())/60000);
      if((item.date||today)<today)return {status:'Not Recorded',audit:'No administration record for this scheduled dose',minutes};
      if(minutes>=60)return {status:'Critical Pending',audit:`Not recorded · ${minutes} min overdue`,minutes};
      if(minutes>=30)return {status:'Escalated',audit:`Not recorded · ${minutes} min overdue`,minutes};
      if(minutes>=15)return {status:'Overdue',audit:`Not recorded · ${minutes} min overdue`,minutes};
      if(minutes>=0)return {status:'Due Now',audit:minutes?`Not recorded · ${minutes} min overdue`:'Not recorded',minutes};
      return {status:'Upcoming',audit:'Not due yet',minutes};
    }

    const prescriptionRows=orders=>filtered(orders).map(order=>{
      const pendingTime=firstPendingTime(order);
      const eligibleTimes=parseTimes(order.scheduled_times).filter(time=>!doseWasBeforeAdmission(order,time));
      const allTodayDone=eligibleTimes.length>0&&!pendingTime;
      // 2.14.74: Weekly / Monthly medicines — show the next due date and block administration on other days.
      const notDueToday=!orderUpcoming(order)&&!medicationOrderDueOnDate(order,today);
      const nextDue=notDueToday?medicationOrderNextDueDate(order,today):'';
      const frequencyCell=notDueToday?h('div',null,order.frequency||'—',h('small',{className:'badge',style:{display:'inline-block',marginTop:'4px'}},nextDue?`Next due ${formatDateIN(nextDue)}`:'Not due today')):(order.frequency||'—');
      return [
        patientLabel(order),orderUpcoming(order)?h('div',null,medicineLabel(order),h('small',{className:'badge',style:{display:'inline-block',marginTop:'4px'}},`Starts ${fmt(order.effective_from)}`)):stopIsScheduled(order)?h('div',null,medicineLabel(order),h('small',{className:'badge off',style:{display:'inline-block',marginTop:'4px'}},`Until ${fmt(order.stopped_at)} (doctor review)`)):medicineLabel(order),order.route||'—',frequencyCell,order.duration||'—',parseTimes(order.scheduled_times).map(medicationTimeLabel).join(', ')||'—',order.food_instruction||'—',h('div',null,order.special_instruction||order.special_instructions||'—',h(TamilAssist,{text:order.special_instruction||order.special_instructions,context:'Medication Special Instruction'})),latestMar(order)?.status||'No MAR yet',
        orderUpcoming(order)?h('button',{type:'button',className:'btn btn-secondary',disabled:true},'Starts later'):notDueToday?h('button',{type:'button',className:'btn btn-secondary',disabled:true},nextDue?`Next due ${formatDateIN(nextDue)}`:'Not due today'):h('button',{type:'button',className:`btn ${allTodayDone?'btn-secondary clinical-action-done':'btn-primary'}`,disabled:allTodayDone,onClick:()=>openMar(order,pendingTime)},allTodayDone?'Done Today ✓':'Administer')
      ];
    });
    const nurseExceptionStatuses=['missed','refused','delayed','not given','withheld','unavailable'];
    const nurseActionable=filtered(todayRows).filter(item=>{
      if(item.log)return false;
      const minutes=pendingDoseState(item).minutes;
      return minutes>=-30&&minutes<=30;
    }).sort((a,b)=>scheduledDoseDate(a.time)-scheduledDoseDate(b.time));
    const nurseMissed=filtered(todayRows).filter(item=>{
      if(item.log)return nurseExceptionStatuses.includes(String(item.log.status||'').toLowerCase());
      return pendingDoseState(item).minutes>30;
    }).sort((a,b)=>scheduledDoseDate(a.time)-scheduledDoseDate(b.time));
    const nurseCompleted=filtered(todayRows).filter(item=>item.log&&!nurseExceptionStatuses.includes(String(item.log.status||'').toLowerCase()));
    const nurseShiftUpcoming=filtered(todayRows).filter(item=>{
      if(item.log)return false;
      return shiftForTime(item.time)===currentShift()&&pendingDoseState(item).minutes<0;
    }).sort((a,b)=>scheduledDoseDate(a.time)-scheduledDoseDate(b.time));
    const nurseMedicationCards=h('div',{className:'nurse-medication-workspace'},
      h('div',{className:'nurse-priority-head'},
        h('div',null,h('h2',null,'Medicines Due Now'),h('small',null,'Only doses within 30 minutes before or after the scheduled time are shown here.')),
        h('div',{className:'actions'},
          h('button',{type:'button',className:showShiftMedication?'btn btn-primary':'btn btn-secondary',onClick:()=>setShowShiftMedication(value=>!value)},showShiftMedication?'Hide Shift Medication':`Medication for This Shift (${nurseShiftUpcoming.length})`),
          canReviseMedication&&h('button',{type:'button',className:'btn btn-primary',disabled:Boolean(state.reviewSetupError),onClick:()=>openMedicationReview(patientFilter)},'Doctor Review / Modify'),
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setShowHistoryMobile(true)},'Medication History'),
          h('button',{type:'button',className:'btn btn-secondary nurse-refresh',onClick:load},state.loading?'…':'Refresh')
        )
      ),
      patientFilter&&h('button',{type:'button',className:'nurse-clear-filter',onClick:()=>setPatientFilter('')},'× Show all patients'),
      showShiftMedication&&h('div',{className:'section-card',style:{marginBottom:'14px',padding:'14px'}},
        h('div',{className:'panel-head'},h('div',null,h('h3',{style:{margin:0}},'Upcoming Medication for This Shift'),h('small',null,`${currentShift()} · Not yet administered · All patients`)),h('span',{className:'badge'},`${nurseShiftUpcoming.length} upcoming`)),
        nurseShiftUpcoming.length?h('div',{className:'nurse-dose-list'},nurseShiftUpcoming.map(item=>{
          const p=patientFor(item.order);
          return h('div',{className:'nurse-dose-card upcoming',key:`shift-${item.order.id}-${item.time}`},
            h('div',{className:'nurse-dose-top'},h('strong',null,formalName(p)||p.full_name||'Patient'),h('span',{className:'nurse-room'},p.room_no?`Room ${p.room_no}${p.bed_no?`-${p.bed_no}`:''}`:'—')),
            h('div',{className:'nurse-medicine-name'},medicineLabel(item.order)),
            h('div',{className:'nurse-dose-meta'},h('span',null,medicationTimeLabel(item.time)),item.order.route&&h('span',null,item.order.route),item.order.food_instruction&&h('span',null,item.order.food_instruction)),
            h('div',{className:'nurse-dose-action'},h('span',{className:'nurse-dose-status'},'Upcoming this shift'))
          );
        })):h('div',{className:'nurse-all-done'},h('strong',null,'✓ No further medication in this shift'),h('span',null,'There are no future, unrecorded doses before this shift ends.'))
      ),
      nurseActionable.length?h('div',{className:'nurse-dose-list'},nurseActionable.map(item=>{
        const dose=pendingDoseState(item),p=patientFor(item.order),due=dose.minutes>=0;
        return h('div',{className:`nurse-dose-card ${due?'due':'upcoming'}`,key:`${item.order.id}-${item.time}`},
          h('div',{className:'nurse-dose-top'},h('strong',null,formalName(p)||p.full_name||'Patient'),h('span',{className:'nurse-room'},p.room_no?`Room ${p.room_no}${p.bed_no?`-${p.bed_no}`:''}`:'—')),
          h('div',{className:'nurse-medicine-name'},medicineLabel(item.order)),
          h('div',{className:'nurse-dose-meta'},h('span',null,medicationTimeLabel(item.time)),item.order.route&&h('span',null,item.order.route),item.order.food_instruction&&h('span',null,item.order.food_instruction)),
          h('div',{className:'nurse-dose-action'},h('span',{className:'nurse-dose-status'},due?'Due now':'Due shortly'),h('button',{type:'button',className:'btn btn-primary',onClick:()=>openMar(item.order,item.time)},'ADMINISTER'))
        );
      })):h('div',{className:'nurse-all-done'},h('strong',null,'✓ No medicine due now'),h('span',null,'Only medicines within the current ±30 minute administration window appear here.')),
      nurseMissed.length?h('details',{className:'nurse-secondary nurse-missed'},
        h('summary',null,`Missed / Overdue (${nurseMissed.length})`),
        h('div',{className:'nurse-missed-list'},nurseMissed.map(item=>{
          const p=patientFor(item.order),dose=pendingDoseState(item);
          const status=item.log?(item.log.status||'Exception'):`${dose.minutes} min overdue`;
          return h('div',{className:'nurse-missed-dose',key:`missed-${item.order.id}-${item.time}`},
            h('div',null,h('strong',null,`${formalName(p)||p.full_name||'Patient'} · ${medicineLabel(item.order)}`),h('small',null,`${medicationTimeLabel(item.time)} · ${status}`)),
            h('button',{type:'button',className:'btn btn-danger',onClick:()=>openMar(item.order,item.time)},item.log?'VIEW':'ATTEND')
          );
        }))
      ):null,
      h('details',{className:'nurse-secondary'},h('summary',null,`Completed today (${nurseCompleted.length})`),h('div',{className:'nurse-completed-list'},nurseCompleted.map(item=>h('div',{className:'nurse-completed-dose',key:`done-${item.order.id}-${item.time}`},h('span',null,`✓ ${patientFor(item.order).full_name||'Patient'} · ${medicineLabel(item.order)} · ${medicationTimeLabel(item.time)}`),h('button',{type:'button',disabled:true},'Recorded ✓'))))),
      h('details',{className:'nurse-secondary'},h('summary',null,'Prescription / history'),h('div',{className:'nurse-history-note'},'Prescription history is kept secondary for nursing use. Managers and Administrators retain the full register view.'))
    );

    // ── 2.18.60: TODAY'S MAR grouped by dose time ─────────────────────────────────────────────────────────
    // Round (dose time) → room → Guest once → one line per medicine. Finished rounds fold to one line, rounds
    // in the other shift fold too; overdue / due rounds stay open. "Give checked" records the ticked doses of one
    // Guest in one round as Given now (never sliding-scale insulin or a dose with a low-vitals warning).
    const roundKey=item=>`${item.order.id}|${normalizeMedicationTime(item.time)}`;
    const vitalsWarning=order=>medicationWithholdSuggestion(order,(state.vitals||[]).filter(v=>v.patient_id===order.patient_id));
    const marIsException=log=>nurseExceptionStatuses.includes(String(log?.status||'').toLowerCase());
    const marNeedsAttention=item=>item.log?medicationWithholdOpen(item.log):pendingDoseState(item).minutes>=15;
    const marBatchEligible=item=>!item.log&&pendingDoseState(item).minutes>=-30&&!marIsVariableDose(item.order)&&!vitalsWarning(item.order);
    const marRoundRows=filtered(todayRows);
    const marRooms=(()=>{const m=new Map();todayRows.forEach(x=>{const p=patientFor(x.order);if(p.id&&!m.has(p.id))m.set(p.id,p)});return [...m.values()].sort((a,b)=>String(a.room_no||'').localeCompare(String(b.room_no||''),'en',{numeric:true})||String(a.bed_no||'').localeCompare(String(b.bed_no||'')))})();
    const marCounts={total:marRoundRows.length,given:marRoundRows.filter(x=>x.log&&!marIsException(x.log)).length,
      attention:marRoundRows.filter(marNeedsAttention).length,
      due:marRoundRows.filter(x=>{if(x.log)return false;const m=pendingDoseState(x).minutes;return m>=-30&&m<15}).length,
      withheld:marRoundRows.filter(x=>x.log&&String(x.log.status)==='Withheld').length};
    const marSlots=(()=>{
      const rows=attentionOnly?marRoundRows.filter(marNeedsAttention):marRoundRows;
      const map=new Map();
      rows.forEach(x=>{const t=normalizeMedicationTime(x.time);if(!map.has(t))map.set(t,[]);map.get(t).push(x)});
      return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([time,items])=>{
        const attention=items.some(marNeedsAttention);
        const due=items.some(x=>!x.log&&pendingDoseState(x).minutes>=-30);
        const done=items.every(x=>x.log&&!medicationWithholdOpen(x.log));
        const inShift=shiftForTime(time)===currentShift();
        const state=attention?'attention':due?'due':done?'done':inShift?'later':'other';
        const guests=new Map();
        items.forEach(x=>{const p=patientFor(x.order);if(!guests.has(p.id))guests.set(p.id,{patient:p,items:[]});guests.get(p.id).items.push(x)});
        const guestList=[...guests.values()].sort((a,b)=>String(a.patient.room_no||'').localeCompare(String(b.patient.room_no||''),'en',{numeric:true}));
        guestList.forEach(g=>g.items.sort((a,b)=>medicineLabel(a.order).localeCompare(medicineLabel(b.order))));
        return {time,items,guests:guestList,state,inShift,
          given:items.filter(x=>x.log&&!marIsException(x.log)).length,
          open:slotOpen[time]!==undefined?slotOpen[time]:['attention','due','later'].includes(state)};
      });
    })();
    function jumpToNow(){
      const target=marSlots.find(s=>s.state==='attention'||s.state==='due')||marSlots.find(s=>s.state==='later');
      if(!target){showSamaraActionToast('success','No dose due now','All rounds so far are recorded.');return}
      setSlotOpen(cur=>({...cur,[target.time]:true}));
      setTimeout(()=>{try{document.getElementById(`mar-slot-${target.time.replace(':','')}`)?.scrollIntoView({behavior:'smooth',block:'start'})}catch(_){}},60);
    }
    function openWithhold(item){openMar(item.order,item.time);setMarForm(cur=>({...cur,status:'Withheld'}));}
    function openBatch(guest,slot){
      const items=guest.items.filter(x=>marBatchEligible(x)&&!uncheckedDoses[roundKey(x)]);
      if(!items.length)return;
      setBatchMessage('');setBatchTarget({patient:guest.patient,time:slot.time,items});
    }
    async function saveBatch(){
      if(!batchTarget||batchBusy)return;
      setBatchBusy(true);setBatchMessage('');
      try{
        const fresh=await client.from('patients').select('is_active,admission_status').eq('id',batchTarget.patient.id).single();
        if(fresh.error||!fresh.data||fresh.data.is_active===false||fresh.data.admission_status==='Discharged')throw new Error('The Guest is discharged or the status could not be checked. Press Refresh and try again.');
        const existing=await client.from('medication_administrations').select('order_id,scheduled_time').eq('scheduled_date',today).in('order_id',batchTarget.items.map(x=>x.order.id));
        if(existing.error)throw existing.error;
        const done=new Set((existing.data||[]).map(x=>`${x.order_id}|${normalizeMedicationTime(x.scheduled_time)}`));
        const todo=batchTarget.items.filter(x=>!done.has(roundKey(x)));
        const skipped=batchTarget.items.length-todo.length;
        if(!todo.length){showSamaraActionToast('success','Already recorded','These doses were already recorded (perhaps by another nurse).');setBatchTarget(null);await load();return}
        const {data:{user}}=await client.auth.getUser();
        const now=new Date().toISOString();
        const payloads=todo.map(x=>({order_id:x.order.id,patient_id:x.order.patient_id,scheduled_date:today,scheduled_time:normalizeMedicationTime(x.time),status:'Given',
          administered_at:now,administered_by:user?.id||profile?.auth_user_id||profile?.id,remarks:'',entry_recorded_at:now,late_entry:false,entry_delay_minutes:0,
          late_entry_reason:null,late_entry_justification:null,rescheduled_time:null,reschedule_reason:null}));
        const {error}=await client.from('medication_administrations').insert(payloads);
        if(error)throw error;
        try{writeAuditEvent('Medication round recorded (Give checked)','Medication',batchTarget.patient.id,{round:batchTarget.time,doses:todo.length,medicines:todo.map(x=>medicineLabel(x.order))})}catch(_){}
        showSamaraActionToast('success',`${todo.length} dose${todo.length>1?'s':''} recorded as Given`,`${formalName(batchTarget.patient)||batchTarget.patient.full_name||'Guest'} · ${medicationTimeLabel(batchTarget.time)} round${skipped?` · ${skipped} already recorded, skipped`:''}.`);
        setBatchTarget(null);
        setUncheckedDoses(cur=>{const next={...cur};batchTarget.items.forEach(x=>delete next[roundKey(x)]);return next});
        await load();
      }catch(e){const text=e?.message||'Unable to save. Please try again.';setBatchMessage(text);showSamaraActionToast('error','Medication save failed',text)}
      finally{setBatchBusy(false)}
    }
    const marDoseLine=(item,slot)=>{
      const dose=pendingDoseState(item),log=item.log,key=roundKey(item);
      const variable=marIsVariableDose(item.order),warn=!log&&dose.minutes>=-30?vitalsWarning(item.order):null;
      const eligible=marBatchEligible(item);
      const rt=log?.rescheduled_time?normalizeMedicationTime(log.rescheduled_time).slice(0,5):'';
      const reschedulePending=rt&&rescheduledDoseDate(log)===today&&!doseStatus(item.order,rt,today);
      const tone=log?(String(log.status)==='Given'?'ok':String(log.status)==='Withheld'?'held':'warn'):dose.minutes>=60?'held':dose.minutes>=15?'warn':dose.minutes>=-30?'due':'later';
      const statusText=log?(String(log.status)==='Withheld'?(medicationWithholdOpen(log)?'Withheld · awaiting doctor':'Withheld'):(log.status||'Recorded')):dose.status;
      return h('div',{key,className:`mar-line ${log?'recorded':''}`,onClick:log?()=>setDoseDetail(item):undefined,role:log?'button':undefined,title:log?'Show full details':undefined},
        h('div',{className:'mar-line-left'},
          eligible?h('input',{type:'checkbox','aria-label':`Include ${medicineLabel(item.order)}`,checked:!uncheckedDoses[key],onClick:e=>e.stopPropagation(),onChange:e=>setUncheckedDoses(cur=>({...cur,[key]:!e.target.checked}))}):h('span',{className:'mar-check-space'}),
          h('div',{className:'mar-med'},
            h('span',{className:'mar-med-name'},medicineLabel(item.order)),
            h('small',null,[item.order.route,item.order.food_instruction].filter(Boolean).join(' · ')),
            variable&&h('small',{className:'mar-flag'},'Sliding scale — check sugar first'),
            item.rescheduledFrom&&h('small',{className:'mar-flag'},`Rescheduled dose (was ${medicationTimeLabel(item.rescheduledFrom)})`),
            warn&&h('small',{className:'mar-flag danger'},`Check before giving: ${warn.reading}`))),
        h('div',{className:'mar-line-right'},
          h('span',{className:`mar-chip ${tone}`},statusText),
          log?.administered_at&&h('span',{className:'mar-when'},formatTimeIN(log.administered_at)),
          log?.late_entry&&h('span',{className:'mar-chip warn'},'Late entry'),
          (log?.remarks||log?.withhold_reason)&&h('span',{className:'mar-when',title:[log.withhold_reason,log.withhold_reading,log.remarks].filter(Boolean).join(' · ')},'📝'),
          reschedulePending&&h('button',{type:'button',className:'btn btn-primary mar-btn',onClick:e=>{e.stopPropagation();openMar(item.order,rt)}},`Give at ${medicationTimeLabel(rt)}`),
          log&&medicationWithholdOpen(log)&&canReviseMedication&&h('button',{type:'button',className:'btn btn-primary mar-btn',onClick:e=>{e.stopPropagation();openInstruction(log)}},"Doctor's instruction"),
          !log&&dose.minutes>=-30&&h('button',{type:'button',className:'btn btn-secondary mar-btn',onClick:()=>openWithhold(item)},'Withhold'),
          !log&&h('button',{type:'button',className:`btn ${dose.minutes>=15?'btn-danger':dose.minutes>=-30?'btn-primary':'btn-secondary'} mar-btn`,onClick:()=>openMar(item.order,item.time)},variable?'Record (sugar + units)':'Record')));
    };
    const marGuestBlock=(guest,slot)=>{
      const p=guest.patient;
      const ready=guest.items.filter(x=>marBatchEligible(x)&&!uncheckedDoses[roundKey(x)]);
      return h('div',{key:p.id||'guest',className:'mar-guest'},
        h('div',{className:'mar-guest-head'},
          h('span',{className:'mar-room'},p.room_no?`${p.room_no}${p.bed_no?`-${p.bed_no}`:''}`:'—'),
          h('span',{className:'mar-guest-name'},formalName(p)||p.full_name||'Guest'),
          h('small',null,p.patient_id||''),
          ready.length>0&&h('button',{type:'button',className:'btn btn-primary mar-btn mar-batch',onClick:()=>openBatch(guest,slot)},`Give checked (${ready.length})`)),
        guest.items.map(item=>marDoseLine(item,slot)));
    };
    const MAR_ROUND_CSS=`.mar-rounds{margin-top:4px}.mar-top{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 10px}.mar-top .mar-title{font-weight:800;font-size:16px;color:#321d28;margin-right:6px}
.mar-pill{border:1px solid #e7c3d4;background:#fff;border-radius:999px;padding:4px 12px;font-size:13px;font-weight:800;cursor:pointer;color:#5d1039}.mar-pill.on{background:#b20b5d;border-color:#b20b5d;color:#fff}.mar-pill.danger{border-color:#f0b4b4;color:#b42318;background:#fff7f7}.mar-pill.danger.on{background:#b42318;color:#fff}.mar-pill.ok{border-color:#bfe5cf;color:#0a7a42;background:#f3fbf6;cursor:default}.mar-pill.due{border-color:#f2d48b;color:#8a5a00;background:#fffaf0;cursor:default}
.mar-rooms{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}.mar-rooms .mar-pill{font-weight:700;padding:3px 10px}
.mar-slot{border:1px solid #ecd3df;border-radius:12px;margin:0 0 8px;background:#fff;overflow:hidden;scroll-margin-top:90px}.mar-slot.attention{border:2px solid #e8a0a0}.mar-slot.due{border:2px solid #f0c75e}
.mar-slot-head{width:100%;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;justify-content:space-between;padding:9px 12px;background:#fbeef4;border:0;cursor:pointer;text-align:left;font:inherit;color:#5d1039}.mar-slot.attention .mar-slot-head{background:#fdecec;color:#8f1d1d}.mar-slot.due .mar-slot-head{background:#fff4dd;color:#7a4e00}.mar-slot.done .mar-slot-head,.mar-slot.other .mar-slot-head{background:#faf6f8;color:#6d5963}
.mar-slot-head b{font-size:16px}.mar-slot-head .mar-chev{display:inline-block;transition:transform .15s;margin-right:6px}.mar-slot-head.open .mar-chev{transform:rotate(90deg)}.mar-slot-head small{font-weight:700;font-size:12.5px}
.mar-guest{padding:6px 12px 4px;border-top:1px solid #f3e3ea}.mar-guest-head{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin:2px 0 4px}.mar-room{font-size:19px;font-weight:900;color:#b20b5d}.mar-guest-name{font-weight:800;color:#321d28;font-size:14.5px}.mar-guest-head small{color:#7b6670}.mar-guest-head .mar-batch{margin-left:auto}
.mar-line{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:6px 6px 6px 4px;border-radius:8px}.mar-line.recorded{cursor:pointer}.mar-line.recorded:hover{background:#fff4f9}.mar-line-left{display:flex;gap:10px;align-items:center;min-width:0;flex:1 1 auto}.mar-line-left input[type=checkbox]{width:20px;height:20px;flex:0 0 20px;accent-color:#b20b5d}.mar-check-space{width:20px;flex:0 0 20px}
.mar-med{display:flex;flex-direction:column;min-width:0}.mar-med-name{font-weight:700;color:#321d28;font-size:14px;overflow-wrap:anywhere}.mar-med small{color:#7b6670;font-size:12px}.mar-med small.mar-flag{color:#8a5a00;font-weight:800}.mar-med small.mar-flag.danger{color:#b42318}
.mar-line-right{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.mar-chip{font-size:11.5px;font-weight:800;padding:2px 8px;border-radius:10px;white-space:nowrap}.mar-chip.ok{background:#e8f6ee;color:#0a7a42}.mar-chip.warn{background:#fff4dd;color:#8a5a00}.mar-chip.held{background:#fdecec;color:#b42318}.mar-chip.due{background:#fff4dd;color:#7a4e00}.mar-chip.later{background:#f2ecef;color:#6d5963}.mar-when{font-size:12.5px;color:#6d5963;white-space:nowrap}
.mar-btn{min-height:32px!important;padding:4px 12px!important;font-size:13px!important}
@media(max-width:700px){.mar-line{flex-direction:column;align-items:stretch}.mar-line-right{justify-content:flex-start;padding-left:30px}.mar-guest-head .mar-batch{margin-left:0;width:100%}}`;
    const marTodayView=h('div',{className:'card panel mar-rounds'},h('style',null,MAR_ROUND_CSS),
      h('div',{className:'mar-top'},
        h('span',{className:'mar-title'},`Today · ${formatDateIN(today)} · ${currentShift()}`),
        h('button',{type:'button',className:`mar-pill danger ${attentionOnly?'on':''}`,title:'Show only overdue doses and withheld doses awaiting the doctor',onClick:()=>setAttentionOnly(v=>!v)},`Overdue / attention ${marCounts.attention}`),
        h('span',{className:'mar-pill due'},`Due now ${marCounts.due}`),
        h('span',{className:'mar-pill ok'},`Given ${marCounts.given} / ${marCounts.total}`),
        marCounts.withheld>0&&h('span',{className:'mar-pill danger'},`Withheld ${marCounts.withheld}`),
        h('span',{style:{flex:'1 1 auto'}}),
        h('button',{type:'button',className:'btn btn-secondary mar-btn',onClick:jumpToNow},'Jump to now'),
        h('button',{type:'button',className:'btn btn-secondary mar-btn',onClick:()=>{const all=marSlots.every(s=>s.open);const next={};marSlots.forEach(s=>{next[s.time]=!all});setSlotOpen(next)}},marSlots.length&&marSlots.every(s=>s.open)?'Fold all':'Open all')),
      marRooms.length>1&&h('div',{className:'mar-rooms'},
        h('button',{type:'button',className:`mar-pill ${!patientFilter?'on':''}`,onClick:()=>setPatientFilter('')},'All rooms'),
        marRooms.map(p=>h('button',{type:'button',key:p.id,className:`mar-pill ${patientFilter===p.id?'on':''}`,title:formalName(p)||p.full_name||'',onClick:()=>setPatientFilter(patientFilter===p.id?'':p.id)},p.room_no?`${p.room_no}${p.bed_no?`-${p.bed_no}`:''}`:(formalName(p)||p.full_name||'Guest')))),
      !marSlots.length&&h('div',{className:'message'},attentionOnly?'Nothing overdue — every dose so far is recorded.':'No medicines are scheduled today.'),
      marSlots.map(slot=>{
        const label=slot.state==='attention'?'overdue — needs attention':slot.state==='due'?'due now':slot.state==='done'?'all recorded':slot.state==='later'?'upcoming this shift':'other shift';
        const guestsText=`${slot.guests.length} Guest${slot.guests.length>1?'s':''} · ${slot.items.length} dose${slot.items.length>1?'s':''}`;
        return h('div',{key:slot.time,id:`mar-slot-${slot.time.replace(':','')}`,className:`mar-slot ${slot.state}`},
          h('button',{type:'button',className:`mar-slot-head ${slot.open?'open':''}`,'aria-expanded':slot.open,onClick:()=>setSlotOpen(cur=>({...cur,[slot.time]:!slot.open}))},
            h('span',null,h('span',{className:'mar-chev','aria-hidden':'true'},'›'),h('b',null,medicationTimeLabel(slot.time)),h('small',null,` · ${label}`)),
            h('small',null,slot.state==='done'?`✓ ${slot.given} of ${slot.items.length} given`:`${guestsText}${slot.given?` · ${slot.given} given`:''}`)),
          slot.open&&slot.guests.map(g=>marGuestBlock(g,slot)));
      }),
      h('p',{className:'small-note',style:{margin:'8px 0 0'}},'Tap a recorded dose to see the full audit (given time, entry time, remarks). Earlier days are in Medication History.'));

    let table=null;
    if(tab==='Active Prescriptions')table=h(LogTable,{className:'medication-log-table',title:'Active Prescription Register',subtitle:'Current medicines transcribed during admission or patient update',heads:['Patient','Medicine / Strength','Route','Frequency','Duration','Time','Food','Special instruction','Latest MAR','Action'],rows:prescriptionRows(visibleActive)});
    if(tab==='Today’s MAR')table=marTodayView;
    if(tab==='Medication History')table=h(MedicationHistory,{profile,orders:state.orders,patients:state.patients});

    if(tab==='Prescription History'){
      const historyOrders=visibleHistory.sort((a,b)=>String(b.effective_from||b.created_at||'').localeCompare(String(a.effective_from||a.created_at||'')));
      const reviewRows=state.reviews.filter(r=>(!patientFilter||r.patient_id===patientFilter)&&dateInSelectedPeriod(r.reviewed_at||r.created_at));
      table=h('div',{className:'medication-history-workspace'},
        h(LogTable,{className:'medication-log-table',title:'Prescription Version History',subtitle:'Every medication order is retained. Modified or stopped orders are never overwritten.',heads:['Patient','Version','Medicine / Strength','Frequency / Route','Times','Effective From','Stopped At','Doctor','Origin / Status'],rows:historyOrders.map(order=>[
          patientLabel(order),`V${order.version_no||1}`,medicineLabel(order),[order.frequency,order.route].filter(Boolean).join(' · ')||'—',parseTimes(order.scheduled_times).map(medicationTimeLabel).join(', ')||'—',order.effective_from?fmt(order.effective_from):(order.start_date?formatDateIN(order.start_date):fmt(order.created_at)),order.stopped_at?fmt(order.stopped_at):'—',order.prescribed_by_doctor||'—',[order.change_action,order.is_active===false?(order.status||'Stopped'):(order.status||'Active')].filter(Boolean).join(' · ')
        ])}),
        h('div',{className:'section-card medication-review-history'},
          h('div',{className:'panel-head'},h('div',null,h('h3',null,'Doctor Review / Prescription Revision History'),h('small',null,'Review source, effective time, prescription proof and verbal-order confirmation are permanently retained.')),canReviseMedication&&h('button',{type:'button',className:'btn btn-primary',onClick:()=>openMedicationReview(patientFilter)},'Doctor Review / Modify')),
          reviewRows.length?h('div',{className:'medication-review-list'},reviewRows.map(review=>{
            const p=state.patients.find(x=>x.id===review.patient_id)||{};
            const items=state.reviewItems.filter(x=>x.review_id===review.id);
            const pending=review.order_mode!=='Written Prescription'&&review.verbal_confirmation_status!=='Confirmed';
            return h('div',{className:'medication-review-card',key:review.id},
              h('div',{className:'medication-review-head'},h('div',null,h('strong',null,`${formalName(p)||p.full_name||'Patient'} · ${review.doctor_name}`),h('small',null,`${fmt(review.reviewed_at)} · Effective ${fmt(review.effective_from)} · ${review.order_mode}`)),h('span',{className:`badge ${pending?'off':''}`},pending?'Confirmation Pending':'Confirmed / Written')),
              review.clinical_notes&&h('p',null,review.clinical_notes),
              h('div',{className:'medication-review-items'},items.map(item=>h('span',{className:`review-action ${String(item.action||'').toLowerCase()}`,key:item.id},`${item.action}: ${item.medicine_name||'Medicine'}${item.strength?` ${item.strength}`:''}`))),
              pending&&canReviseMedication&&h('div',{className:'actions'},h('small',null,review.verbal_confirmation_due_at?`Written confirmation due: ${fmt(review.verbal_confirmation_due_at)}`:'Written confirmation pending'),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>confirmVerbalReview(review)},'Mark Written Confirmation Received'))
            );
          })):h('p',{className:'small-note'},'No doctor medication review has been recorded yet.')
        )
      );
      // 2.18.60: Completed / Discontinued courses are now views inside Prescription History (were separate tabs)
      if(prescriptionView==='completed')table=h(LogTable,{className:'medication-log-table',title:'Completed Medicine Courses',subtitle:'Prescription courses completed by status or end date',heads:['Patient','Medicine / Strength','Route','Frequency','Duration','Time','Food','Special instruction','Latest MAR','Action'],rows:prescriptionRows(visibleCompleted)});
      if(prescriptionView==='discontinued')table=h(LogTable,{className:'medication-log-table',title:'Discontinued Medicines',subtitle:'Stopped or inactive prescriptions retained for history',heads:['Patient','Medicine / Strength','Route','Frequency','Duration','Time','Food','Special instruction','Latest MAR'],rows:prescriptionRows(visibleDiscontinued).map(row=>row.slice(0,-1))});
    }

    // 2.15.11: warn-only suggestion from today's latest vitals; open withheld doses awaiting the doctor
    const withholdSuggestion=marTarget&&marForm.status!=='Withheld'?medicationWithholdSuggestion(marTarget,(state.vitals||[]).filter(v=>v.patient_id===marTarget.patient_id)):null;
    const allOpenWithheld=(state.mar||[]).filter(medicationWithholdOpen).filter(log=>{const pt=state.patients.find(x=>x.id===log.patient_id);return pt&&pt.is_active!==false&&(!patientFilter||log.patient_id===patientFilter)});
    const openWithheld=withheldFocus?.id?allOpenWithheld.filter(log=>log.id===withheldFocus.id):allOpenWithheld;
    const focusedWithheldDone=Boolean(withheldFocus?.id&&!state.loading&&!openWithheld.length);
    useScrollToFocused(withheldFocus?.id&&openWithheld.length?`withheld-${withheldFocus.id}`:'',!state.loading);
    // Re-dose day for "Give now / later": same rule as Today's MAR — a time after the dose time is the same day, an earlier one the next day
    function instructionGiveOn(target,giveHHMM){
      if(!target||!giveHHMM)return '';
      return rescheduledDoseDate({scheduled_date:target.scheduled_date,scheduled_time:target.scheduled_time,rescheduled_time:giveHHMM});
    }
    function openInstruction(log){
      const plus30=new Date(Date.now()+30*60000);
      setInstructionTarget(log);
      setInstructionForm({instruction:'',notes:'',give_at:`${String(plus30.getHours()).padStart(2,'0')}:${String(plus30.getMinutes()).padStart(2,'0')}`});
      setInstructionMessage('');
    }
    async function saveInstruction(e){
      e.preventDefault();
      if(!instructionTarget)return;
      const f=instructionForm;
      const fail=text=>{setInstructionMessage(text);showSamaraActionToast('error','Cannot save instruction',text)};
      if(!f.instruction)return fail('Select the doctor\'s instruction.');
      if(!String(f.notes||'').trim())return fail('Enter what the doctor said (the instruction in the doctor\'s words).');
      if(f.instruction==='Give at a later time'&&!f.give_at)return fail('Choose the time to give the dose.');
      if(f.instruction==='Give at a later time'){
        const on=instructionGiveOn(instructionTarget,f.give_at);
        const when=on?new Date(`${on}T${normalizeMedicationTime(f.give_at)}:00+05:30`):null;
        if(when&&when.getTime()<Date.now()-10*60000)return fail(`${medicationTimeLabel(f.give_at)} on ${formatDateIN(on)} has already passed for this dose. Choose a later time, or "Skip this dose" if the doctor advised waiting for the next dose.`);
      }
      setInstructionBusy(true);
      const {error}=await client.rpc('record_withheld_dose_instruction',{p_id:instructionTarget.id,p_instruction:f.instruction,p_notes:String(f.notes).trim(),p_give_at:f.instruction==='Give at a later time'?`${f.give_at}:00`:null});
      setInstructionBusy(false);
      if(error)return fail(error.message||'Unable to save the doctor\'s instruction.');
      const patientId=instructionTarget.patient_id;
      setInstructionTarget(null);
      showSamaraActionToast('success','Doctor\'s instruction recorded',f.instruction==='Give now'?'The dose now appears as due in Today\'s MAR. Record it when given.':f.instruction==='Give at a later time'?(()=>{const on=instructionGiveOn(instructionTarget,f.give_at);return `The dose will appear again at ${medicationTimeLabel(f.give_at)}${on&&on!==today?` on ${formatDateIN(on)}`:''} in Today\'s MAR and Shift Tasks.`})():f.instruction==='Skip this dose'?'This dose is closed as skipped on the doctor\'s instruction.':'Now record the prescription change in Doctor Review / Modify.');
      await load();
      if(f.instruction==='Change prescription (Doctor Review)'&&canReviseMedication&&!state.reviewSetupError){setTab('Prescription History');openMedicationReview(patientId);}
    }
    const targetTimes=marTarget?Array.from(new Set([...parseTimes(marTarget.scheduled_times),marForm.scheduled_time].filter(Boolean))):[];
    const currentEntryDelay=marForm.administered_at?Math.max(0,Math.round((Date.now()-new Date(marForm.administered_at).getTime())/60000)):0;
    const currentIsLateEntry=currentEntryDelay>30;
    const lateEntryReasons=['Forgot to record immediately','Emergency patient care','Network or device issue','Medicine administered by another staff member','Patient-related delay','Doctor instruction','Other'];
    return h(React.Fragment,null,
      h(Section,{title:'Medication Administration & Prescription Register',subtitle:'Unified prescription history and MAR status from the patient record'},
        state.error&&h('div',{className:'message error'},`Unable to load part of the medication register: ${state.error}`),
        state.reviewSetupError&&h('div',{className:'message error'},'Medication Review database upgrade is not yet installed. Run MEDICATION_REVIEW_MIGRATION_v2.11.26.sql in Supabase SQL Editor before using Doctor Review / Modify.'),
        // 2.16.10: opened from a withheld-dose alert -> only that dose
        withheldFocus&&h(RecordFocusBanner,{focus:withheldFocus,onShowAll:clearWithheldFocus}),
        focusedWithheldDone&&h('div',{className:'message success'},'The doctor\'s instruction for this withheld dose is already recorded. Tap Show all to see the full register.'),
        // 2.15.11: withheld doses stay here until the doctor's instruction is recorded
        openWithheld.length>0&&h('div',{className:'section-card',style:{border:'1px solid #f0b4b4',borderLeft:'6px solid #b42318',background:'#fff7f7',marginBottom:'14px'}},
          h('div',{className:'panel-head'},h('div',null,h('h3',{style:{color:'#b42318',margin:0}},`Withheld doses — awaiting doctor's instruction (${openWithheld.length})`),h('small',null,'Record the doctor\'s instruction as soon as it is received. Nursing Manager and Admin are alerted until then.'))),
          h('div',{style:{display:'grid',gap:'8px'}},openWithheld.map(log=>{
            const order=state.orders.find(o=>o.id===log.order_id)||{};
            const pt=state.patients.find(x=>x.id===log.patient_id)||{};
            const since=Math.max(0,Math.round((Date.now()-new Date(log.administered_at||log.entry_recorded_at||Date.now()).getTime())/60000));
            return h('div',{key:log.id,id:`withheld-${log.id}`,style:{display:'flex',gap:'10px',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',padding:'10px 12px',border:'1px solid #f3cccc',borderRadius:'10px',background:'#fff'}},
              h('div',{style:{minWidth:'240px',flex:'1 1 320px'}},
                h('strong',null,`${formalName(pt)||pt.full_name||'Resident'}${pt.room_no?` · Room ${pt.room_no}${pt.bed_no?'-'+pt.bed_no:''}`:''}`),
                h('div',null,`${medicineLabel(order)} · dose ${medicationTimeLabel(log.scheduled_time)}${log.scheduled_date&&log.scheduled_date!==today?` (${formatDateIN(log.scheduled_date)})`:''}`),
                h('small',{style:{display:'block',color:'#7a2a2a'}},[log.withhold_reason,log.withhold_reading].filter(Boolean).join(' · ')),
                h('small',{style:{display:'block',color:'#5f5f5f'}},`Doctor: ${log.doctor_informed_name||'—'} · ${log.doctor_informed_via||'—'}${log.doctor_informed_at?` at ${fmt(log.doctor_informed_at)}`:''} · withheld ${since<60?`${since} min`:`${Math.floor(since/60)} h ${since%60} min`} ago`)),
              canReviseMedication&&h('button',{type:'button',className:'btn btn-primary',onClick:()=>openInstruction(log)},'Record doctor\'s instruction'));
          }))
        ),
        // 2.18.60: Guest dropdown only on the prescription tabs (Today's MAR has room buttons; Medication History has its own filters);
        // the Period filter only on Prescription History. Tabs: Today's MAR · Active Prescriptions · Medication History · Prescription History.
        !useFrontlinePriority&&h('div',{className:'panel-head'},
          ['Active Prescriptions','Prescription History'].includes(tab)?h('div',{className:'field',style:{minWidth:'260px',marginBottom:0}},h('label',null,'Patient filter'),h('select',{value:patientFilter,onChange:e=>setPatientFilter(e.target.value)},h('option',{value:''},'All patients'),state.patients.filter(p=>p.is_active!==false).map(p=>h('option',{key:p.id,value:p.id},`${formalName(p)||p.full_name} · ${p.patient_id||'No ID'}`)))):h('div',null),
          h('div',{className:'actions'},canReviseMedication&&h('button',{type:'button',className:'btn btn-primary',disabled:Boolean(state.reviewSetupError),onClick:()=>openMedicationReview(patientFilter)},'Doctor Review / Modify'),h('button',{type:'button',className:'btn btn-secondary',onClick:load},state.loading?'Loading…':'Refresh'))
        ),
        !useFrontlinePriority&&tab==='Prescription History'&&h('div',{className:'medication-register-filters'},
          h('div',{className:'field'},h('label',null,'Show'),h('select',{value:prescriptionView,onChange:e=>setPrescriptionView(e.target.value)},[['all','All versions + doctor reviews'],['completed',`Completed courses (${visibleCompleted.length})`],['discontinued',`Discontinued (${visibleDiscontinued.length})`]].map(([v,l])=>h('option',{key:v,value:v},l)))),
          h('div',{className:'field'},h('label',null,'Period'),h('select',{value:periodFilter,onChange:e=>{setPeriodFilter(e.target.value);if(e.target.value!=='All'){setDateFrom('');setDateTo('');}}},['All','Today','7 Days','30 Days'].map(x=>h('option',{key:x,value:x},x)))),
          h('div',{className:'field'},h('label',null,'From date'),h(StrictDateInput,{min:'2026-08-27',max:dateTo||today,value:dateFrom,onChange:e=>{setDateFrom(e.target.value);setPeriodFilter('All');}})),
          h('div',{className:'field'},h('label',null,'To date'),h(StrictDateInput,{min:dateFrom||'2026-08-27',max:today,value:dateTo,onChange:e=>{setDateTo(e.target.value);setPeriodFilter('All');}})),
          h('button',{type:'button',className:'btn btn-primary',onClick:()=>setAppliedMedicationFilter({period:periodFilter,from:dateFrom,to:dateTo})},'Apply Filter'),
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setPeriodFilter('All');setDateFrom('');setDateTo('');setAppliedMedicationFilter({period:'All',from:'',to:''});}},'Clear Filter')
        ),
        !useFrontlinePriority&&h('div',{className:'time-chip-list',style:{marginTop:'12px'}},tabs.map(([name,count])=>h('button',{type:'button',key:name,className:`btn ${tab===name?'btn-primary':'btn-secondary'}`,onClick:()=>setTab(name)},count===null?name:`${name} (${count})`)))
      ),
      !patientFilter&&h(DischargeMedicationReview),
      state.loading&&!state.orders.length?h('div',{className:'card panel loading'},'Loading medication register…'):(useFrontlinePriority?(showHistoryMobile?h(MedicationHistory,{profile,orders:state.orders,patients:state.patients,onBack:()=>setShowHistoryMobile(false)}):nurseMedicationCards):table),
      batchTarget&&h('div',{className:'modal-backdrop',onClick:e=>{if(e.target===e.currentTarget&&!batchBusy)setBatchTarget(null)}},
        h('div',{className:'card modal',role:'dialog','aria-modal':'true'},
          h('div',{className:'panel-head'},h('div',null,h('h3',null,`Give checked · ${medicationTimeLabel(batchTarget.time)} round`),h('small',null,`${formalName(batchTarget.patient)||batchTarget.patient.full_name||'Guest'} · ${batchTarget.patient.room_no?`Room ${batchTarget.patient.room_no}${batchTarget.patient.bed_no?`-${batchTarget.patient.bed_no}`:''}`:''}`)),h('button',{type:'button',className:'close',disabled:batchBusy,onClick:()=>setBatchTarget(null)},'×')),
          batchMessage&&h('div',{className:'message error'},batchMessage),
          h('p',null,`These ${batchTarget.items.length} dose${batchTarget.items.length>1?'s':''} will be recorded as Given now (${formatTimeIN(new Date().toISOString())}):`),
          h('ol',{style:{margin:'0 0 12px',paddingLeft:'22px',lineHeight:1.7}},batchTarget.items.map(x=>h('li',{key:roundKey(x)},h('b',null,medicineLabel(x.order)),[x.order.route,x.order.food_instruction].filter(Boolean).length?` · ${[x.order.route,x.order.food_instruction].filter(Boolean).join(' · ')}`:''))),
          h('small',{className:'small-note',style:{display:'block',marginBottom:'10px'}},'Not giving one of them? Cancel, untick it, and use Withhold or Record for that dose. Given earlier than now? Use Record for each dose so the real time is saved.'),
          h('div',{className:'modal-actions'},h('button',{type:'button',className:'btn btn-secondary',disabled:batchBusy,onClick:()=>setBatchTarget(null)},'Cancel'),h('button',{type:'button',className:'btn btn-primary',disabled:batchBusy,onClick:saveBatch},batchBusy?'Saving…':`Record ${batchTarget.items.length} as Given`)))),
      doseDetail&&doseDetail.log&&h(RowDetailModal,{title:`${medicineLabel(doseDetail.order)} · ${medicationTimeLabel(doseDetail.time)}`,subtitle:patientLabel(doseDetail.order),onClose:()=>setDoseDetail(null),
        fields:[['Status',doseDetail.log.status],['Route',doseDetail.order.route],['Food',doseDetail.order.food_instruction],['Special instruction',doseDetail.order.special_instruction||doseDetail.order.special_instructions],
          ['Actually given at',doseDetail.log.administered_at?fmt(doseDetail.log.administered_at):''],['Entry recorded at',doseDetail.log.entry_recorded_at?fmt(doseDetail.log.entry_recorded_at):(doseDetail.log.created_at?fmt(doseDetail.log.created_at):'')],
          ['Entry',doseDetail.log.late_entry?`Late entry · ${doseDetail.log.entry_delay_minutes||0} min · ${doseDetail.log.late_entry_reason||''}${doseDetail.log.late_entry_justification?` — ${doseDetail.log.late_entry_justification}`:''}`:'On-time entry'],
          ['Withhold reason',doseDetail.log.withhold_reason],['Reading',doseDetail.log.withhold_reading],['Doctor informed',doseDetail.log.doctor_informed_name?`${doseDetail.log.doctor_informed_name} · ${doseDetail.log.doctor_informed_via||''}`:''],
          ["Doctor's instruction",doseDetail.log.doctor_instruction?`${doseDetail.log.doctor_instruction}${doseDetail.log.doctor_instruction_notes?` — ${doseDetail.log.doctor_instruction_notes}`:''}`:''],
          ['Rescheduled to',doseDetail.log.rescheduled_time?medicationTimeLabel(doseDetail.log.rescheduled_time):''],['Remarks',doseDetail.log.remarks]]},
        !isFrontlineClinical&&h('div',{style:{marginTop:'10px'}},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{const d=doseDetail;setDoseDetail(null);openMar(d.order,d.time)}},'View / Correct'))),
      reviewOpen&&h('div',{className:'modal-backdrop medication-review-backdrop',onClick:e=>{if(e.target===e.currentTarget&&!reviewBusy)setReviewOpen(false)}},
        h('form',{className:'card modal medication-review-modal',onSubmit:saveMedicationReview},
          h('div',{className:'panel-head'},h('div',null,h('h3',null,'Doctor Review / Modify Medication'),h('small',null,'Only medication-review fields are shown. Previous prescriptions and MAR entries are never overwritten.')),h('button',{type:'button',className:'close',disabled:reviewBusy,onClick:()=>setReviewOpen(false)},'×')),
          reviewMessage&&h('div',{className:'message error'},reviewMessage),
          h('div',{className:'message',style:{marginBottom:'12px'}},'Effective-time safety: doses scheduled before the new order takes effect remain under the previous prescription. Doses at or after the effective time follow the revised prescription.'),
          h('div',{className:'modal-grid'},
            h('div',{className:'field span-2'},h('label',null,'Patient'),h('select',{required:true,value:reviewForm.patient_id,onChange:e=>initializeReviewPatient(e.target.value)},h('option',{value:''},'Select patient'),state.patients.filter(p=>p.is_active!==false).map(p=>h('option',{key:p.id,value:p.id},`${formalName(p)||p.full_name} · ${p.patient_id||'No ID'} · Room ${p.room_no||'—'}`)))),
            h('div',{className:'field'},h('label',null,'Doctor Review Date & Time'),h('input',{type:'datetime-local',required:true,max:localDateTimeValue(),value:reviewForm.reviewed_at,onChange:e=>setReviewForm({...reviewForm,reviewed_at:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Effective From Date & Time (default for all changes)'),h('input',{type:'datetime-local',required:true,max:localDateTimeValue(new Date(Date.now()+REVIEW_EFFECTIVE_MAX_DAYS*86400000)),value:reviewForm.effective_from,onChange:e=>setReviewForm({...reviewForm,effective_from:e.target.value})}),
              (()=>{const t=new Date(reviewForm.effective_from).getTime();return Number.isFinite(t)&&t>Date.now()+60000?h('small',{style:{display:'block',marginTop:'4px',color:'#7a1247',fontWeight:700}},`Future start: the new order begins ${fmt(new Date(t).toISOString())}. The current prescription continues until then.`):null})()),
            h('div',{className:'field'},h('label',null,'Doctor Name'),h('input',{required:true,value:reviewForm.doctor_name,onChange:e=>setReviewForm({...reviewForm,doctor_name:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Doctor Contact'),h('input',{value:reviewForm.doctor_contact,onChange:e=>setReviewForm({...reviewForm,doctor_contact:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Review Type'),h('select',{value:reviewForm.review_type,onChange:e=>setReviewForm({...reviewForm,review_type:e.target.value})},['Routine Doctor Review','Specialist Review','Hospital Review / Discharge Advice','Emergency Review','Other'].map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field'},h('label',null,'Order Source'),h('select',{value:reviewForm.order_mode,onChange:e=>setReviewForm({...reviewForm,order_mode:e.target.value})},['Written Prescription','Telephone Order','Verbal Order'].map(x=>h('option',{key:x,value:x},x)))),
            reviewForm.order_mode==='Written Prescription'?h('div',{className:'field span-2'},h('label',null,'Upload Doctor Prescription / Order (mandatory)'),h('input',{type:'file',accept:'image/*,.pdf',required:true,onChange:e=>setReviewFile(e.target.files?.[0]||null)}),reviewFile&&h('small',null,reviewFile.name)):h(React.Fragment,null,
              h('div',{className:'field'},h('label',null,'Order Received By'),h('input',{required:true,value:reviewForm.received_by_name,onChange:e=>setReviewForm({...reviewForm,received_by_name:e.target.value}),placeholder:'Staff name / designation'})),
              h('div',{className:'field'},h('label',null,'Written Confirmation Due'),h('input',{type:'datetime-local',required:true,value:reviewForm.confirmation_due_at,onChange:e=>setReviewForm({...reviewForm,confirmation_due_at:e.target.value})}))
            ),
            h('div',{className:'field span-2'},h('label',null,'Doctor Review / Clinical Notes'),h('textarea',{rows:3,value:reviewForm.clinical_notes,onChange:e=>setReviewForm({...reviewForm,clinical_notes:e.target.value}),placeholder:'Reason for review, diagnosis update, relevant advice or monitoring instructions'}))
          ),
          reviewForm.patient_id&&h('div',{className:'medication-review-change-list'},
            h('div',{className:'section-title'},h('div',null,h('h4',null,'Medication Changes'),h('small',null,'For each existing medicine select Continue, Modify or Stop. Use Add New Medicine to enter one or more new medicines.')),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>openAddMedicines()},'Add New Medicine')),
            reviewForm.changes.length?reviewForm.changes.map((row,index)=>h('div',{className:`medication-review-change ${String(row.action).toLowerCase()}`,key:row.client_id||index},
              h('div',{className:'medication-review-change-head'},h('strong',null,row.original_order_id?`${row.medicine_name||'Medicine'} ${row.strength||''}`:`${row.medicine_name||'New Medicine'} ${row.strength||''}`.trim()),row.original_order_id?h('select',{value:row.action,onChange:e=>updateReviewChange(index,{action:e.target.value})},['Continue','Modify','Stop'].map(x=>h('option',{key:x,value:x},x))):h('span',{className:'badge'},'New')),
              ['Continue','Stop'].includes(row.action)?h('div',{className:'medication-review-readonly'},h('span',null,`${row.frequency} · ${row.route} · ${parseTimes(row.times).map(medicationTimeLabel).join(', ')}`),row.special_instruction&&h('small',null,row.special_instruction),row.action==='Stop'?reviewStopTime(row,index):null)
                :row.action==='Add'?h('div',{className:'medication-review-readonly'},
                  h('span',null,[row.frequency,row.route,parseTimes(row.times).map(medicationTimeLabel).join(', '),row.food_instruction,row.duration].filter(Boolean).join(' · ')),
                  h('small',{style:{display:'block'}},(()=>{const v=String(row.effective_from||'').trim()||reviewForm.effective_from;const t=new Date(v).getTime();return Number.isFinite(t)?`Starts ${fmt(new Date(t).toISOString())}`:''})()),
                  row.special_instruction&&h('small',{style:{display:'block'}},row.special_instruction),
                  h('div',{style:{display:'flex',gap:'8px',marginTop:'8px',flexWrap:'wrap'}},
                    h('button',{type:'button',className:'btn btn-secondary',onClick:()=>openAddMedicines(index)},'Edit'),
                    h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setReviewForm(current=>({...current,changes:current.changes.filter((_,i)=>i!==index)}))},'Remove')))
                :reviewMedicineFields(row,p=>updateReviewChange(index,p)),
              ['Modify','Stop'].includes(row.action)&&h('div',{className:'field',style:{marginTop:'8px'}},h('label',null,'Change / Stop Note'),h('input',{value:row.change_note||'',onChange:e=>updateReviewChange(index,{change_note:e.target.value}),placeholder:'Optional medicine-specific reason / instruction'})),
            )):h('p',{className:'small-note'},'No active medicines. Use Add New Medicine if the doctor has prescribed treatment.')
          ),
          h('div',{className:'modal-actions medication-review-actions'},h('button',{type:'button',className:'btn btn-secondary',disabled:reviewBusy,onClick:()=>setReviewOpen(false)},'Close'),h('button',{className:'btn btn-primary',disabled:reviewBusy||!reviewForm.patient_id},reviewBusy?'Applying Review…':'Apply Doctor Review & Update Medication'))
        )
      ),
      reviewOpen&&addMedOpen&&h('div',{className:'medication-add-backdrop',onMouseDown:e=>{if(e.target===e.currentTarget)setAddMedOpen(false)}},
        h('div',{className:'card medication-add-modal',role:'dialog','aria-modal':'true','aria-label':'Add new medicines'},
          h('div',{className:'panel-head'},
            h('div',null,h('h3',null,addMedEditIndex!==null?'Edit New Medicine':'Add New Medicines'),h('small',null,addMedEditIndex!==null?'Change the details and press Save.':'Enter each medicine. Use "+ Add another medicine" for more, then press Save.')),
            h('button',{type:'button',className:'close',onClick:()=>setAddMedOpen(false)},'×')),
          addMedMessage&&h('div',{className:'message error'},addMedMessage),
          addMedRows.map((row,index)=>h('div',{className:'medication-review-change add',key:row.client_id||index},
            h('div',{className:'medication-review-change-head'},
              h('strong',null,addMedEditIndex!==null?'New Medicine':`New Medicine ${index+1}`),
              addMedRows.length>1&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setAddMedRows(rows=>rows.filter((_,i)=>i!==index))},'Remove')),
            reviewMedicineFields(row,p=>updateAddMedRow(index,p)),
            h('div',{className:'field',style:{marginTop:'8px'}},h('label',null,'Note (optional)'),h('input',{value:row.change_note||'',onChange:e=>updateAddMedRow(index,{change_note:e.target.value}),placeholder:'Reason / instruction for this medicine'}))
          )),
          addMedEditIndex===null&&h('button',{type:'button',className:'btn btn-secondary medication-add-another',onClick:()=>setAddMedRows(rows=>[...rows,blankReviewMedicine('Add')])},'+ Add another medicine'),
          h('div',{className:'modal-actions medication-review-actions'},
            h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setAddMedOpen(false)},'Cancel'),
            h('button',{type:'button',className:'btn btn-primary',onClick:saveAddMedicines},addMedEditIndex!==null?'Save':`Save ${addMedRows.length>1?`${addMedRows.length} Medicines`:'Medicine'}`))
        )
      ),
      marTarget&&h('div',{className:'modal-backdrop',onClick:e=>{if(e.target===e.currentTarget)closeMar()}},
        h('form',{className:'card modal',onSubmit:saveMar},
          h('div',{className:'panel-head'},h('div',null,h('h3',null,'Medication Administration'),h('small',null,'Record each dose without overwriting prescription history')),h('button',{type:'button',className:'close',onClick:closeMar},'×')),
          marMessage&&h('div',{className:'message error'},marMessage),
          h('div',{className:'modal-grid'},
            h('div',{className:'field'},h('label',null,'Patient'),h('input',{value:patientLabel(marTarget),readOnly:true})),
            h('div',{className:'field'},h('label',null,'Medicine'),h('input',{value:medicineLabel(marTarget),readOnly:true})),
            h('div',{className:'field'},h('label',null,'Route'),h('input',{value:marTarget.route||'—',readOnly:true})),
            h('div',{className:'field'},h('label',null,'Frequency'),h('input',{value:marTarget.frequency||'—',readOnly:true})),
            h('div',{className:'field'},h('label',null,'Scheduled Time'),h('select',{value:marForm.scheduled_time,onChange:e=>setMarForm({...marForm,scheduled_time:e.target.value})},(targetTimes.length?targetTimes:[marForm.scheduled_time]).filter(Boolean).map(time=>h('option',{key:time,value:time},medicationTimeLabel(time))))),
            withholdSuggestion&&h('div',{className:'message warning span-2',style:{display:'flex',gap:'10px',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'}},
              h('span',null,h('strong',null,'Check before giving: '),withholdSuggestion.text),
              h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setMarForm(current=>({...current,status:'Withheld',withhold_reason:withholdSuggestion.reason,withhold_reading:withholdSuggestion.reading}))},'Withhold this dose')),
            h('div',{className:'field'},h('label',null,'Status'),h('select',{value:marForm.status,onChange:e=>setMarForm({...marForm,status:e.target.value})},['Given','Delayed','Refused','Missed','Withheld'].map(status=>h('option',{key:status,value:status},status==='Withheld'?'Withheld (clinical — inform doctor)':status)))),
            marForm.status==='Given'&&marIsVariableDose(marTarget)&&h('div',{className:'message warning span-2'},'Sliding-scale insulin: check the blood sugar first, then enter the reading and the units you are giving (as per the doctor\'s scale).'),
            marForm.status==='Given'&&marIsVariableDose(marTarget)&&h('div',{className:'field'},h('label',null,'Blood sugar reading (mg/dL)'),h('input',{type:'number',inputMode:'numeric',min:10,max:900,required:true,value:marForm.sugar_reading,placeholder:'e.g. 186',onChange:e=>setMarForm({...marForm,sugar_reading:e.target.value})})),
            marForm.status==='Given'&&marIsVariableDose(marTarget)&&h('div',{className:'field'},h('label',null,'Units given'),h('input',{type:'number',inputMode:'decimal',min:0,max:200,step:'0.5',required:true,value:marForm.units_given,placeholder:'e.g. 6',onChange:e=>setMarForm({...marForm,units_given:e.target.value})})),
            marForm.status==='Withheld'&&h('div',{className:'message warning span-2'},'Withholding: record the reason and the reading, inform the treating doctor, then record the doctor\'s instruction when received. Nursing Manager and Admin are alerted immediately.'),
            marForm.status==='Withheld'&&h('div',{className:'field'},h('label',null,'Reason for withholding'),h('select',{required:true,value:marForm.withhold_reason,onChange:e=>setMarForm({...marForm,withhold_reason:e.target.value})},h('option',{value:''},'Select reason'),MEDICATION_WITHHOLD_REASONS.map(r=>h('option',{key:r,value:r},r)))),
            marForm.status==='Withheld'&&h('div',{className:'field'},h('label',null,'Reading / observation'),h('input',{required:true,value:marForm.withhold_reading,placeholder:MEDICATION_WITHHOLD_READING_HINT[marForm.withhold_reason]||'Example: BP 90/58 mmHg at 7:50 AM',onChange:e=>setMarForm({...marForm,withhold_reading:e.target.value})})),
            marForm.status==='Withheld'&&h('div',{className:'field'},h('label',null,'Treating doctor informed'),h('input',{required:true,value:marForm.doctor_informed_name,placeholder:'Doctor name',onChange:e=>setMarForm({...marForm,doctor_informed_name:e.target.value})})),
            marForm.status==='Withheld'&&h('div',{className:'field'},h('label',null,'Informed by'),h('select',{value:marForm.doctor_informed_via,onChange:e=>setMarForm({...marForm,doctor_informed_via:e.target.value})},MEDICATION_DOCTOR_CONTACT_MODES.map(m=>h('option',{key:m,value:m},m)))),
            marForm.status==='Withheld'&&marForm.doctor_informed_via!=='Not reachable yet — will retry'&&h('div',{className:'field span-2'},h('label',null,'Doctor informed at'),h(StrictDateTimeInput,{value:marForm.doctor_informed_at,onChange:e=>setMarForm({...marForm,doctor_informed_at:e.target.value})})),
            MEDICATION_RESCHEDULE_STATUSES.includes(marForm.status)&&h('label',{className:'checkbox span-2'},h('input',{type:'checkbox',checked:!!marForm.reschedule,onChange:e=>setMarForm({...marForm,reschedule:e.target.checked,rescheduled_time:e.target.checked?(marForm.rescheduled_time||''):''})}),' Re-medication required — reschedule this dose (e.g. patient sleeping / refused now)'),
            MEDICATION_RESCHEDULE_STATUSES.includes(marForm.status)&&marForm.reschedule&&h('div',{className:'field span-2'},h('label',null,'Re-medication Time'),h('input',{type:'time',required:true,value:marForm.rescheduled_time,onChange:e=>setMarForm({...marForm,rescheduled_time:e.target.value})}),h('small',null,'The dose will appear again at this time in Today’s MAR and Shift Tasks (a time after midnight falls on the next day). The original entry remains permanently in MAR history.')),
            h('div',{className:'field span-2'},h('label',null,'Actual Administration Time'),h(StrictDateTimeInput,{value:marForm.administered_at,onChange:e=>setMarForm({...marForm,administered_at:e.target.value}),required:true}),h('small',null,'The system records the MAR entry time automatically and staff cannot edit it.')),
            currentIsLateEntry&&h('div',{className:'message warning span-2'},`Late entry detected: this record is being entered approximately ${currentEntryDelay} minutes after the stated administration time. Justification is compulsory.`),
            currentIsLateEntry&&h('div',{className:'field'},h('label',null,'Late Entry Reason'),h('select',{value:marForm.late_entry_reason,onChange:e=>setMarForm({...marForm,late_entry_reason:e.target.value}),required:true},h('option',{value:''},'Select reason'),lateEntryReasons.map(reason=>h('option',{key:reason,value:reason},reason)))),
            currentIsLateEntry&&h('div',{className:'field'},h('label',null,'Entry Delay'),h('input',{value:`${currentEntryDelay} minutes`,readOnly:true})),
            currentIsLateEntry&&h('div',{className:'field span-2'},h('label',null,'Detailed Late Entry Justification'),h('textarea',{rows:3,value:marForm.late_entry_justification,onChange:e=>setMarForm({...marForm,late_entry_justification:e.target.value}),placeholder:'Explain why the medicine was not documented immediately, who administered it, and any verification performed.',required:true})),
            h('div',{className:'field span-2'},h('label',null,['Given','Withheld'].includes(marForm.status)?'Clinical Remarks (optional)':'Reason / Clinical Remarks (required)'),h('textarea',{rows:4,value:marForm.remarks,onChange:e=>setMarForm({...marForm,remarks:e.target.value}),placeholder:marForm.status==='Given'?'Any observation after administration':marForm.status==='Withheld'?'Any further observation / action taken':'Enter the medicine exception reason and action taken',required:!['Given','Withheld'].includes(marForm.status)}))
          ),
          h('div',{className:'modal-actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:closeMar,disabled:marBusy},'Cancel'),h('button',{className:'btn btn-primary',disabled:marBusy},marBusy?'Saving MAR…':'Save MAR'))
        )
      ),
      instructionTarget&&h('div',{className:'modal-backdrop',onClick:e=>{if(e.target===e.currentTarget&&!instructionBusy)setInstructionTarget(null)}},
        h('form',{className:'card modal',onSubmit:saveInstruction},
          h('div',{className:'panel-head'},h('div',null,h('h3',null,'Doctor\'s instruction — withheld dose'),h('small',null,'Recorded permanently with the withheld dose')),h('button',{type:'button',className:'close',onClick:()=>!instructionBusy&&setInstructionTarget(null)},'×')),
          instructionMessage&&h('div',{className:'message error'},instructionMessage),
          (()=>{const order=state.orders.find(o=>o.id===instructionTarget.order_id)||{};const pt=state.patients.find(x=>x.id===instructionTarget.patient_id)||{};
            return h('div',{className:'message warning'},`${formalName(pt)||pt.full_name||'Resident'} · ${medicineLabel(order)} · dose ${medicationTimeLabel(instructionTarget.scheduled_time)} — withheld: ${[instructionTarget.withhold_reason,instructionTarget.withhold_reading].filter(Boolean).join(' · ')}`)})(),
          h('div',{className:'modal-grid'},
            h('div',{className:'field span-2'},h('label',null,'Doctor\'s instruction'),h('select',{required:true,value:instructionForm.instruction,onChange:e=>setInstructionForm({...instructionForm,instruction:e.target.value})},h('option',{value:''},'Select instruction'),MEDICATION_WITHHOLD_INSTRUCTIONS.map(x=>h('option',{key:x,value:x},x)))),
            instructionForm.instruction==='Give at a later time'&&h('div',{className:'field span-2'},h('label',null,'Give the dose at'),h('input',{type:'time',required:true,value:instructionForm.give_at,onChange:e=>setInstructionForm({...instructionForm,give_at:e.target.value})}),h('small',null,(()=>{const on=instructionGiveOn(instructionTarget,instructionForm.give_at);return on?`Dose will be due at ${medicationTimeLabel(instructionForm.give_at)} on ${formatDateIN(on)}${on!==String(instructionTarget.scheduled_date||'').slice(0,10)?' (next day — the time is earlier than the dose time)':''}. It appears in Today\'s MAR and Shift Tasks.`:'The dose appears again at this time in Today\'s MAR and Shift Tasks.'})())),
            instructionForm.instruction==='Change prescription (Doctor Review)'&&h('div',{className:'message warning span-2'},'After saving, Doctor Review / Modify opens so the prescription change is recorded properly (medicines are changed only through Doctor Review).'),
            h('div',{className:'field span-2'},h('label',null,'What the doctor said'),h('textarea',{rows:3,required:true,value:instructionForm.notes,placeholder:'Example: Dr. Kumar (phone, 8:10 AM): skip this morning dose, recheck BP at 12 PM and inform',onChange:e=>setInstructionForm({...instructionForm,notes:e.target.value})}))
          ),
          h('div',{className:'modal-actions'},h('button',{type:'button',className:'btn btn-secondary',disabled:instructionBusy,onClick:()=>setInstructionTarget(null)},'Cancel'),h('button',{className:'btn btn-primary',disabled:instructionBusy},instructionBusy?'Saving…':'Save instruction'))
        )
      )
    );
  }


