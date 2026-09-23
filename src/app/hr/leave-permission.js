  function StaffLeaveChanges({profile,reviewOnly=false,onChanged}){
    const [data,setData]=React.useState({leaves:[],requests:[],can_approve:false}),[open,setOpen]=React.useState(false),[target,setTarget]=React.useState(null),[approve,setApprove]=React.useState(true),[busy,setBusy]=React.useState(false),[msg,setMsg]=React.useState(''),[leave,setLeave]=React.useState(''),[from,setFrom]=React.useState(''),[to,setTo]=React.useState(''),[note,setNote]=React.useState('');
    const lock=React.useRef(false);
    async function load(){const r=await client.rpc('staff_leave_change_workspace');if(r.error)setMsg(r.error.message);else setData(r.data)}
    React.useEffect(()=>{load();const id=setInterval(load,30000);return()=>clearInterval(id)},[]);
    const mine=data.requests.filter(r=>r.employee_id===profile.id),queue=data.can_approve?data.requests.filter(r=>r.status==='Pending'&&r.employee_id!==profile.id):[];
    const eligible=data.leaves.filter(r=>!mine.some(x=>x.leave_id===r.id&&x.status==='Pending'));
    const selected=data.leaves.find(r=>String(r.id)===leave);
    function choose(id){setLeave(id);const r=data.leaves.find(r=>String(r.id)===id);setFrom(r?.from_date||'');setTo(r?.to_date||'')}
    function start(){setTarget(null);choose(eligible.length?String(eligible[0].id):'');setNote('');setMsg('');setOpen(true)}
    async function save(e){e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setMsg('');try{
      const r=target?await client.rpc('decide_staff_leave_change',{p_request_id:target.id,p_approve:approve,p_remarks:note.trim()}):await client.rpc('submit_staff_leave_change',{p_leave_id:Number(leave),p_from:from,p_to:to,p_reason:note.trim()});
      if(r.error)throw r.error;setMsg(r.data.message);setOpen(false);await load();if(onChanged)await onChanged();
    }catch(error){setMsg(error.message||'Unable to save leave change')}finally{lock.current=false;setBusy(false)}}
    const dates=r=>h('p',null,`Approved: ${formatDateIN(r.original_from)} – ${formatDateIN(r.original_to)} → Requested: ${formatDateIN(r.requested_from)} – ${formatDateIN(r.requested_to)}`);
    if(reviewOnly&&!data.can_approve&&!msg)return null;
    return h(Section,{title:reviewOnly?'Leave Change Approvals':'Extend / Modify Leave',subtitle:'Revised dates take effect only after Admin/Director approval. Original leave history is retained.',actions:h('div',{className:'absence-actions'},!reviewOnly&&h('button',{type:'button',className:'btn btn-primary',onClick:start},'Extend / Modify Leave'),h('button',{type:'button',className:'btn btn-secondary',onClick:load},'Refresh Leave Changes'))},
      !open&&msg&&h('div',{className:'message',role:'status'},msg),
      queue.map(r=>h('div',{className:'absence-card',key:r.id},h('strong',null,r.employee_name||'Staff'),dates(r),h('p',null,r.reason),h('div',{className:'absence-actions'},h('button',{className:'btn btn-primary',onClick:()=>{setTarget(r);setApprove(true);setNote('');setMsg('');setOpen(true)}},'Review Leave Change'),h('button',{className:'btn btn-secondary',onClick:()=>{setTarget(r);setApprove(false);setNote('');setMsg('');setOpen(true)}},'Reject Leave Change')))),
      reviewOnly&&!queue.length&&h('p',null,'No leave changes awaiting approval.'),
      (reviewOnly?data.requests.filter(r=>r.status!=='Pending'):mine).slice(0,10).map(r=>h('div',{className:'absence-card',key:r.id},h('strong',null,`${reviewOnly?(r.employee_name||'Staff')+' · ':''}Leave change ${r.status.toLowerCase()}`),dates(r),h('p',null,`Reason: ${r.reason}`),r.decided_at&&h('p',null,`${r.decided_by_name||'Management'} · ${formatDateTimeIN(r.decided_at)} · ${r.decision_remarks}`))),
      open&&h('div',{className:'modal-backdrop'},h('form',{className:'card modal absence-modal',onSubmit:save},h('h3',null,target?(approve?'Approve Leave Change':'Reject Leave Change'):'Extend / Modify Leave'),
        target?h(React.Fragment,null,h('strong',null,target.employee_name||'Staff'),dates(target),h('p',null,target.reason)):h(React.Fragment,null,
          h('div',{className:'field'},h('label',{htmlFor:'change-leave-id'},'Approved Leave'),h('select',{id:'change-leave-id',value:leave,required:true,onChange:e=>choose(e.target.value)},h('option',{value:''},'Select approved leave'),eligible.map(r=>h('option',{key:r.id,value:String(r.id)},`${formatDateIN(r.from_date)} – ${formatDateIN(r.to_date)} · ${r.leave_type||'Leave'}`)))),
          !eligible.length&&h('p',null,'No approved leave is available to modify. A pending change or Return to Duty must be resolved first.'),
          h('div',{className:'modal-grid'},h('div',{className:'field'},h('label',{htmlFor:'change-from'},'Revised From Date'),h('input',{id:'change-from',type:'date',required:true,value:from,disabled:selected?.from_date<=todayISOIndia(),min:todayISOIndia(),onChange:e=>setFrom(e.target.value)})),h('div',{className:'field'},h('label',{htmlFor:'change-to'},'Revised To Date'),h('input',{id:'change-to',type:'date',required:true,value:to,min:from>todayISOIndia()?from:todayISOIndia(),onChange:e=>setTo(e.target.value)}))),
          selected?.from_date<=todayISOIndia()&&h('small',null,'Leave has started, so its start date is retained. For an actual early return, use Return to Duty.')),
        h('div',{className:'field'},h('label',{htmlFor:'change-reason'},target?'Decision Remarks':'Reason for Change'),h('textarea',{id:'change-reason',required:true,value:note,onChange:e=>setNote(e.target.value)})),
        h('p',null,'STD’s delegated rights continue until Return to Duty is approved.'),msg&&h('div',{className:'message error',role:'alert'},msg),
        h('div',{className:'modal-actions'},h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>setOpen(false)},'Cancel'),h('button',{type:'submit',className:'btn btn-primary',disabled:busy||(!target&&!eligible.length)},busy?'Saving…':target?(approve?'Approve Leave Change':'Confirm Rejection'):'Submit Change for Approval')))));
  }

  function StaffReturnToDuty({profile,reviewOnly=false,onChanged}){
    const [data,setData]=React.useState({requests:[],leaves:[],handover:false,can_approve:false}),[open,setOpen]=React.useState(false),[target,setTarget]=React.useState(null),[approve,setApprove]=React.useState(true),[busy,setBusy]=React.useState(false),[msg,setMsg]=React.useState(''),[note,setNote]=React.useState(''),[leave,setLeave]=React.useState(''),[when,setWhen]=React.useState('');
    const lock=React.useRef(false);
    const localNow=()=>{const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
    async function load(){const r=await client.rpc('staff_return_workspace');if(r.error)setMsg(r.error.message);else setData(r.data);}
    React.useEffect(()=>{load();const id=setInterval(load,30000);return()=>clearInterval(id)},[]);
    const mine=data.requests.filter(r=>r.employee_id===profile.id),pending=mine.some(r=>r.status==='Pending');
    const queue=data.can_approve?data.requests.filter(r=>r.status==='Pending'&&r.employee_id!==profile.id):[];
    function start(){setTarget(null);setLeave(data.leaves[0]?.id?String(data.leaves[0].id):'');setWhen(localNow());setNote('');setMsg('');setOpen(true);}
    async function save(e){e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setMsg('');try{
      const result=target?await client.rpc('decide_staff_return',{p_request_id:target.id,p_approve:approve,p_remarks:note.trim()}):await client.rpc('submit_staff_return',{p_leave_id:leave?Number(leave):null,p_returned_at:new Date(when).toISOString(),p_remarks:note.trim()});
      if(result.error)throw result.error;setMsg(result.data?.message||'Saved');setOpen(false);await load();if(onChanged)await onChanged();
    }catch(error){setMsg(error.message||'Unable to save return request')}finally{lock.current=false;setBusy(false)}}
    if(reviewOnly&&!data.can_approve&&!msg)return null;
    return h(Section,{title:reviewOnly?'Return to Duty Approvals':'Return to Duty',subtitle:'Staff submit their actual return. Admin/Director confirms it before delegated rights change.',actions:h('div',{className:'absence-actions'},!reviewOnly&&h('button',{type:'button',className:'btn btn-primary',disabled:pending||busy,onClick:start},pending?'Return Awaiting Approval':'Return to Duty'),h('button',{type:'button',className:'btn btn-secondary',onClick:load},'Refresh Returns'))},
      !open&&msg&&h('div',{className:'message',role:'status'},msg),
      queue.map(r=>h('div',{className:'absence-card',key:r.id},h('strong',null,r.employee_name||'Staff'),h('p',null,`Returned: ${formatDateTimeIN(r.returned_at)} · Submitted: ${formatDateTimeIN(r.submitted_at)}`),h('p',null,r.remarks),h('div',{className:'absence-actions'},h('button',{className:'btn btn-primary',onClick:()=>{setTarget(r);setApprove(true);setNote('');setMsg('');setOpen(true)}},'Review & Approve Return'),h('button',{className:'btn btn-secondary',onClick:()=>{setTarget(r);setApprove(false);setNote('');setMsg('');setOpen(true)}},'Reject Return')))),
      reviewOnly&&queue.length===0&&h('p',null,'No staff returns awaiting approval.'),
      !reviewOnly&&mine.slice(0,5).map(r=>h('div',{className:'absence-card',key:r.id},h('strong',null,r.status==='Pending'?'Return awaiting Admin/Director approval':`Return ${r.status.toLowerCase()}`),h('p',null,formatDateTimeIN(r.returned_at)),h('p',null,r.decision_remarks||r.remarks))),
      open&&h('div',{className:'modal-backdrop'},h('form',{className:'card modal absence-modal',onSubmit:save},h('h3',null,target?(approve?'Approve Return to Duty':'Reject Return to Duty'):'Return to Duty'),
        target?h('p',null,`${target.employee_name||'Staff'} · Actual return ${formatDateTimeIN(target.returned_at)}`):h(React.Fragment,null,
          h('div',{className:'field'},h('label',{htmlFor:'staff-return-leave'},'Approved Leave'),h('select',{id:'staff-return-leave',value:leave,required:!data.handover,onChange:e=>setLeave(e.target.value)},h('option',{value:''},data.handover?'Current Nursing Manager handover':'Select approved leave'),data.leaves.map(r=>h('option',{key:r.id,value:String(r.id)},`${formatDateIN(r.from_date)} – ${formatDateIN(r.to_date)}`)))),
          !data.handover&&!data.leaves.length&&h('p',null,'No approved leave is awaiting return. Contact Admin/Director to check your leave record.'),
          h('div',{className:'field'},h('label',{htmlFor:'staff-return-when'},'Actual Return Date & Time'),h('input',{id:'staff-return-when',type:'datetime-local',required:true,max:localNow(),value:when,onChange:e=>setWhen(e.target.value)}))),
        h('div',{className:'field'},h('label',{htmlFor:'staff-return-note'},target?'Approval / Rejection Remarks':'Return Confirmation'),h('textarea',{id:'staff-return-note',required:true,value:note,onChange:e=>setNote(e.target.value),placeholder:target?'Confirm your decision':'I have resumed duty…'})),
        h('p',null,target&&approve?'Approval confirms the return and ends any current STD handover. Early leave is adjusted; attendance must be recorded separately.':'STD retains delegated rights until Admin/Director approves the return.'),
        msg&&h('div',{className:'message error',role:'alert'},msg),
        h('div',{className:'modal-actions'},h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>setOpen(false)},'Cancel'),h('button',{type:'submit',className:'btn btn-primary',disabled:busy||(!target&&!data.handover&&!data.leaves.length)},busy?'Saving…':target?(approve?'Approve Return':'Reject Return'):'Submit Return for Approval')))));
  }

  function LeavePermission({profile,mode='mine',calendar=false}){
    const isApprovals=mode==='approvals';
    const [handoverManagers,setHandoverManagers]=React.useState([]);
    const [returnTarget,setReturnTarget]=React.useState(null),[returnDate,setReturnDate]=React.useState(''),[returnNote,setReturnNote]=React.useState(''),[returnBusy,setReturnBusy]=React.useState(false),[returnError,setReturnError]=React.useState('');
    const returnLock=React.useRef(false);
    function canRecordReturn(r){return !handoverManagers.includes(r.employee_id)&&['Admin','Manager'].includes(profile.role)&&r.employee_id!==profile.id&&r.request_type==='Leave'&&r.status==='approved'&&!r.return_to_duty_date&&r.from_date<=todayISOIndia();}
    function openReturn(r){setReturnTarget(r);setReturnDate(todayISOIndia()<=r.to_date?todayISOIndia():r.to_date);setReturnNote('');setReturnError('');}
    async function saveReturn(e){
      e.preventDefault();if(returnLock.current||!returnTarget)return;
      if(!returnDate||returnDate<returnTarget.from_date||returnDate>returnTarget.to_date||returnDate>todayISOIndia()){setReturnError('Choose an actual return date within the approved leave period, no later than today.');return;}
      if(!returnNote.trim()){setReturnError('Please confirm the employee has rejoined in the remarks.');return;}
      returnLock.current=true;setReturnBusy(true);setReturnError('');
      try{
        const {data,error}=await client.rpc('record_absence_early_return',{p_request_id:returnTarget.id,p_return_date:returnDate,p_remarks:returnNote.trim()});
        if(error)throw error;
        setReturnTarget(null);setMsg(data?.message||'Early return recorded.');await load();
      }catch(error){setReturnError(error.message||'Unable to record the early return.');}
      finally{returnLock.current=false;setReturnBusy(false);}
    }
    function returnDetails(r){return r.return_to_duty_date?h(React.Fragment,null,
      h('div',null,h('small',null,'Originally Approved'),h('strong',null,`${formatDateIN(r.from_date)} – ${formatDateIN(r.original_leave_to_date)}`)),
      h('div',null,h('small',null,'Returned to Duty'),h('strong',null,formatDateIN(r.return_to_duty_date))),
      h('div',null,h('small',null,'Return Confirmed By'),h('strong',null,formalName(byId(r.return_recorded_by))||'Management'),h('small',null,fmt(r.return_recorded_at))),
      h('div',null,h('small',null,'Return Remarks'),h('strong',null,r.return_remarks||'—'))):null;}
    const [rows,setRows]=React.useState([]),[profiles,setProfiles]=React.useState([]),[busy,setBusy]=React.useState(false),[msg,setMsg]=React.useState('');
    const [showForm,setShowForm]=React.useState(false);
    const [modifyTarget,setModifyTarget]=React.useState(null);
    const [modifyFrom,setModifyFrom]=React.useState(''),[modifyTo,setModifyTo]=React.useState(''),[modifyRemarks,setModifyRemarks]=React.useState(''),[modifyBusy,setModifyBusy]=React.useState(false),[modifyError,setModifyError]=React.useState('');
    const [submitBusy,setSubmitBusy]=React.useState(false),[modalMsg,setModalMsg]=React.useState(''),[submitted,setSubmitted]=React.useState(false);
    const empty={request_type:'Leave',leave_type:'Casual Leave',from_date:todayISOIndia(),to_date:todayISOIndia(),shift_part:'Full Day',permission_date:todayISOIndia(),permission_from:'',permission_to:'',reason:'',handover_remarks:'',contact_during_absence:''};
    const [form,setForm]=React.useState(empty);
    const [calendarSearch,setCalendarSearch]=React.useState('');
    const [calendarDate,setCalendarDate]=React.useState(todayISOIndia());
    const [calendarStatusFilter,setCalendarStatusFilter]=React.useState('');
    const [requestStatusFilter,setRequestStatusFilter]=React.useState('');
    const [expandedCalendarRows,setExpandedCalendarRows]=React.useState(new Set());
    const byId=id=>profiles.find(x=>x.id===id)||{};
    const returnModal=returnTarget?h('div',{className:'modal-backdrop'},h('form',{className:'card modal absence-modal',onSubmit:saveReturn},
      h('div',{className:'panel-head'},h('h3',null,'Record Early Return'),h('button',{type:'button',className:'close',disabled:returnBusy,'aria-label':'Close early return',onClick:()=>setReturnTarget(null)},'×')),
      h('p',null,`${returnTarget.employee_name||formalName(byId(returnTarget.employee_id))||'Employee'} · Approved ${formatDateIN(returnTarget.from_date)} – ${formatDateIN(returnTarget.to_date)}`),
      h('div',{className:'modal-grid'},
        h('div',{className:'field'},h('label',{htmlFor:'early-return-date'},'Actual Return Date'),h('input',{id:'early-return-date',type:'date',required:true,min:returnTarget.from_date,max:returnTarget.to_date<todayISOIndia()?returnTarget.to_date:todayISOIndia(),value:returnDate,disabled:returnBusy,onChange:e=>setReturnDate(e.target.value)})),
        h('div',{className:'field span-2'},h('label',{htmlFor:'early-return-note'},'Return Confirmation / Remarks'),h('textarea',{id:'early-return-note',required:true,rows:3,value:returnNote,disabled:returnBusy,onChange:e=>setReturnNote(e.target.value),placeholder:'Confirm when the employee rejoined duty'}))
      ),
      h('p',null,returnDate===returnTarget.from_date?'No leave days taken. The leave will be marked cancelled, with the original approval preserved.':`Leave will end on ${returnDate?formatDateIN(addDaysISO(returnDate,-1)):'—'}. The return date is a working day; the original approval is retained.`),
      h('small',null,'Use this for a return at the start of the working day or shift. Record attendance and duty assignments separately.'),
      returnError?h('div',{className:'message error',role:'alert'},returnError):null,
      h('div',{className:'modal-actions'},h('button',{type:'button',className:'btn btn-secondary',disabled:returnBusy,onClick:()=>setReturnTarget(null)},'Cancel'),h('button',{type:'submit',className:'btn btn-primary',disabled:returnBusy},returnBusy?'Saving…':'Confirm Early Return'))
    )):null;

    const statusLabel=s=>({pending_superior:'Pending Superior',pending_management:'Pending Management',approved:'Approved',rejected:'Rejected',cancelled:'Cancelled'}[s]||s||'—');
    const statusClass=s=>s==='approved'?'success':s==='rejected'?'error':'';
    async function load(){
      setBusy(true);
      const [reqRes,profRes,handoverRes]=await Promise.all([
        client.from('absence_requests').select('*').order('created_at',{ascending:false}).limit(300),
        client.rpc('get_absence_people'),
        client.from('store_incharge_assignments').select('nursing_manager_id').eq('status','Active').lte('effective_from',new Date().toISOString())
      ]);
      if(reqRes.error){setMsg(reqRes.error.message||'Unable to load leave requests');setRows([])}else setRows(reqRes.data||[]);
      if(!profRes.error)setProfiles(profRes.data||[]);
      if(!handoverRes.error)setHandoverManagers((handoverRes.data||[]).map(x=>x.nursing_manager_id).filter(Boolean));
      setBusy(false);
    }
    React.useEffect(()=>{load();const ch=client.channel(`absence-${mode}`).on('postgres_changes',{event:'*',schema:'public',table:'absence_requests'},load).subscribe();return()=>client.removeChannel(ch)},[mode]);
    async function submit(e){
      e.preventDefault();
      if(submitBusy||submitted)return;
      setSubmitBusy(true);setModalMsg('Submitting request…');setMsg('');
      try{
        const payload={request_type:form.request_type,reason:form.reason.trim(),handover_remarks:form.handover_remarks.trim()||null,contact_during_absence:form.contact_during_absence.trim()||null};
        if(form.request_type==='Leave')Object.assign(payload,{leave_type:form.leave_type,from_date:form.from_date,to_date:form.to_date,shift_part:form.shift_part});
        else Object.assign(payload,{permission_date:form.permission_date,permission_from:form.permission_from,permission_to:form.permission_to});
        const {error}=await client.from('absence_requests').insert(payload);if(error)throw error;
        await writeAuditEvent('Submitted','Leave / Permission',null,{type:form.request_type});
        const success=`${form.request_type} request submitted successfully.`;
        setSubmitted(true);setModalMsg(success);setMsg(success);
        await load();
        setTimeout(()=>{setShowForm(false);setForm({...empty});setModalMsg('');setSubmitted(false)},1100);
      }catch(error){
        const text=error.message||'Unable to submit request';
        setModalMsg(text);setMsg(text);
      }finally{
        setSubmitBusy(false);
      }
    }
    function openModifiedApproval(row){
      setModifyTarget(row);setModifyFrom(row.from_date||'');setModifyTo(row.to_date||row.from_date||'');setModifyRemarks('');setModifyError('');
    }
    async function approveModified(e){
      e.preventDefault();
      if(!modifyTarget||modifyBusy)return;
      if(!modifyFrom||!modifyTo){setModifyError('Select the approved From and To dates.');return;}
      if(modifyFrom<modifyTarget.from_date||modifyTo>modifyTarget.to_date||modifyTo<modifyFrom){setModifyError('Approved dates must stay within the employee’s requested leave period.');return;}
      if(modifyFrom===modifyTarget.from_date&&modifyTo===modifyTarget.to_date){setModifyError('There is no date change. Use the normal Approve button instead.');return;}
      setModifyBusy(true);setModifyError('');setMsg('');
      try{
        const {data,error}=await client.rpc('approve_absence_with_modification',{p_request_id:modifyTarget.id,p_approved_from:modifyFrom,p_approved_to:modifyTo,p_remarks:modifyRemarks.trim()||null});
        if(error)throw error;
        setMsg(data?.message||'Leave approved with modified dates.');setModifyTarget(null);await load();
      }catch(error){setModifyError(error.message||'Unable to approve modified leave.');}
      finally{setModifyBusy(false);}
    }
    const modifiedApprovalModal=modifyTarget?h('div',{className:'modal-backdrop'},h('form',{className:'card modal absence-modal',onSubmit:approveModified},
      h('div',{className:'panel-head'},h('div',null,h('h3',null,'Approve with Modification'),h('small',null,'The employee’s original request is retained in the audit record.')),h('button',{type:'button',className:'close',disabled:modifyBusy,onClick:()=>setModifyTarget(null)},'×')),
      h('div',{className:'message'},`Requested: ${formatDateIN(modifyTarget.from_date)} – ${formatDateIN(modifyTarget.to_date)}`),
      h('div',{className:'modal-grid'},
        h('div',{className:'field'},h('label',null,'Approved From'),h('input',{type:'date',required:true,min:modifyTarget.from_date,max:modifyTarget.to_date,value:modifyFrom,disabled:modifyBusy,onChange:e=>{setModifyFrom(e.target.value);if(modifyTo<e.target.value)setModifyTo(e.target.value)}})),
        h('div',{className:'field'},h('label',null,'Approved To'),h('input',{type:'date',required:true,min:modifyFrom||modifyTarget.from_date,max:modifyTarget.to_date,value:modifyTo,disabled:modifyBusy,onChange:e=>setModifyTo(e.target.value)})),
        h('div',{className:'field span-2'},h('label',null,'Management Remarks'),h('textarea',{rows:3,value:modifyRemarks,disabled:modifyBusy,onChange:e=>setModifyRemarks(e.target.value),placeholder:'Example: 2 days approved due to staffing requirement'}))
      ),
      h('small',null,'Duty Calendar, Leave Calendar and automatic Leave Cover will use the approved dates.'),
      modifyError?h('div',{className:'message error',role:'alert'},modifyError):null,
      h('div',{className:'modal-actions'},h('button',{type:'button',className:'btn btn-secondary',disabled:modifyBusy,onClick:()=>setModifyTarget(null)},'Cancel'),h('button',{type:'submit',className:'btn btn-primary',disabled:modifyBusy},modifyBusy?'Approving…':'Approve Modified Leave'))
    )):null;

    async function act(row,action){
      let remarks='';
      if(['reject','approve','recommend'].includes(action))remarks=window.prompt(action==='reject'?'Reason / remarks for rejection:':'Approval / recommendation remarks (optional):','')??'';
      if(action==='reject'&&!remarks.trim())return;
      setBusy(true);setMsg('');
      const {data,error}=await client.rpc('process_absence_request',{p_request_id:row.id,p_action:action,p_remarks:remarks.trim()||null});
      if(error)setMsg(error.message||'Unable to process request');else{setMsg(data?.message||'Request updated successfully.');await load()}
      setBusy(false);
    }
    function duration(r){
      if(r.request_type==='Permission')return [r.permission_from,r.permission_to].filter(Boolean).join(' – ');
      if(r.return_to_duty_date&&r.return_to_duty_date===r.from_date)return '0 days · Returned before taking leave';
      if(!r.from_date||!r.to_date)return '—';
      const days=Math.floor((new Date(r.to_date+'T00:00:00')-new Date(r.from_date+'T00:00:00'))/86400000)+1;
      return `${formatDateIN(r.from_date)}${r.to_date!==r.from_date?` – ${formatDateIN(r.to_date)}`:''} · ${days} day${days===1?'':'s'} · ${r.shift_part||'Full Day'}`;
    }
    const nursingStaffRow=row=>{const p=byId(row.employee_id),d=String(p.department||'').toLowerCase(),g=String(p.designation||'').toLowerCase(),role=String(p.role||'').toLowerCase();return role==='nurse'||role==='caregiver'||d==='nursing'||d==='caregiving'||g.includes('nursing supervisor')};
    const baseVisible=isApprovals
      ?rows.filter(r=>r.employee_id!==profile.id&&(!isNursingManagerProfile(profile)||nursingStaffRow(r)))
      :rows.filter(r=>r.employee_id===profile.id);
    const visible=requestStatusFilter?baseVisible.filter(r=>requestStatusFilter==='pending'?['pending_superior','pending_management'].includes(r.status):r.status===requestStatusFilter):baseVisible;
    const pending=visible.filter(r=>['pending_superior','pending_management'].includes(r.status));
    const history=visible.filter(r=>!['pending_superior','pending_management'].includes(r.status));
    function canRecommend(r){return r.status==='pending_superior'&&r.reporting_superior_id===(profile.__dutyContext?.acting_for_profile_id||profile.id)&&!['Admin','Manager'].includes(profile.role)}
    function canManage(r){return ['Admin','Manager'].includes(profile.role)&&['pending_superior','pending_management'].includes(r.status)}
    function requestCard(r){
      const emp=byId(r.employee_id);const superior=byId(r.reporting_superior_id);
      return h('div',{className:'absence-card',key:r.id},
        h('div',{className:'absence-card-head'},h('div',null,h('strong',null,isApprovals?(formalName(emp)||r.employee_name||'Employee'):`${r.request_type} Request`),h('small',null,`REQ-${String(r.id).padStart(5,'0')} · ${fmt(r.created_at)}`)),h('span',{className:`badge ${statusClass(r.status)}`},statusLabel(r.status))),
        h('div',{className:'absence-grid'},
          h('div',null,h('small',null,'Type'),h('strong',null,r.request_type==='Leave'?(r.leave_type||'Leave'):'Permission')),
          h('div',null,h('small',null,r.request_type==='Leave'?(r.approval_modified?'Approved Period':'Period'):'Date / Time'),h('strong',null,r.request_type==='Leave'?duration(r):`${formatDateIN(r.permission_date)} · ${duration(r)}`)),
          r.request_type==='Leave'&&r.approval_modified?h('div',null,h('small',null,'Originally Requested'),h('strong',null,`${formatDateIN(r.requested_from_date)} – ${formatDateIN(r.requested_to_date)}`)):null,
          h('div',null,h('small',null,'Reporting Superior'),h('strong',null,formalName(superior)||'Manager / Admin directly')),
          h('div',null,h('small',null,'Reason'),h('strong',null,r.reason||'—')),
          returnDetails(r),
          handoverManagers.includes(r.employee_id)&&h('div',{style:{gridColumn:'1/-1'},className:'message'},'Nursing Manager return: Admin/Director must use Approve Return to Duty under Stores In-charge Assignment. STD retains operational rights until approval.'),
          r.handover_remarks?h('div',null,h('small',null,'Handover'),h('strong',null,r.handover_remarks)):null,
          r.superior_remarks?h('div',null,h('small',null,'Superior Remarks'),h('strong',null,r.superior_remarks)):null,
          r.management_remarks?h('div',null,h('small',null,'Management Remarks'),h('strong',null,r.management_remarks)):null,
          !['pending_superior','pending_management'].includes(r.status)?h(React.Fragment,null,
            h('div',null,h('small',null,'Decision By'),h('strong',null,r.decision_by_name?`${r.decision_by_name}${r.decision_by_role?` (${r.decision_by_role})`:''}`:'—')),
            h('div',null,h('small',null,'Decision Date / Time'),h('strong',null,r.decision_at?fmt(r.decision_at):'—'))
          ):null
        ),
        h('div',{className:'absence-actions'},
          canRecordReturn(r)?h('button',{type:'button',className:'btn btn-secondary',disabled:busy||returnBusy,onClick:()=>openReturn(r)},'Record Early Return'):null,
          !isApprovals&&['pending_superior','pending_management'].includes(r.status)?h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>act(r,'cancel')},'Cancel Request'):null,
          isApprovals&&canRecommend(r)?h(React.Fragment,null,h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>act(r,'recommend')},'Recommend'),h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>act(r,'reject')},'Reject')):null,
          isApprovals&&canManage(r)?h(React.Fragment,null,h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>act(r,'approve')},'Approve'),r.request_type==='Leave'?h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>openModifiedApproval(r)},'Approve with Modification'):null,h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>act(r,'reject')},'Reject')):null
        )
      );
    }
    function calendarMatches(r){
      const q=calendarSearch.trim().toLowerCase();
      if(q.length>=3){
        const p=byId(r.employee_id);
        const hay=[p.full_name,p.mobile,p.mobile_number,p.phone,p.phone_number,p.contact_number,p.designation,p.position,p.role,p.department,p.employee_id,p.login_id,r.employee_name].filter(Boolean).join(' ').toLowerCase();
        if(!hay.includes(q))return false;
      }
      const selectedDate=String(calendarDate||todayISOIndia());
      const weekStart=mondayOfWeek(selectedDate);
      const weekEnd=addDaysISO(weekStart,6);
      const from=r.request_type==='Leave'?r.from_date:r.permission_date;
      const to=r.request_type==='Leave'?(r.to_date||r.from_date):r.permission_date;
      return Boolean(from&&to&&from<=weekEnd&&to>=weekStart);
    }
    function calendarRequestCard(r){
      const calendarKey=r.__calendarKey||String(r.id),expanded=expandedCalendarRows.has(calendarKey),emp=byId(r.employee_id);
      return h('div',{className:`absence-card calendar-absence-card${expanded?' is-expanded':''}`,key:calendarKey},
        h('button',{type:'button',className:'calendar-absence-summary',onClick:()=>setExpandedCalendarRows(prev=>{const next=new Set(prev);next.has(calendarKey)?next.delete(calendarKey):next.add(calendarKey);return next})},
          h('span',{className:'calendar-absence-day'},formatDateWithDayIN(r.__calendarDay||(r.request_type==='Leave'?r.from_date:r.permission_date))),
          h('span',{className:'calendar-absence-person'},(isApprovals||calendar)?(formalName(emp)||r.employee_name||'Employee'):(r.request_type==='Leave'?(r.leave_type||'Leave'):'Permission')),
          h('span',{className:`badge ${statusClass(r.status)}`},statusLabel(r.status)),
          h('span',{className:'calendar-absence-chevron'},expanded?'⌃':'⌄')
        ),
        expanded?h('div',{className:'absence-grid calendar-absence-details'},
          h('div',null,h('small',null,'Type'),h('strong',null,r.request_type==='Leave'?(r.leave_type||'Leave'):'Permission')),
          h('div',null,h('small',null,r.request_type==='Leave'?'Period':'Date / Time'),h('strong',null,r.request_type==='Leave'?duration(r):`${formatDateIN(r.permission_date)} · ${duration(r)}`)),
          h('div',null,h('small',null,'Employee'),h('strong',null,formalName(emp)||r.employee_name||'Employee')),
          h('div',null,h('small',null,'Position'),h('strong',null,[emp.designation||emp.position,emp.department].filter(Boolean).join(' · ')||'—')),
          h('div',null,h('small',null,'Reason'),h('strong',null,r.reason||'—')),
          h('div',null,h('small',null,'Status'),h('strong',null,statusLabel(r.status))),
          returnDetails(r),
          handoverManagers.includes(r.employee_id)&&h('div',{style:{gridColumn:'1/-1'},className:'message'},'Nursing Manager return: Admin/Director must use Approve Return to Duty under Stores In-charge Assignment. STD retains operational rights until approval.'),
          r.handover_remarks?h('div',null,h('small',null,'Handover'),h('strong',null,r.handover_remarks)):null,
          r.decision_by_name?h('div',null,h('small',null,'Decision'),h('strong',null,`${r.decision_by_name}${r.decision_at?` · ${fmt(r.decision_at)}`:''}`)):null,
          h('div',{className:'absence-actions',style:{gridColumn:'1/-1'}},
            canRecordReturn(r)?h('button',{type:'button',className:'btn btn-secondary',disabled:busy||returnBusy,onClick:()=>openReturn(r)},'Record Early Return'):null,
            isApprovals&&canRecommend(r)?h(React.Fragment,null,h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>act(r,'recommend')},'Recommend'),h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>act(r,'reject')},'Reject')):null,
            isApprovals&&canManage(r)?h(React.Fragment,null,h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>act(r,'approve')},'Approve'),r.request_type==='Leave'?h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>openModifiedApproval(r)},'Approve with Modification'):null,h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>act(r,'reject')},'Reject')):null
          )
        ):null
      );
    }
    const formModal=showForm?h('div',{className:'modal-backdrop'},h('form',{className:'card modal absence-modal',onSubmit:submit},
      h('div',{className:'panel-head'},h('div',null,h('h3',null,'Apply for Leave / Permission'),h('small',null,'Your request will follow the configured approval hierarchy')),h('button',{type:'button',className:'close',onClick:()=>setShowForm(false)},'×')),
      h('div',{className:'modal-grid'},
        h('div',{className:'field'},h('label',null,'Request Type'),h('select',{value:form.request_type,onChange:e=>setForm({...form,request_type:e.target.value})},['Leave','Permission'].map(x=>h('option',{key:x},x)))),
        form.request_type==='Leave'?h(React.Fragment,null,
          h('div',{className:'field'},h('label',null,'Leave Type'),h('select',{value:form.leave_type,onChange:e=>setForm({...form,leave_type:e.target.value})},['Casual Leave','Sick Leave','Emergency Leave','Compensatory Off','Leave Without Pay','Other'].map(x=>h('option',{key:x},x)))),
          miniInput('From Date',form.from_date,v=>setForm({...form,from_date:v}),true,'date'),miniInput('To Date',form.to_date,v=>setForm({...form,to_date:v}),true,'date'),
          h('div',{className:'field'},h('label',null,'Shift / Day'),h('select',{value:form.shift_part,onChange:e=>setForm({...form,shift_part:e.target.value})},['Full Day','Day Shift','Night Shift','First Half','Second Half'].map(x=>h('option',{key:x},x))))
        ):h(React.Fragment,null,miniInput('Permission Date',form.permission_date,v=>setForm({...form,permission_date:v}),true,'date'),miniInput('From Time',form.permission_from,v=>setForm({...form,permission_from:v}),true,'time'),miniInput('To Time',form.permission_to,v=>setForm({...form,permission_to:v}),true,'time')),
        h('div',{className:'field span-2'},h('label',null,'Reason'),h('textarea',{required:true,rows:3,value:form.reason,onChange:e=>setForm({...form,reason:e.target.value}),placeholder:'Enter the reason for leave / permission'})),
        h('div',{className:'field span-2'},h('label',null,'Handover / Duty Arrangement'),h('textarea',{rows:2,value:form.handover_remarks,onChange:e=>setForm({...form,handover_remarks:e.target.value}),placeholder:'Mention duty handover or replacement arrangement, if applicable'})),
        miniInput('Contact During Absence',form.contact_during_absence,v=>setForm({...form,contact_during_absence:v}),false,'tel')
      ),modalMsg?h('div',{className:`message ${submitted?'success':''}`,style:{marginTop:'12px'}},modalMsg):null,h('div',{className:'modal-actions'},h('button',{type:'button',className:'btn btn-secondary',disabled:submitBusy,onClick:()=>setShowForm(false)},submitted?'Close':'Cancel'),h('button',{type:'submit',className:'btn btn-primary',disabled:submitBusy||submitted},submitted?'Submitted ✓':(submitBusy?'Submitting…':'Submit Request')))
    )):null;
    if(calendar){
      const selectedDate=calendarDate||todayISOIndia();
      const weekStart=mondayOfWeek(selectedDate);
      const weekEnd=addDaysISO(weekStart,6);
      const calendarBaseRows=rows.filter(calendarMatches).filter(r=>!calendarStatusFilter||(calendarStatusFilter==='pending'?['pending_superior','pending_management'].includes(r.status):r.status===calendarStatusFilter)).sort((a,b)=>String(a.from_date||a.permission_date||'').localeCompare(String(b.from_date||b.permission_date||'')));
      const calendarRows=calendarBaseRows.flatMap(r=>{
        if(r.request_type!=='Leave')return [{...r,__calendarDay:r.permission_date,__calendarKey:`${r.id}-${r.permission_date||'date'}`}];
        const from=r.from_date&&r.from_date>weekStart?r.from_date:weekStart;
        const to=(r.to_date||r.from_date)&&((r.to_date||r.from_date)<weekEnd?(r.to_date||r.from_date):weekEnd);
        const days=[];
        for(let day=from;day&&to&&day<=to;day=addDaysISO(day,1))days.push({...r,__calendarDay:day,__calendarKey:`${r.id}-${day}`});
        return days;
      });
      const selectedLabel=`${formatDateWithDayIN(weekStart)} to ${formatDateWithDayIN(weekEnd)}`;
      const currentWeek=mondayOfWeek(todayISOIndia());
      const statusButton=(value,label)=>h('button',{type:'button',className:calendarStatusFilter===value?'active':'',onClick:()=>setCalendarStatusFilter(calendarStatusFilter===value?'':value)},h('strong',null,rows.filter(calendarMatches).filter(r=>value?(value==='pending'?['pending_superior','pending_management'].includes(r.status):r.status===value):true).length),h('small',null,label));
      return h(React.Fragment,null,returnModal,
        h(Section,{title:'Staff Leave Calendar',subtitle:`${selectedLabel} · ${calendarBaseRows.length} leave / permission record${calendarBaseRows.length===1?'':'s'}`,actions:h('button',{className:'btn btn-secondary',onClick:load,disabled:busy},'Refresh')},
          msg?h('div',{className:'message'},msg):null,
          h('div',{className:'selected-week-banner'},h('small',null,'Selected week'),h('strong',null,selectedLabel)),
          h('div',{className:'leave-calendar-controls'},
            h('input',{type:'search',value:calendarSearch,onChange:e=>setCalendarSearch(e.target.value),placeholder:'Search name, mobile, position…','aria-label':'Search staff by name, mobile or position'}),
            h('input',{type:'date',value:calendarDate,onChange:e=>setCalendarDate(e.target.value),'aria-label':'Choose calendar date'}),
            h('button',{type:'button',className:`btn btn-secondary week-filter week-filter-previous ${weekStart===addDaysISO(currentWeek,-7)?'active':''}`,onClick:()=>setCalendarDate(addDaysISO(mondayOfWeek(selectedDate),-7))},'‹ Previous Week'),
            h('button',{type:'button',className:`btn btn-secondary week-filter week-filter-current ${weekStart===currentWeek?'active':''}`,onClick:()=>setCalendarDate(currentWeek)},'This Week'),
            h('button',{type:'button',className:`btn btn-secondary week-filter week-filter-next ${weekStart===addDaysISO(currentWeek,7)?'active':''}`,onClick:()=>setCalendarDate(addDaysISO(mondayOfWeek(selectedDate),7))},'Next Week ›'),
            calendarSearch.length>0&&calendarSearch.length<3?h('small',{className:'field-hint'},'Type at least 3 characters'):null,
            h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setCalendarSearch('');setCalendarDate(todayISOIndia());setCalendarStatusFilter('');setExpandedCalendarRows(new Set())}},'Clear')
          ),
          h('div',{className:'absence-summary leave-calendar-status-filter'},statusButton('','All'),statusButton('pending','Pending'),statusButton('approved','Approved'),statusButton('rejected','Rejected'),statusButton('cancelled','Cancelled')),
          busy?h('div',{className:'empty'},'Loading leave calendar…'):h('div',{className:'absence-list calendar-absence-list'},...calendarRows.map(calendarRequestCard),calendarRows.length===0?h('div',{className:'empty'},'No leave or permission records found for this week.'):null)
        )
      );
    }
    if(isApprovals){
      const directCount=rows.filter(r=>r.status==='pending_superior'&&r.reporting_superior_id===(profile.__dutyContext?.acting_for_profile_id||profile.id)).length;
      const managementCount=['Admin','Manager'].includes(profile.role)?rows.filter(r=>['pending_superior','pending_management'].includes(r.status)&&r.employee_id!==profile.id).length:0;
      if(!['Admin','Manager'].includes(profile.role)&&directCount===0)return h(React.Fragment,null,h(StaffReturnToDuty,{profile,reviewOnly:true,onChanged:load}),h(StaffLeaveChanges,{profile,reviewOnly:true,onChanged:load}),h(Section,{title:'Leave Approvals',subtitle:'Requests from employees reporting to you'},h('div',{className:'empty'},'No leave or permission requests are awaiting your approval.')));
      return h(React.Fragment,null,h(StaffReturnToDuty,{profile,reviewOnly:true,onChanged:load}),h(StaffLeaveChanges,{profile,reviewOnly:true,onChanged:load}),returnModal,modifiedApprovalModal,h(Section,{title:'Leave Approvals',subtitle:['Admin','Manager'].includes(profile.role)?`Management approval queue · ${managementCount} pending`:`Reporting superior approval queue · ${directCount} pending`,actions:h('button',{className:'btn btn-secondary',onClick:load,disabled:busy},'Refresh')},msg?h('div',{className:'message'},msg):null,h('div',{className:'absence-list'},...pending.map(requestCard)),pending.length===0?h('div',{className:'empty'},'No requests awaiting action.'):null),history.length?h(Section,{title:'Recent Decisions',subtitle:'Completed approval history'},h('div',{className:'absence-list'},...history.slice(0,30).map(requestCard))):null);
    }
    return h(React.Fragment,null,h(StaffReturnToDuty,{profile,onChanged:load}),h(StaffLeaveChanges,{profile,onChanged:load}),h(Section,{title:'My Leave & Permission',subtitle:'Apply and track your leave, permission and approval status',actions:h('button',{className:'btn btn-primary',onClick:()=>{setForm({...empty});setModalMsg('');setSubmitted(false);setShowForm(true)}},'＋ New Request')},msg?h('div',{className:'message'},msg):null,h('div',{className:'absence-summary'},h('button',{type:'button',className:requestStatusFilter===''?'active':'',onClick:()=>setRequestStatusFilter('')},h('strong',null,baseVisible.length),h('small',null,'All')),h('button',{type:'button',className:requestStatusFilter==='pending'?'active':'' ,onClick:()=>setRequestStatusFilter(requestStatusFilter==='pending'?'':'pending')},h('strong',null,baseVisible.filter(r=>['pending_superior','pending_management'].includes(r.status)).length),h('small',null,'Pending')),h('button',{type:'button',className:requestStatusFilter==='approved'?'active':'',onClick:()=>setRequestStatusFilter(requestStatusFilter==='approved'?'':'approved')},h('strong',null,baseVisible.filter(r=>r.status==='approved').length),h('small',null,'Approved')),h('button',{type:'button',className:requestStatusFilter==='rejected'?'active':'',onClick:()=>setRequestStatusFilter(requestStatusFilter==='rejected'?'':'rejected')},h('strong',null,baseVisible.filter(r=>r.status==='rejected').length),h('small',null,'Rejected')),h('button',{type:'button',className:requestStatusFilter==='cancelled'?'active':'',onClick:()=>setRequestStatusFilter(requestStatusFilter==='cancelled'?'':'cancelled')},h('strong',null,baseVisible.filter(r=>r.status==='cancelled').length),h('small',null,'Cancelled'))),h('div',{className:'absence-list'},...visible.map(calendarRequestCard),visible.length===0?h('div',{className:'empty'},requestStatusFilter?'No requests found for this status.':'No leave or permission requests submitted yet.'):null)),formModal);
  }


