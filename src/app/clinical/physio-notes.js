  // 2.19.57: Physio Notes & Observations (SQL 338) — typed, Tamil / English voice (AI → simple English)
  // or browser dictation. Also: the Physiotherapist login reads Guests only through physio_guest_list().
  const PHYSIO_NOTE_TYPES=['Observation','Progress','Treatment given','Advice / Precaution','Other'];

  // Guest name / ID / room for the physiotherapy screens. A Physiotherapist login cannot read the Guest
  // table directly (SQL 338), so it uses the narrow list; every other role reads the table as before.
  async function loadPhysioGuests(profile,{activeOnly=false}={}){
    if(profile?.role==='Physiotherapist'){
      const r=await client.rpc('physio_guest_list');
      // Until SQL 338 is run the narrow list does not exist yet — read the Guest table as before.
      if(r.error&&/physio_guest_list|function|schema cache/i.test(String(r.error.message||'')))return loadPhysioGuests({...profile,role:'__fallback'},{activeOnly});
      if(r.error)return r;
      const rows=(r.data||[]).map(x=>typeof x==='string'?JSON.parse(x):x).filter(x=>!activeOnly||x.is_active!==false);
      return {data:rows,error:null};
    }
    let q=client.from('patients').select('id,title,full_name,patient_id,room_no,bed_no,is_active,admission_status');
    if(activeOnly)q=q.eq('is_active',true);
    return q.order('full_name');
  }

  function physioNoteMime(){for(const x of ['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus']){try{if(window.MediaRecorder&&MediaRecorder.isTypeSupported?.(x))return x}catch(_){}}return ''}

  // Speak in Tamil or English → the voice service returns the note in simple English (nothing added).
  function PhysioNoteVoice({onResult,disabled}){
    const [state,setState]=React.useState('idle'); // idle | recording | processing
    const [msg,setMsg]=React.useState('');
    const recRef=React.useRef(null),streamRef=React.useRef(null),chunksRef=React.useRef([]),langRef=React.useRef('ta-IN');
    React.useEffect(()=>()=>{try{if(recRef.current&&recRef.current.state!=='inactive')recRef.current.stop()}catch(_){}try{streamRef.current?.getTracks().forEach(t=>t.stop())}catch(_){}},[]);
    async function send(blob){
      setState('processing');setMsg(langRef.current==='ta-IN'?'Converting your Tamil to simple English…':'Writing your note…');
      try{
        const {data:{session}}=await client.auth.getSession();if(!session)throw new Error('Please sign in again.');
        const ext=(blob.type||'').includes('mp4')?'m4a':(blob.type||'').includes('ogg')?'ogg':'webm';
        const fd=new FormData();fd.append('audio',blob,`physio-note.${ext}`);fd.append('spoken_language',langRef.current);fd.append('mode','Physio');
        const r=await fetch(`${cfg.supabaseUrl}/functions/v1/nursing-note-voice`,{method:'POST',headers:{'Authorization':`Bearer ${session.access_token}`,'apikey':cfg.supabasePublishableKey},body:fd});
        const j=await r.json().catch(()=>({error:`Voice service did not answer (${r.status}).`}));
        if(!r.ok||j.error)throw new Error(r.status===403?'Voice to English is not switched on for this login yet. Please use 🎙 Dictate or type the note.':(j.error||`Voice service error ${r.status}`));
        onResult({text:String(j.english_note||'').trim(),heard:String(j.heard_text||'').trim(),lang:langRef.current});
        setMsg('✓ Added from your voice. Read it, correct any word, then Save.');
      }catch(e){setMsg(e.message||'Voice could not be processed. Please use 🎙 Dictate or type the note.')}
      finally{setState('idle')}
    }
    async function start(lang){
      if(state!=='idle'||disabled)return;
      langRef.current=lang;setMsg('');
      if(!(navigator.mediaDevices?.getUserMedia&&window.MediaRecorder)){setMsg('This device cannot record. Please use 🎙 Dictate or type the note.');return}
      try{
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});streamRef.current=stream;chunksRef.current=[];
        const mime=physioNoteMime();const rec=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);recRef.current=rec;
        rec.ondataavailable=e=>{if(e.data&&e.data.size)chunksRef.current.push(e.data)};
        rec.onstop=()=>{try{stream.getTracks().forEach(t=>t.stop())}catch(_){}const blob=new Blob(chunksRef.current,{type:rec.mimeType||mime||'audio/webm'});if(blob.size<800){setState('idle');setMsg('No speech was captured. Please try again.');return}send(blob)};
        rec.start();setState('recording');setMsg(lang==='ta-IN'?'🔴 Listening (Tamil)… speak, then press Stop.':'🔴 Listening (English)… speak, then press Stop.');
      }catch(e){setState('idle');setMsg('Microphone permission is needed. Allow the microphone, or use 🎙 Dictate.')}
    }
    function stop(){try{recRef.current?.stop()}catch(_){}}
    return h('div',{className:'physio-note-voice'},
      state==='recording'
        ?h('button',{type:'button',className:'btn btn-primary',onClick:stop},'⏹ Stop')
        :h(React.Fragment,null,
          h('button',{type:'button',className:'btn btn-secondary',disabled:disabled||state!=='idle',onClick:()=>start('ta-IN')},'🎤 Speak Tamil'),
          h('button',{type:'button',className:'btn btn-secondary',disabled:disabled||state!=='idle',onClick:()=>start('en-IN')},'🎤 Speak English')),
      state==='processing'&&h('span',{className:'small-note'},'⏳'),
      msg&&h('small',{className:'small-note',role:'status',style:{display:'block',width:'100%'}},msg));
  }

  function PhysioNoteModal({profile,guests,patientId:initialPatient='',planId=null,onClose,onSaved}){
    const [patientId,setPatientId]=React.useState(initialPatient||'');
    const [noteType,setNoteType]=React.useState('Observation');
    const [text,setText]=React.useState('');
    const [voice,setVoice]=React.useState(null); // {heard,lang}
    const [saving,setSaving]=React.useState(false);
    const [error,setError]=React.useState('');
    const areaRef=React.useRef(null),anchorRef=React.useRef(null);
    // 🎙 Dictate (browser speech-to-text, Tamil or English, words appear as spoken)
    React.useEffect(()=>{if(anchorRef.current&&areaRef.current)window.SamaraDictation?.attach(anchorRef.current,areaRef.current);return()=>window.SamaraDictation?.stop?.()},[]);
    const guestName=g=>[g.title,g.full_name].filter(Boolean).join(' ')+(g.patient_id?' · '+g.patient_id:'')+(g.room_no?' · Room '+g.room_no+(g.bed_no?'-'+g.bed_no:''):'');
    const choices=[...(guests||[])].filter(g=>g.is_active!==false||g.id===patientId).sort((a,b)=>String(a.full_name||'').localeCompare(String(b.full_name||'')));
    async function save(e){
      e.preventDefault();setError('');
      if(!patientId){setError('Choose the Guest.');return}
      if(text.trim().length<3){setError('Write, speak or dictate the note first.');return}
      setSaving(true);
      try{
        const row={patient_id:patientId,plan_id:planId||null,note_type:noteType,note_text:text.trim(),voice_used:Boolean(voice),spoken_language:voice?.lang||null,heard_text:voice?.heard||null};
        const {data,error:err}=await client.from('physiotherapy_notes').insert(row).select('id').single();
        if(err)throw err;
        if(typeof writeAuditEvent==='function')writeAuditEvent('Physio Note Saved','Physiotherapy',data?.id||patientId,{patient_id:patientId,note_type:noteType,voice:Boolean(voice)},'Success');
        if(typeof showSamaraActionToast==='function')showSamaraActionToast('success','Saved successfully','Physio note saved.');
        onSaved&&onSaved();onClose();
      }catch(err){
        const m=String(err?.message||err);
        setError(/physiotherapy_notes/.test(m)&&/does not exist|schema cache/.test(m)?'Physio Notes is not set up yet — Admin must run SQL 338 in Supabase.':m);
      }finally{setSaving(false)}
    }
    return h('div',{className:'modal-backdrop',onClick:e=>{if(e.target===e.currentTarget&&!saving)onClose()}},
      h('form',{className:'card modal',onSubmit:save},
        h('div',{className:'panel-head'},h('div',null,h('h3',null,'📝 Physio Note / Observation'),h('small',null,'Type, speak (Tamil / English) or dictate. Notes are internal — not shown to families.')),
          h('button',{type:'button',className:'close',disabled:saving,onClick:onClose},'×')),
        h('div',{className:'modal-grid'},
          h('div',{className:'field'},h('label',null,'Guest'),h('select',{'aria-label':'Guest',required:true,value:patientId,disabled:Boolean(initialPatient),onChange:e=>setPatientId(e.target.value)},
            h('option',{value:''},'Choose Guest'),choices.map(g=>h('option',{key:g.id,value:g.id},guestName(g))))),
          h('div',{className:'field'},h('label',null,'Type of note'),h('select',{'aria-label':'Type of note',value:noteType,onChange:e=>setNoteType(e.target.value)},PHYSIO_NOTE_TYPES.map(t=>h('option',{key:t,value:t},t)))),
          h('div',{className:'field span-2'},h('label',null,'Note / Observation'),
            h(PhysioNoteVoice,{disabled:saving,onResult:r=>{if(!r.text)return;setText(t=>(t.trim()?t.trim()+' ':'')+r.text);setVoice({heard:r.heard,lang:r.lang})}}),
            h('textarea',{ref:areaRef,'aria-label':'Physio note',rows:5,required:true,'data-samara-voice':'off',value:text,onChange:e=>setText(e.target.value),
              placeholder:'Example: Walked 20 metres with walker, needed one-person support. Knee pain 4/10 after exercise. Tolerated well.'}),
            h('span',{ref:anchorRef,className:'physio-dictate-anchor'})),
          voice?.heard&&h('details',{className:'span-2 small-note'},h('summary',null,'What the voice assistant heard'),h('p',null,voice.heard)),
          error&&h('div',{className:'message error span-2',role:'alert'},error)),
        h('div',{className:'actions'},
          h('button',{type:'button',className:'btn btn-secondary',disabled:saving,onClick:onClose},'Cancel'),
          h('button',{className:'btn btn-primary',disabled:saving},saving?'Saving…':'Save Note'))));
  }

  // Register of notes (Physiotherapy Dashboard → Notes & Observations).
  function PhysioNotesRegister({profile,filters}){
    const [guests,setGuests]=React.useState([]);
    const [notes,setNotes]=React.useState([]);
    const [loading,setLoading]=React.useState(true);
    const [message,setMessage]=React.useState('');
    const [adding,setAdding]=React.useState(false);
    const [detail,setDetail]=React.useState(null);
    const from=filters?.from||todayISOIndia(),to=filters?.to||todayISOIndia();
    async function load(){
      setLoading(true);setMessage('');
      try{
        const g=await loadPhysioGuests(profile);if(!g.error)setGuests(g.data||[]);
        const start=new Date(from+'T00:00:00+05:30').toISOString(),end=new Date(new Date(to+'T00:00:00+05:30').getTime()+86400000).toISOString();
        let q=client.from('physiotherapy_notes').select('*').gte('observed_at',start).lt('observed_at',end).order('observed_at',{ascending:false}).limit(500);
        if(Array.isArray(filters?.patientIds))q=filters.patientIds.length?q.in('patient_id',filters.patientIds):q.eq('patient_id','00000000-0000-0000-0000-000000000000');
        const r=await q;if(r.error)throw r.error;setNotes(r.data||[]);
      }catch(e){const m=String(e?.message||e);setMessage(/physiotherapy_notes/.test(m)?'Physio Notes is not set up yet — Admin must run SQL 338 in Supabase.':m);setNotes([])}
      finally{setLoading(false)}
    }
    React.useEffect(()=>{load()},[filters?.key,profile?.id]);
    const guest=id=>guests.find(g=>g.id===id)||{};
    const label=id=>{const g=guest(id);return g.id?[g.title,g.full_name].filter(Boolean).join(' ')+(g.room_no?' · Room '+g.room_no+(g.bed_no?'-'+g.bed_no:''):''):'Guest'};
    const rows=notes.map(n=>[fmt(n.observed_at),label(n.patient_id),n.note_type,String(n.note_text||'').length>120?String(n.note_text).slice(0,120)+'…':n.note_text,(n.recorded_by_name||'—')+(n.voice_used?' · 🎤':'')]);
    return h(React.Fragment,null,
      h('div',{className:'actions',style:{margin:'0 0 10px'}},h('button',{type:'button',className:'btn btn-primary',onClick:()=>setAdding(true)},'📝 Add Physio Note / Observation')),
      message&&h('div',{className:'message error'},message),
      loading?h('p',{className:'small-note'},'Loading notes…'):
        notes.length?h(LogTable,{title:'Physio Notes & Observations',subtitle:`${formatDateIN(from)} to ${formatDateIN(to)} · tap a row for the full note`,heads:['Time','Guest','Type','Note','Recorded by'],rows,onRowClick:i=>setDetail(notes[i])}):
        !message&&h('div',{className:'card panel'},h('p',{className:'small-note'},'No physio notes for this period. Press “Add Physio Note / Observation” to record one.')),
      adding&&h(PhysioNoteModal,{profile,guests,onClose:()=>setAdding(false),onSaved:load}),
      detail&&h('div',{className:'modal-backdrop',onClick:e=>{if(e.target===e.currentTarget)setDetail(null)}},
        h('div',{className:'card modal'},
          h('div',{className:'panel-head'},h('h3',null,detail.note_type),h('button',{type:'button',className:'close',onClick:()=>setDetail(null)},'×')),
          h('p',null,h('strong',null,label(detail.patient_id))),
          h('p',{style:{whiteSpace:'pre-wrap'}},detail.note_text),
          detail.heard_text&&h('p',{className:'small-note'},'Heard (',detail.spoken_language==='ta-IN'?'Tamil':'English','): ',detail.heard_text),
          h('p',{className:'small-note'},'Observed: ',fmt(detail.observed_at),' · Recorded by ',detail.recorded_by_name||'—',detail.recorded_by_role?' ('+detail.recorded_by_role+')':''),
          h('div',{className:'actions'},h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setDetail(null)},'Back')))));
  }

  (function physioNoteStyle(){
    if(document.getElementById('physio-note-style'))return;
    const st=document.createElement('style');st.id='physio-note-style';
    st.textContent='.physio-note-voice{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:4px 0 6px}.physio-dictate-anchor{display:block}.physio-dictate-anchor+.samara-dictation-tools{margin-top:6px}';
    document.head.appendChild(st);
  })();
