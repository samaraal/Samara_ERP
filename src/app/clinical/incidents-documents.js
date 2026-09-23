  function Incidents({profile,onNavigate}){
    const [patients]=usePatients();
    const [rows,setRows]=React.useState([]);
    const [dashboardIncidentFilter,setDashboardIncidentFilter]=React.useState(()=>{
      try{
        const value=sessionStorage.getItem('samara-incident-filter')||'';
        sessionStorage.removeItem('samara-incident-filter');
        return value==='open'?'open':'';
      }catch(_error){return ''}
    });
    const [patientLedgerRows,setPatientLedgerRows]=React.useState([]);
    const [saving,setSaving]=React.useState(false);
    const [actionBusy,setActionBusy]=React.useState('');
    const [toast,setToast]=React.useState(null);
    const canReport=['Admin','Nurse','Caregiver'].includes(profile?.role);
    const canManage=['Admin','Manager'].includes(profile?.role);
    const [returnPage]=React.useState(()=>{
      try{return sessionStorage.getItem('samara_previous_page')||'Clinical Dashboard'}catch(_error){return 'Clinical Dashboard'}
    });
    const [form,setForm]=React.useState({
      patient_id:'',
      incident_type:'Fall',
      description:'',
      immediate_action:'',
      severity:'Low'
    });

    async function load(){
      let query=client.from('incidents')
        .select('*,patients(full_name,patient_id,room_no,bed_no),profiles!incidents_reported_by_fkey(full_name)')
        .order('incident_at',{ascending:false})
        .limit(150);

      // Nurses and Caregivers see incidents reported by them.
      // Managers and Admins receive the complete incident register.
      if(['Nurse','Caregiver'].includes(profile?.role)){
        query=query.eq('reported_by',profile.id);
      }

      const {data,error}=await query;
      if(error){
        console.error('Incidents could not be loaded:',error);
        setRows([]);
        showToast('error',error.message||'Incident register could not be loaded.');
        return;
      }
      setRows(data||[]);
    }

    React.useEffect(()=>{
      load();
      const channel=client.channel(`incidents-live-${profile?.id||'user'}`)
        .on('postgres_changes',{event:'*',schema:'public',table:'incidents'},load)
        .subscribe();
      return()=>client.removeChannel(channel);
    },[profile?.id,profile?.role]);

    function showToast(type,text){
      showSamaraActionToast(type,type==='success'?'Saved successfully':'Action failed',text);
      setToast({type,text});
      setTimeout(()=>setToast(null),4000);
    }

    async function save(e){
      e.preventDefault();
      if(!canReport||saving)return;
      if(!form.patient_id){
        showToast('error','Select the patient involved in the incident.');
        return;
      }
      if(!form.description.trim()||!form.immediate_action.trim()){
        showToast('error','Description and immediate action are mandatory.');
        return;
      }
      setSaving(true);
      const payload={
        patient_id:form.patient_id,
        incident_type:form.incident_type,
        description:form.description.trim(),
        immediate_action:form.immediate_action.trim(),
        severity:form.severity,
        incident_at:new Date().toISOString(),
        reported_by:profile.id,
        status:'Open'
      };
      const {data,error}=await client.from('incidents').insert(payload).select('id,incident_no').single();
      if(error){
        console.error('Incident save failed:',error);
        showToast('error',error.message||'Incident could not be reported.');
        setSaving(false);
        return;
      }
      showToast('success',`Incident ${data?.incident_no||''} reported successfully.`.trim());
      setForm(current=>({...current,patient_id:'',description:'',immediate_action:''}));
      await load();
      writeAuditEvent('Incident Reported','Incidents',data?.id||form.patient_id,{
        incident_no:data?.incident_no||null,
        patient_id:form.patient_id,
        type:form.incident_type,
        severity:form.severity
      },'Success');
      setSaving(false);
      finishSuccessfulAction({returnPage,onNavigate,delay:700});
    }

    async function managerAction(incident,nextStatus){
      if(!canManage||actionBusy)return;
      let closureNote='';
      if(nextStatus==='Closed'){
        closureNote=prompt('Enter the Manager closure note / final action taken:')||'';
        if(!closureNote.trim()){
          showToast('error','Closure note is mandatory before closing an incident.');
          return;
        }
      }else{
        closureNote=prompt('Enter the review action / instruction (optional):')||'';
      }

      setActionBusy(incident.id);
      const payload={
        status:nextStatus,
        reviewed_by:profile.id,
        closure_note:closureNote.trim()||incident.closure_note||null,
        closed_at:nextStatus==='Closed'?new Date().toISOString():null
      };
      const {error}=await client.from('incidents').update(payload).eq('id',incident.id);
      if(error){
        showToast('error',error.message||'Incident status could not be updated.');
        setActionBusy('');
        return;
      }
      writeAuditEvent(
        nextStatus==='Closed'?'Incident Closed':'Incident Reviewed',
        'Incidents',
        incident.id,
        {
          incident_no:incident.incident_no||null,
          patient_id:incident.patient_id,
          status:nextStatus,
          action_note:closureNote.trim()||null
        },
        'Success'
      );
      showToast('success',nextStatus==='Closed'?'Incident closed successfully.':'Incident marked Under Review.');
      setActionBusy('');
      await load();
    }

    const incidentDisplayRows=dashboardIncidentFilter==='open'
      ?rows.filter(r=>String(r.status||'Open')!=='Closed')
      :rows;
    const registerRows=incidentDisplayRows.map(r=>[
      r.incident_no||'—',
      r.patients?.full_name||'—',
      r.patients?`${r.patients.room_no||'—'}-${r.patients.bed_no||'—'}`:'—',
      r.incident_type,
      r.severity,
      h('div',null,r.description,h(TamilAssist,{text:r.description,context:'Incident Description'})),
      h('div',null,r.immediate_action,h(TamilAssist,{text:r.immediate_action,context:'Incident Immediate Action'})),
      h('span',{className:`badge incident-status-${String(r.status||'Open').toLowerCase().replace(/\s+/g,'-')}`},r.status||'Open'),
      h('div',null,r.closure_note||'—',h(TamilAssist,{text:r.closure_note,context:'Incident Follow-up Instruction'})),
      r.profiles?.full_name||'—',
      fmt(r.incident_at),
      canManage
        ?h('div',{className:'employee-actions'},
          String(r.status||'Open')!=='Closed'&&h('button',{
            type:'button',
            className:'btn btn-secondary',
            disabled:actionBusy===r.id,
            onClick:()=>managerAction(r,'Under Review')
          },actionBusy===r.id?'Updating…':'Review / Act'),
          String(r.status||'Open')!=='Closed'&&h('button',{
            type:'button',
            className:'btn btn-primary',
            disabled:actionBusy===r.id,
            onClick:()=>managerAction(r,'Closed')
          },'Close'),
          String(r.status||'Open')==='Closed'&&h('span',{className:'badge'},'Closed')
        )
        :h('span',{className:'small-note'},String(r.status||'Open')==='Closed'?'Closed by Manager':'Awaiting Manager action')
    ]);

    return h(React.Fragment,null,
      canReport&&h(Section,{title:'Report Incident',subtitle:'Nurse/Caregiver reporting of patient safety events'},
        h('div',{className:'message info'},'After submission, the Manager can review, record action and close the incident.'),
        h('form',{className:'modal-grid',onSubmit:save},
          patientSelect(patients,form.patient_id,v=>setForm({...form,patient_id:v})),
          miniSelect('Incident type',form.incident_type,['Fall','Medicine error','Injury','Behaviour','Food issue','Equipment failure','Hospital transfer','Other'],v=>setForm({...form,incident_type:v})),
          miniSelect('Severity',form.severity,['Low','Moderate','High','Critical'],v=>setForm({...form,severity:v})),
          miniInput('Description',form.description,v=>setForm({...form,description:v}),true),
          miniInput('Immediate action',form.immediate_action,v=>setForm({...form,immediate_action:v}),true),
          h('button',{className:'btn btn-primary',disabled:saving},saving?'Reporting…':'Report incident')
        )
      ),
      canManage&&h(Section,{title:'Manager Incident Review',subtitle:'View, investigate, record action and close incidents'},
        h('div',{className:'message info'},'Incidents are raised by the Nursing team. Manager/Admin may review the action taken and close the record.')
      ),
      h(LogTable,{
        title:canManage?'Complete Incident Register':'My Reported Incidents',
        heads:['Incident No.','Patient','Room / Bed','Type','Severity','Description','Immediate Action','Status','Manager Action / Closure Note','Reported By','Time','Action'],
        rows:registerRows
      }),
      toast&&h('div',{className:`samara-toast ${toast.type}`},
        h('span',{className:'samara-toast-icon'},toast.type==='success'?'✓':'!'),
        h('div',null,h('strong',null,toast.type==='success'?'Incident updated':'Action failed'),h('span',null,toast.text)),
        h('button',{onClick:()=>setToast(null)},'×')
      )
    );
  }

  function Documents({profile}){
    const [patients]=usePatients(),[rows,setRows]=React.useState([]),[form,setForm]=React.useState({patient_id:'',document_type:'Lab Report',report_date:'',hospital_laboratory:'',doctor_name:'',remarks:''}),[files,setFiles]=React.useState([]);
    async function load(){const {data}=await client.from('patient_documents').select('*,patients(full_name)').order('created_at',{ascending:false});setRows(data||[])}React.useEffect(()=>{load()},[]);
    async function save(e){e.preventDefault();if(!files.length)return alert('Select or capture at least one file.');for(const file of files){const safe=String(file.name||'document').replace(/[^a-zA-Z0-9._-]/g,'_');const path=`${form.patient_id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}-${safe}`;const {error:up}=await client.storage.from('patient-documents').upload(path,file,{contentType:file.type||undefined});if(up)return alert(up.message);const {error}=await client.from('patient_documents').insert({...form,document_name:file.name,storage_path:path,mime_type:file.type||null,file_size:file.size||null,uploaded_by:profile.id,is_verified:true});if(error)return alert(error.message)}setFiles([]);setForm({...form,remarks:''});load()}
    async function openDoc(r){const {data,error}=await client.storage.from('patient-documents').createSignedUrl(r.storage_path,180);if(error)return alert(error.message);window.open(data.signedUrl,'_blank','noopener')}
    return h(React.Fragment,null,h(Section,{title:'Patient Documents',subtitle:'Identity proof, discharge, prescription, lab, scan and test reports'},h('form',{className:'modal-grid',onSubmit:save},patientSelect(patients,form.patient_id,v=>setForm({...form,patient_id:v})),miniSelect('Document type',form.document_type,['Identity Proof','Discharge Summary','Current Prescription','Previous Prescription','Lab Report','X-ray','CT Scan','MRI','Ultrasound','ECG','Echo','Operative Note','Physiotherapy Advice','Wound Photograph','Insurance','Consent','Other'],v=>setForm({...form,document_type:v})),miniInput('Report date',form.report_date,v=>setForm({...form,report_date:v}),false,'date'),miniInput('Hospital / Laboratory',form.hospital_laboratory,v=>setForm({...form,hospital_laboratory:v})),miniInput('Doctor',form.doctor_name,v=>setForm({...form,doctor_name:v})),miniInput('Remarks',form.remarks,v=>setForm({...form,remarks:v})),fileInput('Upload / Camera Capture',files,setFiles,'image/*,.pdf',true),h('button',{className:'btn btn-primary'},'Upload Document'))),h(LogTable,{title:'Medical Document Register',heads:['Patient','Type','Date','Hospital/Lab','Name','Action'],rows:rows.map(r=>[r.patients?.full_name,r.document_type,formatDateIN(r.report_date),r.hospital_laboratory||'—',r.document_name,h('button',{className:'btn btn-secondary',onClick:()=>openDoc(r)},'Open')])}))
  }

  



