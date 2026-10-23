/* Samara Spot Assessment: visit records for authenticated ERP staff.
   2.16.24: simplified to 5 sections; every field now lands in the same Admission field.
   Old (8-section) records still open: values without a place in the new form show under
   "Earlier format details" (screen and print), nothing is lost. */
(() => {
  'use strict';
  const assistance=['Independent','Minimal assistance','Full assistance','Not assessed'];
  const yesNo=['No','Yes','Not assessed'];
  // Same lists as the Admission form, so values carry over exactly.
  const relationships=['Wife','Husband','Son','Daughter','Father','Mother','Brother','Sister','Son-in-law','Daughter-in-law','Grandson','Granddaughter','Nephew','Niece','Guardian','Caregiver','Friend','Other'];
  const titles=['Dr.','Mr.','Mrs.','Ms.','Miss','Shri','Smt.','Master','Baby','Kumari','Other']; // same as Admission (without "Late")
  const categories=['Short Stay','Respite Care','Post-Surgery','Rehabilitation','Stroke Recovery','Dementia Care','Parkinsonism','Palliative Care','Long-Term Assisted Living','Observation','Elderly Care'];
  const txt=v=>String(v==null?'':v).trim();
  const fields=(...items)=>items.map(([key,label,type='text',options,show])=>({key,label,type,options,show}));
  const atHospital=d=>['Hospital','Old age home','Other'].includes(d.visit_location);
  const callerSeparate=d=>d.caller_is_contact1===false||(d.caller_is_contact1==null&&!!txt(d.caller_name)&&txt(d.caller_name)!==txt(d.family_name));
  const onSupport=d=>!!d.airway&&!['Room air','Not assessed'].includes(d.airway);
  // 2.16.45: address and phones from the shared Guest kit (guest-address.js) — exactly the same fields as
  // Admission and Patients → Edit: Country → State / Division → District → Taluk / Upazila (Tamil Nadu and
  // Bangladesh lists; other states / countries typed), phones with country code.
  const G=()=>window.SamaraGuestAddress;
  const addressKeys=['country','state','district','taluk','village_town','locality_area','street_name','house_no','apartment_name','flat_no','landmark','pincode'];
  const hasStructuredAddress=d=>addressKeys.some(k=>!['country','state'].includes(k)&&txt(d[k]));
  const composeAddress=d=>G().composeAddress(d);
  const countryOf=d=>G()?G().countryOf(d):'India';
  // the main contact's phone country code follows the address country until a number is typed
  const homeDial=d=>G()?G().dialForCountry(countryOf(d)):'+91';
  // "Name, relationship" typed in one box (older records) → name + relationship
  function splitNameRelationship(text){
    const t=txt(text);if(!t)return {name:'',relationship:''};
    const m=t.match(/^(.*?)[\s]*[,(\-–\/]+\s*([A-Za-z -]+?)\)?\s*$/);
    const rel=m&&relationships.find(r=>r.toLowerCase()===m[2].trim().toLowerCase());
    return rel&&txt(m[1])?{name:txt(m[1]),relationship:rel}:{name:t,relationship:''};
  }
  // an address typed as free text in an older form is shown (read only) until the parts are filled
  const oldFreeAddress=d=>!d.address_from_parts&&!hasStructuredAddress(d)&&txt(d.home_address);
  // 2.16.30: decision, outcome and get-ready list
  const DECISIONS=['Suitable','Suitable with conditions','Not suitable'];
  // care-related reasons only (a refusal must rest on care needs, not on who the person is)
  const NOT_SUITABLE=['Needs hospital / ICU-level care','Care needs beyond what we can safely provide now','Needs equipment or a facility we do not have','Risk of harm to self or others','No suitable room / bed available','Person does not agree to stay','Other'];
  const NOT_CONVERTED=['Chose another facility','Price / budget','Location / distance','Guest\'s condition not suitable','Family decided home care','No response after follow-ups','Guest passed away','Other']; // same as the Enquiry Register closing reasons
  const PHOTO_KINDS=['Patient portrait / face','Injured hand / arm','Injured leg / foot','Swelling','Wound / bedsore','Other clinical finding','Prescription','Discharge summary / report','Other'];
  const DOCUMENT_PHOTO_KINDS=['Prescription','Discharge summary / report','Other'];
  const imageFile=file=>/^image\//i.test(file.type||'')||(!file.type&&/\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i.test(file.name||''));
  function mergePhotos(current,added){
    const result=Array.isArray(current)?[...current]:[];
    const paths=new Set(result.map(p=>p.path));
    for(const p of added){if(!paths.has(p.path)){result.push(p);paths.add(p.path)}}
    return result;
  }
  function SpotPhotoPreview({photo,client}){
    const R=window.React,h=R.createElement,[url,setUrl]=R.useState('');
    R.useEffect(()=>{
      let active=true;
      if(imageFile(photo))client.storage.from('patient-documents').createSignedUrl(photo.path,900).then(r=>{if(active&&!r.error)setUrl(r.data?.signedUrl||'')}).catch(()=>{});
      return ()=>{active=false};
    },[client,photo.path]);
    return url?h('img',{src:url,alt:photo.body_site||photo.caption||photo.kind||'Assessment photo',loading:'lazy',style:{display:'block',width:'160px',height:'120px',objectFit:'contain',border:'1px solid #ead4df',borderRadius:'8px',margin:'6px 0'},onError:()=>setUrl('')}):null;
  }
  function prepItems(d){
    const out=['Room / bed ready'];
    const add=x=>{if(!out.includes(x))out.push(x)};
    const sv=Array.isArray(d?.services)?d.services:[];const cs=Array.isArray(d?.consumables)?d.consumables:[];
    if(sv.includes('Air mattress'))add('Air mattress');
    if(sv.includes('Oxygen cylinder / concentrator')||d?.airway==='Oxygen')add('Oxygen cylinder / concentrator');
    if(sv.includes('Suction apparatus'))add('Suction apparatus');
    if(d?.mobility==='Wheelchair')add('Wheelchair');
    cs.forEach(add);
    if(sv.includes('Wound dressing'))add('Dressing supplies');
    if(['NG / Ryles tube','PEG'].includes(d?.feeding_route))add('Feeding supplies');
    return out;
  }
  const prepPending=d=>{const r=d?.prep_ready||{};return prepItems(d).filter(x=>!r[x])};
  const prepActive=d=>d?.decision!=='Not suitable'&&d?.outcome!=='Not converted';
  const sections=[
    {title:'1. Visit and enquiry',fields:fields(
      ['visit_date','Visit date','date'],['visit_time','Visit time','time'],
      ['assessor_name','Visiting staff / assessor'],['assessor_designation','Designation'],
      ['enquiry_id','Linked enquiry (optional)','enquiry'],
      ['visit_location','Where the person was seen','select',['Home','Hospital','Old age home','Other']],
      ['hospital_name','Hospital / facility name','text',null,atHospital],
      ['assessment_consent','Permission for assessment','select',['Obtained from person','Obtained from representative','Not obtained','Not recorded']],
      ['consent_given_by_name','Permission given by — name','text',null,d=>d.assessment_consent==='Obtained from representative'],
      ['consent_given_by_relationship','Permission given by — relationship','select',relationships,d=>d.assessment_consent==='Obtained from representative'])},
    {title:'2. Guest and family',fields:fields(
      ['title','Title / Salutation','select',titles],['person_name','Person’s full name','name'],['age','Age (years)','number'],['gender','Gender','select',['Male','Female','Other']],
      ['person_phone','Person’s own phone (if any)','tel'],
      ['_addr','Home address (same parts as the Admission form — choose the Country first)','note'],
      ['_oldaddr','Address noted earlier','oldaddress',null,oldFreeAddress],
      ['_address','Home address','address'],
      ['living_arrangement','Why assisted living / current support at home','textarea'],
      ['_c1','Family Contact 1 (main contact — becomes Contact 1 in Admission)','note'],
      ['family_name','Contact 1 name'],['family_relationship','Contact 1 relationship','select',relationships],['family_phone','Contact 1 phone / WhatsApp','tel'],
      ['caller_is_contact1','The caller is Contact 1','tick'],
      ['caller_name','Caller name','text',null,callerSeparate],['caller_relationship','Caller relationship','select',relationships,callerSeparate],['caller_phone','Caller phone','tel',null,callerSeparate],
      ['_c2','Family Contact 2 (optional — another family member / emergency contact)','note'],
      ['emergency_name','Contact 2 name'],['emergency_relationship','Contact 2 relationship','select',relationships],['emergency_phone','Contact 2 phone / WhatsApp','tel'])},
    {title:'3. Health',fields:fields(
      ['general_condition','General condition and observations','textarea'],
      ['current_ailments','Current illnesses / diagnosis (one per line)','textarea'],
      ['recent_hospitalisation','Recent hospital stay / surgery','textarea'],
      ['treating_doctor','Treating doctor'],
      ['allergies','Allergies (one per line, or “Not known”)','textarea'],
      ['on_medication','Taking prescribed medicines?','select',['Yes','No','Not known']],
      ['_oldmeds','Medicines noted earlier (free text)','oldmeds',null,d=>!!txt(d.medications)],
      ['meds','Current medicines (same entry as the Admission form)','meds',null,d=>d.on_medication==='Yes'],
      ['medication_support','Medicine support needed','select',['Self-administered','Supervised','Fully administered','Not assessed']],
      ['consciousness','Alertness / communication','select',['Alert and communicates','Drowsy','Confused','Limited communication','Unresponsive','Not assessed']],
      ['cognition','Memory, orientation and behaviour','textarea'],['pain','Pain — where / how much','textarea'],
      ['blood_pressure','BP (if measured)'],['pulse','Pulse / min'],['temperature','Temperature'],['oxygen_saturation','SpO2 %'])},
    {title:'4. Care needs',fields:fields(
      ['mobility','Mobility','select',['Walks independently','Walks with assistance','Walker / walking aid','Wheelchair','Bedbound','Not assessed']],
      ['transferring','Bed / chair transfer','select',assistance],['bathing','Bathing / dressing','select',assistance],
      ['toileting','Toileting','select',assistance],['feeding','Feeding assistance','select',assistance],
      ['feeding_route','Feeding route','select',['Oral','NG / Ryles tube','PEG','Other','Not assessed']],
      ['continence','Continence','select',['Continent','Urinary incontinence','Bowel incontinence','Both','Catheter','Not assessed']],
      ['falls_history','Recent falls / balance problems','textarea'],
      ['wounds_present','Wounds / bedsores present?','select',yesNo],
      ['diet','Diet / food consistency / restrictions','textarea'],['swallowing','Swallowing difficulty','select',yesNo],
      ['airway','Breathing support','select',['Room air','Oxygen','Tracheostomy','BiPAP / CPAP','Other','Not assessed']],
      ['respiratory_notes','Breathing support settings (e.g. oxygen 2 L/min)','text',null,onSupport],
      ['consumables','Daily consumables','checks',['Diapers','Underpads','Gloves','Wet wipes','Dressing supplies','Feeding supplies']],
      ['services','Services / equipment needed','checks',['Physiotherapy','Speech therapy','Doctor review','Psychiatrist assessment','Lab tests','Air mattress','Oxygen cylinder / concentrator','Suction apparatus','Wound dressing']],
      ['care_notes','Other care notes (skin, positioning, equipment)','textarea'],
      ['_photos','Patient and clinical photos (injuries, swelling, wounds) / documents','photos'])},
    {title:'5. Decision and follow-up',fields:fields(
      ['decision','Can Samara take this person?','select',DECISIONS],
      ['decision_reason','Main reason','select',NOT_SUITABLE,d=>d.decision==='Not suitable'],
      ['decision_note','Conditions / reason in detail','textarea',null,d=>!!d.decision&&d.decision!=='Suitable'],
      ['patient_category','Care needed (same list as Admission)','select',categories],
      ['preferred_centre','Preferred centre / location'],
      ['care_level','Proposed level of care','select',['To be reviewed','Level 1','Level 2','Level 3 / one-to-one care']],
      ['planned_admission','Proposed admission date','date'],
      ['tariff_notes','Tariff discussed / quotation reference','textarea'],
      ['summary','Assessment summary and recommended follow-up','textarea'],
      ['followup_date','Follow-up date','date'],
      ['_prep','Get ready before arrival','prep'],
      ['_outcome','Outcome','outcome'],
      ['_reviews','Review notes','reviews'])}
  ];
  const woundFields=fields(['kind','Type','select',['Wound','Bedsore / pressure injury','Other']],['location','Body location'],['size','Size / depth if measured'],['appearance','Appearance / discharge / surrounding skin'],['stage','Stage if documented by qualified clinician'],['dressing','Current dressing / care instructions']);
  const legacyLabels={
    visit_address:'Visit address',earlier_address:'Address noted earlier (free text)',lead_reference:'Enquiry / lead reference',information_source:'Information provided by',language:'Preferred language',
    general_notes:'Other observations',mobility_notes:'Positioning, transfer aids and other support',skin_condition:'General skin condition',
    bedsores_present:'Bedsores / pressure injuries present?',skin_notes:'Skin care, dressings and existing care instructions',
    nutrition_notes:'Appetite, hydration and nutrition observations',equipment_notes:'Other equipment / service requirements',
    stay_type:'Stay requirement',care_requirements:'Care requirements',review_required:'Further review required from',additional_notes:'Additional information',
    relationship_review:'Client relationship manager review',centre_review:'Centre manager review',nursing_review:'Nursing head review',doctor_review:'Resident doctor review'
  };
  const systemKeys=new Set([...addressKeys,'consent_given_by','photos','photo_consent','prep_ready','outcome','outcome_reason','outcome_note','outcome_at','outcome_by','meds','medications','wounds','reviews','converted_admission','enquiry_id','enquiry_label','caller_is_contact1','spot_id','compat_fields','address_from_parts','home_address']);
  const newKeys=new Set(sections.flatMap(s=>s.fields.map(f=>f.key)));
  function legacyEntries(data){
    return Object.keys(data||{}).filter(k=>!newKeys.has(k)&&!systemKeys.has(k)&&!k.startsWith('_')).map(k=>{
      // a lead reference is already shown by the linked-enquiry field
      if(k==='lead_reference'&&data.enquiry_id)return null;
      if(Array.isArray(data.compat_fields)&&data.compat_fields.includes(k))return null; // filled automatically for the database
      const v=data[k];const shown=Array.isArray(v)?v.join(', '):txt(v);
      return shown?[legacyLabels[k]||k.replace(/_/g,' '),shown]:null;
    }).filter(Boolean);
  }
  const visible=(field,data)=>!field.show||field.show(data);
  // 2.16.29: medicines in the same parts as the Admission form (shared Strength / Time pickers)
  const FREQUENCIES=['Once Daily (OD)','Twice Daily (BD)','Three Times Daily (TDS)','Four Times Daily (QID)','HS','STAT','SOS / PRN','Alternate Days','Weekly','Monthly'];
  const ROUTES=['Oral','IV','IM','Subcutaneous','Topical','Inhalation','Nasal','Other'];
  const FOOD=['Before food','After food','With food','No restriction'];
  const DURATIONS=['Single Dose','1 Day','3 Days','5 Days','7 Days','10 Days','14 Days','21 Days','30 Days','Until Doctor Review','Long Term','Custom'];
  const kit=()=>window.SamaraMedicationKit||{};
  const blankMed=()=>({prescribed_by_doctor:'',medicine_name:'',strength:'',route:'Oral',food_instruction:'After food',times:'08:00',frequency:'Once Daily (OD)',duration:'Long Term',custom_duration_days:'',special_instruction:''});
  const namedMeds=d=>(Array.isArray(d.meds)?d.meds:[]).filter(m=>txt(m.medicine_name));
  const timeLabel=t=>(kit().medicationTimeLabel||(x=>x))(t);
  const medLine=m=>`${txt(m.medicine_name)} ${txt(m.strength)} — ${m.frequency}, ${m.route}, ${String(m.times||'').split(',').map(x=>x.trim()).filter(Boolean).map(timeLabel).join(' / ')||'time not set'}, ${m.food_instruction}, ${m.duration==='Custom'?`${m.custom_duration_days||'?'} days`:m.duration}${txt(m.prescribed_by_doctor)?` · Dr: ${txt(m.prescribed_by_doctor)}`:''}${txt(m.special_instruction)?` · ${txt(m.special_instruction)}`:''}`;
  function initial(name='',designation=''){
    const now=new Date();const date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const time=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    return {visit_date:date,visit_time:time,assessor_name:name,assessor_designation:designation,caller_is_contact1:true,country:'India',state:'Tamil Nadu',wounds:[],reviews:[]};
  }
  function validate(data,status){
    if(!txt(data.person_name))return 'Enter the person’s full name.';
    if(!data.visit_date)return 'Enter the visit date.';
    if(data.age!==''&&data.age!=null&&(!Number.isInteger(Number(data.age))||Number(data.age)<0||Number(data.age)>130))return 'Enter an age between 0 and 130, or leave it blank.';
    for(const [p,label] of [['family_phone','Contact 1 phone'],['emergency_phone','Contact 2 phone'],['person_phone','Person’s phone'],['caller_phone','Caller phone']]){
      const issue=G()?G().phoneProblem(data[p],label):'';
      if(issue)return issue;
    }
    if(G()&&!G().pinValid(data))return `${G().labels(data).pin} looks wrong — check it or leave it blank.`;
    if(status==='Completed'){
      if(!hasStructuredAddress(data)&&!txt(data.home_address)&&!txt(data.visit_address))return 'Enter the home address (at least District and Village / Town) before completing the assessment.';
      if(hasStructuredAddress(data)){
        const c=countryOf(data),L=G().labels(data);
        if(!c||c==='Other')return 'Address: choose the Country (type the country name for “Other country”).';
        if(['India','Bangladesh'].includes(c)&&!txt(data.state))return `Address: select the ${L.state} before completing the assessment.`;
        if(['India','Bangladesh'].includes(c)&&!txt(data.district))return `Address: ${c==='India'&&data.state==='Tamil Nadu'?'select':'enter'} the District before completing the assessment.`;
        if(!txt(data.village_town))return `Address: enter the ${L.village} before completing the assessment.`;
      }
      for(const [key,label] of [['assessor_name','visiting staff name'],['general_condition','general condition'],['mobility','mobility'],['wounds_present','wounds / bedsores answer'],['summary','assessment summary']]){
        if(!txt(data[key]))return `Enter the ${label} before completing the assessment.`;
      }
      if(data.on_medication==='Yes'){
        const rows=namedMeds(data);
        if(!rows.length)return 'Medicines: add at least one medicine, or change “Taking prescribed medicines?”.';
        const valid=kit().medicationStrengthValid||(v=>!!txt(v));
        for(const m of rows){
          if(!valid(m.strength))return `Medicines: enter the strength with its unit for ${m.medicine_name}.`;
          if(!['STAT','SOS / PRN'].includes(m.frequency)&&!txt(m.times))return `Medicines: select the time for ${m.medicine_name}.`;
          if(m.duration==='Custom'&&!(Number(m.custom_duration_days)>0))return `Medicines: enter the number of days for ${m.medicine_name}.`;
        }
      }
      if(!data.decision)return 'Choose “Can Samara take this person?” before completing the assessment.';
      if(data.decision==='Not suitable'&&!data.decision_reason)return 'Choose the main reason the person is not suitable.';
      if(data.decision!=='Suitable'&&!txt(data.decision_note))return 'Write the conditions / reason in detail.';
      if(data.assessment_consent==='Obtained from representative'&&(!txt(data.consent_given_by_name)||!txt(data.consent_given_by_relationship)))return 'Enter who gave permission for the assessment — name and relationship.';
      if(!txt(data.family_name)||!txt(data.family_phone))return 'Enter Family Contact 1 name and phone before completing the assessment.';
      if((data.wounds_present==='Yes'||data.bedsores_present==='Yes')&&!(data.wounds||[]).some(w=>txt(w.location)))return 'Add a body location in the wound / bedsore details.';
    }
    return '';
  }
  window.SamaraSpotAssessmentModel={sections,woundFields,initial,validate,relationships,categories,titles,splitNameRelationship,legacyEntries,prepItems,prepPending,prepActive,PHOTO_KINDS,mergePhotos,imageFile};
  window.SamaraSpotAssessment=function SpotAssessment({profile,client,onNavigate,canAdmit}){
    const R=window.React,h=R.createElement;
    const [rows,setRows]=R.useState([]),[record,setRecord]=R.useState(null),[data,setData]=R.useState(null),[dirty,setDirty]=R.useState(false);
    const [busy,setBusy]=R.useState(false),[loading,setLoading]=R.useState(false),[error,setError]=R.useState(''),[notice,setNotice]=R.useState(''),[search,setSearch]=R.useState(''),[filter,setFilter]=R.useState('All');
    const [enquiries,setEnquiries]=R.useState(null),[reviewDraft,setReviewDraft]=R.useState('');
    const [photoBodySite,setPhotoBodySite]=R.useState('');
    const [photoKind,setPhotoKind]=R.useState(PHOTO_KINDS[0]),[photoCaption,setPhotoCaption]=R.useState(''),[consentDraft,setConsentDraft]=R.useState({tick:false,by:'',rel:''});
    const [outcomeDraft,setOutcomeDraft]=R.useState({outcome:'',reason:'',note:''});
    const isAdmin=/admin|director/i.test(String(profile?.role||''));
    const saving=R.useRef(false);
    async function load(){
      setLoading(true);
      try{
        const result=[];
        for(let offset=0;;offset+=500){
          const response=await client.from('spot_assessments').select('id,person_name,visit_date,status,assessor_name,updated_at,updated_by_name,version,converted:details->converted_admission').order('visit_date',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499);
          if(response.error)throw response.error;
          result.push(...(response.data||[]));
          if((response.data||[]).length<500)break;
        }
        setRows(result);
      }catch(e){setError(`Unable to load Spot Assessments. ${e.message||e}`)}finally{setLoading(false)}
    }
    async function loadEnquiries(){
      if(enquiries)return;
      try{
        const r=await client.from('pre_admission_enquiries').select('id,enquiry_no,patient_name,website_age,family_contact_name,family_contact_phone,contact_relation,status,created_at').order('created_at',{ascending:false}).limit(300);
        if(r.error)throw r.error;
        setEnquiries(r.data||[]);
      }catch(e){console.warn('Spot Assessment: enquiries not available',e);setEnquiries([])}
    }
    R.useEffect(()=>{load()},[]);
    // 2.16.30: an alert / link for one assessment opens that assessment directly
    R.useEffect(()=>{
      const take=f=>{if(f&&f.page==='Spot Assessment'&&f.id!=null&&Date.now()-Number(f.at||0)<120000){try{sessionStorage.removeItem('samara-record-focus')}catch(_){}open(f.id,true)}};
      try{take(JSON.parse(sessionStorage.getItem('samara-record-focus')||'null'))}catch(_){}
      const on=e=>take(e.detail);window.addEventListener('samara-record-focus',on);
      return()=>window.removeEventListener('samara-record-focus',on);
    },[]);
    R.useEffect(()=>{if(data)loadEnquiries()},[!!data]);
    R.useEffect(()=>{
      if(!dirty)return;
      const warn=e=>{e.preventDefault();e.returnValue=''};
      const nav=e=>{if(e.target?.closest?.('.sidebar button,.mobile-drawer button,.mobile-home-button,.nursing-quick-actions button')&&!window.confirm('Discard unsaved Spot Assessment changes?')){e.preventDefault();e.stopPropagation()}};
      window.addEventListener('beforeunload',warn);document.addEventListener('click',nav,true);
      return ()=>{window.removeEventListener('beforeunload',warn);document.removeEventListener('click',nav,true)};
    },[dirty]);
    function change(key,value){setData(old=>({...old,[key]:value}));setDirty(true);setNotice('')}
    function changeMany(patch){setData(old=>({...old,...patch}));setDirty(true);setNotice('')}
    function pickEnquiry(id){
      const e=(enquiries||[]).find(x=>String(x.id)===String(id));
      if(!e){setData(old=>({...old,enquiry_id:'',enquiry_label:''}));setDirty(true);return}
      const name=/^not given$/i.test(e.patient_name||'')?'':txt(e.patient_name);
      const rel=relationships.find(r=>r.toLowerCase()===txt(e.contact_relation).toLowerCase())||'';
      setData(old=>({...old,enquiry_id:e.id,enquiry_label:[e.enquiry_no,name||e.family_contact_name].filter(Boolean).join(' · '),lead_reference:e.enquiry_no||old.lead_reference,
        person_name:txt(old.person_name)||name,age:txt(old.age)?old.age:(e.website_age??''),
        family_name:txt(old.family_name)||txt(e.family_contact_name),family_phone:txt(old.family_phone)||txt(e.family_contact_phone),family_relationship:old.family_relationship||rel}));
      setDirty(true);setNotice(`Details taken from enquiry ${e.enquiry_no||''}. Please check them.`);
    }
    function addReview(){
      const text=txt(reviewDraft);if(!text)return;
      change('reviews',[...(Array.isArray(data.reviews)?data.reviews:[]),{by:profile?.full_name||'staff',role:profile?.designation||profile?.role||'',at:new Date().toISOString(),text}]);
      setReviewDraft('');
    }
    function canLeave(){return !dirty||window.confirm('Discard unsaved Spot Assessment changes?')}
    function create(){if(!canLeave())return;setPhotoKind(PHOTO_KINDS[0]);setPhotoBodySite('');setPhotoCaption('');setOutcomeDraft({outcome:'',reason:'',note:''});setConsentDraft({tick:false,by:'',rel:''});setRecord(null);setData(initial(profile?.full_name||'',profile?.designation||profile?.employee_designation||profile?.job_title||profile?.position||profile?.role||''));setDirty(false);setError('');setNotice('');setReviewDraft('')}
    async function open(id,fromAlert){
      if((!fromAlert&&!canLeave())||saving.current)return;
      setBusy(true);setError('');setNotice('');setReviewDraft('');
      try{
        const result=await client.from('spot_assessments').select('*').eq('id',id).single();
        if(result.error)throw result.error;
        const det={...(result.data.details||{})};
        det.country=countryOf(det);
        if(det.country==='India'&&!txt(det.state))det.state='Tamil Nadu';
        // 2.16.45: older records kept "name and relationship" in one box — split it for the two new boxes
        if(txt(det.consent_given_by)&&!txt(det.consent_given_by_name)){const sp=splitNameRelationship(det.consent_given_by);det.consent_given_by_name=sp.name;det.consent_given_by_relationship=det.consent_given_by_relationship||sp.relationship}
        setRecord(result.data);setData({...det,wounds:det.wounds||[]});setDirty(false);
        const dd=result.data.details||{};setOutcomeDraft({outcome:dd.outcome||'',reason:dd.outcome_reason||'',note:dd.outcome_note||''});setConsentDraft({tick:false,by:'',rel:''});setPhotoCaption('');setPhotoBodySite('');setPhotoKind(PHOTO_KINDS[0]);
      }catch(e){setError(`Unable to open assessment: ${e.message||e}`)}finally{setBusy(false)}
    }
    async function save(status){
      if(saving.current)return;
      if(txt(reviewDraft)){setError('You typed a review note but did not tap “Add note”. Tap Add note, or clear the box.');return}
      const issue=validate(data,status);if(issue){setError(issue);return}
      saving.current=true;setBusy(true);setError('');setNotice('');
      try{
        // hidden fields are cleared so an old value never misleads later
        const clean={...data};
        if(clean.caller_is_contact1===true){clean.caller_name='';clean.caller_relationship='';clean.caller_phone=''}
        if(!atHospital(clean))clean.hospital_name='';
        if(!onSupport(clean))clean.respiratory_notes='';
        clean.person_name=txt(clean.person_name).toUpperCase();
        // a country code chosen without a number is not a phone number
        for(const k of ['person_phone','family_phone','caller_phone','emergency_phone'])if(G()&&txt(clean[k])){const n=G().localNumber(clean[k]);clean[k]=n?`${G().dialOf(clean[k])} ${n}`:''}
        // 2.16.45: name and relationship are entered separately; the older single box is kept filled
        // (as "Name (Relationship)") for anything that still reads it
        if(clean.assessment_consent==='Obtained from representative'){
          clean.consent_given_by=[txt(clean.consent_given_by_name),txt(clean.consent_given_by_relationship)?`(${txt(clean.consent_given_by_relationship)})`:''].filter(Boolean).join(' ');
        }else{clean.consent_given_by_name='';clean.consent_given_by_relationship='';clean.consent_given_by=''}
        clean.meds=clean.on_medication==='Yes'?namedMeds(clean):[];
        // 2.16.27: the database still checks two fields of the older form before a record can be Completed
        // (visit address, bedsores answer). Fill them from the new fields so Completed is accepted.
        if(hasStructuredAddress(clean)){
          if(!clean.address_from_parts&&txt(clean.home_address)&&!txt(clean.earlier_address))clean.earlier_address=txt(clean.home_address); // keep the old free-text address
          clean.home_address=composeAddress(clean);clean.address_from_parts=true;
        }
        const compat=new Set(Array.isArray(clean.compat_fields)?clean.compat_fields:[]);
        if(!txt(clean.visit_address)||compat.has('visit_address')){clean.visit_address=txt(clean.home_address);compat.add('visit_address')}
        if(!txt(clean.bedsores_present)||compat.has('bedsores_present')){
          const sore=(clean.wounds||[]).some(w=>/bedsore|pressure/i.test(w.kind||''));
          clean.bedsores_present=clean.wounds_present==='Yes'?(sore?'Yes':'No'):(clean.wounds_present||'');
          compat.add('bedsores_present');
        }
        clean.compat_fields=[...compat];
        const payload={person_name:clean.person_name.trim(),visit_date:clean.visit_date,assessor_name:txt(clean.assessor_name),status,details:clean};
        let query=record?client.from('spot_assessments').update(payload).eq('id',record.id).eq('version',record.version):client.from('spot_assessments').insert(payload);
        let result=await query.select('*').maybeSingle();
        if(result.error)throw result.error;
        if(!result.data&&record){
          // 2.16.26: nothing was saved — find out why instead of guessing
          const latest=await client.from('spot_assessments').select('*').eq('id',record.id).maybeSingle();
          if(latest.error)throw latest.error;
          if(!latest.data)throw new Error('This assessment could not be found any more (it may have been removed). Your entries are still on screen.');
          if(latest.data.version===record.version)throw new Error('The ERP did not accept the change (permission). Your entries are still on screen — please ask Admin to check your access to Spot Assessment.');
          // Changed meanwhile. If the only change was the "Admission started" stamp (Convert to Guest /
          // Fill from Spot Assessment), keep that stamp and save again automatically.
          const strip=d=>{const c={...(d||{})};delete c.converted_admission;return JSON.stringify(Object.keys(c).sort().map(k=>[k,c[k]]))};
          if(strip(latest.data.details)!==strip(record.details))throw new Error('Another staff member changed this assessment while you were editing. Your entries are still on screen. Copy any needed changes, then go back to the register and reopen the latest record.');
          const merged={...payload,details:{...payload.details,converted_admission:latest.data.details?.converted_admission||payload.details.converted_admission}};
          result=await client.from('spot_assessments').update(merged).eq('id',record.id).eq('version',latest.data.version).select('*').maybeSingle();
          if(result.error)throw result.error;
          if(!result.data)throw new Error('Another staff member changed this assessment while you were editing. Your entries are still on screen. Go back to the register and reopen the latest record.');
        }
        if(!result.data)throw new Error('The assessment was not saved. Please try again.');
        setRecord(result.data);setData({...result.data.details,wounds:result.data.details?.wounds||[]});setDirty(false);setNotice(`Assessment saved as ${status}.`);await load();
      }catch(e){setError(`Unable to save: ${e.message||e}`)}finally{saving.current=false;setBusy(false)}
    }
    // 2.16.30: save a few fields straight away (photos, consent, get-ready ticks, outcome) without changing
    // the assessment status and without touching any unsaved typing on screen.
    async function saveDetails(patch,okText){
      if(!record||saving.current)return false;
      saving.current=true;setBusy(true);setError('');
      try{
        let base=record;
        for(let attempt=0;attempt<2;attempt++){
          const applied=typeof patch==='function'?patch(base.details||{}):patch;
          const r=await client.from('spot_assessments').update({details:{...(base.details||{}),...applied}}).eq('id',base.id).eq('version',base.version).select('*').maybeSingle();
          if(r.error)throw r.error;
          if(r.data){setRecord(r.data);setData(old=>({...old,...applied}));if(okText)setNotice(okText);load();return true}
          const latest=await client.from('spot_assessments').select('*').eq('id',base.id).maybeSingle();
          if(latest.error)throw latest.error;
          if(!latest.data||latest.data.version===base.version)throw new Error('The ERP did not accept the change. Please ask Admin to check your access to Spot Assessment.');
          base=latest.data; // someone else saved meanwhile — add this change on top of the latest version
        }
        throw new Error('Another staff member is saving this assessment right now. Please try again.');
      }catch(e){setError(`Unable to save: ${e.message||e}`);return false}finally{saving.current=false;setBusy(false)}
    }
    async function syncEnquiry(){
      if(!record||!(data?.enquiry_id))return;
      try{
        const r=await client.rpc('spot_enquiry_sync',{p_spot_id:String(record.id)});
        if(r.error)throw r.error;
        if(r.data?.updated)setNotice(n=>`${n?n+' ':''}Enquiry ${r.data.enquiry_no||''} updated to “${r.data.status}”.`);
      }catch(e){console.warn('Spot Assessment: enquiry not updated',e);setNotice(n=>`${n?n+' ':''}The linked enquiry was not updated automatically — please tell Akshi / Admin.`)}
    }
    async function uploadPhotos(files){
      const list=Array.from(files||[]);if(!list.length||!record||saving.current)return;
      if(!record.details?.photo_consent?.given){setError('Record photo consent before adding photos.');return}
      const allowPdf=DOCUMENT_PHOTO_KINDS.includes(photoKind);
      if(list.some(file=>!imageFile(file)&&!(allowPdf&&(file.type==='application/pdf'||(!file.type&&/\.pdf$/i.test(file.name||'')))))){
        setError(allowPdf?'Choose image files or PDF documents.':'Choose image files for patient and clinical photos. Select a document category to attach a PDF.');return;
      }
      saving.current=true;setBusy(true);setError('');setNotice('');
      const added=[];let uploadError='';
      const metadata={kind:photoKind,body_site:txt(photoBodySite),caption:txt(photoCaption)};
      try{
        for(const file of list){
          const safe=String(file.name||'photo').replace(/[^a-zA-Z0-9._-]/g,'_');
          const path=`spot-assessments/${record.id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}-${safe}`;
          const up=await client.storage.from('patient-documents').upload(path,file,{upsert:false,contentType:file.type||undefined});
          if(up.error)throw up.error;
          added.push({path,name:file.name||safe,type:file.type||'',...metadata,at:new Date().toISOString(),by:profile?.full_name||'staff'});
        }
      }catch(e){uploadError=`Upload failed: ${e.message||e}. Only successfully uploaded files will be saved; retry the remaining files.`}
      saving.current=false;
      if(added.length){
        const ok=await saveDetails(latest=>({photos:mergePhotos(latest.photos,added)}),`${added.length} photo(s) saved with this assessment.`);
        if(ok&&!uploadError){setPhotoCaption('');setPhotoBodySite('')}
        else if(!ok){
          // Confirm these files are unlinked before cleanup: a network error can hide a successful save.
          try{const check=await client.from('spot_assessments').select('*').eq('id',record.id).maybeSingle();if(!check.error&&check.data){const linked=new Set((check.data.details?.photos||[]).map(p=>p.path));const unlinked=added.filter(p=>!linked.has(p.path)).map(p=>p.path);if(unlinked.length){const cleanup=await client.storage.from('patient-documents').remove(unlinked);if(cleanup.error)console.warn('Spot photo cleanup failed',cleanup.error)}}}catch(e){console.warn('Spot photo cleanup failed',e)}
        }
      }else setBusy(false);
      if(uploadError)setError(old=>old?old+' '+uploadError:uploadError);
    }
    async function viewPhoto(p){
      try{const r=await client.storage.from('patient-documents').createSignedUrl(p.path,900);if(r.error)throw r.error;window.open(r.data.signedUrl,'_blank','noopener')}
      catch(e){setError(`Unable to open the photo: ${e.message||e}`)}
    }
    async function togglePrep(item){
      const cur={...(record?.details?.prep_ready||{})};
      if(cur[item])delete cur[item];else cur[item]={by:profile?.full_name||'staff',at:new Date().toISOString()};
      await saveDetails({prep_ready:cur});
    }
    async function saveOutcome(){
      const o=outcomeDraft;
      if(!o.outcome){setError('Choose the outcome.');return}
      if(o.outcome==='Not converted'&&!o.reason){setError('Choose why the person did not come to Samara.');return}
      const ok=await saveDetails({outcome:o.outcome,outcome_reason:o.outcome==='Not converted'?o.reason:'',outcome_note:txt(o.note),outcome_at:new Date().toISOString(),outcome_by:profile?.full_name||'staff'},'Outcome saved.');
      if(ok&&o.outcome==='Not converted')await syncEnquiry();
    }
    // 2.16.23: Convert to Guest — carries everything already recorded into a new Admission form,
    // so staff fill only what is left (medicines, room / bed, package, photo / ID, family portal option).
    async function convertToGuest(){
      if(!record||saving.current)return;
      if(dirty){setError('Save this assessment first, then tap Convert to Guest.');return}
      if(!window.confirm(`Start admission for ${data.person_name} as a Guest?\n\nDetails from this Spot Assessment will be filled in the Admission form. Staff then fill only the remaining items (medicines, room / bed, package, photo / ID).`))return;
      saving.current=true;setBusy(true);setError('');
      try{
        const stamp={started_at:new Date().toISOString(),started_by:profile?.full_name||'staff'};
        const details={...data,converted_admission:stamp};
        const result=await client.from('spot_assessments').update({details}).eq('id',record.id).eq('version',record.version).select('*').maybeSingle();
        if(result.error)throw result.error;
        if(!result.data)throw new Error('Another staff member changed this assessment. Go back to the register, reopen it and try again.');
        setRecord(result.data);setData({...result.data.details,wounds:result.data.details?.wounds||[]}); // 2.16.26: keep the new version, so a later Save works
        sessionStorage.setItem('samara-spot-admission',JSON.stringify({spot_id:record.id,...data}));
        setDirty(false);
        if(data.enquiry_id)try{await client.rpc('spot_enquiry_sync',{p_spot_id:String(record.id)})}catch(_){} // 2.16.30: linked enquiry → Admitted
        if(typeof onNavigate==='function')onNavigate('Admissions');
      }catch(e){setError(`Unable to start admission: ${e.message||e}`)}finally{saving.current=false;setBusy(false)}
    }
    const BOX={padding:'10px 12px',border:'1px solid #efdbe4',borderRadius:'10px',background:'#fff8fb'};
    const fmtDate=v=>String(v||'').slice(0,10).split('-').reverse().join('-');
    const stampText=at=>window.SamaraDateTime?.dateTime?window.SamaraDateTime.dateTime(at):at;
    const tickOn=(values,key)=>values[key]===true||(key==='caller_is_contact1'&&values[key]==null&&!callerSeparate(values));
    function control(field,values,onChange,prefix='spot'){
      const id=`${prefix}-${field.key}`,value=values[field.key]??'';
      if(field.type==='note')return h('div',{className:'spot-wide spot-subhead',key:field.key},field.label);
      if(field.type==='tick')return h('label',{className:'spot-wide spot-tick',key:field.key},h('input',{type:'checkbox',disabled:busy,checked:tickOn(values,field.key),onChange:e=>onChange(field.key,e.target.checked)}),field.label);
      if(field.type==='photos'){
        const photos=(Array.isArray(values.photos)?values.photos:[]).map((p,i)=>({...p,_i:i}));
        const shown=photos.filter(p=>!p.removed);
        const consent=values.photo_consent;
        return h('div',{className:'field spot-wide',key:field.key},h('label',null,field.label),
          h('div',{style:BOX},
            !record?h('small',{className:'small-note'},'Save the assessment once (Save draft), then add photos here.')
            :!consent?.given?h('div',null,
              h('label',{className:'spot-tick'},h('input',{type:'checkbox',checked:consentDraft.tick,disabled:busy,onChange:e=>setConsentDraft(c=>({...c,tick:e.target.checked}))}),'The person / family agreed to photos being taken for Samara’s care records'),
              h('div',{className:'spot-grid'},
                h('div',{className:'field'},h('label',null,'Agreed by — name'),h('input',{value:consentDraft.by,disabled:busy,placeholder:'e.g. Ravi',onChange:e=>setConsentDraft(c=>({...c,by:e.target.value}))})),
                h('div',{className:'field'},h('label',null,'Agreed by — relationship'),h('select',{value:consentDraft.rel,disabled:busy,onChange:e=>setConsentDraft(c=>({...c,rel:e.target.value}))},h('option',{value:''},'Select'),['Self (the person)',...relationships].map(x=>h('option',{key:x,value:x},x))))),
              h('button',{type:'button',className:'btn btn-secondary',disabled:busy||!consentDraft.tick||!txt(consentDraft.by)||!consentDraft.rel,onClick:()=>saveDetails({photo_consent:{given:true,by_name:txt(consentDraft.by),by_relationship:consentDraft.rel,recorded_by:profile?.full_name||'staff',at:new Date().toISOString()}},'Photo consent recorded.')},'Record consent'),
              h('small',{className:'small-note',style:{display:'block',marginTop:'4px'}},'Photos are taken only after consent. They are kept privately for care records, never shared on WhatsApp or social media.'))
            :h('div',null,
              h('small',{className:'small-note'},`Consent for photos: ${consent.by_name}${consent.by_relationship?` (${consent.by_relationship})`:''} · recorded by ${consent.recorded_by} · ${stampText(consent.at)}`),
              h('div',{className:'spot-grid',style:{marginTop:'8px'}},
                h('div',{className:'field'},h('label',null,'Photo of'),h('select',{value:photoKind,disabled:busy,onChange:e=>setPhotoKind(e.target.value)},PHOTO_KINDS.map(k=>h('option',{key:k,value:k},k)))),
                h('div',{className:'field'},h('label',null,'Body location / side (optional)'),h('input',{value:photoBodySite,disabled:busy,placeholder:'e.g. Left hand, right ankle, both legs',onChange:e=>setPhotoBodySite(e.target.value)})),
                h('div',{className:'field'},h('label',null,'Note (optional)'),h('input',{value:photoCaption,disabled:busy,placeholder:'e.g. Swelling around left ankle, bruise on palm',onChange:e=>setPhotoCaption(e.target.value)}))),
              h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',margin:'8px 0'}},
                h('label',{className:'btn btn-primary',style:{cursor:'pointer'}},'Take photo',h('input',{type:'file',accept:'image/*',capture:photoKind==='Patient portrait / face'?'user':'environment',style:{display:'none'},disabled:busy,onChange:e=>{uploadPhotos(e.target.files);e.target.value=''}})),
                h('label',{className:'btn btn-secondary',style:{cursor:'pointer'}},DOCUMENT_PHOTO_KINDS.includes(photoKind)?'Choose photos / PDF':'Choose photos (multiple)',h('input',{type:'file',accept:DOCUMENT_PHOTO_KINDS.includes(photoKind)?'image/*,application/pdf':'image/*',multiple:true,style:{display:'none'},disabled:busy,onChange:e=>{uploadPhotos(e.target.files);e.target.value=''}}))),
              h('small',{className:'small-note'},'Add as many photos as needed: injured hands or legs, swelling, wounds, or other findings. The category, location and note apply to each file selected in this batch. Add another batch for a different area.'),
              shown.length?h('ul',{className:'spot-reviews'},shown.map(p=>h('li',{key:p.path},
                h(SpotPhotoPreview,{photo:p,client}),h('strong',null,p.kind),p.body_site?` · ${p.body_site}`:'',` · ${stampText(p.at)} · ${p.by}`,p.caption?` · ${p.caption}`:'',' ',
                h('button',{type:'button',className:'btn btn-secondary',style:{padding:'2px 10px',minHeight:0},onClick:()=>viewPhoto(p)},'View'),' ',
                isAdmin?h('button',{type:'button',className:'btn btn-secondary',style:{padding:'2px 10px',minHeight:0},disabled:busy,onClick:()=>{if(window.confirm('Remove this photo from the list? (The file is kept for records.)'))saveDetails(latest=>({photos:(latest.photos||[]).map(q=>q.path===p.path?{...q,removed:{by:profile?.full_name||'Admin',at:new Date().toISOString()}}:q)}),'Photo removed from the list.')}},'Remove'):null))):h('small',{className:'small-note'},'No photos yet. Add a portrait and any necessary injury, swelling or wound photos to document the condition before admission.'))));
      }
      if(field.type==='prep'){
        if(!record||!prepActive(values))return null;
        const items=prepItems(values);const ready=values.prep_ready||{};
        return h('div',{className:'field spot-wide',key:field.key},h('label',null,field.label),
          h('div',{style:BOX},
            items.map(it=>h('label',{key:it,className:'spot-tick'},h('input',{type:'checkbox',checked:!!ready[it],disabled:busy,onChange:()=>togglePrep(it)}),it,ready[it]?h('small',{className:'small-note',style:{marginLeft:'6px'}},`ready · ${ready[it].by} · ${stampText(ready[it].at)}`):null)),
            h('small',{className:'small-note'},values.planned_admission?`The Nursing Manager is reminded from 2 days before ${fmtDate(values.planned_admission)} until everything is ticked. Each tick saves at once.`:'Enter the proposed admission date above to remind the Nursing Manager. Each tick saves at once.')));
      }
      if(field.type==='outcome'){
        if(!record)return null;
        if(values.converted_admission)return h('div',{className:'field spot-wide',key:field.key},h('label',null,field.label),h('div',{className:'message success'},`Admission started by ${values.converted_admission.started_by||'staff'} on ${stampText(values.converted_admission.started_at)}.`));
        const o=outcomeDraft;
        return h('div',{className:'field spot-wide',key:field.key},h('label',null,field.label),
          h('div',{style:BOX},
            values.outcome?h('small',{className:'small-note',style:{display:'block',marginBottom:'6px'}},`Last outcome: ${values.outcome}${values.outcome_reason?` — ${values.outcome_reason}`:''} · ${values.outcome_by||''} · ${stampText(values.outcome_at)}`):null,
            h('div',{className:'spot-grid'},
              h('div',{className:'field'},h('label',null,'Outcome'),h('select',{value:o.outcome,disabled:busy,onChange:e=>setOutcomeDraft({...o,outcome:e.target.value})},h('option',{value:''},'Select'),['Waiting for family decision','Not converted'].map(x=>h('option',{key:x,value:x},x)))),
              o.outcome==='Not converted'?h('div',{className:'field'},h('label',null,'Why not'),h('select',{value:o.reason,disabled:busy,onChange:e=>setOutcomeDraft({...o,reason:e.target.value})},h('option',{value:''},'Select'),NOT_CONVERTED.map(x=>h('option',{key:x,value:x},x)))):null,
              h('div',{className:'field spot-wide'},h('label',null,'Note (optional)'),h('input',{value:o.note,disabled:busy,onChange:e=>setOutcomeDraft({...o,note:e.target.value})}))),
            h('button',{type:'button',className:'btn btn-secondary',disabled:busy||!o.outcome,onClick:saveOutcome},'Save outcome'),
            h('small',{className:'small-note',style:{display:'block',marginTop:'4px'}},'When the person is admitted, use Convert to Guest — the outcome is set automatically. A linked enquiry is updated automatically.')));
      }
      if(field.type==='oldaddress')return h('div',{className:'field spot-wide',key:field.key},h('label',null,field.label),h('div',{className:'small-note',style:{whiteSpace:'pre-wrap',padding:'6px 8px',border:'1px dashed #e0a9c4',borderRadius:'8px',background:'#fff'}},txt(values.home_address)),h('small',{className:'small-note'},'Please re-enter it in the parts below (District, Taluk …). It is kept as it is until you do.'));
      if(field.type==='oldmeds')return h('div',{className:'field spot-wide',key:field.key},h('label',null,field.label),h('div',{className:'small-note',style:{whiteSpace:'pre-wrap',padding:'6px 8px',border:'1px dashed #e0a9c4',borderRadius:'8px',background:'#fff'}},txt(values.medications)),namedMeds(values).length?null:h('small',{className:'small-note'},values.on_medication==='Yes'?'Please enter these as medicines below (one per row). This note is kept as it is.':'Choose “Yes” above, then enter these as medicines (one per row). This note is kept as it is.'));
      if(field.type==='meds'){
        const rows=Array.isArray(values.meds)&&values.meds.length?values.meds:[blankMed()];
        const K=kit();
        const set=(i,key,val)=>onChange('meds',rows.map((r,n)=>n===i?{...r,[key]:val}:r));
        const sel=(i,label,key,opts,extra)=>h('div',{className:'field'},h('label',null,label),h('select',{value:rows[i][key]||'',disabled:busy,onChange:e=>extra?extra(e.target.value):set(i,key,e.target.value)},[...(rows[i][key]&&!opts.includes(rows[i][key])?[rows[i][key]]:[]),...opts].map(o=>h('option',{key:o,value:o},o))));
        const inp=(i,label,key,props={})=>h('div',{className:'field'},h('label',null,label),h('input',{value:rows[i][key]||'',disabled:busy,onChange:e=>set(i,key,e.target.value),...props}));
        return h('div',{className:'field spot-wide',key:field.key},h('label',null,field.label),
          rows.map((m,i)=>h('div',{className:'spot-wound',key:i},h('h4',null,`Medicine ${i+1}`),
            h('div',{className:'spot-grid'},
              inp(i,'Medicine','medicine_name',{placeholder:'e.g. Metformin'}),
              K.MedicationStrengthInput?h(K.MedicationStrengthInput,{label:'Strength',value:m.strength,onChange:v=>set(i,'strength',v)}):inp(i,'Strength','strength'),
              sel(i,'Frequency','frequency',FREQUENCIES,v=>{const t=(K.MEDICATION_FREQUENCY_TIMES||{})[v];onChange('meds',rows.map((r,n)=>n===i?{...r,frequency:v,times:t?t.join(', '):r.times}:r))}),
              sel(i,'Route','route',ROUTES),
              K.MedicationTimeSelector?h(K.MedicationTimeSelector,{label:'Time',value:m.times,onChange:v=>set(i,'times',v)}):inp(i,'Time','times'),
              sel(i,'Food','food_instruction',FOOD),
              sel(i,'Duration','duration',DURATIONS),
              m.duration==='Custom'?inp(i,'Custom days','custom_duration_days',{type:'number',min:1}):null,
              inp(i,'Prescribed Doctor','prescribed_by_doctor'),
              inp(i,'Special instruction','special_instruction')),
            h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>{if(!txt(m.medicine_name)||window.confirm(`Remove ${m.medicine_name}?`))onChange('meds',rows.length>1?rows.filter((_,n)=>n!==i):[blankMed()])}},'Remove this medicine'))),
          h('div',null,h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>onChange('meds',[...rows,blankMed()])},'+ Add Medicine')));
      }
      if(field.type==='address'){
        const K=G();
        if(!K)return h('div',{className:'field spot-wide',key:field.key},h('small',{className:'small-note'},'Address fields are loading — please refresh the page.'));
        return h(K.AddressFields,{key:field.key,value:values,disabled:busy,idPrefix:prefix,onChange:changeMany});
      }
      if(field.type==='tel'&&G()){
        const v=txt(values[field.key])?values[field.key]:`${['family_phone','caller_phone','emergency_phone','person_phone'].includes(field.key)?homeDial(values):'+91'} `;
        return h(G().PhoneInput,{key:field.key,id,label:field.label,value:v,disabled:busy,onChange:val=>onChange(field.key,val)});
      }
      if(field.type==='name')return h('div',{className:'field',key:field.key},h('label',{htmlFor:id},field.label,' *'),h('input',{id,value,disabled:busy,autoCapitalize:'characters',style:{textTransform:'uppercase'},'data-samara-voice':'on',onChange:e=>onChange(field.key,e.target.value.toUpperCase())}));
      if(field.type==='dselect'){
        const opts=field.options(values)||[];
        const extra=value&&!opts.includes(value)?[value]:[];
        const noDistrict=field.key==='taluk'&&!values.district;
        return h('div',{className:'field',key:field.key},h('label',{htmlFor:id},field.label),
          h('select',{id,value,disabled:busy||noDistrict,onChange:e=>onChange(field.key,e.target.value)},
            h('option',{value:''},field.key==='district'?'Select District':noDistrict?'Select District first':'Select Taluk'),
            [...extra,...opts].map(o=>h('option',{key:o,value:o},o))));
      }
      if(field.type==='pin')return h('div',{className:'field',key:field.key},h('label',{htmlFor:id},field.label),h('input',{id,value,disabled:busy,inputMode:'numeric',maxLength:6,placeholder:'6-digit PIN',onChange:e=>onChange(field.key,e.target.value.replace(/\D/g,'').slice(0,6))}));
      if(field.type==='enquiry'){
        const list=enquiries||[];
        const known=list.some(e=>String(e.id)===String(values.enquiry_id));
        return h('div',{className:'field',key:field.key},h('label',{htmlFor:id},field.label),
          h('select',{id,value:values.enquiry_id||'',disabled:busy||!enquiries,onChange:e=>pickEnquiry(e.target.value)},
            h('option',{value:''},enquiries?'No enquiry / walk-in':'Loading enquiries…'),
            values.enquiry_id&&!known?h('option',{value:values.enquiry_id},values.enquiry_label||'Linked enquiry'):null,
            list.map(e=>h('option',{key:e.id,value:e.id},[e.enquiry_no,/^not given$/i.test(e.patient_name||'')?'':e.patient_name,e.family_contact_name,e.status].filter(Boolean).join(' · ')))),
          h('small',{className:'small-note'},'Choosing an enquiry fills the name, age and Contact 1 from it.'));
      }
      if(field.type==='reviews'){
        const reviews=Array.isArray(values.reviews)?values.reviews:[];
        return h('div',{className:'field spot-wide',key:field.key},h('label',{htmlFor:id},field.label),
          reviews.length?h('ul',{className:'spot-reviews'},reviews.map((r,i)=>h('li',{key:i},h('strong',null,`${r.by}${r.role?` (${r.role})`:''} · ${stampText(r.at)}`),h('div',null,r.text)))):h('small',{className:'small-note'},'No review notes yet. Relationship manager, centre manager, nursing head or doctor can add one — the name and time are stamped automatically.'),
          h('textarea',{id,rows:2,value:reviewDraft,disabled:busy,'data-samara-voice':'on',placeholder:'Type your review note',onChange:e=>setReviewDraft(e.target.value)}),
          h('div',null,h('button',{type:'button',className:'btn btn-secondary',disabled:busy||!txt(reviewDraft),onClick:addReview},'Add note')));
      }
      const identity=['assessor_name','assessor_designation'].includes(field.key);
      const voice=!identity&&['text','textarea'].includes(field.type)&&!['blood_pressure','pulse','temperature','oxygen_saturation','size','stage'].includes(field.key);
      const props={id,name:id,value,onChange:e=>onChange(field.key,e.target.value),disabled:busy,readOnly:identity,'data-samara-voice':voice?'on':'off'};
      let input;
      if(field.type==='textarea')input=h('textarea',{...props,rows:3});
      else if(field.type==='select'){
        const extra=value&&!field.options.includes(value)?[value]:[]; // keep an old free-text value visible
        input=h('select',props,h('option',{value:''},'Select / not recorded'),[...extra,...field.options].map(o=>h('option',{key:o,value:o},o)));
      }
      else if(field.type==='checks')input=h('div',{className:'spot-checks',role:'group','aria-labelledby':`${id}-label`},field.options.map(o=>h('label',{key:o},h('input',{type:'checkbox',disabled:busy,checked:Array.isArray(value)&&value.includes(o),onChange:e=>onChange(field.key,e.target.checked?[...(Array.isArray(value)?value:[]),o]:(Array.isArray(value)?value:[]).filter(v=>v!==o))}),o)));
      else input=h('input',{...props,type:field.type,...(field.key==='age'?{min:0,max:130,step:1}:{}),...(field.type==='tel'?{inputMode:'tel',placeholder:'10-digit mobile'}:{})});
      return h('div',{className:`field ${['textarea','checks'].includes(field.type)?'spot-wide':''}`,key:field.key},h('label',{id:`${id}-label`,htmlFor:field.type==='checks'?undefined:id},field.label,['person_name','visit_date'].includes(field.key)?' *':''),input);
    }
    function printValue(field,d){
      if(field.type==='enquiry')return d.enquiry_label||d.lead_reference||'Not linked';
      if(field.type==='tick')return tickOn(d,field.key)?'Yes':'No';
      if(field.type==='oldaddress')return txt(d.home_address);
      if(field.type==='address')return hasStructuredAddress(d)?composeAddress(d):'Not recorded';
      if(field.type==='tel'){const v=txt(d[field.key]);return G()&&G().localOf(v)?`${G().dialOf(v)} ${G().localOf(v)}`:(v||'Not recorded')}
      if(field.type==='oldmeds')return txt(d.medications);
      if(field.type==='photos'){const ps=(Array.isArray(d.photos)?d.photos:[]).filter(p=>!p.removed);return (d.photo_consent?.given?`Consent: ${d.photo_consent.by_name}${d.photo_consent.by_relationship?`, ${d.photo_consent.by_relationship}`:''} (${stampText(d.photo_consent.at)})\n`:'')+(ps.map((p,i)=>`${i+1}. ${p.kind} — ${stampText(p.at)} — ${p.by}${p.body_site?` — ${p.body_site}`:''}${p.caption?` — ${p.caption}`:''}`).join('\n')||'None')}
      if(field.type==='prep'){const r=d.prep_ready||{};return prepItems(d).map(x=>`${r[x]?'✓':'☐'} ${x}`).join('\n')}
      if(field.type==='outcome')return d.converted_admission?`Admission started (${stampText(d.converted_admission.started_at)})`:d.outcome?`${d.outcome}${d.outcome_reason?` — ${d.outcome_reason}`:''}${d.outcome_note?` — ${d.outcome_note}`:''}`:'Open';
      if(field.type==='meds')return namedMeds(d).map((m,i)=>`${i+1}. ${medLine(m)}`).join('\n')||'None entered';
      if(field.type==='reviews')return (Array.isArray(d.reviews)?d.reviews:[]).map(r=>`${r.by}${r.role?` (${r.role})`:''} · ${stampText(r.at)}: ${r.text}`).join('\n')||'None';
      const v=d[field.key];
      if(Array.isArray(v))return v.join(', ')||'Not recorded';
      if(field.type==='date')return v?fmtDate(v):'Not recorded';
      return txt(v)||'Not recorded';
    }
    const list=rows.filter(row=>(filter==='All'||row.status===filter)&&`${row.person_name} ${row.assessor_name||''}`.toLowerCase().includes(search.toLowerCase()));
    const button=(label,click,primary=false)=>h('button',{type:'button',className:`btn ${primary?'btn-primary':'btn-secondary'}`,disabled:busy,onClick:click},label);
    const legacy=data?legacyEntries(data):[];
    const isCareSection=title=>title.startsWith('4.');
    const woundOpen=data&&(data.wounds_present==='Yes'||data.bedsores_present==='Yes'||(data.wounds||[]).length>0);
    const printable=data?h('article',{className:'spot-print'},h('h1',null,'Samara Care — Spot Assessment'),h('p',null,`${record?.id||'Unsaved assessment'} · ${dirty?'Unsaved changes':record?.status||'Draft'}`),
      sections.map(section=>h('section',{key:section.title},h('h2',null,section.title),h('dl',null,section.fields.filter(f=>f.type!=='note'&&visible(f,data)).map(field=>h('div',{key:field.key},h('dt',null,field.label),h('dd',null,printValue(field,data))))),
        isCareSection(section.title)?(data.wounds||[]).map((w,i)=>h('div',{key:i},h('h3',null,`Wound / bedsore ${i+1}`),h('dl',null,woundFields.map(field=>h('div',{key:field.key},h('dt',null,field.label),h('dd',null,w[field.key]||'Not recorded')))))):null)),
      legacy.length?h('section',null,h('h2',null,'Earlier format details'),h('dl',null,legacy.map(([k,v])=>h('div',{key:k},h('dt',null,k),h('dd',null,v))))):null,
      h('section',null,h('h2',null,'Please note'),
        h('p',null,'This is a care-needs assessment made by Samara staff during a visit. It is not a medical diagnosis or prescription; medicines are continued only as prescribed by the treating doctor.'),
        h('p',null,'Conditions recorded here — including any wounds or bedsores — were present at the time of this visit. Any tariff mentioned is an estimate; the final tariff is as per the admission agreement.'),
        h('p',null,'Personal and health details are used only for the person’s care and kept confidential by Samara.')),
      h('section',{className:'spot-sign'},
        h('div',null,h('p',null,'Assessed by (name & signature)'),h('p',null,`${data.assessor_name||''}`),h('p',null,'Date: ______________')),
        h('div',null,h('p',null,'Person / family representative (name, relationship & signature)'),h('p',null,' '),h('p',null,'Date: ______________'))),
      h('p',null,`Last saved by ${record?.updated_by_name||'—'} · ${record?.updated_at?stampText(record.updated_at): 'Not saved'}`)):null;
    return h('div',{className:'spot-assessment'},h('style',null,`
      .spot-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.spot-wide{grid-column:1/-1}
      .spot-assessment input,.spot-assessment select,.spot-assessment textarea{width:100%;box-sizing:border-box}.spot-assessment textarea{resize:vertical}
      .spot-assessment .spot-subhead{font-weight:700;color:#8b124d;border-top:1px dashed #ead4df;padding-top:10px;margin-top:2px}
      .spot-assessment .spot-tick{display:flex!important;align-items:center;gap:10px;min-height:40px;font-weight:600;cursor:pointer}
      .spot-assessment .spot-tick input{width:18px!important;height:18px!important;flex:0 0 18px;accent-color:#b01264;appearance:auto!important;-webkit-appearance:checkbox!important}
      .spot-assessment .spot-reviews{margin:4px 0 8px;padding-left:18px}.spot-assessment .spot-reviews li{margin-bottom:6px;white-space:pre-wrap}
      .spot-assessment .spot-legacy dl{margin:0}.spot-assessment .spot-legacy dl>div{display:grid;grid-template-columns:40% 60%;gap:8px;border-bottom:1px solid #f1e3ea;padding:5px 0}.spot-assessment .spot-legacy dt{font-weight:600}.spot-assessment .spot-legacy dd{margin:0;white-space:pre-wrap}
      .spot-assessment .spot-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 18px}
      .spot-assessment .spot-checks label{display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:10px!important;min-height:44px;margin:0!important;padding:6px 0!important;font-size:14px!important;font-weight:500!important;line-height:1.4;cursor:pointer;min-width:0}
      .spot-assessment .spot-checks input[type=checkbox]{appearance:auto!important;-webkit-appearance:checkbox!important;display:inline-block!important;box-sizing:border-box!important;width:18px!important;height:18px!important;min-width:18px!important;min-height:18px!important;max-width:18px!important;max-height:18px!important;flex:0 0 18px!important;padding:0!important;margin:0!important;border-radius:3px!important;box-shadow:none!important;transform:none!important;accent-color:#b01264;cursor:pointer}
      .spot-assessment .spot-checks label:focus-within{outline:2px solid #b01264;outline-offset:2px;border-radius:4px}
      @media(max-width:600px){.spot-assessment .spot-checks{grid-template-columns:1fr;gap:2px}}
      .spot-actions{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.spot-assessment fieldset{border:1px solid #ead4df;border-radius:12px;padding:16px;margin:16px 0;min-width:0}
      .spot-assessment legend{font-weight:750;color:#8b124d;padding:0 7px}.spot-wound{background:#fff8fb;border:1px solid #efdbe4;border-radius:10px;padding:12px;margin:12px 0}
      .spot-print{display:none}.spot-assessment .spot-save-bar{position:static;clear:both;padding:12px;background:#fff9fc;border:1px solid #ead4df;border-radius:12px}
      @media(max-width:700px){.spot-grid{grid-template-columns:1fr}.spot-actions .btn{flex:1 1 140px}.spot-assessment fieldset{padding:12px}.spot-assessment .spot-legacy dl>div{grid-template-columns:1fr}}
      @media print{body *{visibility:hidden}.spot-print,.spot-print *{visibility:visible}.spot-print{display:block;position:absolute;left:0;top:0;width:100%;color:#000;background:white;padding:14px;box-sizing:border-box;font:11pt Arial}.spot-print h1{font-size:18pt}.spot-print h2{font-size:13pt;margin-top:18px}.spot-print dl{margin:0}.spot-print dl>div{display:grid;grid-template-columns:36% 64%;border-bottom:1px solid #ddd;padding:5px 0;break-inside:avoid}.spot-print dt{font-weight:bold}.spot-print dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.spot-print .spot-sign{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:28px}.spot-print .spot-sign div{border-top:1px solid #000;padding-top:6px}.spot-editor,.spot-register,.spot-screen{display:none!important}}
    `),h('div',{className:'spot-screen'},h('h3',null,'Spot Assessment'),h('p',null,'Record observations during a visit. All logged-in ERP staff can create, view and update assessments.')),
    !data&&error?h('div',{className:'message error spot-screen',role:'alert'},error):null,!data&&notice?h('div',{className:'message success spot-screen',role:'status'},notice):null,
    data?h('div',{className:'card panel spot-editor'},h('div',{className:'spot-actions'},button('Back to register',()=>{if(canLeave()){setData(null);setRecord(null);setDirty(false);setError('');setNotice('');setReviewDraft('')}}),button('Print / Save PDF',()=>window.print()),canAdmit&&record?button(data?.converted_admission?'Convert to Guest again':'Convert to Guest (Start Admission)',convertToGuest,true):null),
      data?.converted_admission?h('div',{className:'message success'},`Admission started from this assessment by ${data.converted_admission.started_by||'staff'} on ${stampText(data.converted_admission.started_at)}.`):null,
      canAdmit&&!record?h('p',{className:'small-note'},'After saving, use Convert to Guest to start the admission with these details already filled.'):null,
      h('p',null,`${record?.status||'New draft'}${dirty?' · Unsaved changes':''}${record?` · Last saved by ${record.updated_by_name||'staff'}`:''}`),
      h('p',null,'* Person name and visit date are required to save a draft. Complete the observations, Contact 1 and the summary before marking it completed.'),
      h('form',{onSubmit:e=>{e.preventDefault();save('Draft')}},sections.map(section=>h('fieldset',{key:section.title,disabled:busy},h('legend',null,section.title),h('div',{className:'spot-grid'},section.fields.filter(f=>visible(f,data)).map(field=>control(field,data,change))),
        isCareSection(section.title)&&woundOpen?h('div',null,h('div',{className:'spot-subhead'},'Wound / bedsore details'),(data.wounds||[]).map((w,index)=>h('div',{className:'spot-wound',key:index},h('h4',null,`Wound / bedsore ${index+1}`),h('div',{className:'spot-grid'},woundFields.map(field=>control(field,w,(key,value)=>change('wounds',data.wounds.map((old,i)=>i===index?{...old,[key]:value}:old)),`spot-wound-${index}`))),button('Remove this wound entry',()=>{if(window.confirm('Remove this wound entry?'))change('wounds',data.wounds.filter((_,i)=>i!==index))}))),button('Add wound / bedsore details',()=>change('wounds',[...(data.wounds||[]),{}]))):null)),
        legacy.length?h('fieldset',{className:'spot-legacy'},h('legend',null,'Earlier format details (read only)'),h('p',{className:'small-note'},'Recorded in the older 8-section form. Kept as they were and printed with the assessment.'),h('dl',null,legacy.map(([k,v])=>h('div',{key:k},h('dt',null,k),h('dd',null,v))))):null,
        h('div',{className:'spot-actions spot-save-bar'},error?h('div',{className:'message error',role:'alert',style:{width:'100%'}},error):null,notice?h('div',{className:'message success',role:'status',style:{width:'100%'}},notice):null,button(busy?'Saving…':record?.status==='Completed'?'Save as draft':'Save draft',()=>save('Draft')),button('Save completed assessment',()=>save('Completed'),true)))):
      h('div',{className:'card panel spot-register'},h('div',{className:'spot-actions'},button('New Spot Assessment',create,true),button('Refresh',()=>{setError('');load()})),
        h('div',{className:'spot-grid'},h('div',{className:'field'},h('label',{htmlFor:'spot-search'},'Search person or visiting staff'),h('input',{id:'spot-search',value:search,onChange:e=>setSearch(e.target.value)})),h('div',{className:'field'},h('label',{htmlFor:'spot-status'},'Status'),h('select',{id:'spot-status',value:filter,onChange:e=>setFilter(e.target.value)},['All','Draft','Completed'].map(s=>h('option',{key:s},s))))),
        loading?h('p',{role:'status'},'Loading assessments…'):h('p',null,`${list.length} assessment(s)`),
        h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Person','Visit date','Visiting staff','Status','Action'].map(x=>h('th',{key:x},x)))),h('tbody',null,list.map(row=>h('tr',{key:row.id,style:{cursor:'pointer'},onClick:e=>{if(!e.target.closest('button'))open(row.id)}},h('td',null,row.person_name),h('td',null,fmtDate(row.visit_date)),h('td',null,row.assessor_name||'—'),h('td',null,row.status,row.converted?h('div',{className:'small-note'},'→ Admission started'):null),h('td',null,button('Open assessment',()=>open(row.id)))))))),
        !loading&&!error&&!list.length?h('p',{className:'empty'},'No assessments found. Use New Spot Assessment to record a visit.'):null),printable);
  };
})();

