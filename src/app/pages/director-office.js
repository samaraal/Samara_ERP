  function directorOfficeRange(period,date,month,today){
    if(period==='Monthly'){
      const [year,number]=month.split('-').map(Number);
      const last=new Date(Date.UTC(year,number,0)).getUTCDate();
      return {from:month+'-01',to:month+'-'+String(last).padStart(2,'0')};
    }
    if(['Previous Week','This Week','Next Week'].includes(period)){
      const offset=period==='Previous Week'?-7:period==='Next Week'?7:0;
      const from=addDaysISO(mondayOfWeek(today),offset);
      return {from,to:addDaysISO(from,6)};
    }
    return {from:date,to:date};
  }

  function directorEnquiryConversations(messages){
    const groups={};
    for(const row of messages){const phone=normalizeWhatsAppRecipient(row.recipient_number||row.sender_number||'');if(phone)(groups[phone]||(groups[phone]=[])).push(row);}
    return Object.entries(groups).flatMap(([phone,rows])=>{
      const sorted=rows.sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
      if(whatsAppFolder(sorted)!=='Admission Enquiries')return [];
      const inbound=sorted.filter(r=>r.direction==='inbound'&&requestCategory(r)==='Admission Enquiries');
      if(!inbound.length)return [];
      const last=inbound[inbound.length-1];
      return [{phone,name:last.contact_name||last.applicant_name||phone,last,unread:inbound.some(r=>!r.erp_read_at)}];
    }).sort((a,b)=>String(b.last.created_at).localeCompare(String(a.last.created_at)));
  }
  function DirectorEnquiries({profile,onNavigate}){
    const [enquiries,setEnquiries]=React.useState([]),[calls,setCalls]=React.useState([]),[feedback,setFeedback]=React.useState([]),[busy,setBusy]=React.useState(true),[error,setError]=React.useState('');
    async function load(){
      setBusy(true);setError('');
      try{
        async function all(table){const rows=[];for(let offset=0;;offset+=500){const r=await client.from(table).select('*').order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+499);if(r.error)throw r.error;rows.push(...(r.data||[]));if((r.data||[]).length<500)return rows;}}
        const [wa,office,fb]=await Promise.all([all('hr_whatsapp_communications'),all('director_office_items'),all('feedback')]);
        setEnquiries(directorEnquiryConversations(wa));
        setCalls(office.filter(r=>r.item_type==='Call / Callback'&&!['completed','cancelled'].includes(String(r.status||'').toLowerCase())));
        setFeedback(fb.filter(r=>!['closed','resolved'].includes(String(r.status||'').toLowerCase())));
      }catch(e){setError(e.message||'Unable to load enquiries');}finally{setBusy(false);}
    }
    React.useEffect(()=>{if((hasDutyRole(profile,'Admin')||hasDutyRole(profile,'STD')))load();},[]);
    if(!(hasDutyRole(profile,'Admin')||hasDutyRole(profile,'STD')))return null;
    const tile=(label,count,note,action)=>h('button',{type:'button',className:'btn btn-secondary',onClick:action,style:{textAlign:'left',padding:'18px',whiteSpace:'normal',color:'#741747',background:'linear-gradient(135deg,#fff7fb,#f5d4e4)',border:'1px solid #e7acc8',borderRadius:'18px'}},h('strong',{style:{display:'block',fontSize:'26px',color:'#8b1953'}},busy||error?'—':count),h('span',{style:{display:'block',fontSize:'15px',fontWeight:600}},label),h('small',{style:{display:'block',fontWeight:400,marginTop:'5px'}},note));
    return h(Section,{title:'Enquiries & Feedback',subtitle:"Director's Office",actions:h('button',{className:'btn btn-secondary',disabled:busy,onClick:load},busy?'Refreshing…':'Refresh')},
      error?h('div',{className:'message error'},error):null,
      h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:'12px'}},
        tile('WhatsApp Enquiries',enquiries.length,'Distinct enquiry conversations — not message count',()=>{sessionStorage.setItem('samara_whatsapp_folder','Admission Enquiries');onNavigate('WhatsApp Inbox');}),
        tile('Pending Calls / Callbacks',calls.length,'Office call tasks; these are not all public enquiries',()=>onNavigate("Director's Office")),
        tile('Open Feedback',feedback.length,'Excludes closed and resolved feedback',()=>onNavigate('Feedback'))),
      h('h4',null,'WhatsApp enquiry conversations'),
      h('p',{className:'small-note'},'Uses the Inbox Admission Enquiries classification. Payment, employee, recruitment and patient/family conversations are excluded. Counts each contact once; unread enquiries: '+enquiries.filter(x=>x.unread).length+'.'),
      !busy&&!error&&!enquiries.length?h('p',null,'No classified enquiry conversations.'):null,
      ...enquiries.map(e=>h('div',{key:e.phone,style:{padding:'12px',borderBottom:'1px solid #efd3e1',color:'#741747'}},h('strong',null,e.name),h('div',null,e.phone),h('small',null,e.unread?'Unread enquiry':'Read enquiry')))
    );
  }


  function directorTickerIdentity(profile){
    return Boolean(profile?.id&&profile?.role==='Admin'&&profile?.is_active!==false&&String(profile?.login_id||'').trim().toLowerCase()==='chellaboomi');
  }
  function directorTickerDay(now=new Date()){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const part=type=>parts.find(p=>p.type===type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  function directorTickerItems(rows,day){
    return rows.filter(r=>['pending','in progress','open'].includes(String(r.status||'Pending').trim().toLowerCase())&&(r.scheduled_at?directorTickerDay(new Date(r.scheduled_at)):String(r.due_date||'').slice(0,10))===day)
      .sort((a,b)=>String(a.scheduled_at||a.due_date||'').localeCompare(String(b.scheduled_at||b.due_date||''))||String(a.id).localeCompare(String(b.id)));
  }
  function DirectorTodayTicker({profile,page,onNavigate}){
    const [allowed,setAllowed]=React.useState(false);
    const [rows,setRows]=React.useState([]);
    const [day,setDay]=React.useState(()=>directorTickerDay());
    const [error,setError]=React.useState('');
    const [ready,setReady]=React.useState(false);
    const [paused,setPaused]=React.useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const [hovered,setHovered]=React.useState(false);
    const [focused,setFocused]=React.useState(false);
    const [selectedId,setSelectedId]=React.useState(null);
    const [welcome,setWelcome]=React.useState(false);
    const welcomeDialog=React.useRef(null),acknowledgedDay=React.useRef('');
    const dailyKey='samara-director-daily-plan:'+profile.id;
    function closeWelcome(){
      acknowledgedDay.current=day;
      try{localStorage.setItem(dailyKey,day);}catch(_){}
      setSelectedId(null);setWelcome(false);onNavigate?.("Director's Office");
    }
    React.useEffect(()=>{
      if(!allowed||!ready||error)return;
      let seen=acknowledgedDay.current;
      try{seen=localStorage.getItem(dailyKey)||seen;}catch(_){}
      setWelcome(seen!==day);
    },[allowed,ready,day,error,dailyKey]);
    React.useEffect(()=>{
      const changed=e=>{if(e.key===dailyKey&&e.newValue===day){acknowledgedDay.current=day;setSelectedId(null);setWelcome(false);}};
      window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed);
    },[dailyKey,day]);
    React.useEffect(()=>{
      const el=welcomeDialog.current;if(!welcome||!allowed||!el)return;
      el.showModal();el.querySelector('h2')?.focus({preventScroll:true});el.scrollTop=0;
      const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
      return()=>{el.close();document.body.style.overflow=previousOverflow;};
    },[welcome,allowed]);
    const track=React.useRef(null),group=React.useRef(null),dialog=React.useRef(null),offset=React.useRef(0);
    const selected=rows.find(r=>r.id===selectedId);
    React.useEffect(()=>{if(selectedId&&!rows.some(r=>r.id===selectedId))setSelectedId(null);},[rows,selectedId]);
    React.useEffect(()=>{
      if(!directorTickerIdentity(profile)){setAllowed(false);setRows([]);return;}
      let disposed=false,busy=false;
      async function refresh(){
        if(busy)return;busy=true;
        try{
          const position=await client.from('director_office_positions').select('assigned_profile_id').eq('position_key','director').maybeSingle();
          if(disposed)return;
          if(position.error||position.data?.assigned_profile_id!==profile.id){setAllowed(false);setRows([]);return;}
          setAllowed(true);
          const current=directorTickerDay(),start=new Date(current+'T00:00:00+05:30'),end=new Date(start.getTime()+86400000);
          const result=[];
          for(let from=0;;from+=500){
            const response=await client.from('director_office_items').select('*')
              .or(`and(scheduled_at.gte.${start.toISOString()},scheduled_at.lt.${end.toISOString()}),and(scheduled_at.is.null,due_date.eq.${current})`)
              .order('id').range(from,from+499);
            if(response.error)throw response.error;
            result.push(...(response.data||[]));
            if((response.data||[]).length<500)break;
          }
          if(disposed)return;
          const next=directorTickerItems(result,current);
          setRows(old=>JSON.stringify(old)===JSON.stringify(next)?old:next);setDay(current);setError('');setReady(true);
        }catch(_){if(!disposed){setError('Unable to refresh today’s schedules. Please try again.');setRows([]);setReady(true);}}
        finally{busy=false;}
      }
      refresh();
      const timer=setInterval(refresh,30000);
      const onVisible=()=>{if(document.visibilityState==='visible')refresh();};
      document.addEventListener('visibilitychange',onVisible);
      const channel=client.channel('director-today-'+profile.id)
        .on('postgres_changes',{event:'*',schema:'public',table:'director_office_items'},refresh)
        .on('postgres_changes',{event:'*',schema:'public',table:'director_office_positions'},refresh).subscribe();
      return()=>{disposed=true;clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);client.removeChannel(channel);};
    },[profile?.id,profile?.role,profile?.login_id,profile?.is_active]);
    React.useEffect(()=>{offset.current=0;if(track.current)track.current.style.transform='translateY(0)';},[rows,day]);
    React.useEffect(()=>{
      if(!allowed||!rows.length||paused||hovered||focused||selectedId||(!welcome&&page!=="Director's Office"))return;
      let frame,last;
      const move=now=>{
        if(last&&document.visibilityState==='visible'&&group.current&&track.current){
          const height=group.current.offsetHeight;
          if(height){offset.current=(offset.current+Math.min(now-last,64)*0.042)%height;track.current.style.transform=`translateY(-${offset.current}px)`;}
        }
        last=now;frame=requestAnimationFrame(move);
      };
      frame=requestAnimationFrame(move);return()=>cancelAnimationFrame(frame);
    },[allowed,rows,paused,hovered,focused,selectedId,welcome,page]);
    React.useEffect(()=>{
      const el=dialog.current;
      if(!selected||!el)return;
      const previous=document.activeElement;el.showModal();el.querySelector('h3')?.focus({preventScroll:true});el.scrollTop=0;
      return()=>{el.close();if(previous?.isConnected)previous.focus();};
    },[selectedId,Boolean(selected)]);
    if(!allowed||!directorTickerIdentity(profile)||(!welcome&&page!=="Director's Office"))return null;
    const time=r=>r.scheduled_at?formatDateTimeIN(r.scheduled_at):'Today · Time not set';
    const field=(label,value)=>value?h('div',{className:'dt-detail-field'},h('strong',null,label),h('div',null,value)):null;
    const cards=duplicate=>rows.map((r,i)=>h('button',{type:'button',key:r.id,tabIndex:duplicate?-1:0,className:'dt-item',onClick:()=>setSelectedId(r.id)},
      h('span',{className:'dt-number'},i+1),h('span',null,h('strong',null,r.title||'Untitled schedule'),h('small',null,[time(r),r.item_type==='Task'?(r.task_kind||'Task'):r.item_type,r.status||'Pending'].filter(Boolean).join(' · ')))));
    return h(welcome?'dialog':'section',{className:'director-today-ticker'+(welcome?' dt-welcome':''),ref:welcome?welcomeDialog:null,'aria-label':'Chellaboomi’s schedules today',onCancel:welcome?e=>{e.preventDefault();closeWelcome();}:undefined},
      h('style',null,`
        .director-today-ticker{margin:0 0 16px;border:1px solid #e6afc6;border-radius:16px;background:#fff7fb;color:#551234;overflow:hidden}
        .dt-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;background:#f7dfeb}
        .dt-welcome{position:fixed;inset:0;width:100vw!important;height:100dvh!important;max-width:none!important;max-height:none!important;margin:0!important;border:0!important;border-radius:0!important;padding:0!important;box-sizing:border-box}.dt-welcome[open]{display:flex;flex-direction:column}.dt-welcome::backdrop{background:#fff7fb}.dt-welcome .dt-heading{flex-shrink:0;flex-wrap:wrap;padding:20px}.dt-welcome h2{font-size:24px;margin:0;color:#65143e}.dt-welcome .dt-window{height:auto;flex:1;overflow:hidden;min-height:0;padding:0 10px}.dt-welcome .dt-window.dt-still{overflow:auto}.dt-welcome .dt-item{min-height:76px}.dt-welcome .dt-heading button{font-weight:700}.dt-welcome .dt-heading small{margin-top:7px}
        .dt-heading>div{min-width:0;flex:1}.director-today-ticker .dt-heading .dt-pause{flex:0 0 auto;min-width:88px;width:auto;white-space:nowrap!important;word-break:normal!important;overflow-wrap:normal!important}
        .dt-heading strong,.dt-heading small{display:block}.dt-heading small{font-size:12px;margin-top:3px}
        .dt-heading button{background:#fff;border:1px solid #ca8ca8;border-radius:10px;padding:8px 12px;color:#65143e;min-height:40px;cursor:pointer}
        .dt-window{height:156px;overflow:hidden;position:relative}.dt-track{will-change:transform}.dt-group{padding:6px 10px;display:grid;gap:6px}
        .dt-item{display:flex;gap:10px;align-items:center;width:100%;text-align:left;border:1px solid #eed1df;border-radius:10px;background:#fff;color:#491a31;padding:10px;cursor:pointer;min-height:64px}
        .dt-item strong{display:block;font-size:14px}.dt-item small{display:block;font-size:12px;color:#775565;margin-top:4px}
        .dt-number{flex-shrink:0;border-radius:50%;background:#f6d9e7;min-width:28px;height:28px;display:grid;place-items:center;font-weight:800}
        .dt-item:focus-visible,.dt-heading button:focus-visible{outline:3px solid #ad205e;outline-offset:-3px}
        .dt-still{overflow:auto}.dt-still .dt-track{transform:none!important}.dt-still .dt-copy{display:none}
        .dt-message{padding:15px}.dt-dialog{width:min(620px,calc(100vw - 28px));max-height:80vh;overflow:auto;border:1px solid #dca7bf;border-radius:18px;padding:20px;color:#491a31;background:#fff;box-sizing:border-box;z-index:2147483647}
        .dt-dialog::backdrop{background:rgba(25,8,18,.55)}.dt-dialog h3{margin:0}.dt-detail-field{margin-top:14px;white-space:pre-wrap;overflow-wrap:anywhere}.dt-detail-field strong{display:block;font-size:12px;color:#85536b;margin-bottom:4px}
        .dt-dialog button{min-height:44px;padding:8px 16px;margin-top:16px;border-radius:9px;background:#8d2151;color:white;border:0;cursor:pointer}
      `),
      h('div',{className:'dt-heading'},h('div',null,h(welcome?'h2':'strong',{tabIndex:welcome?-1:undefined},`Today’s open schedules · ${rows.length}`),h('small',null,'Director Chellaboomi · Tap a schedule for full details')),
        welcome&&h('button',{type:'button',onClick:closeWelcome},'Continue to Director’s Office'),h('button',{type:'button',className:'dt-pause','aria-pressed':paused,onClick:()=>{offset.current=0;if(track.current)track.current.style.transform='translateY(0)';setPaused(!paused);}},paused?'Resume':'Pause')),
      error?h('div',{className:'dt-message',role:'status'},error):!ready?h('div',{className:'dt-message'},'Loading today’s schedules…'):!rows.length?h('div',{className:'dt-message'},'No pending or open schedules for today.'):h('div',{className:'dt-window'+(paused||focused?' dt-still':''),
        onPointerDown:()=>setHovered(true),onPointerUp:()=>setHovered(false),onPointerLeave:()=>setHovered(false),onPointerCancel:()=>setHovered(false),
        onFocus:e=>setFocused(e.target.matches(':focus-visible')),onBlur:e=>{if(!e.currentTarget.contains(e.relatedTarget))setFocused(false);}},
        h('div',{className:'dt-track',ref:track},h('div',{className:'dt-group',ref:group},cards(false)),h('div',{className:'dt-group dt-copy','aria-hidden':true},cards(true)))),
      selected&&h('dialog',{className:'dt-dialog',ref:dialog,'aria-labelledby':'dt-detail-title',onCancel:()=>setSelectedId(null),onClose:()=>setSelectedId(null)},
        h('h3',{id:'dt-detail-title',tabIndex:-1},selected.title||'Schedule details'),
        field('Type',selected.item_type==='Task'?(selected.task_kind||'Task'):selected.item_type),
        field('Schedule',time(selected)),field('Due date',selected.due_date?formatDateIN(selected.due_date):null),
        field('Status',selected.status||'Pending'),field('Priority',selected.priority||'Normal'),
        field('Contact / Place',selected.contact_name),field('Phone',selected.contact_mobile),field('Organisation',selected.organisation),
        field('Details',selected.details),field('Director’s instruction',selected.director_note),
        field('Director attention',selected.needs_director_attention?(selected.director_responded_at?'Responded · '+formatDateTimeIN(selected.director_responded_at):'Awaiting Director response'):null),
        field('Rescheduled',selected.rescheduled_at?formatDateTimeIN(selected.rescheduled_at):null),field('Reschedule note',selected.reschedule_note),
        h('button',{type:'button',onClick:()=>setSelectedId(null)},'Close details'))
    );
  }

  function DirectorOfficeDashboard({profile,onNavigate}){
    const TYPES=['Task','Appointment','Call / Callback','Follow-up','Visitor','Correspondence','Reminder'];
    const TASK_KINDS=['Visit','Buy / Purchase','Attend Function','Trip / Travel','General Task'];
    const PRIORITIES=['Normal','Important','Urgent'];
    const STATUSES=['Pending','In Progress','Completed','Cancelled'];
    const blank=()=>({
      item_type:'Follow-up',task_kind:'General Task',title:'',contact_name:'',contact_mobile:'',organisation:'',
      scheduled_at:'',due_date:todayISOIndia(),day_part:'',priority:'Normal',status:'Pending',details:'',director_note:'',
      needs_director_attention:false,director_responded_at:null
    });
    const [rows,setRows]=React.useState([]);
    const [loading,setLoading]=React.useState(true);
    const [message,setMessage]=React.useState('');
    const [filter,setFilter]=React.useState('Open');
    const [showForm,setShowForm]=React.useState(false);
    const [editingId,setEditingId]=React.useState(null);
    const [form,setForm]=React.useState(blank());
    const [saving,setSaving]=React.useState(false);
    const [waUnread,setWaUnread]=React.useState(0);
    const [feedbackOpen,setFeedbackOpen]=React.useState(0);
    const [officeType,setOfficeType]=React.useState('All');
    const [officeQuery,setOfficeQuery]=React.useState('');
    const [officePeriod,setOfficePeriod]=React.useState('This Week');
    const [officeMonth,setOfficeMonth]=React.useState(()=>todayISOIndia().slice(0,7));
    const [selectedOfficeDate,setSelectedOfficeDate]=React.useState(()=>todayISOIndia());
    const [calendarMonth,setCalendarMonth]=React.useState(()=>{
      const t=new Date(); return new Date(t.getFullYear(),t.getMonth(),1);
    });
    const [isAssignedDirector,setIsAssignedDirector]=React.useState(false);
    const [voiceAuthorized,setVoiceAuthorized]=React.useState(false);
    const [voiceListening,setVoiceListening]=React.useState(false);
    const [voiceProcessing,setVoiceProcessing]=React.useState(false);
    const [voiceTranscript,setVoiceTranscript]=React.useState('');
    const [voiceMessage,setVoiceMessage]=React.useState('');
    const [voiceProvider,setVoiceProvider]=React.useState('auto');
    const [rescheduleTarget,setRescheduleTarget]=React.useState(null);
    const [rescheduleDate,setRescheduleDate]=React.useState('');
    const [rescheduleTime,setRescheduleTime]=React.useState('');
    const [rescheduleNote,setRescheduleNote]=React.useState('');
    const [cancelTarget,setCancelTarget]=React.useState(null);
    const [cancelReason,setCancelReason]=React.useState('');
    const [officeActionBusy,setOfficeActionBusy]=React.useState(false);
    const [manualRefreshing,setManualRefreshing]=React.useState(false);
    const [lastOfficeRefresh,setLastOfficeRefresh]=React.useState(null);
    const voiceRecognitionRef=React.useRef(null);
    const mobileRecorderRef=React.useRef(null);
    const mobileStreamRef=React.useRef(null);
    const mobileChunksRef=React.useRef([]);
    const mobileVoiceLangRef=React.useRef('ta-IN');

    const canUse=(hasDutyRole(profile,'Admin')||hasDutyRole(profile,'STD'));
    const canVoice=hasDutyRole(profile,'STD')||isAssignedDirector||voiceAuthorized;

    function localInputValue(value){
      if(!value)return '';
      const d=new Date(value);
      if(Number.isNaN(d.getTime()))return '';
      const pad=n=>String(n).padStart(2,'0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    function prettyDateTime(value){
      if(!value)return '—';
      const d=new Date(value);
      if(Number.isNaN(d.getTime()))return value;
      return formatDateTimeIN(d);
    }
    function prettyDate(value){
      if(!value)return '—';
      const d=new Date(`${value}T00:00:00`);
      if(Number.isNaN(d.getTime()))return value;
      return formatDateIN(d);
    }
    function isOpen(r){return !['Completed','Cancelled'].includes(r.status)}
    function isToday(value){
      if(!value)return false;
      const d=new Date(value),n=new Date();
      return d.getFullYear()===n.getFullYear()&&d.getMonth()===n.getMonth()&&d.getDate()===n.getDate();
    }

    function officeDateKey(r){
      if(r?.scheduled_at){
        const d=new Date(r.scheduled_at);
        if(!Number.isNaN(d.getTime())){
          const pad=n=>String(n).padStart(2,'0');
          return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
        }
      }
      if(r?.due_date)return String(r.due_date).slice(0,10);
      return '';
    }
    function officePrettySelectedDate(value){
      if(!value)return '';
      const d=new Date(`${value}T00:00:00`);
      if(Number.isNaN(d.getTime()))return value;
      return d.toLocaleDateString('en-IN',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
    }

    function stopVoiceRecognition(){
      try{voiceRecognitionRef.current?.stop?.()}catch(_){}
      voiceRecognitionRef.current=null;
      try{
        if(mobileRecorderRef.current&&mobileRecorderRef.current.state!=='inactive'){
          mobileRecorderRef.current.stop();
        }
      }catch(_){}
      try{mobileStreamRef.current?.getTracks?.().forEach(track=>track.stop())}catch(_){}
      mobileStreamRef.current=null;
      setVoiceListening(false);
    }

    function normalizeVoiceDateTime(value){
      if(!value)return '';
      const d=new Date(String(value));
      if(Number.isNaN(d.getTime()))return String(value).slice(0,16);
      const pad=n=>String(n).padStart(2,'0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }


    function inferDayPart(text){
      const t=String(text||'').toLowerCase();
      if(/\bmorning\b|காலை/.test(t))return 'Morning';
      if(/\bafternoon\b|மதியம்|பிற்பகல்/.test(t))return 'Afternoon';
      if(/\bevening\b|மாலை/.test(t))return 'Evening';
      if(/\bnight\b|இரவு/.test(t))return 'Night';
      return '';
    }

    function taskDateValue(){
      if(form.scheduled_at)return String(form.scheduled_at).slice(0,10);
      return form.due_date||'';
    }

    function taskTimeValue(){
      if(form.scheduled_at&&String(form.scheduled_at).includes('T'))return String(form.scheduled_at).slice(11,16);
      return '';
    }

    function setTaskDate(date){
      const time=taskTimeValue();
      if(date&&time){
        setForm(current=>({...current,scheduled_at:`${date}T${time}`,due_date:''}));
      }else{
        setForm(current=>({...current,scheduled_at:'',due_date:date||''}));
      }
    }

    function setTaskTime(time){
      const date=taskDateValue();
      if(date&&time){
        setForm(current=>({...current,scheduled_at:`${date}T${time}`,due_date:''}));
      }else if(date){
        setForm(current=>({...current,scheduled_at:'',due_date:date}));
      }
    }

    async function interpretVoiceTranscript(transcript,spokenLanguage,providerPreference='auto'){
      const text=String(transcript||'').trim();
      if(!text)return;
      setVoiceProcessing(true);
      setVoiceMessage(spokenLanguage==='ta-IN'?'தமிழ் உரையை எளிய ஆங்கிலமாக மாற்றுகிறோம்…':'Converting speech into the form…');
      try{
        const {data:{session}}=await client.auth.getSession();
        if(!session)throw new Error('Your session has expired. Please sign in again.');
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/director-office-voice`,{
          method:'POST',
          headers:{
            'Content-Type':'application/json',
            'Authorization':`Bearer ${session.access_token}`,
            'apikey':cfg.supabasePublishableKey
          },
          body:JSON.stringify({
            transcript:text,
            spoken_language:spokenLanguage,
            current_form_type:form.item_type||'Follow-up',
            current_task_kind:form.task_kind||'General Task',
            now_iso:new Date().toISOString(),
            timezone:'Asia/Kolkata',
            provider_preference:providerPreference
          })
        });
        const result=await response.json().catch(()=>({error:'Unable to read voice-processing response'}));
        if(!response.ok||result.error)throw new Error(result.error||'Unable to process voice entry.');
        const x=result.fields||{};
        setForm(current=>({
          ...current,
          item_type:x.item_type||current.item_type||'Task',
          task_kind:x.task_kind||current.task_kind||'General Task',
          title:x.title||current.title||'',
          contact_name:x.contact_name||current.contact_name||'',
          contact_mobile:x.contact_mobile||current.contact_mobile||'',
          organisation:x.organisation||current.organisation||'',
          scheduled_at:x.scheduled_at?normalizeVoiceDateTime(x.scheduled_at):current.scheduled_at,
          due_date:x.due_date||current.due_date||'',
          day_part:(x.day_part&&x.day_part!=='Not Applicable')?x.day_part:(current.day_part||inferDayPart(x.details||text)||''),
          priority:x.priority||current.priority||'Normal',
          status:current.status||'Pending',
          details:x.details||current.details||'',
          needs_director_attention:typeof x.needs_director_attention==='boolean'?x.needs_director_attention:current.needs_director_attention
        }));
        setVoiceMessage('✓ Voice entry filled in simple English. Please check the fields before Save.');
      }catch(error){
        setVoiceMessage(error.message||'Unable to process voice entry.');
      }finally{
        setVoiceProcessing(false);
      }
    }

    function shouldUseMobileAudioRecorder(lang=''){
      const ua=String(navigator.userAgent||'');
      const mobileUA=/iPhone|iPad|iPod|Android/i.test(ua);
      const coarse=window.matchMedia&&window.matchMedia('(pointer:coarse)').matches;
      // Always use mobile audio recorder for Tamil to get better capture via Gemini
      const isTamil=String(lang||'').toLowerCase().startsWith('ta');
      return Boolean(mobileUA||coarse||isTamil);
    }

    function bestMobileAudioMime(){
      const candidates=[
        'audio/mp4',
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus'
      ];
      for(const type of candidates){
        try{
          if(window.MediaRecorder&&MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(type))return type;
        }catch(_){}
      }
      return '';
    }

    async function sendMobileAudioForVoice(blob,lang,providerPreference='auto'){
      setVoiceProcessing(true);
      setVoiceMessage(providerPreference==='openai'?'Trying OpenAI…':providerPreference==='gemini'?'Trying Gemini again…':'Trying Gemini first; OpenAI will be used automatically if needed…');
      try{
        const {data:{session}}=await client.auth.getSession();
        if(!session)throw new Error('Your session has expired. Please sign in again.');

        const ext=(blob.type||'').includes('mp4')?'m4a':
          (blob.type||'').includes('ogg')?'ogg':
          (blob.type||'').includes('webm')?'webm':'webm';

        const fd=new FormData();
        fd.append('audio',blob,`samara-voice.${ext}`);
        fd.append('spoken_language',lang);
        fd.append('current_form_type',form.item_type||'Follow-up');
        fd.append('current_task_kind',form.task_kind||'General Task');
        fd.append('provider_preference',providerPreference);
        fd.append('now_iso',new Date().toISOString());
        fd.append('timezone','Asia/Kolkata');

        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/director-office-voice`,{
          method:'POST',
          headers:{
            'Authorization':`Bearer ${session.access_token}`,
            'apikey':cfg.supabasePublishableKey
          },
          body:fd
        });

        const result=await response.json().catch(()=>({error:'Unable to read voice-processing response'}));
        if(!response.ok||result.error)throw new Error(result.error||'Unable to process mobile voice entry.');

        if(result.transcript)setVoiceTranscript(String(result.transcript));
        const x=result.fields||{};
        setForm(current=>({
          ...current,
          item_type:x.item_type||'Task',
          task_kind:x.task_kind||'General Task',
          title:x.title||'',
          contact_name:x.contact_name||'',
          contact_mobile:x.contact_mobile||'',
          organisation:x.organisation||'',
          scheduled_at:x.scheduled_at?normalizeVoiceDateTime(x.scheduled_at):'',
          due_date:x.due_date||'',
          day_part:(x.day_part&&x.day_part!=='Not Applicable')?x.day_part:'',
          priority:x.priority||'Normal',
          status:current.status||'Pending',
          details:x.details||'',
          needs_director_attention:typeof x.needs_director_attention==='boolean'?x.needs_director_attention:false
        }));
        setVoiceMessage(`✓ Voice entry filled in simple English. Processed by ${result?.provider_used||result?.provider||'voice service'}. Please check the fields before Save.`);
      }catch(error){
        setVoiceMessage(error.message||'Unable to process mobile voice entry.');
      }finally{
        setVoiceProcessing(false);
      }
    }

    async function startMobileVoiceRecording(lang='ta-IN',providerPreference='auto'){
      if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){
        setVoiceMessage('Microphone recording is not available in this mobile browser. Please allow microphone access and try Safari/Chrome.');
        return;
      }

      stopVoiceRecognition();
      setVoiceTranscript('');
      setVoiceMessage(lang==='ta-IN'?'🎤 தமிழில் பேசுங்கள். முடிந்ததும் Stop அழுத்துங்கள்.':'🎤 Speak naturally. Tap Stop when finished.');

      try{
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});
        mobileStreamRef.current=stream;
        mobileChunksRef.current=[];
        mobileVoiceLangRef.current=lang;

        const mime=bestMobileAudioMime();
        const recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);
        mobileRecorderRef.current=recorder;

        recorder.ondataavailable=e=>{
          if(e.data&&e.data.size>0)mobileChunksRef.current.push(e.data);
        };

        recorder.onerror=()=>{
          try{stream.getTracks().forEach(track=>track.stop())}catch(_){}
          mobileStreamRef.current=null;
          mobileRecorderRef.current=null;
          setVoiceListening(false);
          setVoiceMessage('Mobile voice recording stopped unexpectedly. Please try again.');
        };

        recorder.onstop=async()=>{
          const actualType=recorder.mimeType||mobileChunksRef.current[0]?.type||'audio/webm';
          const blob=new Blob(mobileChunksRef.current,{type:actualType});
          mobileChunksRef.current=[];
          try{stream.getTracks().forEach(track=>track.stop())}catch(_){}
          mobileStreamRef.current=null;
          mobileRecorderRef.current=null;
          setVoiceListening(false);

          if(blob.size<1000){
            setVoiceMessage('No useful speech was captured. Please try again.');
            return;
          }
          await sendMobileAudioForVoice(blob,mobileVoiceLangRef.current,providerPreference);
        };

        recorder.start();
        setVoiceListening(true);
      }catch(error){
        setVoiceListening(false);
        try{mobileStreamRef.current?.getTracks?.().forEach(track=>track.stop())}catch(_){}
        mobileStreamRef.current=null;
        mobileRecorderRef.current=null;
        const msg=String(error?.name||'');
        setVoiceMessage(msg==='NotAllowedError'
          ?'Microphone permission is blocked. Please allow microphone access for Samara Care and try again.'
          :(error.message||'Unable to start mobile microphone.'));
      }
    }

    function startVoiceEntry(lang='ta-IN',providerPreference='auto'){
      if(!canVoice)return;
      if(shouldUseMobileAudioRecorder(lang)){
        startMobileVoiceRecording(lang,providerPreference);
        return;
      }
      const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
      if(!SpeechRecognition){
        setVoiceMessage('Voice recognition is not available in this browser. Please try Chrome/Edge or the installed Samara Care app.');
        return;
      }
      stopVoiceRecognition();
      setVoiceTranscript('');
      setVoiceMessage(lang==='ta-IN'?'🎤 தமிழில் இயல்பாக பேசுங்கள்…':'🎤 Speak naturally in English…');
      try{
        const recognition=new SpeechRecognition();
        recognition.lang=lang;
        recognition.interimResults=true;
        recognition.continuous=true;
        recognition.maxAlternatives=1;
        voiceRecognitionRef.current=recognition;
        let finalText='';
        recognition.onstart=()=>setVoiceListening(true);
        recognition.onresult=event=>{
          let interim='';
          for(let i=event.resultIndex;i<event.results.length;i++){
            const t=event.results[i][0]?.transcript||'';
            if(event.results[i].isFinal)finalText+=`${t} `;
            else interim+=t;
          }
          setVoiceTranscript((finalText||interim).trim());
        };
        recognition.onerror=event=>{
          setVoiceListening(false);
          voiceRecognitionRef.current=null;
          const code=String(event?.error||'');
          setVoiceMessage(code==='not-allowed'
            ?'Microphone permission is blocked. Please allow microphone access for Samara Care and try again.'
            :`Voice recognition stopped${code?`: ${code}`:''}. Please try again.`);
        };
        recognition.onend=()=>{
          // Only stop if user manually stopped (voiceListening is already false)
          if(!voiceListening){
            voiceRecognitionRef.current=null;
            const spoken=String(finalText||'').trim();
            if(spoken){
              setVoiceTranscript(spoken);
              interpretVoiceTranscript(spoken,lang,providerPreference);
            }else{
              setVoiceMessage(current=>current.startsWith('🎤')?'No speech was captured. Please try again.':current);
            }
          }else{
            // Restart recognition if still listening (continuous mode)
            try{
              recognition.start();
            }catch(e){
              setVoiceListening(false);
              voiceRecognitionRef.current=null;
            }
          }
        };
        recognition.start();
      }catch(error){
        setVoiceListening(false);
        voiceRecognitionRef.current=null;
        setVoiceMessage(error.message||'Unable to start microphone.');
      }
    }

    async function load(){
      setLoading(true);setMessage('');
      const {data,error}=await client.from('director_office_items').select('*').order('created_at',{ascending:false}).limit(500);
      if(error){
        setRows([]);
        setMessage(error.message?.includes('director_office_items')
          ?'Director’s Office database setup is pending. Please run SQL file 105_director_office_workspace.sql once.'
          :`Unable to load Director’s Office: ${error.message||error}`);
      }else{
        setRows(data||[]);
        setLastOfficeRefresh(new Date());
      }
      setLoading(false);
    }
    async function refreshDirectorOffice(){
      if(manualRefreshing)return;
      setManualRefreshing(true);
      try{
        await Promise.all([load(),loadCommunicationCounts()]);
      }finally{
        setManualRefreshing(false);
      }
    }
    async function loadCommunicationCounts(){
      try{
        const {data:waRows}=await client.from('hr_whatsapp_communications')
          .select('*')
          .eq('direction','inbound')
          .order('created_at',{ascending:false})
          .limit(500);
        setWaUnread(directorEnquiryConversations(waRows||[]).length);
      }catch(_){setWaUnread(0)}
      try{
        const {data:fbRows}=await client.from('feedback')
          .select('id,status')
          .limit(500);
        setFeedbackOpen((fbRows||[]).filter(r=>!['Closed','Resolved'].includes(String(r.status||''))).length);
      }catch(_){setFeedbackOpen(0)}
    }

    React.useEffect(()=>{
      if(!canUse)return;
      let cancelled=false;
      (async()=>{
        try{
          const {data:{session}}=await client.auth.getSession();
          if(!session)return;
          const response=await fetch(`${cfg.supabaseUrl}/functions/v1/director-office-voice`,{
            method:'POST',
            headers:{
              'Authorization':`Bearer ${session.access_token}`,
              'apikey':cfg.supabasePublishableKey,
              'Content-Type':'application/json'
            },
            body:JSON.stringify({
              transcript:'',
              spoken_language:'ta-IN',
              current_form_type:'Task',
              current_task_kind:'General Task',
              now_iso:new Date().toISOString(),
              timezone:'Asia/Kolkata'
            })
          });
          const result=await response.json().catch(()=>({}));
          // The Edge Function authenticates Director/STD before validating transcript.
          // Authorized users therefore reach "No speech transcript received" (400);
          // unrelated Admins are rejected earlier with 403.
          if(!cancelled){
            setVoiceAuthorized(
              response.status===400 &&
              String(result?.error||'').toLowerCase().includes('no speech transcript')
            );
          }
        }catch(_){
          if(!cancelled)setVoiceAuthorized(false);
        }
      })();
      return()=>{cancelled=true};
    },[profile?.id,profile?.role]);

    React.useEffect(()=>{
      if(!canUse){setLoading(false);return}
      (async()=>{
        try{
          const {data}=await client.from('director_office_positions')
            .select('assigned_profile_id')
            .eq('position_key','director')
            .maybeSingle();
          setIsAssignedDirector(String(data?.assigned_profile_id||'')===String(profile?.id||''));
        }catch(_){setIsAssignedDirector(false)}
      })();
      load();loadCommunicationCounts();
      const ch=client.channel('director-office-live')
        .on('postgres_changes',{event:'*',schema:'public',table:'director_office_items'},load)
        .subscribe();
      const comm=client.channel('director-office-communications-live')
        .on('postgres_changes',{event:'*',schema:'public',table:'hr_whatsapp_communications'},loadCommunicationCounts)
        .on('postgres_changes',{event:'*',schema:'public',table:'feedback'},loadCommunicationCounts)
        .subscribe();
      return()=>{client.removeChannel(ch);client.removeChannel(comm)};
    },[]);

    function openNew(type='Follow-up'){
      stopVoiceRecognition();setVoiceTranscript('');setVoiceMessage('');
      setEditingId(null);setForm({...blank(),item_type:type});setMessage('');setShowForm(true);
    }
    function editRow(r){
      stopVoiceRecognition();setVoiceTranscript('');setVoiceMessage('');
      setEditingId(r.id);
      setForm({
        item_type:r.item_type||'Follow-up',
        task_kind:r.task_kind||'General Task',
        title:r.title||'',
        contact_name:r.contact_name||'',
        contact_mobile:r.contact_mobile||'',
        organisation:r.organisation||'',
        scheduled_at:localInputValue(r.scheduled_at),
        due_date:r.due_date||(r.scheduled_at?'':todayISOIndia()),
        day_part:inferDayPart(r.details||''),
        priority:r.priority||'Normal',
        status:r.status||'Pending',
        details:r.details||'',
        director_note:r.director_note||'',
        needs_director_attention:Boolean(r.needs_director_attention),
        director_responded_at:r.director_responded_at||null
      });
      setShowForm(true);
    }
    async function save(e){
      e.preventDefault();
      if(saving)return;
      if(!form.title.trim())return setMessage('Please enter the subject / purpose.');
      if(!taskDateValue())return setMessage('Please select a Scheduled / Due Date.');
      setSaving(true);setMessage('');
      let detailsForSave=form.details.trim();
      if(form.item_type==='Task'&&form.day_part){
        const hasDayPart=inferDayPart(detailsForSave);
        if(!hasDayPart){
          detailsForSave=detailsForSave?`${detailsForSave} (${form.day_part})`:form.day_part;
        }
      }
      const payload={
        item_type:form.item_type,
        task_kind:form.item_type==='Task'?(form.task_kind||'General Task'):null,
        title:form.title.trim(),
        contact_name:form.contact_name.trim()||null,
        contact_mobile:form.contact_mobile.trim()||null,
        organisation:form.organisation.trim()||null,
        scheduled_at:form.scheduled_at?new Date(form.scheduled_at).toISOString():null,
        due_date:form.due_date||null,
        priority:form.priority,
        status:form.status,
        details:detailsForSave||null,
        director_note:form.director_note.trim()||null,
        needs_director_attention:Boolean(form.needs_director_attention),
        updated_at:new Date().toISOString()
      };
      if(isAssignedDirector&&form.director_note.trim()&&form.needs_director_attention){
        payload.director_responded_at=new Date().toISOString();
      }else if(!form.needs_director_attention){
        payload.director_responded_at=null;
      }
      let res;
      if(editingId)res=await client.from('director_office_items').update(payload).eq('id',editingId);
      else res=await client.from('director_office_items').insert(payload);
      if(res.error){
        setMessage(res.error.message||'Unable to save.');
        setSaving(false);
      }else{
        const wasEditing=Boolean(editingId);
        stopVoiceRecognition();
        setShowForm(false);
        setEditingId(null);
        setForm(blank());
        setSaving(false);
        setVoiceTranscript('');
        setVoiceMessage('');
        setMessage(wasEditing?'Item updated successfully.':'Task saved successfully. Tap + Quick Task to add another.');
        await load();
      }
    }
    async function markComplete(r){
      const {error}=await client.from('director_office_items').update({status:'Completed',updated_at:new Date().toISOString()}).eq('id',r.id);
      if(error)setMessage(error.message||'Unable to complete item');else await load();
    }
    function openReschedule(r){
      const local=r.scheduled_at?localInputValue(r.scheduled_at):'';
      setRescheduleTarget(r);
      setRescheduleDate(local?local.slice(0,10):(r.due_date||''));
      setRescheduleTime(local&&local.includes('T')?local.slice(11,16):'');
      setRescheduleNote('');
      setMessage('');
    }
    async function saveReschedule(e){
      e.preventDefault();
      if(officeActionBusy||!rescheduleTarget)return;
      if(!rescheduleDate)return setMessage('Please select the new date.');
      setOfficeActionBusy(true);setMessage('');
      const now=new Date().toISOString();
      const newScheduledAt=rescheduleTime?new Date(`${rescheduleDate}T${rescheduleTime}`).toISOString():null;
      const newDueDate=rescheduleTime?null:rescheduleDate;
      const history=Array.isArray(rescheduleTarget.reschedule_history)?[...rescheduleTarget.reschedule_history]:[];
      history.push({
        at:now,
        by:profile?.id||null,
        old_scheduled_at:rescheduleTarget.scheduled_at||null,
        old_due_date:rescheduleTarget.due_date||null,
        new_scheduled_at:newScheduledAt,
        new_due_date:newDueDate,
        note:rescheduleNote.trim()||null
      });
      const {error}=await client.from('director_office_items').update({
        scheduled_at:newScheduledAt,
        due_date:newDueDate,
        status:'Pending',
        rescheduled_at:now,
        reschedule_note:rescheduleNote.trim()||null,
        reschedule_history:history,
        updated_at:now
      }).eq('id',rescheduleTarget.id);
      setOfficeActionBusy(false);
      if(error){setMessage(error.message||'Unable to reschedule item');return;}
      setRescheduleTarget(null);setRescheduleDate('');setRescheduleTime('');setRescheduleNote('');
      setMessage('Item rescheduled successfully.');
      await load();
    }
    function openCancelItem(r){
      setCancelTarget(r);
      setCancelReason('');
      setMessage('');
    }
    async function saveCancelItem(e){
      e.preventDefault();
      if(officeActionBusy||!cancelTarget)return;
      setOfficeActionBusy(true);setMessage('');
      const now=new Date().toISOString();
      const {error}=await client.from('director_office_items').update({
        status:'Cancelled',
        cancel_reason:cancelReason.trim()||null,
        cancelled_at:now,
        updated_at:now
      }).eq('id',cancelTarget.id);
      setOfficeActionBusy(false);
      if(error){setMessage(error.message||'Unable to cancel item');return;}
      setCancelTarget(null);setCancelReason('');
      setMessage('Item cancelled and retained in history.');
      await load();
    }
    async function markDirectorResponded(r){
      const {error}=await client.from('director_office_items').update({
        director_responded_at:new Date().toISOString(),
        updated_at:new Date().toISOString()
      }).eq('id',r.id);
      if(error)setMessage(error.message||'Unable to update Director response.');else await load();
    }

    if(!canUse)return h(Section,{title:"Director's Office",subtitle:'Restricted workspace'},h('div',{className:'empty'},'This workspace is available only to the Director / Administrator and Secretary to the Director.'));

    const openRows=rows.filter(isOpen);
    const todayKey=todayISOIndia();
    const todayItems=rows
      .filter(r=>officeDateKey(r)===todayKey&&r.status!=='Cancelled')
      .sort((a,b)=>String(a.scheduled_at||a.due_date||'').localeCompare(String(b.scheduled_at||b.due_date||'')));
    const todayAppointments=openRows.filter(r=>r.item_type==='Appointment'&&officeDateKey(r)===todayKey);
    const calls=openRows.filter(r=>r.item_type==='Call / Callback');
    const followups=openRows.filter(r=>r.item_type==='Follow-up');
    const visitors=openRows.filter(r=>r.item_type==='Visitor');
    const correspondence=openRows.filter(r=>r.item_type==='Correspondence');
    const reminders=openRows.filter(r=>r.item_type==='Reminder');
    const tasks=openRows.filter(r=>r.item_type==='Task');
    const urgent=openRows.filter(r=>r.priority==='Urgent');

    const calendarCounts=rows.reduce((acc,r)=>{
      const key=officeDateKey(r);
      if(key&&r.status!=='Cancelled')acc[key]=(acc[key]||0)+1;
      return acc;
    },{});

    const officeRange=directorOfficeRange(officePeriod,selectedOfficeDate,officeMonth,selectedOfficeDate);
    const officeRangeLabel=officePeriod==='Date'?(selectedOfficeDate===todayKey?"Today's Items":officePrettySelectedDate(selectedOfficeDate)):`${officePeriod==='This Week'&&mondayOfWeek(selectedOfficeDate)!==mondayOfWeek(todayKey)?'Week':officePeriod} · ${prettyDate(officeRange.from)} – ${prettyDate(officeRange.to)}`;
    const filtered=rows.filter(r=>{
      const itemDate=officeDateKey(r);
      if(filter==='Overdue'){if(!itemDate||itemDate>=todayKey||!isOpen(r))return false;}
      else if(!itemDate||itemDate<officeRange.from||itemDate>officeRange.to)return false;
      if(officeType!=='All'&&r.item_type!==officeType)return false;
      let typeOk=false;
      if(filter==='Overdue')typeOk=true;
      else if(filter==='All')typeOk=r.status!=='Cancelled';
      else if(filter==='Open')typeOk=isOpen(r);
      else if(filter==='For Director')typeOk=isOpen(r)&&Boolean(r.needs_director_attention)&&!r.director_responded_at;
      else if(filter==='Completed')typeOk=r.status==='Completed';
      else if(filter==='Cancelled')typeOk=r.status==='Cancelled';
      else if(filter==='Today')typeOk=selectedOfficeDate===todayKey&&r.status!=='Cancelled';
      else typeOk=r.item_type===filter;
      if(!typeOk)return false;
      const hay=`${r.title||''} ${r.contact_name||''} ${r.contact_mobile||''} ${r.organisation||''} ${r.details||''}`.toLowerCase();
      if(officeQuery&&!hay.includes(officeQuery.toLowerCase()))return false;
      return true;
    }).sort((a,b)=>String(a.scheduled_at||a.due_date||'').localeCompare(String(b.scheduled_at||b.due_date||'')));

    function selectOfficeDate(dateKey){
      setOfficePeriod('Date');
      setSelectedOfficeDate(dateKey);
      setFilter('Open');
      const d=new Date(`${dateKey}T00:00:00`);
      if(!Number.isNaN(d.getTime()))setCalendarMonth(new Date(d.getFullYear(),d.getMonth(),1));
    }

    function moveOfficePeriod(direction){
      if(officePeriod==='Monthly'){
        const [y,m]=officeMonth.split('-').map(Number);
        const d=new Date(Date.UTC(y,m-1+direction,1));
        setOfficeMonth(d.toISOString().slice(0,7));
      }else setSelectedOfficeDate(addDaysISO(selectedOfficeDate,direction*(officePeriod==='Date'?1:7)));
    }
    const officeWeekLabel=officeRange.from===mondayOfWeek(todayKey)?'This Week':officeRange.from===addDaysISO(mondayOfWeek(todayKey),-7)?'Previous Week':officeRange.from===addDaysISO(mondayOfWeek(todayKey),7)?'Next Week':'Selected Week';
    const officeCalendarCategories=[['Task','Tasks','#b31561'],['Appointment','Appointments','#168b81'],['Call / Callback','Calls','#3976d2'],['Follow-up','Follow-ups','#e69b23'],['Others','Others','#8856ba']];
    function renderDirectorCalendar(){
      if(officePeriod==='Date')return h('label',null,'Date ',h('input',{type:'date',value:selectedOfficeDate,onChange:e=>{if(e.target.value)selectOfficeDate(e.target.value);}}));
      const days=[];
      const padding=officePeriod==='Monthly'?(parseISODateUTC(officeRange.from).getUTCDay()+6)%7:0;
      for(let i=0;i<padding;i++)days.push(null);
      for(let d=officeRange.from;d<=officeRange.to;d=addDaysISO(d,1))days.push(d);
      return h('div',{className:'office-simple-calendar'},
        h('div',{className:'office-seven'},...['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>h('strong',{key:d},d))),
        h('div',{className:'office-seven'},...days.map((d,i)=>{
          if(!d)return h('span',{key:'blank'+i});
          const items=rows.filter(r=>officeDateKey(r)===d&&r.status!=='Cancelled');
          const present=officeCalendarCategories.filter(([key])=>items.some(r=>key==='Others'?!['Task','Appointment','Call / Callback','Follow-up'].includes(r.item_type):r.item_type===key));
          const description=present.map(([,label])=>label).join(', ');
          return h('button',{type:'button',key:d,className:'office-day'+(d===todayKey?' office-today':''),'aria-label':officePrettySelectedDate(d)+', '+items.length+' jobs'+(description?', '+description:''),title:description,onClick:()=>selectOfficeDate(d)},
            h('strong',null,Number(d.slice(-2))),
            h('span',{className:'office-event-dots','aria-hidden':true},...present.map(([key,label,color])=>h('i',{key,style:{background:color}}))),
            h('small',null,items.length+' '+(items.length===1?'job':'jobs')));
        })),
        h('div',{className:'office-dot-legend'},...officeCalendarCategories.map(([key,label,color])=>h('span',{key},h('i',{style:{background:color}}),label)))
      );
    }

    function openDirectorQueue(filterValue){
      if(filterValue==='Today')selectOfficeDate(todayKey);
      if(TYPES.includes(filterValue)){setOfficeType(filterValue);setFilter('Open');}
      else {setOfficeType('All');setFilter(filterValue);}
      window.setTimeout(()=>{
        const target=document.getElementById('director-followup-queue-anchor');
        if(target){
          target.scrollIntoView({behavior:'smooth',block:'start'});
        }
      },80);
    }

    const card=(label,value,filterValue,sub)=>h('button',{
      type:'button',
      onClick:()=>openDirectorQueue(filterValue),
      style:{
        textAlign:'left',
        border:'1px solid #e9b6ca',
        borderRadius:'18px',
        background:'linear-gradient(145deg,#fff7fa 0%,#fbe4ed 58%,#f7d5e3 100%)',
        padding:'15px 17px',
        cursor:'pointer',
        minHeight:'96px',
        boxShadow:'0 8px 20px rgba(139,19,76,.09)',
        borderTop:'3px solid #c2185b'
      }
    },
      h('div',{style:{fontSize:'28px',fontWeight:900,color:'#7f174a'}},value),
      h('div',{style:{fontWeight:850,color:'#351b29',marginTop:'2px'}},label),
      h('small',{style:{color:'#846d79'}},sub||'Tap to view')
    );

    const commCard=(label,value,icon,subtitle,target)=>h('button',{
      type:'button',
      onClick:()=>dashboardNavigate(onNavigate,target,label,{source:"Director's Office"}),
      style:{
        textAlign:'left',
        border:'1px solid #e5a9c1',
        borderRadius:'20px',
        background:'linear-gradient(135deg,#fff4f8 0%,#f8dbe7 55%,#f1c3d5 100%)',
        padding:'17px 18px',
        cursor:'pointer',
        minHeight:'106px',
        boxShadow:'0 10px 24px rgba(128,18,70,.11)',
        borderLeft:'5px solid #b40d52'
      }
    },
      h('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'10px'}},
        h('span',{style:{fontSize:'27px'}},icon),
        h('strong',{style:{fontSize:'29px',fontWeight:950,color:'#9b124f'}},value)
      ),
      h('div',{style:{fontWeight:900,color:'#351b29',marginTop:'5px',fontSize:'15px'}},label),
      h('small',{style:{color:'#846d79'}},subtitle)
    );

    const itemCard=(r,index)=>h('div',{key:r.id,style:{
      border:'1px solid #e8bfd0',
      borderRadius:'16px',
      background:'linear-gradient(145deg,#fffafd 0%,#fcecf3 100%)',
      padding:'13px 14px',
      display:'grid',
      gap:'8px',
      boxShadow:'0 5px 15px rgba(122,24,69,.06)',
      borderLeft:'4px solid #cf2c70'
    }},
      h('div',{className:'director-item-heading',style:{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:'10px',alignItems:'start'}},
        h('div',{style:{display:'flex',alignItems:'flex-start',gap:'10px',minWidth:0,flex:'1 1 auto'}},
          h('span',{className:'director-item-serial','aria-label':`Item ${index+1}`},String(index+1)),
          h('div',{style:{minWidth:0}},
            h('strong',{style:{fontSize:'15px',color:'#351b29',overflowWrap:'anywhere'}},r.title),
          h('div',{style:{fontSize:'12px',color:'#806a76',marginTop:'3px'}},`${r.item_type==='Task'?(r.task_kind||'Task'):r.item_type} · ${r.priority||'Normal'}`)
          )
        ),
        h('span',{className:'badge',style:{justifySelf:'end',alignSelf:'start',whiteSpace:'nowrap'}},r.status||'Pending')
      ),
      (r.contact_name||r.organisation||r.contact_mobile)?h('div',{style:{fontSize:'13px',color:'#4e4248'}},
        [r.contact_name,r.organisation,r.contact_mobile].filter(Boolean).join(' · ')
      ):null,
      r.scheduled_at?h('div',{style:{fontSize:'13px'}},h('b',null,'Schedule: '),prettyDateTime(r.scheduled_at)):null,
      r.due_date?h('div',{style:{fontSize:'13px'}},h('b',null,'Due: '),prettyDate(r.due_date)):null,
      r.details?h('div',{style:{fontSize:'13px',lineHeight:'1.45',whiteSpace:'pre-wrap'}},r.details):null,
      r.rescheduled_at?h('div',{style:{fontSize:'12px',color:'#6f5360',background:'#fff7e9',borderRadius:'9px',padding:'6px 9px',width:'fit-content'}},`↻ Rescheduled${r.reschedule_note?`: ${r.reschedule_note}`:''}`):null,
      r.status==='Cancelled'?h('div',{style:{fontSize:'12px',color:'#7b2737',background:'#fff0f1',borderRadius:'9px',padding:'6px 9px',width:'fit-content'}},`Cancelled${r.cancel_reason?`: ${r.cancel_reason}`:''}`):null,
      r.needs_director_attention?h('div',{style:{fontSize:'12px',fontWeight:900,color:r.director_responded_at?'#176a52':'#9a174d',background:r.director_responded_at?'#eaf7f1':'#fde8f0',borderRadius:'999px',padding:'6px 10px',width:'fit-content'}},r.director_responded_at?'✓ Director Responded':'● For Director'):null,
      r.director_note?h('div',{style:{fontSize:'13px',lineHeight:'1.45',background:'#fff7e6',borderRadius:'10px',padding:'8px 10px'}},h('b',null,'Director note: '),r.director_note):null,
      h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
        h('button',{type:'button',className:'btn btn-secondary',onClick:()=>editRow(r)},isAssignedDirector?'View / Add Instruction':'Open / Edit'),
        isAssignedDirector&&r.needs_director_attention&&!r.director_responded_at?h('button',{type:'button',className:'btn btn-secondary',onClick:()=>markDirectorResponded(r)},'✓ Director Responded'):null,
        isOpen(r)?h('button',{type:'button',className:'btn btn-secondary',onClick:()=>openReschedule(r)},'↻ Reschedule'):null,
        isOpen(r)?h('button',{type:'button',className:'btn btn-primary',onClick:()=>markComplete(r)},'✓ Complete'):null,
        isOpen(r)?h('button',{type:'button',className:'btn btn-secondary',onClick:()=>openCancelItem(r),style:{color:'#92213b'}},'Cancel'):null
      )
    );

    const formModal=showForm?h('div',{className:'modal-backdrop director-office-modal'},
      h('form',{className:'card modal',onSubmit:save,style:{maxWidth:'760px'}},
        h('div',{className:'panel-head'},
          h('div',null,h('h3',null,form.item_type==='Task'?(editingId?'Update Task':'New Quick Task'):(editingId?'Update Director’s Office Item':'New Director’s Office Item')),h('small',null,form.item_type==='Task'?'Short personal task — only the essentials':'Keep only the details needed for Director follow-up')),
          h('button',{type:'button',className:'close',onClick:()=>{stopVoiceRecognition();setShowForm(false)}},'×')
        ),
        canVoice?h('div',{style:{margin:'0 0 14px',padding:'12px',border:'1px solid #e7bfd0',borderRadius:'15px',background:'linear-gradient(135deg,#fffafd,#f9e6ee)'}},
          h('div',{style:{display:'flex',justifyContent:'space-between',gap:'8px',alignItems:'center',flexWrap:'wrap'}},
            h('div',null,
              h('strong',{style:{color:'#78103f'}},'🎤 Voice Entry'),
              h('div',{style:{fontSize:'12px',color:'#765966',marginTop:'2px'}},shouldUseMobileAudioRecorder()?'Tap Speak, talk naturally, then tap Stop. Tamil/English will be converted and the form will be filled.':'Speak naturally. Tamil will be converted to simple English and the form will be filled for you.')
            ),
            voiceListening?h('button',{type:'button',className:'btn btn-danger',onClick:stopVoiceRecognition},'■ Stop'):
            h('div',{className:'actions'},
              h('button',{type:'button',className:'btn btn-primary',disabled:voiceProcessing,onClick:()=>startVoiceEntry('ta-IN')},voiceProcessing?'Processing…':'🎤 Speak Tamil'),
              h('button',{type:'button',className:'btn btn-secondary',disabled:voiceProcessing,onClick:()=>startVoiceEntry('en-IN')},'🎤 Speak English')
            ),
            !voiceListening&&h('div',{className:'actions',style:{marginTop:'6px'}},
              h('button',{type:'button',className:'btn btn-outline',disabled:voiceProcessing,onClick:()=>startVoiceEntry('ta-IN','openai'),style:{fontSize:'11px',padding:'4px 8px'}},'Retry with OpenAI'),
              h('button',{type:'button',className:'btn btn-outline',disabled:voiceProcessing,onClick:()=>startVoiceEntry('ta-IN','gemini'),style:{fontSize:'11px',padding:'4px 8px'}},'Retry with Gemini')
            )
          ),
          voiceTranscript?h('div',{style:{marginTop:'9px',padding:'8px 10px',borderRadius:'10px',background:'#fff',fontSize:'13px'}},
            h('small',{style:{display:'block',color:'#8b6b78',marginBottom:'3px'}},'Heard'),
            h('div',{style:{fontWeight:700}},voiceTranscript)
          ):null,
          voiceMessage?h('div',{style:{marginTop:'8px',fontSize:'12px',fontWeight:800,color:voiceMessage.startsWith('✓')?'#17653c':'#7c2448'}},voiceMessage):null
        ):null,
        form.item_type==='Task'
          ?h('div',{className:'modal-grid'},
            h('div',{className:'field'},h('label',null,'Type'),h('select',{value:form.item_type,onChange:e=>setForm({...form,item_type:e.target.value})},TYPES.map(x=>h('option',{key:x},x)))),
            h('div',{className:'field'},h('label',null,'Task'),h('select',{value:form.task_kind||'General Task',onChange:e=>setForm({...form,task_kind:e.target.value})},TASK_KINDS.map(x=>h('option',{key:x},x)))),
            h('div',{className:'field span-2'},h('label',null,'What to do? *'),h('input',{required:true,value:form.title,onChange:e=>setForm({...form,title:e.target.value}),placeholder:form.task_kind==='Visit'?'Example: Visit Dr. Ravi':form.task_kind==='Buy / Purchase'?'Example: Buy office printer':form.task_kind==='Attend Function'?'Example: Attend hospital inauguration':form.task_kind==='Trip / Travel'?'Example: Chennai to Trichy trip':'Enter task'})),
            h('div',{className:'field span-2'},h('label',null,'Person / Place (optional)'),h('input',{value:form.contact_name,onChange:e=>setForm({...form,contact_name:e.target.value}),placeholder:'Name or place'})),
            h('div',{className:'field'},h('label',null,'Scheduled / Due Date *'),h(StrictDateInput,{required:true,value:taskDateValue(),onChange:e=>setTaskDate(e.target.value)})),
            h('div',{className:'field'},h('label',null,'Time (optional)'),h('input',{type:'time',value:taskTimeValue(),onChange:e=>setTaskTime(e.target.value)})),
            h('div',{className:'field'},h('label',null,'Day Part (optional)'),h('select',{value:form.day_part||'',onChange:e=>setForm({...form,day_part:e.target.value})},
              h('option',{value:''},'—'),
              ['Morning','Afternoon','Evening','Night'].map(x=>h('option',{key:x,value:x},x))
            )),
            h('div',{className:'field'},h('label',null,'Priority'),h('select',{value:form.priority,onChange:e=>setForm({...form,priority:e.target.value})},PRIORITIES.map(x=>h('option',{key:x},x)))),
            h('div',{className:'field span-2'},h('label',null,'Short Note (optional)'),h('textarea',{rows:2,value:form.details,onChange:e=>setForm({...form,details:e.target.value}),placeholder:'Anything important to remember'})),
            editingId?h('div',{className:'field'},h('label',null,'Status'),h('select',{value:form.status,onChange:e=>setForm({...form,status:e.target.value})},STATUSES.map(x=>h('option',{key:x},x)))):null
          )
          :h('div',{className:'modal-grid'},
            h('div',{className:'field'},h('label',null,'Type'),h('select',{value:form.item_type,onChange:e=>setForm({...form,item_type:e.target.value})},TYPES.map(x=>h('option',{key:x},x)))),
            h('div',{className:'field'},h('label',null,'Priority'),h('select',{value:form.priority,onChange:e=>setForm({...form,priority:e.target.value})},PRIORITIES.map(x=>h('option',{key:x},x)))),
            h('div',{className:'field span-2'},h('label',null,form.item_type==='Call / Callback'?'Call Subject / Enquiry *':'Subject / Purpose *'),h('input',{required:true,value:form.title,onChange:e=>setForm({...form,title:e.target.value}),placeholder:'Example: Call Dr. ___ regarding referral'})),
            h('div',{className:'field'},h('label',null,form.item_type==='Call / Callback'?'Caller Name':'Person / Visitor'),h('input',{value:form.contact_name,onChange:e=>setForm({...form,contact_name:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Mobile'),h('input',{value:form.contact_mobile,onChange:e=>setForm({...form,contact_mobile:e.target.value}),inputMode:'tel'})),
            h('div',{className:'field span-2'},h('label',null,'Organisation'),h('input',{value:form.organisation,onChange:e=>setForm({...form,organisation:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Scheduled / Due Date *'),h(StrictDateInput,{required:true,value:taskDateValue(),onChange:e=>setTaskDate(e.target.value)})),
            h('div',{className:'field'},h('label',null,'Time (optional)'),h('input',{type:'time',value:taskTimeValue(),onChange:e=>setTaskTime(e.target.value)})),
            h('div',{className:'field'},h('label',null,'Status'),h('select',{value:form.status,onChange:e=>setForm({...form,status:e.target.value})},STATUSES.map(x=>h('option',{key:x},x)))),
            h('div',{className:'field span-2'},h('label',null,'Details'),h('textarea',{rows:3,value:form.details,onChange:e=>setForm({...form,details:e.target.value}),placeholder:'Short notes / action required'})),
            h('div',{className:'field span-2'},h('label',{style:{display:'flex',alignItems:'center',gap:'9px',fontWeight:900,color:'#7d1547'}},
              h('input',{type:'checkbox',checked:Boolean(form.needs_director_attention),onChange:e=>setForm({...form,needs_director_attention:e.target.checked,director_responded_at:e.target.checked?form.director_responded_at:null}),style:{width:'18px',height:'18px'}}),
              'Needs Director Attention'
            ),h('small',null,'Use only when the Director must decide, instruct or return a call.')),
            h('div',{className:'field span-2'},h('label',null,isAssignedDirector?'Director Instruction':'Director Note / Instruction'),h('textarea',{rows:2,value:form.director_note,onChange:e=>setForm({...form,director_note:e.target.value}),placeholder:isAssignedDirector?'Enter your instruction / decision':'Optional instruction or decision'}))
          ),
        h('div',{className:'modal-actions'},
          h('button',{type:'button',className:'btn btn-secondary',disabled:saving,onClick:()=>{stopVoiceRecognition();setShowForm(false)}},'Cancel'),
          h('button',{type:'submit',className:'btn btn-primary',disabled:saving},saving?'Saving…':'Save')
        )
      )
    ):null;

    const rescheduleModal=rescheduleTarget?h('div',{className:'modal-backdrop'},
      h('form',{className:'card modal',onSubmit:saveReschedule,style:{maxWidth:'520px'}},
        h('div',{className:'panel-head'},
          h('div',null,h('h3',null,'Reschedule'),h('small',null,rescheduleTarget.title||'Director’s Office item')),
          h('button',{type:'button',className:'close',disabled:officeActionBusy,onClick:()=>setRescheduleTarget(null)},'×')
        ),
        h('div',{className:'modal-grid'},
          h('div',{className:'field'},h('label',null,'New Date *'),h(StrictDateInput,{required:true,value:rescheduleDate,onChange:e=>setRescheduleDate(e.target.value)})),
          h('div',{className:'field'},h('label',null,'Time (optional)'),h('input',{type:'time',value:rescheduleTime,onChange:e=>setRescheduleTime(e.target.value)})),
          h('div',{className:'field span-2'},h('label',null,'Reason / Note (optional)'),h('textarea',{rows:3,value:rescheduleNote,onChange:e=>setRescheduleNote(e.target.value),placeholder:'Example: Director requested a later time'}))
        ),
        h('div',{className:'modal-actions'},
          h('button',{type:'button',className:'btn btn-secondary',disabled:officeActionBusy,onClick:()=>setRescheduleTarget(null)},'Cancel'),
          h('button',{type:'submit',className:'btn btn-primary',disabled:officeActionBusy},officeActionBusy?'Saving…':'Save New Schedule')
        )
      )
    ):null;

    const cancelModal=cancelTarget?h('div',{className:'modal-backdrop'},
      h('form',{className:'card modal',onSubmit:saveCancelItem,style:{maxWidth:'520px'}},
        h('div',{className:'panel-head'},
          h('div',null,h('h3',null,'Cancel Item'),h('small',null,cancelTarget.title||'Director’s Office item')),
          h('button',{type:'button',className:'close',disabled:officeActionBusy,onClick:()=>setCancelTarget(null)},'×')
        ),
        h('p',{style:{marginTop:'4px'}},'This item will not be deleted. It will be moved to Cancelled history.'),
        h('div',{className:'field'},h('label',null,'Cancellation Reason (optional)'),h('textarea',{rows:3,value:cancelReason,onChange:e=>setCancelReason(e.target.value),placeholder:'Short reason, if needed'})),
        h('div',{className:'modal-actions'},
          h('button',{type:'button',className:'btn btn-secondary',disabled:officeActionBusy,onClick:()=>setCancelTarget(null)},'Keep Item'),
          h('button',{type:'submit',className:'btn btn-primary',disabled:officeActionBusy},officeActionBusy?'Cancelling…':'Cancel Item')
        )
      )
    ):null;

    return h('div',{className:'director-office-page'},
      h('style',null,`
        .director-office-page{
          width:100%;
          max-width:100%;
          min-width:0;
          box-sizing:border-box;
          overflow-x:hidden;
        }
        .director-office-page > .card.panel{
          width:100%;
          max-width:100%;
          min-width:0;
          box-sizing:border-box;
        }
        .director-item-serial{
          flex:0 0 auto;
          width:30px;
          height:30px;
          border-radius:10px;
          display:inline-grid;
          place-items:center;
          background:linear-gradient(145deg,#a70d52 0%,#df2a73 100%);
          color:#fff;
          font-size:13px;
          font-weight:950;
          line-height:1;
          box-shadow:0 5px 12px rgba(161,15,80,.18);
          margin-top:-1px;
        }
        @media(max-width:700px){
          .director-item-serial{width:28px;height:28px;border-radius:9px;font-size:12px}
        }

        .director-office-page .director-office-stat-grid,
        .director-office-page .director-office-comm-grid{
          width:100%;
          max-width:100%;
          min-width:0;
          box-sizing:border-box;
        }
        .director-office-page .director-office-stat-grid > *,
        .director-office-page .director-office-comm-grid > *{
          min-width:0;
          max-width:100%;
          box-sizing:border-box;
        }

        .director-calendar{margin:2px 0 4px;padding:0;border:0;background:transparent;box-shadow:none}
        .director-calendar-titlebar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:0 0 12px;padding:2px 4px}
        .director-calendar-titlewrap{display:flex;align-items:center;gap:12px;min-width:0}
        .director-calendar-title-icon{width:46px;height:46px;border-radius:15px;background:linear-gradient(145deg,#fff0f6,#f9dce8);color:#ad1457;display:grid;place-items:center;font-size:22px;font-weight:950;box-shadow:0 7px 18px rgba(142,21,75,.08)}
        .director-calendar-titlewrap strong{display:block;color:#351b29;font-size:24px;line-height:1.05}
        .director-calendar-titlewrap small{display:block;color:#6f6068;font-size:13px;margin-top:4px}
        .director-calendar-legend{display:flex;align-items:center;justify-content:flex-end;gap:14px;flex-wrap:wrap;color:#6e5a65;font-size:12px}
        .legend-item{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
        .legend-item i,.event-dot{width:10px;height:10px;border-radius:999px;display:inline-block;box-shadow:0 1px 3px rgba(0,0,0,.08)}
        .legend-item.task i,.event-dot.task{background:#d81b60}.legend-item.appointment i,.event-dot.appointment{background:#2d8cff}.legend-item.call i,.event-dot.call{background:#16a05d}.legend-item.followup i,.event-dot.followup{background:#f49a18}.legend-item.other i,.event-dot.other{background:#8f52e8}
        .director-calendar-shell{padding:18px;border:1px solid rgba(173,35,91,.18);border-radius:26px;background:linear-gradient(180deg,#fff 0%,#fffafd 62%,#fff5f9 100%);box-shadow:0 16px 38px rgba(119,21,64,.09),inset 0 1px 0 rgba(255,255,255,.9)}
        .director-calendar-head{display:grid;grid-template-columns:minmax(120px,1fr) minmax(220px,2fr) minmax(230px,1fr);align-items:center;gap:12px;margin-bottom:14px}
        .director-calendar-month{display:flex;align-items:center;justify-content:center;gap:10px;text-align:center;color:#a51153;font-size:24px;letter-spacing:.1px}
        .month-icon{font-size:19px;color:#b20f55}
        .director-calendar-next-wrap{display:flex;justify-content:flex-end;gap:8px}
        .calendar-nav{border:0;border-radius:14px;background:linear-gradient(145deg,#fff1f7,#f8dce8);color:#9c154d;font-weight:900;min-height:46px;padding:0 17px;display:inline-flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;box-shadow:0 7px 17px rgba(139,19,76,.07);transition:transform .15s ease,box-shadow .15s ease,filter .15s ease}
        .calendar-nav:hover{transform:translateY(-1px);box-shadow:0 10px 22px rgba(139,19,76,.11);filter:saturate(1.04)}
        .calendar-nav.previous{justify-self:start}.calendar-nav.next{justify-self:end}.calendar-nav.today-btn{padding-inline:16px}
        .nav-arrow{font-size:25px;line-height:1}.nav-label{font-size:13px}
        .director-calendar-week,.director-calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}
        .director-calendar-week>div{text-align:center;font-size:11px;font-weight:950;color:#765b68;padding:8px 0;background:linear-gradient(180deg,#fff5f9,#fde9f1);border-radius:11px;text-transform:uppercase;letter-spacing:.55px}
        .director-calendar-cell{position:relative;min-height:78px;border:1px solid #efd9e2;background:linear-gradient(160deg,#fff,#fffafb);border-radius:16px;padding:11px 12px;cursor:pointer;text-align:left;color:#34242d;transition:transform .14s ease,box-shadow .14s ease,border-color .14s ease;box-shadow:0 3px 9px rgba(86,36,58,.035);overflow:hidden}
        .director-calendar-cell:hover{border-color:#d99ab4;box-shadow:0 9px 19px rgba(123,25,69,.08);transform:translateY(-1px)}
        .director-calendar-cell.blank{border-color:transparent;background:linear-gradient(145deg,rgba(251,246,249,.4),rgba(248,241,245,.15));cursor:default;box-shadow:none}
        .director-calendar-cell.blank:hover{transform:none}
        .director-calendar-cell.today{border-color:#cf4c81;box-shadow:inset 0 0 0 1px rgba(207,76,129,.32),0 4px 12px rgba(184,28,91,.08)}
        .director-calendar-cell.selected{background:linear-gradient(145deg,#a70d52 0%,#df2a73 100%);color:#fff;border-color:#a70d52;box-shadow:0 11px 22px rgba(161,15,80,.24);transform:translateY(-1px)}
        .director-calendar-cell .day-number{font-weight:950;font-size:16px}
        .director-calendar-cell .event-dots{position:absolute;left:12px;bottom:12px;display:flex;align-items:center;gap:6px}
        .director-calendar-cell .event-dot{width:9px;height:9px}
        .director-calendar-cell.selected .event-dot{box-shadow:0 0 0 1px rgba(255,255,255,.15),0 1px 3px rgba(0,0,0,.12)}
        .director-calendar-cell .day-count{position:absolute;right:10px;bottom:10px;min-width:28px;height:28px;padding:0 6px;border-radius:999px;background:#f8dce8;color:#95174d;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:950;border:1px solid rgba(169,27,88,.08);box-shadow:0 2px 7px rgba(139,19,76,.06)}
        .director-calendar-cell.selected .day-count{background:#fff;color:#a30f54;border-color:#fff}
        .director-selected-date-strip{display:grid;grid-template-columns:minmax(240px,1.35fr) auto minmax(470px,2.4fr) auto;align-items:center;gap:14px;margin-top:16px;padding:13px 15px;border-radius:17px;background:linear-gradient(90deg,#fff9fc,#fff0f7);border:1px solid #efcfdd;color:#6d314b;box-shadow:0 6px 18px rgba(120,24,65,.05)}
        .selected-date-main{display:flex;align-items:center;gap:10px;min-width:0}.selected-date-icon{width:38px;height:38px;border-radius:12px;background:#fff;color:#b10f54;display:grid;place-items:center;box-shadow:0 4px 10px rgba(139,19,76,.08)}
        .selected-date-main small,.selected-total small{display:block;color:#7c6872;font-size:11px}.selected-date-main strong{display:block;color:#9b154f;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}.selected-today-pill{padding:9px 17px;border-radius:999px;background:linear-gradient(145deg,#f9dbe7,#f4c9db);color:#a51352;font-size:12px;font-weight:950;text-align:center}
        .selected-date-breakdown{display:flex;align-items:center;justify-content:center;gap:7px;flex-wrap:wrap}.summary-pill{display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;font-size:11px;font-weight:850;white-space:nowrap}.summary-pill b{min-width:21px;height:21px;border-radius:999px;display:inline-grid;place-items:center;color:#fff;font-size:10px}.summary-pill.task{background:#fde6ef;color:#b51655}.summary-pill.task b{background:#d81b60}.summary-pill.appointment{background:#e7f1ff;color:#2575cc}.summary-pill.appointment b{background:#2d8cff}.summary-pill.call{background:#e6f6ed;color:#12854d}.summary-pill.call b{background:#16a05d}.summary-pill.followup{background:#fff1df;color:#c57508}.summary-pill.followup b{background:#f49a18}.summary-pill.other{background:#f0e8ff;color:#7840cf}.summary-pill.other b{background:#8f52e8}
        .selected-total{padding-left:14px;border-left:1px solid #e5c3d2;white-space:nowrap}.selected-total strong{display:block;color:#321f29;font-size:15px;margin-top:2px}
        @media(max-width:900px){
          .director-calendar-titlebar{align-items:flex-start;flex-direction:column}.director-calendar-legend{justify-content:flex-start;gap:10px}.director-calendar-head{grid-template-columns:auto 1fr auto}.calendar-nav .nav-label{display:none}.calendar-nav{min-width:44px;padding:0 12px}.director-calendar-next-wrap{gap:6px}.director-calendar-month{font-size:19px}.director-calendar-cell{min-height:62px}.director-selected-date-strip{grid-template-columns:1fr auto}.selected-date-breakdown{grid-column:1/-1;justify-content:flex-start}.selected-total{border-left:0;padding-left:0;text-align:right}
        }
        @media(max-width:700px){
          .director-calendar-titlebar{margin-bottom:9px;padding:0}.director-calendar-title-icon{width:40px;height:40px;border-radius:12px;font-size:18px}.director-calendar-titlewrap strong{font-size:20px}.director-calendar-titlewrap small{font-size:11px}.director-calendar-legend{gap:8px;font-size:9px}.legend-item{gap:4px}.legend-item i{width:7px;height:7px}
          .director-calendar-shell{padding:11px 8px 12px;border-radius:20px}.director-calendar-head{gap:6px;margin-bottom:9px}.director-calendar-month{font-size:16px;gap:5px}.month-icon{font-size:14px}.calendar-nav{min-width:39px;min-height:39px;border-radius:11px;padding:0 9px}.calendar-nav.today-btn{padding:0 10px;font-size:11px}.calendar-nav.today-btn .month-icon{display:none}.nav-arrow{font-size:20px}
          .director-calendar-week,.director-calendar-grid{gap:4px}.director-calendar-week>div{font-size:8px;padding:5px 0;border-radius:8px;letter-spacing:.2px}.director-calendar-cell{min-height:48px;border-radius:10px;padding:6px 7px}.director-calendar-cell .day-number{font-size:12px}.director-calendar-cell .event-dots{left:6px;bottom:6px;gap:3px}.director-calendar-cell .event-dot{width:5px;height:5px}.director-calendar-cell .day-count{right:4px;bottom:4px;min-width:18px;height:18px;padding:0 3px;font-size:8px}
          .director-selected-date-strip{grid-template-columns:1fr auto;gap:8px;margin-top:10px;padding:10px;border-radius:13px}.selected-date-main{gap:7px}.selected-date-icon{width:31px;height:31px;border-radius:9px}.selected-date-main strong{font-size:12px}.selected-date-main small,.selected-total small{font-size:9px}.selected-today-pill{padding:6px 10px;font-size:9px}.selected-date-breakdown{gap:5px;grid-column:1/-1;justify-content:flex-start}.summary-pill{padding:5px 7px;font-size:8px;gap:4px}.summary-pill b{min-width:17px;height:17px;font-size:8px}.selected-total{font-size:10px}.selected-total strong{font-size:11px}
        }

        @media(max-width:700px){
          .director-office-page{
            width:100%!important;
            max-width:100%!important;
            min-width:0!important;
            overflow-x:hidden!important;
          }

          /* Header: keep title and Quick Task/New Item fully inside iPhone width. */
          .director-office-page > .card.panel:first-of-type > .panel-head{
            display:grid!important;
            grid-template-columns:minmax(0,1fr)!important;
            gap:12px!important;
            width:100%!important;
            max-width:100%!important;
            min-width:0!important;
          }
          .director-office-page > .card.panel:first-of-type > .panel-head > div:first-child{
            min-width:0!important;
            max-width:100%!important;
          }
          .director-office-page > .card.panel:first-of-type > .panel-head > .actions{
            width:100%!important;
            max-width:100%!important;
            min-width:0!important;
            margin-top:0!important;
            display:grid!important;
            grid-template-columns:repeat(2,minmax(0,1fr))!important;
            gap:8px!important;
          }
          .director-office-page > .card.panel:first-of-type > .panel-head > .actions > .btn{
            width:100%!important;
            min-width:0!important;
            max-width:100%!important;
            margin:0!important;
            padding-left:10px!important;
            padding-right:10px!important;
            white-space:normal!important;
          }

          .director-office-page .director-office-stat-grid > button{
            touch-action:manipulation!important;
            -webkit-tap-highlight-color:rgba(159,23,78,.12)!important;
            position:relative!important;
          }
          .director-office-page .director-office-stat-grid > button:active{
            transform:scale(.985)!important;
          }

          /* Dashboard cards: exactly two compact columns with no horizontal spill. */
          .director-office-page .director-office-stat-grid{
            grid-template-columns:repeat(2,minmax(0,1fr))!important;
            gap:10px!important;
          }
          .director-office-page .director-office-comm-grid{
            grid-template-columns:1fr!important;
            gap:10px!important;
          }

          .director-office-page .director-office-stat-grid button,
          .director-office-page .director-office-comm-grid button{
            width:100%!important;
            max-width:100%!important;
            min-width:0!important;
            overflow:hidden!important;
          }

          /* Long labels must wrap inside the card rather than widen the page. */
          .director-office-page button,
          .director-office-page h3,
          .director-office-page small,
          .director-office-page div{
            overflow-wrap:anywhere;
          }
        }

        @media(max-width:390px){
          .director-office-page > .card.panel:first-of-type > .panel-head > .actions{
            grid-template-columns:1fr!important;
          }
        }
      `),
      h(Section,{title:"Director's Office",subtitle:'Compact executive assistance workspace',actions:h('div',{className:'actions'},
        h('button',{className:'btn btn-secondary',onClick:()=>openNew('Task')},'＋ Quick Task'),
        h('button',{className:'btn btn-primary',onClick:()=>openNew()},'＋ New Item')
      )},
        message?h('div',{className:'message',style:{marginBottom:'12px'}},message):null,
        h('div',{className:'director-office-stat-grid',style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))',gap:'10px'}},
          card('Tasks',tasks.length,'Task','Visits, purchases, functions & trips'),
          card('Appointments Today',todayAppointments.length,'Today','Today’s scheduled appointments'),
          card('Calls / Callbacks',calls.length,'Call / Callback','Pending calls'),
          card('Follow-ups',followups.length,'Follow-up','Pending actions'),
          card('Visitors',visitors.length,'Visitor','Expected / pending'),
          card('Correspondence',correspondence.length,'Correspondence','Letters & communications'),
          card('Reminders',reminders.length,'Reminder','Upcoming reminders')
        ),
        urgent.length?h('div',{style:{marginTop:'12px',padding:'10px 12px',borderRadius:'12px',background:'#fff3f3',border:'1px solid #efc2c2',fontWeight:800,color:'#8d1b2c'}},`⚠ ${urgent.length} urgent item${urgent.length===1?'':'s'} pending`):null
      ),

      /* v2.10.79 — Director's Office refresh state startup fix */
      h('style',null,`
        .director-items-summary{
          display:inline-flex;align-items:center;gap:6px;margin-top:4px;
          padding:5px 11px;border-radius:999px;
          background:linear-gradient(135deg,#fff0f6,#ffe0ec);
          border:1px solid #e8a7c2;color:#a8004b;
          font-size:18px;font-weight:950;line-height:1.15;
          letter-spacing:.1px;box-shadow:0 3px 10px rgba(171,0,75,.10)
        }
        @media(max-width:760px){
          /* Mobile: keep the section title and item-count summary readable and horizontal. */
          .director-office-page .card.panel > .panel-head{
            display:block!important;
            width:100%!important;
            min-width:0!important;
          }
          .director-office-page .card.panel > .panel-head > div:first-child{
            width:100%!important;
            min-width:0!important;
            max-width:100%!important;
          }
          .director-office-page .card.panel > .panel-head > div:first-child h3{
            white-space:normal!important;
            overflow-wrap:normal!important;
            word-break:normal!important;
            font-size:22px!important;
            line-height:1.18!important;
          }
          .director-items-summary{
            display:inline-flex!important;
            width:auto!important;
            max-width:100%!important;
            white-space:nowrap!important;
            overflow-wrap:normal!important;
            word-break:normal!important;
            font-size:17px!important;
            line-height:1.1!important;
            padding:7px 13px!important;
            margin-top:7px!important;
          }
          .director-office-refresh{
            min-width:118px!important;
            min-height:44px!important;
            font-weight:800!important;
            box-shadow:0 5px 14px rgba(184,0,88,.20)!important;
          }
          @media(max-width:640px){
            .director-office-refresh{width:100%!important;min-height:50px!important;font-size:16px!important;}
          }
          /* The filter button group moves below, so it cannot squeeze the count into a vertical strip. */
          .director-office-page .card.panel > .panel-head > div:nth-child(2){
            width:100%!important;
            max-width:100%!important;
            min-width:0!important;
            margin-top:12px!important;
          }
        }
      `),
      h('style',null,`
        .office-simple-calendar{padding:14px;border:1px solid #edc8d9;border-radius:20px;background:linear-gradient(145deg,#fffafd,#fce9f2);box-shadow:0 8px 24px rgba(120,20,65,.07)}
        .office-dot-legend{display:flex;flex-wrap:wrap;gap:8px 14px;margin-bottom:12px;font-size:12px;color:#69535f}.office-dot-legend span{display:inline-flex;align-items:center;gap:5px}.office-dot-legend i,.office-event-dots i{display:inline-block;width:7px;height:7px;border-radius:50%;flex-shrink:0}.office-event-dots{display:flex;justify-content:center;flex-wrap:wrap;gap:3px;min-height:9px;margin-top:7px}.office-day{box-shadow:0 3px 9px rgba(115,25,66,.06)}.office-day:focus-visible{outline:3px solid #168b81;outline-offset:2px}
        .office-seven{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px;text-align:center;margin-top:8px}
        .office-seven>strong{font-size:12px}.office-day{min-width:0;border:1px solid #edcad9;background:#fff7fb;border-radius:10px;padding:12px 2px;color:#691139;cursor:pointer}.office-day small{display:block;font-size:10px;margin-top:5px}.office-today{border:2px solid #b50059;background:#fce0ef}
        .director-office-page .director-office-stat-grid{grid-template-columns:repeat(auto-fit,minmax(145px,1fr))!important;gap:6px!important}
        .director-office-page .director-office-stat-grid>button{padding:9px!important;min-height:0!important;border-radius:12px!important}
        .director-office-page .director-office-stat-grid>button small{display:none!important}
        .director-office-page .director-office-stat-grid>button{font-family:inherit!important;color:#7f174a!important;text-align:left;overflow-wrap:normal!important;word-break:normal!important;padding:12px 14px!important}
        .director-office-page .director-office-stat-grid>button>div:first-child{font-size:25px!important;font-weight:700!important;line-height:1.15!important;color:#8b1953!important}
        .director-office-page .director-office-stat-grid>button>div:nth-child(2){font-size:14px!important;font-weight:600!important;line-height:1.4!important;color:#741747!important;margin-top:5px!important;word-break:normal!important;overflow-wrap:normal!important}
        @media(max-width:480px){.director-office-page .director-office-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}

        .director-office-page .director-office-comm-grid>button{color:#7f174a!important;font-family:inherit!important}
        .director-office-page .director-office-comm-grid>button>div:nth-child(2){color:#741747!important;font-size:15px!important;font-weight:600!important;line-height:1.4!important}
        .director-office-page .director-office-comm-grid>button>div:first-child>span{color:#8b1953!important;font-size:23px!important}
        .director-office-page .director-office-comm-grid>button>div:first-child>strong{color:#8b1953!important;font-size:25px!important;font-weight:700!important}
        .director-office-page .director-office-comm-grid>button>small{color:#846d79!important;font-size:13px!important;font-weight:400!important}
        .director-office-page .director-office-comm-grid{gap:6px!important}.director-office-page .director-office-comm-grid>button{padding:10px!important;min-height:0!important}
      `),
      h(Section,{title:filter==='Overdue'?'Overdue items':officeRangeLabel,actions:h('button',{type:'button',className:'btn btn-secondary',disabled:manualRefreshing||loading,onClick:refreshDirectorOffice},manualRefreshing?'Refreshing…':'Refresh')},
        h('div',{style:{display:'flex',flexWrap:'wrap',gap:'6px',marginBottom:'12px'}},
          h('button',{type:'button',className:'btn btn-secondary','aria-label':'Previous period',onClick:()=>moveOfficePeriod(-1)},'‹'),
          ...[['Date','Today'],['This Week',officePeriod==='This Week'?officeWeekLabel:'This Week'],['Monthly','Monthly']].map(([period,label])=>h('button',{type:'button',key:period,title:period==='This Week'?'Return to current week':undefined,'aria-pressed':officePeriod===period&&(period!=='This Week'||officeWeekLabel==='This Week'),className:officePeriod===period&&(period!=='This Week'||officeWeekLabel==='This Week')?'btn btn-primary':'btn btn-secondary',onClick:()=>{setOfficePeriod(period);setSelectedOfficeDate(todayKey);if(period==='Monthly')setOfficeMonth(todayKey.slice(0,7));if(filter==='Today'||filter==='Overdue')setFilter('Open');}},label)),
          h('button',{type:'button',className:'btn btn-secondary','aria-label':'Next period',onClick:()=>moveOfficePeriod(1)},'›'),
          h('button',{type:'button',className:filter==='Overdue'?'btn btn-primary':'btn btn-secondary',onClick:()=>{setFilter(filter==='Overdue'?'Open':'Overdue');}},'Overdue · '+openRows.filter(r=>officeDateKey(r)&&officeDateKey(r)<todayKey).length),
          officePeriod==='Monthly'?h('label',null,'Month ',h('input',{type:'month','aria-label':'Director Office month',value:officeMonth,onChange:e=>{if(e.target.value)setOfficeMonth(e.target.value);}})):null
        ),
        filter==='Overdue'?h('p',null,'Unfinished items before today, across all dates.'):renderDirectorCalendar()
      ),
      h('div',{
        id:'director-followup-queue-anchor',
        style:{height:'1px',scrollMarginTop:'118px'}
      }),
      h(Section,{title:'Items',subtitle:h('span',{className:'director-items-summary'},`${filtered.length} item${filtered.length===1?'':'s'} · ${filter}`),actions:
        h('div',{style:{display:'flex',gap:'6px',flexWrap:'wrap'}},
          ...[['All','All'],['Open','Pending'],['Completed','Completed']].map(([value,label])=>h('button',{type:'button',key:value,className:filter===value?'btn btn-primary':'btn btn-secondary',onClick:()=>setFilter(value)},label)),
          h('select',{'aria-label':'Item type',value:officeType,onChange:e=>setOfficeType(e.target.value)},...['All',...TYPES].map(x=>h('option',{key:x,value:x},x==='All'?'All item types':x))),
          h('select',{'aria-label':'More status filters',value:['For Director','Cancelled'].includes(filter)?filter:'',onChange:e=>{if(e.target.value)setFilter(e.target.value);}},h('option',{value:''},'More filters'),h('option',{value:'For Director'},'For Director'),h('option',{value:'Cancelled'},'Cancelled'))
        )
      },
        h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center',marginBottom:'12px'}},
          h('input',{value:officeQuery,onChange:e=>setOfficeQuery(e.target.value),placeholder:'Search subject, name, mobile or notes…',style:{flex:'1 1 280px',minWidth:'220px'}}),
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setOfficeQuery('')},'Clear')
        ),
        loading?h('div',{className:'empty'},'Loading Director’s Office…'):
        h('div',{style:{display:'grid',gap:'10px'}},...filtered.flatMap((r,index)=>{const date=officeDateKey(r);return [index===0||officeDateKey(filtered[index-1])!==date?h('h4',{key:'date-'+date,style:{margin:'12px 0 0',color:date===todayKey?'#b50059':'#4b3040'}},(date===todayKey?'Today · ':'')+prettyDate(date)):null,itemCard(r,index)];}),
          filtered.length===0?h('div',{className:'empty'},'No items in this view.'):null
        )
      ),
      h(Section,{title:'Quick Add',subtitle:'Common Secretary actions'},
        h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
          ...TYPES.map(x=>h('button',{type:'button',key:x,className:'btn btn-secondary',onClick:()=>openNew(x)},`＋ ${x}`))
        )
      ),
      formModal,
      rescheduleModal,
      cancelModal
    );
  }

