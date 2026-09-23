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
    const [marForm,setMarForm]=React.useState({scheduled_time:'',status:'Given',administered_at:'',remarks:'',late_entry_reason:'',late_entry_justification:'',reschedule:false,rescheduled_time:''});
    const [marBusy,setMarBusy]=React.useState(false);
    const [marMessage,setMarMessage]=React.useState('');
    const [showShiftMedication,setShowShiftMedication]=React.useState(false);
    const [returnPage,setReturnPage]=React.useState('');
    const taskNavigationHandled=React.useRef(false);
    const canReviseMedication=['Admin','Manager','Nurse'].includes(profile?.role);
    const [reviewOpen,setReviewOpen]=React.useState(false);
    const [reviewBusy,setReviewBusy]=React.useState(false);
    const [reviewMessage,setReviewMessage]=React.useState('');
    const [reviewFile,setReviewFile]=React.useState(null);
    const [reviewForm,setReviewForm]=React.useState({patient_id:'',reviewed_at:'',doctor_name:'',doctor_contact:'',review_type:'Routine Doctor Review',order_mode:'Written Prescription',effective_from:'',clinical_notes:'',received_by_name:'',confirmation_due_at:'',changes:[]});
    const medicationDurations=['Single Dose','1 Day','3 Days','5 Days','7 Days','10 Days','14 Days','21 Days','30 Days','Until Doctor Review','Long Term','Custom'];
    const medicationFrequencies=['Once Daily (OD)','Twice Daily (BD)','Three Times Daily (TDS)','Four Times Daily (QID)','HS','STAT','SOS / PRN','Weekly','Monthly'];
    const medicationRoutes=['Oral','IV','IM','SC','Sublingual','Inhalation','Topical','Eye','Ear','Other'];
    const medicationFood=['Before food','After food','With food','No restriction'];

    function localDateTimeValue(date=new Date()){
      const pad=n=>String(n).padStart(2,'0');
      return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
    function parseTimes(value){
      if(Array.isArray(value))return value.filter(Boolean).map(normalizeMedicationTime).filter(Boolean);
      return String(value||'').split(',').map(normalizeMedicationTime).filter(Boolean);
    }
    function orderActive(order){
      if(order.is_active===false)return false;
      const patient=patientFor(order);
      if(!patient?.id||patient.is_active===false||patient.admission_status==='Discharged')return false;
      const status=String(order.status||'').trim().toLowerCase();
      if(['completed','discontinued','stopped','inactive'].includes(status))return false;
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
      return {client_id:`new-${Date.now()}-${Math.random()}`,action,original_order_id:null,medicine_name:'',strength:'',frequency:'Once Daily (OD)',route:'Oral',times:'08:00',food_instruction:'After food',duration:'Long Term',custom_duration_days:'',special_instruction:'',change_note:''};
    }
    function orderToReviewChange(order){
      return {client_id:order.id,action:'Continue',original_order_id:order.id,medicine_name:order.medicine_name||'',strength:order.strength||order.dose||'',frequency:order.frequency||'Once Daily (OD)',route:order.route||'Oral',times:parseTimes(order.scheduled_times).join(', '),food_instruction:order.food_instruction||'After food',duration:order.duration||'Long Term',custom_duration_days:order.duration_days||'',special_instruction:order.special_instruction||order.special_instructions||'',change_note:''};
    }
    function initializeReviewPatient(patientId){
      const p=state.patients.find(row=>row.id===patientId)||{};
      const current=state.orders.filter(o=>o.patient_id===patientId&&orderActive(o)).map(orderToReviewChange);
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
    async function saveMedicationReview(e){
      e.preventDefault();setReviewMessage('');
      if(!reviewForm.patient_id)return setReviewMessage('Select the patient.');
      if(!String(reviewForm.doctor_name||'').trim())return setReviewMessage('Doctor name is required.');
      const reviewedAt=new Date(reviewForm.reviewed_at),effectiveAt=new Date(reviewForm.effective_from),now=new Date();
      if(Number.isNaN(reviewedAt.getTime())||Number.isNaN(effectiveAt.getTime()))return setReviewMessage('Enter valid review and effective date/time.');
      if(reviewedAt.getTime()>now.getTime()+60000||effectiveAt.getTime()>now.getTime()+60000)return setReviewMessage('Future review/effective date and time are not permitted.');
      if(reviewForm.order_mode==='Written Prescription'&&!reviewFile)return setReviewMessage('Upload the doctor’s written prescription / order before applying the medication change.');
      if(reviewForm.order_mode!=='Written Prescription'){
        if(!String(reviewForm.received_by_name||'').trim())return setReviewMessage('Enter the staff member who received the verbal / telephone order.');
        if(!reviewForm.confirmation_due_at)return setReviewMessage('Enter when written confirmation is due for the verbal / telephone order.');
      }
      const changed=reviewForm.changes.filter(row=>row.action!=='Continue');
      if(!changed.length)return setReviewMessage('No medication change is selected. Choose Modify, Stop, or Add New Medicine.');
      for(const row of reviewForm.changes){
        if(!['Modify','Add'].includes(row.action))continue;
        if(!String(row.medicine_name||'').trim()||!String(row.strength||'').trim()||!row.frequency||!row.route||!parseTimes(row.times).length)return setReviewMessage('Complete Medicine, Strength, Frequency, Route and Time for every modified/new medicine.');
        if(row.duration==='Custom'&&Number(row.custom_duration_days||0)<=0)return setReviewMessage('Enter valid custom duration days.');
      }
      setReviewBusy(true);let uploaded=null;
      try{
        uploaded=await uploadReviewPrescription(reviewForm.patient_id);
        const {data:{user}}=await client.auth.getUser();
        const changes=reviewForm.changes.map(row=>({
          action:row.action,original_order_id:row.original_order_id||null,medicine_name:row.medicine_name,strength:row.strength,dose:row.strength,frequency:row.frequency,route:row.route,
          scheduled_times:parseTimes(row.times),food_instruction:row.food_instruction||null,duration:row.duration||'Long Term',duration_days:row.duration==='Custom'?Number(row.custom_duration_days||0):null,
          start_date:String(reviewForm.effective_from).slice(0,10),end_date:durationEndDate(row,reviewForm.effective_from),special_instruction:row.special_instruction||null,change_note:row.change_note||null
        }));
        const reviewPayload={patient_id:reviewForm.patient_id,reviewed_at:reviewedAt.toISOString(),doctor_name:String(reviewForm.doctor_name).trim(),doctor_contact:String(reviewForm.doctor_contact||'').trim()||null,review_type:reviewForm.review_type,order_mode:reviewForm.order_mode,effective_from:effectiveAt.toISOString(),clinical_notes:String(reviewForm.clinical_notes||'').trim()||null,prescription_storage_path:uploaded.path,prescription_document_name:uploaded.name,received_by_name:reviewForm.order_mode==='Written Prescription'?null:String(reviewForm.received_by_name||'').trim(),verbal_confirmation_status:reviewForm.order_mode==='Written Prescription'?'Not Required':'Pending',verbal_confirmation_due_at:reviewForm.order_mode==='Written Prescription'?null:new Date(reviewForm.confirmation_due_at).toISOString()};
        const rpc=await client.rpc('apply_medication_review',{p_review:reviewPayload,p_changes:changes,p_user_id:user?.id||profile?.auth_user_id||profile?.id});
        if(rpc.error)throw rpc.error;
        if(uploaded.path){
          const doc=await client.from('patient_documents').insert({patient_id:reviewForm.patient_id,document_type:'Medication Review Prescription',document_name:uploaded.name||'Doctor prescription',storage_path:uploaded.path,mime_type:reviewFile?.type||null,file_size:reviewFile?.size||null,remarks:`Doctor medication review · ${reviewForm.doctor_name} · effective ${reviewForm.effective_from}`,uploaded_by:user?.id||profile?.id,is_verified:true});
          if(doc.error)console.warn('Medication review document index failed:',doc.error.message);
        }
        await client.from('audit_log').insert({user_id:user?.id||profile?.id,action:'MEDICATION_REVIEW_APPLIED',entity:'patients',entity_id:reviewForm.patient_id,details:{doctor:reviewForm.doctor_name,order_mode:reviewForm.order_mode,effective_from:effectiveAt.toISOString(),changed_items:changed.length}});
        showSamaraActionToast('success','Medication review applied','Current medication has been updated without overwriting the previous prescription or MAR history.');
        setReviewOpen(false);setReviewFile(null);setTab('Prescription History');await load();
      }catch(error){
        if(uploaded?.path)try{await client.storage.from('patient-documents').remove([uploaded.path]);}catch(_error){}
        const text=error?.message||'Unable to apply medication review.';setReviewMessage(text);showSamaraActionToast('error','Medication review failed',text);
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
        reschedule:false,rescheduled_time:''
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
      if(['Refused','Missed','Delayed'].includes(marForm.status)&&!String(marForm.remarks||'').trim()){
        const text=`Please enter the reason for medicine status “${marForm.status}”.`;setMarMessage(text);showSamaraActionToast('error','Cannot save medication',text);return;
      }
      if(marForm.status==='Refused'&&marForm.reschedule&&!marForm.rescheduled_time){const text='Please select the re-medication time.';setMarMessage(text);showSamaraActionToast('error','Cannot reschedule medication',text);return;}
      if(marForm.status==='Refused'&&marForm.reschedule&&normalizeMedicationTime(marForm.rescheduled_time)<=normalizeMedicationTime(marForm.scheduled_time)){const text='Re-medication time must be later than the refused scheduled dose.';setMarMessage(text);showSamaraActionToast('error','Cannot reschedule medication',text);return;}
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
        remarks:String(marForm.remarks||'').trim(),
        entry_recorded_at:entryTime.toISOString(),
        late_entry:isLateEntry,
        entry_delay_minutes:entryDelayMinutes,
        late_entry_reason:isLateEntry?String(marForm.late_entry_reason||'').trim():null,
        late_entry_justification:isLateEntry?String(marForm.late_entry_justification||'').trim():null,
        rescheduled_time:marForm.status==='Refused'&&marForm.reschedule?normalizeMedicationTime(marForm.rescheduled_time):null,
        reschedule_reason:marForm.status==='Refused'&&marForm.reschedule?String(marForm.remarks||'').trim():null
      };
      const {error}=await client.from('medication_administrations').insert(payload);
      if(error){const text=error.message||'Unable to save the Medication Administration Record.';setMarMessage(text);showSamaraActionToast('error','Medication save failed',text);setMarBusy(false);return;}
      showSamaraActionToast('success','Medication saved','Medication administration has been recorded successfully.');setMarBusy(false);setTab('Today’s MAR');await load();
      finishSuccessfulAction({
        close:()=>setMarTarget(null),
        returnPage,
        onNavigate
      });
    }

    async function load(){
      setState(current=>({...current,loading:true,error:''}));
      const [ordersResult,marResult,patientsResult,reviewsResult,reviewItemsResult]=await Promise.all([
        client.from('medication_orders').select('*').order('created_at',{ascending:false}),
        client.from('medication_administrations').select('*').order('scheduled_date',{ascending:false}).order('scheduled_time',{ascending:false}).limit(1000),
        client.from('patients').select('*').order('full_name'),
        client.from('medication_reviews').select('*').order('reviewed_at',{ascending:false}).limit(500),
        client.from('medication_review_items').select('*').order('created_at',{ascending:false}).limit(2000)
      ]);
      const errors=[ordersResult.error,marResult.error,patientsResult.error].filter(Boolean);
      const reviewSetupError=[reviewsResult.error,reviewItemsResult.error].filter(Boolean).map(e=>e.message).join(' | ');
      setState({loading:false,orders:ordersResult.data||[],mar:marResult.data||[],patients:patientsResult.data||[],reviews:reviewsResult.data||[],reviewItems:reviewItemsResult.data||[],error:errors.map(e=>e.message).join(' | '),reviewSetupError});
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
        const start=new Date(`${today}T00:00:00`);
        const days=period==='Today'?0:period==='7 Days'?6:period==='30 Days'?29:null;
        if(days!==null){start.setDate(start.getDate()-days);from=start.toISOString().slice(0,10);to=end;}
      }
      if(from&&day<from)return false;
      if(to&&day>to)return false;
      return true;
    }
    function orderDate(order){return order.effective_from||order.start_date||order.created_at||'';}
    const activeOrders=state.orders.filter(orderActive);
    const todayRows=[];
    state.orders.forEach(order=>parseTimes(order.scheduled_times).forEach(time=>{
      const patient=patientFor(order);if(!patient.id||patient.is_active===false||patient.admission_status==='Discharged')return;
      if(!medicationOrderDoseEligible(order,today,time))return;
      if(doseWasBeforeAdmission(order,time))return;
      todayRows.push({order,time,date:today,log:doseStatus(order,time,today)});
    }));
    // A refused dose may be explicitly rescheduled. Keep the original refusal in MAR,
    // and expose the new time as a separate actionable dose for the same patient/order.
    state.mar.filter(log=>log.scheduled_date===today&&log.rescheduled_time).forEach(log=>{
      const order=state.orders.find(item=>item.id===log.order_id);
      if(!order)return;
      const time=normalizeMedicationTime(log.rescheduled_time);
      if(!time||todayRows.some(item=>item.order.id===order.id&&normalizeMedicationTime(item.time)===time))return;
      const patient=patientFor(order);if(!patient.id||patient.is_active===false||patient.admission_status==='Discharged')return;
      todayRows.push({order,time,date:today,log:doseStatus(order,time,today),rescheduledFrom:normalizeMedicationTime(log.scheduled_time)});
    });
    const missedRows=todayRows.filter(x=>{
      if(x.log)return ['missed','refused','delayed','not given','withheld','unavailable'].includes(String(x.log.status||'').toLowerCase());
      return pendingDoseState(x).minutes>=15;
    });
    const completedOrders=state.orders.filter(o=>String(o.status||'').toLowerCase()==='completed'||(o.end_date&&o.end_date<today&&o.is_active!==false));
    const discontinuedOrders=state.orders.filter(o=>o.is_active===false||['discontinued','stopped','inactive'].includes(String(o.status||'').toLowerCase()));
    const patientMatches=item=>!patientFilter||(item.order||item).patient_id===patientFilter;
    const filtered=rows=>rows.filter(patientMatches);
    const periodOrders=rows=>filtered(rows).filter(order=>dateInSelectedPeriod(orderDate(order)));
    const visibleActive=filtered(activeOrders);
    const historicalMarFilter=Boolean(appliedMedicationFilter.from||appliedMedicationFilter.to||appliedMedicationFilter.period!=='All');
    function appliedMarDates(){
      if(!historicalMarFilter)return [today];
      let from=appliedMedicationFilter.from||'',to=appliedMedicationFilter.to||'';
      if(appliedMedicationFilter.period!=='All'){
        to=today;const d=new Date(`${today}T00:00:00`);const days=appliedMedicationFilter.period==='Today'?0:appliedMedicationFilter.period==='7 Days'?6:29;d.setDate(d.getDate()-days);from=d.toISOString().slice(0,10);
      }
      from=from||to||today;to=to||from;
      const out=[];let d=new Date(`${from}T00:00:00`),end=new Date(`${to}T00:00:00`);
      while(d<=end&&out.length<366){out.push(d.toISOString().slice(0,10));d.setDate(d.getDate()+1)}
      return out;
    }
    const periodMarRows=historicalMarFilter?(()=>{
      const rows=[];
      appliedMarDates().forEach(dateISO=>state.orders.forEach(order=>parseTimes(order.scheduled_times).forEach(time=>{
        if(!medicationOrderDoseEligible(order,dateISO,time))return;
        const log=doseStatus(order,time,dateISO);
        rows.push({order,time,date:dateISO,log});
      })));
      // Preserve recorded historical doses even when an old order was later deactivated without a stopped_at timestamp.
      state.mar.filter(log=>dateInSelectedPeriod(log.scheduled_date)).forEach(log=>{
        const order=state.orders.find(item=>item.id===log.order_id);if(!order)return;
        const date=String(log.scheduled_date||'').slice(0,10),time=normalizeMedicationTime(log.scheduled_time);
        if(!rows.some(item=>item.order.id===order.id&&item.date===date&&normalizeMedicationTime(item.time)===time))rows.push({order,time,date,log});
      });
      return rows;
    })():todayRows;
    const visibleToday=filtered(periodMarRows);
    const visibleMissed=filtered(historicalMarFilter?periodMarRows.filter(x=>x.log?['missed','refused','delayed','not given','withheld','unavailable'].includes(String(x.log.status||'').toLowerCase()):new Date(`${x.date}T${normalizeMedicationTime(x.time)}:00`).getTime()<Date.now()):missedRows);
    const visibleHistory=periodOrders(state.orders);
    const visibleCompleted=periodOrders(completedOrders);
    const visibleDiscontinued=periodOrders(discontinuedOrders);
    const historyCount=visibleHistory.length;
    const tabs=[['Active Prescriptions',visibleActive.length],['Today’s MAR',visibleToday.length],['Missed Medicines',visibleMissed.length],['Prescription History',historyCount],['Completed Medicines',visibleCompleted.length],['Discontinued Medicines',visibleDiscontinued.length]];

    function scheduledDoseDate(time,dateISO=today){
      const raw=String(time||'').slice(0,8);
      if(!raw)return null;
      const d=new Date(`${dateISO}T${raw.length===5?raw+':00':raw}`);
      return Number.isNaN(d.getTime())?null:d;
    }
    function pendingDoseState(item){
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
      return [
        patientLabel(order),medicineLabel(order),order.route||'—',order.frequency||'—',order.duration||'—',parseTimes(order.scheduled_times).map(medicationTimeLabel).join(', ')||'—',order.food_instruction||'—',h('div',null,order.special_instruction||order.special_instructions||'—',h(TamilAssist,{text:order.special_instruction||order.special_instructions,context:'Medication Special Instruction'})),latestMar(order)?.status||'No MAR yet',
        h('button',{type:'button',className:`btn ${allTodayDone?'btn-secondary clinical-action-done':'btn-primary'}`,disabled:allTodayDone,onClick:()=>openMar(order,pendingTime)},allTodayDone?'Done Today ✓':'Administer')
      ];
    });
    const marRows=items=>filtered(items).map(item=>{
      const dose=pendingDoseState(item);
      const urgent=!item.log&&dose.minutes>=15;
      const historical=Boolean(item.date&&item.date!==today);
      return [
        patientLabel(item.order),...(historicalMarFilter?[item.date||today]:[]),medicineLabel(item.order),medicationTimeLabel(item.time),
        h('span',{className:'badge',style:urgent?{background:dose.minutes>=60?'#fdecec':'#fff4dd',color:dose.minutes>=60?'#b42318':'#9a6700'}:{}},dose.status),
        item.log?.administered_at?fmt(item.log.administered_at):'—',
        item.log?.entry_recorded_at?fmt(item.log.entry_recorded_at):(item.log?.created_at?fmt(item.log.created_at):'—'),
        dose.audit,item.log?.remarks||'—',
        historical&&!item.log?h('span',{className:'small-note'},'—'):h('button',{type:'button',className:item.log&&isFrontlineClinical?'btn btn-secondary clinical-action-done':item.log?'btn btn-secondary':urgent?'btn btn-danger':'btn btn-primary',disabled:Boolean(item.log&&isFrontlineClinical),onClick:()=>openMar(item.order,item.time)},item.log?(isFrontlineClinical?'Recorded ✓':'View / Correct'):(urgent?'Resolve Dose':'Record Dose'))
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

    let table=null;
    if(tab==='Active Prescriptions')table=h(LogTable,{className:'medication-log-table',title:'Active Prescription Register',subtitle:'Current medicines transcribed during admission or patient update',heads:['Patient','Medicine / Strength','Route','Frequency','Duration','Time','Food','Special instruction','Latest MAR','Action'],rows:prescriptionRows(visibleActive)});
    if(tab==='Today’s MAR')table=h(LogTable,{className:'medication-log-table medication-mar-table',title:historicalMarFilter?`Medication Administration · ${appliedMarDates()[0]} to ${appliedMarDates().slice(-1)[0]}`:"Today’s Medication Administration",subtitle:historicalMarFilter?'Scheduled doses and administration records for the applied date period':'Scheduled doses and current administration status',heads:historicalMarFilter?['Patient','Date','Medicine','Time','Status','Administered','Entry recorded','Entry audit','Remarks','Action']:['Patient','Medicine','Time','Status','Administered','Entry recorded','Entry audit','Remarks','Action'],rows:marRows(visibleToday)});
    if(tab==='Missed Medicines')table=h(LogTable,{className:'medication-log-table medication-mar-table',title:'Overdue / Exception Medicines',subtitle:'Unresolved overdue doses and medicine exceptions requiring clinical review',heads:['Patient','Medicine','Time','Status','Administered','Entry recorded','Entry audit','Reason / Remarks','Action'],rows:marRows(visibleMissed)});
    if(tab==='Completed Medicines')table=h(LogTable,{className:'medication-log-table',title:'Completed Medicine Courses',subtitle:'Prescription courses completed by status or end date',heads:['Patient','Medicine / Strength','Route','Frequency','Duration','Time','Food','Special instruction','Latest MAR','Action'],rows:prescriptionRows(visibleCompleted)});
    if(tab==='Discontinued Medicines')table=h(LogTable,{className:'medication-log-table',title:'Discontinued Medicines',subtitle:'Stopped or inactive prescriptions retained for history',heads:['Patient','Medicine / Strength','Route','Frequency','Duration','Time','Food','Special instruction','Latest MAR'],rows:prescriptionRows(visibleDiscontinued).map(row=>row.slice(0,-1))});

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
    }

    const targetTimes=marTarget?Array.from(new Set([...parseTimes(marTarget.scheduled_times),marForm.scheduled_time].filter(Boolean))):[];
    const currentEntryDelay=marForm.administered_at?Math.max(0,Math.round((Date.now()-new Date(marForm.administered_at).getTime())/60000)):0;
    const currentIsLateEntry=currentEntryDelay>30;
    const lateEntryReasons=['Forgot to record immediately','Emergency patient care','Network or device issue','Medicine administered by another staff member','Patient-related delay','Doctor instruction','Other'];
    return h(React.Fragment,null,
      h(Section,{title:'Medication Administration & Prescription Register',subtitle:'Unified prescription history and MAR status from the patient record'},
        state.error&&h('div',{className:'message error'},`Unable to load part of the medication register: ${state.error}`),
        state.reviewSetupError&&h('div',{className:'message error'},'Medication Review database upgrade is not yet installed. Run MEDICATION_REVIEW_MIGRATION_v2.11.26.sql in Supabase SQL Editor before using Doctor Review / Modify.'),
        !useFrontlinePriority&&h('div',{className:'panel-head'},
          h('div',{className:'field',style:{minWidth:'260px',marginBottom:0}},h('label',null,'Patient filter'),h('select',{value:patientFilter,onChange:e=>setPatientFilter(e.target.value)},h('option',{value:''},'All patients'),state.patients.filter(p=>p.is_active!==false).map(p=>h('option',{key:p.id,value:p.id},`${formalName(p)||p.full_name} · ${p.patient_id||'No ID'}`)))),
          h('div',{className:'actions'},canReviseMedication&&h('button',{type:'button',className:'btn btn-primary',disabled:Boolean(state.reviewSetupError),onClick:()=>openMedicationReview(patientFilter)},'Doctor Review / Modify'),h('button',{type:'button',className:'btn btn-secondary',onClick:load},state.loading?'Loading…':'Refresh'))
        ),
        !useFrontlinePriority&&h('div',{className:'medication-register-filters'},
          h('div',{className:'field'},h('label',null,'Period'),h('select',{value:periodFilter,onChange:e=>{setPeriodFilter(e.target.value);if(e.target.value!=='All'){setDateFrom('');setDateTo('');}}},['All','Today','7 Days','30 Days'].map(x=>h('option',{key:x,value:x},x)))),
          h('div',{className:'field'},h('label',null,'From date'),h('input',{type:'date',max:dateTo||today,value:dateFrom,onChange:e=>{setDateFrom(e.target.value);setPeriodFilter('All');}})),
          h('div',{className:'field'},h('label',null,'To date'),h('input',{type:'date',min:dateFrom||undefined,max:today,value:dateTo,onChange:e=>{setDateTo(e.target.value);setPeriodFilter('All');}})),
          h('button',{type:'button',className:'btn btn-primary',onClick:()=>setAppliedMedicationFilter({period:periodFilter,from:dateFrom,to:dateTo})},'Apply Filter'),
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setPeriodFilter('All');setDateFrom('');setDateTo('');setAppliedMedicationFilter({period:'All',from:'',to:''});}},'Clear Filter')
        ),
        !useFrontlinePriority&&h('div',{className:'time-chip-list',style:{marginTop:'12px'}},tabs.map(([name,count])=>h('button',{type:'button',key:name,className:`btn ${tab===name?'btn-primary':'btn-secondary'}`,onClick:()=>setTab(name)},`${name} (${count})`)))
      ),
      !patientFilter&&h(DischargeMedicationReview),
      state.loading?h('div',{className:'card panel loading'},'Loading medication register…'):(useFrontlinePriority?nurseMedicationCards:table),
      reviewOpen&&h('div',{className:'modal-backdrop medication-review-backdrop',onClick:e=>{if(e.target===e.currentTarget&&!reviewBusy)setReviewOpen(false)}},
        h('form',{className:'card modal medication-review-modal',onSubmit:saveMedicationReview},
          h('div',{className:'panel-head'},h('div',null,h('h3',null,'Doctor Review / Modify Medication'),h('small',null,'Only medication-review fields are shown. Previous prescriptions and MAR entries are never overwritten.')),h('button',{type:'button',className:'close',disabled:reviewBusy,onClick:()=>setReviewOpen(false)},'×')),
          reviewMessage&&h('div',{className:'message error'},reviewMessage),
          h('div',{className:'message',style:{marginBottom:'12px'}},'Effective-time safety: doses scheduled before the new order takes effect remain under the previous prescription. Doses at or after the effective time follow the revised prescription.'),
          h('div',{className:'modal-grid'},
            h('div',{className:'field span-2'},h('label',null,'Patient'),h('select',{required:true,value:reviewForm.patient_id,onChange:e=>initializeReviewPatient(e.target.value)},h('option',{value:''},'Select patient'),state.patients.filter(p=>p.is_active!==false).map(p=>h('option',{key:p.id,value:p.id},`${formalName(p)||p.full_name} · ${p.patient_id||'No ID'} · Room ${p.room_no||'—'}`)))),
            h('div',{className:'field'},h('label',null,'Doctor Review Date & Time'),h('input',{type:'datetime-local',required:true,max:localDateTimeValue(),value:reviewForm.reviewed_at,onChange:e=>setReviewForm({...reviewForm,reviewed_at:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Effective From Date & Time'),h('input',{type:'datetime-local',required:true,max:localDateTimeValue(),value:reviewForm.effective_from,onChange:e=>setReviewForm({...reviewForm,effective_from:e.target.value})})),
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
            h('div',{className:'section-title'},h('div',null,h('h4',null,'Medication Changes'),h('small',null,'For each existing medicine select Continue, Modify or Stop. Add new medicines separately.')),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setReviewForm(current=>({...current,changes:[...current.changes,blankReviewMedicine('Add')]}))},'Add New Medicine')),
            reviewForm.changes.length?reviewForm.changes.map((row,index)=>h('div',{className:`medication-review-change ${String(row.action).toLowerCase()}`,key:row.client_id||index},
              h('div',{className:'medication-review-change-head'},h('strong',null,row.original_order_id?`${row.medicine_name||'Medicine'} ${row.strength||''}`:'New Medicine'),h('select',{value:row.action,onChange:e=>updateReviewChange(index,{action:e.target.value})},row.original_order_id?['Continue','Modify','Stop'].map(x=>h('option',{key:x,value:x},x)):h('option',{value:'Add'},'Add New'))),
              ['Continue','Stop'].includes(row.action)?h('div',{className:'medication-review-readonly'},h('span',null,`${row.frequency} · ${row.route} · ${parseTimes(row.times).map(medicationTimeLabel).join(', ')}`),row.special_instruction&&h('small',null,row.special_instruction)):h('div',{className:'medication-review-fields'},
                miniInput('Medicine',row.medicine_name,v=>updateReviewChange(index,{medicine_name:v}),true),
                miniInput('Strength',row.strength,v=>updateReviewChange(index,{strength:v}),true),
                miniSelect('Frequency',row.frequency,medicationFrequencies,v=>updateReviewChange(index,{frequency:v,times:(MEDICATION_FREQUENCY_TIMES[v]||parseTimes(row.times)).join(', ') })),
                miniSelect('Route',row.route,medicationRoutes,v=>updateReviewChange(index,{route:v})),
                h(MedicationTimeSelector,{label:'Time',value:row.times,onChange:v=>updateReviewChange(index,{times:v}),required:true}),
                miniSelect('Food',row.food_instruction,medicationFood,v=>updateReviewChange(index,{food_instruction:v})),
                miniSelect('Duration',row.duration,medicationDurations,v=>updateReviewChange(index,{duration:v})),
                row.duration==='Custom'&&miniInput('Custom days',row.custom_duration_days,v=>updateReviewChange(index,{custom_duration_days:v}),true,'number'),
                miniInput('Special instruction',row.special_instruction,v=>updateReviewChange(index,{special_instruction:v}))
              ),
              row.action!=='Continue'&&h('div',{className:'field',style:{marginTop:'8px'}},h('label',null,'Change / Stop Note'),h('input',{value:row.change_note||'',onChange:e=>updateReviewChange(index,{change_note:e.target.value}),placeholder:'Optional medicine-specific reason / instruction'})),
              !row.original_order_id&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setReviewForm(current=>({...current,changes:current.changes.filter((_,i)=>i!==index)}))},'Remove New Medicine')
            )):h('p',{className:'small-note'},'No active medicines. Use Add New Medicine if the doctor has prescribed treatment.')
          ),
          h('div',{className:'modal-actions medication-review-actions'},h('button',{type:'button',className:'btn btn-secondary',disabled:reviewBusy,onClick:()=>setReviewOpen(false)},'Close'),h('button',{className:'btn btn-primary',disabled:reviewBusy||!reviewForm.patient_id},reviewBusy?'Applying Review…':'Apply Doctor Review & Update Medication'))
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
            h('div',{className:'field'},h('label',null,'Status'),h('select',{value:marForm.status,onChange:e=>setMarForm({...marForm,status:e.target.value})},['Given','Delayed','Refused','Missed'].map(status=>h('option',{key:status,value:status},status)))),
            marForm.status==='Refused'&&h('label',{className:'checkbox span-2'},h('input',{type:'checkbox',checked:!!marForm.reschedule,onChange:e=>setMarForm({...marForm,reschedule:e.target.checked,rescheduled_time:e.target.checked?(marForm.rescheduled_time||''):''})}),' Re-medication required — reschedule this refused dose'),
            marForm.status==='Refused'&&marForm.reschedule&&h('div',{className:'field span-2'},h('label',null,'Re-medication Time'),h('input',{type:'time',required:true,value:marForm.rescheduled_time,onChange:e=>setMarForm({...marForm,rescheduled_time:e.target.value})}),h('small',null,'A new medication alert will be created for this time. The original refusal remains permanently in MAR history.')),
            h('div',{className:'field span-2'},h('label',null,'Actual Administration Time'),h(StrictDateTimeInput,{value:marForm.administered_at,onChange:e=>setMarForm({...marForm,administered_at:e.target.value}),required:true}),h('small',null,'The system records the MAR entry time automatically and staff cannot edit it.')),
            currentIsLateEntry&&h('div',{className:'message warning span-2'},`Late entry detected: this record is being entered approximately ${currentEntryDelay} minutes after the stated administration time. Justification is compulsory.`),
            currentIsLateEntry&&h('div',{className:'field'},h('label',null,'Late Entry Reason'),h('select',{value:marForm.late_entry_reason,onChange:e=>setMarForm({...marForm,late_entry_reason:e.target.value}),required:true},h('option',{value:''},'Select reason'),lateEntryReasons.map(reason=>h('option',{key:reason,value:reason},reason)))),
            currentIsLateEntry&&h('div',{className:'field'},h('label',null,'Entry Delay'),h('input',{value:`${currentEntryDelay} minutes`,readOnly:true})),
            currentIsLateEntry&&h('div',{className:'field span-2'},h('label',null,'Detailed Late Entry Justification'),h('textarea',{rows:3,value:marForm.late_entry_justification,onChange:e=>setMarForm({...marForm,late_entry_justification:e.target.value}),placeholder:'Explain why the medicine was not documented immediately, who administered it, and any verification performed.',required:true})),
            h('div',{className:'field span-2'},h('label',null,marForm.status==='Given'?'Clinical Remarks (optional)':'Reason / Clinical Remarks (required)'),h('textarea',{rows:4,value:marForm.remarks,onChange:e=>setMarForm({...marForm,remarks:e.target.value}),placeholder:marForm.status==='Given'?'Any observation after administration':'Enter the medicine exception reason and action taken',required:marForm.status!=='Given'}))
          ),
          h('div',{className:'modal-actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:closeMar,disabled:marBusy},'Cancel'),h('button',{className:'btn btn-primary',disabled:marBusy},marBusy?'Saving MAR…':'Save MAR'))
        )
      )
    );
  }


