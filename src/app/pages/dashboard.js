  function dashboardNavigate(onNavigate,page,focus='',extra={}){
    try{
      sessionStorage.setItem('samara-dashboard-intent',JSON.stringify({
        page:String(page||''),
        focus:String(focus||''),
        extra:extra||{},
        at:Date.now()
      }));
    }catch(_error){}
    if(typeof onNavigate==='function')onNavigate(page);
  }

  function readDashboardIntent(page){
    try{
      const raw=sessionStorage.getItem('samara-dashboard-intent');
      if(!raw)return null;
      const data=JSON.parse(raw);
      if(String(data?.page||'')!==String(page||''))return null;
      sessionStorage.removeItem('samara-dashboard-intent');
      return data;
    }catch(_error){return null}
  }


  function ensureGlobalDashboardNavigationStyle(){
    if(document.getElementById('samara-global-dashboard-nav-style'))return;
    const style=document.createElement('style');
    style.id='samara-global-dashboard-nav-style';
    style.textContent=`
      .grid.stats > button.card.stat,
      .dashboard-card,
      .accounts-kpi,
      .accounts-workflow-card{
        cursor:pointer;
        -webkit-tap-highlight-color:rgba(169,22,83,.10);
        touch-action:manipulation;
      }
      .grid.stats > button.card.stat:active,
      .dashboard-card:active,
      .accounts-kpi:active,
      .accounts-workflow-card:active{
        transform:scale(.985);
      }
      @media (hover:hover){
        .grid.stats > button.card.stat:hover,
        .dashboard-card:hover,
        .accounts-kpi:hover,
        .accounts-workflow-card:hover{
          filter:brightness(.99);
        }
      }
    `;
    document.head.appendChild(style);
  }
  ensureGlobalDashboardNavigationStyle();


  // Shared intake/WhatsApp routing. Pricing questions are admission enquiries;
  // requests to pay an existing balance are payment follow-ups.
  function requestCategory(row){
    const metadata=[row.request_category,row.request_type,row.category,row.communication_type,row.template_name].filter(Boolean).join(' ').replace(/[_-]/g,' ').toLowerCase();
    const text=[metadata,row.source,row.source_type,row.care_type,row.reason_for_enquiry,row.special_requirements,row.message_content].filter(Boolean).join(' ').replace(/[_-]/g,' ').toLowerCase();
    if(/\b(payment|receipt|invoice|billing|refund)\b/.test(metadata)||/\b(payment|balance|amount|dues?)\s+(is\s+)?(pending|due|overdue|outstanding)\b|\b(pending|due|overdue|outstanding)\s+(payment|balance|amount|dues?)\b|\b(payment\s+(request|reminder|receipt|follow.?up|confirmation)|please\s+(pay|settle)|invoice|refund|paid\s+(the\s+)?(amount|bill|fees?))\b/.test(text))return 'Payment Follow-ups';
    if(/\b(admission|admit|enquir\w*|assisted living|tracheost\w*|beds?|stay|pricing|prices?|tariff|cost|fees?|packages?|caregiver|physiotherapy|nursing|facility|services?|callback)\b|call back|please call|call me|request a call|our location/.test(text))return 'Admission Enquiries';
    return 'Other';
  }
  function isAdmissionEnquiry(row){return requestCategory(row)!=='Payment Follow-ups';}
  async function loadAdmissionIntake(activeOnly=false){
    const data=[];
    // Page before classifying, so neither the six-item preview nor the API row
    // cap silently truncates the dashboard count.
    for(let offset=0;;offset+=500){
      let query=client.from('pre_admission_enquiries').select('*').order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499);
      if(activeOnly)query=query.in('status',['New','Contacted','Assessment Scheduled']);
      const result=await query;
      if(result.error)return {data:[],error:result.error};
      data.push(...(result.data||[]));
      if((result.data||[]).length<500)return {data,error:null};
    }
  }
  function whatsAppFolder(messages){
    // Do not let generic outbound assisted-living templates turn a payment
    // conversation into an enquiry. A new, explicit inbound enquiry can do so.
    let folder='Other';
    for(const row of messages){
      const category=requestCategory(row);
      if(category==='Payment Follow-ups'||(row.direction==='inbound'&&category==='Admission Enquiries'))folder=category;
    }
    if(folder==='Admission Enquiries'&&messages.some(row=>row.career_application_id||row.application_id||/patient|family|employee|hr applicant|emergency/i.test(row.source_type||'')))return 'Other';
    return folder;
  }

function Dashboard({profile,onNavigate,alertEngine}){
    const [stats,setStats]=React.useState({employees:0,patients:0,availableBeds:0,reservationOverdue:0,meds:0,care:0,outstanding:0,risks:0,incidents:0,discharges:0,dischargeStatus:'No active discharge',visitRequests:0,enquiries:0,recentEnquiries:[],escalations:0,packageExpiry:0});
    const [managerPersonalSummary,setManagerPersonalSummary]=React.useState({today:0,overdue:0,followup:0,completed:0});
    const [directorOfficeSummary,setDirectorOfficeSummary]=React.useState({
      isDirector:false,
      awaiting:0,
      calls:0,
      appointments:0,
      urgent:0
    });

    React.useEffect(()=>{(async()=>{
      if(profile?.role!=='Manager'){setManagerPersonalSummary({today:0,overdue:0,followup:0,completed:0});return}
      try{
        const {data}=await client.from('manager_personal_tasks').select('status,due_at,follow_up_at,completed_at').limit(1000);
        const rows=data||[], now=new Date();
        const day=v=>{if(!v)return '';const d=new Date(v);if(Number.isNaN(d.getTime()))return '';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
        const today=day(now), open=r=>!['Completed','Cancelled'].includes(String(r.status||''));
        setManagerPersonalSummary({
          today:rows.filter(r=>open(r)&&day(r.due_at)===today).length,
          overdue:rows.filter(r=>open(r)&&r.due_at&&new Date(r.due_at)<now&&day(r.due_at)!==today).length,
          followup:rows.filter(r=>open(r)&&r.follow_up_at&&new Date(r.follow_up_at)<=now).length,
          completed:rows.filter(r=>r.status==='Completed'&&day(r.completed_at)===today).length
        });
      }catch(_){setManagerPersonalSummary({today:0,overdue:0,followup:0,completed:0})}
    })()},[profile?.id,profile?.role]);

    React.useEffect(()=>{(async()=>{
      try{
        const {data:position}=await client.from('director_office_positions')
          .select('assigned_profile_id')
          .eq('position_key','director')
          .maybeSingle();
        const isDirector=String(position?.assigned_profile_id||'')===String(profile?.id||'');
        if(isDirector){
          const {data:officeRows}=await client.from('director_office_items')
            .select('id,item_type,status,priority,scheduled_at,needs_director_attention,director_responded_at')
            .limit(1000);
          const open=(officeRows||[]).filter(r=>!['Completed','Cancelled'].includes(String(r.status||'')));
          const today=new Date();
          const sameDay=v=>{
            if(!v)return false;
            const d=new Date(v);
            return d.getFullYear()===today.getFullYear()&&d.getMonth()===today.getMonth()&&d.getDate()===today.getDate();
          };
          setDirectorOfficeSummary({
            isDirector:true,
            awaiting:open.filter(r=>r.needs_director_attention&&!r.director_responded_at).length,
            calls:open.filter(r=>r.item_type==='Call / Callback'&&r.needs_director_attention&&!r.director_responded_at).length,
            appointments:open.filter(r=>r.item_type==='Appointment'&&sameDay(r.scheduled_at)).length,
            urgent:open.filter(r=>r.priority==='Urgent'&&r.needs_director_attention&&!r.director_responded_at).length
          });
        }else{
          setDirectorOfficeSummary({isDirector:false,awaiting:0,calls:0,appointments:0,urgent:0});
        }
      }catch(_){
        setDirectorOfficeSummary({isDirector:false,awaiting:0,calls:0,appointments:0,urgent:0});
      }
    })()},[profile?.id]);

    React.useEffect(()=>{(async()=>{
      const today=new Date().toISOString().slice(0,10);
      const [emp,pat,beds,med,care,bill,inc,dis,vis,enq,esc]=await Promise.all([
        client.from('profiles').select('*').eq('is_active',true),
        client.from('patients').select('*').eq('is_active',true),
        client.from('room_beds').select('*').order('room_no',{ascending:true}).order('bed_no',{ascending:true}),
        client.from('medication_administrations').select('*',{count:'exact',head:true}).eq('scheduled_date',today),
        client.from('care_logs').select('*',{count:'exact',head:true}).eq('care_date',today),
        client.from('billing_transactions').select('amount,transaction_type'),
        client.from('incidents').select('*',{count:'exact',head:true}).eq('status','Open'),
        client.from('patient_discharges').select('id,status,management_status,accounts_status'),
        client.from('family_visit_requests').select('*',{count:'exact',head:true}).eq('status','Pending'),
        loadAdmissionIntake(true),
        client.from('clinical_alert_escalations').select('*',{count:'exact',head:true}).is('resolved_at',null)
      ]);
      const patients=pat.data||[];

      // Keep Dashboard "Active employees" identical to HR → Employees.
      // ERP management/system accounts are logins, not Employee Master staff.
      const dashboardEmployeeRows=deduplicateEmployeeProfiles(
        (emp.data||[]).filter(row=>{
          const name=String(row?.full_name||'').trim().toLowerCase().replace(/\s+/g,' ');
          const login=String(row?.login_id||row?.username||'').trim().toLowerCase();
          if(isSamaraAdministratorAccount(row))return false;
          return name!=='administrator'&&login!=='administrator';
        })
      ).filter(row=>Boolean(row.is_active??row.active));
      const activeEmployeeCount=dashboardEmployeeRows.length;

      // Use the SAME availability rule as Rooms & Beds so both screens always agree.
      const roomBedRows=(beds.data||[]).filter(isPatientBed);
      const dashboardPatientForBed=bed=>
        patients.find(p=>String(p.id||'')===String(bed.patient_id||''))||
        patients.find(p=>
          String(p.room_no||'')===String(bed.room_no||'')&&
          String(p.bed_no||'').trim().toUpperCase()===String(bed.bed_no||'').trim().toUpperCase()
        )||
        null;
      const availableBeds=roomBedRows.filter(bed=>
        !dashboardPatientForBed(bed)&&String(bed.status||'Available')==='Available'
      ).length;
      const reservationOverdue=roomBedRows.filter(bed=>{
        if(String(bed.status||'').trim().toLowerCase()!=='reserved'||!bed.expected_admission_date)return false;
        const expected=new Date(`${bed.expected_admission_date}T${String(bed.expected_admission_time||'17:00').slice(0,5)}:00`);
        return !Number.isNaN(expected.getTime())&&expected.getTime()<Date.now();
      }).length;

      const todayDate=new Date(`${today}T00:00:00`);
      const soonDate=new Date(todayDate);soonDate.setDate(soonDate.getDate()+2);
      const packageExpiry=patients.filter(p=>{
        if(!p.package_id||!p.package_end_date)return false;
        const end=new Date(`${String(p.package_end_date).slice(0,10)}T00:00:00`);
        return end<=soonDate;
      }).length;
      const risks=patients.filter(p=>p.fall_risk||p.pressure_sore_risk||p.aspiration_risk||p.wandering_risk||p.infection_risk||p.oxygen_required).length;
      const outstanding=Math.max(0,(bill.data||[]).reduce((total,row)=>{
        const amount=Number(row.amount||0);
        const type=String(row.transaction_type||'Charge');
        if(type==='Charge')return total+amount;
        if(type==='Payment'||type==='Advance'||type==='Discount')return total-amount;
        if(type==='Refund')return total+amount;
        return total;
      },0));
      const activeDischarges=(dis.data||[]).filter(row=>{
        const status=String(row.status||'').trim().toLowerCase();
        return !['completed','closed','cancelled','canceled'].includes(status);
      });
      const awaitingManagement=activeDischarges.filter(row=>
        ['','pending'].includes(String(row.management_status||'').trim().toLowerCase())
      ).length;
      const withAccounts=activeDischarges.filter(row=>
        String(row.management_status||'').trim().toLowerCase()==='approved'&&
        String(row.accounts_status||'').trim().toLowerCase()!=='cleared'
      ).length;
      const awaitingNurse=activeDischarges.filter(row=>
        String(row.accounts_status||'').trim().toLowerCase()==='cleared'
      ).length;
      const returned=activeDischarges.filter(row=>
        String(row.management_status||'').trim().toLowerCase()==='rejected'||
        String(row.status||'').trim().toLowerCase()==='returned to nursing'
      ).length;
      const dischargeStatus=
        awaitingManagement?`${awaitingManagement} awaiting Management approval`:
        withAccounts?`${withAccounts} awaiting Accounts clearance`:
        awaitingNurse?`${awaitingNurse} awaiting final Nursing discharge`:
        returned?`${returned} returned to Nursing`:
        'No active discharge';

      setStats({
        employees:activeEmployeeCount,
        patients:patients.length,
        availableBeds,
        reservationOverdue,
        meds:med.count||0,
        care:care.count||0,
        outstanding,
        risks,
        incidents:inc.count||0,
        discharges:activeDischarges.length,
        dischargeStatus,
        visitRequests:vis?.count||0,
        enquiries:(enq?.data||[]).filter(isAdmissionEnquiry).length,
        recentEnquiries:(enq?.data||[]).filter(isAdmissionEnquiry).slice(0,6),
        escalations:esc?.count||0,
        packageExpiry
      });
    })()},[]);
    // Dashboard clinical action cards represent ACTIVE/PENDING actions, not completed logs.
    // The Clinical Alert engine is already the authoritative source for due/overdue nursing work.
    const dashboardAlerts=(alertEngine?.alerts||[]).filter(alert=>String(alert.alert_type||'').toLowerCase()!=='regularisation');
    const medicineActionsToday=dashboardAlerts.filter(alert=>
      String(alert.target_page||'')==='Medicines' ||
      /medicat|medicine/i.test(`${alert.alert_type||''} ${alert.title||''}`)
    ).length;
    const careActionsToday=dashboardAlerts.filter(alert=>
      String(alert.target_page||'')==='Daily Care' ||
      /daily care|care due/i.test(`${alert.alert_type||''} ${alert.title||''}`)
    ).length;

    const cards=[
      {label:'Current patients',value:stats.patients,page:'Patients',icon:'👥',patientFilter:'active'},
      {label:'Available beds',value:stats.availableBeds,page:'Rooms',icon:'🛏️',roomBedFilter:'available',status:stats.availableBeds?`${stats.availableBeds} currently available bed${stats.availableBeds===1?'':'s'}`:'No beds currently available'},
      {label:'Reservation Overdue',value:stats.reservationOverdue,page:'Rooms',icon:'⏰',roomBedFilter:'reserved',status:stats.reservationOverdue?`${stats.reservationOverdue} reservation${stats.reservationOverdue===1?'':'s'} awaiting action`:'No overdue reservations'},
      {label:'High-risk patients',value:stats.risks,page:'Patients',icon:'⚠️',patientFilter:'high-risk'},
      {label:'Active employees',value:stats.employees,page:'Employees',icon:'🧑‍⚕️',employeeFilter:'__ALL__'},
      {label:'Medicine Actions Today',value:medicineActionsToday,page:'Clinical Alerts',icon:'💊',clinicalFocus:'Medication',status:medicineActionsToday?`${medicineActionsToday} pending / due medication action${medicineActionsToday===1?'':'s'}`:'No medication actions due'},
      {label:'Care actions today',value:careActionsToday,page:'Clinical Alerts',icon:'✅',clinicalFocus:'Daily Care',status:careActionsToday?`${careActionsToday} pending / due care action${careActionsToday===1?'':'s'}`:'No care actions due'},
      {label:'Open incidents',value:stats.incidents,page:'Incidents',icon:'🚨',incidentFilter:'open'},
      {label:'Clinical escalations',value:stats.escalations,page:'Clinical Escalations',icon:'🔔',escalationFilter:'open',status:stats.escalations?`${stats.escalations} awaiting Manager/Admin action`:'No open escalations'},
      {label:'Outstanding Amount',value:`₹${stats.outstanding.toLocaleString('en-IN')}`,page:'Payments',icon:'₹',paymentFilter:'outstanding'},
      {label:'Package Expiry',value:stats.packageExpiry,page:'Package Expiry Dashboard',icon:'📦',status:stats.packageExpiry?`${stats.packageExpiry} expired / expiring within 2 days`:'No package expiry due'},
      {label:'Admission Enquiries',value:stats.enquiries,page:'Enquiries',icon:'☎',enquiryFilter:'active',status:stats.enquiries?`${stats.enquiries} awaiting follow-up`:'No new enquiries'},
      {label:'Visit Requests',value:stats.visitRequests,page:'Family Communication',icon:'📅',visitFilter:'pending',status:stats.visitRequests?`${stats.visitRequests} pending approval`:'No pending requests'},
      {label:'Discharge',value:stats.discharges,page:'Discharge',icon:'🚪',dischargeFilter:'open',status:stats.dischargeStatus}
    ];
    return h(React.Fragment,null,
      h('div',{className:'shift-summary'},h('div',null,h('strong',null,currentShift()),h('span',null,'Admin and Manager control dashboard')),h('span',{className:'badge'},formalName(profile))),
      profile?.role==='Manager'?h('button',{
        type:'button',onClick:()=>onNavigate('My To-Do & Follow-up'),
        style:{width:'100%',marginTop:'14px',marginBottom:'14px',textAlign:'left',border:'1px solid #e2b8c9',borderLeft:'6px solid #9f174e',borderRadius:'18px',padding:'14px 16px',cursor:'pointer',background:'linear-gradient(135deg,#fffafd,#f8e5ed)',boxShadow:'0 8px 22px rgba(119,18,65,.08)'}
      },
        h('div',{style:{display:'flex',justifyContent:'space-between',gap:'10px',alignItems:'center',flexWrap:'wrap'}},
          h('div',null,h('div',{style:{fontSize:'12px',fontWeight:900,letterSpacing:'.06em',color:'#9a1850'}},'MY PERSONAL WORKSPACE'),
            h('div',{style:{fontSize:'19px',fontWeight:950,color:'#461427'}},'To-Do & Follow-up'),
            h('small',{style:{color:'#735b66'}},'Private — visible only to your own login')),
          h('span',{className:'badge'},'Open My List →')
        ),
        h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(135px,1fr))',gap:'8px',marginTop:'11px'}},
          [['Due Today',managerPersonalSummary.today],['Overdue',managerPersonalSummary.overdue],['Follow-ups',managerPersonalSummary.followup],['Completed Today',managerPersonalSummary.completed]].map(([label,value])=>
            h('div',{key:label,style:{background:'rgba(255,255,255,.7)',border:'1px solid #ecd0dc',borderRadius:'11px',padding:'8px 10px'}},
              h('strong',{style:{fontSize:'21px',color:'#97144d'}},value),h('div',{style:{fontSize:'12px',fontWeight:850}},label))
          )
        )
      ):null,
      directorOfficeSummary.isDirector?h('button',{
        type:'button',
        onClick:()=>onNavigate("Director's Office"),
        style:{
          width:'100%',
          marginTop:'14px',
          marginBottom:'14px',
          textAlign:'left',
          border:'1px solid #dca8bd',
          borderLeft:'6px solid #a70f4d',
          borderRadius:'18px',
          padding:'16px 18px',
          cursor:'pointer',
          background:'linear-gradient(135deg,#fff8fb 0%,#f7dbe7 48%,#efc6d6 100%)',
          boxShadow:'0 10px 28px rgba(119,18,65,.11)'
        }
      },
        h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'12px',flexWrap:'wrap'}},
          h('div',null,
            h('div',{style:{fontSize:'12px',fontWeight:900,letterSpacing:'.07em',color:'#9a1850'}},'DIRECTOR’S OFFICE'),
            h('div',{style:{fontSize:'20px',fontWeight:950,color:'#461427',marginTop:'2px'}},'Items requiring your attention'),
            h('small',{style:{color:'#735b66'}},'Shared live workspace with Secretary to the Director')
          ),
          h('span',{className:'badge'},'Open Director’s Office →')
        ),
        h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:'8px',marginTop:'13px'}},
          h('div',{style:{background:'rgba(255,255,255,.62)',border:'1px solid rgba(173,58,106,.18)',borderRadius:'12px',padding:'9px 11px'}},h('strong',{style:{fontSize:'23px',color:'#97144d'}},directorOfficeSummary.awaiting),h('div',{style:{fontSize:'12px',fontWeight:850}},'Awaiting My Instruction')),
          h('div',{style:{background:'rgba(255,255,255,.62)',border:'1px solid rgba(173,58,106,.18)',borderRadius:'12px',padding:'9px 11px'}},h('strong',{style:{fontSize:'23px',color:'#97144d'}},directorOfficeSummary.calls),h('div',{style:{fontSize:'12px',fontWeight:850}},'Calls to Return')),
          h('div',{style:{background:'rgba(255,255,255,.62)',border:'1px solid rgba(173,58,106,.18)',borderRadius:'12px',padding:'9px 11px'}},h('strong',{style:{fontSize:'23px',color:'#97144d'}},directorOfficeSummary.appointments),h('div',{style:{fontSize:'12px',fontWeight:850}},'Appointments Today')),
          h('div',{style:{background:'rgba(255,255,255,.62)',border:'1px solid rgba(173,58,106,.18)',borderRadius:'12px',padding:'9px 11px'}},h('strong',{style:{fontSize:'23px',color:'#97144d'}},directorOfficeSummary.urgent),h('div',{style:{fontSize:'12px',fontWeight:850}},'Urgent Follow-ups'))
        )
      ):null,
      h('div',{className:'grid stats dashboard-links'},cards.map(card=>h('button',{type:'button',className:`card stat dashboard-card ${card.label==='Reservation Overdue'&&Number(card.value)>0?'dashboard-card-reservation-overdue':''}`,key:card.label,onClick:()=>{
        if(card.page==='Patients'){
          try{
            if(card.patientFilter)sessionStorage.setItem('samara-patient-list-filter',card.patientFilter);
            else sessionStorage.removeItem('samara-patient-list-filter');
          }catch(_error){}
        }
        if(card.page==='Employees'){
          try{
            if(card.employeeFilter)sessionStorage.setItem('samara-employee-list-filter',card.employeeFilter);
            else sessionStorage.removeItem('samara-employee-list-filter');
          }catch(_error){}
        }
        if(card.page==='Rooms'){
          try{
            if(card.roomBedFilter)sessionStorage.setItem('samara-room-bed-filter',card.roomBedFilter);
            else sessionStorage.removeItem('samara-room-bed-filter');
          }catch(_error){}
        }
        if(card.page==='Clinical Alerts'){
          try{
            if(card.clinicalFocus)sessionStorage.setItem('samara-clinical-alert-focus',card.clinicalFocus);
            else sessionStorage.removeItem('samara-clinical-alert-focus');
          }catch(_error){}
        }
        try{
          if(card.incidentFilter)sessionStorage.setItem('samara-incident-filter',card.incidentFilter);
          if(card.escalationFilter)sessionStorage.setItem('samara-escalation-filter',card.escalationFilter);
          if(card.paymentFilter)sessionStorage.setItem('samara-payment-filter',card.paymentFilter);
          if(card.enquiryFilter)sessionStorage.setItem('samara-enquiry-filter',card.enquiryFilter);
          if(card.visitFilter)sessionStorage.setItem('samara-visit-filter',card.visitFilter);
          if(card.dischargeFilter)sessionStorage.setItem('samara-discharge-filter',card.dischargeFilter);
        }catch(_error){}
        dashboardNavigate(onNavigate,card.page,card.label,{source:'Main Dashboard'});
      },title:`Open ${card.page}`},h('span',{className:'dashboard-icon','aria-hidden':'true'},card.icon),h('span',null,card.label),h('strong',null,card.value),h('small',null,card.status||`Open ${card.page} →`)))),
      h('div',{className:'grid two',style:{marginTop:'18px'}},
        h('div',{className:'card panel'},
          h('div',{className:'panel-head'},h('div',null,h('h3',null,'Latest Admission Enquiries'),h('small',null,'Website and Family Portal submissions')),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>dashboardNavigate(onNavigate,'Enquiries','Latest Admission Enquiries',{source:'Main Dashboard'})},'Open Enquiries')),
          (stats.recentEnquiries||[]).length?h('div',{style:{display:'grid',gap:'9px'}},stats.recentEnquiries.map(r=>h('button',{type:'button',key:r.id,onClick:()=>dashboardNavigate(onNavigate,'Enquiries','Latest Admission Enquiries',{source:'Main Dashboard'}),style:{textAlign:'left',padding:'11px 12px',border:'1px solid #ecd6e2',borderRadius:'12px',background:'#fffafd',cursor:'pointer'}},h('div',{style:{display:'flex',justifyContent:'space-between',gap:'8px',alignItems:'center'}},h('strong',{style:{color:'#5d1039'}},r.patient_name||'Resident'),h('span',{className:'badge'},r.source||'Website')),h('small',{style:{display:'block',marginTop:'4px'}},`${r.family_contact_name||'—'} · ${r.family_contact_phone||'—'}`),h('small',{style:{display:'block',marginTop:'3px',color:'#8a6577'}},`${r.care_type||'Admission enquiry'} · ${r.status||'New'} · ${formatDateTimeIN(r.created_at)}`)))):h('p',{className:'empty'},'No new admission enquiries.' )
        ),
        h('div',{style:{display:'grid',gap:'12px'}},
          h('button',{type:'button',className:'card panel dashboard-panel-link',onClick:()=>dashboardNavigate(onNavigate,'Shift Tasks','Today’s Operational Focus',{source:'Main Dashboard'})},h('div',{className:'panel-head'},h('h3',null,'Today’s Operational Focus')),h('p',null,'Open medicines, bathing, restroom assistance, feeding, mobility, physiotherapy and special-nurse tasks.'),h('span',{className:'badge'},'Open Shift Tasks →')),
          h('button',{type:'button',className:'card panel dashboard-panel-link',onClick:()=>dashboardNavigate(onNavigate,'Reports','Management Reports',{source:'Main Dashboard'})},h('div',{className:'panel-head'},h('h3',null,'Management reports')),h('p',null,'Open occupancy, clinical risks, incidents, billing, collections and outstanding details.'),h('span',{className:'badge'},'Open Reports →'))
        )
      )
    );
  }



