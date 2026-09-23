  function ManagerPersonalTodo({profile}){
    const emptyForm=()=>({subject:'',category:'General',priority:'Normal',due_at:'',follow_up_at:'',notes:'',status:'Pending'});
    const [rows,setRows]=React.useState([]);
    const [form,setForm]=React.useState(emptyForm());
    const [editing,setEditing]=React.useState(null);
    const [filter,setFilter]=React.useState('Open');
    const [busy,setBusy]=React.useState(false);
    const [message,setMessage]=React.useState('');
    const [voiceListening,setVoiceListening]=React.useState(false);
    const [voiceProcessing,setVoiceProcessing]=React.useState(false);
    const [voiceTranscript,setVoiceTranscript]=React.useState('');
    const [voiceMessage,setVoiceMessage]=React.useState('');
    const voiceRecognitionRef=React.useRef(null);
    const mobileRecorderRef=React.useRef(null);
    const mobileStreamRef=React.useRef(null);
    const mobileChunksRef=React.useRef([]);
    const mobileVoiceLangRef=React.useRef('ta-IN');

    const load=React.useCallback(async()=>{
      const {data,error}=await client.from('manager_personal_tasks')
        .select('*').order('completed_at',{ascending:false,nullsFirst:false})
        .order('due_at',{ascending:true,nullsFirst:false}).order('created_at',{ascending:false});
      if(error){setMessage(error.message);return}
      setRows(data||[]);
    },[]);
    React.useEffect(()=>{load()},[load]);

    const localDay=value=>{
      if(!value)return '';
      const d=new Date(value); if(Number.isNaN(d.getTime()))return '';
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    };
    const today=localDay(new Date());
    const isOpen=r=>!['Completed','Cancelled'].includes(String(r.status||''));
    const dueToday=rows.filter(r=>isOpen(r)&&localDay(r.due_at)===today).length;
    const overdue=rows.filter(r=>isOpen(r)&&r.due_at&&new Date(r.due_at)<new Date()&&localDay(r.due_at)!==today).length;
    const followup=rows.filter(r=>isOpen(r)&&r.follow_up_at&&new Date(r.follow_up_at)<=new Date()).length;
    const completedToday=rows.filter(r=>r.status==='Completed'&&localDay(r.completed_at)===today).length;

    const visible=rows.filter(r=>{
      if(filter==='Open')return isOpen(r);
      if(filter==='Today')return isOpen(r)&&localDay(r.due_at)===today;
      if(filter==='Overdue')return isOpen(r)&&r.due_at&&new Date(r.due_at)<new Date()&&localDay(r.due_at)!==today;
      if(filter==='Follow-up')return isOpen(r)&&r.follow_up_at&&new Date(r.follow_up_at)<=new Date();
      if(filter==='Completed')return r.status==='Completed';
      return true;
    });

    function stopManagerVoice(){
      try{voiceRecognitionRef.current?.stop?.()}catch(_){}
      voiceRecognitionRef.current=null;
      try{if(mobileRecorderRef.current&&mobileRecorderRef.current.state!=='inactive')mobileRecorderRef.current.stop()}catch(_){}
      try{mobileStreamRef.current?.getTracks?.().forEach(t=>t.stop())}catch(_){}
      mobileStreamRef.current=null;
      setVoiceListening(false);
    }
    function managerUseMobileRecorder(){
      const ua=String(navigator.userAgent||'');
      const mobileUA=/iPhone|iPad|iPod|Android/i.test(ua);
      const coarse=window.matchMedia&&window.matchMedia('(pointer:coarse)').matches;
      return Boolean(mobileUA||coarse);
    }
    function managerBestMime(){
      const options=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'];
      for(const x of options){try{if(window.MediaRecorder&&MediaRecorder.isTypeSupported?.(x))return x}catch(_){}}
      return '';
    }
    function mapManagerVoice(result){
      const x=result?.fields||{};
      const kind=String(x.task_kind||'').toLowerCase();
      const category=kind.includes('purchase')||kind.includes('buy')?'Vendor':kind.includes('visit')?'Patient / Relative':kind.includes('travel')?'General':form.category;
      let due='';
      if(x.scheduled_at)due=String(x.scheduled_at).slice(0,16);
      else if(x.due_date)due=`${x.due_date}T09:00`;
      const details=[x.contact_name?`Person / Place: ${x.contact_name}`:'',x.details||''].filter(Boolean).join('\n');
      setForm(current=>({
        ...current,
        subject:x.title||current.subject,
        category:category||current.category,
        priority:x.priority==='Urgent'?'Urgent':x.priority==='Important'?'High':(x.priority||current.priority),
        due_at:due||current.due_at,
        notes:details||current.notes
      }));
      if(result?.transcript)setVoiceTranscript(String(result.transcript));
      setVoiceMessage('✓ Voice task filled in simple English. Please check and tap Add to My List.');
    }
    async function managerSendTranscript(transcript,lang){
      setVoiceProcessing(true);setVoiceMessage('Understanding your task…');
      try{
        const {data:{session}}=await client.auth.getSession();
        if(!session)throw new Error('Please sign in again.');
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/director-office-voice`,{
          method:'POST',
          headers:{'Authorization':`Bearer ${session.access_token}`,'apikey':cfg.supabasePublishableKey,'Content-Type':'application/json'},
          body:JSON.stringify({transcript,spoken_language:lang,current_form_type:'Task',current_task_kind:'General Task',now_iso:new Date().toISOString(),timezone:'Asia/Kolkata'})
        });
        const result=await response.json().catch(()=>({error:'Unable to read voice response'}));
        if(!response.ok||result.error)throw new Error(result.error||'Unable to understand task.');
        mapManagerVoice(result);
      }catch(error){
        const msg=error.message||'Unable to understand task.';
        if(String(lang||'').toLowerCase().startsWith('en')&&transcript){
          setForm(current=>({...current,subject:current.subject||String(transcript).trim()}));
          setVoiceMessage(`✓ Speech captured. Structured processing was unavailable, so the English text has been entered directly. ${msg}`);
        }else{
          setVoiceMessage(`Speech captured, but Tamil-to-English processing could not complete: ${msg}`);
        }
      }
      finally{setVoiceProcessing(false)}
    }
    async function managerSendAudio(blob,lang){
      setVoiceProcessing(true);setVoiceMessage('Understanding your voice…');
      try{
        const {data:{session}}=await client.auth.getSession();
        if(!session)throw new Error('Please sign in again.');
        const ext=(blob.type||'').includes('mp4')?'m4a':(blob.type||'').includes('ogg')?'ogg':'webm';
        const fd=new FormData();
        fd.append('audio',blob,`manager-task-voice.${ext}`);
        fd.append('spoken_language',lang);
        fd.append('current_form_type','Task');
        fd.append('current_task_kind','General Task');
        fd.append('now_iso',new Date().toISOString());
        fd.append('timezone','Asia/Kolkata');
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/director-office-voice`,{
          method:'POST',
          headers:{'Authorization':`Bearer ${session.access_token}`,'apikey':cfg.supabasePublishableKey},
          body:fd
        });
        const result=await response.json().catch(()=>({error:'Unable to read voice response'}));
        if(!response.ok||result.error)throw new Error(result.error||'Unable to process voice task.');
        mapManagerVoice(result);
      }catch(error){setVoiceMessage(error.message||'Unable to process voice task.')}
      finally{setVoiceProcessing(false)}
    }
    async function startManagerMobileVoice(lang){
      if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){
        setVoiceMessage('Microphone recording is not available. Please use current Chrome/Safari and allow microphone access.');
        return;
      }
      stopManagerVoice();setVoiceTranscript('');setVoiceMessage('🎤 Speak naturally. Tap Stop when finished.');
      try{
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});
        mobileStreamRef.current=stream;mobileChunksRef.current=[];mobileVoiceLangRef.current=lang;
        const mime=managerBestMime();
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
          await managerSendAudio(blob,mobileVoiceLangRef.current);
        };
        rec.start();setVoiceListening(true);
      }catch(error){
        setVoiceListening(false);
        setVoiceMessage(error?.name==='NotAllowedError'?'Microphone permission is blocked. Please allow microphone access for Samara Care.':(error.message||'Unable to start microphone.'));
      }
    }
    function startManagerVoice(lang='ta-IN'){
      const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;

      // v2.10.56: Prefer browser speech recognition on Android/Chrome too.
      // Earlier code forced every mobile device through MediaRecorder + Edge Function audio upload.
      // That path can record successfully but still produce no transcript/entry if the remote
      // audio endpoint is unavailable or rejects the uploaded codec. Chrome Android already
      // exposes webkitSpeechRecognition, so use it first and fall back to MediaRecorder only
      // when speech recognition is genuinely unavailable.
      if(!SpeechRecognition){
        return startManagerMobileVoice(lang);
      }

      stopManagerVoice();
      setVoiceTranscript('');
      setVoiceMessage(lang==='ta-IN'
        ?'🎤 Listening in Tamil… Speak naturally and pause when finished.'
        :'🎤 Listening in English… Speak naturally and pause when finished.');

      try{
        const rec=new SpeechRecognition();
        voiceRecognitionRef.current=rec;
        rec.lang=lang;
        rec.interimResults=true;
        rec.continuous=false;
        rec.maxAlternatives=1;

        let finalText='';
        let latestText='';
        let sent=false;

        const finishWithText=()=>{
          if(sent)return;
          sent=true;
          setVoiceListening(false);
          const spoken=(finalText||latestText||'').trim();
          if(!spoken){
            setVoiceMessage('No speech was captured. Please tap the microphone and try again.');
            return;
          }

          setVoiceTranscript(spoken);

          // English gets an immediate local entry so the form never appears to do nothing
          // while the structured parser is being contacted.
          if(String(lang).toLowerCase().startsWith('en')){
            setForm(current=>({
              ...current,
              subject:current.subject||spoken
            }));
          }

          managerSendTranscript(spoken,lang);
        };

        rec.onstart=()=>setVoiceListening(true);
        rec.onresult=e=>{
          let interim='';
          for(let i=e.resultIndex;i<e.results.length;i++){
            const t=e.results[i][0]?.transcript||'';
            if(e.results[i].isFinal)finalText+=`${t} `;
            else interim+=t;
          }
          latestText=(finalText||interim).trim();
          setVoiceTranscript(latestText);
        };
        rec.onerror=e=>{
          setVoiceListening(false);
          if(e?.error==='no-speech'){
            setVoiceMessage('No speech was heard. Please tap the microphone and speak again.');
            return;
          }
          if(e?.error==='not-allowed'||e?.error==='service-not-allowed'){
            setVoiceMessage('Microphone / speech permission is blocked. Please allow microphone access for Samara Care in Chrome.');
            return;
          }
          // If browser recognition fails before any transcript, fall back to recorder.
          if(!latestText&&!finalText){
            setVoiceMessage('Browser voice recognition was unavailable. Opening recorder fallback…');
            setTimeout(()=>startManagerMobileVoice(lang),150);
            return;
          }
          setVoiceMessage(`Voice recognition stopped${e?.error?`: ${e.error}`:''}. Please try again.`);
        };
        rec.onend=finishWithText;
        rec.start();
      }catch(error){
        setVoiceListening(false);
        setVoiceMessage('Opening microphone recorder fallback…');
        setTimeout(()=>startManagerMobileVoice(lang),150);
      }
    }

    function startEdit(r){
      const toLocalInput=v=>{
        if(!v)return '';
        const d=new Date(v); if(Number.isNaN(d.getTime()))return '';
        const pad=n=>String(n).padStart(2,'0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      };
      setEditing(r.id);
      setForm({
        subject:r.subject||'',category:r.category||'General',priority:r.priority||'Normal',
        due_at:toLocalInput(r.due_at),follow_up_at:toLocalInput(r.follow_up_at),
        notes:r.notes||'',status:r.status||'Pending'
      });
      window.scrollTo({top:0,behavior:'smooth'});
    }
    function cancelEdit(){setEditing(null);setForm(emptyForm());}

    async function save(e){
      e.preventDefault();
      if(!form.subject.trim()){setMessage('Please enter the task / follow-up subject.');return}
      setBusy(true);setMessage('');
      const payload={
        subject:form.subject.trim(),category:form.category,priority:form.priority,status:form.status,
        due_at:form.due_at?new Date(form.due_at).toISOString():null,
        follow_up_at:form.follow_up_at?new Date(form.follow_up_at).toISOString():null,
        notes:form.notes.trim()||null,
        completed_at:form.status==='Completed'?new Date().toISOString():null
      };
      const q=editing
        ?client.from('manager_personal_tasks').update(payload).eq('id',editing)
        :client.from('manager_personal_tasks').insert(payload);
      const {error}=await q;
      setBusy(false);
      if(error){setMessage(error.message);return}
      setMessage(editing?'✓ Item updated.':'✓ Added to your personal list.');
      cancelEdit(); await load();
    }

    async function quickUpdate(r,patch){
      setBusy(true);setMessage('');
      const payload={...patch};
      if(patch.status==='Completed')payload.completed_at=new Date().toISOString();
      const {error}=await client.from('manager_personal_tasks').update(payload).eq('id',r.id);
      setBusy(false);
      if(error){setMessage(error.message);return}
      await load();
    }
    async function remove(r){
      if(!confirm(`Delete "${r.subject}" from your personal list?`))return;
      const {error}=await client.from('manager_personal_tasks').delete().eq('id',r.id);
      if(error){setMessage(error.message);return}
      await load();
    }
    function remindTomorrow(r){
      const d=new Date(); d.setDate(d.getDate()+1); d.setHours(9,0,0,0);
      quickUpdate(r,{follow_up_at:d.toISOString(),status:r.status==='Completed'?'Pending':r.status});
    }

    const stat=(label,value,key)=>h('button',{type:'button',className:'card stat',onClick:()=>setFilter(key),
      style:{cursor:'pointer',textAlign:'left',border:filter===key?'2px solid #a91653':undefined}},
      h('span',null,label),h('strong',null,value),h('small',null,'Open list →'));

    return h('div',{className:'manager-personal-todo'},
      h('div',{className:'shift-summary'},
        h('div',null,h('strong',null,'My To-Do & Follow-up'),h('span',null,'Private personal workspace — visible only to you')),
        h('span',{className:'badge'},formalName(profile))
      ),
      h('div',{className:'grid stats',style:{marginTop:'14px'}},
        stat('Due Today',dueToday,'Today'),
        stat('Overdue',overdue,'Overdue'),
        stat('Follow-ups Pending',followup,'Follow-up'),
        stat('Completed Today',completedToday,'Completed')
      ),
      message?h('div',{className:`message ${message.startsWith('✓')?'success':'error'}`,style:{marginTop:'12px'}},message):null,
      h(Section,{title:editing?'Edit Personal Item':'Add Personal Item',subtitle:'This is your own private Manager list. Admin and other Managers cannot access it.'},
        h('div',{style:{margin:'0 0 14px',padding:'13px',border:'1px solid #e7bfd0',borderRadius:'15px',background:'linear-gradient(135deg,#fffafd,#f9e6ee)'}},
          h('div',{style:{display:'flex',justifyContent:'space-between',gap:'8px',alignItems:'center',flexWrap:'wrap'}},
            h('div',null,h('strong',{style:{color:'#78103f'}},'🎤 Tamil / English Voice Task'),h('div',{style:{fontSize:'12px',color:'#765966',marginTop:'2px'}},'Speak naturally. The task will be converted into simple English and filled below.')),
            voiceListening?h('button',{type:'button',className:'btn btn-danger',onClick:stopManagerVoice},'■ Stop'):h('div',{className:'actions'},
              h('button',{type:'button',className:'btn btn-primary',disabled:voiceProcessing,onClick:()=>startManagerVoice('ta-IN')},voiceProcessing?'Processing…':'🎤 Speak Tamil'),
              h('button',{type:'button',className:'btn btn-secondary',disabled:voiceProcessing,onClick:()=>startManagerVoice('en-IN')},'🎤 Speak English')
            )
          ),
          voiceTranscript&&h('div',{style:{marginTop:'9px',fontSize:'13px'}},h('strong',null,'Heard: '),voiceTranscript),
          voiceMessage&&h('div',{style:{marginTop:'7px',fontSize:'13px',fontWeight:700,color:voiceMessage.startsWith('✓')?'#08783d':'#7a3150'}},voiceMessage)
        ),
        h('form',{onSubmit:save},
          h('div',{className:'grid two'},
            h('div',{className:'field'},h('label',null,'Subject *'),h('input',{value:form.subject,onChange:e=>setForm({...form,subject:e.target.value}),required:true,placeholder:'What needs to be done / followed up?'})),
            h('div',{className:'field'},h('label',null,'Category'),h('select',{value:form.category,onChange:e=>setForm({...form,category:e.target.value})},
              ['General','Patient / Relative','Staff','Vendor','Maintenance','Billing','Admission'].map(x=>h('option',{key:x},x)))),
            h('div',{className:'field'},h('label',null,'Priority'),h('select',{value:form.priority,onChange:e=>setForm({...form,priority:e.target.value})},
              ['Low','Normal','High','Urgent'].map(x=>h('option',{key:x},x)))),
            h('div',{className:'field'},h('label',null,'Status'),h('select',{value:form.status,onChange:e=>setForm({...form,status:e.target.value})},
              ['Pending','In Progress','Waiting','Completed'].map(x=>h('option',{key:x},x)))),
            h('div',{className:'field'},h('label',null,'Due Date & Time'),h(StrictDateTimeInput,{value:form.due_at,onChange:e=>setForm({...form,due_at:e.target.value})})),
            h('div',{className:'field'},h('label',null,'Follow-up Date & Time'),h(StrictDateTimeInput,{value:form.follow_up_at,onChange:e=>setForm({...form,follow_up_at:e.target.value})}))
          ),
          h('div',{className:'field'},h('label',null,'Notes'),h('textarea',{rows:3,value:form.notes,onChange:e=>setForm({...form,notes:e.target.value}),placeholder:'Short personal note / next action'})),
          h('div',{className:'actions'},
            h('button',{className:'btn btn-primary',disabled:busy},busy?'Saving…':editing?'Update Item':'Add to My List'),
            editing&&h('button',{type:'button',className:'btn btn-secondary',onClick:cancelEdit},'Cancel')
          )
        )
      ),
      h(Section,{title:'My List',subtitle:`${visible.length} item(s) · ${filter}`},
        h('div',{className:'actions',style:{marginBottom:'10px'}},
          ['Open','Today','Overdue','Follow-up','Completed','All'].map(x=>h('button',{type:'button',key:x,className:`btn ${filter===x?'btn-primary':'btn-secondary'}`,onClick:()=>setFilter(x)},x))
        ),
        visible.length?h('div',{style:{display:'grid',gap:'10px'}},visible.map(r=>
          h('div',{key:r.id,className:'card',style:{padding:'13px 14px',borderLeft:`5px solid ${r.priority==='Urgent'?'#a70f4d':r.priority==='High'?'#d26a20':'#d7a8bc'}`}},
            h('div',{style:{display:'flex',justifyContent:'space-between',gap:'10px',flexWrap:'wrap'}},
              h('div',{style:{flex:'1 1 260px'}},
                h('strong',{style:{fontSize:'16px',color:'#4b1630'}},r.subject),
                h('div',{style:{marginTop:'5px',display:'flex',gap:'6px',flexWrap:'wrap'}},
                  h('span',{className:'badge'},r.category||'General'),
                  h('span',{className:'badge'},r.priority||'Normal'),
                  h('span',{className:'badge'},r.status||'Pending')
                ),
                r.due_at&&h('small',{style:{display:'block',marginTop:'7px'}},`Due: ${formatDateTimeIN(r.due_at)}`),
                r.follow_up_at&&h('small',{style:{display:'block',marginTop:'3px'}},`Follow-up: ${formatDateTimeIN(r.follow_up_at)}`),
                r.notes&&h('p',{style:{margin:'7px 0 0',whiteSpace:'pre-wrap'}},r.notes)
              ),
              h('div',{className:'actions',style:{alignSelf:'flex-start'}},
                r.status!=='Completed'&&h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:()=>quickUpdate(r,{status:'Completed'})},'✓ Complete'),
                r.status!=='Completed'&&h('button',{type:'button',className:'btn btn-secondary',disabled:busy,onClick:()=>remindTomorrow(r)},'Tomorrow'),
                h('button',{type:'button',className:'btn btn-secondary',onClick:()=>startEdit(r)},'Edit'),
                h('button',{type:'button',className:'btn btn-danger',onClick:()=>remove(r)},'Delete')
              )
            )
          )
        )):h('p',{className:'empty'},'No items in this view.')
      )
    );
  }

