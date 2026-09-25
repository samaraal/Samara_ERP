  function composePatientAddressGlobal(source={}){
    const line1=[source.house_no,source.street_name,source.apartment_name,source.flat_no?`Flat ${source.flat_no}`:''].filter(Boolean).join(', ');
    const line2=[source.locality_area,source.village_town,source.taluk,source.district,source.state,source.pincode].filter(Boolean).join(', ');
    return [line1,line2,source.landmark?`Landmark: ${source.landmark}`:''].filter(Boolean).join('\n');
  }

  function currentShift(){const h=new Date().getHours();return h>=7&&h<19?'Day Shift (7 AM–7 PM)':'Night Shift (7 PM–7 AM)'}
  function shiftForTime(value){const h=Number(String(value).slice(0,2));return h>=7&&h<19?'Day Shift (7 AM–7 PM)':'Night Shift (7 PM–7 AM)'}

  function Patients({profile,onNavigate}){
    const patientAddress=(source={})=>composePatientAddressGlobal(source);
    const canEdit=['Admin','Manager'].includes(profile?.role);
    const clinicalView=CLINICAL_ROLES.includes(profile?.role);
    const nursingManagerView=isNursingManagerProfile(profile);
    const [rows,setRows]=React.useState([]),[selected,setSelected]=React.useState(null),[details,setDetails]=React.useState(null),[photoUrl,setPhotoUrl]=React.useState(''),[tab,setTab]=React.useState('Overview');
    const [clinicalHistoryRange,setClinicalHistoryRange]=React.useState('7');
    const [clinicalHistoryDate,setClinicalHistoryDate]=React.useState(todayISOIndia());
    const consentResidentRef=React.useRef(null);consentResidentRef.current=selected?.id;
    const [patientSearch,setPatientSearch]=React.useState('');
    const [diagnosisDraft,setDiagnosisDraft]=React.useState('');
    const [allergyDraft,setAllergyDraft]=React.useState('');
    const [districtFilter,setDistrictFilter]=React.useState('All');
    const [patientQuickFilter,setPatientQuickFilter]=React.useState(()=>{
      try{
        const requested=sessionStorage.getItem('samara-patient-list-filter');
        sessionStorage.removeItem('samara-patient-list-filter');
        return ['active','assigned','awaiting','high-risk','duplicates','pending-consent'].includes(requested)?requested:'active';
      }catch(_error){return 'active'}
    });
    const [editTarget,setEditTarget]=React.useState(null),[editForm,setEditForm]=React.useState(null),[editBusy,setEditBusy]=React.useState(false),[editMsg,setEditMsg]=React.useState('');
    const [editFamilyAccess,setEditFamilyAccess]=React.useState({enabled:false,id:null,family_user_id:'',relative_name:'',relationship:'',country_code:'+91',mobile:'',email:'',primary_contact:true,is_active:true});
    const [editFamilyAccess2,setEditFamilyAccess2]=React.useState({enabled:false,id:null,family_user_id:'',relative_name:'',relationship:'',country_code:'+91',mobile:'',email:'',primary_contact:false,is_active:true});
    const [editDailyWhatsApp,setEditDailyWhatsApp]=React.useState({enabled:false,recipient_name:'',relationship:'',mobile:'',email:'',daily_report_time:'20:00'});
    const [editFamilyCredential,setEditFamilyCredential]=React.useState(null);
    const [editFamilyCredential2,setEditFamilyCredential2]=React.useState(null);
    const [familyResetBusy,setFamilyResetBusy]=React.useState(null);
    const [familyResetCredential,setFamilyResetCredential]=React.useState(null);
    const [familyPortalWaBusy,setFamilyPortalWaBusy]=React.useState('');
    const [dischargeWaBusy,setDischargeWaBusy]=React.useState('');
    const [dailyReportToggleBusy,setDailyReportToggleBusy]=React.useState(false);
    const [dailyQuickEdit,setDailyQuickEdit]=React.useState(null);
    const [dailyQuickEditBusy,setDailyQuickEditBusy]=React.useState(false);
    const [dailyQuickEditMsg,setDailyQuickEditMsg]=React.useState('');
    const [showFamilyDetails,setShowFamilyDetails]=React.useState(false);
    const [momentBusy,setMomentBusy]=React.useState(false);
    const [momentCaption,setMomentCaption]=React.useState('');
    const [momentFamilyVisible,setMomentFamilyVisible]=React.useState(true);
    const [momentInputKey,setMomentInputKey]=React.useState(0);
    const [momentRecording,setMomentRecording]=React.useState(false);
    const [momentRecordSeconds,setMomentRecordSeconds]=React.useState(0);
    const momentRecorderRef=React.useRef(null);
    const momentStreamRef=React.useRef(null);
    const momentChunksRef=React.useRef([]);
    const momentTimerRef=React.useRef(null);
    const [patientToast,setPatientToast]=React.useState(null);
    const patientToastTimer=React.useRef(null);
    const [duplicateReview,setDuplicateReview]=React.useState(null);
    const [duplicateReviewBusy,setDuplicateReviewBusy]=React.useState(false);
    const [patientConsentBusyId,setPatientConsentBusyId]=React.useState(null);
    function showPatientToast(type,text){
      clearTimeout(patientToastTimer.current);
      setPatientToast({type,text});
      patientToastTimer.current=setTimeout(()=>setPatientToast(null),4500);
    }
    React.useEffect(()=>()=>clearTimeout(patientToastTimer.current),[]);
    const [editMeds,setEditMeds]=React.useState([]),[editCare,setEditCare]=React.useState([]);
    const [editPhysio,setEditPhysio]=React.useState({
      required:false,
      id:null,
      therapy_type:'',
      physiotherapist_name:'',
      frequency:'Daily',
      preferred_time:'10:00',
      precautions:'',
      advised_by:'',
      start_date:'',
      end_date:'',
      is_active:true
    });
    const [roomBeds,setRoomBeds]=React.useState([]);
    const [editDocs,setEditDocs]=React.useState([]),[editPhotoUrl,setEditPhotoUrl]=React.useState(''),[editCameraConfig,setEditCameraConfig]=React.useState(null);
    const [editUploads,setEditUploads]=React.useState({photo:[],identity:[],prescription:[],discharge:[],reports:[],other:[]});
    async function load(){const {data,error}=await client.from('patients').select('*').order('created_at',{ascending:false});if(error)console.error(error);setRows(data||[])}
    React.useEffect(()=>{const loadRooms=async()=>{const {data}=await client.from('room_beds').select('*').order('room_no').order('bed_no');setRoomBeds(data||[])};load();loadRooms();const timer=setInterval(load,30000);window.addEventListener('focus',load);const ch=client.channel('patients-live').on('postgres_changes',{event:'*',schema:'public',table:'patients'},load).on('postgres_changes',{event:'*',schema:'public',table:'room_beds'},loadRooms).subscribe();return()=>{clearInterval(timer);window.removeEventListener('focus',load);client.removeChannel(ch)}},[]);
    async function resolvePatientPhoto(p){
      let path=p.photo_storage_path||'';
      if(!path){
        const {data}=await client.from('patient_documents').select('storage_path').eq('patient_id',p.id).in('document_type',['Patient Photo','Patient Photograph']).order('created_at',{ascending:false}).limit(1).maybeSingle();
        path=data?.storage_path||'';
        if(path)await client.from('patients').update({photo_storage_path:path}).eq('id',p.id);
      }
      if(!path)return '';
      const {data}=await client.storage.from('patient-documents').createSignedUrl(path,900);
      return data?.signedUrl||'';
    }
    function dedupeFamilyAccessRows(rows){
      const ranked=[...(rows||[])].sort((a,b)=>{const active=Number(b?.is_active!==false)-Number(a?.is_active!==false);if(active)return active;const primary=Number(!!b?.primary_contact)-Number(!!a?.primary_contact);if(primary)return primary;return new Date(b?.updated_at||b?.created_at||0)-new Date(a?.updated_at||a?.created_at||0);});
      const seen=new Set();
      return ranked.filter(row=>{const mobile=String(row?.mobile||'').replace(/\D/g,'').slice(-10);const name=String(row?.relative_name||'').trim().toLowerCase().replace(/\s+/g,' ');const key=`${mobile}|${name}`;if(!mobile)return true;if(seen.has(key))return false;seen.add(key);return true;});
    }
    function displayDailyReportTime(value){if(!value)return 'Not scheduled';const parts=String(value).slice(0,5).split(':');const hh=Number(parts[0]),mm=parts[1]||'00';if(!Number.isFinite(hh))return String(value);const suffix=hh>=12?'PM':'AM';const hour=hh%12||12;return `${hour}:${mm} ${suffix}`;}
    async function openPatient(p,desiredTab='Overview'){
      setSelected(p);setPhotoUrl('');setTab(desiredTab);
      const [m,ma,mr,mri,c,cl,v,ph,ps,d,meal,bill,rec,inc,fam,mom,wa,pref,reportWa,proc,hand,discharges,url]=await Promise.all([
        client.from('medication_orders').select('*').eq('patient_id',p.id).order('created_at',{ascending:false}),
        client.from('medication_administrations').select('*').eq('patient_id',p.id).order('scheduled_date',{ascending:false}).limit(100),
        client.from('medication_reviews').select('*').eq('patient_id',p.id).order('reviewed_at',{ascending:false}),
        client.from('medication_review_items').select('*').order('created_at',{ascending:false}).limit(2000),
        client.from('care_orders').select('*').eq('patient_id',p.id).order('created_at',{ascending:false}),
        client.from('care_logs').select('*').eq('patient_id',p.id).order('created_at',{ascending:false}).limit(100),
        client.from('vital_signs').select('*').eq('patient_id',p.id).order('recorded_at',{ascending:false}).limit(100),
        client.from('physiotherapy_plans').select('*').eq('patient_id',p.id).order('created_at',{ascending:false}),
        client.from('physiotherapy_sessions').select('*').eq('patient_id',p.id).order('session_date',{ascending:false}).limit(100),
        client.from('patient_documents').select('*').eq('patient_id',p.id).order('created_at',{ascending:false}),
        client.from('meal_records').select('*').eq('patient_id',p.id).order('served_at',{ascending:false}).limit(100),
        client.from('billing_transactions').select('*').eq('patient_id',p.id).order('transaction_date',{ascending:false}).limit(200),
        client.from('recovery_events').select('*').eq('patient_id',p.id).order('event_at',{ascending:false}).limit(100),
        client.from('incidents').select('*').eq('patient_id',p.id).order('incident_at',{ascending:false}).limit(100),
        canEdit?client.from('family_portal_access').select('id,family_user_id,relative_name,relationship,mobile,email,primary_contact,is_active,last_login_at,created_at,updated_at').eq('patient_id',p.id).order('primary_contact',{ascending:false}).order('created_at',{ascending:true}):Promise.resolve({data:[]}),
        client.from('patient_daily_moments').select('*').eq('patient_id',p.id).gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}),
        canEdit?client.from('hr_whatsapp_communications').select('id,recipient_number,template_name,status,provider_message_id,message_payload,created_at').in('template_name',['samara_family_portal_access','samara_patient_admission','samara_discharge_confirmation']).order('created_at',{ascending:false}).limit(500):Promise.resolve({data:[]}),
        canEdit?client.from('patient_family_communication_preferences').select('*').eq('patient_id',p.id).maybeSingle():Promise.resolve({data:null}),
        canEdit?client.from('patient_communications').select('*').eq('patient_id',p.id).order('created_at',{ascending:false}).limit(50):Promise.resolve({data:[]}),
        client.from('bill_charge_requests').select('id,patient_id,charge_date,service_datetime,category,service_name,description,quantity,unit,status,approval_status,remarks,raised_by_name,raised_at,created_at').eq('patient_id',p.id).eq('category','Nursing Procedures').order('service_datetime',{ascending:false}).limit(100),
        client.from('shift_handovers').select('*').eq('patient_id',p.id).order('created_at',{ascending:false}).limit(100),
        canEdit?client.from('patient_discharges').select('*').eq('patient_id',p.id).order('updated_at',{ascending:false}).limit(20):Promise.resolve({data:[]}),
        resolvePatientPhoto(p)
      ]);
      const momentRows=await Promise.all((mom?.data||[]).map(async row=>{
        const {data:signed}=await client.storage.from('patient-daily-moments').createSignedUrl(row.storage_path,900);
        return {...row,signed_url:signed?.signedUrl||''};
      }));
      const allMedicationOrders=m.data||[];
      const todayMar=(ma.data||[]).filter(row=>String(row.scheduled_date||'')===todayISOIndia());
      setDetails({
        meds:currentUpcomingMedicineOrders(allMedicationOrders),
        medHistory:allMedicationOrders,
        medicationReviews:mr?.data||[],
        medicationReviewItems:(mri?.data||[]).filter(item=>(mr?.data||[]).some(review=>review.id===item.review_id)),
        medicationReviewError:[mr?.error,mri?.error].filter(Boolean).map(error=>error.message).join(' | '),
        mar:todayMar,
        allMar:ma.data||[],
        care:c.data||[],careLogs:cl.data||[],vitals:v.data||[],physio:ph.data||[],physioSessions:ps.data||[],docs:d.data||[],meals:meal.data||[],billing:bill.data||[],recovery:rec.data||[],incidents:inc.data||[],familyAccess:dedupeFamilyAccessRows(fam?.data||[]),dailyMoments:momentRows,familyWhatsApp:wa?.data||[],familyPreference:pref?.data||null,reportWhatsApp:reportWa?.data||[],nursingProcedures:proc?.data||[],handovers:hand?.data||[],discharges:discharges?.data||[]
      });
      setPhotoUrl(url);
    }

    function admissionWhatsAppSent(access){
      const recipient=normalizeWhatsAppRecipient(access?.mobile||'');
      if(!recipient)return false;
      return (details?.familyWhatsApp||[]).some(row=>{
        if(row?.template_name!=='samara_patient_admission')return false;
        if(normalizeWhatsAppRecipient(row.recipient_number)!==recipient)return false;
        const payload=row.message_payload||{};
        const linked=[payload.patient_db_id,payload.patient_id,payload.patient_code].filter(Boolean).map(String);
        return !linked.length||linked.includes(String(selected?.id||''))||linked.includes(String(selected?.patient_id||''));
      });
    }

    function familyPortalWhatsAppSent(access){
      const recipient=normalizeWhatsAppRecipient(access?.mobile||'');
      if(!recipient)return false;
      return (details?.familyWhatsApp||[]).some(row=>{
        if(row?.template_name!=='samara_family_portal_access')return false;
        if(normalizeWhatsAppRecipient(row.recipient_number)!==recipient)return false;
        const payload=row.message_payload||{};
        const linked=[payload.patient_id,payload.patient_code].filter(Boolean).map(String);
        return !linked.length||linked.includes(String(selected?.id||''))||linked.includes(String(selected?.patient_id||''));
      });
    }

    function primaryFamilyContact(){
      const list=details?.familyAccess||[];
      return list.find(row=>row.is_active!==false&&row.primary_contact)||list.find(row=>row.is_active!==false)||list[0]||null;
    }

    async function toggleDailyPatientReportWhatsApp(){
      if(!selected?.id||dailyReportToggleBusy)return;
      const pref=details?.familyPreference||null;
      const currentlyEnabled=!!pref?.daily_whatsapp_enabled;
      const access=primaryFamilyContact();
      const recipientName=String(pref?.recipient_name||access?.relative_name||selected?.attendant_name||'').trim();
      const relationship=String(pref?.relationship||access?.relationship||'').trim()||null;
      const mobile=String(pref?.recipient_mobile||access?.mobile||selected?.attendant_phone||'').replace(/\D/g,'').slice(-10);
      const email=String(pref?.recipient_email||access?.email||'').trim()||null;
      const portalEnabled=pref?!!pref.family_portal_enabled:!!access;
      if(!currentlyEnabled&&(!recipientName||mobile.length!==10)){
        showPatientToast('error','Please set the authorised family member and WhatsApp number first.');
        await openEditPatient(selected);
        return;
      }
      const enable=!currentlyEnabled;
      const mode=portalEnabled&&enable?'Both':enable?'Daily WhatsApp Update':'Family Portal Access';
      const payload={patient_id:selected.id,delivery_mode:mode,family_portal_enabled:portalEnabled,daily_whatsapp_enabled:enable,recipient_name:recipientName||'Family Member',relationship,recipient_mobile:mobile||null,recipient_email:email,daily_report_time:enable?String(pref?.daily_report_time||'20:00').slice(0,5):null,timezone:pref?.timezone||'Asia/Kolkata',is_active:portalEnabled||enable,updated_at:new Date().toISOString()};
      setDailyReportToggleBusy(true);
      try{
        const {data,error}=await client.from('patient_family_communication_preferences').upsert(payload,{onConflict:'patient_id'}).select().single();
        if(error)throw error;
        setDetails(prev=>prev?{...prev,familyPreference:data}:prev);
        showPatientToast('success',enable?`Daily Patient Report WhatsApp enabled for ${displayDailyReportTime(payload.daily_report_time)}.`:'Daily Patient Report WhatsApp disabled.');
      }catch(error){showPatientToast('error',error?.message||'Could not update Daily Patient Report WhatsApp.');}
      finally{setDailyReportToggleBusy(false)}
    }

    function previewFamilyPortal(){
      if(!selected||!details)return;
      const family=(details.familyAccess||[]).filter(x=>x.is_active!==false);
      const access=family.find(x=>x.primary_contact)||family[0]||{};
      const previewId=(window.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`);
      const portalOrigin='https://family.samaraassistedliving.com';
      const dashboard={
        patient:{
          patient_name:formalName(selected)||selected.full_name||'Resident',
          patient_code:selected.patient_id||selected.patient_code||'',
          room_no:selected.room_no||'',bed_no:selected.bed_no||'',admission_date:selected.admission_date||null,
          is_active:selected.is_active!==false,admission_status:selected.admission_status||selected.status||null,
          discharge_date:selected.discharge_date||null
        },
        discharge:(details.discharges||[]).find(x=>String(x.status||'').toLowerCase()==='completed')||(details.discharges||[])[0]||null,
        medication_orders:(details.medHistory||details.meds||[]),
        medication_administrations:(details.allMar||details.mar||[]).map(x=>({...x,order_id:x.order_id||x.medication_order_id||x.medication_order_uuid||null,administered_at:x.administered_at||x.actual_time||x.completed_at||x.created_at})),
        care_orders:details.care||[],care_logs:details.careLogs||[],
        vitals:(details.vitals||[]).map(x=>({...x,systolic:x.systolic??x.bp_systolic??null,diastolic:x.diastolic??x.bp_diastolic??null,temperature:x.temperature??x.temp??null})),
        physio_plans:details.physio||[],physio_sessions:details.physioSessions||[],
        meals:details.meals||[],billing:details.billing||[],documents:details.docs||[],
        daily_moments:details.dailyMoments||[]
      };
      const session={
        admin_preview:true,access_id:access.id||'admin-preview',patient_uuid:selected.id,
        patient_code:selected.patient_id||selected.patient_code||'',patient_name:formalName(selected)||selected.full_name||'Resident',
        room_no:selected.room_no||'',bed_no:selected.bed_no||'',admission_date:selected.admission_date||null,
        relative_name:access.relative_name||'Authorised Family Member',relationship:access.relationship||'Authorised Relative'
      };
      let popup=null;
      const handler=event=>{
        if(event.origin!==portalOrigin||event.source!==popup)return;
        if(event.data?.type!=='SAMARA_FAMILY_ADMIN_PREVIEW_REQUEST'||event.data?.preview_id!==previewId)return;
        popup.postMessage({type:'SAMARA_FAMILY_ADMIN_PREVIEW_DATA',preview_id:previewId,session,dashboard},portalOrigin);
      };
      window.addEventListener('message',handler);
      popup=window.open(`${portalOrigin}/?admin_preview=${encodeURIComponent(previewId)}`,'_blank');
      if(!popup){window.removeEventListener('message',handler);showPatientToast('error','Please allow pop-ups to open the Family Portal preview.');return}

      // Send the preview payload proactively as well as responding to the portal request.
      // This avoids relying on window.opener, which some browsers/privacy settings sever
      // for cross-origin tabs. The Family Portal validates both origin and preview_id.
      const previewMessage={type:'SAMARA_FAMILY_ADMIN_PREVIEW_DATA',preview_id:previewId,session,dashboard};
      const sendPreview=()=>{try{if(popup&&!popup.closed)popup.postMessage(previewMessage,portalOrigin)}catch(_){}};
      [400,900,1600,2800,4500,7000].forEach(ms=>window.setTimeout(sendPreview,ms));
      window.setTimeout(()=>window.removeEventListener('message',handler),15000);
    }

    function openPatientWhatsApp(openEmergency=false){
      const access=primaryFamilyContact();
      const phone=normalizeWhatsAppRecipient(access?.mobile||selected?.attendant_phone||selected?.mobile||'');
      if(!phone){showPatientToast('error','Authorised family WhatsApp number is not available.');return}
      try{sessionStorage.setItem('samara_patient_whatsapp_context',JSON.stringify({phone,contact_name:access?.relative_name||selected?.attendant_name||'Family Member',patient_id:selected?.id||null,patient_code:selected?.patient_id||null,patient_name:formalName(selected)||selected?.full_name||'Patient',open_emergency:Boolean(openEmergency)}))}catch(_error){}
      setSelected(null);setDetails(null);setPhotoUrl('');setShowFamilyDetails(false);
      onNavigate?.('WhatsApp Inbox');
    }

    function familyCorrespondenceAddress(){
      return selected?.attendant_address||selected?.family_address||selected?.relative_address||patientAddress(selected)||selected?.address||'Not recorded';
    }

    async function sendPatientAdmissionWhatsApp(access,{resend=false}={}){
      if(!access?.id||familyPortalWaBusy)return;
      setFamilyPortalWaBusy(access.id);
      try{
        const recipient=access.relative_name||'Family Member';
        const patientName=formalName(selected)||selected?.full_name||'Patient';
        const admissionDate=formatDateIN(selected?.admission_date);
        const credential={
          patient_db_id:selected?.id||null,
          patient_id:selected?.patient_id||selected?.patient_code||'',
          patient_name:patientName,
          relative_name:recipient,
          mobile:access.mobile,
          admission_date:selected?.admission_date||'',
          room_bed:[selected?.room_no,selected?.bed_no].filter(Boolean).join(' / ')
        };
        const result=await sendWhatsAppTemplate({
          to:access.mobile,
          templateName:'samara_patient_admission',
          languageCode:'en',
          bodyParams:[recipient,patientName,admissionDate,credential.patient_id||'—',credential.room_bed||'—'],
          communicationLog:{
            communication_type:`Patient Admission Notification${resend?' · Resent':''}`,
            message_content:`Dear ${recipient},\n\n${patientName} was admitted to Samara Assisted Living on ${admissionDate}.\nResident ID: ${credential.patient_id||'—'}\nRoom / Bed: ${credential.room_bed||'—'}`,
            contact_name:recipient,
            source_type:'Patient / Family · Admission',
            sent_by:profile?.id||null,
            sent_by_name:formalName(profile)||'Samara Management',
            message_payload:{patient_db_id:selected?.id||null,patient_id:selected?.patient_id||null,patient_code:selected?.patient_id||null,patient_name:patientName,admission_date:admissionDate,resend:Boolean(resend),automatic:false}
          }
        });
        if(result?.history_logged===true)setDetails(current=>current?{...current,familyWhatsApp:[{id:`accepted-${result.provider_message_id}`,recipient_number:normalizeWhatsAppRecipient(access.mobile),template_name:'samara_patient_admission',status:'Accepted',provider_message_id:result.provider_message_id,message_payload:{patient_db_id:selected?.id||null,patient_id:selected?.patient_id||null,patient_code:selected?.patient_id||null,resend:Boolean(resend)},created_at:new Date().toISOString()},...(current.familyWhatsApp||[])]}:current);
        await client.from('audit_log').insert({user_id:profile?.id||null,action:'ADMISSION_WHATSAPP_SENT',entity:'patients',entity_id:selected?.id||null,details:{patient_id:selected?.patient_id||null,recipient:normalizeWhatsAppRecipient(access.mobile),provider_message_id:result?.provider_message_id||null,resend:Boolean(resend)}}).then(({error})=>{if(error)console.warn('Admission WhatsApp audit logging failed:',error)});
        showPatientToast('success',resend?'Admission WhatsApp resent.':'Admission WhatsApp accepted by Meta.');
      }catch(error){
        showPatientToast('error',`Admission WhatsApp API failed: ${error.message||error}.`);
      }finally{
        setFamilyPortalWaBusy('');
      }
    }

    function completedPatientDischarge(){
      return (details?.discharges||[]).find(row=>String(row?.status||'').toLowerCase()==='completed')||null;
    }

    async function resendPatientDischargeWhatsApp(access){
      const discharge=completedPatientDischarge();
      if(!discharge){showPatientToast('error','No completed discharge record is available for this resident.');return}
      if(!access?.mobile){showPatientToast('error','Registered family WhatsApp number is not available.');return}
      if(dischargeWaBusy)return;
      const busyKey=`discharge-${access.id||'family'}`;
      setDischargeWaBusy(busyKey);
      try{
        const recipient=access.relative_name||selected?.attendant_name||discharge.relative_name||'Family Member';
        const patientName=formalName(selected)||selected?.full_name||'Patient';
        const departureAt=discharge.actual_departure_at||discharge.updated_at||discharge.created_at;
        const departureDate=formatDateIN(String(departureAt||'').slice(0,10));
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
        const result=await sendWhatsAppTemplate({
          to:access.mobile,
          templateName:'samara_discharge_confirmation',
          languageCode:'en',
          bodyParams:[recipient,patientName,departureDate,departureTime],
          communicationLog:{
            communication_type:'Discharge Confirmation Resent',
            message_content:renderedMessage,
            contact_name:recipient,
            source_type:'Patient / Family · Discharge',
            sent_by:profile?.id||null,
            sent_by_name:formalName(profile)||profile?.full_name||'Samara Management',
            message_payload:{discharge_id:discharge.id,patient_id:selected?.id||null,patient_code:selected?.patient_id||null,patient_name:patientName,resend:true,automatic:false,body_params:[recipient,patientName,departureDate,departureTime],button_text:'View Family Portal',button_url:'https://family.samaraassistedliving.com'}
          }
        });
        const now=new Date().toISOString();
        const updateResult=await client.from('patient_discharges').update({discharge_whatsapp_sent_at:now,discharge_whatsapp_message_id:result.provider_message_id,discharge_whatsapp_status:'Accepted',updated_at:now}).eq('id',discharge.id);
        if(updateResult.error)console.warn('Discharge WhatsApp status could not be saved:',updateResult.error);
        setDetails(current=>current?{...current,discharges:(current.discharges||[]).map(row=>row.id===discharge.id?{...row,discharge_whatsapp_sent_at:now,discharge_whatsapp_message_id:result.provider_message_id,discharge_whatsapp_status:'Accepted',updated_at:now}:row),familyWhatsApp:result?.history_logged===true?[{id:`accepted-${result.provider_message_id}`,recipient_number:normalizeWhatsAppRecipient(access.mobile),template_name:'samara_discharge_confirmation',status:'Accepted',provider_message_id:result.provider_message_id,message_payload:{discharge_id:discharge.id,patient_id:selected?.id||null,patient_code:selected?.patient_id||null,resend:true},created_at:now},...(current.familyWhatsApp||[])]:current.familyWhatsApp}:current);
        showPatientToast(result?.history_logged===true?'success':'warning',result?.history_logged===true?'Discharge confirmation WhatsApp resent and recorded in WhatsApp Inbox.':'Meta accepted the discharge confirmation. Inbox logging could not be confirmed; do not resend solely for this warning.');
      }catch(error){
        showPatientToast('error',`Discharge WhatsApp API failed: ${error.message||error}.`);
      }finally{
        setDischargeWaBusy('');
      }
    }

    async function sendPatientPortalWhatsApp(access,{resend=false}={}){
      if(!access?.id||familyPortalWaBusy)return;
      setFamilyPortalWaBusy(access.id);
      try{
        const recipient=access.relative_name||'Family Member';
        const patientName=formalName(selected)||selected?.full_name||'Patient';
        const result=await sendWhatsAppTemplate({
          to:access.mobile,
          templateName:'samara_family_portal_access',
          languageCode:'en',
          bodyParams:familyPortalTemplateParams({
            relativeName:access.relative_name,
            patientName,
            admissionDate:formatDateIN(selected?.admission_date),
            patientId:selected?.patient_id,
            reason:selected?.patient_category||'Assisted living care',
            proposedStay:selected?.patient_category==='Short Stay'?'Short stay – as agreed':'As per agreed care plan',
            roomBed:[selected?.room_no,selected?.bed_no].filter(Boolean).join(' / ')
          }),
          communicationLog:{
            communication_type:`Family Portal Access${resend?' · Resent':''}`,
            message_content:`Meta template: samara_family_portal_access\nExact body variables submitted to Meta:\n1. ${access.relative_name||'Family Member'}\n2. ${patientName}\n3. ${formatDateIN(selected?.admission_date)}\n4. ${selected?.patient_id||'—'}\n5. ${selected?.patient_category||'Assisted living care'}\n6. ${selected?.patient_category==='Short Stay'?'Short stay – as agreed':'As per agreed care plan'}\n7. ${[selected?.room_no,selected?.bed_no].filter(Boolean).join(' / ')||'—'}`,
            contact_name:recipient,
            source_type:'Patient / Family · Family Portal',
            sent_by:profile?.id||null,
            sent_by_name:formalName(profile)||'Samara Management',
            message_payload:{patient_id:selected?.id||null,patient_code:selected?.patient_id||null,patient_name:patientName,portal:'https://family.samaraassistedliving.com',resend:Boolean(resend)}
          }
        });
        if(result?.history_logged===true)setDetails(current=>current?{...current,familyWhatsApp:[{id:`accepted-${result.provider_message_id}`,recipient_number:normalizeWhatsAppRecipient(access.mobile),template_name:'samara_family_portal_access',status:'Accepted',provider_message_id:result.provider_message_id,message_payload:{patient_id:selected?.id||null,patient_code:selected?.patient_id||null,resend:Boolean(resend)},created_at:new Date().toISOString()},...(current.familyWhatsApp||[])]}:current);
        showPatientToast(result?.history_logged===true?'success':'error',result?.history_logged===true?(resend?'Family Portal WhatsApp resent and recorded in WhatsApp Inbox.':'Family Portal WhatsApp accepted by Meta and recorded in WhatsApp Inbox.'):'WhatsApp was accepted by Meta, but Inbox logging failed. Check the deployed whatsapp-send function.');
      }catch(error){
        showPatientToast('error',`Family Portal WhatsApp API failed: ${error.message||error}. Use the Existing Method button only if you want to send manually.`);
      }finally{
        setFamilyPortalWaBusy('');
      }
    }

    async function videoDurationSeconds(file){
      return await new Promise((resolve,reject)=>{
        const video=document.createElement('video');
        const objectUrl=URL.createObjectURL(file);
        video.preload='metadata';
        video.onloadedmetadata=()=>{const d=Number(video.duration||0);URL.revokeObjectURL(objectUrl);resolve(d)};
        video.onerror=()=>{URL.revokeObjectURL(objectUrl);reject(new Error('Unable to read this video. Please record or choose another clip.'))};
        video.src=objectUrl;
      });
    }

    function stopDailyMomentRecording(){
      if(momentTimerRef.current){clearInterval(momentTimerRef.current);momentTimerRef.current=null}
      const recorder=momentRecorderRef.current;
      if(recorder&&recorder.state!=='inactive')recorder.stop();
    }

    async function startDailyMomentRecording(){
      if(momentBusy||momentRecording)return;
      if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){
        document.getElementById('daily-moment-record-video')?.click();
        return;
      }
      try{
        const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:480,max:540},height:{ideal:854,max:960}},audio:{channelCount:1,sampleRate:32000}});
        momentStreamRef.current=stream;
        momentChunksRef.current=[];
        let recorder;
        const preferred=['video/mp4','video/webm;codecs=vp8,opus','video/webm'];
        const mime=preferred.find(x=>MediaRecorder.isTypeSupported?.(x));
        recorder=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),videoBitsPerSecond:600000,audioBitsPerSecond:64000});
        momentRecorderRef.current=recorder;
        recorder.ondataavailable=e=>{if(e.data&&e.data.size)momentChunksRef.current.push(e.data)};
        recorder.onstop=async()=>{
          if(momentTimerRef.current){clearInterval(momentTimerRef.current);momentTimerRef.current=null}
          stream.getTracks().forEach(t=>t.stop());momentStreamRef.current=null;
          setMomentRecording(false);setMomentRecordSeconds(0);
          const type=recorder.mimeType||'video/webm';
          const blob=new Blob(momentChunksRef.current,{type});momentChunksRef.current=[];
          if(!blob.size)return;
          const ext=type.includes('mp4')?'mp4':'webm';
          await uploadDailyMoment(new File([blob],`daily-moment-${Date.now()}.${ext}`,{type}));
        };
        recorder.start(250);setMomentRecording(true);setMomentRecordSeconds(0);
        const started=Date.now();
        momentTimerRef.current=setInterval(()=>{
          const elapsed=Math.min(10,Math.floor((Date.now()-started)/1000));setMomentRecordSeconds(elapsed);
          if(Date.now()-started>=10000)stopDailyMomentRecording();
        },250);
      }catch(error){
        momentStreamRef.current?.getTracks?.().forEach(t=>t.stop());momentStreamRef.current=null;setMomentRecording(false);
        showPatientToast('error',error?.name==='NotAllowedError'?'Camera/microphone permission is required to record a Daily Moment.':(error.message||'Unable to open the camera.'));
      }
    }

    async function uploadDailyMoment(file){
      if(!selected||!file)return;
      if(!/^video\//i.test(file.type||'')){showPatientToast('error','Please choose a video clip.');return}
      if(file.size>8*1024*1024){showPatientToast('error','Daily Moment video must be 8 MB or less. For smaller files, please use Record Video.');return}
      setMomentBusy(true);
      try{
        const duration=await videoDurationSeconds(file);
        if(!Number.isFinite(duration)||duration<=0)throw new Error('Unable to confirm the video duration.');
        if(duration>10.5)throw new Error('Daily Moments are limited to 10 seconds. Please record a new clip of 10 seconds or less.');
        const ext=(String(file.name||'').split('.').pop()||'mp4').replace(/[^a-z0-9]/gi,'').toLowerCase()||'mp4';
        const stamp=new Date().toISOString().slice(0,10);
        const uid=(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`);
        const path=`${selected.id}/${stamp}/${uid}.${ext}`;
        const {error:uploadError}=await client.storage.from('patient-daily-moments').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type||'video/mp4'});
        if(uploadError)throw uploadError;
        const expiresAt=new Date(Date.now()+7*24*60*60*1000).toISOString();
        const {error:insertError}=await client.from('patient_daily_moments').insert({
          patient_id:selected.id,
          storage_path:path,
          caption:String(momentCaption||'').trim()||null,
          duration_seconds:Math.round(duration),
          file_size_bytes:file.size,
          mime_type:file.type||'video/mp4',
          family_visible:!!momentFamilyVisible,
          uploaded_by:profile?.id||null,
          expires_at:expiresAt
        });
        if(insertError){await client.storage.from('patient-daily-moments').remove([path]);throw insertError}
        setMomentCaption('');setMomentFamilyVisible(true);setMomentInputKey(x=>x+1);
        await openPatient(selected,'Daily Moments');
        showPatientToast('success','Daily Moment uploaded. It will be removed automatically after 7 days.');
      }catch(error){showPatientToast('error',error.message||'Unable to upload Daily Moment.')}finally{setMomentBusy(false)}
    }

    async function deleteDailyMoment(moment){
      if(!moment)return;
      const allowed=canEdit||String(moment.uploaded_by||'')===String(profile?.id||'');
      if(!allowed){showPatientToast('error','Only the uploader, Manager or Admin can delete this clip.');return}
      if(!window.confirm('Delete this Daily Moment now?'))return;
      setMomentBusy(true);
      try{
        await client.storage.from('patient-daily-moments').remove([moment.storage_path]);
        const {error}=await client.from('patient_daily_moments').delete().eq('id',moment.id);
        if(error)throw error;
        await openPatient(selected,'Daily Moments');
        showPatientToast('success','Daily Moment deleted.');
      }catch(error){showPatientToast('error',error.message||'Unable to delete Daily Moment.')}finally{setMomentBusy(false)}
    }
    async function openDoc(doc){if(doc.storage_path){const {data,error}=await client.storage.from('patient-documents').createSignedUrl(doc.storage_path,180);if(error)return alert(error.message);window.open(data.signedUrl,'_blank','noopener')}else if(doc.document_url)window.open(doc.document_url,'_blank','noopener')}
    async function loadEditMedia(row){
      const [{data:docs},url]=await Promise.all([
        client.from('patient_documents').select('*').eq('patient_id',row.id).order('created_at',{ascending:false}),
        resolvePatientPhoto(row)
      ]);
      setEditDocs(docs||[]);setEditPhotoUrl(url||'');
    }
    async function openEditPatient(row){
      setEditTarget(row);setEditMsg('');setEditUploads({photo:[],identity:[],prescription:[],discharge:[],reports:[],other:[]});setEditDocs([]);setEditPhotoUrl('');
      setEditForm({...row,
        title:row.title||'',full_name:row.full_name||'',age:row.age||'',gender:row.gender||'Male',mobile:row.mobile||'',address:row.address||'',
        state:row.state||'Tamil Nadu',district:row.district||'',taluk:row.taluk||'',village_town:row.village_town||'',
        locality_area:row.locality_area||'',street_name:row.street_name||'',house_no:row.house_no||'',
        apartment_name:row.apartment_name||'',flat_no:row.flat_no||'',landmark:row.landmark||'',pincode:row.pincode||'',
        attendant_name:row.attendant_name||'',attendant_phone:row.attendant_phone||'',diagnosis:row.diagnosis||'',
        referring_doctor:row.referring_doctor||'',treating_doctor:row.treating_doctor||'',doctor_phone:row.doctor_phone||'',
        hospital_name:row.hospital_name||'',admission_type:row.admission_type||'Direct Admission',patient_category:row.patient_category||'Short Stay',
        room_no:row.room_no||'',bed_no:row.bed_no||'',allergies:row.allergies||'',special_instructions:row.special_instructions||'',
        admission_date:row.admission_date||'',is_active:row.is_active!==false
      });
      const [{data:existingMeds},{data:existingCare},{data:existingPhysio},{data:existingFamily},{data:existingComm}]=await Promise.all([
        client.from('medication_orders').select('*').eq('patient_id',row.id).order('created_at'),
        client.from('care_orders').select('*').eq('patient_id',row.id).order('created_at'),
        client.from('physiotherapy_plans').select('*').eq('patient_id',row.id).order('created_at',{ascending:false}).limit(1).maybeSingle(),
        client.from('family_portal_access').select('id,family_user_id,relative_name,relationship,mobile,email,primary_contact,is_active').eq('patient_id',row.id).eq('is_active',true).order('primary_contact',{ascending:false}).order('updated_at',{ascending:false}),
        client.from('patient_family_communication_preferences').select('*').eq('patient_id',row.id).maybeSingle()
      ]);
      const familyRows=Array.isArray(existingFamily)?existingFamily:existingFamily?[existingFamily]:[];
      const primaryFamily=familyRows.find(x=>x.primary_contact)||familyRows[0]||null;
      const secondaryFamily=familyRows.find(x=>x.id!==primaryFamily?.id)||null;
      const primaryPhone=splitGlobalPhone(primaryFamily?.mobile||row.attendant_phone||'');
      const secondaryPhone=splitGlobalPhone(secondaryFamily?.mobile||row.attendant_alternative_phone||'');
      setEditFamilyAccess(primaryFamily?{enabled:true,...primaryFamily,...primaryPhone}:{enabled:false,id:null,family_user_id:'',relative_name:row.attendant_name||'',relationship:'',...primaryPhone,email:'',primary_contact:true,is_active:true});
      setEditFamilyAccess2(secondaryFamily?{enabled:true,...secondaryFamily,...secondaryPhone,primary_contact:false}:{enabled:false,id:null,family_user_id:'',relative_name:'',relationship:'',...secondaryPhone,email:'',primary_contact:false,is_active:true});
      setEditDailyWhatsApp({enabled:!!existingComm?.daily_whatsapp_enabled,recipient_name:existingComm?.recipient_name||primaryFamily?.relative_name||row.attendant_name||'',relationship:existingComm?.relationship||primaryFamily?.relationship||'',mobile:String(existingComm?.recipient_mobile||primaryFamily?.mobile||row.attendant_phone||'').replace(/\D/g,'').slice(-10),email:existingComm?.recipient_email||primaryFamily?.email||'',daily_report_time:String(existingComm?.daily_report_time||'20:00').slice(0,5)});
      setEditFamilyCredential(null);setEditFamilyCredential2(null);
      setEditMeds(currentUpcomingMedicineOrders(existingMeds||[]).map(m=>({...blankMedicine(),...m,times:Array.isArray(m.scheduled_times)?m.scheduled_times.join(', '):(m.times||''),custom_duration_days:m.duration_days||''})));
      setEditCare((existingCare||[]).map(c=>({...blankCare(),...c})));
      setEditPhysio(existingPhysio?{
        required:existingPhysio.is_active!==false,
        id:existingPhysio.id,
        therapy_type:existingPhysio.therapy_type||'',
        physiotherapist_name:existingPhysio.physiotherapist_name||'',
        frequency:existingPhysio.frequency||'Daily',
        preferred_time:existingPhysio.preferred_time||'10:00',
        precautions:existingPhysio.precautions||'',
        advised_by:existingPhysio.advised_by||row.treating_doctor||row.referring_doctor||'',
        start_date:existingPhysio.start_date||row.admission_date||todayISOIndia(),
        end_date:existingPhysio.end_date||'',
        is_active:existingPhysio.is_active!==false
      }:{
        required:false,id:null,therapy_type:'',physiotherapist_name:'',frequency:'Daily',preferred_time:'10:00',precautions:'',
        advised_by:row.treating_doctor||row.referring_doctor||'',start_date:row.admission_date||todayISOIndia(),end_date:'',is_active:true
      });
      await loadEditMedia(row);
    }
    function updateEditMed(i,key,value){setEditMeds(editMeds.map((m,n)=>n===i?{...m,[key]:value}:m))}
    function updateEditCare(i,key,value){setEditCare(editCare.map((c,n)=>n===i?{...c,[key]:value}:c))}
    function addEditFiles(key,files,replace=false){
      const picked=Array.from(files||[]);setEditUploads(prev=>({...prev,[key]:replace?picked.slice(0,1):[...(prev[key]||[]),...picked]}));
      if(key==='photo'&&picked[0]){if(editPhotoUrl&&editPhotoUrl.startsWith('blob:'))URL.revokeObjectURL(editPhotoUrl);setEditPhotoUrl(URL.createObjectURL(picked[0]))}
    }
    const EDIT_DOCUMENT_TYPES={photo:'Patient Photo',identity:'Identity Proof',prescription:'Current Prescription',discharge:'Discharge / Transfer Summary',reports:'Lab / Scan / Test Report',other:'Other Medical Document',consent:'Signed Admission Consent Form'};
    async function uploadEditFilesImmediately(key,files,photo=false){
      const chosen=Array.from(files||[]);
      if(!editTarget?.id||!chosen.length)return;
      setEditMsg(`Uploading ${chosen.length>1?`${chosen.length} files`:'file'}…`);
      try{
        let latestConsentPath=null;
        for(const file of chosen){
          const mime=String(file.type||'').toLowerCase();
          const name=String(file.name||'').toLowerCase();
          const allowed=mime==='application/pdf'||mime.startsWith('image/')||/\.(jpe?g|png|webp|heic|heif|pdf)$/i.test(name);
          if(!allowed)throw new Error('Please use JPG/JPEG, PNG, HEIC/HEIF, WEBP or PDF files.');
          if(file.size>15*1024*1024)throw new Error(`${file.name||'Document'} is larger than 15 MB.`);
          const storedPath=await uploadEditDocument(editTarget.id,file,EDIT_DOCUMENT_TYPES[key]||'Other Medical Document',photo);
          if(key==='consent')latestConsentPath=storedPath;
        }
        if(key==='consent'&&latestConsentPath){
          const {error:consentError}=await client.from('patients').update({
            admission_consent_status:'Completed',
            admission_consent_uploaded_at:new Date().toISOString(),
            admission_consent_storage_path:latestConsentPath,
            admission_consent_exception_reason:null
          }).eq('id',editTarget.id);
          if(consentError)throw consentError;
          setEditTarget(prev=>prev?{...prev,admission_consent_status:'Completed',admission_consent_uploaded_at:new Date().toISOString(),admission_consent_storage_path:latestConsentPath,admission_consent_exception_reason:null}:prev);
        }
        setEditUploads(prev=>({...prev,[key]:[]}));
        await loadEditMedia({...editTarget,photo_storage_path:photo?null:editTarget.photo_storage_path});
        await load();
        setEditMsg(key==='consent'?'Signed Admission Consent uploaded. Admission formalities are now complete.':`${labelForEditDocument(key)} uploaded successfully. You can continue editing this patient.`);
      }catch(error){
        console.error('Patient document upload failed:',error);
        setEditMsg(`Upload failed: ${error.message||error}`);
      }
    }
    function labelForEditDocument(key){return ({photo:'Patient photo',identity:'Aadhaar / identity document',prescription:'Prescription',discharge:'Discharge / transfer summary',reports:'Report',other:'Document',consent:'Signed Admission Consent Form'})[key]||'Document'}
    function editCaptureField(label,key,accept='image/*,.pdf',photo=false){
      const files=editUploads[key]||[];
      const pick=async e=>{e.preventDefault();e.stopPropagation();const chosen=Array.from(e.target.files||[]);e.target.value='';if(!chosen.length)return;addEditFiles(key,chosen,photo);await uploadEditFilesImmediately(key,chosen,photo)};
      return h('div',{className:'field capture-field'},h('label',null,label),h('div',{className:'capture-actions'},
        h('label',{className:'btn btn-secondary file-button',onClick:e=>e.stopPropagation()},'Upload File',h('input',{type:'file',multiple:!photo,accept,onClick:e=>e.stopPropagation(),onChange:pick})),
        h('label',{className:'btn btn-secondary file-button',onClick:e=>e.stopPropagation()},'Mobile Camera',h('input',{type:'file',multiple:!photo,accept:'image/*',capture:photo?'user':'environment',onClick:e=>e.stopPropagation(),onChange:pick})),
        h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setEditCameraConfig({title:label,facingMode:photo?'user':'environment',filePrefix:photo?'patient-photo':'patient-document',onCapture:async file=>{addEditFiles(key,[file],photo);await uploadEditFilesImmediately(key,[file],photo)}})},'Webcam')
      ),h('small',null,files.length?`${files.length} file(s) uploading…`:'Choose a file. It uploads immediately and this patient window stays open.'));
    }
    async function uploadEditDocument(patientId,file,type,isPhoto=false){
      const safe=String(file.name||type).replace(/[^a-zA-Z0-9._-]/g,'_');const path=`${patientId}/${Date.now()}-${Math.random().toString(36).slice(2,8)}-${safe}`;
      const {error:up}=await client.storage.from('patient-documents').upload(path,file,{upsert:false,contentType:file.type||undefined});if(up)throw up;
      const {data:{user}}=await client.auth.getUser();
      const {error:doc}=await client.from('patient_documents').insert({patient_id:patientId,document_type:type,document_name:file.name||type,storage_path:path,mime_type:file.type||null,file_size:file.size||null,uploaded_by:user?.id||null,is_verified:true});if(doc)throw doc;
      if(isPhoto){const {error:pe}=await client.from('patients').update({photo_storage_path:path}).eq('id',patientId);if(pe)throw pe}
      return path;
    }
    async function deleteEditDocument(doc){
      if(!confirm(`Delete ${doc.document_name||doc.document_type||'this document'}?`))return;
      if(doc.storage_path){const {error:se}=await client.storage.from('patient-documents').remove([doc.storage_path]);if(se)return alert(se.message)}
      const {error}=await client.from('patient_documents').delete().eq('id',doc.id);if(error)return alert(error.message);
      if(['Patient Photo','Patient Photograph'].includes(doc.document_type)){const next=editDocs.find(x=>x.id!==doc.id&&['Patient Photo','Patient Photograph'].includes(x.document_type));await client.from('patients').update({photo_storage_path:next?.storage_path||null}).eq('id',editTarget.id)}
      await loadEditMedia(editTarget);await load();
    }
    async function saveEditedFamilyPortalAccess(){
      if(!editFamilyAccess.enabled){
        if(editFamilyAccess.id){const {error}=await client.rpc('set_family_portal_access_status',{p_access_id:editFamilyAccess.id,p_active:false});if(error)throw error;}
        return {disabled:true};
      }
      const mobile=validateGlobalPhone(editFamilyAccess.country_code,editFamilyAccess.mobile,'family mobile number');
      if(!String(editFamilyAccess.relative_name||'').trim())throw new Error('Enter the authorised family member name.');
      if(!String(editFamilyAccess.relationship||'').trim())throw new Error('Enter the relationship to the resident.');
      let accessId=editFamilyAccess.id||null;
      if(!accessId){const {data:existingRows}=await client.from('family_portal_access').select('id,mobile,relative_name,is_active').eq('patient_id',editTarget.id).eq('is_active',true);const existing=(existingRows||[]).find(row=>normalizeWhatsAppRecipient(row.mobile)===normalizeWhatsAppRecipient(mobile)&&String(row.relative_name||'').trim().toLowerCase()===String(editFamilyAccess.relative_name||'').trim().toLowerCase());accessId=existing?.id||null;}
      const isNew=!accessId;
      const pin=isNew?String(Math.floor(100000+Math.random()*900000)):null;
      const {data,error}=await client.rpc('upsert_family_portal_access',{p_patient_id:editTarget.id,p_relative_name:String(editFamilyAccess.relative_name).trim(),p_relationship:String(editFamilyAccess.relationship).trim(),p_mobile:mobile,p_email:String(editFamilyAccess.email||'').trim()||null,p_primary_contact:!!editFamilyAccess.primary_contact,p_pin:pin,p_access_id:accessId});
      if(error)throw error;
      const row=Array.isArray(data)?data[0]:data;
      const credential={...(row||{}),pin,mobile,isNew};
      setEditFamilyCredential(pin?credential:null);
      setEditFamilyAccess(prev=>({...prev,id:credential.access_id||prev.id,family_user_id:credential.family_user_id||prev.family_user_id,mobile,is_active:true}));
      return credential;
    }

    async function saveEditedSecondFamilyPortalAccess(){
      const item=editFamilyAccess2;
      if(!item.enabled){
        if(item.id){const {error}=await client.rpc('set_family_portal_access_status',{p_access_id:item.id,p_active:false});if(error)throw error;}
        return {disabled:true};
      }
      const mobile=validateGlobalPhone(item.country_code,item.mobile,'second family mobile number');
      if(!String(item.relative_name||'').trim())throw new Error('Enter the second authorised family member name.');
      if(!String(item.relationship||'').trim())throw new Error('Enter the second family member relationship to the resident.');
            const firstMobile=editFamilyAccess.enabled?normalizeWhatsAppRecipient(globalPhoneValue(editFamilyAccess.country_code,editFamilyAccess.mobile)):'';
      if(editFamilyAccess.enabled&&firstMobile===normalizeWhatsAppRecipient(mobile))throw new Error('Family Contact 2 must use a different mobile number from Family Contact 1.');
      let accessId=item.id||null;
      if(!accessId){const {data:existingRows}=await client.from('family_portal_access').select('id,mobile,relative_name,is_active').eq('patient_id',editTarget.id);const existing=(existingRows||[]).find(row=>normalizeWhatsAppRecipient(row.mobile)===normalizeWhatsAppRecipient(mobile));accessId=existing?.id||null;}
      const isNew=!accessId;
      const pin=isNew?String(Math.floor(100000+Math.random()*900000)):null;
      const {data,error}=await client.rpc('upsert_family_portal_access',{p_patient_id:editTarget.id,p_relative_name:String(item.relative_name).trim(),p_relationship:String(item.relationship).trim(),p_mobile:mobile,p_email:String(item.email||'').trim()||null,p_primary_contact:false,p_pin:pin,p_access_id:accessId});
      if(error)throw error;
      const row=Array.isArray(data)?data[0]:data;
      const credential={...(row||{}),pin,mobile,isNew};
      setEditFamilyCredential2(pin?credential:null);
      setEditFamilyAccess2(prev=>({...prev,id:credential.access_id||prev.id,family_user_id:credential.family_user_id||prev.family_user_id,mobile,is_active:true,primary_contact:false}));
      return credential;
    }

    async function saveEditedFamilyCommunicationPreference(){
      if(!editTarget?.id)return null;
      const portalEnabled=!!editFamilyAccess.enabled,dailyEnabled=!!editDailyWhatsApp.enabled,active=portalEnabled||dailyEnabled;
      const mode=portalEnabled&&dailyEnabled?'Both':dailyEnabled?'Daily WhatsApp Update':'Family Portal Access';
      const recipientName=String(editDailyWhatsApp.recipient_name||editFamilyAccess.relative_name||editForm.attendant_name||'').trim();
      const relationship=String(editDailyWhatsApp.relationship||editFamilyAccess.relationship||'').trim();
      const portalMobile=portalEnabled?validateGlobalPhone(editFamilyAccess.country_code,editFamilyAccess.mobile,'family WhatsApp number'):'';
      const dailyRaw=String(editDailyWhatsApp.mobile||'').trim();
      const dailyMobile=dailyRaw?(dailyRaw.startsWith('+')?dailyRaw:(portalMobile||dailyRaw)):portalMobile;
      const mobile=String(dailyMobile||editForm.attendant_phone||'').trim();
      if(active&&!recipientName)throw new Error('Enter the authorised family member name for family communication.');
      if(active&&!mobile)throw new Error('Enter a valid family WhatsApp number.');
      if(dailyEnabled&&!String(editDailyWhatsApp.daily_report_time||'').trim())throw new Error('Select the Daily Patient Report WhatsApp time.');
      const payload={patient_id:editTarget.id,delivery_mode:mode,family_portal_enabled:portalEnabled,daily_whatsapp_enabled:dailyEnabled,recipient_name:recipientName||'Family Member',relationship:relationship||null,recipient_mobile:mobile,recipient_email:String(editDailyWhatsApp.email||editFamilyAccess.email||'').trim()||null,daily_report_time:dailyEnabled?(editDailyWhatsApp.daily_report_time||'20:00'):null,timezone:'Asia/Kolkata',is_active:active,updated_at:new Date().toISOString()};
      const {data,error}=await client.from('patient_family_communication_preferences').upsert(payload,{onConflict:'patient_id'}).select().single();if(error)throw error;return data;
    }

    async function resetSelectedFamilyPin(access){
      if(!canEdit||!selected||!access?.id)return;
      if(!confirm(`Reset the Family Portal PIN for ${access.relative_name||access.family_user_id||'this family user'}?`))return;
      setFamilyResetBusy(access.id);
      setFamilyResetCredential(null);
      try{
        const pin=String(Math.floor(100000+Math.random()*900000));
        const mobile=String(access.mobile||'').trim();
        const {data,error}=await client.rpc('upsert_family_portal_access',{
          p_patient_id:selected.id,
          p_relative_name:access.relative_name,
          p_relationship:access.relationship,
          p_mobile:mobile,
          p_email:access.email||null,
          p_primary_contact:!!access.primary_contact,
          p_pin:pin,
          p_access_id:access.id
        });
        if(error)throw error;
        const row=Array.isArray(data)?data[0]:data;
        const credential={...(row||{}),family_user_id:(row||{}).family_user_id||access.family_user_id,pin,mobile};
        setFamilyResetCredential(credential);
        showPatientToast('success',`Family Portal PIN reset successfully for ${credential.family_user_id}.`);
        setDetails(prev=>prev?{...prev,familyAccess:(prev.familyAccess||[]).map(x=>x.id===access.id?{...x,updated_at:new Date().toISOString()}:x)}:prev);
      }catch(error){
        showPatientToast('error',`Unable to reset Family Portal PIN: ${error.message||error}`);
      }finally{setFamilyResetBusy(null)}
    }

    function openDailyReportQuickEdit(row){
      const pref=details?.familyPreference||{};
      const family=primaryFamilyContact?.()||null;
      setDailyQuickEditMsg('');
      setDailyQuickEdit({
        patient_id:row?.id||selected?.id||'',
        recipient_name:pref.recipient_name||family?.relative_name||row?.attendant_name||'',
        relationship:pref.relationship||family?.relationship||'',
        mobile:String(pref.recipient_mobile||family?.mobile||row?.attendant_phone||'').replace(/\D/g,'').slice(-10),
        daily_report_time:String(pref.daily_report_time||'20:00').slice(0,5)
      });
    }

    async function saveDailyReportQuickEdit(e){
      e.preventDefault();
      if(!selected?.id||!dailyQuickEdit)return;
      const recipientName=String(dailyQuickEdit.recipient_name||'').trim();
      const mobile=String(dailyQuickEdit.mobile||'').replace(/\D/g,'').slice(-10);
      const time=String(dailyQuickEdit.daily_report_time||'').trim();
      if(!recipientName){setDailyQuickEditMsg('Enter the authorised recipient name.');return;}
      if(mobile.length!==10){setDailyQuickEditMsg('Enter a valid 10-digit WhatsApp number.');return;}
      if(!time){setDailyQuickEditMsg('Select the daily report time.');return;}
      setDailyQuickEditBusy(true);setDailyQuickEditMsg('');
      try{
        const pref=details?.familyPreference||{};
        const portalEnabled=!!pref.family_portal_enabled;
        const dailyEnabled=pref.daily_whatsapp_enabled!==false;
        const payload={
          patient_id:selected.id,
          delivery_mode:portalEnabled&&dailyEnabled?'Both':dailyEnabled?'Daily WhatsApp Update':'Family Portal Access',
          family_portal_enabled:portalEnabled,
          daily_whatsapp_enabled:dailyEnabled,
          recipient_name:recipientName,
          relationship:String(dailyQuickEdit.relationship||'').trim()||null,
          recipient_mobile:mobile,
          recipient_email:pref.recipient_email||null,
          daily_report_time:dailyEnabled?time:null,
          timezone:pref.timezone||'Asia/Kolkata',
          is_active:portalEnabled||dailyEnabled,
          updated_at:new Date().toISOString()
        };
        const {data,error}=await client.from('patient_family_communication_preferences').upsert(payload,{onConflict:'patient_id'}).select().single();
        if(error)throw error;
        setDetails(prev=>prev?{...prev,familyPreference:{...(prev.familyPreference||{}),...data}}:prev);
        setDailyQuickEdit(null);
        showPatientToast('success','Daily Patient Report recipient and time updated successfully.');
      }catch(error){
        setDailyQuickEditMsg(error?.message||'Could not update Daily Patient Report settings.');
      }finally{setDailyQuickEditBusy(false);}
    }

    async function savePatientEdit(e){
      e.preventDefault();setEditBusy(true);setEditMsg('');
      if(isFutureDateIndia(editForm.admission_date)){const text=`Admission date cannot be later than today (${formatDateIN(todayISOIndia())}). Please correct the date.`;setEditMsg(text);showPatientToast('error',text);setEditBusy(false);return}
      if(!editFamilyAccess.enabled&&!editFamilyAccess2.enabled){const text='Family Portal Access is mandatory. Enable Family Contact 1 or Family Contact 2 before saving.';setEditMsg(text);showPatientToast('error',text);setEditBusy(false);return}
      const normalizedEditMobile=String(editForm.mobile||'').replace(/\D/g,'').slice(-10);
      if(normalizedEditMobile.length===10){
        const {data:mobilePatients,error:mobileCheckError}=await client.from('patients').select('id,patient_id,patient_code,title,full_name,mobile');
        if(mobileCheckError){const text=mobileCheckError.message||'Unable to verify patient mobile number';setEditMsg(text);showPatientToast('error',text);setEditBusy(false);return}
        const conflict=(mobilePatients||[]).find(row=>row.id!==editTarget.id&&String(row.mobile||'').replace(/\D/g,'').slice(-10)===normalizedEditMobile);
        if(conflict){const text=`This mobile number is already registered to ${formalName(conflict)||conflict.full_name} · ${conflict.patient_id||conflict.patient_code||'Resident ID unavailable'}. Patient details were not changed.`;setEditMsg(text);showPatientToast('error',text);setEditBusy(false);return}
      }
      const allowed=['title','full_name','age','gender','mobile','address','state','district','taluk','village_town','locality_area','street_name','house_no','apartment_name','flat_no','landmark','pincode','attendant_name','attendant_phone','attendant_alternative_phone','diagnosis','referring_doctor','treating_doctor','doctor_phone','hospital_name','admission_type','patient_category','room_no','bed_no','allergies','special_instructions','admission_date','is_active','diet_plan','feeding_instruction','fall_risk','pressure_sore_risk','aspiration_risk','wandering_risk','infection_risk','seizure_history','special_nurse_required','special_nurse_name','special_nurse_shift'];
      const payload={};allowed.forEach(k=>payload[k]=editForm[k]===''?null:editForm[k]);
      payload.address=composePatientAddressGlobal(editForm);
      payload.age=editForm.age===''?null:Number(editForm.age);
      const {data,error}=await client.from('patients').update(payload).eq('id',editTarget.id).select().single();
      if(error){const text=error.message||'Unable to update patient';setEditMsg(text);showPatientToast('error',text);setEditBusy(false);return}
      let familySaveResult=null,familySaveResult2=null;
      try{familySaveResult=await saveEditedFamilyPortalAccess();familySaveResult2=await saveEditedSecondFamilyPortalAccess();await saveEditedFamilyCommunicationPreference();}
      catch(familyError){const text=`Patient details saved, but Family communication settings could not be updated: ${familyError.message||familyError}`;setEditMsg(text);showPatientToast('error',text);setEditBusy(false);return}
      try{
        for(const f of editUploads.photo)await uploadEditDocument(editTarget.id,f,'Patient Photo',true);
        for(const f of editUploads.identity)await uploadEditDocument(editTarget.id,f,'Identity Proof');
        for(const f of editUploads.prescription)await uploadEditDocument(editTarget.id,f,'Current Prescription');
        for(const f of editUploads.discharge)await uploadEditDocument(editTarget.id,f,'Discharge / Transfer Summary');
        for(const f of editUploads.reports)await uploadEditDocument(editTarget.id,f,'Lab / Scan / Test Report');
        for(const f of editUploads.other)await uploadEditDocument(editTarget.id,f,'Other Medical Document');
      }catch(uploadError){const text=`Patient details saved, but media upload failed: ${uploadError.message}`;setEditMsg(text);showPatientToast('error',text);setEditBusy(false);return}
      try{
        const {data:{user}}=await client.auth.getUser();
        // Medication orders are intentionally NOT edited from the general Patient Edit form.
        // Prescription changes must go through Medicines → Doctor Review / Modify so the old
        // prescription, MAR, effective time, doctor instruction and audit history are preserved.
        await client.from('care_orders').delete().eq('patient_id',editTarget.id);
        const careRows=editCare.filter(c=>c.care_type).map(c=>({patient_id:editTarget.id,care_type:c.care_type,shift:c.shift,frequency:c.frequency,instruction:c.instruction||null,entered_by:user?.id||null}));
        if(careRows.length){const {error:ce}=await client.from('care_orders').insert(careRows);if(ce)throw ce}

        if(editPhysio.required){
          if(!editPhysio.therapy_type.trim())throw new Error('Please enter the therapy or exercise advised.');
          const physioPayload={
            patient_id:editTarget.id,
            advised_by:editPhysio.advised_by||editForm.treating_doctor||editForm.referring_doctor||null,
            therapy_type:editPhysio.therapy_type.trim(),
            physiotherapist_name:editPhysio.physiotherapist_name||null,
            frequency:editPhysio.frequency||'Daily',
            preferred_time:editPhysio.preferred_time||null,
            precautions:editPhysio.precautions||null,
            start_date:editPhysio.start_date||editForm.admission_date||todayISOIndia(),
            end_date:editPhysio.end_date||null,
            is_active:true,
            entered_by:user?.id||null,
            updated_at:new Date().toISOString()
          };
          if(editPhysio.id){
            const {error:pe}=await client.from('physiotherapy_plans').update(physioPayload).eq('id',editPhysio.id);
            if(pe)throw pe;
          }else{
            const {data:newPlan,error:pe}=await client.from('physiotherapy_plans').insert(physioPayload).select('id').single();
            if(pe)throw pe;
            if(newPlan?.id)setEditPhysio(current=>({...current,id:newPlan.id}));
          }
        }else if(editPhysio.id){
          const {error:pe}=await client.from('physiotherapy_plans').update({is_active:false,updated_at:new Date().toISOString()}).eq('id',editPhysio.id);
          if(pe)throw pe;
        }
      }catch(orderError){const text=`Patient details saved, but medicines or care plan could not be updated: ${orderError.message}`;setEditMsg(text);showPatientToast('error',text);setEditBusy(false);return}
      const successText=familySaveResult?.pin
        ?`Patient information updated successfully. Family Portal login created — Resident ID: ${editTarget?.patient_id||'—'} · Temporary PIN: ${familySaveResult.pin}.`
        :familySaveResult?.disabled
          ?'Patient information updated successfully. Family Portal access is disabled.'
          :editFamilyAccess.enabled
            ?'Patient information and Family Portal access updated successfully.'
            :'Patient information updated successfully.';
      setEditMsg(successText);showPatientToast('success',successText);await load();await loadEditMedia({...data,id:editTarget.id});
      const newlyGeneratedCredential=familySaveResult2?.pin?familySaveResult2:(familySaveResult?.pin?familySaveResult:null);
      if(newlyGeneratedCredential)setFamilyResetCredential(newlyGeneratedCredential);
      if(selected?.id===editTarget.id){setSelected(data);setTimeout(()=>{openPatient(data,editFamilyAccess.enabled?'Family Portal':tab);if(newlyGeneratedCredential)setFamilyResetCredential(newlyGeneratedCredential)},0)}
      setEditUploads({photo:[],identity:[],prescription:[],discharge:[],reports:[],other:[]});setEditBusy(false);
    }

    async function printPatientIdCard(row){
      const url=await resolvePatientPhoto(row);const win=window.open('','_blank','width=760,height=820');if(!win){alert('Please allow pop-ups to print the Patient ID card.');return}
      const doctor=row.referring_doctor||row.treating_doctor||row.family_doctor||'—';
      const emergencyName=row.attendant_name||'—';const emergencyPhone=row.attendant_phone||row.mobile||'—';
      win.document.write(`<!doctype html><html><head><title>Resident ID Card</title><style>body{font-family:Arial;margin:0;padding:24px;background:#fff5fa}.card{width:390px;min-height:650px;margin:auto;background:white;border-radius:24px;overflow:hidden;box-shadow:0 12px 35px #0002;border:2px solid #b01264}.head{background:#b01264;color:white;text-align:center;padding:20px}.head h1{margin:0;font-size:24px}.head p{margin:6px 0 0}.photo{width:125px;height:145px;border:4px solid white;border-radius:16px;object-fit:cover;background:#ddd;margin:14px auto 10px;display:block;box-shadow:0 4px 15px #0003}.body{padding:10px 26px 24px;text-align:center}.name{font-size:25px;font-weight:bold;color:#5d1039}.category{font-size:16px;color:#b01264;margin:4px 0 12px}.grid{text-align:left;line-height:1.55;font-size:15px}.row{padding:4px 0;border-bottom:1px solid #f7e7ef}.label{font-weight:bold;color:#444}.emergency{margin-top:12px;padding:10px;background:#fff4e5;border:1px solid #f2c87d;border-radius:10px}.barcode{margin-top:14px;padding:9px;border-top:1px dashed #aaa;font-family:monospace}.print{display:block;margin:20px auto;padding:12px 24px}@media print{.print{display:none}body{background:white;padding:0}}</style></head><body><div class="card"><div class="head"><h1>SAMARA HEALTH CARE LLP</h1><p>Assisted Living Patient Identity & Emergency Card</p></div><div class="body">${url?`<img class="photo" src="${url}">`:`<div class="photo" style="display:flex;align-items:center;justify-content:center;font-size:48px">SC</div>`}<div class="name">${escapeHtml(formalName(row))}</div><div class="category">${escapeHtml(row.patient_category||'Patient')}</div><div class="grid"><div class="row"><span class="label">Resident ID:</span> ${escapeHtml(row.patient_id||'—')}</div><div class="row"><span class="label">Main Diagnosis:</span> ${escapeHtml(row.diagnosis||'—')}</div><div class="row"><span class="label">Referred / Treating Doctor:</span> ${escapeHtml(doctor)}</div><div class="row"><span class="label">Doctor Mobile:</span> ${escapeHtml(row.doctor_phone||'—')}</div><div class="row"><span class="label">Room / Bed:</span> ${escapeHtml(`${row.room_no||'—'} / ${row.bed_no||'—'}`)}</div><div class="row"><span class="label">Gender / Age:</span> ${escapeHtml(`${row.gender||'—'} / ${row.age||'—'}`)}</div><div class="row"><span class="label">Blood Group:</span> ${escapeHtml(row.blood_group||'Unknown')}</div><div class="row"><span class="label">Patient Mobile:</span> ${escapeHtml(row.mobile||'—')}</div><div class="row"><span class="label">Allergies:</span> ${escapeHtml(row.allergies||'None recorded')}</div><div class="emergency"><div><span class="label">Emergency Contact:</span> ${escapeHtml(emergencyName)}</div><div><span class="label">Emergency Mobile:</span> ${escapeHtml(emergencyPhone)}</div></div></div><div class="barcode">${escapeHtml(row.patient_id||row.id)}</div></div></div><button class="print" onclick="window.print()">Print Resident ID Card</button></body></html>`);win.document.close();
    }
    function duplicateMatches(row){
      const name=String(row.full_name||'').trim().toLowerCase().replace(/\s+/g,' ');
      const mobile=String(row.mobile||row.attendant_phone||'').replace(/\D/g,'').slice(-10);
      return rows.filter(item=>{
        const itemName=String(item.full_name||'').trim().toLowerCase().replace(/\s+/g,' ');
        const itemMobile=String(item.mobile||item.attendant_phone||'').replace(/\D/g,'').slice(-10);
        const sameName=name&&itemName===name;
        const sameMobile=mobile&&itemMobile===mobile;
        return sameName&&(sameMobile||!mobile||!itemMobile);
      });
    }

    async function openDuplicateReview(row){
      setDuplicateReviewBusy(true);
      try{
        const matches=duplicateMatches(row);
        const reviewed=await Promise.all(matches.map(async patient=>{
          const [
            billing,
            medicines,
            care,
            vitals,
            incidents,
            documents,
            consentDocs
          ]=await Promise.all([
            client.from('billing_transactions').select('id',{count:'exact',head:true}).eq('patient_id',patient.id),
            client.from('medication_orders').select('id',{count:'exact',head:true}).eq('patient_id',patient.id),
            client.from('care_orders').select('id',{count:'exact',head:true}).eq('patient_id',patient.id),
            client.from('vital_signs').select('id',{count:'exact',head:true}).eq('patient_id',patient.id),
            client.from('incidents').select('id',{count:'exact',head:true}).eq('patient_id',patient.id),
            client.from('patient_documents').select('id',{count:'exact',head:true}).eq('patient_id',patient.id),
            client.from('patient_documents')
              .select('id,document_type,document_name,file_name,storage_path,created_at')
              .eq('patient_id',patient.id)
              .eq('document_type','Signed Admission Consent Form')
              .order('created_at',{ascending:false})
              .limit(1)
          ]);
          const activityCount=
            Number(billing.count||0)+
            Number(medicines.count||0)+
            Number(care.count||0)+
            Number(vitals.count||0)+
            Number(incidents.count||0);
          return {
            ...patient,
            counts:{
              billing:Number(billing.count||0),
              medicines:Number(medicines.count||0),
              care:Number(care.count||0),
              vitals:Number(vitals.count||0),
              incidents:Number(incidents.count||0),
              documents:Number(documents.count||0)
            },
            activityCount,
            signedConsent:consentDocs.data?.[0]||null
          };
        }));
        reviewed.sort((a,b)=>{
          const consentA=a.admission_consent_status==='Completed'?1:0;
          const consentB=b.admission_consent_status==='Completed'?1:0;
          if(consentA!==consentB)return consentB-consentA;
          if(a.activityCount!==b.activityCount)return b.activityCount-a.activityCount;
          return new Date(a.created_at||0)-new Date(b.created_at||0);
        });
        setDuplicateReview({
          anchorPatientId:row.id,
          records:reviewed,
          recommendedKeepId:reviewed[0]?.id||null
        });
      }catch(error){
        showPatientToast('error',error.message||'Unable to review duplicate patient records.');
      }finally{
        setDuplicateReviewBusy(false);
      }
    }

    async function moveDuplicatePatientData(deleteRecord,keepRecord){
      const linkTables=[
        'billing_transactions',
        'bill_charge_requests',
        'medication_orders',
        'medication_administrations',
        'medication_errors',
        'care_orders',
        'care_logs',
        'vital_signs',
        'incidents',
        'patient_documents',
        'patient_communications',
        'patient_discharges',
        'physiotherapy_plans',
        'physiotherapy_sessions',
        'diagnostic_services',
        'meal_records',
        'recovery_events',
        'shift_handovers',
        'special_nurse_assignments',
        'clinical_alert_acknowledgements',
        'room_transfer_history',
        'patient_daily_moments'
      ];

      const moved=[];
      for(const table of linkTables){
        const {error}=await client
          .from(table)
          .update({patient_id:keepRecord.id})
          .eq('patient_id',deleteRecord.id);

        if(error){
          const ignorable=['42P01','42703','PGRST204','PGRST205'];
          if(!ignorable.includes(error.code)){
            throw new Error(`${table}: ${error.message}`);
          }
        }else{
          moved.push(table);
        }
      }
      return moved;
    }

    async function deleteReviewedDuplicate(deleteRecord){
      if(!duplicateReview?.records?.length)return;

      const keepRecord=
        duplicateReview.records.find(record=>record.id===duplicateReview.recommendedKeepId&&record.id!==deleteRecord.id)
        ||duplicateReview.records.find(record=>record.id!==deleteRecord.id);

      if(!keepRecord){
        showPatientToast('error','Select or retain one patient record before deleting the duplicate.');
        return;
      }

      const hasLinkedHistory=deleteRecord.activityCount>0||deleteRecord.counts.documents>0;
      const actionText=hasLinkedHistory
        ?'MERGE its clinical, billing and document history into the retained patient, then DELETE the duplicate'
        :'DELETE the empty duplicate';

      const confirmed=window.confirm(
        `${actionText}?\n\n`+
        `DELETE: ${formalName(deleteRecord)} (${deleteRecord.patient_code||deleteRecord.patient_id})\n`+
        `KEEP: ${formalName(keepRecord)} (${keepRecord.patient_code||keepRecord.patient_id})\n\n`+
        (hasLinkedHistory
          ?'All linked records will be reassigned to the retained Resident ID before deletion.'
          :'This duplicate has no material clinical or financial activity.')+
        '\n\nThis action cannot be undone.'
      );
      if(!confirmed)return;

      setDuplicateReviewBusy(true);
      try{
        let movedTables=[];

        if(hasLinkedHistory){
          movedTables=await moveDuplicatePatientData(deleteRecord,keepRecord);
        }

        const sameRoom=
          keepRecord?.room_no&&keepRecord?.bed_no&&
          String(keepRecord.room_no)===String(deleteRecord.room_no)&&
          String(keepRecord.bed_no)===String(deleteRecord.bed_no);

        const duplicateRooms=roomBeds.filter(bed=>
          String(bed.patient_id||'')===String(deleteRecord.id)||
          (
            String(bed.room_no)===String(deleteRecord.room_no||'')&&
            String(bed.bed_no||bed.bed_code||'').toUpperCase()===String(deleteRecord.bed_no||'').toUpperCase()
          )
        );

        for(const room of duplicateRooms){
          const {error:roomError}=await client.from('room_beds').update(
            sameRoom
              ?{
                  patient_id:keepRecord.id,
                  status:'Occupied',
                  updated_at:new Date().toISOString()
                }
              :{
                  patient_id:null,
                  status:'Available',
                  updated_at:new Date().toISOString()
                }
          ).eq('id',room.id);
          if(roomError)throw roomError;
        }

        // Preserve useful identity/admission fields that may exist only in the duplicate.
        const mergeFields=[
          'photo_storage_path','address','state','district','taluk','village_town',
          'locality_area','street_name','house_no','apartment_name','flat_no',
          'landmark','pincode','allergies','diagnosis','treating_doctor','doctor_phone',
          'hospital_name','special_instructions','diet_plan','feeding_instruction',
          'admission_consent_status','admission_consent_generated_at',
          'admission_consent_uploaded_at','admission_consent_storage_path',
          'admission_consent_exception_reason'
        ];
        const keepUpdate={};
        mergeFields.forEach(field=>{
          if(
            (keepRecord[field]===null||keepRecord[field]===undefined||keepRecord[field]==='')&&
            deleteRecord[field]!==null&&deleteRecord[field]!==undefined&&deleteRecord[field]!==''
          ){
            keepUpdate[field]=deleteRecord[field];
          }
        });
        if(Object.keys(keepUpdate).length){
          const {error:updateError}=await client.from('patients')
            .update(keepUpdate)
            .eq('id',keepRecord.id);
          if(updateError)throw updateError;
        }

        const {error:deleteError}=await client.from('patients')
          .delete()
          .eq('id',deleteRecord.id);
        if(deleteError)throw deleteError;

        await writeAuditEvent(
          hasLinkedHistory?'Duplicate Patient Merged and Deleted':'Duplicate Patient Deleted',
          'Patients',
          deleteRecord.id,
          {
            deleted_patient_code:deleteRecord.patient_code||deleteRecord.patient_id,
            retained_patient_id:keepRecord.id,
            retained_patient_code:keepRecord.patient_code||keepRecord.patient_id,
            moved_tables:movedTables,
            reviewed_by:profile?.id||null
          },
          'Success'
        );

        showPatientToast(
          'success',
          hasLinkedHistory
            ?`Duplicate ${deleteRecord.patient_code||deleteRecord.patient_id} merged into ${keepRecord.patient_code||keepRecord.patient_id} and deleted.`
            :`Duplicate ${deleteRecord.patient_code||deleteRecord.patient_id} deleted. ${keepRecord.patient_code||keepRecord.patient_id} was retained.`
        );
        setDuplicateReview(null);
        await load();
      }catch(error){
        showPatientToast(
          'error',
          error.message||'Unable to merge and delete the duplicate patient record.'
        );
      }finally{
        setDuplicateReviewBusy(false);
      }
    }

    async function ensurePatientQrGenerator(){
      if(window.SamaraQRCode)return window.SamaraQRCode;
      await new Promise((resolve,reject)=>{
        const existing=[...document.scripts].find(script=>
          script.src&&script.src.endsWith('/vendor/qrcode.bundle.js')
        );
        if(existing){
          if(window.SamaraQRCode)return resolve();
          existing.addEventListener('load',resolve,{once:true});
          existing.addEventListener('error',()=>reject(new Error('Offline QR generator could not be loaded.')),{once:true});
          return;
        }
        const script=document.createElement('script');
        script.src='./vendor/qrcode.bundle.js';
        script.async=true;
        script.onload=resolve;
        script.onerror=()=>reject(new Error('Offline QR generator could not be loaded.'));
        document.head.appendChild(script);
      });
      if(!window.SamaraQRCode)throw new Error('Offline QR generator is unavailable.');
      return window.SamaraQRCode;
    }

    function patientConsentFilename(row={}){
      const patientName=String(formalName(row)||row.full_name||'Patient')
        .trim()
        .replace(/[^a-zA-Z0-9]+/g,'_')
        .replace(/^_+|_+$/g,'');
      const patientCode=String(row.patient_code||row.patient_id||'Patient_ID')
        .replace(/[^a-zA-Z0-9-]+/g,'_');

      const explicitTimestamp=
        row.admission_datetime||
        row.admission_timestamp||
        row.admitted_at||
        row.created_at||
        '';

      let timestamp=explicitTimestamp?new Date(explicitTimestamp):null;
      if(!timestamp||Number.isNaN(timestamp.getTime()))timestamp=null;

      const admissionDate=String(row.admission_date||'').slice(0,10);
      let datePart='Admission-Date-Unavailable';
      let timePart='Time-Unavailable';

      if(admissionDate){
        datePart=admissionDate;
        const timeSource=timestamp||new Date(`${admissionDate}T00:00:00`);
        timePart=`${String(timeSource.getHours()).padStart(2,'0')}-${String(timeSource.getMinutes()).padStart(2,'0')}`;
      }else if(timestamp){
        datePart=[
          timestamp.getFullYear(),
          String(timestamp.getMonth()+1).padStart(2,'0'),
          String(timestamp.getDate()).padStart(2,'0')
        ].join('-');
        timePart=`${String(timestamp.getHours()).padStart(2,'0')}-${String(timestamp.getMinutes()).padStart(2,'0')}`;
      }

      return `${patientName}_${patientCode}_Admission_${datePart}_${timePart}.pdf`;
    }

    async function printPatientConsent(row){
      setPatientConsentBusyId(row.id);
      try{
        const [
          medicinesResult,
          careResult,
          roomResult,
          packageResult,
          signedResult,
          photoResult
        ]=await Promise.all([
          client.from('medication_orders').select('*').eq('patient_id',row.id).order('created_at'),
          client.from('care_orders').select('*').eq('patient_id',row.id).order('created_at'),
          client.from('room_beds').select('*')
            .eq('room_no',row.room_no||'')
            .eq('bed_no',row.bed_no||'')
            .limit(1)
            .maybeSingle(),
          row.package_id
            ?client.from('care_packages').select('*').eq('id',row.package_id).maybeSingle()
            :Promise.resolve({data:null,error:null}),
          client.from('patient_documents')
            .select('*')
            .eq('patient_id',row.id)
            .eq('document_type','Signed Admission Consent Form')
            .order('created_at',{ascending:false})
            .limit(1),
          client.from('patient_documents')
            .select('*')
            .eq('patient_id',row.id)
            .in('document_type',['Patient Photo','Patient Photograph'])
            .order('created_at',{ascending:false})
            .limit(1)
        ]);

        if(signedResult.data?.[0]?.storage_path){
          const {data,error}=await client.storage
            .from('patient-documents')
            .createSignedUrl(signedResult.data[0].storage_path,300);
          if(error)throw error;
          const frame=document.createElement('iframe');
          frame.style.position='fixed';
          frame.style.right='0';
          frame.style.bottom='0';
          frame.style.width='1px';
          frame.style.height='1px';
          frame.style.border='0';
          frame.style.opacity='0';
          frame.src=data.signedUrl;
          document.body.appendChild(frame);
          frame.onload=()=>{
            try{
              frame.contentWindow.focus();
              frame.contentWindow.print();
            }catch(_error){
              window.open(data.signedUrl,'_blank','noopener');
            }
            setTimeout(()=>frame.remove(),5000);
          };
          showPatientToast('success','Signed Admission Consent opened for printing.');
          return;
        }

        // Use the exact same patient-photo resolver as the Patient File header, then
        // embed the image into the print document as a data URL. This prevents the
        // browser/PDF print engine from losing an expiring signed Storage URL.
        let consentPhotoUrl='';
        try{
          const resolvedPhotoUrl=await resolvePatientPhoto(row);
          if(resolvedPhotoUrl){
            try{
              const response=await fetch(resolvedPhotoUrl,{cache:'no-store'});
              if(!response.ok)throw new Error(`Photo fetch failed (${response.status})`);
              const blob=await response.blob();
              consentPhotoUrl=await new Promise((resolve,reject)=>{
                const reader=new FileReader();
                reader.onload=()=>resolve(String(reader.result||''));
                reader.onerror=()=>reject(reader.error||new Error('Unable to read patient photo'));
                reader.readAsDataURL(blob);
              });
            }catch(photoEmbedError){
              console.warn('Consent photo data embedding failed; using signed URL fallback:',photoEmbedError);
              consentPhotoUrl=resolvedPhotoUrl;
            }
          }
        }catch(photoResolveError){
          console.warn('Unable to resolve resident photo for consent:',photoResolveError);
        }

        const qrGenerator=await ensurePatientQrGenerator();
        const patientCode=row.patient_code||row.patient_id||'PATIENT';
        const reference=`SAMARA-${patientCode}-${String(row.admission_date||'').replace(/-/g,'')}`;
        const qrDataUrl=qrGenerator.toDataURL([
          'SAMARA CARE ADMISSION CONSENT',
          `Reference: ${reference}`,
          `Resident ID: ${patientCode}`,
          `Resident: ${formalName(row)||row.full_name||''}`,
          `Admission Date: ${row.admission_date||''}`,
          `Room/Bed: ${row.room_no||''}/${row.bed_no||''}`
        ].join('\\n'),{size:180,margin:3,errorCorrectionLevel:'M'});

        const medicines=currentUpcomingMedicineOrders(medicinesResult.data||[]);
        const care=careResult.data||[];
        const room=roomResult.data||{};
        const pkg=packageResult.data||{};
        const money=value=>`₹${Number(value||0).toLocaleString('en-IN')}`;
        const packageBilling=Boolean(row.package_id||row.package_fee||row.billing_package&&row.billing_package!=='No Package / Daily Billing');

        const feeRows=packageBilling
          ?[
              ['Billing Method','Fixed Care Package'],
              ['Package',pkg.package_name||row.billing_package||'—'],
              ['Duration',pkg.duration_value?`${pkg.duration_value} ${pkg.duration_unit}`:'—'],
              ['Accommodation',row.package_room_class||room.room_type||'—'],
              ['Package Period',row.package_start_date&&row.package_end_date
                ?`${formatDateIN(row.package_start_date)} to ${formatDateIN(row.package_end_date)}`
                :'—'],
              ['Fixed Package Fee',money(row.package_fee||0)],
              ['Package Includes',pkg.included_services||'As configured in the package master']
            ]
          :[
              ['Billing Method','Daily Billing'],
              ['Room / Bed',`${row.room_no||'—'}-${row.bed_no||'—'} · ${room.room_type||'—'}`],
              ['Room Rent per Day',money(room.room_daily_rate??room.daily_rate??0)],
              ['Routine Nursing per Day',money(room.nursing_daily_rate||0)],
              ['Additional Charges','Medicines, doctor visits, investigations, physiotherapy, transport, external hospital expenses and other approved services are billed separately']
            ];

        const medRows=medicines.length
          ?medicines.map((medicine,index)=>`<tr>
              <td>${index+1}</td>
              <td>${escapeHtml(medicine.prescribed_by_doctor||'—')}</td>
              <td><strong>${escapeHtml(medicine.medicine_name||'')}</strong></td>
              <td>${escapeHtml(medicine.strength||'')}</td>
              <td>${escapeHtml(medicine.frequency||'')}</td>
              <td>${escapeHtml(medicine.route||'')}</td>
              <td>${escapeHtml((medicine.scheduled_times||[]).map(medicationTimeLabel).join(', '))}</td>
              <td>${escapeHtml(medicine.food_instruction||'')}</td>
            </tr>`).join('')
          :'<tr><td colspan="8">No prescribed medication declared at admission.</td></tr>';

        const uniqueCare=care.filter((item,index,rows)=>{
          const key=[item.care_type,item.shift,item.frequency,item.instruction||''].map(v=>String(v||'').trim().toLowerCase()).join('|');
          return rows.findIndex(x=>[x.care_type,x.shift,x.frequency,x.instruction||''].map(v=>String(v||'').trim().toLowerCase()).join('|')===key)===index;
        });
        const careRows=uniqueCare.length
          ?uniqueCare.map((item,index)=>`<tr>
              <td>${index+1}</td>
              <td><strong>${escapeHtml(item.care_type||'')}</strong></td>
              <td>${escapeHtml(item.shift||'')}</td>
              <td>${escapeHtml(item.frequency||'')}</td>
              <td>${escapeHtml(item.instruction||'—')}</td>
            </tr>`).join('')
          :'<tr><td colspan="5">No master care-plan task recorded.</td></tr>';

        const filename=patientConsentFilename(row);
        const risks=[
          ['Fall risk',row.fall_risk],
          ['Pressure-sore risk',row.pressure_sore_risk],
          ['Aspiration risk',row.aspiration_risk],
          ['Wandering / confusion risk',row.wandering_risk],
          ['Infection-control precautions',row.infection_risk],
          ['Seizure history',row.seizure_history],
          ['Oxygen required',row.oxygen_required],
          ['Wound dressing required',row.dressing_required],
          ['Special / dedicated nurse',row.special_nurse_required],
          ['Physiotherapy advised',row.physio_required]
        ].filter(([,value])=>value).map(([label])=>label).join(', ')||'None specifically recorded';

        const feeHtml=feeRows.map(([label,value])=>
          `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`
        ).join('');

        const html=`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(filename)}</title>
<style>
  @page{size:A4;margin:12mm}
  *{box-sizing:border-box}
  body{margin:0;font-family:Arial,sans-serif;color:#382333;font-size:10.5px;line-height:1.4;background:#fff}
  .page{width:100%;background:#fff}
  .header{display:grid;grid-template-columns:220px 1fr 94px;gap:14px;align-items:center;border-bottom:3px solid #b01264;padding-bottom:10px;margin-bottom:12px}
  .brand-logo{display:block;width:210px;max-height:78px;object-fit:contain;object-position:left center}
  .brand{text-align:center}.document-title{font-size:17px;font-weight:800;line-height:1.25;color:#8a124f;margin:0}
  .qr{text-align:center}.qr img{width:88px;height:88px}.qr small{display:block;font-size:7px;color:#7a1247}
  .identity-wrap{display:grid;grid-template-columns:1fr ${consentPhotoUrl?'92px':'0px'};gap:10px;align-items:start;margin-bottom:10px}
  .identity{border:1px solid #c59bae;border-radius:7px;padding:9px;display:grid;grid-template-columns:1fr 1fr;gap:5px 16px;margin:0}
  .resident-photo{width:92px;height:112px;border:1px solid #c59bae;border-radius:7px;object-fit:cover;background:#faf5f8}
  h2{font-size:13px;margin:11px 0 4px;border-bottom:1px solid #d9a9c0;padding-bottom:3px;color:#8a124f}
  h3{font-size:11px;margin:8px 0 4px;color:#8a124f}
  p{margin:5px 0;text-align:justify}
  table{width:100%;border-collapse:collapse;font-size:8.5px;margin:5px 0 8px;page-break-inside:auto}
  tr{page-break-inside:avoid;page-break-after:auto}
  th,td{border:1px solid #c59bae;padding:4px;text-align:left;vertical-align:top}
  th{background:linear-gradient(90deg,#f9e4ee,#fff1f7)}
  .fee-table th{width:34%;font-weight:800}.fee-table td{font-weight:600}
  /* Keep the legal acknowledgement attached to the signatures. A signature-only page is not permitted. */
  .final-consent-block{break-inside:avoid-page!important;page-break-inside:avoid!important}
  .final-consent-block h2{break-after:avoid-page!important;page-break-after:avoid!important}
  .final-consent-block>p{break-after:avoid-page!important;page-break-after:avoid!important}
  .signatures{display:grid;grid-template-columns:1fr 1fr;gap:10px 25px;margin-top:14px;break-inside:avoid-page!important;page-break-inside:avoid!important}
  .signature{min-height:62px;break-inside:avoid-page!important;page-break-inside:avoid!important}.line{border-top:1px solid #222;padding-top:3px;margin-top:20px;font-weight:700}
  .footer{margin-top:14px;padding-top:6px;border-top:1px solid #d8b6c7;font-size:7.5px;color:#7a1247}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <img class="brand-logo" src="${escapeHtml(BRAND_LOGO_URL)}" alt="Samara Assisted Living">
    <div class="brand">
      <div class="document-title">Resident Admission, Care Consent and Acknowledgement</div>
    </div>
    <div class="qr">
      <img src="${qrDataUrl}" alt="Admission verification QR code">
      <small>Admission verification</small>
    </div>
  </div>

  <div class="identity-wrap">
  <div class="identity">
    <div><b>Resident:</b> ${escapeHtml(formalName(row))}</div>
    <div><b>Resident ID:</b> ${escapeHtml(patientCode)}</div>
    <div><b>Consent Reference:</b> ${escapeHtml(reference)}</div>
    <div><b>Admission Date:</b> ${escapeHtml(formatDateIN(row.admission_date))}</div>
    <div><b>Age / Gender:</b> ${escapeHtml(row.age||'—')} / ${escapeHtml(row.gender||'—')}</div>
    <div><b>Blood Group:</b> ${escapeHtml(row.blood_group||'Unknown')}</div>
    <div><b>Mobile:</b> ${escapeHtml(row.mobile||'—')}</div>
    <div><b>Room / Bed:</b> ${escapeHtml(`${row.room_no||'—'} / ${row.bed_no||'—'}`)}</div>
    <div><b>Admission Source:</b> ${escapeHtml(row.admission_type||'—')}</div>
    <div><b>Family / Attendant:</b> ${escapeHtml(row.attendant_name||'—')}</div>
    <div><b>Attendant Contact:</b> ${escapeHtml(row.attendant_phone||'—')}</div>
    <div><b>Billing:</b> ${escapeHtml(row.billing_package||'No Package / Daily Billing')}</div>
    <div><b>Condition:</b> ${escapeHtml(row.diagnosis||'—')}</div>
  </div>
  ${consentPhotoUrl?`<img class="resident-photo" src="${escapeHtml(consentPhotoUrl)}" alt="Resident photo">`:''}
  </div>

  <h2>1. Voluntary Admission and Authority</h2>
  <p>The Resident confirms that admission is voluntary. Where the Resident is unable to understand or sign, the authorised relative or representative confirms that the admission is made in the Resident’s best interests and that the basis of authority has been disclosed. Samara Care may request supporting authority documents.</p>

  <h2>2. Nature and Scope of Assisted-Living Services</h2>
  <p>Samara Care is an assisted-living and supportive-care facility and is not represented as a full-service hospital. Services may include accommodation, assistance with activities of daily living, medication support according to recorded prescriptions, nutrition support, nursing observation, physiotherapy where arranged, and coordination with external doctors, laboratories, ambulances and hospitals. Clinical emergencies or needs beyond the facility’s capability may require transfer to an appropriate hospital.</p>

  <h2>3. Medical Information, Medication and Emergency Authorisation</h2>
  <p>The Resident or Representative confirms that known illnesses, allergies, medicines, behavioural concerns, mobility risks and special instructions have been disclosed accurately. Consent is given to administer or assist with prescribed medicines according to the recorded medication orders and to contact the treating doctor when required. In an emergency, Samara Assisted Living is authorised to arrange first aid, ambulance transport and hospital evaluation where reasonably necessary. The hospital may be of Samara's choice depending upon the situation and the patient's condition. External medical, ambulance, investigation and hospital expenses remain chargeable as applicable.</p>

  <h3>Current Medicines Recorded at Admission</h3>
  <table>
    <thead><tr><th>No.</th><th>Prescribed Doctor</th><th>Medicine</th><th>Strength</th><th>Frequency</th><th>Route</th><th>Time</th><th>Food</th></tr></thead>
    <tbody>${medRows}</tbody>
  </table>

  <h3>Master Care Plan</h3>
  <table>
    <thead><tr><th>No.</th><th>Care Task</th><th>Shift</th><th>Frequency</th><th>Instruction</th></tr></thead>
    <tbody>${careRows}</tbody>
  </table>

  <p><b>Risks / special arrangements:</b> ${escapeHtml(risks)}</p>
  <p><b>Diet / feeding instructions:</b> ${escapeHtml(row.diet_plan||'Normal diet')}; ${escapeHtml(row.feeding_instruction||'No additional instruction')}</p>

  <h2>4. Fees, Package and Additional Charges</h2>
  <p>The Resident or Representative acknowledges the selected package or daily-billing arrangement, room category, payment obligations, deposits, discounts approved by authorised management, and separately chargeable services. Doctor visits, medicines, investigations, ambulance or transport, external hospital expenses, special nursing, physiotherapy and other non-included services may be charged separately where applicable. Detailed bills and payment records will be maintained by Samara Care.</p>

  <h3>Agreed Fee Structure at Admission</h3>
  <table class="fee-table"><tbody>${feeHtml}</tbody></table>
  <p><b>Financial acknowledgement:</b> The above fee structure represents the admission arrangement recorded on the admission date. Any authorised revision, room transfer, approved discount or separately chargeable service shall be reflected in the patient ledger and final bill.</p>

  <h2>5. Dignity, Privacy, Records and Communication</h2>
  <p>Samara Care will endeavour to protect the Resident’s dignity, privacy, safety and confidentiality. Consent is given to maintain electronic and physical records, use the provided contact details for care coordination and billing communication, and share necessary information with authorised staff, treating professionals, emergency services and hospitals for care purposes. Photographs or recordings for publicity require separate specific consent.</p>

  <h2>6. Personal Belongings and Conduct</h2>
  <p>Valuables should be declared and handled according to facility procedure. The Resident and visitors shall follow reasonable safety, hygiene, visiting and conduct rules. Samara Care is not responsible for undeclared valuables except to the extent required by applicable law or where loss is attributable to proven misconduct of the facility or its personnel.</p>

  <h2>7. Review, Change of Care and Discharge</h2>
  <p>The care plan may be reviewed and reasonably modified based on the Resident’s condition, doctor’s advice and assessed needs, with communication to the Resident or Representative. Transfer or discharge may be initiated on medical advice, voluntary request, non-payment subject to lawful procedure, serious safety concerns, or where the facility can no longer safely meet the Resident’s needs. Final nursing, accounts, belongings and document handover procedures shall be completed at discharge.</p>

  <h2>8. Acknowledgement</h2>
  <p>The undersigned confirm that the admission details, medicine list, care plan, package or billing arrangement and key facility procedures have been explained in a language understood by them; questions were permitted; and the information provided is true to the best of their knowledge. This consent does not waive any right or remedy available under applicable law.</p>

  <div class="signatures">
    ${[
      'Resident Signature / Thumb Impression',
      'Relative / Authorised Representative',
      'Admission Officer / Nurse',
      'Admin / Manager Authorisation',
      'Independent Witness'
    ].map(label=>`
      <div class="signature">
        <div class="line">${label}</div>
        <div>Name: ______________________________</div>
        <div>Relationship / Designation: __________________</div>
        <div>Date & Time: ________________________</div>
      </div>`).join('')}
  </div>
  </div>

  <div class="footer">
    This operational consent document was generated from the Samara Care admission record. The QR code contains the admission reference particulars. Facility management should have the legal wording reviewed periodically by qualified counsel for applicable requirements.
  </div>
</div>
</body>
</html>`;

        const frame=document.createElement('iframe');
        frame.style.position='fixed';
        frame.style.right='0';
        frame.style.bottom='0';
        frame.style.width='1px';
        frame.style.height='1px';
        frame.style.border='0';
        frame.style.opacity='0';
        document.body.appendChild(frame);
        const doc=frame.contentDocument||frame.contentWindow.document;
        doc.open();doc.write(html);doc.close();
        // Do not open the browser print/PDF dialog until every image (logo, QR and
        // resident photograph) has either loaded or failed. A fixed 400 ms delay was
        // too short and is why the photo could appear in Patient File but disappear
        // from the saved Consent PDF.
        await new Promise(resolve=>{
          const images=Array.from(doc.images||[]);
          if(!images.length)return resolve();
          let remaining=images.length;
          let settled=false;
          const finish=()=>{if(settled)return;settled=true;resolve()};
          const oneDone=()=>{remaining-=1;if(remaining<=0)finish()};
          images.forEach(img=>{
            if(img.complete)oneDone();
            else{img.addEventListener('load',oneDone,{once:true});img.addEventListener('error',oneDone,{once:true});}
          });
          setTimeout(finish,5000);
        });
        await new Promise(resolve=>setTimeout(resolve,120));
        const previousDocumentTitle=document.title;
        const printTitle=String(filename||'Admission_Consent').replace(/\.pdf$/i,'');
        document.title=printTitle;
        doc.title=printTitle;

        const restorePrintTitle=()=>{
          document.title=previousDocumentTitle;
        };
        window.addEventListener('afterprint',restorePrintTitle,{once:true});

        frame.contentWindow.focus();
        frame.contentWindow.print();
        setTimeout(()=>{
          restorePrintTitle();
          frame.remove();
        },5000);
        showPatientToast('success','Admission Consent opened for printing or Save as PDF.');
      }catch(error){
        console.error('Print Consent failed:',error);
        showPatientToast(
          'error',
          error?.message||'Unable to prepare the Admission Consent. Please refresh once and try again.'
        );
      }finally{
        setPatientConsentBusyId(null);
      }
    }

    function duplicateCount(row){return Math.max(0,duplicateMatches(row).length-1)}
    function billingSummary(list){return (list||[]).reduce((a,x)=>{const n=Number(x.amount||0);if(x.transaction_type==='Charge')a.charges+=n;else if(x.transaction_type==='Payment')a.payments+=n;else if(x.transaction_type==='Discount')a.discounts+=n;else if(x.transaction_type==='Refund')a.refunds+=n;return a},{charges:0,payments:0,discounts:0,refunds:0})}
    function tabButton(name,count,label=name){return h('button',{type:'button',className:`patient-tab ${tab===name?'active':''}`,onClick:()=>setTab(name)},label,count!=null?h('span',{className:'tab-count'},count):null)}
    function sectionEmpty(text){return h('p',{className:'small-note'},text)}
    const duplicateRows=rows.filter(r=>duplicateCount(r)>0);
    const activeRows=rows.filter(r=>r.is_active!==false);
    const pendingConsentRows=rows.filter(r=>r.is_active!==false&&['Awaiting Signed Consent','Upload Pending - Exception'].includes(r.admission_consent_status));
    const districtOptions=['All',...Array.from(new Set(rows.map(r=>String(r.district||'').trim()).filter(Boolean))).sort((a,b)=>a.localeCompare(b))];
    const admissionDateLabel=value=>value?formatDateIN(String(value).slice(0,10)):'—';
    const admissionMoney=value=>value===null||value===undefined||value===''?'—':`₹${Number(value||0).toLocaleString('en-IN',{minimumFractionDigits:0,maximumFractionDigits:2})}`;
    const packageExpiryStatus=row=>{
      if(!row?.package_end_date)return 'Daily Fare / No active package expiry';
      const end=new Date(`${String(row.package_end_date).slice(0,10)}T00:00:00`);
      const now=new Date(`${todayISOIndia()}T00:00:00`);
      const days=Math.round((end-now)/86400000);
      if(days<0)return `Expired ${Math.abs(days)} day${Math.abs(days)===1?'':'s'} ago`;
      if(days===0)return 'Expires today';
      return `${days} day${days===1?'':'s'} remaining`;
    };
    const admissionField=(label,value)=>h('div',{className:'patient-admission-field'},h('span',null,label),h('strong',null,value||'—'));
    const patientDetailField=(label,value,extraClass='')=>h('div',{className:`patient-detail-field ${extraClass}`.trim()},h('span',{className:'patient-detail-label'},label),h('span',{className:'patient-detail-colon'},':'),h('span',{className:'patient-detail-value'},value==null||value===''?'—':value));
    const patientQuickLabels={active:'Active patients',inactive:'Inactive / discharged',all:'All records (including discharged)',assigned:'Room assigned',awaiting:'Awaiting room','high-risk':'High-risk patients',duplicates:'Possible duplicates','pending-consent':'Pending signed consent'};
    function openPatientQuickFilter(filter){
      setPatientSearch('');
      setDistrictFilter('All');
      setPatientQuickFilter(filter);
      window.setTimeout(()=>{
        const target=document.getElementById('patient-filter-results');
        if(target) target.scrollIntoView({behavior:'smooth',block:'start'});
      },80);
    }

    const visibleRows=rows.filter(r=>{
      const q=patientSearch.trim().toLowerCase();
      const matchesSearch=!q||[
        r.patient_id,r.patient_code,formalName(r),r.room_no,r.bed_no,r.mobile,r.attendant_phone,
        r.district,r.taluk,r.village_town,r.locality_area,r.street_name,r.pincode
      ].some(value=>String(value||'').toLowerCase().includes(q));
      const matchesDistrict=districtFilter==='All'||String(r.district||'')===districtFilter;
      if(['Nurse','Caregiver'].includes(profile?.role)&&(r.is_active===false||r.admission_status==='Discharged'))return false;
      const matchesQuick=patientQuickFilter==='all'||
        (patientQuickFilter==='active'&&r.is_active!==false)||
        (patientQuickFilter==='inactive'&&r.is_active===false)||
        (patientQuickFilter==='assigned'&&r.is_active!==false&&r.room_no&&r.bed_no)||
        (patientQuickFilter==='awaiting'&&r.is_active!==false&&(!r.room_no||!r.bed_no))||
        (patientQuickFilter==='high-risk'&&r.is_active!==false&&Boolean(r.fall_risk||r.pressure_sore_risk||r.aspiration_risk||r.wandering_risk||r.infection_risk||r.oxygen_required))||
        (patientQuickFilter==='duplicates'&&duplicateCount(r)>0)||
        (patientQuickFilter==='pending-consent'&&r.is_active!==false&&['Awaiting Signed Consent','Upload Pending - Exception'].includes(r.admission_consent_status));
      return matchesSearch&&matchesDistrict&&matchesQuick;
    });
    return h(React.Fragment,null,
      h('div',{className:'grid stats patient-master-stats patient-touch-dashboard'},
        h('button',{type:'button',className:`card stat patient-stat-touch ${patientQuickFilter==='active'?'active':''}`,onClick:()=>openPatientQuickFilter('active')},h('span',null,'Active patients'),h('strong',null,activeRows.length)),
        h('button',{type:'button',className:`card stat patient-stat-touch ${patientQuickFilter==='assigned'?'active':''}`,onClick:()=>openPatientQuickFilter('assigned')},h('span',null,'Room assigned'),h('strong',null,activeRows.filter(x=>x.room_no&&x.bed_no).length)),
        h('button',{type:'button',className:`card stat patient-stat-touch ${patientQuickFilter==='awaiting'?'active':''}`,onClick:()=>openPatientQuickFilter('awaiting')},h('span',null,'Awaiting room'),h('strong',null,activeRows.filter(x=>!x.room_no||!x.bed_no).length)),
        h('button',{type:'button',className:`card stat patient-stat-touch ${patientQuickFilter==='high-risk'?'active':''}`,onClick:()=>openPatientQuickFilter('high-risk')},h('span',null,'High-risk patients'),h('strong',null,activeRows.filter(x=>x.fall_risk||x.pressure_sore_risk||x.aspiration_risk||x.wandering_risk||x.infection_risk||x.oxygen_required).length)),
        h('button',{type:'button',className:`card stat patient-stat-touch ${patientQuickFilter==='duplicates'?'active':''}`,onClick:()=>openPatientQuickFilter('duplicates')},h('span',null,'Possible duplicates'),h('strong',null,duplicateRows.length)),
        h('button',{type:'button',className:`card stat patient-stat-touch ${patientQuickFilter==='pending-consent'?'active':''}`,onClick:()=>openPatientQuickFilter('pending-consent')},h('span',null,'Pending signed consent'),h('strong',null,pendingConsentRows.length))
      ),
      h('div',{className:'card panel',id:'patient-filter-results',style:{scrollMarginTop:'148px'}},
        h('div',{className:'panel-head'},h('div',null,h('h3',null,'Patient Master'),h('small',null,'Single source for identity, admission, nursing, medicines, diet, documents, billing and recovery'))),
        patientQuickFilter!=='all'?h('div',{className:'message info patient-filter-summary',style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'10px',flexWrap:'wrap',marginBottom:'10px'}},
          h('strong',null,`Showing: ${patientQuickLabels[patientQuickFilter]||'Selected patients'} (${visibleRows.length})`),
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setPatientQuickFilter('active')},'Reset to active')
        ):null,
        h('div',{className:'form-grid patient-master-filters',style:{marginBottom:'10px'}},
          h('div',{className:'field'},h('label',{htmlFor:'patient-list-scope'},'Patient list'),h('select',{id:'patient-list-scope',value:patientQuickFilter,onChange:e=>setPatientQuickFilter(e.target.value)},Object.entries(patientQuickLabels).map(([value,label])=>h('option',{key:value,value},label)))),
          h('div',{className:'field'},h('label',null,'Search patient / place'),h('input',{
            value:patientSearch,onChange:e=>setPatientSearch(e.target.value),
            placeholder:'Patient name, room no. or Resident ID'
          })),
          h('div',{className:'field patient-district-filter'},h('label',null,'District'),h('select',{
            value:districtFilter,onChange:e=>setDistrictFilter(e.target.value)
          },districtOptions.map(x=>h('option',{key:x,value:x},x))))
        ),
        duplicateRows.length?h('div',{className:'message warning',style:{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'12px',flexWrap:'wrap'}},
          h('span',null,`${duplicateRows.length} record(s) may be duplicates. Review matching names/mobile numbers before entering new care data.`),
          h('button',{
            type:'button',
            className:'btn btn-warning',
            disabled:duplicateReviewBusy,
            onClick:()=>openDuplicateReview(duplicateRows[0])
          },duplicateReviewBusy?'Reviewing…':'Review & Delete')
        ):null,
        h('div',{className:'patient-row-hint'},'Tap anywhere on a patient row to open the Patient File.'),
        h('div',{className:'table-wrap patient-master-table-wrap'},
          h('table',{className:'table patient-master-table'},
            h('thead',null,h('tr',null,['Photo','Resident ID','Patient','District / Town','Admission Type','Category','Room/Bed','Status','Action'].map(x=>h('th',{key:x},x)))),
            h('tbody',null,
              visibleRows.map(r=>h('tr',{
                key:r.id,
                className:`patient-list-row ${duplicateCount(r)?'duplicate-row':''}`.trim(),
                role:'button',
                tabIndex:0,
                title:`Open Patient File – ${formalName(r)}`,
                'aria-label':`Open Patient File for ${formalName(r)}`,
                onClick:()=>openPatient(r),
                onKeyDown:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPatient(r)}}
              },
                h('td',{'data-label':'Photo'},r.photo_storage_path?h('span',{className:'photo-dot'},'Photo'):'—'),
                h('td',{'data-label':'Resident ID'},r.patient_id||'—'),
                h('td',{'data-label':'Patient'},h('button',{type:'button',className:'patient-name-link',onClick:e=>{e.stopPropagation();openPatient(r)}},formalName(r)),r.is_active===false?h('div',{className:'patient-inactive-label',style:{display:'block',fontSize:'12px',fontWeight:700,marginTop:'4px'}},'Inactive / discharged'):null,duplicateCount(r)?h('div',{className:'small-note danger-text'},'Possible duplicate'):null),
                h('td',{'data-label':'District / Town'},`${r.district||'—'}${r.village_town?` / ${r.village_town}`:''}`),
                h('td',{'data-label':'Admission Type'},r.admission_type||'—'),
                h('td',{'data-label':'Category'},r.patient_category||'—'),
                h('td',{'data-label':'Room / Bed'},
                  h('span',{className:'desktop-room-bed'},r.room_no&&r.bed_no?`${r.room_no}-${r.bed_no}`:'Unassigned'),
                  h('span',{className:`mobile-room-no ${r.room_no?'':'unassigned'}`},r.room_no?`Room ${r.room_no}`:'Room not assigned')
                ),
                h('td',{'data-label':'Status'},h('span',{className:`badge ${r.is_active===false?'off':''}`},r.is_active===false?'Inactive':'Active')),
                h('td',{'data-label':'Action',className:'patient-row-actions',onClick:e=>e.stopPropagation()},h('div',{className:'employee-actions'},
                  h('button',{className:'btn btn-secondary',onClick:()=>openPatient(r)},clinicalView?'View Patient File':'Open Patient File'),
                  canEdit&&duplicateCount(r)?h('button',{
                    className:'btn btn-warning',
                    disabled:duplicateReviewBusy,
                    onClick:()=>openDuplicateReview(r)
                  },'Review & Delete'):null,
                  canEdit?h('button',{className:'btn btn-secondary',onClick:()=>openEditPatient(r)},'Edit'):null,
                  h('button',{
                    className:'btn btn-primary',
                    disabled:patientConsentBusyId===r.id,
                    onClick:()=>printPatientConsent(r)
                  },patientConsentBusyId===r.id?'Preparing…':'Print Consent'),
                  canEdit?h('button',{className:'btn btn-secondary',onClick:()=>printPatientIdCard(r)},'Print ID Card'):null
                ))
              )),
              visibleRows.length===0&&h('tr',null,h('td',{colSpan:9,className:'empty'},'No patients match the selected search or filter'))
            )
          )
        )
      ),
      duplicateReview&&h('div',{className:'modal-backdrop'},
        h('div',{className:'card modal',style:{width:'min(1080px,97vw)',maxHeight:'92vh',overflow:'auto'}},
          h('div',{className:'panel-head'},
            h('div',null,
              h('h3',null,'Review Possible Duplicate Patients'),
              h('small',null,'Compare the records carefully. Delete only the incorrect duplicate with no clinical or financial activity.')
            ),
            h('button',{type:'button',className:'close',onClick:()=>setDuplicateReview(null)},'×')
          ),
          h('div',{className:'message warning'},
            'The record marked “Recommended Keep” has the stronger history, completed consent, or earlier registration. Use Merge & Delete Duplicate to transfer linked history safely before deleting the unwanted Resident ID.'
          ),
          h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))',gap:'12px'}},
            duplicateReview.records.map(record=>
              h('div',{
                className:'section-card',
                key:record.id,
                style:{
                  border:record.id===duplicateReview.recommendedKeepId?'2px solid #b01264':'1px solid #d9e5e1',
                  background:record.id===duplicateReview.recommendedKeepId?'#f1faf7':'#fff'
                }
              },
                h('div',{className:'panel-head'},
                  h('div',null,
                    h('h4',null,formalName(record)),
                    h('small',null,record.patient_code||record.patient_id||'—')
                  ),
                  record.id===duplicateReview.recommendedKeepId
                    ?h('span',{className:'badge'},'Recommended Keep')
                    :null
                ),
                h('p',null,`Created: ${record.created_at?fmt(record.created_at):'—'}`),
                h('p',null,`Status: ${record.is_active===false?'Inactive':'Active'} · Room ${record.room_no||'—'}-${record.bed_no||'—'}`),
                h('p',null,`Mobile: ${record.mobile||'—'} · Attendant: ${record.attendant_phone||'—'}`),
                h('p',null,`Consent: ${record.admission_consent_status||'Not recorded'}`),
                h('div',{className:'accounts-status-list'},
                  h('div',{className:'accounts-status-item'},h('span',null,'Billing transactions'),h('strong',null,record.counts.billing)),
                  h('div',{className:'accounts-status-item'},h('span',null,'Medicine orders'),h('strong',null,record.counts.medicines)),
                  h('div',{className:'accounts-status-item'},h('span',null,'Care orders'),h('strong',null,record.counts.care)),
                  h('div',{className:'accounts-status-item'},h('span',null,'Vitals / incidents'),h('strong',null,record.counts.vitals+record.counts.incidents)),
                  h('div',{className:'accounts-status-item'},h('span',null,'Documents'),h('strong',null,record.counts.documents))
                ),
                h('div',{className:'actions'},
                  h('button',{
                    type:'button',
                    className:'btn btn-secondary',
                    onClick:()=>openPatient(record)
                  },'Open Patient File'),
                  h('button',{
                    type:'button',
                    className:'btn btn-primary',
                    disabled:patientConsentBusyId===record.id,
                    onClick:()=>printPatientConsent(record)
                  },patientConsentBusyId===record.id?'Preparing…':'Print Consent'),
                  canEdit&&record.id!==duplicateReview.recommendedKeepId?h('button',{
                    type:'button',
                    className:'btn btn-danger',
                    disabled:duplicateReviewBusy,
                    title:record.activityCount>0
                      ?'Merge this record’s history into the recommended patient and delete the duplicate'
                      :'Delete this empty duplicate record',
                    onClick:()=>deleteReviewedDuplicate(record)
                  },record.activityCount>0?'Merge & Delete Duplicate':'Delete Duplicate'):null
                )
              )
            )
          )
        )
      ),
      selected&&details&&h('div',{className:'modal-backdrop patient-file-backdrop'},h('div',{className:'card modal patient-master-modal'},
        h('style',{id:'samara-patient-file-layout-v21067'},`
/* v2.10.67 — Patient File layout and section-heading restoration. Scoped only to Patient File. */
.patient-file-backdrop{
  box-sizing:border-box!important;
  overflow:hidden!important;
}
.patient-file-backdrop .patient-master-modal{
  box-sizing:border-box!important;
  width:min(1180px,calc(100% - 28px))!important;
  max-width:1180px!important;
  min-width:0!important;
  overflow-x:hidden!important;
}
.patient-file-backdrop .patient-master-modal,
.patient-file-backdrop .patient-master-modal > *,
.patient-file-backdrop .patient-tab-content,
.patient-file-backdrop .tabs-grid,
.patient-file-backdrop .section-card{
  min-width:0!important;
  box-sizing:border-box!important;
}
.patient-file-backdrop .patient-master-header{
  width:100%!important;
  min-width:0!important;
  position:relative!important;
}
.patient-file-backdrop .patient-discharge-stamp{
  position:absolute!important;
  right:18px!important;
  top:112px!important;
  z-index:8!important;
  pointer-events:none!important;
  transform:rotate(-8deg)!important;
  border:4px double #c62828!important;
  border-radius:8px!important;
  padding:7px 14px 6px!important;
  color:#c62828!important;
  background:rgba(255,255,255,.92)!important;
  box-shadow:0 0 0 2px rgba(198,40,40,.08)!important;
  text-align:center!important;
  text-transform:uppercase!important;
  font-weight:900!important;
  letter-spacing:1.4px!important;
  line-height:1.05!important;
  opacity:.94!important;
}
.patient-file-backdrop .patient-discharge-stamp strong{
  display:block!important;
  font-size:24px!important;
  letter-spacing:2px!important;
}
.patient-file-backdrop .patient-discharge-stamp span{
  display:block!important;
  margin-top:5px!important;
  font-size:12px!important;
  letter-spacing:.6px!important;
  text-transform:none!important;
}
.patient-file-backdrop .patient-master-header>.employee-actions{
  display:flex!important;
  flex-wrap:wrap!important;
  justify-content:flex-end!important;
  gap:8px!important;
  min-width:0!important;
}
.patient-file-backdrop .patient-tab-bar{
  display:grid!important;
  grid-template-columns:repeat(auto-fit,minmax(132px,1fr))!important;
  gap:8px!important;
  width:100%!important;
  white-space:normal!important;
  overflow:visible!important;
  padding:10px 0 12px!important;
}
.patient-file-backdrop .patient-tab-bar .patient-tab,
.patient-file-backdrop .patient-tab-bar button{
  width:100%!important;
  min-width:0!important;
  min-height:44px!important;
  padding:9px 10px!important;
  white-space:normal!important;
  line-height:1.2!important;
  text-align:center!important;
}
.patient-file-backdrop .tabs-grid{
  grid-template-columns:1fr!important;
  gap:12px!important;
  width:100%!important;
}
.patient-file-backdrop .section-card{
  width:100%!important;
  max-width:100%!important;
  padding:18px 20px!important;
  margin:10px 0!important;
  line-height:1.5!important;
}
.patient-file-backdrop .section-card h4{
  margin:0 0 10px!important;
  color:#b20f5b!important;
  font-weight:800!important;
}
.patient-file-backdrop .patient-overview-fields,
.patient-file-backdrop .patient-detail-fields{
  display:grid!important;
  grid-template-columns:1fr!important;
  gap:0!important;
  width:100%!important;
}
.patient-file-backdrop .patient-overview-field,
.patient-file-backdrop .patient-detail-field,
.patient-file-backdrop .patient-admission-field{
  display:grid!important;
  grid-template-columns:190px minmax(0,1fr)!important;
  gap:18px!important;
  align-items:start!important;
  width:100%!important;
  min-width:0!important;
  padding:9px 0!important;
  margin:0!important;
  border-bottom:1px solid #f1dde7!important;
  line-height:1.45!important;
}
.patient-file-backdrop .patient-overview-field:last-child,
.patient-file-backdrop .patient-detail-field:last-child,
.patient-file-backdrop .patient-admission-field:last-child{
  border-bottom:0!important;
}
.patient-file-backdrop .patient-overview-colon,
.patient-file-backdrop .patient-detail-colon{
  display:none!important;
}
.patient-file-backdrop .patient-overview-label,
.patient-file-backdrop .patient-detail-label,
.patient-file-backdrop .patient-admission-field>span{
  min-width:0!important;
  color:#735d69!important;
  font-size:14px!important;
  font-weight:600!important;
}
.patient-file-backdrop .patient-overview-value,
.patient-file-backdrop .patient-detail-value,
.patient-file-backdrop .patient-admission-field>strong{
  min-width:0!important;
  color:#382333!important;
  font-size:14px!important;
  font-weight:700!important;
  overflow-wrap:anywhere!important;
  word-break:normal!important;
}


/* v2.10.64 — Patient File Billing readability. Scoped only to Billing tab. */
.patient-file-backdrop .patient-billing-tab{
  width:100%!important;
  min-width:0!important;
}
.patient-file-backdrop .patient-billing-summary{
  display:grid!important;
  grid-template-columns:repeat(4,minmax(0,1fr))!important;
  gap:12px!important;
  width:100%!important;
  margin:4px 0 12px!important;
}
.patient-file-backdrop .patient-billing-stat{
  min-width:0!important;
  padding:16px!important;
  border:1px solid #efcddd!important;
  border-radius:18px!important;
  background:#fffafd!important;
}
.patient-file-backdrop .patient-billing-stat span{
  display:block!important;
  margin-bottom:5px!important;
  color:#6d7a78!important;
  font-size:13px!important;
}
.patient-file-backdrop .patient-billing-stat strong{
  display:block!important;
  color:#382333!important;
  font-size:25px!important;
  line-height:1.15!important;
  white-space:nowrap!important;
}
.patient-file-backdrop .patient-billing-ledger{
  padding:18px 20px!important;
}
.patient-file-backdrop .patient-billing-row{
  display:block!important;
  width:100%!important;
  padding:13px 0!important;
  border-bottom:1px solid #f0e0e8!important;
}
.patient-file-backdrop .patient-billing-row:last-child{
  border-bottom:0!important;
}
.patient-file-backdrop .patient-billing-row-main{
  display:grid!important;
  grid-template-columns:minmax(0,1fr) auto!important;
  gap:14px!important;
  align-items:start!important;
}
.patient-file-backdrop .patient-billing-row-main>strong:first-child{
  min-width:0!important;
  color:#3b2934!important;
  font-size:14px!important;
  line-height:1.4!important;
  overflow-wrap:anywhere!important;
}
.patient-file-backdrop .patient-billing-amount{
  color:#7d0f49!important;
  font-size:15px!important;
  white-space:nowrap!important;
}
.patient-file-backdrop .patient-billing-row-meta{
  display:grid!important;
  grid-template-columns:165px minmax(0,1fr)!important;
  gap:12px!important;
  margin-top:5px!important;
  color:#6f5d67!important;
  font-size:13px!important;
  line-height:1.45!important;
}
.patient-file-backdrop .patient-billing-date{
  white-space:nowrap!important;
}
.patient-file-backdrop .patient-billing-description{
  min-width:0!important;
  overflow-wrap:anywhere!important;
}
.patient-file-backdrop .patient-medication-tab{display:grid!important;gap:12px!important;}
.patient-file-backdrop .patient-med-table-wrap{width:100%!important;overflow-x:auto!important;border:1px solid #ead8e1!important;border-radius:12px!important;background:#fff!important;}
.patient-file-backdrop .patient-med-table{width:100%!important;border-collapse:collapse!important;min-width:780px!important;font-size:13px!important;}
.patient-file-backdrop .patient-med-table th{padding:9px 10px!important;text-align:left!important;background:#f9edf3!important;color:#781143!important;font-size:12px!important;white-space:nowrap!important;border-bottom:1px solid #e8cfdb!important;}
.patient-file-backdrop .patient-med-table td{padding:9px 10px!important;vertical-align:top!important;border-bottom:1px solid #f0e3e9!important;line-height:1.35!important;}
.patient-file-backdrop .patient-med-table tbody tr:last-child td{border-bottom:0!important;}
.patient-file-backdrop .patient-med-table small{display:block!important;margin-top:2px!important;color:#7b6872!important;font-size:11px!important;}
.patient-file-backdrop .patient-med-change-lines{display:grid!important;gap:4px!important;min-width:210px!important;}
.patient-file-backdrop .patient-med-change-lines>div{padding-bottom:4px!important;border-bottom:1px dotted #ead8e1!important;}
.patient-file-backdrop .patient-med-change-lines>div:last-child{padding-bottom:0!important;border-bottom:0!important;}
.patient-file-backdrop .patient-med-review-table{min-width:900px!important;}
.patient-file-backdrop .patient-med-history-table{min-width:980px!important;}
.patient-file-backdrop .patient-med-mar-table{min-width:620px!important;}
.patient-file-backdrop .patient-med-row-head{display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:12px!important;flex-wrap:wrap!important;}
.patient-file-backdrop .patient-med-row-head small{display:block!important;margin-top:3px!important;color:#78636f!important;}
.patient-file-backdrop .patient-med-history-list,.patient-file-backdrop .patient-med-review-list{display:grid!important;gap:10px!important;}
.patient-file-backdrop .patient-med-history-card,.patient-file-backdrop .patient-med-review-card{padding:13px 14px!important;border:1px solid #ead8e1!important;border-radius:14px!important;background:#fff!important;}
.patient-file-backdrop .patient-med-history-grid{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:9px 14px!important;margin-top:10px!important;}
.patient-file-backdrop .patient-med-history-grid>div{min-width:0!important;}
.patient-file-backdrop .patient-med-history-grid span{display:block!important;color:#78636f!important;font-size:12px!important;margin-bottom:2px!important;}
.patient-file-backdrop .patient-med-history-grid strong{display:block!important;font-size:13px!important;line-height:1.4!important;overflow-wrap:anywhere!important;}
.patient-file-backdrop .patient-med-review-note{margin:10px 0!important;padding:9px 11px!important;border-left:3px solid #b20f5b!important;background:#fff7fb!important;}
.patient-file-backdrop .patient-med-review-items{display:grid!important;gap:7px!important;margin-top:9px!important;}
.patient-file-backdrop .patient-med-review-item{display:grid!important;grid-template-columns:auto minmax(140px,.7fr) minmax(220px,1.5fr)!important;gap:8px!important;align-items:center!important;padding:8px 0!important;border-top:1px solid #f3e5ec!important;}
.patient-file-backdrop .patient-med-review-item small{line-height:1.35!important;color:#75636d!important;}

@media(max-width:760px){
  html:has(.patient-file-backdrop),body:has(.patient-file-backdrop){
    width:100%!important;
    max-width:100%!important;
    overflow:hidden!important;
  }
  .patient-file-backdrop{
    position:fixed!important;
    inset:0!important;
    width:100%!important;
    max-width:100%!important;
    height:100dvh!important;
    padding:0!important;
    margin:0!important;
    background:#f8f4f6!important;
    overflow:hidden!important;
  }
  .patient-file-backdrop .patient-master-modal{
    position:absolute!important;
    inset:0!important;
    width:100%!important;
    max-width:100%!important;
    min-width:0!important;
    height:100dvh!important;
    max-height:100dvh!important;
    margin:0!important;
    padding:calc(6px + env(safe-area-inset-top)) 10px calc(18px + env(safe-area-inset-bottom))!important;
    border:0!important;
    border-radius:0!important;
    transform:none!important;
    overflow-y:auto!important;
    overflow-x:hidden!important;
    overscroll-behavior:contain!important;
    -webkit-overflow-scrolling:touch!important;
  }
  .patient-file-backdrop .patient-master-modal > *{
    width:100%!important;
    max-width:100%!important;
    min-width:0!important;
  }
  .patient-file-backdrop .patient-mobile-back{
    display:flex!important;
    position:static!important;
    width:100%!important;
    max-width:100%!important;
    min-height:46px!important;
    margin:0 0 8px!important;
    padding:9px 10px!important;
    border:1px solid #ead0de!important;
    border-radius:11px!important;
    background:#fff!important;
    color:#761146!important;
    font-size:15px!important;
    font-weight:850!important;
    box-shadow:none!important;
  }
  .patient-file-backdrop .patient-master-header{
    position:static!important;
    display:flex!important;
    flex-direction:column!important;
    align-items:stretch!important;
    gap:9px!important;
    width:100%!important;
    max-width:100%!important;
    padding:4px 0 8px!important;
    margin:0!important;
    overflow:hidden!important;
  }
  .patient-file-backdrop .patient-head{
    display:grid!important;
    grid-template-columns:62px minmax(0,1fr)!important;
    gap:10px!important;
    align-items:center!important;
    width:100%!important;
    min-width:0!important;
    min-height:72px!important;
    padding:0!important;
  }
  .patient-file-backdrop .patient-photo,
  .patient-file-backdrop .patient-photo-placeholder{
    width:62px!important;
    height:70px!important;
    min-width:62px!important;
    max-width:62px!important;
    min-height:70px!important;
    max-height:70px!important;
    border-radius:12px!important;
  }
  .patient-file-backdrop .patient-head>div:last-child{
    width:100%!important;
    min-width:0!important;
    overflow:hidden!important;
  }
  .patient-file-backdrop .patient-head h3{
    margin:0 0 3px!important;
    font-size:20px!important;
    line-height:1.15!important;
    white-space:normal!important;
    overflow-wrap:anywhere!important;
  }
  .patient-file-backdrop .patient-head small{
    display:block!important;
    font-size:12px!important;
    line-height:1.3!important;
    white-space:normal!important;
    overflow-wrap:anywhere!important;
  }
  .patient-file-backdrop .patient-header-badges{
    display:flex!important;
    flex-wrap:wrap!important;
    gap:5px!important;
    overflow:visible!important;
  }
  .patient-file-backdrop .patient-master-header>.employee-actions{
    position:static!important;
    display:grid!important;
    grid-template-columns:repeat(2,minmax(0,1fr))!important;
    gap:7px!important;
    width:100%!important;
    max-width:100%!important;
    margin:0!important;
  }
  .patient-file-backdrop .patient-master-header>.employee-actions .btn{
    width:100%!important;
    min-width:0!important;
    min-height:42px!important;
    padding:8px 6px!important;
    font-size:13px!important;
    line-height:1.15!important;
    white-space:normal!important;
  }
  .patient-file-backdrop .patient-master-header>.employee-actions .btn:nth-of-type(3){
    grid-column:1 / -1!important;
  }
  .patient-file-backdrop .patient-master-header>.employee-actions .close{
    display:none!important;
  }
  .patient-file-backdrop .patient-tab-bar{
    position:static!important;
    top:auto!important;
    display:grid!important;
    grid-template-columns:repeat(2,minmax(0,1fr))!important;
    gap:7px!important;
    width:100%!important;
    max-width:100%!important;
    margin:4px 0 10px!important;
    padding:8px 0 10px!important;
    overflow:visible!important;
    box-shadow:none!important;
    border-top:1px solid #f1dde7!important;
    border-bottom:1px solid #f1dde7!important;
  }
  .patient-file-backdrop .patient-tab-bar .patient-tab,
  .patient-file-backdrop .patient-tab-bar button{
    width:100%!important;
    min-width:0!important;
    min-height:48px!important;
    padding:9px 7px!important;
    font-size:13px!important;
    line-height:1.15!important;
    white-space:normal!important;
    overflow:hidden!important;
    border:1.5px solid #b8d8cf!important;
    border-radius:13px!important;
    background:linear-gradient(180deg,#fbfffd 0%,#e6f3ef 100%)!important;
    color:#075f50!important;
    font-weight:800!important;
    box-shadow:0 2px 0 #b7d1c9,0 4px 10px rgba(8,86,70,.10)!important;
    text-shadow:0 1px 0 rgba(255,255,255,.75)!important;
    transition:transform .12s ease,box-shadow .12s ease,background .12s ease!important;
  }
  .patient-file-backdrop .patient-tab-bar .patient-tab:active,
  .patient-file-backdrop .patient-tab-bar button:active{
    transform:translateY(1px)!important;
    box-shadow:0 1px 0 #b7d1c9,0 2px 5px rgba(8,86,70,.10)!important;
  }
  .patient-file-backdrop .patient-tab-bar .patient-tab.active,
  .patient-file-backdrop .patient-tab-bar button.active{
    border-color:#08765f!important;
    background:linear-gradient(180deg,#11866d 0%,#08715d 100%)!important;
    color:#fff!important;
    box-shadow:0 2px 0 #075a4a,0 5px 12px rgba(8,91,73,.20)!important;
    text-shadow:none!important;
  }
  .patient-file-backdrop .patient-tab-bar .tab-count{
    display:inline-flex!important;
    align-items:center!important;
    justify-content:center!important;
    min-width:22px!important;
    height:22px!important;
    margin-left:6px!important;
    padding:0 6px!important;
    border-radius:999px!important;
    background:rgba(255,255,255,.72)!important;
    border:1px solid rgba(7,95,80,.12)!important;
    color:#075f50!important;
    font-size:12px!important;
    font-weight:850!important;
    vertical-align:middle!important;
  }
  .patient-file-backdrop .patient-tab-bar .patient-tab.active .tab-count,
  .patient-file-backdrop .patient-tab-bar button.active .tab-count{
    background:rgba(255,255,255,.20)!important;
    border-color:rgba(255,255,255,.18)!important;
    color:#fff!important;
  }
  .patient-file-backdrop .patient-tab-content{
    width:100%!important;
    max-width:100%!important;
    min-width:0!important;
    padding-top:4px!important;
    overflow-x:hidden!important;
  }
  .patient-file-backdrop .section-card{
    width:100%!important;
    max-width:100%!important;
    min-width:0!important;
    padding:14px 13px!important;
    margin:8px 0!important;
    overflow:hidden!important;
  }
  .patient-file-backdrop .patient-overview-field,
  .patient-file-backdrop .patient-detail-field,
  .patient-file-backdrop .patient-admission-field{
    grid-template-columns:minmax(105px,39%) minmax(0,1fr)!important;
    gap:10px!important;
    padding:8px 0!important;
  }
  .patient-file-backdrop .patient-overview-label,
  .patient-file-backdrop .patient-detail-label,
  .patient-file-backdrop .patient-admission-field>span{
    font-size:12.5px!important;
    line-height:1.35!important;
  }
  .patient-file-backdrop .patient-overview-value,
  .patient-file-backdrop .patient-detail-value,
  .patient-file-backdrop .patient-admission-field>strong{
    font-size:13.5px!important;
    line-height:1.4!important;
    text-align:left!important;
  }
  .patient-file-backdrop .patient-overview-address{
    grid-column:auto!important;
  }
  .patient-file-backdrop .patient-billing-summary{
    grid-template-columns:repeat(2,minmax(0,1fr))!important;
    gap:8px!important;
    margin:2px 0 10px!important;
  }
  .patient-file-backdrop .patient-billing-stat{
    padding:12px 11px!important;
    border-radius:14px!important;
  }
  .patient-file-backdrop .patient-billing-stat span{
    font-size:12px!important;
    margin-bottom:4px!important;
  }
  .patient-file-backdrop .patient-billing-stat strong{
    font-size:20px!important;
  }
  .patient-file-backdrop .patient-billing-ledger{
    padding:13px!important;
  }
  .patient-file-backdrop .patient-billing-row{
    padding:11px 0!important;
  }
  .patient-file-backdrop .patient-billing-row-main{
    grid-template-columns:minmax(0,1fr) auto!important;
    gap:8px!important;
  }
  .patient-file-backdrop .patient-billing-row-main>strong:first-child{
    font-size:13px!important;
  }
  .patient-file-backdrop .patient-billing-amount{
    font-size:14px!important;
  }
  .patient-file-backdrop .patient-billing-row-meta{
    grid-template-columns:1fr!important;
    gap:2px!important;
    margin-top:5px!important;
    font-size:12.5px!important;
  }
  .patient-file-backdrop .patient-billing-date{
    color:#856c79!important;
    white-space:normal!important;
  }
  .patient-file-backdrop .patient-med-history-grid{grid-template-columns:1fr!important;gap:7px!important;}
  .patient-file-backdrop .patient-med-history-card,.patient-file-backdrop .patient-med-review-card{padding:12px!important;}
  .patient-file-backdrop .patient-med-review-item{grid-template-columns:1fr!important;gap:3px!important;}
  .patient-file-backdrop .patient-med-row-head{gap:7px!important;}
}
`),
        h('button',{type:'button',className:'patient-mobile-back',onClick:()=>{setSelected(null);setDetails(null);setPhotoUrl('')}},'← Back to Patients'),
        h('div',{className:'panel-head patient-master-header'},h('div',{className:'patient-head',style:{display:'flex',alignItems:'center',gap:'14px',minWidth:0,flex:'1 1 auto'}},photoUrl?h('img',{src:photoUrl,className:'patient-photo',alt:`${formalName(selected)} photo`,style:{width:'92px',height:'108px',maxWidth:'92px',minWidth:'92px',maxHeight:'108px',objectFit:'cover',objectPosition:'center',borderRadius:'16px',border:'1px solid #ead0de',background:'#fff',display:'block',flex:'0 0 92px'}}):h('div',{className:'patient-photo patient-photo-placeholder',style:{width:'92px',height:'108px',maxWidth:'92px',minWidth:'92px',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'16px',flex:'0 0 92px'}},'SC'),h('div',{style:{minWidth:0,flex:'1 1 auto'}},h('h3',null,formalName(selected)),h('small',null,`${selected.patient_id||'—'} · ${selected.admission_type||''} · ${selected.patient_category||''}`),h('div',{className:'patient-header-badges'},h('span',{className:'badge'},selected.is_active===false?'Inactive':'Active'),selected.room_no&&selected.bed_no?h('span',{className:'pill'},`Room ${selected.room_no} · Bed ${selected.bed_no}`):h('span',{className:'pill warning'},'Room not assigned'),selected.special_nurse_required?h('span',{className:'pill warning'},`Special nurse: ${selected.special_nurse_name||'Required'}`):null))),h('div',{className:'employee-actions'},
          h('button',{className:'btn btn-secondary',onClick:()=>setTab('Admission Details')},'Admission Details'),
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setTab('Consent')},'Consent'),
          canEdit?h('button',{className:'btn btn-secondary',onClick:()=>setShowFamilyDetails(true)},'Family Details'):null,
          canEdit?h('button',{className:'btn btn-secondary',onClick:()=>openEditPatient(selected)},'Edit Patient'):h('span',{className:'pill'},'View only'),h('button',{className:'close',onClick:()=>{setSelected(null);setDetails(null);setPhotoUrl('');setShowFamilyDetails(false)}},'×')),
          completedPatientDischarge()?h('div',{className:'patient-discharge-stamp','aria-label':'Patient discharged'},
            h('strong',null,'DISCHARGED'),
            h('span',null,`Discharged on ${formatDateIN(String(completedPatientDischarge().actual_departure_at||completedPatientDischarge().updated_at||completedPatientDischarge().created_at||'').slice(0,10))} · ${formatTimeIN(completedPatientDischarge().actual_departure_at||completedPatientDischarge().updated_at||completedPatientDischarge().created_at)}`)
          ):null),
        h('div',{className:'patient-tab-bar'},tabButton('Overview'),tabButton('Admission Details'),tabButton('Documents',details.docs.length),tabButton('Consent',details.docs.filter(window.SamaraConsent.isConsent).length),(canEdit||nursingManagerView)?tabButton('Clinical History',(details.allMar||[]).length+(details.nursingProcedures||[]).length+(details.careLogs||[]).length+(details.vitals||[]).length+(details.physioSessions||[]).length):null,tabButton('Medicines',details.meds.length),tabButton('Nursing',details.careLogs.length),tabButton('Vitals',details.vitals.length),tabButton('Physiotherapy',details.physioSessions.length),tabButton('Diet',details.meals.length),tabButton('Daily Moments',(details.dailyMoments||[]).length),!clinicalView?tabButton('Billing',details.billing.length,nursingManagerView?'Pending Dues':'Billing'):null,tabButton('Timeline',details.recovery.length+details.incidents.length),canEdit?tabButton('Family Portal',(details.familyAccess||[]).filter(x=>x.is_active).length):null),
        h('div',{className:'patient-tab-content'},
          tab==='Overview'&&h('div',{className:'tabs-grid'},
            h('div',{className:'section-card'},
              h('h4',null,'Identity & Contacts'),
              h('div',{className:'patient-overview-fields'},
                h('div',{className:'patient-overview-field'},h('span',{className:'patient-overview-label'},'Resident ID'),h('span',{className:'patient-overview-colon'},':'),h('span',{className:'patient-overview-value'},selected.patient_id||'—')),
                h('div',{className:'patient-overview-field'},h('span',{className:'patient-overview-label'},'Gender / Age'),h('span',{className:'patient-overview-colon'},':'),h('span',{className:'patient-overview-value'},`${selected.gender||'—'} / ${selected.age||'—'}`)),
                h('div',{className:'patient-overview-field'},h('span',{className:'patient-overview-label'},'Blood Group'),h('span',{className:'patient-overview-colon'},':'),h('span',{className:'patient-overview-value'},selected.blood_group||'Unknown')),
                h('div',{className:'patient-overview-field'},h('span',{className:'patient-overview-label'},'Profession'),h('span',{className:'patient-overview-colon'},':'),h('span',{className:'patient-overview-value'},selected.profession||'—')),
                h('div',{className:'patient-overview-field'},h('span',{className:'patient-overview-label'},'Field / Sector'),h('span',{className:'patient-overview-colon'},':'),h('span',{className:'patient-overview-value'},selected.profession_field||'—')),
                ['Government Employee','Private Employee'].includes(selected.profession)?h('div',{className:'patient-overview-field'},h('span',{className:'patient-overview-label'},'Employment Status'),h('span',{className:'patient-overview-colon'},':'),h('span',{className:'patient-overview-value'},selected.employment_status||'—')):null,
                h('div',{className:'patient-overview-field'},h('span',{className:'patient-overview-label'},'Mobile'),h('span',{className:'patient-overview-colon'},':'),h('span',{className:'patient-overview-value'},selected.mobile||'—')),
                h('div',{className:'patient-overview-field patient-overview-address'},h('span',{className:'patient-overview-label'},'Address'),h('span',{className:'patient-overview-colon'},':'),h('span',{className:'patient-overview-value'},selected.address||patientAddress(selected)||'Address not recorded')),
                h('div',{className:'patient-overview-field'},h('span',{className:'patient-overview-label'},'District / Taluk'),h('span',{className:'patient-overview-colon'},':'),h('span',{className:'patient-overview-value'},`${selected.district||'—'} / ${selected.taluk||'—'}`)),
                h('div',{className:'patient-overview-field'},h('span',{className:'patient-overview-label'},'PIN'),h('span',{className:'patient-overview-colon'},':'),h('span',{className:'patient-overview-value'},selected.pincode||'—')),
                h('div',{className:'patient-overview-field'},h('span',{className:'patient-overview-label'},'Attendant'),h('span',{className:'patient-overview-colon'},':'),h('span',{className:'patient-overview-value'},`${selected.attendant_name||'—'}${selected.attendant_phone?` · ${selected.attendant_phone}`:''}`))
              )
            ),
            h('div',{className:'section-card'},h('h4',null,'Admission & Medical Overview'),h('div',{className:'patient-detail-fields'},
              patientDetailField('Admission',`${selected.admission_type||'—'} · ${selected.admission_date||'—'}`),
              patientDetailField('Hospital / Source',selected.hospital_name||selected.referring_source||'—'),
              patientDetailField('Diagnosis',selected.diagnosis||'Diagnosis not recorded'),
              patientDetailField('Allergies',selected.allergies||'None recorded'),
              patientDetailField('Special Instructions',selected.special_instructions||'No special instructions')
            )),
            h('div',{className:'section-card'},h('h4',null,'Care Plan Summary'),h('div',{className:'patient-detail-fields'},
              patientDetailField('Medicine Orders',`${details.meds.length} active order(s)`),
              patientDetailField('Master Care Tasks',`${details.care.length} task(s)`),
              patientDetailField('Physiotherapy',`${details.physio.length} order(s)`),
              patientDetailField('Diet',selected.diet_plan||'Not recorded')
            )),
            h('div',{className:'section-card'},h('h4',null,'Risk & Safety'),h('div',{className:'patient-detail-fields'},
              patientDetailField('Active Risk Flags',[selected.fall_risk&&'Fall risk',selected.pressure_sore_risk&&'Pressure sore risk',selected.aspiration_risk&&'Aspiration risk',selected.wandering_risk&&'Wandering risk',selected.oxygen_required&&'Oxygen required',selected.dressing_required&&'Dressing required'].filter(Boolean).join(', ')||'No active risk flags'),
              patientDetailField('Open Incidents',details.incidents.filter(x=>x.status==='Open').length)
            ))
          ),
          tab==='Admission Details'&&h('div',{className:'tabs-grid patient-admission-details'},
            h('style',null,`.patient-admission-details{align-items:start;gap:16px}.patient-admission-details .section-card{padding:18px 20px}.patient-admission-details .section-card h4{margin:0 0 10px;font-size:18px;color:#b20f5b!important;font-weight:800}.patient-admission-details .patient-admission-field{display:flex!important;align-items:flex-start!important;gap:18px!important;padding:10px 0!important;border-bottom:1px solid #f1dde7;line-height:1.45}.patient-admission-details .patient-admission-field:last-child{border-bottom:0}.patient-admission-details .patient-admission-field>span{display:block!important;flex:0 0 190px!important;min-width:190px!important;color:#735d69;font-size:14px;font-weight:500}.patient-admission-details .patient-admission-field>strong{display:block!important;flex:1 1 auto!important;min-width:0!important;color:#382333;font-size:14px;font-weight:700;line-height:1.45;word-break:normal;overflow-wrap:anywhere}@media(max-width:760px){.patient-admission-details .section-card{padding:15px}.patient-admission-details .patient-admission-field{display:block!important;padding:9px 0!important}.patient-admission-details .patient-admission-field>span{min-width:0!important;margin-bottom:3px;font-size:13px}.patient-admission-details .patient-admission-field>strong{font-size:14px}}
`),
            h('div',{className:'section-card'},
              h('h4',null,'Admission'),
              admissionField('Resident ID',selected.patient_id||selected.patient_code),
              admissionField('Status',selected.is_active===false?'Inactive / Discharged':'Active / Admitted'),
              admissionField('Date of Admission',admissionDateLabel(selected.admission_date)),
              admissionField('Admission Type',selected.admission_type),
              admissionField('Patient Category',selected.patient_category),
              admissionField('Room / Bed',selected.room_no?`Room ${selected.room_no}${selected.bed_no?` · Bed ${selected.bed_no}`:''}`:'Not assigned'),
              admissionField('Care Level',selected.care_level||selected.care_category)
            ),
            h('div',{className:'section-card'},
              h('h4',null,'Package & Billing'),
              admissionField('Billing Basis',((String(selected.billing_basis||'').toLowerCase().includes('daily'))||(String(selected.billing_package||'').toLowerCase().includes('no package'))||(String(selected.billing_package||'').toLowerCase().includes('daily billing'))||(!selected.billing_package&&!selected.package_id))?'Daily Basis':'Package'),
              admissionField('Current Package',selected.billing_package||'No Package / Daily Billing'),
              admissionField('Package Start Date',admissionDateLabel(selected.package_start_date)),
              admissionField('Package Expiry Date',admissionDateLabel(selected.package_end_date)),
              admissionField('Package Status',packageExpiryStatus(selected)),
              admissionField('Package Room Class',selected.package_room_class),
              admissionField('Package Fee',admissionMoney(selected.package_fee)),
              admissionField('After Package Expiry',selected.package_end_date?'Automatic Room + Nursing Daily Fare unless renewed':'Daily Fare applicable')
            ),
            h('div',{className:'section-card'},
              h('h4',null,'Referral & Medical'),
              admissionField('Hospital / Source',selected.hospital_name||selected.referring_source),
              admissionField('Referred By',selected.referred_by||selected.referring_doctor||selected.referral_name),
              admissionField('Referral Contact',selected.referral_contact||selected.referred_by_contact),
              admissionField('Treating Doctor',selected.treating_doctor),
              admissionField('Treating Doctor Contact',selected.treating_doctor_contact||selected.doctor_contact),
              admissionField('Diagnosis',selected.diagnosis),
              admissionField('Procedure / Treatment',selected.procedure||selected.treatment),
              admissionField('Allergies',selected.allergies||'None recorded')
            ),
            h('div',{className:'section-card'},
              h('h4',null,'Family / Special Care'),
              admissionField('Attendant / Relative',selected.attendant_name),
              admissionField('Attendant Mobile',selected.attendant_phone),
              admissionField('Emergency Contact',selected.emergency_contact_name||selected.emergency_contact),
              admissionField('Emergency Mobile',selected.emergency_contact_phone||selected.emergency_phone),
              admissionField('Special Nurse',selected.special_nurse_required?(selected.special_nurse_name||'Required'):'Not required'),
              selected.special_nurse_required?admissionField('Special Nurse Shift',selected.special_nurse_shift||selected.special_nurse_required_shift||'Not specified'):null,
              admissionField('Special Instructions',selected.special_instructions||'None'),
              admissionField('Precautions',selected.special_precautions||selected.precautions||'None'),
              h(TamilAssist,{text:[selected.special_instructions,selected.special_precautions||selected.precautions].filter(Boolean).join('\n'),context:'Patient Special Instructions and Precautions'})
            )
          ),
          tab==='Consent'&&h(window.SamaraConsent.Panel,{key:selected.id,client,patient:selected,documents:details.docs,canUpload:canEdit,onOpen:openDoc,onPrint:canEdit?()=>printPatientConsent(selected):null,onSaved:(id,doc,changes)=>{if(consentResidentRef.current!==id)return;setSelected(current=>current?.id===id?{...current,...changes}:current);setDetails(current=>current?{...current,docs:[doc,...current.docs.filter(d=>d.id!==doc.id)]}:current);load();}}),
          tab==='Documents'&&h('div',{className:'section-card'},h('div',{className:'panel-head'},h('h4',null,'Patient Documents'),canEdit?h('button',{className:'btn btn-secondary',onClick:()=>printPatientIdCard(selected)},'Print Resident ID Card'):null),details.docs.length?details.docs.map(d=>h('div',{className:'timeline-item',key:d.id},h('strong',null,d.document_type||'Document'),h('span',null,d.document_name||d.file_name||'File'),h('button',{className:'btn btn-secondary',onClick:()=>openDoc(d)},'Open'))):sectionEmpty('No documents uploaded.')),
          tab==='Clinical History'&&(canEdit||nursingManagerView)&&(()=>{
            const dateOnly=value=>String(value||'').slice(0,10);
            const selectedDate=clinicalHistoryDate||todayISOIndia();
            const yesterday=(()=>{const d=new Date();d.setDate(d.getDate()-1);return d.toISOString().slice(0,10)})();
            const cutoff=(()=>{const d=new Date();d.setDate(d.getDate()-6);return d.toISOString().slice(0,10)})();
            const itemDate=(row,fields)=>{for(const f of fields){if(row?.[f])return dateOnly(row[f]);}return ''};
            const keep=(row,fields)=>{const d=itemDate(row,fields);if(!d)return false;if(clinicalHistoryRange==='today')return d===todayISOIndia();if(clinicalHistoryRange==='yesterday')return d===yesterday;if(clinicalHistoryRange==='custom')return d===selectedDate;return d>=cutoff&&d<=todayISOIndia();};
            const medRows=(details.allMar||[]).filter(x=>keep(x,['scheduled_date','administered_at','entry_recorded_at','created_at']));
            const procedureRows=(details.nursingProcedures||[]).filter(x=>keep(x,['service_datetime','charge_date','raised_at','created_at']));
            const careRows=(details.careLogs||[]).filter(x=>keep(x,['care_date','completed_at','created_at']));
            const vitalRows=(details.vitals||[]).filter(x=>keep(x,['recorded_at','created_at']));
            const physioRows=(details.physioSessions||[]).filter(x=>keep(x,['session_date','session_at','created_at']));
            const handoverRows=(details.handovers||[]).filter(x=>keep(x,['handover_date','created_at']));
            const medName=x=>{const order=(details.medHistory||[]).find(m=>String(m.id)===String(x.order_id||x.medication_order_id));return x.medicine_name||order?.medicine_name||'Medicine'};
            return h('div',{className:'clinical-history-tab'},
              h('div',{className:'section-card'},h('div',{className:'panel-head'},h('div',null,h('h4',null,'Clinical History'),h('small',null,'Read-only resident-wise clinical record for Nursing Manager / Admin / Director. Historical entries cannot be edited here.'))),h('div',{className:'actions',style:{flexWrap:'wrap',gap:'8px'}},[['today','Today'],['yesterday','Yesterday'],['7','Last 7 Days'],['custom','Custom Date']].map(([value,label])=>h('button',{type:'button',key:value,className:`btn ${clinicalHistoryRange===value?'btn-primary':'btn-secondary'}`,onClick:()=>setClinicalHistoryRange(value)},label)),clinicalHistoryRange==='custom'&&h('input',{type:'date',value:clinicalHistoryDate,max:todayISOIndia(),onChange:e=>setClinicalHistoryDate(e.target.value),style:{minHeight:'42px'}}))),
              h('div',{className:'section-card'},h('h4',null,`Medication Administration (${medRows.length})`),medRows.length?medRows.map(x=>h('div',{className:'timeline-item',key:`ch-med-${x.id}`},h('strong',null,`${formatDateIN(x.scheduled_date||dateOnly(x.administered_at||x.created_at))} · ${medName(x)} · ${x.status||'Recorded'}`),h('span',{className:'patient-file-detail'},`Scheduled: ${medicationTimeLabel(x.scheduled_time)||'—'} · Actually given: ${x.administered_at?fmt(x.administered_at):'—'} · Entry recorded: ${x.entry_recorded_at?fmt(x.entry_recorded_at):(x.created_at?fmt(x.created_at):'—')} · ${x.remarks||x.exception_reason||'No remarks'}${x.late_entry_justification?` · Late entry justification: ${x.late_entry_justification}`:''}`))):sectionEmpty('No medication administration records for the selected period.')),
              h('div',{className:'section-card'},h('h4',null,`Nursing Procedures (${procedureRows.length})`),procedureRows.length?procedureRows.map(x=>h('div',{className:'timeline-item',key:`ch-proc-${x.id}`},h('strong',null,`${x.service_datetime?fmt(x.service_datetime):formatDateIN(x.charge_date||dateOnly(x.created_at))} · ${x.service_name||'Nursing Procedure'}`),h('span',{className:'patient-file-detail'},`${x.status||'Recorded'}${x.quantity?` · Qty ${x.quantity}${x.unit?` ${x.unit}`:''}`:''}${x.raised_by_name?` · Recorded by ${x.raised_by_name}`:''} · ${x.remarks||x.description||'No remarks'}`))):sectionEmpty('No nursing procedures for the selected period.')),
              h('div',{className:'section-card'},h('h4',null,`Care History (${careRows.length})`),careRows.length?careRows.map(x=>h('div',{className:'timeline-item',key:`ch-care-${x.id}`},h('strong',null,`${formatDateIN(x.care_date||dateOnly(x.created_at))} · ${x.care_type||'Care'} · ${x.shift||'—'} · ${x.status||'Recorded'}`),h('span',{className:'patient-file-detail'},x.remarks||'No remarks'))):sectionEmpty('No care records for the selected period.')),
              h('div',{className:'section-card'},h('h4',null,`Vitals (${vitalRows.length})`),vitalRows.length?vitalRows.map(x=>h('div',{className:'timeline-item',key:`ch-vital-${x.id}`},h('strong',null,`${fmt(x.recorded_at||x.created_at)} · BP ${x.systolic||'—'}/${x.diastolic||'—'}`),h('span',{className:'patient-file-detail'},`Pulse ${x.pulse||'—'} · SpO₂ ${x.spo2||'—'} · Temp ${x.temperature||'—'} · Sugar ${x.blood_sugar_type||'Not Taken'} ${x.blood_sugar||'—'} · ${x.alert_level||'Normal'}`))):sectionEmpty('No vital signs for the selected period.')),
              h('div',{className:'section-card'},h('h4',null,`Physiotherapy (${physioRows.length})`),physioRows.length?physioRows.map(x=>h('div',{className:'timeline-item',key:`ch-physio-${x.id}`},h('strong',null,`${formatDateIN(x.session_date||dateOnly(x.created_at))} · ${x.status||'Recorded'}`),h('span',{className:'patient-file-detail'},x.notes||'No notes'))):sectionEmpty('No physiotherapy sessions for the selected period.')),
              h('div',{className:'section-card'},h('h4',null,`Shift Handover (${handoverRows.length})`),handoverRows.length?handoverRows.map(x=>h('div',{className:'timeline-item',key:`ch-hand-${x.id}`},h('strong',null,`${formatDateIN(x.handover_date||dateOnly(x.created_at))} · ${x.shift||'—'} · ${x.priority||'Routine'}`),h('span',{className:'patient-file-detail'},[x.patient_summary||x.summary,x.pending_tasks&&`Pending: ${x.pending_tasks}`,x.special_instructions&&`Instructions: ${x.special_instructions}`].filter(Boolean).join(' · ')||'No details'))):sectionEmpty('No shift handover records for the selected period.'))
            );
          })(),
          tab==='Medicines'&&h('div',{className:'patient-medication-tab'},
            h('div',{className:'section-card'},
              h('h4',null,'Current Prescription'),
              details.meds.length?h('div',{className:'patient-med-table-wrap'},h('table',{className:'patient-med-table'},
                h('thead',null,h('tr',null,['Medicine','Dose / Strength','Frequency','Route','Time','Food / Instruction'].map(x=>h('th',{key:x},x)))),
                h('tbody',null,details.meds.map(m=>h('tr',{key:m.id},
                  h('td',null,h('strong',null,m.medicine_name||'Medicine'),h('small',null,`V${m.version_no||1}`)),
                  h('td',null,m.strength||m.dose||'—'),
                  h('td',null,m.frequency||'—'),
                  h('td',null,m.route||'—'),
                  h('td',null,(Array.isArray(m.scheduled_times)?m.scheduled_times:String(m.scheduled_times||'').split(',')).filter(Boolean).map(medicationTimeLabel).join(', ')||'—'),
                  h('td',null,[m.food_instruction,m.special_instruction||m.special_instructions].filter(Boolean).join(' · ')||'—')
                )))
              )):sectionEmpty('No active medicine orders.')
            ),
            h('div',{className:'section-card'},
              h('h4',null,'Prescription / Modification History'),
              h('p',{className:'small-note'},'Original prescription and every later addition, modification or stoppage are shown in one chronological table.'),
              (details.medHistory||[]).length?h('div',{className:'patient-med-table-wrap'},h('table',{className:'patient-med-table patient-med-history-table'},
                h('thead',null,h('tr',null,['Date & Time','Action','Medicine','Dose','Frequency / Route','Time','Doctor','Status'].map(x=>h('th',{key:x},x)))),
                h('tbody',null,[...(details.medHistory||[])].sort((a,b)=>String(a.effective_from||a.created_at||'').localeCompare(String(b.effective_from||b.created_at||''))).map(order=>{
                  const version=Number(order.version_no||1);
                  const rawAction=String(order.change_action||'').trim();
                  const action=/add/i.test(rawAction)?'Added':(version===1?'Original':(rawAction||'Modified'));
                  const status=order.stopped_at?`Stopped ${fmt(order.stopped_at)}`:(order.is_active===false?(order.status||'Stopped'):(order.status||'Active'));
                  return h('tr',{key:`history-${order.id}`},
                    h('td',null,order.effective_from?fmt(order.effective_from):(order.start_date?formatDateIN(order.start_date):fmt(order.created_at))),
                    h('td',null,h('span',{className:`review-action ${String(action).toLowerCase()}`},action),h('small',null,`V${version}`)),
                    h('td',null,h('strong',null,order.medicine_name||'Medicine')),
                    h('td',null,order.strength||order.dose||'—'),
                    h('td',null,[order.frequency,order.route].filter(Boolean).join(' · ')||'—'),
                    h('td',null,(Array.isArray(order.scheduled_times)?order.scheduled_times:String(order.scheduled_times||'').split(',')).filter(Boolean).map(medicationTimeLabel).join(', ')||'—'),
                    h('td',null,order.prescribed_by_doctor||'—'),
                    h('td',null,status)
                  );
                }))
              )):sectionEmpty('No prescription history available.')
            ),
            h('div',{className:'section-card'},
              h('h4',null,'Doctor Review / Change Record'),
              details.medicationReviewError?h('div',{className:'message warning'},'Medication review history could not be loaded. The medication review database upgrade may need verification.'):null,
              (details.medicationReviews||[]).length?h('div',{className:'patient-med-table-wrap'},h('table',{className:'patient-med-table patient-med-review-table'},
                h('thead',null,h('tr',null,['Reviewed','Doctor','Effective From','Order Type','Medication Changes','Clinical Note'].map(x=>h('th',{key:x},x)))),
                h('tbody',null,(details.medicationReviews||[]).map(review=>{
                  const items=(details.medicationReviewItems||[]).filter(item=>item.review_id===review.id);
                  return h('tr',{key:`review-${review.id}`},
                    h('td',null,fmt(review.reviewed_at)),
                    h('td',null,h('strong',null,review.doctor_name||'—')),
                    h('td',null,fmt(review.effective_from)),
                    h('td',null,review.order_mode||review.review_type||'Review'),
                    h('td',null,items.length?h('div',{className:'patient-med-change-lines'},items.map(item=>h('div',{key:item.id},h('b',null,`${item.action||'Change'}: `),[item.medicine_name,item.strength||item.dose,item.frequency,item.route,(Array.isArray(item.scheduled_times)?item.scheduled_times:String(item.scheduled_times||'').split(',')).filter(Boolean).map(medicationTimeLabel).join(', ')].filter(Boolean).join(' · ')))):'—'),
                    h('td',null,review.clinical_notes||'—')
                  );
                }))
              )):sectionEmpty('No doctor medication review has been recorded yet.')
            ),
            h('div',{className:'section-card'},
              h('h4',null,"Today's Medication Administration"),
              h('p',{className:'small-note'},'Only today’s MAR is shown here.'),
              details.mar.length?h('div',{className:'patient-med-table-wrap'},h('table',{className:'patient-med-table patient-med-mar-table'},
                h('thead',null,h('tr',null,['Scheduled','Medicine','Status','Recorded Time','Remarks'].map(x=>h('th',{key:x},x)))),
                h('tbody',null,details.mar.map(x=>{
                  const order=(details.medHistory||[]).find(m=>m.id===x.order_id)||{};
                  return h('tr',{key:x.id},
                    h('td',null,medicationTimeLabel(x.scheduled_time)),
                    h('td',null,[order.medicine_name,order.strength||order.dose].filter(Boolean).join(' ')||'Medicine'),
                    h('td',null,h('strong',null,x.status||'—')),
                    h('td',null,x.administered_at?fmt(x.administered_at):'—'),
                    h('td',null,x.remarks||'—')
                  );
                }))
              )):sectionEmpty('No medication administration recorded today.')
            )
          ),
          tab==='Nursing'&&h('div',{className:'section-card'},h('h4',null,'Master Care Plan'),details.care.length?details.care.map(c=>h('div',{className:'timeline-item',key:c.id},h('strong',null,c.care_type),h('span',null,`${c.shift} · ${c.frequency} · ${c.instruction||''}`),h(TamilAssist,{text:c.instruction,context:'Care Plan Instruction'}))):sectionEmpty('No care orders.'),h('h4',{style:{marginTop:'18px'}},'Recent Care Records'),details.careLogs.length?details.careLogs.slice(0,30).map(x=>h('div',{className:'timeline-item',key:x.id},h('strong',null,`${formatDateIN(x.care_date)} · ${x.shift} · ${x.status}`),h('span',{className:'patient-file-detail'},` · ${x.remarks||'—'}`),h(TamilAssist,{text:x.remarks,context:'Nursing Care Remark'}))):sectionEmpty('No care records.')),
          tab==='Vitals'&&h('div',{className:'section-card'},h('h4',null,'Vital Signs History'),details.vitals.length?details.vitals.map(v=>h('div',{className:'timeline-item',key:v.id},h('strong',null,`${fmt(v.recorded_at)} · BP ${v.systolic||'—'}/${v.diastolic||'—'}`),h('span',{className:'patient-file-detail'},` · Pulse ${v.pulse||'—'} · SpO₂ ${v.spo2||'—'} · Temp ${v.temperature||'—'} · Sugar ${v.blood_sugar_type||'Not Taken'} ${v.blood_sugar||'—'} · ${v.alert_level||'Normal'}`))):sectionEmpty('No vital signs recorded.')),
          tab==='Physiotherapy'&&h('div',{className:'section-card'},h('h4',null,'Physiotherapy Plan'),details.physio.length?details.physio.map(x=>h('div',{className:'timeline-item',key:x.id},h('strong',null,x.therapy_type),h('span',null,`${x.frequency||'—'} · ${x.preferred_time||'—'} · ${x.precautions||''}`),h(TamilAssist,{text:x.precautions,context:'Physiotherapy Precaution'}))):sectionEmpty('No physiotherapy order.'),h('h4',{style:{marginTop:'18px'}},'Sessions'),details.physioSessions.length?details.physioSessions.map(x=>h('div',{className:'timeline-item',key:x.id},h('strong',null,`${formatDateIN(x.session_date)} · ${x.status}`),h('span',null,x.notes||'—'),h(TamilAssist,{text:x.notes,context:'Physiotherapy Note'}))):sectionEmpty('No physiotherapy sessions.')),
          tab==='Diet'&&h('div',{className:'section-card'},h('h4',null,`Diet Plan: ${selected.diet_plan||'Not recorded'}`),h('p',null,selected.feeding_instruction||'No special feeding instruction.'),h('h4',{style:{marginTop:'18px'}},'Food & Beverage Records'),details.meals.length?details.meals.map(x=>h('div',{className:'timeline-item',key:x.id},h('strong',null,`${x.meal_date||''} · ${x.meal_type} · ${x.consumption_status}`),h('span',{className:'patient-file-detail'},` · ${x.menu||'—'}${x.beverage_type?` · Beverage: ${x.beverage_type}${x.beverage_time?` at ${String(x.beverage_time).slice(0,5)}`:''}`:''}${x.remarks?` · ${x.remarks}`:''}`))):sectionEmpty('No food or beverage records.')),
          tab==='Daily Moments'&&h('div',{className:'daily-moments-wrap'},
            momentRecording&&h('div',{className:'daily-moment-recorder'},h('div',{className:'daily-moment-recorder-box'},h('video',{autoPlay:true,muted:true,playsInline:true,ref:el=>{if(el&&momentStreamRef.current&&el.srcObject!==momentStreamRef.current)el.srcObject=momentStreamRef.current}}),h('strong',null,`Recording ${momentRecordSeconds}/10 sec`),h('div',{className:'record-progress'},h('span',{style:{width:`${Math.min(100,momentRecordSeconds*10)}%`}})),h('button',{type:'button',className:'btn btn-danger',onClick:stopDailyMomentRecording},'Stop now'))),
            h('div',{className:'section-card daily-moment-upload'},
              h('div',{className:'panel-head'},h('div',null,h('h4',null,'Daily Moments'),h('small',null,'Share a brief reassuring glimpse of the resident with authorised family. Clips remain available for 7 days and are then removed.'))),
              h('div',{className:'daily-moment-rules'},h('span',{className:'pill'},'10 seconds · auto-stop'),h('span',{className:'pill'},'Maximum 3 clips / day'),h('span',{className:'pill'},'Private Family Portal'),h('span',{className:'pill'},'Auto-delete after 7 days')),
              h('div',{className:'form-grid daily-moment-form'},
                h('div',{className:'field span-2'},h('label',null,'Caption / Moment'),h('select',{value:momentCaption,onChange:e=>setMomentCaption(e.target.value)},
                  ['Select moment','Morning walk','Having breakfast','Having lunch','Having dinner','Physiotherapy session','Exercise / mobility','Sitting and relaxing comfortably','Talking freely','Reading / watching TV / activity','Resting comfortably','Personal care completed','Family video / phone call','Other daily moment'].map((x,i)=>h('option',{key:x,value:i?x:''},x)))),
                h('label',{className:'check-card'},h('input',{type:'checkbox',checked:momentFamilyVisible,onChange:e=>setMomentFamilyVisible(e.target.checked)}),h('span',null,'Visible to authorised family')),
                h('div',{className:'field span-2'},
                  h('label',null,'Record / Upload short video'),
                  h('div',{className:'actions daily-moment-actions'},
                    h('button',{type:'button',className:'btn btn-primary',disabled:momentBusy||momentRecording,onClick:startDailyMomentRecording},momentRecording?'Recording…':'🎥 Record 10-sec Video'),
                    h('button',{type:'button',className:'btn btn-secondary',disabled:momentBusy||momentRecording,onClick:()=>document.getElementById('daily-moment-upload-video')?.click()},'📁 Upload Existing Video')
                  ),
                  h('input',{id:'daily-moment-record-video',key:`record-${momentInputKey}`,type:'file',accept:'video/*',capture:'environment',disabled:momentBusy,style:{display:'none'},onChange:e=>{const f=e.target.files?.[0];if(f)uploadDailyMoment(f)}}),
                  h('input',{id:'daily-moment-upload-video',key:`upload-${momentInputKey}`,type:'file',accept:'video/*',disabled:momentBusy,style:{display:'none'},onChange:e=>{const f=e.target.files?.[0];if(f)uploadDailyMoment(f)}}),
                  h('small',null,momentBusy?'Uploading…':'Recording stops automatically at 10 seconds. Existing uploads must also be 10 seconds or less.')
                )
              )
            ),
            h('div',{className:'section-card'},
              h('div',{className:'panel-head'},h('div',null,h('h4',null,'Recent Daily Moments'),h('small',null,`${(details.dailyMoments||[]).length} clip(s) currently available`))),
              (details.dailyMoments||[]).length
                ?h('div',{className:'daily-moment-grid'},(details.dailyMoments||[]).map(moment=>h('article',{className:'daily-moment-card',key:moment.id},
                  moment.signed_url?h('video',{src:moment.signed_url,controls:true,playsInline:true,preload:'metadata'}):h('div',{className:'daily-moment-video-missing'},'Video unavailable'),
                  h('div',{className:'daily-moment-meta'},
                    h('strong',null,moment.caption||'Daily Moment'),
                    h('span',null,`${fmt(moment.created_at)} · ${moment.duration_seconds||'—'} sec`),
                    h('span',null,moment.family_visible?'Visible to family':'Internal only'),
                    h('small',null,`Available until ${fmt(moment.expires_at)}`),
                    (canEdit||String(moment.uploaded_by||'')===String(profile?.id||''))&&h('button',{type:'button',className:'btn btn-danger',disabled:momentBusy,onClick:()=>deleteDailyMoment(moment)},'Delete clip')
                  )
                )))
                :sectionEmpty('No Daily Moments uploaded for this resident yet.')
            )
          ),
          !clinicalView&&tab==='Billing'&&(()=>{const b=billingSummary(details.billing),due=b.charges-b.payments-b.discounts+b.refunds;const bed=roomBeds.find(row=>String(row.id)===String(selected.room_bed_id||'')||(String(row.room_no)===String(selected.room_no||'')&&String(row.bed_no)===String(selected.bed_no||'')));const dailyBasis=/daily|no package/i.test(String(selected.billing_basis||selected.billing_package||''))||(!selected.billing_package&&!selected.package_id);const packageEnd=selected.package_end_date||selected.package_expiry_date||'';const packageExpired=packageEnd&&new Date(`${String(packageEnd).slice(0,10)}T23:59:59`).getTime()<Date.now();return h('div',{className:'patient-billing-tab'},
            nursingManagerView?h('div',{className:'section-card'},
              h('div',{className:'panel-head'},h('div',null,h('h4',null,'Patient Pending Dues — View Only'),h('small',null,'Care package, accommodation tariff and current outstanding balance.')),h('span',{className:'badge'},'NO PAYMENT ACTIONS')),
              h('div',{className:'patient-detail-fields'},
                patientDetailField('Patient',formalName(selected)),
                patientDetailField('Resident ID',selected.patient_id||selected.patient_code),
                patientDetailField('Room / Bed',[selected.room_no,selected.bed_no].filter(Boolean).join(' / ')),
                patientDetailField('Billing Basis',dailyBasis?'Daily Basis':'Care Package'),
                patientDetailField('Current Package',selected.billing_package||'No Package / Daily Billing'),
                patientDetailField('Package Validity',packageEnd?`${formatDateIN(packageEnd)} · ${packageExpired?'Expired':'Active'}`:(dailyBasis?'Daily billing continues':'Expiry date not entered')),
                patientDetailField('Room Tariff',bed?.room_daily_rate!=null?`₹${Number(bed.room_daily_rate).toLocaleString('en-IN')} per day`:'Not available'),
                patientDetailField('Nursing Tariff',bed?.nursing_daily_rate!=null?`₹${Number(bed.nursing_daily_rate).toLocaleString('en-IN')} per day`:'Not available')
              )
            ):null,
            h('div',{className:'patient-billing-summary'},[['Charges',b.charges],['Payments',b.payments],['Discounts',b.discounts],['Outstanding',due]].map(([k,v])=>h('div',{className:'patient-billing-stat',key:k},h('span',null,k),h('strong',null,`₹${v.toLocaleString('en-IN')}`)))),
            h('div',{className:'section-card patient-billing-ledger'},
              h('h4',null,nursingManagerView?'Recent Account Entries — View Only':'Patient Ledger'),
              details.billing.length?details.billing.map(x=>h('div',{className:'patient-billing-row',key:x.id},
                h('div',{className:'patient-billing-row-main'},
                  h('strong',null,`${x.transaction_type||'Transaction'} · ${x.category||'General'}`),
                  h('strong',{className:'patient-billing-amount'},`₹${Number(x.amount||0).toLocaleString('en-IN')}`)
                ),
                h('div',{className:'patient-billing-row-meta'},
                  h('span',{className:'patient-billing-date'},fmt(x.transaction_date)),
                  h('span',{className:'patient-billing-description'},x.description||'No description')
                )
              )):sectionEmpty('No billing transactions.')
            )
          )})(),
          tab==='Timeline'&&h('div',{className:'section-card'},h('h4',null,'Recovery & Incident Timeline'),[...details.recovery.map(x=>({id:`r-${x.id}`,date:x.event_at,title:x.event_type,note:x.note,type:'Recovery'})),...details.incidents.map(x=>({id:`i-${x.id}`,date:x.incident_at,title:x.incident_type,note:`${x.severity||''} · ${x.description||''} · ${x.status||''}`,type:'Incident'}))].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(x=>h('div',{className:'timeline-item',key:x.id},h('strong',null,`${fmt(x.date)} · ${x.type}: ${x.title}`),h('span',null,x.note||'—'))),details.recovery.length+details.incidents.length===0&&sectionEmpty('No recovery or incident events.')),
          canEdit&&tab==='Family Portal'&&h('div',{className:'section-card'},
            h('div',{className:'panel-head family-portal-login-head'},
              h('div',null,h('h4',null,'Family Portal Login'),h('small',null,'View the authorised family login details for this resident. Temporary PINs are shown only when first created or reset.')),
              h('div',{className:'actions family-portal-login-actions'},
                h('button',{type:'button',className:'btn btn-secondary',onClick:previewFamilyPortal},'👁 Preview Family Portal'),
                h('button',{type:'button',className:'btn btn-whatsapp',disabled:!primaryFamilyContact(),onClick:()=>openPatientWhatsApp(false)},'WhatsApp Messages'),
                h('button',{type:'button',className:'btn',disabled:!primaryFamilyContact(),onClick:()=>openPatientWhatsApp(true),style:{background:'#b42336',color:'#fff',border:'1px solid #8e1627',fontWeight:'900'}},'🚨 Emergency'),
                h('button',{type:'button',className:'btn btn-secondary',onClick:()=>openEditPatient(selected)},'Edit Family Access')
              )
            ),
	            (()=>{const pref=details.familyPreference;const reportRows=(details.reportWhatsApp||[]).filter(r=>/intelligent|daily patient|patient care report/i.test(String(r.communication_type||r.template_name||''))).sort((a,b)=>new Date(b.sent_at||b.created_at||0)-new Date(a.sent_at||a.created_at||0));const latestReport=reportRows[0]||null;const latestReportAt=[pref?.last_report_sent_at,latestReport?.sent_at,latestReport?.created_at].filter(Boolean).sort((a,b)=>new Date(b)-new Date(a))[0]||null;const dailyEnabled=!!pref?.daily_whatsapp_enabled;return h('div',{className:'section-card',style:{marginTop:'12px',background:'#fff8fc',border:'1px solid #efbfd5'}},
              h('div',{className:'panel-head daily-report-whatsapp-head'},h('div',null,h('h4',{style:{color:'#9f0b55'}},'Daily Patient Report WhatsApp'),h('small',null,'Automatic A4 Intelligent Patient Care Report PDF to the authorised family WhatsApp number.')),h('div',{className:'actions daily-report-whatsapp-actions',style:{gap:'8px',alignItems:'center'}},h('span',{className:`pill ${dailyEnabled?'':'warning'}`},dailyEnabled?'Enabled':'Disabled'),h('button',{type:'button',className:dailyEnabled?'btn btn-danger':'btn btn-primary',disabled:dailyReportToggleBusy,onClick:toggleDailyPatientReportWhatsApp},dailyReportToggleBusy?'Updating…':dailyEnabled?'Disable':'Enable'))),
              pref?h('div',{className:'patient-detail-fields'},
                patientDetailField('Communication Mode',pref.delivery_mode||'—'),
                patientDetailField('Recipient',pref.recipient_name||'—'),
                patientDetailField('WhatsApp',pref.recipient_mobile||'—'),
                patientDetailField('Daily Report Time',dailyEnabled?displayDailyReportTime(pref.daily_report_time):'Not scheduled'),
	                patientDetailField('Last Report',latestReportAt?fmt(latestReportAt):'Not sent yet'),
                patientDetailField('Last Status',pref.last_report_status||latestReport?.status||'—')
              ):h('p',{className:'small-note'},'Family communication preference has not yet been configured for this resident.'),
              h('div',{className:'actions',style:{marginTop:'10px'}},h('button',{type:'button',className:'btn btn-primary',onClick:()=>openDailyReportQuickEdit(selected)},'Edit Recipient / Time'),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>onNavigate?.('Intelligent Reports')},'Open Intelligent Reports'),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>onNavigate?.('WhatsApp Logs')},'WhatsApp Delivery Logs'))
            )})(),
            (details.familyAccess||[]).length
              ?h('div',null,(details.familyAccess||[]).map(access=>h('div',{className:'section-card',key:access.id,style:{marginTop:'12px'}},
                h('div',{className:'panel-head'},
                  h('div',null,h('strong',null,access.relative_name||'Authorised Relative'),h('small',null,`${access.relationship||'Relationship not recorded'}${access.primary_contact?' · Primary contact':''}`)),
                  h('span',{className:`pill ${access.is_active?'':'warning'}`},access.is_active?'Active':'Disabled')
                ),
                h('div',{className:'patient-detail-fields'},
                  patientDetailField('Login Resident ID',selected?.patient_id||'—'),
                  patientDetailField('Registered Mobile',access.mobile||'—'),
                  patientDetailField('Email',access.email||'Not recorded'),
                  patientDetailField('Relationship',access.relationship||'Not recorded'),
                  patientDetailField('Last Login',access.last_login_at?fmt(access.last_login_at):'Not logged in yet'),
                  patientDetailField('Access Created',access.created_at?fmt(access.created_at):'—'),
                  patientDetailField('PIN','Existing PIN is hidden for security.'),
                  patientDetailField('Internal Family Ref',access.family_user_id||'—','patient-detail-secondary')
                ),
                access.is_active&&(()=>{const portalWhatsAppSent=familyPortalWhatsAppSent(access);const admissionSent=admissionWhatsAppSent(access);return h('div',{className:'actions',style:{marginTop:'10px'}},
                  h('button',{type:'button',className:admissionSent?'btn btn-secondary clinical-action-done':'btn btn-whatsapp',disabled:familyPortalWaBusy===access.id,onClick:()=>sendPatientAdmissionWhatsApp(access,{resend:admissionSent})},familyPortalWaBusy===access.id?'Sending…':admissionSent?'Resend Admission WhatsApp':'Send Admission WhatsApp'),
                  completedPatientDischarge()?h('button',{type:'button',className:'btn btn-whatsapp',disabled:!!dischargeWaBusy,onClick:()=>resendPatientDischargeWhatsApp(access)},dischargeWaBusy===`discharge-${access.id||'family'}`?'Resending Discharge WhatsApp…':'Resend Discharge WhatsApp'):null,
                  h('button',{type:'button',className:'btn btn-secondary',disabled:familyResetBusy===access.id,onClick:()=>resetSelectedFamilyPin(access)},familyResetBusy===access.id?'Resetting…':'Forgot / Reset PIN'),
                  h('button',{type:'button',className:portalWhatsAppSent?'btn btn-secondary clinical-action-done':'btn btn-whatsapp',disabled:portalWhatsAppSent||familyPortalWaBusy===access.id,onClick:()=>sendPatientPortalWhatsApp(access)},familyPortalWaBusy===access.id?'Sending…':portalWhatsAppSent?'Portal Access WhatsApp Sent ✓':'Send Portal Access WhatsApp API'),
                  portalWhatsAppSent?h('button',{type:'button',className:'btn btn-secondary',disabled:familyPortalWaBusy===access.id,onClick:()=>sendPatientPortalWhatsApp(access,{resend:true})},familyPortalWaBusy===access.id?'Resending…':'Resend Portal Access WhatsApp'):null,
                  h('button',{type:'button',className:'btn btn-secondary',onClick:()=>window.open(`https://wa.me/${normalizeWhatsAppRecipient(access.mobile)}?text=${encodeURIComponent(brandWhatsAppText(`Samara Family Portal\nResident ID: ${selected?.patient_id||''}\nPortal: https://family.samaraassistedliving.com\nIf the PIN is forgotten, please contact Samara to reset it.`))}`,'_blank','noopener')},'Existing Method')
                )})()
              )))
              :h('div',null,sectionEmpty('Family Portal access has not been created for this resident.'),h('button',{type:'button',className:'btn btn-primary',onClick:()=>openEditPatient(selected)},'Create Family Portal Access')),
            familyResetCredential&&h('div',{className:'message success',style:{marginTop:'14px',position:'relative'}},
              h('button',{type:'button',className:'icon-btn',title:'Close PIN confirmation',onClick:()=>setFamilyResetCredential(null),style:{position:'absolute',right:'8px',top:'8px'}},'×'),
              h('strong',null,'Family Portal temporary PIN — keep until copied or shared'),
              h('div',{style:{marginTop:'6px',fontSize:'16px',fontWeight:'900'}},`Resident ID: ${selected?.patient_id||'—'} · Temporary PIN: ${familyResetCredential.pin}`),
              h('div',{className:'actions',style:{marginTop:'8px'}},
                h('button',{type:'button',className:'btn btn-secondary',onClick:async()=>{try{await navigator.clipboard.writeText(String(familyResetCredential.pin||''));showPatientToast('success','Temporary PIN copied.')}catch(_){showPatientToast('error','Unable to copy automatically. Please copy the PIN manually.')}}},'Copy PIN'),
                h('button',{type:'button',className:'btn btn-whatsapp',disabled:familyPortalWaBusy==='new-pin',onClick:async()=>{setFamilyPortalWaBusy('new-pin');try{await sendPatientPortalWhatsApp({id:'new-pin',relative_name:familyResetCredential.relative_name||'Family Member',mobile:familyResetCredential.mobile},{resend:true});showPatientToast('success','Family Portal access template sent. Keep this PIN visible until it is securely shared with the family member.')}catch(_error){}finally{setFamilyPortalWaBusy('')}}},familyPortalWaBusy==='new-pin'?'Sending…':'Send Portal Access WhatsApp API'),
                h('button',{type:'button',className:'btn btn-secondary',onClick:()=>window.open(`https://wa.me/${normalizeWhatsAppRecipient(familyResetCredential.mobile)}?text=${encodeURIComponent(brandWhatsAppText(`Samara Family Portal login
Resident ID: ${selected?.patient_id||''}
Temporary PIN: ${familyResetCredential.pin}
Portal: https://family.samaraassistedliving.com`))}`,'_blank','noopener')},'Send PIN by Existing Method')
              ),
              h('small',{style:{display:'block',marginTop:'8px'}},'The approved Portal Access API template does not contain the temporary PIN. Copy/share this PIN separately, then close this confirmation.')
            )
          )
        ),
        h('div',{className:'modal-bottom-actions patient-file-bottom-actions'},
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setSelected(null);setDetails(null);setPhotoUrl('');setShowFamilyDetails(false)}},'Close Patient File')
        )
      )),
      showFamilyDetails&&selected&&details&&h('div',{className:'modal-backdrop',onClick:e=>{if(e.target===e.currentTarget)setShowFamilyDetails(false)}},h('div',{className:'card modal',style:{maxWidth:'680px'}},
        h('div',{className:'panel-head'},h('div',null,h('h3',null,'Family Details'),h('small',null,`${formalName(selected)||selected.full_name||'Resident'} · Authorised family contact`)),h('button',{type:'button',className:'close',onClick:()=>setShowFamilyDetails(false)},'×')),
        (()=>{const family=primaryFamilyContact();return h('div',{className:'modal-grid'},
          h('div',{className:'field'},h('label',null,'Relative / Authorised Person'),h('input',{readOnly:true,value:family?.relative_name||selected?.attendant_name||'Not recorded'})),
          h('div',{className:'field'},h('label',null,'Relationship'),h('input',{readOnly:true,value:family?.relationship||'Not recorded'})),
          h('div',{className:'field'},h('label',null,'Mobile Number'),h('input',{readOnly:true,value:family?.mobile||selected?.attendant_phone||'Not recorded'})),
          h('div',{className:'field'},h('label',null,'Email'),h('input',{readOnly:true,value:family?.email||'Not recorded'})),
          h('div',{className:'field span-2'},h('label',null,'Family / Correspondence Address'),h('textarea',{readOnly:true,rows:4,value:familyCorrespondenceAddress()})),
          h('div',{className:'actions span-2'},
            h('button',{type:'button',className:'btn btn-whatsapp',disabled:!family,onClick:()=>openPatientWhatsApp(false)},'WhatsApp Messages'),
            h('button',{type:'button',className:'btn',disabled:!family,onClick:()=>openPatientWhatsApp(true),style:{background:'#b42336',color:'#fff',fontWeight:'900'}},'🚨 Emergency'),
            h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setShowFamilyDetails(false)},'Close')
          )
        )})()
      )),
      dailyQuickEdit&&selected&&h('div',{className:'modal-backdrop',onClick:e=>{if(e.target===e.currentTarget&&!dailyQuickEditBusy)setDailyQuickEdit(null)}},
        h('form',{className:'card modal daily-report-quick-modal',onSubmit:saveDailyReportQuickEdit},
          h('div',{className:'panel-head'},
            h('div',null,h('h3',null,'Edit Daily Patient Report'),h('small',null,`${formalName(selected)||selected.full_name||'Resident'} · Recipient and delivery time only`)),
            h('button',{type:'button',className:'close',disabled:dailyQuickEditBusy,onClick:()=>setDailyQuickEdit(null)},'×')
          ),
          dailyQuickEditMsg&&h('div',{className:'message error'},dailyQuickEditMsg),
          h('div',{className:'form-grid daily-report-quick-grid'},
            h('div',{className:'field'},h('label',null,'Authorised Recipient Name'),h('input',{required:true,value:dailyQuickEdit.recipient_name||'',onChange:e=>setDailyQuickEdit({...dailyQuickEdit,recipient_name:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Relationship'),h('input',{value:dailyQuickEdit.relationship||'',onChange:e=>setDailyQuickEdit({...dailyQuickEdit,relationship:e.target.value})})),
            h('div',{className:'field'},h('label',null,'WhatsApp Number'),h('input',{required:true,inputMode:'numeric',maxLength:10,value:dailyQuickEdit.mobile||'',onChange:e=>setDailyQuickEdit({...dailyQuickEdit,mobile:e.target.value.replace(/\D/g,'').slice(0,10)})})),
            h('div',{className:'field'},h('label',null,'Daily Report Time'),h('input',{type:'time',step:'300',required:true,value:dailyQuickEdit.daily_report_time||'20:00',onChange:e=>setDailyQuickEdit({...dailyQuickEdit,daily_report_time:e.target.value})}))
          ),
          h('div',{className:'modal-bottom-actions'},
            h('button',{type:'button',className:'btn btn-secondary',disabled:dailyQuickEditBusy,onClick:()=>setDailyQuickEdit(null)},'Close'),
            h('button',{type:'submit',className:'btn btn-primary',disabled:dailyQuickEditBusy},dailyQuickEditBusy?'Saving…':'Save Recipient / Time')
          )
        )
      ),
      canEdit&&editTarget&&editForm&&h('div',{className:'modal-backdrop',onClick:e=>e.stopPropagation()},h('form',{className:'card modal patient-edit-modal',onClick:e=>e.stopPropagation(),onSubmit:savePatientEdit},
        h('div',{className:'panel-head'},h('div',null,h('h3',null,'Edit Patient Information'),h('small',null,`${editTarget.patient_id||'—'} · Correct duplicate or wrongly entered details`)),h('button',{type:'button',className:'close',onClick:()=>{setEditTarget(null);setEditForm(null)}},'×')),
        editMsg&&h('div',{className:`message ${editMsg.includes('successfully')?'success':'error'}`},editMsg),
        h('div',{className:'modal-grid'},
          selectField('Title / Salutation','title',editForm,setEditForm,PATIENT_TITLES),field('Patient Name','full_name',editForm,setEditForm,true),field('Age','age',editForm,setEditForm,false,'number'),selectField('Gender','gender',editForm,setEditForm,['Male','Female','Other']),selectField('Blood Group','blood_group',editForm,setEditForm,BLOOD_GROUPS),selectField('Profession / Occupation','profession',editForm,setEditForm,RESIDENT_PROFESSIONS),selectField('Field / Sector','profession_field',editForm,setEditForm,RESIDENT_FIELDS),['Government Employee','Private Employee'].includes(editForm.profession)?selectField('Employment Status','employment_status',editForm,setEditForm,EMPLOYMENT_SERVICE_STATUS):null,field('Patient Mobile','mobile',editForm,setEditForm,false,'tel'),
          field('Emergency Contact Name','attendant_name',editForm,setEditForm,false),field('Emergency Contact Number','attendant_phone',editForm,setEditForm,false,'tel'),field('Alternative Mobile No.','attendant_alternative_phone',editForm,setEditForm,false,'tel'),
          field('Main Diagnosis','diagnosis',editForm,setEditForm,false),field('Referred By Doctor','referring_doctor',editForm,setEditForm,false),field('Treating Doctor','treating_doctor',editForm,setEditForm,false),field('Doctor Mobile','doctor_phone',editForm,setEditForm,false,'tel'),
          field('Hospital / Previous Centre','hospital_name',editForm,setEditForm,false),selectField('Admission Source','admission_type',editForm,setEditForm,[
              'Previous Hospital / Care Centre',
              'Direct Admission – Elderly Care',
              'Doctor Referral',
              'Hospital Transfer',
              'Post-operative Recovery',
              'Short Stay / Respite Care'
            ]),
          selectField('Patient Category','patient_category',editForm,setEditForm,['Short Stay','Respite Care','Post-Surgery','Rehabilitation','Stroke Recovery','Dementia Care','Parkinsonism','Palliative Care','Long-Term Assisted Living','Observation','Elderly Care']),
          roomBedSelect(roomBeds,editForm.room_no,editForm.bed_no,(room_no,bed_no)=>setEditForm({...editForm,room_no,bed_no}),false,editTarget.id),field('Admission Date','admission_date',editForm,setEditForm,false,'date'),
          field('Known Allergies','allergies',editForm,setEditForm,false),
          field('State','state',editForm,setEditForm,false),
          h('div',{className:'field'},
            h('label',null,'District'),
            h('select',{
              required:true,
              value:editForm.district||'',
              onChange:e=>setEditForm({...editForm,district:e.target.value,taluk:''})
            },
              h('option',{value:''},'Select District'),
              TAMIL_NADU_DISTRICTS.map(name=>h('option',{key:name,value:name},name))
            )
          ),
          h('div',{className:'field'},
            h('label',null,'Taluk'),
            h('select',{
              value:editForm.taluk||'',
              disabled:!editForm.district,
              onChange:e=>setEditForm({...editForm,taluk:e.target.value})
            },
              h('option',{value:''},editForm.district?'Select Taluk':'Select District first'),
              ...(TAMIL_NADU_DISTRICT_TALUKS[editForm.district]||[]).map(name=>h('option',{key:name,value:name},name))
            )
          ),
          field('Village / Town / City','village_town',editForm,setEditForm,true),
          field('Locality / Area','locality_area',editForm,setEditForm,false),
          field('Street / Road Name','street_name',editForm,setEditForm,true),
          field('Door / House No.','house_no',editForm,setEditForm,true),
          field('Apartment / Building','apartment_name',editForm,setEditForm,false),
          field('Flat No.','flat_no',editForm,setEditForm,false),
          field('Landmark','landmark',editForm,setEditForm,false),
          field('PIN Code','pincode',editForm,setEditForm,false),
          h('div',{className:'small-note span-2'},composePatientAddressGlobal(editForm)||'Complete address will be assembled automatically.'),
          textareaField('Special Instructions / Precautions','special_instructions',editForm,setEditForm,'span-2'),
          h('label',{className:'check-card span-2'},h('input',{type:'checkbox',checked:editForm.is_active!==false,onChange:e=>setEditForm({...editForm,is_active:e.target.checked})}),h('span',null,'Active Patient Record'))
        ),
        h('div',{className:'section-card'},
          h('div',{className:'section-title'},h('div',null,h('h4',null,'Family Portal Access'),h('small',null,'Create, update or disable the authorised family login for this resident.'))),
          h('label',{className:'check-card'},h('input',{type:'checkbox',checked:!!editFamilyAccess.enabled,onChange:e=>setEditFamilyAccess({...editFamilyAccess,enabled:e.target.checked})}),h('span',null,'Enable Family Portal')),
          editFamilyAccess.enabled&&h('div',{className:'form-grid',style:{marginTop:'12px'}},
            h('div',{className:'field'},h('label',null,'Family User ID'),h('input',{readOnly:true,value:editFamilyAccess.family_user_id||'Generated when saved'})),
            h('div',{className:'field'},h('label',null,'Authorised Relative Name'),h('input',{required:true,value:editFamilyAccess.relative_name||'',onChange:e=>setEditFamilyAccess({...editFamilyAccess,relative_name:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Relationship'),h('select',{required:true,value:editFamilyAccess.relationship||'',onChange:e=>setEditFamilyAccess({...editFamilyAccess,relationship:e.target.value})},h('option',{value:''},'Select relationship'),...(editFamilyAccess.relationship&&!['Wife','Husband','Son','Daughter','Father','Mother','Brother','Sister','Son-in-law','Daughter-in-law','Grandson','Granddaughter','Nephew','Niece','Guardian','Caregiver','Friend','Other'].includes(editFamilyAccess.relationship)?[h('option',{key:editFamilyAccess.relationship,value:editFamilyAccess.relationship},editFamilyAccess.relationship)]:[]),...['Wife','Husband','Son','Daughter','Father','Mother','Brother','Sister','Son-in-law','Daughter-in-law','Grandson','Granddaughter','Nephew','Niece','Guardian','Caregiver','Friend','Other'].map(x=>h('option',{key:x,value:x},x)))),
            h('div',{className:'field'},h('label',null,'Family Mobile Number'),h('div',{style:{display:'grid',gridTemplateColumns:'minmax(150px,42%) 1fr',gap:'8px'}},h('select',{required:true,value:editFamilyAccess.country_code||'+91','aria-label':'Family Contact 1 country code',onChange:e=>setEditFamilyAccess({...editFamilyAccess,country_code:e.target.value})},FAMILY_COUNTRY_CODES.map(([country,dial])=>h('option',{key:`fam1-${country}-${dial}`,value:dial},`${country} (${dial})`))),h('input',{required:true,type:'tel',inputMode:'tel',maxLength:14,placeholder:(editFamilyAccess.country_code||'+91')==='+91'?'10-digit mobile number':'Mobile number',value:editFamilyAccess.mobile||'',onChange:e=>setEditFamilyAccess({...editFamilyAccess,mobile:e.target.value.replace(/\D/g,'').slice(0,14)})})),h('small',null,(editFamilyAccess.country_code||'+91')==='+91'?'India: 10-digit mobile number required.':'International number validated for the selected country code.')),
            h('div',{className:'field'},h('label',null,'Email (optional)'),h('input',{type:'email',value:editFamilyAccess.email||'',onChange:e=>setEditFamilyAccess({...editFamilyAccess,email:e.target.value})})),
            h('label',{className:'check-card'},h('input',{type:'checkbox',checked:!!editFamilyAccess.primary_contact,onChange:e=>setEditFamilyAccess({...editFamilyAccess,primary_contact:e.target.checked})}),h('span',null,'Primary Family Contact'))
          ),
          h('div',{style:{marginTop:'16px',paddingTop:'14px',borderTop:'1px solid #efd5e1'}},
            h('div',{className:'section-title'},h('div',null,h('h4',null,'Family Contact 2'),h('small',null,'Optional second authorised family member with a separate Family Portal login and WhatsApp access.'))),
            h('label',{className:'check-card'},h('input',{type:'checkbox',checked:!!editFamilyAccess2.enabled,onChange:e=>setEditFamilyAccess2({...editFamilyAccess2,enabled:e.target.checked})}),h('span',null,'Enable Family Contact 2')),
            editFamilyAccess2.enabled&&h('div',{className:'form-grid',style:{marginTop:'12px'}},
              h('div',{className:'field'},h('label',null,'Family User ID'),h('input',{readOnly:true,value:editFamilyAccess2.family_user_id||'Generated when saved'})),
              h('div',{className:'field'},h('label',null,'Authorised Relative Name'),h('input',{required:true,value:editFamilyAccess2.relative_name||'',onChange:e=>setEditFamilyAccess2({...editFamilyAccess2,relative_name:e.target.value})})),
              h('div',{className:'field'},h('label',null,'Relationship'),h('select',{required:true,value:editFamilyAccess2.relationship||'',onChange:e=>setEditFamilyAccess2({...editFamilyAccess2,relationship:e.target.value})},h('option',{value:''},'Select relationship'),...['Wife','Husband','Son','Daughter','Father','Mother','Brother','Sister','Son-in-law','Daughter-in-law','Grandson','Granddaughter','Nephew','Niece','Guardian','Caregiver','Friend','Other'].map(x=>h('option',{key:x,value:x},x)))),
              h('div',{className:'field'},h('label',null,'Family Mobile Number'),h('div',{style:{display:'grid',gridTemplateColumns:'minmax(150px,42%) 1fr',gap:'8px'}},h('select',{required:true,value:editFamilyAccess2.country_code||'+91','aria-label':'Family Contact 2 country code',onChange:e=>setEditFamilyAccess2({...editFamilyAccess2,country_code:e.target.value})},FAMILY_COUNTRY_CODES.map(([country,dial])=>h('option',{key:`fam2-${country}-${dial}`,value:dial},`${country} (${dial})`))),h('input',{required:true,type:'tel',inputMode:'tel',maxLength:14,placeholder:(editFamilyAccess2.country_code||'+91')==='+91'?'10-digit mobile number':'Mobile number',value:editFamilyAccess2.mobile||'',onChange:e=>setEditFamilyAccess2({...editFamilyAccess2,mobile:e.target.value.replace(/\D/g,'').slice(0,14)})})),h('small',null,(editFamilyAccess2.country_code||'+91')==='+91'?'India: 10-digit mobile number required.':'International number validated for the selected country code.')),
              h('div',{className:'field'},h('label',null,'Email (optional)'),h('input',{type:'email',value:editFamilyAccess2.email||'',onChange:e=>setEditFamilyAccess2({...editFamilyAccess2,email:e.target.value})})),
              h('div',{className:'small-note'},'Family Contact 1 remains the Primary Family Contact. Contact 2 receives a separate login and PIN.')
            )
          ),
          editFamilyCredential2&&h('div',{className:'message success',style:{marginTop:'12px'}},h('strong',null,'Family Contact 2 Portal PIN generated'),h('div',null,`Resident ID: ${editTarget?.patient_id||'—'} · Temporary PIN: ${editFamilyCredential2.pin}`),h('button',{type:'button',className:'btn btn-secondary',style:{marginTop:'8px'},onClick:()=>window.open(`https://wa.me/${normalizeWhatsAppRecipient(editFamilyCredential2.mobile)}?text=${encodeURIComponent(brandWhatsAppText(`Samara Family Portal login\nResident ID: ${editTarget?.patient_id||''}\nTemporary PIN: ${editFamilyCredential2.pin}\nPortal: https://family.samaraassistedliving.com`))}`,'_blank','noopener')},'Send Contact 2 Login by WhatsApp')),
          editFamilyCredential&&h('div',{className:'message success',style:{marginTop:'12px'}},h('strong',null,'Family Portal PIN generated'),h('div',null,`Resident ID: ${editTarget?.patient_id||'—'} · Temporary PIN: ${editFamilyCredential.pin}`),h('button',{type:'button',className:'btn btn-secondary',style:{marginTop:'8px'},onClick:()=>window.open(`https://wa.me/${normalizeWhatsAppRecipient(editFamilyCredential.mobile)}?text=${encodeURIComponent(brandWhatsAppText(`Samara Family Portal login\nResident ID: ${editTarget?.patient_id||''}\nTemporary PIN: ${editFamilyCredential.pin}\nPortal: https://family.samaraassistedliving.com`))}`,'_blank','noopener')},'Send Login by WhatsApp'))
        ),
        h('div',{className:'section-card',style:{background:'#fff8fc'}},
          h('div',{className:'section-title'},h('div',null,h('h4',null,'Daily Patient Report WhatsApp'),h('small',null,'Automatically send the A4 Intelligent Patient Care Report PDF to the authorised family contact at the selected time.'))),
          h('label',{className:'check-card'},h('input',{type:'checkbox',checked:!!editDailyWhatsApp.enabled,onChange:e=>setEditDailyWhatsApp({...editDailyWhatsApp,enabled:e.target.checked})}),h('span',null,'Enable Daily Intelligent Patient Report through WhatsApp API')),
          editDailyWhatsApp.enabled&&h('div',{className:'form-grid',style:{marginTop:'12px'}},
            h('div',{className:'field'},h('label',null,'Authorised Recipient Name'),h('input',{required:true,value:editDailyWhatsApp.recipient_name||'',onChange:e=>setEditDailyWhatsApp({...editDailyWhatsApp,recipient_name:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Relationship'),h('input',{value:editDailyWhatsApp.relationship||'',onChange:e=>setEditDailyWhatsApp({...editDailyWhatsApp,relationship:e.target.value})})),
            h('div',{className:'field'},h('label',null,'WhatsApp Number'),h('input',{required:true,inputMode:'numeric',maxLength:10,value:editDailyWhatsApp.mobile||'',onChange:e=>setEditDailyWhatsApp({...editDailyWhatsApp,mobile:e.target.value.replace(/\D/g,'').slice(0,10)})})),
            h('div',{className:'field'},h('label',null,'Daily Report Time'),h('input',{type:'time',step:'300',required:true,value:editDailyWhatsApp.daily_report_time||'20:00',onChange:e=>setEditDailyWhatsApp({...editDailyWhatsApp,daily_report_time:e.target.value})})),
            h('div',{className:'field span-2'},h('label',null,'Email (optional)'),h('input',{type:'email',value:editDailyWhatsApp.email||'',onChange:e=>setEditDailyWhatsApp({...editDailyWhatsApp,email:e.target.value})}))
          )
        ),
        h('div',{className:'section-card medication-history-lock'},
          h('div',{className:'section-title'},
            h('div',null,h('h4',null,'3. Current Medication — History Protected'),h('small',null,'Medication is not changed from Edit Patient. Use Doctor Review / Modify so every previous order and MAR entry remains intact.')),
            h('button',{type:'button',className:'btn btn-primary',onClick:()=>{saveTaskNavigationContext({page:'Medicines',patient_id:editTarget.id,return_page:'Patients',doctor_review:true});setEditTarget(null);onNavigate?.('Medicines')}},'Doctor Review / Modify')
          ),
          editMeds.length?h('div',{className:'medication-current-readonly'},editMeds.map((m,i)=>h('div',{className:'medication-current-row',key:m.id||i},
            h('strong',null,[m.medicine_name,m.strength].filter(Boolean).join(' ')||'Medicine'),
            h('span',null,[m.frequency,m.route,String(m.times||'').split(',').map(x=>medicationTimeLabel(x.trim())).join(', '),m.food_instruction].filter(Boolean).join(' · '))
          ))):h('p',{className:'small-note'},'No current or upcoming medication is recorded.'),
          h('div',{className:'message',style:{marginTop:'10px'}},'Safety rule: modifying or stopping a medicine creates a new prescription version with doctor details and an effective date/time. The previous order is never overwritten.')
        ),
        h('div',{className:'section-card'},h('h4',null,'4. Master care plan'),h('div',{className:'check-grid'},['Bathing assistance','Restroom/toileting assistance','Oral hygiene','Dressing assistance','Feeding assistance','Walking/mobility assistance','Diaper change','Position change / bedsore prevention','Fluid intake monitoring','Sleep assistance'].map(name=>h('label',{className:'check-card',key:name},h('input',{type:'checkbox',checked:editCare.some(x=>x.care_type===name),onChange:e=>e.target.checked?setEditCare([...editCare,{...blankCare(),care_type:name}]):setEditCare(editCare.filter(x=>x.care_type!==name))}),h('span',null,name)))),editCare.map((c,i)=>h('div',{className:'repeat-row care',key:c.id||c.care_type+i},miniInput('Care task',c.care_type,v=>updateEditCare(i,'care_type',v),true),miniSelect('Shift',c.shift,['Day Shift (7 AM–7 PM)','Night Shift (7 PM–7 AM)','Both shifts'],v=>updateEditCare(i,'shift',v)),miniSelect('Frequency',c.frequency,['Daily','Each shift','Twice daily','As required'],v=>updateEditCare(i,'frequency',v)),miniInput('Instruction',c.instruction,v=>updateEditCare(i,'instruction',v)),h('button',{type:'button',className:'icon-btn',onClick:()=>setEditCare(editCare.filter((_,n)=>n!==i))},'Remove'))),h('div',{className:'form-grid'},selectField('Diet plan','diet_plan',editForm,setEditForm,['Normal diet','Soft diet','Liquid diet','Diabetic diet','Low-salt diet','Renal diet','High-protein diet','Tube feeding','Custom diet']),textareaField('Feeding instructions','feeding_instruction',editForm,setEditForm,'span-2'))),
        h('div',{className:'section-card'},h('h4',null,'5. Risks and special nurse'),h('div',{className:'check-grid'},[['fall_risk','Fall risk'],['pressure_sore_risk','Pressure sore risk'],['aspiration_risk','Aspiration risk'],['wandering_risk','Wandering / confusion risk'],['infection_risk','Infection-control precautions'],['seizure_history','Seizure history']].map(([key,label])=>h('label',{className:'check-card',key},h('input',{type:'checkbox',checked:!!editForm[key],onChange:e=>setEditForm({...editForm,[key]:e.target.checked})}),h('span',null,label)))),h('label',{className:'check-card'},h('input',{type:'checkbox',checked:!!editForm.special_nurse_required,onChange:e=>setEditForm({...editForm,special_nurse_required:e.target.checked})}),h('span',null,'Special nurse required')),editForm.special_nurse_required&&h('div',{className:'form-grid'},field('Special nurse name','special_nurse_name',editForm,setEditForm,false),selectField('Special nurse shift','special_nurse_shift',editForm,setEditForm,['Day Shift (7 AM–7 PM)','Night Shift (7 PM–7 AM)','Both shifts']))),

        h('div',{className:'section-card'},
          h('div',{className:'panel-head'},
            h('div',null,h('h4',null,'6. Physiotherapy Plan'),h('small',null,'Add or update therapy advised for this patient')),
            h('label',{className:'check-card'},h('input',{type:'checkbox',checked:!!editPhysio.required,onChange:e=>setEditPhysio({...editPhysio,required:e.target.checked,is_active:e.target.checked})}),h('span',null,'Physiotherapy required'))
          ),
          editPhysio.required
            ?h('div',{className:'form-grid'},
              h('div',{className:'field'},h('label',null,'Therapy / Exercise'),h('input',{required:true,value:editPhysio.therapy_type,onChange:e=>setEditPhysio({...editPhysio,therapy_type:e.target.value}),placeholder:'Example: Gait training / ROM exercises'})),
              h('div',{className:'field'},h('label',null,'Physiotherapist Name'),h('input',{value:editPhysio.physiotherapist_name,onChange:e=>setEditPhysio({...editPhysio,physiotherapist_name:e.target.value}),placeholder:'Name of physiotherapist'})),
              h('div',{className:'field'},h('label',null,'Frequency'),h('select',{value:editPhysio.frequency,onChange:e=>setEditPhysio({...editPhysio,frequency:e.target.value})},['Once daily','Twice daily','Three times daily','Alternate days','Weekly','As advised'].map(x=>h('option',{key:x,value:x},x)))),
              h('div',{className:'field'},h('label',null,'Preferred Time'),h('input',{type:'time',value:editPhysio.preferred_time,onChange:e=>setEditPhysio({...editPhysio,preferred_time:e.target.value})})),
              h('div',{className:'field'},h('label',null,'Advised By'),h('input',{value:editPhysio.advised_by,onChange:e=>setEditPhysio({...editPhysio,advised_by:e.target.value}),placeholder:'Doctor / Physiotherapist'})),
              h('div',{className:'field'},h('label',null,'Start Date'),h(StrictDateInput,{max:todayISOIndia(),value:editPhysio.start_date,onChange:e=>setEditPhysio({...editPhysio,start_date:e.target.value})})),
              h('div',{className:'field'},h('label',null,'End Date (optional)'),h(StrictDateInput,{min:editPhysio.start_date||undefined,value:editPhysio.end_date,onChange:e=>setEditPhysio({...editPhysio,end_date:e.target.value})})),
              h('div',{className:'field span-2'},h('label',null,'Precautions / Restrictions'),h('textarea',{rows:3,value:editPhysio.precautions,onChange:e=>setEditPhysio({...editPhysio,precautions:e.target.value}),placeholder:'Weight-bearing restriction, fall precaution, pain limit, oxygen support, etc.'}))
            )
            :h('p',{className:'small-note'},editPhysio.id?'This plan will be marked inactive when the Patient File is saved.':'Enable “Physiotherapy required” to enter the treatment plan.')
        ),
        h('div',{className:'section-card patient-edit-media'},
          h('div',{className:'panel-head'},h('div',null,h('h4',null,'Patient Photo and Medical Documents'),h('small',null,'Upload a file, use the mobile camera, or capture through the webcam.'))),
          h('div',{className:'patient-edit-photo-row'},editPhotoUrl?h('img',{src:editPhotoUrl,className:'patient-photo',alt:'Patient photo'}):h('div',{className:'patient-photo patient-photo-placeholder'},'SC'),editCaptureField('Patient Photo','photo','image/*',true)),
          editTarget?.admission_consent_status&&editTarget.admission_consent_status!=='Completed'?h('div',{className:'message warning',style:{marginBottom:'12px'}},h('strong',null,'Signed Admission Consent pending'),h('div',null,`Status: ${editTarget.admission_consent_status}${editTarget.admission_consent_exception_reason?` — Reason recorded: ${editTarget.admission_consent_exception_reason}`:''}. Upload the signed consent form below to complete admission formalities.`)):null,
          h('div',{className:'upload-grid'},editCaptureField('Identity Proof','identity'),editCaptureField('Current Prescription','prescription'),editCaptureField('Discharge / Transfer Summary','discharge'),editCaptureField('Lab / Scan / Test Reports','reports'),editCaptureField('Other Medical Documents','other'),editTarget?.admission_consent_status&&editTarget.admission_consent_status!=='Completed'?editCaptureField('Signed Admission Consent Form','consent','image/*,.pdf',false):null),
          h('h4',{style:{marginTop:'18px'}},'Uploaded Documents'),
          editDocs.length?h('div',{className:'uploaded-documents-list'},editDocs.map(doc=>h('div',{className:'timeline-item',key:doc.id},h('div',null,h('strong',null,doc.document_type||'Document'),h('span',null,doc.document_name||'File')),h('div',{className:'employee-actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>openDoc(doc)},'Open'),h('button',{type:'button',className:'btn btn-danger',onClick:()=>deleteEditDocument(doc)},'Delete'))))):h('p',{className:'small-note'},'No documents uploaded yet.')
        ),
        h('div',{className:'modal-bottom-actions'},
          h('button',{type:'button',className:'btn btn-secondary',disabled:editBusy,onClick:()=>{setEditTarget(null);setEditForm(null)}},'Close'),
          h('button',{type:'submit',className:'btn btn-primary',disabled:editBusy},editBusy?'Saving changes…':'Save Patient Information & Documents')
        )
      )),
      editCameraConfig?h(CameraCaptureModal,{config:editCameraConfig,onClose:()=>setEditCameraConfig(null)}):null,
      patientToast&&h('div',{className:`samara-toast ${patientToast.type}`,role:'status','aria-live':'polite'},
        h('span',{className:'samara-toast-icon','aria-hidden':'true'},patientToast.type==='success'?'✓':'!'),
        h('div',null,h('strong',null,patientToast.type==='success'?'Update successful':'Update failed'),h('span',null,patientToast.text)),
        h('button',{type:'button','aria-label':'Close notification',onClick:()=>setPatientToast(null)},'×')
      )
    );
  }

