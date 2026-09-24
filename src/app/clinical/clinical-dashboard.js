  function ClinicalDashboard({profile,onNavigate,alertEngine}){
    const oversightOnly=['Admin','Manager'].includes(profile?.role);
    const [state,setState]=React.useState({loading:true,patients:[],medOrders:[],medLogs:[],careOrders:[],careLogs:[],vitals:[],physioOrders:[],physioSessions:[],incidents:[],handovers:[],discharges:[]});
    const today=todayISOIndia();
    const timeToMinutes=value=>{const text=String(value||'').trim();const m=text.match(/^(\d{1,2}):(\d{2})/);return m?Number(m[1])*60+Number(m[2]):9999};
    const parseClinicalTimes=value=>Array.isArray(value)?value.filter(Boolean).map(normalizeMedicationTime).filter(Boolean):String(value||'').split(',').map(normalizeMedicationTime).filter(Boolean);
    const nowDate=new Date();
    const nowMinutes=nowDate.getHours()*60+nowDate.getMinutes();
    function admissionBoundaryForToday(patient){
      if(!patient||String(patient.admission_date||'').slice(0,10)!==today)return null;
      // Prefer a true admission timestamp. For first admissions, created_at is
      // the reliable fallback; updated_at may change later when staff edit the
      // patient and must not move the medication eligibility boundary forward.
      // Use updated_at only for a re-admission where created_at is from an
      // earlier date and no dedicated admission timestamp is available.
      const explicit=[patient.admission_datetime,patient.admission_timestamp,patient.admitted_at,patient.admission_time?`${patient.admission_date}T${String(patient.admission_time).slice(0,5)}:00`:null].filter(Boolean);
      const createdDate=String(patient.created_at||'').slice(0,10);
      const fallback=createdDate===today?[patient.created_at]:[patient.updated_at,patient.created_at];
      const candidates=[...explicit,...fallback].filter(Boolean);
      for(const value of candidates){
        const stamp=new Date(value);
        if(Number.isNaN(stamp.getTime()))continue;
        const localDate=`${stamp.getFullYear()}-${String(stamp.getMonth()+1).padStart(2,'0')}-${String(stamp.getDate()).padStart(2,'0')}`;
        if(localDate!==today)continue;
        const boundary=new Date(`${today}T${String(stamp.getHours()).padStart(2,'0')}:${String(stamp.getMinutes()).padStart(2,'0')}:${String(stamp.getSeconds()).padStart(2,'0')}`);
        if(!Number.isNaN(boundary.getTime()))return boundary;
      }
      return null;
    }
    function doseWasBeforeAdmissionToday(patientId,time){
      const patient=state.patients.find(p=>p.id===patientId);
      const boundary=admissionBoundaryForToday(patient);
      if(!boundary)return false;
      const normalized=normalizeMedicationTime(time);
      const due=new Date(`${today}T${normalized}:00`);
      return !Number.isNaN(due.getTime())&&due.getTime()<boundary.getTime();
    }
    async function load(){
      const results=await Promise.all([
        client.from('patients').select('*').eq('is_active',true),
        client.from('medication_orders').select('*').eq('is_active',true),
        client.from('medication_administrations').select('*').eq('scheduled_date',today),
        client.from('care_orders').select('*,patients(full_name,title,patient_id,room_no,bed_no)').eq('is_active',true),
        client.from('care_logs').select('*').eq('care_date',today),
        client.from('vital_signs').select('*,patients(full_name,title,patient_id,room_no,bed_no)').gte('recorded_at',today+'T00:00:00').order('recorded_at',{ascending:false}),
        client.from('physiotherapy_plans').select('*,patients(full_name,title,patient_id,room_no,bed_no)').eq('is_active',true),
        client.from('physiotherapy_sessions').select('*').eq('session_date',today),
        client.from('incidents').select('*,patients(full_name,title,patient_id,room_no,bed_no)').eq('status','Open').order('incident_at',{ascending:false}),
        // Load handovers without an embedded profile relationship. A missing or
        // renamed FK must never hide valid clinical handover submissions.
        client.from('shift_handovers').select('*').order('created_at',{ascending:false}).limit(100),
        client.from('patient_discharges')
          .select('*')
          .order('created_at',{ascending:false})
      ]);
      const data=results.map((result,index)=>{
        if(result.error){
          console.warn(`Clinical Dashboard query ${index+1} failed:`,result.error.message);
          return [];
        }
        return result.data||[];
      });
      const activePatientIds=new Set((data[0]||[]).map(p=>p.id));
      const seenMedicationOrders=new Set();
      const validMedicationOrders=(data[1]||[]).filter(order=>{
        if(!activePatientIds.has(order.patient_id))return false;
        if(order.is_active===false)return false;
        const orderStatus=String(order.status||'').trim().toLowerCase();
        if(['completed','discontinued','stopped','inactive'].includes(orderStatus))return false;
        if(order.end_date&&String(order.end_date)<today)return false;
        const schedule=Array.isArray(order.scheduled_times)?order.scheduled_times.map(normalizeMedicationTime).filter(Boolean).sort().join('|'):String(order.scheduled_times||'');
        const key=[order.patient_id,String(order.medicine_name||order.medicine||'').trim().toLowerCase(),String(order.strength||order.dose||'').trim().toLowerCase(),String(order.frequency||'').trim().toLowerCase(),String(order.route||'').trim().toLowerCase(),schedule].join('::');
        if(seenMedicationOrders.has(key))return false;
        seenMedicationOrders.add(key);
        return true;
      });
      setState({loading:false,patients:data[0],medOrders:validMedicationOrders,medLogs:data[2],careOrders:data[3],careLogs:data[4],vitals:data[5],physioOrders:(data[6]||[]).filter(x=>activePatientIds.has(x.patient_id)),physioSessions:data[7],incidents:data[8],handovers:data[9],discharges:data[10]});
    }
    React.useEffect(()=>{load();const ch=client.channel('clinical-dashboard-live').on('postgres_changes',{event:'*',schema:'public',table:'vital_signs'},load).on('postgres_changes',{event:'*',schema:'public',table:'medication_administrations'},load).on('postgres_changes',{event:'*',schema:'public',table:'care_logs'},load).on('postgres_changes',{event:'*',schema:'public',table:'incidents'},load).on('postgres_changes',{event:'*',schema:'public',table:'patient_discharges'},load).on('postgres_changes',{event:'*',schema:'public',table:'shift_handovers'},load).subscribe();return()=>client.removeChannel(ch)},[]);
    const terminalMedicationStatuses=new Set(['given','refused','withheld','unavailable','missed']);
    const medTasks=[];
    state.medOrders.forEach(order=>parseClinicalTimes(order.scheduled_times).forEach(time=>{
      if(!medicationOrderDoseEligible(order,today,time))return;
      // Admission-day protection: a scheduled dose that fell before the resident
      // was actually admitted is not due, missed, overdue or a medication error.
      if(doseWasBeforeAdmissionToday(order.patient_id,time))return;
      const done=state.medLogs.some(log=>
        log.order_id===order.id&&
        String(log.scheduled_date||today)===today&&
        String(log.scheduled_time||'').slice(0,5)===String(time).slice(0,5)&&
        terminalMedicationStatuses.has(String(log.status||'').trim().toLowerCase())
      );
      if(!done){
        const minutesOverdue=nowMinutes-timeToMinutes(time);
        medTasks.push({order,time,minutesOverdue,overdue:minutesOverdue>0,due:minutesOverdue>=0});
      }
    }));
    const medDueTasks=medTasks.filter(x=>x.due).sort((a,b)=>b.minutesOverdue-a.minutesOverdue);
    const medicationCriticalMinutes=Math.max(1,Number(alertEngine?.settings?.medication_error_minutes||60));
    const medicationEscalationMinutes=Math.max(1,Number(alertEngine?.settings?.manager_escalation_minutes||30));
    const medicationOverdueMinutes=15;
    const medCritical=medDueTasks.filter(x=>x.minutesOverdue>=medicationCriticalMinutes);
    // "Overdue" is cumulative: Critical doses are also overdue.
    const medOverdue=medDueTasks.filter(x=>x.minutesOverdue>=medicationOverdueMinutes);
    const medDueNow=medDueTasks.filter(x=>x.minutesOverdue>=0&&x.minutesOverdue<medicationOverdueMinutes);
    // Escalated means an actual unresolved medication alert has been generated,
    // not merely that the clock passed the escalation threshold.
    const medicationAlertKeys=new Set(
      (alertEngine?.alerts||[])
        .filter(a=>{
          const type=String(a.alert_type||'').toLowerCase();
          return (type.includes('med')||String(a.target_page||'').toLowerCase().includes('medic')) &&
            Number(a.overdue_minutes||0)>=medicationEscalationMinutes;
        })
        .map(a=>`${a.source_id||''}:${String(a.due_at||'').slice(0,16)}`)
    );
    const medEscalated=medDueTasks.filter(x=>{
      const dueDate=new Date(`${today}T${String(x.time||'').slice(0,5)}:00`);
      const dueIso=Number.isNaN(dueDate.getTime())?'':dueDate.toISOString().slice(0,16);
      return medicationAlertKeys.has(`${x.order.id}:${dueIso}`);
    });
    const carePending=state.careOrders.flatMap(order=>{
      const taskShifts=order.shift==='Both shifts'
        ?['Day Shift (7 AM–7 PM)','Night Shift (7 PM–7 AM)']
        :[order.shift];
      return taskShifts
        .filter(taskShift=>!state.careLogs.some(log=>log.care_order_id===order.id&&log.shift===taskShift))
        .map(taskShift=>({...order,taskShift,isUpcoming:taskShift!==currentShift()}));
    });
    const vitalPatientIds=new Set(state.vitals.map(v=>v.patient_id));
    const vitalsPending=state.patients.filter(p=>!vitalPatientIds.has(p.id));
    const physioDoneIds=new Set(state.physioSessions.map(x=>x.order_id));
    const physioPending=state.physioOrders.filter(x=>!physioDoneIds.has(x.id));
    const patientName=row=>{const embedded=row?.patients||row;const linked=state.patients.find(p=>p.id===row?.patient_id);return formalName(embedded)||embedded?.full_name||formalName(linked)||linked?.full_name||'Patient';};
    // Only the newest handover for each active patient contributes pending work.
    // A later handover with no pending task therefore clears the older item.
    const latestHandoverByPatient=new Map();
    state.handovers.forEach(row=>{if(row.patient_id&&!latestHandoverByPatient.has(row.patient_id))latestHandoverByPatient.set(row.patient_id,row)});
    const handoverPending=[...latestHandoverByPatient.values()].filter(row=>String(row.pending_tasks||'').trim());
    const currentShiftCarePending=carePending.filter(x=>!x.isUpcoming);
    const upcomingShiftCarePending=carePending.filter(x=>x.isUpcoming);
    const activeDischarges=state.discharges.filter(row=>{
      const status=String(row.status||'').trim().toLowerCase();
      return !['completed','closed','cancelled','canceled'].includes(status);
    });
    const dischargeReady=activeDischarges.filter(row=>
      String(row.accounts_status||'').trim().toLowerCase()==='cleared'
    );
    const dischargeWithAccounts=activeDischarges.filter(row=>
      String(row.management_status||'').trim().toLowerCase()==='approved'&&
      String(row.accounts_status||'').trim().toLowerCase()!=='cleared'
    );
    const dischargeAwaitingManagement=activeDischarges.filter(row=>
      ['','pending'].includes(String(row.management_status||'').trim().toLowerCase())
    );
    const dischargeReturned=activeDischarges.filter(row=>
      String(row.management_status||'').trim().toLowerCase()==='rejected'||
      String(row.status||'').trim().toLowerCase()==='returned to nursing'
    );
    const dischargeStatusText=
      dischargeReady.length
        ?`${dischargeReady.length} ready for final departure`
        :dischargeReturned.length
          ?`${dischargeReturned.length} returned for action`
          :dischargeWithAccounts.length
            ?`${dischargeWithAccounts.length} with Accounts`
            :dischargeAwaitingManagement.length
              ?`${dischargeAwaitingManagement.length} awaiting Management`
              :'No active discharge';
    const dischargeTone=
      dischargeReady.length||dischargeReturned.length
        ?'clinical-red'
        :activeDischarges.length
          ?'clinical-amber'
          :'clinical-green';
    const cards=[
      ['Patients under care',state.patients.length,'Patients','👥','clinical-green'],
      ['Medicines due',medDueTasks.length,'Medicines','💊',medCritical.length||medEscalated.length?'clinical-red':medDueTasks.length?'clinical-amber':'clinical-green',medDueTasks.length?`${medOverdue.length} overdue total · ${medCritical.length} critical · ${medEscalated.length} escalated · ${medDueNow.length} due now`:'No medicine currently due'],
      ['Clinical alerts',alertEngine?.alerts?.length||0,'Clinical Alerts','🔔',(alertEngine?.alerts?.length||0)?'clinical-red':'clinical-green',(alertEngine?.alerts?.length||0)?'Open unresolved alerts':'No unresolved alert'],
      ['Vitals pending',vitalsPending.length,'Vital Signs','🩺',vitalsPending.length?'clinical-amber':'clinical-green'],
      ['Current-shift care pending',currentShiftCarePending.length,'Shift Tasks','✅',currentShiftCarePending.length?'clinical-amber':'clinical-green'],
      ['Next-shift care scheduled',upcomingShiftCarePending.length,'Shift Tasks','🕒','clinical-blue'],
      ['Physiotherapy pending',physioPending.length,'Physiotherapy','🏃','clinical-purple'],
      ['Open incidents',state.incidents.length,'Incidents','⚠️',state.incidents.length?'clinical-red':'clinical-green'],
      ['Discharge',activeDischarges.length,'Discharge','🚪',dischargeTone,dischargeStatusText]
    ];
    return h(React.Fragment,null,
      oversightOnly&&h('div',{className:'message info'},'VIEW ONLY — Nursing entries and edits are reserved for the nursing team. Admin/Manager may monitor this dashboard, review alerts and perform their separate managerial approval/review functions.'),
      h('div',{className:'clinical-welcome'},h('div',null,h('small',null,currentShift().toUpperCase()),h('h2',null,`Good ${new Date().getHours()<12?'Morning':new Date().getHours()<17?'Afternoon':'Evening'}, ${formalName(profile)}`),h('p',null,oversightOnly?'Nursing oversight dashboard — view clinical activity, alerts and pending work without entering or editing nursing records.':'Your clinical worklist for today — complete urgent and overdue items first.')),h('div',{className:'clinical-date'},`${new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',weekday:'long'}).format(new Date())}, ${formatDateIN(new Date())}`)),
      h('div',{className:'clinical-card-grid'},cards.map(([label,value,page,icon,tone,statusText])=>oversightOnly
        ?h('div',{className:`clinical-metric ${tone}`,key:label},h('span',{className:'clinical-metric-icon'},icon),h('strong',null,value),h('span',null,label),h('small',null,statusText||'View only'))
        :h('button',{type:'button',className:`clinical-metric ${tone}`,key:label,onClick:()=>onNavigate(page)},h('span',{className:'clinical-metric-icon'},icon),h('strong',null,value),h('span',null,label),h('small',null,statusText||`Open ${page} →`)))),
      h('div',{className:'clinical-columns'},
        h('section',{className:'card clinical-panel'},h('div',{className:'clinical-panel-head'},h('div',null,h('h3',null,'Priority Worklist'),h('small',null,'Overdue and pending tasks requiring attention')),h('button',{className:'btn btn-secondary',onClick:()=>load(true)},'Refresh')),
          medDueTasks.slice(0,8).map((x,i)=>{
            const level=x.minutesOverdue>=medicationCriticalMinutes?'CRITICAL':x.minutesOverdue>=medicationEscalationMinutes?'ESCALATION DUE':x.minutesOverdue>=medicationOverdueMinutes?'OVERDUE':'DUE NOW';
            const linked=state.patients.find(p=>p.id===x.order.patient_id);
            const room=linked?.room_no?`Room ${linked.room_no}${linked.bed_no?`-${linked.bed_no}`:''}`:'';
            return h('div',{className:`clinical-work-row ${x.minutesOverdue>=15?'urgent':''}`,key:'m'+i},h('span',null,'💊'),h('div',null,h('strong',null,patientName(x.order)),h('small',null,`${room}${room?' · ':''}${x.order.medicine_name||x.order.medicine||'Medicine'} ${x.order.strength||x.order.dose||''} · Due ${medicationTimeLabel(x.time)}${x.minutesOverdue>0?` · ${x.minutesOverdue} min overdue`:''}`)),h('b',null,level));
          }),
          vitalsPending.slice(0,4).map(p=>h('div',{className:'clinical-work-row',key:p.id},h('span',null,'🩺'),h('div',null,h('strong',null,formalName(p)),h('small',null,`${p.patient_id||''} · Room ${p.room_no||'—'}-${p.bed_no||'—'} · Vitals not entered today`)),!oversightOnly&&h('button',{className:'mini-link',onClick:()=>onNavigate('Vital Signs')},'Enter'))),
          currentShiftCarePending.slice(0,5).map((x,i)=>h('div',{className:'clinical-work-row',key:`care-${x.id}-${x.taskShift}-${i}`},h('span',null,'✅'),h('div',null,h('strong',null,patientName(x)),h('small',null,`${x.care_type||x.activity||'Care task'} · ${x.taskShift}`)),!oversightOnly&&h('button',{className:'mini-link',onClick:()=>dashboardNavigate(onNavigate,'Shift Tasks','Today’s Operational Focus',{source:'Main Dashboard'})},'Open'))),
          upcomingShiftCarePending.length>0&&h('div',{className:'clinical-work-row upcoming-summary'},h('span',null,'🕒'),h('div',null,h('strong',null,`${upcomingShiftCarePending.length} care task(s) scheduled for next shift`),h('small',null,'Shown as a compact summary; they become actionable when the next shift starts.')),!oversightOnly&&h('button',{className:'mini-link',onClick:()=>dashboardNavigate(onNavigate,'Shift Tasks','Today’s Operational Focus',{source:'Main Dashboard'})},'Review')),
          handoverPending.slice(0,8).map((row,index)=>{const linked=state.patients.find(p=>p.id===row.patient_id);const roomBed=linked?`Room ${linked.room_no||'—'} · Bed ${linked.bed_no||'—'}`:'Room / Bed —';return h('div',{className:`clinical-work-row ${String(row.priority||'').toLowerCase()==='critical'?'urgent':''}`,key:`handover-pending-${row.id||index}`},
            h('span',null,'⇄'),
            h('div',null,h('strong',null,`${patientName(row)} · ${roomBed}`),h('small',null,`${row.priority||'Routine'} · Handover pending: ${row.pending_tasks}${row.special_instructions?` · Instruction: ${row.special_instructions}`:''}`),h(TamilAssist,{text:[`Handover pending: ${row.pending_tasks}`,row.special_instructions&&`Instruction: ${row.special_instructions}`].filter(Boolean).join('\n'),context:'Clinical Handover Alert'})),
            !oversightOnly?h('button',{className:'mini-link',onClick:()=>onNavigate('Shift Handover')},'Open'):h('b',null,row.priority||'Routine')
          )}),
          dischargeReady.slice(0,3).map(row=>h('div',{className:'clinical-work-row urgent',key:`discharge-${row.id}`},
            h('span',null,'🚪'),
            h('div',null,
              h('strong',null,formalName(row.patients||{})||row.patients?.full_name||'Patient'),
              h('small',null,`${row.patients?.patient_id||'—'} · Room ${row.patients?.room_no||'—'}-${row.patients?.bed_no||'—'} · Accounts cleared — confirm patient departure`)
            ),
            h('button',{className:'mini-link',onClick:()=>onNavigate('Discharge')},'Open')
          )),
          !medDueTasks.length&&!vitalsPending.length&&!currentShiftCarePending.length&&!handoverPending.length&&!dischargeReady.length&&h('div',{className:'clinical-empty'},'No urgent clinical tasks are pending in the current shift.')),
        h('section',{className:'card clinical-panel'},h('div',{className:'clinical-panel-head'},h('div',null,h('h3',null,'Latest Shift Handover'),h('small',null,'Important information from the previous shift'))),
          state.handovers.length?state.handovers.slice(0,5).map((x,index)=>{const linked=state.patients.find(p=>p.id===x.patient_id);const roomBed=linked?`Room ${linked.room_no||'—'} · Bed ${linked.bed_no||'—'}`:'Room / Bed —';return h('div',{className:`handover-card ${String(x.priority||'').toLowerCase()}`,key:x.id},
            h('div',null,h('strong',null,`${index+1}. ${patientName(x)} · ${roomBed} · ${x.shift||'Shift'} · ${x.priority||'Routine'}`),h('small',null,fmt(x.created_at))),
            h('p',null,x.patient_summary||x.summary||'No patient summary.'),
            x.pending_tasks&&h('p',null,h('b',null,'Pending tasks: '),x.pending_tasks),
            x.special_instructions&&h('p',null,h('b',null,'Special instructions: '),x.special_instructions),
            h(TamilAssist,{text:[x.patient_summary||x.summary,x.pending_tasks&&`Pending tasks: ${x.pending_tasks}`,x.special_instructions&&`Special instructions: ${x.special_instructions}`].filter(Boolean).join('\n'),context:'Patient Shift Handover'}),
            h('small',null,'Submitted handover')
          )}):h('div',{className:'clinical-empty'},'No shift handover has been submitted yet.'))
      )
    );
  }

