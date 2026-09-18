/* Samara Spot Assessment: visit records for authenticated ERP staff. */
(() => {
  'use strict';
  const assistance=['Independent','Minimal assistance','Full assistance','Not assessed'];
  const yesNo=['No','Yes','Not assessed'];
  const fields=(...items)=>items.map(([key,label,type='text',options])=>({key,label,type,options}));
  const sections=[
    {title:'1. Visit and caller details',fields:fields(
      ['visit_date','Visit date','date'],['visit_time','Visit time','time'],['assessor_name','Visiting staff / assessor'],
      ['assessor_designation','Designation'],['visit_address','Visit address','textarea'],['visit_location','Current location','select',['Home','Hospital','Old age home','Other']],
      ['hospital_name','Hospital / facility name'],['caller_name','Caller / contact name'],['caller_relationship','Relationship to person'],['caller_phone','Contact phone','tel'],
      ['lead_reference','Enquiry / lead reference (if available)'],['information_source','Information provided by'],['assessment_consent','Permission for assessment','select',['Obtained from person','Obtained from representative','Not obtained','Not recorded']])},
    {title:'2. Person and family information',fields:fields(
      ['person_name','Person’s full name'],['age','Age (years)','number'],['gender','Gender','select',['Female','Male','Other','Prefer not to say']],
      ['person_phone','Person’s phone','tel'],['home_address','Home address','textarea'],['language','Preferred language'],
      ['family_name','Primary family contact'],['family_relationship','Family relationship'],['family_phone','Family phone','tel'],
      ['emergency_name','Emergency contact'],['emergency_phone','Emergency phone','tel'],['living_arrangement','Current living / support arrangement','textarea'])},
    {title:'3. General condition and health history',fields:fields(
      ['general_condition','General condition / appearance','textarea'],['current_ailments','Current ailments / known diagnoses','textarea'],
      ['recent_hospitalisation','Recent hospitalisation / surgery','textarea'],['treating_doctor','Treating doctor / hospital'],
      ['allergies','Known allergies / not known','textarea'],['medications','Current medicines and assistance needed','textarea'],
      ['consciousness','Alertness / communication','select',['Alert and communicates','Drowsy','Confused','Limited communication','Unresponsive','Not assessed']],
      ['cognition','Memory, orientation and behaviour observations','textarea'],['pain','Pain reported / location / severity','textarea'],
      ['blood_pressure','Blood pressure, if measured'],['pulse','Pulse / minute, if measured'],['temperature','Temperature and unit, if measured'],['oxygen_saturation','SpO2 %, if measured'],
      ['general_notes','Other observations','textarea'])},
    {title:'4. Mobility and daily activities',fields:fields(
      ['mobility','Mobility','select',['Walks independently','Walks with assistance','Walker / walking aid','Wheelchair','Bedbound','Not assessed']],
      ['transferring','Bed / chair transfer','select',assistance],['bathing','Bathing / dressing','select',assistance],
      ['toileting','Toileting','select',assistance],['feeding','Feeding assistance','select',assistance],
      ['feeding_route','Feeding route','select',['Oral','NG / Ryles tube','PEG','Other','Not assessed']],
      ['continence','Continence','select',['Continent','Urinary incontinence','Bowel incontinence','Both','Catheter','Not assessed']],
      ['falls_history','Recent falls / balance concerns','textarea'],['mobility_notes','Positioning, transfer aids and other support','textarea'],
      ['medication_support','Medication support','select',['Self-administered','Supervised','Fully administered','Not assessed']])},
    {title:'5. Skin, wounds and bedsores',fields:fields(
      ['skin_condition','General skin condition','textarea'],['wounds_present','Wounds present?','select',yesNo],
      ['bedsores_present','Bedsores / pressure injuries present?','select',yesNo],
      ['skin_notes','Skin care, dressings and existing care instructions','textarea'])},
    {title:'6. Nutrition, breathing and equipment',fields:fields(
      ['diet','Diet / food consistency / restrictions','textarea'],['swallowing','Swallowing concerns','select',yesNo],
      ['nutrition_notes','Appetite, hydration and nutrition observations','textarea'],
      ['airway','Breathing support','select',['Room air','Oxygen','Tracheostomy','BiPAP / CPAP','Other','Not assessed']],
      ['respiratory_notes','Existing breathing support / prescribed settings','textarea'],
      ['consumables','Daily consumables','checks',['Diapers','Underpads','Gloves','Wet wipes','Dressing supplies','Feeding supplies']],
      ['services','Other services / equipment needed','checks',['Physiotherapy','Speech therapy','Doctor review','Psychiatrist assessment','Lab tests','Air mattress','Oxygen cylinder / concentrator','Suction apparatus','Wound dressing']],
      ['equipment_notes','Other equipment / service requirements','textarea'])},
    {title:'7. Stay preferences and assessment summary',fields:fields(
      ['stay_type','Stay requirement','select',['Short stay (up to 1 month)','Long stay (over 1 month)','Couple stay','Attender stay','Undecided']],
      ['preferred_centre','Preferred centre / location'],['care_requirements','Care requirements','checks',['Respite care','Post-hospital / post-surgery care','Palliative / end-of-life care','Dementia care','General assisted living']],
      ['care_level','Proposed level of care','select',['To be reviewed','Level 1','Level 2','Level 3 / one-to-one care']],
      ['planned_admission','Proposed admission date','date'],['tariff_notes','Tariff discussed / quotation reference','textarea'],
      ['summary','Assessment summary and recommended follow-up','textarea'],['followup_date','Follow-up date','date'],
      ['review_required','Further review required from','checks',['Client relationship manager','Centre manager','Nursing head','Resident doctor']],
      ['additional_notes','Additional information','textarea'])},
    {title:'8. Admission review notes',fields:fields(
      ['relationship_review','Client relationship manager — name / review notes','textarea'],['centre_review','Centre manager — name / review notes','textarea'],
      ['nursing_review','Nursing head — name / review notes','textarea'],['doctor_review','Resident doctor — name / review notes','textarea'])}
  ];
  const woundFields=fields(['kind','Type','select',['Wound','Bedsore / pressure injury','Other']],['location','Body location'],['size','Size / depth if measured'],['appearance','Appearance / discharge / surrounding skin'],['stage','Stage if documented by qualified clinician'],['dressing','Current dressing / care instructions']);
  function initial(name='',designation=''){
    const now=new Date();const date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    return {visit_date:date,assessor_name:name,assessor_designation:designation,wounds:[]};
  }
  function validate(data,status){
    if(!String(data.person_name||'').trim())return 'Enter the person’s full name.';
    if(!data.visit_date)return 'Enter the visit date.';
    if(data.age!==''&&data.age!=null&&(!Number.isInteger(Number(data.age))||Number(data.age)<0||Number(data.age)>130))return 'Enter an age between 0 and 130, or leave it blank.';
    if(status==='Completed'){
      for(const [key,label] of [['assessor_name','visiting staff name'],['visit_address','visit address'],['general_condition','general condition'],['mobility','mobility assessment'],['wounds_present','wound assessment'],['bedsores_present','bedsore assessment'],['summary','assessment summary']]){
        if(!String(data[key]||'').trim())return `Enter the ${label} before completing the assessment.`;
      }
      if((data.wounds_present==='Yes'||data.bedsores_present==='Yes')&&!(data.wounds||[]).some(w=>String(w.location||'').trim()))return 'Add a body location in the wound / bedsore details.';
    }
    return '';
  }
  window.SamaraSpotAssessmentModel={sections,woundFields,initial,validate};
  window.SamaraSpotAssessment=function SpotAssessment({profile,client}){
    const R=window.React,h=R.createElement;
    const [rows,setRows]=R.useState([]),[record,setRecord]=R.useState(null),[data,setData]=R.useState(null),[dirty,setDirty]=R.useState(false);
    const [busy,setBusy]=R.useState(false),[loading,setLoading]=R.useState(false),[error,setError]=R.useState(''),[notice,setNotice]=R.useState(''),[search,setSearch]=R.useState(''),[filter,setFilter]=R.useState('All');
    const saving=R.useRef(false);
    async function load(){
      setLoading(true);
      try{
        const result=[];
        for(let offset=0;;offset+=500){
          const response=await client.from('spot_assessments').select('id,person_name,visit_date,status,assessor_name,updated_at,updated_by_name,version').order('visit_date',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499);
          if(response.error)throw response.error;
          result.push(...(response.data||[]));
          if((response.data||[]).length<500)break;
        }
        setRows(result);
      }catch(e){setError(`Unable to load Spot Assessments. ${e.message||e}`)}finally{setLoading(false)}
    }
    R.useEffect(()=>{load()},[]);
    R.useEffect(()=>{
      if(!dirty)return;
      const warn=e=>{e.preventDefault();e.returnValue=''};
      const nav=e=>{if(e.target?.closest?.('.sidebar button,.mobile-drawer button,.mobile-home-button,.nursing-quick-actions button')&&!window.confirm('Discard unsaved Spot Assessment changes?')){e.preventDefault();e.stopPropagation()}};
      window.addEventListener('beforeunload',warn);document.addEventListener('click',nav,true);
      return ()=>{window.removeEventListener('beforeunload',warn);document.removeEventListener('click',nav,true)};
    },[dirty]);
    function change(key,value){setData(old=>({...old,[key]:value}));setDirty(true);setNotice('')}
    function canLeave(){return !dirty||window.confirm('Discard unsaved Spot Assessment changes?')}
    function create(){if(!canLeave())return;setRecord(null);setData(initial(profile?.full_name||'',profile?.designation||profile?.employee_designation||profile?.job_title||profile?.position||profile?.role||''));setDirty(false);setError('');setNotice('')}
    async function open(id){
      if(!canLeave()||saving.current)return;
      setBusy(true);setError('');setNotice('');
      try{
        const result=await client.from('spot_assessments').select('*').eq('id',id).single();
        if(result.error)throw result.error;
        setRecord(result.data);setData({...result.data.details,wounds:result.data.details?.wounds||[]});setDirty(false);
      }catch(e){setError(`Unable to open assessment: ${e.message||e}`)}finally{setBusy(false)}
    }
    async function save(status){
      if(saving.current)return;
      const issue=validate(data,status);if(issue){setError(issue);return}
      saving.current=true;setBusy(true);setError('');setNotice('');
      try{
        const payload={person_name:data.person_name.trim(),visit_date:data.visit_date,assessor_name:String(data.assessor_name||'').trim(),status,details:data};
        let query=record?client.from('spot_assessments').update(payload).eq('id',record.id).eq('version',record.version):client.from('spot_assessments').insert(payload);
        const result=await query.select('*').maybeSingle();
        if(result.error)throw result.error;
        if(!result.data)throw new Error('Another staff member changed this assessment. Your entries are still on screen. Copy any needed changes, then return to the register and reopen the latest record.');
        setRecord(result.data);setData({...result.data.details,wounds:result.data.details?.wounds||[]});setDirty(false);setNotice(`Assessment saved as ${status}.`);await load();
      }catch(e){setError(`Unable to save: ${e.message||e}`)}finally{saving.current=false;setBusy(false)}
    }
    function control(field,values,onChange,prefix='spot'){
      const id=`${prefix}-${field.key}`,value=values[field.key]??'';
      const identity=['assessor_name','assessor_designation'].includes(field.key);
      const voice=!identity&&['text','textarea'].includes(field.type)&&!['lead_reference','blood_pressure','pulse','temperature','oxygen_saturation','size','stage'].includes(field.key);
      const props={id,name:id,value,onChange:e=>onChange(field.key,e.target.value),disabled:busy,readOnly:identity,'data-samara-voice':voice?'on':'off'};
      let input;
      if(field.type==='textarea')input=h('textarea',{...props,rows:3});
      else if(field.type==='select')input=h('select',props,h('option',{value:''},'Select / not recorded'),field.options.map(o=>h('option',{key:o,value:o},o)));
      else if(field.type==='checks')input=h('div',{className:'spot-checks',role:'group','aria-labelledby':`${id}-label`},field.options.map(o=>h('label',{key:o},h('input',{type:'checkbox',disabled:busy,checked:Array.isArray(value)&&value.includes(o),onChange:e=>onChange(field.key,e.target.checked?[...(Array.isArray(value)?value:[]),o]:(Array.isArray(value)?value:[]).filter(v=>v!==o))}),o)));
      else input=h('input',{...props,type:field.type,...(field.key==='age'?{min:0,max:130,step:1}:{})});
      return h('div',{className:`field ${['textarea','checks'].includes(field.type)?'spot-wide':''}`,key:field.key},h('label',{id:`${id}-label`,htmlFor:field.type==='checks'?undefined:id},field.label,['person_name','visit_date'].includes(field.key)?' *':''),input);
    }
    const list=rows.filter(row=>(filter==='All'||row.status===filter)&&`${row.person_name} ${row.assessor_name||''}`.toLowerCase().includes(search.toLowerCase()));
    const button=(label,click,primary=false)=>h('button',{type:'button',className:`btn ${primary?'btn-primary':'btn-secondary'}`,disabled:busy,onClick:click},label);
    const printable=data?h('article',{className:'spot-print'},h('h1',null,'Samara Care — Spot Assessment'),h('p',null,`${record?.id||'Unsaved assessment'} · ${dirty?'Unsaved changes':record?.status||'Draft'}`),sections.map(section=>h('section',{key:section.title},h('h2',null,section.title),h('dl',null,section.fields.map(field=>h('div',{key:field.key},h('dt',null,field.label),h('dd',null,Array.isArray(data[field.key])?data[field.key].join(', ')||'Not recorded':String(data[field.key]||'Not recorded'))))),section.title.startsWith('5.')?(data.wounds||[]).map((w,i)=>h('div',{key:i},h('h3',null,`Wound / bedsore ${i+1}`),h('dl',null,woundFields.map(field=>h('div',{key:field.key},h('dt',null,field.label),h('dd',null,w[field.key]||'Not recorded')))))):null)),h('p',null,`Last saved by ${record?.updated_by_name||'—'} · ${record?.updated_at?window.SamaraDateTime.dateTime(record.updated_at): 'Not saved'}`)):null;
    return h('div',{className:'spot-assessment'},h('style',null,`
      .spot-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.spot-wide{grid-column:1/-1}
      .spot-assessment input,.spot-assessment select,.spot-assessment textarea{width:100%;box-sizing:border-box}.spot-assessment textarea{resize:vertical}
      .spot-assessment .spot-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 18px}
      .spot-assessment .spot-checks label{display:flex!important;align-items:center!important;justify-content:flex-start!important;gap:10px!important;min-height:44px;margin:0!important;padding:6px 0!important;font-size:14px!important;font-weight:500!important;line-height:1.4;cursor:pointer;min-width:0}
      .spot-assessment .spot-checks input[type=checkbox]{appearance:auto!important;-webkit-appearance:checkbox!important;display:inline-block!important;box-sizing:border-box!important;width:18px!important;height:18px!important;min-width:18px!important;min-height:18px!important;max-width:18px!important;max-height:18px!important;flex:0 0 18px!important;padding:0!important;margin:0!important;border-radius:3px!important;box-shadow:none!important;transform:none!important;accent-color:#b01264;cursor:pointer}
      .spot-assessment .spot-checks label:focus-within{outline:2px solid #b01264;outline-offset:2px;border-radius:4px}
      @media(max-width:600px){.spot-assessment .spot-checks{grid-template-columns:1fr;gap:2px}}
      .spot-actions{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.spot-assessment fieldset{border:1px solid #ead4df;border-radius:12px;padding:16px;margin:16px 0;min-width:0}
      .spot-assessment legend{font-weight:750;color:#8b124d;padding:0 7px}.spot-wound{background:#fff8fb;border:1px solid #efdbe4;border-radius:10px;padding:12px;margin:12px 0}
      .spot-print{display:none}.spot-save-bar{position:sticky;bottom:0;padding:12px;background:#fff9fc;border:1px solid #ead4df;border-radius:12px;z-index:5}
      @media(max-width:700px){.spot-grid{grid-template-columns:1fr}.spot-actions .btn{flex:1 1 140px}.spot-assessment fieldset{padding:12px}}
      @media print{body *{visibility:hidden}.spot-print,.spot-print *{visibility:visible}.spot-print{display:block;position:absolute;left:0;top:0;width:100%;color:#000;background:white;padding:14px;box-sizing:border-box;font:11pt Arial}.spot-print h1{font-size:18pt}.spot-print h2{font-size:13pt;margin-top:18px}.spot-print dl{margin:0}.spot-print dl>div{display:grid;grid-template-columns:36% 64%;border-bottom:1px solid #ddd;padding:5px 0;break-inside:avoid}.spot-print dt{font-weight:bold}.spot-print dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.spot-editor,.spot-register,.spot-screen{display:none!important}}
    `),h('div',{className:'spot-screen'},h('h3',null,'Spot Assessment'),h('p',null,'Record observations during a visit. All logged-in ERP staff can create, view and update assessments.')),
    !data&&error?h('div',{className:'message error spot-screen',role:'alert'},error):null,!data&&notice?h('div',{className:'message success spot-screen',role:'status'},notice):null,
    data?h('div',{className:'card panel spot-editor'},h('div',{className:'spot-actions'},button('Back to register',()=>{if(canLeave()){setData(null);setRecord(null);setDirty(false);setError('');setNotice('')}}),button('Print / Save PDF',()=>window.print())),
      h('p',null,`${record?.status||'New draft'}${dirty?' · Unsaved changes':''}${record?` · Last saved by ${record.updated_by_name||'staff'}`:''}`),
      h('p',null,'* Person name and visit date are required to save a draft. Complete the visit observations and summary before marking it completed.'),
      h('form',{onSubmit:e=>{e.preventDefault();save('Draft')}},sections.map(section=>h('fieldset',{key:section.title,disabled:busy},h('legend',null,section.title),h('div',{className:'spot-grid'},section.fields.map(field=>control(field,data,change))),
        section.title.startsWith('5.')?h('div',null,(data.wounds||[]).map((w,index)=>h('div',{className:'spot-wound',key:index},h('h4',null,`Wound / bedsore ${index+1}`),h('div',{className:'spot-grid'},woundFields.map(field=>control(field,w,(key,value)=>change('wounds',data.wounds.map((old,i)=>i===index?{...old,[key]:value}:old)),`spot-wound-${index}`))),button('Remove this wound entry',()=>{if(window.confirm('Remove this wound entry?'))change('wounds',data.wounds.filter((_,i)=>i!==index))}))),button('Add wound / bedsore details',()=>change('wounds',[...(data.wounds||[]),{}]))):null)),
        h('div',{className:'spot-actions spot-save-bar'},error?h('div',{className:'message error',role:'alert',style:{width:'100%'}},error):null,notice?h('div',{className:'message success',role:'status',style:{width:'100%'}},notice):null,button(busy?'Saving…':record?.status==='Completed'?'Save as draft':'Save draft',()=>save('Draft')),button('Save completed assessment',()=>save('Completed'),true)))):
      h('div',{className:'card panel spot-register'},h('div',{className:'spot-actions'},button('New Spot Assessment',create,true),button('Refresh',()=>{setError('');load()})),
        h('div',{className:'spot-grid'},h('div',{className:'field'},h('label',{htmlFor:'spot-search'},'Search person or visiting staff'),h('input',{id:'spot-search',value:search,onChange:e=>setSearch(e.target.value)})),h('div',{className:'field'},h('label',{htmlFor:'spot-status'},'Status'),h('select',{id:'spot-status',value:filter,onChange:e=>setFilter(e.target.value)},['All','Draft','Completed'].map(s=>h('option',{key:s},s))))),
        loading?h('p',{role:'status'},'Loading assessments…'):h('p',null,`${list.length} assessment(s)`),
        h('div',{className:'table-wrap'},h('table',null,h('thead',null,h('tr',null,['Person','Visit date','Visiting staff','Status','Action'].map(x=>h('th',{key:x},x)))),h('tbody',null,list.map(row=>h('tr',{key:row.id},h('td',null,row.person_name),h('td',null,row.visit_date),h('td',null,row.assessor_name||'—'),h('td',null,row.status),h('td',null,button('Open assessment',()=>open(row.id)))))))),
        !loading&&!error&&!list.length?h('p',{className:'empty'},'No assessments found. Use New Spot Assessment to record a visit.'):null),printable);
  };
})();
