  // 2.16.34: ephemeral nurse–guest interpretation; no patient records or chat logging. Open to Admin, Manager, Nurse, Caregiver and STD.
  function TalkToGuest(){
    const [guest,setGuest]=React.useState('');
    const [status,setStatus]=React.useState('Ready. Let the guest speak first.');
    const [busy,setBusy]=React.useState(false);
    const [recording,setRecording]=React.useState('');
    const [rows,setRows]=React.useState([]);
    const [consent,setConsent]=React.useState(false);
    const run=React.useRef({epoch:0,recorder:null,stream:null,timer:null,request:null,context:null,source:null,discard:false,locked:false});
    const labels={bn:'Bangla / Bengali · বাংলা',hi:'Hindi · हिन्दी',ta:'Tamil · தமிழ்'};
    const box={border:'1px solid #e6ccd9',borderRadius:18,padding:20,background:'#fff'};
    function releaseMic(){const r=run.current;clearInterval(r.timer);r.timer=null;if(r.input){r.input.disconnect();r.input=null;}if(r.stream)r.stream.getTracks().forEach(t=>t.stop());r.stream=null;}
    function cancel(){const r=run.current;r.epoch++;r.discard=true;if(r.request)r.request.abort();r.request=null;if(r.recorder&&r.recorder.state!=='inactive')r.recorder.stop();r.recorder=null;releaseMic();if(r.source){try{r.source.stop()}catch(_){}r.source=null;}r.locked=false;}
    React.useEffect(()=>{const pause=()=>{if(document.hidden){cancel();setBusy(false);setRecording('');setStatus('Paused. Tap a speaker button to continue.');}};document.addEventListener('visibilitychange',pause);return()=>{document.removeEventListener('visibilitychange',pause);cancel();if(run.current.context)run.current.context.close().catch(()=>{});};},[]);
    async function request(body){
      const r=run.current,epoch=r.epoch;
      const {data:{session}}=await client.auth.getSession();
      if(epoch!==r.epoch)throw new DOMException('Cancelled','AbortError');
      if(!session)throw Error('Please sign in to the ERP again.');
      const controller=new AbortController();r.request=controller;
      const timer=setTimeout(()=>controller.abort(),65000);
      try{
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/talk-to-guest`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,apikey:cfg.supabasePublishableKey,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:JSON.stringify(body),signal:controller.signal});
        if(!response.ok){const x=await response.json().catch(()=>({}));throw Error(x.error||(response.status===404?'Talk to Guest is awaiting service setup. Please contact Admin.':'Translation is unavailable. Please try again.'));}
        return response;
      }finally{clearTimeout(timer);if(r.request===controller)r.request=null;}
    }
    function unlockAudio(){
      const r=run.current,C=window.AudioContext||window.webkitAudioContext;
      if(C){if(!r.context||r.context.state==='closed')r.context=new C();r.context.resume().catch(()=>{});const silent=r.context.createBufferSource();silent.buffer=r.context.createBuffer(1,1,r.context.sampleRate);silent.connect(r.context.destination);silent.start();silent.onended=()=>silent.disconnect();}
    }
    async function play(row,epoch){
      const r=run.current;setStatus('Preparing spoken translation…');
      const response=await request({mode:'speech',text:row.translation,language:row.target});
      const bytes=await response.arrayBuffer();if(epoch!==r.epoch)return;
      if(!r.context)throw Error('Audio playback is unavailable on this device.');
      const decoded=await r.context.decodeAudioData(bytes);if(epoch!==r.epoch)return;
      await r.context.resume();if(epoch!==r.epoch)return;
      await new Promise((resolve,reject)=>{const source=r.context.createBufferSource();r.source=source;source.buffer=decoded;source.connect(r.context.destination);source.onended=()=>{source.disconnect();if(r.source===source)r.source=null;resolve();};try{source.start();setStatus('Playing translation…');}catch(e){reject(e);}});
    }
    async function translate(blob,actor,epoch){
      const r=run.current;if(epoch!==r.epoch)return;
      setRecording('');setBusy(true);setStatus(actor==='guest'?'Detecting Bangla or Hindi and translating to Tamil…':'Translating Tamil for the guest…');
      let row;
      try{
        if(blob.size<1200)throw Error('No clear speech captured. Please speak a full sentence and try again.');
        const fd=new FormData();const ext=blob.type.includes('mp4')?'m4a':blob.type.includes('ogg')?'ogg':'webm';
        fd.append('audio',blob,'conversation.'+ext);fd.append('actor',actor);if(guest)fd.append('guest_language',guest);
        const response=await request(fd);const x=await response.json();if(epoch!==r.epoch)return;
        if(!x.transcript||!x.translation||!['bn','hi','ta'].includes(x.source)||!['bn','hi','ta'].includes(x.target))throw Error('The translation was incomplete. Please try again.');
        if(actor==='guest'){if(!['bn','hi'].includes(x.source)||x.target!=='ta')throw Error('Please ask the guest to repeat in Bangla or Hindi.');setGuest(x.source);}
        else if(x.source!=='ta'||x.target!==guest)throw Error('Please speak in Tamil and try again.');
        row={id:Date.now(),actor,transcript:x.transcript,translation:x.translation,source:x.source,target:x.target};
        setRows(old=>[row,...old].slice(0,6));await play(row,epoch);
        if(epoch===r.epoch)setStatus('Ready for the next speaker.');
      }catch(e){if(epoch===r.epoch)setStatus(row?'Translation is ready. Tap Listen to play it again.':e.name==='AbortError'?'The request timed out. Please try again.':e.message||'Translation failed. Please try again.');}
      finally{if(epoch===r.epoch){r.locked=false;setBusy(false);}}
    }
    async function start(actor){
      const r=run.current;
      if(r.locked||!consent||(actor==='nurse'&&!guest))return;
      if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){setStatus('Please use a current Chrome or Safari browser with microphone access.');return;}
      r.locked=true;r.discard=false;const epoch=++r.epoch;unlockAudio();setBusy(true);setStatus('Opening microphone…');
      try{
        const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
        if(epoch!==r.epoch){stream.getTracks().forEach(t=>t.stop());return;}r.stream=stream;
        const type=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
        const rec=new MediaRecorder(stream,type?{mimeType:type}:{});r.recorder=rec;const chunks=[];
        rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
        rec.onerror=()=>{cancel();setBusy(false);setRecording('');setStatus('Recording failed. Please try again.');};
        rec.onstop=()=>{releaseMic();r.recorder=null;if(!r.discard&&epoch===r.epoch)translate(new Blob(chunks,{type:rec.mimeType||'audio/webm'}),actor,epoch);};
        rec.start(250);setRecording(actor);setBusy(false);setStatus(actor==='guest'?'Listening to guest. Speak in Bangla or Hindi. Pause to translate.':'Listening to nurse. Speak in Tamil. Pause to translate.');
        const ctx=r.context,began=Date.now();let heard=false,lastVoice=began,analyser=null,data=null;
        // No AudioContext (very old browser): no pause detection — Stop & translate button / 30 s limit still work.
        if(ctx){analyser=ctx.createAnalyser();analyser.fftSize=2048;const input=ctx.createMediaStreamSource(stream);input.connect(analyser);r.input=input;data=new Float32Array(analyser.fftSize);}
        r.timer=setInterval(()=>{if(rec.state==='inactive')return;if(!analyser){if(Date.now()-began>30000)rec.stop();return;}analyser.getFloatTimeDomainData(data);let sum=0;for(const n of data)sum+=n*n;if(Math.sqrt(sum/data.length)>.018){heard=true;lastVoice=Date.now();}if((heard&&Date.now()-lastVoice>1800&&Date.now()-began>1600)||Date.now()-began>30000){if(r.input){r.input.disconnect();r.input=null;}rec.stop();}},150);
      }catch(e){if(epoch===r.epoch){cancel();setBusy(false);setRecording('');setStatus(e.name==='NotAllowedError'?'Microphone access was denied. Allow it in browser settings and try again.':'Could not open the microphone. Please try again.');}}
    }
    function stopAndTranslate(){if(run.current.recorder?.state==='recording')run.current.recorder.stop();}
    async function replay(row){if(run.current.locked)return;run.current.locked=true;unlockAudio();setBusy(true);const epoch=++run.current.epoch;try{await play(row,epoch);if(epoch===run.current.epoch)setStatus('Ready for the next speaker.');}catch(e){if(epoch===run.current.epoch)setStatus('Voice unavailable. The translated text is shown below.');}finally{if(epoch===run.current.epoch){run.current.locked=false;setBusy(false);}}}
    return h('section',{className:'talk-to-guest',style:{maxWidth:960,margin:'0 auto',padding:16,color:'#5d1039'}},
      h('style',null,'.talk-to-guest *{box-sizing:border-box}.ttg-speakers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.ttg-button{width:100%;min-height:66px;border:0;border-radius:14px;color:white;background:#b01264;font-family:inherit;font-size:19px;font-weight:700;cursor:pointer;padding:14px}.ttg-button:disabled{opacity:.45;cursor:default}.ttg-button:focus-visible,.talk-to-guest button:focus-visible{outline:3px solid #187c70;outline-offset:3px}.ttg-secondary{padding:10px 16px;border:1px solid #d8b9ca;border-radius:12px;background:white;color:#5d1039;cursor:pointer;min-height:44px}.ttg-secondary:disabled{opacity:.45}@media(max-width:600px){.ttg-speakers{grid-template-columns:1fr}.talk-to-guest{padding:8px!important}}'),
      h('div',{style:{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'center'}},h('div',null,h('h1',{style:{margin:'0 0 8px',fontSize:30}},'Talk to Guest'),h('p',{style:{margin:'0 0 18px',color:'#78636f'}},'Speak naturally. Understand each other.')),h('button',{type:'button',className:'ttg-secondary',onClick:()=>{cancel();setGuest('');setRows([]);setConsent(false);setBusy(false);setRecording('');setStatus('Ready. Let the new guest speak first.');}},'New guest / Clear')),
      h('div',{style:{...box,background:'#fff6fa',marginBottom:16}},h('strong',null,guest?'Guest language: '+labels[guest]:'Guest language: Auto · Bangla or Hindi'),h('p',{style:{margin:'8px 0',lineHeight:1.6}},'The guest speaks first. Their language is detected each time; your Tamil reply is translated back into that language.'),h('label',{style:{display:'flex',gap:10,alignItems:'flex-start',lineHeight:1.6}},h('input',{type:'checkbox',checked:consent,disabled:busy||!!recording,onChange:e=>setConsent(e.target.checked),style:{marginTop:6}}),h('span',null,'Guest agrees to send this conversation audio and text to Samara’s AI services for translation.',h('span',{lang:'bn',style:{display:'block',fontSize:15}},'বাংলা: অনুবাদের জন্য এই কথোপকথনের অডিও ও লেখা সামারার AI পরিষেবায় পাঠাতে আমি রাজি।'),h('span',{lang:'hi',style:{display:'block',fontSize:15}},'हिन्दी: अनुवाद के लिए इस बातचीत की आवाज़ और लिखित बातें सामरा की AI सेवा को भेजने के लिए मैं सहमत हूँ।')))),
      h('div',{className:'ttg-speakers'},
        h('div',{style:box},h('h2',{style:{margin:'0 0 8px'}},'Guest speaks'),h('p',{style:{color:'#78636f',minHeight:48}},'বাংলা / हिन्दी → தமிழ்'),h('button',{type:'button',className:'ttg-button',disabled:!consent||busy||!!recording&&recording!=='guest',onClick:()=>recording==='guest'?stopAndTranslate():start('guest')},recording==='guest'?'Stop & translate':'🎙 Guest speaks'),h('p',{style:{fontSize:13,marginBottom:0}},'Bangla / Bengali or Hindi detected automatically.')),
        h('div',{style:box},h('h2',{style:{margin:'0 0 8px'}},'Nurse speaks'),h('p',{style:{color:'#78636f',minHeight:48}},guest?'தமிழ் → '+labels[guest]:'தமிழ் → guest’s language'),h('button',{type:'button',className:'ttg-button',style:{background:'#087667'},disabled:!consent||!guest||busy||!!recording&&recording!=='nurse',onClick:()=>recording==='nurse'?stopAndTranslate():start('nurse')},recording==='nurse'?'Stop & translate':'🎙 Nurse speaks · தமிழ்'),h('p',{style:{fontSize:13,marginBottom:0}},guest?'Reply in Tamil.':'Let the guest speak first.'))),
      h('p',{role:'status','aria-live':'polite',style:{...box,background:'#f5fbf9',margin:'16px 0',lineHeight:1.6}},status),
      (busy||recording)&&h('button',{type:'button',className:'ttg-secondary',onClick:()=>{cancel();setBusy(false);setRecording('');setStatus('Stopped. Ready for the next speaker.');}},'Cancel / Stop voice'),
      h('p',{style:{fontSize:13,lineHeight:1.6,color:'#78636f'}},'Speak one short sentence at a time, then pause. Internet required. Voice is AI-generated. Confirm important details with the guest.'),
      rows.length?h('div',null,rows.map(row=>h('article',{key:row.id,style:{...box,marginBottom:12}},h('strong',null,row.actor==='guest'?'Guest → Nurse':'Nurse → Guest'),h('p',{style:{fontSize:13,color:'#78636f'}},'Original · '+labels[row.source]),h('p',{lang:row.source,style:{fontSize:20,lineHeight:1.7,overflowWrap:'anywhere'}},row.transcript),h('hr',{style:{border:0,borderTop:'1px solid #eee'}}),h('p',{style:{fontSize:13,color:'#78636f'}},'Translation · '+labels[row.target]),h('p',{lang:row.target,style:{fontSize:22,lineHeight:1.7,overflowWrap:'anywhere'}},row.translation),h('button',{type:'button',className:'ttg-secondary',disabled:busy||!!recording,onClick:()=>replay(row)},'▶ Listen again')))):h('div',{style:{...box,textAlign:'center',color:'#78636f',padding:30}},'Your conversation will appear here. No conversation is saved in the ERP.')
    );
  }

