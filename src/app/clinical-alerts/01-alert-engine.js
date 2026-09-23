  function showClinicalAlertPopup({
    heading='CLINICAL ALERT',
    patient='Patient',
    room='',
    alertType='Clinical task due',
    details='',
    dueText='Due now',
    message='Please attend and record immediately.',
    priority='Routine',
    test=false
  }={}){
    try{
      document.querySelectorAll('.samara-clinical-alert-overlay').forEach(node=>node.remove());
      const overlay=document.createElement('div');
      overlay.className='samara-clinical-alert-overlay';
      overlay.setAttribute('role','alert');
      overlay.setAttribute('aria-live','assertive');
      Object.assign(overlay.style,{
        position:'fixed',left:'0',right:'0',top:'0',zIndex:'2147483647',
        display:'flex',justifyContent:'center',alignItems:'flex-start',
        padding:'max(12px, env(safe-area-inset-top)) 10px 10px',pointerEvents:'none'
      });

      const card=document.createElement('div');
      card.className='samara-clinical-alert-card';
      Object.assign(card.style,{
        width:'min(1080px, calc(100vw - 24px))',boxSizing:'border-box',
        display:'grid',gridTemplateColumns:'74px minmax(0,1fr) 78px',alignItems:'center',
        gap:'18px',minHeight:'160px',padding:'22px 24px',borderRadius:'22px',
        background:'linear-gradient(118deg,#7b1747 0%,#a80d4f 48%,#c41465 100%)',
        color:'#fff',border:'2px solid rgba(255,255,255,.55)',
        boxShadow:'0 20px 56px rgba(99,13,55,.34)',pointerEvents:'auto',
        fontFamily:"Inter,system-ui,-apple-system,'Segoe UI',sans-serif"
      });

      const icon=document.createElement('div');
      icon.textContent='🔔';
      Object.assign(icon.style,{width:'70px',height:'70px',display:'flex',alignItems:'center',justifyContent:'center',borderRadius:'50%',background:'rgba(255,255,255,.16)',fontSize:'35px'});

      const body=document.createElement('div');
      Object.assign(body.style,{display:'grid',gap:'12px',minWidth:'0'});
      const head=document.createElement('div');
      Object.assign(head.style,{display:'flex',alignItems:'center',gap:'10px',flexWrap:'wrap'});
      const title=document.createElement('strong');
      title.textContent=heading;
      Object.assign(title.style,{fontSize:'25px',lineHeight:'1.08',fontWeight:'950',letterSpacing:'.2px',color:'#fff'});
      head.appendChild(title);
      if(test){
        const testPill=document.createElement('span');testPill.textContent='TEST';
        Object.assign(testPill.style,{fontSize:'11px',fontWeight:'950',padding:'5px 9px',borderRadius:'999px',background:'#ffe0ee',color:'#7b1747'});
        head.appendChild(testPill);
      }
      const grid=document.createElement('div');
      grid.className='samara-clinical-alert-detail-grid';
      Object.assign(grid.style,{display:'grid',gridTemplateColumns:'minmax(220px,1fr) minmax(280px,1.35fr)',gap:'8px 28px',fontSize:'15px',lineHeight:'1.35',fontWeight:'700'});
      const row=(label,value)=>{
        const d=document.createElement('div');
        Object.assign(d.style,{display:'grid',gridTemplateColumns:'100px minmax(0,1fr)',gap:'8px',minWidth:'0'});
        const l=document.createElement('span');l.textContent=label;Object.assign(l.style,{opacity:'.86',fontWeight:'800'});
        const v=document.createElement('span');v.textContent=value||'—';Object.assign(v.style,{fontWeight:'900',overflowWrap:'anywhere'});
        d.append(l,v);return d;
      };
      grid.append(
        row('Resident',patient),row('Details',details||alertType),
        row('Room',room||'—'),row('Due Time',dueText||'Due now'),
        row('Alert Type',alertType),row('Message',message)
      );
      body.append(head,grid);

      const ok=document.createElement('button');ok.type='button';ok.textContent='OK';
      Object.assign(ok.style,{minWidth:'76px',minHeight:'58px',padding:'10px 14px',border:'2px solid rgba(255,255,255,.72)',borderRadius:'14px',background:'rgba(255,255,255,.13)',color:'#fff',fontSize:'20px',fontWeight:'950',cursor:'pointer'});
      ok.addEventListener('click',()=>overlay.remove());
      card.append(icon,body,ok);overlay.appendChild(card);document.body.appendChild(overlay);

      if(!document.getElementById('samara-clinical-alert-responsive-style')){
        const style=document.createElement('style');style.id='samara-clinical-alert-responsive-style';
        style.textContent=`
          @media(max-width:700px){
            .samara-clinical-alert-overlay{padding:calc(8px + env(safe-area-inset-top)) 7px 8px!important}
            .samara-clinical-alert-card{width:calc(100vw - 14px)!important;min-height:0!important;grid-template-columns:52px minmax(0,1fr)!important;gap:10px 12px!important;padding:16px 14px!important;border-radius:19px!important;align-items:start!important}
            .samara-clinical-alert-card>div:first-child{width:50px!important;height:50px!important;font-size:27px!important}
            .samara-clinical-alert-card>div:nth-child(2)>div:first-child strong{font-size:20px!important}
            .samara-clinical-alert-detail-grid{grid-template-columns:1fr!important;gap:7px!important;font-size:14px!important}
            .samara-clinical-alert-detail-grid>div{grid-template-columns:86px minmax(0,1fr)!important}
            .samara-clinical-alert-card>button{grid-column:1/3!important;width:100%!important;min-height:48px!important;font-size:17px!important;margin-top:3px!important}
          }
        `;document.head.appendChild(style);
      }
      try{if(navigator.vibrate)navigator.vibrate(priority==='Critical'?[180,80,180,80,180]:[130,70,130])}catch(_){}
      window.setTimeout(()=>{if(overlay.isConnected)overlay.remove()},20000);
    }catch(error){console.warn('Clinical popup unavailable:',error)}
  }


  function useClinicalAlertEngine(profile,setPage){
    const [alerts,setAlerts]=React.useState([]);
    const [settings,setSettings]=React.useState({
      setting_key:'global',sound_enabled:true,voice_enabled:false,browser_notifications_enabled:false,
      medicine_lead_minutes:5,vitals_lead_minutes:5,care_lead_minutes:10,repeat_minutes:5,
      manager_escalation_minutes:30,medication_error_minutes:60,is_active:true
    });
    const [soundUnlocked,setSoundUnlocked]=React.useState(false);
    const [pushEnabled,setPushEnabled]=React.useState(false);
    const lastPlayed=React.useRef({});
    const lastPopup=React.useRef({});
    const audioContext=React.useRef(null);
    // v2.11.20: keep Web Speech utterances strongly referenced. Some Chrome/Edge
    // builds can garbage-collect a locally scoped SpeechSynthesisUtterance before
    // playback starts when the alert queue is otherwise idle.
    const speechKeepAlive=React.useRef([]);
    const speechPrimed=React.useRef(false);

    function playClinicalTone(priority='Routine',force=false){
      if(isMobileClinicalDevice())return;
      if(!force&&(!settings.sound_enabled||!soundUnlocked))return;
      if(!isMobileClinicalDevice())try{
        const Ctx=window.AudioContext||window.webkitAudioContext;
        const ctx=audioContext.current||(audioContext.current=new Ctx());
        if(ctx.state==='suspended')ctx.resume().catch(()=>{});
        const level=String(priority||'Routine');
        const pulses=level==='Critical'?6:level==='Urgent'?4:3;
        const now=ctx.currentTime+.02;
        const master=ctx.createGain();
        master.gain.setValueAtTime(.82,now);
        master.connect(ctx.destination);
        for(let i=0;i<pulses;i++){
          const t=now+i*.38;
          const primary=ctx.createOscillator();
          const secondary=ctx.createOscillator();
          const gain=ctx.createGain();
          primary.type='square'; secondary.type='sine';
          const base=level==='Critical'?920:level==='Urgent'?820:740;
          primary.frequency.setValueAtTime(base+(i%2?120:0),t);
          secondary.frequency.setValueAtTime((base+(i%2?120:0))*1.5,t);
          primary.connect(gain);secondary.connect(gain);gain.connect(master);
          gain.gain.setValueAtTime(.0001,t);
          gain.gain.exponentialRampToValueAtTime(.22,t+.025);
          gain.gain.setValueAtTime(.22,t+.15);
          gain.gain.exponentialRampToValueAtTime(.0001,t+.26);
          primary.start(t);secondary.start(t);primary.stop(t+.28);secondary.stop(t+.28);
        }
      }catch(error){console.warn('Clinical alert sound unavailable',error)}
    }
    function primeSpeechSynthesisFromGesture(){
      const synth=window.speechSynthesis;
      if(!synth||typeof window.SpeechSynthesisUtterance!=='function')return false;
      try{synth.resume?.()}catch(_){}
      // Do not cancel here. Chrome can enter a silent state when cancel() and speak()
      // are issued back-to-back on an otherwise idle speech engine.
      try{synth.getVoices?.()}catch(_){}
      if(speechPrimed.current)return true;
      const u=new SpeechSynthesisUtterance('Samara voice enabled');
      u.lang='en-IN';
      u.rate=1;
      u.pitch=1;
      u.volume=.18;
      speechKeepAlive.current.push(u);
      const release=()=>{
        speechKeepAlive.current=speechKeepAlive.current.filter(x=>x!==u);
        speechPrimed.current=true;
      };
      u.onend=release;
      u.onerror=release;
      synth.speak(u);
      return true;
    }
    async function unlockSound(){
      if(isMobileClinicalDevice())return false;
      try{
        // Prime Web Speech immediately while this function is still executing from
        // the user's Enable Sound click. This is intentionally before any await.
        primeSpeechSynthesisFromGesture();
        const Ctx=window.AudioContext||window.webkitAudioContext;
        const ctx=audioContext.current||(Ctx?new Ctx():null);
        if(ctx&&ctx.state==='suspended')await ctx.resume();
        // One Nurse action unlocks tone + automatic clinical voice for this session.
        setSettings(s=>({...s,sound_enabled:true,voice_enabled:true}));
        setSoundUnlocked(true);
        playClinicalTone('Routine',true);
      }catch(error){console.warn('Sound unavailable',error)}
    }
    async function toggleSound(){
      if(soundUnlocked){
        try{
          if(window.speechSynthesis)window.speechSynthesis.cancel();
          const ctx=audioContext.current;
          if(ctx&&ctx.state==='running')await ctx.suspend();
        }catch(_){}
        setSettings(s=>({...s,sound_enabled:false,voice_enabled:false}));
        setSoundUnlocked(false);
        return;
      }
      await unlockSound();
    }
    function play(priority){
      playClinicalTone(priority,false);
    }
    function clinicalVoiceData(a){
      const title=String(a?.title||a?.alert_type||'').toLowerCase();
      const patient=String(a?.patient_name||a?.patient||'நோயாளர்').trim();
      const room=String(a?.room_label||a?.room||'').trim();
      const details=String(a?.description||a?.details||'').trim();
      const overdue=actualOverdueMinutes(a);
      const isMedication=title.includes('medication')||title.includes('medicine')||title.includes('மருந்து');
      const isVitals=title.includes('vital');
      const isCare=title.includes('daily care')||title.includes('care');
      const isPhysio=title.includes('physio');
      return {title,patient,room,details,overdue,isMedication,isVitals,isCare,isPhysio};
    }
    function actualOverdueMinutes(a){
      const serverValue=Math.max(0,Number(a?.overdue_minutes||0));
      const dueRaw=a?.due_at||a?.dueAt||null;
      if(!dueRaw)return serverValue;
      const due=new Date(dueRaw);
      if(Number.isNaN(due.getTime()))return serverValue;
      const computed=Math.max(0,Math.floor((Date.now()-due.getTime())/60000));
      // Never allow a stale server-side threshold value (for example 30) to
      // understate the real elapsed delay shown or announced to staff.
      return Math.max(serverValue,computed);
    }
    function englishOverdueLabel(minutes){
      const m=Math.max(0,Math.floor(Number(minutes||0)));
      if(m<60)return `${m} min overdue`;
      const h=Math.floor(m/60),r=m%60;
      return `${h} hr${h===1?'':'s'}${r?` ${r} min`:''} overdue`;
    }
    function tamilDurationSpeech(minutes){
      const m=Math.max(0,Math.floor(Number(minutes||0)));
      if(!m)return '';
      if(m<60)return `${tamilIntegerWords(m)} நிமிடங்கள்`;
      const h=Math.floor(m/60),r=m%60;
      const hourWord=h===1?'ஒரு':tamilIntegerWords(h);
      const hourPart=`${hourWord} மணி நேரம்`;
      const minutePart=r?` ${tamilIntegerWords(r)} நிமிடங்கள்`:'';
      return `${hourPart}${minutePart}`;
    }
    function tamilOverdueSpeech(minutes){
      const duration=tamilDurationSpeech(minutes);
      return duration?`${duration} தாமதமாகியுள்ளது.`:'';
    }
    function singleVoiceScore(v){
      const name=String(v?.name||'').toLowerCase();
      const lang=String(v?.lang||'').toLowerCase();
      let score=0;
      // One voice for the entire announcement. Prefer Tamil / India voices only.
      if(lang==='ta-in')score+=150;
      else if(lang.startsWith('ta'))score+=120;
      else if(lang==='en-in')score+=80;
      else if(lang.startsWith('en-in'))score+=70;
      // Prefer a clear female voice where the device exposes one, but clarity/language wins.
      if(/pallavi|neerja|heera|veena|female|woman/.test(name))score+=35;
      if(/natural|neural|enhanced|premium/.test(name))score+=12;
      // Explicitly avoid US/UK/AU voices for English clinical data.
      if(/en-us|en-gb|en-au/.test(lang))score-=200;
      return score;
    }
    function bestSingleClinicalVoice(voices,preferredLang='ta-IN'){
      const list=[...(voices||[])];
      if(!list.length)return null;
      const pref=String(preferredLang||'ta-IN').toLowerCase();
      const ranked=list.map(v=>{
        const lang=String(v?.lang||'').toLowerCase();
        let score=singleVoiceScore(v);
        if(pref.startsWith('ta')&&lang.startsWith('ta'))score+=400;
        else if(pref.startsWith('en')&&lang.startsWith('en'))score+=250;
        if(v?.default)score+=8;
        return {v,score};
      }).sort((a,b)=>b.score-a.score);
      return ranked[0]?.v||list[0]||null;
    }
    function hasTamilSpeechVoice(voices){
      return (voices||[]).some(v=>String(v?.lang||'').toLowerCase().startsWith('ta'));
    }
    async function waitForSpeechVoices(maxWaitMs=3500){
      const synth=window.speechSynthesis;
      if(!synth)return [];
      try{synth.resume?.()}catch(_){}
      let ready=synth.getVoices?.()||[];
      if(ready.length)return ready;

      const started=Date.now();
      return await new Promise(resolve=>{
        let finished=false;
        let timer=null;
        const finish=()=>{
          if(finished)return;
          const list=synth.getVoices?.()||[];
          if(list.length||Date.now()-started>=maxWaitMs){
            finished=true;
            if(timer)window.clearInterval(timer);
            try{synth.removeEventListener?.('voiceschanged',onChanged)}catch(_){}
            resolve(list);
          }
        };
        const onChanged=()=>finish();
        try{synth.addEventListener?.('voiceschanged',onChanged,{once:false})}catch(_){}
        timer=window.setInterval(finish,200);
        window.setTimeout(finish,maxWaitMs);
      });
    }
    const TAMIL_DIGITS={
      '0':'பூஜியம்','1':'ஒன்று','2':'இரண்டு','3':'மூன்று','4':'நான்கு',
      '5':'ஐந்து','6':'ஆறு','7':'ஏழு','8':'எட்டு','9':'ஒன்பது'
    };
    const TAMIL_LETTERS={
      'A':'ஏ','B':'பி','C':'சி','D':'டி','E':'ஈ','F':'எஃப்','G':'ஜி','H':'எச்',
      'I':'ஐ','J':'ஜே','K':'கே','L':'எல்','M':'எம்','N':'என்','O':'ஓ','P':'பி',
      'Q':'க்யூ','R':'ஆர்','S':'எஸ்','T':'டி','U':'யூ','V':'வி','W':'டபிள்யூ',
      'X':'எக்ஸ்','Y':'ஒய்','Z':'செட்'
    };
    // Tuned spoken-number list. Add a pronunciation here once and every alert reuses it.
    const TAMIL_SPOKEN_NUMBER_OVERRIDES={
      21:'இருபத்தொன்று',22:'இருபத்திரண்டு',23:'இருபத்துமூன்று',24:'இருபத்துநான்கு',25:'இருபத்தைந்து',
      26:'இருபத்தாறு',27:'இருபத்தேழு',28:'இருபத்தெட்டு',29:'இருபத்தொன்பது',
      31:'முப்பத்தொன்று',32:'முப்பத்திரண்டு',33:'முப்பத்துமூன்று',34:'முப்பத்துநான்கு',35:'முப்பத்தைந்து',
      36:'முப்பத்தாறு',37:'முப்பத்தேழு',38:'முப்பத்தெட்டு',39:'முப்பத்தொன்பது',
      41:'நாற்பத்தொன்று',42:'நாற்பத்திரண்டு',43:'நாற்பத்துமூன்று',44:'நாற்பத்துநான்கு',45:'நாற்பத்தைந்து',
      46:'நாற்பத்தாறு',47:'நாற்பத்தேழு',48:'நாற்பத்தெட்டு',49:'நாற்பத்தொன்பது',
      51:'ஐம்பத்தொன்று',52:'ஐம்பத்திரண்டு',53:'ஐம்பத்துமூன்று',54:'ஐம்பத்துநான்கு',55:'ஐம்பத்தைந்து',
      56:'ஐம்பத்தாறு',57:'ஐம்பத்தேழு',58:'ஐம்பத்தெட்டு',59:'ஐம்பத்தொன்பது',
      500:'ஐநூறு',650:'அறுநூற்று ஐம்பது'
    };
    function tamilIntegerWords(n){
      n=Number(n);
      if(!Number.isFinite(n)||n<0||n>9999||!Number.isInteger(n))return String(n);
      if(TAMIL_SPOKEN_NUMBER_OVERRIDES[n])return TAMIL_SPOKEN_NUMBER_OVERRIDES[n];
      const ones=['பூஜியம்','ஒன்று','இரண்டு','மூன்று','நான்கு','ஐந்து','ஆறு','ஏழு','எட்டு','ஒன்பது','பத்து','பதினொன்று','பன்னிரண்டு','பதின்மூன்று','பதினான்கு','பதினைந்து','பதினாறு','பதினேழு','பதினெட்டு','பத்தொன்பது'];
      const tens=['','','இருபது','முப்பது','நாற்பது','ஐம்பது','அறுபது','எழுபது','எண்பது','தொண்ணூறு'];
      if(n<20)return ones[n];
      if(n<100){const t=Math.floor(n/10),r=n%10;return tens[t]+(r?' '+ones[r]:'');}
      if(n<1000){const h=Math.floor(n/100),r=n%100;const hword=h===1?'நூறு':ones[h]+' நூறு';return hword+(r?' '+tamilIntegerWords(r):'');}
      const th=Math.floor(n/1000),r=n%1000;const thword=th===1?'ஆயிரம்':ones[th]+' ஆயிரம்';return thword+(r?' '+tamilIntegerWords(r):'');
    }
    function roomForSpeech(room){
      // v2.9.45: keep room number literal, but pronounce bed suffix in Tamil.
      // 101-A => "101 - ஏ"
      // 102-B => "102 - பி"
      let raw=String(room||'').trim().toUpperCase();

      let m=raw.match(/(?:ROOM|RM)?\s*(\d{1,4})\s*(?:[-\/]|\s)\s*([A-Z])\b/i);
      if(!m)m=raw.match(/\b(\d{1,4})\s*[-\/]\s*([A-Z])\b/i);

      if(m){
        const roomNo=m[1];
        const bed=m[2].toUpperCase();
        const BED_SUFFIX_SPEECH={
          A:'ஏ',
          B:'பி',
          C:'சி',
          D:'டி',
          E:'ஈ',
          F:'எஃப்'
        };
        return `${roomNo} - [[LETTER:${BED_SUFFIX_SPEECH[bed]||bed}]]`;
      }

      m=raw.match(/\b(\d{1,4})\b/);
      return m ? m[1] : raw;
    }
    function patientForSpeech(name){
      let value=String(name||'').trim();

      // v2.9.45: remove title FIRST, then isolate Indian-style initials.
      // Examples:
      // Mr. R Boominathan  -> "ஆர்.  பூமிநாதன்"
      // Mr R. Boominathan  -> "ஆர்.  பூமிநாதன்"
      // R Boominathan      -> "ஆர்.  பூமிநாதன்"
      value=value
        .replace(/^\s*(Mr|Mrs|Ms|Miss|Dr|Shri|Smt|Master|Baby|Kumari)\.?\s+/i,'')
        .replace(/\b(test|resident|patient|care patient|care patients)\b/gi,' ')
        .replace(/\bMOG-\d{4}-\d{2}-\d{4}\b/gi,' ')
        .replace(/[A-F0-9]{8}-[A-F0-9-]{20,}/gi,' ')
        .replace(/[|•]/g,' ')
        .replace(/\s+/g,' ')
        .trim();

      const INITIAL_SPEECH={
        A:'ஏ', B:'பி', C:'சி', D:'டி', E:'ஈ', F:'எஃப்', G:'ஜி', H:'எச்',
        I:'ஐ', J:'ஜே', K:'கே', L:'எல்', M:'எம்', N:'என்', O:'ஓ',
        P:'பி', Q:'க்யூ', R:'ஆர்', S:'எஸ்', T:'டி', U:'யூ', V:'வி',
        W:'டபிள்யூ', X:'எக்ஸ்', Y:'வை', Z:'ஜெட்'
      };

      // One or two initials are supported. Full stops/spaces are accepted.
      const initialMatch=value.match(/^([A-Za-z])\.?\s+(?:(?:([A-Za-z])\.?\s+))?(.+)$/);
      if(initialMatch){
        const i1=INITIAL_SPEECH[initialMatch[1].toUpperCase()]||initialMatch[1];
        const i2=initialMatch[2] ? (INITIAL_SPEECH[initialMatch[2].toUpperCase()]||initialMatch[2]) : '';
        const restRaw=String(initialMatch[3]||'').trim();

        const knownRest={
          'boominathan':'பூமிநாதன்',
          'boominaathan':'பூமிநாதன்',
          'radhakrishnan':'ராதாகிருஷ்ணன்',
          'radha krishnan':'ராதாகிருஷ்ணன்',
          'murugan':'முருகன்',
          'saravanan':'சரவணன்',
          'ramyapriyaa':'ரம்யப்ரியா',
          'ramya priyaa':'ரம்யப்ரியா',
          'mani':'மணி',
          'divya':'திவ்யா',
          'karthi':'கார்த்தி',
          'lakshmi':'லட்சுமி',
          'laxmi':'லட்சுமி'
        };
        const rest=knownRest[restRaw.toLowerCase().replace(/\./g,'').trim()]||restRaw;

        // Full stop + two spaces gives a more reliable pause than a comma in Tamil TTS.
        // Wrap initials as dedicated voice tokens; speakUtteranceSequence()
        // will give them a slower rate, full volume and a protected pause.
        return i2 ? `[[LETTER:${i1}]] [[LETTER:${i2}]] ${rest}` : `[[LETTER:${i1}]] ${rest}`;
      }

      const known={
        'radhakrishnan':'ராதாகிருஷ்ணன்',
        'radha krishnan':'ராதாகிருஷ்ணன்',
        'radhakrishna':'ராதாகிருஷ்ணா',
        'boominathan':'பூமிநாதன்',
        'boominaathan':'பூமிநாதன்',
        'karthi':'கார்த்தி',
        'divya':'திவ்யா',
        'murugan':'முருகன்',
        'saravanan':'சரவணன்',
        'ramyapriyaa':'ரம்யப்ரியா',
        'ramya priyaa':'ரம்யப்ரியா',
        'mani':'மணி',
        'lakshmi':'லட்சுமி',
        'laxmi':'லட்சுமி'
      };

      const key=value.toLowerCase().replace(/\./g,'').trim();
      if(known[key])return known[key];

      const looksTechnical=
        !value||
        /[{}_[\]<>]/.test(value)||
        /[A-Z]{2,}[-_0-9]{2,}/.test(value)||
        /\b(?:MOG|UUID|PATIENTS?|CARE_PATIENTS?|SOURCE|RECORD|ROW)\b/i.test(value)||
        (value.match(/[0-9]/g)||[]).length>=4;

      return looksTechnical?'நோயாளர்':value;
    }
    function medicineForSpeech(details){
      let value=String(details||'மருந்து').trim();
      value=value
        .replace(/\btest\b/gi,' ')
        .replace(/\b(medication due|medicine due|due now|pending|overdue|critical|high|routine)\b/gi,' ')
        .replace(/\bMOG-\d{4}-\d{2}-\d{4}\b/gi,' ')
        .replace(/[A-F0-9]{8}-[A-F0-9-]{20,}/gi,' ')
        .replace(/\s+/g,' ').trim();

      // Reusable medicine pronunciation list. New/common medicines can be tuned here once.
      const medicinePronunciations=[
        [/\bDolo\b/gi,'டோலோ'],
        [/\bCrocin\b/gi,'க்ரோசின்'],
        [/\bEcosprin\b/gi,'எகோஸ்பிரின்'],
        [/\bParacetamol\b/gi,'பாராசிட்டமால்'],
        [/\bShelcal\b/gi,'ஷெல்கால்'],
        [/\bPantop\b/gi,'பான்டாப்'],
        [/\bAmlodipine\b/gi,'அம்லோடிபின்'],
        [/\bMetformin\b/gi,'மெட்ஃபார்மின்'],
        [/\bTelmisartan\b/gi,'டெல்மிசார்டன்'],
        [/\bAtorvastatin\b/gi,'அடோர்வாஸ்டாட்டின்']
      ];
      medicinePronunciations.forEach(([pattern,spoken])=>{ value=value.replace(pattern,spoken); });

      value=value.replace(/(\d+(?:\.\d+)?)\s*(mg|mcg|ml)\b/gi,(_,num,unit)=>{
        const n=Number(num);
        let spoken;
        if(Number.isInteger(n)) spoken=tamilIntegerWords(n);
        else {
          const [whole,decimal='']=String(num).split('.');
          spoken=`${tamilIntegerWords(Number(whole))} புள்ளி ${decimal.split('').map(ch=>TAMIL_DIGITS[ch]||ch).join(' ')}`;
        }
        const u={mg:'மில்லிகிராம்',mcg:'மைக்ரோகிராம்',ml:'மில்லிலிட்டர்'}[String(unit).toLowerCase()]||unit;
        return ` ${spoken} ${u} `;
      });
      return value
        .replace(/\btab(?:let)?s?\b/gi,' மாத்திரை ')
        .replace(/\bcaps?(?:ule)?s?\b/gi,' கேப்சூல் ')
        .replace(/[|•]/g,', ')
        .replace(/\s+/g,' ').trim();
    }
    function speakUtteranceSequence(segments,voices){
      const synth=window.speechSynthesis;
      if(!synth||!segments.length||typeof window.SpeechSynthesisUtterance!=='function')return false;
      try{synth.resume?.()}catch(_){}
      const requestedLang=String(segments[0]?.lang||'ta-IN');
      const singleVoice=bestSingleClinicalVoice(voices,requestedLang);
      const speechLang=String(singleVoice?.lang||requestedLang||'ta-IN');

      const expanded=[];
      for(const seg of segments){
        const raw=String(seg?.text||'');
        const rx=/\[\[LETTER:([^\]]+)\]\]/g;
        let last=0,m;
        while((m=rx.exec(raw))){
          const before=raw.slice(last,m.index).trim();
          if(before)expanded.push({...seg,text:before});
          expanded.push({...seg,text:String(m[1]||'').trim(),__singleLetter:true,rate:.62,pause:500});
          last=rx.lastIndex;
        }
        const tail=raw.slice(last).trim();
        if(tail)expanded.push({...seg,text:tail});
      }

      let index=0;
      const next=()=>{
        if(index>=expanded.length)return;
        const seg=expanded[index++];
        const u=new SpeechSynthesisUtterance(seg.text);
        u.lang=String(seg.lang||speechLang||'ta-IN');
        if(singleVoice){
          const voiceLang=String(singleVoice.lang||'').toLowerCase();
          const segLang=String(seg.lang||'').toLowerCase();
          if(!segLang||voiceLang.split('-')[0]===segLang.split('-')[0])u.voice=singleVoice;
        }
        if(seg.__singleLetter){u.rate=.62;u.pitch=1.08;u.volume=1.0;}
        else{u.rate=Math.min(.88,Math.max(.80,Number(seg.rate||.84)));u.pitch=.92;u.volume=.90;}

        // Strong reference is essential on some Chromium/Windows builds when the
        // app has no active alerts (the condition seen after dummy-data cleanup).
        speechKeepAlive.current.push(u);
        const release=()=>{speechKeepAlive.current=speechKeepAlive.current.filter(x=>x!==u);};
        u.onend=()=>{release();window.setTimeout(next,seg.pause??220);};
        u.onerror=(event)=>{release();console.warn('Clinical speech utterance error:',event?.error||event);window.setTimeout(next,180);};
        try{synth.resume?.()}catch(_){}
        synth.speak(u);
      };

      console.info('Samara clinical voice',{singleVoice:singleVoice?.name||'device default',language:speechLang,segments:expanded.length});
      next();
      return true;
    }
    function signedInStaffForSpeech(){
      const value=String(
        (typeof formalName==='function'?formalName(profile):'')||
        profile?.full_name||
        profile?.name||
        profile?.login_id||
        ''
      ).replace(/\s+/g,' ').trim();
      return value;
    }
    function staffVoicePrefix(){
      const staff=signedInStaffForSpeech();
      return staff?`டியர் ${staff}.`:'டியர்.';
    }

    function humanisedClinicalVoiceSegments(a){
      const d=clinicalVoiceData(a);
      // v2.9.45: continuous pure-Tamil clinical utterance with live overdue time.
      // Avoids browser-generated gaps/joins between room, patient and medicine details.
      if(d.isMedication){
        const parts=['சமராவின் அவசர வேண்டுகோள்.'];
        if(d.room) parts.push(`அறை எண் ${roomForSpeech(d.room)}.`);
        if(d.patient) parts.push(`நோயாளியின் பெயர் ${patientForSpeech(d.patient)}.`);

        // v2.9.45: medication escalation speech must never lose the medicine name.
        // Current alert rows commonly keep the brand in title ("Medicine Due: Dolo")
        // and strength/route in description ("650mg · Oral"). Recombine them here.
        const titleMedicine=String(d.title||'')
          .replace(/^\s*Medicine\s+Due\s*:\s*/i,'')
          .replace(/^\s*Medication\s+Due\s*:\s*/i,'')
          .trim();
        const detailText=String(d.details||'').trim();
        const combinedMedicine=[
          titleMedicine && !/^Medicine$/i.test(titleMedicine) ? titleMedicine : '',
          detailText
        ].filter(Boolean).join(' ');
        parts.push(`கொடுக்க வேண்டிய மருந்து ${medicineForSpeech(combinedMedicine||titleMedicine||detailText||'Medicine')}.`);

        const escalationMinutes=Math.max(1,Number(settings.manager_escalation_minutes||30));
        if(d.overdue>=escalationMinutes){
          parts.push(`மருந்து கொடுக்க வேண்டிய நேரத்திலிருந்து ${tamilDurationSpeech(d.overdue)} தாமதமாகியுள்ளது.`);
        }else if(d.overdue>0){
          parts.push(tamilOverdueSpeech(d.overdue));
        }
        parts.push('தயவு செய்து உடனே கவனிக்கவும்.');
        parts.push('மருந்து கொடுத்த பிறகு பதிவு செய்யவும்.');
        parts.push('நன்றி.');
        return [{text:parts.join(' '),lang:'ta-IN',rate:.84,pause:0}];
      }
      // v2.9.45: intentionally short non-medication announcements.
      // Staff only need the pending category, patient name and room number.
      const staffPrefix=staffVoicePrefix();
      if(d.isVitals){
        return [{text:`${staffPrefix} வைட்டல்ஸ் பெண்டிங். நோயாளியின் பெயர் ${patientForSpeech(d.patient)}. அறை எண் ${roomForSpeech(d.room)}. நன்றி.`,lang:'ta-IN',rate:.84,pause:0}];
      }
      if(d.isCare){
        return [{text:`${staffPrefix} டெய்லி கேர் பெண்டிங். நோயாளியின் பெயர் ${patientForSpeech(d.patient)}. அறை எண் ${roomForSpeech(d.room)}. நன்றி.`,lang:'ta-IN',rate:.84,pause:0}];
      }
      if(d.isPhysio){
        return [{text:`${staffPrefix} பிசியோதெரபி பெண்டிங். நோயாளியின் பெயர் ${patientForSpeech(d.patient)}. அறை எண் ${roomForSpeech(d.room)}. நன்றி.`,lang:'ta-IN',rate:.84,pause:0}];
      }
      return [{text:`${staffPrefix} கிளினிக்கல் டாஸ்க் பெண்டிங். நோயாளியின் பெயர் ${patientForSpeech(d.patient)}. அறை எண் ${roomForSpeech(d.room)}. நன்றி.`,lang:'ta-IN',rate:.84,pause:0}];
    }
    function englishClinicalVoiceSegments(a){
      const d=clinicalVoiceData(a);
      const patient=String(d.patient||'patient').trim()||'patient';
      const room=String(d.room||'').trim();
      const roomText=room?` Room ${room}.`:'';
      if(d.isMedication){
        const titleMedicine=String(d.title||'').replace(/^\s*(?:Medicine|Medication)\s+Due\s*:\s*/i,'').trim();
        const medicine=[titleMedicine,String(d.details||'').trim()].filter(Boolean).join(' ')||'medicine';
        const overdue=d.overdue>0?` It is ${englishOverdueLabel(d.overdue)}.`:'';
        return [{text:`Samara urgent request. Patient ${patient}.${roomText} Medication ${medicine} is due.${overdue} Please attend immediately and record after giving the medicine. Thank you.`,lang:'en-IN',rate:.84,pause:0}];
      }
      const label=d.isVitals?'Vitals':d.isCare?'Daily care':d.isPhysio?'Physiotherapy':'Clinical task';
      return [{text:`Dear staff. ${label} is pending for ${patient}.${roomText} Thank you.`,lang:'en-IN',rate:.84,pause:0}];
    }
    async function playClinicalVoiceNow(a){
      const synth=window.speechSynthesis;
      if(!synth)return false;
      try{synth.resume?.()}catch(_){}
      const voices=await waitForSpeechVoices(3500);
      try{synth.resume?.()}catch(_){}
      const segments=hasTamilSpeechVoice(voices)?humanisedClinicalVoiceSegments(a):englishClinicalVoiceSegments(a);
      return speakUtteranceSequence(segments,voices);
    }
    // v2.11.20: Voice-test buttons must start speech while the browser still
    // considers the click a live user gesture. Do not await voiceschanged here:
    // Chrome/Edge can otherwise silently block speech after the async delay.
    // If the voice list has not loaded yet, speak the English fallback immediately
    // with the device default voice; later automatic alerts may still use Tamil.
    function playClinicalVoiceFromUserGesture(a){
      const synth=window.speechSynthesis;
      if(!synth||typeof window.SpeechSynthesisUtterance!=='function'){
        alert('Voice playback is not available in this browser. Please use Chrome or Edge on Windows.');
        return false;
      }
      try{synth.resume?.()}catch(_){}
      // No cancel() here: back-to-back cancel/speak is the root of a Chromium
      // silent-playback failure on an idle speech engine. The test buttons are
      // independent of patients, alerts and Supabase rows.
      let voices=[];
      try{voices=synth.getVoices?.()||[]}catch(_){}
      const segments=hasTamilSpeechVoice(voices)?humanisedClinicalVoiceSegments(a):englishClinicalVoiceSegments(a);
      const ok=speakUtteranceSequence(segments,voices);
      if(!ok)console.warn('Clinical voice did not start. speechSynthesis state:',{speaking:synth.speaking,pending:synth.pending,paused:synth.paused,voices:voices.length});
      return ok;
    }
    async function speakLocalClinicalVoice(a){
      return await playClinicalVoiceNow(a);
    }
    function speak(a){
      if(isMobileClinicalDevice())return;
      if(!settings.voice_enabled||!soundUnlocked)return;
      try{window.speechSynthesis?.cancel()}catch(_){}
      // v2.9.14: local/offline voice path only. Azure/remote TTS is intentionally
      // disabled. Human-recorded phrase clips can be added later without changing
      // the alert/escalation timing logic.
      window.setTimeout(async()=>{
        if(!settings.voice_enabled||!soundUnlocked)return;
        try{await speakLocalClinicalVoice(a)}catch(error){console.warn('Clinical voice unavailable:',error)}
      },2300);
    }
    async function refreshPushEnabled(){
      try{
        if(!('Notification' in window)){setPushEnabled(false);return false;}
        if(!isMobileClinicalDevice()){
          const enabled=Notification.permission==='granted'&&!!settings.browser_notifications_enabled;
          setPushEnabled(enabled);return enabled;
        }
        if(!('serviceWorker' in navigator)||!('PushManager' in window)){setPushEnabled(false);return false;}
        const registration=await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_,reject)=>setTimeout(()=>reject(new Error('Service worker timeout')),5000))
        ]);
        const subscription=await registration.pushManager.getSubscription();
        const enabled=!!subscription && Notification.permission==='granted';
        setPushEnabled(enabled);return enabled;
      }catch(_){setPushEnabled(false);return false;}
    }

    React.useEffect(()=>{refreshPushEnabled();},[profile?.id]);

    async function disableNotifications(){
      try{
        if(!isMobileClinicalDevice()){
          setSettings(s=>({...s,browser_notifications_enabled:false}));
          setPushEnabled(false);
          alert('Browser notifications disabled in Samara Care.');
          return true;
        }
        if(!('serviceWorker' in navigator)||!('PushManager' in window)){setPushEnabled(false);return false;}
        const registration=await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_,reject)=>setTimeout(()=>reject(new Error('Service worker is not ready.')),8000))
        ]);
        const subscription=await registration.pushManager.getSubscription();
        if(subscription){
          try{
            await client.from('push_subscriptions')
              .update({is_active:false,updated_at:new Date().toISOString()})
              .eq('endpoint',subscription.endpoint);
          }catch(error){console.warn('Unable to deactivate push subscription row:',error);}
          try{await subscription.unsubscribe()}catch(error){console.warn('Unable to unsubscribe browser push:',error);}
        }
        setSettings(s=>({...s,browser_notifications_enabled:false}));
        setPushEnabled(false);
        alert('Mobile notifications disabled. This phone will no longer receive locked-screen clinical escalation alerts until enabled again.');
        return true;
      }catch(error){
        console.warn('Disable mobile notifications:',error);
        alert(`Unable to disable mobile notifications. ${error?.message||error}`);
        return false;
      }
    }

    async function requestNotifications(){
      try{
        if(!('Notification' in window)){
          alert('Notifications are not supported in this browser. On iPhone, open Samara Care from the Home Screen app.');
          return false;
        }

        // v2.11.29: always give visible feedback. iOS returns "denied" silently
        // after the user has blocked notifications, which previously made the
        // button appear to do nothing.
        let permission=Notification.permission;
        if(permission==='denied'){
          alert('Notifications are currently blocked for Samara Care. On iPhone open Settings > Notifications > Samara Care and turn Allow Notifications ON, then return here and tap Enable Mobile Notifications again.');
          return false;
        }
        if(permission!=='granted'){
          permission=await Notification.requestPermission();
        }
        if(permission!=='granted'){
          alert('Mobile notifications were not enabled. Please allow notifications for Samara Care and try again.');
          return false;
        }

        setSettings(s=>({...s,browser_notifications_enabled:true}));

        // Desktop/laptop may use ordinary browser notifications. Mobile/PWA is
        // additionally registered for true background Web Push notifications.
        if(!isMobileClinicalDevice()){
          setPushEnabled(true);
          alert('Browser notifications are enabled on this device.');
          return true;
        }

        if(!('serviceWorker' in navigator)||!('PushManager' in window)){
          alert('Background push is not supported here. On iPhone/iPad, use the Samara Care Home Screen app and ensure iOS 16.4 or later.');
          return false;
        }

        const vapidPublicKey=String(window.SAMARA_CONFIG?.vapidPublicKey||'').trim();
        if(!vapidPublicKey){
          alert('Samara mobile push is awaiting server configuration. Please contact the Administrator.');
          return false;
        }

        const registration=await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((_,reject)=>setTimeout(()=>reject(new Error('Service worker is not ready. Please use Menu > App Help > Repair App, reopen Samara Care, and try again.')),8000))
        ]);

        let subscription=await registration.pushManager.getSubscription();

        // Preserve the endpoint and server delivery history when the key matches.
        const requestedKey=base64UrlToUint8Array(vapidPublicKey);
        const existingKey=subscription?.options?.applicationServerKey;
        const keyMatches=existingKey && new Uint8Array(existingKey).length===requestedKey.length &&
          new Uint8Array(existingKey).every((value,index)=>value===requestedKey[index]);
        if(subscription && !keyMatches){
          const {error:deactivateError}=await client.from('push_subscriptions')
            .update({is_active:false,updated_at:new Date().toISOString()})
            .eq('endpoint',subscription.endpoint);
          if(deactivateError)throw deactivateError;
          if(!(await subscription.unsubscribe()))throw new Error('Unable to replace the previous push subscription. Please retry.');
          subscription=null;
        }
        if(!subscription){
          subscription=await registration.pushManager.subscribe({
            userVisibleOnly:true,
            applicationServerKey:requestedKey
          });
        }

        const json=subscription.toJSON();
        const {data:{user}}=await client.auth.getUser();
        if(!user?.id)throw new Error('Please sign in again before enabling mobile notifications.');

        const {error}=await client.from('push_subscriptions').upsert({
          user_id:user.id,
          profile_id:profile?.id||user.id,
          endpoint:subscription.endpoint,
          p256dh:json.keys?.p256dh||'',
          auth_key:json.keys?.auth||'',
          user_agent:navigator.userAgent||'',
          device_type:'mobile',
          is_active:true,
          last_seen_at:new Date().toISOString(),
          updated_at:new Date().toISOString()
        },{onConflict:'endpoint'});
        if(error)throw error;

        try{
          await showSystemNotification('Samara Mobile Notifications Enabled',{
            body:'Clinical alerts can now reach this device even when Samara Care is closed.',
            icon:'./icons/icon-192.png',badge:'./icons/icon-192.png',tag:'samara-push-enabled',
            data:{url:'./?push_page=Clinical%20Alerts'}
          });
        }catch(_){}

        setPushEnabled(true);
        alert('Mobile notifications enabled successfully. This phone is now registered for locked-screen clinical escalation alerts.');
        return true;
      }catch(error){
        console.warn('Mobile push registration:',error);
        alert(`Unable to enable mobile background notifications. ${error?.message||error}`);
        return false;
      }
    }
    async function runAudioDiagnostics(){
      // v2.11.21: standalone audio diagnostics. This deliberately bypasses
      // clinical alerts, Supabase, patient data and the Tamil voice formatter.
      const report={
        time:formatDateTimeIN(new Date()),
        secureContext:window.isSecureContext===true,
        audioContextSupport:!!(window.AudioContext||window.webkitAudioContext),
        audioContextState:'not tested',
        beep:'not tested',
        speechSynthesis:!!window.speechSynthesis,
        utteranceSupport:typeof window.SpeechSynthesisUtterance==='function',
        voices:0,
        tamilVoices:0,
        englishIndiaVoices:0,
        speech:'not tested',
        speechError:''
      };
      // Plain WebAudio beep, with no Samara clinical tone helper involved.
      try{
        const Ctx=window.AudioContext||window.webkitAudioContext;
        if(!Ctx)throw new Error('AudioContext is not supported');
        const ctx=audioContext.current||(audioContext.current=new Ctx());
        if(ctx.state==='suspended')await ctx.resume();
        report.audioContextState=ctx.state;
        const osc=ctx.createOscillator();
        const gain=ctx.createGain();
        osc.type='sine'; osc.frequency.value=660;
        gain.gain.setValueAtTime(.0001,ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(.28,ctx.currentTime+.03);
        gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.42);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime+.45);
        report.beep='started';
      }catch(error){
        report.audioContextState=report.audioContextState==='not tested'?'failed':report.audioContextState;
        report.beep='failed: '+(error?.message||String(error));
      }

      // Plain English Web Speech test. No Tamil, no patient, no clinical formatter.
      try{
        const synth=window.speechSynthesis;
        if(!synth||typeof window.SpeechSynthesisUtterance!=='function')throw new Error('Speech synthesis is not supported');
        try{synth.resume?.()}catch(_){}
        let voices=[]; try{voices=synth.getVoices?.()||[]}catch(_){}
        report.voices=voices.length;
        report.tamilVoices=voices.filter(v=>String(v.lang||'').toLowerCase().startsWith('ta')).length;
        report.englishIndiaVoices=voices.filter(v=>String(v.lang||'').toLowerCase().startsWith('en-in')).length;
        const u=new SpeechSynthesisUtterance('Samara audio diagnostic. English voice test.');
        u.lang='en-US'; u.rate=.92; u.pitch=1; u.volume=1;
        const english=voices.find(v=>String(v.lang||'').toLowerCase().startsWith('en-us'))||voices.find(v=>String(v.lang||'').toLowerCase().startsWith('en'))||voices[0];
        if(english)u.voice=english;
        speechKeepAlive.current.push(u);
        const release=()=>{speechKeepAlive.current=speechKeepAlive.current.filter(x=>x!==u)};
        u.onstart=()=>{report.speech='started'};
        u.onend=()=>{report.speech='completed';release()};
        u.onerror=(event)=>{report.speech='failed';report.speechError=String(event?.error||'unknown speech error');release()};
        synth.speak(u);
        if(report.speech==='not tested')report.speech='queued';
      }catch(error){report.speech='failed';report.speechError=error?.message||String(error)}

      window.setTimeout(()=>{
        try{
          const synth=window.speechSynthesis;
          const lines=[
            'SAMARA AUDIO DIAGNOSTICS',
            '',
            `Secure site: ${report.secureContext?'YES':'NO'}`,
            `AudioContext supported: ${report.audioContextSupport?'YES':'NO'}`,
            `AudioContext state: ${report.audioContextState}`,
            `Simple beep: ${report.beep}`,
            '',
            `Speech synthesis supported: ${report.speechSynthesis&&report.utteranceSupport?'YES':'NO'}`,
            `Voices detected: ${report.voices}`,
            `Tamil voices: ${report.tamilVoices}`,
            `English India voices: ${report.englishIndiaVoices}`,
            `Simple English speech: ${report.speech}`,
            report.speechError?`Speech error: ${report.speechError}`:'',
            '',
            `Browser speech state: speaking=${!!synth?.speaking}, pending=${!!synth?.pending}, paused=${!!synth?.paused}`,
            '',
            'Please take a screenshot of this report and send it to ChatGPT.'
          ].filter(x=>x!==''||true);
          alert(lines.join('\n'));
        }catch(error){alert('Audio diagnostics completed, but the report could not be displayed: '+(error?.message||error))}
      },2200);
      return report;
    }

    async function testClinicalAlert(){
      // Local, non-clinical test only: no patient/task/escalation row is written.
      try{
        const Ctx=window.AudioContext||window.webkitAudioContext;
        if(Ctx){
          const ctx=audioContext.current||(audioContext.current=new Ctx());
          if(ctx.state==='suspended')await ctx.resume();
          setSoundUnlocked(true);
          playClinicalTone('Critical',true);
        }
      }catch(error){console.warn('Test sound unavailable',error)}
      let permission=('Notification' in window)?Notification.permission:'unsupported';
      if(permission==='default'){
        try{permission=await Notification.requestPermission()}catch(_){}
      }
      if(permission==='granted'){
        await showSystemNotification('TEST CLINICAL ALERT · Dolo 500 mg',{body:'Medication Due · Dolo 500 mg\nRadhakrishnan · Room 101 · Due now',tag:`samara-test-${Date.now()}`,requireInteraction:true,icon:'./icons/icon-192.png',badge:'./icons/icon-192.png',data:{url:'./?push_page=Clinical%20Alerts'}});
        setSettings(s=>({...s,browser_notifications_enabled:true}));
      }
      if(navigator.vibrate)try{navigator.vibrate([180,90,180,90,180])}catch(_){}
      showClinicalAlertPopup({heading:'TEST CLINICAL ALERT',patient:'Radhakrishnan',room:'101',alertType:'Medication Due',details:'Dolo 500 mg',dueText:'Due now',message:'Please attend and record immediately.',priority:'Critical',test:true});
      if(!isMobileClinicalDevice())speak({title:'Medication Due',patient_name:'Radhakrishnan',room_label:'101',description:'Dolo 500 mg',overdue_minutes:0});
      return permission;
    }
    async function testVitalsVoice(){
      const sample={title:'Vitals Due',patient_name:'Radhakrishnan',room_label:'101',description:'Vitals pending',overdue_minutes:0};
      try{
        playClinicalVoiceFromUserGesture(sample);
      }catch(error){console.warn('Vitals voice playback unavailable:',error)}
    }

    async function testDailyCareVoice(){
      const sample={title:'Daily Care Due',patient_name:'Radhakrishnan',room_label:'101',description:'Daily care pending',overdue_minutes:0};
      try{
        playClinicalVoiceFromUserGesture(sample);
      }catch(error){console.warn('Daily care voice playback unavailable:',error)}
    }

    async function testClinicalTaskVoice(){
      const sample={title:'Clinical Task Due',patient_name:'Radhakrishnan',room_label:'101',description:'Clinical task pending',overdue_minutes:0};
      try{
        playClinicalVoiceFromUserGesture(sample);
      }catch(error){console.warn('Clinical task voice playback unavailable:',error)}
    }

    async function playCurrentLiveEscalation(){
      // v2.9.45: a live escalation is defined by the unresolved
      // clinical_alert_escalations register, not merely by elapsed minutes.
      const live=(alerts||[])
        .map(a=>({...a,overdue_minutes:actualOverdueMinutes(a)}))
        .filter(a=>
          a.is_escalated===true &&
          String(a.alert_type||'').toLowerCase()!=='regularisation' &&
          !String(a.title||'').toLowerCase().includes('backlog regularisation')
        )
        .sort((a,b)=>Number(b.overdue_minutes)-Number(a.overdue_minutes))[0];

      if(!live){
        alert('There are no current live escalations.');
        return;
      }
      if(!live.patient_id||!live.patient_name||live.patient_name==='Patient'){
        alert('The live escalation could not be matched to the Patient Master. Please refresh Clinical Alerts.');
        return;
      }

      try{
        playClinicalVoiceFromUserGesture(live);
      }catch(error){
        console.warn('Live escalation voice playback unavailable:',error);
      }
    }

    async function testSampleEscalationVoice(){
      // Start speech-engine interaction before any await so the user's click remains
      // the active gesture. AudioContext unlocking is secondary to voice playback.
      primeSpeechSynthesisFromGesture();
      try{
        const Ctx=window.AudioContext||window.webkitAudioContext;
        if(Ctx){
          const ctx=audioContext.current||(audioContext.current=new Ctx());
          if(ctx.state==='suspended')await ctx.resume();
          setSoundUnlocked(true);
        }
      }catch(error){console.warn('Escalation voice test audio unlock unavailable',error)}
      // v2.9.45: playback must be predictable. Never select a live alert/UUID for testing.
      // This isolates pronunciation from real patient data and lets staff compare versions.
      const sample={
        title:'Medication Due',
        patient_name:'Radhakrishnan',
        room_label:'101',
        description:'Dolo 500 mg',
        overdue_minutes:95
      };
      try{
        playClinicalVoiceFromUserGesture(sample);
      }catch(error){
        console.warn('Escalation voice playback unavailable:',error);
      }
    }

    async function loadSettings(){
      const {data}=await client.from('clinical_alert_settings').select('*').eq('is_active',true).order('updated_at',{ascending:false}).limit(1).maybeSingle();
      if(data)setSettings(s=>({...s,...data}));
    }
    async function refresh(){
      if(!profile)return;
      if(profile?.role==='STD'){
        setAlerts([]);
        try{document.querySelectorAll('.samara-clinical-alert-overlay').forEach(node=>node.remove())}catch(_){}
        try{if(window.speechSynthesis)window.speechSynthesis.cancel()}catch(_){}
        return;
      }
      const {data,error}=await client.rpc('get_current_clinical_alerts');
      if(error){console.warn('Alert engine:',error.message);setAlerts([]);return}

      // v2.9.45: resolve patient identity from the Patient Master before display,
      // notifications or voice. RPC/source text is never trusted for patient/room speech.
      const rawAlerts=data||[];
      const patientIds=[...new Set(rawAlerts.map(a=>a?.patient_id).filter(Boolean))];
      let patientMap={};
      if(patientIds.length){
        try{
          const {data:patientRows,error:patientError}=await client
            .from('patients')
            .select('id,title,full_name,patient_id,room_no,bed_no,is_active')
            .in('id',patientIds);
          if(patientError)throw patientError;
          (patientRows||[]).forEach(p=>{patientMap[String(p.id)]=p});
        }catch(patientError){
          console.warn('Clinical alert patient hydration:',patientError?.message||patientError);
        }
      }

      let list=rawAlerts.map(a=>{
        const liveOverdue=actualOverdueMinutes(a);
        const p=patientMap[String(a?.patient_id||'')]||null;
        const patientName=p
          ? [p.title,p.full_name].filter(Boolean).join(' ').trim()
          : '';
        const roomLabel=p
          ? [p.room_no,p.bed_no].filter(Boolean).join('-').trim()
          : '';
        return {
          ...a,
          // Prefer Patient Master values. If unresolved, use safe generic labels;
          // never pass raw machine references to speech.
          patient_name:patientName||'Patient',
          room_label:roomLabel||'',
          overdue_minutes:liveOverdue,
          key:`${a.alert_type}:${a.source_id}:${a.due_at}`,
          is_escalated:false
        };
      });

      const escalationMinutes=Number(settings.manager_escalation_minutes||30);

      // v2.9.45: if actionable items have crossed the threshold, process the
      // escalation RPC first and WAIT for it. Previously this was fire-and-forget,
      // so the Nurse screen could remain "Overdue" until a later refresh.
      const thresholdCandidates=list.filter(a=>
        Number(a.overdue_minutes)>=(String(a.alert_type||'').toLowerCase()==='vital signs'?90:escalationMinutes) &&
        !['regularisation','daily care'].includes(String(a.alert_type||'').toLowerCase()) &&
        !String(a.title||'').toLowerCase().includes('backlog regularisation')
      );
      if(thresholdCandidates.length){
        try{
          const {error:processError}=await client.rpc('process_clinical_alert_escalations');
          if(processError)throw processError;
        }catch(processError){
          console.warn('Clinical escalation processing:',processError?.message||processError);
        }
      }

      // Authoritative escalation state comes from the unresolved escalation register.
      // Match by alert_key first, then source identity as a safeguard for older rows
      // whose alert_key format may differ from the current UI key.
      let openEscalations=[];
      try{
        const {data:escRows,error:escError}=await client
          .from('clinical_alert_escalations')
          .select('alert_key,alert_type,source_id,patient_id,due_at,resolved_at')
          .is('resolved_at',null)
          .limit(500);
        if(escError)throw escError;
        openEscalations=escRows||[];
      }catch(escError){
        console.warn('Clinical escalation status:',escError?.message||escError);
      }

      // v2.9.45: normalize UUID/text values before matching.
      // source_id is authoritative because the escalation backend stores the
      // same source UUID returned by get_current_clinical_alerts().
      const norm=v=>String(v??'').trim().toLowerCase();
      const escKeys=new Set(openEscalations.map(e=>norm(e.alert_key)).filter(Boolean));
      const escSources=new Set(openEscalations.map(e=>norm(e.source_id)).filter(Boolean));
      const escComposite=new Set(openEscalations.map(e=>
        `${norm(e.alert_type)}|${norm(e.source_id)}|${norm(e.patient_id)}`
      ));

      list=list.map(a=>{
        const regularisation=
          norm(a.alert_type)==='regularisation' ||
          norm(a.title).includes('backlog regularisation');
        const sourceId=norm(a.source_id);
        const composite=`${norm(a.alert_type)}|${sourceId}|${norm(a.patient_id)}`;
        const confirmed=!regularisation && (
          (sourceId && escSources.has(sourceId)) ||
          escComposite.has(composite) ||
          escKeys.has(norm(a.key))
        );
        return {...a,is_escalated:Boolean(confirmed)};
      });

      const isEscalationViewer=['Admin','Manager'].includes(profile?.role);
      const visibleList=isEscalationViewer?list.filter(a=>a.is_escalated):list;
      setAlerts(visibleList);

      // v2.9.45: rotating automatic alert queue.
      // Previously only the first Critical/Urgent row ("top") was ever spoken,
      // which could starve patients lower in the list indefinitely.
      const now=Date.now();
      const repeatMs=Math.max(1,Number(settings.repeat_minutes||5))*60000;
      const priorityRank={Critical:0,Urgent:1,Routine:2};
      const ordered=[...visibleList].sort((a,b)=>{
        const ae=a.is_escalated?0:1,be=b.is_escalated?0:1;
        if(ae!==be)return ae-be;
        const ap=priorityRank[a.priority]??3,bp=priorityRank[b.priority]??3;
        if(ap!==bp)return ap-bp;
        return Number(b.overdue_minutes||0)-Number(a.overdue_minutes||0);
      });

      // Pick ONE eligible item per refresh so voices never overlap.
      // Every unresolved alert gets a turn because each alert has its own lastPlayed timestamp.
      const nextToAnnounce=ordered.find(a=>{
        const last=lastPlayed.current[a.key]||0;
        return now-last>=repeatMs;
      });

      if(nextToAnnounce){
        lastPlayed.current[nextToAnnounce.key]=now;
        play(nextToAnnounce.priority);
        speak(nextToAnnounce);

        if(!(isMobileClinicalDevice()&&pushEnabled&&['Admin','Manager'].includes(profile?.role))&&settings.browser_notifications_enabled&&Notification.permission==='granted'){
          showSystemNotification(
            `${nextToAnnounce.title}${nextToAnnounce.description?` · ${nextToAnnounce.description}`:''}`,
            {
              body:`${nextToAnnounce.description||nextToAnnounce.title||'Clinical task due'}\n${nextToAnnounce.patient_name||'Patient'} · ${nextToAnnounce.room_label||''}${String(nextToAnnounce.alert_type||'').toLowerCase()==='daily care'?' · Pending for current shift':Number(nextToAnnounce.overdue_minutes||0)>0?` · ${englishOverdueLabel(nextToAnnounce.overdue_minutes)}`:' · Due now'}`,
              tag:nextToAnnounce.key,
              requireInteraction:nextToAnnounce.priority==='Critical',
              icon:'./icons/icon-192.png',badge:'./icons/icon-192.png',
              data:{url:'./?push_page=Clinical%20Alerts'}
            }
          );
        }

        const popupLast=lastPopup.current[nextToAnnounce.key]||0;
        if(now-popupLast>=repeatMs){
          lastPopup.current[nextToAnnounce.key]=now;
          const overdue=Number(nextToAnnounce.overdue_minutes||0);
          const heading=nextToAnnounce.is_escalated?'CLINICAL ESCALATION':'CLINICAL ALERT';
          showClinicalAlertPopup({
            heading,
            patient:nextToAnnounce.patient_name||'Patient',
            room:nextToAnnounce.room_label||'',
            alertType:nextToAnnounce.title||'Clinical task due',
            details:nextToAnnounce.description||nextToAnnounce.title||'Clinical task due',
            dueText:String(nextToAnnounce.alert_type||'').toLowerCase()==='daily care'?'Pending for current shift':overdue>0?englishOverdueLabel(overdue):'Due now',
            message:nextToAnnounce.is_escalated?'Escalated — please attend and record immediately.':'Please attend and record immediately.',
            priority:nextToAnnounce.priority||'Routine'
          });
        }
      }
      // Escalation processing is awaited earlier in refresh() so status is current
      // before the Nurse/Manager UI and playback controls are updated.
    }
    React.useEffect(()=>{loadSettings()},[]);
    React.useEffect(()=>{
      if(!profile)return;
      if(profile?.role==='STD'){
        setAlerts([]);
        try{document.querySelectorAll('.samara-clinical-alert-overlay').forEach(node=>node.remove())}catch(_){}
        try{if(window.speechSynthesis)window.speechSynthesis.cancel()}catch(_){}
        return;
      }
      refresh();const timer=setInterval(refresh,60000);
      return()=>clearInterval(timer);
    },[profile,settings.repeat_minutes,settings.sound_enabled,settings.voice_enabled,settings.browser_notifications_enabled,soundUnlocked]);
    async function acknowledge(a,action='Acknowledged',minutes=0){
      const {data:{user}}=await client.auth.getUser();
      const {error}=await client.from('clinical_alert_acknowledgements').upsert({
        alert_key:a.key,alert_type:a.alert_type,source_id:a.source_id,patient_id:a.patient_id,action,
        snoozed_until:minutes?new Date(Date.now()+minutes*60000).toISOString():null,
        acknowledged_by:user?.id||profile?.id,acknowledged_at:new Date().toISOString()
      },{onConflict:'alert_key'});
      if(error)throw error;await refresh();
    }
    return {alerts,settings,setSettings,soundUnlocked,pushEnabled,unlockSound,toggleSound,requestNotifications,disableNotifications,refreshPushEnabled,runAudioDiagnostics,testClinicalAlert,testVitalsVoice,testDailyCareVoice,testClinicalTaskVoice,testSampleEscalationVoice,playCurrentLiveEscalation,refresh,acknowledge,setPage};
  }

