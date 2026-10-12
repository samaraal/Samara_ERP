/* Samara Spot Assessment: visit records for authenticated ERP staff.
   2.16.24: simplified to 5 sections; every field now lands in the same Admission field.
   Old (8-section) records still open: values without a place in the new form show under
   "Earlier format details" (screen and print), nothing is lost. */
(() => {
  'use strict';
  const assistance=['Independent','Minimal assistance','Full assistance','Not assessed'];
  const yesNo=['No','Yes','Not assessed'];
  // Same lists as the Admission form, so values carry over exactly.
  const relationships=['Wife','Husband','Son','Daughter','Father','Mother','Brother','Sister','Son-in-law','Daughter-in-law','Grandson','Granddaughter','Nephew','Niece','Guardian','Caregiver','Friend'];
  const categories=['Short Stay','Respite Care','Post-Surgery','Rehabilitation','Stroke Recovery','Dementia Care','Parkinsonism','Palliative Care','Long-Term Assisted Living','Observation','Elderly Care'];
  const txt=v=>String(v==null?'':v).trim();
  const fields=(...items)=>items.map(([key,label,type='text',options,show])=>({key,label,type,options,show}));
  const atHospital=d=>['Hospital','Old age home','Other'].includes(d.visit_location);
  const callerSeparate=d=>d.caller_is_contact1===false||(d.caller_is_contact1==null&&!!txt(d.caller_name)&&txt(d.caller_name)!==txt(d.family_name));
  const onSupport=d=>!!d.airway&&!['Room air','Not assessed'].includes(d.airway);
  const sections=[
    {title:'1. Visit and enquiry',fields:fields(
      ['visit_date','Visit date','date'],['visit_time','Visit time','time'],
      ['assessor_name','Visiting staff / assessor'],['assessor_designation','Designation'],
      ['enquiry_id','Linked enquiry (optional)','enquiry'],
      ['visit_location','Where the person was seen','select',['Home','Hospital','Old age home','Other']],
      ['hospital_name','Hospital / facility name','text',null,atHospital],
      ['assessment_consent','Permission for assessment','select',['Obtained from person','Obtained from representative','Not obtained','Not recorded']])},
    {title:'2. Guest and family',fields:fields(
      ['person_name','Person’s full name'],['age','Age (years)','number'],['gender','Gender','select',['Female','Male','Other']],
      ['person_phone','Person’s own phone (if any)','tel'],
      ['home_address','Home address','textarea'],
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
      ['medications','Current medicines (note only — entered properly at Admission)','textarea'],
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
      ['care_notes','Other care notes (skin, positioning, equipment)','textarea'])},
    {title:'5. Decision and follow-up',fields:fields(
      ['patient_category','Care needed (same list as Admission)','select',categories],
      ['preferred_centre','Preferred centre / location'],
      ['care_level','Proposed level of care','select',['To be reviewed','Level 1','Level 2','Level 3 / one-to-one care']],
      ['planned_admission','Proposed admission date','date'],
      ['tariff_notes','Tariff discussed / quotation reference','textarea'],
      ['summary','Assessment summary and recommended follow-up','textarea'],
      ['followup_date','Follow-up date','date'],
      ['_reviews','Review notes','reviews'])}
  ];
  const woundFields=fields(['kind','Type','select',['Wound','Bedsore / pressure injury','Other']],['location','Body location'],['size','Size / depth if measured'],['appearance','Appearance / discharge / surrounding skin'],['stage','Stage if documented by qualified clinician'],['dressing','Current dressing / care instructions']);
  const legacyLabels={
    visit_address:'Visit address',lead_reference:'Enquiry / lead reference',information_source:'Information provided by',language:'Preferred language',
    general_notes:'Other observations',mobility_notes:'Positioning, transfer aids and other support',skin_condition:'General skin condition',
    bedsores_present:'Bedsores / pressure injuries present?',skin_notes:'Skin care, dressings and existing care instructions',
    nutrition_notes:'Appetite, hydration and nutrition observations',equipment_notes:'Other equipment / service requirements',
    stay_type:'Stay requirement',care_requirements:'Care requirements',review_required:'Further review required from',additional_notes:'Additional information',
    relationship_review:'Client relationship manager review',centre_review:'Centre manager review',nursing_review:'Nursing head review',doctor_review:'Resident doctor review'
  };
  const systemKeys=new Set(['wounds','reviews','converted_admission','enquiry_id','enquiry_label','caller_is_contact1','spot_id','compat_fields']);
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
  function initial(name='',designation=''){
    const now=new Date();const date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const time=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    return {visit_date:date,visit_time:time,assessor_name:name,assessor_designation:designation,caller_is_contact1:true,wounds:[],reviews:[]};
  }
  function validate(data,status){
    if(!txt(data.person_name))return 'Enter the person’s full name.';
    if(!data.visit_date)return 'Enter the visit date.';
    if(data.age!==''&&data.age!=null&&(!Number.isInteger(Number(data.age))||Number(data.age)<0||Number(data.age)>130))return 'Enter an age between 0 and 130, or leave it blank.';
    for(const [p,label] of [['family_phone','Contact 1'],['emergency_phone','Contact 2'],['person_phone','Person’s'],['caller_phone','Caller']]){
      const d=txt(data[p]).replace(/\D/g,'');
      if(d&&d.length<10)return `${label} phone looks incomplete — enter 10 digits or leave it blank.`;
    }
    if(status==='Completed'){
      for(const [key,label] of [['assessor_name','visiting staff name'],['home_address','home address'],['general_condition','general condition'],['mobility','mobility'],['wounds_present','wounds / bedsores answer'],['summary','assessment summary']]){
        // old records kept the address in “Visit address”
        if(key==='home_address'&&txt(data.visit_address))continue;
        if(!txt(data[key]))return `Enter the ${label} before completing the assessment.`;
      }
      if(!txt(data.family_name)||!txt(data.family_phone))return 'Enter Family Contact 1 name and phone before completing the assessment.';
      if((data.wounds_present==='Yes'||data.bedsores_present==='Yes')&&!(data.wounds||[]).some(w=>txt(w.location)))return 'Add a body location in the wound / bedsore details.';
    }
    return '';
  }
  window.SamaraSpotAssessmentModel={sections,woundFields,initial,validate,relationships,categories,legacyEntries};
  window.SamaraSpotAssessment=function SpotAssessment({profile,client,onNavigate,canAdmit}){
    const R=window.React,h=R.createElement;
    const [rows,setRows]=R.useState([]),[record,setRecord]=R.useState(null),[data,setData]=R.useState(null),[dirty,setDirty]=R.useState(false);
    const [busy,setBusy]=R.useState(false),[loading,setLoading]=R.useState(false),[error,setError]=R.useState(''),[notice,setNotice]=R.useState(''),[search,setSearch]=R.useState(''),[filter,setFilter]=R.useState('All');
    const [enquiries,setEnquiries]=R.useState(null),[reviewDraft,setReviewDraft]=R.useState('');
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
    R.useEffect(()=>{if(data)loadEnquiries()},[!!data]);
    R.useEffect(()=>{
      if(!dirty)return;
      const warn=e=>{e.preventDefault();e.returnValue=''};
      const nav=e=>{if(e.target?.closest?.('.sidebar button,.mobile-drawer button,.mobile-home-button,.nursing-quick-actions button')&&!window.confirm('Discard unsaved Spot Assessment changes?')){e.preventDefault();e.stopPropagation()}};
      window.addEventListener('beforeunload',warn);document.addEventListener('click',nav,true);
      return ()=>{window.removeEventListener('beforeunload',warn);document.removeEventListener('click',nav,true)};
    },[dirty]);
    function change(key,value){setData(old=>({...old,[key]:value}));setDirty(true);setNotice('')}
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
    function create(){if(!canLeave())return;setRecord(null);setData(initial(profile?.full_name||'',profile?.designation||profile?.employee_designation||profile?.job_title||profile?.position||profile?.role||''));setDirty(false);setError('');setNotice('');setReviewDraft('')}
    async function open(id){
      if(!canLeave()||saving.current)return;
      setBusy(true);setError('');setNotice('');setReviewDraft('');
      try{
        const result=await client.from('spot_assessments').select('*').eq('id',id).single();
        if(result.error)throw result.error;
        setRecord(result.data);setData({...result.data.details,wounds:result.data.details?.wounds||[]});setDirty(false);
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
        // 2.16.27: the database still checks two fields of the older form before a record can be Completed
        // (visit address, bedsores answer). Fill them from the new fields so Completed is accepted.
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
        if(typeof onNavigate==='function')onNavigate('Admissions');
      }catch(e){setError(`Unable to start admission: ${e.message||e}`)}finally{saving.current=false;setBusy(false)}
    }
    const fmtDate=v=>String(v||'').slice(0,10).split('-').reverse().join('-');
    const stampText=at=>window.SamaraDateTime?.dateTime?window.SamaraDateTime.dateTime(at):at;
    const tickOn=(values,key)=>values[key]===true||(values[key]==null&&!callerSeparate(values));
    function control(field,values,onChange,prefix='spot'){
      const id=`${prefix}-${field.key}`,value=values[field.key]??'';
      if(field.type==='note')return h('div',{className:'spot-wide spot-subhead',key:field.key},field.label);
      if(field.type==='tick')return h('label',{className:'spot-wide spot-tick',key:field.key},h('input',{type:'checkbox',disabled:busy,checked:tickOn(values,field.key),onChange:e=>onChange(field.key,e.target.checked)}),field.label);
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
      @media print{body *{visibility:hidden}.spot-print,.spot-print *{visibility:visible}.spot-print{display:block;position:absolute;left:0;top:0;width:100%;color:#000;background:white;padding:14px;box-sizing:border-box;font:11pt Arial}.spot-print h1{font-size:18pt}.spot-print h2{font-size:13pt;margin-top:18px}.spot-print dl{margin:0}.spot-print dl>div{display:grid;grid-template-columns:36% 64%;border-bottom:1px solid #ddd;padding:5px 0;break-inside:avoid}.spot-print dt{font-weight:bold}.spot-print dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.spot-editor,.spot-register,.spot-screen{display:none!important}}
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
