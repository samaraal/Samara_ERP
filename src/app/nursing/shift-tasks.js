  function ShiftTasks({profile,onNavigate}){
    const today=todayISOIndia();
    const shift=currentShift();
    const [meds,setMeds]=React.useState([]);
    const [medLogs,setMedLogs]=React.useState([]);
    const [care,setCare]=React.useState([]);
    const [careLogs,setCareLogs]=React.useState([]);
    const [physio,setPhysio]=React.useState([]);
    const [physioLogs,setPhysioLogs]=React.useState([]);
    const [vitals,setVitals]=React.useState([]);
    const [loading,setLoading]=React.useState(true);
    const [expanded,setExpanded]=React.useState({});
    const [dashboardFilter,setDashboardFilter]=React.useState('all');
    function openRegularTask(page,context){
      saveTaskNavigationContext({page,return_page:'Shift Tasks',...context});
      onNavigate?.(page);
    }
    const patientFields='id,patient_id,full_name,room_no,bed_no,special_nurse_required,special_nurse_name,special_nurse_shift,fall_risk,pressure_sore_risk,aspiration_risk,wandering_risk,infection_risk,seizure_history,oxygen_required,dressing_required,is_active,admission_status';

    async function load(){
      setLoading(true);
      const [m,ml,c,cl,p,pl,v]=await Promise.all([
        client.from('medication_orders').select(`*,patients(${patientFields})`).eq('is_active',true),
        // Yesterday is included so a late-night dose rescheduled past midnight still appears today.
        client.from('medication_administrations').select('*').in('scheduled_date',[addDaysISODate(today,-1),today]),
        client.from('care_orders').select(`*,patients(${patientFields})`).eq('is_active',true),
        client.from('care_logs').select('*').eq('care_date',today),
        client.from('physiotherapy_plans').select(`*,patients(${patientFields})`).eq('is_active',true),
        client.from('physiotherapy_sessions').select('*').eq('session_date',today),
        client.from('vital_signs').select('*').gte('recorded_at',`${today}T00:00:00`).lte('recorded_at',`${today}T23:59:59`)
      ]);
      setMeds(m.data||[]);
      setMedLogs(ml.data||[]);
      setCare(c.data||[]);
      setCareLogs(cl.data||[]);
      setPhysio((p.data||[]).filter(x=>x.patients&&x.patients.is_active!==false&&x.patients.admission_status!=='Discharged'));
      setPhysioLogs(pl.data||[]);
      setVitals(v.data||[]);
      setLoading(false);
    }

    React.useEffect(()=>{
      load();
      const ch=client.channel('shift-live-v37')
        .on('postgres_changes',{event:'*',schema:'public',table:'medication_administrations'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'care_logs'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'physiotherapy_sessions'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'vital_signs'},load)
        .subscribe();
      return()=>client.removeChannel(ch)
    },[]);

    function riskBadges(p){
      const items=[
        [p?.fall_risk,'Fall'],[p?.pressure_sore_risk,'Pressure sore'],[p?.aspiration_risk,'Aspiration'],
        [p?.wandering_risk,'Wandering'],[p?.infection_risk,'Infection'],[p?.seizure_history,'Seizure'],
        [p?.oxygen_required,'Oxygen'],[p?.dressing_required,'Dressing']
      ].filter(x=>x[0]);
      return items.length
        ?h('div',{className:'risk-badges'},items.map(x=>h('span',{className:'risk-badge',key:x[1]},x[1])))
        :null;
    }

    async function logMedicine(order,time,status){
      const {data:{user}}=await client.auth.getUser();
      const remarks=status==='Given'?'':prompt('Enter reason / remarks:')||'';
      const {error}=await client.from('medication_administrations').insert({
        order_id:order.id,patient_id:order.patient_id,scheduled_date:today,scheduled_time:time,
        status,administered_at:new Date().toISOString(),administered_by:user.id,remarks
      });
      if(error)alert(error.message);else load()
    }

    async function logCare(taskOrOrder,status,taskShift=shift){
      try{
        const careOrder=taskOrOrder?.order||taskOrOrder;
        if(!careOrder?.id||!careOrder?.patient_id){
          alert('This care task is incomplete or no longer available. Please refresh the Shift Tasks page.');
          await load();
          return;
        }
        if(taskShift!==shift){
          alert(`${taskShift} has not started. This task can be completed only during that shift.`);
          return;
        }
        const {data:{user}}=await client.auth.getUser();
        if(!user?.id){
          alert('Your login session could not be verified. Please sign in again.');
          return;
        }
        const remarks=status==='Completed'?'':prompt('Enter reason / remarks:')||'';
        const {error}=await client.from('care_logs').upsert({
          care_order_id:careOrder.id,
          patient_id:careOrder.patient_id,
          care_date:today,
          shift:taskShift,
          status,
          completed_at:new Date().toISOString(),
          completed_by:user.id,
          remarks
        },{onConflict:'care_order_id,care_date,shift'});
        if(error)alert(error.message);else await load();
      }catch(error){
        console.error('Care task save failed:',error);
        alert(error?.message||'Unable to save the care task.');
      }
    }

    async function logPhysio(order,status){
      const {data:{user}}=await client.auth.getUser();
      const notes=status==='Completed'
        ?(prompt('Session notes (optional):')||'')
        :(prompt('Reason / notes:')||'');
      const {error}=await client.from('physiotherapy_sessions').upsert({
        plan_id:order.id,order_id:order.id,patient_id:order.patient_id,session_date:today,status,
        session_at:new Date().toISOString(),performed_by:user.id,notes
      },{onConflict:'order_id,session_date'});
      if(error)alert(error.message);else load()
    }

    const medTasks=[];
    meds.forEach(order=>(order.scheduled_times||[]).forEach(raw=>{
      const time=String(raw).slice(0,5);
      if(!medicationOrderDoseEligible(order,today,time))return;
      if(shiftForTime(time)!==shift)return;
      medTasks.push({
        type:'Medicine',
        patient_id:order.patient_id,
        patient:order.patients,
        order,
        time,
        label:`${order.medicine_name||'Medicine'} ${order.strength||''}`.trim(),
        log:medLogs.find(x=>x.order_id===order.id&&String(x.scheduled_date||'').slice(0,10)===today&&String(x.scheduled_time).slice(0,5)===time)
      });
    }));
    // Rescheduled doses (patient sleeping / refused / missed, re-medication time set by the nurse).
    medLogs.filter(log=>log.rescheduled_time&&rescheduledDoseDate(log)===today).forEach(log=>{
      const order=meds.find(o=>o.id===log.order_id);if(!order)return;
      const time=normalizeMedicationTime(log.rescheduled_time).slice(0,5);
      if(!time||shiftForTime(time)!==shift)return;
      if(medTasks.some(t=>t.order.id===order.id&&t.time===time))return;
      medTasks.push({
        type:'Medicine',
        patient_id:order.patient_id,
        patient:order.patients,
        order,
        time,
        rescheduledFrom:normalizeMedicationTime(log.scheduled_time),
        label:`${order.medicine_name||'Medicine'} ${order.strength||''}`.trim()+' (rescheduled)',
        log:medLogs.find(x=>x.order_id===order.id&&String(x.scheduled_date||'').slice(0,10)===today&&String(x.scheduled_time).slice(0,5)===time)
      });
    });
    medTasks.sort((a,b)=>a.time.localeCompare(b.time));

    const currentCareTasks=care.filter(order=>order?.id&&order?.patient_id&&order?.patients).flatMap(order=>{
      const taskShifts=order.shift==='Both shifts'
        ?['Day Shift (7 AM–7 PM)','Night Shift (7 PM–7 AM)']
        :[order.shift];
      return taskShifts
        .filter(taskShift=>taskShift===shift)
        .map(taskShift=>({
          type:'Care',
          patient_id:order.patient_id,
          patient:order.patients,
          order,
          taskShift,
          label:order.care_type||order.activity||'Care task',
          log:careLogs.find(x=>
            x.shift===taskShift&&(
              x.care_order_id===order.id||
              (!x.care_order_id&&x.patient_id===order.patient_id&&String(x.remarks||'').toLowerCase().startsWith(String(order.care_type||order.activity||'').toLowerCase()))
            )
          )
        }));
    });

    const upcomingCareTasks=care.filter(order=>order?.id&&order?.patient_id&&order?.patients).flatMap(order=>{
      const taskShifts=order.shift==='Both shifts'
        ?['Day Shift (7 AM–7 PM)','Night Shift (7 PM–7 AM)']
        :[order.shift];
      return taskShifts
        .filter(taskShift=>taskShift!==shift)
        .map(taskShift=>({
          type:'Upcoming Care',
          patient_id:order.patient_id,
          patient:order.patients,
          order,
          taskShift,
          label:order.care_type||order.activity||'Care task',
          log:careLogs.find(x=>
            x.shift===taskShift&&(
              x.care_order_id===order.id||
              (!x.care_order_id&&x.patient_id===order.patient_id&&String(x.remarks||'').toLowerCase().startsWith(String(order.care_type||order.activity||'').toLowerCase()))
            )
          )
        }))
        .filter(x=>!x.log);
    });

    const physioTasks=physio
      .filter(order=>!order.preferred_time||shiftForTime(String(order.preferred_time).slice(0,5))===shift)
      .map(order=>({
        type:'Physiotherapy',
        patient_id:order.patient_id,
        patient:order.patients,
        order,
        time:order.preferred_time?String(order.preferred_time).slice(0,5):'',
        label:order.therapy_type||'Physiotherapy',
        log:physioLogs.find(x=>(x.plan_id||x.order_id)===order.id)
      }));

    const patientMap=new Map();
    function ensurePatient(task){
      const id=task?.patient_id;
      if(!id||!task?.patient)return null;
      if(!patientMap.has(id)){
        patientMap.set(id,{
          id,
          patient:task.patient||{},
          medicines:[],
          care:[],
          physio:[],
          upcomingCare:[],
          vitalsCompleted:vitals.some(v=>v.patient_id===id)
        });
      }
      return patientMap.get(id);
    }
    medTasks.forEach(x=>{const g=ensurePatient(x);if(g)g.medicines.push(x)});
    currentCareTasks.forEach(x=>{const g=ensurePatient(x);if(g)g.care.push(x)});
    physioTasks.forEach(x=>{const g=ensurePatient(x);if(g)g.physio.push(x)});
    upcomingCareTasks.forEach(x=>{const g=ensurePatient(x);if(g)g.upcomingCare.push(x)});

    const patientGroups=[...patientMap.values()]
      .map(group=>{
        const pendingMedicine=group.medicines.filter(x=>!x.log).length;
        const pendingCare=group.care.filter(x=>!x.log).length;
        const pendingPhysio=group.physio.filter(x=>!x.log).length;
        const vitalsPending=!group.vitalsCompleted;
        const pending=pendingMedicine+pendingCare+pendingPhysio+(vitalsPending?1:0);
        const completed=
          group.medicines.filter(x=>!!x.log).length+
          group.care.filter(x=>!!x.log).length+
          group.physio.filter(x=>!!x.log).length+
          (group.vitalsCompleted?1:0);
        const preview=[
          ...group.medicines.filter(x=>!x.log).map(x=>`${x.time} ${x.label}`),
          ...group.care.filter(x=>!x.log).map(x=>x.label),
          ...(vitalsPending?['Vital signs observation']:[]),
          ...group.physio.filter(x=>!x.log).map(x=>x.label)
        ];
        return {...group,pending,completed,vitalsPending,preview};
      })
      .sort((a,b)=>b.pending-a.pending||String(a.patient?.room_no||'').localeCompare(String(b.patient?.room_no||''),undefined,{numeric:true}));

    const patientsNeedingAttention=patientGroups.filter(x=>x.pending>0).length;
    const totalPending=patientGroups.reduce((sum,x)=>sum+x.pending,0);
    const medicationPending=medTasks.filter(x=>!x.log).length;
    const carePending=currentCareTasks.filter(x=>!x.log).length;
    const vitalsPending=patientGroups.filter(x=>x.vitalsPending).length;
    const physioPending=physioTasks.filter(x=>!x.log).length;
    const nextShiftScheduled=upcomingCareTasks.length;
    const visiblePatientGroups=dashboardFilter==='attention'||dashboardFilter==='pending'
      ?patientGroups.filter(group=>group.pending>0)
      :dashboardFilter==='upcoming'
        ?patientGroups.filter(group=>group.upcomingCare.length>0)
        :patientGroups;
    function focusWorklist(filter){
      setDashboardFilter(filter);
      setTimeout(()=>document.querySelector('.patient-worklist-panel')?.scrollIntoView({behavior:'smooth',block:'start'}),40);
    }
    function compactTaskStat(label,value,onClick,style={}){
      return h('button',{type:'button',className:'card stat',onClick,style:{...style,minHeight:'82px',padding:'12px 14px',textAlign:'left',cursor:'pointer',width:'100%',border:'1px solid #ead0de'}},h('span',{style:{fontSize:'13px',lineHeight:'1.25'}},label),h('strong',{style:{fontSize:'30px',lineHeight:'1.05',color:style.color||'#7d1748'}},value));
    }

    if(loading)return h('div',{className:'loading'},'Loading today’s patient worklist…');

    return h(React.Fragment,null,
      h('div',{className:'shift-summary patient-worklist-summary'},
        h('div',null,
          h('strong',null,shift),
          h('span',null,`${formatDateIN(today)} · Patient-centred nursing worklist`)
        ),
        h('span',{className:'badge'},profile.full_name)
      ),

      h('div',{className:'grid stats patient-worklist-stats'},
        compactTaskStat('Patients in Worklist',patientGroups.length,()=>focusWorklist('all')),
        compactTaskStat('Patients Need Attention',patientsNeedingAttention,()=>focusWorklist('attention'),{background:'#fff4dd',color:'#9a6700'}),
        compactTaskStat('Current-Shift Tasks Pending',totalPending,()=>focusWorklist('pending'),{background:'#fdecec',color:'#b42318'}),
        compactTaskStat('Medicines Due',medicationPending,()=>onNavigate?.('Medicines')),
        compactTaskStat('Care Pending',carePending,()=>onNavigate?.('Daily Care')),
        compactTaskStat('Vitals Pending',vitalsPending,()=>onNavigate?.('Vital Signs')),
        compactTaskStat('Physiotherapy Pending',physioPending,()=>onNavigate?.('Physiotherapy')),
        compactTaskStat('Next-Shift Care Scheduled',nextShiftScheduled,()=>focusWorklist('upcoming'),{background:'#eef5ff',color:'#175cd3'})
      ),

      h('div',{className:'card panel patient-worklist-panel'},
        h('div',{className:'panel-head'},
          h('div',null,h('h3',null,'Today’s Patient Worklist'),h('small',null,'One compact card per patient. Expand only the patient currently being attended.')),
          h('div',{className:'actions'},dashboardFilter!=='all'?h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setDashboardFilter('all')},'Show All'):null,h('span',{className:'badge'},`${visiblePatientGroups.length} patient(s) shown`))
        ),

        visiblePatientGroups.map((group,patientIndex)=>{
          const open=!!expanded[group.id];
          const p=group.patient||{};
          const statusClass=group.pending===0?'complete':group.pending>=5?'high':'pending';
          return h('div',{className:`patient-work-card ${statusClass}`,key:group.id},
            h('button',{
              type:'button',
              className:'patient-work-card-header',
              onClick:()=>setExpanded(current=>({...current,[group.id]:!current[group.id]}))
            },
              h('div',{className:'patient-work-identity'},
                h('span',{className:'patient-row-number'},patientIndex+1),
                h('span',{className:`patient-status-dot ${statusClass}`}),
                h('div',null,
                  h('strong',null,p.full_name||'Patient'),
                  h('small',null,`${p.patient_id||''}${p.patient_id?' · ':''}Room ${p.room_no||'—'}-${p.bed_no||'—'}`)
                )
              ),
              h('div',{className:'patient-task-preview'},
                group.preview.slice(0,2).map((text,i)=>h('span',{key:i},text)),
                group.preview.length>2&&h('span',{className:'more-tasks'},`+${group.preview.length-2} more`)
              ),
              h('div',{className:'patient-work-counts'},
                h('span',{className:'pill warning'},`${group.pending} Pending`),
                h('span',{className:'badge'},`${group.completed} Completed`),
                h('span',{className:'expand-symbol'},open?'▲':'▼')
              )
            ),

            open&&h('div',{className:'patient-work-expanded'},
              p.special_nurse_required&&h('div',{className:'special-nurse-information'},
                h('strong',null,'Special nurse support: '),
                h('span',null,`${p.special_nurse_name||'Required / not yet assigned'}${p.special_nurse_shift?` · ${p.special_nurse_shift}`:''}`),
                h('small',null,'These care tasks may also be completed by any authorised Nurse or Caregiver.')
              ),
              riskBadges(p),

              h('div',{className:'patient-work-section'},
                h('h4',null,`Medicines (${group.medicines.filter(x=>!x.log).length} pending)`),
                group.medicines.map((x,medicineIndex)=>h('div',{className:`patient-work-task-row numbered-task-row ${x.log?'done':''}`,key:`med-${x.order.id}-${x.time}`},
                  h('span',{className:'task-row-number'},medicineIndex+1),
                  h('div',null,h('strong',null,x.label),h('small',null,`${x.time} · ${x.order.route||'—'} · ${x.order.food_instruction||'—'}`)),
                  x.log?h('span',{className:'badge'},x.log.status):h('span',{className:'pill warning'},'Pending'),
                  x.log?h('button',{type:'button',className:'btn btn-secondary clinical-action-done',disabled:true},'Done ✓'):h('div',{className:'employee-actions'},
                    h('button',{className:'btn btn-primary',onClick:()=>openRegularTask('Medicines',{
                      patient_id:x.patient_id,order_id:x.order.id,scheduled_time:x.time,status:'Given'
                    })},'Complete'),
                    h('button',{className:'btn btn-danger',onClick:()=>openRegularTask('Medicines',{
                      patient_id:x.patient_id,order_id:x.order.id,scheduled_time:x.time,status:'Refused'
                    })},'Exception')
                  )
                )),
                group.medicines.length===0&&h('div',{className:'empty compact'},'No medicine due in this shift.')
              ),

              h('div',{className:'patient-work-section'},
                h('h4',null,`Basic Care (${group.care.filter(x=>!x.log).length} pending)`),
                group.care.map((x,careIndex)=>h('div',{className:`patient-work-task-row numbered-task-row ${x.log?'done':''}`,key:`care-${x.order.id}`},
                  h('span',{className:'task-row-number'},careIndex+1),
                  h('div',null,h('strong',null,x.label),h('small',null,`${x.order.frequency||'Daily'}${x.order.instruction?` · ${x.order.instruction}`:''}`)),
                  x.log?h('span',{className:'badge'},x.log.status):h('span',{className:'pill warning'},'Pending'),
                  x.log?h('button',{type:'button',className:'btn btn-secondary clinical-action-done',disabled:true},'Done ✓'):h('div',{className:'employee-actions'},
                    h('button',{className:'btn btn-primary',onClick:()=>openRegularTask('Daily Care',{
                      patient_id:x.patient_id,care_order_id:x.order.id,care_type:x.label,shift:x.taskShift,status:'Completed'
                    })},'Complete'),
                    h('button',{className:'btn btn-danger',onClick:()=>openRegularTask('Daily Care',{
                      patient_id:x.patient_id,care_order_id:x.order.id,care_type:x.label,shift:x.taskShift,status:'Refused'
                    })},'Exception')
                  )
                )),
                group.care.length===0&&h('div',{className:'empty compact'},'No basic-care task in this shift.')
              ),

              h('div',{className:'patient-work-section'},
                h('h4',null,'Vital Signs'),
                h('div',{className:`patient-work-task-row ${group.vitalsCompleted?'done':''}`},
                  h('div',null,h('strong',null,'Current shift vital observations'),h('small',null,group.vitalsCompleted?'Recorded today':'Not yet recorded today')),
                  group.vitalsCompleted?h('span',{className:'badge'},'Completed'):h('span',{className:'pill warning'},'Pending'),
                  group.vitalsCompleted?h('button',{type:'button',className:'btn btn-secondary clinical-action-done',disabled:true},'Recorded ✓'):h('button',{className:'btn btn-primary',onClick:()=>openRegularTask('Vital Signs',{patient_id:group.id})},'Enter Vitals')
                )
              ),

              h('div',{className:'patient-work-section'},
                h('h4',null,`Physiotherapy (${group.physio.filter(x=>!x.log).length} pending)`),
                group.physio.map((x,physioIndex)=>h('div',{className:`patient-work-task-row numbered-task-row ${x.log?'done':''}`,key:`physio-${x.order.id}`},
                  h('span',{className:'task-row-number'},physioIndex+1),
                  h('div',null,h('strong',null,x.label),h('small',null,`${x.time||shift} · ${x.order.frequency||'—'}`)),
                  x.log?h('span',{className:'badge'},x.log.status):h('span',{className:'pill warning'},'Pending'),
                  x.log?h('button',{type:'button',className:'btn btn-secondary clinical-action-done',disabled:true},'Done ✓'):h('div',{className:'employee-actions'},
                    h('button',{className:'btn btn-primary',onClick:()=>openRegularTask('Physiotherapy',{
                      patient_id:x.patient_id,plan_id:x.order.id,status:'Completed'
                    })},'Complete'),
                    h('button',{className:'btn btn-danger',onClick:()=>openRegularTask('Physiotherapy',{
                      patient_id:x.patient_id,plan_id:x.order.id,status:'Pending'
                    })},'Postpone')
                  )
                )),
                group.physio.length===0&&h('div',{className:'empty compact'},'No physiotherapy task in this shift.')
              ),

              group.upcomingCare.length>0&&h('details',{className:'patient-next-shift-summary'},
                h('summary',null,`${group.upcomingCare.length} care task(s) scheduled for the next shift`),
                h('p',null,group.upcomingCare.map(x=>x.label).join(', '))
              )
            )
          )
        }),

        patientGroups.length===0&&h('div',{className:'empty'},'No patient tasks are scheduled for the current shift.')
      )
    );
  }
