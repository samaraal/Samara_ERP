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
      @media(max-width:700px){
        .final-discharge-checklist{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(style);
  };

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
    const [managementReviewRow,setManagementReviewRow]=React.useState(null);
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
    const [finalForm,setFinalForm]=React.useState({
      discharge_summary_handed_over:false,
      medicines_handed_over:false,
      reports_handed_over:false,
      belongings_handed_over:false,
      valuables_handed_over:false,
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
      final_remarks:'Patient left the facility after receiving discharge documents, medicines and belongings.'
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
      return p.id?`${formalName(p)} · ${p.patient_id||'—'} · Room ${p.room_no||'—'}${p.bed_no?`-${p.bed_no}`:''}`:'—';
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
        client.from('patients').select('id,title,full_name,patient_id,mobile,room_no,bed_no,is_active,attendant_name,attendant_phone,treating_doctor,doctor_phone,hospital_name').order('full_name')
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
      onNavigate?.('Payments');
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
        discharge_summary_handed_over:!!row.discharge_summary_handed_over,
        medicines_handed_over:!!row.medicines_handed_over,
        reports_handed_over:!!row.reports_handed_over,
        belongings_handed_over:!!row.valuables_handed_over,
        valuables_handed_over:!!row.valuables_handed_over,
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
        final_remarks:'Patient left the facility after receiving discharge documents, medicines and belongings.'
      });
      setShowFinalDischarge(true);
    }

    async function completeFinalDischarge(e){
      e.preventDefault();
      if(!isNurse||isAssignedDirector||busy||!finalDischargeRow||finalDischargeCompleted||finalDischargeSubmitting.current)return;

      const requiredChecks=[
        ['discharge_summary_handed_over','Discharge summary handed over'],
        ['medicines_handed_over','Medicines handed over'],
        ['reports_handed_over','Reports/documents handed over'],
        ['belongings_handed_over','Personal belongings handed over'],
        ['valuables_handed_over','Valuables handed over / confirmed none'],
        ['final_instructions_explained','Final instructions explained'],
        ['patient_condition_confirmed','Patient condition confirmed before departure']
      ];
      const missing=requiredChecks.filter(([key])=>!finalForm[key]).map(([,label])=>label);
      if(missing.length){
        notify('error','Final discharge not completed',`Complete all checklist items: ${missing.join(', ')}.`);
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
        const rpcResult=await client.rpc('confirm_patient_departure_v4',{
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
        p_discharge_summary_handed_over:finalForm.discharge_summary_handed_over,
        p_medicines_handed_over:finalForm.medicines_handed_over,
        p_reports_handed_over:finalForm.reports_handed_over,
        p_belongings_handed_over:finalForm.belongings_handed_over,
        p_valuables_handed_over:finalForm.valuables_handed_over,
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
      notify(
        whatsappAccepted?'success':'warning',
        'Patient discharged successfully',
        whatsappAccepted
          ?`Final nursing clearance completed by ${completedRow.completed_by_name}. The family discharge confirmation was accepted by Meta.`
          :`Final nursing clearance completed and the room is available. Family WhatsApp was not sent${whatsappError?`: ${whatsappError}`:''}. Use Retry WhatsApp in the register.`
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
    ));
    const tableRows=visibleRows.map(row=>[
      patientLabel(row.patient_id),
      row.initiation_basis||'—',
      row.initiation_basis==='Voluntary Discharge'
        ?`${row.voluntary_requested_by||'Voluntary'} · ${row.voluntary_requester_name||'—'} · ${row.voluntary_requester_contact||'—'}`
        :`${row.instructed_by_name||'—'} · ${row.instructed_by_contact||'—'}`,
      formatDateIN(row.proposed_discharge_date),
      row.initiated_by_name||'—',
      h('span',{className:`badge ${row.management_status==='Approved'?'':'off'}`},row.management_status||'Pending'),
      row.management_approved_by_name||'—',
      row.management_approved_at?fmt(row.management_approved_at):'—',
      h('span',{className:`badge ${row.accounts_status==='Cleared'?'':'off'}`},row.accounts_status==='Cleared'?'Cleared':(row.accounts_recheck_at||String(row.accounts_remarks||'').includes('Financial activity changed after clearance'))?'Recheck required':row.accounts_status||'Pending'),
      row.accounts_cleared_by_name||'—',
      row.accounts_cleared_at?fmt(row.accounts_cleared_at):'—',
      h('span',{className:`badge ${row.status==='Completed'?'':'off'}`},row.status!=='Completed'&&row.discount_request_status==='Pending'?'Discount Approval Pending — Admin / Director':row.status!=='Completed'&&(row.accounts_recheck_at||String(row.accounts_remarks||'').includes('Financial activity changed after clearance'))&&row.accounts_status!=='Cleared'?'Accounts recheck required':row.status||'Initiated'),
      row.status==='Completed'?(row.completed_by_name||'—'):'—',
      h('div',{className:'employee-actions'},
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
        ['Admin','Manager'].includes(profile?.role)&&String(row.status||'').trim().toLowerCase()==='completed'&&row.review_appointment_date&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>sendReviewAppointmentWhatsAppApi(row)},'Send Review Reminder API')
      )
    ]);

    return h(React.Fragment,null,
      h(Section,{
        title:isAccountsClearance?'Discharge Clearance':'Patient Discharge',
        subtitle:isAccountsClearance
          ?'Management-approved cases only — verify final billing, receive/adjust payment and complete financial clearance'
          :'Nursing initiation → Admin/Manager approval → Accounts payment closure → automatic return to Nursing'
      },
        message&&h('div',{className:'message error'},message),
        h('div',{className:'panel-head'},
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
          ),
          canInitiate&&!(
            isNurse&&rows.some(row=>
              row.accounts_status==='Cleared'&&
              row.status!=='Completed'
            )
          )&&h('button',{className:'btn btn-primary',onClick:openNew},'Initiate Discharge')
        )
      ),
      !isAccountsClearance&&h(DischargeMedicationReview),
      h(window.SamaraDischargeWorkflow.Panel,{client,profile,onChanged:load}),
      h(LogTable,{title:isAccountsClearance?`Pending Financial Clearance (${tableRows.length})`:`Discharge Workflow Register (${tableRows.length})`,
        heads:['Patient','Initiation Basis','Instruction / Request','Date','Initiated By','Management','Decision By','Decision Time','Accounts','Last Cleared By','Last Clearance Time','Current Status','Completed By','Action'],
        rows:tableRows
      }),
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
          className:'card modal',
          style:{width:'min(1180px,97vw)',maxHeight:'94vh',overflow:'auto'}
        },
          h('div',{className:'panel-head'},
            h('div',null,
              h('h3',null,'Management Discharge Review'),
              h('small',null,patientLabel(managementReviewRow.patient_id))
            ),
            h('button',{type:'button',className:'close',onClick:()=>setManagementReviewRow(null)},'×')
          ),

          h('div',{className:'accounts-kpi-grid'},
            (()=>{
              const totals=managementBillingTotals(managementBilling);
              const paid=Number(totals.Payment||0)+Number(totals.Advance||0);
              const outstanding=Math.max(0,Number(totals.Charge||0)-paid-Number(totals.Discount||0)+Number(totals.Refund||0));
              return [
                ['Total Charges',totals.Charge||0,'blue'],
                ['Payments / Advance',paid,'green'],
                ['Discount History',totals.Discount||0,'pink'],
                ['Current Outstanding',outstanding,'red']
              ].map(([label,value,tone])=>h('div',{className:`accounts-kpi ${tone}`,key:label},
                h('span',null,label),
                h('strong',null,`₹${Number(value||0).toLocaleString('en-IN')}`),
                h('small',null,'Posted account at review; pending requests listed below')
              ));
            })()
          ),

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
          }),

          h(Section,{title:'Management Decision',subtitle:profile?.role==='Admin'
            ?'The Administrator may approve a discharge discount. Every discount is saved in the permanent billing history.'
            :'Review the clinical and account information before approval or rejection.'
          },
            h('div',{className:'modal-grid'},
              h('div',{className:'field span-2'},
                h('label',null,'Management Remarks'),
                h('textarea',{
                  rows:3,
                  value:managementRemarks,
                  onChange:e=>setManagementRemarks(e.target.value),
                  placeholder:'Clinical review, management instructions or reason for rejection.'
                })
              ),
              profile?.role==='Admin'&&h(React.Fragment,null,
                miniInput('Discount Amount',managementDiscount,v=>setManagementDiscount(v),false,'number'),
                miniInput('Discount Reason',managementDiscountReason,v=>setManagementDiscountReason(v))
              )
            ),
            h('div',{className:'actions'},
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
            'Accounts clearance completed. Confirm all clinical handover items and the patient’s actual departure before releasing the room and bed.'
          ),
          h('fieldset',{disabled:busy||finalDischargeCompleted,style:{border:0,padding:0,margin:0,minWidth:0}},
          h('div',{className:'final-discharge-checklist'},
            [
              ['discharge_summary_handed_over','Discharge summary handed over'],
              ['medicines_handed_over','Medicines handed over'],
              ['reports_handed_over','Reports and investigation documents handed over'],
              ['belongings_handed_over','Personal belongings handed over'],
              ['valuables_handed_over','Valuables handed over / confirmed none'],
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


