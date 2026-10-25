  // ---------------------------------------------------------------------------------------------
  // 2.18.139 Nursing Notes (SQL 297) — separate from Shift Handover.
  //   * Each Guest: notes written by the nurse during the shift, typed or by the voice assistant
  //     (Tamil / English speech → simple English, arranged by AI → nurse checks → Save).
  //   * Switch on the form: DAR (Focus · Data · Action · Response) or Quick note.
  //   * Minimum 2 notes per Guest per shift (1 if admitted > 6 h into the shift). Reminder 5 PM / 5 AM,
  //     Managers + Admin escalation 6 PM / 6 AM (clinical alert engine, SQL 297).
  //   * Focus Fall / Incident or "Inform Nursing Manager now" → Nursing Manager + Admin alerted at once.
  //   * Never edited or deleted — corrections are Addenda (reason, who, when).
  //   * Single-click view: Patient card → "📝 Nursing Notes"; NURSING → Nursing Notes board.
  //   * Internal only (not in Family Portal / family report). Doctor's report includes them.
  // ---------------------------------------------------------------------------------------------
  const NN_FOCUS=[
    ['General condition','🙂','#7a5af0'],['Sleep / Rest','😴','#5b6ee1'],['Pain','🤕','#d9480f'],['Fall','⚠️','#c92a2a'],
    ['Incident','🚨','#c2255c'],['Behaviour / Mood','💬','#9c36b5'],['Breathing','🫁','#1c7ed6'],['Skin / Wound','🩹','#e8590c'],
    ['Bowel / Bladder','🚻','#0b7285'],['Eating / Drinking','🍽','#2b8a3e'],['Mobility','🚶','#087f5b'],['Medication response','💊','#0ca678'],
    ['Family visit / call','👪','#d6336c'],['Doctor visit / instruction','🩺','#1971c2'],['Other','📝','#868e96']
  ];
  const NN_ALERT_FOCUS=['Fall','Incident'];
  const NN_WRITE_ROLES=['Admin','Manager','Nurse','Caregiver'];
  const NN_MODE_KEY='samara-nursing-note-mode';
  const nnFocusInfo=f=>NN_FOCUS.find(x=>x[0]===f)||NN_FOCUS[NN_FOCUS.length-1];
  const nnCanUse=profile=>NN_WRITE_ROLES.includes(profile?.role)||isNursingManagerProfile(profile);
  const nnParts=d=>{const p=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d);const g=t=>p.find(x=>x.type===t)?.value||'00';return {y:g('year'),m:g('month'),d:g('day'),hh:g('hour')==='24'?'00':g('hour'),mi:g('minute')}};
  const nnISO=d=>{const p=nnParts(new Date(d));return `${p.y}-${p.m}-${p.d}`};
  const nnAt=(iso,hm)=>new Date(`${iso}T${hm}:00+05:30`);
  const nnAddDays=(iso,n)=>{const d=new Date(`${iso}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
  // start of the Samara shift (7 AM / 7 PM India time) that contains a moment
  function nnShiftStart(at=new Date()){
    const d=new Date(at),p=nnParts(d),hh=Number(p.hh),iso=`${p.y}-${p.m}-${p.d}`;
    if(hh>=19)return nnAt(iso,'19:00');
    if(hh>=7)return nnAt(iso,'07:00');
    return nnAt(nnAddDays(iso,-1),'19:00');
  }
  const nnIsDay=start=>Number(nnParts(new Date(start)).hh)===7;
  const nnShiftName=start=>nnIsDay(start)?'Day Shift (7 AM–7 PM)':'Night Shift (7 PM–7 AM)';
  const nnTime=at=>{const p=nnParts(new Date(at));const h=Number(p.hh);return `${((h+11)%12)+1}:${p.mi} ${h<12?'AM':'PM'}`};
  const nnDateTime=at=>`${formatDateIN(nnISO(at))} ${nnTime(at)}`;
  const nnPatientLabel=p=>p?`${formalName(p)||p.full_name||'Guest'}${p.room_no?` · Room ${p.room_no}${p.bed_no?'-'+p.bed_no:''}`:''}`:'Guest';
  const nnNeeded=(patient,shiftStart)=>{
    // same rule as SQL nursing_notes_needed: 1 note when admitted more than 6 h into the shift, else 2
    if(!patient?.admission_date)return 2;
    const t=String(patient.admission_time||'').slice(0,5)||(patient.created_at?(()=>{const p=nnParts(new Date(patient.created_at));return `${p.hh}:${p.mi}`})():'00:00');
    const admitted=nnAt(String(patient.admission_date).slice(0,10),t);
    return admitted.getTime()>new Date(shiftStart).getTime()+6*3600000?1:2;
  };
  const nnMissingTable=error=>/nursing_notes|nursing_note|does not exist|schema cache|save_nursing_note/i.test(String(error?.message||''));
  const nnSqlHint='Nursing Notes are not set up yet — run SQL 297_nursing_notes.sql in Supabase first.';
  const nnNoteText=n=>n?.note_mode==='Quick'?String(n.quick_text||''):[n?.data_text,n?.action_text,n?.response_text].filter(Boolean).join(' ');
  const nnLate=n=>n&&n.created_at&&n.observed_at&&(new Date(n.created_at)-new Date(n.observed_at))>60*60000;
  const nnEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  async function nnLoadNotes({patientId,from,to,limit=600}){
    let q=client.from('nursing_notes').select('*');
    if(patientId)q=q.eq('patient_id',patientId);
    if(from)q=q.gte('observed_at',nnAt(from,'00:00').toISOString());
    if(to)q=q.lt('observed_at',nnAt(nnAddDays(to,1),'00:00').toISOString());
    const notes=await q.order('observed_at',{ascending:false}).limit(limit);
    if(notes.error)return {error:notes.error,notes:[],addenda:[]};
    const ids=(notes.data||[]).map(n=>n.id);
    let addenda=[];
    for(let i=0;i<ids.length;i+=150){
      const r=await client.from('nursing_note_addenda').select('*').in('note_id',ids.slice(i,i+150)).order('created_at',{ascending:true});
      if(!r.error)addenda=addenda.concat(r.data||[]);
    }
    return {notes:notes.data||[],addenda,error:null};
  }
  // Shift Handover helper: this shift's notes for one Guest as plain text
  async function nursingNotesShiftSummary(patientId,shiftLabel){
    let start=nnShiftStart(new Date());
    if(shiftLabel&&nnShiftName(start)!==shiftLabel)start=new Date(start.getTime()-12*3600000);
    const r=await client.from('nursing_notes').select('*').eq('patient_id',patientId).eq('shift_start',start.toISOString()).order('observed_at',{ascending:true});
    if(r.error)throw new Error(nnMissingTable(r.error)?nnSqlHint:r.error.message);
    return (r.data||[]).map(n=>`${nnTime(n.observed_at)} ${n.focus}: ${n.note_mode==='Quick'?n.quick_text:[n.data_text,n.action_text?`Action: ${n.action_text}`:'',n.response_text?`Response: ${n.response_text}`:''].filter(Boolean).join(' ')}`).join('\n');
  }

  ;(function(){
    if(document.getElementById('nursing-notes-css'))return;
    const st=document.createElement('style');st.id='nursing-notes-css';
    st.textContent=`
      .nn-page{display:grid;gap:14px}
      .nn-hero{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;padding:16px 18px;border-radius:18px;background:linear-gradient(120deg,#fff4f9,#ffe1ee 55%,#ffd3e6);border:1px solid #f4c7db}
      .nn-hero h2{margin:0;color:#a3124f;font-size:22px}
      .nn-hero small{display:block;color:#7b5a69;margin-top:4px}
      .nn-hero .nn-shift{font-weight:800;color:#b20b5d;background:#fff;border:1px solid #f1bcd3;border-radius:999px;padding:6px 12px;white-space:nowrap}
      .nn-stats{display:flex;gap:8px;flex-wrap:wrap}
      .nn-stat{background:#fff;border:1px solid #f1d1df;border-radius:14px;padding:8px 12px;min-width:110px}
      .nn-stat span{display:block;font-size:11px;font-weight:800;color:#8a6577;text-transform:uppercase;letter-spacing:.3px}
      .nn-stat strong{font-size:20px;color:#3a2531}
      .nn-stat.warn strong{color:#c2410c}.nn-stat.ok strong{color:#0f7a43}
      .nn-filters{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}
      .nn-filters .field{margin:0;min-width:0;flex:0 0 185px;width:185px}
      .nn-filters .field select,.nn-filters .field input{width:100%;min-height:38px;padding-top:6px;padding-bottom:6px}
      .nn-filters .field label{font-size:12px}
      .nn-tabs{display:flex;gap:6px;flex-wrap:wrap}
      .nn-tabs button{border:1px solid #efc3d7;background:#fff;color:#a3124f;border-radius:999px;padding:7px 14px;font-weight:700;cursor:pointer}
      .nn-tabs button.on{background:linear-gradient(120deg,#c41465,#e0518f);color:#fff;border-color:transparent}
      .nn-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px}
      .nn-card{background:#fff;border:1px solid #f0d3e0;border-radius:16px;padding:12px 14px;display:grid;gap:8px;box-shadow:0 2px 10px rgba(178,11,93,.05)}
      .nn-card.pending{border-color:#f5b48a;background:linear-gradient(180deg,#fff,#fff8f2)}
      .nn-card.done{border-color:#a7dfbd}
      .nn-card-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;cursor:pointer}
      .nn-card-head strong{display:block;color:#3a2531;font-size:15px}
      .nn-card-head small{color:#7b6470}
      .nn-count{font-weight:800;border-radius:999px;padding:4px 10px;white-space:nowrap;font-size:13px}
      .nn-count.ok{background:#e6f7ed;color:#0f7a43}.nn-count.part{background:#fff3e0;color:#b45309}.nn-count.none{background:#ffe8e8;color:#b42318}
      .nn-last{font-size:13px;color:#5d4a54;cursor:pointer;min-height:18px}
      .nn-card-actions{display:flex;gap:6px;flex-wrap:wrap}
      .nn-card-actions .btn{padding:6px 12px;min-height:34px;font-size:13px}
      .nn-modal{max-width:860px!important;width:min(860px,calc(100vw - 20px))!important}
      .nn-form{display:grid;gap:10px}
      .nn-switch{display:inline-flex;border:1px solid #efc3d7;border-radius:999px;overflow:hidden;background:#fff}
      .nn-switch button{border:0;background:transparent;padding:8px 16px;font-weight:800;color:#a3124f;cursor:pointer}
      .nn-switch button.on{background:linear-gradient(120deg,#c41465,#e0518f);color:#fff}
      .nn-voice{border:1px dashed #e7a3c3;border-radius:16px;padding:10px 12px;background:linear-gradient(120deg,#fff7fb,#ffeef6);display:grid;gap:8px}
      .nn-voice-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .nn-voice-row .btn{min-height:40px}
      .nn-voice .nn-rec{background:#c92a2a!important;color:#fff!important;border-color:#c92a2a!important;animation:nnPulse 1.2s infinite}
      @keyframes nnPulse{0%,100%{box-shadow:0 0 0 0 rgba(201,42,42,.45)}50%{box-shadow:0 0 0 8px rgba(201,42,42,0)}}
      .nn-voice-msg{font-size:13px;color:#6d4b5c}
      .nn-heard{font-size:12.5px;color:#5d4a54;background:#fff;border:1px solid #f0d3e0;border-radius:10px;padding:6px 9px}
      .nn-dar label .nn-letter{display:inline-flex;width:22px;height:22px;border-radius:7px;align-items:center;justify-content:center;background:#b20b5d;color:#fff;font-weight:900;margin-right:6px;font-size:12px}
      .nn-form textarea{min-height:70px}
      .nn-form .nn-needs-check textarea,.nn-form .nn-needs-check select{background:#fffbe0!important;border-color:#f2d36b!important}
      .nn-when{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end}
      .nn-when .field{margin:0;min-width:150px}
      .nn-alertbox{border-radius:12px;padding:8px 12px;background:#fff1f1;border:1px solid #f5b5b5;color:#9f1d1d;font-weight:700;font-size:13px}
      .nn-check{display:flex;gap:8px;align-items:center;font-weight:700;color:#7a1247}
      .nn-check input{width:20px;height:20px}
      .nn-timeline{display:grid;gap:12px}
      .nn-day h4{margin:0 0 6px;color:#a3124f;font-size:14px;display:flex;gap:8px;align-items:center}
      .nn-day h4 small{color:#8a6577;font-weight:600}
      .nn-note{border:1px solid #f0d3e0;border-left:5px solid var(--nn-c,#b20b5d);border-radius:12px;background:#fff;padding:9px 12px;margin:0 0 8px;cursor:pointer;display:grid;gap:5px}
      .nn-note:hover{box-shadow:0 3px 14px rgba(178,11,93,.10)}
      .nn-note.alert{background:#fff6f6}
      .nn-note-head{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:13px;color:#6d5862}
      .nn-note-head b{color:#3a2531}
      .nn-chip{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:2px 9px;font-weight:800;font-size:12px;color:#fff;background:var(--nn-c,#b20b5d)}
      .nn-tag{display:inline-block;border-radius:999px;padding:1px 8px;font-size:11.5px;font-weight:700;background:#f5eef2;color:#6d5862}
      .nn-tag.red{background:#ffe3e3;color:#b42318}.nn-tag.amber{background:#fff1db;color:#a35200}
      .nn-dar-line{font-size:13.5px;color:#3a2531;line-height:1.4}
      .nn-dar-line em{font-style:normal;font-weight:800;color:#b20b5d;margin-right:4px}
      .nn-addendum{margin-left:6px;border-left:3px solid #f2b8d1;padding:4px 8px;background:#fff8fb;border-radius:0 8px 8px 0;font-size:12.5px;color:#5d4a54}
      .nn-empty{padding:18px;text-align:center;color:#8a6577;background:#fff;border:1px dashed #efc3d7;border-radius:14px}
      .sidebar .nav-submenu button[data-nav='Nursing Notes']::before{
        color:#ff7eb6!important;
        -webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 3h9l4 4v14H6z'/%3E%3Cpath d='M14 3v5h5M9 12h7M9 16h5'/%3E%3C/svg%3E")!important;
        mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 3h9l4 4v14H6z'/%3E%3Cpath d='M14 3v5h5M9 12h7M9 16h5'/%3E%3C/svg%3E")!important;
      }
      @media(max-width:640px){.nn-hero h2{font-size:19px}.nn-filters .field{flex:1 1 calc(50% - 8px);width:auto}.nn-modal{width:calc(100vw - 8px)!important}}
    `;
    document.head.appendChild(st);
  })();

  // ---------------- Voice assistant (whole note) ----------------
  function nnBestMime(){for(const x of ['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus']){try{if(window.MediaRecorder&&MediaRecorder.isTypeSupported?.(x))return x}catch(_){}}return ''}
  async function nnVoiceCall(body,isForm){
    const {data:{session}}=await client.auth.getSession();if(!session)throw new Error('Please sign in again.');
    const headers={'Authorization':`Bearer ${session.access_token}`,'apikey':cfg.supabasePublishableKey};
    if(!isForm)headers['Content-Type']='application/json';
    const r=await fetch(`${cfg.supabaseUrl}/functions/v1/nursing-note-voice`,{method:'POST',headers,body:isForm?body:JSON.stringify(body)});
    const j=await r.json().catch(()=>({error:`Voice service did not answer (${r.status}).`}));
    if(!r.ok||j.error)throw new Error(j.error||`Voice service error ${r.status}`);
    return j;
  }
  // Fallback when the Nursing Notes voice function is not deployed / fails: the existing Tamil → English voice service.
  async function nnPlainVoice(blob,lang,spoken){
    const {data:{session}}=await client.auth.getSession();if(!session)throw new Error('Please sign in again.');
    let r;
    if(blob){
      const ext=(blob.type||'').includes('mp4')?'m4a':(blob.type||'').includes('ogg')?'ogg':'webm';
      const fd=new FormData();fd.append('audio',blob,`nursing-note.${ext}`);fd.append('spoken_language',lang);fd.append('current_form_type','Nursing Note');fd.append('current_task_kind','Clinical Note');fd.append('provider_preference','auto');fd.append('now_iso',new Date().toISOString());fd.append('timezone','Asia/Kolkata');
      r=await fetch(`${cfg.supabaseUrl}/functions/v1/director-office-voice`,{method:'POST',headers:{'Authorization':`Bearer ${session.access_token}`,'apikey':cfg.supabasePublishableKey},body:fd});
    }else{
      if(String(lang).startsWith('en'))return {english_note:spoken,heard_text:spoken};
      r=await fetch(`${cfg.supabaseUrl}/functions/v1/director-office-voice`,{method:'POST',headers:{'Authorization':`Bearer ${session.access_token}`,'apikey':cfg.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({transcript:spoken,spoken_language:lang,current_form_type:'Nursing Note',current_task_kind:'Clinical Note',now_iso:new Date().toISOString(),timezone:'Asia/Kolkata'})});
    }
    const j=await r.json().catch(()=>({error:'Unable to read the voice response.'}));
    if(!r.ok||j.error)throw new Error(j.error||'Voice service error.');
    const f=j.fields||{};
    const text=String(f.details||f.notes||j.translated_text||j.translation||j.transcript||'').trim();
    if(!text)throw new Error('No text was returned. Please record again.');
    return {english_note:text,heard_text:String(j.transcript||spoken||'').trim()};
  }

  function NursingNoteVoice({mode,onResult}){
    const [state,setState]=React.useState('idle'); // idle | recording | processing
    const [msg,setMsg]=React.useState('');
    const recRef=React.useRef(null),streamRef=React.useRef(null),chunksRef=React.useRef([]),langRef=React.useRef('ta-IN'),srRef=React.useRef(null);
    React.useEffect(()=>()=>{try{recRef.current?.state!=='inactive'&&recRef.current?.stop()}catch(_){}try{streamRef.current?.getTracks().forEach(t=>t.stop())}catch(_){}try{srRef.current?.stop()}catch(_){}},[]);
    async function process(blob,spokenText){
      setState('processing');setMsg('Arranging your note… (Tamil is converted to simple English)');
      const lang=langRef.current;
      try{
        let res;
        if(blob){const ext=(blob.type||'').includes('mp4')?'m4a':(blob.type||'').includes('ogg')?'ogg':'webm';const fd=new FormData();fd.append('audio',blob,`nursing-note.${ext}`);fd.append('spoken_language',lang);fd.append('mode',mode);res=await nnVoiceCall(fd,true)}
        else res=await nnVoiceCall({text:spokenText,spoken_language:lang,mode},false);
        onResult({...res,voice:true,lang,structured:true});
        setMsg('✓ Filled from your voice. Check every field, correct any word, then Save.');
      }catch(e){
        console.warn('Nursing note voice (AI) failed, using plain voice:',e?.message||e);
        try{
          const res=await nnPlainVoice(blob,lang,spokenText);
          onResult({...res,voice:true,lang,structured:false});
          setMsg(mode==='DAR'?'✓ Your words are in "Data". Move any action / response to its box, then Save.':'✓ Filled from your voice. Check the note, then Save.');
        }catch(e2){setMsg(e2.message||'Voice could not be processed. Please type the note or try again.')}
      }finally{setState('idle')}
    }
    async function start(lang){
      if(state!=='idle')return;
      langRef.current=lang;setMsg('');
      if(navigator.mediaDevices?.getUserMedia&&window.MediaRecorder){
        try{
          const stream=await navigator.mediaDevices.getUserMedia({audio:true});streamRef.current=stream;chunksRef.current=[];
          const mime=nnBestMime();const rec=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);recRef.current=rec;
          rec.ondataavailable=e=>{if(e.data?.size)chunksRef.current.push(e.data)};
          rec.onstop=()=>{const blob=new Blob(chunksRef.current,{type:rec.mimeType||'audio/webm'});chunksRef.current=[];try{stream.getTracks().forEach(t=>t.stop())}catch(_){}streamRef.current=null;recRef.current=null;
            if(blob.size<1000){setState('idle');setMsg('No speech was captured. Please try again.');return}process(blob,'')};
          rec.start();setState('recording');setMsg(lang==='ta-IN'?'🎤 Listening in Tamil… speak the whole note, then tap Stop.':'🎤 Listening in English… speak the whole note, then tap Stop.');
          return;
        }catch(e){setState('idle');setMsg(e?.name==='NotAllowedError'?'Microphone permission is blocked. Please allow the microphone for Samara Care.':(e.message||'Unable to start the microphone.'));return}
      }
      const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
      if(!SR){setMsg('Voice is not available on this device. Please type the note.');return}
      const sr=new SR();srRef.current=sr;sr.lang=lang;sr.interimResults=false;sr.continuous=true;let text='';
      sr.onresult=e=>{for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)text+=`${e.results[i][0]?.transcript||''} `};
      sr.onend=()=>{srRef.current=null;if(text.trim())process(null,text.trim());else{setState('idle');setMsg('No speech was captured. Please try again.')}};
      sr.onerror=()=>{};sr.start();setState('recording');setMsg('🎤 Listening… tap Stop when finished.');
    }
    function stop(){try{if(recRef.current&&recRef.current.state!=='inactive')recRef.current.stop()}catch(_){}try{srRef.current?.stop()}catch(_){}}
    return h('div',{className:'nn-voice'},
      h('div',{className:'nn-voice-row'},
        h('strong',{style:{color:'#a3124f'}},'🎙 Voice assistant'),
        state==='recording'?h('button',{type:'button',className:'btn nn-rec',onClick:stop},'■ Stop'):
          h(React.Fragment,null,
            h('button',{type:'button',className:'btn btn-primary',disabled:state!=='idle',onClick:()=>start('ta-IN')},state==='processing'?'Processing…':'🎤 Speak in Tamil'),
            h('button',{type:'button',className:'btn btn-secondary',disabled:state!=='idle',onClick:()=>start('en-IN')},'🎤 Speak in English'))),
      h('div',{className:'nn-voice-msg'},msg||(mode==='DAR'?'Speak the whole note — what you saw, what you did and how the Guest responded. It is arranged into D · A · R for you to check.':'Speak the note. It is written in simple English for you to check.'))
    );
  }

  // ---------------- Add-note form ----------------
  function NursingNoteForm({patient,patients,profile,onClose,onSaved}){
    const [patientId,setPatientId]=React.useState(patient?.id||'');
    const [mode,setModeState]=React.useState(()=>{try{return localStorage.getItem(NN_MODE_KEY)==='Quick'?'Quick':'DAR'}catch(_){return 'DAR'}});
    const [f,setF]=React.useState({focus:'General condition',data:'',action:'',response:'',quick:''});
    const [late,setLate]=React.useState(false);
    const [lateDate,setLateDate]=React.useState(()=>todayISOIndia());
    const [lateTime,setLateTime]=React.useState('');
    const [notify,setNotify]=React.useState(false);
    const [voice,setVoice]=React.useState(null); // {heard_text, lang, structured}
    const [filled,setFilled]=React.useState(null); // which fields the voice filled (others shown yellow)
    const [saving,setSaving]=React.useState(false);
    const [error,setError]=React.useState('');
    const setMode=m=>{setModeState(m);try{localStorage.setItem(NN_MODE_KEY,m)}catch(_){}
      // keep what was written when switching
      setF(cur=>m==='Quick'&&!cur.quick.trim()?{...cur,quick:[cur.data,cur.action,cur.response].filter(x=>x.trim()).join(' ')}:m==='DAR'&&!cur.data.trim()&&cur.quick.trim()?{...cur,data:cur.quick}:cur)};
    const alertFocus=NN_ALERT_FOCUS.includes(f.focus);
    const guest=patient||(patients||[]).find(p=>p.id===patientId);
    function onVoice(res){
      setVoice({heard_text:res.heard_text||'',lang:res.lang,structured:res.structured});
      const english=String(res.english_note||'').trim();
      setF(cur=>{
        const next={...cur};
        if(res.structured){
          if(res.focus)next.focus=res.focus;
          next.data=[cur.data.trim(),String(res.data||english).trim()].filter(Boolean).join(' ');
          next.action=[cur.action.trim(),String(res.action||'').trim()].filter(Boolean).join(' ');
          next.response=[cur.response.trim(),String(res.response||'').trim()].filter(Boolean).join(' ');
        }else next.data=[cur.data.trim(),english].filter(Boolean).join(' ');
        next.quick=[cur.quick.trim(),english].filter(Boolean).join(' ');
        return next;
      });
      setFilled({focus:Boolean(res.structured&&res.focus),data:true,action:Boolean(res.structured&&res.action),response:Boolean(res.structured&&res.response),quick:true});
    }
    const needsCheck=k=>filled&&!filled[k];
    async function save(e){
      e?.preventDefault?.();
      if(saving)return;setError('');
      if(!patientId){setError('Select the Guest.');return}
      if(mode==='DAR'&&f.data.trim().length<3){setError('Please enter D — Data (what you observed).');return}
      if(mode==='Quick'&&f.quick.trim().length<3){setError('Please enter the note.');return}
      let observedAt=null;
      if(late){
        if(!lateDate||!lateTime){setError('Enter the date and time of the late entry.');return}
        const at=nnAt(lateDate,String(lateTime).slice(0,5));
        if(at.getTime()>Date.now()+10*60000){setError('The note time cannot be in the future.');return}
        if(at.getTime()<Date.now()-24*3600000){setError('A late note can be entered only within 24 hours.');return}
        observedAt=at.toISOString();
      }
      setSaving(true);
      const {data,error:err}=await client.rpc('save_nursing_note',{
        p_patient:patientId,p_mode:mode,p_focus:f.focus,
        p_data:mode==='DAR'?f.data:null,p_action:mode==='DAR'?f.action:null,p_response:mode==='DAR'?f.response:null,p_quick:mode==='Quick'?f.quick:null,
        p_observed_at:observedAt,p_notify:alertFocus||notify,
        p_voice_used:Boolean(voice),p_spoken_language:voice?.lang||null,p_heard_text:voice?.heard_text||null
      });
      setSaving(false);
      if(err){setError(nnMissingTable(err)?nnSqlHint:(err.message||'The note could not be saved.'));return}
      writeAuditEvent('Nursing Note Saved','Nursing Notes',data||patientId,{patient_id:patientId,mode,focus:f.focus,alert:alertFocus||notify,voice:Boolean(voice),late},'Success');
      showSamaraActionToast('success','Nursing note saved',(alertFocus||notify)?'Saved. The Nursing Manager and Admin have been alerted.':'Saved to the Guest\'s Nursing Notes.');
      onSaved&&onSaved(data,patientId);
    }
    const ta=(key,label,letter,placeholder)=>h('div',{className:`field nn-dar${needsCheck(key)?' nn-needs-check':''}`},
      h('label',null,letter?h('span',{className:'nn-letter'},letter):null,label),
      h('textarea',{className:'textarea',name:`nursing_note_${key}`,'aria-label':label,placeholder,value:f[key],onChange:e=>setF({...f,[key]:e.target.value})}));
    return h('div',{className:'modal-backdrop',onClick:e=>{if(e.target===e.currentTarget&&!saving)onClose()}},
      h('form',{className:'card modal nn-modal',onSubmit:save,role:'dialog','aria-modal':'true'},
        h('div',{className:'panel-head'},
          h('div',null,h('h3',null,'📝 New Nursing Note'),h('small',null,guest?`${nnPatientLabel(guest)} · ${nnShiftName(nnShiftStart())}`:'Select the Guest')),
          h('button',{type:'button',className:'close',onClick:onClose,'aria-label':'Close'},'×')),
        h('div',{className:'nn-form'},
          !patient?h('div',{className:'field'},h('label',null,'Guest'),h('select',{value:patientId,required:true,onChange:e=>setPatientId(e.target.value)},
            h('option',{value:''},'Select Guest'),
            [...(patients||[])].sort((a,b)=>String(a.room_no||'').localeCompare(String(b.room_no||''),undefined,{numeric:true})).map(p=>h('option',{key:p.id,value:p.id},`${nnPatientLabel(p)}${p.is_trial?' · 🧪 TRIAL':''}`)))):null,
          h('div',{style:{display:'flex',gap:'10px',alignItems:'center',flexWrap:'wrap',justifyContent:'space-between'}},
            h('div',{className:'nn-switch',role:'tablist','aria-label':'Note type'},
              h('button',{type:'button',className:mode==='DAR'?'on':'',onClick:()=>setMode('DAR')},'D · A · R'),
              h('button',{type:'button',className:mode==='Quick'?'on':'',onClick:()=>setMode('Quick')},'Quick note')),
            h('div',{className:`field${needsCheck('focus')?' nn-needs-check':''}`,style:{margin:0,minWidth:'210px',flex:'0 1 260px'}},
              h('label',null,'Focus'),
              h('select',{value:f.focus,onChange:e=>setF({...f,focus:e.target.value})},NN_FOCUS.map(([v,ic])=>h('option',{key:v,value:v},`${ic} ${v}`))))),
          h(NursingNoteVoice,{mode,onResult:onVoice}),
          voice?.heard_text?h('details',{className:'nn-heard'},h('summary',null,'What the voice assistant heard'),h('div',{style:{marginTop:'4px'}},voice.heard_text)):null,
          mode==='DAR'?h(React.Fragment,null,
            ta('data','Data — what you observed / found','D','e.g. BP 150/90 at 2 PM, complained of headache, ate half of lunch'),
            ta('action','Action — what you did','A','e.g. Informed Dr. on phone, gave Paracetamol 500 mg as advised, repositioned'),
            ta('response','Response — how the Guest responded','R','e.g. Headache relieved by 3 PM, resting comfortably')
          ):ta('quick','Note','','e.g. Guest calm and comfortable, took lunch fully, passed urine, no complaints'),
          h('div',{className:'nn-when'},
            h('label',{className:'nn-check'},h('input',{type:'checkbox',checked:late,onChange:e=>setLate(e.target.checked)}),'Late entry (happened earlier)'),
            late?h('div',{className:'field'},h('label',null,'Date'),h(StrictDateInput,{value:lateDate,max:todayISOIndia(),min:nnAddDays(todayISOIndia(),-1),onChange:e=>setLateDate(e.target.value)})):null,
            late?h('div',{className:'field'},h('label',null,'Time'),h(ManualTimeInput,{value:lateTime,onChange:e=>setLateTime(e.target.value),required:true})):null
          ),
          alertFocus?h('div',{className:'nn-alertbox'},`⚠ ${f.focus}: the Nursing Manager and Admin / Director will be alerted at once when you save.`):
            h('label',{className:'nn-check'},h('input',{type:'checkbox',checked:notify,onChange:e=>setNotify(e.target.checked)}),'Inform the Nursing Manager now (alert)'),
          error?h('div',{className:'notice error',role:'alert'},error):null
        ),
        h('div',{className:'modal-bottom-actions'},
          h('button',{type:'button',className:'btn btn-secondary',disabled:saving,onClick:onClose},'Cancel'),
          h('button',{type:'submit',className:'btn btn-primary',disabled:saving},saving?'Saving…':'✓ Save Note'))
      ));
  }

  // ---------------- One note: details + addendum ----------------
  function NursingNoteDetail({note,addenda,patient,profile,onClose,onChanged}){
    const [adding,setAdding]=React.useState(false);
    const [txt,setTxt]=React.useState('');const [reason,setReason]=React.useState('');
    const [busy,setBusy]=React.useState(false);const [err,setErr]=React.useState('');
    const fi=nnFocusInfo(note.focus);
    async function addAddendum(){
      setErr('');
      if(txt.trim().length<3){setErr('Write the addendum.');return}
      if(reason.trim().length<3){setErr('Give the reason (e.g. "Missed in the note", "Wrong time written").');return}
      setBusy(true);
      const {data,error}=await client.rpc('add_nursing_note_addendum',{p_note:note.id,p_text:txt,p_reason:reason});
      setBusy(false);
      if(error){setErr(nnMissingTable(error)?nnSqlHint:error.message);return}
      writeAuditEvent('Nursing Note Addendum','Nursing Notes',data||note.id,{note_id:note.id,patient_id:note.patient_id,reason},'Success');
      showSamaraActionToast('success','Addendum added','The original note is kept unchanged.');
      setAdding(false);setTxt('');setReason('');onChanged&&onChanged();
    }
    const fields=[
      ['Guest',nnPatientLabel(patient)],['Focus',`${fi[1]} ${note.focus}`],['Type',note.note_mode==='Quick'?'Quick note':'D · A · R'],
      ['Observed at',nnDateTime(note.observed_at)],['Shift',note.shift],
      ['Entered at',nnDateTime(note.created_at)+(nnLate(note)?' (late entry)':'')],
      ['Written by',[note.recorded_by_name,note.recorded_by_role].filter(Boolean).join(' · ')],
      ['Alert',note.is_alert?'Yes — Nursing Manager and Admin alerted':''],
      ['Voice',note.voice_used?`Yes${note.spoken_language?` (${String(note.spoken_language).startsWith('en')?'English':'Tamil'})`:''}`:'']
    ];
    return h(RowDetailModal,{title:'Nursing Note',subtitle:`${nnDateTime(note.observed_at)} · ${note.focus}`,fields,onClose},
      h('div',{style:{display:'grid',gap:'6px',margin:'10px 0'}},
        note.note_mode==='Quick'?h('div',{className:'nn-dar-line','data-no-translate':'true'},note.quick_text):h(React.Fragment,null,
          note.data_text?h('div',{className:'nn-dar-line','data-no-translate':'true'},h('em',null,'D'),note.data_text):null,
          note.action_text?h('div',{className:'nn-dar-line','data-no-translate':'true'},h('em',null,'A'),note.action_text):null,
          note.response_text?h('div',{className:'nn-dar-line','data-no-translate':'true'},h('em',null,'R'),note.response_text):null),
        h(TamilAssist,{text:nnNoteText(note),context:'Nursing Note'}),
        note.heard_text?h('details',{className:'nn-heard'},h('summary',null,'Original speech'),h('div',null,note.heard_text)):null),
      h('div',{style:{display:'grid',gap:'6px'}},
        h('strong',{style:{color:'#a3124f'}},`Addenda (${addenda.length})`),
        addenda.length?addenda.map(a=>h('div',{key:a.id,className:'nn-addendum'},h('div',null,a.addendum_text),h('small',null,`${nnDateTime(a.created_at)} · ${a.added_by_name||'—'} · Reason: ${a.reason}`))):h('small',{style:{color:'#8a6577'}},'No addenda.'),
        nnCanUse(profile)?(adding?h('div',{className:'nn-form',style:{marginTop:'6px'}},
          h('div',{className:'field'},h('label',null,'Addendum (correction or more information)'),h('textarea',{className:'textarea',name:'nursing_note_addendum',value:txt,onChange:e=>setTxt(e.target.value)})),
          h('div',{className:'field'},h('label',null,'Reason'),h('input',{type:'text',name:'addendum_reason',value:reason,placeholder:'e.g. Missed in the note / wrong time written',onChange:e=>setReason(e.target.value)})),
          err?h('div',{className:'notice error'},err):null,
          h('div',{style:{display:'flex',gap:'8px'}},h('button',{type:'button',className:'btn btn-primary',disabled:busy,onClick:addAddendum},busy?'Saving…':'Save Addendum'),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setAdding(false);setErr('')}},'Cancel'))
        ):h('button',{type:'button',className:'btn btn-secondary',style:{justifySelf:'start'},onClick:()=>setAdding(true)},'＋ Add Addendum')):null,
        h('small',{style:{color:'#8a6577'}},'Nursing notes are never edited or deleted. A correction is added as an addendum; the original stays as written.'))
    );
  }

  // ---------------- Timeline (one Guest, or all Guests) ----------------
  function NursingNotesTimeline({notes,addenda,patientFor,showGuest,onOpen,focusId}){
    React.useEffect(()=>{if(!focusId)return;const t=setTimeout(()=>{const el=document.getElementById(`nn-note-${focusId}`);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.add('record-focus-flash');setTimeout(()=>el.classList.remove('record-focus-flash'),2600)}},150);return()=>clearTimeout(t)},[focusId,notes.length]);
    if(!notes.length)return h('div',{className:'nn-empty'},'No nursing notes for this selection.');
    const groups=[];
    notes.forEach(n=>{const start=n.shift_start||nnShiftStart(new Date(n.observed_at)).toISOString();const key=String(start);let g=groups.find(x=>x.key===key);if(!g){g={key,start,list:[]};groups.push(g)}g.list.push(n)});
    groups.sort((a,b)=>new Date(b.start)-new Date(a.start));
    return h('div',{className:'nn-timeline'},groups.map(g=>h('div',{key:g.key,className:'nn-day'},
      h('h4',null,`${formatDateWithDayIN(nnISO(g.start))} · ${nnIsDay(g.start)?'☀ Day shift':'🌙 Night shift'}`,h('small',null,`${g.list.length} note${g.list.length===1?'':'s'}`)),
      g.list.map(n=>{const fi=nnFocusInfo(n.focus),ad=addenda.filter(a=>a.note_id===n.id),p=patientFor?patientFor(n.patient_id):null;
        return h('div',{key:n.id,id:`nn-note-${n.id}`,className:`nn-note${n.is_alert?' alert':''}`,style:{'--nn-c':fi[2]},role:'button',tabIndex:0,onClick:()=>onOpen(n),onKeyDown:e=>{if(e.key==='Enter')onOpen(n)}},
          h('div',{className:'nn-note-head'},
            h('b',null,nnTime(n.observed_at)),
            h('span',{className:'nn-chip'},`${fi[1]} ${n.focus}`),
            showGuest&&p?h('b',null,nnPatientLabel(p)):null,
            n.note_mode==='Quick'?h('span',{className:'nn-tag'},'Quick'):h('span',{className:'nn-tag'},'DAR'),
            n.is_alert?h('span',{className:'nn-tag red'},'🔔 Alerted'):null,
            n.voice_used?h('span',{className:'nn-tag'},'🎤 Voice'):null,
            nnLate(n)?h('span',{className:'nn-tag amber'},`Late entry · ${nnTime(n.created_at)}`):null,
            ad.length?h('span',{className:'nn-tag amber'},`${ad.length} addend${ad.length===1?'um':'a'}`):null,
            h('span',{style:{marginLeft:'auto'}},n.recorded_by_name||'')),
          n.note_mode==='Quick'?h('div',{className:'nn-dar-line','data-no-translate':'true'},n.quick_text):h(React.Fragment,null,
            n.data_text?h('div',{className:'nn-dar-line','data-no-translate':'true'},h('em',null,'D'),n.data_text):null,
            n.action_text?h('div',{className:'nn-dar-line','data-no-translate':'true'},h('em',null,'A'),n.action_text):null,
            n.response_text?h('div',{className:'nn-dar-line','data-no-translate':'true'},h('em',null,'R'),n.response_text):null),
          ad.map(a=>h('div',{key:a.id,className:'nn-addendum'},h('b',null,'Addendum: '),a.addendum_text,h('small',null,` — ${a.added_by_name||''}, ${nnDateTime(a.created_at)} (${a.reason})`)))
        )})
    )));
  }

  // period → [from,to] (YYYY-MM-DD)
  function nnPeriodRange(period,from,to){
    const today=todayISOIndia();
    if(period==='today')return [today,today];
    if(period==='3days')return [nnAddDays(today,-2),today];
    if(period==='week'){const d=new Date(`${today}T12:00:00Z`);const back=(d.getUTCDay()+6)%7;return [nnAddDays(today,-back),today]}
    if(period==='month')return [`${today.slice(0,7)}-01`,today];
    return [from||today,to||today];
  }
  function NursingNotesFilters({draft,setDraft,dirty,onApply,showGuest,patients}){
    return h('div',{className:'nn-filters'},
      showGuest?h('div',{className:'field'},h('label',null,'Guest'),h('select',{value:draft.patient,onChange:e=>setDraft({...draft,patient:e.target.value})},
        h('option',{value:''},'All Guests'),(patients||[]).map(p=>h('option',{key:p.id,value:p.id},nnPatientLabel(p))))):null,
      h('div',{className:'field'},h('label',null,'Period'),h('select',{value:draft.period,onChange:e=>setDraft({...draft,period:e.target.value})},
        [['today','Today'],['3days','Last 3 days'],['week','This Week'],['month','This Month'],['range','Selected period']].map(([v,l])=>h('option',{key:v,value:v},l)))),
      draft.period==='range'?h('div',{className:'field'},h('label',null,'From'),h(StrictDateInput,{value:draft.from,min:'2026-08-27',max:todayISOIndia(),onChange:e=>setDraft({...draft,from:e.target.value})})):null,
      draft.period==='range'?h('div',{className:'field'},h('label',null,'To'),h(StrictDateInput,{value:draft.to,min:'2026-08-27',max:todayISOIndia(),onChange:e=>setDraft({...draft,to:e.target.value})})):null,
      h('div',{className:'field'},h('label',null,'Focus'),h('select',{value:draft.focus,onChange:e=>setDraft({...draft,focus:e.target.value})},
        h('option',{value:''},'All'),h('option',{value:'__alerts'},'🔔 Alerts only'),NN_FOCUS.map(([v,ic])=>h('option',{key:v,value:v},`${ic} ${v}`)))),
      h(ApplyFilterButton,{dirty,onApply})
    );
  }

  async function nnPrint({title,notes,addenda,patientFor,from,to,who}){
    const win=samaraPrintBar(window.open('','_blank'));
    if(!win){alert('Please allow pop-ups to print / save the Nursing Notes.');return}
    const logo=new URL('assets/samara-logo.png',window.location.href).href;
    const rows=[...notes].sort((a,b)=>new Date(a.observed_at)-new Date(b.observed_at)).map(n=>{
      const p=patientFor(n.patient_id),ad=addenda.filter(a=>a.note_id===n.id);
      const body=n.note_mode==='Quick'?nnEsc(n.quick_text):[n.data_text?`<b>D:</b> ${nnEsc(n.data_text)}`:'',n.action_text?`<b>A:</b> ${nnEsc(n.action_text)}`:'',n.response_text?`<b>R:</b> ${nnEsc(n.response_text)}`:''].filter(Boolean).join('<br>');
      const adds=ad.map(a=>`<div class="ad"><b>Addendum</b> (${nnEsc(nnDateTime(a.created_at))}, ${nnEsc(a.added_by_name||'')}; reason: ${nnEsc(a.reason)}): ${nnEsc(a.addendum_text)}</div>`).join('');
      return `<tr${n.is_alert?' class="al"':''}><td>${nnEsc(formatDateIN(nnISO(n.observed_at)))}<br><b>${nnEsc(nnTime(n.observed_at))}</b>${nnLate(n)?`<br><small>entered ${nnEsc(nnTime(n.created_at))}</small>`:''}</td><td>${nnIsDay(n.shift_start||nnShiftStart(new Date(n.observed_at)))?'Day':'Night'}</td>${title.allGuests?`<td>${nnEsc(nnPatientLabel(p))}</td>`:''}<td><b>${nnEsc(n.focus)}</b>${n.is_alert?'<br><span class="flag">Alerted</span>':''}</td><td>${body}${adds}</td><td>${nnEsc(n.recorded_by_name||'')}<br><small>${nnEsc(n.recorded_by_role||'')}</small></td></tr>`;}).join('')||`<tr><td colspan="${title.allGuests?6:5}" style="text-align:center">No nursing notes in this period</td></tr>`;
    const html=`<!doctype html><html><head><meta charset="utf-8"><title>Samara_Nursing_Notes_${nnEsc(title.file)}_${nnEsc(from)}_to_${nnEsc(to)}</title><style>
      @page{size:A4;margin:10mm 8mm 12mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#3b2833;margin:0;font-size:10px;line-height:1.4}
      .top{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;border-bottom:3px solid #b20b5d;padding:0 2px 8px;margin-bottom:8px}.logo{width:110px;max-height:54px;object-fit:contain}.mid{text-align:center;color:#a3124f;font-weight:700;font-size:12px}
      .org{text-align:right}.org strong{display:block;color:#b20b5d;font-size:14px}.org span{display:block;color:#6d5963;font-size:9px}
      h1{font-size:16px;margin:2px 0;text-align:center;color:#321d28}.meta{text-align:center;color:#7b6670;margin:0 0 8px}
      table{width:100%;border-collapse:collapse}thead{display:table-header-group}tr{page-break-inside:avoid}th{background:#f7dce8;color:#8a1d4f;border:1px solid #dfb4c6;padding:5px 4px;text-align:left;font-size:9px}
      td{border:1px solid #ead4dd;padding:4px 5px;vertical-align:top;overflow-wrap:anywhere}tr.al td{background:#fff3f3}.flag{color:#b42318;font-weight:700}.ad{margin-top:4px;padding:3px 6px;border-left:3px solid #e7a3c3;background:#fff8fb}
      .sign{display:flex;justify-content:space-between;margin-top:26px}.sign div{border-top:1px solid #6f5c65;padding-top:5px;width:28%;text-align:center}
      .footer{border-top:1px solid #eccbd9;margin-top:12px;padding-top:5px;text-align:center;color:#6f5a64;font-size:8px}
      @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    </style></head><body>
      <div class="top"><img class="logo" src="${logo}" alt="Samara Assisted Living"><div class="mid">Nursing Notes</div><div class="org"><strong>SAMARA HEALTH CARE LLP</strong><span>Compassion • Comfort • Dignity</span></div></div>
      <h1>${nnEsc(title.heading)}</h1>
      <p class="meta">${from===to?`Date ${nnEsc(formatDateIN(from))}`:`Period ${nnEsc(formatDateIN(from))} to ${nnEsc(formatDateIN(to))}`} · ${notes.length} note${notes.length===1?'':'s'} · D = Data, A = Action, R = Response · notes are never edited; corrections are shown as addenda</p>
      <table><thead><tr><th style="width:11%">Date / time</th><th style="width:6%">Shift</th>${title.allGuests?'<th style="width:15%">Guest</th>':''}<th style="width:11%">Focus</th><th>Note</th><th style="width:13%">Written by</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="sign"><div>Nurse</div><div>Nursing Manager</div><div>Treating Doctor</div></div>
      <div class="footer">Generated from Samara Care ERP on ${nnEsc(nnDateTime(new Date()))} by ${nnEsc(who||'')} · Confidential nursing record · Computer-generated</div>
      <script>window.addEventListener('load',()=>{const imgs=[...document.images];Promise.all(imgs.map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=i.onerror=r}))).then(()=>setTimeout(()=>window.print(),250));});<\/script>
    </body></html>`;
    win.document.open();win.document.write(html);win.document.close();
  }

  // ---------------- Single-click view for one Guest (Patient card / board) ----------------
  function NursingNotesViewer({patient,profile,onClose,focusNoteId,startAdd=false}){
    const [draft,setDraft]=React.useState({period:'week',from:todayISOIndia(),to:todayISOIndia(),focus:''});
    const {applied,apply,dirty}=useAppliedFilters(draft);
    const [data,setData]=React.useState({notes:[],addenda:[],loading:true,error:''});
    const [open,setOpen]=React.useState(null);
    const [adding,setAdding]=React.useState(startAdd&&nnCanUse(profile));
    const [focusId,setFocusId]=React.useState(focusNoteId||'');
    const range=nnPeriodRange(applied.period,applied.from,applied.to);
    const load=React.useCallback(async()=>{
      setData(d=>({...d,loading:true}));
      // a note opened from an alert is shown even if it is outside the chosen period
      const [from,to]=range;
      const r=await nnLoadNotes({patientId:patient.id,from,to});
      if(r.error){setData({notes:[],addenda:[],loading:false,error:nnMissingTable(r.error)?nnSqlHint:r.error.message});return}
      let notes=r.notes,addenda=r.addenda;
      if(focusNoteId&&!notes.some(n=>n.id===focusNoteId)){
        const one=await client.from('nursing_notes').select('*').eq('id',focusNoteId).maybeSingle();
        if(one.data){notes=[one.data,...notes];const ad=await client.from('nursing_note_addenda').select('*').eq('note_id',focusNoteId);addenda=addenda.concat(ad.data||[])}
      }
      setData({notes,addenda,loading:false,error:''});
    },[patient?.id,range[0],range[1]]);
    React.useEffect(()=>{load()},[load]);
    React.useEffect(()=>{if(!focusNoteId||!data.notes.length)return;const n=data.notes.find(x=>x.id===focusNoteId);if(n)setOpen(n)},[focusNoteId,data.notes.length]);
    const shown=data.notes.filter(n=>!applied.focus||(applied.focus==='__alerts'?n.is_alert:n.focus===applied.focus));
    const shiftStart=nnShiftStart();
    const thisShift=data.notes.filter(n=>new Date(n.shift_start||nnShiftStart(new Date(n.observed_at))).getTime()===shiftStart.getTime()).length;
    const need=nnNeeded(patient,shiftStart);
    const who=formalName(profile)||profile?.full_name||'';
    return h('div',{className:'modal-backdrop',onClick:e=>{if(e.target===e.currentTarget)onClose()}},
      h('div',{className:'card modal nn-modal',role:'dialog','aria-modal':'true'},
        h('div',{className:'panel-head'},
          h('div',null,h('h3',null,'📝 Nursing Notes'),h('small',null,nnPatientLabel(patient))),
          h('button',{type:'button',className:'close',onClick:onClose,'aria-label':'Close'},'×')),
        h('div',{className:'nn-page'},
          h('div',{className:'nn-stats'},
            h('div',{className:`nn-stat ${thisShift>=need?'ok':'warn'}`},h('span',null,`This shift (${nnIsDay(shiftStart)?'Day':'Night'})`),h('strong',null,`${thisShift} / ${need}`)),
            h('div',{className:'nn-stat'},h('span',null,'Shown'),h('strong',null,shown.length)),
            h('div',{className:'nn-stat'},h('span',null,'Alerts'),h('strong',null,shown.filter(n=>n.is_alert).length)),
            h('div',{style:{display:'flex',gap:'8px',marginLeft:'auto',alignItems:'center',flexWrap:'wrap'}},
              nnCanUse(profile)&&patient?.is_active!==false?h('button',{type:'button',className:'btn btn-primary',onClick:()=>setAdding(true)},'＋ Add Note'):null,
              h('button',{type:'button',className:'btn btn-secondary',onClick:()=>nnPrint({title:{heading:`Nursing Notes — ${nnPatientLabel(patient)}`,file:patient.patient_id||'Guest'},notes:shown,addenda:data.addenda,patientFor:()=>patient,from:range[0],to:range[1],who})},'🖨 Print / PDF'))),
          h(NursingNotesFilters,{draft,setDraft,dirty,onApply:()=>{setFocusId('');apply()}}),
          data.error?h('div',{className:'notice error'},data.error):data.loading?h('div',{className:'nn-empty'},'Loading nursing notes…'):
            h(NursingNotesTimeline,{notes:shown,addenda:data.addenda,onOpen:setOpen,focusId})
        ),
        h('div',{className:'modal-bottom-actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:onClose},'Close')),
        adding&&h(NursingNoteForm,{patient,profile,onClose:()=>setAdding(false),onSaved:id=>{setAdding(false);setFocusId(id||'');load()}}),
        open&&h(NursingNoteDetail,{note:open,addenda:data.addenda.filter(a=>a.note_id===open.id),patient,profile,onClose:()=>setOpen(null),onChanged:()=>{load()}})
      ));
  }

  // ---------------- NURSING → Nursing Notes (board for the current shift + register) ----------------
  function NursingNotesPage({profile,onNavigate}){
    const [patients]=usePatients();
    const [tab,setTab]=React.useState('board');
    const [search,setSearch]=React.useState('');
    const [shiftNotes,setShiftNotes]=React.useState({rows:[],error:'',loading:true});
    const [viewer,setViewer]=React.useState(null); // {patient, focusNoteId, startAdd}
    const [addFor,setAddFor]=React.useState(null); // patient or 'pick'
    const [tick,setTick]=React.useState(0);
    const [focus,clearFocus]=useRecordFocus('Nursing Notes');
    const shiftStart=nnShiftStart();
    const shiftKey=shiftStart.toISOString();
    const loadShift=React.useCallback(async()=>{
      const r=await client.from('nursing_notes').select('id,patient_id,focus,note_mode,data_text,quick_text,observed_at,recorded_by_name,is_alert,shift_start').eq('shift_start',shiftKey).order('observed_at',{ascending:false});
      if(r.error){setShiftNotes({rows:[],loading:false,error:nnMissingTable(r.error)?nnSqlHint:r.error.message});return}
      setShiftNotes({rows:r.data||[],loading:false,error:''});
    },[shiftKey]);
    React.useEffect(()=>{loadShift()},[loadShift,tick]);
    React.useEffect(()=>{const t=setInterval(()=>setTick(x=>x+1),60000);return()=>clearInterval(t)},[]);
    // opened from a clinical alert / escalation (Clinical Alerts → Open) or a bell notification
    React.useEffect(()=>{
      if(!patients.length)return;
      const ctx=readTaskNavigationContext('Nursing Notes');
      const target=ctx||(focus?{patient_id:focus.patient_id,source_id:focus.id,alert_type:focus.id?'Nursing Note Alert':''}:null);
      if(!target)return;
      if(ctx)clearTaskNavigationContext();if(focus)clearFocus();
      const p=patients.find(x=>x.id===target.patient_id);
      if(!p){if(target.patient_id)client.from('patients').select('*').eq('id',target.patient_id).maybeSingle().then(({data})=>{if(data)setViewer({patient:data,focusNoteId:target.source_id})});return}
      if(String(target.alert_type||'').toLowerCase()==='nursing note alert')setViewer({patient:p,focusNoteId:target.source_id});
      else if(['Nurse','Caregiver'].includes(profile?.role))setAddFor(p); // nurse: write the missing note straight away
      else setViewer({patient:p});           // Manager / Admin: see the notes first
    },[patients.length,focus?.at]);
    const q=search.trim().toLowerCase();
    const list=[...patients].filter(p=>q.length<3||[p.full_name,p.patient_id,p.room_no].some(v=>String(v||'').toLowerCase().includes(q)))
      .map(p=>{const mine=shiftNotes.rows.filter(n=>n.patient_id===p.id);return {p,mine,need:nnNeeded(p,shiftStart)}})
      .sort((a,b)=>Number(a.mine.length>=a.need)-Number(b.mine.length>=b.need)||String(a.p.room_no||'').localeCompare(String(b.p.room_no||''),undefined,{numeric:true}));
    const pending=list.filter(x=>x.mine.length<x.need).length;
    const remindAt=new Date(shiftStart.getTime()+10*3600000),escAt=new Date(shiftStart.getTime()+11*3600000);
    const late=Date.now()>=remindAt.getTime();
    // register (all Guests)
    const [draft,setDraft]=React.useState({patient:'',period:'today',from:todayISOIndia(),to:todayISOIndia(),focus:''});
    const {applied,apply,dirty}=useAppliedFilters(draft);
    const [reg,setReg]=React.useState({notes:[],addenda:[],loading:false,error:''});
    const [openNote,setOpenNote]=React.useState(null);
    const range=nnPeriodRange(applied.period,applied.from,applied.to);
    const loadReg=React.useCallback(async()=>{
      setReg(r=>({...r,loading:true}));
      const r=await nnLoadNotes({patientId:applied.patient||null,from:range[0],to:range[1],limit:1000});
      setReg({notes:r.notes,addenda:r.addenda,loading:false,error:r.error?(nnMissingTable(r.error)?nnSqlHint:r.error.message):''});
    },[applied.patient,range[0],range[1]]);
    React.useEffect(()=>{if(tab==='register')loadReg()},[tab,loadReg,tick]);
    const lookupIds=reg.notes.map(n=>n.patient_id);
    const {pFor}=usePatientLookup(patients,lookupIds);
    const regShown=reg.notes.filter(n=>!applied.focus||(applied.focus==='__alerts'?n.is_alert:n.focus===applied.focus));
    const who=formalName(profile)||profile?.full_name||'';
    return h('div',{className:'nn-page'},
      h('div',{className:'nn-hero'},
        h('div',null,h('h2',null,'📝 Nursing Notes'),h('small',null,'At least 2 notes per Guest every shift · D·A·R or Quick note · 🎤 Tamil / English voice · Fall / Incident alerts the Nursing Manager at once')),
        h('span',{className:'nn-shift'},`${nnIsDay(shiftStart)?'☀':'🌙'} ${nnShiftName(shiftStart)}`)),
      h('div',{className:'nn-tabs'},
        h('button',{type:'button',className:tab==='board'?'on':'',onClick:()=>setTab('board')},'This shift'),
        h('button',{type:'button',className:tab==='register'?'on':'',onClick:()=>setTab('register')},'All notes (register)'),
        nnCanUse(profile)?h('button',{type:'button',onClick:()=>setAddFor('pick'),style:{marginLeft:'auto'}},'＋ New Note'):null),
      tab==='board'?h(React.Fragment,null,
        h('div',{className:'nn-stats'},
          h('div',{className:'nn-stat'},h('span',null,'Guests'),h('strong',null,list.length)),
          h('div',{className:'nn-stat ok'},h('span',null,'Notes complete'),h('strong',null,list.length-pending)),
          h('div',{className:`nn-stat ${pending?'warn':'ok'}`},h('span',null,'Notes pending'),h('strong',null,pending)),
          h('div',{className:'nn-stat'},h('span',null,'Reminder / escalation'),h('strong',{style:{fontSize:'14px'}},`${nnTime(remindAt)} / ${nnTime(escAt)}`)),
          h('div',{className:'field',style:{margin:'0 0 0 auto',minWidth:'220px'}},h('label',null,'Search Guest (3+ letters)'),h('input',{type:'search',value:search,placeholder:'Name / Guest ID / room',onChange:e=>setSearch(e.target.value)}))),
        shiftNotes.error?h('div',{className:'notice error'},shiftNotes.error):null,
        !list.length?h('div',{className:'nn-empty'},patients.length?'No Guest matches the search.':'No admitted Guests.'):
        h('div',{className:'nn-grid'},list.map(({p,mine,need})=>{const last=mine[0],cls=mine.length>=need?'ok':mine.length?'part':'none';
          return h('div',{key:p.id,className:`nn-card ${mine.length>=need?'done':late?'pending':''}`},
            h('div',{className:'nn-card-head',onClick:()=>setViewer({patient:p}),title:'Open this Guest\'s Nursing Notes'},
              h('div',null,h('strong',null,formalName(p)||p.full_name),h('small',null,`Room ${p.room_no||'—'}${p.bed_no?'-'+p.bed_no:''} · ${p.patient_id||''}${p.is_trial?' · 🧪 TRIAL':''}`)),
              h('span',{className:`nn-count ${cls}`},mine.length>=need?`✓ ${mine.length} / ${need}`:`${mine.length} / ${need}`)),
            h('div',{className:'nn-last','data-no-translate':'true',onClick:()=>setViewer({patient:p})},last?`${nnTime(last.observed_at)} · ${nnFocusInfo(last.focus)[1]} ${last.focus} — ${String(nnNoteText(last)).slice(0,90)}${String(nnNoteText(last)).length>90?'…':''}`:'No note yet in this shift.'),
            h('div',{className:'nn-card-actions'},
              nnCanUse(profile)?h('button',{type:'button',className:'btn btn-primary',onClick:()=>setAddFor(p)},'＋ Add Note'):null,
              h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setViewer({patient:p})},'📖 View Notes')));
        }))
      ):h(React.Fragment,null,
        h(NursingNotesFilters,{draft,setDraft,dirty,onApply:apply,showGuest:true,patients}),
        h('div',{className:'nn-stats'},
          h('div',{className:'nn-stat'},h('span',null,'Notes'),h('strong',null,regShown.length)),
          h('div',{className:'nn-stat'},h('span',null,'Alerts'),h('strong',null,regShown.filter(n=>n.is_alert).length)),
          h('div',{className:'nn-stat'},h('span',null,'Voice'),h('strong',null,regShown.filter(n=>n.voice_used).length)),
          h('button',{type:'button',className:'btn btn-secondary',style:{marginLeft:'auto',alignSelf:'center'},onClick:()=>{const one=applied.patient?pFor(applied.patient):null;nnPrint({title:{heading:one?`Nursing Notes — ${nnPatientLabel(one)}`:'Nursing Notes — all Guests',file:one?.patient_id||'All_Guests',allGuests:!one},notes:regShown,addenda:reg.addenda,patientFor:pFor,from:range[0],to:range[1],who})}},'🖨 Print / PDF')),
        reg.error?h('div',{className:'notice error'},reg.error):reg.loading?h('div',{className:'nn-empty'},'Loading…'):
          h(NursingNotesTimeline,{notes:regShown,addenda:reg.addenda,patientFor:pFor,showGuest:!applied.patient,onOpen:setOpenNote})
      ),
      viewer&&h(NursingNotesViewer,{key:viewer.patient.id,patient:viewer.patient,profile,focusNoteId:viewer.focusNoteId,startAdd:viewer.startAdd,onClose:()=>{setViewer(null);setTick(x=>x+1)}}),
      addFor&&h(NursingNoteForm,{patient:addFor==='pick'?null:addFor,patients,profile,onClose:()=>setAddFor(null),onSaved:()=>{setAddFor(null);setTick(x=>x+1)}}),
      openNote&&h(NursingNoteDetail,{note:openNote,addenda:reg.addenda.filter(a=>a.note_id===openNote.id),patient:pFor(openNote.patient_id),profile,onClose:()=>setOpenNote(null),onChanged:loadReg})
    );
  }
