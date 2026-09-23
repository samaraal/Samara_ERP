  function NursePersonalTodoList({profile}){
    const pad=n=>String(n).padStart(2,'0');
    const dateKey=value=>{if(!value)return '';const d=new Date(value);return Number.isNaN(d.getTime())?'':`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`};
    const today=dateKey(new Date());
    const [rows,setRows]=React.useState([]),[selected,setSelected]=React.useState(today),[month,setMonth]=React.useState(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1)});
    const [show,setShow]=React.useState(false),[editing,setEditing]=React.useState(null),[title,setTitle]=React.useState(''),[taskDate,setTaskDate]=React.useState(today),[taskTime,setTaskTime]=React.useState('');
    const [busy,setBusy]=React.useState(false),[message,setMessage]=React.useState(''),[listening,setListening]=React.useState(false),[heard,setHeard]=React.useState('');
    const recognitionRef=React.useRef(null),recorderRef=React.useRef(null),streamRef=React.useRef(null),chunksRef=React.useRef([]),langRef=React.useRef('ta-IN');
    const allowed=profile?.role==='Nurse'||isNursingManagerProfile(profile);

    async function load(){
      if(!allowed)return;
      const {data,error}=await client.from('nurse_personal_todos').select('*').order('scheduled_at',{ascending:true}).order('created_at',{ascending:true});
      if(error)setMessage(error.message?.includes('nurse_personal_todos')?'Database setup is pending. Run 109_nurse_personal_todo.sql once.':(error.message||'Unable to load to-do list.'));
      else{setRows(data||[]);setMessage('')}
    }
    React.useEffect(()=>{load();if(!allowed)return;const ch=client.channel(`nurse-personal-todos-${profile.id}`).on('postgres_changes',{event:'*',schema:'public',table:'nurse_personal_todos'},load).subscribe();return()=>client.removeChannel(ch)},[profile?.id]);
    function stop(){try{recognitionRef.current?.stop?.()}catch(_){}try{if(recorderRef.current?.state!=='inactive')recorderRef.current.stop()}catch(_){}setListening(false)}
    function openNew(){stop();setEditing(null);setTitle('');setTaskDate(selected);setTaskTime('');setHeard('');setMessage('');setShow(true)}
    function openEdit(r){stop();setEditing(r);setTitle(r.title||'');setTaskDate(dateKey(r.scheduled_at||r.due_date)||selected);setTaskTime(r.scheduled_at?new Date(r.scheduled_at).toLocaleTimeString('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit'}):'');setHeard('');setShow(true)}
    async function applyVoice(transcript,lang,audio){
      setBusy(true);setMessage('Understanding your voice…');
      try{
        const {data:{session}}=await client.auth.getSession();if(!session)throw new Error('Please sign in again.');
        let body,headers={'Authorization':`Bearer ${session.access_token}`,'apikey':cfg.supabasePublishableKey};
        if(audio){body=new FormData();body.append('audio',audio,`nurse-todo.${audio.type.includes('mp4')?'m4a':'webm'}`);body.append('spoken_language',lang);body.append('current_form_type','Task');body.append('current_task_kind','General Task');body.append('now_iso',new Date().toISOString());body.append('timezone','Asia/Kolkata')}
        else{headers['Content-Type']='application/json';body=JSON.stringify({transcript,spoken_language:lang,current_form_type:'Task',current_task_kind:'General Task',now_iso:new Date().toISOString(),timezone:'Asia/Kolkata'})}
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/director-office-voice`,{method:'POST',headers,body});
        const result=await response.json().catch(()=>({error:'Unable to read voice response'}));if(!response.ok||result.error)throw new Error(result.error||'Unable to understand voice.');
        const fields=result.fields||{};
        const faithfulTranslation=String(fields.details||'').trim();
        const shortTitle=String(fields.title||'').trim();
        setHeard(result.transcript||transcript||'');
        // Director's Office keeps `title` short. The nurse to-do has one text field,
        // so use the complete translated details and preserve the full spoken meaning.
        setTitle(faithfulTranslation||shortTitle||result.transcript||transcript||'');
        const voiceDate=fields.scheduled_at?String(fields.scheduled_at).slice(0,10):fields.due_date;if(voiceDate)setTaskDate(voiceDate);
        if(fields.scheduled_at&&String(fields.scheduled_at).includes('T'))setTaskTime(String(fields.scheduled_at).slice(11,16));
        setMessage('✓ Captured. Please check and tap Save.');
      }catch(error){setMessage(error.message||'Unable to process voice.')}finally{setBusy(false)}
    }
    async function startRecording(lang){
      try{
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});streamRef.current=stream;chunksRef.current=[];langRef.current=lang;
        const options=['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(x=>MediaRecorder.isTypeSupported?.(x));const rec=options?new MediaRecorder(stream,{mimeType:options}):new MediaRecorder(stream);recorderRef.current=rec;
        rec.ondataavailable=e=>{if(e.data?.size)chunksRef.current.push(e.data)};rec.onstop=()=>{const blob=new Blob(chunksRef.current,{type:rec.mimeType||'audio/webm'});stream.getTracks().forEach(t=>t.stop());streamRef.current=null;recorderRef.current=null;setListening(false);if(blob.size>1000)applyVoice('',langRef.current,blob);else setMessage('No speech was captured. Please try again.')};rec.start();setListening(true);setMessage('🎤 Speak naturally, then tap Stop.');
      }catch(error){setMessage(error?.name==='NotAllowedError'?'Please allow microphone access.':(error.message||'Unable to start microphone.'))}
    }
    function startVoice(lang){
      stop();setHeard('');
      // Always prefer MediaRecorder when available. Unlike browser speech recognition,
      // it does not stop at the first sentence or a natural pause; recording continues
      // until the nurse explicitly taps Stop Recording.
      if(navigator.mediaDevices?.getUserMedia&&window.MediaRecorder)return startRecording(lang);
      const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SpeechRecognition)return setMessage('Voice recognition is unavailable in this browser.');
      const rec=new SpeechRecognition();recognitionRef.current=rec;rec.lang=lang;rec.interimResults=true;rec.continuous=true;let finalText='';rec.onstart=()=>{setListening(true);setMessage('🎤 Speak naturally. Tap Stop when finished.')};rec.onresult=e=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const text=e.results[i][0]?.transcript||'';if(e.results[i].isFinal)finalText+=`${text} `;else interim+=text}setHeard(`${finalText}${interim}`.trim())};rec.onerror=e=>setMessage(`Voice stopped${e.error?`: ${e.error}`:''}. Please try again.`);rec.onend=()=>{setListening(false);recognitionRef.current=null;const text=finalText.trim();if(text)applyVoice(text,lang);else setMessage('No speech was captured. Please try again.')};rec.start();
    }
    async function save(e){
      e.preventDefault();if(!title.trim()||!taskDate)return setMessage('Please enter the to-do and date.');setBusy(true);
      const {data:{session}}=await client.auth.getSession();const scheduled=taskTime?new Date(`${taskDate}T${taskTime}:00+05:30`).toISOString():null;
      const payload={owner_auth_id:session?.user?.id,owner_profile_id:profile.id,title:title.trim(),due_date:taskTime?null:taskDate,scheduled_at:scheduled,updated_at:new Date().toISOString()};
      const result=editing?await client.from('nurse_personal_todos').update(payload).eq('id',editing.id):await client.from('nurse_personal_todos').insert({...payload,status:'Pending'});setBusy(false);
      if(result.error)return setMessage(result.error.message||'Unable to save.');setSelected(taskDate);setShow(false);setMessage('✓ To-do saved.');await load();
    }
    async function complete(r){const {error}=await client.from('nurse_personal_todos').update({status:r.status==='Completed'?'Pending':'Completed',completed_at:r.status==='Completed'?null:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',r.id);if(error)setMessage(error.message);else load()}
    async function remove(r){if(!window.confirm('Delete this personal to-do?'))return;const {error}=await client.from('nurse_personal_todos').delete().eq('id',r.id);if(error)setMessage(error.message);else load()}
    function calendar(){const y=month.getFullYear(),m=month.getMonth(),lead=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate(),counts={};rows.forEach(r=>{const key=dateKey(r.scheduled_at||r.due_date);if(key)counts[key]=(counts[key]||0)+1});const cells=[...Array(lead).fill(null),...Array.from({length:days},(_,i)=>i+1)];return h('div',{className:'nurse-todo-calendar'},h('div',{className:'nurse-todo-calendar-head'},h('button',{type:'button',onClick:()=>setMonth(new Date(y,m-1,1))},'‹'),h('strong',null,month.toLocaleDateString('en-IN',{month:'long',year:'numeric'})),h('button',{type:'button',onClick:()=>setMonth(new Date(y,m+1,1))},'›')),h('div',{className:'nurse-todo-week'},['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>h('span',{key:x},x))),h('div',{className:'nurse-todo-days'},cells.map((day,i)=>{if(!day)return h('span',{key:`blank-${i}`});const key=`${y}-${pad(m+1)}-${pad(day)}`;return h('button',{type:'button',key,className:`${key===selected?'selected ':''}${key===today?'today':''}`,onClick:()=>setSelected(key)},h('span',null,day),counts[key]?h('small',null,counts[key]):null)})))}
    if(!allowed)return h(Section,{title:'My To-Do List'},h('div',{className:'empty'},'Available only to nurses.'));
    const dayRows=rows.filter(r=>dateKey(r.scheduled_at||r.due_date)===selected);
    return h('div',{className:'nurse-personal-todos'},
      h('div',{className:'shift-summary'},h('div',null,h('strong',null,'My To-Do List'),h('span',null,'Your private personal reminders')),h('button',{type:'button',className:'btn btn-primary',onClick:openNew},'＋ Add To-Do')),
      h(Section,{title:'Calendar',subtitle:'Tap a date to view its list'},calendar()),
      message&&!show?h('div',{className:`message ${message.startsWith('✓')?'success':'error'}`},message):null,
      h(Section,{title:`To-Do — ${formatDateIN(new Date(`${selected}T00:00:00`))}`,subtitle:`${dayRows.length} item${dayRows.length===1?'':'s'} for this day`},dayRows.length?h('div',{className:'nurse-todo-list'},dayRows.map((r,i)=>h('div',{className:`nurse-todo-row ${r.status==='Completed'?'completed':''}`,key:r.id},h('span',{className:'nurse-todo-number'},`${i+1}.`),h('button',{type:'button',className:'nurse-todo-check',onClick:()=>complete(r),'aria-label':r.status==='Completed'?'Mark pending':'Mark completed'},r.status==='Completed'?'✓':'○'),h('div',{className:'nurse-todo-copy'},h('strong',null,r.title),h('small',null,r.scheduled_at?formatTimeIN(r.scheduled_at):'Any time')),h('div',{className:'actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>openEdit(r)},'Edit'),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>remove(r)},'Delete'))))):h('div',{className:'empty'},'No to-do items for this day.'),h('button',{type:'button',className:'btn btn-primary nurse-todo-add-bottom',onClick:openNew},'＋ Add To-Do')),
      show?h('div',{className:'modal-backdrop'},
        h('form',{className:'modal-card nurse-todo-modal',onSubmit:save},
          h('div',{className:'panel-head'},
            h('div',null,h('h3',null,editing?'Update To-Do':'New To-Do'),h('small',null,'Use the Voice button exactly as in Nurse Handover, or type')),
            h('button',{type:'button',className:'close',onClick:()=>setShow(false)},'×')
          ),
          h('div',{className:'modal-grid'},
            h('div',{className:'field span-2'},h('label',null,'What to do? *'),h('textarea',{required:true,rows:4,value:title,onChange:e=>setTitle(e.target.value),placeholder:'Personal reminder / note'})),
            h('div',{className:'field'},h('label',null,'Date'),h(StrictDateInput,{value:taskDate,onChange:e=>setTaskDate(e.target.value)})),
            h('div',{className:'field'},h('label',null,'Time (optional)'),h('input',{type:'time',value:taskTime,onChange:e=>setTaskTime(e.target.value)}))
          ),
          message?h('div',{className:'message'},message):null,
          h('div',{className:'actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setShow(false)},'Cancel'),h('button',{type:'submit',className:'btn btn-primary',disabled:busy},busy?'Saving…':'Save'))
        )
      ):null
    );
  }

