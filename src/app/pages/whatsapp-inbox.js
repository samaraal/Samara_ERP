  function WhatsAppInbox({profile}){
    const foodOnly=isNursingManagerProfile(profile);
    const leaveCover=Boolean(profile?.__dutyContext?.leave_cover);
    const Field=({label,required=false,children})=>h('div',{className:'field'},h('label',null,label,required?h('span',{style:{color:'#b42336',marginLeft:'4px'}},'*'):null),children);
    const [rows,setRows]=React.useState([]),[selectedPhone,setSelectedPhone]=React.useState(''),[query,setQuery]=React.useState(''),[showUnread,setShowUnread]=React.useState(false),[reply,setReply]=React.useState(''),[busy,setBusy]=React.useState(false),[message,setMessage]=React.useState(''),[isMobile,setIsMobile]=React.useState(()=>window.matchMedia('(max-width: 700px)').matches),[patientContext,setPatientContext]=React.useState(null),[mobileComposer,setMobileComposer]=React.useState('');
    const replyEditorRef=React.useRef(null);
    const chatScrollRef=React.useRef(null);
    const chatViewRef=React.useRef({key:null,followLatest:true});
    const chatShellRef=React.useRef(null);
    const renderChatShell=node=>isMobile&&selectedPhone?ReactDOM.createPortal(node,document.body):node;
    React.useEffect(()=>{
      if(!isMobile||!selectedPhone)return;
      const previous=document.body.style.overflow;
      document.body.style.overflow='hidden';
      const viewport=window.visualViewport;
      const resize=()=>{
        const shell=chatShellRef.current;if(!shell)return;
        shell.style.setProperty('--wa-viewport-height',(viewport?.height||window.innerHeight)+'px');
        shell.style.setProperty('--wa-viewport-top',(viewport?.offsetTop||0)+'px');
      };
      resize();viewport?.addEventListener('resize',resize);viewport?.addEventListener('scroll',resize);
      window.addEventListener('resize',resize);
      return()=>{document.body.style.overflow=previous;viewport?.removeEventListener('resize',resize);viewport?.removeEventListener('scroll',resize);window.removeEventListener('resize',resize)};
    },[isMobile,selectedPhone]);
    const [subjectFilter,setSubjectFilter]=React.useState('All Subjects');
    const [waFolder,setWaFolder]=React.useState(()=>{const folder=sessionStorage.getItem('samara_whatsapp_folder');sessionStorage.removeItem('samara_whatsapp_folder');return foodOnly?'All':folder==='Admission Enquiries'||String(profile?.role||'')==='STD'?'Admission Enquiries':'All';});
    const [dateFrom,setDateFrom]=React.useState('');
    const [dateTo,setDateTo]=React.useState('');
    const isSTD=String(profile?.role||'')==='STD';
    const WA_REOPEN_TEMPLATES=foodOnly?[{name:'samara_callback_request',label:'Food Vendor Callback',regarding:'food supply and delivery'}]:[
      {name:'samara_general_followup',label:'General Follow-up',regarding:'your assisted living enquiry'},
      {name:'samara_admission_followup',label:'Admission / Care Enquiry',regarding:'your family member'},
      {name:'samara_callback_request',label:'Callback Request',regarding:'your enquiry'}
    ];
    const [templateName,setTemplateName]=React.useState(foodOnly?'samara_callback_request':'samara_general_followup'),[templateLanguage]=React.useState('en'),[templateRegarding,setTemplateRegarding]=React.useState(foodOnly?'food supply and delivery':'your assisted living enquiry'),[mediaBusyId,setMediaBusyId]=React.useState('');
    const [showEmergency,setShowEmergency]=React.useState(false);
    const [emergencyType,setEmergencyType]=React.useState('hospital_transfer');
    const [emergencyPatient,setEmergencyPatient]=React.useState('');
    const [emergencyHospital,setEmergencyHospital]=React.useState('');
    const [emergencyTime,setEmergencyTime]=React.useState(()=>new Date().toISOString().slice(0,16));
    const [emergencyAttempt,setEmergencyAttempt]=React.useState('Called authorised attendant; no response.');
    const [emergencyBusy,setEmergencyBusy]=React.useState(false);
    const selectedTemplate=WA_REOPEN_TEMPLATES.find(t=>t.name===templateName)||WA_REOPEN_TEMPLATES[0];
    React.useEffect(()=>{setMobileComposer('')},[selectedPhone]);
    React.useEffect(()=>{
      const mq=window.matchMedia('(max-width: 700px)');
      const sync=()=>setIsMobile(mq.matches);
      sync();
      mq.addEventListener?.('change',sync);
      return()=>mq.removeEventListener?.('change',sync);
    },[]);
    React.useEffect(()=>{
      if(document.getElementById('samara-wa-mobile-style'))return;
      const style=document.createElement('style');style.id='samara-wa-mobile-style';
      style.textContent=`
        .wa-inbox-shell{display:grid;grid-template-columns:minmax(300px,.72fr) minmax(0,1.65fr);gap:0;align-items:stretch;border:1px solid #ead9df;border-radius:16px;overflow:hidden;background:#fff;min-height:640px}
        .wa-conversation-list{border-right:1px solid #e6d5dc;background:#fff;max-height:76vh;overflow-y:auto}
        .wa-chat-pane{min-width:0;display:flex;flex-direction:column;height:76vh;background:#efeae2}
        .wa-chat-head{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 14px;background:#f0f2f5;border-bottom:1px solid #ddd}
        .wa-mobile-back{display:none}
        .wa-chat-scroll{flex:1;padding:18px 22px;overflow-y:auto;background:linear-gradient(rgba(239,234,226,.94),rgba(239,234,226,.94));min-height:0}
        .wa-free-composer{padding:10px 12px;background:#f0f2f5;border-top:1px solid #ddd;display:flex;gap:8px;align-items:flex-end}
        .wa-template-composer{padding:10px 12px;background:#f0f2f5;border-top:1px solid #ddd}
        .wa-template-grid{display:grid;grid-template-columns:minmax(180px,.8fr) minmax(180px,1fr) auto;gap:8px;align-items:end}
        .wa-mobile-actions{display:none}
        @media(max-width:700px){
          .wa-inbox-shell{display:block!important;min-height:0!important;border-radius:12px!important;overflow:hidden!important}
          .wa-conversation-list{display:block!important;border-right:0!important;max-height:calc(100dvh - 250px)!important;min-height:420px!important}
          .wa-chat-pane{display:none!important;min-height:0!important;height:100%!important;max-height:100%!important}
          .wa-inbox-shell.wa-mobile-chat-open{position:fixed!important;top:var(--wa-viewport-top,0px)!important;left:0!important;right:0!important;width:100%!important;height:var(--wa-viewport-height,100dvh)!important;z-index:2147482000!important;border:0!important;border-radius:0!important;box-sizing:border-box!important;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}
          .wa-chat-head,.wa-mobile-actions,.wa-free-composer,.wa-template-composer,.wa-chat-status{flex-shrink:0}
          .wa-free-composer,.wa-template-composer{max-height:45%;overflow-y:auto}
          .wa-chat-status{padding:6px 10px;background:#fff8e4;font-size:12px;max-height:64px;overflow:auto}
          .wa-chat-scroll{overflow-anchor:none;touch-action:pan-y;overflow-wrap:anywhere}
          .wa-inbox-shell.wa-mobile-chat-open .wa-conversation-list{display:none!important}
          .wa-inbox-shell.wa-mobile-chat-open .wa-chat-pane{display:flex!important}
          .wa-chat-head{position:sticky;top:0;z-index:6;padding:8px 10px!important;min-height:58px!important}
          .wa-mobile-back{display:inline-grid!important;place-items:center;width:38px;height:38px;min-width:38px;border:0;border-radius:50%;background:#fff;color:#5d1039;font-size:24px;font-weight:800;cursor:pointer}
          .wa-chat-scroll{padding:10px 8px 12px!important;overscroll-behavior:contain!important}
          .wa-chat-scroll>div>div{max-width:88%!important;font-size:14px}
          .wa-free-composer{padding:10px!important;position:relative!important;z-index:7!important}
          .wa-free-composer textarea{min-height:44px!important;max-height:110px!important}
          .wa-free-composer .btn{min-width:72px!important;padding-left:12px!important;padding-right:12px!important}
          .wa-template-composer{padding:10px!important;position:relative!important;z-index:7!important}
          .wa-template-grid{grid-template-columns:1fr!important}
          .wa-template-grid .btn{width:100%!important}
          .wa-inbox-toolbar{gap:6px!important;margin-bottom:8px!important}
          .wa-inbox-toolbar input{flex:1 1 100%!important;min-width:0!important;width:100%!important}
          .wa-inbox-toolbar .btn{flex:1 1 calc(50% - 3px)!important;padding:10px 8px!important}
          .wa-inbox-status{font-size:12px!important;margin-bottom:8px!important}

          .wa-mobile-actions{display:flex!important;align-items:center;gap:8px;padding:8px 10px calc(8px + env(safe-area-inset-bottom));background:#f7f3f5;border-top:1px solid #dfd2d8;position:sticky;bottom:0;z-index:8}
          .wa-mobile-actions-status{min-width:0;flex:1;font-size:12px;font-weight:800;line-height:1.25;color:#5d1039}
          .wa-mobile-action-btn{min-height:42px;border:0;border-radius:11px;padding:9px 12px;font-weight:800;font-size:13px;white-space:nowrap;background:#087667;color:#fff}
          .wa-mobile-action-btn.secondary{background:#a5145a}
          .wa-mobile-composer-title{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;font-weight:800;color:#5d1039}
          .wa-mobile-composer-close{width:34px;height:34px;border:0;border-radius:50%;background:#fff;color:#5d1039;font-size:20px;font-weight:900}
          .wa-mobile-chat-open~*{} 
        }
      `;
      document.head.appendChild(style);
    },[]);
    function chooseReopenTemplate(name){
      const next=WA_REOPEN_TEMPLATES.find(t=>t.name===name)||WA_REOPEN_TEMPLATES[0];
      setTemplateName(next.name);setTemplateRegarding(next.regarding);
    }
    function templateReplyButtons(name){
      if(name==='samara_general_followup')return ['Admission Details','Request a Call','Our Location'];
      if(name==='samara_callback_request')return ['Please call me'];
      return [];
    }
    function reopenPreview(customer,regarding){
      if(templateName==='samara_admission_followup')return `Dear ${customer},
Greetings from Samara Assisted Living.
Thank you for contacting us regarding care and admission support for ${regarding}. Our team will be happy to understand your requirements and assist you further.
Please reply to this message to continue the conversation.

Thank you,
Samara Assisted Living`;
      if(templateName==='samara_callback_request')return `Dear ${customer},
Greetings from Samara Assisted Living.
We tried to reach you regarding ${regarding}. Please reply to this message or let us know a convenient time for our team to contact you.

Thank you,
Samara Assisted Living`;
      return `Dear ${customer},
Greetings from Samara Assisted Living.
We received your message regarding your assisted living enquiry.
Please reply to this message and our team will be happy to assist you.

Thank you,
Samara Assisted Living`;
    }
    const canUse=foodOnly||['Admin','Manager','HR','STD'].includes(String(profile?.role||''));
    async function repairLegacyInterviewHistory(rawRows){
      // v2.10.84: Repair legacy generic outbound WhatsApp rows for HR interviews.
      // IMPORTANT: the Inbox rendering must NOT depend on a database UPDATE succeeding.
      // Some deployed policies allow the row to be read but not rewritten. Therefore we
      // first enrich the row locally for immediate display, then only make a best-effort
      // database update so future sessions can benefit too.
      const rows=[...(rawRows||[])];
      const genericRow=r=>{
        if(String(r?.direction||'outbound').toLowerCase()==='inbound')return false;
        const content=String(r?.message_content||'').trim().toLowerCase();
        const comm=String(r?.communication_type||'').trim().toLowerCase();
        const template=String(r?.template_name||'').trim();
        return !template && (!content||content==='whatsapp api'||content==='whatsapp message'||comm==='whatsapp api'||comm==='whatsapp message');
      };
      const generic=rows.filter(genericRow);
      if(!generic.length)return rows;
      try{
        const {data:apps,error}=await client.from('career_applications')
          .select('id,application_id,title,applicant_name,mobile,whatsapp,designation,status,interview_at,interview_mode,interview_venue,updated_at,created_at');
        if(error||!apps?.length)return rows;
        const byPhone={};
        apps.forEach(a=>{
          const ph=normalizeWhatsAppRecipient(a.whatsapp||a.mobile||'');
          if(ph)(byPhone[ph]||(byPhone[ph]=[])).push(a);
        });
        for(const r of generic){
          const ph=normalizeWhatsAppRecipient(r.recipient_number||'');
          const candidates=(byPhone[ph]||[]).filter(a=>a.interview_at);
          if(!candidates.length)continue;
          const rt=new Date(r.sent_at||r.created_at||0).getTime();
          const ranked=candidates.map(a=>{
            const ut=new Date(a.updated_at||a.created_at||0).getTime();
            return {a,delta:Number.isFinite(rt)&&Number.isFinite(ut)?Math.abs(rt-ut):Number.MAX_SAFE_INTEGER};
          }).sort((x,y)=>x.delta-y.delta);
          // High-confidence rule: exact applicant phone and either a Career Application
          // currently marked Interview Scheduled, or its update is within 6 hours of the
          // generic WhatsApp row. This is deliberately wider than v2.10.83 because HR may
          // save/refresh the application again after the message was accepted by Meta.
          const best=ranked[0];
          if(!best)continue;
          const status=String(best.a.status||'').toLowerCase();
          if(status!=='interview scheduled' && best.delta>6*60*60*1000)continue;
          const a=best.a;
          const when=new Date(a.interview_at);
          if(Number.isNaN(when.getTime()))continue;
          const date=formatDateIN(when);
          const time=formatTimeIN(when);
          const mode=String(a.interview_mode||'In Person').trim()||'In Person';
          const venue=String(a.interview_venue||'').trim();
          let detail='';
          if(mode==='Online')detail=venue?`Online interview link: ${venue}`:'Online interview link will be shared by HR.';
          else if(mode==='Phone')detail='HR will contact you on your registered mobile number at the scheduled time.';
          else detail=`Venue: ${venue||'Samara Assisted Living, Mogappair, Chennai – 37'}. Please bring your relevant certificates and identification documents.`;
          const name=[a.title,a.applicant_name].filter(Boolean).join(' ').trim()||'Candidate';
          const designation=String(a.designation||'applied position').trim()||'applied position';
          const message=`Dear ${name},\n\nThank you for your interest in joining Samara Assisted Living.\n\nWe are pleased to invite you for an interview for the position of ${designation}.\n\nInterview Date: ${date}\nInterview Time: ${time}\nInterview Mode: ${mode}\n\n${detail}\n\nKindly be available about 10 minutes before the scheduled time.\n\nWe look forward to meeting you.\n\nRegards,\nDr. Chella Boomi\nDirector\nSamara Health Care LLP\nContact: 9976735577`;
          const patch={
            career_application_id:a.id,application_id:a.application_id||null,
            applicant_name:name,contact_name:name,source_type:'HR Applicant',
            communication_type:'Interview Scheduled',template_name:'samara_interview_scheduled',
            message_type:'template',message_content:message,
            message_payload:{body_params:[name,designation,date,time,mode,detail],legacy_repaired:true,display_repaired:true},
            updated_at:new Date().toISOString()
          };
          // Always repair the in-memory row first. This immediately fixes Inbox rendering
          // even where Supabase RLS prevents rewriting the historical generic record.
          const idx=rows.findIndex(x=>x.id===r.id);
          if(idx>=0)rows[idx]={...rows[idx],...patch};
          // Best-effort persistence only; failure must never undo the local repair.
          client.from('hr_whatsapp_communications').update(patch).eq('id',r.id)
            .then(({error:updateError})=>{if(updateError)console.warn('Historical WhatsApp row displayed correctly but could not be rewritten',updateError)})
            .catch(error=>console.warn('Historical WhatsApp persistence skipped safely',error));
        }
        return rows;
      }catch(error){console.warn('Legacy interview WhatsApp display repair failed safely',error);return rows}
    }
    async function load(showStatus=false){
      if(!canUse)return;
      if(showStatus)setMessage('Refreshing WhatsApp Inbox…');
      try{
        const data=[];
        for(let offset=0;;offset+=1000){
          const query=foodOnly?client.rpc('wa_food_inbox'):client.from('hr_whatsapp_communications').select('*');
          const page=await query.order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+999);
          if(page.error)throw page.error;
          data.push(...(page.data||[]));
          if((page.data||[]).length<1000)break;
        }
        const repaired=(foodOnly?(data||[]):await repairLegacyInterviewHistory(data||[]));
        setRows(repaired.slice().reverse());
        if(showStatus)setMessage(`✓ WhatsApp Inbox refreshed at ${formatTimeIN(new Date())}.`);
      }catch(error){
        setMessage(`Unable to refresh WhatsApp Inbox: ${error?.message||error}`);
      }
    }
    React.useEffect(()=>{
      load();
      const ch=client.channel('whatsapp-inbox-live').on('postgres_changes',{event:'*',schema:'public',table:'hr_whatsapp_communications'},load).subscribe();
      return()=>client.removeChannel(ch);
    },[]);
    React.useEffect(()=>{
      if(foodOnly){sessionStorage.removeItem('samara_patient_whatsapp_context');return;}
      let context=null;
      try{context=JSON.parse(sessionStorage.getItem('samara_patient_whatsapp_context')||'null')}catch(_error){}
      if(!context)return;
      const phone=normalizeWhatsAppRecipient(context.phone||'');
      if(!phone)return;
      setPatientContext({
        phone,
        patient_id:context.patient_id||null,
        patient_code:context.patient_code||null,
        patient_name:context.patient_name||'Patient',
        contact_name:context.contact_name||'Family Member'
      });
      setQuery('');setShowUnread(false);setSelectedPhone(phone);
      if(context.open_emergency){
        setEmergencyPatient(context.patient_name||'');
        setEmergencyHospital('');
        setEmergencyAttempt('Called authorised attendant; no response.');
        setEmergencyTime(new Date().toISOString().slice(0,16));
        setShowEmergency(true);
      }
      try{sessionStorage.removeItem('samara_patient_whatsapp_context')}catch(_error){}
    },[rows.length]);
    if(!canUse)return h(Section,{title:'WhatsApp Inbox'},h('p',{className:'empty'},'WhatsApp Inbox is available to authorised communication staff.'));
    const phoneOf=r=>normalizeWhatsAppRecipient(r.recipient_number||'');
    function patientLinkedMessage(row,context){
      if(!context)return true;
      if(phoneOf(row)!==context.phone)return false;
      const payload=row?.message_payload||{};
      const ids=[payload.patient_id,payload.patient_uuid,payload?.patient?.id,payload?.communication?.patient_id].filter(Boolean).map(String);
      const codes=[payload.patient_code,payload.patient_ref,payload.resident_id,payload?.patient?.patient_id,payload?.communication?.patient_code].filter(Boolean).map(String);
      const wantedId=String(context.patient_id||'');
      const wantedCode=String(context.patient_code||'');
      if(wantedId&&ids.includes(wantedId))return true;
      if(wantedCode&&codes.includes(wantedCode))return true;
      return false;
    }
    function stdAllowedRow(row){
      if(!isSTD)return true;
      if(row?.career_application_id||row?.application_id)return false;
      const template=String(row?.template_name||'').toLowerCase();
      if(template==='employee_welcome_samara')return false;
      const source=String(row?.source_type||'').toLowerCase();
      const comm=String(row?.communication_type||'').toLowerCase();
      if(/patient|family|emergency|hr applicant|employee/.test(source))return false;
      if(/payment|receipt|daily report|discharge|employee|emergency|family portal|patient/.test(comm))return false;
      return true;
    }
    function enquirySubject(msgs){
      const text=(msgs||[]).map(r=>`${r.message_content||''} ${r.communication_type||''} ${r.template_name||''}`).join(' ').toLowerCase();
      if(/admission|admit|care enquiry|assisted living|tracheost|bed|stay/.test(text))return 'Admission / Care';
      if(/call back|callback|request a call|please call|call me/.test(text))return 'Callback';
      if(/location|address|map|where are you|route/.test(text))return 'Location';
      if(/price|pricing|charge|charges|tariff|cost|fee|fees|package/.test(text))return 'Pricing / Charges';
      if(/service|facility|nursing|caregiver|physio|physiotherapy/.test(text))return 'Services';
      return 'General Enquiry';
    }
    const visibleRows=(patientContext?rows.filter(row=>patientLinkedMessage(row,patientContext)):rows).filter(stdAllowedRow);
    const groups={};
    visibleRows.forEach(r=>{const phone=phoneOf(r);if(!phone)return;(groups[phone]||(groups[phone]=[])).push(r)});
    const conversations=Object.entries(groups).map(([phone,msgs])=>{
      const sorted=[...msgs].sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
      const last=sorted[sorted.length-1]||{};
      const inbound=[...sorted].reverse().find(x=>x.direction==='inbound');
      const unread=sorted.filter(x=>x.direction==='inbound'&&!x.erp_read_at).length;
      const name=last.contact_name||last.applicant_name||inbound?.contact_name||inbound?.applicant_name||phone;
      const source=foodOnly&&!leaveCover?'Food Vendor':last.source_type||inbound?.source_type||(last.career_application_id?'HR Applicant':'Website / Public');
      const subject=enquirySubject(sorted);
      const folder=foodOnly&&!leaveCover?'Food Vendors':whatsAppFolder(isSTD?rows.filter(r=>phoneOf(r)===phone).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)):sorted);
      return {phone,msgs:sorted,last,name,source,subject,folder,unread,lastAt:last.created_at,hasInbound:Boolean(inbound)};
    }).filter(c=>!isSTD||(c.hasInbound&&c.folder!=='Payment Follow-ups')).sort((a,b)=>new Date(b.lastAt)-new Date(a.lastAt));
    const filtered=conversations.filter(c=>{
      if(waFolder!=='All'&&c.folder!==waFolder)return false;
      if(showUnread&&!c.unread)return false;
      if(isSTD&&subjectFilter!=='All Subjects'&&c.subject!==subjectFilter)return false;
      const lastDate=new Date(c.lastAt);
      if(isSTD&&dateFrom){
        const from=new Date(`${dateFrom}T00:00:00`);
        if(lastDate<from)return false;
      }
      if(isSTD&&dateTo){
        const to=new Date(`${dateTo}T23:59:59`);
        if(lastDate>to)return false;
      }
      const hay=`${c.name} ${c.phone} ${c.source} ${c.subject} ${c.msgs.map(r=>`${r.message_content||''} ${r.communication_type||''} ${r.template_name||''}`).join(' ')}`.toLowerCase();
      return !query||hay.includes(query.toLowerCase());
    });
    const active=filtered.find(c=>c.phone===selectedPhone)||filtered[0]||null;
    const chatVisible=Boolean(active&&(!isMobile||selectedPhone));
    const chatViewKey=chatVisible?active.phone:null;
    React.useLayoutEffect(()=>{
      const state=chatViewRef.current;
      if(state.key!==chatViewKey){state.key=chatViewKey;state.followLatest=true;}
      const pane=chatScrollRef.current;
      if(!pane||!chatVisible)return;
      const follow=()=>{if(state.followLatest)pane.scrollTop=pane.scrollHeight;};
      follow();
      // Keep the latest message visible as logos load or the composer resizes.
      const observer=new ResizeObserver(follow);
      observer.observe(pane);
      Array.from(pane.children).forEach(child=>observer.observe(child));
      return()=>observer.disconnect();
    },[chatViewKey,chatVisible,isMobile,active?.msgs.length,active?.msgs[active.msgs.length-1]?.id]);


    React.useEffect(()=>{if(!isMobile&&!selectedPhone&&filtered[0])setSelectedPhone(filtered[0].phone)},[rows,query,showUnread,isMobile]);
    React.useEffect(()=>{
      if(!active)return;
      const unreadIds=active.msgs.filter(x=>x.direction==='inbound'&&!x.erp_read_at).map(x=>x.id);
      if(unreadIds.length)client.from('hr_whatsapp_communications').update({erp_read_at:new Date().toISOString(),updated_at:new Date().toISOString()}).in('id',unreadIds).then(load);
    },[active?.phone,rows]);
    const latestInbound=active?[...active.msgs].reverse().find(x=>x.direction==='inbound'):null;
    const within24=latestInbound&&(Date.now()-new Date(latestInbound.received_at||latestInbound.created_at).getTime())<24*60*60*1000;
	    function mediaInfo(r){
	      const type=String(r?.message_type||'').toLowerCase();
	      const payload=r?.message_payload||{};
	      const reportPath=String(payload?.report_storage_path||'').trim();
	      const dailyReportTemplate=String(r?.template_name||'').toLowerCase()==='amara_daily_patient_report';
	      if(r?.direction!=='inbound'){
	        if(!dailyReportTemplate||!reportPath)return null;
	        return {id:'',type:'document',filename:payload?.report_file_name||`${payload?.patient_name||'Patient'} - Intelligent Patient Report - ${payload?.report_date||''}.pdf`,mime:'application/pdf',storedPath:reportPath,storedBucket:payload?.report_storage_bucket||'patient-reports'};
	      }
      const block=payload?.[type]||{};
      const archived=payload?._samara_media||{};
      const id=String(block?.id||'').trim();
      const storedPath=String(archived?.path||'').trim();
      if(!['image','audio','video','document','sticker'].includes(type)||(!id&&!storedPath))return null;
      return {id,type,filename:archived?.filename||block?.filename||'',mime:archived?.mime_type||block?.mime_type||'',storedPath,storedBucket:archived?.bucket||'whatsapp-media'};
    }
    function mediaLabel(media){
      if(media.type==='audio')return '▶ Play voice / audio';
      if(media.type==='document')return media.filename?`📄 ${media.filename}`:'📄 Open document';
      if(media.type==='image')return '🖼 View image';
      if(media.type==='video')return '▶ Play video';
      return 'View sticker';
    }
    async function openMedia(r){
      const media=mediaInfo(r);if(!media||mediaBusyId)return;
      setMediaBusyId(r.id);setMessage('Opening WhatsApp media…');
      try{
        const {data:{session}}=await client.auth.getSession();
        const token=session?.access_token||cfg.supabaseAnonKey;
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/whatsapp-media`,{
          method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.supabaseAnonKey,'Authorization':`Bearer ${token}`},body:JSON.stringify({media_id:media.id,stored_path:media.storedPath,stored_bucket:media.storedBucket})
        });
        if(!response.ok){
          const e=await response.json().catch(()=>({}));
          const err=new Error(e?.error||`Unable to retrieve media (${response.status})`);err.status=response.status;throw err;
        }
        const blob=await response.blob();
        const url=URL.createObjectURL(blob);
        const win=window.open(url,'_blank','noopener');
        if(!win){const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.download=media.filename||'';a.click()}
        setTimeout(()=>URL.revokeObjectURL(url),120000);
        setMessage('✓ WhatsApp attachment opened.');
      }catch(error){
        if(error?.status===410)setMessage('This older WhatsApp attachment is no longer available from Meta. Ask the sender to resend it. New incoming files will be archived automatically in Samara ERP.');
        else setMessage(`Unable to open WhatsApp media: ${error.message||error}`)
      }finally{setMediaBusyId('')}
    }
    function chatText(r){
      const raw=window.SamaraDateTime.text(String(r?.message_content||r?.communication_type||'WhatsApp message'));
      if(String(r?.template_name||'').toLowerCase()==='employee_welcome_samara'){
        const employeeName=r?.contact_name||r?.applicant_name||'Colleague';
        const designation=r?.message_payload?.designation||'Team Member';
        return `Dear ${employeeName},

Welcome to the Samara Family! 🌿

We are delighted to have you with us. At Samara, every resident deserves dignity, compassion and respect. From today, you become an important part of that mission.

As a ${designation}, your commitment and service will make a meaningful difference in the lives of our residents.

Your employee profile has been created in Samara Care ERP.

Please open Samara Care ERP using the button below and complete your first-time registration by creating your Username and Password.

We wish you a successful, fulfilling and rewarding journey with us. All the very best!

Samara Health Care LLP
Caring with Compassion. Living with Dignity.`;
      }
      if(String(r?.message_type||'').toLowerCase()==='template'){
        const one=(raw.match(/\{\{1\}\}:\s*(.*)/)||[])[1]||r?.contact_name||r?.applicant_name||'Customer';
        const two=(raw.match(/\{\{2\}\}:\s*(.*)/)||[])[1]||'your enquiry';
        const name=String(r?.template_name||'');
        if(name==='samara_admission_followup')return `Dear ${one},\nGreetings from Samara Assisted Living.\nThank you for contacting us regarding care and admission support for ${two}. Our team will be happy to understand your requirements and assist you further.\nPlease reply to this message to continue the conversation.\n\nThank you,\nSamara Assisted Living`;
        if(name==='samara_callback_request')return `Dear ${one},\nGreetings from Samara Assisted Living.\nWe tried to reach you regarding ${two}. Please reply to this message or let us know a convenient time for our team to contact you.\n\nThank you,\nSamara Assisted Living`;
        if(name==='samara_general_followup')return `Dear ${one},\nGreetings from Samara Assisted Living.\nWe received your message regarding ${two}.\nPlease reply to this message and our team will be happy to assist you.\n\nThank you,\nSamara Assisted Living`;
      }
      if(/^\[Audio \/ voice message received\]$/i.test(raw))return 'Voice message';
      if(/^\[Image received\]$/i.test(raw))return 'Photo';
      if(/^\[Video received\]$/i.test(raw))return 'Video';
      if(/^\[Sticker received\]$/i.test(raw))return 'Sticker';
      const doc=raw.match(/^\[Document received(?::\s*([^\]—]+))?(?:\s*—\s*([^\]]+))?\]$/i);
      if(doc)return doc[2]?`${doc[1]||'Document'}\n${doc[2]}`:(doc[1]||'Document');
      return raw;
    }
    function emergencyPreview(){
      const customer=String(active?.name||'Family Member').trim()||'Family Member';
      const patient=String(emergencyPatient||'the resident').trim();
      const when=emergencyTime?formatDateTimeIN(new Date(emergencyTime).toISOString()):formatDateTimeIN(new Date().toISOString());
      if(emergencyType==='hospital_transfer'){
        const hospital=String(emergencyHospital||'the hospital').trim();
        return `Dear ${customer},

Greetings from Samara Assisted Living.

This is an URGENT communication regarding ${patient}.

Due to an urgent change in condition, ${patient} is being shifted / has been shifted to ${hospital} at ${when}.

We attempted to contact you but could not reach you.
Contact attempt: ${emergencyAttempt||'No response.'}

Please contact Samara Assisted Living immediately.

Thank you.`;
      }
      return `Dear ${customer},

Greetings from Samara Assisted Living.

URGENT: We need to speak with you regarding ${patient}.

We attempted to contact you but could not reach you.
Contact attempt: ${emergencyAttempt||'No response.'}
Time: ${when}

Please contact Samara Assisted Living immediately.

Thank you.`;
    }

    async function sendEmergencyTemplate(){
      if(!active||emergencyBusy)return;
      const customer=String(active.name||'').trim()||'Family Member';
      const patient=String(emergencyPatient||'').trim();
      if(!patient){setMessage('Enter / confirm the patient name.');return}
      if(emergencyType==='hospital_transfer'&&!String(emergencyHospital||'').trim()){
        setMessage('Enter the hospital name for emergency transfer.');return
      }
      const when=emergencyTime?formatDateTimeIN(new Date(emergencyTime).toISOString()):formatDateTimeIN(new Date().toISOString());
      const attempt=String(emergencyAttempt||'Called authorised attendant; no response.').trim();
      const name=emergencyType==='hospital_transfer'
        ?'samara_emergency_hospital_transfer'
        :'samara_urgent_contact_required';
      const params=emergencyType==='hospital_transfer'
        ?[customer,patient,String(emergencyHospital).trim(),when,attempt]
        :[customer,patient,attempt,when];
      const rendered=emergencyPreview();
      const now=new Date().toISOString();
      const log={
        communication_type:emergencyType==='hospital_transfer'
          ?'EMERGENCY · Hospital Transfer'
          :'EMERGENCY · Urgent Contact Required',
        message_content:rendered,
        contact_name:customer,
        source_type:'Patient / Family · Emergency',
        sent_by:profile?.id||null,
        sent_by_name:formalName(profile)||'Samara Management',
        message_payload:{
          patient_name:patient,
          emergency_type:emergencyType,
          hospital:emergencyHospital||null,
          event_time:when,
          contact_attempt:attempt
        }
      };
      setEmergencyBusy(true);setMessage('Sending emergency WhatsApp template…');
      try{
        const result=await sendWhatsAppTemplate({
          to:active.phone,templateName:name,languageCode:'en',bodyParams:params,communicationLog:log
        });
        const providerId=result?.result?.messages?.[0]?.id||null;
        if(result?.history_logged!==true){
          const existing=providerId
            ?await client.from('hr_whatsapp_communications').select('id').eq('provider_message_id',providerId).maybeSingle()
            :{data:null};
          if(!existing?.data?.id){
            const {error}=await client.from('hr_whatsapp_communications').insert({
              career_application_id:active.last.career_application_id||null,
              application_id:active.last.application_id||null,
              applicant_name:active.last.applicant_name||active.name||null,
              recipient_number:active.phone,
              communication_type:log.communication_type,
              template_name:name,
              status:'Accepted',
              provider_message_id:providerId,
              error_message:null,
              sent_by:profile.id,
              sent_by_name:formalName(profile),
              direction:'outbound',
              message_type:'template',
              message_content:rendered,
              message_payload:log.message_payload,
              contact_name:customer,
              source_type:log.source_type,
              sent_at:now,created_at:now,updated_at:now
            });
            if(error)throw error;
          }
        }
        setMessage('✓ Emergency WhatsApp accepted by Meta and recorded in ERP Inbox.');
        setShowEmergency(false);
        await load();
      }catch(error){
        setMessage(`Emergency template send failed: ${error.message||error}. Confirm that ${name} is approved and ACTIVE in Meta.`);
      }finally{setEmergencyBusy(false)}
    }

    async function sendReply(){
      if(!active||!reply.trim()||busy)return;
      if(!within24){setMessage('The 24-hour customer service window has closed. Send an approved WhatsApp template first.');return}
      const sentText=reply.trim();
      let acceptedByWhatsApp=false;
      setBusy(true);setMessage('Sending WhatsApp reply…');
      try{
        const result=await sendWhatsAppText({to:active.phone,text:sentText});
        acceptedByWhatsApp=true;
        // Clear immediately after provider acceptance. Database refresh/logging must
        // never leave an already-sent message in the composer for accidental resending.
        setReply('');
        if(replyEditorRef.current)replyEditorRef.current.value='';
        if(isMobile)setMobileComposer('');
        const providerId=result?.result?.messages?.[0]?.id||null;
        const now=new Date().toISOString();
        const {error}=await client.from('hr_whatsapp_communications').insert({
          career_application_id:active.last.career_application_id||null,application_id:active.last.application_id||null,applicant_name:active.last.applicant_name||active.name||null,recipient_number:active.phone,
          communication_type:'WhatsApp Reply',template_name:null,status:'Accepted',provider_message_id:providerId,error_message:null,sent_by:profile.id,sent_by_name:formalName(profile),direction:'outbound',message_type:'text',
          message_content:sentText,message_payload:{...(result?.result||{}),...(patientContext?{patient_id:patientContext.patient_id,patient_code:patientContext.patient_code,patient_name:patientContext.patient_name}: {})},contact_name:active.name,source_type:patientContext?'Patient / Family':active.source,sent_at:now,created_at:now,updated_at:now
        });
        if(error)throw error;
        setMessage('✓ WhatsApp reply accepted by Meta. Message box cleared.');await load();
      }catch(error){
        if(acceptedByWhatsApp)setMessage(`✓ WhatsApp accepted the message, but ERP history refresh failed: ${error.message||error}. The edit box was cleared to prevent duplicate sending.`);
        else setMessage(`WhatsApp reply failed: ${error.message||error}`);
      }finally{setBusy(false)}
    }
    async function sendReopenTemplate(){
      if(!active||busy)return;
      const name=templateName.trim();if(!name){setMessage('Enter the exact approved Meta template name.');return}
      const customerName=String(active.name||'').trim()||'Customer';
      const regarding=String(templateRegarding||'').trim()||'your assisted living enquiry';
      const params=[customerName,regarding];
      setBusy(true);setMessage('Sending approved WhatsApp template…');
      try{
        const result=await sendWhatsAppTemplate({to:active.phone,templateName:name,languageCode:templateLanguage||'en',bodyParams:params});
        const providerId=result?.result?.messages?.[0]?.id||null;const now=new Date().toISOString();
        const rendered=reopenPreview(customerName,regarding);
        const {error}=await client.from('hr_whatsapp_communications').insert({
          career_application_id:active.last.career_application_id||null,application_id:active.last.application_id||null,applicant_name:active.last.applicant_name||active.name||null,recipient_number:active.phone,
          communication_type:'WhatsApp Re-open Template',template_name:name,status:'Accepted',provider_message_id:providerId,error_message:null,sent_by:profile.id,sent_by_name:formalName(profile),direction:'outbound',message_type:'template',
          message_content:rendered,message_payload:{provider_result:result?.result||null,body_params:params,button_text:name==='samara_callback_request'?'Please call me':null,...(patientContext?{patient_id:patientContext.patient_id,patient_code:patientContext.patient_code,patient_name:patientContext.patient_name}: {})},contact_name:active.name,source_type:patientContext?'Patient / Family':active.source,sent_at:now,created_at:now,updated_at:now
        });
        if(error)throw error;
        
        setMessage('✓ Approved template accepted by Meta. Free-text reply will become available after the customer replies.');await load();
      }catch(error){setMessage(`Template send failed: ${error.message||error}`)}finally{setBusy(false)}
    }
    const unreadTotal=conversations.filter(c=>waFolder==='All'||c.folder===waFolder).reduce((n,c)=>n+c.unread,0);
    return h(React.Fragment,null,
      h(Section,{title:foodOnly?(leaveCover?'WhatsApp — Food Vendors & Enquiries':'WhatsApp — Food Vendors'):patientContext?`WhatsApp — ${patientContext.patient_name}`:(isSTD?'WhatsApp Enquiry Desk':'WhatsApp Inbox'),subtitle:foodOnly?(leaveCover?'Food vendors and STD enquiries. Sending remains limited to food vendors.':'Food-vendor conversations · view, send templates and reply.'):isMobile?null:(patientContext?'Patient-linked WhatsApp messages only. Other WhatsApp conversations are hidden in this view.':(isSTD?'Incoming public enquiries only. Filter by subject, name/mobile and date.':'Website/public enquiries, applicant replies and WhatsApp conversations in one place'))},
        patientContext?h('div',{className:'notice',style:{marginBottom:'12px',display:'flex',gap:'10px',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'}},
          h('div',null,h('strong',null,patientContext.patient_name),h('span',{style:{marginLeft:'8px',color:'#7b6871'}},patientContext.patient_code?`· ${patientContext.patient_code}`:''),h('span',{style:{marginLeft:'8px',color:'#7b6871'}},`· +${patientContext.phone}`)),
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setPatientContext(null);setSelectedPhone('');setQuery('');setShowUnread(false);}},'Show All WhatsApp')
        ):null,
        (!isMobile||!selectedPhone)?h('nav',{'aria-label':'WhatsApp folders',style:{display:'flex',gap:'8px',flexWrap:'wrap',marginBottom:'12px'}},
          (foodOnly?(leaveCover?['All','Admission Enquiries','Other']:['All','Food Vendors']):isSTD?['Admission Enquiries','Other']:['All','Admission Enquiries','Payment Follow-ups','Other']).map(folder=>h('button',{type:'button',key:folder,'aria-pressed':waFolder===folder,className:`btn ${waFolder===folder?'btn-primary':'btn-secondary'}`,onClick:()=>{setWaFolder(folder);setSelectedPhone('');setSubjectFilter('All Subjects');setQuery('');setShowUnread(false);setDateFrom('');setDateTo('');}},`${folder} (${conversations.filter(c=>folder==='All'||c.folder===folder).length})`))
        ):null,
        (!isMobile||!selectedPhone)?h('div',{className:'wa-inbox-toolbar',style:{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center',marginBottom:'14px'}},
          h('input',{value:query,onChange:e=>setQuery(e.target.value),placeholder:isSTD?'Search name, mobile, subject or message…':'Search name, mobile or message…',style:{flex:'1 1 280px',minWidth:'220px'}}),
          isSTD?h('select',{value:subjectFilter,onChange:e=>{setSubjectFilter(e.target.value);setSelectedPhone('')},style:{minWidth:'170px'}},
            ['All Subjects','Admission / Care','Callback','Location','Pricing / Charges','Services','General Enquiry'].map(x=>h('option',{key:x},x))
          ):null,
          isSTD?h('label',{style:{display:'flex',alignItems:'center',gap:'5px',fontSize:'12px',color:'#725d68'}},'From',h(StrictDateInput,{value:dateFrom,onChange:e=>{setDateFrom(e.target.value);setSelectedPhone('')}})):null,
          isSTD?h('label',{style:{display:'flex',alignItems:'center',gap:'5px',fontSize:'12px',color:'#725d68'}},'To',h(StrictDateInput,{value:dateTo,onChange:e=>{setDateTo(e.target.value);setSelectedPhone('')}})):null,
          h('button',{type:'button',className:`btn ${showUnread?'btn-primary':'btn-secondary'}`,onClick:()=>{
            const next=!showUnread;
            setShowUnread(next);
            if(isMobile)setSelectedPhone('');
            if(next)setQuery('');
          }},`Unread ${unreadTotal}`),
          isSTD?h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setQuery('');setSubjectFilter('All Subjects');setDateFrom('');setDateTo('');setShowUnread(false);setSelectedPhone('')}},'Clear Filters'):null,
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>load(true)},'Refresh')
        ):null,
        message&&(!isMobile||!selectedPhone)?h('div',{className:'notice wa-inbox-status',style:{marginBottom:'12px'}},message):null,
        renderChatShell(h('div',{ref:chatShellRef,className:`wa-inbox-shell ${isMobile&&selectedPhone?'wa-mobile-chat-open':''}`},
          h('div',{className:'wa-conversation-list'},
            filtered.length?filtered.map(c=>h('button',{key:c.phone,type:'button',onClick:()=>setSelectedPhone(c.phone),style:{display:'block',width:'100%',textAlign:'left',padding:'13px 14px',border:'0',borderBottom:'1px solid #f0e5e9',background:active?.phone===c.phone?'#f3f5f6':'#fff',cursor:'pointer'}},
              h('div',{style:{display:'flex',alignItems:'center',gap:'10px'}},
                h('div',{style:{width:'42px',height:'42px',borderRadius:'50%',display:'grid',placeItems:'center',background:'#e8edef',color:'#5d1039',fontWeight:'800',flex:'0 0 auto'}},String(c.name||'?').trim().slice(0,1).toUpperCase()),
                h('div',{style:{minWidth:0,flex:1}},
                  h('div',{style:{display:'flex',justifyContent:'space-between',gap:'8px',alignItems:'baseline'}},h('strong',{style:{color:'#2e252a',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},c.name),h('small',{style:{color:'#8b7c84',flex:'0 0 auto'}},fmt(c.last.created_at))),
                  isSTD?h('div',{style:{fontSize:'11px',fontWeight:850,color:'#9b124f',marginTop:'3px'}},c.subject):null,
                  h('div',{style:{display:'flex',justifyContent:'space-between',gap:'8px',alignItems:'center',marginTop:'4px'}},h('span',{style:{fontSize:'13px',color:'#756870',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},chatText(c.last).replace(/\n/g,' ')),c.unread?h('span',{className:'badge success'},c.unread):null)
                )
              )
            )):h('p',{className:'empty',style:{padding:'30px'}},'No WhatsApp conversations found.')
          ),
          h('div',{className:'wa-chat-pane'},
            active?h(React.Fragment,null,
              h('div',{className:'wa-chat-head'},
                h('div',{style:{display:'flex',gap:'8px',alignItems:'center',minWidth:0}},
                  isMobile?h('button',{type:'button',className:'wa-mobile-back',onClick:()=>{setMobileComposer('');setSelectedPhone('')},'aria-label':'Back to conversations'},'‹'):null,
                  h('div',{style:{width:'40px',height:'40px',borderRadius:'50%',display:'grid',placeItems:'center',background:'#dfe5e7',color:'#5d1039',fontWeight:'800'}},String(active.name||'?').trim().slice(0,1).toUpperCase()),
                  h('div',{style:{minWidth:0}},h('div',{style:{fontWeight:'800',color:'#2e252a',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},active.name),h('small',{style:{color:'#6e6268'}},isMobile?`+${active.phone}`:`+${active.phone} · ${active.source}`))
                ),
                !isMobile?h('div',{style:{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap',justifyContent:'flex-end'}},
                  h('span',{className:`badge ${within24?'success':''}`},within24?'Reply window open':'Template required')
                ):null
              ),
              h('div',{className:'wa-chat-scroll',ref:chatScrollRef,onScroll:e=>{const pane=e.currentTarget;chatViewRef.current.followLatest=pane.scrollHeight-pane.scrollTop-pane.clientHeight<64;}},active.msgs.map(r=>{
                const outgoing=r.direction!=='inbound';const media=mediaInfo(r);const text=chatText(r);
                const status=String(r.status||'Unknown');
                const deliveryLabel=({read:'✓✓ Read',delivered:'✓✓ Delivered',sent:'✓ Sent',accepted:'✓ Accepted',failed:'Failed',unknown:'Acceptance unknown',sending:'Sending…',pending:'Pending'})[status.toLowerCase()]||status;
                return h('div',{key:r.id,style:{display:'flex',justifyContent:outgoing?'flex-end':'flex-start',marginBottom:'8px'}},
                  h('div',{style:{position:'relative',maxWidth:'72%',padding:'8px 10px 6px',borderRadius:outgoing?'8px 0 8px 8px':'0 8px 8px 8px',background:outgoing?'#d9fdd3':'#fff',boxShadow:'0 1px 1px rgba(0,0,0,.08)',color:'#292229'}},
                    outgoing?h(React.Fragment,null,
                      h('div',{style:{fontSize:'11px',fontWeight:'800',color:'#7d1748',marginBottom:'6px',display:'flex',gap:'6px',alignItems:'center',flexWrap:'wrap'}},
                        h('span',null,String(r.communication_type||'Samara WhatsApp')),
                        /EMERGENCY/i.test(String(r.communication_type||''))
                          ?h('span',{style:{padding:'2px 7px',borderRadius:'999px',background:'#b42336',color:'#fff',fontSize:'10px',letterSpacing:'.2px'}},`URGENT · ${r.sent_by_name||'Samara Management'}`)
                          :/Automated/i.test(`${r.communication_type||''} ${r.sent_by_name||''}`)
                            ?h('span',{style:{padding:'2px 7px',borderRadius:'999px',background:'#7d1748',color:'#fff',fontSize:'10px',letterSpacing:'.2px'}},'AUTOMATED · Samara System')
                            :(r.sent_by_name?h('span',{style:{fontWeight:'700',color:'#7b6871'}},`· ${r.sent_by_name}`):null)
                      ),
                      h('div',{style:{background:'#fff',border:'1px solid #ecdce4',borderRadius:'8px',padding:'8px 10px',marginBottom:'9px',textAlign:'center'}},
                        h('img',{src:BRAND_LOGO_SRC,alt:'Samara Assisted Living',style:{display:'block',width:'128px',maxWidth:'70%',height:'auto',margin:'0 auto 5px'}}),
                        String(r.template_name||'').toLowerCase()!=='employee_welcome_samara'?h('div',{style:{fontSize:'11px',fontWeight:'800',color:'#7d1748'}},'Greetings from Samara Assisted Living'):null
                      )
                    ):null,
                    h('div',{style:{whiteSpace:'pre-wrap',lineHeight:'1.42',fontSize:'14px',paddingRight:'4px'}},text),
                    outgoing&&templateReplyButtons(String(r.template_name||'').toLowerCase()).length
                      ?h('div',{style:{marginTop:'9px',borderTop:'1px solid #d8e6dc'}},templateReplyButtons(String(r.template_name||'').toLowerCase()).map(label=>h('div',{key:label,style:{display:'block',padding:'8px 10px',background:'#fff',borderBottom:'1px solid #d8e6dc',color:'#087f5b',fontWeight:'800',textAlign:'center'}},`↩ ${label}`)))
                      :null,
                    media?h('button',{type:'button',disabled:mediaBusyId===r.id,onClick:()=>openMedia(r),style:{display:'block',marginTop:'8px',padding:'7px 10px',border:'0',borderRadius:'7px',background:'#f0f2f5',color:'#5d1039',fontWeight:'700',cursor:mediaBusyId===r.id?'wait':'pointer',maxWidth:'100%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}},mediaBusyId===r.id?'Opening…':mediaLabel(media)):null,
                    outgoing&&['samara_bill_reminder','samara_payment_receipt','samara_family_portal_access','samara_discharge_confirmation','employee_welcome_samara'].includes(String(r.template_name||'').toLowerCase())
                      ?h('a',{href:String(r.template_name||'').toLowerCase()==='employee_welcome_samara'?'https://app.samaraassistedliving.com/':'https://family.samaraassistedliving.com/',target:'_blank',rel:'noopener noreferrer',style:{display:'block',marginTop:'9px',padding:'8px 10px',borderRadius:'7px',background:'#fff',border:'1px solid #b8d9c5',color:'#087f5b',fontWeight:'800',textAlign:'center',textDecoration:'none'}},String(r.template_name||'').toLowerCase()==='employee_welcome_samara'?'↗ Open Samara Care ERP':String(r.template_name||'').toLowerCase()==='samara_payment_receipt'?'↗ View Family Portal website':'↗ View Family Portal')
                      :null,
                    outgoing&&r.error_message?h('div',{style:{fontSize:'12px',color:'#a12335',marginTop:'6px'}},r.error_message):null,
                    h('small',{style:{display:'block',marginTop:'4px',textAlign:'right',color:'#667781',fontSize:'11px'}},`${fmt(r.received_at||r.sent_at||r.created_at)}${outgoing?`  ${deliveryLabel}`:''}`)
                  )
                )
              })),
              isMobile&&message?h('div',{className:'wa-chat-status',role:'status'},message):null,
              isMobile?h('div',{className:'wa-mobile-actions'},
                h('div',{className:'wa-mobile-actions-status',style:{color:within24?'#087f5b':'#5d1039'}},within24?'Send or reply to this conversation':'Send a template to start; reply after the recipient responds'),
                within24?h('button',{type:'button',className:'wa-mobile-action-btn',onClick:()=>setMobileComposer(mobileComposer==='reply'?'':'reply')},mobileComposer==='reply'?'Close':'Reply'):null,
                h('button',{type:'button',className:'wa-mobile-action-btn secondary',onClick:()=>setMobileComposer(mobileComposer==='template'?'':'template')},mobileComposer==='template'?'Close':'Template')
              ):null,
              (!isMobile||mobileComposer==='reply')?h('div',{className:'wa-free-composer',style:{display:'block',opacity:within24?1:.72}},
                isMobile?h('div',{className:'wa-mobile-composer-title'},h('span',null,'Direct WhatsApp reply'),h('button',{type:'button',className:'wa-mobile-composer-close',onClick:()=>setMobileComposer(''),'aria-label':'Close reply'},'×')):
                  h('div',{style:{fontWeight:'800',color:within24?'#087f5b':'#5d1039',marginBottom:'7px'}},within24?'Direct message · reply window open':'Direct message locked · recipient has not replied within the last 24 hours'),
                h('div',{style:{display:'flex',gap:'10px',alignItems:'stretch'}},
                  h('textarea',{ref:replyEditorRef,value:reply,onChange:e=>setReply(e.target.value),placeholder:within24?'Type a direct message':'Direct messaging becomes available after the recipient replies',disabled:busy||!within24,rows:2,style:{flex:'1 1 auto',minWidth:0,resize:'none',borderRadius:'10px',background:'#fff',margin:0}}),
                  h('button',{type:'button',className:'btn btn-primary',disabled:busy||!within24||!reply.trim(),onClick:sendReply,style:{minWidth:isMobile?'86px':'110px'}},busy?'Sending…':'Send')
                )
              ):null,
              (!isMobile||mobileComposer==='template')?h('div',{className:'wa-template-composer'},
                isMobile?h('div',{className:'wa-mobile-composer-title'},h('span',null,'Send approved template'),h('button',{type:'button',className:'wa-mobile-composer-close',onClick:()=>setMobileComposer(''),'aria-label':'Close template'},'×')):
                  h('div',{style:{fontWeight:'800',color:'#5d1039',marginBottom:'6px'}},'Approved WhatsApp templates · available inside or outside the 24-hour reply window'),
                h('div',{className:'wa-template-grid'},
                  h('div',null,h('small',{style:{display:'block',marginBottom:'3px',color:'#6e6268'}},'Template'),h('select',{value:templateName,onChange:e=>chooseReopenTemplate(e.target.value),style:{width:'100%'}},WA_REOPEN_TEMPLATES.map(t=>h('option',{key:t.name,value:t.name},t.label)))),
                  h('div',null,h('small',{style:{display:'block',marginBottom:'3px',color:'#6e6268'}},'Regarding'),h('input',{value:templateRegarding,onChange:e=>setTemplateRegarding(e.target.value),placeholder:selectedTemplate.regarding,style:{width:'100%'}})),
                  h('button',{type:'button',className:'btn btn-primary',disabled:busy||!templateRegarding.trim(),onClick:sendReopenTemplate,style:{whiteSpace:'nowrap'}},busy?'Sending…':'Send template')
                ),
                h('small',{style:{display:'block',marginTop:'6px',color:'#6e6268'}},`To: ${active.name||'Customer'}`)
              ):null
            ):h('p',{className:'empty',style:{margin:'auto'}},'Select a WhatsApp conversation.')
          )
        )),
        !foodOnly&&!isSTD&&showEmergency&&active?h('div',{className:'modal show',onClick:e=>{if(e.target===e.currentTarget&&!emergencyBusy)setShowEmergency(false)}},
          h('div',{className:'modal-card',style:{maxWidth:'720px',border:'2px solid #b42336'}},
            h('div',{className:'modal-head'},
              h('div',null,
                h('h3',{style:{color:'#9d1428',margin:0}},'🚨 Emergency WhatsApp Communication'),
                h('small',null,'For urgent resident/family communication. This action is recorded in the WhatsApp history.')
              ),
              h('button',{type:'button',className:'icon-btn',disabled:emergencyBusy,onClick:()=>setShowEmergency(false)},'×')
            ),
            h('div',{style:{display:'grid',gap:'12px'}},
              h('div',{className:'grid two'},
                h(Field,{label:'Emergency Type',required:true},
                  h('select',{value:emergencyType,onChange:e=>setEmergencyType(e.target.value)},
                    h('option',{value:'hospital_transfer'},'Emergency Hospital Transfer'),
                    h('option',{value:'urgent_contact'},'Urgent Contact Required')
                  )
                ),
                h(Field,{label:'Family / Attender'},h('input',{value:active.name||'',disabled:true}))
              ),
              h(Field,{label:'Patient / Resident Name',required:true},
                h('input',{value:emergencyPatient,onChange:e=>setEmergencyPatient(e.target.value),placeholder:'Enter resident name'})
              ),
              emergencyType==='hospital_transfer'?h(Field,{label:'Hospital Name',required:true},
                h('input',{value:emergencyHospital,onChange:e=>setEmergencyHospital(e.target.value),placeholder:'Hospital being shifted to'})
              ):null,
              h(Field,{label:'Emergency / Contact Time',required:true},
                h(StrictDateTimeInput,{value:emergencyTime,onChange:e=>setEmergencyTime(e.target.value)})
              ),
              h(Field,{label:'Contact Attempts / Remarks',required:true},
                h('textarea',{value:emergencyAttempt,onChange:e=>setEmergencyAttempt(e.target.value),rows:3,placeholder:'Example: Called twice at 11:40 PM and 11:43 PM; no response.'})
              ),
              h('div',{style:{border:'1px solid #f0c8cf',background:'#fff7f8',borderRadius:'12px',padding:'12px'}},
                h('strong',{style:{display:'block',color:'#9d1428',marginBottom:'7px'}},'Message Preview'),
                h('div',{style:{whiteSpace:'pre-wrap',lineHeight:'1.45'}},emergencyPreview())
              ),
              h('div',{style:{display:'flex',gap:'10px',justifyContent:'flex-end',flexWrap:'wrap'}},
                h('button',{type:'button',className:'btn btn-secondary',disabled:emergencyBusy,onClick:()=>setShowEmergency(false)},'Cancel'),
                h('button',{type:'button',className:'btn',disabled:emergencyBusy,onClick:sendEmergencyTemplate,style:{background:'#b42336',color:'#fff',fontWeight:'900'}},emergencyBusy?'Sending Emergency…':'Send Emergency WhatsApp')
              )
            )
          )
        ):null
      )
    );
  }


