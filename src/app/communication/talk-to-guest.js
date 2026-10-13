  // 2.16.34: ephemeral nurse–guest interpretation; no patient records or chat logging. Open to Admin, Manager, Nurse, Caregiver and STD.
  // 2.16.35: hands-free conversation — ONE Start button, the microphone stays open, each sentence is sent after a short
  // pause and the spoken language decides who is talking (Tamil / English = staff, Bangla / Hindi = guest).
  // 2.16.43: SELF-ADJUSTING while in use (and every adjustment recorded for Admin → System Health):
  //  • Live echo: a translator hearing the other translator's voice again → echo dropped, muting made stronger.
  //  • Live missed speech: people talking ~6 s but nothing heard for 12 s → both translators restart; twice in 5 min → Standard.
  //  • Live drops / unavailable, Standard misses, slow translations, microphone problems → recorded.
  //  • Standard: 3 sentences in a row not caught → wait after speaker stops raised one step automatically.
  // 2.16.42: Live fix from a real test — Google streams near-silent audio non-stop and never sends turnComplete, so the old
  // "other translator is speaking" mute stayed on for both and neither heard anyone. Now only AUDIBLE output counts as speaking
  // (silence is not played), both are never muted together, and a sentence is finished after a short pause in the translated text.
  // 2.16.41: Live — staff replies were not translated when Google did not report the guest's language as a short code. The guest
  // language is now also read from language names and from the script of the guest's words; if still unknown, the language
  // buttons appear at once (not only at the end of a sentence).
  // 2.16.40: ⚡ LIVE mode (default) — Gemini Live Translate streams the translation while the person is still speaking, in a voice
  // like the speaker's. Two live sessions share the microphone: A = anything → Tamil (silent for Tamil), B = anything → guest
  // language (silent for that language), so nobody presses buttons. Each session is muted while the other is speaking its output
  // (stops them translating each other). Staff first: the last 12 s of audio is replayed into B after one language tap.
  // If Live is not available / drops, the conversation continues in Standard mode automatically. Standard mode unchanged.
  // 2.16.39: waits for the speaker — softer voices detected (start / keep thresholds), pause setting 0.8 / 1.2 / 2 s (default 1.2,
  // longer right after speech starts), up to 45 s per turn, "Translate now" button; smooth voice (short buffer, no gaps); AI time shown.
  // 2.16.38: speed — translated text shown the moment it arrives; voice streamed and played while it is still being generated;
  // server woken on Start; 0.8 s pause; each translation shows how long it took.
  // 2.16.37: translation spoken in a voice matching the speaker (male / female sounding); phone pitch as backup; Voice: Auto / Female / Male.
  // 2.16.36: staff = Tamil; guest = English, Hindi, Bangla, Malayalam, Telugu or Kannada (auto-detected).
  // Staff may speak first: the guest's language is chosen with one tap and the same sentence is used (no repeat).
  // Translation + voice come back in one reply; the microphone does not record while the translation is playing.
  function TalkToGuest(){
    const PAUSES=[[800,'0.8 s'],[1200,'1.2 s'],[2000,'2 s']]; // wait after the speaker stops (remembered on this phone)
    const savedPause=React.useMemo(()=>{try{const v=Number(localStorage.getItem('samara.ttg.pause'));return PAUSES.some(p=>p[0]===v)?v:1200;}catch(_){return 1200;}},[]);
    const [guest,setGuestState]=React.useState('');
    const [consent,setConsent]=React.useState(false);
    const [live,setLive]=React.useState(false);
    const [phase,setPhase]=React.useState('idle'); // idle | listening | hearing | translating | playing
    const [status,setStatus]=React.useState('Tick the consent box, then tap Start conversation. Anyone can speak first.');
    const [rows,setRows]=React.useState([]);
    const [pending,setPending]=React.useState(null); // staff spoke before the guest's language was known
    const [tamilVoice,setTamilVoiceState]=React.useState(true);
    const [voicePref,setVoicePrefState]=React.useState('auto'); // auto | female | male
    const [pauseMs,setPauseState]=React.useState(savedPause);
    const [level,setLevel]=React.useState(0);
    const savedMode=React.useMemo(()=>{try{return localStorage.getItem('samara.ttg.mode')==='standard'?'standard':'live';}catch(_){return 'live';}},[]);
    const [mode,setModeState]=React.useState(savedMode); // live | standard (remembered on this phone)
    const [liveOn,setLiveOn]=React.useState(false); // Live actually running for this conversation
    const [liveNow,setLiveNow]=React.useState(null); // text of the sentence being translated right now
    const run=React.useRef({pauseMs:savedPause,epoch:0,live:false,stream:null,context:null,analyser:null,input:null,recorder:null,timer:null,request:null,source:null,guest:'',tamilVoice:true,discard:false,failures:0});
    const GUEST_LANGS=[['en','English'],['hi','हिन्दी Hindi'],['bn','বাংলা Bangla'],['ml','മലയാളം Malayalam'],['te','తెలుగు Telugu'],['kn','ಕನ್ನಡ Kannada']];
    const GUEST_CODES=GUEST_LANGS.map(x=>x[0]);
    const labels={en:'English',hi:'Hindi · हिन्दी',bn:'Bangla · বাংলা',ml:'Malayalam · മലയാളം',te:'Telugu · తెలుగు',kn:'Kannada · ಕನ್ನಡ',ta:'Tamil · தமிழ்'};
    const MIN_SPEECH_MS=350,IDLE_RESTART_MS=15000,MAX_MS=45000;
    const box={border:'1px solid #e6ccd9',borderRadius:18,padding:18,background:'#fff'};
    const setGuest=v=>{run.current.guest=v;setGuestState(v);};
    const setTamilVoice=v=>{run.current.tamilVoice=v;setTamilVoiceState(v);};
    const setVoicePref=v=>{run.current.voicePref=v;setVoicePrefState(v);};
    const setMode=v=>{setModeState(v);try{localStorage.setItem('samara.ttg.mode',v);}catch(_){}};
    const setPause=v=>{run.current.pauseMs=v;setPauseState(v);try{localStorage.setItem('samara.ttg.pause',String(v));}catch(_){}};
    // Pitch of one 2048-sample frame (autocorrelation, 70–350 Hz). Used only as a backup hint for the male / female voice choice.
    function pitchOf(buf,rate){
      const minLag=Math.floor(rate/350),maxLag=Math.min(Math.floor(rate/70),buf.length-200),n=buf.length-maxLag;let r0=0;for(let i=0;i<n;i++)r0+=buf[i]*buf[i];if(r0<=0)return 0;
      const corr=new Float32Array(maxLag+1);let best=0;
      for(let lag=minLag;lag<=maxLag;lag++){let sum=0;for(let i=0;i<n;i++)sum+=buf[i]*buf[i+lag];corr[lag]=sum/r0;if(corr[lag]>best)best=corr[lag];}
      if(best<.5)return 0;
      for(let lag=minLag+1;lag<maxLag;lag++)if(corr[lag]>=best*.9&&corr[lag]>=corr[lag-1]&&corr[lag]>=corr[lag+1])return rate/lag; // first strong peak avoids octave errors
      return 0;
    }
    const voiceHintFrom=pitches=>{if(pitches.length<3)return '';const sorted=[...pitches].sort((a,b)=>a-b),mid=sorted[Math.floor(sorted.length/2)];return mid<165?'male':'female';};
    const setPendingRow=v=>{run.current.pending=v;setPending(v);};
    // Record a Talk to Guest event for System Health (no Guest words, names or audio — only what happened).
    const ttgFault=(kind,message,detail)=>{try{window.SamaraFault&&window.SamaraFault(kind,message,{mode:run.current.liveMode?'live':'standard',guest_language:run.current.guest||'',...(detail||{})});}catch(_){}};

    function stopListening(){const r=run.current;clearInterval(r.timer);r.timer=null;if(r.recorder&&r.recorder.state!=='inactive'){r.discard=true;r.recorder.stop();}r.recorder=null;setLevel(0);}
    function stopPlayback(){const r=run.current;if(r.source){try{r.source.stop()}catch(_){}r.source=null;}(r.sources||[]).forEach(x=>{try{x.stop()}catch(_){}});r.sources=[];}
    function releaseMic(){const r=run.current;if(r.input){try{r.input.disconnect()}catch(_){}r.input=null;}r.analyser=null;if(r.stream)r.stream.getTracks().forEach(t=>t.stop());r.stream=null;}
    function stopAll(message){const r=run.current;r.epoch++;r.live=false;stopLive();stopListening();if(r.request)r.request.abort();r.request=null;stopPlayback();releaseMic();setLive(false);setPhase('idle');if(message)setStatus(message);}
    React.useEffect(()=>{const pause=()=>{if(document.hidden&&run.current.live)stopAll('Paused because the screen was switched. Tap Start conversation to continue.');};document.addEventListener('visibilitychange',pause);return()=>{document.removeEventListener('visibilitychange',pause);stopAll();if(run.current.context)run.current.context.close().catch(()=>{});};},[]);

    async function request(body){
      const r=run.current,epoch=r.epoch;
      const {data:{session}}=await client.auth.getSession();
      if(epoch!==r.epoch)throw new DOMException('Cancelled','AbortError');
      if(!session){const e=Error('Please sign in to the ERP again.');e.status=401;throw e;}
      const controller=new AbortController();r.request=controller;
      const timer=setTimeout(()=>controller.abort(),65000);
      try{
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/talk-to-guest`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,apikey:cfg.supabasePublishableKey,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:JSON.stringify(body),signal:controller.signal});
        if(!response.ok){const x=await response.json().catch(()=>({}));const e=Error(x.error||(response.status===404?'Talk to Guest is awaiting service setup. Please contact Admin.':'Translation is unavailable. Please try again.'));e.status=response.status;throw e;}
        return response;
      }finally{clearTimeout(timer);if(r.request===controller)r.request=null;}
    }
    function unlockAudio(){
      const r=run.current,C=window.AudioContext||window.webkitAudioContext;
      if(C){if(!r.context||r.context.state==='closed')r.context=new C();r.context.resume().catch(()=>{});const silent=r.context.createBufferSource();silent.buffer=r.context.createBuffer(1,1,r.context.sampleRate);silent.connect(r.context.destination);silent.start();silent.onended=()=>silent.disconnect();}
    }
    function fromBase64(text){const s=atob(text),bytes=new Uint8Array(s.length);for(let i=0;i<s.length;i++)bytes[i]=s.charCodeAt(i);return bytes.buffer;}
    async function playBytes(bytes,epoch){
      const r=run.current;if(!r.context)throw Error('Audio playback is unavailable on this device.');
      const decoded=await r.context.decodeAudioData(bytes.slice(0));if(epoch!==r.epoch)return;
      await r.context.resume();if(epoch!==r.epoch)return;
      setPhase('playing');setStatus('Speaking the translation…');
      await new Promise((resolve,reject)=>{const source=r.context.createBufferSource();r.source=source;source.buffer=decoded;source.connect(r.context.destination);source.onended=()=>{source.disconnect();if(r.source===source)r.source=null;resolve();};try{source.start();}catch(e){reject(e);}});
    }
    // 2.16.38: streamed voice = raw 24 kHz 16-bit mono PCM chunks, scheduled back-to-back so playback starts with the first chunk.
    function fromBase64Bytes(text){const s=atob(text),bytes=new Uint8Array(s.length);for(let i=0;i<s.length;i++)bytes[i]=s.charCodeAt(i);return bytes;}
    function pcmBuffer(bytes){const ctx=run.current.context,n=bytes.length>>1,buf=ctx.createBuffer(1,Math.max(1,n),24000),ch=buf.getChannelData(0),dv=new DataView(bytes.buffer,bytes.byteOffset,n*2);for(let i=0;i<n;i++)ch[i]=dv.getInt16(i*2,true)/32768;return buf;}
    // Short buffer before playing (and again if the network falls behind) so the voice flows without gaps.
    function pcmPlayer(epoch,onFirst){
      const r=run.current,ctx=r.context;let t=0,carry=null,started=false,pending=[],pendingBytes=0;const parts=[];r.sources=[];
      const START_S=.35,REFILL_S=.25,BPS=48000; // 24 kHz × 2 bytes
      function flush(){
        if(!pendingBytes||!ctx||epoch!==r.epoch)return;
        const all=new Uint8Array(pendingBytes);let o=0;for(const p of pending){all.set(p,o);o+=p.length;}pending=[];pendingBytes=0;
        const src=ctx.createBufferSource();src.buffer=pcmBuffer(all);src.connect(ctx.destination);
        const now=ctx.currentTime;if(t<now+.03)t=now+.06;
        src.start(t);t+=src.buffer.duration;r.sources.push(src);
        if(!started){started=true;onFirst&&onFirst();}
      }
      return {
        push(b64){
          if(!ctx||epoch!==r.epoch)return;let bytes=fromBase64Bytes(b64);
          if(carry){const m=new Uint8Array(carry.length+bytes.length);m.set(carry);m.set(bytes,carry.length);bytes=m;carry=null;}
          if(bytes.length%2){carry=bytes.slice(-1);bytes=bytes.slice(0,-1);}
          if(!bytes.length)return;parts.push(bytes);pending.push(bytes);pendingBytes+=bytes.length;
          const queued=pendingBytes/BPS,ahead=started?t-ctx.currentTime:0;
          if(!started){if(queued>=START_S)flush();}
          else if(ahead>.15||queued>=REFILL_S)flush(); // healthy → keep feeding; fell behind → wait for a little more first
        },
        async finish(){if(!ctx)return;flush();while(epoch===r.epoch&&ctx.currentTime<t)await new Promise(res=>setTimeout(res,Math.min(200,Math.max(20,(t-ctx.currentTime)*1000))));r.sources=[];},
        bytes(){const n=parts.reduce((a,p)=>a+p.length,0),all=new Uint8Array(n);let o=0;for(const p of parts){all.set(p,o);o+=p.length;}return all;}
      };
    }
    async function playPcm(bytes,epoch){
      const r=run.current;if(!r.context)throw Error('Audio playback is unavailable on this device.');
      await r.context.resume();if(epoch!==r.epoch)return;setPhase('playing');setStatus('Speaking the translation…');
      await new Promise(resolve=>{const src=r.context.createBufferSource();r.source=src;src.buffer=pcmBuffer(bytes);src.connect(r.context.destination);src.onended=()=>{src.disconnect();if(r.source===src)r.source=null;resolve();};src.start();});
    }
    // Wakes the server function as soon as Start is tapped, so the first sentence is not slowed by a cold start.
    async function warmUp(){try{const {data:{session}}=await client.auth.getSession();if(session)fetch(`${cfg.supabaseUrl}/functions/v1/talk-to-guest`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,apikey:cfg.supabasePublishableKey,'x-talk-mode':'ping'}}).catch(()=>{});}catch(_){}}
    async function speechFor(text,language,voice){const response=await request({mode:'speech',text,language,voice:run.current.voicePref&&run.current.voicePref!=='auto'?run.current.voicePref:(voice||'female')});return await response.arrayBuffer();}

    // ---- continuous listening: one recorder per sentence on the same open microphone ----
    function listen(keepStatus){
      const r=run.current;if(!r.live||!r.stream||r.liveMode)return;
      stopListening();r.discard=false;
      const epoch=r.epoch;
      const type=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t=>window.MediaRecorder&&MediaRecorder.isTypeSupported(t));
      let rec;try{rec=new MediaRecorder(r.stream,type?{mimeType:type}:{});}catch(_){stopAll('Recording is not supported in this browser. Please use current Chrome or Safari.');return;}
      r.recorder=rec;const chunks=[];
      rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      rec.onerror=()=>{if(epoch===r.epoch)stopAll('Recording failed. Tap Start conversation to try again.');};
      rec.onstop=()=>{if(r.recorder===rec)r.recorder=null;const discard=r.discard;r.discard=false;if(!discard&&epoch===r.epoch&&r.live)translate(new Blob(chunks,{type:rec.mimeType||'audio/webm'}),epoch,voiceHintFrom(pitches));};
      r.finishNow=()=>{if(rec.state==='recording'){clearInterval(r.timer);r.timer=null;setLevel(0);rec.stop();}};
      rec.start(250);
      setPhase('listening');if(!keepStatus)setStatus('Listening… anyone can speak now.');
      const began=Date.now();let heard=false,voiceStart=0,lastVoice=0,floor=.006;const pitches=[];
      const data=r.analyser?new Float32Array(r.analyser.fftSize):null;
      r.timer=setInterval(()=>{
        if(rec.state!=='recording')return;const now=Date.now();
        if(!r.analyser){if(now-began>MAX_MS){clearInterval(r.timer);r.timer=null;rec.stop();}return;}
        r.analyser.getFloatTimeDomainData(data);let sum=0;for(const n of data)sum+=n*n;const rms=Math.sqrt(sum/data.length);
        // Softer voices: a lower level keeps the sentence open once speech has started (start / keep thresholds).
        const startAt=Math.max(.012,floor*3),keepAt=Math.max(.007,startAt*.55);
        const voice=rms>(heard?keepAt:startAt);
        if(rms<keepAt)floor=floor*.95+rms*.05;
        setLevel(Math.min(1,rms*12));
        if(voice){if(!heard){heard=true;voiceStart=now;setPhase('hearing');setStatus('Hearing… it will translate when the speaker stops.');}lastVoice=now;if(rms>startAt){const f=pitchOf(data,r.context.sampleRate);if(f)pitches.push(f);}}
        // Wait for the speaker: chosen pause (default 1.2 s), +0.5 s in the first 2 s of speech (people pause after the first words).
        const wait=(r.pauseMs||1200)+(lastVoice-voiceStart<2000?500:0);
        if(heard&&now-lastVoice>wait){
          if(lastVoice-voiceStart<MIN_SPEECH_MS){listen(true);return;} // a cough / short noise — ignore
          clearInterval(r.timer);r.timer=null;setLevel(0);rec.stop();return;
        }
        if(!heard&&now-began>IDLE_RESTART_MS){listen(true);return;} // keep recordings small while nobody speaks
        if(heard&&now-voiceStart>MAX_MS){clearInterval(r.timer);r.timer=null;setLevel(0);rec.stop();}
      },100);
    }
    async function translate(blob,epoch,voiceHint){
      const r=run.current;if(epoch!==r.epoch)return;
      const t0=Date.now(),secs=ms=>(ms/1000).toFixed(1)+' s';
      setPhase('translating');setStatus('Translating…');
      // First message of a reply: shows the text at once. Returns the new row, or null when staff spoke first (language needed).
      function accept(x){
        r.failures=0;r.notCaught=0;
        {const ms=Date.now()-t0;if(ms>7000)ttgFault('ttg-slow','Translation took '+(ms/1000).toFixed(1)+' s',{text_ms:ms,ai_ms:x.timing&&x.timing.ai_ms||0,auth_ms:x.timing&&x.timing.auth_ms||0});}
        if(x.needs_language){
          const row={id:Date.now(),actor:'staff',source:x.source,transcript:x.transcript,translations:x.translations,target:'',translation:'',voice:x.voice,took:'Text '+secs(Date.now()-t0)+(x.timing?.ai_ms?' (AI '+secs(x.timing.ai_ms)+')':'')};
          setRows(old=>[row,...old].slice(0,6));setPendingRow(row);
          setStatus('Which language does the guest speak? Tap it below — your sentence will be spoken in it.');
          return null;
        }
        if(!x.transcript||!x.translation||!x.target)throw Error('The translation was incomplete. Please speak again.');
        const isGuest=GUEST_CODES.includes(x.source);
        if(isGuest){setGuest(x.source);const p=r.pending;if(p){setPendingRow(null);setRows(old=>old.map(o=>o.id===p.id?{...o,target:x.source,translation:o.translations[x.source]}:o));}} // guest answered before the chip was tapped: show the earlier sentence in that language
        const row={id:Date.now(),actor:isGuest?'guest':'staff',source:x.source,target:x.target,transcript:x.transcript,translation:x.translation,voice:x.voice,audio:x.audio?fromBase64(x.audio):null,took:'Text '+secs(Date.now()-t0)+(x.timing?.ai_ms?' (AI '+secs(x.timing.ai_ms)+')':'')};
        setRows(old=>[row,...old].slice(0,6));
        return row;
      }
      const note=(row,extra)=>setRows(old=>old.map(o=>o.id===row.id?{...o,...extra}:o));
      try{
        if(blob.size<1200){listen(true);return;}
        const fd=new FormData();const ext=blob.type.includes('mp4')?'m4a':blob.type.includes('ogg')?'ogg':'webm';
        fd.append('audio',blob,'conversation.'+ext);fd.append('actor','auto');fd.append('speak','1');fd.append('stream','1');fd.append('speak_tamil',r.tamilVoice?'1':'0');fd.append('voice',r.voicePref||'auto');if(voiceHint)fd.append('voice_hint',voiceHint);
        if(r.guest)fd.append('guest_language',r.guest);
        const response=await request(fd);if(epoch!==r.epoch)return;
        if(!(response.headers.get('content-type')||'').includes('ndjson')||!response.body){
          // Server function not yet updated: whole reply at once (text + mp3).
          const x=await response.json();if(epoch!==r.epoch)return;
          const row=accept(x);if(!row){listen(true);return;}
          if(row.audio){note(row,{took:row.took+' · Voice '+secs(Date.now()-t0)});try{await playBytes(row.audio,epoch);}catch(_){if(epoch===r.epoch)setStatus('Voice unavailable. Please read the translation.');}}
          if(epoch===r.epoch&&r.live)listen();return;
        }
        // Streamed reply: line 1 = text (shown now), then voice chunks played as they arrive.
        const reader=response.body.getReader(),dec=new TextDecoder();let buf='',row,first=true,player=null,voiceAt=0;
        for(;;){
          const {done,value}=await reader.read();
          if(epoch!==r.epoch){reader.cancel().catch(()=>{});return;}
          if(value)buf+=dec.decode(value,{stream:true});
          let k;
          while((k=buf.indexOf('\n'))>=0){
            const text=buf.slice(0,k);buf=buf.slice(k+1);if(!text.trim())continue;const m=JSON.parse(text);
            if(first){first=false;row=accept(m);if(!row){reader.cancel().catch(()=>{});listen(true);return;}if(m.audio_stream){setStatus('Translation ready — voice starting…');await r.context?.resume();}continue;}
            if(m.pcm){if(!player)player=pcmPlayer(epoch,()=>{voiceAt=Date.now();setPhase('playing');setStatus('Speaking the translation…');});player.push(m.pcm);}
            if(m.audio_error)setStatus('Voice unavailable. Please read the translation.');
          }
          if(done)break;
        }
        if(player){if(voiceAt)note(row,{took:row.took+' · Voice '+secs(voiceAt-t0)});await player.finish();if(epoch!==r.epoch)return;note(row,{pcm:player.bytes()});}
        if(epoch===r.epoch&&r.live)listen();
      }catch(e){
        if(epoch!==r.epoch)return;
        if(e.name==='AbortError'){r.failures++;setStatus('That took too long. Listening again…');}
        else if(e.status===422){
          r.notCaught=(r.notCaught||0)+1;
          if(r.notCaught>=3){
            const steps=PAUSES.map(p=>p[0]),cur=r.pauseMs||1200,next=steps.find(v=>v>cur);
            ttgFault('ttg-not-caught','Several sentences in a row were not understood',{in_a_row:r.notCaught,wait_ms:cur});
            if(next){setPause(next);ttgFault('ttg-auto-pause','Wait after speaker stops raised automatically',{from_ms:cur,to_ms:next});r.notCaught=0;setStatus('Speech was being cut — wait time raised to '+(next/1000)+' s automatically. Listening again…');}
            else setStatus((e.message||'Did not catch that.')+' Listening again…');
          }else setStatus((e.message||'Did not catch that.')+' Listening again…');
        }
        else{r.failures++;ttgFault('ttg-error',String(e.message||'Translation failed').slice(0,200),{status:e.status||0});if([401,403,404,429].includes(e.status)||r.failures>=3){stopAll(e.message||'Translation failed. Tap Start conversation to try again.');return;}setStatus((e.message||'Translation failed.')+' Listening again…');}
        if(r.live)listen(true);
      }
    }
    // ================= ⚡ LIVE MODE (Gemini Live Translate) =================
    const LIVE_WS='wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=';
    // Language from Google's code OR name ("bn", "bn-IN", "Bengali", "ben" …); '' when unknown.
    const LANG_NAMES={bengali:'bn',bangla:'bn',ben:'bn',hindi:'hi',hin:'hi',urdu:'hi',urd:'hi',ur:'hi',tamil:'ta',tam:'ta',english:'en',eng:'en',malayalam:'ml',mal:'ml',telugu:'te',tel:'te',kannada:'kn',kan:'kn'};
    const KNOWN=['ta','en','hi','bn','ml','te','kn'];
    const lang2=c=>{const v=String(c||'').trim().toLowerCase();if(!v)return '';if(LANG_NAMES[v])return LANG_NAMES[v];const first=v.split(/[-_\s]/)[0];if(LANG_NAMES[first])return LANG_NAMES[first];return KNOWN.includes(first)?first:'';};
    // Language from the letters of the transcript (each of these languages has its own script).
    function scriptLang(text){
      const t=String(text||'');let c={ta:0,hi:0,bn:0,ml:0,te:0,kn:0,en:0};
      for(const ch of t){const u=ch.codePointAt(0);
        if(u>=0x0B80&&u<=0x0BFF)c.ta++;else if(u>=0x0900&&u<=0x097F)c.hi++;else if(u>=0x0980&&u<=0x09FF)c.bn++;
        else if(u>=0x0D00&&u<=0x0D7F)c.ml++;else if(u>=0x0C00&&u<=0x0C7F)c.te++;else if(u>=0x0C80&&u<=0x0CFF)c.kn++;
        else if(u>=0x0600&&u<=0x06FF)c.hi++; // Urdu script → Hindi (spoken Hindi / Urdu are nearly the same)
        else if((u>=65&&u<=90)||(u>=97&&u<=122))c.en++;}
      const best=Object.entries(c).sort((a,b)=>b[1]-a[1])[0];return best[1]>=2?best[0]:'';
    }
    function b64FromBytes(u8){let s='';for(let i=0;i<u8.length;i+=32768)s+=String.fromCharCode.apply(null,u8.subarray(i,i+32768));return btoa(s);}
    // Microphone samples → 16 kHz 16-bit PCM (resampled if the phone could not open a 16 kHz capture).
    function toPcm16(input,rate){
      const ratio=rate/16000,n=Math.floor(input.length/ratio),out=new Int16Array(n);
      for(let i=0;i<n;i++){const x=i*ratio,j=Math.floor(x),f=x-j,v=(input[j]||0)*(1-f)+(input[j+1]||input[j]||0)*f;out[i]=Math.max(-32768,Math.min(32767,Math.round(v*32767)));}
      return out;
    }
    // Continuous 24 kHz PCM player for one live session.
    // Continuous 24 kHz PCM player for one live session. Google also streams near-silent audio between sentences: that is not
    // played (except short gaps inside speech) and does not count as speaking.
    function livePlayer(){
      const r=run.current,ctx=r.context;let t=0,audibleEnd=0,lastAudible=0;const srcs=[];
      const rmsOf=bytes=>{const n=bytes.length>>1;if(!n)return 0;const dv=new DataView(bytes.buffer,bytes.byteOffset,n*2);let sum=0;for(let i=0;i<n;i+=2){const v=dv.getInt16(i*2,true)/32768;sum+=v*v;}return Math.sqrt(sum/Math.ceil(n/2));};
      return {
        push(b64){
          if(!ctx)return false;let bytes=fromBase64Bytes(b64);if(bytes.length%2)bytes=bytes.slice(0,-1);if(bytes.length<2)return false;
          const audible=rmsOf(bytes)>=.008,nowMs=Date.now();
          if(audible)lastAudible=nowMs;else if(nowMs-lastAudible>600)return false; // silence outside speech: skip
          const src=ctx.createBufferSource();src.buffer=pcmBuffer(bytes);src.connect(ctx.destination);
          const now=ctx.currentTime;if(t<now+.03)t=now+.12;src.start(t);t+=src.buffer.duration;if(audible)audibleEnd=t;
          srcs.push(src);src.onended=()=>{const k=srcs.indexOf(src);if(k>=0)srcs.splice(k,1);};
          return audible;
        },
        clear(){srcs.splice(0).forEach(x=>{try{x.stop()}catch(_){}});t=0;audibleEnd=0;},
        busy(){return !!ctx&&ctx.currentTime<audibleEnd+((run.current.L&&run.current.L.tail)||.3);} // really speaking (+ tail; longer after echo was detected)
      };
    }
    async function liveToken(){const response=await request({mode:'live_token'});const x=await response.json();if(!x.token)throw Error('Live mode is not available right now.');return x;}
    function openLiveSession(key,target){
      const r=run.current,L=r.L;
      return new Promise((resolve,reject)=>{
        const ws=new WebSocket(LIVE_WS+encodeURIComponent(L.token));
        const s={ws,key,target,ready:false,inText:'',outText:'',inLang:'',player:livePlayer()};
        const timer=setTimeout(()=>{if(!s.ready){try{ws.close()}catch(_){}reject(Error('Live connection timed out.'));}},10000);
        ws.onopen=()=>ws.send(JSON.stringify({setup:{model:'models/'+L.model,generationConfig:{responseModalities:['AUDIO'],translationConfig:{targetLanguageCode:target,echoTargetLanguage:false}},inputAudioTranscription:{},outputAudioTranscription:{}}}));
        ws.onmessage=async ev=>{
          let text;try{text=typeof ev.data==='string'?ev.data:ev.data instanceof Blob?await ev.data.text():new TextDecoder().decode(ev.data);}catch(_){return;}
          let m;try{m=JSON.parse(text);}catch(_){return;}
          if(m.setupComplete&&!s.ready){s.ready=true;clearTimeout(timer);resolve(s);return;}
          if(L.sessions[key]===s)onLiveMessage(s,m);
        };
        ws.onerror=()=>{};
        ws.onclose=ev=>{clearTimeout(timer);s.ready=false;if(!s.opened){reject(Error((ev&&ev.reason)||'Live connection closed.'));return;}if(L.sessions[key]===s)onLiveClosed(s);};
        s.markOpen=()=>{s.opened=true;};
      }).then(s=>{s.markOpen();L.sessions[key]=s;return s;});
    }
    function closeLiveSession(key){const L=run.current.L;const s=L&&L.sessions[key];if(!s)return;delete L.sessions[key];s.player.clear();try{s.ws.close();}catch(_){}}
    function showLiveNow(){const L=run.current.L;if(!L)return;const a=L.sessions.A,b=L.sessions.B;const s=[a,b].find(x=>x&&(x.inText||x.outText));setLiveNow(s?{who:s.key==='A'?'guest':'staff',source:s.inLang,target:s.target,original:s.inText,translation:s.outText}:null);}
    // Same words? (≥ 3 words and ≥ 60 % of what was heard appears in the other translator's output)
    function isEcho(heard,said){
      const words=t=>String(t||'').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(w=>w.length>1);
      const h=words(heard),s=new Set(words(said));if(h.length<3||!s.size)return false;
      return h.filter(w=>s.has(w)).length/h.length>=.6;
    }
    function onLiveMessage(s,m){
      const r=run.current,L=r.L,sc=m.serverContent;
      if(m.goAway){refreshLive(s.key);return;}
      if(!sc)return;
      if(sc.interrupted)s.player.clear();
      if(s.suppressUntil&&Date.now()<s.suppressUntil){if(sc.inputTranscription||sc.outputTranscription||sc.modelTurn){s.inText='';s.outText='';}return;} // translating an echo — drop it
      for(const part of (sc.modelTurn&&sc.modelTurn.parts)||[]){
        const d=part.inlineData||part.inline_data;
        if(d&&d.data&&!(s.key==='A'&&!r.tamilVoice)){if(s.player.push(d.data)){setPhase('playing');L.lastActivity=Date.now();L.speechMs=0;}}
      }
      if(sc.inputTranscription){
        const it=sc.inputTranscription;
        // Google's language field (code or name) → else the script of everything heard so far in this sentence.
        const code=lang2(it.languageCode||it.language_code||it.language)||scriptLang(s.inText+(it.text||''));
        if(code)onLiveLanguage(s,code);
        // Only speech that this session translates is shown (Tamil into A / guest language into B is silent by design).
        if(it.text&&code!==s.target){s.inText+=it.text;if(code)s.inLang=code;}
        if(it.text&&it.text.trim()){L.lastActivity=Date.now();L.speechMs=0;}
        // Echo: this translator is hearing the OTHER translator's recent output again (speaker → microphone).
        const other=L.sessions[s.key==='A'?'B':'A'];
        if(other&&s.inText&&isEcho(s.inText,(other.outText||'')+' '+(Date.now()-(other.lastOutAt||0)<10000?other.lastOut||'':''))){
          L.tail=Math.min(1.5,(L.tail||.3)+.4);s.player.clear();s.inText='';s.outText='';clearTimeout(s.commitTimer);s.suppressUntil=Date.now()+3000; // ignore this translator's translation of the echo
          ttgFault('ttg-echo','Translation heard again by the microphone — muting made stronger',{tail_s:L.tail});
          setStatus('⚡ Echo noticed — adjusted automatically. Lower the phone volume a little if it continues.');
          return;
        }
      }
      if(sc.outputTranscription&&sc.outputTranscription.text){s.outText+=sc.outputTranscription.text;L.lastActivity=Date.now();L.speechMs=0;clearTimeout(s.commitTimer);s.commitTimer=setTimeout(()=>commitLive(s),1600);} // Google may never send turnComplete: finish the sentence after a 1.6 s pause in the translation
      if(s.key==='A'&&s.outText&&!r.guest&&!r.pending){ // still unknown after the guest spoke → ask now, don't wait for the sentence end
        const guess=scriptLang(s.inText);
        if(GUEST_CODES.includes(guess))onLiveLanguage(s,guess);
        else{setPendingRow({live:true});setStatus('Which language does the guest speak? Tap it below so your reply can be translated.');}
      }
      showLiveNow();
      if(sc.turnComplete||sc.generationComplete)commitLive(s);
    }
    function commitLive(s){
      const r=run.current;clearTimeout(s.commitTimer);if(!r.L||r.L.sessions[s.key]!==s)return;
      {
        if(s.outText.trim()){
          const row={id:Date.now()+Math.random(),actor:s.key==='A'?'guest':'staff',source:s.inLang||(s.key==='A'?r.guest:'ta'),target:s.target,transcript:s.inText.trim()||'…',translation:s.outText.trim(),took:'Live'};
          setRows(old=>[row,...old].slice(0,6));s.lastOut=s.outText;s.lastOutAt=Date.now();
          // Guest spoke but Google did not report which language: ask once so staff replies can be translated back.
          if(s.key==='A'&&!r.guest&&!r.pending){setPendingRow({live:true});setStatus('Which language does the guest speak? Tap it below.');}
        }
        s.inText='';s.outText='';showLiveNow();
        const settle=()=>{const LL=run.current.L;if(!LL)return;if(Object.values(LL.sessions).some(x=>x.player.busy()))setTimeout(settle,250);else setPhase('listening');};setTimeout(settle,300);
      }
    }
    // Language heard by session A decides the guest language (and re-targets session B); Tamil first → ask once.
    function onLiveLanguage(s,code){
      const r=run.current,L=r.L;
      if(s.key!=='A')return;
      if(GUEST_CODES.includes(code)&&code!==r.guest){setGuest(code);setPendingRow(null);openGuestSession(code,false);return;}
      if(code==='ta'&&!r.guest&&!r.pending){if(!L.staffSince)L.staffSince=Date.now();setPendingRow({live:true});setStatus('Which language does the guest speak? Tap it below — what you said is translated straight away.');}
    }
    async function openGuestSession(code,replay){
      const r=run.current,L=r.L;if(!L)return;
      const old=L.sessions.B;if(old&&old.target===code)return;
      closeLiveSession('B');
      try{
        const s=await openLiveSession('B',code);
        if(replay&&L.ring.length){ // staff spoke first: send what they already said (last 12 s), then continue live
          // Google reports the language only AFTER the sentence, so go back 6 s before that (8 s if unknown); guest-language parts stay silent in B.
          const from=L.staffSince?L.staffSince-6000:Date.now()-8000;
          for(const c of L.ring)if(c.t>=from&&s.ws.readyState===1)s.ws.send(JSON.stringify({realtimeInput:{audio:{data:c.b64,mimeType:'audio/pcm;rate=16000'}}}));
        }
        L.staffSince=0;
      }catch(e){liveFailed(e);}
    }
    async function refreshLive(key){ // token / connection renewal (Google asks to reconnect about every 10 min)
      const r=run.current,L=r.L;if(!L||!r.live)return;
      try{if(Date.now()-L.tokenAt>20*60000){const t=await liveToken();L.token=t.token;L.model=t.model;L.tokenAt=Date.now();}
        const target=key==='A'?'ta':r.guest;closeLiveSession(key);if(target)await openLiveSession(key,target);}
      catch(e){liveFailed(e);}
    }
    function onLiveClosed(s){const r=run.current;if(!r.live||!r.L)return;ttgFault('ttg-live-drop','Live connection dropped — reconnecting',{translator:s.key==='A'?'to Tamil':'to guest language',drops:(r.L.drops||0)+1});if((r.L.drops=(r.L.drops||0)+1)>3){liveFailed(Error('Live connection keeps dropping.'));return;}refreshLive(s.key);}
    function stopLive(){
      const r=run.current,L=r.L;if(!L)return;r.L=null;r.liveMode=false;setLiveOn(false);setLiveNow(null);
      Object.keys(L.sessions).forEach(k=>{const s=L.sessions[k];s.player.clear();try{s.ws.close();}catch(_){}});
      if(L.proc){L.proc.onaudioprocess=null;try{L.proc.disconnect();}catch(_){}}
      if(L.src)try{L.src.disconnect();}catch(_){}
      if(L.capCtx)L.capCtx.close().catch(()=>{});
    }
    // Live failed (not available for this account, network, …): keep the conversation going in Standard mode.
    const liveReason=e=>{const m=String((e&&e.message)||'');return '⚡ '+(/^Live/i.test(m)?m:'Live mode is not available now'+(m?' ('+m+')':'.'));};
    function liveFailed(e){
      const r=run.current;if(!r.L)return;ttgFault('ttg-live-fallback',String((e&&e.message)||'Live failed').slice(0,200));stopLive();
      if(!r.live)return;
      setStatus(liveReason(e)+' Continuing in Standard mode.');
      if(r.context&&r.stream&&!r.analyser){const analyser=r.context.createAnalyser();analyser.fftSize=2048;const input=r.context.createMediaStreamSource(r.stream);input.connect(analyser);r.input=input;r.analyser=analyser;}
      listen(true);
    }
    async function startLive(){
      const r=run.current;setStatus('Connecting ⚡ Live translation…');
      const t=await liveToken();
      const L=r.L={token:t.token,model:t.model,tokenAt:Date.now(),sessions:{},ring:[],staffSince:0,drops:0,tail:.3,lastActivity:Date.now(),speechMs:0,stalls:[]};
      r.liveMode=true;
      const sessions=[openLiveSession('A','ta')];
      if(r.guest)sessions.push(openLiveSession('B',r.guest));
      await Promise.all(sessions);
      // Microphone → 16 kHz PCM chunks (~128 ms) → both sessions; each muted while the OTHER session is speaking its output.
      let cap;try{cap=new (window.AudioContext||window.webkitAudioContext)({sampleRate:16000});}catch(_){cap=new (window.AudioContext||window.webkitAudioContext)();}
      L.capCtx=cap;await cap.resume();
      const src=cap.createMediaStreamSource(r.stream),proc=cap.createScriptProcessor(cap.sampleRate>20000?4096:2048,1,1);
      L.src=src;L.proc=proc;src.connect(proc);proc.connect(cap.destination);
      let lastLevel=0;const silence16=new Int16Array(2048);
      proc.onaudioprocess=e=>{
        const LL=run.current.L;if(!LL)return;
        const input=e.inputBuffer.getChannelData(0),pcm=toPcm16(input,cap.sampleRate);
        const now=Date.now();
        // Missed speech: someone has been talking (~6 s in total) but Live has produced nothing for 12 s → restart both.
        {let e2=0;for(let i=0;i<input.length;i+=8)e2+=input[i]*input[i];const loud=Math.sqrt(e2/(input.length/8))>.03;
         if(loud)LL.speechMs+=input.length/cap.sampleRate*1000;
         if(LL.speechMs>6000&&now-LL.lastActivity>12000){
           LL.stalls=LL.stalls.filter(t=>now-t<5*60000);LL.stalls.push(now);LL.speechMs=0;LL.lastActivity=now;
           ttgFault('ttg-live-stall','People were speaking but Live heard nothing — restarted automatically',{stalls_in_5_min:LL.stalls.length});
           if(LL.stalls.length>=2){liveFailed(Error('Live kept missing speech'));return;}
           setStatus('⚡ Speech was not being picked up — reconnected automatically.');refreshLive('A');if(LL.sessions.B)refreshLive('B');
         }}
        if(now-lastLevel>120){lastLevel=now;let sum=0;for(let i=0;i<input.length;i+=4)sum+=input[i]*input[i];setLevel(Math.min(1,Math.sqrt(sum/(input.length/4))*12));}
        const b64=b64FromBytes(new Uint8Array(pcm.buffer));
        LL.ring.push({t:now,b64});while(LL.ring.length&&now-LL.ring[0].t>12000)LL.ring.shift();
        const quiet=b64FromBytes(new Uint8Array(silence16.buffer,0,pcm.length*2));
        const A=LL.sessions.A,B=LL.sessions.B;
        const aBusy=!!(A&&A.player.busy()),bBusy=!!(B&&B.player.busy());
        for(const [s,otherBusy,selfBusy] of [[A,bBusy,aBusy],[B,aBusy,bBusy]]){
          if(!s||!s.ready||s.ws.readyState!==1)continue;
          const mute=otherBusy&&!selfBusy; // mute only while the OTHER translator is really speaking — never both at once
          s.ws.send(JSON.stringify({realtimeInput:{audio:{data:mute?quiet:b64,mimeType:'audio/pcm;rate=16000'}}}));
        }
      };
      setLiveOn(true);setPhase('listening');
      setStatus(r.guest?'⚡ Live — speak naturally. The translation follows a moment behind.':'⚡ Live — speak naturally. The guest’s language is found when they speak.');
    }
    async function start(){
      const r=run.current;if(r.live||!consent)return;
      if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){setStatus('Please use a current Chrome or Safari browser with microphone access.');return;}
      unlockAudio();warmUp();r.epoch++;r.failures=0;setStatus('Opening microphone…');
      try{
        const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
        r.stream=stream;r.live=true;setLive(true);
        if(mode==='live'){
          try{await startLive();return;}
          catch(e){if(!r.live)return;stopLive();ttgFault('ttg-live-fallback','Live could not start: '+String((e&&e.message)||'error').slice(0,180));setStatus(liveReason(e)+' Using Standard mode.');}
        }
        if(r.context){const analyser=r.context.createAnalyser();analyser.fftSize=2048;const input=r.context.createMediaStreamSource(stream);input.connect(analyser);r.input=input;r.analyser=analyser;}
        listen(mode==='live');
      }catch(e){ttgFault('ttg-mic','Microphone could not be opened: '+(e&&e.name||'error'));stopAll(e.name==='NotAllowedError'?'Microphone access was denied. Allow it in browser settings and try again.':'Could not open the microphone. Please try again.');}
    }
    // Staff spoke first: one tap chooses the guest's language and the SAME sentence is spoken (no repeat).
    async function chooseLanguage(code,row){
      const r=run.current;
      if(row&&row.live){setGuest(code);setPendingRow(null);setStatus('⚡ Live — translating into '+labels[code]+'…');openGuestSession(code,true);return;}
      setGuest(code);setPendingRow(null);
      setRows(old=>old.map(o=>o.id===row.id?{...o,target:code,translation:o.translations[code]}:o));
      const text=row.translations[code];
      stopListening();const epoch=++r.epoch;setPhase('translating');setStatus('Preparing the voice…');
      try{const bytes=await speechFor(text,code,row.voice);if(epoch!==r.epoch)return;setRows(old=>old.map(o=>o.id===row.id?{...o,audio:bytes}:o));await playBytes(bytes,epoch);}
      catch(_){if(epoch===r.epoch)setStatus('Voice unavailable. Please show the translation to the guest.');}
      if(epoch===r.epoch){if(r.live)listen();else{setPhase('idle');setStatus('Tap Start conversation to continue.');}}
    }
    async function replay(row){
      const r=run.current;stopListening();stopPlayback();const epoch=++r.epoch;unlockAudio();
      try{if(row.pcm){await playPcm(row.pcm,epoch);if(epoch===r.epoch){if(r.live)listen();else{setPhase('idle');setStatus('Tap Start conversation to continue.');}}return;}let bytes=row.audio;if(!bytes){setPhase('translating');setStatus('Preparing the voice…');bytes=await speechFor(row.translation,row.target,row.voice);if(epoch!==r.epoch)return;setRows(old=>old.map(o=>o.id===row.id?{...o,audio:bytes}:o));}await playBytes(bytes,epoch);}
      catch(_){if(epoch===r.epoch)setStatus('Voice unavailable. The translated text is shown below.');}
      if(epoch===r.epoch){if(r.live)listen();else{setPhase('idle');setStatus('Tap Start conversation to continue.');}}
    }
    function newGuest(){stopAll('New guest. Tick the consent box, then tap Start conversation.');setGuest('');setRows([]);setPendingRow(null);setConsent(false);}

    const chip=(code,text)=>h('button',{key:code||'auto',type:'button',className:'ttg-chip'+(guest===code?' on':''),'aria-pressed':guest===code,onClick:()=>{setGuest(code);if(code&&pending)chooseLanguage(code,pending);else if(code&&run.current.L)openGuestSession(code,!run.current.L.sessions.B);}},text);
    const phaseText=liveOn&&phase!=='playing'?'⚡ Live':{idle:'Not listening',listening:'Listening',hearing:'Hearing',translating:'Translating',playing:'Speaking'}[phase];
    return h('section',{className:'talk-to-guest',style:{maxWidth:960,margin:'0 auto',padding:16,color:'#5d1039'}},
      h('style',null,'.talk-to-guest *{box-sizing:border-box}.ttg-main{width:100%;min-height:72px;border:0;border-radius:16px;color:#fff;background:#087667;font-family:inherit;font-size:21px;font-weight:700;cursor:pointer;padding:14px}.ttg-main.stop{background:#b01264}.ttg-main:disabled{opacity:.45;cursor:default}.talk-to-guest button:focus-visible{outline:3px solid #187c70;outline-offset:3px}.ttg-secondary{padding:10px 16px;border:1px solid #d8b9ca;border-radius:12px;background:#fff;color:#5d1039;cursor:pointer;min-height:44px;font-family:inherit}.ttg-secondary:disabled{opacity:.45}.ttg-chips{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.ttg-chip{min-height:44px;padding:8px 16px;border-radius:999px;border:1px solid #d8b9ca;background:#fff;color:#5d1039;font-size:16px;cursor:pointer;font-family:inherit}.ttg-chip.on{background:#5d1039;color:#fff;border-color:#5d1039}.ttg-big{font-size:20px;min-height:56px;padding:10px 22px}.ttg-meter{height:8px;border-radius:8px;background:#eadbe3;overflow:hidden;margin-top:10px}.ttg-meter>i{display:block;height:100%;background:#087667;transition:width .1s}.ttg-dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:8px;background:#bbb}.ttg-dot.live{background:#087667;animation:ttgp 1.2s infinite}@keyframes ttgp{50%{opacity:.35}}@media(max-width:600px){.talk-to-guest{padding:8px!important}}'),
      h('div',{style:{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'center'}},
        h('div',null,h('h1',{style:{margin:'0 0 6px',fontSize:30}},'Talk to Guest'),h('p',{style:{margin:'0 0 16px',color:'#78636f'}},'Tap Start once, then just talk. Staff speak Tamil. Guest: English, Hindi, Bangla, Malayalam, Telugu or Kannada.')),
        h('button',{type:'button',className:'ttg-secondary',onClick:newGuest},'New guest / Clear')),
      h('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',margin:'0 0 12px'}},h('strong',null,'Mode:'),
        h('button',{type:'button',className:'ttg-chip'+(mode==='live'?' on':''),'aria-pressed':mode==='live',disabled:live,onClick:()=>setMode('live')},'⚡ Live (fastest)'),
        h('button',{type:'button',className:'ttg-chip'+(mode==='standard'?' on':''),'aria-pressed':mode==='standard',disabled:live,onClick:()=>setMode('standard')},'Standard'),
        h('span',{style:{fontSize:13,color:'#78636f'}},mode==='live'?'Translates while the person speaks, in a voice like theirs. Preview service.':'Translates after the speaker stops.')),
      h('div',{style:{...box,background:'#fff6fa',marginBottom:14}},
        h('strong',null,'Guest language'),
        h('div',{className:'ttg-chips'},chip('','Auto-detect'),...GUEST_LANGS.map(([c,t])=>chip(c,t))),
        h('p',{style:{margin:'0 0 10px',lineHeight:1.6,fontSize:14}},guest?'Your Tamil is translated into '+labels[guest]+'. If the guest speaks another listed language, it switches automatically.':'Leave on Auto-detect: the guest’s language is found when they speak. If staff speak first, you will be asked to tap the language once.'),
        h('label',{style:{display:'flex',gap:10,alignItems:'flex-start',lineHeight:1.6}},h('input',{type:'checkbox',checked:consent,disabled:live,onChange:e=>setConsent(e.target.checked),style:{marginTop:6}}),
          h('span',null,'Guest agrees to send this conversation audio and text to Samara’s AI services for translation.',h('span',{lang:'bn',style:{display:'block',fontSize:15}},'বাংলা: অনুবাদের জন্য এই কথোপকথনের অডিও ও লেখা সামারার AI পরিষেবায় পাঠাতে আমি রাজি।'),h('span',{lang:'hi',style:{display:'block',fontSize:15}},'हिन्दी: अनुवाद के लिए इस बातचीत की आवाज़ और लिखित बातें सामरा की AI सेवा को भेजने के लिए मैं सहमत हूँ।'),h('span',{lang:'ml',style:{display:'block',fontSize:15}},'മലയാളം: വിവർത്തനത്തിനായി ഈ സംഭാഷണത്തിന്റെ ശബ്ദവും എഴുത്തും സമാറയുടെ AI സേവനത്തിലേക്ക് അയയ്ക്കാൻ ഞാൻ സമ്മതിക്കുന്നു.'),h('span',{lang:'te',style:{display:'block',fontSize:15}},'తెలుగు: అనువాదం కోసం ఈ సంభాషణ యొక్క ఆడియో మరియు వచనాన్ని సమారా AI సేవకు పంపడానికి నేను అంగీకరిస్తున్నాను.'),h('span',{lang:'kn',style:{display:'block',fontSize:15}},'ಕನ್ನಡ: ಅನುವಾದಕ್ಕಾಗಿ ಈ ಸಂಭಾಷಣೆಯ ಧ್ವನಿ ಮತ್ತು ಬರಹವನ್ನು ಸಮಾರಾ AI ಸೇವೆಗೆ ಕಳುಹಿಸಲು ನಾನು ಒಪ್ಪುತ್ತೇನೆ.')))),
      h('button',{type:'button',className:'ttg-main'+(live?' stop':''),disabled:!live&&!consent,onClick:()=>live?stopAll('Conversation stopped.'):start()},live?'■ Stop conversation':'▶ Start conversation'),
      h('div',{role:'status','aria-live':'polite',style:{...box,background:'#f5fbf9',margin:'14px 0',lineHeight:1.6}},
        h('div',null,h('span',{className:'ttg-dot'+(live?' live':'')}),h('strong',null,phaseText),' · ',status),
        live&&h('div',{className:'ttg-meter','aria-hidden':true},h('i',{style:{width:Math.round(level*100)+'%'}}))),
      liveOn&&liveNow&&h('div',{style:{...box,border:'2px solid #087667',marginBottom:14}},
        h('strong',null,liveNow.who==='guest'?'Guest → Staff (live)':'Staff → Guest (live)'),
        liveNow.original&&h('p',{lang:liveNow.source,style:{fontSize:18,lineHeight:1.6,margin:'6px 0'}},liveNow.original),
        liveNow.translation&&h('p',{lang:liveNow.target,style:{fontSize:22,lineHeight:1.6,margin:'6px 0',color:'#087667'}},liveNow.translation)),
      !liveOn&&live&&phase==='hearing'&&h('button',{type:'button',className:'ttg-secondary',style:{width:'100%',marginBottom:14,fontSize:18,minHeight:52},onClick:()=>run.current.finishNow&&run.current.finishNow()},'✓ Translate now'),
      pending&&h('div',{style:{...box,border:'2px solid #b01264',marginBottom:14}},
        h('strong',null,'Which language does the guest speak?'),
        h('div',{className:'ttg-chips'},...GUEST_LANGS.map(([c,t])=>h('button',{key:c,type:'button',className:'ttg-chip ttg-big',onClick:()=>chooseLanguage(c,pending)},t))),
        h('p',{style:{margin:0,fontSize:13,color:'#78636f'}},pending&&pending.live?'What you just said is translated straight away after the tap.':'Your sentence is already translated — it will be spoken straight away.')),
      (mode!=='live'||(live&&!liveOn))&&h('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',fontSize:14,margin:'0 0 8px'}},h('span',null,'Wait after speaker stops:'),...PAUSES.map(([v,t])=>h('button',{key:v,type:'button',className:'ttg-chip'+(pauseMs===v?' on':''),'aria-pressed':pauseMs===v,onClick:()=>setPause(v)},t))),
      (mode!=='live'||(live&&!liveOn))&&h('div',{style:{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',fontSize:14,margin:'0 0 8px'}},h('span',null,'Voice:'),...[['auto','Auto (match speaker)'],['female','Female'],['male','Male']].map(([v,t])=>h('button',{key:v,type:'button',className:'ttg-chip'+(voicePref===v?' on':''),'aria-pressed':voicePref===v,onClick:()=>setVoicePref(v)},t))),
      h('label',{style:{display:'flex',gap:8,alignItems:'center',fontSize:14,margin:'0 0 10px'}},h('input',{type:'checkbox',checked:tamilVoice,onChange:e=>setTamilVoice(e.target.checked)}),'Read the Tamil translation aloud'),
      h('p',{style:{fontSize:13,lineHeight:1.6,color:'#78636f'}},(mode==='live'?'⚡ Live: speak naturally — the translation follows a moment behind, in a voice like the speaker’s.':'Speak normally — it translates when the speaker stops (or tap Translate now).')+' Keep the phone between you, away from TV noise. Internet required. Voice is AI-generated. Confirm important details with the guest.'),
      rows.length?h('div',null,rows.map(row=>h('article',{key:row.id,style:{...box,marginBottom:12}},
        h('strong',null,row.actor==='guest'?'Guest → Staff':'Staff → Guest'),
        h('p',{style:{fontSize:13,color:'#78636f'}},'Original · '+(labels[row.source]||row.source)),
        h('p',{lang:row.source,style:{fontSize:20,lineHeight:1.7,overflowWrap:'anywhere'}},row.transcript),
        h('hr',{style:{border:0,borderTop:'1px solid #eee'}}),
        row.translation?h(React.Fragment,null,
          h('p',{style:{fontSize:13,color:'#78636f'}},'Translation · '+labels[row.target]+(row.voice?' · '+(row.voice==='male'?'male voice':'female voice'):'')+(row.took?' · '+row.took:'')),
          h('p',{lang:row.target,style:{fontSize:22,lineHeight:1.7,overflowWrap:'anywhere'}},row.translation),
          h('button',{type:'button',className:'ttg-secondary',disabled:phase==='translating',onClick:()=>replay(row)},'▶ Listen again'))
        :h('p',{style:{fontSize:15,color:'#b01264'}},'Tap the guest’s language above to hear this sentence.')
      ))):h('div',{style:{...box,textAlign:'center',color:'#78636f',padding:30}},'Your conversation will appear here. No conversation is saved in the ERP.')
    );
  }
