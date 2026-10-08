  const ensureFinalDischargeStyle = () => {
    if(document.getElementById('samara-final-discharge-style'))return;
    const style=document.createElement('style');
    style.id='samara-final-discharge-style';
    style.textContent=`
      .final-discharge-modal{
        width:min(1000px,96vw)!important;
        max-height:92vh!important;
        overflow:auto!important;
      }
      .final-discharge-checklist{
        display:grid;
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:10px;
        margin:14px 0;
      }
      .final-discharge-checklist .check-card{
        min-height:52px;
      }
      .handover-choice-card{border:1px solid #ead2dd;border-radius:12px;padding:10px 12px;background:#fff;display:grid;gap:8px}
      .handover-choice-card.missing{border-color:#e7a1b6;background:#fff8fb}
      .handover-choice-card>strong{color:#4f1736;font-size:14px}
      .handover-choice-options{display:flex;gap:8px;flex-wrap:wrap}
      .handover-choice-options button{border:1px solid #d9b7c8;border-radius:999px;background:#fff;color:#6f153f;padding:7px 12px;font-weight:800;cursor:pointer;font-family:inherit;touch-action:manipulation}
      .handover-choice-options button.active{background:#a80d4f;border-color:#a80d4f;color:#fff}
      .handover-summary-auto{grid-column:1/-1;border:1px solid #bfe3cf;border-radius:12px;padding:10px 12px;background:#effaf4;color:#17603a;display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:space-between}
      .handover-summary-auto label{display:flex;gap:8px;align-items:center;color:#4f1736;font-weight:700}
      @media(max-width:700px){
        .final-discharge-checklist{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(style);
  };

  // 2.15.93: handover items answered as a choice — "None" is a valid answer (SQL 207).
  const HANDOVER_CHOICES=[
    ['ho_medicines','Medicines',['Handed over','None to hand over']],
    ['ho_reports','Reports and investigation documents',['Handed over','None to hand over']],
    ['ho_belongings','Personal belongings',['Handed over','None held by Samara']],
    ['ho_valuables','Valuables',['Handed over','None held']]
  ];

  function DischargeManagement({profile,mode='workflow',onNavigate}){
    React.useEffect(()=>{ensureFinalDischargeStyle()},[]);
    const isNurse=profile?.role==='Nurse';
    const isAccountsClearance=mode==='accounts';
    const [isAssignedDirector,setIsAssignedDirector]=React.useState(false);
    React.useEffect(()=>{client.from('director_office_positions').select('assigned_profile_id').eq('position_key','director').maybeSingle().then(r=>setIsAssignedDirector(r.data?.assigned_profile_id===profile?.id))},[profile?.id]);
    const canInitiate=!isAccountsClearance&&['Nurse','Manager'].includes(profile?.role)&&!isAssignedDirector;
    const canApprove=!isAccountsClearance&&(['Admin','Manager'].includes(profile?.role)||isAssignedDirector);
    const canDecideDiscount=!isAccountsClearance&&(profile?.role==='Admin'||isAssignedDirector);
    const canCloseAccounts=isAccountsClearance&&['Admin','Accounts'].includes(profile?.role);
    const [rows,setRows]=React.useState([]);
    const [patientLedgerRows,setPatientLedgerRows]=React.useState([]);
    const [patients,setPatients]=React.useState([]);
    const [show,setShow]=React.useState(false);
    const [editing,setEditing]=React.useState(null);
    const [busy,setBusy]=React.useState(false);
    const [toast,setToast]=React.useState(null);
    const [message,setMessage]=React.useState('');
    const [dashboardDischargeFilter,setDashboardDischargeFilter]=React.useState(()=>{
      try{
        const value=sessionStorage.getItem('samara-discharge-filter')||'';
        sessionStorage.removeItem('samara-discharge-filter');
        return value==='open'?'open':'';
      }catch(_error){return ''}
    });
    const [workflowTarget,setWorkflowTarget]=React.useState(()=>{
      try{return JSON.parse(sessionStorage.getItem('samara-workflow-target')||'null')}catch(_error){return null}
    });
    const [paymentTarget,setPaymentTarget]=React.useState(null);
    // 2.15.19: global record focus — a link can open this page on one Guest's discharge only.
    const [recordFocus,clearRecordFocus,setRecordFocus]=useRecordFocus(isAccountsClearance?'Discharge Clearance':'Discharge');
    const [managementReviewRow,setManagementReviewRow]=React.useState(null);
    const [managementReviewFull,setManagementReviewFull]=React.useState(false); // 2.15.13: simple view first
    const [managementBilling,setManagementBilling]=React.useState([]);
    const [managementSnapshot,setManagementSnapshot]=React.useState(null);
    const [managementReviewError,setManagementReviewError]=React.useState('');
    const managementReviewSequence=React.useRef(0);
    const [managementReviewLoading,setManagementReviewLoading]=React.useState(false);
    const [managementRemarks,setManagementRemarks]=React.useState('');
    const [managementDiscount,setManagementDiscount]=React.useState('');
    const [managementDiscountReason,setManagementDiscountReason]=React.useState('');
    const [rectificationNote,setRectificationNote]=React.useState('');
    const [showFinalDischarge,setShowFinalDischarge]=React.useState(false);
    const [finalDischargeRow,setFinalDischargeRow]=React.useState(null);
    const finalDischargeSubmitting=React.useRef(false);
    const finalDischargeCompleted=finalDischargeRow?.status==='Completed'||rows.some(row=>row.id===finalDischargeRow?.id&&row.status==='Completed');
    const [dischargeWhatsAppBusy,setDischargeWhatsAppBusy]=React.useState('');
    const [summaryRow,setSummaryRow]=React.useState(null); // 2.15.83 Discharge Summary popup
    // 2.15.93: medicines / reports / belongings / valuables are a choice (handed over or none), not a forced tick (SQL 207).
    const [finalForm,setFinalForm]=React.useState({
      summary_printed_copy:false,
      ho_medicines:'',
      ho_reports:'',
      ho_belongings:'',
      ho_valuables:'',
      final_instructions_explained:false,
      patient_condition_confirmed:false,
      receiving_person_name:'',
      receiving_person_contact:'',
      relationship:'',
      actual_departure_time:localDateTimeValue(),
      transport_mode:'Own / Family Transport',
      transport_details:'',
      accompanied_by_name:'',
      accompanied_by_relationship:'',
      accompanied_by_contact:'',
      review_appointment_date:'',
      review_appointment_time:'',
      review_doctor_name:'',
      review_hospital_clinic:'',
      review_instructions:'',
      final_remarks:'Patient left the facility.'
    });
    const initial={
      patient_id:'',initiation_basis:'Consultant / Doctor Instruction',
      instructed_by_name:'',instructed_by_contact:'',
      voluntary_requested_by:'Patient',voluntary_requester_name:'',voluntary_requester_contact:'',
      discharge_type:'Planned Discharge',proposed_discharge_date:todayISOIndia(),proposed_discharge_time:'10:00',
      destination:'Home',destination_details:'',doctor_discharge_advice:'',
      condition_at_discharge:'Stable',relative_name:'',relative_contact:'',
      transport_arrangement:'Family Transport',medicines_handed_over:false,
      discharge_summary_handed_over:false,reports_handed_over:false,valuables_handed_over:false,
      clinical_clearance_status:'Pending',room_clearance_status:'Pending',
      final_instructions:'',remarks:'',management_status:'Pending',accounts_status:'Pending',status:'Initiated'
    };
    const [form,setForm]=React.useState(initial);
    const memoryKey='samara_discharge_entry_memory_v1';
    const loadEntryMemory=()=>{
      try{
        const parsed=JSON.parse(localStorage.getItem(memoryKey)||'{}');
        return {
          doctors:Array.isArray(parsed.doctors)?parsed.doctors:[],
          destinations:Array.isArray(parsed.destinations)?parsed.destinations:[],
          advice:Array.isArray(parsed.advice)?parsed.advice:[]
        };
      }catch{
        return {doctors:[],destinations:[],advice:[]};
      }
    };
    const [entryMemory,setEntryMemory]=React.useState(loadEntryMemory);
    const saveEntryMemory=next=>{
      setEntryMemory(next);
      try{localStorage.setItem(memoryKey,JSON.stringify(next))}catch{}
    };
    const rememberRecent=(list,value,max=12)=>{
      const text=String(value||'').trim();
      if(!text)return list||[];
      return [text,...(list||[]).filter(item=>String(item).toLowerCase()!==text.toLowerCase())].slice(0,max);
    };
    const rememberDoctor=(list,name,contact)=>{
      const doctorName=String(name||'').trim();
      if(!doctorName)return list||[];
      const doctorContact=String(contact||'').trim();
      return [
        {name:doctorName,contact:doctorContact},
        ...(list||[]).filter(item=>String(item?.name||'').toLowerCase()!==doctorName.toLowerCase())
      ].slice(0,15);
    };
    const rememberDestination=(list,type,details)=>{
      const destinationType=String(type||'').trim();
      const destinationDetails=String(details||'').trim();
      if(!destinationDetails)return list||[];
      return [
        {type:destinationType,details:destinationDetails},
        ...(list||[]).filter(item=>
          !(String(item?.type||'').toLowerCase()===destinationType.toLowerCase()&&
            String(item?.details||'').toLowerCase()===destinationDetails.toLowerCase())
        )
      ].slice(0,20);
    };
    const destinationNeedsDetails=value=>!['Home'].includes(String(value||'').trim());
    const destinationLabel=value=>({
      "Relative's Home":'Relative Name / Place',
      'Hospital':'Hospital Name / Place',
      'Rehabilitation Centre':'Centre Name / Place',
      'Another Assisted Living Facility':'Facility Name / Place',
      'Hospice / Palliative Care':'Facility Name / Place',
      'Other':'Destination Details'
    }[value]||'Destination Details');
    const destinationSuggestions=entryMemory.destinations
      .filter(item=>!form.destination||item.type===form.destination)
      .map(item=>item.details);

    const notify=(type,title,text)=>{setToast({type,title,text});setTimeout(()=>setToast(null),5000)};
    const patientFor=id=>patients.find(p=>p.id===id)||{};
    const patientLabel=id=>{
      const p=patientFor(id);
      return p.id?`${formalName(p)} · ${p.patient_id||'—'} · Room ${p.room_no||'—'}${p.bed_no?`-${p.bed_no}`:''}${p.is_trial?' · 🧪 TRIAL':''}`:'—';
    };
    const isOpenDischarge=row=>!['completed','cancelled','closed'].includes(
      String(row?.status||'').trim().toLowerCase()
    );
    const dashboardDischargeRows=dashboardDischargeFilter==='open'?rows.filter(isOpenDischarge):rows;
    const openDischargeForPatient=patientId=>rows.find(row=>
      row.patient_id===patientId&&isOpenDischarge(row)
    )||null;
    const completedDischargeForPatient=patientId=>rows.find(row=>
      row.patient_id===patientId&&String(row.status||'').trim().toLowerCase()==='completed'
    )||null;
    const isHistoricalDuplicate=row=>Boolean(
      row&&
      isOpenDischarge(row)&&
      String(row.management_status||'Pending').trim().toLowerCase()==='pending'&&
      String(row.accounts_status||'Pending').trim().toLowerCase()==='pending'&&
      completedDischargeForPatient(row.patient_id)
    );

    async function load(){
      const [d,p]=await Promise.all([
        client.from('patient_discharges').select('*').order('created_at',{ascending:false}),
        client.from('patients').select('*').order('full_name')
      ]);
      if(d.error){
        setMessage(d.error.message);
        setRows([]);
      }else{
        setMessage('');
        const allRows=d.data||[];
        setRows(isAccountsClearance
          ?allRows.filter(row=>row.management_status==='Approved'&&row.accounts_status!=='Cleared'&&row.status!=='Completed')
          :allRows
        );
      };
      if(!p.error)setPatients(p.data||[]);
    }
    React.useEffect(()=>{
      load();
      const ch=client.channel(`discharge-v210-${profile?.id||'user'}`)
        .on('postgres_changes',{event:'*',schema:'public',table:'patient_discharges'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'billing_transactions'},load)
        .subscribe();
      return()=>client.removeChannel(ch);
    },[profile?.id]);

    function openNew(){
      setEditing(null);
      setRectificationNote('');
      setForm({...initial,proposed_discharge_date:todayISOIndia()});
      setShow(true);
    }
    function openEdit(row){
      const patient=patientFor(row.patient_id);
      const voluntary=row.initiation_basis==='Voluntary Discharge'
        ?voluntaryDetails(patient,row.voluntary_requested_by||'Patient')
        :{};
      setEditing(row);
      setRectificationNote('');
      setForm({
        ...initial,
        ...row,
        ...(!row.voluntary_requester_name?voluntary:{}),
        proposed_discharge_time:String(row.proposed_discharge_time||'10:00').slice(0,5)
      });
      setShow(true);
    }
    function voluntaryDetails(patient,requesterType){
      if(requesterType==='Patient'){
        return {
          voluntary_requester_name:formalName(patient)||patient.full_name||'',
          voluntary_requester_contact:patient.mobile||''
        };
      }
      return {
        voluntary_requester_name:patient.attendant_name||'',
        voluntary_requester_contact:patient.attendant_phone||''
      };
    }

    function selectPatient(id){
      const existing=!editing?openDischargeForPatient(id):null;
      if(existing){
        notify(
          'error',
          'Existing discharge request resumed',
          'This patient already has an open discharge workflow. Complete, cancel or update that request before starting another one.'
        );
        openEdit(existing);
        return;
      }
      const p=patientFor(id);
      const voluntary=voluntaryDetails(p,form.voluntary_requested_by||'Patient');
      setForm(current=>({
        ...current,
        patient_id:id,
        relative_name:p.attendant_name||'',
        relative_contact:p.attendant_phone||'',
        instructed_by_name:p.treating_doctor||'',
        instructed_by_contact:p.doctor_phone||'',
        destination_details:current.destination==='Hospital'?(p.hospital_name||current.destination_details||''):current.destination_details,
        ...voluntary
      }));
    }

    function changeInitiationBasis(value){
      const p=patientFor(form.patient_id);
      const voluntary=voluntaryDetails(p,form.voluntary_requested_by||'Patient');
      setForm(current=>({
        ...current,
        initiation_basis:value,
        ...(value==='Voluntary Discharge'?voluntary:{})
      }));
    }

    function changeVoluntaryRequester(value){
      const p=patientFor(form.patient_id);
      setForm(current=>({
        ...current,
        voluntary_requested_by:value,
        ...voluntaryDetails(p,value)
      }));
    }

    function changeDoctorName(value){
      const matched=entryMemory.doctors.find(item=>
        String(item.name||'').toLowerCase()===String(value||'').trim().toLowerCase()
      );
      setForm(current=>({
        ...current,
        instructed_by_name:value,
        instructed_by_contact:matched?.contact||current.instructed_by_contact
      }));
    }

    function changeDestination(value){
      const patient=patientFor(form.patient_id);
      const remembered=entryMemory.destinations.find(item=>item.type===value)?.details||'';
      const suggested=value==='Hospital'
        ?patient.hospital_name||remembered
        :remembered;
      setForm(current=>({
        ...current,
        destination:value,
        destination_details:value==='Home'?'':suggested
      }));
    }

    async function save(e){
      e.preventDefault();
      if(!canInitiate||busy)return;
      if(!form.patient_id){notify('error','Discharge not initiated','Select the patient.');return}
      if(form.initiation_basis==='Consultant / Doctor Instruction'&&!form.instructed_by_name.trim()){notify('error','Discharge not initiated','Consultant / Doctor name is mandatory.');return}
      if(form.initiation_basis==='Voluntary Discharge'&&!form.voluntary_requester_name.trim()){notify('error','Discharge not initiated','Voluntary requester name is mandatory.');return}
      if(destinationNeedsDetails(form.destination)&&!String(form.destination_details||'').trim()){
        notify('error','Discharge not initiated',`${destinationLabel(form.destination)} is required.`);
        return;
      }
      const isReturnedRequest=Boolean(
        editing&&(
          String(editing.management_status||'').trim().toLowerCase()==='rejected'||
          String(editing.status||'').trim().toLowerCase()==='returned to nursing'
        )
      );
      if(isReturnedRequest&&!String(rectificationNote||'').trim()){
        notify('error','Re-initiation not completed','Enter what was corrected or clarified before re-submitting the discharge request.');
        return;
      }
      if(isFutureDateIndia(form.proposed_discharge_date)){notify('error','Discharge not initiated','Future discharge dates are not permitted for final processing.');return}
      if(!editing){
        const existing=openDischargeForPatient(form.patient_id);
        if(existing){
          notify(
            'error',
            'Duplicate discharge prevented',
            'An earlier discharge request is still open for this patient and room. The existing request has been opened for continuation.'
          );
          openEdit(existing);
          return;
        }
      }
      setBusy(true);
      const {data:{user}}=await client.auth.getUser();
      const previousReturnReason=String(editing?.management_remarks||'').trim();
      const rectificationHistory=isReturnedRequest
        ?[
            previousReturnReason?`Previous return reason: ${previousReturnReason}`:'',
            `Nursing rectification: ${String(rectificationNote||'').trim()}`,
            `Re-submitted on ${formatDateTimeIN(new Date())}`
          ].filter(Boolean).join(' | ')
        :form.management_remarks||editing?.management_remarks||null;

      const payload={...form,
        initiated_by:editing?.initiated_by||user?.id||profile.id,
        initiated_by_name:editing?.initiated_by_name||formalName(profile)||profile?.full_name||'Nurse',
        initiated_at:editing?.initiated_at||new Date().toISOString(),
        management_status:isReturnedRequest?'Pending':(editing?.management_status||'Pending'),
        accounts_status:isReturnedRequest?'Pending':(editing?.accounts_status||'Pending'),
        status:isReturnedRequest?'Initiated':(editing?.status||'Initiated'),
        management_remarks:rectificationHistory,
        management_approved_at:isReturnedRequest?null:(editing?.management_approved_at||null),
        management_approved_by:isReturnedRequest?null:(editing?.management_approved_by||null),
        management_approved_by_name:isReturnedRequest?null:(editing?.management_approved_by_name||null),
        accounts_cleared_at:isReturnedRequest?null:(editing?.accounts_cleared_at||null),
        accounts_cleared_by:isReturnedRequest?null:(editing?.accounts_cleared_by||null),
        accounts_cleared_by_name:isReturnedRequest?null:(editing?.accounts_cleared_by_name||null),
        updated_at:new Date().toISOString()
      };
      delete payload.id;delete payload.created_at;delete payload.completed_at;delete payload.completed_by;
      const result=editing
        ?await client.from('patient_discharges').update(payload).eq('id',editing.id).select('id').single()
        :await client.from('patient_discharges').insert(payload).select('id').single();
      setBusy(false);
      if(result.error){notify('error','Discharge not saved',result.error.message);return}
      const nextMemory={
        doctors:form.initiation_basis==='Consultant / Doctor Instruction'
          ?rememberDoctor(entryMemory.doctors,form.instructed_by_name,form.instructed_by_contact)
          :entryMemory.doctors,
        destinations:rememberDestination(entryMemory.destinations,form.destination,form.destination_details),
        advice:rememberRecent(entryMemory.advice,form.doctor_discharge_advice,10)
      };
      saveEntryMemory(nextMemory);
      notify(
        'success',
        isReturnedRequest?'Discharge re-initiated successfully':editing?'Discharge request updated successfully':'Discharge initiated successfully',
        isReturnedRequest
          ?'The corrections were recorded and the request was returned to Admin/Manager for fresh review.'
          :'Forwarded automatically to Admin and Manager for approval.'
      );
      finishSuccessfulAction({close:()=>setShow(false),refresh:load});
      writeAuditEvent(
        isReturnedRequest?'Discharge Re-initiated':editing?'Discharge Updated':'Discharge Initiated',
        'Discharge',
        result.data?.id,
        {
          patient_id:form.patient_id,
          initiation_basis:form.initiation_basis,
          rectification_note:isReturnedRequest?String(rectificationNote||'').trim():null,
          previous_return_reason:isReturnedRequest?String(editing?.management_remarks||'').trim():null
        },
        'Success'
      );
    }

    async function removeHistoricalDuplicate(row){
      if(!row||busy||!isHistoricalDuplicate(row))return;
      const patient=patientFor(row.patient_id);
      const confirmed=window.confirm(
        `This is an unfinished duplicate discharge request for ${formalName(patient)||patient.full_name||'the patient'}. `+
        `A completed discharge already exists. Remove only this duplicate request?`
      );
      if(!confirmed)return;

      setBusy(true);
      try{
        const deletion=await client.from('patient_discharges')
          .delete()
          .eq('id',row.id)
          .select('id');

        if(deletion.error)throw deletion.error;
        const deletedCount=(deletion.data||[]).length;

        if(deletedCount===0){
          const archive=await client.from('patient_discharges')
            .update({
              status:'Cancelled',
              management_remarks:[
                row.management_remarks||'',
                'Duplicate discharge archived because a completed discharge already exists.'
              ].filter(Boolean).join(' | '),
              updated_at:new Date().toISOString()
            })
            .eq('id',row.id)
            .select('id,status')
            .single();

          if(archive.error)throw new Error(
            `The duplicate could not be deleted or archived: ${archive.error.message}`
          );
        }

        const verification=await client.from('patient_discharges')
          .select('id,status')
          .eq('id',row.id)
          .maybeSingle();

        if(verification.error)throw verification.error;
        if(verification.data && String(verification.data.status||'').trim().toLowerCase()!=='cancelled'){
          throw new Error('The database did not confirm removal of the duplicate request.');
        }

        notify(
          'success',
          deletedCount>0?'Duplicate discharge removed':'Duplicate discharge archived',
          deletedCount>0
            ?'The invalid pending duplicate was permanently removed.'
            :'The duplicate was archived and removed from active discharge views.'
        );

        await load();

        writeAuditEvent(
          deletedCount>0?'Duplicate Discharge Removed':'Duplicate Discharge Archived',
          'Discharge',
          row.id,
          {
            patient_id:row.patient_id,
            reason:'Completed discharge already existed',
            method:deletedCount>0?'Deleted':'Archived as Cancelled'
          },
          'Success'
        );
      }catch(error){
        notify('error','Duplicate not removed',error.message||'Unable to remove the duplicate request.');
      }finally{
        setBusy(false);
      }
    }

    const managementBillingTotals=list=>(list||[]).reduce((totals,row)=>{
      const amount=Number(row.amount||0);
      const type=row.transaction_type||'Charge';
      totals[type]=(totals[type]||0)+amount;
      return totals;
    },{Charge:0,Payment:0,Advance:0,Discount:0,Refund:0});

    async function openManagementReview(row){
      if(!canApprove)return;
      const sequence=++managementReviewSequence.current;
      setManagementReviewRow(row);
      if(!managementReviewRow||managementReviewRow.id!==row?.id)setManagementReviewFull(false);
      setManagementBilling([]);
      setManagementSnapshot(null);
      setManagementReviewError('');
      setManagementRemarks(row.management_remarks||'');
      setManagementDiscount('');
      setManagementDiscountReason('');
      setManagementReviewLoading(true);
      try{
        const {data,error}=await client.rpc('discharge_management_snapshot',{p_discharge_id:row.id});
        if(sequence!==managementReviewSequence.current)return;
        if(error)throw error;
        if(!data?.token||data.patient_id!==row.patient_id)throw new Error('Unable to verify this patient account.');
        setManagementBilling(data.ledger||[]);
        setManagementSnapshot(data);
      }catch(error){
        if(sequence!==managementReviewSequence.current)return;
        setManagementReviewError(error.message||'Account verification failed.');
        notify('error','Account details not loaded',error.message);
      }finally{
        if(sequence===managementReviewSequence.current)setManagementReviewLoading(false);
      }
    }

    async function approveReviewed(decision,reasonOverride=''){
      const row=managementReviewRow;
      if(!row||!canApprove||busy)return;

      if(decision==='Approved'&&(managementReviewLoading||managementReviewError||!managementSnapshot)){
        notify('error','Review required','Refresh and review the verified patient account before approving.');return;
      }
      const discountAmount=decision==='Approved'&&profile?.role==='Admin'?Number(managementDiscount||0):0;
      if(discountAmount>0&&Number(managementSnapshot?.pending_count||0)>0){
        notify('error','Discount blocked','Accounts must resolve all pending charge requests and ledger postings before a final discount.');return;
      }
      const totals=managementBillingTotals(managementBilling);
      const currentOutstanding=Math.max(
        0,
        Number(totals.Charge||0)-
        Number(totals.Payment||0)-
        Number(totals.Advance||0)-
        Number(totals.Discount||0)+
        Number(totals.Refund||0)
      );

      const effectiveManagementRemarks=String(reasonOverride||managementRemarks||'').trim();
      if(decision==='Rejected'&&!effectiveManagementRemarks){
        notify('error','Decision not saved','Reason for rejection is mandatory.');
        return;
      }
      if(!Number.isFinite(discountAmount)||discountAmount<0){
        notify('error','Discount not saved','Enter a valid discount amount.');
        return;
      }
      if(discountAmount>currentOutstanding+0.009){
        notify('error','Discount not saved',`Discount cannot exceed the current outstanding amount of ₹${currentOutstanding.toLocaleString('en-IN')}.`);
        return;
      }
      if(discountAmount>0&&!String(managementDiscountReason||'').trim()){
        notify('error','Discount not saved','Enter the reason for granting the discount.');
        return;
      }

      setBusy(true);
      try{
        const result=await client.rpc('review_patient_discharge',{
          p_discharge_id:row.id,p_decision:decision,p_remarks:effectiveManagementRemarks||decision,
          p_discount:discountAmount,p_discount_reason:String(managementDiscountReason||'').trim(),
          p_review_token:managementSnapshot?.token||null
        });
        if(result.error)throw result.error;

        setManagementReviewRow(null);
        notify(
          'success',
          decision==='Approved'?'Discharge approved successfully':'Discharge rejected',
          decision==='Approved'
            ?discountAmount>0
              ?`Approved and forwarded to Accounts. Discount of ₹${discountAmount.toLocaleString('en-IN')} was saved permanently.`
              :'Forwarded automatically to Accounts for payment clearance.'
            :'Returned automatically to Nursing.'
        );
        await load();

        writeAuditEvent(
          decision==='Approved'?'Discharge Approved':'Discharge Rejected',
          'Discharge',
          row.id,
          {
            patient_id:row.patient_id,
            decision,
            management_remarks:effectiveManagementRemarks||null,
            discount_amount:discountAmount||0,
            discount_reason:String(managementDiscountReason||'').trim()||null
          },
          'Success'
        );
      }catch(error){
        setManagementSnapshot(null);
        setManagementReviewError(error.message||'Refresh and review the current account.');
        notify('error','Management decision not saved',error.message||'Unable to save the management decision.');
      }finally{
        setBusy(false);
      }
    }

    function rejectAndReturnToNursing(){
      let reason=String(managementRemarks||'').trim();
      if(!reason){
        const entered=window.prompt(
          'Reason for returning this discharge request to Nursing:',
          ''
        );
        if(entered===null)return;
        reason=String(entered||'').trim();
        if(!reason){
          notify('error','Decision not saved','Please enter the reason for returning the request to Nursing.');
          return;
        }
        setManagementRemarks(reason);
      }
      approveReviewed('Rejected',reason);
    }

    function openPayments(row){
      const patient=patientFor(row.patient_id);
      const target={
        discharge_id:row.id,
        patient_id:row.patient_id,
        patient_name:formalName(patient)||patient.full_name||'Patient',
        patient_code:patient.patient_id||'',
        room_no:patient.room_no||'',
        bed_no:patient.bed_no||''
      };
      setPaymentTarget(target);
      try{
        sessionStorage.setItem('samara_discharge_payment_target',JSON.stringify(target));
      }catch(_error){}
      // 2.15.16: the Patient Discharge page has no onNavigate — use the generic in-app page link.
      if(onNavigate)onNavigate('Payments');
      else window.dispatchEvent(new CustomEvent('samara-open-page',{detail:{page:'Payments'}}));
    }

    // 2.15.17: permanently erase a Trial (test) Guest — Admin only. Dry run first, then the
    // Resident ID must be typed. The database removes everything in one all-or-nothing step
    // (supabase/sql/171_trial_guest_purge.sql); stored files are removed afterwards.
    async function eraseTrialGuest(row){
      const p=patientFor(row.patient_id);
      if(profile?.role!=='Admin'||!p.id||!p.is_trial||busy)return;
      setBusy(true);
      try{
        const dry=await client.rpc('purge_trial_guest',{p_patient:p.id,p_resident_code:p.patient_id,p_dry_run:true});
        if(dry.error){
          const missing=/purge_trial_guest|function .* does not exist|schema cache/i.test(dry.error.message||'');
          notify('error','Cannot erase',missing?'Run supabase/sql/171_trial_guest_purge.sql in Supabase first.':dry.error.message);return;
        }
        if(!dry.data?.ok){const tariff=/Tariff adjustments are permanent/i.test(dry.data?.error||'');notify('error','Cannot erase yet',tariff?'This Guest has room-tariff adjustment entries. Run supabase/sql/191_trial_purge_tariff_adjustments.sql in Supabase once, then erase again. Nothing was changed.':`The database refused: ${dry.data?.error||'unknown reason'}. Nothing was changed.`);return}
        const removed=dry.data.removed||{};
        const lines=Object.keys(removed).sort().map(k=>`• ${k.replace(/^deleted: /,'').replace(/_/g,' ')} — ${removed[k]}${k.startsWith('detached')?' (kept, unlinked)':k.startsWith('bed')?' (bed becomes Available)':''}`);
        const files={'patient-documents':[],'patient-daily-moments':[]};
        const docs=await client.from('patient_documents').select('storage_path').eq('patient_id',p.id);
        (docs.data||[]).forEach(d=>d.storage_path&&files['patient-documents'].push(d.storage_path));
        const vids=await client.from('patient_daily_moments').select('storage_path').eq('patient_id',p.id);
        if(!vids.error)(vids.data||[]).forEach(d=>d.storage_path&&files['patient-daily-moments'].push(d.storage_path));
        const fileCount=files['patient-documents'].length+files['patient-daily-moments'].length;
        const typed=window.prompt(
          `PERMANENTLY ERASE Trial Guest ${formalName(p)} (${p.patient_id})?\n\n`+
          `Will be removed:\n${lines.join('\n')||'• the Guest record'}\n• ${fileCount} stored file(s)\n\n`+
          `Kept: audit log (with receipt voucher numbers and any paid Razorpay IDs), stock history.\nThis CANNOT be undone.\n\nType the Resident ID ${p.patient_id} to confirm:`,'');
        if(typed===null)return;
        // 2.15.19: compare letters and digits only (spaces / dash types don't matter).
        const norm=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
        if(!norm(typed)||norm(typed)!==norm(p.patient_id)){notify('error','Not erased',`You typed "${String(typed).trim()}" — the Resident ID is ${p.patient_id}. Nothing was changed.`);return}
        const res=await client.rpc('purge_trial_guest',{p_patient:p.id,p_resident_code:p.patient_id,p_dry_run:false});
        if(res.error){const tariff=/Tariff adjustments are permanent/i.test(res.error.message||'');notify('error','Not erased',tariff?'This Guest has room-tariff adjustment entries. Run supabase/sql/191_trial_purge_tariff_adjustments.sql in Supabase once, then erase again. Nothing was changed.':`${res.error.message} — nothing was changed.`);return}
        let fileErrors=0;
        for(const [bucket,paths] of Object.entries(files)){
          for(let i=0;i<paths.length;i+=100){const r=await client.storage.from(bucket).remove(paths.slice(i,i+100));if(r.error)fileErrors++;}
        }
        notify(fileErrors?'error':'success','Trial Guest erased',`${formalName(p)} (${p.patient_id}) and all related records were removed.${fileErrors?' Some stored files could not be deleted — remove them from Supabase Storage.':''}`);
        await load();
      }catch(e){notify('error','Not erased',e.message||String(e))}
      finally{setBusy(false)}
    }

    // 2.15.27: erase EVERY Trial Guest at one time — Admin only. No discharge needed (active Trial
    // Guests are included, their beds become Available). Dry run list first, then type "ERASE <n>".
    // All-or-nothing in the database (supabase/sql/176_erase_all_trial_guests.sql).
    async function eraseAllTrialGuests(){
      if(profile?.role!=='Admin'||busy)return;
      setBusy(true);
      try{
        const dry=await client.rpc('purge_all_trial_guests',{p_confirm:null,p_dry_run:true});
        if(dry.error){
          const missing=/purge_all_trial_guests|function .* does not exist|schema cache/i.test(dry.error.message||'');
          notify('error','Cannot erase',missing?'Run supabase/sql/176_erase_all_trial_guests.sql in Supabase first.':dry.error.message);return;
        }
        const d=dry.data||{};
        if(!d.count){notify('error','Nothing to erase',d.error||'There are no Trial Guests.');return}
        if((d.blockers||[]).length){
          notify('error','Return items first',`Nothing was changed. Still issued: ${(d.blockers||[]).map(b=>`${b.name} (${b.resident_id}) — ${b.reason}`).join('; ')}.`);return;
        }
        if(!d.ok){notify('error','Cannot erase yet',`The database refused: ${d.error||'unknown reason'}. Nothing was changed.`);return}
        const guests=d.guests||[];
        const ids=guests.map(g=>g.id).filter(Boolean);
        const files={'patient-documents':[],'patient-daily-moments':[]};
        if(ids.length){
          const docs=await client.from('patient_documents').select('storage_path').in('patient_id',ids);
          (docs.data||[]).forEach(x=>x.storage_path&&files['patient-documents'].push(x.storage_path));
          const vids=await client.from('patient_daily_moments').select('storage_path').in('patient_id',ids);
          if(!vids.error)(vids.data||[]).forEach(x=>x.storage_path&&files['patient-daily-moments'].push(x.storage_path));
        }
        const fileCount=files['patient-documents'].length+files['patient-daily-moments'].length;
        const recs=g=>Object.entries(g.removed||{}).filter(([k])=>k.startsWith('deleted')).reduce((s,[,v])=>s+Number(v||0),0);
        const list=guests.map(g=>`• ${g.name} (${g.resident_id})${g.was_active?' — ACTIVE, bed freed':''} — ${recs(g)} record(s)`).join('\n');
        const stock=(d.stock_issued||[]).map(s=>`• ${s.item}: handed over ${s.handed_over}, received ${s.received}`).join('\n');
        const confirmText=d.confirm_text||`ERASE ${d.count}`;
        const typed=window.prompt(
          `PERMANENTLY ERASE ${d.count} DISCHARGED TRIAL GUESTS?\n(Active Trial Guests are kept for testing.)\n\n${list}\n• ${fileCount} stored file(s)\n\n`+
          (stock?`Stock issued to them by indent (do a stock recount for these items afterwards):\n${stock}\n\n`:'')+
          `Real Guests are NOT touched. Kept: audit log (with receipt voucher numbers and paid Razorpay IDs), stock history (unlinked).\nThis CANNOT be undone.\n\nType ${confirmText} to confirm:`,'');
        if(typed===null)return;
        if(String(typed).trim().toUpperCase().replace(/\s+/g,' ')!==confirmText){notify('error','Not erased',`You typed "${String(typed).trim()}" — type ${confirmText}. Nothing was changed.`);return}
        const res=await client.rpc('purge_all_trial_guests',{p_confirm:confirmText,p_dry_run:false});
        if(res.error){const tariff=/Tariff adjustments are permanent/i.test(res.error.message||'');notify('error','Not erased',tariff?'This Guest has room-tariff adjustment entries. Run supabase/sql/191_trial_purge_tariff_adjustments.sql in Supabase once, then erase again. Nothing was changed.':`${res.error.message} — nothing was changed.`);return}
        let fileErrors=0;
        for(const [bucket,paths] of Object.entries(files)){
          for(let i=0;i<paths.length;i+=100){const r=await client.storage.from(bucket).remove(paths.slice(i,i+100));if(r.error)fileErrors++;}
        }
        notify(fileErrors?'error':'success','Trial Guests erased',`${d.count} discharged Trial Guests and all their records were removed.${stock?' Recount the stock items listed.':''}${fileErrors?' Some stored files could not be deleted — remove them from Supabase Storage.':''}`);
        await load();
      }catch(e){notify('error','Not erased',e.message||String(e))}
      finally{setBusy(false)}
    }

    // 2.15.16: clicking a Discharge timeline entry does the same thing as that Guest's
    // action button in the register, for the current user's role. null = just show history.
    function timelineAction(caseId){
      const row=rows.find(r=>String(r.id)===String(caseId));
      if(!row)return null;
      const st=v=>String(v||'').trim().toLowerCase();
      if(st(row.status)==='completed'||isHistoricalDuplicate(row))return null;
      const mgmt=st(row.management_status||'Pending');
      const recheck=!!row.accounts_recheck_at||String(row.accounts_remarks||'').includes('Financial activity changed after clearance');
      if(!isAccountsClearance&&(mgmt==='rejected'||st(row.status)==='returned to nursing')&&['Nurse','Manager'].includes(profile?.role)&&!isAssignedDirector)
        return {label:'Rectify & Re-initiate',run:()=>openEdit(row)};
      if(mgmt==='pending'&&canApprove)return {label:'Review & Decide',run:()=>openManagementReview(row)};
      if(mgmt==='approved'&&row.discount_request_status==='Pending'&&canDecideDiscount)return {label:'Review Discount Request',run:()=>decideDiscountRequest(row)};
      if(mgmt==='approved'&&(st(row.accounts_status)!=='cleared'||recheck)&&['Admin','Accounts'].includes(profile?.role))
        return {label:'Open Payments',run:()=>openPayments(row)};
      if(st(row.accounts_status)==='cleared'&&isNurse&&!isAssignedDirector)return {label:'Final Discharge Clearance',run:()=>setTimeout(()=>openFinalDischarge(row),0)};
      return null;
    }
    function focusRegisterOn(row){
      const p=patientFor(row.patient_id);
      setRecordFocus({id:row.id,patient_id:row.patient_id,label:`${formalName(p)||'Guest'}${p.patient_id?` · ${p.patient_id}`:''}`});
    }
    // Extra one-click buttons shown on the timeline entry itself.
    function timelineExtras(caseId){
      const row=rows.find(r=>String(r.id)===String(caseId));
      if(!row)return [];
      const extras=[{label:'Show in register',run:()=>focusRegisterOn(row)}];
      if(profile?.role==='Admin'&&patientFor(row.patient_id).is_trial)extras.unshift({label:'🧪 Erase Trial Guest',danger:true,run:()=>eraseTrialGuest(row)});
      return extras;
    }

    async function requestDiscountApproval(row){
      if(profile?.role!=='Accounts'||busy)return;
      const reason=window.prompt('Reason for requesting discharge discount consideration:','');
      if(reason===null)return;
      if(!String(reason).trim()){notify('error','Request not sent','Reason is mandatory.');return;}
      const suggestedText=window.prompt('Suggested discount amount (optional):','');
      if(suggestedText===null)return;
      const suggested=String(suggestedText).trim()===''?null:Number(suggestedText);
      if(suggested!==null&&(!Number.isFinite(suggested)||suggested<0)){notify('error','Request not sent','Enter a valid suggested discount amount.');return;}
      setBusy(true);
      const {error}=await client.rpc('request_discharge_discount_review',{p_discharge_id:row.id,p_reason:String(reason).trim(),p_suggested_amount:suggested});
      setBusy(false);
      if(error){notify('error','Discount request not sent',error.message);return;}
      notify('success','Sent to Admin / Director','Accounts clearance is paused until Management decides the discount request.');
      await load();
    }

    async function decideDiscountRequest(row){
      if(!canDecideDiscount||busy||row.discount_request_status!=='Pending')return;
      const suggested=Number(row.discount_suggested_amount||0);
      const amountText=window.prompt(`Accounts requested discount consideration.\nReason: ${row.discount_request_reason||'—'}\nSuggested: ${suggested?`₹${suggested.toLocaleString('en-IN')}`:'Not specified'}\n\nEnter approved discount amount, or enter 0 to decline:`,suggested?String(suggested):'0');
      if(amountText===null)return;
      const amount=Number(amountText);
      if(!Number.isFinite(amount)||amount<0){notify('error','Decision not saved','Enter a valid amount.');return;}
      const decision=amount>0?'Approved':'Declined';
      const remarks=window.prompt(decision==='Approved'?'Management remarks / reason for approved discount:':'Reason for declining the discount request:',row.discount_request_reason||'')||'';
      if(decision==='Declined'&&!String(remarks).trim()){notify('error','Decision not saved','Reason for declining is mandatory.');return;}
      setBusy(true);
      const {error}=await client.rpc('decide_discharge_discount_review',{p_discharge_id:row.id,p_decision:decision,p_amount:amount,p_remarks:String(remarks).trim()||null});
      setBusy(false);
      if(error){notify('error','Discount decision not saved',error.message);return;}
      notify('success',decision==='Approved'?'Discount approved':'Discount declined',decision==='Approved'?`₹${amount.toLocaleString('en-IN')} approved. The case has returned to Accounts for clearance.`:'The case has returned to Accounts without a discount.');
      await load();
    }

    React.useEffect(()=>{
      if(!workflowTarget||!rows.length)return;
      const row=rows.find(r=>r.id===workflowTarget.discharge_id);
      if(!row)return;
      try{sessionStorage.removeItem('samara-workflow-target')}catch(_error){}
      setWorkflowTarget(null);
      setTimeout(()=>{
        if(workflowTarget.type==='discount-review'&&canDecideDiscount&&row.discount_request_status==='Pending')decideDiscountRequest(row);
        else if(workflowTarget.type==='management-review'&&canApprove)openManagementReview(row);
        else if(workflowTarget.type==='accounts-discharge'&&canCloseAccounts)openPayments(row);
        else if(workflowTarget.type==='nursing-discharge'&&isNurse)openFinalDischarge(row);
      },120);
    },[workflowTarget,rows.length]);

    async function closeAccounts(row){
      if(!canCloseAccounts||busy)return;
      const remarks=prompt('Payment reference / Accounts closure remarks:','All payments received')||'';
      if(!remarks.trim()){notify('error','Discharge not closed','Payment reference is mandatory.');return}
      setBusy(true);
      const {error}=await client.rpc('close_patient_discharge_accounts_v2',{p_discharge_id:row.id,p_remarks:remarks});
      setBusy(false);
      if(error){notify('error','Discharge not closed',error.message);return}
      notify('success','Accounts clearance completed','All payments are cleared. The case has returned to Nursing; room and bed will be released only after final patient departure is confirmed.');
      await load();
    }

    async function openFinalDischarge(row){
      finalDischargeSubmitting.current=false;
      const reviewResult=await client.rpc('discharge_workflow_workspace');
      if(reviewResult.error){notify('error','Departure review unavailable',reviewResult.error.message);return}
      const reviewed=reviewResult.data?.cases?.find(item=>item.id===row.id)?.reviews?.find(item=>item.status==='Approved');
      ensureFinalDischargeStyle();
      setFinalDischargeRow(row);
      setFinalForm({
        summary_printed_copy:false,
        ho_medicines:'',ho_reports:'',ho_belongings:'',ho_valuables:'',
        final_instructions_explained:false,
        patient_condition_confirmed:false,
        receiving_person_name:row.relative_name||row.voluntary_requester_name||'',
        receiving_person_contact:row.relative_contact||row.voluntary_requester_contact||'',
        relationship:row.voluntary_requested_by||'Relative / Attendant',
        actual_departure_time:reviewed?localDateTimeValue(new Date(reviewed.actual_departure_at)):localDateTimeValue(),
        late_entry_reason:reviewed?.reason||'',
        transport_mode:row.transport_arrangement||'Own / Family Transport',
        transport_details:'',
        accompanied_by_name:row.relative_name||row.voluntary_requester_name||'',
        accompanied_by_relationship:row.voluntary_requested_by||'Relative / Attendant',
        accompanied_by_contact:row.relative_contact||row.voluntary_requester_contact||'',
        review_appointment_date:row.review_appointment_date||'',
        review_appointment_time:row.review_appointment_time||'',
        review_doctor_name:row.review_doctor_name||row.instructed_by_name||'',
        review_hospital_clinic:row.review_hospital_clinic||'',
        review_instructions:row.review_instructions||'',
        final_remarks:'Patient left the facility.'
      });
      setShowFinalDischarge(true);
    }

    async function completeFinalDischarge(e){
      e.preventDefault();
      if(!isNurse||isAssignedDirector||busy||!finalDischargeRow||finalDischargeCompleted||finalDischargeSubmitting.current)return;

      const missing=HANDOVER_CHOICES.filter(([key])=>!finalForm[key]).map(([,label])=>label)
        .concat([['final_instructions_explained','Instructions explained'],['patient_condition_confirmed','Patient condition checked']].filter(([key])=>!finalForm[key]).map(([,label])=>label));
      if(missing.length){
        notify('error','Final discharge not completed',`Choose / tick: ${missing.join(', ')}.`);
        return;
      }
      if(!finalForm.receiving_person_name.trim()){
        notify('error','Final discharge not completed','Receiving person name is mandatory.');
        return;
      }
      if(!finalForm.actual_departure_time){
        notify('error','Final discharge not completed','Actual departure date and time are mandatory.');
        return;
      }
      if(!finalForm.transport_mode){
        notify('error','Final discharge not completed','Select the transport mode.');
        return;
      }
      if(!finalForm.accompanied_by_name.trim()){
        notify('error','Final discharge not completed','Accompanying person name is mandatory.');
        return;
      }
      if(!finalForm.accompanied_by_relationship.trim()){
        notify('error','Final discharge not completed','Relationship of the accompanying person is mandatory.');
        return;
      }
      if(!finalForm.accompanied_by_contact.trim()){
        notify('error','Final discharge not completed','Accompanying person contact number is mandatory.');
        return;
      }
      if(!finalForm.final_remarks.trim()){
        notify('error','Final discharge not completed','Final discharge remarks are mandatory.');
        return;
      }

      const otherOpen=rows.find(row=>
        row.patient_id===finalDischargeRow.patient_id&&
        row.id!==finalDischargeRow.id&&
        isOpenDischarge(row)
      );
      if(otherOpen){
        notify(
          'error',
          'Room cannot be released',
          'Another unfinished discharge request exists for the same patient/room. Remove or close that duplicate request first.'
        );
        return;
      }

      setBusy(true);
      finalDischargeSubmitting.current=true;
      let data=null;
      let error=null;
      try{
        const rpcResult=await client.rpc('confirm_patient_departure_v5',{
        p_discharge_id:finalDischargeRow.id,
        p_late_entry_reason:finalForm.late_entry_reason?.trim()||null,
        p_received_by_name:finalForm.receiving_person_name.trim(),
        p_received_by_contact:finalForm.receiving_person_contact.trim()||null,
        p_relationship:finalForm.relationship.trim()||null,
        p_actual_departure_at:new Date(finalForm.actual_departure_time+'+05:30').toISOString(),
        p_transport_mode:finalForm.transport_mode,
        p_transport_details:finalForm.transport_details.trim()||null,
        p_accompanied_by_name:finalForm.accompanied_by_name.trim(),
        p_accompanied_by_relationship:finalForm.accompanied_by_relationship.trim(),
        p_accompanied_by_contact:finalForm.accompanied_by_contact.trim(),
        p_review_appointment_date:finalForm.review_appointment_date||null,
        p_review_appointment_time:finalForm.review_appointment_time||null,
        p_review_doctor_name:finalForm.review_doctor_name.trim()||null,
        p_review_hospital_clinic:finalForm.review_hospital_clinic.trim()||null,
        p_review_instructions:finalForm.review_instructions.trim()||null,
        p_departure_remarks:finalForm.final_remarks.trim(),
        p_handover:{medicines:finalForm.ho_medicines,reports:finalForm.ho_reports,belongings:finalForm.ho_belongings,valuables:finalForm.ho_valuables,summary_printed_copy:!!finalForm.summary_printed_copy},
        p_final_instructions_explained:finalForm.final_instructions_explained,
        p_patient_condition_confirmed:finalForm.patient_condition_confirmed
        });
        data=rpcResult?.data??null;
        error=rpcResult?.error??null;
      }catch(rpcError){
        error=rpcError;
      }
      setBusy(false);

      if(error){
        finalDischargeSubmitting.current=false;
        notify('error','Final discharge not completed',error.message||'Unable to complete final discharge.');
        return;
      }

      const completedRow={
        ...finalDischargeRow,
        status:'Completed',
        completed_by:profile?.id||null,
        completed_by_name:formalName(profile)||profile?.full_name||profile?.login_id||'Nurse',
        completed_at:new Date().toISOString(),
        actual_departure_at:new Date(finalForm.actual_departure_time+'+05:30').toISOString()
      };
      // Lock the form as soon as the discharge is saved, before notifications finish.
      setFinalDischargeRow(completedRow);
      let whatsappAccepted=false;
      let whatsappError='';
      try{
        whatsappAccepted=await sendDischargeConfirmationWhatsAppApi(completedRow,{automatic:true});
      }catch(sendError){
        whatsappError=sendError?.message||String(sendError||'WhatsApp API unavailable');
      }
      // 2.15.83: Discharge Summary PDF goes to the same family number, right after the confirmation.
      let summaryNote='';
      try{
        const summaryPatient=patients.find(p=>p.id===completedRow.patient_id)||{};
        await sendDischargeSummaryWhatsAppApi({
          dischargeId:completedRow.id,
          to:summaryPatient.attendant_phone||completedRow.relative_contact||summaryPatient.mobile||'',
          recipientName:summaryPatient.attendant_name||completedRow.relative_name||'Family Member',
          automatic:true
        });
        summaryNote=' The Discharge Summary PDF was also sent on WhatsApp.';
        setRows(current=>current.map(item=>item.id===completedRow.id?{...item,discharge_summary_whatsapp_status:'Accepted'}:item));
      }catch(summaryError){
        summaryNote=` Discharge Summary PDF was not sent (${summaryError?.message||summaryError}). Send it from Discharge Summary in the register or the Patient card.`;
      }
      notify(
        whatsappAccepted?'success':'warning',
        'Patient discharged successfully',
        (whatsappAccepted
          ?`Final nursing clearance completed by ${completedRow.completed_by_name}. The family discharge confirmation was accepted by Meta.`
          :`Final nursing clearance completed and the room is available. Family WhatsApp was not sent${whatsappError?`: ${whatsappError}`:''}. Use Retry WhatsApp in the register.`)+summaryNote
      );
      // v2.8.18: keep Final Discharge window open until Close/Done is selected.
      await load();
      writeAuditEvent(
        'Patient Final Discharge Completed',
        'Discharge',
        finalDischargeRow.id,
        {
          patient_id:finalDischargeRow.patient_id,
          received_by_name:finalForm.receiving_person_name.trim(),
          actual_departure_at:finalForm.actual_departure_time,
          room_released:true
        },
        'Success'
      );
    }

    async function sendDischargeConfirmationWhatsAppApi(row,{automatic=false,resend=false}={}){
      const busyKey=String(row?.id||'discharge');
      if(dischargeWhatsAppBusy===busyKey)return false;
      const patient=patients.find(p=>p.id===row.patient_id)||{};
      const to=patient.attendant_phone||row.relative_contact||patient.mobile||'';
      if(!to){
        const error=new Error('Family / patient WhatsApp number is not available.');
        if(!automatic)notify('error','WhatsApp not sent',error.message);
        throw error;
      }
      const recipient=patient.attendant_name||row.relative_name||formalName(patient)||patient.full_name||'Family Member';
      const patientName=formalName(patient)||patient.full_name||'Patient';
      const departureAt=row.actual_departure_at||row.updated_at||new Date().toISOString();
      const departureDate=formatDateIN(String(departureAt).slice(0,10));
      const departureTime=formatTimeIN(departureAt);
      const renderedMessage=`Dear ${recipient},

We confirm that ${patientName} has been discharged from Samara Assisted Living.

Discharge Date: ${departureDate}
Discharge Time: ${departureTime}

The discharge formalities have been completed.

Thank you for placing your trust in Samara Assisted Living. We wish the patient continued recovery and good health.

For any further assistance, please contact us.

Thank you.

Samara Assisted Living • Compassion • Comfort • Dignity`;
      setDischargeWhatsAppBusy(busyKey);
      try{
        const result=await sendWhatsAppTemplate({
          to,
          templateName:'samara_discharge_confirmation',
          languageCode:'en',
          bodyParams:[recipient,patientName,departureDate,departureTime],
          communicationLog:{
            contact_name:recipient,
            communication_type:resend?'Discharge Confirmation Resent':'Automatic Discharge Confirmation',
            sent_by:profile?.id||null,
            sent_by_name:automatic?'Samara System':formalName(profile)||profile?.full_name||'Samara Team',
            source_type:'Patient / Family',
            message_content:renderedMessage,
            message_payload:{
              discharge_id:row.id,
              patient_id:row.patient_id,
              automatic:Boolean(automatic),
              resend:Boolean(resend),
              body_params:[recipient,patientName,departureDate,departureTime],
              button_text:'View Family Portal',
              button_url:'https://family.samaraassistedliving.com'
            }
          }
        });
        let inboxRecorded=result?.history_logged===true;
        if(!inboxRecorded){
          const providerId=result.provider_message_id;
          const existing=await client.from('hr_whatsapp_communications')
            .select('id')
            .eq('provider_message_id',providerId)
            .maybeSingle();
          if(existing.error){
            console.error('Discharge WhatsApp Inbox verification failed:',existing.error);
          }else if(existing.data?.id){
            inboxRecorded=true;
          }else{
            const now=new Date().toISOString();
            const inboxLog=await client.from('hr_whatsapp_communications').insert({
              career_application_id:null,
              application_id:null,
              applicant_name:recipient,
              recipient_number:normalizeWhatsAppRecipient(to),
              communication_type:resend?'Discharge Confirmation Resent':'Automatic Discharge Confirmation',
              template_name:'samara_discharge_confirmation',
              status:'Accepted',
              provider_message_id:providerId,
              error_message:null,
              sent_by:profile?.id||null,
              sent_by_name:automatic?'Samara System':formalName(profile)||profile?.full_name||'Samara Team',
              direction:'outbound',
              message_type:'template',
              message_content:renderedMessage,
              message_payload:{
                discharge_id:row.id,
                patient_id:row.patient_id,
                automatic:Boolean(automatic),
                resend:Boolean(resend),
                body_params:[recipient,patientName,departureDate,departureTime],
                button_text:'View Family Portal',
                button_url:'https://family.samaraassistedliving.com'
              },
              contact_name:recipient,
              source_type:'Patient / Family · Discharge',
              sent_at:now,
              created_at:now,
              updated_at:now
            });
            if(inboxLog.error)console.error('Discharge WhatsApp Inbox fallback log failed:',inboxLog.error);
            else inboxRecorded=true;
          }
        }
        const updateResult=await client.from('patient_discharges').update({
          discharge_whatsapp_sent_at:new Date().toISOString(),
          discharge_whatsapp_message_id:result.provider_message_id,
          discharge_whatsapp_status:'Accepted',
          updated_at:new Date().toISOString()
        }).eq('id',row.id);
        if(updateResult.error)console.warn('Discharge WhatsApp status could not be saved:',updateResult.error);
        setRows(current=>current.map(item=>item.id===row.id?{
          ...item,
          discharge_whatsapp_sent_at:new Date().toISOString(),
          discharge_whatsapp_message_id:result.provider_message_id,
          discharge_whatsapp_status:'Accepted'
        }:item));
        if(!automatic)notify(
          inboxRecorded?'success':'warning',
          resend?'Discharge WhatsApp resent':'Discharge WhatsApp sent',
          inboxRecorded
            ?'Meta accepted the approved template and the communication is recorded in WhatsApp Inbox.'
            :'Meta accepted the message, but its Inbox entry could not be confirmed. Do not resend solely for this warning.'
        );
        return true;
      }catch(apiError){
        await client.from('patient_discharges').update({
          discharge_whatsapp_status:'Failed',
          updated_at:new Date().toISOString()
        }).eq('id',row.id);
        setRows(current=>current.map(item=>item.id===row.id?{...item,discharge_whatsapp_status:'Failed'}:item));
        if(!automatic)notify('error','WhatsApp API failed',`${apiError.message||apiError}. No old WhatsApp route was opened; use Retry WhatsApp after checking the Meta template.`);
        throw apiError;
      }finally{
        setDischargeWhatsAppBusy(current=>current===busyKey?'':current);
      }
    }
    async function sendReviewAppointmentWhatsAppApi(row){
      if(!row.review_appointment_date){notify('error','Reminder not sent','No review appointment date is recorded for this discharge.');return}
      const patient=patients.find(p=>p.id===row.patient_id)||{};
      const to=patient.attendant_phone||row.relative_contact||patient.mobile||'';
      if(!to){notify('error','Reminder not sent','Family / patient WhatsApp number is not available.');return}
      const recipient=patient.attendant_name||row.relative_name||formalName(patient)||patient.full_name||'Family Member';
      const patientName=formalName(patient)||patient.full_name||'Patient';
      const doctorHospital=[row.review_doctor_name,row.review_hospital_clinic].filter(Boolean).join(' / ')||'As advised';
      const time=row.review_appointment_time?formatTimeIN(`${row.review_appointment_date}T${String(row.review_appointment_time).slice(0,5)}:00`):'As advised';
      try{
        await sendWhatsAppTemplate({to,templateName:'appointment_review_reminder',languageCode:'en',bodyParams:[recipient,patientName,formatDateIN(row.review_appointment_date),time,doctorHospital]});
        notify('success','Review reminder sent','Review appointment reminder was sent successfully through WhatsApp API.');
      }catch(apiError){
        const number=normalizeWhatsAppRecipient(to);
        const text=`Dear ${recipient},

This is a reminder regarding the scheduled review appointment for ${patientName}.

Date: ${formatDateIN(row.review_appointment_date)}
Time: ${time}
Doctor / Hospital: ${doctorHospital}`;
        if(number)window.open(`https://wa.me/${number}?text=${encodeURIComponent(brandWhatsAppText(text))}`,'_blank','noopener');
        notify('error','WhatsApp API failed',`The existing WhatsApp message has been opened as fallback. ${apiError.message||apiError}`);
      }
    }

    const visibleRows=rows.filter(row=>!['cancelled','canceled'].includes(
      String(row.status||'').trim().toLowerCase()
    )).filter(row=>!recordFocus||String(row.id)===String(recordFocus.id||'')||(!recordFocus.id&&String(row.patient_id)===String(recordFocus.patient_id||'')));
    useScrollToFocused('discharge-register',!!recordFocus&&visibleRows.length>0);
    const [drBox,setDrBox]=React.useState(isAccountsClearance?'all':'open');
    const [drSearch,setDrSearch]=React.useState(''),[drBasis,setDrBasis]=React.useState('');
    // 2.15.33: Guest record filter — Real only by default, so test discharges never mix into counts / export.
    const [drRecord,setDrRecord]=React.useState('real');
    const [drPeriod,setDrPeriod]=React.useState('all'),[drFrom,setDrFrom]=React.useState(''),[drTo,setDrTo]=React.useState('');
    const [drDetailId,setDrDetailId]=React.useState(null);
    // 2.15.30: Discharge Register — stage boxes, filters (Apply), compact register, full details per row.
    function actionsFor(row,inDetails=false){
      return h('div',{className:'employee-actions'},
        inDetails&&profile?.role==='Admin'&&patientFor(row.patient_id).is_trial&&h('button',{type:'button',className:'btn btn-danger',disabled:busy,onClick:()=>eraseTrialGuest(row)},'🧪 Erase Trial Guest'),
        isHistoricalDuplicate(row)&&['Admin','Manager','Nurse'].includes(profile?.role)&&h('button',{
          type:'button',
          className:'btn btn-danger',
          disabled:busy,
          onClick:()=>removeHistoricalDuplicate(row)
        },'Remove Duplicate'),
        canInitiate&&(
          String(row.management_status||'').trim().toLowerCase()==='rejected'||
          String(row.status||'').trim().toLowerCase()==='returned to nursing'
        )&&h('button',{
          type:'button',
          className:'btn btn-primary',
          onClick:()=>openEdit(row)
        },'Rectify & Re-initiate'),
        canInitiate&&row.status==='Initiated'&&(row.management_status||'Pending')==='Pending'&&!isHistoricalDuplicate(row)&&h('button',{className:'btn btn-secondary',onClick:()=>openEdit(row)},'Update'),
        canApprove&&(row.management_status||'Pending')==='Pending'&&!isHistoricalDuplicate(row)&&h('button',{
          className:'btn btn-primary',
          onClick:()=>openManagementReview(row)
        },'Review & Decide'),
        canDecideDiscount&&row.management_status==='Approved'&&row.discount_request_status==='Pending'&&row.status!=='Completed'&&h('button',{
          type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>decideDiscountRequest(row)
        },'Review Discount Request'),
        canCloseAccounts&&row.management_status==='Approved'&&row.status!=='Completed'&&row.discount_request_status==='Pending'&&h('span',{className:'small-note'},'Discount Approval Pending — Admin / Director'),
        canCloseAccounts&&profile?.role==='Accounts'&&row.management_status==='Approved'&&row.status!=='Completed'&&row.discount_request_status!=='Pending'&&h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>requestDiscountApproval(row)},'Request Discount Approval'),
        canCloseAccounts&&row.management_status==='Approved'&&row.status!=='Completed'&&h('button',{className:'btn btn-secondary',onClick:()=>openPayments(row)},'View Payments'),
        canCloseAccounts&&row.management_status==='Approved'&&row.status!=='Completed'&&row.accounts_status==='Ready to Close'&&h('span',{className:'small-note'},'Financial closure must be completed through Payments with full transaction evidence.'),
        isNurse&&!isAssignedDirector&&String(row.accounts_status||'').trim().toLowerCase()==='cleared'&&String(row.status||'').trim().toLowerCase()!=='completed'&&h('button',{
          type:'button',
          className:'btn btn-primary',
          onMouseDown:event=>event.stopPropagation(),
          onClick:event=>{
            event.preventDefault();
            event.stopPropagation();
            setTimeout(()=>openFinalDischarge(row),0);
          }
        },'Final Discharge Clearance'),
        isNurse&&h('span',{className:'small-note'},
          String(row.status||'').trim().toLowerCase()==='completed'
            ?'Discharge completed'
            :String(row.accounts_status||'').trim().toLowerCase()==='cleared'
              ?'Accounts cleared — confirm departure'
              :row.management_status==='Rejected'
                ?'Returned by Manager'
                :row.management_status==='Approved'
                  ?'With Accounts'
                  :'Awaiting Management'
        ),
        ['Admin','Manager','Nurse'].includes(profile?.role)&&String(row.status||'').trim().toLowerCase()==='completed'&&(
          dischargeWhatsAppBusy===String(row.id)
            ?h('button',{type:'button',className:'btn btn-whatsapp',disabled:true},'Sending…')
            :row.discharge_whatsapp_status==='Accepted'
            ?h(React.Fragment,null,
              h('button',{type:'button',className:'btn btn-whatsapp',disabled:true},'WhatsApp Sent ✓'),
              h('button',{type:'button',className:'btn btn-secondary',onClick:()=>sendDischargeConfirmationWhatsAppApi(row,{resend:true}).catch(()=>{})},'Resend WhatsApp')
            )
            :h('button',{type:'button',className:'btn btn-whatsapp',onClick:()=>sendDischargeConfirmationWhatsAppApi(row).catch(()=>{})},row.discharge_whatsapp_status==='Failed'?'Retry WhatsApp API':'Send Discharge WhatsApp API')
        ),
        ['Admin','Manager'].includes(profile?.role)&&String(row.status||'').trim().toLowerCase()==='completed'&&row.review_appointment_date&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>sendReviewAppointmentWhatsAppApi(row)},'Send Review Reminder API'),
        ['Admin','Manager','Nurse'].includes(profile?.role)&&String(row.status||'').trim().toLowerCase()==='completed'&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setSummaryRow(row)},row.discharge_summary_whatsapp_status==='Accepted'?'Discharge Summary ✓':'Discharge Summary')
      );
    }
    const lc=v=>String(v||'').trim().toLowerCase();
    // In the register row a completed discharge shows only its WhatsApp status; the buttons are in the details popup.
    function rowActions(row){
      if(lc(row.status)!=='completed')return actionsFor(row);
      const wa=row.discharge_whatsapp_status;
      return h('div',{className:'dr-done-note'},
        h('span',{className:`dr-wa ${wa==='Accepted'?'ok':wa==='Failed'?'bad':''}`},wa==='Accepted'?'WhatsApp sent ✓':wa==='Failed'?'WhatsApp failed':'WhatsApp not sent'),
        h('small',null,'Tap row for details'));
    }
    const needsRecheck=row=>Boolean(row.accounts_recheck_at||String(row.accounts_remarks||'').includes('Financial activity changed after clearance'));
    function stageOf(row){
      if(lc(row.status)==='completed')return 'completed';
      if(lc(row.management_status)==='rejected'||lc(row.status)==='returned to nursing')return 'returned';
      if(lc(row.management_status||'pending')==='pending')return 'mgmt';
      if(row.discount_request_status==='Pending')return 'discount';
      if(lc(row.accounts_status)==='cleared'&&!needsRecheck(row))return 'final';
      return 'accounts';
    }
    const STAGES={
      mgmt:{label:'Awaiting Management',icon:'🩺',color:'#b45309',bg:'#fff4e0'},
      discount:{label:'Discount Pending',icon:'🏷️',color:'#9a3412',bg:'#ffedd5'},
      accounts:{label:'With Accounts',icon:'💳',color:'#1d4ed8',bg:'#e8f0ff'},
      final:{label:'Final Nursing Clearance',icon:'🧾',color:'#6d28d9',bg:'#f1e9ff'},
      returned:{label:'Returned to Nursing',icon:'↩️',color:'#b42336',bg:'#ffe9ec'},
      completed:{label:'Completed',icon:'✅',color:'#166534',bg:'#e7f6ef'}
    };
    const stageText=row=>{
      const st=stageOf(row);
      if(st==='accounts'&&needsRecheck(row))return 'Accounts recheck required';
      return STAGES[st].label;
    };
    const stagePill=row=>{const st=STAGES[stageOf(row)];return h('span',{className:'dr-stage-pill',style:{color:st.color,background:st.bg,borderColor:st.color+'55'}},stageText(row))};
    const departedOn=row=>{
      if(!row.actual_departure_at)return '—';
      const [d,...t]=String(fmt(row.actual_departure_at)).split(', ');
      return h('div',null,h('div',{style:{whiteSpace:'nowrap'}},d),t.length?h('small',{className:'dr-sub'},t.join(', ')):null);
    };
    const requestText=row=>row.initiation_basis==='Voluntary Discharge'
      ?`${row.voluntary_requested_by||'Voluntary'} · ${row.voluntary_requester_name||'—'} · ${row.voluntary_requester_contact||'—'}`
      :`${row.instructed_by_name||'—'} · ${row.instructed_by_contact||'—'}`;
    const guestCell=row=>{
      const p=patientFor(row.patient_id);
      return h('div',{className:'dr-guest'},
        h('strong',null,formalName(p)||p.full_name||'Guest'),
        h('small',null,[p.patient_id,p.room_no?`Room ${p.room_no}${p.bed_no?`-${p.bed_no}`:''}`:''].filter(Boolean).join(' · ')||'—'),
        p.id&&h('span',{className:`guest-record-badge ${p.is_trial?'trial':'real'}`},p.is_trial?'🧪 TRIAL':'✓ REAL'));
    };
    const allCases=visibleRows;
    const boxKeys=isAccountsClearance?['all','discount','accounts']:['open','mgmt','discount','accounts','final','returned','completed','all'];
    const basisOptions=[...new Set(allCases.map(r=>r.initiation_basis).filter(Boolean))].sort();
    const drf=useAppliedFilters({q:drSearch,basis:drBasis,record:drRecord,period:drPeriod,from:drFrom,to:drTo});const DRF=drf.applied;
    // 2.15.31: period = Today / This Week / This Month / Last Month / This Year / All dates / Select period.
    const DR_PERIODS=[['all','All dates'],['today','Today'],['week','This Week'],['month','This Month'],['lastmonth','Last Month'],['year','This Year'],['custom','Select period']];
    const drBounds=(()=>{
      const t=todayISOIndia();
      switch(DRF.period){
        case 'today':return [t,t];
        case 'week':return [mondayOfWeek(t),t];
        case 'month':return [t.slice(0,8)+'01',t];
        case 'lastmonth':{const d=new Date(`${t.slice(0,8)}01T12:00:00`);d.setDate(0);const e=d.toISOString().slice(0,10);return [e.slice(0,8)+'01',e];}
        case 'year':return [t.slice(0,4)+'-01-01',t];
        case 'custom':return [DRF.from||'',DRF.to||''];
        default:return ['',''];
      }
    })();
    const inDate=row=>{
      // Discharge date = actual departure when departed, otherwise the proposed date.
      const d=String(row.actual_departure_at?new Date(new Date(row.actual_departure_at).getTime()+19800000).toISOString():(row.proposed_discharge_date||row.created_at||'')).slice(0,10);
      return (!drBounds[0]||d>=drBounds[0])&&(!drBounds[1]||d<=drBounds[1]);
    };
    const drQ=String(DRF.q||'').trim().toLowerCase();
    const inBox=(row,k)=>{const st=stageOf(row);return k==='all'||(k==='open'?st!=='completed':st===k)};
    // Rows matching search / basis / period (any box). Box counts follow these filters.
    const isTrialRow=row=>Boolean(patientFor(row.patient_id).is_trial);
    const filteredCases=allCases.filter(row=>{
      if(DRF.record==='real'&&isTrialRow(row))return false;
      if(DRF.record==='trial'&&!isTrialRow(row))return false;
      if(DRF.basis&&row.initiation_basis!==DRF.basis)return false;
      if(!inDate(row))return false;
      if(drQ){
        const p=patientFor(row.patient_id);
        const hay=[formalName(p),p.full_name,p.patient_id,p.room_no,row.initiated_by_name,row.instructed_by_name,row.voluntary_requester_name,row.voluntary_requester_contact,row.instructed_by_contact].join(' ').toLowerCase();
        if(!hay.includes(drQ))return false;
      }
      return true;
    });
    const stageCount=k=>filteredCases.filter(r=>inBox(r,k)).length;
    const registerRows=recordFocus?allCases:filteredCases.filter(row=>inBox(row,drBox));
    const filtersOn=Boolean(DRF.q||DRF.basis||DRF.record!=='real'||(DRF.period&&DRF.period!=='all'));
    const hiddenTrial=DRF.record==='real'?allCases.filter(isTrialRow).length:0;
    // 2.15.56: open Trial cases still need real action (Management / Accounts / Nursing), so when
    // "Real only" hides them, say so on the stage boxes and above the register — never silently.
    const hiddenTrialOpen=DRF.record==='real'?allCases.filter(r=>isTrialRow(r)&&stageOf(r)!=='completed'):[];
    const hiddenTrialIn=k=>hiddenTrialOpen.filter(r=>inBox(r,k)).length;
    const hiddenTrialStages=[...new Set(hiddenTrialOpen.map(stageOf))].map(st=>`${STAGES[st].label} ${hiddenTrialOpen.filter(r=>stageOf(r)===st).length}`);
    function showTrialCases(){
      setDrRecord('all');drf.setNow({record:'all'});
      if(recordFocus)clearRecordFocus();
      setDrBox('open');
    }
    function detailFields(row){
      const p=patientFor(row.patient_id);
      return [
        ['Guest',formalName(p)||p.full_name],['Resident ID',p.patient_id],['Guest record',p.id?(p.is_trial?'🧪 Trial (test) Guest':'✓ Real Guest'):''],
        ['Room / Bed',[p.room_no,p.bed_no].filter(Boolean).join(' / ')],['Current step',stageText(row)],
        ['Initiation basis',row.initiation_basis],['Instruction / Request',requestText(row)],
        ['Proposed discharge',[formatDateIN(row.proposed_discharge_date),row.proposed_discharge_time].filter(Boolean).join(' ')],
        ['Initiated by',row.initiated_by_name],['Initiated at',row.created_at?fmt(row.created_at):''],
        ['Management',row.management_status||'Pending'],['Decision by',row.management_approved_by_name],['Decision time',row.management_approved_at?fmt(row.management_approved_at):''],['Management remarks',row.management_remarks],
        ['Discount request',row.discount_request_status],['Discount reason',row.discount_request_reason],['Suggested discount',row.discount_suggested_amount!=null?`₹${Number(row.discount_suggested_amount).toLocaleString('en-IN')}`:''],
        ['Accounts',row.accounts_status],['Cleared by',row.accounts_cleared_by_name],['Cleared at',row.accounts_cleared_at?fmt(row.accounts_cleared_at):''],['Accounts remarks',row.accounts_remarks],
        ['Departed',row.actual_departure_at?fmt(row.actual_departure_at):''],['Completed by',row.completed_by_name],['Transport',row.transport_arrangement],
        ...(row.handover_details?[
          ['Discharge summary',row.handover_details.discharge_summary],
          ['Medicines',row.handover_details.medicines],['Reports / documents',row.handover_details.reports],
          ['Belongings',row.handover_details.belongings],['Valuables',row.handover_details.valuables],
          ['Handover recorded by',[row.handover_details.recorded_by,row.handover_details.recorded_at?fmt(row.handover_details.recorded_at):''].filter(Boolean).join(' · ')]
        ]:[
        ['Discharge summary handed over',row.discharge_summary_handed_over===true?'Yes':row.discharge_summary_handed_over===false?'No':''],
        ['Medicines handed over',row.medicines_handed_over===true?'Yes':row.medicines_handed_over===false?'No':''],
        ['Reports handed over',row.reports_handed_over===true?'Yes':row.reports_handed_over===false?'No':''],
        ['Valuables handed over',row.valuables_handed_over===true?'Yes':row.valuables_handed_over===false?'No':'']]),
        ['Review appointment',[row.review_appointment_date?formatDateIN(row.review_appointment_date):'',row.review_appointment_time,row.review_doctor_name,row.review_hospital_clinic].filter(Boolean).join(' · ')],
        ['Review instructions',row.review_instructions],['Discharge WhatsApp',row.discharge_whatsapp_status],
        ['Last updated',row.updated_at?fmt(row.updated_at):'']
      ];
    }
    function exportRegister(){
      const heads=['Resident ID','Guest','Record','Room','Basis','Instruction / Request','Proposed date','Initiated by','Initiated at','Current step','Management','Decision by','Accounts','Cleared by','Departed','Completed by'];
      const esc=v=>`"${String(v==null?'':v).replace(/"/g,'""')}"`;
      const lines=[heads.map(esc).join(',')].concat(registerRows.map(row=>{const p=patientFor(row.patient_id);return [
        p.patient_id,formalName(p)||p.full_name,p.is_trial?'Trial':'Real',[p.room_no,p.bed_no].filter(Boolean).join('-'),row.initiation_basis,requestText(row),
        formatDateIN(row.proposed_discharge_date),row.initiated_by_name,row.created_at?fmt(row.created_at):'',stageText(row),row.management_status||'Pending',
        row.management_approved_by_name,row.accounts_status,row.accounts_cleared_by_name,row.actual_departure_at?fmt(row.actual_departure_at):'',row.completed_by_name
      ].map(esc).join(',')}));
      const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`Samara_Discharge_Register_${formatDateIN(todayISOIndia())}.csv`;
      document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
    }
    // "Clear" empties the filters and applies at once (no extra Apply press needed).
    const [drClearReq,setDrClearReq]=React.useState(false);
    React.useEffect(()=>{if(drClearReq&&!drSearch&&!drBasis&&drRecord==='real'&&drPeriod==='all'&&!drFrom&&!drTo){drf.apply();setDrClearReq(false)}},[drClearReq,drSearch,drBasis,drRecord,drPeriod,drFrom,drTo]);
    const drDetailRow=drDetailId?allCases.find(r=>String(r.id)===String(drDetailId)):null;

    const showInitiate=canInitiate&&!(isNurse&&rows.some(row=>row.accounts_status==='Cleared'&&row.status!=='Completed'));
    const trialToErase=!isAccountsClearance&&profile?.role==='Admin'?patients.filter(p=>p.is_trial&&p.is_active===false).length:0;
    const periodLabel=DRF.period==='all'||(!drBounds[0]&&!drBounds[1])?'All dates':`${(DR_PERIODS.find(p=>p[0]===DRF.period)||[])[1]||''}: ${drBounds[0]?formatDateIN(drBounds[0]):'…'} – ${drBounds[1]?formatDateIN(drBounds[1]):'…'}`;
    return h(React.Fragment,null,
      summaryRow&&h(DischargeSummaryDialog,{patient:patients.find(p=>p.id===summaryRow.patient_id)||{id:summaryRow.patient_id},discharge:summaryRow,familyAccess:[],profile,onClose:()=>setSummaryRow(null),onUpdated:patch=>setRows(current=>current.map(item=>item.id===summaryRow.id?{...item,...patch}:item))}),
      // 1. Header: title + main buttons
      h('div',{className:'card panel dr-head'},
        h('div',{className:'dr-head-text'},
          h('h2',null,isAccountsClearance?'Discharge Clearance':'Patient Discharge'),
          h('small',null,isAccountsClearance
            ?'Management-approved cases — verify final billing, settle the balance and complete financial clearance'
            :'Nursing initiation → Management approval → Accounts clearance → Nursing final clearance'),
          message&&h('div',{className:'message error',style:{marginTop:'8px'}},message),
          h('p',{className:'small-note'},
            isAccountsClearance
              ?'Open Payments to verify all charges and settle the balance. Accounts clearance is saved there; Nursing then confirms actual departure. Earlier clearances remain in the timeline.'
              :isNurse
                ?(
                rows.some(row=>row.accounts_status==='Cleared'&&row.status!=='Completed')
                  ?'Accounts clearance is complete. Open Final Discharge Clearance and complete the nursing handover before releasing the patient, room and bed.'
                  :'Initiate only under Consultant/Doctor instruction or a clearly recorded voluntary request.'
              )
                :canApprove
                  ?'Approve or reject after clinical review.'
                  :'Review discharge status.'
          )
        ),
        h('div',{className:'dr-head-actions'},
          showInitiate&&h('button',{type:'button',className:'btn btn-primary',onClick:openNew},'＋ Initiate Discharge'),
          trialToErase>0&&h('details',{className:'dr-admin-menu'},
            h('summary',null,'⋯ Admin'),
            h('div',{className:'dr-admin-menu-body'},
              h('button',{type:'button',className:'btn btn-danger',disabled:busy,onClick:eraseAllTrialGuests},`🧪 Erase discharged Trial Guests (${trialToErase})`)))
        )
      ),
      // 2. Stage boxes
      h('div',{className:'dr-boxes'},boxKeys.map(k=>{
        const meta=k==='open'?{label:'Open cases',icon:'📂',color:'#a91360'}:k==='all'?{label:'All discharges',icon:'📋',color:'#5b4a55'}:STAGES[k];
        return h('button',{key:k,type:'button',className:`dr-box ${drBox===k&&!recordFocus?'selected':''}`,style:{'--dr-c':meta.color},
          onClick:()=>{if(recordFocus)clearRecordFocus();setDrBox(k)}},
          h('span',{className:'dr-box-icon','aria-hidden':'true'},meta.icon),
          h('span',{className:'dr-box-label'},meta.label),
          h('b',{className:'dr-box-count'},stageCount(k)),
          k!=='completed'&&hiddenTrialIn(k)>0&&h('small',{className:'dr-box-trial',title:'Trial Guest cases hidden by the "Real only" filter'},`+${hiddenTrialIn(k)} 🧪 Trial`));
      })),
      hiddenTrialOpen.length>0&&!recordFocus&&h('div',{className:'dr-trial-hidden-note',role:'status'},
        h('span',null,`🧪 ${hiddenTrialOpen.length} Trial Guest discharge${hiddenTrialOpen.length>1?'s':''} open (${hiddenTrialStages.join(', ')}) — hidden because Guest record is "Real only".`),
        h('button',{type:'button',className:'btn btn-secondary',onClick:showTrialCases},'Show Trial cases')),
      // 3. Discharge Register
      h('div',{id:'discharge-register',className:'card panel dr-register',style:{scrollMarginTop:'120px'}},
        h('div',{className:'dr-register-head'},
          h('div',null,
            h('h3',null,`${isAccountsClearance?'Pending Financial Clearance':'Discharge Register'} (${registerRows.length})`),
            h('small',null,recordFocus?'Showing one record':`${drBox==='open'?'Open cases':drBox==='all'?'All discharges':STAGES[drBox]?.label||''} · ${DRF.record==='real'?'Real Guests':DRF.record==='trial'?'Trial Guests':'Real + Trial'} · ${periodLabel}${hiddenTrial?` · ${hiddenTrial} Trial hidden`:''} · tap a row for full details`)),
          h('button',{type:'button',className:'btn btn-secondary',disabled:!registerRows.length,onClick:exportRegister},'⬇ Excel (CSV)')
        ),
        h('div',{className:'dr-filters'},
          h('div',{className:'field dr-filter-search'},h('label',null,'Search Guest'),h('input',{type:'search',value:drSearch,placeholder:'Name, Resident ID, room, doctor / relative',onChange:e=>setDrSearch(e.target.value),onKeyDown:e=>{if(e.key==='Enter'){drf.apply();setDrBox('all')}}})),
          h('div',{className:'field'},h('label',null,'Initiation basis'),h('select',{value:drBasis,onChange:e=>setDrBasis(e.target.value)},h('option',{value:''},'All'),basisOptions.map(b=>h('option',{key:b,value:b},b)))),
          h('div',{className:'field'},h('label',null,'Guest record'),h('select',{value:drRecord,onChange:e=>setDrRecord(e.target.value)},
            h('option',{value:'real'},'✓ Real only'),h('option',{value:'trial'},'🧪 Trial only'),h('option',{value:'all'},'All (Real + Trial)'))),
          h('div',{className:'field'},h('label',null,'Discharge period'),h('select',{value:drPeriod,onChange:e=>setDrPeriod(e.target.value)},DR_PERIODS.map(([v,l])=>h('option',{key:v,value:v},l)))),
          drPeriod==='custom'&&h('div',{className:'field'},h('label',null,'From'),h(StrictDateInput,{value:drFrom,onChange:e=>setDrFrom(e.target.value)})),
          drPeriod==='custom'&&h('div',{className:'field'},h('label',null,'To'),h(StrictDateInput,{value:drTo,onChange:e=>setDrTo(e.target.value)})),
          h(ApplyFilterButton,{dirty:drf.dirty,onApply:()=>{drf.apply();if(recordFocus)clearRecordFocus();setDrBox('all')}}),
          filtersOn&&h('button',{type:'button',className:'btn btn-secondary dr-clear',onClick:()=>{setDrSearch('');setDrBasis('');setDrRecord('real');setDrPeriod('all');setDrFrom('');setDrTo('');setDrClearReq(true)}},'Clear')
        ),
        h(RecordFocusBanner,{focus:recordFocus,onShowAll:clearRecordFocus}),
        h('div',{className:'table-wrap'},
          h('table',{className:'table dr-table'},
            h('thead',null,h('tr',null,['Guest','Basis','Discharge date','Initiated','Current step','Departed','Action'].map(x=>h('th',{key:x},x)))),
            h('tbody',null,
              registerRows.map(row=>h('tr',{key:row.id,className:'row-clickable',role:'button',tabIndex:0,title:'Tap for full details',onClick:()=>setDrDetailId(row.id),onKeyDown:e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();setDrDetailId(row.id)}}},
                h('td',{'data-label':'Guest'},guestCell(row)),
                h('td',{'data-label':'Basis'},h('div',null,row.initiation_basis||'—'),h('small',{className:'dr-sub'},requestText(row))),
                h('td',{'data-label':'Discharge date'},formatDateIN(row.proposed_discharge_date)||'—'),
                h('td',{'data-label':'Initiated'},h('div',null,row.initiated_by_name||'—'),h('small',{className:'dr-sub'},row.created_at?fmt(row.created_at):'')),
                h('td',{'data-label':'Current step'},stagePill(row)),
                h('td',{'data-label':'Departed'},departedOn(row)),
                h('td',{'data-label':'Action',className:'dr-actions',onClick:e=>{if(e.target.closest('button'))e.stopPropagation()}},rowActions(row))
              )),
              registerRows.length===0&&h('tr',null,h('td',{colSpan:7,className:'empty'},
                (()=>{
                  const elsewhere=boxKeys.filter(k=>k!==drBox&&k!=='all'&&k!=='open'&&stageCount(k)>0).map(k=>`${STAGES[k].label} (${stageCount(k)})`);
                  const dateOf=r=>r.actual_departure_at?new Date(new Date(r.actual_departure_at).getTime()+19800000).toISOString().slice(0,10):String(r.proposed_discharge_date||'').slice(0,10);
                  const known=[...new Set(allCases.map(dateOf).filter(Boolean))].sort().reverse().slice(0,5).map(formatDateIN);
                  const periodOn=DRF.period&&DRF.period!=='all';
                  const lead=drBox==='open'&&!filtersOn?(hiddenTrialOpen.length?`No open Real Guest discharge cases. ${hiddenTrialOpen.length} open Trial case${hiddenTrialOpen.length>1?'s are':' is'} hidden — tap "Show Trial cases" above.`:'No open discharge cases right now.')
                    :periodOn&&!filteredCases.length?`No discharges in ${periodLabel}.${known.length?` Discharge dates on record: ${known.join(', ')}.`:''}`
                    :drBox==='open'?'No open cases match this filter.':'No discharges in this box match the filter.';
                  return elsewhere.length?h(React.Fragment,null,lead,' ',h('strong',null,`Found in: ${elsewhere.join(', ')}.`),' ',
                    h('button',{type:'button',className:'btn btn-secondary',style:{marginLeft:'6px',padding:'5px 10px'},onClick:()=>setDrBox('all')},'Show all discharges')):lead;
                })()))
            )
          )
        )
      ),
      // 4. History and reviews (collapsed)
      h('details',{className:'card panel dr-collapse'},
        h('summary',null,h('strong',null,'Discharge timeline & departure follow-up'),h('small',null,' — full step-by-step history of every discharge')),
        h(window.SamaraDischargeWorkflow.Panel,{client,profile,onChanged:load,caseAction:timelineAction,caseExtras:timelineExtras})),
      // 2.15.38: the pre-departure medication review list lives only on the Medicines page (it is a medication task).
      drDetailRow&&h(RowDetailModal,{
        title:formalName(patientFor(drDetailRow.patient_id))||'Discharge',
        subtitle:`${patientFor(drDetailRow.patient_id).patient_id||''} · ${stageText(drDetailRow)}`,
        fields:detailFields(drDetailRow),
        onClose:()=>setDrDetailId(null)},
        h('div',{className:'dr-detail-actions',onClickCapture:e=>{if(e.target.closest('button'))setTimeout(()=>setDrDetailId(null),0)}},actionsFor(drDetailRow,true))),
      show&&h('div',{className:'modal-backdrop'},
        h('form',{className:'card modal',style:{width:'min(1100px,96vw)',maxHeight:'92vh',overflow:'auto'},onSubmit:save},
          h('div',{className:'panel-head'},h('div',null,h('h3',null,
            editing&&(
              String(editing.management_status||'').trim().toLowerCase()==='rejected'||
              String(editing.status||'').trim().toLowerCase()==='returned to nursing'
            )
              ?'Rectify and Re-initiate Discharge'
              :editing?'Update Discharge Request':'Initiate Patient Discharge'
          ),h('small',null,'Record only the essential instruction or voluntary request. Final handover details will be completed later by Nursing after Accounts clearance.')),h('button',{type:'button',className:'close',onClick:()=>setShow(false)},'×')),
          editing&&(
            String(editing.management_status||'').trim().toLowerCase()==='rejected'||
            String(editing.status||'').trim().toLowerCase()==='returned to nursing'
          )&&h('div',{className:'message error',style:{marginBottom:'14px'}},
            h('strong',null,'Returned by Admin / Manager'),
            h('div',{style:{marginTop:'6px'}},editing.management_remarks||'No return reason was recorded.')
          ),
          h('div',{className:'modal-grid'},
            h('div',{className:'field'},h('label',null,'Patient'),h('select',{required:true,value:form.patient_id,disabled:!!editing,onChange:e=>selectPatient(e.target.value)},h('option',{value:''},'Select active patient'),patients.filter(p=>p.is_active!==false).map(p=>h('option',{key:p.id,value:p.id},patientLabel(p.id))))),
            miniSelect('Initiation Basis',form.initiation_basis,['Consultant / Doctor Instruction','Voluntary Discharge'],changeInitiationBasis),
            form.initiation_basis==='Consultant / Doctor Instruction'&&h(React.Fragment,null,
              h('div',{className:'field'},
                h('label',null,'Consultant / Doctor Name'),
                h('input',{
                  required:true,
                  list:'remembered-discharge-doctors',
                  value:form.instructed_by_name,
                  onChange:e=>changeDoctorName(e.target.value),
                  placeholder:'Select or type doctor name'
                }),
                h('datalist',{id:'remembered-discharge-doctors'},
                  entryMemory.doctors.map((item,index)=>h('option',{key:`doctor-${index}`,value:item.name},item.contact||''))
                )
              ),
              h('div',{className:'field'},
                h('label',null,'Consultant / Doctor Contact'),
                h('input',{
                  list:'remembered-discharge-doctor-contacts',
                  value:form.instructed_by_contact,
                  onChange:e=>setForm({...form,instructed_by_contact:e.target.value}),
                  placeholder:'Auto-filled when remembered'
                }),
                h('datalist',{id:'remembered-discharge-doctor-contacts'},
                  entryMemory.doctors.filter(item=>item.contact).map((item,index)=>h('option',{key:`contact-${index}`,value:item.contact},item.name))
                )
              ),
              h('div',{className:'field span-2'},
                h('label',null,'Doctor Discharge Advice'),
                h('textarea',{
                  required:true,
                  rows:3,
                  value:form.doctor_discharge_advice,
                  onChange:e=>setForm({...form,doctor_discharge_advice:e.target.value}),
                  placeholder:'Type advice or use a recent entry below'
                }),
                entryMemory.advice.length>0&&h('div',{className:'actions',style:{justifyContent:'flex-start',marginTop:'8px'}},
                  entryMemory.advice.slice(0,4).map((text,index)=>h('button',{
                    key:`advice-${index}`,
                    type:'button',
                    className:'btn btn-secondary',
                    style:{padding:'7px 10px',fontSize:'12px'},
                    onClick:()=>setForm({...form,doctor_discharge_advice:text})
                  },text.length>42?`${text.slice(0,42)}…`:text))
                )
              )
            ),
            form.initiation_basis==='Voluntary Discharge'&&h(React.Fragment,null,
              miniSelect('Voluntary Request From',form.voluntary_requested_by,['Patient','Relative / Attendant','Guardian / Authorised Person'],changeVoluntaryRequester),
              h('div',{className:'field span-2'},h('div',{className:'message info'},'Requester name and contact are filled automatically from the patient record. The Nurse may correct them only when the stored details have changed.')),
              miniInput('Requester Name',form.voluntary_requester_name,v=>setForm({...form,voluntary_requester_name:v}),true),
              miniInput('Requester Contact',form.voluntary_requester_contact,v=>setForm({...form,voluntary_requester_contact:v}),true),
              h('div',{className:'field span-2'},h('label',null,'Voluntary Declaration / Reason'),h('textarea',{required:true,rows:3,value:form.doctor_discharge_advice,onChange:e=>setForm({...form,doctor_discharge_advice:e.target.value})}))
            ),
            miniSelect('Discharge Type',form.discharge_type,['Planned Discharge','Transfer to Hospital','Discharge Against Medical Advice','Home Care Transfer','Death / Expiry','Other'],v=>setForm({...form,discharge_type:v})),
            miniInput('Discharge Date',form.proposed_discharge_date,v=>setForm({...form,proposed_discharge_date:v}),true,'date'),
            miniInput('Discharge Time',form.proposed_discharge_time,v=>setForm({...form,proposed_discharge_time:v}),true,'time'),
            miniSelect('Destination',form.destination,[
              'Home',
              "Relative's Home",
              'Hospital',
              'Rehabilitation Centre',
              'Another Assisted Living Facility',
              'Hospice / Palliative Care',
              'Other'
            ],changeDestination),
            destinationNeedsDetails(form.destination)&&h('div',{className:'field'},
              h('label',null,destinationLabel(form.destination)),
              h('input',{
                list:'remembered-discharge-destinations',
                value:form.destination_details,
                onChange:e=>setForm({...form,destination_details:e.target.value}),
                placeholder:form.destination==='Hospital'
                  ?'Hospital name and place'
                  :form.destination==="Relative's Home"
                    ?'Relative name and place'
                    :'Select a remembered entry or type once'
              }),
              h('datalist',{id:'remembered-discharge-destinations'},
                destinationSuggestions.map((value,index)=>h('option',{key:`destination-${index}`,value}))
              )
            ),
            miniSelect('Condition at Discharge',form.condition_at_discharge,['Stable','Improved','Requires Continued Monitoring','Transferred for Higher Care','Critical','Other'],v=>setForm({...form,condition_at_discharge:v})),
            editing&&(
              String(editing.management_status||'').trim().toLowerCase()==='rejected'||
              String(editing.status||'').trim().toLowerCase()==='returned to nursing'
            )&&h('div',{className:'field span-2'},
              h('label',null,'Rectification / Correction Made'),
              h('textarea',{
                required:true,
                rows:3,
                value:rectificationNote,
                onChange:e=>setRectificationNote(e.target.value),
                placeholder:'State exactly what was corrected, clarified or newly attached before re-submission.'
              })
            )
          ),
          h('div',{className:'actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setShow(false)},'Cancel'),h('button',{className:'btn btn-primary',disabled:busy},
            busy?'Saving…':
            editing&&(
              String(editing.management_status||'').trim().toLowerCase()==='rejected'||
              String(editing.status||'').trim().toLowerCase()==='returned to nursing'
            )
              ?'Re-initiate for Management Review'
              :editing?'Update Request':'Submit for Management Approval'
          ))
        )
      ),
      managementReviewRow&&h('div',{
        className:'modal-backdrop',
        'data-manual-close':'true'
      },
        h('div',{
          className:'card modal mdr-modal',
          style:{width:'min(860px,97vw)',maxHeight:'94vh',overflow:'auto'}
        },
          h('div',{className:'panel-head'},
            h('div',null,
              h('h3',null,'Discharge Approval'),
              h('small',null,patientLabel(managementReviewRow.patient_id))
            ),
            h('button',{type:'button',className:'close',onClick:()=>setManagementReviewRow(null)},'×')
          ),

          // 2.15.13: simple review — Patient, Payment, Discount first; everything else behind "View full details".
          (()=>{
            const p=patientFor(managementReviewRow.patient_id)||{};
            const totals=managementBillingTotals(managementBilling);
            const paid=Number(totals.Payment||0)+Number(totals.Advance||0);
            const outstanding=Math.max(0,Number(totals.Charge||0)-paid-Number(totals.Discount||0)+Number(totals.Refund||0));
            const money=v=>`₹${Number(v||0).toLocaleString('en-IN')}`;
            const pending=Number(managementSnapshot?.pending_count||0);
            const voluntary=managementReviewRow.initiation_basis==='Voluntary Discharge';
            const line=(label,value)=>h('div',{className:'mdr-line',key:label},h('span',null,label),h('b',null,value||'—'));
            return h('div',{className:'mdr-simple'},
              h('div',{className:'mdr-card'},
                h('div',{className:'mdr-card-title'},'Patient'),
                h('div',{className:'mdr-patient-name'},formalName(p)||p.full_name||'—'),
                line('Resident ID',p.patient_id||p.patient_code),
                line('Room / Bed',[p.room_no,p.bed_no].filter(Boolean).join(' - ')),
                line('Discharge',[managementReviewRow.discharge_type,`${formatDateIN(managementReviewRow.proposed_discharge_date)} · ${String(managementReviewRow.proposed_discharge_time||'').slice(0,5)}`].filter(Boolean).join(' · ')),
                line('Condition',managementReviewRow.condition_at_discharge),
                line('Destination',[managementReviewRow.destination,managementReviewRow.destination_details].filter(Boolean).join(' · ')),
                line(voluntary?'Requested by':'Doctor',voluntary?managementReviewRow.voluntary_requester_name:managementReviewRow.instructed_by_name)
              ),
              h('div',{className:'mdr-card'},
                h('div',{className:'mdr-card-title'},'Payment'),
                managementReviewLoading
                  ?h('div',{className:'small-note'},'Loading account…')
                  :h('div',{className:'mdr-money'},
                    h('div',null,h('span',null,'Charges'),h('b',null,money(totals.Charge))),
                    h('div',null,h('span',null,'Paid / Advance'),h('b',{className:'good'},money(paid))),
                    h('div',null,h('span',null,'Discount given'),h('b',null,money(totals.Discount))),
                    h('div',{className:'mdr-due'},h('span',null,'Outstanding'),h('b',{className:outstanding>0?'bad':'good'},money(outstanding)))
                  ),
                managementReviewError?h('div',{className:'mdr-note bad'},managementReviewError):null,
                !managementReviewLoading&&pending>0?h('div',{className:'mdr-note warn'},`${pending} charge request(s) awaiting Accounts — not included above. A discount can be given only after Accounts resolves them.`):null
              )
            );
          })(),
          h('button',{type:'button',className:'btn btn-secondary mdr-full-btn',onClick:()=>setManagementReviewFull(v=>!v)},
            managementReviewFull?'▲ Hide full details':'▼ View full details (charge requests, nursing request, all transactions)'),
          managementReviewFull&&h('div',{className:'mdr-full'},
          h('div',{className:'message '+(managementReviewError||managementSnapshot?.pending_count?'warning':'info'),role:'status'},
            managementReviewLoading?'Loading the complete account and charge requests…':managementReviewError||
              (managementSnapshot?.pending_count
                ?`${managementSnapshot.pending_count} unresolved charge request(s). These are not included in posted outstanding. Accounts must resolve them before a final discount. Approval without a discount forwards the request to Accounts.`
                :'All raised charge requests are resolved. The account will be checked again when you approve.'),
            h('button',{type:'button',className:'btn btn-secondary',disabled:busy||managementReviewLoading,onClick:()=>openManagementReview(managementReviewRow)},'Refresh account review')
          ),
          h(LogTable,{
            title:`Raised Charge Requests (${managementSnapshot?.requests?.length||0})`,
            subtitle:'Includes pending, posted and rejected requests. Amounts awaiting Accounts are not treated as zero.',
            heads:['Raised','Item','Quantity','Status','Amount','Ledger'],
            rows:(managementSnapshot?.requests||[]).map(row=>[
              formatDateTimeIN(row.raised_at||row.created_at||row.charge_date),
              row.service_name||row.description||row.category||'Charge request',
              row.quantity??1,row.approval_status||'Pending',
              row.final_amount==null?'Amount awaiting Accounts':`₹${Number(row.final_amount).toLocaleString('en-IN')}`,
              row.unresolved?'Awaiting Accounts / posting':row.approval_status==='Rejected'?'Rejected':'Posted'
            ])
          }),

          h(Section,{title:'Discharge Request Submitted by Nursing',subtitle:'Review the full initiation details before taking a management decision'},
            h('div',{className:'modal-grid'},
              h('div',{className:'field'},h('label',null,'Patient'),h('input',{readOnly:true,value:patientLabel(managementReviewRow.patient_id)})),
              h('div',{className:'field'},h('label',null,'Initiation Basis'),h('input',{readOnly:true,value:managementReviewRow.initiation_basis||'—'})),
              h('div',{className:'field'},h('label',null,'Consultant / Requester'),h('input',{readOnly:true,value:
                managementReviewRow.initiation_basis==='Voluntary Discharge'
                  ?managementReviewRow.voluntary_requester_name||'—'
                  :managementReviewRow.instructed_by_name||'—'
              })),
              h('div',{className:'field'},h('label',null,'Contact'),h('input',{readOnly:true,value:
                managementReviewRow.initiation_basis==='Voluntary Discharge'
                  ?managementReviewRow.voluntary_requester_contact||'—'
                  :managementReviewRow.instructed_by_contact||'—'
              })),
              h('div',{className:'field span-2'},h('label',null,
                managementReviewRow.initiation_basis==='Voluntary Discharge'
                  ?'Voluntary Declaration / Reason'
                  :'Doctor Discharge Advice'
              ),h('textarea',{readOnly:true,rows:3,value:managementReviewRow.doctor_discharge_advice||'—'})),
              h('div',{className:'field'},h('label',null,'Discharge Type'),h('input',{readOnly:true,value:managementReviewRow.discharge_type||'—'})),
              h('div',{className:'field'},h('label',null,'Proposed Date & Time'),h('input',{readOnly:true,value:`${formatDateIN(managementReviewRow.proposed_discharge_date)} · ${String(managementReviewRow.proposed_discharge_time||'—').slice(0,5)}`})),
              h('div',{className:'field'},h('label',null,'Destination'),h('input',{readOnly:true,value:[managementReviewRow.destination,managementReviewRow.destination_details].filter(Boolean).join(' · ')||'—'})),
              h('div',{className:'field'},h('label',null,'Condition at Discharge'),h('input',{readOnly:true,value:managementReviewRow.condition_at_discharge||'—'}))
            )
          ),

          h(LogTable,{
            title:managementReviewLoading?'Loading patient account…':`Patient Account Transactions (${managementBilling.length})`,
            subtitle:'All charges, payments, advances, discounts and refunds are retained permanently',
            heads:['Date','Type','Category','Mode','Description','Amount'],
            rows:managementBilling.map(row=>[
              formatDateTimeIN(row.transaction_date),
              row.transaction_type||'—',
              row.category||'—',
              row.payment_mode||'—',
              row.description||'—',
              `₹${Number(row.amount||0).toLocaleString('en-IN')}`
            ])
          })
          ),

          h(Section,{title:profile?.role==='Admin'?'Discount & Decision':'Decision',subtitle:profile?.role==='Admin'
            ?'Discount is optional. Every discount is saved permanently in the billing history.'
            :'Approve or return to Nursing.'
          },
            h('div',{className:'modal-grid'},
              h('div',{className:'field span-2'},
                h('label',null,'Remarks'),
                h('textarea',{
                  rows:2,
                  value:managementRemarks,
                  onChange:e=>setManagementRemarks(e.target.value),
                  placeholder:'Clinical review, management instructions or reason for rejection.'
                })
              ),
              profile?.role==='Admin'&&h(React.Fragment,null,
                miniInput('Discount Amount (₹)',managementDiscount,v=>setManagementDiscount(v),false,'number'),
                miniInput('Discount Reason',managementDiscountReason,v=>setManagementDiscountReason(v))
              )
            ),
            h('div',{className:'actions mdr-actions'},
              h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setManagementReviewRow(null)},'Cancel'),
              h('button',{
                type:'button',
                className:'btn btn-danger',
                disabled:busy,
                onClick:rejectAndReturnToNursing
              },busy?'Saving…':'Reject & Return to Nursing'),
              h('button',{type:'button',className:'btn btn-primary',disabled:busy||managementReviewLoading||!!managementReviewError||!managementSnapshot||(Number(managementDiscount)>0&&Number(managementSnapshot?.pending_count)>0),onClick:()=>approveReviewed('Approved')},busy?'Saving…':'Approve & Forward to Accounts')
            )
          )
        )
      ),

      showFinalDischarge&&finalDischargeRow&&h('div',{
        className:'modal-backdrop',
        'data-manual-close':'true',
        onMouseDown:event=>event.stopPropagation()
      },
        h('form',{
          className:'card modal final-discharge-modal',
          onSubmit:completeFinalDischarge,
          onClick:event=>event.stopPropagation()
        },
          h('div',{className:'panel-head'},
            h('div',null,
              h('h3',null,'Final Nursing Discharge Clearance'),
              h('small',null,patientLabel(finalDischargeRow.patient_id))
            ),
            h('button',{type:'button',className:'close',onClick:()=>setShowFinalDischarge(false)},'×')
          ),
          h('div',{className:'message success'},
            finalDischargeCompleted?'Final discharge completed successfully. The patient has been discharged and the room and bed released.':
            'Accounts clearance completed. For each item choose Handed over or None, tick the two clinical confirmations, and record the actual departure before releasing the room and bed.'
          ),
          h('fieldset',{disabled:busy||finalDischargeCompleted,style:{border:0,padding:0,margin:0,minWidth:0}},
          h('div',{className:'final-discharge-checklist'},
            h('div',{className:'handover-summary-auto'},
              h('span',null,'✓ Discharge Summary is sent to the family automatically on WhatsApp after this step.'),
              h('label',null,h('input',{type:'checkbox',checked:!!finalForm.summary_printed_copy,onChange:e=>setFinalForm({...finalForm,summary_printed_copy:e.target.checked})}),'Printed copy also handed over')),
            HANDOVER_CHOICES.map(([key,label,options])=>h('div',{className:`handover-choice-card${finalForm[key]?'':' missing'}`,key},
              h('strong',null,label),
              h('div',{className:'handover-choice-options',role:'radiogroup','aria-label':label},
                options.map(option=>h('button',{type:'button',key:option,role:'radio','aria-checked':finalForm[key]===option?'true':'false',className:finalForm[key]===option?'active':'',onClick:()=>setFinalForm({...finalForm,[key]:option})},option))))),
            [
              ['final_instructions_explained','Medication, diet and follow-up instructions explained'],
              ['patient_condition_confirmed','Patient condition checked and fit for departure / transfer']
            ].map(([key,label])=>h('label',{className:'check-card',key},
              h('input',{
                type:'checkbox',
                checked:!!finalForm[key],
                onChange:e=>setFinalForm({...finalForm,[key]:e.target.checked})
              }),
              h('span',null,label)
            ))
          ),
          h('div',{className:'modal-grid'},
            miniInput('Received / Accompanied By',finalForm.receiving_person_name,v=>setFinalForm({...finalForm,receiving_person_name:v}),true),
            miniInput('Contact Number',finalForm.receiving_person_contact,v=>setFinalForm({...finalForm,receiving_person_contact:v})),
            miniInput('Relationship',finalForm.relationship,v=>setFinalForm({...finalForm,relationship:v})),
            miniInput('Actual Departure Date & Time',finalForm.actual_departure_time,v=>setFinalForm({...finalForm,actual_departure_time:v}),true,'datetime-local'),
            h('div',{className:'field span-2'},h('label',null,'Reason for late entry (required when over one hour late)'),h('textarea',{value:finalForm.late_entry_reason||'',onChange:e=>setFinalForm({...finalForm,late_entry_reason:e.target.value}),rows:2})),
            miniSelect(
              'Transport Mode',
              finalForm.transport_mode,
              [
                'Own / Family Transport',
                'Ambulance',
                'Samara Vehicle',
                'Taxi / Cab',
                'Auto-rickshaw',
                'Hospital Ambulance',
                'Other'
              ],
              v=>setFinalForm({...finalForm,transport_mode:v})
            ),
            miniInput('Transport / Vehicle Details',finalForm.transport_details,v=>setFinalForm({...finalForm,transport_details:v})),
            miniInput('Accompanied By',finalForm.accompanied_by_name,v=>setFinalForm({...finalForm,accompanied_by_name:v}),true),
            miniInput('Relationship',finalForm.accompanied_by_relationship,v=>setFinalForm({...finalForm,accompanied_by_relationship:v}),true),
            miniInput('Accompanying Person Contact',finalForm.accompanied_by_contact,v=>setFinalForm({...finalForm,accompanied_by_contact:v}),true),
            miniInput('Review Appointment Date',finalForm.review_appointment_date,v=>setFinalForm({...finalForm,review_appointment_date:v}),false,'date'),
            miniInput('Review Appointment Time',finalForm.review_appointment_time,v=>setFinalForm({...finalForm,review_appointment_time:v}),false,'time'),
            miniInput('Review Doctor / Consultant',finalForm.review_doctor_name,v=>setFinalForm({...finalForm,review_doctor_name:v})),
            miniInput('Hospital / Clinic',finalForm.review_hospital_clinic,v=>setFinalForm({...finalForm,review_hospital_clinic:v})),
            h('div',{className:'field span-2'},
              h('label',null,'Review Appointment Instructions'),
              h('textarea',{
                rows:3,
                value:finalForm.review_instructions,
                onChange:e=>setFinalForm({...finalForm,review_instructions:e.target.value}),
                placeholder:'Follow-up instructions, reports to carry, fasting requirement, tests or appointment notes.'
              })
            ),
            h('div',{className:'field span-2'},
              h('label',null,'Final Nursing Remarks'),
              h('textarea',{
                rows:4,
                required:true,
                value:finalForm.final_remarks,
                onChange:e=>setFinalForm({...finalForm,final_remarks:e.target.value}),
                placeholder:'Patient condition, documents handed over, medicines, belongings, receiving person and departure details.'
              })
            )
          ),
          ),
          finalDischargeCompleted&&h('div',{className:'message success',role:'status','aria-live':'polite'},'✓ Final discharge completed successfully. The room and bed have been released. You can close this window.'),
          h('div',{className:'actions'},
            !finalDischargeCompleted&&h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>setShowFinalDischarge(false)},'Cancel'),
            h('button',{className:'btn btn-primary',disabled:busy||finalDischargeCompleted},finalDischargeCompleted?'Discharge Completed':busy?'Completing…':'Complete Final Discharge & Release Room'),
            finalDischargeCompleted&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setShowFinalDischarge(false)},'Close')
          )
        )
      ),

      toast&&h('div',{className:`samara-toast ${toast.type}`},h('span',{className:'samara-toast-icon'},toast.type==='success'?'✓':'!'),h('div',null,h('strong',null,toast.title),h('span',null,toast.text)),h('button',{onClick:()=>setToast(null)},'×'))
    );
  }


