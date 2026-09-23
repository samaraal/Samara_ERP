  function IntelligentReports({profile}){
    const today=new Date().toISOString().slice(0,10);
    const [patients,setPatients]=React.useState([]);
    const [mode,setMode]=React.useState('Resident-wise');
    const [patientId,setPatientId]=React.useState('');
    const [reportDate,setReportDate]=React.useState(today);
    const [busy,setBusy]=React.useState(false);
    const [message,setMessage]=React.useState('');
    const [report,setReport]=React.useState(null);
    const [shareOpen,setShareOpen]=React.useState(false);
    const [shareRecipient,setShareRecipient]=React.useState('Relative');
    const [shareType,setShareType]=React.useState('Full Intelligent Report');
    const [shareLanguage,setShareLanguage]=React.useState('English');
    const [communicationRows,setCommunicationRows]=React.useState([]);
    const [shareBusy,setShareBusy]=React.useState(false);

    React.useEffect(()=>{
      client.from('patients').select('*').order('full_name').then(({data,error})=>{
        if(error)setMessage(error.message);else setPatients(data||[]);
      });
    },[]);

    async function loadCommunicationHistory(){
      const {data,error}=await client.from('patient_communications').select('*').order('created_at',{ascending:false}).limit(100);
      if(!error)setCommunicationRows(data||[]);
    }
    React.useEffect(()=>{loadCommunicationHistory()},[]);

    const dateOnly=value=>{
      if(!value)return '';
      const d=new Date(value);
      if(Number.isNaN(d.getTime()))return String(value).slice(0,10);
      return d.toISOString().slice(0,10);
    };
    const eventDate=(row,fields)=>{for(const f of fields){if(row&&row[f])return dateOnly(row[f]);}return '';};
    const patientName=id=>{const row=patients.find(p=>p.id===id);return row?formalName(row):'Unknown patient';};
    const money=value=>`₹${Number(value||0).toLocaleString('en-IN')}`;
    const safeRows=result=>result?.data||[];
    const byPatient=(rows,id)=>rows.filter(r=>r.patient_id===id);
    const byDay=(rows,date,fields)=>rows.filter(r=>eventDate(r,fields)===date);
    const latest=(rows,fields)=>[...rows].sort((a,b)=>new Date(eventDate(b,fields)||0)-new Date(eventDate(a,fields)||0))[0]||null;
    const text=value=>String(value||'').trim();
    const sentence=value=>{const v=text(value);return v?v.replace(/[.\s]+$/,'')+'.':'';};
    const dayStart=value=>{const d=value?new Date(value):null;if(!d||Number.isNaN(d.getTime()))return null;return new Date(d.getFullYear(),d.getMonth(),d.getDate());};
    const lengthOfStay=(patient,asOn)=>{
      const start=dayStart(patient?.admission_date);
      if(!start)return {days:null,label:'Not available'};
      const end=dayStart(patient?.discharge_date||asOn||new Date())||dayStart(new Date());
      const days=Math.max(0,Math.floor((end-start)/86400000)+1);
      return {days,label:days===1?'1 day':`${days} days`};
    };
    const vitalFields=['systolic','diastolic','pulse','temperature','respiration','spo2','blood_sugar','weight'];
    // Pain score is intentionally excluded from deciding whether a vital row was
    // actually recorded because older schemas defaulted pain_score to 0. That
    // default must not turn an otherwise empty row into a measured observation.
    const vitalNumber=value=>{
      if(value===null||value===undefined)return null;
      const raw=String(value).trim();
      if(!raw||['—','-','--','null','undefined','nan','n/a','na'].includes(raw.toLowerCase()))return null;
      const number=Number(raw.replace(/,/g,''));
      return Number.isFinite(number)?number:null;
    };
    // Legacy blank vital fields may have been stored as numeric zero. Zero is not a
    // plausible recorded value for BP, pulse, temperature, respiration, SpO2,
    // blood sugar or weight, so treat it as "not entered". Pain score 0 remains valid.
    const vitalMeasurement=(row,key)=>{
      const number=vitalNumber(row?.[key]);
      if(number===null)return null;
      if(number===0&&key!=='pain_score')return null;
      return number;
    };
    const hasVitalValues=row=>vitalFields.some(key=>vitalMeasurement(row,key)!==null);
    const validVitals=rows=>(rows||[]).filter(hasVitalValues);
    const normaliseTemperature=value=>{
      const measured=vitalNumber(value);
      if(measured===null||measured===0)return null;
      // Most Indian clinical entries use Fahrenheit (for example 98.4). Convert
      // plausible Fahrenheit values before applying Celsius thresholds.
      if(measured>=70&&measured<=115)return (measured-32)*5/9;
      if(measured>=25&&measured<=45)return measured;
      return null;
    };
    const vitalAlert=row=>{
      if(!hasVitalValues(row))return '';
      const systolic=vitalMeasurement(row,'systolic'),diastolic=vitalMeasurement(row,'diastolic'),pulse=vitalMeasurement(row,'pulse'),temperature=normaliseTemperature(row?.temperature),respiration=vitalMeasurement(row,'respiration'),spo2=vitalMeasurement(row,'spo2'),sugar=vitalMeasurement(row,'blood_sugar');
      const critical=(spo2!==null&&spo2<90)||(systolic!==null&&(systolic>=180||systolic<80))||(diastolic!==null&&(diastolic>=120||diastolic<50))||(pulse!==null&&(pulse>130||pulse<40))||(temperature!==null&&(temperature>=39.5||temperature<35))||(respiration!==null&&(respiration>30||respiration<8))||(sugar!==null&&(sugar>400||sugar<50));
      if(critical)return 'critical';
      const warning=(spo2!==null&&spo2<94)||(systolic!==null&&(systolic>=160||systolic<90))||(diastolic!==null&&(diastolic>=100||diastolic<60))||(pulse!==null&&(pulse>110||pulse<50))||(temperature!==null&&(temperature>=38||temperature<35.5))||(respiration!==null&&(respiration>24||respiration<10))||(sugar!==null&&(sugar>250||sugar<70));
      return warning?'warning':'normal';
    };
    // Conservative report-only assessment. It uses only clearly measured values
    // displayed in the report and never trusts a legacy stored alert label.
    const reportVitalAlert=row=>{
      const systolic=vitalMeasurement(row,'systolic');
      const diastolic=vitalMeasurement(row,'diastolic');
      const pulse=vitalMeasurement(row,'pulse');
      const spo2=vitalMeasurement(row,'spo2');
      const sugar=vitalMeasurement(row,'blood_sugar');
      const has=[systolic,diastolic,pulse,spo2,sugar].some(v=>v!==null);
      if(!has)return '';
      if((spo2!==null&&spo2<90)||(systolic!==null&&(systolic>=180||systolic<80))||(diastolic!==null&&(diastolic>=120||diastolic<50))||(pulse!==null&&(pulse>130||pulse<40))||(sugar!==null&&(sugar>400||sugar<50)))return 'critical';
      if((spo2!==null&&spo2<94)||(systolic!==null&&(systolic>=160||systolic<90))||(diastolic!==null&&(diastolic>=100||diastolic<60))||(pulse!==null&&(pulse>110||pulse<50))||(sugar!==null&&(sugar>250||sugar<70)))return 'warning';
      return 'normal';
    };
    const reportVitals=rows=>(rows||[]).filter(row=>reportVitalAlert(row));
    const roleName=id=>{const row=report?.staffMap?.[id];return row?formalName(row):(id||'Staff member');};
    async function resolveReportPatientPhoto(patient,documents){
      if(!patient)return '';
      let path=patient.photo_storage_path||'';
      if(!path){
        const photo=(documents||[]).filter(d=>d.patient_id===patient.id&&/patient photo|photograph/i.test(String(d.document_type||''))).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0))[0];
        path=photo?.storage_path||'';
      }
      if(!path)return '';
      const {data}=await client.storage.from('patient-documents').createSignedUrl(path,1800);
      return data?.signedUrl||'';
    }

    function conditionAssessment(patient,vitals,incidents,mar){
      const measured=reportVitals(vitals);
      const critical=measured.filter(v=>reportVitalAlert(v)==='critical');
      const warning=measured.filter(v=>reportVitalAlert(v)==='warning');
      const severeIncidents=(incidents||[]).filter(i=>['high','critical','severe'].includes(String(i.severity||'').toLowerCase())&&String(i.status||'Open').toLowerCase()!=='closed');
      const exceptions=(mar||[]).filter(m=>String(m.status||'').toLowerCase()!=='given');
      if(critical.length||severeIncidents.length)return {label:'Requires clinical review',tone:'critical',reason:`${critical.length} genuinely critical measured observation(s) and ${severeIncidents.length} serious incident(s) are recorded.`};
      if(warning.length||exceptions.length>=2||patient?.oxygen_required)return {label:'Stable under observation',tone:'warning',reason:'Monitoring is continuing because an abnormal measured observation or care concern is recorded.'};
      if(!measured.length)return {label:'Clinically stable',tone:'stable',reason:'No abnormal clinical event is recorded. Vital signs were not entered for the selected period.'};
      return {label:'Clinically stable',tone:'stable',reason:'The measured observations available for the selected period are within the report thresholds, and no serious incident is recorded.'};
    }

    function referralAssessment(patient,vitals,incidents){
      const measured=validVitals(vitals);
      const critical=reportVitals(vitals).some(v=>reportVitalAlert(v)==='critical');
      const severe=(incidents||[]).some(i=>['high','critical','severe'].includes(String(i.severity||'').toLowerCase())&&String(i.status||'Open').toLowerCase()!=='closed');
      if(critical||severe)return 'Prompt review by the treating doctor is advisable. Referral or transfer to a higher centre should be considered only after clinical reassessment and according to the doctor’s advice.';
      if(patient?.oxygen_required||patient?.dressing_required||patient?.aspiration_risk)return 'Continue close observation and scheduled medical review. Escalation may be considered if there is any deterioration or inadequate response to the present care plan.';
      return 'The patient is stable on the available records, and no immediate higher-centre referral is indicated. Continue the prescribed treatment and routine medical follow-up.';
    }

    function patientHumanNarrative(p,d){
      const status=conditionAssessment(p,d.vitals,d.incidents,d.mar);
      const admissionSource=[
        'Previous Hospital / Care Centre',
        'Post-operative Recovery'
      ].includes(p.admission_type)
        ?`following discharge from ${p.hospital_name||'a hospital or care centre'}`
        :p.admission_type==='Doctor Referral'
          ?`on referral by ${p.referring_doctor||p.treating_doctor||'the referring doctor'}`
          :p.admission_type==='Hospital Transfer'
            ?`as a transfer from ${p.hospital_name||'another care centre'}`
            :p.admission_type==='Short Stay / Respite Care'
              ?'for short-stay or respite care'
              :'as a direct elderly-care admission to Samara';
      const pronoun=String(p.gender||'').toLowerCase()==='female'?'She':String(p.gender||'').toLowerCase()==='male'?'He':'The patient';
      const stay=lengthOfStay(p,reportDate);
      const intro='Admission Summary: '+`${formalName(p)||'The patient'} (${p.patient_id||'patient ID not assigned'}) was admitted ${admissionSource} on ${p.admission_date||'the recorded admission date'} with ${p.diagnosis?`a diagnosis of ${p.diagnosis}`:`a requirement for ${p.patient_category||'assisted-living care'}`}. ${stay.days!==null?`${pronoun} has completed ${stay.label} of stay as on ${formatDateIN(reportDate)}. `:''}${p.allergies?`Known allergies: ${p.allergies}.`:'No allergy is documented in the available record.'}`;
      const medPlan=(d.medicationOrders||[]).filter(x=>x.is_active!==false);
      const carePlan=(d.careOrders||[]).filter(x=>x.is_active!==false);
      const medDetails=medPlan.slice(0,6).map(x=>`${x.medicine_name||'Medicine'}${x.strength?` ${x.strength}`:''}${x.dose?` - ${x.dose}`:''}${x.route?` (${x.route})`:''}${Array.isArray(x.scheduled_times)&&x.scheduled_times.length?` at ${x.scheduled_times.join(', ')}`:''}`).join('; ');
      const careDetails=carePlan.slice(0,8).map(x=>`${x.care_type||'Care task'}${x.shift?` - ${x.shift}`:''}${x.frequency?` - ${x.frequency}`:''}${x.instruction?` (${x.instruction})`:''}`).join('; ');
      const completedMeds=(d.mar||[]).filter(x=>String(x.status||'').toLowerCase()==='given').length;
      const careSentences=[];
      if(medPlan.length)careSentences.push(`Treatment is continuing according to the active prescription${medDetails?`: ${medDetails}`:''}. ${completedMeds} administered dose record(s) are available for the selected period`);
      else careSentences.push('No active medicine prescription is available in the selected record');
      if(carePlan.length)careSentences.push(`The active care plan includes ${careDetails}`);
      else if(d.care.length)careSentences.push(`${d.care.length} nursing/personal-care activity record(s) were entered during the period`);
      else careSentences.push('Routine assisted-living support is continuing; no separate detailed care-plan order is recorded');
      if(d.physioOrders?.length||d.physioSessions.length)careSentences.push(`Physiotherapy is ${d.physioSessions.length?'documented during the period':'included in the active plan'}${d.physioOrders?.length?`: ${d.physioOrders.slice(0,4).map(x=>`${x.therapy_type||'Therapy'}${x.frequency?` - ${x.frequency}`:''}`).join('; ')}`:''}`);
      if(p.diet_plan||p.feeding_instruction||d.meals.length)careSentences.push(`Dietary care is being provided${p.diet_plan?` as ${p.diet_plan}`:''}${p.feeding_instruction?` with instructions: ${p.feeding_instruction}`:''}${d.meals.length?`; ${d.meals.length} meal/intake record(s) are available`:''}`);
      const careText='Care and Treatment Provided: '+careSentences.join('. ')+'.';
      const measured=reportVitals(d.vitals);
      const latestVital=latest(measured,['recorded_at','created_at']);
      const latestText=latestVital?`The latest measured observations were BP ${vitalMeasurement(latestVital,'systolic')??'—'}/${vitalMeasurement(latestVital,'diastolic')??'—'} mmHg, pulse ${vitalMeasurement(latestVital,'pulse')??'—'}/min, SpO₂ ${vitalMeasurement(latestVital,'spo2')??'—'}% and blood sugar ${vitalMeasurement(latestVital,'blood_sugar')!==null?`${latestVital.blood_sugar_type||'RBS'} ${vitalMeasurement(latestVital,'blood_sugar')} mg/dL`:'—' }.`:'No measured vital-sign values were entered for this reporting period.';
      const current=`Current Clinical Status: ${pronoun} is clinically stable on the available records unless a genuine abnormal measurement or serious incident is specifically listed below. ${status.reason} ${latestText}`;
      const familyNoted=d.incidents.some(i=>i.family_informed===true||/family|relative|attendant/i.test(String(i.immediate_action||i.remarks||i.description||'')));
      const family=`Family Communication: ${familyNoted?'The available records indicate that the family/attendant was informed regarding the patient’s condition or a significant event.':'No specific family communication entry is available for the selected reporting period.'}`;
      const next=`Plan and Recommendation: ${referralAssessment(p,d.vitals,d.incidents)} Continue care strictly according to the active prescription and care plan, including nursing assistance, diet, physiotherapy and documented risk precautions.`;
      return [intro,careText,current,family,next];
    }

    function dailyPatientNarrative(p,all){
      const d={
        vitals:byPatient(all.vitals,p.id),care:byPatient(all.care,p.id),mar:byPatient(all.mar,p.id),meals:byPatient(all.meals,p.id),physioSessions:byPatient(all.physioSessions,p.id),incidents:byPatient(all.incidents,p.id)
      };
      const status=conditionAssessment(p,d.vitals,d.incidents,d.mar);
      const activity=[];
      if(d.mar.length)activity.push(`${d.mar.filter(x=>String(x.status||'').toLowerCase()==='given').length}/${d.mar.length} medicine action(s) given`);
      if(d.care.length)activity.push(`${d.care.length} care task(s)`);
      if(d.meals.length)activity.push(`${d.meals.length} meal/intake record(s)`);
      if(d.physioSessions.length)activity.push(`${d.physioSessions.length} physiotherapy session(s)`);
      if(d.vitals.length)activity.push(`${d.vitals.length} vital-sign check(s)`);
      const exception=d.mar.filter(x=>String(x.status||'').toLowerCase()!=='given').length;
      return `${formalName(p)} (${p.patient_id||'No ID'}, Room ${p.room_no||'unassigned'}${p.bed_no?`/${p.bed_no}`:''}) — ${status.label}. ${activity.length?activity.join(', '):'No clinical activity was entered'}.${exception?` ${exception} medicine exception(s) require review.`:''}${d.incidents.length?` ${d.incidents.length} incident(s) were recorded.`:''}`;
    }

    async function generate(e,requestedMode){
      if(e)e.preventDefault();
      const activeMode=requestedMode||mode;
      setMessage('');setReport(null);
      if(isFutureDateIndia(reportDate)){
        const today=todayISOIndia();
        setReportDate(today);
        setMessage(`Future report dates are not permitted. Report Date has been reset to today (${formatDateIN(today)}).`);
        return;
      }
      if(activeMode==='Resident-wise'&&!patientId){setMessage('Select a patient.');return;}
      if(activeMode==='Day-wise'&&!reportDate){setMessage('Select a report date.');return;}
      setBusy(true);
      try{
        const results=await Promise.all([
          client.from('patients').select('*'),client.from('vital_signs').select('*'),client.from('care_logs').select('*'),client.from('care_orders').select('*'),client.from('medication_orders').select('*'),client.from('medication_administrations').select('*'),client.from('meal_records').select('*'),client.from('physiotherapy_plans').select('*'),client.from('physiotherapy_sessions').select('*'),client.from('incidents').select('*'),client.from('billing_transactions').select('*'),client.from('recovery_events').select('*'),client.from('shift_handovers').select('*'),client.from('patient_documents').select('*'),client.from('profiles').select('*'),client.from('audit_log').select('*'),client.from('medication_reviews').select('*'),client.from('medication_review_items').select('*'),client.from('bill_charge_requests').select('id,patient_id,charge_date,service_datetime,category,service_name,description,quantity,unit,status,approval_status,remarks,raised_by_name,raised_at,created_at').eq('category','Nursing Procedures')
        ]);
        const [pats,vitals,care,careOrders,orders,mar,meals,physioOrders,physioSessions,incidents,billing,recovery,handovers,documents,staff,audit,medicationReviews,medicationReviewItems,nursingProcedures]=results.map(safeRows);
        const selectedPatient=pats.find(p=>p.id===patientId)||patients.find(p=>p.id===patientId)||null;
        if(activeMode==='Resident-wise'&&selectedPatient&&isFutureDateIndia(selectedPatient.admission_date)){
          throw new Error(`The Patient File contains a future Admission Date (${formatDateIN(selectedPatient.admission_date)}). Please correct it in Patient Edit before generating or sharing the report.`);
        }
        const dayData={
          vitals:byDay(vitals,reportDate,['recorded_at','created_at']),care:byDay(care,reportDate,['completed_at','created_at','care_date']),careOrders:careOrders.filter(x=>x.is_active!==false),mar:byDay(mar,reportDate,['administered_at','created_at','scheduled_date']),meals:byDay(meals,reportDate,['served_at','created_at','meal_date']),physioSessions:byDay(physioSessions,reportDate,['session_at','created_at','session_date']),incidents:byDay(incidents,reportDate,['incident_at','created_at']),billing:byDay(billing,reportDate,['transaction_date','created_at']),recovery:byDay(recovery,reportDate,['event_at','created_at']),handovers:byDay(handovers,reportDate,['created_at','handover_date']),documents:byDay(documents,reportDate,['created_at','report_date']),audit:byDay(audit,reportDate,['created_at']),nursingProcedures:byDay(nursingProcedures,reportDate,['service_datetime','charge_date','raised_at','created_at'])
        };
        const data=activeMode==='Resident-wise'?{
          patients:selectedPatient?[selectedPatient]:[],vitals:byDay(byPatient(vitals,patientId),reportDate,['recorded_at','created_at']),care:byDay(byPatient(care,patientId),reportDate,['completed_at','created_at','care_date']),careOrders:byPatient(careOrders,patientId).filter(x=>x.is_active!==false),medicationOrders:byPatient(orders,patientId),mar:byDay(byPatient(mar,patientId),reportDate,['administered_at','created_at','scheduled_date']),meals:byDay(byPatient(meals,patientId),reportDate,['served_at','created_at','meal_date']),physioOrders:byPatient(physioOrders,patientId).filter(x=>x.is_active!==false),physioSessions:byDay(byPatient(physioSessions,patientId),reportDate,['session_at','created_at','session_date']),incidents:byDay(byPatient(incidents,patientId),reportDate,['incident_at','created_at']),billing:byPatient(billing,patientId),recovery:byDay(byPatient(recovery,patientId),reportDate,['event_at','created_at']),handovers:byDay(byPatient(handovers,patientId),reportDate,['created_at','handover_date']),documents:byPatient(documents,patientId),medicationReviews:byDay(byPatient(medicationReviews,patientId),reportDate,['reviewed_at','created_at']),medicationReviewItems:medicationReviewItems.filter(item=>medicationReviews.some(review=>review.patient_id===patientId&&review.id===item.review_id)),nursingProcedures:byDay(byPatient(nursingProcedures,patientId),reportDate,['service_datetime','charge_date','raised_at','created_at'])
        }:{...dayData,patients:pats.filter(p=>p.is_active!==false&&dateOnly(p.admission_date)<=reportDate),newAdmissions:pats.filter(p=>dateOnly(p.admission_date)===reportDate)};
        const charges=data.billing.filter(x=>x.transaction_type==='Charge').reduce((a,x)=>a+Number(x.amount||0),0);
        const payments=data.billing.filter(x=>x.transaction_type==='Payment').reduce((a,x)=>a+Number(x.amount||0),0);
        const discounts=data.billing.filter(x=>x.transaction_type==='Discount').reduce((a,x)=>a+Number(x.amount||0),0);
        const criticalVitals=reportVitals(data.vitals).filter(x=>reportVitalAlert(x)==='critical');
        const medicineExceptions=data.mar.filter(x=>String(x.status||'').toLowerCase()!=='given');
        const activeStaffIds=new Set();
        [...data.care,...data.mar,...data.vitals,...data.physioSessions,...data.incidents,...(data.audit||[])].forEach(r=>[r.completed_by,r.administered_by,r.recorded_by,r.performed_by,r.reported_by,r.user_id].filter(Boolean).forEach(id=>activeStaffIds.add(id)));
        const staffMap=Object.fromEntries(staff.map(x=>[x.id,x]));
        const onDuty=staff.filter(x=>activeStaffIds.has(x.id));
        const patientPhoto=mode==='Resident-wise'?await resolveReportPatientPhoto(selectedPatient,documents):'';
        setMode(activeMode);setReport({mode:activeMode,patient:selectedPatient,patientPhoto,date:reportDate,data,staffMap,onDuty,summary:{charges,payments,discounts,outstanding:charges-payments-discounts,criticalVitals:criticalVitals.length,medicinesGiven:data.mar.filter(x=>String(x.status||'').toLowerCase()==='given').length,medicineExceptions:medicineExceptions.length,openingPatients:activeMode==='Day-wise'?data.patients.length:0,newAdmissions:activeMode==='Day-wise'?data.newAdmissions.length:0}});
      }catch(error){setMessage(error.message||'Unable to generate report.');}
      setBusy(false);
    }

    async function printReport(){
      if(report?.mode!=='Resident-wise')return window.print();
      const p=selectedPatient();if(!p)return alert('Generate a patient report first.');
      const preview=window.open('about:blank','_blank');
      setBusy(true);
      try{
        const {data:{session}}=await client.auth.getSession();
        if(!session)throw new Error('Your ERP session has expired. Please sign in again.');
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/daily-patient-report`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`,'apikey':cfg.supabasePublishableKey},body:JSON.stringify({mode:'generate_only',patient_id:p.id,report_date:report?.date||reportDate})});
        const result=await response.json().catch(()=>({ok:false,error:'Unable to read report server response.'}));
        if(!response.ok||result?.ok===false||!result?.report_url)throw new Error(result?.error||`Report generation failed (${response.status})`);
        if(preview)preview.location.href=result.report_url;else window.open(result.report_url,'_blank','noopener');
      }catch(error){if(preview)preview.close();alert(`Intelligent Report PDF could not be generated: ${error.message||error}`)}
      finally{setBusy(false)}
    }
    function section(title,items,renderer){return h('div',{className:'intelligent-report-section'},h('h3',null,title),items.length?h('div',{className:'intelligent-report-list'},items.map((x,i)=>h('div',{className:'intelligent-report-item',key:i},renderer(x)))):h('p',{className:'small-note'},'No records for this report.'));}
    function narrative(){
      if(!report)return [];
      if(report.mode==='Resident-wise')return patientHumanNarrative(report.patient||{},report.data);
      const d=report.data,s=report.summary;
      const opening=`The facility opened the day with ${s.openingPatients} active patient(s). ${s.newAdmissions} new admission(s) were recorded${d.newAdmissions?.length?`: ${d.newAdmissions.map(p=>formalName(p)).join(', ')}`:'.'}`;
      const clinical=`Clinical activity included ${d.vitals.length} vital-sign check(s), ${d.care.length} care task(s), ${d.mar.length} medicine action(s), ${d.meals.length} meal/intake record(s) and ${d.physioSessions.length} physiotherapy session(s). ${s.criticalVitals} critical vital alert(s), ${s.medicineExceptions} medicine exception(s) and ${d.incidents.length} incident(s) require review.`;
      const staffing=`Recorded care activity was entered by ${report.onDuty.length} employee(s) during the day${report.onDuty.length?`: ${report.onDuty.map(x=>`${formalName(x)} (${x.role})`).join(', ')}`:'. No staff activity could be derived from the available records.'}`;
      const finance=`The financial statement for the day shows charges of ${money(s.charges)}, payments of ${money(s.payments)}, discounts of ${money(s.discounts)} and a net outstanding movement of ${money(s.outstanding)}.`;
      const close=`Overall, the day was ${s.criticalVitals||d.incidents.length?'clinically active and requires managerial/medical follow-up on the alerts noted below':'operationally stable on the available records'}. Resident-wise details are provided in the following section.`;
      return [opening,clinical,staffing,finance,close];
    }

    const selectedPatient=()=>report?.mode==='Resident-wise'?(report.patient||patients.find(p=>p.id===patientId)):null;
    const relativeName=p=>p?.attendant_name||p?.relative_name||p?.emergency_contact_name||p?.family_contact_name||'Authorised Relative';
    const patientPhone=p=>p?.mobile||p?.patient_mobile||p?.phone||'';
    const relativePhone=p=>p?.attendant_phone||p?.relative_phone||p?.emergency_contact_phone||p?.family_contact_phone||p?.reference_contact||'';
    const reportStatusText=()=>{
    const p=selectedPatient();
    if(!p)return '';
    const date=formatDateIN(report?.date||reportDate);
    const base=`${formalName(p)}'s care report dated ${date} has been prepared by Samara Care.`;
    return base;
    };
    function quickHealthSummary(language='English'){
      const p=selectedPatient();
      const d=report?.data||{};
      if(!p)return '';
      const measured=reportVitals(d.vitals||[]);
      const lastVital=latest(measured,['recorded_at','created_at']);
      const assessment=conditionAssessment(p,d.vitals||[],d.incidents||[],d.mar||[]);
      const status=assessment.tone==='critical'?'Clinical review required':assessment.tone==='warning'?'Under observation':'Stable';
      const mar=d.mar||[];
      const care=d.care||[];
      const meals=d.meals||[];
      const physio=d.physioSessions||[];
      const incidents=d.incidents||[];
      const givenRows=mar.filter(x=>String(x.status||'').toLowerCase()==='given');
      const given=givenRows.length;
      const orderMap=Object.fromEntries((d.medicationOrders||[]).map(order=>[order.id,order]));
      const medicineNames=[...new Set(givenRows.map(row=>{
        const order=orderMap[row.order_id]||{};
        return [row.medicine_name||order.medicine_name,row.strength||row.dose||order.strength||order.dose].filter(Boolean).join(' ').trim();
      }).filter(Boolean))];
      const medicineList=medicineNames.join(', ');
      const exceptions=mar.filter(x=>!['given','completed'].includes(String(x.status||'').toLowerCase())).length;
      const completedCare=care.filter(x=>['completed','done','given'].includes(String(x.status||'').toLowerCase())).length;
      const mealCount=meals.length;
      const physioCompleted=physio.filter(x=>String(x.status||'').toLowerCase()==='completed').length;
      const vitalParts=[];
      if(lastVital){
        const sys=vitalMeasurement(lastVital,'systolic'),dia=vitalMeasurement(lastVital,'diastolic');
        const pulse=vitalMeasurement(lastVital,'pulse'),spo2=vitalMeasurement(lastVital,'spo2');
        const temp=vitalMeasurement(lastVital,'temperature'),sugar=vitalMeasurement(lastVital,'blood_sugar');
        if(sys!==null||dia!==null)vitalParts.push(`BP ${sys??'—'}/${dia??'—'} mmHg`);
        if(pulse!==null)vitalParts.push(`Pulse ${pulse}/min`);
        if(spo2!==null)vitalParts.push(`SpO₂ ${spo2}%`);
        if(temp!==null)vitalParts.push(`Temperature ${temp}°`);
        if(sugar!==null)vitalParts.push(`${lastVital.blood_sugar_type||'RBS'} ${sugar} mg/dL`);
      }
      const date=formatDateIN(report?.date||reportDate);
      if(language==='Tamil'){
        const statusTamil=status==='Stable'?'நிலை சீராக உள்ளது':status==='Under observation'?'கண்காணிப்பில் உள்ளார்':'மருத்துவ பரிசீலனை தேவை';
        const lines=[
          `தேதி: ${date}`,
          `தற்போதைய நிலை: ${statusTamil}`,
          vitalParts.length?`சமீபத்திய உயிர்க்குறிகள்: ${vitalParts.join(' | ')}`:'இன்றைய உயிர்க்குறி பதிவு இல்லை.',
          mar.length?`வழங்கப்பட்ட மருந்துகள்: ${given} முறை${medicineList?` — ${medicineList}`:''}${exceptions?`; ${exceptions} விதிவிலக்கு/தாமதம் பதிவாகியுள்ளது`:''}.`:'இன்றைய மருந்து நிர்வாக பதிவு இல்லை.',
          care.length?`தினசரி பராமரிப்பு: ${completedCare} பணிகள் நிறைவு.`:'இன்றைய தினசரி பராமரிப்பு பதிவு இல்லை.',
          mealCount?`உணவு/திரவ பதிவு: ${mealCount}.`:'இன்றைய உணவு/திரவ பதிவு இல்லை.',
          physio.length?`உடற்பயிற்சி: ${physioCompleted} அமர்வுகள் நிறைவு.`:'இன்றைய உடற்பயிற்சி பதிவு இல்லை.',
          incidents.length?`சம்பவங்கள்: ${incidents.length} பதிவு — மேலாண்மை பரிசீலனை தேவை.`:'சம்பவம் எதுவும் பதிவாகவில்லை.'
        ];
        return lines.join('\n');
      }
      const lines=[
        `Report date: ${date}`,
        `Current status: ${status}`,
        vitalParts.length?`Latest vitals: ${vitalParts.join(' | ')}`:'No vital-sign reading was recorded for the selected date.',
        mar.length?`Medicines given: ${given} administration${given===1?'':'s'} recorded${medicineList?` — ${medicineList}`:''}${exceptions?`; ${exceptions} exception${exceptions===1?'':'s'} require review`:''}.`:'No medicine administration was recorded for the selected date.',
        care.length?`Daily care: ${completedCare} task${completedCare===1?'':'s'} completed.`:'No daily-care activity was recorded for the selected date.',
        mealCount?`Food and intake: ${mealCount} record${mealCount===1?'':'s'} available.`:'No food or intake record was entered for the selected date.',
        physio.length?`Physiotherapy: ${physioCompleted} session${physioCompleted===1?'':'s'} completed.`:'No physiotherapy session was recorded for the selected date.',
        incidents.length?`Incidents: ${incidents.length} event${incidents.length===1?'':'s'} recorded and requiring review.`:'Incidents: None recorded.'
      ];
      return lines.join('\n');
    }

    function buildWhatsAppMessage(p,recipientType){
    const recipient=recipientType==='Patient'?(formalName(p)||'Resident'):relativeName(p);
    const patientLabel=formalName(p)||'the resident';
    const date=formatDateIN(report?.date||reportDate);
    if(shareLanguage==='Tamil'){
      if(shareType==='Full Intelligent Report'){
        return `வணக்கம் ${recipient},\n\n${patientLabel} அவர்களின் ${date} தேதியிட்ட முழுமையான Intelligent Patient Report தயாராக உள்ளது. இந்த அறிக்கை ரகசியமானது; அங்கீகரிக்கப்பட்ட பெறுநருக்காக மட்டுமே பகிரப்படுகிறது.\n\nWhatsApp-இல் இணைக்கப்பட்ட PDF அறிக்கையைப் பார்க்கவும். மருத்துவ அவசர நிலை இருந்தால், Samara Care குழுவை நேரடியாக தொடர்புகொள்ளவும்.\n\nSamara Health Care LLP`;
      }
      return `வணக்கம் ${recipient},\n\n${patientLabel} அவர்களின் விரைவு உடல்நிலை அறிக்கை\n\n${quickHealthSummary('Tamil')}\n\nஇந்த சுருக்கம் தேர்ந்தெடுக்கப்பட்ட தேதிக்கான Samara Care ERP பதிவுகளிலிருந்து உருவாக்கப்பட்டது. கூடுதல் விளக்கம் அல்லது அவசர மருத்துவ உதவி தேவைப்பட்டால் Samara Care குழுவை தொடர்புகொள்ளவும்.\n\nSamara Health Care LLP`;
    }
    if(shareType==='Full Intelligent Report'){
      return `Dear ${recipient},\n\nPlease find the full Intelligent Patient Report for ${patientLabel}, dated ${date}.\n\nThis report is confidential and intended only for the authorised recipient. Please review the attached PDF. For any urgent clinical concern, contact the Samara Care team directly.\n\nRegards,\nSamara Health Care LLP`;
    }
    return `Dear ${recipient},\n\nQuick Health Update for ${patientLabel}\n\n${quickHealthSummary('English')}\n\nThis update is generated from the records entered in Samara Care ERP for the selected date. Please contact the Samara Care team for clarification or urgent clinical concerns.\n\nRegards,\nSamara Health Care LLP`;
    }
    async function recordCommunication(p,recipientType,number,messageText){
    const {data:{user}}=await client.auth.getUser();
    const payload={
      patient_id:p.id,
      communication_type:shareType,
      method:'WhatsApp',
      recipient_type:recipientType,
      recipient_name:recipientType==='Patient'?(formalName(p)||p.full_name):relativeName(p),
      recipient_number:number,
      report_date:report?.date||reportDate,
      status:'WhatsApp Opened',
      message_preview:messageText.slice(0,500),
      sent_by:user?.id||profile?.auth_user_id||profile?.id
    };
    const {error}=await client.from('patient_communications').insert(payload);
    if(error)console.warn('Communication history could not be saved:',error);
    }
    async function sendDailyReportWhatsAppApi(){
    if(!['Admin','Manager'].includes(profile.role))return alert('WhatsApp report sharing is available only to Admin and Manager.');
    const p=selectedPatient();
    if(!p)return alert('Generate a patient report before sharing.');
    const raw=relativePhone(p);
    const number=normalizeWhatsAppRecipient(raw);
    if(!number)return alert('Authorised relative WhatsApp number is not available. Please update the Patient File first.');
    setShareBusy(true);
    try{
      const {data:{session}}=await client.auth.getSession();
      if(!session)throw new Error('Your ERP session has expired. Please sign in again.');
      const response=await fetch(`${cfg.supabaseUrl}/functions/v1/daily-patient-report`,{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Authorization':`Bearer ${session.access_token}`,
          'apikey':cfg.supabasePublishableKey
        },
        body:JSON.stringify({
          mode:'manual',
          patient_id:p.id,
          report_date:report?.date||reportDate,
          recipient_mobile:number,
          recipient_name:relativeName(p)||'Family Member'
        })
      });
      const result=await response.json().catch(()=>({ok:false,error:'Unable to read report server response.'}));
      if(!response.ok||result?.ok===false)throw new Error(result?.error||`Report WhatsApp request failed (${response.status})`);
      await recordCommunication(p,'Relative',number,`Full Intelligent Patient Report PDF sent through WhatsApp API for ${formatDateIN(report?.date||reportDate)}. Meta ID: ${result?.provider_message_id||'—'}`);
      alert('Full Intelligent Patient Report PDF was accepted by Meta. The PDF is attached to the WhatsApp message; delivery status will follow in WhatsApp Logs.');
      setShareOpen(false);loadCommunicationHistory();
    }catch(apiError){
      alert(`Full report PDF could not be sent through WhatsApp API: ${apiError.message||apiError}`);
    }
    setShareBusy(false);
    }

    async function openWhatsAppShare(){
    if(!['Admin','Manager'].includes(profile.role))return alert('WhatsApp report sharing is available only to Admin and Manager.');
    const p=selectedPatient();
    if(!p)return alert('Generate a patient report before sharing.');
    const targets=shareRecipient==='Both'?['Patient','Relative']:[shareRecipient];
    const missing=[];
    const prepared=[];
    targets.forEach(type=>{
      const raw=type==='Patient'?patientPhone(p):relativePhone(p);
      const number=whatsappNumber(raw);
      if(!number)missing.push(type);
      else prepared.push({type,number,text:buildWhatsAppMessage(p,type)});
    });
    if(missing.length)return alert(`WhatsApp number is not available for: ${missing.join(', ')}. Please update the Patient File first.`);
    if(shareType==='Full Intelligent Report'){
      alert('Please first use “Print / Save PDF” to save the report. WhatsApp will now open with the prepared message; attach the saved PDF manually before sending.');
    }
    setShareBusy(true);
    for(const item of prepared){
      window.open(`https://wa.me/${item.number}?text=${encodeURIComponent(brandWhatsAppText(item.text))}`,'_blank','noopener');
      await recordCommunication(p,item.type,item.number,item.text);
    }
    setShareBusy(false);setShareOpen(false);loadCommunicationHistory();
    }

    const patientReportBody=()=>{
      const p=report.patient||{};
      const d=report.data||{};
      const status=conditionAssessment(p,d.vitals||[],d.incidents||[],d.mar||[]);
      const measured=reportVitals(d.vitals||[]);
      const lastVital=latest(measured,['recorded_at','created_at']);
      const stay=lengthOfStay(p,report.date||reportDate);
      const given=(d.mar||[]).filter(x=>String(x.status||'').toLowerCase()==='given').length;
      const late=(d.mar||[]).filter(x=>String(x.status||'').toLowerCase()==='late').length;
      const omitted=(d.mar||[]).filter(x=>['missed','omitted','refused','not given'].includes(String(x.status||'').toLowerCase())).length;
      const completedCare=(d.care||[]).filter(x=>['completed','done','given'].includes(String(x.status||'').toLowerCase())).length;
      const physioCompleted=(d.physioSessions||[]).filter(x=>String(x.status||'').toLowerCase()==='completed').length;
      const incidentCount=(d.incidents||[]).length;
      const statusLabel=status.tone==='critical'?'REQUIRES CLINICAL REVIEW':status.tone==='warning'?'UNDER OBSERVATION':'STABLE';
      const vitals=[
        ['Blood Pressure',lastVital&&(vitalMeasurement(lastVital,'systolic')!==null||vitalMeasurement(lastVital,'diastolic')!==null)?`${vitalMeasurement(lastVital,'systolic')??'—'} / ${vitalMeasurement(lastVital,'diastolic')??'—'} mmHg`:'—'],
        ['Pulse Rate',lastVital&&vitalMeasurement(lastVital,'pulse')!==null?`${vitalMeasurement(lastVital,'pulse')} /min`:'—'],
        ['SpO₂',lastVital&&vitalMeasurement(lastVital,'spo2')!==null?`${vitalMeasurement(lastVital,'spo2')} %`:'—'],
        ['Temperature',lastVital&&vitalMeasurement(lastVital,'temperature')!==null?`${vitalMeasurement(lastVital,'temperature')} °`:'—'],
        ['Respiratory Rate',lastVital&&vitalMeasurement(lastVital,'respiration')!==null?`${vitalMeasurement(lastVital,'respiration')} /min`:'—'],
        ['Blood Sugar',lastVital&&vitalMeasurement(lastVital,'blood_sugar')!==null?`${lastVital.blood_sugar_type||'RBS'} · ${vitalMeasurement(lastVital,'blood_sugar')} mg/dL`:'Not Taken'],
        ['Weight',lastVital&&vitalMeasurement(lastVital,'weight')!==null?`${vitalMeasurement(lastVital,'weight')} kg`:'—']
      ];
      const box=(title,icon,rows,note)=>h('div',{className:'clinical-box'},
        h('h3',null,h('span',{className:'clinical-box-icon','aria-hidden':'true'},icon),title),
        h('div',{className:'clinical-box-rows'},rows.map(([label,value])=>h('div',{className:'clinical-box-row',key:label},h('span',null,label),h('strong',null,value)))),
        note?h('div',{className:'clinical-box-note'},note):null
      );
      const staffName=id=>formalName(report.staffMap?.[id]||{})||report.staffMap?.[id]?.full_name||'Not recorded';
      const orderMap=Object.fromEntries((d.medicationOrders||[]).map(x=>[x.id,x]));
      const careOrderMap=Object.fromEntries((d.careOrders||[]).map(x=>[x.id,x]));
      const sortedVitals=[...(d.vitals||[])].sort((a,b)=>new Date(b.recorded_at||b.created_at)-new Date(a.recorded_at||a.created_at));
      const previousVital=sortedVitals[1]||null;
      const trend=(current,previous)=>current==null||previous==null?'Not enough data':Number(current)>Number(previous)?'Increased':Number(current)<Number(previous)?'Decreased':'Stable';
      const vitalAssessment=row=>reportVitalAlert(row)==='critical'?'Critical':reportVitalAlert(row)==='warning'?'Review':'Within range';
      const latestReview=[...(d.medicationReviews||[])].sort((a,b)=>new Date(b.reviewed_at||b.created_at)-new Date(a.reviewed_at||a.created_at))[0]||null;
      const reviewChanges=latestReview?(d.medicationReviewItems||[]).filter(x=>x.review_id===latestReview.id):[];
      const latestHandover=[...(d.handovers||[])].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0]||null;
      const wellbeingSource=[...(d.care||[]).map(x=>x.remarks),latestHandover?.patient_summary,latestHandover?.special_instructions].filter(Boolean).join(' ');
      const wellbeing=[
        ['Food Intake',(d.meals||[]).map(x=>`${x.meal_type||'Meal'}: ${x.consumption_status||'Recorded'}`).filter(Boolean).join(' · ')||'Not separately recorded'],
        ['Mobility',/mobil|walk|ambulat|turn|position/i.test(wellbeingSource)?'Documented':'Not separately recorded'],
        ['Pain',/pain/i.test(wellbeingSource)?'Mentioned in nursing record':'Not separately recorded'],
        ['Sleep',/sleep/i.test(wellbeingSource)?'Documented':'Not separately recorded'],
        ['Consciousness / Orientation',/orient|conscious|alert/i.test(wellbeingSource)?'Documented':'Not separately recorded'],
        ['Oxygen Support',p.oxygen_required?'Required':'Not recorded as required']
      ];
      const detailTable=(heads,rows,empty='No records available for the selected report date.')=>h('div',{className:'report-detail-table-wrap'},
        h('table',{className:'report-detail-table'},
          h('thead',null,h('tr',null,heads.map(head=>h('th',{key:head},head)))),
          h('tbody',null,rows.length
            ?rows.map((row,i)=>h('tr',{key:i},row.map((value,j)=>h('td',{key:j,'data-label':heads[j]},value??'—'))))
            :h('tr',null,h('td',{colSpan:heads.length,className:'empty'},empty)))
        )
      );
      const medicationRows=[...(d.mar||[])].sort((a,b)=>String(a.scheduled_time||a.scheduled_at||'').localeCompare(String(b.scheduled_time||b.scheduled_at||''))).map(row=>{const order=orderMap[row.order_id||row.medication_order_id]||{};return [row.scheduled_time||String(row.scheduled_at||'').slice(11,16)||'—',row.administered_at?fmt(row.administered_at):'—',row.medicine_name||order.medicine_name||'Medicine',row.dose||row.strength||order.dose||order.strength||'—',row.route||order.route||'—',row.status||'Recorded',row.remarks||row.exception_reason||staffName(row.administered_by)]});
      const procedureRows=[...(d.nursingProcedures||[])].sort((a,b)=>new Date(a.service_datetime||a.raised_at||a.created_at)-new Date(b.service_datetime||b.raised_at||b.created_at)).map(row=>[row.service_datetime?fmt(row.service_datetime):formatDateIN(row.charge_date||row.created_at),row.service_name||'Nursing Procedure',row.status||row.approval_status||'Recorded',row.quantity?`${row.quantity}${row.unit?` ${row.unit}`:''}`:'—',row.remarks||row.description||'—',row.raised_by_name||'—']);
      const careRows=[...(d.care||[])].sort((a,b)=>new Date(a.completed_at||a.created_at)-new Date(b.completed_at||b.created_at)).map(row=>{const order=careOrderMap[row.care_order_id]||{};return [order.care_type||order.task_name||row.care_type||'Care activity',row.shift||order.shift||'—',row.status||'Recorded',fmt(row.completed_at||row.created_at),row.remarks||'—',staffName(row.completed_by)]});
      const nextPlan=[latestHandover?.pending_tasks&&['Pending tasks',latestHandover.pending_tasks],latestHandover?.special_instructions&&['Special instructions',latestHandover.special_instructions],latestHandover?.patient_summary&&['Patient summary',latestHandover.patient_summary],(d.medicationOrders||[]).filter(x=>x.is_active!==false&&!x.stopped_at).length&&['Medication plan',`Continue ${(d.medicationOrders||[]).filter(x=>x.is_active!==false&&!x.stopped_at).length} active prescription item(s) at the ordered times.`],(d.careOrders||[]).length&&['Care plan',`Continue ${(d.careOrders||[]).length} active care-plan item(s).`]].filter(Boolean);
    return h(React.Fragment,null,
        h('div',{className:'hospital-report-title'},
          h('div',{className:'hospital-report-brand'},
            h('img',{className:'hospital-report-logo',src:BRAND_LOGO_SRC,alt:'Samara Assisted Living'}),
            h('div',{className:'hospital-report-title-copy'},
              h('strong',null,'SAMARA HEALTH CARE LLP'),
              h('span',null,'Assisted Living Management System'),
              h('h1',null,'PATIENT CARE REPORT'),
              h('small',null,`Generated on · ${formatDateTimeIN(new Date())}`)
            )
          )
        ),
        h('div',{className:'resident-overview-card'},
          h('div',{className:'resident-overview-heading'},'RESIDENT OVERVIEW'),
          h('div',{className:'resident-overview-grid'},
            h('div',{className:'resident-overview-photo'},report.patientPhoto?h('img',{src:report.patientPhoto,alt:formalName(p)}):h('div',{className:'report-photo-placeholder'},'SC')),
            h('div',{className:'resident-overview-main'},
              h('h2',null,formalName(p)||'Patient'),
              h('div',{className:'overview-detail-grid'},
                h('div',null,h('b',null,'Resident ID'),h('span',null,p.patient_id||'—')),
                h('div',null,h('b',null,'Room / Bed'),h('span',null,`${p.room_no||'Unassigned'}${p.bed_no?`-${p.bed_no}`:''}`)),
                h('div',null,h('b',null,'Admission Type'),h('span',null,p.admission_type||'—')),
                h('div',null,h('b',null,'Admission Date'),h('span',null,formatDateIN(p.admission_date))),
                h('div',null,h('b',null,'Duration of Stay'),h('span',null,stay.label))
              )
            ),
            h('div',{className:'resident-overview-clinical'},
              h('div',null,h('b',null,'Diagnosis'),h('span',null,p.diagnosis||'Not recorded')),
              h('div',null,h('b',null,'Treating Doctor'),h('span',null,p.treating_doctor||p.referring_doctor||'Not recorded')),
              h('div',null,h('b',null,'Allergies'),h('span',null,p.allergies||'None recorded')),
              h('div',null,h('b',null,'Emergency Contact'),h('span',null,`${p.emergency_contact_name||p.attendant_name||'Not available'}${p.emergency_contact_number||p.attendant_phone?` · ${p.emergency_contact_number||p.attendant_phone}`:''}`))
            )
          ),
          h('div',{className:`clinical-current-status ${status.tone}`},h('span',null,'✓'),h('b',null,'Current Status'),h('strong',null,statusLabel))
        ),
        h('div',{className:'clinical-summary-card'},
          h('h3',null,'CLINICAL CARE SUMMARY'),
          narrative().map((line,i)=>{const split=String(line||'').indexOf(':');return h('p',{key:i},split>0?h(React.Fragment,null,h('b',{className:'clinical-summary-label'},String(line).slice(0,split)),h('b',{className:'clinical-summary-colon'},':'),` ${String(line).slice(split+1).trim()}`):line)})
        ),
        h('div',{className:'clinical-report-grid'},
          box('VITAL SIGNS SUMMARY','♥',vitals,lastVital?`Latest available observation: ${fmt(lastVital.recorded_at||lastVital.created_at)}`:'No vital observations were recorded for the selected period.'),
          box('MEDICATION ADMINISTRATION','●',[["Medicines Scheduled",(d.mar||[]).length],["Medicines Given",given],["Late",late],["Missed / Omitted",omitted]],(d.mar||[]).length?'Medication activity is summarised above.':'No medication records for the selected period.'),
          box('DAILY CARE AND NURSING','♟',[["Care Activities Planned",(d.careOrders||[]).length],["Care Activities Recorded",(d.care||[]).length],["Care Activities Completed",completedCare],["Assistance with ADL",(d.care||[]).length?'Recorded':'—']],(d.care||[]).length?'Care entries are summarised above.':'No care activity records for the selected period.'),
          box('FOOD, DIET AND INTAKE','♨',[["Diet Type",p.diet_type||p.food_preference||'Normal Diet'],["Meal Records",(d.meals||[]).length],["Average Intake",(d.meals||[]).length?'Recorded':'—'],["Hydration Status",'—']],(d.meals||[]).length?'Meal and intake records are available.':'No intake records for the selected period.'),
          box('PHYSIOTHERAPY','♿',[["Sessions Planned",(d.physioOrders||[]).length],["Sessions Recorded",(d.physioSessions||[]).length],["Sessions Completed",physioCompleted],["Remarks",(d.physioSessions||[]).length?'Available':'—']],(d.physioSessions||[]).length?'Physiotherapy activity is summarised above.':'No physiotherapy records for the selected period.'),
          box('INCIDENT REPORTS','▲',[["Total Incidents",incidentCount],["Falls",(d.incidents||[]).filter(x=>/fall/i.test(String(x.incident_type||x.type||''))).length],["Medical Emergencies",(d.incidents||[]).filter(x=>/emergency|transfer/i.test(String(x.incident_type||x.type||''))).length],["Open Incidents",(d.incidents||[]).filter(x=>String(x.status||'Open').toLowerCase()!=='closed').length]],incidentCount?'Incident details are available below.':'No reportable incidents during the selected period.')
        ),
        h('div',{className:'financial-summary-card'},
          h('h3',null,'₹  FINANCIAL STATEMENT'),
          h('div',{className:'financial-summary-grid'},
            h('div',null,h('span',null,'Charges'),h('strong',null,money(report.summary.charges))),
            h('div',null,h('span',null,'Payments / Advances'),h('strong',null,money(report.summary.payments))),
            h('div',null,h('span',null,'Discounts'),h('strong',null,money(report.summary.discounts))),
            h('div',{className:'outstanding'},h('span',null,'Outstanding Balance'),h('strong',null,money(report.summary.outstanding)))
          )
        ),
        h('div',{className:'recovery-summary-card'},h('h3',null,'↗  RECOVERY / PROGRESS TIMELINE'),(d.recovery||[]).length?h('div',{className:'intelligent-report-list'},d.recovery.map((r,i)=>h('div',{className:'intelligent-report-item',key:i},h('strong',null,r.event_type||'Progress'),h('span',null,`${r.note||'—'} · ${fmt(r.event_at||r.created_at)}`)))):h('p',null,'No progress timeline data is available for the selected period.')),
        h('div',{className:'hospital-report-footer'},
          h('div',null,h('strong',null,'Samara Health Care LLP'),h('span',null,'Assisted Living Management System'),h('em',null,'Caring with Compassion. Living with Dignity.')),
          h('div',null,h('span',null,'Prepared by'),h('strong',null,formalName(profile))),
          h('div',null,h('span',null,'Generated on'),h('strong',null,formatDateTimeIN(new Date())))
        ),
        h('p',{className:'family-portal-report-note'},'For full details, log in to the Samara Family Portal with the provided login details: ',h('a',{href:'https://family.samaraassistedliving.com/',target:'_blank',rel:'noopener noreferrer'},'https://family.samaraassistedliving.com/')),
        h('div',{className:'report-page-break'}),
        h('div',{className:'clinical-annexure'},
          h('div',{className:'annexure-title'},h('div',null,h('h2',null,'DETAILED CLINICAL ANNEXURE'),h('p',null,`${formalName(p)} · ${p.patient_id||'—'} · Room ${p.room_no||'—'}${p.bed_no?`-${p.bed_no}`:''} · ${formatDateIN(report.date||reportDate)}`)),h('span',null,'PAGE 2 OF 2')),
          h('div',{className:'annexure-section'},h('h3',null,'TODAY AT A GLANCE AND CHANGES'),
            h('div',{className:'wellbeing-grid'},wellbeing.map(([label,value])=>h('div',{key:label},h('span',null,label),h('strong',null,value)))),
            h('div',{className:'change-summary'},
              h('p',null,lastVital&&previousVital?`Vital trend: BP ${vitalMeasurement(lastVital,'systolic')??'—'}/${vitalMeasurement(lastVital,'diastolic')??'—'}; pulse ${trend(vitalMeasurement(lastVital,'pulse'),vitalMeasurement(previousVital,'pulse')).toLowerCase()}; SpO₂ ${trend(vitalMeasurement(lastVital,'spo2'),vitalMeasurement(previousVital,'spo2')).toLowerCase()}.`:lastVital?'Only one vital observation is available for comparison.':'No vital observation is available.'),
              h('p',null,`Medication outcome: ${given} given; ${late} late; ${omitted} missed, omitted or refused.`),
              h('p',null,latestReview?`Doctor review: ${latestReview.doctor_name||'Doctor'} · ${latestReview.clinical_notes||latestReview.review_type||'Review recorded'}${reviewChanges.length?` · Changes: ${reviewChanges.map(x=>`${x.action||'Change'} ${x.medicine_name||'medicine'} ${x.strength||x.dose||''}`.trim()).join('; ')}`:''}`:'No new doctor-review entry for the report date.'),
              h('p',{className:incidentCount?'attention':''},incidentCount?`${incidentCount} incident(s) were recorded and require review.`:'No incident was recorded for the report date.')
            )
          ),
          h('div',{className:'annexure-section'},h('h3',null,'VITAL-SIGN TREND'),detailTable(['Date / Time','Blood Pressure','Pulse','SpO₂','Temperature','Respiratory Rate','Blood Sugar','Assessment'],sortedVitals.map(row=>[fmt(row.recorded_at||row.created_at),`${vitalMeasurement(row,'systolic')??'—'}/${vitalMeasurement(row,'diastolic')??'—'}`,vitalMeasurement(row,'pulse')??'—',vitalMeasurement(row,'spo2')!=null?`${vitalMeasurement(row,'spo2')}%`:'—',vitalMeasurement(row,'temperature')??'—',vitalMeasurement(row,'respiration')??'—',vitalMeasurement(row,'blood_sugar')!=null?`${row.blood_sugar_type||'RBS'} ${vitalMeasurement(row,'blood_sugar')}`:'Not taken',vitalAssessment(row)]))),
          h('div',{className:'annexure-section'},h('h3',null,'MEDICATION ADMINISTRATION DETAILS'),detailTable(['Scheduled','Actual','Medicine','Dose','Route','Status','Remarks / Recorded By'],medicationRows)),
          h('div',{className:'annexure-section'},h('h3',null,'NURSING PROCEDURES'),detailTable(['Date / Time','Procedure','Status','Quantity','Remarks','Recorded By'],procedureRows,'No nursing procedures recorded for the selected report date.')),
          h('div',{className:'annexure-section'},h('h3',null,'DAILY CARE AND NURSING DETAILS'),detailTable(['Care Activity','Shift','Status','Completed At','Remarks','Recorded By'],careRows)),
          h('div',{className:'annexure-two-column',style:{gridTemplateColumns:'1fr'}},
            h('div',{className:'annexure-section'},h('h3',null,'FOOD / FLUID INTAKE'),detailTable(['Meal','Menu','Food Intake','Meal Time','Beverage','Beverage Time'],(d.meals||[]).map(row=>[row.meal_type||'Meal',row.menu||'—',row.consumption_status||'Recorded',fmt(row.served_at),row.beverage_type||'—',row.beverage_time?String(row.beverage_time).slice(0,5):'—']))),
            h('div',{className:'annexure-section'},h('h3',null,'PHYSIOTHERAPY / INCIDENTS'),detailTable(['Type','Status','Notes / Action'],[...(d.physioSessions||[]).map(row=>['Physiotherapy',row.status||'Recorded',row.notes||'—']),...(d.incidents||[]).map(row=>[row.incident_type||row.type||'Incident',`${row.severity||'—'} · ${row.status||'—'}`,row.description||row.immediate_action||'—'])]))
          ),
          h('div',{className:'annexure-section next-plan'},h('h3',null,'NEXT 24 HOURS / HANDOVER PLAN'),nextPlan.length?h('div',{className:'next-plan-list'},nextPlan.map(([label,value],i)=>h('div',{className:'next-plan-row',key:i},h('span',{className:'next-plan-bullet'},'•'),h('b',null,label),h('span',{className:'next-plan-colon'},':'),h('span',null,value)))):h('div',{className:'next-plan-row'},h('span',{className:'next-plan-bullet'},'•'),h('b',null,'Plan'),h('span',{className:'next-plan-colon'},':'),h('span',null,'Continue prescribed treatment, routine nursing care and observation. No separate patient-specific handover instruction was recorded.'))),
          h('p',{className:'annexure-disclaimer'},'This annexure is automatically compiled from ERP entries and does not replace medical advice.'),
          h('p',{className:'family-portal-report-note'},'For full details, log in to the Samara Family Portal with the provided login details: ',h('a',{href:'https://family.samaraassistedliving.com/',target:'_blank',rel:'noopener noreferrer'},'https://family.samaraassistedliving.com/'))
        )
      );
    };

    return h(React.Fragment,null,
      h(Section,{title:'Intelligent Reports',subtitle:'Human-readable patient progress and complete day-wise operational reports'},
        h('form',{className:'intelligent-report-controls intelligent-report-controls-v3',onSubmit:e=>e.preventDefault()},
          h('div',{className:'field report-date-field'},h('label',null,'Report Date'),h(StrictDateInput,{value:reportDate,max:todayISOIndia(),onChange:e=>{const next=e.target.value;if(isFutureDateIndia(next)){const today=todayISOIndia();setReportDate(today);setReport(null);setMessage(`Future report dates are not permitted. Report Date has been reset to today (${formatDateIN(today)}).`);return}setReportDate(next);setReport(null);setMessage('')},required:true})),
          h('div',{className:'field report-patient-field'},h('label',null,'Patient'),h('select',{value:patientId,onChange:e=>{setPatientId(e.target.value);setReport(null);setMessage('')}},h('option',{value:''},'Select patient'),patients.map(p=>h('option',{key:p.id,value:p.id},`${formalName(p)} · ${p.patient_id||'NO-ID'}${p.room_no?` · ${p.room_no}${p.bed_no?`-${p.bed_no}`:''}`:''}`)))),
          h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:e=>generate(e,'Resident-wise')},busy&&mode==='Resident-wise'?'Generating…':'Generate Patient Report'),
          h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:e=>generate(e,'Day-wise')},busy&&mode==='Day-wise'?'Generating…':'Generate Daily Operations Report')
        ),message&&h('div',{className:'message error'},message)
      ),
      report&&h('div',{className:'card panel intelligent-report printable-report hospital-report'},
        h('div',{className:'panel-head no-print'},h('div',null,h('h2',null,report.mode==='Resident-wise'?`Patient Care Report – ${formalName(report.patient)||''}`:`Daily Facility Report – ${formatDateIN(report.date)}`),h('small',null,`Prepared by ${formalName(profile)} on ${formatDateTimeIN(new Date())}`)),h('div',{className:'actions'},report.mode==='Resident-wise'&&['Admin','Manager'].includes(profile.role)&&h('button',{type:'button',className:'btn btn-whatsapp',onClick:()=>setShareOpen(true)},'WhatsApp'),h('button',{className:'btn btn-secondary',disabled:busy,onClick:printReport},busy?'Generating PDF…':'Open / Save PDF'))),
        report.mode==='Resident-wise'?patientReportBody():h(React.Fragment,null,
          h('div',{className:'intelligent-summary human-report'},h('h3',null,'Executive Daily Summary'),narrative().map((p,i)=>h('p',{key:i},p))),
          section('Resident-wise Daily Status',report.data.patients,p=>h(React.Fragment,null,h('strong',null,`${p.patient_id||'NO-ID'} · ${formalName(p)}`),h('span',null,dailyPatientNarrative(p,report.data)))),
          section('Employees Active / On Duty',report.onDuty,x=>h(React.Fragment,null,h('strong',null,formalName(x)),h('span',null,`${x.role||'Employee'} · ${x.employee_id||x.login_id||'—'}`))),
          section('Incident Reports',report.data.incidents,r=>h(React.Fragment,null,h('strong',null,patientName(r.patient_id)),h('span',null,`${r.incident_type||r.type||'Incident'} · ${r.description||r.remarks||'—'} · ${fmt(r.incident_at||r.created_at)}`))),
          section('Financial Statement',report.data.billing,r=>h(React.Fragment,null,h('strong',null,patientName(r.patient_id)),h('span',null,`${r.transaction_type||'—'} · ${money(r.amount)} · ${r.description||'—'}`))),
          h('div',{className:'report-footer'},h('strong',null,'Samara Health Care LLP'),h('span',null,'Assisted Living Management System'),h('span',null,'Caring with Compassion. Living with Dignity.'),h('small',null,`Prepared by ${formalName(profile)} · Generated ${formatDateTimeIN(new Date())}`))
        )
      ),
      ['Admin','Manager'].includes(profile.role)&&communicationRows.length>0&&h(Section,{title:'Report Communication History',subtitle:'Manual WhatsApp sharing activity recorded by the ERP'},
        h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Patient','Report Date','Recipient','Number','Type','Status','Opened By','Date / Time'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,communicationRows.filter(r=>!patientId||r.patient_id===patientId).slice(0,50).map(r=>h('tr',{key:r.id},
            h('td',null,patientName(r.patient_id)),
            h('td',null,formatDateIN(r.report_date)),
            h('td',null,`${r.recipient_type||'—'} · ${r.recipient_name||'—'}`),
            h('td',null,r.recipient_number||'—'),
            h('td',null,r.communication_type||'—'),
            h('td',null,r.status||'—'),
            h('td',null,r.sent_by===profile.id||r.sent_by===profile.auth_user_id?formalName(profile):'Staff'),
            h('td',null,fmt(r.created_at))
          )))
        ))
      ),
      shareOpen&&h('div',{className:'modal-backdrop',onClick:e=>{if(e.target===e.currentTarget)setShareOpen(false)}},
        h('div',{className:'card modal'},
          h('div',{className:'panel-head'},h('div',null,h('h3',null,'Share Intelligent Report through WhatsApp'),h('small',null,reportStatusText())),h('button',{type:'button',className:'close',onClick:()=>setShareOpen(false)},'×')),
          h('div',{className:'modal-grid'},
            h('div',{className:'field'},h('label',null,'Send to'),h('select',{value:shareRecipient,onChange:e=>setShareRecipient(e.target.value)},['Patient','Relative','Both'].map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field'},h('label',null,'Sharing option'),h('select',{value:shareType,onChange:e=>setShareType(e.target.value)},['Quick Health Update','Full Intelligent Report'].map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field'},h('label',null,'Language'),h('select',{value:shareLanguage,onChange:e=>setShareLanguage(e.target.value)},['English','Tamil'].map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field span-2'},h('label',null,'Patient WhatsApp'),h('input',{value:patientPhone(selectedPatient())||'',readOnly:true,placeholder:'Not available'})),
            h('div',{className:'field span-2'},h('label',null,`${relativeName(selectedPatient())} WhatsApp`),h('input',{value:relativePhone(selectedPatient())||'',readOnly:true,placeholder:'Not available'}))
          ),
          shareType==='Quick Health Update'&&h('div',{className:'card panel',style:{marginTop:'12px'}},
            h('h4',null,'Quick Health Update Preview'),
            h('pre',{style:{whiteSpace:'pre-wrap',fontFamily:'inherit',margin:0,lineHeight:'1.55'}},quickHealthSummary(shareLanguage))
          ),
          h('div',{className:'message'},shareType==='Full Intelligent Report'?'The complete A4 Intelligent Patient Report will be generated and attached automatically as a PDF through the WhatsApp API.':'Quick Health Update sends text only. Choose Full Intelligent Report to send the complete PDF.'),
          h('div',{className:'actions'},
            h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setShareOpen(false)},'Cancel'),
            h('button',{type:'button',className:'btn btn-whatsapp',disabled:shareBusy,onClick:sendDailyReportWhatsAppApi},shareBusy?'Generating & Sending PDF…':'Send Full Report PDF WhatsApp API'),
            h('button',{type:'button',className:'btn btn-secondary',disabled:shareBusy,onClick:openWhatsAppShare},shareBusy?'Opening WhatsApp…':'Existing WhatsApp / PDF')
          )
        )
      )
    );
  }

