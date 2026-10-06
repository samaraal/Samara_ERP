  // 2.15.67: Samara Enquiry Register (Director's Office). One register for every admission enquiry:
  // Website / Family Portal and WhatsApp arrive automatically (SQL 196); STD (Akshi), Admin and Manager add
  // Walk-in / Phone enquiries, record follow-ups, set the next follow-up date, assign and close.
  // The old "Enquiries" page name opens this register too (dashboard tiles and saved links keep working).
  const ENQ_STATUSES=['New','Contacted','Visit / Assessment Scheduled','Estimate Sent','Bed Reserved','Admitted','Closed'];
  const ENQ_DONE=['Admitted','Converted to Admission','Closed'];
  const ENQ_MANUAL_SOURCES=['Walk-in','Phone call','Reference / Doctor','Hospital referral','Other'];
  const ENQ_CARE=['Assisted Living','Post-hospital recovery','Dementia care','Palliative / end-of-life care','Respite / short stay','Physiotherapy / rehabilitation','Tracheostomy / special nursing','Other'];
  const ENQ_ROOMS=['Single room','Twin sharing','Triple sharing','Not decided'];
  const ENQ_RELATIONS=['Son','Daughter','Spouse','Son-in-law','Daughter-in-law','Brother / Sister','Grandchild','Relative','Friend','Self','Other'];
  const ENQ_HEARD=['Google / Website','WhatsApp','Instagram / Facebook','Doctor referral','Hospital referral','Friend / family','Passing by','Newspaper / flyer','Other'];
  const ENQ_CLOSE_REASONS=['Chose another facility','Price / budget','Location / distance','Guest\'s condition not suitable','Family decided home care','No response after follow-ups','Guest passed away','Duplicate enquiry','Other'];
  const enqStatus=r=>{const s=String(r?.status||'New');return s==='Assessment Scheduled'?'Visit / Assessment Scheduled':s==='Converted to Admission'?'Admitted':s};
  const enqOpen=r=>!ENQ_DONE.includes(String(r?.status||'New'));
  const enqKey=v=>String(v||'').replace(/\D/g,'').slice(-10);
  const enqStatusTone={'New':['#fde7f1','#a40855'],'Contacted':['#e8f0fe','#1a4fa0'],'Visit / Assessment Scheduled':['#efe6fb','#5b2a9a'],'Estimate Sent':['#fff4d6','#7a5600'],'Bed Reserved':['#e2f5f3','#0e6b60'],'Admitted':['#e5f6ea','#1d6b35'],'Closed':['#eef0ef','#55605b']};
  const enqSourceTone=s=>/whatsapp/i.test(s||'')?['#e5f7ec','#167a3c']:/website|portal/i.test(s||'')?['#e8f0fe','#1a4fa0']:['#fdeee4','#9a4a12'];
  const enqPill=(text,[bg,fg])=>h('span',{className:'equip-pill',style:{background:bg,color:fg,fontWeight:600,whiteSpace:'nowrap'}},text);

  function EnquiryRegister({profile,onNavigate}){
    const canManage=['Admin','Manager','STD'].some(r=>hasDutyRole(profile,r));
    const isAdmin=hasDutyRole(profile,'Admin');
    const canAdmit=typeof allowedPagesForProfile==='function'&&allowedPagesForProfile(profile).includes('Admissions');
    const [rows,setRows]=React.useState(null),[staff,setStaff]=React.useState([]),[settings,setSettings]=React.useState(null),[msg,setMsg]=React.useState('');
    const [openId,setOpenId]=React.useState(null),[activity,setActivity]=React.useState([]),[form,setForm]=React.useState(null),[busy,setBusy]=React.useState(false);
    const [follow,setFollow]=React.useState({note:'',status:'',next:'',reason:''});
    const [chip,setChip]=React.useState(()=>{try{const v=sessionStorage.getItem('samara-enquiry-filter')||'';sessionStorage.removeItem('samara-enquiry-filter');return v==='active'?'Open':'All'}catch(_){return 'All'}});
    const [search,setSearch]=React.useState('');
    const [period,setPeriod]=React.useState('month'),[from,setFrom]=React.useState(''),[to,setTo]=React.useState(''),[source,setSource]=React.useState('All'),[assignee,setAssignee]=React.useState('All');
    const pa=useAppliedFilters({period,from,to,source,assignee});const PA=pa.applied;
    const [showSettings,setShowSettings]=React.useState(false),[defaultPick,setDefaultPick]=React.useState(''),[assignOpen,setAssignOpen]=React.useState(true);

    async function load(){
      try{
        const all=[];
        for(let offset=0;;offset+=500){
          const r=await client.from('pre_admission_enquiries').select('*').order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499);
          if(r.error)throw r.error;all.push(...(r.data||[]));if((r.data||[]).length<500)break;
        }
        setRows(all);
        const [p,s]=await Promise.all([
          client.from('profiles').select('id,full_name,role,is_active').in('role',['Admin','Manager','STD']),
          client.from('enquiry_settings').select('*').maybeSingle()
        ]);
        if(!p.error)setStaff((p.data||[]).filter(x=>x.is_active!==false).sort((a,b)=>String(a.full_name).localeCompare(String(b.full_name))));
        if(!s.error)setSettings(s.data||null);
        setMsg(s.error&&/enquiry_settings|does not exist|schema cache/i.test(s.error.message||'')?'Run supabase/sql/196_enquiry_register.sql in Supabase to switch on numbering, follow-ups, assignment and WhatsApp enquiries.':'');
      }catch(e){setRows(r=>r||[]);setMsg(e.message||'Unable to load enquiries.')}
    }
    async function loadActivity(id){
      const r=await client.from('enquiry_activity').select('*').eq('enquiry_id',id).order('created_at',{ascending:false});
      setActivity(r.error?[]:(r.data||[]));
    }
    React.useEffect(()=>{load();const ch=client.channel('enquiry-register-live').on('postgres_changes',{event:'*',schema:'public',table:'pre_admission_enquiries'},load).subscribe();return()=>client.removeChannel(ch)},[]);
    React.useEffect(()=>{
      // A notification / link for one enquiry opens just that enquiry.
      const openTarget=id=>{if(id){setOpenId(id);loadActivity(id)}};
      try{const id=sessionStorage.getItem('samara-open-enquiry-id');if(id){sessionStorage.removeItem('samara-open-enquiry-id');openTarget(id)}}catch(_){}
      const f=e=>openTarget(e?.detail?.id);window.addEventListener('samara-open-enquiry',f);return()=>window.removeEventListener('samara-open-enquiry',f);
    },[]);

    const nameOf=id=>staff.find(s=>s.id===id)?.full_name||'';
    const today=todayISOIndia();
    const bounds=(()=>{
      if(PA.period==='today')return [today,today];
      if(PA.period==='week')return [mondayOfWeek(today),today];
      if(PA.period==='lastmonth'){const d=new Date(`${today.slice(0,8)}01T12:00:00`);d.setMonth(d.getMonth()-1);const f=d.toISOString().slice(0,10);const e=new Date(`${today.slice(0,8)}01T12:00:00`);e.setDate(0);return [f,e.toISOString().slice(0,10)]}
      if(PA.period==='all')return ['0000-01-01','9999-12-31'];
      if(PA.period==='custom')return [PA.from||today,PA.to||today];
      return [today.slice(0,8)+'01',today];
    })();
    const dayOf=r=>{try{return new Date(new Date(r.created_at).getTime()+19800000).toISOString().slice(0,10)}catch(_){return String(r.created_at||'').slice(0,10)}}; // India date
    const due=r=>enqOpen(r)&&r.next_follow_up&&String(r.next_follow_up)<=today;
    const list=rows||[];
    // Follow-ups due are shown whatever the period, so nothing due is hidden by the date filter.
    const inPeriod=list.filter(r=>{const d=dayOf(r);return d>=bounds[0]&&d<=bounds[1]})
      .filter(r=>PA.source==='All'||(PA.source==='Manual'?ENQ_MANUAL_SOURCES.includes(r.source):String(r.source||'Website')===PA.source))
      .filter(r=>PA.assignee==='All'||(PA.assignee==='none'?!r.assigned_to:r.assigned_to===PA.assignee));
    const dueAll=list.filter(due);
    const counts={All:inPeriod.length,New:inPeriod.filter(r=>enqStatus(r)==='New').length,Open:inPeriod.filter(enqOpen).length,Due:dueAll.length,Admitted:inPeriod.filter(r=>enqStatus(r)==='Admitted').length,Closed:inPeriod.filter(r=>enqStatus(r)==='Closed').length};
    const base=chip==='Due'?dueAll:inPeriod;
    const q=search.trim().toLowerCase(),qd=q.replace(/\D/g,'');
    const shown=base.filter(r=>chip==='All'||chip==='Due'||(chip==='Open'?enqOpen(r):enqStatus(r)===chip))
      .filter(r=>q.length<2||[r.enquiry_no,r.patient_name,r.family_contact_name,r.care_type,r.current_location,r.special_requirements,r.source].join(' ').toLowerCase().includes(q)||(qd.length>=4&&String(r.family_contact_phone||'').replace(/\D/g,'').includes(qd)));
    const sources=[...new Set(list.map(r=>r.source||'Website'))].sort();
    const current=openId?list.find(r=>r.id===openId):null;

    function openRow(r){setOpenId(r.id);setFollow({note:'',status:'',next:'',reason:''});loadActivity(r.id)}
    function blankForm(){return {patient_name:'',age:'',family_contact_name:'',family_contact_phone:'+91 ',contact_relation:'',current_location:'',care_type:'',bed_preference:'',expected_admission_date:'',special_requirements:'',how_heard:'',source:'Walk-in',next_follow_up:'',assigned_to:settings?.default_assignee||''}}
    function editForm(r){return {id:r.id,patient_name:r.patient_name||'',age:r.website_age??'',family_contact_name:r.family_contact_name||'',family_contact_phone:r.family_contact_phone||'',contact_relation:r.contact_relation||'',current_location:r.current_location||'',care_type:r.care_type||r.reason_for_enquiry||'',bed_preference:r.bed_preference||'',expected_admission_date:r.expected_admission_date||'',special_requirements:r.special_requirements||'',how_heard:r.how_heard||'',source:r.source||''}}
    const duplicates=form&&enqKey(form.family_contact_phone).length===10?list.filter(r=>r.id!==form.id&&enqKey(r.family_contact_phone)===enqKey(form.family_contact_phone)):[];

    async function saveForm(){
      if(busy)return;
      if(!form.id&&duplicates.some(enqOpen)&&!window.confirm(`This mobile number already has an open enquiry (${duplicates.filter(enqOpen).map(d=>d.enquiry_no||d.patient_name).join(', ')}). Add a new enquiry anyway?`))return;
      setBusy(true);
      try{
        const {data,error}=await client.rpc('enq_save',{p:form});
        if(error)throw error;
        showSamaraActionToast('success',form.id?'Enquiry updated':'Enquiry added',`${data?.enquiry_no||''} · ${data?.patient_name||''}`);
        setForm(null);await load();if(data?.id){setOpenId(data.id);loadActivity(data.id)}
      }catch(e){showSamaraActionToast('error','Not saved',/enq_save|does not exist|schema cache/i.test(e.message||'')?'Run supabase/sql/196_enquiry_register.sql in Supabase first.':e.message)}
      finally{setBusy(false)}
    }
    async function saveFollow(){
      if(busy||!current)return;
      setBusy(true);
      try{
        const {error}=await client.rpc('enq_followup',{p_id:current.id,p_note:follow.note,p_status:follow.status||null,p_next_follow_up:follow.next||null,p_closed_reason:follow.reason||null});
        if(error)throw error;
        showSamaraActionToast('success','Follow-up saved',`${current.enquiry_no||current.patient_name}${follow.status?` · ${follow.status}`:''}`);
        setFollow({note:'',status:'',next:'',reason:''});await load();loadActivity(current.id);
      }catch(e){showSamaraActionToast('error','Not saved',e.message)}
      finally{setBusy(false)}
    }
    async function assign(userId){
      if(!current||!userId)return;
      const {error}=await client.rpc('enq_assign',{p_id:current.id,p_user:userId});
      if(error){showSamaraActionToast('error','Not assigned',error.message);return}
      showSamaraActionToast('success','Assigned',`${current.enquiry_no||''} → ${nameOf(userId)}`);await load();loadActivity(current.id);
    }
    async function saveDefault(){
      if(!defaultPick)return;
      const {data,error}=await client.rpc('enq_set_default_assignee',{p_user:defaultPick,p_assign_open:assignOpen});
      if(error){showSamaraActionToast('error','Not saved',error.message);return}
      showSamaraActionToast('success','Default person saved',`New enquiries go to ${data?.name}${data?.assigned_now?` · ${data.assigned_now} open enquiries assigned now`:''}`);
      setShowSettings(false);load();
    }
    function startAdmission(r){
      try{sessionStorage.setItem('samara-enquiry-admission',JSON.stringify({enquiry_id:r.id,enquiry_no:r.enquiry_no,full_name:/^not given$/i.test(r.patient_name||'')?'':r.patient_name,age:r.website_age,attendant_name:r.family_contact_name,attendant_phone:r.family_contact_phone}))}catch(_){}
      if(typeof onNavigate==='function')onNavigate('Admissions');
    }

    const field=(label,key,input)=>h('div',{className:'field'},h('label',null,label),input||h('input',{value:form[key]??'',onChange:e=>setForm({...form,[key]:e.target.value})}));
    const pick=(label,key,options,required)=>field(label+(required?' *':''),key,h('select',{value:form[key]??'',onChange:e=>setForm({...form,[key]:e.target.value})},h('option',{value:''},'— Select —'),options.map(o=>h('option',{key:o,value:o},o))));
    const chipBtn=(k,label)=>h('button',{key:k,type:'button',role:'tab','aria-selected':chip===k,className:chip===k?'active':'',onClick:()=>setChip(k)},`${label} (${counts[k]})`);

    return h('div',null,
      // ---- New / edit enquiry ----
      form&&h('div',{className:'modal-backdrop row-detail-backdrop',onClick:e=>{if(e.target===e.currentTarget&&!busy)setForm(null)}},
        h('div',{className:'card modal row-detail-modal',role:'dialog','aria-modal':'true'},
          h('div',{className:'panel-head'},h('div',null,h('h3',null,form.id?'Edit enquiry':'New enquiry'),h('small',null,form.id?'Change the details; the change is recorded in the timeline.':'Walk-in or phone enquiry. Website and WhatsApp enquiries come in automatically.')),h('button',{type:'button',className:'close',onClick:()=>setForm(null),'aria-label':'Close'},'×')),
          h('div',{className:'grid grid-2',style:{gap:'10px'}},
            !form.id&&pick('How did the enquiry come','source',ENQ_MANUAL_SOURCES,true),
            field('Guest name *','patient_name'),
            field('Guest age','age',h('input',{type:'number',min:0,max:120,value:form.age??'',onChange:e=>setForm({...form,age:e.target.value})})),
            field('Contact person name *','family_contact_name'),
            field('Contact mobile *','family_contact_phone',h('input',{type:'tel',value:form.family_contact_phone,onChange:e=>setForm({...form,family_contact_phone:e.target.value})})),
            pick('Relation to Guest','contact_relation',ENQ_RELATIONS),
            field('Guest is now at (home / hospital, area)','current_location'),
            pick('Care needed','care_type',ENQ_CARE),
            pick('Room preference','bed_preference',ENQ_ROOMS),
            field('Expected admission date','expected_admission_date',h(StrictDateInput,{value:form.expected_admission_date||'',onChange:e=>setForm({...form,expected_admission_date:e.target.value})})),
            pick('How they heard about Samara','how_heard',ENQ_HEARD),
            !form.id&&field('Next follow-up date','next_follow_up',h(StrictDateInput,{value:form.next_follow_up||'',onChange:e=>setForm({...form,next_follow_up:e.target.value})})),
            !form.id&&field('Assign to','assigned_to',h('select',{value:form.assigned_to||'',onChange:e=>setForm({...form,assigned_to:e.target.value})},h('option',{value:''},'Default person'),staff.map(s=>h('option',{key:s.id,value:s.id},`${s.full_name} (${s.role})`))))
          ),
          field('Condition / requirements / notes','special_requirements',h('textarea',{rows:3,value:form.special_requirements||'',onChange:e=>setForm({...form,special_requirements:e.target.value})})),
          duplicates.length?h('div',{className:'message info',style:{marginTop:'8px'}},`Same mobile number already in the register: ${duplicates.map(d=>`${d.enquiry_no||'—'} ${d.patient_name} (${enqStatus(d)}, ${formatDateIN(d.created_at)})`).join(' · ')}`):null,
          h('div',{className:'modal-bottom-actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setForm(null),disabled:busy},'Cancel'),h('button',{type:'button',className:'btn btn-primary',onClick:saveForm,disabled:busy},busy?'Saving…':form.id?'Save changes':'Add enquiry'))
        )
      ),
      // ---- One enquiry: details, follow-up, timeline ----
      current&&!form&&h(RowDetailModal,{title:`${current.enquiry_no||'Enquiry'} · ${current.patient_name||'Guest'}`,subtitle:`${current.source||'Website'} · received ${formatDateTimeIN(current.created_at)} · ${enqStatus(current)}`,onClose:()=>setOpenId(null),fields:[
          ['Guest',[current.patient_name,current.website_age?`${current.website_age} yrs`:''].filter(Boolean).join(' · ')],
          ['Contact',[current.family_contact_name,current.contact_relation].filter(Boolean).join(' · ')],['Mobile',current.family_contact_phone],
          ['Guest is now at',current.current_location],['Care needed',current.care_type||current.reason_for_enquiry],['Room preference',current.bed_preference],
          ['Expected admission',current.expected_admission_date?formatDateIN(current.expected_admission_date):''],['Heard about Samara',current.how_heard],
          ['Requirements / message',current.special_requirements],['Status',enqStatus(current)],['Next follow-up',current.next_follow_up?formatDateIN(current.next_follow_up):''],
          ['Closed reason',current.closed_reason],['Assigned to',nameOf(current.assigned_to)||(current.assigned_to?'—':'Not assigned')],['Added by',nameOf(current.created_by)]]},
        h('div',{className:'equip-actions',style:{flexWrap:'wrap',gap:'8px',margin:'10px 0'}},
          current.family_contact_phone&&h('a',{className:'btn btn-secondary',href:`tel:${String(current.family_contact_phone).replace(/[^\d+]/g,'')}`},'📞 Call'),
          current.family_contact_phone&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{try{sessionStorage.setItem('samara_whatsapp_folder','Admission Enquiries')}catch(_){}if(typeof onNavigate==='function')onNavigate('WhatsApp Inbox')}},'💬 WhatsApp Inbox'),
          canManage&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setForm(editForm(current))},'✎ Edit details'),
          canAdmit&&enqOpen(current)&&h('button',{type:'button',className:'btn btn-primary',onClick:()=>startAdmission(current)},'➜ Start Admission')
        ),
        canManage&&h('div',{className:'card',style:{padding:'12px',margin:'8px 0',border:'1px solid #ead0de'}},
          h('h4',{style:{margin:'0 0 8px'}},'Record follow-up'),
          h('div',{className:'grid grid-2',style:{gap:'10px'}},
            h('div',{className:'field'},h('label',null,'Change status to'),h('select',{value:follow.status,onChange:e=>setFollow({...follow,status:e.target.value})},h('option',{value:''},`No change (${enqStatus(current)})`),ENQ_STATUSES.filter(s=>s!=='New').map(s=>h('option',{key:s,value:s},s)))),
            follow.status==='Closed'?h('div',{className:'field'},h('label',null,'Reason for closing *'),h('select',{value:follow.reason,onChange:e=>setFollow({...follow,reason:e.target.value})},h('option',{value:''},'— Select —'),ENQ_CLOSE_REASONS.map(s=>h('option',{key:s,value:s},s))))
            :follow.status==='Admitted'?h('div',{className:'field'},h('small',null,'Use "Start Admission" to open the Admission form with these details.'))
            :h('div',{className:'field'},h('label',null,'Next follow-up date'),h(StrictDateInput,{value:follow.next,onChange:e=>setFollow({...follow,next:e.target.value})}))
          ),
          h('div',{className:'field'},h('label',null,'What was discussed / done *'),h('textarea',{rows:2,value:follow.note,placeholder:'e.g. Called son, explained packages, visit fixed for Saturday 11 AM',onChange:e=>setFollow({...follow,note:e.target.value})})),
          h('div',{style:{display:'flex',gap:'10px',alignItems:'center',flexWrap:'wrap'}},
            h('button',{type:'button',className:'btn btn-primary',disabled:busy||!follow.note.trim(),onClick:saveFollow},busy?'Saving…':'Save follow-up'),
            h('div',{className:'field',style:{margin:0}},h('select',{value:current.assigned_to||'','aria-label':'Assign to',onChange:e=>assign(e.target.value)},h('option',{value:''},'Assign to…'),staff.map(s=>h('option',{key:s.id,value:s.id},`${s.full_name} (${s.role})`))))
          )
        ),
        h('h4',{style:{margin:'12px 0 6px'}},'Timeline'),
        activity.length?h('div',{style:{display:'grid',gap:'6px'}},activity.map(a=>h('div',{key:a.id,style:{borderLeft:'4px solid #e7acc8',padding:'6px 10px',background:'#fff9fc',borderRadius:'8px'}},
          h('small',{style:{color:'#725d68'}},`${formatDateTimeIN(a.created_at)} · ${a.actor_name||'System'} · ${a.kind}${a.status_to&&a.kind!=='Created'?` → ${a.status_to}`:''}${a.next_follow_up?` · next follow-up ${formatDateIN(a.next_follow_up)}`:''}`),
          a.note&&h('div',null,a.note)))):h('p',{className:'small-note'},'No activity yet.')
      ),
      // ---- Admin: default person ----
      showSettings&&h('div',{className:'modal-backdrop row-detail-backdrop',onClick:e=>{if(e.target===e.currentTarget)setShowSettings(false)}},
        h('div',{className:'card modal row-detail-modal',role:'dialog','aria-modal':'true'},
          h('div',{className:'panel-head'},h('div',null,h('h3',null,'Default person for new enquiries'),h('small',null,'Every new enquiry (Website, WhatsApp, Walk-in, Phone) is assigned to this person and reminders go to them.')),h('button',{type:'button',className:'close',onClick:()=>setShowSettings(false)},'×')),
          h('div',{className:'field'},h('label',null,'Person'),h('select',{value:defaultPick,onChange:e=>setDefaultPick(e.target.value)},h('option',{value:''},'— Select —'),staff.map(s=>h('option',{key:s.id,value:s.id},`${s.full_name} (${s.role})`)))),
          h('label',{style:{display:'flex',gap:'8px',alignItems:'center',margin:'8px 0'}},h('input',{type:'checkbox',checked:assignOpen,onChange:e=>setAssignOpen(e.target.checked)}),'Also assign open enquiries that have nobody assigned'),
          h('div',{className:'modal-bottom-actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setShowSettings(false)},'Cancel'),h('button',{type:'button',className:'btn btn-primary',disabled:!defaultPick,onClick:saveDefault},'Save'))
        )
      ),
      h('div',{className:'stores-dash'},h(DashboardHero,{kicker:"DIRECTOR'S OFFICE",title:'Samara Enquiry Register',blurb:'Every admission enquiry in one place — Website and WhatsApp arrive automatically; Walk-in and Phone enquiries are added here. Tap a row to follow up.',onRefresh:load})),
      msg?h('div',{className:'message error'},msg):null,
      h(Section,{title:`Enquiries · ${PA.period==='all'?'All dates':`${formatDateIN(bounds[0])} – ${formatDateIN(bounds[1])}`}`,subtitle:`${shown.length} shown${settings?.default_assignee?` · new enquiries go to ${nameOf(settings.default_assignee)||'—'}`:' · no default person set'}`,
        actions:h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
          isAdmin&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setDefaultPick(settings?.default_assignee||'');setShowSettings(true)}},'⚙ Default person'),
          canManage&&h('button',{type:'button',className:'btn btn-primary',onClick:()=>setForm(blankForm())},'+ New Enquiry'))},
        h('div',{className:'cm-period-bar'},
          h('div',{className:'field'},h('label',null,'Received'),h('select',{value:period,onChange:e=>setPeriod(e.target.value)},[['today','Today'],['week','This Week'],['month','This Month'],['lastmonth','Last Month'],['all','All dates'],['custom','Selected period']].map(([v,l])=>h('option',{key:v,value:v},l)))),
          period==='custom'&&h('div',{className:'field'},h('label',null,'From'),h(StrictDateInput,{value:from,onChange:e=>setFrom(e.target.value)})),
          period==='custom'&&h('div',{className:'field'},h('label',null,'To'),h(StrictDateInput,{value:to,onChange:e=>setTo(e.target.value)})),
          h('div',{className:'field'},h('label',null,'Source'),h('select',{value:source,onChange:e=>setSource(e.target.value)},h('option',{value:'All'},'All sources'),h('option',{value:'Manual'},'Walk-in / Phone (manual)'),sources.map(s=>h('option',{key:s,value:s},s)))),
          h('div',{className:'field'},h('label',null,'Assigned to'),h('select',{value:assignee,onChange:e=>setAssignee(e.target.value)},h('option',{value:'All'},'Everyone'),h('option',{value:'none'},'Not assigned'),staff.map(s=>h('option',{key:s.id,value:s.id},s.full_name)))),
          h(ApplyFilterButton,{dirty:pa.dirty,onApply:pa.apply}),
          h('div',{className:'field',style:{flex:'1 1 220px'}},h('label',null,'Search'),h('input',{type:'search',value:search,onChange:e=>setSearch(e.target.value),placeholder:'Enquiry no, name, mobile, care'}))
        ),
        h('div',{className:'stores-mode-switch',role:'tablist',style:{marginBottom:'12px'}},chipBtn('All','All'),chipBtn('New','New'),chipBtn('Open','In progress'),chipBtn('Due','Follow-up due'),chipBtn('Admitted','Admitted'),chipBtn('Closed','Closed')),
        chip==='Due'&&h('small',{className:'small-note'},'Follow-ups due today or earlier — all dates, whatever period is selected.'),
        rows===null?h('div',{className:'stores-view-only',style:{padding:'20px',textAlign:'center'}},'Loading…'):
        shown.length?h('div',{className:'table-wrap'},h('table',{className:'table'},
          h('thead',null,h('tr',null,['Enquiry No','Received','Source','Guest','Contact','Care needed','Status','Next follow-up','Assigned to'].map(x=>h('th',{key:x},x)))),
          h('tbody',null,shown.map(r=>h('tr',{key:r.id,className:'row-clickable',role:'button',tabIndex:0,onClick:()=>openRow(r),onKeyDown:e=>{if(e.key==='Enter')openRow(r)}},
            h('td',null,h('strong',null,r.enquiry_no||'—')),
            h('td',null,formatDateTimeIN(r.created_at)),
            h('td',null,enqPill(r.source||'Website',enqSourceTone(r.source))),
            h('td',null,h('strong',null,r.patient_name||'—'),r.website_age?h('small',{style:{display:'block'}},`${r.website_age} yrs`):null),
            h('td',null,r.family_contact_name||'—',h('small',{style:{display:'block'}},r.family_contact_phone||'')),
            h('td',null,r.care_type||r.reason_for_enquiry||'—'),
            h('td',null,enqPill(enqStatus(r),enqStatusTone[enqStatus(r)]||enqStatusTone.Closed)),
            h('td',null,r.next_follow_up?h('span',{style:due(r)?{color:'#b2192d',fontWeight:700}:null},formatDateIN(r.next_follow_up)+(due(r)?' · due':'')):'—'),
            h('td',null,nameOf(r.assigned_to)||(r.assigned_to?'—':h('span',{className:'unit-warn'},'Not assigned')))
          )))
        )):h('div',{className:'stores-view-only',style:{padding:'20px',textAlign:'center'}},'No enquiries in this period / filter.')
      )
    );
  }
  // The old ADMISSION → "Enquiries" page name opens the same register.
  function Enquiries(props){return h(EnquiryRegister,props)}
