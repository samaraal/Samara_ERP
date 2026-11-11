  const DAILY_CARE_ACTIVITY_OPTIONS=[
    'Bathing assistance',
    'Restroom/toileting assistance',
    'Oral hygiene',
    'Dressing assistance',
    'Feeding assistance',
    'Walking/mobility assistance',
    'Diaper change',
    'Position change / bedsore prevention',
    'Fluid intake monitoring',
    'Sleep assistance'
  ];

  const normaliseDailyCareActivity = value => {
    const raw=String(value||'').trim();
    const aliases={
      'Restroom assistance':'Restroom/toileting assistance',
      'Mobility assistance':'Walking/mobility assistance',
      'Position change':'Position change / bedsore prevention',
      'Fluid monitoring':'Fluid intake monitoring'
    };
    return aliases[raw]||raw||'Bathing assistance';
  };

  // 2.20.13: a blood glucose check recorded in Daily Care also asks for the reading.
  const dcIsGlucose=v=>/glucose|blood\s*sugar|\bgrbs\b|\bcbg\b|\brbs\b|\bsugar\s*(check|monitor)/i.test(String(v||''));
  const DC_SUGAR_CSS='.dc-sugar-box{margin:6px 0 4px;padding:10px 12px;border:1px solid #f0bfd6;border-radius:12px;background:linear-gradient(135deg,#ffe4f0,#fff3f8)}.dc-sugar-title{font-weight:800;color:#7a1247;font-size:14px;margin-bottom:6px}.dc-sugar-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}.dc-sugar-row .field{margin:0}';
  function DailyCare({profile,onNavigate}){
    const activeShift=currentShift();
    const [patients]=usePatients();
    const [rows,setRows]=React.useState([]);
    const [patientLedgerRows,setPatientLedgerRows]=React.useState([]);
    const [form,setForm]=React.useState({patient_id:'',care_order_id:'',care_type:DAILY_CARE_ACTIVITY_OPTIONS[0],shift:currentShift(),status:'Completed',remarks:''});
    const [saving,setSaving]=React.useState(false);
    const [bedsideScan,setBedsideScan]=React.useState(null); // 2.19.94: bedside QR trial (record-only, OFF by default)
    const [toast,setToast]=React.useState(null);
    const [returnPage,setReturnPage]=React.useState('');
    const toastTimer=React.useRef(null);
    // 2.18.26: the selected Guest's planned Nursing Procedures are offered as activities too.
    const [guestProcedures,setGuestProcedures]=React.useState([]);
    React.useEffect(()=>{
      let live=true;setGuestProcedures([]);
      if(!form.patient_id)return;
      client.from('care_orders').select('id,care_type,order_kind,is_active').eq('patient_id',form.patient_id).eq('is_active',true)
        .then(r=>{if(live&&!r.error)setGuestProcedures([...new Set((r.data||[]).filter(isNursingProcedureOrder).map(o=>String(o.care_type||'').trim()).filter(Boolean))])});
      return()=>{live=false};
    },[form.patient_id]);

    function showToast(type,text){
      const savedWithWarning=type==='success'&&/saved with warning|saved for review|warning/i.test(String(text));
      const noticeType=savedWithWarning?'warning':type;
      showSamaraActionToast(noticeType,savedWithWarning?'Assignment saved with warning':type==='success'?'Success':'Action failed',text);
      clearTimeout(toastTimer.current);
      setToast({type:noticeType,text});
      toastTimer.current=setTimeout(()=>setToast(null),4500);
    }
    React.useEffect(()=>()=>clearTimeout(toastTimer.current),[]);

    async function load(){
      const {data,error}=await client
        .from('care_logs')
        .select('*,patients(full_name,room_no,bed_no)')
        .order('created_at',{ascending:false})
        .limit(100);
      if(error){
        console.error('Recent Daily Care records could not be loaded:',error);
        return false;
      }
      setRows(data||[]);
      return true;
    }
    React.useEffect(()=>{load()},[]);
    React.useEffect(()=>{
      const context=readTaskNavigationContext('Daily Care');
      if(!context){const g=bedsideCurrentGuest();if(g)setForm(current=>current.patient_id?current:{...current,patient_id:g});return;} // 2.20.13
      setForm(current=>({
        ...current,
        patient_id:context.patient_id||current.patient_id,
        care_order_id:context.care_order_id||current.care_order_id,
        scheduled_time:context.scheduled_time||'', // 2.18.27 fixed-time Nursing Procedure
        care_type:normaliseDailyCareActivity(context.care_type||current.care_type),
        shift:context.shift||activeShift,
        status:context.status||'Completed',
        remarks:current.remarks
      }));
      setReturnPage(context.return_page||'');
      clearTaskNavigationContext();
    },[]);

    async function save(e){
      e.preventDefault();
      if(saving)return;
      {const _bb=await bedsideSaveCheck(profile,form.patient_id,bedsideScan);if(_bb){showSamaraActionToast('error','Bedside check needed',_bb);return;}} // 2.19.96
      if(!form.patient_id){
        showToast('error','Please select a patient before saving the care record.');
        return;
      }
      // 2.20.13: Blood Glucose Monitoring done → the reading is compulsory (saved to Vital Signs as well).
      const sugarEntry=dcIsGlucose(form.care_type)&&form.status==='Completed';
      const sugarNum=Number(form.sugar_value);
      if(sugarEntry&&(!form.sugar_type||!form.sugar_value||!Number.isFinite(sugarNum)||sugarNum<10||sugarNum>900)){
        showToast('error','Enter the blood sugar test type (FBS / PPBS / RBS) and the reading in mg/dL (numbers only, e.g. 184).');
        return;
      }
      if(form.shift!==activeShift){
        showToast('error',`${form.shift} has not started. Care can be recorded only for the active ${activeShift}.`);
        return;
      }
      setSaving(true);
      // v2.14.86: always link the entry to the patient's care order for this activity and shift,
      // so the Clinical Alert clears. A link carried over from an alert is kept only if it is
      // for the same patient and the same activity (it was wrong when the nurse changed the activity).
      const chosenActivity=normaliseDailyCareActivity(form.care_type).toLowerCase();
      let linkedOrderId=null,linkedTime=null;
      try{
        const {data:orders}=await client.from('care_orders')
          .select('*') // 2.18.27: includes scheduled_times once SQL 252 is run
          .eq('patient_id',form.patient_id).eq('is_active',true);
        const sameActivity=currentCareTaskOrders(orders||[]).filter(o=>normaliseDailyCareActivity(o.care_type).toLowerCase()===chosenActivity);
        const forShift=sameActivity.filter(o=>o.shift===form.shift||o.shift==='Both shifts');
        const linked=sameActivity.find(o=>o.id===form.care_order_id)||forShift[0]||sameActivity[0]||null;
        linkedOrderId=linked?.id||null;
        // 2.18.27: a fixed-time procedure recorded without a time (picked here directly) → the nearest time.
        const times=linked?nursingProcedureTimes(linked):[];
        if(times.length&&!form.scheduled_time){
          const nowMin=new Date().getHours()*60+new Date().getMinutes();
          const dist=t=>{const d=Math.abs(Number(t.slice(0,2))*60+Number(t.slice(3))-nowMin);return Math.min(d,1440-d)};
          linkedTime=[...times].sort((a,b)=>dist(a)-dist(b))[0];
        }else if(times.length)linkedTime=String(form.scheduled_time).slice(0,5);
      }catch(linkError){
        console.warn('Daily Care order link:',linkError?.message||linkError);
      }
      const now=new Date();
      const payload={
        care_order_id:linkedOrderId,
        patient_id:form.patient_id,
        care_date:todayISOIndia(),
        shift:form.shift,
        status:form.status,
        completed_at:now.toISOString(),
        completed_by:profile.id,
        remarks:`${normaliseDailyCareActivity(form.care_type)}${sugarEntry?`: ${form.sugar_type} ${sugarNum} mg/dL`:''}${form.remarks?.trim()?`${sugarEntry?' · ':': '}${form.remarks.trim()}`:''}`
      };
      if(linkedTime)payload.scheduled_time=linkedTime;
      let {data,error}=await client.from('care_logs').insert(payload).select('id').single();
      if(error&&payload.scheduled_time&&/scheduled_time/i.test(String(error.message||''))){delete payload.scheduled_time;({data,error}=await client.from('care_logs').insert(payload).select('id').single())} // before SQL 252
      if(error){
        console.error('Daily Care save failed:',error);
        showToast('error',error.message||'Daily care record could not be saved.');
        setSaving(false);
        return;
      }

      if(sugarEntry){ // 2.20.13: same reading into Vital Signs (trend, reports, low-sugar alerts)
        const lvl=sugarNum>400||sugarNum<50?'Critical':(sugarNum>250||sugarNum<70?'Warning':'Normal');
        const {error:vErr}=await client.from('vital_signs').insert({patient_id:form.patient_id,blood_sugar_type:form.sugar_type,blood_sugar:sugarNum,alert_level:lvl,
          remarks:`Blood Glucose Monitoring (Daily Care)${form.remarks?.trim()?` · ${form.remarks.trim()}`:''}`,recorded_at:payload.completed_at,recorded_by:profile.id}); // same moment as the care record → the DB sugar-link trigger sees it as already done (no duplicate)
        if(vErr)showSamaraActionToast('error','Sugar not copied to Vital Signs',`The care record is saved, but the reading could not be added to Vital Signs (${vErr.message||'error'}). Please enter it in Vitals.`);
        else if(lvl!=='Normal')showSamaraActionToast('error',`Blood sugar ${lvl}`,`${form.sugar_type} ${sugarNum} mg/dL — ${sugarNum<70?'LOW':'HIGH'}. Inform the Nursing Manager / doctor as per protocol.`);
      }
      {const act=normaliseDailyCareActivity(form.care_type);bedsideRecordTask({kind:(linkedTime||guestProcedures.includes(act))?'procedure':'care',patientId:form.patient_id,refId:linkedOrderId,date:payload.care_date,time:linkedTime,label:`${act} · ${form.status}`,scan:bedsideScan});setBedsideScan(null);} // 2.19.94: separate record, never blocks
      showSamaraActionToast('success','Daily care saved',`${normaliseDailyCareActivity(form.care_type)} recorded successfully for the selected patient.`);showToast('success',`${normaliseDailyCareActivity(form.care_type)} recorded successfully for the selected patient.`);
      setForm(current=>({...current,care_order_id:'',remarks:'',sugar_type:'',sugar_value:''}));
      await load();

      // Audit logging must never block the clinical save.
      writeAuditEvent(
        'Daily Care Recorded',
        'Daily Care',
        data?.id||form.patient_id,
        {
          patient_id:form.patient_id,
          care_order_id:linkedOrderId,
          care_activity:normaliseDailyCareActivity(form.care_type),
          shift:form.shift,
          status:form.status,
          summary:`${normaliseDailyCareActivity(form.care_type)} — ${form.status}`
        },
        'Success'
      );
      setSaving(false);
      finishSuccessfulAction({returnPage,onNavigate});
    }

    return h(React.Fragment,null,
      h(Section,{title:'Daily Care Entry',subtitle:'Bath, restroom, hygiene, feeding, mobility and positioning'},
        returnPage&&h('div',{className:'return-after-save-note'},
          h('strong',null,returnPage==='Clinical Alerts'?'Opened from Clinical Alerts. ':'Opened from Shift Tasks. '),
          `After saving, this care task will be marked against the current shift and the system will return automatically to ${returnPage}.`
        ),
        h('form',{className:'modal-grid',onSubmit:save},
          patientSelect(patients,form.patient_id,v=>setForm({...form,patient_id:v,care_order_id:v===form.patient_id?form.care_order_id:'',scheduled_time:v===form.patient_id?form.scheduled_time:''})),
          h('div',{className:'field'},
            h('label',null,'Care activity'),
            h('select',{
              value:normaliseDailyCareActivity(form.care_type),
              onChange:e=>setForm({...form,care_type:e.target.value,care_order_id:'',scheduled_time:''})
            },
              [...new Set([
                normaliseDailyCareActivity(form.care_type),
                ...DAILY_CARE_ACTIVITY_OPTIONS,
                ...guestProcedures
              ])].map(x=>h('option',{key:x,value:x},guestProcedures.includes(x)?`${x} (Nursing Procedure)`:x))
            ),
            form.care_order_id&&h('small',{className:'linked-task-note'},
              `Linked to the selected Shift Task: ${normaliseDailyCareActivity(form.care_type)}${form.scheduled_time?` · ${nprocTime12(form.scheduled_time)}`:''}`
            )
          ),
          h('div',{className:'field'},h('label',null,'Shift'),h('select',{value:form.shift,onChange:e=>setForm({...form,shift:e.target.value})},
            h('option',{value:'Day Shift (7 AM–7 PM)',disabled:activeShift!=='Day Shift (7 AM–7 PM)'},`Day Shift (7 AM–7 PM)${activeShift==='Day Shift (7 AM–7 PM)'?' · Active':' · Not active'}`),
            h('option',{value:'Night Shift (7 PM–7 AM)',disabled:activeShift!=='Night Shift (7 PM–7 AM)'},`Night Shift (7 PM–7 AM)${activeShift==='Night Shift (7 PM–7 AM)'?' · Active':' · Not active'}`)
          ),h('small',{className:'shift-entry-note'},`Current active shift: ${activeShift}`)),
          miniSelect('Status',form.status,['Completed','Refused','Not required','Pending'],v=>setForm({...form,status:v})),
          dcIsGlucose(form.care_type)&&form.status==='Completed'&&h('div',{className:'dc-sugar-box'},h('style',null,DC_SUGAR_CSS),
            h('div',{className:'dc-sugar-title'},'🩸 Blood sugar reading — saved to Vital Signs too'),
            h('div',{className:'dc-sugar-row'},
              h('div',{className:'field'},h('label',null,'Test type *'),h('select',{value:form.sugar_type||'',onChange:e=>setForm({...form,sugar_type:e.target.value})},h('option',{value:''},'Choose…'),['FBS','PPBS','RBS'].map(x=>h('option',{key:x,value:x},x==='FBS'?'FBS (fasting)':x==='PPBS'?'PPBS (after food)':'RBS (random)')))),
              h('div',{className:'field'},h('label',null,'Reading (mg/dL) *'),h('input',{type:'number',inputMode:'numeric',min:10,max:900,step:'1',value:form.sugar_value||'',placeholder:'e.g. 184',onChange:e=>setForm({...form,sugar_value:e.target.value})})))),
          miniInput('Remarks',form.remarks,v=>setForm({...form,remarks:v})),
          h(BedsideSafe,null,h(BedsideDosePanel,{profile,patient:patients.find(p=>p.id===form.patient_id),value:bedsideScan,onChange:setBedsideScan,disabled:saving})), // 2.19.94: shows nothing unless the QR trial is ON
          h('button',{className:'btn btn-primary',disabled:saving},saving?'Saving care record…':bedsideSaveText(profile,'Save care record'))
        )
      ),
      h(LogTable,{
        title:'Recent Care Records',
        rows:rows.map(r=>[r.patients?.full_name,r.shift,r.status,r.remarks,fmt(r.created_at)]),
        heads:['Patient','Shift','Status','Activity / Remarks','Recorded']
      }),
      toast&&h('div',{className:`samara-toast ${toast.type}`,role:'status','aria-live':'polite'},
        h('span',{className:'samara-toast-icon','aria-hidden':'true'},toast.type==='success'?'✓':'!'),
        h('div',null,
          h('strong',null,toast.type==='success'?'Care record saved':'Save failed'),
          h('span',null,toast.text)
        ),
        h('button',{type:'button','aria-label':'Close notification',onClick:()=>setToast(null)},'×')
      )
    );
  }
  function VitalSigns({profile,onNavigate}){
    const [patients]=usePatients(),[rows,setRows]=React.useState([]),[selectedPatient,setSelectedPatient]=React.useState(''),[form,setForm]=React.useState({patient_id:'',temperature:'',systolic:'',diastolic:'',pulse:'',respiration:'',spo2:'',blood_sugar_type:'Not Taken',blood_sugar:'',weight:'',pain_score:'',remarks:''});
    const [returnPage,setReturnPage]=React.useState('');
    const [bedsideScan,setBedsideScan]=React.useState(null); // 2.19.94: bedside QR trial (record-only, OFF by default)
    const measured=value=>{if(value===null||value===undefined||String(value).trim()==='')return null;const n=Number(value);return Number.isFinite(n)&&n!==0?n:null};
    const tempC=value=>{const n=measured(value);if(n===null)return null;return n>=70&&n<=115?(n-32)*5/9:n};
    const calculateLevel=v=>{const systolic=measured(v.systolic),diastolic=measured(v.diastolic),pulse=measured(v.pulse),temperature=tempC(v.temperature),respiration=measured(v.respiration),spo2=measured(v.spo2),sugar=measured(v.blood_sugar);const any=[systolic,diastolic,pulse,temperature,respiration,spo2,sugar,measured(v.weight),v.pain_score!==''&&v.pain_score!==null?Number(v.pain_score):null].some(x=>x!==null);if(!any)return 'Not Recorded';if((spo2!==null&&spo2<90)||(systolic!==null&&(systolic>=180||systolic<80))||(diastolic!==null&&(diastolic>=120||diastolic<50))||(pulse!==null&&(pulse>130||pulse<40))||(temperature!==null&&(temperature>=39.5||temperature<35))||(respiration!==null&&(respiration>30||respiration<8))||(sugar!==null&&(sugar>400||sugar<50)))return 'Critical';if((spo2!==null&&spo2<94)||(systolic!==null&&(systolic>=160||systolic<90))||(diastolic!==null&&(diastolic>=100||diastolic<60))||(pulse!==null&&(pulse>110||pulse<50))||(temperature!==null&&(temperature>=38||temperature<35.5))||(respiration!==null&&(respiration>24||respiration<10))||(sugar!==null&&(sugar>250||sugar<70)))return 'Warning';return 'Normal'};
    function vitalReading(field,value){
      const number=measured(value);
      if(number===null)return '—';
      const level=calculateLevel({[field]:value,pain_score:null});
      if(level!=='Warning'&&level!=='Critical')return number;
      const low={systolic:90,diastolic:60,pulse:50,temperature:35.5,respiration:10,spo2:94,blood_sugar:70};
      const comparable=field==='temperature'?tempC(value):number;
      const direction=comparable<low[field]?'Low':'High';
      return h('span',{className:'vital-abnormal',title:`${level}: ${direction.toLowerCase()} reading`,'aria-label':`${number}, ${direction.toLowerCase()}, ${level.toLowerCase()}`},`${number} ${direction==='Low'?'↓':'↑'}`);
    }
    function vitalBP(row){return h('span',null,vitalReading('systolic',row.systolic),' / ',vitalReading('diastolic',row.diastolic))}
    function vitalAlert(level){return ['Warning','Critical'].includes(level)?h('strong',{className:'vital-abnormal'},level):level}
    async function load(){const {data}=await client.from('vital_signs').select('*,patients(full_name,title,patient_id,room_no,bed_no)').order('recorded_at',{ascending:false}).limit(150);setRows((data||[]).map(r=>({...r,computed_alert_level:calculateLevel(r)})))}
    React.useEffect(()=>{load();const ch=client.channel('vitals-live').on('postgres_changes',{event:'*',schema:'public',table:'vital_signs'},load).subscribe();return()=>client.removeChannel(ch)},[]);
    React.useEffect(()=>{
      const context=readTaskNavigationContext('Vital Signs');
      if(!context){const g=bedsideCurrentGuest();if(g){setForm(current=>current.patient_id?current:{...current,patient_id:g});setSelectedPatient(g);}return;} // 2.20.13
      setForm(current=>({...current,patient_id:context.patient_id||current.patient_id}));
      setSelectedPatient(context.patient_id||'');
      setReturnPage(context.return_page||'');
      clearTaskNavigationContext();
    },[]);
    async function save(e){e.preventDefault();{const _bb=await bedsideSaveCheck(profile,form.patient_id,bedsideScan);if(_bb){showSamaraActionToast('error','Bedside check needed',_bb);return;}}/* 2.19.96 */const sugarType=form.blood_sugar_type||'Not Taken';const sugarValue=sugarType==='Not Taken'?null:num(form.blood_sugar);if(sugarType!=='Not Taken'&&sugarValue===null){showSamaraActionToast('error','Cannot save vital signs','Please enter the blood sugar value for the selected test type.');return;}const payload={...form,temperature:num(form.temperature),systolic:num(form.systolic),diastolic:num(form.diastolic),pulse:num(form.pulse),respiration:num(form.respiration),spo2:num(form.spo2),blood_sugar_type:sugarType,blood_sugar:sugarValue,weight:num(form.weight),pain_score:form.pain_score===''?null:Number(form.pain_score),recorded_at:new Date().toISOString(),recorded_by:profile.id};const level=calculateLevel(payload);if(level==='Not Recorded'){showSamaraActionToast('error','Cannot save vital signs','Please enter at least one actual vital-sign measurement before saving.');return;}payload.alert_level=level;const {error}=await client.from('vital_signs').insert(payload);if(error){showSamaraActionToast('error','Vital signs save failed',error.message||'Unable to save vital signs.');return;}bedsideRecordTask({kind:'vitals',patientId:form.patient_id,label:'Vital signs',scan:bedsideScan});setBedsideScan(null);showSamaraActionToast('success','Vital signs saved','The vital-sign entry has been saved successfully.');setSelectedPatient(form.patient_id);setForm({...form,temperature:'',systolic:'',diastolic:'',pulse:'',respiration:'',spo2:'',blood_sugar_type:'Not Taken',blood_sugar:'',weight:'',pain_score:'',remarks:''});await load();finishSuccessfulAction({returnPage,onNavigate})}
    const patientRows=selectedPatient?rows.filter(r=>r.patient_id===selectedPatient).slice(0,10):rows.slice(0,10);
    const latest=patientRows[0];
    const input=(label,key,unit,opts={})=>h('div',{className:'vital-input'},h('label',null,label),h('div',{className:'vital-input-wrap'},h('input',{type:'number',step:opts.step||'any',min:opts.min,max:opts.max,value:form[key],placeholder:opts.placeholder||'',disabled:Boolean(opts.disabled),onChange:e=>setForm({...form,[key]:e.target.value})}),unit&&h('span',null,unit)));
    return h(React.Fragment,null,
      h(Section,{title:'Vital Signs',subtitle:'Fast clinical observation entry with automatic Normal, Warning and Critical classification'},
        returnPage&&h('div',{className:'return-after-save-note'},`After saving, the system will return automatically to ${returnPage}.`),
        h('form',{className:'vitals-entry-card',onSubmit:save},
          h('div',{className:'vitals-patient-row'},patientSelect(patients,form.patient_id,v=>{setForm({...form,patient_id:v});setSelectedPatient(v)}),h('div',{className:`vital-live-status ${calculateLevel(form).toLowerCase().replace(' ','-')}`},h('small',null,'Current entry'),h('strong',null,calculateLevel(form)))),
          h('div',{className:'vitals-grid'},input('Temperature','temperature','°C / °F',{placeholder:'98.6'}),input('Systolic BP','systolic','mmHg'),input('Diastolic BP','diastolic','mmHg'),input('Pulse','pulse','/min'),input('Respiration','respiration','/min'),input('SpO₂','spo2','%'),h('div',{className:'vital-input'},h('label',null,'Blood Sugar Type'),h('select',{value:form.blood_sugar_type||'Not Taken',onChange:e=>setForm({...form,blood_sugar_type:e.target.value,blood_sugar:e.target.value==='Not Taken'?'':form.blood_sugar})},['Not Taken','FBS','PPBS','RBS'].map(x=>h('option',{value:x,key:x},x)))),input('Blood Sugar','blood_sugar','mg/dL',{disabled:(form.blood_sugar_type||'Not Taken')==='Not Taken'}),input('Weight','weight','kg',{step:'0.1'}),input('Pain Score','pain_score','/10',{min:0,max:10})),
          h('div',{className:'vitals-bottom'},h('div',{className:'field'},h('label',null,'Clinical remarks'),h('textarea',{rows:2,value:form.remarks,onChange:e=>setForm({...form,remarks:e.target.value}),placeholder:'Symptoms, oxygen support, position, food status or other observations'})),h(BedsideSafe,null,h(BedsideDosePanel,{profile,patient:patients.find(p=>p.id===form.patient_id),value:bedsideScan,onChange:setBedsideScan})),h('button',{className:'btn btn-primary vitals-save'},bedsideSaveText(profile,'Save Vital Signs'))))),
      selectedPatient&&latest&&h('div',{className:'latest-vitals-strip'},h('div',null,h('small',null,'Latest for selected patient'),h('strong',null,formalName(latest.patients||{})||latest.patients?.full_name)),[['BP',`${measured(latest.systolic)??'—'}/${measured(latest.diastolic)??'—'}`],['Pulse',measured(latest.pulse)??'—'],['SpO₂',measured(latest.spo2)??'—'],['Sugar',measured(latest.blood_sugar)!==null?`${latest.blood_sugar_type||'RBS'} ${measured(latest.blood_sugar)}`:'—'],['Status',latest.computed_alert_level]].map(([a,b])=>h('div',{key:a},h('small',null,a),h('strong',null,b)))),
      h(LogTable,{className:'vitals-log-table',subtitle:'Swipe left or right to view all measurements.',title:selectedPatient?'Patient Vital Trend':'Recent Vital Signs',heads:['Patient','BP','Temp','Pulse','Resp.','SpO₂','Sugar Type','Sugar','Pain','Alert','Recorded'],rows:patientRows.map(r=>[formalName(r.patients||{})||r.patients?.full_name,vitalBP(r),vitalReading('temperature',r.temperature),vitalReading('pulse',r.pulse),vitalReading('respiration',r.respiration),vitalReading('spo2',r.spo2),r.blood_sugar_type||'Not Taken',vitalReading('blood_sugar',r.blood_sugar),r.pain_score??'—',vitalAlert(r.computed_alert_level),fmt(r.recorded_at)])})
    );
  }

