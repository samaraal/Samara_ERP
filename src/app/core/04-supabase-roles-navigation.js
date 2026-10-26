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
  // 2.16.13: staff kept off the Duty Roster / Duty list / On Duty Today, with login and all other pages unchanged.
  // List lives in table duty_roster_exclusions (SQL 212). If the table is missing or unreadable, nobody is excluded.
  const loadDutyRosterExclusions=async()=>{
    try{const r=await client.from('duty_roster_exclusions').select('profile_id');if(r.error)return new Set();return new Set((r.data||[]).map(x=>String(x.profile_id)))}
    catch(_){return new Set()}
  };
  const notExcludedFromRoster=excluded=>row=>!excluded.has(String(row?.id||''))&&!(row?.auth_user_id&&excluded.has(String(row.auth_user_id)));
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
  // 2.15.1: don't double the title when the name already starts with it ("Mrs." + "Mrs.Lakshmi" → "Mrs.Lakshmi")
  const formalName = row => {const t=String(row?.title||'').trim(),n=String(row?.full_name||'').trim();const tn=t.replace(/\.+$/,'');if(tn&&new RegExp('^'+tn.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(\\.|\\s)','i').test(n))return n;return [t,n].filter(Boolean).join(' ');};
  const displayName = row => formalName(row);
  const ROOM_NUMBER_OPTIONS = Array.from({length:26},(_,i)=>String(100+i));
  const BED_CODE_OPTIONS = ['A','B','C','D'];
  // 2.15.58: Accounts menu — Dashboard first, then Guest Billing (money in), Outgoing Payments
  // (money out), Reports. 'Payments & Vouchers' opens the same screen as 'Payment Requests', so
  // the menu shows only 'Payment Requests' (the page key stays valid for saved links).
  const ACCOUNTS_NAV_GROUPS=[
    {label:'',items:['Accounts Dashboard','Accounts Statement']}, // 2.18.54: Statement right under the Dashboard
    {label:'Guest Billing · money in',items:['Charge Approvals','Payments','Patient Ledger','Final Billing','Discharge Clearance','Refunds','Package Expiry Dashboard']},
    {label:'Outside Bills',items:['Outside Bills Paid by Samara']},
    {label:'Outgoing Payments · money out',items:['Payments & Vouchers','Payment Requests','Approved—Ready to Pay','Payment Vouchers','Payment Statements']},
    {label:'Reports',items:['Accounts Reports']},
    {label:'Profit · Admin only',items:['Net Profit Statement','Monthly Expenses']} // 2.18.169
  ];
  const ACCOUNTS_NAV_ORDER=ACCOUNTS_NAV_GROUPS.flatMap(g=>g.items);
  const ACCOUNTS_NAV_LABELS={
    'Accounts Statement':'Statement',
    'Charge Approvals':'Bills & Charges Approval',
    'Payments':'Guest Payments / Receipts',
    'Patient Ledger':'Guest Ledger',
    'Package Expiry Dashboard':'Package Expiry'
  };
  // Sub-heading to show above items[i] in the ACCOUNTS / BILLING menu (or '' for none).
  const navSubheadBefore=(sectionTitle,items,i)=>{
    if(sectionTitle!=='ACCOUNTS / BILLING')return '';
    const group=ACCOUNTS_NAV_GROUPS.find(g=>g.items.includes(items[i]));
    if(!group||!group.label)return '';
    const prev=i>0?ACCOUNTS_NAV_GROUPS.find(g=>g.items.includes(items[i-1])):null;
    return prev===group?'':group.label;
  };
  const tidyAccountsSection=sections=>sections.map(section=>{
    if(section.title!=='ACCOUNTS / BILLING')return section;
    let items=[...new Set(section.items)];
    if(items.includes('Payment Requests'))items=items.filter(x=>x!=='Payments & Vouchers');
    const rank=x=>{const i=ACCOUNTS_NAV_ORDER.indexOf(x);return i<0?999:i};
    items.sort((a,b)=>rank(a)-rank(b));
    return {...section,items};
  });
  const NAV_SECTIONS = [
    { title:'OVERVIEW', items:['Dashboard','Notifications'] },
    { title:'ADMIN', items:['Temporary Duty Swap','Additional Duty Assignment','Rooms','Care Packages','Shift Management','Stores Master','Charge Master','Form Field Settings','Audit Trail','Alert Settings','System Maintenance','System Health'] }, // 2.16.43: System Health (Admin)
    { title:'CHARGE MASTER', items:['Charge Master',...CHARGE_MASTER_PAGES] },
    { title:'HR', items:['HR Dashboard','Employees','Employee Register','Duty Assignment','Duty Calendar','Staff Leave Calendar','My Leave & Permission','Leave Approvals','Career Applications','Interviews'] },
    { title:"DIRECTOR'S OFFICE", items:["Director's Office",'Enquiry Register','Enquiries & Feedback'] },
    { title:'ADMISSION', items:['Spot Assessment','Admissions','Admission Register'] }, // 2.15.67: Enquiries moved to DIRECTOR'S OFFICE → Enquiry Register
    { title:'PATIENTS', items:['Patients','Discharge','Documents','Recovery Timeline','Intelligent Reports','Family Communication','Incidents','Medication Errors'] }, // 2.15.58: Guest Ledger / Final Billing live only under ACCOUNTS
    { title:'MANAGER', items:['My To-Do & Follow-up','Clinical Escalations','Reports','Petty Cash'] }, // 2.16.19: Petty Cash = Nursing Manager's book (Admin + Nursing Manager)
    { title:'NURSING', items:['Outside Nursing Dashboard','Outside Samara Nursing Procedures','Clinical Dashboard','Clinical Alerts','Shift Tasks','Daily Care','Vital Signs','Intake / Output','Nursing Notes','Medicines','Approval Requests','Charge Register','Physiotherapy','Special Nurse','Shift Handover'] },
    { title:'PHYSIOTHERAPY', items:['Physiotherapy Dashboard'] },
    { title:'PHARMACY & STORES', items:['Receive from Vendor','Stock Report','Consumables','Pharmacy','Housekeeping & General','Kitchen / Food Stores','Biomedical Equipment','Oxygen Cylinders'] },
    { title:'FOOD & DIET', items:['Food & Diet'] },
    { title:'ACCOUNTS / BILLING', items:['Physiotherapist Accounts','Accounts Dashboard','Accounts Statement','Outside Bills Paid by Samara','Charge Approvals','Payments','Patient Ledger','Final Billing','Discharge Clearance','Refunds','Package Expiry Dashboard','Payments & Vouchers','Payment Requests','Approved—Ready to Pay','Payment Vouchers','Payment Statements','Accounts Reports','Net Profit Statement','Monthly Expenses'] }, // keep · 2.18.169: Net Profit (Admin only) in step with ACCOUNTS_NAV_GROUPS
    { title:'COMMUNICATION', items:['Talk to Guest','WhatsApp Inbox','WhatsApp Logs','Feedback','Mail Dashboard'] }, // 2.16.34: Talk to Guest here for Admin / STD (nurses & managers keep it in their nursing menu)
    { title:'MY ACCOUNT', items:['My Profile'] }
  ];
  const ALL_NAV = NAV_SECTIONS.flatMap(section=>section.items);
  const NURSING_ENTRY_NAV=['Shift Tasks','Daily Care','Vital Signs','Medicines','Physiotherapy','Special Nurse','Shift Handover'];
  const ROLE_NAV={
    Admin:ALL_NAV.filter(item=>item!=='My To-Do & Follow-up'&&(!NURSING_ENTRY_NAV.includes(item)||item==='Physiotherapy')),
    Manager:ALL_NAV.filter(item=>!['Net Profit Statement','Monthly Expenses','Outside Bills Paid by Samara','Petty Cash','Payments & Vouchers','Payment Requests','Approved—Ready to Pay','Payment Vouchers','Payment Statements',"Director's Office",'Enquiries & Feedback','System Maintenance','System Health','Alert Settings','Payments','Patient Ledger','Accounts Statement','Final Billing','Refunds','HR Dashboard','Employees','Employee Register','Leave Approvals','Career Applications','Interviews',...NURSING_ENTRY_NAV].includes(item)),

    Nurse:['Outside Nursing Dashboard','Outside Samara Nursing Procedures','Clinical Dashboard','Clinical Alerts','Talk to Guest','Duty Assignment','Patients','Rooms','Discharge','Shift Tasks','Daily Care','Vital Signs','Intake / Output','Nursing Notes','Medicines','Approval Requests','Raise Indent','Received Indents / Used Balance','Oxygen Cylinders','Biomedical Equipment','Patient Consumables','Food & Diet','Physiotherapy','Special Nurse','Shift Handover','Incidents','Charge Approvals','My To-Do List','My Leave & Permission','Notifications'],
    Caregiver:['Clinical Dashboard','Clinical Alerts','Talk to Guest','Duty Assignment','Patients','Shift Tasks','Daily Care','Vital Signs','Intake / Output','Nursing Notes','Medicines','Food & Diet','Physiotherapy','Special Nurse','Shift Handover','Incidents','My Leave & Permission','Notifications'],
    Accounts:['Outside Nursing Dashboard','Outside Samara Nursing Procedures','Accounts Dashboard','Accounts Statement','Outside Bills Paid by Samara','Duty Assignment','Package Expiry Dashboard','Charge Approvals','Payments','Patient Ledger','Final Billing','Discharge Clearance','Refunds','Accounts Reports','WhatsApp Logs','Patients','My Leave & Permission','Notifications'],
    Kitchen:['Notifications','Duty Assignment','Patients','Discharge','Physiotherapy','Special Nurse','Food & Diet','My Leave & Permission'],
    STD:["Director's Office",'Enquiry Register','Enquiries & Feedback','Notifications','Food & Diet','Duty Assignment','Patient Consumables','Stores','Housekeeping & General','Kitchen / Food Stores','Talk to Guest','WhatsApp Inbox','Feedback','My Leave & Permission']
  };
  Object.keys(ROLE_NAV).forEach(role=>{
    if(role!=='Kitchen'&&(ROLE_NAV[role].includes('Physiotherapy')||role==='Accounts')&&!ROLE_NAV[role].includes('Physiotherapy Dashboard'))ROLE_NAV[role].push('Physiotherapy Dashboard');
    if(role!=='Admin')ROLE_NAV[role]=ROLE_NAV[role].filter(page=>page!=='Physiotherapist Accounts');
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
    if(profile?.__kitchen?.read&&!profile.__kitchenNavResolved)return [...new Set([...allowedPagesForProfile({...profile,__kitchenNavResolved:true}),'Kitchen / Food Stores'])];
    if(profile?.__foodVendor?.read&&!profile.__foodNavResolved)return [...new Set([...allowedPagesForProfile({...profile,__foodNavResolved:true}),'Food & Diet','Notifications','WhatsApp Inbox'])]; // 2.15.94: Food Management in-charge gets the food-vendor WhatsApp inbox
    if(profile?.__dutyContext?.additional_duties?.length&&!profile.__additionalNavResolved){const c=profile.__dutyContext;const base=allowedPagesForProfile({...profile,__additionalNavResolved:true});const extras=(c.additional_duties||[]).flatMap(d=>allowedPagesForProfile({...profile,__additionalNavResolved:true,role:d.covering_role,designation:d.covering_designation,department:d.covering_role==='Manager'?'Nursing':profile.department}));return [...new Set([...base,...extras])];}
    if(profile?.__dutyContext?.leave_cover&&!profile.__leaveNavResolved){const c=profile.__dutyContext;return [...new Set([...allowedPagesForProfile({...profile,__leaveNavResolved:true}),...allowedPagesForProfile({...profile,__leaveNavResolved:true,role:c.regular_role,designation:c.regular_designation,department:c.regular_department}),...allowedPagesForProfile({...profile,__leaveNavResolved:true,role:c.leave_cover.covering_role,designation:c.leave_cover.covering_designation})])];}
    if(profile?.__paymentsTrial&&!profile.__paymentsNavResolved){const a=profile.__paymentsTrial;return [...allowedPagesForProfile({...profile,__paymentsNavResolved:true}).filter(x=>!['Payments & Vouchers','Payment Requests','Approved—Ready to Pay','Payment Vouchers','Payment Statements'].includes(x)),...(a.full?['Payments & Vouchers']:[]),'Payment Requests',...(a.pay?['Approved—Ready to Pay']:[]),'Payment Vouchers','Payment Statements'];}
    if(isNursingManagerProfile(profile))return [
      'Outside Nursing Dashboard','Outside Samara Nursing Procedures','Admission Register','Physiotherapy','Physiotherapy Dashboard',
      'Clinical Dashboard','Nursing Notes','Talk to Guest','Notifications','Rooms','Care Packages','Employees','Staff Leave Calendar','My Leave & Permission',
      'Enquiry Register','Spot Assessment','Admissions','Patients','Discharge','Documents','My To-Do List','Clinical Alerts','Approval Requests','Charge Approvals','Charge Register', // 2.17.6: Bills & Charges (raise outside bills)
      'Duty Assignment','Duty Calendar','Staff Duty Assignment','Clinical Escalations','Reports','Intelligent Reports','Medication Errors','Recovery Timeline',
      'Patient Consumables','Stores','Receive from Vendor','Stock Report','Stores In-charge Assignment','Consumables','Pharmacy','Housekeeping & General','Kitchen / Food Stores','Petty Cash','Biomedical Equipment','Oxygen Cylinders','Temporary Duty Swap','Leave Cover','Additional Duty Assignment','Staff Leave Calendar','Food & Diet','WhatsApp Inbox','My Profile'
    ];
    const pages=[...(ROLE_NAV[profile?.role]||['Dashboard'])];
    if(!pages.includes('Spot Assessment'))pages.push('Spot Assessment');
    if(isAdmissionDelegateProfile(profile)&&!pages.includes('Admissions'))pages.push('Admissions');
    if(profile?.role==='Manager'&&employeeDepartment(profile)&&!pages.includes('Employees'))pages.push('Employees');
    if(isNursingManagerProfile(profile)){ if(!pages.includes('My To-Do List'))pages.push('My To-Do List'); if(!pages.includes('Patient Consumables'))pages.push('Patient Consumables'); if(!pages.includes('Stores'))pages.push('Stores'); if(!pages.includes('Consumables'))pages.push('Consumables'); if(!pages.includes('Pharmacy'))pages.push('Pharmacy'); STORE_SECTIONS.forEach(x=>{if(!pages.includes(x.page))pages.push(x.page)}); ['Biomedical Equipment','Oxygen Cylinders'].forEach(x=>{if(!pages.includes(x))pages.push(x)}); if(!pages.includes('Stores In-charge Assignment'))pages.push('Stores In-charge Assignment'); if(!pages.includes('Employees'))pages.push('Employees'); }
    if(pages.includes('Admissions')&&!pages.includes('Admission Register'))pages.push('Admission Register'); // 2.15.1
    if(pages.includes('Stores')&&!pages.includes('Receive from Vendor'))pages.push('Receive from Vendor'); // 2.18.6: new stock entries (bill scan) straight from the menu
    if(pages.includes('Stores')&&!pages.includes('Stock Report'))pages.push('Stock Report'); // 2.18.46: stock download (Simple / Detailed) straight from the menu
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
    'Accounts Statement':'Statement',
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
    'Received Indents / Used Balance':'Received Indents / Used Balance',
    'Intake / Output':'Intake / Output Chart'
  };
  const displayNavLabel=(item,role)=>{
    if(item==='Admissions')return 'New Admission';
    if(['Physiotherapy','Physiotherapist Accounts'].includes(item))return 'Physiotherapy Dashboard';
    if(String(item).startsWith(CM_PAGE_PREFIX))return String(item).slice(CM_PAGE_PREFIX.length);
    // v2.14.66: the Nursing Manager (store keeper) sees every patient indent here.
    if(item==='Patient Consumables'&&role==='Manager')return 'Indent Register';
    if(item==='Duty Assignment'&&(CLINICAL_ROLES.includes(role)||role==='Manager'))return 'My Duty';
    return CLINICAL_ROLES.includes(role)?(ROLE_LABELS[item]||item):(ACCOUNTS_NAV_LABELS[item]||item);
  };
  const sectionsFor = (allowed,role,canManageDuties=role==='Admin') => {
    const sections=tidyAccountsSection(sectionsForRaw(allowed,role,canManageDuties));
    const outside=['Outside Nursing Dashboard','Outside Samara Nursing Procedures'].filter(x=>allowed.includes(x));
    sections.forEach(section=>{section.items=section.items.filter(x=>!outside.includes(x));});
    if(outside.length)sections.splice(Math.min(1,sections.length),0,{title:'OUTSIDE NURSING',items:outside});
    const physio=allowed.includes('Physiotherapy Dashboard');
    sections.forEach(section=>{section.items=section.items.filter(x=>!['Physiotherapy','Physiotherapist Accounts','Physiotherapy Dashboard'].includes(x));});
    if(physio)sections.splice(Math.min(2,sections.length),0,{title:'PHYSIOTHERAPY',items:['Physiotherapy Dashboard']});
    // Keep daily work first for each role; specialist modules follow the core workflow.
    const generalOrder=['OVERVIEW','ADMISSION','PATIENTS','NURSING','NURSING WORKSPACE','NURSING OVERVIEW','FOOD & DIET','PHYSIOTHERAPY','PHARMACY & STORES','OUTSIDE NURSING','ACCOUNTS / BILLING','MANAGER',"DIRECTOR'S OFFICE",'DUTY ROSTER & LEAVE','NURSING STAFF','HR','ROOMS & PACKAGES','PETTY CASH','CLINICAL REVIEW','COMMUNICATION','CHARGE MASTER','ADMIN','MY ACCOUNT'];
    const roleFirst=role==='Accounts'?['OVERVIEW','ACCOUNTS / BILLING','PATIENTS','OUTSIDE NURSING','PHYSIOTHERAPY']:CLINICAL_ROLES.includes(role)?['NURSING WORKSPACE','ADMISSION','PHYSIOTHERAPY','PHARMACY & STORES','DUTY ROSTER & LEAVE','OUTSIDE NURSING']:role==='Manager'&&allowed.includes('My To-Do List')?['NURSING OVERVIEW','PATIENTS','ADMISSION','NURSING STAFF','DUTY ROSTER & LEAVE','PHYSIOTHERAPY','PHARMACY & STORES','FOOD & DIET','OUTSIDE NURSING']:role==='Manager'?['OVERVIEW','MANAGER','PATIENTS','NURSING','ADMISSION']:role==='Kitchen'?['OVERVIEW','FOOD & DIET','PHARMACY & STORES','PATIENTS']:role==='STD'?['OVERVIEW',"DIRECTOR'S OFFICE",'COMMUNICATION','PHARMACY & STORES','FOOD & DIET']:[];
    const order=[...new Set([...roleFirst,...generalOrder])],rank=title=>{const i=order.indexOf(title);return i<0?order.length:i};
    return sections.filter(section=>section.items.length).sort((a,b)=>rank(a.title)-rank(b.title));
  };
  const sectionsForRaw = (allowed,role,canManageDuties=role==='Admin') => {
    if(allowed.some(item=>['Temporary Duty Swap','Leave Cover','Additional Duty Assignment'].includes(item))){const dutyItems=allowed.filter(item=>['Temporary Duty Swap','Leave Cover','Additional Duty Assignment'].includes(item));const sections=sectionsFor(allowed.filter(item=>!dutyItems.includes(item)),role,canManageDuties);const title=canManageDuties?'ADMIN':'MY ACCOUNT';let section=sections.find(item=>item.title===title);if(!section){section={title,items:[]};sections.splice(canManageDuties?1:sections.length,0,section)}section.items.push(...dutyItems);return sections;}
    if(role!=='Admin'&&allowed.includes('Payment Requests')){const items=allowed.filter(x=>['Payments & Vouchers','Payment Requests','Approved—Ready to Pay','Payment Vouchers','Payment Statements'].includes(x));const sections=sectionsFor(allowed.filter(x=>!items.includes(x)),role,canManageDuties);const accounts=sections.find(s=>s.title==='ACCOUNTS / BILLING');if(accounts)accounts.items=[...items,...accounts.items];else sections.push({title:'ACCOUNTS / BILLING',items});return sections;}
    if(CLINICAL_ROLES.includes(role)){
      return [
        {title:'ADMISSION',items:['Spot Assessment','Admissions'].filter(item=>allowed.includes(item))},
        {title:'NURSING WORKSPACE',items:['Outside Nursing Dashboard','Outside Samara Nursing Procedures','Clinical Dashboard','Clinical Alerts','Talk to Guest','Patients','Rooms','Shift Tasks','Daily Care','Vital Signs','Intake / Output','Nursing Notes','Medicines','Approval Requests','Food & Diet','Physiotherapy','Special Nurse','Shift Handover','Incidents','Discharge','Charge Approvals','My To-Do List','Notifications'].filter(item=>allowed.includes(item))},
        {title:'DUTY ROSTER & LEAVE',items:['Duty Assignment','Staff Leave Calendar','My Leave & Permission','Leave Approvals'].filter(item=>allowed.includes(item))},
        {title:'PHARMACY & STORES',items:['Raise Indent','Received Indents / Used Balance','Oxygen Cylinders','Biomedical Equipment','Kitchen / Food Stores'].filter(item=>allowed.includes(item))},
        {title:'MY ACCOUNT',items:['My Profile'].filter(item=>allowed.includes(item))}
      ];
    }
    if(role==='Manager'&&allowed.includes('My To-Do List')&&allowed.includes('Employees')&&!allowed.includes('Accounts Dashboard')){
      return [
        {title:"DIRECTOR'S OFFICE",items:["Director's Office",'Enquiry Register','Enquiries & Feedback','Feedback'].filter(item=>allowed.includes(item))},
        {title:'NURSING OVERVIEW',items:['Clinical Dashboard','Talk to Guest','Notifications','Clinical Alerts','Clinical Escalations','Nursing Notes','Approval Requests','Charge Approvals','Charge Register','My To-Do List'].filter(item=>allowed.includes(item))},
        {title:'DUTY ROSTER & LEAVE',items:['Duty Assignment','My Leave & Permission'].filter(item=>allowed.includes(item))},
        {title:'NURSING STAFF',items:['Staff Duty Assignment','Duty Calendar','Staff Leave Calendar','Employees'].filter(item=>allowed.includes(item))},
        {title:'ADMISSION',items:['Spot Assessment','Admissions','Admission Register'].filter(item=>allowed.includes(item))},
        {title:'PATIENTS',items:['Patients','Discharge','Documents','Recovery Timeline','Intelligent Reports','Family Communication','Incidents','Medication Errors','Patient Ledger','Final Billing'].filter(item=>allowed.includes(item))},
        {title:'ROOMS & PACKAGES',items:['Rooms','Care Packages'].filter(item=>allowed.includes(item))},
        {title:'PHARMACY & STORES',items:['Receive from Vendor','Stock Report','Consumables','Pharmacy','Housekeeping & General','Kitchen / Food Stores','Biomedical Equipment','Oxygen Cylinders'].filter(item=>allowed.includes(item))},
        {title:'PETTY CASH',items:['Petty Cash'].filter(item=>allowed.includes(item))}, // 2.16.20: Nursing Manager's own petty cash book
        {title:'FOOD & DIET',items:['Food & Diet'].filter(item=>allowed.includes(item))},
        {title:'COMMUNICATION',items:['WhatsApp Inbox'].filter(item=>allowed.includes(item))},
        {title:'CLINICAL REVIEW',items:['Reports'].filter(item=>allowed.includes(item))},
        {title:'MY ACCOUNT',items:['My Profile'].filter(item=>allowed.includes(item))}
      ].filter(section=>section.items.length);
    }
    return NAV_SECTIONS.map(section=>({...section,items:section.items.filter(item=>allowed.includes(item)&&(role==='Admin'||!String(item).startsWith('Charge Master')))})).filter(section=>section.items.length);
  };
