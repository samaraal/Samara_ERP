  function ensureEmploymentActionLayoutStyle(){
    if(document.getElementById('samara-employment-action-layout'))return;
    const style=document.createElement('style');
    style.id='samara-employment-action-layout';
    style.textContent=`
      .employment-action-backdrop{padding:24px!important;align-items:center!important;}
      .employment-action-modal{
        width:min(920px,calc(100vw - 48px))!important;
        max-width:920px!important;
        max-height:calc(100vh - 48px)!important;
        overflow:auto!important;
        border-radius:22px!important;
        padding:0!important;
      }
      .employment-action-modal .panel-head{
        position:sticky!important;top:0!important;z-index:3!important;
        background:#fffafd!important;padding:20px 22px 14px!important;
        border-bottom:1px solid #efd7e1!important;
      }
      .employment-action-grid{
        display:grid!important;
        grid-template-columns:repeat(2,minmax(0,1fr))!important;
        gap:16px 20px!important;
        padding:20px 22px!important;
      }
      .employment-action-grid>label{
        display:flex!important;flex-direction:column!important;gap:7px!important;
        min-width:0!important;font-weight:700!important;color:#432b3a!important;
      }
      .employment-action-grid input,
      .employment-action-grid select,
      .employment-action-grid textarea{
        width:100%!important;min-width:0!important;box-sizing:border-box!important;
        min-height:44px!important;padding:10px 12px!important;
        border:1px solid #cfded9!important;border-radius:11px!important;
        font:inherit!important;background:#fff!important;
      }
      .employment-action-grid textarea{min-height:88px!important;resize:vertical!important;}
      .employment-action-actions{
        position:sticky!important;bottom:0!important;z-index:3!important;
        display:flex!important;justify-content:flex-end!important;gap:10px!important;
        padding:14px 22px 18px!important;background:#fffafd!important;
        border-top:1px solid #efd7e1!important;
      }
      .employment-action-actions .btn{min-height:44px!important;padding:10px 18px!important;}
      @media(max-width:700px){
        .employment-action-backdrop{padding:0!important;align-items:stretch!important;}
        .employment-action-modal{
          width:100%!important;max-width:none!important;height:100dvh!important;
          max-height:100dvh!important;border-radius:0!important;
        }
        .employment-action-grid{
          grid-template-columns:1fr!important;gap:14px!important;padding:16px!important;
        }
        .employment-action-modal .panel-head{padding:16px!important;}
        .employment-action-actions{
          padding:12px 16px calc(12px + env(safe-area-inset-bottom))!important;
        }
        .employment-action-actions .btn{flex:1 1 0!important;}
      }
    `;
    document.head.appendChild(style);
  }
  ensureEmploymentActionLayoutStyle();

  function ensureEmploymentSalaryHistoryStyle(){
    if(document.getElementById('samara-employment-salary-history-style'))return;
    const style=document.createElement('style');
    style.id='samara-employment-salary-history-style';
    style.textContent=`
      .employment-salary-history-section{
        margin-top:14px!important;
        margin-bottom:14px!important;
        padding:16px!important;
        border-radius:16px!important;
      }
      .employment-salary-history-section .employee-info-grid{
        margin-top:14px!important;
      }
      @media(max-width:700px){
        .employment-salary-history-section{
          padding:14px!important;
        }
        .employment-salary-history-section .btn{
          width:100%!important;
          margin-top:8px!important;
        }
      }
    `;
    document.head.appendChild(style);
  }
  ensureEmploymentSalaryHistoryStyle();

  function Employees({profile,onNavigate}){
    const fullHRAccess=profile?.role==='Admin';
    const departmentViewOnly=!fullHRAccess&&(profile?.role==='Manager'||isNursingManagerProfile(profile));
    const permittedDepartment=departmentViewOnly?(employeeDepartment(profile)||'Nursing'):'';
    const [rows,setRows]=React.useState([]),[authMap,setAuthMap]=React.useState({}),[show,setShow]=React.useState(false),[busy,setBusy]=React.useState(false),[msg,setMsg]=React.useState('');
    const [resetTarget,setResetTarget]=React.useState(null),[newPassword,setNewPassword]=React.useState(''),[confirmPassword,setConfirmPassword]=React.useState(''),[resetBusy,setResetBusy]=React.useState(false),[resetMsg,setResetMsg]=React.useState('');
    const [repairTarget,setRepairTarget]=React.useState(null),[repairPassword,setRepairPassword]=React.useState(''),[repairBusy,setRepairBusy]=React.useState(false),[repairMsg,setRepairMsg]=React.useState('');
    const [detailsTarget,setDetailsTarget]=React.useState(null),[detailsForm,setDetailsForm]=React.useState(null),[detailsDocs,setDetailsDocs]=React.useState([]),[detailsBusy,setDetailsBusy]=React.useState(false),[detailsMsg,setDetailsMsg]=React.useState('');
    const [detailsEditing,setDetailsEditing]=React.useState(false);
    const [employeeSearch,setEmployeeSearch]=React.useState('');
    const [nursingDashboardFilter,setNursingDashboardFilter]=React.useState('all');
    const [employmentActions,setEmploymentActions]=React.useState([]);
    const [showEmploymentAction,setShowEmploymentAction]=React.useState(false);
    const employmentBlank=()=>({action_type:'Promotion',effective_date:'',new_department:'',new_designation:'',new_reporting_superior:'',new_erp_role:'',new_salary:'',salary_frequency:'Monthly',increment_amount:'',increment_percent:'',order_reference:'',remarks:''});
    const [employmentAction,setEmploymentAction]=React.useState(employmentBlank());
    const [employmentSaving,setEmploymentSaving]=React.useState(false);
    const [employeeDepartmentFilter,setEmployeeDepartmentFilter]=React.useState(()=>{
      try{
        const requested=sessionStorage.getItem('samara-employee-list-filter');
        sessionStorage.removeItem('samara-employee-list-filter');
        if(departmentViewOnly)return permittedDepartment;
        if(requested==='__ALL__')return '__ALL__';
        const intent=readDashboardIntent('Employees');
        if(intent?.focus==='Nursing')return 'Nursing';
        if(intent?.focus==='Caregiving')return 'Caregiving';
        return '';
      }catch(_error){return ''}
    });
    const [idFiles,setIdFiles]=React.useState([]),[qualificationFiles,setQualificationFiles]=React.useState([]),[experienceFiles,setExperienceFiles]=React.useState([]),[otherFiles,setOtherFiles]=React.useState([]),[cameraFiles,setCameraFiles]=React.useState([]),[photoFiles,setPhotoFiles]=React.useState([]),[photoPreview,setPhotoPreview]=React.useState(''),[welcomeEmployee,setWelcomeEmployee]=React.useState(null);
    const [welcomeBusy,setWelcomeBusy]=React.useState(''),[welcomeSentNumbers,setWelcomeSentNumbers]=React.useState(new Set());
    const [cameraConfig,setCameraConfig]=React.useState(null);
    const [employeeToast,setEmployeeToast]=React.useState(null);
    const employeeToastTimer=React.useRef(null);
    function showEmployeeToast(type,text){
      clearTimeout(employeeToastTimer.current);
      setEmployeeToast({type,text});
      employeeToastTimer.current=setTimeout(()=>setEmployeeToast(null),4500);
    }
    React.useEffect(()=>()=>clearTimeout(employeeToastTimer.current),[]);

    function updatePhotoSelection(files){
      const next=Array.from(files||[]).slice(0,1);
      setPhotoFiles(next);
      setPhotoPreview(current=>{
        if(current&&current.startsWith('blob:')) URL.revokeObjectURL(current);
        return next[0]?URL.createObjectURL(next[0]):'';
      });
    }

    React.useEffect(()=>()=>{
      if(photoPreview&&photoPreview.startsWith('blob:')) URL.revokeObjectURL(photoPreview);
    },[photoPreview]);
    const empty={
      title:'',full_name:'',employee_id:'',department:'Caregiving',designation:'Caregiver',reporting_superior_id:'',
      mobile:'',emergency_contact:'',role:'Caregiver',login_id:'',employee_email:'',password:'',
      father_guardian_name:'',address:'',date_of_birth:'',date_of_joining:'',blood_group:'',
      id_card_type:'Aadhaar',id_card_number:'',qualification:'',previous_workplace:'',
      reference_type:'Direct',reference_name:'',reference_contact:'',current_salary:'',salary_frequency:'Monthly',
      current_address:'',current_state:'Tamil Nadu',current_district:'',current_taluk:'',
      current_village_town:'',current_locality_area:'',current_street_name:'',current_house_no:'',
      current_apartment_name:'',current_flat_no:'',current_landmark:'',current_pincode:'',
      permanent_same_as_current:false,
      permanent_address:'',permanent_state:'Tamil Nadu',permanent_district:'',permanent_taluk:'',
      permanent_village_town:'',permanent_locality_area:'',permanent_street_name:'',permanent_house_no:'',
      permanent_apartment_name:'',permanent_flat_no:'',permanent_landmark:'',permanent_pincode:''
    };
    const [form,setForm]=React.useState(empty);
    const [sourceCareerId,setSourceCareerId]=React.useState('');
    React.useEffect(()=>{
      try{
        const raw=localStorage.getItem('samara_hr_employee_seed');
        if(!raw)return;
        const seed=JSON.parse(raw);
        if(!seed?.full_name)return;
        if(!fullHRAccess)return;
        setForm(current=>({...current,...seed,password:'',login_id:''}));
        setSourceCareerId(seed.career_application_id||'');
        setShow(true);
        setMsg('Online career application loaded into Employee Master. Applicant-entered fields are prefilled. HR only needs to verify them and complete Employee ID, Date of Joining, ERP Access Scope, Login ID and Temporary Password.');
        localStorage.removeItem('samara_hr_employee_seed');
      }catch(error){console.warn('Unable to load career applicant into Employee Master',error)}
    },[]);

    async function adminRequest(payload){
      const {data:{session}}=await client.auth.getSession();
      if(!session)throw new Error('Your session has expired. Please sign in again.');
      const response=await fetch(`${cfg.supabaseUrl}/functions/v1/admin-users`,{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${session.access_token}`,'apikey':cfg.supabasePublishableKey},
        body:JSON.stringify(payload)
      });
      const result=await response.json().catch(()=>({error:'Unable to read server response'}));
      if(!response.ok)throw new Error(result.error||'Unable to complete the request');
      return result;
    }

    async function load(){
      const profileQuery=client.from('profiles').select('*').order('created_at',{ascending:false});
      if(departmentViewOnly)profileQuery.eq('department',permittedDepartment);
      const [{data,error},{data:welcomeLogs}]=await Promise.all([
        profileQuery,
        fullHRAccess?client.from('hr_whatsapp_communications').select('recipient_number').eq('template_name','employee_welcome_samara').order('created_at',{ascending:false}).limit(1000):Promise.resolve({data:[]})
      ]);
      if(error){setMsg(error.message||'Unable to load employees');return}
      setRows(data||[]);
      setWelcomeSentNumbers(new Set((welcomeLogs||[]).map(row=>normalizeWhatsAppRecipient(row.recipient_number||'')).filter(Boolean)));
      if(!fullHRAccess){setAuthMap({});return}
      try{
        const result=await adminRequest({action:'auth_status'});
        const map={};(result.users||[]).forEach(u=>{map[u.id]=u});setAuthMap(map);
      }catch(error){console.error(error);setMsg(error.message||'Unable to load Authentication Status')}
    }
    React.useEffect(()=>{load();const ch=client.channel('profiles-live').on('postgres_changes',{event:'*',schema:'public',table:'profiles'},load).subscribe();return()=>client.removeChannel(ch)},[]);

    async function persistEmployeePhotoPath(profileOrAuthId,path){
      if(!profileOrAuthId||!path)return null;
      const payload={photo_storage_path:path,employee_photo_path:path,updated_at:new Date().toISOString()};
      let result=await client.from('profiles').update(payload).or(`id.eq.${profileOrAuthId},auth_user_id.eq.${profileOrAuthId}`).select('*');
      if(result.error){
        // Some earlier schemas do not contain updated_at or employee_photo_path.
        const fallback={photo_storage_path:path};
        result=await client.from('profiles').update(fallback).or(`id.eq.${profileOrAuthId},auth_user_id.eq.${profileOrAuthId}`).select('*');
      }
      if(result.error)throw new Error(`Employee photo could not be linked to the profile: ${result.error.message}`);
      if(!result.data?.length)throw new Error('Employee photo was uploaded, but no matching employee profile could be updated.');
      return result.data[0];
    }

    async function resolveEmployeePhoto(rowOrId,expiresIn=900){
      const seed=typeof rowOrId==='object'&&rowOrId?rowOrId:{id:rowOrId};
      const profileId=seed.id||seed.auth_user_id;
      if(!profileId)return {path:'',url:'',profile:seed};

      let current=seed;
      const {data:freshProfile}=await client.from('profiles').select('*').or(`id.eq.${profileId},auth_user_id.eq.${profileId}`).maybeSingle();
      if(freshProfile)current=freshProfile;

      let path=current.photo_storage_path||current.employee_photo_path||'';
      const candidateIds=[current.id,current.auth_user_id,seed.id,seed.auth_user_id].filter(Boolean);

      if(!path&&candidateIds.length){
        const uniqueIds=[...new Set(candidateIds)];
        const {data:docs,error:docsError}=await client.from('employee_documents')
          .select('*')
          .or(`employee_id.in.(${uniqueIds.join(',')}),profile_id.in.(${uniqueIds.join(',')})`)
          .order('created_at',{ascending:false});
        if(docsError)console.error('Unable to resolve employee photo document:',docsError);
        const photoDoc=(docs||[]).find(doc=>{
          const type=String(doc.document_type||doc.category||doc.document_name||'').trim().toLowerCase();
          return type==='employee photo'||type==='employee photograph'||type.includes('employee photo');
        });
        path=photoDoc?.storage_path||photoDoc?.file_path||'';

        if(path){
          try{
            const repaired=await persistEmployeePhotoPath(current.id||profileId,path);
            current=repaired||{...current,photo_storage_path:path,employee_photo_path:path};
          }catch(error){
            console.warn(error);
            current={...current,photo_storage_path:path,employee_photo_path:path};
          }
        }
      }

      if(!path)return {path:'',url:'',profile:current};
      const {data,error}=await client.storage.from('employee-documents').createSignedUrl(path,expiresIn);
      if(error||!data?.signedUrl){
        console.error('Unable to create employee photo URL:',error);
        return {path,url:'',profile:current};
      }
      const joiner=data.signedUrl.includes('?')?'&':'?';
      return {path,url:`${data.signedUrl}${joiner}t=${Date.now()}`,profile:{...current,photo_storage_path:path,employee_photo_path:path}};
    }

    async function uploadEmployeeFiles(userId,groups){
      for(const group of groups){
        for(const file of group.files||[]){
          const safe=String(file.name||'document').replace(/[^a-zA-Z0-9._-]/g,'_');
          const path=`${userId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}-${safe}`;
          const {error:uploadError}=await client.storage.from('employee-documents').upload(path,file,{upsert:false,contentType:file.type||undefined});
          if(uploadError)throw new Error(`Unable to upload ${file.name}: ${uploadError.message}`);
          const {error:docError}=await client.from('employee_documents').insert({employee_id:userId,profile_id:userId,category:group.type||'Other Certificate',document_type:group.type||'Other Certificate',document_name:file.name||group.type||'Employee Document',file_name:file.name,storage_path:path,file_path:path,mime_type:file.type||null,file_size:file.size||null,uploaded_by:profile.id});
          if(docError)throw new Error(`Document record could not be saved: ${docError.message}`);
        }
      }
    }

    async function pruneEmployeePhotos(profileId,keepCount=3){
      if(!profileId)return;
      const {data:photos,error}=await client.from('employee_documents')
        .select('id,storage_path,file_path,created_at,document_type,category')
        .or(`employee_id.eq.${profileId},profile_id.eq.${profileId}`)
        .order('created_at',{ascending:false});
      if(error){console.warn('Unable to check old employee photos:',error);return}
      const employeePhotos=(photos||[]).filter(doc=>{
        const type=String(doc.document_type||doc.category||'').trim().toLowerCase();
        return type==='employee photo'||type==='employee photograph';
      });
      const oldPhotos=employeePhotos.slice(keepCount);
      if(!oldPhotos.length)return;

      const paths=[...new Set(oldPhotos.map(doc=>doc.storage_path||doc.file_path).filter(Boolean))];
      if(paths.length){
        const {error:storageError}=await client.storage.from('employee-documents').remove(paths);
        if(storageError){
          console.warn('Unable to delete one or more old employee photo files:',storageError);
          return; // Keep database rows when the matching Storage cleanup fails.
        }
      }
      const ids=oldPhotos.map(doc=>doc.id).filter(Boolean);
      if(ids.length){
        const {error:deleteError}=await client.from('employee_documents').delete().in('id',ids);
        if(deleteError)console.warn('Unable to delete old employee photo records:',deleteError);
      }
    }

    async function uploadEmployeePhoto(userId,files){
      const file=(files||[])[0];
      if(!file)return null;
      const safe=String(file.name||'employee-photo.jpg').replace(/[^a-zA-Z0-9._-]/g,'_');
      const path=`${userId}/profile-${Date.now()}-${safe}`;
      const {error:uploadError}=await client.storage.from('employee-documents').upload(path,file,{upsert:false,contentType:file.type||'image/jpeg'});
      if(uploadError)throw new Error(`Unable to upload employee photo: ${uploadError.message}`);

      const linkedProfile=await persistEmployeePhotoPath(userId,path);
      const profileId=linkedProfile?.id||userId;
      const photoRecord={
        employee_id:profileId,
        profile_id:profileId,
        category:'Employee Photo',
        document_type:'Employee Photo',
        document_name:'Employee Photo',
        file_name:file.name||'Employee Photo',
        storage_path:path,
        file_path:path,
        mime_type:file.type||'image/jpeg',
        file_size:file.size||null,
        uploaded_by:profile.id,
        created_at:new Date().toISOString(),
        updated_at:new Date().toISOString()
      };
      const {error:docError}=await client.from('employee_documents').insert(photoRecord);
      if(docError){
        await client.storage.from('employee-documents').remove([path]);
        throw new Error(`Employee photo record could not be saved: ${docError.message}`);
      }

      // Retain only the newest three Employee Photo records/files. Other document types are untouched.
      await pruneEmployeePhotos(profileId,3);

      const resolved=await resolveEmployeePhoto(linkedProfile||{...detailsTarget,id:profileId,photo_storage_path:path},900);
      if(resolved.url)setPhotoPreview(resolved.url);
      setRows(current=>current.map(row=>row.id===profileId?{...row,photo_storage_path:path,employee_photo_path:path}:row));
      if(detailsTarget?.id===profileId)setDetailsTarget(current=>current?{...current,photo_storage_path:path,employee_photo_path:path}:current);
      return path;
    }

    async function create(e){
      e.preventDefault();setBusy(true);setMsg('');setWelcomeEmployee(null);
      try{
        let employeeForm={...form};
        employeeForm.current_address=composeEmployeeAddress(employeeForm,'current');
        employeeForm.permanent_address=employeeForm.permanent_same_as_current
          ?employeeForm.current_address
          :composeEmployeeAddress(employeeForm,'permanent');
        employeeForm.address=employeeForm.current_address||employeeForm.address||'';

        if(!String(employeeForm.employee_id||'').trim()){
          const {data:generatedId,error:idError}=await client.rpc('next_employee_code');
          if(idError)throw idError;
          employeeForm.employee_id=generatedId;
        }
        const accountForm={...employeeForm};
        [
          'current_address','current_state','current_district','current_taluk','current_village_town',
          'current_locality_area','current_street_name','current_house_no','current_apartment_name',
          'current_flat_no','current_landmark','current_pincode','permanent_same_as_current',
          'permanent_address','permanent_state','permanent_district','permanent_taluk',
          'permanent_village_town','permanent_locality_area','permanent_street_name',
          'permanent_house_no','permanent_apartment_name','permanent_flat_no','permanent_landmark',
          'permanent_pincode'
        ].forEach(key=>delete accountForm[key]);
        const result=await adminRequest({action:'create_or_repair',...accountForm});
        // Enforce and verify the selected role through the protected server function.
        const roleResult=await adminRequest({action:'set_role',user_id:result.user_id,role:employeeForm.role});
        if(roleResult.role!==employeeForm.role)throw new Error(`Selected role ${employeeForm.role} was not saved correctly.`);
        const employeeProfileUpdate={
          department:employeeForm.department||null,
          designation:employeeForm.designation||null,
          address:employeeForm.current_address||employeeForm.address||null,
          current_address:employeeForm.current_address||null,
          current_state:employeeForm.current_state||'Tamil Nadu',
          current_district:employeeForm.current_district||null,
          current_taluk:employeeForm.current_taluk||null,
          current_village_town:employeeForm.current_village_town||null,
          current_locality_area:employeeForm.current_locality_area||null,
          current_street_name:employeeForm.current_street_name||null,
          current_house_no:employeeForm.current_house_no||null,
          current_apartment_name:employeeForm.current_apartment_name||null,
          current_flat_no:employeeForm.current_flat_no||null,
          current_landmark:employeeForm.current_landmark||null,
          current_pincode:employeeForm.current_pincode||null,
          permanent_same_as_current:!!employeeForm.permanent_same_as_current,
          permanent_address:employeeForm.permanent_address||null,
          permanent_state:employeeForm.permanent_state||'Tamil Nadu',
          permanent_district:employeeForm.permanent_district||null,
          permanent_taluk:employeeForm.permanent_taluk||null,
          permanent_village_town:employeeForm.permanent_village_town||null,
          permanent_locality_area:employeeForm.permanent_locality_area||null,
          permanent_street_name:employeeForm.permanent_street_name||null,
          permanent_house_no:employeeForm.permanent_house_no||null,
          permanent_apartment_name:employeeForm.permanent_apartment_name||null,
          permanent_flat_no:employeeForm.permanent_flat_no||null,
          permanent_landmark:employeeForm.permanent_landmark||null,
          permanent_pincode:employeeForm.permanent_pincode||null,
          current_salary:employeeForm.current_salary===''||employeeForm.current_salary==null?null:Number(employeeForm.current_salary),
          salary_frequency:employeeForm.salary_frequency||'Monthly',
          updated_at:new Date().toISOString()
        };
        const {error:departmentError}=await client.from('profiles')
          .update(employeeProfileUpdate)
          .or(`id.eq.${result.user_id},auth_user_id.eq.${result.user_id}`);
        if(departmentError)throw departmentError;
        await uploadEmployeePhoto(result.user_id,photoFiles);
        await uploadEmployeeFiles(result.user_id,[
          {type:'ID Card',files:idFiles},{type:'Qualification Certificate',files:qualificationFiles},{type:'Experience Certificate',files:experienceFiles},{type:'Other Certificate',files:otherFiles},{type:'Camera Capture',files:cameraFiles}
        ]);
        const createdRow={...employeeForm,id:result.user_id};
        setWelcomeEmployee(createdRow);
        await load();
        const successText=result.repaired?'Employee account repaired successfully.':'New employee added successfully.';
        setMsg(successText);showEmployeeToast('success',successText);
        if(sourceCareerId){
          const {error:conversionError}=await client.from('career_applications').update({status:'Converted to Employee',linked_employee_id:result.user_id,handled_by:profile.id,updated_at:new Date().toISOString()}).eq('id',sourceCareerId);
          if(conversionError)throw conversionError;
          setSourceCareerId('');
          await sendEmployeeWelcomeApi(createdRow);
        }
        setForm(empty);setIdFiles([]);setQualificationFiles([]);setExperienceFiles([]);setOtherFiles([]);setCameraFiles([]);setPhotoFiles([]);setPhotoPreview('');
      }catch(error){
        const errorText=error.message||'Unable to create employee';
        setMsg(errorText);showEmployeeToast('error',errorText);
      }
      setBusy(false);
    }

    async function toggle(row){try{await adminRequest({action:'toggle',user_id:row.id,is_active:!(row.is_active??row.active)});await load()}catch(error){alert(error.message||'Unable to update employee')}}
    function employeeWelcomeSent(row){
      const number=normalizeWhatsAppRecipient(row?.mobile||'');
      return Boolean(number&&welcomeSentNumbers.has(number));
    }
    async function sendEmployeeWelcomeApi(row,{resend=false}={}){
      const number=normalizeWhatsAppRecipient(row?.mobile||'');
      if(welcomeBusy)return;
      if(!number){setMsg('Employee saved. Enter a valid mobile number before sending the welcome.');return;}
      const busyKey=String(row?.id||number);
      const employeeName=formalName(row)||row?.full_name||'Colleague';
      const designation=String(row?.designation||'').trim()||String(row?.department||'').trim()||'Team Member';
      const loginId=String(row?.login_id||'').trim()||'To be provided by HR';
      setWelcomeBusy(busyKey);
      try{
        const result=await sendEmployeeWelcomeRecorded({
          to:number,
          templateName:'employee_welcome_samara',
          languageCode:'en',
          bodyParams:[employeeName,designation],
          headerImage:SAMARA_WHATSAPP_LOGO_URL,
          communicationLog:{
            communication_type:`Employee Welcome${resend?' · Resent':''}`,
            message_content:`Dear ${employeeName},\n\nWelcome to the Samara Family! 🌿\n\nWe are delighted to have you with us. At Samara, every resident deserves dignity, compassion and respect. From today, you become an important part of that mission.\n\nAs a ${designation}, your commitment and service will make a meaningful difference in the lives of our residents.\n\nYour employee profile has been created in Samara Care ERP.\n\nPlease open Samara Care ERP using the button below and complete your first-time registration by creating your Username and Password.\n\nWe wish you a successful, fulfilling and rewarding journey with us. All the very best!\n\nSamara Health Care LLP\nCaring with Compassion. Living with Dignity.`,
            contact_name:employeeName,
            source_type:'HR · Employee Welcome',
            sent_by:profile?.id||null,
            sent_by_name:formalName(profile)||'Samara HR',
            message_payload:{employee_id:row?.id||null,employee_code:row?.employee_id||null,designation,login_id:loginId,resend:Boolean(resend)}
          }
        });
        setWelcomeSentNumbers(current=>new Set([...current,number]));
        const text=result?.history_logged===true?'Employee welcome WhatsApp accepted by Meta and recorded in WhatsApp Inbox.':`Employee welcome accepted by Meta, but Inbox logging failed: ${result.history_error||'unknown error'}. Use Resend Welcome to retry saving this accepted message; it will not send again while recovery is pending in this browser.`;
        setMsg(text);showEmployeeToast('success',text);
      }catch(error){
        const text=`Employee welcome WhatsApp API failed: ${error.message||error}`;
        setMsg(text);showEmployeeToast('error',text);
      }finally{setWelcomeBusy('')}
    }
    function openReset(row){setResetTarget(row);setNewPassword('');setConfirmPassword('');setResetMsg('')}
    function generateTemporaryPassword(){
      const upper='ABCDEFGHJKLMNPQRSTUVWXYZ',lower='abcdefghijkmnopqrstuvwxyz',digits='23456789',symbols='@#$%';
      const pick=set=>set[Math.floor(Math.random()*set.length)];
      let value=pick(upper)+pick(lower)+pick(lower)+pick(digits)+pick(digits)+pick(symbols)+pick(upper)+pick(lower)+pick(digits)+pick(lower);
      value=value.split('').sort(()=>Math.random()-.5).join('');setNewPassword(value);setConfirmPassword(value);setResetMsg('Temporary password generated. Copy it safely before completing the reset.');
    }
    async function resetPassword(e){
      e.preventDefault();setResetMsg('');
      if(newPassword.length<8){setResetMsg('Password must contain at least 8 characters.');return}
      if(newPassword!==confirmPassword){setResetMsg('The two passwords do not match.');return}
      setResetBusy(true);
      try{await adminRequest({action:'reset_password',user_id:resetTarget.id,password:newPassword});setResetMsg('Password reset successfully. The employee account has also been enabled.');await load();setTimeout(()=>setResetTarget(null),900)}catch(error){setResetMsg(error.message||'Unable to reset password')}
      setResetBusy(false);
    }
    function openRepair(row){setRepairTarget(row);setRepairPassword('');setRepairMsg('')}
    async function repairAccount(e){
      e.preventDefault();setRepairMsg('');
      if(repairPassword.length<8){setRepairMsg('Temporary password must contain at least 8 characters.');return}
      setRepairBusy(true);
      try{await adminRequest({action:'repair_account',profile_id:repairTarget.id,password:repairPassword});setRepairMsg('Authentication account repaired successfully. The employee can now sign in.');await load();setTimeout(()=>setRepairTarget(null),1000)}catch(error){setRepairMsg(error.message||'Unable to repair the account')}
      setRepairBusy(false);
    }

    async function loadEmploymentActions(employee){
      if(!employee?.id){setEmploymentActions([]);return;}
      const {data,error}=await client.from('employee_employment_history').select('*').eq('employee_profile_id',employee.id).order('effective_date',{ascending:false}).order('created_at',{ascending:false});
      if(error){console.warn('Employment history:',error.message);setEmploymentActions([]);return;}
      setEmploymentActions(data||[]);
    }
    function openEmploymentAction(){
      const r=detailsTarget;if(!r)return;
      setEmploymentAction({...employmentBlank(),new_department:r.department||'',new_designation:r.designation||'',new_reporting_superior:r.reporting_superior||'',new_erp_role:r.role||'',new_salary:r.current_salary||''});
      setShowEmploymentAction(true);
    }
    async function saveEmploymentAction(e){
      e.preventDefault();if(employmentSaving||!detailsTarget)return;
      if(!employmentAction.effective_date){showEmployeeToast('error','Effective Date is required.');return;}
      setEmploymentSaving(true);
      try{
        const a=employmentAction;
        const payload={action_type:a.action_type,effective_date:a.effective_date,new_department:a.new_department||null,new_designation:a.new_designation||null,new_reporting_superior:a.new_reporting_superior||null,new_erp_role:a.new_erp_role||null,new_salary:a.new_salary===''?null:Number(a.new_salary),salary_frequency:a.salary_frequency||'Monthly',increment_amount:a.increment_amount===''?null:Number(a.increment_amount),increment_percent:a.increment_percent===''?null:Number(a.increment_percent),order_reference:a.order_reference||null,remarks:a.remarks||null};
        const {error}=await client.rpc('record_employee_employment_action',{p_employee_id:detailsTarget.id,p_action:payload});if(error)throw error;
        const {data:fresh,error:freshError}=await client.from('profiles').select('*').eq('id',detailsTarget.id).maybeSingle();if(freshError)throw freshError;
        if(fresh){setDetailsTarget(fresh);setDetailsForm({...empty,...fresh,password:''});}
        await loadEmploymentActions(fresh||detailsTarget);setShowEmploymentAction(false);setEmploymentAction(employmentBlank());
        showEmployeeToast('success',`${payload.action_type} recorded successfully.`);await load();
      }catch(err){showEmployeeToast('error',err.message||'Unable to record employment action.');}
      finally{setEmploymentSaving(false);}
    }
    function employmentHistorySection(){
      if(!detailsTarget)return null;
      const r=detailsTarget;
      const money=v=>v==null||v===''?'—':`₹${Number(v).toLocaleString('en-IN')}`;
      const chronological=[...employmentActions].sort((a,b)=>String(a.effective_date||'').localeCompare(String(b.effective_date||'')));
      const opening=chronological.find(x=>x.action_type==='Opening Salary')||chronological.find(x=>x.new_salary!=null);
      const increments=chronological.filter(x=>['Annual Increment','Salary Revision','Promotion'].includes(x.action_type)&&x.new_salary!=null);
      const lastIncrement=increments.length?increments[increments.length-1]:null;
      let nextDue='—';
      if(lastIncrement?.effective_date){
        const d=new Date(`${lastIncrement.effective_date}T00:00:00`);
        if(!Number.isNaN(d.getTime())){d.setFullYear(d.getFullYear()+1);nextDue=formatDateIN(d);}
      }else if(r.date_of_joining){
        const d=new Date(`${r.date_of_joining}T00:00:00`);
        if(!Number.isNaN(d.getTime())){d.setFullYear(d.getFullYear()+1);nextDue=formatDateIN(d);}
      }
      return h('section',{className:'employee-info-section employment-salary-history-section',style:{border:'1px solid #e8c6d5',background:'#fffafd'}},
        h('div',{style:{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap'}},
          h('div',null,h('h4',{style:{marginBottom:4,color:'#7c1745'}},'Employment & Salary History'),h('div',{className:'muted'},'Starting salary, current salary, promotion, transfer and increments')),
	          fullHRAccess?h('button',{type:'button',className:'btn btn-primary',onClick:openEmploymentAction},'+ Employment Action'):h('span',{className:'badge'},'View only')),
        h('div',{className:'employee-info-grid',style:{marginTop:14}},
          personnelInfoItem('Starting Salary',opening?.new_salary!=null?`${money(opening.new_salary)} ${opening.salary_frequency||r.salary_frequency||'Monthly'}`:'Not set'),
          personnelInfoItem('Starting / Effective Date',opening?.effective_date?formatDateIN(opening.effective_date):(r.date_of_joining?formatDateIN(r.date_of_joining):'—')),
          personnelInfoItem('Current Salary',r.current_salary!=null?`${money(r.current_salary)} ${r.salary_frequency||'Monthly'}`:'Not set'),
          personnelInfoItem('Last Increment',lastIncrement?(lastIncrement.increment_amount!=null?money(lastIncrement.increment_amount):(lastIncrement.increment_percent!=null?`${lastIncrement.increment_percent}%`:money(lastIncrement.new_salary))):'—'),
          personnelInfoItem('Last Increment Date',lastIncrement?.effective_date?formatDateIN(lastIncrement.effective_date):'—'),
          personnelInfoItem('Next Increment Due',nextDue)
        ),
        h('div',{style:{marginTop:14,display:'grid',gap:10}},
          employmentActions.length?employmentActions.map(x=>h('div',{key:x.id,style:{border:'1px solid #ecd2df',borderRadius:12,padding:12}},
            h('div',{style:{display:'flex',justifyContent:'space-between',gap:8,flexWrap:'wrap'}},h('strong',null,x.action_type),h('span',{className:'muted'},x.effective_date?formatDateIN(x.effective_date):'—')),
            x.action_type==='Opening Salary'?h('div',{style:{marginTop:5}},`Starting Salary: ${money(x.new_salary)} ${x.salary_frequency||'Monthly'}`):h('div',{style:{marginTop:5}},`${x.previous_designation||'—'} → ${x.new_designation||'—'}`),
            x.action_type!=='Opening Salary'&&x.previous_department!==x.new_department?h('div',{className:'muted'},`${x.previous_department||'—'} → ${x.new_department||'—'}`):null,
            x.action_type!=='Opening Salary'&&x.new_salary!=null?h('div',{style:{marginTop:4}},`Salary: ${money(x.new_salary)} ${x.salary_frequency||'Monthly'}`):null,
            x.order_reference?h('div',{className:'muted'},`Ref: ${x.order_reference}`):null,
            x.remarks?h('div',{className:'muted'},x.remarks):null
          )):h('div',{className:'muted'},r.current_salary!=null?'Starting salary will appear in history after this update is saved.':'No salary or employment actions recorded yet.'))
      );
    }
    function employmentActionModal(){
      if(!showEmploymentAction||!detailsTarget)return null;
      return h('div',{className:'modal-backdrop employment-action-backdrop'},h('form',{className:'card modal employee-modal employment-action-modal',onSubmit:saveEmploymentAction},
        h('div',{className:'panel-head'},h('div',null,h('h3',null,'Employment Action'),h('small',null,formalName(detailsTarget))),h('button',{type:'button',className:'close',onClick:()=>setShowEmploymentAction(false)},'×')),
        h('div',{className:'modal-grid employment-action-grid'},
          h('label',null,'Action Type *',h('select',{value:employmentAction.action_type,onChange:e=>setEmploymentAction(v=>({...v,action_type:e.target.value}))},['Promotion','Transfer','Designation Change','Department Change','Reporting Change','Annual Increment','Salary Revision','Confirmation','Demotion','Suspension','Reinstatement'].map(v=>h('option',{key:v},v)))),
          h('label',null,'Effective Date *',h(StrictDateInput,{required:true,value:employmentAction.effective_date,onChange:e=>setEmploymentAction(v=>({...v,effective_date:e.target.value}))})),
          h('label',null,'New Department',h('input',{value:employmentAction.new_department,onChange:e=>setEmploymentAction(v=>({...v,new_department:e.target.value}))})),
          h('label',null,'New Designation',h('input',{value:employmentAction.new_designation,onChange:e=>setEmploymentAction(v=>({...v,new_designation:e.target.value}))})),
          h('label',null,'Reporting Superior',h('input',{value:employmentAction.new_reporting_superior,onChange:e=>setEmploymentAction(v=>({...v,new_reporting_superior:e.target.value}))})),
          h('label',null,'ERP Access Role',h('select',{value:employmentAction.new_erp_role,onChange:e=>setEmploymentAction(v=>({...v,new_erp_role:e.target.value}))},['','Admin','Manager','Nurse','Caregiver','Accounts','Kitchen','HR','STD'].map(v=>h('option',{key:v,value:v},v||'No change')))),
          h('label',null,'New Salary',h('input',{type:'number',min:'0',step:'0.01',value:employmentAction.new_salary,onChange:e=>setEmploymentAction(v=>({...v,new_salary:e.target.value}))})),
          h('label',null,'Salary Frequency',h('select',{value:employmentAction.salary_frequency,onChange:e=>setEmploymentAction(v=>({...v,salary_frequency:e.target.value}))},['Monthly','Daily','Hourly'].map(v=>h('option',{key:v},v)))),
          h('label',null,'Increment Amount',h('input',{type:'number',min:'0',step:'0.01',value:employmentAction.increment_amount,onChange:e=>setEmploymentAction(v=>({...v,increment_amount:e.target.value}))})),
          h('label',null,'Increment %',h('input',{type:'number',min:'0',step:'0.01',value:employmentAction.increment_percent,onChange:e=>setEmploymentAction(v=>({...v,increment_percent:e.target.value}))})),
          h('label',null,'Order / Reference No.',h('input',{value:employmentAction.order_reference,onChange:e=>setEmploymentAction(v=>({...v,order_reference:e.target.value}))})),
          h('label',null,'Remarks',h('textarea',{rows:3,value:employmentAction.remarks,onChange:e=>setEmploymentAction(v=>({...v,remarks:e.target.value}))}))
        ),
        h('div',{className:'employee-personnel-actions employment-action-actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setShowEmploymentAction(false)},'Cancel'),h('button',{type:'submit',className:'btn btn-primary',disabled:employmentSaving},employmentSaving?'Saving…':'Save Employment Action'))
      ));
    }

    async function loadEmployeeDocuments(...employees){
      // Older uploads may use either the profile ID or its linked login ID.
      const ids=[...new Set(employees.flatMap(employee=>[employee?.id,employee?.auth_user_id]).filter(Boolean))];
      const docs=new Map();
      for(const id of ids){
        for(const column of ['employee_id','profile_id']){
          const {data,error}=await client.from('employee_documents').select('*').eq(column,id).order('created_at',{ascending:false});
          // The original employee_documents schema did not have profile_id.
          if(error){
            if(column==='profile_id'&&error.code==='42703')continue;
            throw new Error(`Unable to load employee documents: ${error.message||'Please retry.'}`);
          }
          for(const doc of data||[])docs.set(doc.id,doc);
        }
      }
      return [...docs.values()].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
    }

    async function openDetails(row){
      setDetailsEditing(false);
      setDetailsTarget(row);setDetailsForm({...empty,...row,password:''});setDetailsMsg('');setDetailsDocs([]);loadEmploymentActions(row);
      setIdFiles([]);setQualificationFiles([]);setExperienceFiles([]);setOtherFiles([]);setCameraFiles([]);setPhotoFiles([]);
      setPhotoPreview('');

      const resolved=await resolveEmployeePhoto(row,900);
      if(resolved.profile){
        setDetailsTarget(resolved.profile);
        setDetailsForm({...empty,...resolved.profile,password:''});
        loadEmploymentActions(resolved.profile);
      }
      if(resolved.url)setPhotoPreview(resolved.url);

      try{
        setDetailsDocs(await loadEmployeeDocuments(resolved.profile,row));
      }catch(error){
        setDetailsMsg(error.message||'Unable to load employee documents. Please reopen the personnel file to retry.');
      }
    }

    async function saveDetails(e){
      e.preventDefault();setDetailsBusy(true);setDetailsMsg('');
      try{
        const payload={...detailsForm};
        payload.current_address=composeEmployeeAddress(payload,'current');
        payload.permanent_address=payload.permanent_same_as_current
          ?payload.current_address
          :composeEmployeeAddress(payload,'permanent');
        payload.address=payload.current_address||payload.address||'';
        delete payload.password;delete payload.id;delete payload.created_at;delete payload.updated_at;delete payload.last_sign_in_at;
        const requestedRole=payload.role;
        delete payload.role;
        const profileUpdate=await client.from('profiles')
          .update(payload)
          .or(`id.eq.${detailsTarget.id},auth_user_id.eq.${detailsTarget.auth_user_id||detailsTarget.id}`)
          .select('*');
        if(profileUpdate.error)throw profileUpdate.error;
        if(!profileUpdate.data?.length)throw new Error('Employee details were not saved. Your account does not currently have permission to update this employee profile.');
        const updatedProfile=profileUpdate.data[0];

        const roleResult=await adminRequest({action:'set_role',user_id:detailsTarget.id,role:requestedRole});
        if(roleResult.role!==requestedRole)throw new Error(`Selected role ${requestedRole} was not saved correctly.`);

        // Verify important edited fields actually persisted before showing success.
        const {data:verifiedProfile,error:verifyError}=await client.from('profiles')
          .select('*')
          .eq('id',updatedProfile.id)
          .maybeSingle();
        if(verifyError)throw verifyError;
        if(!verifiedProfile)throw new Error('Employee update could not be verified.');

        const checks=[
          ['Department',payload.department,verifiedProfile.department],
          ['Designation',payload.designation,verifiedProfile.designation],
          ['Employee Name',payload.full_name,verifiedProfile.full_name]
        ];
        const mismatch=checks.find(([,expected,actual])=>String(expected||'').trim()!==String(actual||'').trim());
        if(mismatch)throw new Error(`${mismatch[0]} was not saved correctly. Please retry.`);
        await uploadEmployeePhoto(detailsTarget.id,photoFiles);
        await uploadEmployeeFiles(detailsTarget.id,[{type:'ID Card',files:idFiles},{type:'Qualification Certificate',files:qualificationFiles},{type:'Experience Certificate',files:experienceFiles},{type:'Other Certificate',files:otherFiles},{type:'Camera Capture',files:cameraFiles}]);
        const successText='Employee information and documents updated successfully.';
        setDetailsTarget(verifiedProfile);
        setDetailsForm({...empty,...verifiedProfile,password:''});
        setDetailsMsg(successText);showEmployeeToast('success',successText);setIdFiles([]);setQualificationFiles([]);setExperienceFiles([]);setOtherFiles([]);setCameraFiles([]);setPhotoFiles([]);await load();
        try{
          setDetailsDocs(await loadEmployeeDocuments(verifiedProfile,detailsTarget));
        }catch(error){
          // Keep the visible documents if refresh fails after a successful save.
          setDetailsMsg(`Employee information was saved, but documents could not be refreshed. ${error.message}`);
          showEmployeeToast('error','Employee saved. Please reopen the personnel file to refresh documents.');
        }
        const resolved=await resolveEmployeePhoto(detailsTarget,900);
        if(resolved.profile)setDetailsTarget(resolved.profile);
        if(resolved.url)setPhotoPreview(resolved.url);
        setDetailsEditing(false);
      }catch(error){
        const errorText=error.message||'Unable to update employee';
        setDetailsMsg(errorText);showEmployeeToast('error',errorText);
      }
      setDetailsBusy(false);
    }
    async function openDocument(doc){
      const {data,error}=await client.storage.from('employee-documents').createSignedUrl(doc.storage_path||doc.file_path,120);
      if(error){alert(error.message);return}window.open(data.signedUrl,'_blank','noopener');
    }

    async function printIdCard(row){
      const resolved=await resolveEmployeePhoto(row,900);
      const currentRow=resolved.profile||row;
      const photoUrl=resolved.url||'';
      const win=window.open('','_blank','width=760,height=700');
      if(!win){alert('Please allow pop-ups to print the ID card.');return}
      const validUntil=currentRow.date_of_joining?formatDateIN(new Date(new Date(currentRow.date_of_joining).setFullYear(new Date(currentRow.date_of_joining).getFullYear()+3))):'As per employment';
      const paymentModes=[...new Set(rows
        .filter(row=>['Payment','Advance'].includes(row.transaction_type)&&row.payment_mode)
        .map(row=>row.payment_mode)
      )].join(', ')||'—';

      const receiptNumbers=rows
        .filter(row=>['Payment','Advance'].includes(row.transaction_type))
        .map(row=>row.reference_no||row.receipt_no||row.description||'')
        .filter(Boolean)
        .join(' | ')||'—';

      const patientAge=patient.age||patient.patient_age||'—';
      const patientGender=patient.gender||patient.sex||'—';
      const dischargeDate=patient.discharge_date||'—';

      win.document.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Final Bill - ${escapeHtml(formalName(patient)||patient.full_name||'Patient')}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#fff5fa;font-family:Arial,Helvetica,sans-serif;color:#382333}
  .sheet{width:210mm;min-height:297mm;margin:12px auto;background:#fff;padding:11mm 12mm;box-shadow:0 10px 32px #0002}
  .head{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:start;padding-bottom:12px;border-bottom:3px solid #b01264}
  .brand-wrap{display:flex;gap:12px;align-items:flex-start}
  .brand-logo{display:block;width:190px;max-height:72px;object-fit:contain;object-position:left center}
  .brand h1{margin:0;color:#7a1247;font-size:24px}
  .brand p{margin:3px 0;color:#735d69;font-size:11px}
  .invoice{text-align:right}
  .invoice strong{display:block;font-size:17px;color:#b01264}
  .invoice span{display:block;margin-top:4px;font-size:11px}
  .title{text-align:center;margin:14px 0 10px}
  .title h2{margin:0;font-size:21px;letter-spacing:.05em}
  .title p{margin:4px 0;color:#735d69;font-size:10px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;padding:10px;border:1px solid #ead0de;border-radius:10px;background:#fffafd}
  .field{display:grid;grid-template-columns:122px 1fr;gap:8px;font-size:10.5px;padding:2px 0}
  .field b{color:#624858}
  h3{margin:15px 0 7px;font-size:13px;color:#7a1247}
  table{width:100%;border-collapse:collapse;font-size:9.7px}
  th{background:linear-gradient(100deg,#7a1247,#b01264,#e03a7c);color:#fff;text-align:left;padding:7px;border:1px solid #b01264}
  td{padding:7px;border:1px solid #ecd5e1;vertical-align:top}
  .amount{text-align:right;white-space:nowrap;font-weight:bold}
  .detail{margin-top:3px;color:#7b6571;font-size:9px;line-height:1.3}
  .empty{text-align:center;color:#7b6571;padding:15px}
  .summary{width:48%;margin:14px 0 0 auto;border:1px solid #ead0de;border-radius:10px;overflow:hidden}
  .summary-row{display:flex;justify-content:space-between;padding:7px 9px;border-bottom:1px solid #f0dce7;font-size:10.5px}
  .summary-row:last-child{border-bottom:0}
  .summary-row.total{background:#7a1247;color:#fff;font-size:13px;font-weight:bold}
  .status{margin-top:11px;padding:9px;text-align:center;border-radius:8px;font-weight:bold;background:${netPayable<=0.009?'#fae7f0':receipts>0?'#fff4df':'#ffeded'};color:${netPayable<=0.009?'#7a1247':receipts>0?'#9a6700':'#b42318'}}
  .payment-summary{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px;margin-top:12px;padding:9px;border:1px solid #ecd5e1;border-radius:9px;background:#fffafd;font-size:10px}
  .payment-summary div{display:grid;grid-template-columns:118px 1fr;gap:7px}
  .notes{margin-top:13px;padding:9px;border:1px solid #ecd5e1;border-radius:9px;font-size:9.7px;color:#735d69;line-height:1.4}
  .signatures{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;margin-top:32px;text-align:center;font-size:10px}
  .signatures div{padding-top:24px;border-top:1px solid #735d69}
  .footer{margin-top:22px;padding-top:8px;border-top:1px solid #ecd5e1;text-align:center;font-size:9px;color:#7b6571}
  .print{display:block;margin:16px auto;padding:11px 22px;border:0;border-radius:8px;background:linear-gradient(100deg,#7a1247,#b01264,#e03a7c);color:#fff;font-weight:bold;cursor:pointer}
  @media print{
    body{background:#fff}
    .sheet{width:auto;min-height:auto;margin:0;box-shadow:none;padding:7mm}
    .print{display:none}
    @page{size:A4;margin:7mm}
  }
</style>
</head>
<body>
<div class="sheet">
  <div class="head">
    <div class="brand-wrap">
      <img class="brand-logo" src="${escapeHtml(BRAND_LOGO_URL)}" alt="Samara Assisted Living">
      <div class="brand">
        <h1>SAMARA HEALTH CARE LLP</h1>
        <p>Samara Care Assisted Living</p>
        <p>Address: ________________________________________________</p>
        <p>Phone: __________________ · Email: __________________ · GSTIN: __________________</p>
      </div>
    </div>
    <div class="invoice">
      <strong>INVOICE NO: ${escapeHtml(invoiceNo)}</strong>
      <span>Bill Date: ${escapeHtml(formatDateIN(new Date()))}</span>
      <span>Bill Time: ${escapeHtml(formatTimeIN(new Date()))}</span>
      <span>Prepared By: ${escapeHtml(formalName(profile)||profile?.login_id||'Authorised User')}</span>
    </div>
  </div>

  <div class="title">
    <h2>FINAL / COMPLETE PATIENT BILL</h2>
    <p>Detailed statement of charges, payments and final settlement</p>
  </div>

  <div class="grid">
    <div class="field"><b>Patient Name</b><span>${escapeHtml(formalName(patient)||patient.full_name||'—')}</span></div>
    <div class="field"><b>Resident ID</b><span>${escapeHtml(patient.patient_id||'—')}</span></div>
    <div class="field"><b>Age / Gender</b><span>${escapeHtml(`${patientAge} / ${patientGender}`)}</span></div>
    <div class="field"><b>Room / Bed</b><span>${escapeHtml(roomBed)}</span></div>
    <div class="field"><b>Admission Date</b><span>${escapeHtml(formatDateIN(patient.admission_date))}</span></div>
    <div class="field"><b>Discharge Date</b><span>${escapeHtml(dischargeDate==='—'?'—':formatDateIN(dischargeDate))}</span></div>
    <div class="field"><b>Mobile</b><span>${escapeHtml(patient.mobile||patient.attendant_phone||'—')}</span></div>
    <div class="field"><b>Diagnosis</b><span>${escapeHtml(patient.diagnosis||'—')}</span></div>
    <div class="field"><b>Consultant Doctor</b><span>${escapeHtml(patient.treating_doctor||patient.referring_doctor||'—')}</span></div>
    <div class="field"><b>Bill Status</b><span>${escapeHtml(billStatus)}</span></div>
  </div>

  <h3>1. Itemised Charges</h3>
  <table>
    <thead>
      <tr>
        <th style="width:34px">Sl.</th>
        <th>Particulars</th>
        <th style="width:48px">Qty</th>
        <th style="width:52px">Days</th>
        <th style="width:82px;text-align:right">Rate</th>
        <th style="width:100px;text-align:right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${chargeRows.length?chargeRows.map((group,index)=>{
        const qty=group.items.length||1;
        const days=group.items.reduce((total,item)=>total+Number(item.quantity_days||item.days||0),0)||'—';
        const rate=qty?group.amount/qty:group.amount;
        return `<tr>
          <td>${index+1}</td>
          <td><strong>${escapeHtml(group.category)}</strong><div class="detail">${escapeHtml(group.items.map(item=>item.description||'').filter(Boolean).join(' | ')||'—')}</div></td>
          <td>${escapeHtml(String(qty))}</td>
          <td>${escapeHtml(String(days))}</td>
          <td class="amount">${escapeHtml(money(rate))}</td>
          <td class="amount">${escapeHtml(money(group.amount))}</td>
        </tr>`;
      }).join(''):`<tr><td colspan="6" class="empty">No charges recorded.</td></tr>`}
    </tbody>
  </table>

  <h3>2. Payments / Advances / Discounts / Refunds</h3>
  <table>
    <thead><tr><th style="width:34px">Sl.</th><th style="width:116px">Date</th><th style="width:74px">Type</th><th style="width:80px">Mode</th><th>Receipt / Reference / Description</th><th style="width:100px;text-align:right">Amount</th></tr></thead>
    <tbody>${paymentHtml}</tbody>
  </table>

  <div class="summary">
    <div class="summary-row"><span>Gross Total</span><strong>${escapeHtml(money(totals.Charge))}</strong></div>
    <div class="summary-row"><span>Discount</span><strong>${escapeHtml(money(totals.Discount))}</strong></div>
    <div class="summary-row"><span>Advance Received</span><strong>${escapeHtml(money(totals.Advance))}</strong></div>
    <div class="summary-row"><span>Payments Received</span><strong>${escapeHtml(money(totals.Payment))}</strong></div>
    <div class="summary-row"><span>Refunds</span><strong>${escapeHtml(money(totals.Refund))}</strong></div>
    <div class="summary-row total"><span>NET AMOUNT PAYABLE</span><strong>${escapeHtml(money(netPayable))}</strong></div>
    ${advanceBalance>0?`<div class="summary-row"><span>Advance Balance / Refundable</span><strong>${escapeHtml(money(advanceBalance))}</strong></div>`:''}
  </div>

  <div class="payment-summary">
    <div><b>Payment Mode(s)</b><span>${escapeHtml(paymentModes)}</span></div>
    <div><b>Receipt / Reference No.</b><span>${escapeHtml(receiptNumbers)}</span></div>
  </div>

  <div class="status">${escapeHtml(billStatus)}</div>

  <div class="notes">
    <strong>Declaration:</strong> This computer-generated bill reflects transactions recorded in Samara Care ERP as on ${escapeHtml(formatDateTimeIN(new Date()))}.
    Recurring room rent, nursing charges and other services are included only where posted in the system. Any approved discount is shown separately.
  </div>

  <div class="signatures">
    <div>Billing Officer</div>
    <div>Accounts / Administrator</div>
    <div>Patient / Attendant Signature</div>
  </div>

  <div class="footer">Samara Health Care LLP · Computer-generated bill · No manual alteration permitted</div>
</div>
<button class="print" onclick="window.print()">Print / Save as PDF</button>
</body>
</html>`);
      win.document.close();
    }

    function authenticationStatus(row){const auth=authMap[row.auth_user_id||row.id];if(!auth)return {text:'Auth user missing',className:'off'};if(auth.banned)return {text:'Blocked',className:'off'};if(!auth.confirmed)return {text:'Unconfirmed',className:'warn'};return {text:'Connected',className:'on'}}
    const fileInput=(label,setter,accept='application/pdf,image/*',isPhoto=false)=>h('div',{className:'field capture-field'},
      h('label',null,label),
      h('div',{className:'capture-actions'},
        h('label',{className:'btn btn-secondary file-button'},'Upload File',h('input',{type:'file',multiple:!isPhoto,accept,onChange:e=>isPhoto?updatePhotoSelection(e.target.files):setter(Array.from(e.target.files||[]))})),
        h('label',{className:'btn btn-secondary file-button'},'Mobile Camera',h('input',{type:'file',multiple:!isPhoto,accept:'image/*',capture:isPhoto?'user':'environment',onChange:e=>isPhoto?updatePhotoSelection(e.target.files):setter(prev=>[...prev,...Array.from(e.target.files||[])])})),
        h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setCameraConfig({title:label,facingMode:isPhoto?'user':'environment',filePrefix:isPhoto?'employee-photo':'document',onCapture:file=>isPhoto?updatePhotoSelection([file]):setter(prev=>[...prev,file])})},'Webcam')
      ),
      h('small',null,'Choose an existing file, use the mobile camera, or open the live webcam capture.'),
      h('div',{className:'selected-files'},isPhoto?(photoFiles[0]?`Selected: ${photoFiles[0].name}`:'No photo selected'):null)
    );
    const textArea=(label,key,state,setter,required=false)=>h('div',{className:'field span-2'},h('label',null,label),h('textarea',{value:state[key]||'',required,onChange:e=>setter({...state,[key]:e.target.value}),rows:3}));

    const isSystemAccount=row=>{
      const name=String(row?.full_name||'').trim().toLowerCase().replace(/\s+/g,' ');
      const login=String(row?.login_id||row?.username||'').trim().toLowerCase();
      // Samara Directors/Admins (including Boomi, Chella, Maneesha and Ram)
      // are ERP management accounts and are not HR employees.
      if(isSamaraAdministratorAccount(row))return true;
      // Also suppress any legacy placeholder system account named simply Administrator.
      return name==='administrator' || login==='administrator';
    };
    const employeeRows=deduplicateEmployeeProfiles(rows.filter(r=>!isSystemAccount(r)));
    const retainedEmployeeIds=new Set(employeeRows.map(r=>String(r.id)));
    // Security exception register: profiles hidden by employee de-duplication, or
    // legacy login profiles that were never completed as an employee record.
    // Keep disabled records visible here so an administrator can audit/re-enable them.
    const unlinkedLoginRows=rows.filter(r=>!isSystemAccount(r)&&(
      !retainedEmployeeIds.has(String(r.id)) ||
      !String(r.employee_id||'').trim() ||
      !String(r.department||'').trim() ||
      !String(r.designation||'').trim()
    ));
    const activeEmployeeRows=employeeRows.filter(r=>Boolean(r.is_active??r.active));
    const employeeDepartments=[...new Set(activeEmployeeRows.map(r=>employeeDepartment(r)||'Other').filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const departmentRows=employeeDepartmentFilter==='__ALL__'
      ? activeEmployeeRows
      : employeeDepartmentFilter
        ? activeEmployeeRows.filter(r=>employeeDepartment(r)===employeeDepartmentFilter)
        : [];
    const normalizedEmployeeSearch=String(employeeSearch||'').trim().toLowerCase();
    const employeeSearchText=r=>[
      formalName(r),r.full_name,r.employee_id,r.mobile,r.designation,r.department,
      r.address,r.current_address,r.permanent_address,r.current_village_town,
      r.permanent_village_town,r.current_locality_area,r.permanent_locality_area,
      r.current_district,r.permanent_district,r.current_taluk,r.permanent_taluk,
      r.previous_workplace
    ].filter(Boolean).join(' ').toLowerCase();
    function employeeFullAddress(row,prefix='current'){
      const fields=['flat_no','apartment_name','house_no','street_name','locality_area','village_town','landmark','taluk','district','state','pincode'];
      const parts=fields.map(key=>String(row?.[`${prefix}_${key}`]||'').trim()).filter(Boolean);
      const meaningful=parts.filter(value=>value.toLowerCase()!=='tamil nadu');
      const summary=String(row?.[`${prefix}_address`]||'').trim();
      const legacy=prefix==='current'?String(row?.address||'').trim():'';
      if(meaningful.length)return parts.join(', ');
      if(summary&&summary.toLowerCase()!=='tamil nadu')return summary;
      if(legacy&&legacy.toLowerCase()!=='tamil nadu')return legacy;
      return '';
    }
    function employeePlaceDistrict(row){
      const direct=[row?.current_village_town||row?.permanent_village_town||row?.current_locality_area||row?.permanent_locality_area,row?.current_district||row?.permanent_district].filter(Boolean).join(' · ');
      if(direct)return direct;
      const address=employeeFullAddress(row,'current')||employeeFullAddress(row,'permanent');
      if(!address)return 'Address not entered';
      const parts=address.split(',').map(value=>value.trim()).filter(Boolean).filter(value=>!/^tamil nadu$/i.test(value)&&!/^[0-9]{6}$/.test(value));
      return parts.slice(-2).join(' · ')||address;
    }
    const searchedEmployeeRows=normalizedEmployeeSearch.length>=3
      ? departmentRows.filter(r=>employeeSearchText(r).includes(normalizedEmployeeSearch))
      : departmentRows;
    const effectiveRows=departmentViewOnly&&nursingDashboardFilter!=='all'
      ? searchedEmployeeRows.filter(r=>{
          const designation=String(r.designation||'').toLowerCase();
          if(nursingDashboardFilter==='managers')return designation.includes('nurse manager');
          if(nursingDashboardFilter==='supervisors')return designation.includes('supervisor');
          if(nursingDashboardFilter==='staff-nurses')return designation.includes('staff nurse');
          return true;
        })
      : searchedEmployeeRows;
    const shortEmployeeSearch=normalizedEmployeeSearch.length>0&&normalizedEmployeeSearch.length<3;
    const departmentDashboard=!employeeDepartmentFilter?h('div',{className:'employee-department-dashboard'},
      h('button',{type:'button',className:'employee-dept-card employee-dept-all',onClick:()=>setEmployeeDepartmentFilter('__ALL__')},h('strong',null,'All Employees'),h('span',null,activeEmployeeRows.length)),
      employeeDepartments.map(dept=>h('button',{type:'button',key:dept,className:'employee-dept-card',onClick:()=>setEmployeeDepartmentFilter(dept)},h('strong',null,dept),h('span',null,activeEmployeeRows.filter(r=>employeeDepartment(r)===dept).length)))
    ):null;

    const table=h('div',{className:'table-wrap employee-master-table-wrap'},h('table',{className:'table employee-master-table'},
      h('thead',null,h('tr',null,['Name','Employee ID','Login ID','Department / Designation','ERP Access','Profile Status','Authentication Status','Last sign-in','Actions'].map(x=>h('th',{key:x},x)))),
      h('tbody',null,effectiveRows.map(r=>{const enabled=Boolean(r.is_active??r.active),auth=authMap[r.auth_user_id||r.id],status=authenticationStatus(r),managerBlocked=profile.role==='Manager'&&String(r.role).toLowerCase()==='admin';return h('tr',{key:r.id,className:`employee-row-touch ${enabled?'employee-active':'employee-disabled'}`,role:'button',tabIndex:0,title:'Tap to open Employee Personnel File',onClick:()=>openDetails(r),onKeyDown:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openDetails(r)}}},
        h('td',{'data-label':'Employee'},formalName(r)),h('td',{'data-label':'Employee ID'},r.employee_id||'—'),h('td',{'data-label':'Login ID'},r.login_id),h('td',{'data-label':'Department'},`${employeeDepartment(r)}${r.designation?` · ${r.designation}`:''}`),h('td',{'data-label':'Access'},r.role),
        h('td',{'data-label':'Status'},h('span',{className:`badge ${enabled?'':'off'}`},enabled?'Active':'Disabled')),
        h('td',{'data-label':'Authentication'},h('span',{className:`badge auth-status ${status.className}`},status.text)),h('td',{'data-label':'Last sign-in'},fmt(auth?.last_sign_in_at||r.last_sign_in_at)),
        h('td',{'data-label':'Actions'},fullHRAccess?h('div',{className:'employee-actions',onClick:e=>e.stopPropagation(),onKeyDown:e=>e.stopPropagation()},h('button',{className:'btn btn-secondary',onClick:()=>openDetails(r)},'Personnel File'),h('button',{className:'btn btn-secondary',onClick:()=>openDetails(r)},'Documents'),h('button',{className:'btn btn-secondary',onClick:()=>printIdCard(r)},'Print ID Card'),r.mobile?h('button',{type:'button',className:employeeWelcomeSent(r)?'btn btn-secondary clinical-action-done':'btn btn-whatsapp',disabled:welcomeBusy===String(r.id)||employeeWelcomeSent(r),onClick:()=>sendEmployeeWelcomeApi(r)},welcomeBusy===String(r.id)?'Sending…':employeeWelcomeSent(r)?'WhatsApp Welcome Sent ✓':'WhatsApp Welcome API'):null,employeeWelcomeSent(r)?h('button',{type:'button',className:'btn btn-secondary',disabled:welcomeBusy===String(r.id),onClick:()=>sendEmployeeWelcomeApi(r,{resend:true})},welcomeBusy===String(r.id)?'Resending…':'Resend Welcome'):null,whatsappWelcomeUrl(r)?h('a',{className:'btn btn-whatsapp',href:whatsappWelcomeUrl(r),target:'_blank',rel:'noopener noreferrer'},'Send Login Details'):null,h('button',{className:enabled?'btn btn-danger':'btn btn-secondary',disabled:managerBlocked,onClick:()=>toggle(r)},enabled?'Disable':'Enable'),auth?h('button',{className:'btn btn-primary',disabled:managerBlocked,onClick:()=>openReset(r)},'Reset Password'):h('button',{className:'btn btn-warning',disabled:managerBlocked,onClick:()=>openRepair(r)},'Repair Account')):h('div',{className:'employee-actions',onClick:e=>e.stopPropagation()},h('button',{className:'btn btn-secondary',onClick:()=>openDetails(r)},'View Personnel File')))
      )}),effectiveRows.length===0?h('tr',null,h('td',{colSpan:9,className:'empty'},'No active employees found in this selection.')):null))
    );

    const unlinkedLoginRegister=fullHRAccess&&!departmentViewOnly?h('section',{className:'employee-login-exceptions'},
      h('div',{className:'employee-login-exceptions-head'},
        h('div',null,
          h('h4',null,'Unlinked / Legacy Login Accounts'),
          h('p',null,'Security check: login profiles hidden by duplicate matching or missing required employee details remain visible here.')
        ),
        h('span',{className:`badge ${unlinkedLoginRows.some(r=>(r.is_active??r.active)!==false)?'warn':''}`},`${unlinkedLoginRows.length} account${unlinkedLoginRows.length===1?'':'s'}`)
      ),
      unlinkedLoginRows.length?h('div',{className:'table-wrap'},h('table',{className:'table employee-login-exceptions-table'},
        h('thead',null,h('tr',null,['Name','Login ID','Employee ID','Department / Designation','Profile','Authentication','Created','Action'].map(label=>h('th',{key:label},label)))),
        h('tbody',null,unlinkedLoginRows.map(r=>{
          const enabled=Boolean(r.is_active??r.active),status=authenticationStatus(r);
          const reason=!retainedEmployeeIds.has(String(r.id))?'Duplicate profile hidden from employee list':'Incomplete employee record';
          return h('tr',{key:r.id},
            h('td',{'data-label':'Name'},h('strong',null,formalName(r)||r.full_name||'—'),h('small',{className:'employee-login-exception-reason'},reason)),
            h('td',{'data-label':'Login ID'},r.login_id||'—'),
            h('td',{'data-label':'Employee ID'},r.employee_id||'Missing'),
            h('td',{'data-label':'Department / Designation'},`${r.department||'Missing'} · ${r.designation||'Missing'}`),
            h('td',{'data-label':'Profile'},h('span',{className:`badge ${enabled?'':'off'}`},enabled?'Active':'Disabled')),
            h('td',{'data-label':'Authentication'},h('span',{className:`badge auth-status ${status.className}`},status.text)),
            h('td',{'data-label':'Created'},fmt(r.created_at)),
            h('td',{'data-label':'Action'},h('button',{type:'button',className:enabled?'btn btn-danger':'btn btn-secondary',onClick:()=>{
              const action=enabled?'disable':'enable';
              if(window.confirm(`${action==='disable'?'Disable':'Enable'} login “${r.login_id||r.full_name}”?${enabled?' This will block sign-in but preserve the audit record.':''}`))toggle(r);
            }},enabled?'Disable Login':'Enable Login'))
          );
        }))
      )):h('div',{className:'message success'},'No unlinked or incomplete login accounts found.')
    ):null;

    const nursingStats=departmentViewOnly?h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:'12px',margin:'16px 0'}},
      [
        ['all','Nursing Employees',activeEmployeeRows.length],
        ['managers','Nurse Managers',activeEmployeeRows.filter(r=>/nurse manager/i.test(String(r.designation||''))).length],
        ['supervisors','Supervisors',activeEmployeeRows.filter(r=>/supervisor/i.test(String(r.designation||''))).length],
        ['staff-nurses','Staff Nurses',activeEmployeeRows.filter(r=>/staff nurse/i.test(String(r.designation||''))).length]
      ].map(([key,label,value])=>h('button',{type:'button',key,className:'card',onClick:()=>setNursingDashboardFilter(key),style:{padding:'16px',border:nursingDashboardFilter===key?'2px solid #b0065b':'1px solid #ead0de',background:nursingDashboardFilter===key?'#fff0f7':'#fff',textAlign:'left',cursor:'pointer'}},h('small',null,label),h('div',{style:{fontSize:'28px',fontWeight:'800',color:'#990653',marginTop:'5px'}},value)))
    ):null;
    const nursingCards=departmentViewOnly?h(React.Fragment,null,
      nursingStats,
      h('div',{className:'field',style:{margin:'10px 0 16px'}},
        h('label',null,'Search Nursing Employees'),
        h('input',{type:'search',value:employeeSearch,placeholder:'Enter any 3 letters/digits: name, mobile, designation, place or district',onChange:e=>setEmployeeSearch(e.target.value)}),
        h('small',{className:shortEmployeeSearch?'message error':'small-note'},shortEmployeeSearch?'Please enter at least 3 letters or digits.':'Search also includes Employee ID, address and previous workplace.')
      ),
      h('div',{className:'table-wrap'},h('table',{className:'table'},
        h('thead',null,h('tr',null,['S.No.','Employee Name','Employee ID','Mobile Number','Designation','Place / District','Action'].map(label=>h('th',{key:label},label)))),
        h('tbody',null,
          effectiveRows.map((r,index)=>{
            const place=employeePlaceDistrict(r);
            return h('tr',{key:r.id,className:'nursing-employee-row-touch',role:'button',tabIndex:0,title:'Tap anywhere to view Personal Details',style:{cursor:'pointer',touchAction:'manipulation'},onClick:()=>openDetails(r),onKeyDown:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openDetails(r)}}},
              h('td',{'data-label':'S.No.'},index+1),
              h('td',{'data-label':'Employee Name'},h('strong',null,formalName(r))),
              h('td',{'data-label':'Employee ID'},r.employee_id||'—'),
              h('td',{'data-label':'Mobile Number',style:{whiteSpace:'nowrap'}},r.mobile||'—'),
              h('td',{'data-label':'Designation'},r.designation||'—'),
              h('td',{'data-label':'Place / District'},place),
              h('td',{'data-label':'Action'},h('button',{type:'button',className:'btn btn-secondary',onClick:e=>{e.stopPropagation();openDetails(r)}},'Personal Details'))
            );
          }),
          effectiveRows.length===0?h('tr',null,h('td',{colSpan:7,className:'empty'},normalizedEmployeeSearch.length>=3?'No nursing employee matches this search.':'No employees are available in this dashboard category.')):null
        )
      ))
    ):null;


    const EMPLOYEE_ADDRESS_KEYS=[
      'state','district','taluk','village_town','locality_area','street_name',
      'house_no','apartment_name','flat_no','landmark','pincode'
    ];

    function composeEmployeeAddress(state,prefix){
      const value=key=>String(state?.[`${prefix}_${key}`]||'').trim();
      return [
        [value('flat_no'),value('apartment_name')].filter(Boolean).join(', '),
        value('house_no'),
        value('street_name'),
        value('locality_area'),
        value('village_town'),
        value('taluk'),
        value('district'),
        value('state'),
        value('pincode')
      ].filter(Boolean).join(', ');
    }

    function copyCurrentToPermanent(state){
      const next={...state,permanent_same_as_current:true};
      EMPLOYEE_ADDRESS_KEYS.forEach(key=>{next[`permanent_${key}`]=state[`current_${key}`]||''});
      next.permanent_address=composeEmployeeAddress(state,'current');
      return next;
    }

    function updateEmployeeAddress(state,setter,prefix,key,value){
      let next={...state,[`${prefix}_${key}`]:value};
      if(key==='district'){
        next[`${prefix}_taluk`]='';
      }
      next[`${prefix}_address`]=composeEmployeeAddress(next,prefix);

      // When "same as current" is selected, Permanent Address mirrors Current Address continuously.
      if(prefix==='current'&&next.permanent_same_as_current){
        next=copyCurrentToPermanent(next);
      }
      setter(next);
    }

    function employeeAddressFields(state,setter,prefix,title){
      const isPermanent=prefix==='permanent';
      const locked=isPermanent&&!!state.permanent_same_as_current;
      const district=state[`${prefix}_district`]||'';
      const taluks=TAMIL_NADU_DISTRICT_TALUKS[district]||[];

      return h('div',{className:'employee-address-block span-2'},
        h('div',{className:'employee-address-heading'},
          h('div',null,
            h('h4',null,title),
            h('small',{className:'muted'},
              isPermanent
                ?'Permanent / native residential address'
                :'Present residential address where the employee is currently staying'
            )
          ),
          isPermanent&&h('label',{className:'employee-address-same'},
            h('input',{
              type:'checkbox',
              checked:!!state.permanent_same_as_current,
              onChange:e=>{
                if(e.target.checked){
                  setter(copyCurrentToPermanent(state));
                }else{
                  setter({...state,permanent_same_as_current:false});
                }
              }
            }),
            h('span',null,'Same as Current Address')
          )
        ),

        state.address&&prefix==='current'&&!state.current_district&&!state.current_street_name
          ?h('div',{className:'message info'},
              h('strong',null,'Existing address on record: '),
              state.address,
              h('br'),
              h('small',null,'Please complete the structured address fields below when this employee record is next edited.')
            )
          :null,

        h('div',{className:'employee-address-grid'},
          h('div',{className:'field'},h('label',null,'State'),
            h('select',{
              value:state[`${prefix}_state`]||'Tamil Nadu',
              disabled:locked,
              onChange:e=>updateEmployeeAddress(state,setter,prefix,'state',e.target.value)
            },
              h('option',{value:'Tamil Nadu'},'Tamil Nadu')
            )
          ),

          h('div',{className:'field'},h('label',null,'District'),
            h('select',{
              value:district,
              disabled:locked,
              onChange:e=>updateEmployeeAddress(state,setter,prefix,'district',e.target.value)
            },
              h('option',{value:''},'Select district'),
              TAMIL_NADU_DISTRICTS.map(item=>h('option',{key:item,value:item},item))
            )
          ),

          h('div',{className:'field'},h('label',null,'Taluk'),
            h('select',{
              value:state[`${prefix}_taluk`]||'',
              disabled:locked||!district,
              onChange:e=>updateEmployeeAddress(state,setter,prefix,'taluk',e.target.value)
            },
              h('option',{value:''},district?'Select taluk':'Select district first'),
              taluks.map(item=>h('option',{key:item,value:item},item))
            )
          ),

          h('div',{className:'field'},h('label',null,'Village / Town / City'),
            h('input',{
              value:state[`${prefix}_village_town`]||'',
              readOnly:locked,
              placeholder:'Village, town or city',
              onChange:e=>updateEmployeeAddress(state,setter,prefix,'village_town',e.target.value)
            })
          ),

          h('div',{className:'field'},h('label',null,'Locality / Area'),
            h('input',{
              value:state[`${prefix}_locality_area`]||'',
              readOnly:locked,
              placeholder:'Locality / area',
              onChange:e=>updateEmployeeAddress(state,setter,prefix,'locality_area',e.target.value)
            })
          ),

          h('div',{className:'field'},h('label',null,'Street Name'),
            h('input',{
              value:state[`${prefix}_street_name`]||'',
              readOnly:locked,
              placeholder:'Street / road name',
              onChange:e=>updateEmployeeAddress(state,setter,prefix,'street_name',e.target.value)
            })
          ),

          h('div',{className:'field'},h('label',null,'House / Door No.'),
            h('input',{
              value:state[`${prefix}_house_no`]||'',
              readOnly:locked,
              placeholder:'House / Door No.',
              onChange:e=>updateEmployeeAddress(state,setter,prefix,'house_no',e.target.value)
            })
          ),

          h('div',{className:'field'},h('label',null,'Apartment / Building Name'),
            h('input',{
              value:state[`${prefix}_apartment_name`]||'',
              readOnly:locked,
              placeholder:'Apartment / building',
              onChange:e=>updateEmployeeAddress(state,setter,prefix,'apartment_name',e.target.value)
            })
          ),

          h('div',{className:'field'},h('label',null,'Flat No.'),
            h('input',{
              value:state[`${prefix}_flat_no`]||'',
              readOnly:locked,
              placeholder:'Flat No.',
              onChange:e=>updateEmployeeAddress(state,setter,prefix,'flat_no',e.target.value)
            })
          ),

          h('div',{className:'field'},h('label',null,'Landmark'),
            h('input',{
              value:state[`${prefix}_landmark`]||'',
              readOnly:locked,
              placeholder:'Nearby landmark',
              onChange:e=>updateEmployeeAddress(state,setter,prefix,'landmark',e.target.value)
            })
          ),

          h('div',{className:'field'},h('label',null,'PIN Code'),
            h('input',{
              value:state[`${prefix}_pincode`]||'',
              readOnly:locked,
              inputMode:'numeric',
              maxLength:6,
              placeholder:'6-digit PIN',
              onChange:e=>updateEmployeeAddress(state,setter,prefix,'pincode',e.target.value.replace(/\D/g,'').slice(0,6))
            })
          ),

          h('div',{className:'field span-2'},h('label',null,'Complete Address'),
            h('textarea',{
              value:composeEmployeeAddress(state,prefix),
              readOnly:true,
              rows:2,
              placeholder:'Address will be composed automatically from the fields above'
            })
          )
        )
      );
    }

    const personnelFields=(state,setter,includeLogin=true)=>h(React.Fragment,null,
      selectField('Title / Salutation','title',state,setter,EMPLOYEE_TITLES),field('Employee Name','full_name',state,setter,true),field('Employee ID (auto-generated if blank)','employee_id',state,setter,false),
      h('div',{className:'field'},h('label',null,'Department'),h('select',{value:state.department||'',required:true,onChange:e=>{const department=e.target.value;const choices=HR_DESIGNATIONS[department]||[];const defaultDesignation=choices[0]||'';const suggestedRole=department==='Nursing'?'Nurse':department==='Caregiving'?'Caregiver':department==='Accounts & Finance'?'Accounts':department==='Food & Kitchen'?'Kitchen':state.role;setter({...state,department,designation:defaultDesignation,role:suggestedRole})}},h('option',{value:''},'Select department'),HR_DEPARTMENTS.map(x=>h('option',{key:x,value:x},x)))),
      h('div',{className:'field'},h('label',null,'Designation'),h('select',{value:state.designation||'',required:true,onChange:e=>setter({...state,designation:e.target.value})},h('option',{value:''},'Select designation'),(HR_DESIGNATIONS[state.department]||[]).map(x=>h('option',{key:x,value:x},x)))),
      selectField('ERP Access Role','role',state,setter,ROLES),
      h('div',{className:'field'},h('label',null,'Reporting Superior'),h('select',{value:state.reporting_superior_id||'',onChange:e=>setter({...state,reporting_superior_id:e.target.value})},h('option',{value:''},'Manager / Admin directly'),rows.filter(r=>r.id!==state.id&&!isSamaraAdministratorAccount(r)&&(r.is_active??r.active)!==false).sort((a,b)=>formalName(a).localeCompare(formalName(b))).map(r=>h('option',{key:r.id,value:r.id},`${formalName(r)} · ${r.designation||r.role}`)))),
      field('Father / Guardian Name','father_guardian_name',state,setter,false),field('Date of Birth','date_of_birth',state,setter,false,'date'),field('Date of Joining','date_of_joining',state,setter,false,'date'),
      field('Starting / Current Salary','current_salary',state,setter,false,'number'),selectField('Salary Frequency','salary_frequency',state,setter,['Monthly','Daily','Hourly']),
      selectField('Blood Group','blood_group',state,setter,BLOOD_GROUPS),
      field('Mobile Number','mobile',state,setter,false),field('Emergency Contact','emergency_contact',state,setter,false),field('Employee Email','employee_email',state,setter,false,'email'),
      field('ID Card Type','id_card_type',state,setter,false),field('ID Card Number','id_card_number',state,setter,false),field('Qualification','qualification',state,setter,false),field('Previous Working Place','previous_workplace',state,setter,false),
      selectField('Joining Source','reference_type',state,setter,['Direct','Reference']),field('Reference Name','reference_name',state,setter,false),field('Reference Contact','reference_contact',state,setter,false),
      includeLogin?field('Login ID','login_id',state,setter,true):null,
      includeLogin?field('Temporary Password','password',state,setter,true,'password'):null,
      employeeAddressFields(state,setter,'current','Current Residential Address'),
      employeeAddressFields(state,setter,'permanent','Permanent Residential Address')
    );

    const uploadFields=()=>h('div',{className:'employee-upload-section span-2'},h('h4',null,'Employee Photo, Documents and Certificates'),h('p',{className:'small-note'},'Each item provides separate Upload File, Mobile Camera and Webcam options.'),h('div',{className:'modal-grid'},fileInput('Employee Photo',setPhotoFiles,'image/*',true),fileInput('ID Card / Identity Proof',setIdFiles),fileInput('Qualification Certificates',setQualificationFiles),fileInput('Experience / Previous Employment Certificates',setExperienceFiles),fileInput('Other Certificates',setOtherFiles)));

    const personnelPhotoPreview=()=>h('div',{className:'employee-form-photo',style:{width:'116px',height:'136px',borderRadius:'16px',overflow:'hidden',border:'2px solid #ead0de',background:'#fff5fa',display:'flex',alignItems:'center',justifyContent:'center',flex:'0 0 auto'}},
      photoPreview?h('img',{src:photoPreview,alt:'Employee photo preview',style:{width:'100%',height:'100%',objectFit:'cover'}}):h('div',{style:{fontSize:'34px',fontWeight:'700',color:'#b01264'}},'SC')
    );

    const personnelInfoItem=(label,value,wide=false)=>h('div',{className:`employee-info-item${wide?' wide':''}`},
      h('small',null,label),h('strong',null,value||'—')
    );
    const personnelReadOnly=()=>{
      const r=detailsTarget||detailsForm||{};
      const active=Boolean(r.is_active??r.active);
      return h('div',{className:'employee-personnel-view'},
        h('div',{className:'employee-personnel-hero'},
          personnelPhotoPreview(),
          h('div',{className:'employee-personnel-identity'},
            h('h2',null,formalName(r)||r.full_name||'Employee'),
            h('p',null,[r.employee_id,employeeDepartment(r),r.designation].filter(Boolean).join(' · ')),
            h('div',{className:'employee-personnel-badges'},
              h('span',{className:`badge ${active?'':'off'}`},active?'Active':'Disabled'),
              r.role?h('span',{className:'badge employee-role-badge'},r.role):null
            )
          )
        ),
        h('section',{className:'employee-info-section'},h('h4',null,'Employment & Access'),
          h('div',{className:'employee-info-grid'},
            personnelInfoItem('Employee ID',r.employee_id),
            fullHRAccess?personnelInfoItem('Login ID',r.login_id):null,
            personnelInfoItem('Department',employeeDepartment(r)),
            personnelInfoItem('Designation',r.designation),
            fullHRAccess?personnelInfoItem('ERP Access Role',r.role):null,
            personnelInfoItem('Reporting Superior',formalName(rows.find(x=>x.id===r.reporting_superior_id))||'Manager / Admin directly'),
            personnelInfoItem('Date of Joining',r.date_of_joining?formatDateIN(r.date_of_joining):'—'),
            fullHRAccess?personnelInfoItem('Current Salary',r.current_salary!=null?`₹${Number(r.current_salary).toLocaleString('en-IN')} ${r.salary_frequency||'Monthly'}`:'Not set'):null
          )
        ),
        fullHRAccess?employmentHistorySection():null,
        h('section',{className:'employee-info-section'},h('h4',null,'Personal & Contact'),
          h('div',{className:'employee-info-grid'},
            personnelInfoItem('Father / Guardian',r.father_guardian_name),
            personnelInfoItem('Date of Birth',r.date_of_birth?formatDateIN(r.date_of_birth):'—'),
            personnelInfoItem('Blood Group',r.blood_group),
            personnelInfoItem('Mobile',r.mobile),
            personnelInfoItem('Emergency Contact',r.emergency_contact),
            personnelInfoItem('Email',r.employee_email||r.email)
          )
        ),
        h('section',{className:'employee-info-section'},h('h4',null,'Professional Details'),
          h('div',{className:'employee-info-grid'},
            personnelInfoItem('Qualification',r.qualification),
            personnelInfoItem('Previous Working Place',r.previous_workplace),
            personnelInfoItem('ID Card Type',r.id_card_type),
            personnelInfoItem('ID Card Number',r.id_card_number),
            personnelInfoItem('Joining Source',r.reference_type),
            personnelInfoItem('Reference', [r.reference_name,r.reference_contact].filter(Boolean).join(' · '))
          )
        ),
        h('section',{className:'employee-info-section'},h('h4',null,'Address'),
          h('div',{className:'employee-info-grid'},
            personnelInfoItem('Current Residential Address',employeeFullAddress(r,'current')||'Address not entered',true),
            personnelInfoItem('Permanent Residential Address',r.permanent_same_as_current?(employeeFullAddress(r,'current')||'Address not entered'):(employeeFullAddress(r,'permanent')||'Address not entered'),true)
          )
        )
      );
    };

    const createModal=show?h('div',{className:'modal-backdrop'},h('form',{className:'card modal employee-modal',onSubmit:create},
      h('div',{className:'panel-head',style:{alignItems:'flex-start'}},h('div',null,h('h3',null,'Create Employee'),h('small',null,'Personnel details, login account and certificate uploads')),h('div',{style:{display:'flex',gap:'12px',alignItems:'flex-start'}},personnelPhotoPreview(),h('button',{type:'button',className:'close',onClick:()=>{setShow(false);setPhotoPreview('');setPhotoFiles([])}},'×'))),
      msg?h('div',{className:`message ${msg.startsWith('Employee created')||msg.startsWith('Employee account repaired')?'success':'error'}`},msg):null,
      welcomeEmployee&&h('button',{type:'button',className:employeeWelcomeSent(welcomeEmployee)?'btn btn-secondary clinical-action-done full':'btn btn-whatsapp full',disabled:Boolean(welcomeBusy)||employeeWelcomeSent(welcomeEmployee),onClick:()=>sendEmployeeWelcomeApi(welcomeEmployee)},welcomeBusy?'Sending Welcome by API…':employeeWelcomeSent(welcomeEmployee)?'Employee Welcome WhatsApp Sent ✓':'Send Employee Welcome by WhatsApp API'),
      h('div',{className:'modal-grid'},personnelFields(form,setForm,true),uploadFields()),h('p',{className:'message success'},'The login account is created and confirmed securely without sending an email.'),h('button',{className:'btn btn-primary full',disabled:busy},busy?'Creating employee and uploading documents…':'Create Employee')
    )):null;

    const closePersonnel=()=>{setDetailsTarget(null);setDetailsEditing(false);setPhotoPreview('');setPhotoFiles([])};
    const detailsModal=detailsTarget&&detailsForm?h('div',{className:'modal-backdrop'},h('form',{className:`card modal employee-modal employee-personnel-modal ${detailsEditing?'editing':'viewing'}`,onSubmit:saveDetails},
      h('div',{className:'panel-head employee-personnel-head'},
        h('div',null,h('h3',null,detailsEditing?'Edit Employee':'Employee Personnel File'),h('small',null,`${formalName(detailsTarget)}${detailsTarget.login_id?` · ${detailsTarget.login_id}`:''}`)),
        h('button',{type:'button',className:'close employee-top-close','aria-label':'Close employee file',onClick:closePersonnel},'×')
      ),
      detailsMsg&&h('div',{className:`message ${detailsMsg.startsWith('Employee information')?'success':'error'}`},detailsMsg),
      detailsEditing
        ?h(React.Fragment,null,
          h('div',{className:'modal-grid'},personnelFields(detailsForm,setDetailsForm,false),uploadFields()),
          h('div',{className:'employee-doc-list'},h('h4',null,'Uploaded Documents'),detailsDocs.length?detailsDocs.map(d=>h('div',{className:'document-row',key:d.id},h('span',null,`${d.document_type}: ${d.file_name}`),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>openDocument(d)},'Open'))):h('p',{className:'small-note'},'No documents uploaded yet.'))
        )
        :h(React.Fragment,null,
          personnelReadOnly(),
          h('div',{className:'employee-doc-list employee-view-documents'},h('h4',null,'Documents'),detailsDocs.length?detailsDocs.map(d=>h('div',{className:'document-row',key:d.id},h('span',null,`${d.document_type}: ${d.file_name}`),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>openDocument(d)},'Open'))):h('p',{className:'small-note'},'No documents uploaded yet.'))
        ),
      h('div',{className:'employee-personnel-actions'},
        detailsEditing
          ?h(React.Fragment,null,
            h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setDetailsEditing(false);setDetailsForm({...empty,...detailsTarget,password:''});setDetailsMsg('');setPhotoFiles([])}},'Cancel Edit'),
            h('button',{type:'submit',className:'btn btn-primary',disabled:detailsBusy},detailsBusy?'Saving…':'Save')
          )
          :fullHRAccess?h('button',{type:'button',className:'btn btn-primary',onClick:()=>setDetailsEditing(true)},'Edit Employee'):null,
        !detailsEditing&&fullHRAccess&&whatsappWelcomeUrl(detailsTarget)?h('a',{className:'btn btn-whatsapp',href:whatsappWelcomeUrl(detailsTarget),target:'_blank',rel:'noopener noreferrer'},'Send Login Details'):null,
        h('button',{type:'button',className:'btn btn-secondary',onClick:closePersonnel},'Close')
      )
    )):null;
    const resetModal=resetTarget?h('div',{className:'modal-backdrop'},h('form',{className:'card modal reset-password-modal',onSubmit:resetPassword},h('div',{className:'panel-head'},h('div',null,h('h3',null,'Reset Employee Password'),h('small',null,`${resetTarget.full_name} · ${resetTarget.login_id}`)),h('button',{type:'button',className:'close',onClick:()=>setResetTarget(null)},'×')),resetMsg&&h('div',{className:`message ${resetMsg.startsWith('Password reset')?'success':'error'}`},resetMsg),h('div',{className:'field'},h('label',null,'New password'),h('input',{type:'password',value:newPassword,onChange:e=>setNewPassword(e.target.value),minLength:8,required:true,autoComplete:'new-password'})),h('div',{className:'field'},h('label',null,'Confirm new password'),h('input',{type:'password',value:confirmPassword,onChange:e=>setConfirmPassword(e.target.value),minLength:8,required:true,autoComplete:'new-password'})),h('button',{type:'button',className:'btn btn-secondary full',onClick:generateTemporaryPassword},'Generate Temporary Password'),h('p',{className:'small-note'},'Resetting the password also enables and unblocks the employee account. The employee must create a private password at first login.'),h('button',{className:'btn btn-primary full',disabled:resetBusy},resetBusy?'Resetting…':'Reset Password & Enable Account'))):null;
    const repairModal=repairTarget?h('div',{className:'modal-backdrop'},h('form',{className:'card modal reset-password-modal',onSubmit:repairAccount},h('div',{className:'panel-head'},h('div',null,h('h3',null,'Repair Employee Account'),h('small',null,`${repairTarget.full_name} · ${repairTarget.login_id}`)),h('button',{type:'button',className:'close',onClick:()=>setRepairTarget(null)},'×')),repairMsg&&h('div',{className:`message ${repairMsg.startsWith('Authentication account repaired')?'success':'error'}`},repairMsg),h('p',null,'This employee has a profile but no matching Supabase Authentication account. Enter a temporary password to rebuild the login account.'),h('div',{className:'field'},h('label',null,'Temporary password'),h('input',{type:'password',value:repairPassword,onChange:e=>setRepairPassword(e.target.value),minLength:8,required:true,autoComplete:'new-password'})),h('button',{className:'btn btn-warning full',disabled:repairBusy},repairBusy?'Repairing…':'Repair Account & Enable Login'))):null;

    return h(React.Fragment,null,
      h('div',{className:'card panel'},h('div',{className:'panel-head'},h('div',null,h('h3',null,departmentViewOnly?'Nursing HR Dashboard':employeeDepartmentFilter?`${employeeDepartmentFilter==='__ALL__'?'All':employeeDepartmentFilter} Employees`:'Employee Dashboard'),h('small',null,departmentViewOnly?'Nursing employee cards and personnel files — strictly view only.':employeeDepartmentFilter?'Tap an employee to open the Personnel File':'Select a department to view active employees')),fullHRAccess?h('div',{className:'employee-actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>onNavigate('HR Dashboard')},'← HR Dashboard'),h('button',{className:'btn btn-primary',onClick:()=>{setShow(true);setMsg('')}},'Create Employee')):h('span',{className:'badge'},'VIEW ONLY')),msg&&!show?h('div',{className:'message error'},msg):null,!departmentViewOnly&&employeeDepartmentFilter?h('button',{type:'button',className:'btn btn-secondary employee-back-departments',onClick:()=>setEmployeeDepartmentFilter('')},'← Departments'):null,!departmentViewOnly&&departmentDashboard,departmentViewOnly?nursingCards:(employeeDepartmentFilter?table:null),unlinkedLoginRegister),
      fullHRAccess?createModal:null,detailsModal,fullHRAccess?employmentActionModal():null,fullHRAccess?resetModal:null,fullHRAccess?repairModal:null,
      cameraConfig?h(CameraCaptureModal,{config:cameraConfig,onClose:()=>setCameraConfig(null)}):null,
      employeeToast&&h('div',{className:`samara-toast ${employeeToast.type}`,role:'status','aria-live':'polite'},
        h('span',{className:'samara-toast-icon','aria-hidden':'true'},employeeToast.type==='success'?'✓':'!'),
        h('div',null,
          h('strong',null,employeeToast.type==='success'?'Employee update successful':'Employee update failed'),
          h('span',null,employeeToast.text)
        ),
        h('button',{type:'button','aria-label':'Close notification',onClick:()=>setEmployeeToast(null)},'×')
      )
    );
  }


