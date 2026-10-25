  function Physiotherapy({profile,onNavigate,filters=null}){
    const canEnter=['Admin','Manager','Nurse','Caregiver'].includes(profile?.role);
    const [plans,setPlans]=React.useState([]);
    const [patients,setPatients]=React.useState([]);
    const [sessions,setSessions]=React.useState([]);
    const [todaySessions,setTodaySessions]=React.useState([]);
    const [sessionLock,setSessionLock]=React.useState(null); // 2.18.106: already charged to Guest / therapist fee posted // 2.18.105: always today's, whatever period is filtered
    const [loading,setLoading]=React.useState(true);
    const [message,setMessage]=React.useState('');
    const [entryPlan,setEntryPlan]=React.useState(null);
    const [editingSession,setEditingSession]=React.useState(null);
    const canReview=profile?.role==='Admin'||isNursingManagerProfile(profile);
    // 2.18.126: a notification opens only that correction request (with Approve / Reject).
    const [requestFocus,clearRequestFocus]=useRecordFocus('Physiotherapy');
    const focusedRequestId=requestFocus?.kind==='physio_request'?requestFocus.id:'';
    const myIds=[profile?.id,profile?.auth_user_id].filter(Boolean);
    const ownRequest=request=>myIds.includes(request.requested_by);
    const [requests,setRequests]=React.useState([]);
    const [requestAction,setRequestAction]=React.useState('');
    const [requestReason,setRequestReason]=React.useState('');
    const [reviewNotes,setReviewNotes]=React.useState({});
    const [saving,setSaving]=React.useState(false);
    const [toast,setToast]=React.useState(null);
    const [returnPage,setReturnPage]=React.useState('');
    const toastTimer=React.useRef(null);
    const [form,setForm]=React.useState({
      session_date:todayISOIndia(),
      scheduled_time:'',
      actual_time:'',
      status:'Completed',
      reason:'',
      notes:''
    });
    const [rescheduleDate,setRescheduleDate]=React.useState(todayISOIndia());
    const [rescheduleTime,setRescheduleTime]=React.useState('');
    const [organisations,setOrganisations]=React.useState([]);
    const [practitioners,setPractitioners]=React.useState([]),[nameSuggestionsOpen,setNameSuggestionsOpen]=React.useState(false);
    const nameMatches=()=>String(form.physiotherapist_name||'').trim().length<3?[]:practitioners.filter(row=>row.organisation_id===form.organisation_id&&row.full_name.toLowerCase().includes(form.physiotherapist_name.trim().toLowerCase()));
    const organisationFields=()=>h(React.Fragment,null,
      h('div',{className:'field'},h('label',null,'Physiotherapy Organisation'),h('select',{'aria-label':'Physiotherapy Organisation',required:form.status!=='Reschedule',value:form.organisation_id||'',onChange:e=>{setForm({...form,organisation_id:e.target.value,physiotherapist_name:''});setNameSuggestionsOpen(false)}},h('option',{value:''},'Choose organisation'),organisations.map(row=>h('option',{key:row.id,value:row.id},row.name)))),
      h('div',{className:'field'},h('label',null,'Physiotherapist Name'),h('input',{'aria-label':'Physiotherapist Name',role:'combobox','aria-autocomplete':'list','aria-expanded':nameSuggestionsOpen&&nameMatches().length>0,'aria-controls':'physio-name-options',autoComplete:'off',required:form.status==='Completed',value:form.physiotherapist_name||'',placeholder:'Type 3 letters or enter a new name',onFocus:()=>setNameSuggestionsOpen(true),onChange:e=>{setForm({...form,physiotherapist_name:e.target.value});setNameSuggestionsOpen(true)}}),nameSuggestionsOpen&&nameMatches().length>0&&h('div',{id:'physio-name-options',role:'listbox','aria-label':'Recorded physiotherapists',className:'actions'},nameMatches().map(row=>h('button',{type:'button',key:row.id,role:'option','aria-selected':form.physiotherapist_name===row.full_name,className:'btn btn-secondary',onClick:()=>{setForm({...form,physiotherapist_name:row.full_name});setNameSuggestionsOpen(false)}},row.full_name))),h('small',{className:'small-note'},'Choose a recorded name after typing 3 letters, or enter a new name. New names are saved for Admin when the session is saved.')),
      (form.organisation_id||form.physiotherapist_name)&&h('div',{className:'field span-2'},h(PhysioContact,{organisationId:form.organisation_id,name:form.physiotherapist_name,showName:true}))); // 2.18.124: call the physiotherapist from the form 

    const timeOptions=Array.from({length:24},(_,hour)=>{
      const h12=hour%12||12;
      const suffix=hour<12?'AM':'PM';
      const value=`${String(hour).padStart(2,'0')}:00`;
      return {value,label:`${h12}:00 ${suffix}`};
    });

    function clockLabel(value){
      if(!value)return '—';
      const raw=String(value).slice(0,5);
      const [h,m]=raw.split(':').map(Number);
      if(Number.isNaN(h)||Number.isNaN(m))return value;
      return `${h%12||12}:${String(m).padStart(2,'0')} ${h<12?'AM':'PM'}`;
    }

    function showToast(type,text){
      showSamaraActionToast(type,type==='success'?'Saved successfully':'Action failed',text);
      clearTimeout(toastTimer.current);
      setToast({type,text});
      toastTimer.current=setTimeout(()=>setToast(null),4500);
    }
    React.useEffect(()=>()=>clearTimeout(toastTimer.current),[]);

    async function load(){
      setLoading(true);setMessage('');
      const [plansResult,patientsResult,sessionsResult,requestsResult,organisationsResult,practitionersResult]=await Promise.all([
        client.from('physiotherapy_plans').select('*').order('created_at',{ascending:false}),
        client.from('patients').select('id,title,full_name,patient_id,room_no,bed_no,is_active,admission_status').order('full_name'),
        filters?loadPhysioFilteredSessions(filters):client.from('physiotherapy_sessions').select('*').order('session_date',{ascending:false}).order('created_at',{ascending:false}).limit(300),
        client.from('physiotherapy_corrections').select('*').order('requested_at',{ascending:false}).limit(300),
        client.rpc('physio_organisation_options'),
        client.rpc('physio_practitioner_options'),
        client.from('physiotherapy_sessions').select('*').eq('session_date',todayISOIndia())
      ]).then(r=>{const today=r.pop();if(!today.error)setTodaySessions(today.data||[]);return r;});
      if(plansResult.error){
        setMessage(plansResult.error.message||'Unable to load physiotherapy plans.');
        setPlans([]);
      }else{
        // Hide plans of discharged/inactive residents (their physiotherapy stops at discharge).
        const patientRows=patientsResult.error?null:(patientsResult.data||[]);
        const admitted=patientRows?new Set(patientRows.filter(p=>p.is_active!==false&&p.admission_status!=='Discharged').map(p=>p.id)):null;
        setPlans((plansResult.data||[]).filter(row=>row.is_active!==false&&(!admitted||admitted.has(row.patient_id))));
      }
      if(!patientsResult.error)setPatients(patientsResult.data||[]);
      if(!sessionsResult.error)setSessions(sessionsResult.data||[]);else{setSessions([]);setMessage(sessionsResult.error.message||'Unable to load physiotherapy sessions.');}
      if(requestsResult.error)setMessage('Unable to load correction requests: '+requestsResult.error.message);else setRequests(requestsResult.data||[]);
      if(organisationsResult.error)setMessage('Unable to load physiotherapy organisations: '+organisationsResult.error.message);else setOrganisations(organisationsResult.data||[]);
      if(practitionersResult.error)setMessage('Unable to load physiotherapist names: '+practitionersResult.error.message);else setPractitioners(practitionersResult.data||[]);
      setLoading(false);
    }

    React.useEffect(()=>{
      load();
      const channel=client.channel('physiotherapy-live')
        .on('postgres_changes',{event:'*',schema:'public',table:'physiotherapy_plans'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'physiotherapy_sessions'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'physiotherapy_corrections'},load)
        .subscribe();
      return()=>client.removeChannel(channel);
    },[filters?.key]);

    const taskNavigationHandled=React.useRef(false);
    React.useEffect(()=>{
      if(loading||taskNavigationHandled.current)return;
      const context=readTaskNavigationContext('Physiotherapy');
      if(!context)return;
      taskNavigationHandled.current=true;
      setReturnPage(context.return_page||'');
      const target=plans.find(plan=>plan.id===context.plan_id)
        ||plans.find(plan=>plan.patient_id===context.patient_id);
      if(target){
        openEntry(target);
        setForm(current=>({...current,status:context.status||'Completed',...(context.scheduled_time?{scheduled_time:String(context.scheduled_time).slice(0,5)}:{})})); // 2.18.94: the session's own time
      }
      clearTaskNavigationContext();
    },[loading,plans]);

    function organisationFor(record,plan={}){
      const linked=organisations.find(row=>row.id===(record?.organisation_id||plan.organisation_id));if(linked)return linked;
      const name=String(record?.physiotherapist_name||plan.physiotherapist_name||'').trim().toLowerCase();
      return organisations.find(row=>row.name.trim().toLowerCase()===name||(row.name.trim().toLowerCase()==='vinayaga physio point'&&name==='vinayaga physiotherapy point'))||(organisations.length===1?organisations[0]:null);
    }
    function attendingName(record,plan={}){
      const name=String(record?.physiotherapist_name||'').trim();
      if(!name)return '';
      const organisation=organisationFor(record,plan);
      return name.toLowerCase()===organisation?.name?.trim().toLowerCase()||['vinayaga physiotherapy point','vinayaga physio point'].includes(name.toLowerCase())?'':name;
    }
    const actualTimeField=()=>h('div',{className:'field'},h('label',null,'Actual Session Time (IST)'),h('input',{'aria-label':'Actual Session Time',type:'time',required:true,value:form.actual_time||'',onChange:e=>setForm({...form,actual_time:e.target.value})}),h('small',{className:'small-note'},'Enter the time treatment actually took place.'));
    const patientFor=id=>patients.find(p=>p.id===id)||{};
    const planFor=id=>plans.find(p=>p.id===id)||{};
    const patientLabel=id=>{
      const patient=patientFor(id);
      return patient.id
        ? `${formalName(patient)}${patient.patient_id?` · ${patient.patient_id}`:''}${patient.room_no?` · Room ${patient.room_no}${patient.bed_no?`-${patient.bed_no}`:''}`:''}`
        : 'Patient not linked';
    };

    // 2.18.93: Twice / Thrice daily plans record each session separately (SQL 280: one session per plan, date AND
    // scheduled time). The number of sessions a day comes from the plan's frequency.
    function physioSessionsPerDay(plan){return Math.max(physioSessionsPerDayFor(plan?.frequency),physioPlanTimes(plan).length||1);}
    const physioHHMM=v=>String(v||'').slice(0,5);
    // 2.18.105: today's progress for a plan. A session counts once it is recorded (Completed / Not Done).
    // Recorded sessions whose scheduled time is not one of the plan times still use up a slot, in order,
    // so a session entered as 10:30 does not leave the 8:00 AM slot looking "not done".
    function physioTodayStatus(plan){
      const perDay=physioSessionsPerDay(plan);
      const times=physioPlanTimes(plan);
      const mine=todaySessions.filter(row=>(row.plan_id||row.order_id)===plan.id);
      const recorded=mine.filter(row=>row.status!=='Pending'||row.session_at);
      const covered=new Set();let loose=0;
      recorded.forEach(row=>{const t=physioHHMM(row.scheduled_time);if(times.includes(t)&&!covered.has(t))covered.add(t);else loose++;});
      const open=times.filter(t=>!covered.has(t));
      const openAfterLoose=open.slice(Math.min(loose,open.length));
      const done=Math.min(perDay,recorded.length);
      const missingTimes=times.length<perDay;
      const pendingRow=mine.find(row=>row.status==='Pending'&&!row.session_at)||null;
      return {perDay,times,recorded,done,allDone:done>=perDay,nextTime:openAfterLoose[0]||'',openTimes:openAfterLoose,missingTimes,pendingRow};
    }
    const ordinal=n=>['1st','2nd','3rd','4th'][n]||`${n+1}th`;
    function openEntry(plan,session=null){
      setNameSuggestionsOpen(false);
      const pending=session||sessions.find(row=>(row.plan_id||row.order_id)===plan.id&&row.session_date===todayISOIndia()&&row.status==='Pending'&&!row.session_at);
      setEditingSession(null);
      setRescheduleDate(todayISOIndia());setRescheduleTime('');
      setEntryPlan(plan);
      setForm({
        session_date:pending?.session_date||todayISOIndia(),
        scheduled_time:(()=>{if(pending)return String(pending.scheduled_time||plan.preferred_time||'').slice(0,5);
          // 2.18.105: the next plan time not yet covered today (Twice daily → morning, then evening)
          return physioTodayStatus(plan).nextTime||'';})(),
        actual_time:'',
        status:'Completed',
        organisation_id:organisationFor(pending,plan)?.id||'',
        physiotherapist_name:attendingName(pending,plan),
        reason:'',
        notes:''
      });
    }

    function openCorrection(session){
      setNameSuggestionsOpen(false);
      const plan=planFor(session.plan_id||session.order_id);
      setEntryPlan(null);setRequestAction('');setRequestReason('');
      setEditingSession(session);
      setSessionLock(null);
      client.rpc('physio_session_locks',{p_sessions:[session.id]}).then(({data,error})=>{if(!error&&Array.isArray(data)&&data[0])setSessionLock(data[0])}).catch(()=>{});
      setForm({actual_time:String(session.actual_time||'').slice(0,5),organisation_id:organisationFor(session,plan)?.id||'',physiotherapist_name:attendingName(session,plan),session_date:session.session_date,scheduled_time:String(session.scheduled_time||plan.preferred_time||'').slice(0,5),status:session.status||'Completed',reason:session.reason||'',notes:session.notes||''});
    }

    async function saveSession(e){
      e.preventDefault();
      if(!canEnter||!entryPlan||saving)return;
      if(form.status==='Reschedule'){
        if(!form.reason.trim()||!rescheduleDate||!rescheduleTime){showToast('error','Enter the new date, time and reason.');return;}
        setSaving(true);
        try{
          const {error}=await client.rpc('request_planned_physio_reschedule',{p_plan:entryPlan.id,p_original_date:form.session_date,p_new_date:rescheduleDate,p_new_time:rescheduleTime,p_reason:form.reason.trim()});
          if(error)throw error;
          setEntryPlan(null);showToast('success','Reschedule submitted for Nursing Manager/Admin approval. The session has not been marked Completed.');await load();
        }catch(error){showToast('error',error.message||'Unable to request reschedule.');}finally{setSaving(false);}
        return;
      }
      if(!form.organisation_id||(form.status==='Completed'&&!form.physiotherapist_name?.trim())){showToast('error','Choose the organisation and enter the attending physiotherapist name for a completed session.');return;}
      if(form.status==='Completed'&&(!form.actual_time||!Number.isFinite(Date.parse(form.session_date+'T'+form.actual_time+':00+05:30'))||Date.parse(form.session_date+'T'+form.actual_time+':00+05:30')>Date.now())){showToast('error','Enter the actual session time. Completed sessions cannot have a future actual time.');return;}
      {const pt=patientFor(entryPlan.patient_id);if(pt.id&&(pt.is_active===false||pt.admission_status==='Discharged')){showToast('error','This patient has been discharged. Physiotherapy sessions can no longer be recorded.');return;}}
      if(isFutureDateIndia(form.session_date)){
        showToast('error','Future physiotherapy session dates are not permitted.');
        return;
      }
      if(['Pending','Not Done'].includes(form.status)&&!form.reason.trim()){
        showToast('error',`Reason is mandatory when the status is ${form.status}.`);
        return;
      }
      setSaving(true);
      try{
      const {data:{user},error:authError}=await client.auth.getUser();
      if(authError||!user)throw new Error('Please sign in again before saving this session.');
      const payload={
        plan_id:entryPlan.id,
        order_id:entryPlan.id,
        patient_id:entryPlan.patient_id,
        session_date:form.session_date,
        scheduled_time:form.scheduled_time||entryPlan.preferred_time||null,
        status:form.status,
        actual_time:form.status==='Completed'?form.actual_time:null,
        session_at:form.status==='Completed'?new Date(form.session_date+'T'+form.actual_time+':00+05:30').toISOString():null,
        performed_by:user?.id||profile?.id,
        reason:form.reason||null,
        notes:form.notes||null,
        organisation_id:form.organisation_id,
        physiotherapist_name:form.physiotherapist_name?.trim()||null,
        updated_at:new Date().toISOString()
      };
      const sameDay=(form.session_date===todayISOIndia()?todaySessions:sessions).filter(row=>(row.order_id||row.plan_id)===entryPlan.id&&row.session_date===form.session_date);
      const perDay=physioSessionsPerDay(entryPlan);
      const existing=perDay>1
        ?sameDay.find(row=>physioHHMM(row.scheduled_time)===physioHHMM(payload.scheduled_time))
        :sameDay[0];
      if(!existing&&perDay>1&&sameDay.length>=perDay)throw new Error(`This plan is ${entryPlan.frequency}: ${perDay} sessions are already recorded for ${formatDateIN(form.session_date)}. Open a session's options to request a correction.`);
      if(!existing&&perDay>1&&!payload.scheduled_time)throw new Error('Enter the Scheduled Time of this session (each session of the day needs its own time).');
      let query;
      if(existing){
        if(existing.status!=='Pending'||existing.session_at||!['Completed','Not Done'].includes(form.status))throw new Error(perDay>1
          ?`A session at ${clockLabel(existing.scheduled_time)} is already recorded for this date. For the next session of the day, change the Scheduled Time (e.g. the evening time); to correct this one, open its Session options.`
          :'A session exists for this date. Open its Session options to request a correction.');
        const {status,actual_time,session_at,performed_by,reason,notes,updated_at,organisation_id,physiotherapist_name}=payload;
        query=client.from('physiotherapy_sessions').update({status,actual_time,session_at,performed_by,reason,notes,updated_at,organisation_id,physiotherapist_name}).eq('id',existing.id).eq('status','Pending');
        query=existing.updated_at?query.eq('updated_at',existing.updated_at):query.is('updated_at',null);
      }else{query=client.from('physiotherapy_sessions').insert(payload);}
      const {data,error}=await query
        .select('id')
        .single();
      setSaving(false);
      if(error){
        showToast('error',error.code==='23502'&&String(error.message).includes('session_at')?'Apply the physiotherapy database timestamp repair before saving Pending / Not Done.':error.code==='PGRST116'?'This session changed or is no longer available. Close the form, refresh and try again.':error.message||'Unable to save physiotherapy session.');
        return;
      }
      showToast('success',`Physiotherapy session marked as ${form.status}.`);
      await load();
      finishSuccessfulAction({
        close:()=>setEntryPlan(null),
        returnPage,
        onNavigate
      });
      writeAuditEvent(editingSession?'Physiotherapy Session Corrected':'Physiotherapy Session Recorded','Physiotherapy',data?.id||entryPlan.id,{
        patient_id:entryPlan.patient_id,
        therapy:entryPlan.therapy_type,
        status:form.status,
        reason:form.reason||null,
        correction_reason:editingSession?form.reason.trim():null,
        previous:editingSession?{status:editingSession.status,session_at:editingSession.session_at,reason:editingSession.reason,notes:editingSession.notes,scheduled_time:editingSession.scheduled_time}:null
      },'Success');
      }catch(error){showToast('error',error.message||'Unable to save physiotherapy session.');}
      finally{setSaving(false);}
    }

    async function submitCorrection(e){
      e.preventDefault();if(saving||!editingSession||!canEnter)return;
      if(!requestAction||!requestReason.trim()){showToast('error','Choose an action and enter a reason.');return;}
      setSaving(true);
      try{
        const {error}=await client.rpc('request_physiotherapy_correction',{p_session:editingSession.id,p_action:requestAction,p_reason:requestReason.trim(),p_proposed:requestAction==='Delete'?{}:{session_date:form.session_date,scheduled_time:form.scheduled_time,status:form.status,notes:form.notes,...(requestAction==='Modify'?{actual_time:form.status==='Completed'?form.actual_time:null,organisation_id:form.organisation_id||null,physiotherapist_name:form.physiotherapist_name?.trim()||null}:{})}});
        if(error)throw error;
        setEditingSession(null);showToast('success','Request submitted. The session stays unchanged until Nursing Manager or Admin approves.');await load();
      }catch(error){showToast('error',error.message||'Unable to submit correction.');}finally{setSaving(false);}
    }
    async function reviewRequest(request,approve){
      if(saving||!canReview)return;setSaving(true);
      try{
        const {error}=await client.rpc('review_physiotherapy_correction',{p_request:request.id,p_approve:approve,p_note:reviewNotes[request.id]||''});
        if(error)throw error;showToast('success',approve?'Approved. The session has been corrected.':'Request rejected. The session is unchanged.');await load();
      }catch(error){showToast('error',error.message||'Unable to review request.');}finally{setSaving(false);}
    }
    async function restoreDeletion(request){
      if(saving||!canReview)return;setSaving(true);
      try{const {error}=await client.rpc('restore_physiotherapy_deletion',{p_request:request.id});if(error)throw error;showToast('success','Original session restored.');await load();}
      catch(error){showToast('error',error.message||'Unable to restore session.');}finally{setSaving(false);}
    }
    const requestRows=requests.filter(r=>focusedRequestId?r.id===focusedRequestId:(!filters||physioMatchesFilter(r.original||{},filters))).map(request=>[
      patientLabel(request.original.patient_id),formatDateIN(request.original.session_date),
      request.action,request.original.status+' / '+clockLabel(request.original.scheduled_time)+(request.original.actual_time?' · Actual: '+clockLabel(request.original.actual_time):''),
      request.action==='Delete'?'Remove incorrect entry':formatDateIN(request.proposed.session_date)+' / '+clockLabel(request.proposed.scheduled_time)+' / '+(request.action==='Reschedule'?'Pending':request.proposed.status)+(request.action==='Modify'&&request.proposed.status==='Completed'?' · Actual: '+clockLabel(request.proposed.actual_time):''),
      request.reason,request.state,fmt(request.requested_at),
      canReview&&request.state==='Pending'&&ownRequest(request)?h('span',{className:'badge',style:{background:'#fff4e0',color:'#8a5300'},title:'You cannot approve your own request'},profile?.role==='Admin'?'Your request — waiting for Nursing Manager':'Your request — waiting for Admin'): // 2.18.126
      canReview&&request.state==='Pending'?h('div',null,
        h('input',{'aria-label':'Review note',value:reviewNotes[request.id]||'',placeholder:'Reason required to reject',onChange:e=>setReviewNotes({...reviewNotes,[request.id]:e.target.value})}),
        h('button',{type:'button',className:'btn btn-primary',disabled:saving,onClick:()=>reviewRequest(request,true)},'Approve'),
        h('button',{type:'button',className:'btn btn-secondary',disabled:saving,onClick:()=>reviewRequest(request,false)},'Reject')):
      canReview&&request.state==='Approved'&&request.action==='Delete'?h('button',{type:'button',className:'btn btn-secondary',disabled:saving,onClick:()=>restoreDeletion(request)},'Restore entry'):
      request.review_note||'—'
    ]);

    const planRows=plans.filter(p=>!filters||(!filters.error&&(filters.patientIds===null||filters.patientIds.includes(p.patient_id))&&(!p.start_date||p.start_date<=filters.to)&&(!p.end_date||p.end_date>=filters.from))).map(plan=>[
      patientLabel(plan.patient_id),
      plan.therapy_type||plan.therapy||plan.exercise_name||'—',
      (()=>{const last=[...todaySessions,...sessions].find(row=>(row.plan_id||row.order_id)===plan.id&&(row.organisation_id||row.physiotherapist_name)); // 2.18.124
        const name=plan.physiotherapist_name||last?.physiotherapist_name||'';const same=physioNormName(name)===physioNormName(last?.physiotherapist_name);
        return h('div',null,h('div',null,name||'—'),h(PhysioContact,{name,organisationId:last?.organisation_id,practitionerId:same?last?.practitioner_id:null}));})(),
      plan.frequency||'—',
      (()=>{const st=physioTodayStatus(plan);
        // 2.18.110: a plan whose End Date has passed expects no sessions and sends no reminders — say so plainly.
        if(plan.end_date&&String(plan.end_date).slice(0,10)<todayISOIndia())return h('div',null,
          h('div',null,(physioPlanTimes(plan).length?physioPlanTimes(plan):[physioHHMM(plan.preferred_time)]).filter(Boolean).map(t=>physioWindowLabel(t,plan)).join(', ')),
          h('small',{style:{display:'block',fontWeight:700,color:'#b42318'}},`⚠ Plan ended ${formatDateIN(plan.end_date)} — no sessions expected, no reminders. To continue, clear or extend End Date in Patient Edit.`));
        return h('div',null,
        h('div',null,(physioPlanTimes(plan).length?physioPlanTimes(plan):[physioHHMM(plan.preferred_time||plan.session_time)]).filter(Boolean).map(t=>physioWindowLabel(t,plan)).join(', ')||'—'),
        h('small',{style:{display:'block',fontWeight:700,color:st.allDone||st.done>0?'#0a7a45':'#a91653'}},`Today: ${st.done} of ${st.perDay} done`+(st.recorded.length?` (${st.recorded.map(r=>clockLabel(r.actual_time||r.scheduled_time)).join(', ')})`:'')),
        st.missingTimes&&h('small',{style:{display:'block',color:'#b42318'}},`⚠ ${plan.frequency}: ${st.perDay-st.times.length===1?'second time':'session times'} missing — Admin please add in Patient Edit`));})(),
      plan.end_date?formatDateIN(plan.end_date):'Until Dr. Review',
      plan.precautions||plan.special_instructions||'—',
      canEnter?(()=>{const st=physioTodayStatus(plan);
        if(st.allDone)return h('button',{type:'button',className:'btn btn-secondary',disabled:true,title:'All of today’s sessions are recorded. Use Session options in Recent Sessions to correct one.'},'✓ All done today');
        const label=st.nextTime?`Record ${clockLabel(st.nextTime)} session`:st.perDay>1?`Record ${ordinal(st.done)} session`:'Record Session';
        // 2.18.108: before the next session's time, show it calmly (not as an overdue task).
        const nowHHMM=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());
        const later=st.nextTime&&physioWindowStart(st.nextTime,plan)>nowHHMM;
        return h('button',{type:'button',className:'btn '+(later?'btn-secondary':'btn-primary'),onClick:()=>openEntry(plan),title:later?'Next session window: '+physioWindowLabel(st.nextTime,plan):undefined},later?`Next: ${physioWindowLabel(st.nextTime,plan)}`:st.nextTime?`Record ${physioWindowLabel(st.nextTime,plan)} session`:label);})():h('span',{className:'small-note'},'View only')
    ]);

    const recentRows=sessions.map(session=>{
      const plan=planFor(session.plan_id||session.order_id);
      return [
        formatDateIN(session.session_date),
        patientLabel(session.patient_id),
        plan.therapy_type||'—',
        session.status==='Pending'&&!session.session_at
          ?h('div',null,h('div',null,[organisations.find(row=>row.id===session.organisation_id)?.name,session.physiotherapist_name||plan.physiotherapist_name].filter(Boolean).join(' · ')||'—'),h(PhysioContact,{organisationId:session.organisation_id,practitionerId:session.practitioner_id,name:session.physiotherapist_name||plan.physiotherapist_name})) // 2.18.124
          :[organisations.find(row=>row.id===session.organisation_id)?.name,session.physiotherapist_name||plan.physiotherapist_name].filter(Boolean).join(' · ')||'—',
        // 2.18.111: plan sessions show their window; a rescheduled session keeps its exact time.
        (()=>{const t=physioHHMM(session.scheduled_time||plan.preferred_time);return physioPlanTimes(plan).includes(t)?physioWindowLabel(t,plan):clockLabel(t)+(session.scheduled_time?' (set time)':'');})(),
        session.actual_time?clockLabel(session.actual_time):'Not recorded',
        session.status||'—',
        session.reason||session.notes||'—',
        fmt(session.updated_at||session.created_at),
        canEnter?(session.status==='Pending'&&!session.session_at?h('div',{className:'actions'},h('button',{type:'button',className:'btn btn-primary',disabled:requests.some(request=>request.session_id===session.id&&request.state==='Pending'),onClick:()=>openEntry({...plan,id:session.plan_id||session.order_id,patient_id:session.patient_id},session)},'Record Session'),h('button',{type:'button',className:'btn btn-secondary',disabled:requests.some(request=>request.session_id===session.id&&request.state==='Pending'),onClick:()=>openCorrection(session)},requests.some(request=>request.session_id===session.id&&request.state==='Pending')?'Awaiting approval':'Session options')):h('button',{type:'button',className:'btn btn-secondary',disabled:requests.some(request=>request.session_id===session.id&&request.state==='Pending'),onClick:()=>openCorrection(session)},requests.some(request=>request.session_id===session.id&&request.state==='Pending')?'Awaiting approval':'Session options')):h('span',{className:'small-note'},'View only')
      ];
    });

    if(focusedRequestId)return h(React.Fragment,null, // 2.18.126: only the request the notification points at
      message&&h('div',{className:'message error'},message),
      h(RecordFocusBanner,{focus:requestFocus,onShowAll:clearRequestFocus}),
      loading?h('p',{className:'small-note'},'Loading request…'):!requestRows.length?h('div',{className:'message'},'This request is no longer available. Press Show all to see every request.'):
      h('div',{id:'physio-request-focus'},h(LogTable,{title:'Physiotherapy Correction Request',subtitle:'Approve or reject here. The original session stays unchanged until approval.',heads:['Patient','Original date','Action','Original','Requested change','Reason','Status','Submitted','Review'],rows:requestRows})));
    return h(React.Fragment,null,
      message&&h('div',{className:'message error'},message),
      h('details',{className:'card panel physio-numbers-panel'},h('summary',null,'📞 Physiotherapist phone numbers — tap to call'),h(OdtPhysioDirectory,null)), // 2.18.125
      h(LogTable,{
        title:'Physiotherapy Plan',
        subtitle:'Therapy advised at discharge or during patient review',
        heads:['Patient','Therapy','Physiotherapist Name','Frequency','Session Window','Continue until','Precautions','Action'],
        rows:planRows
      }),
      !loading&&!message&&!planRows.length&&h('div',{className:'card panel'},
        h('p',{className:'small-note'},'No active physiotherapy plan has been entered. Admin or Manager can add the plan from Patient Edit.')
      ),
      h(LogTable,{
        title:'Recent Physiotherapy Sessions',
        subtitle:'Completion, pending and not-done records entered by the care team',
        heads:['Date','Patient','Therapy','Physiotherapist','Session Window / Time','Actual Time (IST)','Status','Reason / Notes','Recorded','Action'],
        rows:recentRows
      }),
      h(PhysioSessionCounts,{profile,filters}),
      h(LogTable,{title:canReview?'Physiotherapy Correction Approvals':'My Correction Requests',subtitle:'Original sessions remain unchanged until approval',heads:['Patient','Original date','Action','Original','Requested change','Reason','Status','Submitted','Review'],rows:requestRows}),
      editingSession&&h('div',{className:'modal-backdrop'},
        h('form',{className:'card modal',onSubmit:submitCorrection},
          h('div',{className:'panel-head'},h('h3',null,'Session options'),h('button',{type:'button',className:'close',disabled:saving,onClick:()=>setEditingSession(null)},'×')),
          h('p',null,patientLabel(editingSession.patient_id)+' · '+formatDateIN(editingSession.session_date)+' · '+editingSession.status),
          sessionLock&&(sessionLock.guest_charge||sessionLock.fee_posted)&&h('div',{className:'message error',role:'alert'},
            h('strong',null,'This session is already '+[sessionLock.guest_charge&&(sessionLock.guest_charge==='Approved'?'charged to the Guest’s bill':'sent to Accounts as a Guest charge ('+sessionLock.guest_charge+')'),sessionLock.fee_posted&&'posted as an outsourced physiotherapist fee'].filter(Boolean).join(' and ')+'. '),
            'Before this correction can be approved: '+[sessionLock.guest_charge&&'Accounts must reject / reverse the Guest charge',sessionLock.fee_posted&&'Admin must reverse the physiotherapist fee (Therapist Accounts → Ledger)'].filter(Boolean).join('; ')+'. You can still submit the request.'),
          h('div',{role:'group','aria-label':'Correction action',className:'actions'},['Delete','Modify','Reschedule'].map(action=>h('button',{type:'button',key:action,className:'btn '+(requestAction===action?'btn-primary':'btn-secondary'),'aria-pressed':requestAction===action,disabled:saving,onClick:()=>setRequestAction(action)},action))),
          requestAction&&h('div',{className:'modal-grid'},
            requestAction!=='Delete'&&h(React.Fragment,null,
              h('div',{className:'field'},h('label',null,requestAction==='Reschedule'?'New session date':'Correct date'),h('input',{'aria-label':'Revised session date',type:'date',required:true,value:form.session_date,min:requestAction==='Reschedule'?todayISOIndia():undefined,max:requestAction==='Modify'&&form.status==='Completed'?todayISOIndia():undefined,onChange:e=>setForm({...form,session_date:e.target.value})})),
              h('div',{className:'field'},h('label',null,'Scheduled time'),h('input',{'aria-label':'Revised session time',type:'time',required:true,value:form.scheduled_time,onChange:e=>setForm({...form,scheduled_time:e.target.value})})),
              requestAction==='Modify'&&h('div',{className:'field'},h('label',null,'Correct status'),h('select',{'aria-label':'Correct status',value:form.status,onChange:e=>setForm({...form,status:e.target.value})},['Completed','Pending','Not Done'].map(status=>h('option',{key:status,value:status},status)))),
              requestAction==='Modify'&&form.status==='Completed'&&actualTimeField(),
              requestAction==='Modify'&&organisationFields(),
              requestAction==='Modify'&&h('div',{className:'field span-2'},h('label',null,'Correct notes'),h('textarea',{'aria-label':'Correct notes',rows:2,value:form.notes,onChange:e=>setForm({...form,notes:e.target.value})}))),
            h('div',{className:'field span-2'},h('label',null,'Reason'),h('textarea',{'aria-label':'Correction request reason',required:true,rows:2,value:requestReason,onChange:e=>setRequestReason(e.target.value),'data-samara-voice':'off'})),
            h('p',{className:'small-note span-2'},requestAction==='Delete'?'Approval removes this entry from active records. Its original details are kept for audit and can be restored.':'The existing session is unchanged until approval. Rescheduling moves it to the new date/time with Pending status.')),
          h('div',{className:'actions'},h('button',{type:'button',className:'btn btn-secondary',disabled:saving,onClick:()=>setEditingSession(null)},'Cancel'),h('button',{className:'btn btn-primary',disabled:saving||!requestAction},saving?'Submitting…':'Submit for approval')))),
      entryPlan&&h('div',{className:'modal-backdrop',onClick:e=>{if(e.target===e.currentTarget)setEntryPlan(null)}},
        h('form',{className:'card modal',onSubmit:saveSession},
          h('div',{className:'panel-head'},
            h('div',null,
              h('h3',null,editingSession?'Correct Physiotherapy Session':'Record Physiotherapy Session'),
              h('small',null,`${patientLabel(entryPlan.patient_id)} · ${entryPlan.therapy_type||'Therapy'}`)
            ),
            h('button',{type:'button',className:'close',onClick:()=>setEntryPlan(null)},'×')
          ),
          h('div',{className:'modal-grid'},
            editingSession&&h('p',{className:'small-note span-2'},'Choose the correct status, enter one reason, and save. The original date and previous values are retained in the audit trail.'),
            h('div',{className:'field'},h('label',null,'Session Date'),h('input',{
              type:'date',value:form.session_date,max:todayISOIndia(),required:true,disabled:!!editingSession,
              onChange:e=>setForm({...form,session_date:e.target.value})
            })),
            (()=>{
              // 2.18.105: for today, the session is chosen from the plan's own times; staff type only the Actual time.
              const st=physioTodayStatus(entryPlan);
              const fromPlan=!editingSession&&form.session_date===todayISOIndia()&&st.times.length>0&&!st.missingTimes;
              const pendingLocked=!!sessions.find(row=>(row.plan_id||row.order_id)===entryPlan.id&&row.session_date===form.session_date&&row.status==='Pending'&&!row.session_at&&physioHHMM(row.scheduled_time)===physioHHMM(form.scheduled_time));
              if(fromPlan)return h('div',{className:'field'},h('label',null,'Session (plan time)'),
                h('select',{'aria-label':'Scheduled Time',required:true,value:form.scheduled_time,disabled:form.status==='Reschedule'||pendingLocked,onChange:e=>setForm({...form,scheduled_time:e.target.value})},
                  h('option',{value:''},st.openTimes.length?'Choose session':'All sessions recorded'),
                  st.times.map((t,i)=>h('option',{key:t,value:t,disabled:!st.openTimes.includes(t)},`${st.times.length>1?ordinal(i)+' session · ':''}${physioWindowLabel(t,entryPlan)}${st.openTimes.includes(t)?'':' — ✓ recorded'}`))),
                h('small',{className:'small-note'},'Session window from the plan (any time inside it is on time). Enter when treatment actually happened in “Actual Session Time”. To move it outside the window, choose Reschedule.'));
              return h('div',{className:'field'},h('label',null,'Scheduled Time'),h('input',{'aria-label':'Scheduled Time',type:'time',required:true,value:form.scheduled_time,disabled:form.status==='Reschedule'||pendingLocked,onChange:e=>setForm({...form,scheduled_time:e.target.value})}),
                st.missingTimes&&form.session_date===todayISOIndia()&&h('small',{className:'error-text'},`This ${entryPlan.frequency} plan is missing a session time. Enter the plan time (not the actual time); Admin should add it in Patient Edit.`));
            })(),
            (()=>{
              // 2.18.105: warn before a duplicate — show what is already recorded for this date.
              if(editingSession)return null;
              const st=physioTodayStatus(entryPlan);
              const sameDay=(form.session_date===todayISOIndia()?todaySessions:sessions).filter(row=>(row.plan_id||row.order_id)===entryPlan.id&&row.session_date===form.session_date&&(row.status!=='Pending'||row.session_at));
              if(!sameDay.length)return null;
              const clash=sameDay.find(row=>physioHHMM(row.scheduled_time)===physioHHMM(form.scheduled_time));
              const full=sameDay.length>=st.perDay;
              // 2.18.123: when this is simply the next session of the day, just say so — no "Session options" button
              // (it opened the earlier session for correction and confused staff). The button stays only for a real duplicate.
              if(!clash&&!full)return h('div',{className:'message success span-2',role:'status'},
                h('strong',null,`Session ${sameDay.length} of ${st.perDay} is already done today (actual ${sameDay.map(r=>clockLabel(r.actual_time||r.scheduled_time)).join(', ')}). `),
                `This form records the next session${form.scheduled_time?` — ${physioWindowLabel(form.scheduled_time,entryPlan)}`:''}. Enter the Actual Session Time and press Save Session.`);
              return h('div',{className:'message error span-2',role:'status'},
                h('strong',null,clash?'This session is already recorded. ':`All ${st.perDay} session(s) for this date are already recorded. `),
                sameDay.map(row=>h('div',{key:row.id,style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginTop:6}},
                  h('span',null,`${clockLabel(row.scheduled_time)} · ${row.status}${row.actual_time?' · actual '+clockLabel(row.actual_time):''}`),
                  h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setEntryPlan(null);openCorrection(row)}},'Correct this entry'))),
                (clash||full)&&h('small',{style:{display:'block',marginTop:6}},'Do not record it again. To change it, use Open Session options (needs Nursing Manager / Admin approval).'));
            })(),
            h('div',{className:'field'},h('label',null,'Status'),h('div',{role:'group','aria-label':'Session Status',style:{display:'flex',flexWrap:'wrap',gap:'6px'}},
              ['Completed','Pending','Not Done','Reschedule'].map(status=>h('button',{
                key:status,type:'button',className:`btn ${form.status===status?'btn-primary':'btn-secondary'}`,
                'aria-pressed':form.status===status,disabled:saving,
                onClick:()=>setForm(current=>({...current,status,reason:status==='Completed'&&!editingSession?'':current.reason}))
              },status)))),
            form.status==='Completed'&&actualTimeField(),
            form.status!=='Reschedule'&&organisationFields(),
            form.status==='Reschedule'&&h(React.Fragment,null,
              h('div',{className:'field'},h('label',null,'New session date'),h('input',{'aria-label':'New session date',type:'date',required:true,min:todayISOIndia(),value:rescheduleDate,onChange:e=>setRescheduleDate(e.target.value)})),
              h('div',{className:'field'},h('label',null,'New session time'),h('input',{'aria-label':'New session time',type:'time',required:true,value:rescheduleTime,onChange:e=>setRescheduleTime(e.target.value)})),
              h('p',{className:'small-note span-2'},'The scheduled session remains Pending until Nursing Manager/Admin approves the new date and time.')),
            (editingSession||['Pending','Not Done','Reschedule'].includes(form.status))&&h('div',{key:'session-reason',className:'field span-2'},h('label',null,editingSession?'Reason for correction':'Reason (mandatory)'),h('textarea',{
              required:true,rows:3,value:form.reason,onChange:e=>setForm({...form,reason:e.target.value}),
              placeholder:editingSession?'Example: Marked completed by mistake; session rescheduled':form.status==='Pending'?'Example: Patient temporarily unavailable / session rescheduled':'Example: Patient refused / medically unfit / therapist unavailable'
            })),
            h('div',{className:'field span-2'},h('label',null,'Session Notes'),h('textarea',{
              rows:3,value:form.notes,onChange:e=>setForm({...form,notes:e.target.value}),
              placeholder:'Exercises completed, patient tolerance, pain, mobility response or instructions'
            }))
          ),
          h('div',{className:'actions'},
            h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setEntryPlan(null)},'Cancel'),
            h('button',{className:'btn btn-primary',disabled:saving},saving?'Saving…':form.status==='Reschedule'?'Submit reschedule for approval':'Save Session')
          )
        )
      ),
      toast&&h('div',{className:`samara-toast ${toast.type}`,role:'status','aria-live':'polite'},
        h('span',{className:'samara-toast-icon','aria-hidden':'true'},toast.type==='success'?'✓':'!'),
        h('div',null,h('strong',null,toast.type==='success'?'Session saved':'Save failed'),h('span',null,toast.text)),
        h('button',{type:'button','aria-label':'Close notification',onClick:()=>setToast(null)},'×')
      )
    );
  }
  
