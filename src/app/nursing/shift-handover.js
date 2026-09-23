function ShiftHandover({profile,onNavigate}){
    const [patients]=usePatients();
    const [rows,setRows]=React.useState([]);
    const [patientLedgerRows,setPatientLedgerRows]=React.useState([]);
    const [saving,setSaving]=React.useState(false);
    const [toast,setToast]=React.useState(null);
    const [returnPage]=React.useState(()=>{
      try{return sessionStorage.getItem('samara_previous_page')||'Nursing Dashboard'}catch(_error){return 'Nursing Dashboard'}
    });
    const [form,setForm]=React.useState({
      patient_id:'',
      shift:currentShift(),
      patient_summary:'',
      pending_tasks:'',
      special_instructions:'',
      priority:'Routine'
    });
    const [generalForm,setGeneralForm]=React.useState({department:'Housekeeping',task_text:'',priority:'Routine'});
    const [generalSaving,setGeneralSaving]=React.useState(false);

    async function load(){
      const {data,error}=await client.from('shift_handovers')
        .select('*,patients(full_name,patient_id,room_no,bed_no),profiles!shift_handovers_submitted_by_fkey(full_name)')
        .order('created_at',{ascending:false})
        .limit(100);
      if(error){
        console.error('Shift handovers could not be loaded:',error);
        setRows([]);
        return;
      }
      setRows(data||[]);
    }

    React.useEffect(()=>{load()},[]);

    function showToast(type,text){
      showSamaraActionToast(type,type==='success'?'Saved successfully':'Action failed',text);
      setToast({type,text});
      setTimeout(()=>setToast(null),4000);
    }

    async function save(e){
      e.preventDefault();
      if(saving)return;
      if(!form.patient_id){
        showToast('error','Select the patient for this shift handover.');
        return;
      }
      if(!form.patient_summary.trim()&&!form.pending_tasks.trim()&&!form.special_instructions.trim()){
        showToast('error','Enter at least one handover detail.');
        return;
      }
      setSaving(true);
      const summaryText=form.patient_summary.trim();
      const payload={
        patient_id:form.patient_id,
        shift:form.shift,
        summary:summaryText,
        patient_summary:summaryText,
        pending_tasks:form.pending_tasks.trim(),
        special_instructions:form.special_instructions.trim(),
        priority:form.priority,
        handover_date:todayISOIndia(),
        submitted_by:profile.id
      };
      const {data,error}=await client.from('shift_handovers').insert(payload).select('id').single();
      if(error){
        console.error('Shift handover save failed:',error);
        showToast('error',error.message||'Shift handover could not be saved.');
        setSaving(false);
        return;
      }
      showToast('success','Patient shift handover submitted successfully.');
      setForm(current=>({...current,patient_id:'',patient_summary:'',pending_tasks:'',special_instructions:''}));
      await load();
      writeAuditEvent('Shift Handover Submitted','Shift Handover',data?.id||form.patient_id,{
        patient_id:form.patient_id,shift:form.shift,priority:form.priority
      },'Success');
      setSaving(false);
      finishSuccessfulAction({returnPage,onNavigate,delay:700});
    }

    async function saveGeneral(e){
      e.preventDefault();
      if(generalSaving)return;
      const taskText=String(generalForm.task_text||'').trim();
      if(!taskText){showToast('error','Enter the general handover task.');return}
      setGeneralSaving(true);
      const payload={
        department:generalForm.department,
        task_text:taskText,
        priority:generalForm.priority,
        status:'Pending',
        shift:currentShift(),
        handover_date:todayISOIndia(),
        submitted_by:profile.id
      };
      const {data,error}=await client.from('general_handover_tasks').insert(payload).select('id').single();
      if(error){
        console.error('General handover task save failed:',error);
        showToast('error',error.message||'General handover task could not be saved.');
        setGeneralSaving(false);
        return;
      }
      showToast('success','General handover task submitted to all dashboards.');
      setGeneralForm(current=>({...current,task_text:'',priority:'Routine'}));
      writeAuditEvent('General Handover Task Submitted','Shift Handover',data?.id||'',payload,'Success');
      setGeneralSaving(false);
    }

    return h(React.Fragment,null,
      h(Section,{title:'Shift Handover',subtitle:'Patient-specific status, pending work and priority instructions'},
        h('form',{className:'form-stack',onSubmit:save},
          patientSelect(patients,form.patient_id,v=>setForm({...form,patient_id:v})),
          !form.patient_id?h('div',{className:'notice info',role:'status'},'Select a patient first to enter the shift handover details.'):
          h(React.Fragment,null,
            miniSelect('Outgoing shift',form.shift,['Day Shift (7 AM–7 PM)','Night Shift (7 PM–7 AM)'],v=>setForm({...form,shift:v})),
            textareaSimple('Patient summary',form.patient_summary,v=>setForm({...form,patient_summary:v})),
            textareaSimple('Pending tasks',form.pending_tasks,v=>setForm({...form,pending_tasks:v})),
            textareaSimple('Special instructions',form.special_instructions,v=>setForm({...form,special_instructions:v})),
            miniSelect('Priority',form.priority,['Routine','Important','Critical'],v=>setForm({...form,priority:v})),
            h('button',{className:'btn btn-primary',disabled:saving},saving?'Submitting…':'Submit handover')
          )
        )
      ),
      h(Section,{title:'General Handover',subtitle:'Non-clinical tasks for Housekeeping, Maintenance and Operations'},
        h('form',{className:'form-stack',onSubmit:saveGeneral},
          h('div',{className:'grid two'},
            miniSelect('Department',generalForm.department,['Housekeeping','Maintenance','Operations'],v=>setGeneralForm({...generalForm,department:v})),
            miniSelect('Priority',generalForm.priority,['Routine','Important','Critical'],v=>setGeneralForm({...generalForm,priority:v}))
          ),
          textareaSimple('General task / instruction',generalForm.task_text,v=>setGeneralForm({...generalForm,task_text:v})),
          h('div',{className:'notice info'},'This task is not linked to a patient. It will be prioritised and displayed on every role dashboard until completed.'),
          h('button',{className:'btn btn-primary',disabled:generalSaving},generalSaving?'Submitting…':'Submit general handover task')
        )
      ),
      h(LogTable,{
        title:'Recent Handovers',
        heads:['Date','Patient','Room / Bed','Shift','Priority','Summary','Pending','Submitted by'],
        rows:rows.map(r=>[
          formatDateIN(r.handover_date),
          r.patients?.full_name||'—',
          r.patients?`${r.patients.room_no||'—'}-${r.patients.bed_no||'—'}`:'—',
          r.shift,r.priority,
          h('div',null,r.patient_summary||r.summary||'—',h(TamilAssist,{text:r.patient_summary||r.summary,context:'Handover Patient Summary'})),
          h('div',null,r.pending_tasks||'—',h(TamilAssist,{text:r.pending_tasks,context:'Handover Pending Tasks'})),
          r.profiles?.full_name||'—'
        ])
      }),
      toast&&h('div',{className:`samara-toast ${toast.type}`},
        h('span',{className:'samara-toast-icon'},toast.type==='success'?'✓':'!'),
        h('div',null,h('strong',null,toast.type==='success'?'Handover saved':'Save failed'),h('span',null,toast.text)),
        h('button',{onClick:()=>setToast(null)},'×')
      )
    );
  }

