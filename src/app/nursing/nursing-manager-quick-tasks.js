  function NursingManagerQuickTasks({profile,onNavigate}){
    const TASK_KINDS=['Visit','Buy / Purchase','Attend Function','Trip / Travel','General Task'];
    const PRIORITIES=['Normal','Important','Urgent'];
    const blank=()=>({task_kind:'General Task',title:'',contact_name:'',scheduled_at:'',due_date:'',day_part:'',priority:'Normal',details:'',status:'Pending'});
    const [rows,setRows]=React.useState([]);
    const [loading,setLoading]=React.useState(true);
    const [message,setMessage]=React.useState('');
    const [filter,setFilter]=React.useState('Open');
    const [showForm,setShowForm]=React.useState(false);
    const [editingId,setEditingId]=React.useState(null);
    const [form,setForm]=React.useState(blank());
    const [saving,setSaving]=React.useState(false);
    const [voiceListening,setVoiceListening]=React.useState(false);
    const [voiceProcessing,setVoiceProcessing]=React.useState(false);
    const [voiceTranscript,setVoiceTranscript]=React.useState('');
    const [voiceMessage,setVoiceMessage]=React.useState('');
    const voiceRecognitionRef=React.useRef(null);
    const mobileRecorderRef=React.useRef(null);
    const mobileStreamRef=React.useRef(null);
    const mobileChunksRef=React.useRef([]);
    const mobileVoiceLangRef=React.useRef('ta-IN');

    const allowed=isNursingManagerProfile(profile);
    const pad=n=>String(n).padStart(2,'0');
    const localDate=v=>{
      if(!v)return '';
      const d=new Date(v); if(Number.isNaN(d.getTime()))return '';
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    };
    const localInput=v=>{
      if(!v)return '';
      const d=new Date(v); if(Number.isNaN(d.getTime()))return '';
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const pretty=v=>{
      if(!v)return '—';
      const d=new Date(v); if(Number.isNaN(d.getTime()))return v;
      return formatDateTimeIN(d);
    };
    const prettyDate=v=>{
      if(!v)return '—';
      const d=new Date(`${v}T00:00:00`);
      return Number.isNaN(d.getTime())?v:formatDateIN(d);
    };
    const isOpen=r=>!['Completed','Cancelled'].includes(String(r.status||''));
    const today=localDate(new Date());

    async function load(){
      if(!allowed){setLoading(false);return}
      setLoading(true);setMessage('');
      const {data,error}=await client.from('nursing_manager_tasks').select('*').order('created_at',{ascending:false}).limit(500);
      if(error)setMessage(error.message||'Unable to load quick tasks.');
      setRows(data||[]);
      setLoading(false);
    }
    React.useEffect(()=>{load()},[profile?.id,profile?.designation]);

    const openRows=rows.filter(isOpen);
    const todayRows=openRows.filter(r=>localDate(r.scheduled_at||r.due_date)===today);
    const overdueRows=openRows.filter(r=>{
      const value=r.scheduled_at||(r.due_date?`${r.due_date}T23:59:59`:null);
      return value&&new Date(value)<new Date()&&localDate(value)!==today;
    });
    const completedRows=rows.filter(r=>r.status==='Completed');
    const visible=rows.filter(r=>{
      if(filter==='Open')return isOpen(r);
      if(filter==='Today')return todayRows.some(x=>x.id===r.id);
      if(filter==='Overdue')return overdueRows.some(x=>x.id===r.id);
      if(filter==='Completed')return r.status==='Completed';
      if(filter==='Cancelled')return r.status==='Cancelled';
      return true;
    });

    function stopVoice(){
      try{voiceRecognitionRef.current?.stop?.()}catch(_){}
      voiceRecognitionRef.current=null;
      try{if(mobileRecorderRef.current&&mobileRecorderRef.current.state!=='inactive')mobileRecorderRef.current.stop()}catch(_){}
      try{mobileStreamRef.current?.getTracks?.().forEach(t=>t.stop())}catch(_){}
      mobileStreamRef.current=null;
      setVoiceListening(false);
    }
    function useMobileRecorder(){
      const ua=String(navigator.userAgent||'');
      const mobileUA=/iPhone|iPad|iPod|Android/i.test(ua);
      const coarse=window.matchMedia&&window.matchMedia('(pointer:coarse)').matches;
      return Boolean(mobileUA||coarse);
    }
    function bestMime(){
      const options=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'];
      for(const x of options){try{if(window.MediaRecorder&&MediaRecorder.isTypeSupported?.(x))return x}catch(_){}}
      return '';
    }
    function mapVoice(result){
      const x=result?.fields||{};
      setForm(current=>({
        ...current,
        task_kind:x.task_kind&&x.task_kind!=='Not Applicable'?x.task_kind:'General Task',
        title:x.title||'',
        contact_name:x.contact_name||'',
        scheduled_at:x.scheduled_at?String(x.scheduled_at).slice(0,16):'',
        due_date:x.due_date||'',
        day_part:x.day_part&&x.day_part!=='Not Applicable'?x.day_part:'',
        priority:x.priority||'Normal',
        details:x.details||''
      }));
      if(result?.transcript)setVoiceTranscript(String(result.transcript));
      setVoiceMessage('✓ Voice entry filled in simple English. Please check before Save.');
    }
    async function sendTranscript(transcript,lang){
      setVoiceProcessing(true);setVoiceMessage('Understanding your task…');
      try{
        const {data:{session}}=await client.auth.getSession();
        if(!session)throw new Error('Please sign in again.');
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/director-office-voice`,{
          method:'POST',
          headers:{'Authorization':`Bearer ${session.access_token}`,'apikey':cfg.supabasePublishableKey,'Content-Type':'application/json'},
          body:JSON.stringify({transcript,spoken_language:lang,current_form_type:'Task',current_task_kind:form.task_kind||'General Task',now_iso:new Date().toISOString(),timezone:'Asia/Kolkata'})
        });
        const result=await response.json().catch(()=>({error:'Unable to read voice response'}));
        if(!response.ok||result.error)throw new Error(result.error||'Unable to understand task.');
        mapVoice(result);
      }catch(error){setVoiceMessage(error.message||'Unable to understand task.')}
      finally{setVoiceProcessing(false)}
    }
    async function sendAudio(blob,lang){
      setVoiceProcessing(true);setVoiceMessage('Understanding your voice…');
      try{
        const {data:{session}}=await client.auth.getSession();
        if(!session)throw new Error('Please sign in again.');
        const ext=(blob.type||'').includes('mp4')?'m4a':(blob.type||'').includes('ogg')?'ogg':'webm';
        const fd=new FormData();
        fd.append('audio',blob,`nursing-manager-voice.${ext}`);
        fd.append('spoken_language',lang);
        fd.append('current_form_type','Task');
        fd.append('current_task_kind',form.task_kind||'General Task');
        fd.append('now_iso',new Date().toISOString());
        fd.append('timezone','Asia/Kolkata');
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/director-office-voice`,{
          method:'POST',
          headers:{'Authorization':`Bearer ${session.access_token}`,'apikey':cfg.supabasePublishableKey},
          body:fd
        });
        const result=await response.json().catch(()=>({error:'Unable to read voice response'}));
        if(!response.ok||result.error)throw new Error(result.error||'Unable to process voice task.');
        mapVoice(result);
      }catch(error){setVoiceMessage(error.message||'Unable to process voice task.')}
      finally{setVoiceProcessing(false)}
    }
    async function startMobile(lang){
      if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){
        setVoiceMessage('Microphone recording is not available. Please use current Safari/Chrome and allow microphone access.');
        return;
      }
      stopVoice();setVoiceTranscript('');setVoiceMessage('🎤 Speak naturally. Tap Stop when finished.');
      try{
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});
        mobileStreamRef.current=stream;mobileChunksRef.current=[];mobileVoiceLangRef.current=lang;
        const mime=bestMime();
        const rec=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);
        mobileRecorderRef.current=rec;
        rec.ondataavailable=e=>{if(e.data?.size)mobileChunksRef.current.push(e.data)};
        rec.onstop=async()=>{
          const type=rec.mimeType||mobileChunksRef.current[0]?.type||'audio/webm';
          const blob=new Blob(mobileChunksRef.current,{type});
          mobileChunksRef.current=[];
          try{stream.getTracks().forEach(t=>t.stop())}catch(_){}
          mobileStreamRef.current=null;mobileRecorderRef.current=null;setVoiceListening(false);
          if(blob.size<1000)return setVoiceMessage('No useful speech was captured. Please try again.');
          await sendAudio(blob,mobileVoiceLangRef.current);
        };
        rec.start();setVoiceListening(true);
      }catch(error){
        setVoiceListening(false);
        setVoiceMessage(error?.name==='NotAllowedError'?'Microphone permission is blocked. Please allow microphone access for Samara Care.':(error.message||'Unable to start microphone.'));
      }
    }
    function startVoice(lang='ta-IN'){
      if(useMobileRecorder())return startMobile(lang);
      const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
      if(!SpeechRecognition)return setVoiceMessage('Voice recognition is not available in this browser.');
      stopVoice();setVoiceTranscript('');setVoiceMessage('🎤 Speak naturally…');
      try{
        const rec=new SpeechRecognition();voiceRecognitionRef.current=rec;
        rec.lang=lang;rec.interimResults=true;rec.continuous=false;rec.maxAlternatives=1;
        let finalText='';
        rec.onstart=()=>setVoiceListening(true);
        rec.onresult=e=>{
          let interim='';
          for(let i=e.resultIndex;i<e.results.length;i++){
            const t=e.results[i][0]?.transcript||'';
            if(e.results[i].isFinal)finalText+=`${t} `;else interim+=t;
          }
          setVoiceTranscript((finalText||interim).trim());
        };
        rec.onerror=e=>{setVoiceListening(false);setVoiceMessage(`Voice recognition stopped${e?.error?`: ${e.error}`:''}. Please try again.`)};
        rec.onend=()=>{setVoiceListening(false);const spoken=finalText.trim();if(spoken)sendTranscript(spoken,lang);else setVoiceMessage('No speech was captured. Please try again.')};
        rec.start();
      }catch(error){setVoiceListening(false);setVoiceMessage(error.message||'Unable to start microphone.')}
    }

    function openNew(){stopVoice();setEditingId(null);setForm(blank());setVoiceTranscript('');setVoiceMessage('');setMessage('');setShowForm(true)}
    function openEdit(r){
      stopVoice();setEditingId(r.id);setMessage('');
      setForm({task_kind:r.task_kind||'General Task',title:r.title||'',contact_name:r.contact_name||'',scheduled_at:localInput(r.scheduled_at),due_date:r.due_date||'',day_part:r.day_part||'',priority:r.priority||'Normal',details:r.details||'',status:r.status||'Pending'});
      setVoiceTranscript('');setVoiceMessage('');setShowForm(true);
    }
    function dateValue(){return form.scheduled_at?form.scheduled_at.slice(0,10):(form.due_date||'')}
    function timeValue(){return form.scheduled_at?.includes('T')?form.scheduled_at.slice(11,16):''}
    function setTaskDate(date){const time=timeValue();setForm(current=>({...current,scheduled_at:date&&time?`${date}T${time}`:'',due_date:date&&!time?date:''}))}
    function setTaskTime(time){const date=dateValue();setForm(current=>({...current,scheduled_at:date&&time?`${date}T${time}`:'',due_date:date&&!time?date:''}))}
    async function save(e){
      e.preventDefault();if(saving)return;
      if(!form.title.trim())return setMessage('Please enter What to do.');
      setSaving(true);setMessage('');
      const payload={owner_profile_id:profile.id,task_kind:form.task_kind||'General Task',title:form.title.trim(),contact_name:form.contact_name.trim()||null,scheduled_at:form.scheduled_at?new Date(form.scheduled_at).toISOString():null,due_date:form.scheduled_at?null:(form.due_date||null),day_part:form.day_part||null,priority:form.priority||'Normal',details:form.details.trim()||null,status:form.status||'Pending',updated_at:new Date().toISOString()};
      const res=editingId?await client.from('nursing_manager_tasks').update(payload).eq('id',editingId):await client.from('nursing_manager_tasks').insert(payload);
      setSaving(false);
      if(res.error)return setMessage(res.error.message||'Unable to save task.');
      const wasEditing=Boolean(editingId);
      stopVoice();setShowForm(false);setEditingId(null);setForm(blank());setVoiceTranscript('');setVoiceMessage('');
      setMessage(wasEditing?'✓ Task updated.':'✓ Quick task saved.');
      await load();
    }
    async function updateStatus(r,status){
      const {error}=await client.from('nursing_manager_tasks').update({status,updated_at:new Date().toISOString(),completed_at:status==='Completed'?new Date().toISOString():null}).eq('id',r.id);
      if(error)return setMessage(error.message||'Unable to update task.');
      await load();
    }

    if(!allowed)return h(Section,{title:'My Quick Tasks'},h('div',{className:'empty'},'Available only to the Nursing Manager.'));
    if(loading)return h('div',{className:'loading'},'Loading Nursing Manager quick tasks…');

    const stat=(label,value,key)=>h('button',{type:'button',className:'card stat',onClick:()=>setFilter(key),style:{cursor:'pointer',textAlign:'left',border:filter===key?'2px solid #a91653':undefined}},h('span',null,label),h('strong',null,value),h('small',null,'Open list →'));

    const modal=showForm?h('div',{className:'modal-backdrop'},h('form',{className:'modal-card',onSubmit:save},
      h('div',{className:'panel-head'},h('div',null,h('h3',null,editingId?'Update Quick Task':'New Quick Task'),h('small',null,'Nursing Manager personal task — only the essentials')),h('button',{type:'button',className:'close',onClick:()=>{stopVoice();setShowForm(false)}},'×')),
      h('div',{style:{margin:'0 0 14px',padding:'12px',border:'1px solid #e7bfd0',borderRadius:'15px',background:'linear-gradient(135deg,#fffafd,#f9e6ee)'}},
        h('div',{style:{display:'flex',justifyContent:'space-between',gap:'8px',alignItems:'center',flexWrap:'wrap'}},
          h('div',null,h('strong',{style:{color:'#78103f'}},'🎤 Voice Entry'),h('div',{style:{fontSize:'12px',color:'#765966',marginTop:'2px'}},useMobileRecorder()?'Tap Speak, talk naturally, then tap Stop. Tamil/English will be converted and the form will be filled.':'Speak naturally. Tamil will be converted to simple English and the form will be filled for you.')),
          voiceListening?h('button',{type:'button',className:'btn btn-danger',onClick:stopVoice},'■ Stop'):h('div',{className:'actions'},h('button',{type:'button',className:'btn btn-primary',disabled:voiceProcessing,onClick:()=>startVoice('ta-IN')},voiceProcessing?'Processing…':'🎤 Speak Tamil'),h('button',{type:'button',className:'btn btn-secondary',disabled:voiceProcessing,onClick:()=>startVoice('en-IN')},'🎤 Speak English'))
        ),
        voiceTranscript?h('div',{style:{marginTop:'9px',padding:'8px 10px',borderRadius:'10px',background:'#fff',fontSize:'13px'}},h('small',{style:{display:'block',color:'#8b6b78'}},'Heard'),h('div',{style:{fontWeight:700}},voiceTranscript)):null,
        voiceMessage?h('div',{style:{marginTop:'8px',fontSize:'12px',fontWeight:800,color:voiceMessage.startsWith('✓')?'#17653c':'#7c2448'}},voiceMessage):null
      ),
      h('div',{className:'modal-grid'},
        h('div',{className:'field'},h('label',null,'Task'),h('select',{value:form.task_kind,onChange:e=>setForm({...form,task_kind:e.target.value})},TASK_KINDS.map(x=>h('option',{key:x},x)))),
        h('div',{className:'field'},h('label',null,'Priority'),h('select',{value:form.priority,onChange:e=>setForm({...form,priority:e.target.value})},PRIORITIES.map(x=>h('option',{key:x},x)))),
        h('div',{className:'field span-2'},h('label',null,'What to do? *'),h('input',{required:true,value:form.title,onChange:e=>setForm({...form,title:e.target.value}),placeholder:'Enter task'})),
        h('div',{className:'field span-2'},h('label',null,'Person / Place (optional)'),h('input',{value:form.contact_name,onChange:e=>setForm({...form,contact_name:e.target.value}),placeholder:'Name or place'})),
        h('div',{className:'field'},h('label',null,'Date'),h(StrictDateInput,{value:dateValue(),onChange:e=>setTaskDate(e.target.value)})),
        h('div',{className:'field'},h('label',null,'Time (optional)'),h('input',{type:'time',value:timeValue(),onChange:e=>setTaskTime(e.target.value)})),
        h('div',{className:'field'},h('label',null,'Day Part (optional)'),h('select',{value:form.day_part,onChange:e=>setForm({...form,day_part:e.target.value})},h('option',{value:''},'—'),['Morning','Afternoon','Evening','Night'].map(x=>h('option',{key:x},x)))),
        editingId?h('div',{className:'field'},h('label',null,'Status'),h('select',{value:form.status,onChange:e=>setForm({...form,status:e.target.value})},['Pending','In Progress','Completed','Cancelled'].map(x=>h('option',{key:x},x)))):null,
        h('div',{className:'field span-2'},h('label',null,'Short Note (optional)'),h('textarea',{rows:2,value:form.details,onChange:e=>setForm({...form,details:e.target.value}),placeholder:'Anything important to remember'}))
      ),
      message?h('div',{className:'message',style:{marginTop:'8px'}},message):null,
      h('div',{className:'actions',style:{marginTop:'12px'}},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{stopVoice();setShowForm(false)}},'Cancel'),h('button',{type:'submit',className:'btn btn-primary',disabled:saving},saving?'Saving…':'Save'))
    )):null;

    return h('div',{className:'nursing-manager-quick-tasks'},
      h('div',{className:'shift-summary'},h('div',null,h('strong',null,'My Quick Tasks'),h('span',null,'Nursing Manager personal task list with Tamil / English voice entry')),h('button',{type:'button',className:'btn btn-primary',onClick:openNew},'＋ Quick Task')),
      h('div',{className:'grid stats',style:{marginTop:'14px'}},stat('Open',openRows.length,'Open'),stat('Due Today',todayRows.length,'Today'),stat('Overdue',overdueRows.length,'Overdue'),stat('Completed',completedRows.length,'Completed')),
      message&&!showForm?h('div',{className:`message ${message.startsWith('✓')?'success':'error'}`,style:{marginTop:'12px'}},message):null,
      h(Section,{title:`Tasks (${visible.length})`,subtitle:'Only your own Nursing Manager tasks are shown.'},
        visible.length?h('div',{className:'compact-list'},visible.map(r=>h('div',{className:'compact-row',key:r.id,style:{alignItems:'flex-start'}},
          h('div',{style:{minWidth:0,flex:1}},h('strong',null,r.title),h('small',null,`${r.task_kind||'General Task'} · ${r.priority||'Normal'} · ${r.status||'Pending'}`),r.contact_name?h('small',null,r.contact_name):null,h('small',null,r.scheduled_at?pretty(r.scheduled_at):(r.due_date?prettyDate(r.due_date):'No date')),r.details?h('small',null,r.details):null),
          h('div',{className:'actions',style:{flexWrap:'wrap'}},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>openEdit(r)},'Edit'),isOpen(r)&&h('button',{type:'button',className:'btn btn-primary',onClick:()=>updateStatus(r,'Completed')},'✓ Complete'),isOpen(r)&&h('button',{type:'button',className:'btn btn-secondary',onClick:()=>updateStatus(r,'Cancelled')},'Cancel'))
        ))):h('div',{className:'empty'},'No tasks in this view.')
      ),
      modal
    );
  }

