  const cfg = window.SAMARA_CONFIG;
  const sdk = window.supabase;
  if (!cfg || !sdk) {
    document.getElementById('root').innerHTML = '<div class="loading">Unable to load application libraries.</div>';
    return;
  }
  const client = sdk.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });

  async function writeAuditEvent(action,entity='System',entityId=null,details=null,result='Success'){
    try{
      const {data:{user}}=await client.auth.getUser();
      if(!user)return;
      await client.rpc('record_audit_event',{
        p_action:action,
        p_entity:entity,
        p_entity_id:entityId?String(entityId):null,
        p_details:details||{},
        p_result:result
      });
    }catch(error){console.warn('Audit event could not be recorded:',error)}
  }

  const ROLES = ['Admin','Manager','Nurse','Caregiver','Accounts','Kitchen','STD'];

  const HR_DEPARTMENTS = ["Nursing", "Caregiving", "Medical", "Physiotherapy & Rehabilitation", "Housekeeping", "Food & Kitchen", "Administration", "HR", "Operations", "Accounts & Finance", "Maintenance", "Security", "Transport", "Marketing & Outreach", "Other"];
  const HR_DESIGNATIONS = {"Nursing": ["Nurse Manager", "Nursing Supervisor", "Staff Nurse", "ANM"], "Caregiving": ["Senior Caregiver", "Caregiver", "Nursing Assistant"], "Medical": ["Duty Medical Officer – Part Time", "Visiting Doctor", "Medical Officer"], "Physiotherapy & Rehabilitation": ["Physiotherapist", "Rehabilitation Assistant"], "Housekeeping": ["Housekeeping Supervisor", "Housekeeping Staff", "Laundry Staff"], "Food & Kitchen": ["Dietician", "Cook", "Kitchen Assistant", "Food Service Assistant"], "Administration": ["Facility Administrator", "Manager", "Receptionist", "Administrative Assistant"], "HR": ["HR Manager", "HR Executive", "HR Assistant"], "Operations": ["Operations Manager", "Operations Executive", "Facility Coordinator"], "Accounts & Finance": ["Accountant", "Accounts Executive", "Accounts Assistant"], "Maintenance": ["Maintenance Supervisor", "Technician", "Electrician / Plumber"], "Security": ["Security Supervisor", "Security Guard"], "Transport": ["Driver", "Transport Coordinator"], "Marketing & Outreach": ["Marketing Executive", "Community Outreach Executive"], "Other": ["General Application", "Volunteer", "Other"]};
  const HR_APPLICATION_STATUSES=['New','Under Review','Returned for Rectification','Shortlisted','Interview Scheduled','Selected','Rejected','On Hold','Converted to Employee','Closed'];
  const employeeDepartment=row=>String(row?.department||'').trim()||(
    row?.role==='Nurse'?'Nursing':row?.role==='Caregiver'?'Caregiving':row?.role==='Accounts'?'Accounts & Finance':row?.role==='Kitchen'?'Food & Kitchen':['Admin','Manager'].includes(row?.role)?'Administration':'Other'
  );
  // Office and store are operational spaces recorded in room_beds for room-master
  // convenience. They must never enter patient bed capacity or availability figures.
  const isOperationalRoomSpace=row=>{
    const clean=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');
    return [row?.status,row?.room_type,row?.room_no,row?.bed_no].some(value=>{
      const normalized=clean(value);
      return normalized==='samaraoffice'||normalized==='samarastore';
    });
  };
  const isPatientBed=row=>!isOperationalRoomSpace(row);
  // Samara's present full-access Administrators are management/system users, not HR employees.
  // Keep them available for ERP login and permissions, but exclude them from Employee dashboards/lists.
  const isSamaraAdministratorAccount=row=>{
    const clean=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const role=clean(row?.role);
    const name=clean(row?.full_name||row?.name);
    const login=clean(row?.login_id||row?.username||row?.email?.split('@')[0]);
    return role==='admin' ||
      name==='chellaboomi' ||
      name==='drchellaboomi' ||
      name==='maneeshaboominathan' ||
      name==='boomir' ||
      name==='ram' ||
      login==='chellaboomi' ||
      login==='rajaiahboomi' ||
      login==='maneeshaboominathan' ||
      login==='ram';
  };
  const isNonPayrollManagementAccount=row=>{
    const clean=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const name=clean(row?.full_name||row?.name), login=clean(row?.login_id||row?.username), employeeId=clean(row?.employee_id);
    return isSamaraAdministratorAccount(row)||['administrator','boomir','drchellaboomi','chellaboomi','maneeshaboominathan','mrram','ram'].includes(name)||['administrator','boomir','chellaboomi','maneeshaboominathan','ram'].includes(login)||['0001','003','001','009','0008'].includes(employeeId);
  };
  const employeeProfileScore=row=>{
    const department=employeeDepartment(row);
    return (row?.employee_id?40:0)+(row?.auth_user_id?30:0)+(row?.login_id?20:0)+
      (row?.mobile?10:0)+(row?.designation?10:0)+(department==='Nursing'?25:department&&department!=='Administration'?12:0);
  };
  const deduplicateEmployeeProfiles=source=>{
    const unique=[];
    const clean=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const keys=row=>new Set([
      row?.employee_id&&`employee:${clean(row.employee_id)}`,
      row?.auth_user_id&&`auth:${clean(row.auth_user_id)}`,
      row?.mobile&&`mobile:${String(row.mobile).replace(/\D/g,'').slice(-10)}`,
      (row?.full_name||row?.name)&&`name:${clean(row.full_name||row.name)}`
    ].filter(Boolean));
    for(const row of source||[]){
      const rowKeys=keys(row);
      const index=unique.findIndex(existing=>[...rowKeys].some(key=>keys(existing).has(key)));
      if(index<0){unique.push(row);continue}
      if(employeeProfileScore(row)>employeeProfileScore(unique[index]))unique[index]=row;
    }
    return unique;
  };
  const EMPLOYEE_TITLES = ['Dr.','Prof.','Mr.','Mrs.','Ms.','Miss','Shri','Smt.','Rev.','Fr.','Br.','Sr.','Other'];
  const PATIENT_TITLES = ['Dr.','Mr.','Mrs.','Ms.','Miss','Shri','Smt.','Master','Baby','Kumari','Late','Other'];
  const formalName = row => [String(row?.title||'').trim(),String(row?.full_name||'').trim()].filter(Boolean).join(' ');
  const displayName = row => formalName(row);
  const ROOM_NUMBER_OPTIONS = Array.from({length:26},(_,i)=>String(100+i));
  const BED_CODE_OPTIONS = ['A','B','C','D'];
  const NAV_SECTIONS = [
    { title:'OVERVIEW', items:['Dashboard','Notifications'] },
    { title:'ADMIN', items:['Temporary Duty Swap','Additional Duty Assignment','Rooms','Care Packages','Shift Management','Stores Master','Charge Master','Form Field Settings','Audit Trail','Alert Settings','System Maintenance'] },
    { title:'HR', items:['HR Dashboard','Employees','Duty Assignment','Duty Calendar','Staff Leave Calendar','My Leave & Permission','Leave Approvals','Career Applications','Interviews'] },
    { title:"DIRECTOR'S OFFICE", items:["Director's Office",'Enquiries & Feedback'] },
    { title:'ADMISSION', items:['Enquiries','Spot Assessment','Admissions','Patients','Discharge','Documents'] },
    { title:'MANAGER', items:['My To-Do & Follow-up','Clinical Escalations','Reports','Intelligent Reports','Medication Errors','Recovery Timeline'] },
    { title:'NURSING', items:['Clinical Dashboard','Clinical Alerts','Shift Tasks','Daily Care','Vital Signs','Medicines','Physiotherapy','Special Nurse','Shift Handover','Incidents'] },
    { title:'PHARMACY & STORES', items:['Consumables','Pharmacy'] },
    { title:'FOOD & DIET', items:['Food & Diet'] },
    { title:'ACCOUNTS / BILLING', items:['Payments & Vouchers','Payment Requests','Approved—Ready to Pay','Payment Vouchers','Payment Statements','Accounts Dashboard','Package Expiry Dashboard','Charge Approvals','Payments','Patient Ledger','Final Billing','Discharge Clearance','Refunds','Accounts Reports'] },
    { title:'COMMUNICATION', items:['WhatsApp Inbox','WhatsApp Logs','Family Communication','Feedback','Mail Dashboard'] },
    { title:'MY ACCOUNT', items:['My Profile'] }
  ];
  const ALL_NAV = NAV_SECTIONS.flatMap(section=>section.items);
  const NURSING_ENTRY_NAV=['Shift Tasks','Daily Care','Vital Signs','Medicines','Physiotherapy','Special Nurse','Shift Handover'];
  const ROLE_NAV={
    Admin:ALL_NAV.filter(item=>item!=='My To-Do & Follow-up'&&!NURSING_ENTRY_NAV.includes(item)),
    Manager:ALL_NAV.filter(item=>!['Payments & Vouchers','Payment Requests','Approved—Ready to Pay','Payment Vouchers','Payment Statements',"Director's Office",'Enquiries & Feedback','System Maintenance','Alert Settings','Payments','Patient Ledger','Final Billing','Refunds','HR Dashboard','Employees','Leave Approvals','Career Applications','Interviews',...NURSING_ENTRY_NAV].includes(item)),

    Nurse:['Clinical Dashboard','Clinical Alerts','Duty Assignment','Patients','Rooms','Discharge','Shift Tasks','Daily Care','Vital Signs','Medicines','Raise Indent','Received Indents / Used Balance','Patient Consumables','Food & Diet','Physiotherapy','Special Nurse','Shift Handover','Incidents','Charge Approvals','My To-Do List','My Leave & Permission','Notifications'],
    Caregiver:['Clinical Dashboard','Clinical Alerts','Duty Assignment','Patients','Shift Tasks','Daily Care','Vital Signs','Medicines','Food & Diet','Physiotherapy','Special Nurse','Shift Handover','Incidents','My Leave & Permission','Notifications'],
    Accounts:['Accounts Dashboard','Duty Assignment','Package Expiry Dashboard','Charge Approvals','Payments','Patient Ledger','Final Billing','Discharge Clearance','Refunds','Accounts Reports','WhatsApp Logs','Patients','My Leave & Permission','Notifications'],
    Kitchen:['Notifications','Duty Assignment','Patients','Discharge','Physiotherapy','Special Nurse','Food & Diet','My Leave & Permission'],
    STD:["Director's Office",'Enquiries & Feedback','Food & Diet','Duty Assignment','Patient Consumables','Stores','Consumables','Pharmacy','WhatsApp Inbox','Feedback','My Leave & Permission']
  };
  Object.keys(ROLE_NAV).forEach(role=>{
    if(!ROLE_NAV[role].includes('Temporary Duty Swap'))ROLE_NAV[role].push('Temporary Duty Swap');
    if(!ROLE_NAV[role].includes('Leave Cover'))ROLE_NAV[role].push('Leave Cover');
    if(!ROLE_NAV[role].includes('Additional Duty Assignment'))ROLE_NAV[role].push('Additional Duty Assignment');
    if(!ROLE_NAV[role].includes('My Profile'))ROLE_NAV[role].push('My Profile');
  });
  const ROLE_HOME={Admin:'Dashboard',Manager:'Dashboard',Nurse:'Clinical Dashboard',Caregiver:'Clinical Dashboard',Accounts:'Accounts Dashboard',Kitchen:'Food & Diet',STD:"Director's Office"};
  const isNursingManagerProfile=profile=>{
    const clean=value=>String(value||'').trim().toLowerCase().replace(/[._-]+/g,' ').replace(/\s+/g,' ');
    const designation=clean(profile?.designation||profile?.employee_designation||profile?.job_title||profile?.position);
    if(designation==='nurse manager'||designation==='nursing manager')return true;
    // Legacy/login-only profiles can temporarily miss the designation field.
    // Only use the department+role fallback when no designation-like value exists.
    const department=clean(profile?.department);
    return !designation && department==='nursing' && clean(profile?.role)==='manager';
  };
  const isAdmissionDelegateProfile=profile=>{
    const clean=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');
    const login=clean(profile?.login_id||profile?.username||'');
    const name=clean(profile?.full_name||profile?.name||'');
    return login==='jaya'||login==='saranya'||name==='jaya'||name==='saranya';
  };
  const homePageForProfile=profile=>isNursingManagerProfile(profile)?'Clinical Dashboard':(ROLE_HOME[profile?.role]||'Dashboard');
  const hasDutyRole=(profile,role)=>profile?.role===role||Boolean(profile?.__dutyContext?.roles?.includes(role));
  const allowedPagesForProfile=profile=>{
    if(profile?.__dutyContext?.additional_duties?.length&&!profile.__additionalNavResolved){const c=profile.__dutyContext;const base=allowedPagesForProfile({...profile,__additionalNavResolved:true});const extras=(c.additional_duties||[]).flatMap(d=>allowedPagesForProfile({...profile,__additionalNavResolved:true,role:d.covering_role,designation:d.covering_designation,department:d.covering_role==='Manager'?'Nursing':profile.department}));return [...new Set([...base,...extras])];}
    if(profile?.__dutyContext?.leave_cover&&!profile.__leaveNavResolved){const c=profile.__dutyContext;return [...new Set([...allowedPagesForProfile({...profile,__leaveNavResolved:true}),...allowedPagesForProfile({...profile,__leaveNavResolved:true,role:c.regular_role,designation:c.regular_designation,department:c.regular_department}),...allowedPagesForProfile({...profile,__leaveNavResolved:true,role:c.leave_cover.covering_role,designation:c.leave_cover.covering_designation})])];}
    if(profile?.__paymentsTrial&&!profile.__paymentsNavResolved){const a=profile.__paymentsTrial;return [...allowedPagesForProfile({...profile,__paymentsNavResolved:true}).filter(x=>!['Payments & Vouchers','Payment Requests','Approved—Ready to Pay','Payment Vouchers','Payment Statements'].includes(x)),...(a.full?['Payments & Vouchers']:[]),'Payment Requests',...(a.pay?['Approved—Ready to Pay']:[]),'Payment Vouchers','Payment Statements'];}
    if(isNursingManagerProfile(profile))return [
      'Clinical Dashboard','Notifications','Rooms','Care Packages','Employees','Staff Leave Calendar','My Leave & Permission',
      'Enquiries','Spot Assessment','Admissions','Patients','Discharge','Documents','My To-Do List','Clinical Alerts',
      'Duty Assignment','Duty Calendar','Staff Duty Assignment','Clinical Escalations','Reports','Intelligent Reports','Medication Errors','Recovery Timeline',
      'Patient Consumables','Stores','Stores In-charge Assignment','Consumables','Pharmacy','Temporary Duty Swap','Leave Cover','Additional Duty Assignment','Staff Leave Calendar','Food & Diet','WhatsApp Inbox','My Profile'
    ];
    const pages=[...(ROLE_NAV[profile?.role]||['Dashboard'])];
    if(!pages.includes('Spot Assessment'))pages.push('Spot Assessment');
    if(isAdmissionDelegateProfile(profile)&&!pages.includes('Admissions'))pages.push('Admissions');
    if(profile?.role==='Manager'&&employeeDepartment(profile)&&!pages.includes('Employees'))pages.push('Employees');
    if(isNursingManagerProfile(profile)){ if(!pages.includes('My To-Do List'))pages.push('My To-Do List'); if(!pages.includes('Patient Consumables'))pages.push('Patient Consumables'); if(!pages.includes('Stores'))pages.push('Stores'); if(!pages.includes('Consumables'))pages.push('Consumables'); if(!pages.includes('Pharmacy'))pages.push('Pharmacy'); if(!pages.includes('Stores In-charge Assignment'))pages.push('Stores In-charge Assignment'); if(!pages.includes('Employees'))pages.push('Employees'); }
    return pages;
  };
  const CLINICAL_ROLES=['Nurse','Caregiver'];
  const ROLE_LABELS={
    'Clinical Dashboard':'Nursing Dashboard',
    'Clinical Escalations':'Clinical Escalations',
    'Patients':'My Patients',
    'Rooms':'Available Beds',
    'Medicines':'Medication Administration',
    'Food & Diet':'Food & Beverages',
    'Charge Approvals':'Bills & Charges',
    'Accounts Dashboard':'Accounts Dashboard',
    'Package Expiry Dashboard':'Package Expiry Dashboard',
    'Payments':'Payments',
    'Patient Ledger':'Patient Ledger',
    'Final Billing':'Final Billing',
    'Discharge Clearance':'Discharge Clearance',
    'Refunds':'Refunds',
    'Accounts Reports':'Accounts Reports',
    'Mail Dashboard':'Mail',
    'Notifications':'Alerts',
    "Director's Office":"Director's Office",
    'My Profile':'My Profile',
    'My To-Do & Follow-up':'My To-Do & Follow-up',
    'My To-Do List':'My To-Do List',
    'Raise Indent':'Raise Indent',
    'Received Indents / Used Balance':'Received Indents / Used Balance'
  };
  const displayNavLabel=(item,role)=>{
    if(item==='Duty Assignment'&&(CLINICAL_ROLES.includes(role)||role==='Manager'))return 'My Duty';
    return CLINICAL_ROLES.includes(role)?(ROLE_LABELS[item]||item):item;
  };
  const sectionsFor = (allowed,role,canManageDuties=role==='Admin') => {
    if(allowed.some(item=>['Temporary Duty Swap','Leave Cover','Additional Duty Assignment'].includes(item))){const dutyItems=allowed.filter(item=>['Temporary Duty Swap','Leave Cover','Additional Duty Assignment'].includes(item));const sections=sectionsFor(allowed.filter(item=>!dutyItems.includes(item)),role,canManageDuties);const title=canManageDuties?'ADMIN':'MY ACCOUNT';let section=sections.find(item=>item.title===title);if(!section){section={title,items:[]};sections.splice(canManageDuties?1:sections.length,0,section)}section.items.push(...dutyItems);return sections;}
    if(role!=='Admin'&&allowed.includes('Payment Requests')){const items=allowed.filter(x=>['Payments & Vouchers','Payment Requests','Approved—Ready to Pay','Payment Vouchers','Payment Statements'].includes(x));const sections=sectionsFor(allowed.filter(x=>!items.includes(x)),role,canManageDuties);const accounts=sections.find(s=>s.title==='ACCOUNTS / BILLING');if(accounts)accounts.items=[...items,...accounts.items];else sections.push({title:'ACCOUNTS / BILLING',items});return sections;}
    if(CLINICAL_ROLES.includes(role)){
      return [
        {title:'ADMISSION',items:['Spot Assessment','Admissions'].filter(item=>allowed.includes(item))},
        {title:'NURSING WORKSPACE',items:['Clinical Dashboard','Clinical Alerts','Patients','Rooms','Shift Tasks','Daily Care','Vital Signs','Medicines','Food & Diet','Physiotherapy','Special Nurse','Shift Handover','Incidents','Discharge','Charge Approvals','My To-Do List','Notifications'].filter(item=>allowed.includes(item))},
        {title:'DUTY ROSTER & LEAVE',items:['Duty Assignment','Staff Leave Calendar','My Leave & Permission','Leave Approvals'].filter(item=>allowed.includes(item))},
        {title:'PHARMACY & STORES',items:['Raise Indent','Received Indents / Used Balance'].filter(item=>allowed.includes(item))},
        {title:'MY ACCOUNT',items:['My Profile'].filter(item=>allowed.includes(item))}
      ];
    }
    if(role==='Manager'&&allowed.includes('My To-Do List')&&allowed.includes('Employees')&&!allowed.includes('Accounts Dashboard')){
      return [
        {title:"DIRECTOR'S OFFICE",items:["Director's Office",'Enquiries & Feedback','Feedback'].filter(item=>allowed.includes(item))},
        {title:'NURSING OVERVIEW',items:['Clinical Dashboard','Notifications','Clinical Alerts','Clinical Escalations','My To-Do List'].filter(item=>allowed.includes(item))},
        {title:'DUTY ROSTER & LEAVE',items:['Duty Assignment','My Leave & Permission'].filter(item=>allowed.includes(item))},
        {title:'NURSING STAFF',items:['Staff Duty Assignment','Duty Calendar','Staff Leave Calendar','Employees'].filter(item=>allowed.includes(item))},
        {title:'ADMISSION',items:['Enquiries','Spot Assessment','Admissions','Patients','Discharge','Documents'].filter(item=>allowed.includes(item))},
        {title:'ROOMS & PACKAGES',items:['Rooms','Care Packages'].filter(item=>allowed.includes(item))},
        {title:'PHARMACY & STORES',items:['Consumables','Pharmacy'].filter(item=>allowed.includes(item))},
        {title:'FOOD & DIET',items:['Food & Diet'].filter(item=>allowed.includes(item))},
        {title:'COMMUNICATION',items:['WhatsApp Inbox'].filter(item=>allowed.includes(item))},
        {title:'CLINICAL REVIEW',items:['Reports','Intelligent Reports','Medication Errors','Recovery Timeline'].filter(item=>allowed.includes(item))},
        {title:'MY ACCOUNT',items:['My Profile'].filter(item=>allowed.includes(item))}
      ].filter(section=>section.items.length);
    }
    return NAV_SECTIONS.map(section=>({...section,items:section.items.filter(item=>allowed.includes(item))})).filter(section=>section.items.length);
  };
