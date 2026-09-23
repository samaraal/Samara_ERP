  function MedicationErrors({profile,onNavigate}){
    const today=new Date().toISOString().slice(0,10);
    const [state,setState]=React.useState({loading:true,errors:[],orders:[],mar:[],patients:[],profiles:[],message:''});
    const [fromDate,setFromDate]=React.useState(today);
    const [toDate,setToDate]=React.useState(today);
    const [patientFilter,setPatientFilter]=React.useState('');
    const [typeFilter,setTypeFilter]=React.useState('All');
    const [statusFilter,setStatusFilter]=React.useState('All');
    const [showForm,setShowForm]=React.useState(false);
    const [showReport,setShowReport]=React.useState(false);
    const [reviewTarget,setReviewTarget]=React.useState(null);
    const [reviewForm,setReviewForm]=React.useState({status:'Under Review',investigation:'',root_cause:'',corrective_action:'',preventive_action:'',manager_note:'',doctor_notification:'',resident_outcome:''});
    const [form,setForm]=React.useState({patient_id:'',order_id:'',error_type:'Wrong Dose',severity:'Moderate',occurred_at:'',description:'',immediate_action:'',patient_effect:'No apparent harm',doctor_informed:false,family_informed:false});
    const [busy,setBusy]=React.useState(false);

    const ERROR_TYPES=['Delay','Missed Dose','Omission','Wrong Dose','Wrong Medicine','Wrong Route','Wrong Time','Wrong Patient','Duplicate Dose','Documentation Delay','Other'];
    const SEVERITIES=['Near Miss','Minor','Moderate','Major','Critical'];
    const WORKFLOW=['Open','Under Review','Corrective Action','Closed'];
    const localDateTimeValue=(date=new Date())=>{const pad=n=>String(n).padStart(2,'0');return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;};
    const patientById=id=>state.patients.find(p=>p.id===id)||{};
    const orderById=id=>state.orders.find(o=>o.id===id)||{};
    const staffById=id=>state.profiles.find(p=>p.id===id||p.auth_user_id===id)||{};
    const patientName=id=>{const p=patientById(id);return formalName(p)||p.full_name||'Unknown patient';};
    const medicineName=orderId=>{const o=orderById(orderId);return [o.medicine_name,o.strength||o.dose].filter(Boolean).join(' ')||'Medicine not specified';};
    const dateOnly=value=>String(value||'').slice(0,10);
    const isBetween=value=>{const d=dateOnly(value);return d&&d>=fromDate&&d<=toDate;};
    const minutesDifference=(a,b)=>Math.round((new Date(a)-new Date(b))/60000);

    async function load(){
      setState(current=>({...current,loading:true,message:''}));
      const [errors,orders,mar,patients,profiles]=await Promise.all([
        client.from('medication_errors').select('*').order('occurred_at',{ascending:false}).limit(1000),
        client.from('medication_orders').select('*').order('created_at',{ascending:false}),
        client.from('medication_administrations').select('*').order('scheduled_date',{ascending:false}).limit(3000),
        client.from('patients').select('id,title,full_name,patient_id,room_no,bed_no,is_active').order('full_name'),
        client.from('profiles').select('id,auth_user_id,title,full_name,role').order('full_name')
      ]);
      const error=[errors.error,orders.error,mar.error,patients.error,profiles.error].filter(Boolean).map(e=>e.message).join(' | ');
      setState({loading:false,errors:errors.data||[],orders:orders.data||[],mar:mar.data||[],patients:patients.data||[],profiles:profiles.data||[],message:error});
    }
    React.useEffect(()=>{load();const ch=client.channel('medication-errors-live').on('postgres_changes',{event:'*',schema:'public',table:'medication_errors'},load).on('postgres_changes',{event:'*',schema:'public',table:'medication_administrations'},load).subscribe();return()=>client.removeChannel(ch)},[]);

    function autoDetected(){
      const rows=[];
      state.mar.filter(r=>isBetween(r.scheduled_date||r.administered_at||r.created_at)).forEach(r=>{
        const status=String(r.status||'').toLowerCase();
        const base={source:'Automatic MAR analysis',patient_id:r.patient_id,order_id:r.order_id,occurred_at:r.administered_at||r.entry_recorded_at||r.created_at,error_id:`auto-${r.id}`,status:'Detected'};
        if(status==='missed'||status==='not given')rows.push({...base,error_type:'Missed Dose',severity:'Major',description:r.remarks||'Scheduled medicine was recorded as missed.'});
        if(status==='refused')rows.push({...base,error_type:'Omission',severity:'Moderate',description:r.remarks||'Medicine was not administered because the resident refused.'});
        if(status==='delayed')rows.push({...base,error_type:'Delay',severity:'Moderate',description:r.remarks||'Medicine administration was recorded as delayed.'});
        if(r.late_entry)rows.push({...base,error_type:'Documentation Delay',severity:'Minor',description:`Documentation was entered ${r.entry_delay_minutes||0} minutes late. ${r.late_entry_reason||''} ${r.late_entry_justification||''}`.trim()});
        if(r.administered_at&&r.scheduled_date&&r.scheduled_time){
          const scheduled=new Date(`${r.scheduled_date}T${String(r.scheduled_time).slice(0,5)}:00`);
          const diff=minutesDifference(r.administered_at,scheduled);
          if(diff>30&&status==='given')rows.push({...base,error_type:'Delay',severity:diff>120?'Major':'Moderate',description:`Medicine was administered approximately ${diff} minutes after the scheduled time.`});
        }
      });
      return rows;
    }

    const manual=state.errors.filter(r=>isBetween(r.occurred_at||r.created_at)).map(r=>({...r,source:'Staff reported'}));
    const combined=[...manual,...autoDetected()].filter(r=>
      (!patientFilter||r.patient_id===patientFilter)&&
      (typeFilter==='All'||r.error_type===typeFilter)&&
      (statusFilter==='All'||String(r.status||'Detected')===statusFilter)
    );
    const counts=ERROR_TYPES.reduce((a,t)=>(a[t]=combined.filter(r=>r.error_type===t).length,a),{});
    const severityCounts=SEVERITIES.reduce((a,t)=>(a[t]=combined.filter(r=>r.severity===t).length,a),{});
    const total=combined.length;
    const high=combined.filter(r=>['Major','Critical'].includes(r.severity)).length;
    const openCount=combined.filter(r=>!['Closed','Reviewed'].includes(String(r.status||'Detected'))).length;
    const affectedPatients=new Set(combined.map(r=>r.patient_id).filter(Boolean)).size;
    const dominant=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
    const safetyScore=Math.max(0,100-(high*12)-((total-high)*3));

    function aiSummary(){
      if(!total)return 'No medication errors or significant MAR exceptions were identified for the selected period.';
      const parts=[];
      parts.push(`${total} medication-related event${total===1?' was':'s were'} identified involving ${affectedPatients} resident${affectedPatients===1?'':'s'}.`);
      if(dominant&&dominant[1])parts.push(`${dominant[0]} was the most frequent category (${dominant[1]} event${dominant[1]===1?'':'s'}).`);
      if(high)parts.push(`${high} event${high===1?' requires':'s require'} priority Admin/Manager review because the recorded severity is Major or Critical.`);
      const delayCount=(counts.Delay||0)+(counts['Documentation Delay']||0);if(delayCount)parts.push(`${delayCount} delay-related event${delayCount===1?'':'s'} suggest reviewing medicine-round timing, staffing and immediate documentation practices.`);
      const missed=(counts['Missed Dose']||0)+(counts.Omission||0);if(missed)parts.push(`${missed} missed or omitted dose${missed===1?'':'s'} should be clinically reviewed for resident impact, doctor notification and corrective action.`);
      if((counts['Wrong Dose']||0)||(counts['Wrong Medicine']||0)||(counts['Wrong Patient']||0))parts.push('Wrong-dose, wrong-medicine or wrong-patient reports require prompt clinical assessment, prescriber notification and a documented root-cause review.');
      return parts.join(' ');
    }

    async function save(e){
      e.preventDefault();
      if(!form.patient_id||!form.error_type||!form.description.trim())return alert('Patient, error type and description are required.');
      setBusy(true);
      const {data:{user}}=await client.auth.getUser();
      const payload={...form,order_id:form.order_id||null,occurred_at:form.occurred_at?new Date(form.occurred_at).toISOString():new Date().toISOString(),reported_by:user?.id||profile?.auth_user_id||profile?.id,status:'Open'};
      const {error}=await client.from('medication_errors').insert(payload);
      setBusy(false);if(error)return alert(error.message);
      setShowForm(false);setForm({patient_id:'',order_id:'',error_type:'Wrong Dose',severity:'Moderate',occurred_at:'',description:'',immediate_action:'',patient_effect:'No apparent harm',doctor_informed:false,family_informed:false});load();
    }

    function openReview(row){
      if(row.source!=='Staff reported')return alert('Automatically detected events must first be reported as a medication error before formal closure.');
      setReviewTarget(row);
      setReviewForm({
        status:row.status==='Reviewed'?'Closed':(row.status||'Under Review'),
        investigation:row.investigation||'',
        root_cause:row.root_cause||'',
        corrective_action:row.corrective_action||'',
        preventive_action:row.preventive_action||'',
        manager_note:row.review_note||row.manager_note||'',
        doctor_notification:row.doctor_notification||'',
        resident_outcome:row.resident_outcome||row.patient_effect||''
      });
    }

    async function saveReview(e){
      e.preventDefault();
      if(!reviewTarget)return;
      if(['Corrective Action','Closed'].includes(reviewForm.status)&&!reviewForm.corrective_action.trim())return alert('Corrective action is required before progressing or closing the event.');
      if(reviewForm.status==='Closed'&&!reviewForm.root_cause.trim())return alert('Root cause is required before closing the event.');
      setBusy(true);
      const {data:{user}}=await client.auth.getUser();
      const payload={
        status:reviewForm.status,
        investigation:reviewForm.investigation||null,
        root_cause:reviewForm.root_cause||null,
        corrective_action:reviewForm.corrective_action||null,
        preventive_action:reviewForm.preventive_action||null,
        review_note:reviewForm.manager_note||null,
        doctor_notification:reviewForm.doctor_notification||null,
        resident_outcome:reviewForm.resident_outcome||null,
        reviewed_by:user?.id||profile?.id,
        reviewed_at:new Date().toISOString(),
        closed_by:reviewForm.status==='Closed'?(user?.id||profile?.id):null,
        closed_at:reviewForm.status==='Closed'?new Date().toISOString():null
      };
      const {error}=await client.from('medication_errors').update(payload).eq('id',reviewTarget.id);
      setBusy(false);if(error)return alert(error.message);
      setReviewTarget(null);load();
    }

    function csvExport(){
      const headers=['Patient','Medicine','Error Type','Severity','Description','Source','Occurred At','Status','Root Cause','Corrective Action','Preventive Action'];
      const lines=[headers,...combined.map(r=>[
        patientName(r.patient_id),medicineName(r.order_id),r.error_type,r.severity||'',r.description||'',r.source,fmt(r.occurred_at||r.created_at),r.status||'Detected',r.root_cause||'',r.corrective_action||'',r.preventive_action||''
      ])].map(row=>row.map(value=>`"${String(value??'').replace(/"/g,'""')}"`).join(',')).join('\n');
      const blob=new Blob([lines],{type:'text/csv;charset=utf-8'});
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`Medication_Safety_${fromDate}_to_${toDate}.csv`;a.click();URL.revokeObjectURL(url);
    }

    function printCurrentReport(){
      const report=document.getElementById('medication-safety-report');
      if(!report)return;
      const win=window.open('','_blank');if(!win)return alert('Please allow pop-ups to print the report.');
      win.document.write(`<!doctype html><html><head><title>Medication Safety Report</title><style>body{font-family:Arial;padding:24px;color:#4c263c}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #bbb;padding:6px;text-align:left;vertical-align:top}th{background:#e7f3f0}.no-print{display:none}.card{border:1px solid #ead0de;border-radius:12px;padding:14px;margin:12px 0}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.stat strong{display:block;font-size:24px;color:#a91360}h1,h2{color:#a91360}</style></head><body>${report.innerHTML}</body></html>`);
      win.document.close();setTimeout(()=>{win.focus();win.print()},250);
    }

    const reportTable=h('div',{className:'table-wrap'},h('table',{className:'table'},
      h('thead',null,h('tr',null,['Patient','Medicine','Error','Severity','Finding / Description','Source','Time','Status','Action'].map(x=>h('th',{key:x},x)))),
      h('tbody',null,
        combined.map((r,index)=>h('tr',{key:r.id||r.error_id||index},
          h('td',null,patientName(r.patient_id)),
          h('td',null,medicineName(r.order_id)),
          h('td',null,r.error_type),
          h('td',null,h('span',{className:`badge ${['Major','Critical'].includes(r.severity)?'off':''}`},r.severity||'—')),
          h('td',null,r.description||'—'),
          h('td',null,r.source),
          h('td',null,fmt(r.occurred_at||r.created_at)),
          h('td',null,r.status||'Detected'),
          h('td',null,r.source==='Staff reported'?h('button',{type:'button',className:'btn btn-secondary',onClick:()=>openReview(r)},'Review / CAPA'):h('span',{className:'small-note'},'Auto detected'))
        )),
        combined.length===0?h('tr',null,h('td',{colSpan:9,className:'empty'},'No medication safety events found for the selected filters.')):null
      )
    ));

    async function markDischargeReady(){
      if(!dischargeTarget?.discharge_id)return;
      const visible=rows.filter(row=>row.patient_id===dischargeTarget.patient_id);
      const totals=visible.reduce((sum,row)=>{
        const type=row.transaction_type||'Charge';
        sum[type]=(sum[type]||0)+Number(row.amount||0);
        return sum;
      },{Charge:0,Payment:0,Advance:0,Discount:0,Refund:0});
      const due=totals.Charge-(totals.Payment+totals.Advance)-totals.Discount+totals.Refund;
      if(due>0.009){
        setMessage(`Pending balance is ₹${due.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2})}. Complete payment before returning to Discharge Clearance.`);
        return;
      }
      const {error}=await client.from('patient_discharges')
        .update({
          accounts_status:'Ready to Close',
          updated_at:new Date().toISOString()
        })
        .eq('id',dischargeTarget.discharge_id);
      if(error){
        setMessage(error.message||'Unable to mark discharge ready for closure.');
        return;
      }
      setMessage('Payment completed successfully. Accounts clearance is complete and the case has returned to Nursing for final physical discharge confirmation.');
      try{sessionStorage.removeItem('samara_discharge_payment_target')}catch(_error){}
      setTimeout(()=>window.dispatchEvent(new CustomEvent('samara-return-discharge-clearance')),800);
    }

    return h(React.Fragment,null,
      dischargeTarget&&h(Section,{
        title:'Discharge Payment Clearance',
        subtitle:`${dischargeTarget.patient_name} · ${dischargeTarget.patient_code||'No ID'} · Room ${dischargeTarget.room_no||'—'}${dischargeTarget.bed_no?`-${dischargeTarget.bed_no}`:''}`
      },
        h('div',{className:'message info'},
          'Complete all payment entries for this patient. When the outstanding balance becomes zero, click Confirm Payment Completed.'
        ),
        h('div',{className:'actions'},
          h('button',{type:'button',className:'btn btn-primary',onClick:markDischargeReady},'Confirm Payment Completed'),
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{
            try{sessionStorage.removeItem('samara_discharge_payment_target')}catch(_error){}
            setDischargeTarget(null);
          }},'Cancel Discharge Payment Link')
        )
      ),
      h('div',{className:'grid stats'},
        [['Safety Score',`${safetyScore}%`],['Total Events',total],['Open Review',openCount],['Major / Critical',high],['Residents Affected',affectedPatients]].map(([label,value])=>h('div',{className:'card stat',key:label},h('span',null,label),h('strong',null,value)))
      ),
      h(Section,{title:'Medication Safety Centre',subtitle:'AI-assisted detection, investigation, corrective action and management closure'},
        state.message&&h('div',{className:'message error'},state.message),
        h('div',{className:'modal-grid'},
          h('div',{className:'field'},h('label',null,'From date'),h(StrictDateInput,{value:fromDate,onChange:e=>setFromDate(e.target.value)})),
          h('div',{className:'field'},h('label',null,'To date'),h(StrictDateInput,{value:toDate,onChange:e=>setToDate(e.target.value)})),
          h('div',{className:'field'},h('label',null,'Patient'),h('select',{value:patientFilter,onChange:e=>setPatientFilter(e.target.value)},h('option',{value:''},'All patients'),state.patients.map(p=>h('option',{key:p.id,value:p.id},formalName(p)||p.full_name)))),
          h('div',{className:'field'},h('label',null,'Error type'),h('select',{value:typeFilter,onChange:e=>setTypeFilter(e.target.value)},h('option',{value:'All'},'All error types'),ERROR_TYPES.map(t=>h('option',{key:t,value:t},t)))),
          h('div',{className:'field'},h('label',null,'Workflow status'),h('select',{value:statusFilter,onChange:e=>setStatusFilter(e.target.value)},['All','Detected',...WORKFLOW,'Reviewed'].map(t=>h('option',{key:t,value:t},t)))),
          h('button',{type:'button',className:'btn btn-secondary',onClick:load},state.loading?'Loading…':'Refresh'),
          h('button',{type:'button',className:'btn btn-primary',onClick:()=>{setForm({...form,occurred_at:localDateTimeValue()});setShowForm(true)}},'Report Medication Error'),
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setShowReport(true)},'View Management Report')
        ),
        h('div',{className:'card panel',style:{marginTop:'16px'}},h('h3',null,'AI-assisted management summary'),h('p',null,aiSummary()))
      ),
      reportTable,

      showForm&&h('div',{className:'modal-backdrop',onClick:e=>{if(e.target===e.currentTarget)setShowForm(false)}},
        h('form',{className:'card modal',onSubmit:save},
          h('div',{className:'panel-head'},h('div',null,h('h3',null,'Report Medication Error'),h('small',null,'Wrong dose, medicine, patient, route, timing, omission or other event')),h('button',{type:'button',className:'close',onClick:()=>setShowForm(false)},'×')),
          h('div',{className:'modal-grid'},
            h('div',{className:'field'},h('label',null,'Patient'),h('select',{required:true,value:form.patient_id,onChange:e=>setForm({...form,patient_id:e.target.value,order_id:''})},h('option',{value:''},'Select patient'),state.patients.map(p=>h('option',{key:p.id,value:p.id},formalName(p)||p.full_name)))),
            h('div',{className:'field'},h('label',null,'Prescription / Medicine'),h('select',{value:form.order_id,onChange:e=>setForm({...form,order_id:e.target.value})},h('option',{value:''},'Not linked / other'),state.orders.filter(o=>!form.patient_id||o.patient_id===form.patient_id).map(o=>h('option',{key:o.id,value:o.id},medicineName(o.id))))),
            h('div',{className:'field'},h('label',null,'Error type'),h('select',{value:form.error_type,onChange:e=>setForm({...form,error_type:e.target.value})},ERROR_TYPES.map(t=>h('option',{key:t,value:t},t)))),
            h('div',{className:'field'},h('label',null,'Severity'),h('select',{value:form.severity,onChange:e=>setForm({...form,severity:e.target.value})},SEVERITIES.map(t=>h('option',{key:t,value:t},t)))),
            h('div',{className:'field'},h('label',null,'Occurred at'),h(StrictDateTimeInput,{value:form.occurred_at,onChange:e=>setForm({...form,occurred_at:e.target.value})})),
            h('div',{className:'field span-2'},h('label',null,'Description'),h('textarea',{required:true,rows:3,value:form.description,onChange:e=>setForm({...form,description:e.target.value})})),
            h('div',{className:'field span-2'},h('label',null,'Immediate action taken'),h('textarea',{rows:2,value:form.immediate_action,onChange:e=>setForm({...form,immediate_action:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Resident effect'),h('input',{value:form.patient_effect,onChange:e=>setForm({...form,patient_effect:e.target.value})})),
            h('label',{className:'checkbox'},h('input',{type:'checkbox',checked:form.doctor_informed,onChange:e=>setForm({...form,doctor_informed:e.target.checked})}),'Doctor informed'),
            h('label',{className:'checkbox'},h('input',{type:'checkbox',checked:form.family_informed,onChange:e=>setForm({...form,family_informed:e.target.checked})}),'Family informed')
          ),
          h('div',{className:'actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setShowForm(false)},'Cancel'),h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':'Save Medication Error'))
        )
      ),

      reviewTarget&&h('div',{className:'modal-backdrop',onClick:e=>{if(e.target===e.currentTarget)setReviewTarget(null)}},
        h('form',{className:'card modal',style:{width:'min(980px,96vw)',maxHeight:'92vh',overflow:'auto'},onSubmit:saveReview},
          h('div',{className:'panel-head'},h('div',null,h('h3',null,'Medication Error Review & CAPA'),h('small',null,`${patientName(reviewTarget.patient_id)} · ${medicineName(reviewTarget.order_id)} · ${reviewTarget.error_type}`)),h('button',{type:'button',className:'close',onClick:()=>setReviewTarget(null)},'×')),
          h('div',{className:'modal-grid'},
            h('div',{className:'field'},h('label',null,'Workflow status'),h('select',{value:reviewForm.status,onChange:e=>setReviewForm({...reviewForm,status:e.target.value})},WORKFLOW.map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field span-2'},h('label',null,'Investigation findings'),h('textarea',{rows:3,value:reviewForm.investigation,onChange:e=>setReviewForm({...reviewForm,investigation:e.target.value})})),
            h('div',{className:'field span-2'},h('label',null,'Root cause'),h('textarea',{rows:3,value:reviewForm.root_cause,onChange:e=>setReviewForm({...reviewForm,root_cause:e.target.value})})),
            h('div',{className:'field span-2'},h('label',null,'Corrective action'),h('textarea',{rows:3,value:reviewForm.corrective_action,onChange:e=>setReviewForm({...reviewForm,corrective_action:e.target.value})})),
            h('div',{className:'field span-2'},h('label',null,'Preventive action (CAPA)'),h('textarea',{rows:3,value:reviewForm.preventive_action,onChange:e=>setReviewForm({...reviewForm,preventive_action:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Doctor notification / instruction'),h('textarea',{rows:2,value:reviewForm.doctor_notification,onChange:e=>setReviewForm({...reviewForm,doctor_notification:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Resident outcome'),h('textarea',{rows:2,value:reviewForm.resident_outcome,onChange:e=>setReviewForm({...reviewForm,resident_outcome:e.target.value})})),
            h('div',{className:'field span-2'},h('label',null,'Manager review note'),h('textarea',{rows:2,value:reviewForm.manager_note,onChange:e=>setReviewForm({...reviewForm,manager_note:e.target.value})}))
          ),
          h('div',{className:'actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setReviewTarget(null)},'Cancel'),h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':'Save Review'))
        )
      ),

      showReport&&h('div',{className:'modal-backdrop',onClick:e=>{if(e.target===e.currentTarget)setShowReport(false)}},
        h('div',{className:'card modal',style:{width:'min(1500px,97vw)',maxHeight:'95vh',overflow:'auto'}},
          h('div',{className:'panel-head no-print'},
            h('div',null,h('h3',null,'Medication Safety Management Report'),h('small',null,`${formatDateIN(fromDate)} to ${formatDateIN(toDate)}`)),
            h('div',{className:'actions'},
              h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setShowReport(false)},'← Back to Safety Centre'),
              h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setShowReport(false);onNavigate&&onNavigate(ROLE_HOME[profile.role]||'Dashboard')}},'⌂ Dashboard'),
              h('button',{type:'button',className:'btn btn-secondary',onClick:csvExport},'Export Excel / CSV'),
              h('button',{type:'button',className:'btn btn-primary',onClick:printCurrentReport},'Print / Save PDF'),
              h('button',{type:'button',className:'close',onClick:()=>setShowReport(false)},'×')
            )
          ),
          h('div',{id:'medication-safety-report'},
            h('h1',null,'Samara Care ERP'),
            h('h2',null,'Medication Safety Management Report'),
            h('p',null,`Period: ${formatDateIN(fromDate)} to ${formatDateIN(toDate)} · Prepared: ${formatDateTimeIN(new Date())} · Prepared by: ${formalName(profile)}`),
            h('div',{className:'grid stats'},[['Safety Score',`${safetyScore}%`],['Total Events',total],['Open Review',openCount],['Major / Critical',high],['Residents Affected',affectedPatients]].map(([label,value])=>h('div',{className:'card stat',key:label},h('span',null,label),h('strong',null,value)))),
            h('div',{className:'card panel'},h('h3',null,'AI-assisted executive summary'),h('p',null,aiSummary())),
            h('div',{className:'card panel'},h('h3',null,'Category analysis'),h('p',null,ERROR_TYPES.filter(t=>counts[t]).map(t=>`${t}: ${counts[t]}`).join(' · ')||'No events')),
            h('div',{className:'card panel'},h('h3',null,'Severity analysis'),h('p',null,SEVERITIES.filter(t=>severityCounts[t]).map(t=>`${t}: ${severityCounts[t]}`).join(' · ')||'No events')),
            reportTable
          )
        )
      )
    );
  }
