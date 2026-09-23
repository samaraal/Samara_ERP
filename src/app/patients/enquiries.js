  function Enquiries({profile}){
    const [rows,setRows]=React.useState([]),[msg,setMsg]=React.useState('');
    const [intakeFolder,setIntakeFolder]=React.useState('Admission Enquiries');
    const [dashboardEnquiryFilter,setDashboardEnquiryFilter]=React.useState(()=>{
      try{
        const value=sessionStorage.getItem('samara-enquiry-filter')||'';
        sessionStorage.removeItem('samara-enquiry-filter');
        return value==='active'?'active':'';
      }catch(_error){return ''}
    });
    const canManage=['Admin','Manager'].includes(profile?.role);
    async function load(){
      const {data,error}=await loadAdmissionIntake();
      if(error){setMsg(error.message||'Unable to load enquiries.');return;}
      setRows(data||[]);setMsg('');
    }
    React.useEffect(()=>{load();const ch=client.channel('admission-enquiries-live').on('postgres_changes',{event:'*',schema:'public',table:'pre_admission_enquiries'},load).subscribe();return()=>client.removeChannel(ch)},[]);
    async function status(id,value){
      if(!canManage)return;
      const {error}=await client.from('pre_admission_enquiries').update({status:value,updated_at:new Date().toISOString(),handled_by:profile?.id||null}).eq('id',id);
      if(error){setMsg(error.message||'Unable to update enquiry.');return;}
      load();
    }
    const statuses=['New','Contacted','Assessment Scheduled','Estimate Sent','Bed Reserved','Converted to Admission','Closed'];
    const categoryRows=rows.filter(r=>intakeFolder==='Admission Enquiries'?isAdmissionEnquiry(r):!isAdmissionEnquiry(r));
    const enquiryDisplayRows=dashboardEnquiryFilter==='active'
      ?categoryRows.filter(r=>['New','Contacted','Assessment Scheduled'].includes(String(r.status||'New')))
      :categoryRows;
    return h(React.Fragment,null,
      h(Section,{title:intakeFolder,subtitle:'Read-only intake from the Samara Website and Family Portal. Admin / Manager review and update the status here.'},
        h('div',{className:'message info'},'New enquiries are submitted only from the public Website or secure Family Portal. ERP staff cannot create enquiry records from this screen.'),
        msg?h('div',{className:'message error'},msg):null
      ),
      h('nav',{'aria-label':'Intake folders',style:{display:'flex',gap:'8px',marginBottom:'12px',flexWrap:'wrap'}},['Admission Enquiries','Payment Follow-ups'].map(folder=>h('button',{type:'button',key:folder,'aria-pressed':intakeFolder===folder,className:`btn ${intakeFolder===folder?'btn-primary':'btn-secondary'}`,onClick:()=>{setIntakeFolder(folder);setDashboardEnquiryFilter('');}},folder))),
      h(LogTable,{title:`${dashboardEnquiryFilter==='active'?'Active ':''}${intakeFolder} (${enquiryDisplayRows.length})`,heads:['Received','Source','Resident','Age','Family Contact','Care Type','Preferred Room','Requirements','Status'],rows:enquiryDisplayRows.map(r=>[
        formatDateTimeIN(r.created_at),
        h('span',{className:'badge'},r.source||'Website'),
        r.patient_name||'—',
        r.website_age??'—',
        `${r.family_contact_name||'—'} · ${r.family_contact_phone||'—'}`,
        r.care_type||r.reason_for_enquiry||'—',
        r.bed_preference||'—',
        r.special_requirements||'—',
        canManage?h('select',{value:r.status||'New',onChange:e=>status(r.id,e.target.value)},statuses.map(x=>h('option',{key:x},x))):h('span',{className:'badge'},r.status||'New')
      ])})
    );
  }


