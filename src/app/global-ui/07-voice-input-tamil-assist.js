  // v2.11.36: Global Tamil / English voice input for frontline nursing narrative fields.
  // Adds a compact Voice button beside free-text nursing fields without changing existing forms.
  function GlobalNursingVoiceInput({profile,page}){
    const spotAssessment=page==='Spot Assessment';
    const enabled=Boolean(profile?.id);
    const [target,setTarget]=React.useState(null);
    const [open,setOpen]=React.useState(false);
    const [listening,setListening]=React.useState(false);
    const [processing,setProcessing]=React.useState(false);
    const [message,setMessage]=React.useState('');
    const [transcript,setTranscript]=React.useState('');
    const [reviewText,setReviewText]=React.useState('');
    const recognitionRef=React.useRef(null);
    const recorderRef=React.useRef(null);
    const streamRef=React.useRef(null);
    const chunksRef=React.useRef([]);
    const langRef=React.useRef('ta-IN');
    const audioBlobRef=React.useRef(null);

    function eligible(el){
      if(!enabled||!el||el.disabled||el.readOnly)return false;
      if(el.dataset?.samaraVoice==='off'||el.closest('.samara-voice-modal'))return false;
      if(spotAssessment)return Boolean(el.closest('.spot-assessment')&&el.dataset?.samaraVoice==='on');
      const type=String(el.getAttribute('type')||'text').toLowerCase();
      if(el.tagName==='INPUT'&&!['text','search'].includes(type))return false;
      const bits=[el.name,el.id,el.placeholder,el.getAttribute('aria-label'),el.closest('label')?.innerText,el.parentElement?.querySelector(':scope > label')?.innerText].filter(Boolean).join(' ').toLowerCase();
      if(/search|username|login|password|email|mobile|phone|contact no|patient id|employee id|mr no|room no|bed no|reference no|payment reference/.test(bits))return false;
      if(el.tagName==='TEXTAREA')return true;
      return /remark|note|instruction|summary|handover|hand over|observation|reason|description|detail|advice|complaint|finding|action taken|follow.?up|precaution|restriction|incident|diet|care plan|special|comment|clinical|doctor|procedure|diagnosis|allerg|referred|request|transport|belonging|condition|status note/.test(bits);
    }

    function addButtons(){
      if(!enabled)return;
      document.querySelectorAll('textarea,input[type="text"],input:not([type])').forEach(el=>{
        if(!eligible(el)||el.dataset.samaraVoiceReady==='1')return;
        el.dataset.samaraVoiceReady='1';
        const btn=document.createElement('button');
        btn.type='button';btn.className='samara-global-voice-btn';btn.innerHTML='🎤 Voice';
        btn.title='Tamil / English voice input';btn.setAttribute('aria-label','Tamil or English voice input');
        btn.addEventListener('click',ev=>{ev.preventDefault();ev.stopPropagation();audioBlobRef.current=null;setTarget(el);setTranscript('');setReviewText('');setMessage('');setOpen(true)});
        el.insertAdjacentElement('afterend',btn);
        window.SamaraDictation?.attach(btn,el);
      });
    }

    React.useEffect(()=>{
      if(!enabled)return;
      addButtons();
      let disposed=false,pending=null;
      const ob=new MutationObserver(()=>{if(pending!==null)return;pending=window.setTimeout(()=>{pending=null;if(!disposed)addButtons()},40)});
      ob.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled','readonly']});
      return()=>{disposed=true;clearTimeout(pending);ob.disconnect();window.SamaraDictation?.stop();document.querySelectorAll('.samara-global-voice-btn').forEach(x=>x.remove());document.querySelectorAll('[data-samara-voice-ready="1"]').forEach(x=>delete x.dataset.samaraVoiceReady)};
    },[enabled,spotAssessment]);

    function stop(){
      try{recognitionRef.current?.stop?.()}catch(_){} recognitionRef.current=null;
      try{if(recorderRef.current&&recorderRef.current.state!=='inactive')recorderRef.current.stop()}catch(_){}
      try{streamRef.current?.getTracks?.().forEach(t=>t.stop())}catch(_){}
      streamRef.current=null;setListening(false);
    }
    function nativeSet(el,value){
      if(!el)return;
      const proto=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
      const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
      if(setter)setter.call(el,value);else el.value=value;
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
      try{el.focus();el.setSelectionRange(value.length,value.length)}catch(_){}
    }
    function appendText(text){
      const clean=String(text||'').trim();if(!clean||!target)return;
      const old=String(target.value||'').trim();
      nativeSet(target,old?`${old}${/[.!?]$/.test(old)?' ':' — '}${clean}`:clean);
    }
    function stageText(text){
      const clean=String(text||'').trim();
      if(!clean){setMessage('No usable text was returned. Please record again.');return}
      setReviewText(clean);
      setMessage('Review and edit the text below. It has not yet been entered into the form.');
    }
    function useReviewedText(){
      if(!target?.isConnected||target.disabled||target.readOnly){setMessage('This field is no longer available. Close Voice Input and reopen it from the assessment.');return}
      const clean=String(reviewText||'').trim();
      if(!clean){setMessage('Please enter or record the text before using it.');return}
      appendText(clean);
      stop();setOpen(false);setTarget(null);setTranscript('');setReviewText('');setMessage('');
    }
    function resultText(result,fallback=''){
      const f=result?.fields||{};
      const details=String(f.details||f.notes||f.description||'').trim();
      const title=String(f.title||f.subject||'').trim();
      if(details&&title&&!details.toLowerCase().startsWith(title.toLowerCase()))return `${title}. ${details}`;
      return details||title||String(result?.translated_text||result?.translation||fallback||'').trim();
    }
    async function sendTranscript(spoken,lang){
      setProcessing(true);
      try{
        if(String(lang).toLowerCase().startsWith('en')){stageText(spoken);return}
        setMessage('Converting Tamil speech to simple English…');
        const {data:{session}}=await client.auth.getSession();if(!session)throw new Error('Please sign in again.');
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/director-office-voice`,{method:'POST',headers:{'Authorization':`Bearer ${session.access_token}`,'apikey':cfg.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({transcript:spoken,spoken_language:lang,current_form_type:'Nursing Note',current_task_kind:'Clinical Note',now_iso:new Date().toISOString(),timezone:'Asia/Kolkata'})});
        const result=await response.json().catch(()=>({error:'Unable to read voice response'}));
        if(!response.ok||result.error)throw new Error(result.error||'Unable to convert Tamil speech.');
        const text=resultText(result,'');if(!text)throw new Error('No English text was returned.');
        stageText(text);
      }catch(error){setMessage(`Tamil speech was captured, but English conversion could not complete. ${error.message||''}`)}
      finally{setProcessing(false)}
    }
    function bestMime(){
      for(const x of ['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus']){try{if(window.MediaRecorder&&MediaRecorder.isTypeSupported?.(x))return x}catch(_){}}return '';
    }
    async function sendAudio(blob,lang,providerPreference='auto'){
      if(!blob)return setMessage('The previous recording is not available. Please record again.');
      audioBlobRef.current=blob;
      setProcessing(true);setMessage(providerPreference==='openai'?'Trying OpenAI…':providerPreference==='gemini'?'Trying Gemini again…':'Trying Gemini first; OpenAI will be used automatically if needed…');
      try{
        const {data:{session}}=await client.auth.getSession();if(!session)throw new Error('Please sign in again.');
        const ext=(blob.type||'').includes('mp4')?'m4a':(blob.type||'').includes('ogg')?'ogg':'webm';
        const fd=new FormData();fd.append('audio',blob,`nursing-voice.${ext}`);fd.append('spoken_language',lang);fd.append('current_form_type','Nursing Note');fd.append('current_task_kind','Clinical Note');fd.append('provider_preference',providerPreference);fd.append('now_iso',new Date().toISOString());fd.append('timezone','Asia/Kolkata');
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/director-office-voice`,{method:'POST',headers:{'Authorization':`Bearer ${session.access_token}`,'apikey':cfg.supabasePublishableKey},body:fd});
        const result=await response.json().catch(()=>({error:'Unable to read voice response'}));if(!response.ok||result.error)throw new Error(result.error||'Unable to process voice.');
        if(result?.transcript)setTranscript(String(result.transcript));
        const text=resultText(result,result?.transcript||'');if(!text)throw new Error('No text was returned.');stageText(text);
        setMessage(`Review and edit below. Processed by ${result?.provider_used||result?.provider||'voice service'}.`);
      }catch(error){setMessage(error.message||'Unable to process voice.')}finally{setProcessing(false)}
    }
    async function startRecorder(lang){
      if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){setMessage('Microphone recording is not available in this browser.');return}
      try{
        const stream=await navigator.mediaDevices.getUserMedia({audio:true});streamRef.current=stream;chunksRef.current=[];langRef.current=lang;
        const mime=bestMime();const rec=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);recorderRef.current=rec;
        rec.ondataavailable=e=>{if(e.data?.size)chunksRef.current.push(e.data)};
        rec.onstop=async()=>{const blob=new Blob(chunksRef.current,{type:rec.mimeType||chunksRef.current[0]?.type||'audio/webm'});chunksRef.current=[];audioBlobRef.current=blob;try{stream.getTracks().forEach(t=>t.stop())}catch(_){}streamRef.current=null;recorderRef.current=null;setListening(false);if(blob.size<1000)return setMessage('No useful speech was captured. Please try again.');await sendAudio(blob,langRef.current,'auto')};
        rec.start();setListening(true);setMessage(lang==='ta-IN'?'🎤 Listening in Tamil… Tap Stop when finished.':'🎤 Listening in English… Tap Stop when finished.');
      }catch(error){setListening(false);setMessage(error?.name==='NotAllowedError'?'Microphone permission is blocked. Please allow microphone access for Samara Care.':(error.message||'Unable to start microphone.'))}
    }
    function start(lang){
      if(listening||processing)return;
      setTranscript('');setReviewText('');setMessage('');
      // MediaRecorder remains active across sentences and natural pauses until
      // the nurse presses Stop. SpeechRecognition is retained only as fallback.
      if(navigator.mediaDevices?.getUserMedia&&window.MediaRecorder)return startRecorder(lang);
      const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
      if(!SR)return startRecorder(lang);
      try{
        const rec=new SR();recognitionRef.current=rec;rec.lang=lang;rec.interimResults=true;rec.continuous=true;rec.maxAlternatives=1;let finalText='';let latest='';let handled=false;
        rec.onstart=()=>{setListening(true);setMessage(lang==='ta-IN'?'🎤 Listening in Tamil…':'🎤 Listening in English…')};
        rec.onresult=e=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0]?.transcript||'';if(e.results[i].isFinal)finalText+=`${t} `;else interim+=t}latest=(finalText||interim).trim();setTranscript(latest)};
        const finish=()=>{if(handled)return;handled=true;setListening(false);const spoken=(finalText||latest).trim();if(spoken)sendTranscript(spoken,lang);else setMessage('No speech was captured. Please try again.')};
        rec.onerror=e=>{setListening(false);if((e?.error==='not-allowed'||e?.error==='service-not-allowed')){handled=true;setMessage('Microphone / speech permission is blocked. Please allow microphone access.')}else if(!latest&&!finalText){handled=true;startRecorder(lang)}};
        rec.onend=finish;rec.start();
      }catch(_){startRecorder(lang)}
    }
    function close(){stop();setOpen(false);setTarget(null);setTranscript('');setReviewText('');setMessage('');audioBlobRef.current=null}
    if(!enabled||!open)return null;
    return h('div',{className:'samara-voice-modal-backdrop',onClick:e=>{if(e.target===e.currentTarget)close()}},
      h('div',{className:'samara-voice-modal'},
        h('div',{className:'samara-voice-modal-head'},h('div',null,h('strong',null,'🎤 Voice Input'),h('small',null,'Speak naturally. Tamil is converted to simple English.')),h('button',{type:'button',className:'close',onClick:close},'×')),
        listening?h('button',{type:'button',className:'btn btn-danger samara-voice-stop',onClick:stop},'■ Stop Recording'):
          reviewText?h('div',{className:'samara-voice-review-actions'},
            h('button',{type:'button',className:'btn btn-primary',onClick:useReviewedText},'✓ Use This Text'),
            h('button',{type:'button',className:'btn btn-secondary',onClick:()=>{setTranscript('');setReviewText('');setMessage('')}},'🎤 Record Again'),
            h('button',{type:'button',className:'btn btn-secondary',onClick:close},'Cancel')
          ):h('div',{className:'samara-voice-actions'},h('button',{type:'button',className:'btn btn-primary',disabled:processing,onClick:()=>start('ta-IN')},processing?'Processing…':'🎤 Speak Tamil'),h('button',{type:'button',className:'btn btn-secondary',disabled:processing,onClick:()=>start('en-IN')},'🎤 Speak English')),
        transcript&&h('div',{className:'samara-voice-transcript'},h('small',null,'Heard'),h('div',null,transcript)),
        reviewText&&h('div',{className:'samara-voice-review'},h('label',null,'Review and edit before using'),h('textarea',{rows:5,value:reviewText,onChange:e=>setReviewText(e.target.value)})),
        reviewText&&audioBlobRef.current?h('div',{className:'samara-voice-provider-actions'},
          h('button',{type:'button',className:'btn btn-secondary',disabled:processing,onClick:()=>sendAudio(audioBlobRef.current,langRef.current,'gemini')},processing?'Processing…':'Try Gemini Again'),
          h('button',{type:'button',className:'btn btn-secondary',disabled:processing,onClick:()=>sendAudio(audioBlobRef.current,langRef.current,'openai')},processing?'Processing…':'Try OpenAI Instead')
        ):null,
        message&&h('div',{className:'samara-voice-message'},message),
        h('div',{className:'samara-voice-note'},reviewText?'Correct any word, then tap Use This Text. Save / Submit remains a separate action.':'Recording continues across sentences and pauses until Stop Recording is pressed.')
      )
    );
  }

  function TamilAssist({text,context='Clinical Instruction'}){
    const source=String(text||'').trim();
    const [tamil,setTamil]=React.useState('');
    const [open,setOpen]=React.useState(false);
    const [loading,setLoading]=React.useState(false);
    const [error,setError]=React.useState('');

    React.useEffect(()=>{setTamil('');setOpen(false);setError('')},[source]);
    async function sourceHash(value){
      const bytes=new TextEncoder().encode(value);
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
    }
    async function translate(){
      if(!source||loading)return;
      if(tamil){setOpen(true);return}
      setLoading(true);setError('');
      try{
        // Include the translation-style version so older machine-Tamil cache entries
        // are bypassed automatically after a practical-language prompt update.
        const hash=await sourceHash(`practical-tamil-v2|${source}`);
        const {data:cached}=await client.from('staff_tamil_translations').select('tamil_text').eq('source_hash',hash).maybeSingle();
        if(cached?.tamil_text){setTamil(cached.tamil_text);setOpen(true);return}
        const {data:{session}}=await client.auth.getSession();if(!session)throw new Error('Please sign in again.');
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/staff-translate-tamil`,{method:'POST',headers:{'Authorization':`Bearer ${session.access_token}`,'apikey':cfg.supabasePublishableKey,'Content-Type':'application/json'},body:JSON.stringify({text:source,context})});
        const raw=await response.text();let result={};try{result=JSON.parse(raw)}catch(_){throw new Error('Translation service returned an unreadable response.')}
        if(!response.ok||result.error)throw new Error(result.error||'Tamil translation could not be completed.');
        const translated=String(result.tamil_text||'').trim();if(!translated)throw new Error('No Tamil translation was returned.');
        setTamil(translated);setOpen(true);
        await client.from('staff_tamil_translations').upsert({source_hash:hash,source_text:source,tamil_text:translated,clinical_context:context,created_by:session.user.id},{onConflict:'source_hash'});
      }catch(err){setError(err.message||'Unable to translate now.')}finally{setLoading(false)}
    }
    function speak(){
      if(!tamil||!window.speechSynthesis)return setError('Tamil audio is not available on this device.');
      window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(tamil);utterance.lang='ta-IN';utterance.rate=.9;
      const voices=window.speechSynthesis.getVoices?.()||[];const voice=voices.find(v=>String(v.lang||'').toLowerCase().startsWith('ta'));if(voice)utterance.voice=voice;
      window.speechSynthesis.speak(utterance);
    }
    if(!source||source==='—')return null;
    return h('div',{className:'staff-tamil-assist'},
      !open?h('button',{type:'button',className:'staff-tamil-button',disabled:loading,onClick:translate},loading?'மொழிபெயர்க்கிறது…':'தமிழில் பார்க்க'):null,
      open?h('div',{className:'staff-tamil-panel'},
        h('div',{className:'staff-tamil-head'},h('strong',null,'தமிழ் மொழிபெயர்ப்பு'),h('div',{className:'actions'},h('button',{type:'button',onClick:speak},'🔊 தமிழில் கேட்க'),h('button',{type:'button',onClick:()=>{window.speechSynthesis?.cancel?.();setOpen(false)}},'தமிழை மறைக்க'))),
        h('p',{lang:'ta'},tamil),
        h('small',null,'புரிதலுக்காக மட்டும். மேலே உள்ள ஆங்கிலப் பதிவே அதிகாரப்பூர்வ மருத்துவப் பதிவு.')
      ):null,
      error?h('div',{className:'staff-tamil-error'},error,h('button',{type:'button',onClick:translate},'Try again')):null
    );
  }

