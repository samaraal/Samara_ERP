  function Physiotherapy({profile,onNavigate}){
    const canEnter=['Admin','Manager','Nurse','Caregiver'].includes(profile?.role);
    const [plans,setPlans]=React.useState([]);
    const [patients,setPatients]=React.useState([]);
    const [sessions,setSessions]=React.useState([]);
    const [loading,setLoading]=React.useState(true);
    const [message,setMessage]=React.useState('');
    const [entryPlan,setEntryPlan]=React.useState(null);
    const [saving,setSaving]=React.useState(false);
    const [toast,setToast]=React.useState(null);
    const [returnPage,setReturnPage]=React.useState('');
    const toastTimer=React.useRef(null);
    const [form,setForm]=React.useState({
      session_date:todayISOIndia(),
      scheduled_time:'',
      status:'Completed',
      reason:'',
      notes:''
    });

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
      const [plansResult,patientsResult,sessionsResult]=await Promise.all([
        client.from('physiotherapy_plans').select('*').order('created_at',{ascending:false}),
        client.from('patients').select('id,title,full_name,patient_id,room_no,bed_no,is_active,admission_status').order('full_name'),
        client.from('physiotherapy_sessions').select('*').order('session_date',{ascending:false}).order('created_at',{ascending:false}).limit(300)
      ]);
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
      if(!sessionsResult.error)setSessions(sessionsResult.data||[]);
      setLoading(false);
    }

    React.useEffect(()=>{
      load();
      const channel=client.channel('physiotherapy-live')
        .on('postgres_changes',{event:'*',schema:'public',table:'physiotherapy_plans'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'physiotherapy_sessions'},load)
        .subscribe();
      return()=>client.removeChannel(channel);
    },[]);

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
        setForm(current=>({...current,status:context.status||'Completed'}));
      }
      clearTaskNavigationContext();
    },[loading,plans]);

    const patientFor=id=>patients.find(p=>p.id===id)||{};
    const planFor=id=>plans.find(p=>p.id===id)||{};
    const patientLabel=id=>{
      const patient=patientFor(id);
      return patient.id
        ? `${formalName(patient)}${patient.patient_id?` · ${patient.patient_id}`:''}${patient.room_no?` · Room ${patient.room_no}${patient.bed_no?`-${patient.bed_no}`:''}`:''}`
        : 'Patient not linked';
    };

    function openEntry(plan){
      setEntryPlan(plan);
      setForm({
        session_date:todayISOIndia(),
        scheduled_time:String(plan.preferred_time||'').slice(0,5),
        status:'Completed',
        reason:'',
        notes:''
      });
    }

    async function saveSession(e){
      e.preventDefault();
      if(!entryPlan||saving)return;
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
      const {data:{user}}=await client.auth.getUser();
      const payload={
        plan_id:entryPlan.id,
        order_id:entryPlan.id,
        patient_id:entryPlan.patient_id,
        session_date:form.session_date,
        scheduled_time:form.scheduled_time||entryPlan.preferred_time||null,
        status:form.status,
        session_at:form.status==='Completed'?new Date().toISOString():null,
        performed_by:user?.id||profile?.id,
        reason:form.reason||null,
        notes:form.notes||null,
        physiotherapist_name:entryPlan.physiotherapist_name||null,
        updated_at:new Date().toISOString()
      };
      const {data,error}=await client.from('physiotherapy_sessions')
        .upsert(payload,{onConflict:'order_id,session_date'})
        .select('id')
        .single();
      setSaving(false);
      if(error){
        showToast('error',error.message||'Unable to save physiotherapy session.');
        return;
      }
      showToast('success',`Physiotherapy session marked as ${form.status}.`);
      await load();
      finishSuccessfulAction({
        close:()=>setEntryPlan(null),
        returnPage,
        onNavigate
      });
      writeAuditEvent('Physiotherapy Session Recorded','Physiotherapy',data?.id||entryPlan.id,{
        patient_id:entryPlan.patient_id,
        therapy:entryPlan.therapy_type,
        status:form.status,
        reason:form.reason||null
      },'Success');
    }

    const planRows=plans.map(plan=>[
      patientLabel(plan.patient_id),
      plan.therapy_type||plan.therapy||plan.exercise_name||'—',
      plan.physiotherapist_name||'—',
      plan.frequency||'—',
      clockLabel(plan.preferred_time||plan.session_time),
      plan.precautions||plan.special_instructions||'—',
      canEnter?h('button',{type:'button',className:'btn btn-primary',onClick:()=>openEntry(plan)},'Record Session'):h('span',{className:'small-note'},'View only')
    ]);

    const recentRows=sessions.map(session=>{
      const plan=planFor(session.plan_id||session.order_id);
      return [
        formatDateIN(session.session_date),
        patientLabel(session.patient_id),
        plan.therapy_type||'—',
        session.physiotherapist_name||plan.physiotherapist_name||'—',
        clockLabel(session.scheduled_time||plan.preferred_time),
        session.status||'—',
        session.reason||session.notes||'—',
        fmt(session.updated_at||session.created_at)
      ];
    });

    return h(React.Fragment,null,
      message&&h('div',{className:'message error'},message),
      h(LogTable,{
        title:'Physiotherapy Plan',
        subtitle:'Therapy advised at discharge or during patient review',
        heads:['Patient','Therapy','Physiotherapist Name','Frequency','Preferred Time','Precautions','Action'],
        rows:planRows
      }),
      !loading&&!message&&!planRows.length&&h('div',{className:'card panel'},
        h('p',{className:'small-note'},'No active physiotherapy plan has been entered. Admin or Manager can add the plan from Patient Edit.')
      ),
      h(LogTable,{
        title:'Recent Physiotherapy Sessions',
        subtitle:'Completion, pending and not-done records entered by the care team',
        heads:['Date','Patient','Therapy','Physiotherapist','Scheduled Time','Status','Reason / Notes','Recorded'],
        rows:recentRows
      }),
      entryPlan&&h('div',{className:'modal-backdrop',onClick:e=>{if(e.target===e.currentTarget)setEntryPlan(null)}},
        h('form',{className:'card modal',onSubmit:saveSession},
          h('div',{className:'panel-head'},
            h('div',null,
              h('h3',null,'Record Physiotherapy Session'),
              h('small',null,`${patientLabel(entryPlan.patient_id)} · ${entryPlan.therapy_type||'Therapy'}`)
            ),
            h('button',{type:'button',className:'close',onClick:()=>setEntryPlan(null)},'×')
          ),
          h('div',{className:'modal-grid'},
            h('div',{className:'field'},h('label',null,'Session Date'),h('input',{
              type:'date',value:form.session_date,max:todayISOIndia(),
              onChange:e=>setForm({...form,session_date:e.target.value})
            })),
            h('div',{className:'field'},h('label',null,'Preferred / Scheduled Time'),h('select',{
              value:form.scheduled_time,onChange:e=>setForm({...form,scheduled_time:e.target.value})
            },h('option',{value:''},'Select time'),timeOptions.map(option=>h('option',{key:option.value,value:option.value},option.label)))),
            h('div',{className:'field'},h('label',null,'Status'),h('select',{
              value:form.status,onChange:e=>setForm({...form,status:e.target.value,reason:e.target.value==='Completed'?'':form.reason})
            },['Completed','Pending','Not Done'].map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field'},h('label',null,'Physiotherapist Name'),h('input',{
              value:entryPlan.physiotherapist_name||'',readOnly:true
            })),
            ['Pending','Not Done'].includes(form.status)&&h('div',{className:'field span-2'},h('label',null,'Reason (mandatory)'),h('textarea',{
              required:true,rows:3,value:form.reason,onChange:e=>setForm({...form,reason:e.target.value}),
              placeholder:form.status==='Pending'?'Example: Patient temporarily unavailable / session rescheduled':'Example: Patient refused / medically unfit / therapist unavailable'
            })),
            h('div',{className:'field span-2'},h('label',null,'Session Notes'),h('textarea',{
              rows:3,value:form.notes,onChange:e=>setForm({...form,notes:e.target.value}),
              placeholder:'Exercises completed, patient tolerance, pain, mobility response or instructions'
            }))
          ),
          h('div',{className:'actions'},
            h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setEntryPlan(null)},'Cancel'),
            h('button',{className:'btn btn-primary',disabled:saving},saving?'Saving…':'Save Session')
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
  
