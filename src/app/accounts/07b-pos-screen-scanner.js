  // 2.18.68: HDFC swipe machine — scan the machine SCREEN live in the ERP camera (like QR reading; no uploads).
  // 2.18.70: reads like a QR scanner — a live frame is checked every ~1-2 s (server "probe"); the APPROVED screen and the
  // FULL SUMMARY screen are recognised by themselves, in any order. When both are read the full check runs and, if
  // verified, the window closes and the payment is filled in automatically (no buttons).
  function PosScreenScanner({onClose,onVerified,handoffToken}){
    const videoRef=React.useRef(null),streamRef=React.useRef(null),bigRef=React.useRef(null);
    const runRef=React.useRef(false),shotsRef=React.useRef({approved:'',summary:''}),startedRef=React.useRef(Date.now());
    const [error,setError]=React.useState(''),[ready,setReady]=React.useState(false);
    const [got,setGot]=React.useState({approved:false,summary:false}),[seen,setSeen]=React.useState(''),[slow,setSlow]=React.useState(false);
    const [phase,setPhase]=React.useState('camera'); // camera | reading | result
    const [result,setResult]=React.useState(null);
    function stop(){runRef.current=false;streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;}
    async function openCamera(){
      try{
        if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera is not supported on this browser. Please use the ERP in Chrome on the phone.');
        const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});
        streamRef.current=stream;
        if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play();setReady(true);runRef.current=true;startedRef.current=Date.now();loop();}
      }catch(e){setError(e.name==='NotAllowedError'?'Camera permission was refused. Allow the camera for the ERP and try again.':(e.message||'Unable to open the camera.'))}
    }
    React.useEffect(()=>{openCamera();try{document.body.classList.add('samara-pos-scan-open')}catch(_){}return()=>{stop();try{document.body.classList.remove('samara-pos-scan-open')}catch(_){}};},[]);
    function grab(max){
      const v=videoRef.current,c=bigRef.current;if(!v||!c||!v.videoWidth)return '';
      const scale=Math.min(1,max/Math.max(v.videoWidth,v.videoHeight));
      c.width=Math.round(v.videoWidth*scale);c.height=Math.round(v.videoHeight*scale);
      c.getContext('2d').drawImage(v,0,0,c.width,c.height);
      return c.toDataURL('image/jpeg',0.85);
    }
    async function authHeaders(){
      const {data:{session}}=await client.auth.getSession();
      if(!session)throw new Error('Your ERP session has expired. Please sign in again.');
      return {'Content-Type':'application/json','apikey':cfg.supabasePublishableKey,'Authorization':`Bearer ${session.access_token}`};
    }
    async function loop(){
      while(runRef.current){
        const img=grab(1400);
        if(img){
          try{
            const response=await fetch(`${cfg.supabaseUrl}/functions/v1/pos-screen-scan`,{method:'POST',headers:await authHeaders(),body:JSON.stringify({action:'probe',image:img})});
            const j=await response.json().catch(()=>({}));
            if(!runRef.current)break;
            if(response.status===401||response.status===403){setError(j.error||'Please sign in again.');stop();break;}
            if(j.success){
              setSeen(j.screen);
              if(j.complete&&(j.screen==='approved'||j.screen==='summary')&&!shotsRef.current[j.screen]){
                shotsRef.current={...shotsRef.current,[j.screen]:img};
                setGot({approved:!!shotsRef.current.approved,summary:!!shotsRef.current.summary});
                try{navigator.vibrate&&navigator.vibrate(80)}catch(_){}
              }
              if(shotsRef.current.approved&&shotsRef.current.summary){stop();readScreens([shotsRef.current.approved,shotsRef.current.summary]);break;}
            }
          }catch(_){/* network blip: keep trying */}
        }
        if(Date.now()-startedRef.current>25000)setSlow(true);
        await new Promise(r=>setTimeout(r,700));
      }
    }
    async function readScreens(images){
      setPhase('reading');setError('');
      try{
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/pos-screen-scan`,{method:'POST',headers:await authHeaders(),body:JSON.stringify(handoffToken?{images,handoff_token:handoffToken}:{images})});
        const j=await response.json().catch(()=>({}));
        if(!response.ok||j.success===false)throw new Error(j.error||'The machine screen could not be read. Please scan again.');
        if(j.verified){
          try{navigator.vibrate&&navigator.vibrate([60,60,120])}catch(_){}
          onVerified({scan_id:j.scan_id,handed_off:j.handed_off,...(j.result||{})});onClose();return;   // verified → close + auto entry
        }
        setResult(j);setPhase('result');
      }catch(e){setError(e.message||String(e));setPhase('result');setResult(null);}
    }
    function again(){
      shotsRef.current={approved:'',summary:''};setGot({approved:false,summary:false});setSeen('');setSlow(false);
      setResult(null);setError('');setPhase('camera');setReady(false);openCamera();
    }
    const r=result?.result||{};
    const box={background:'linear-gradient(135deg,#fff5fa,#ffe3ef)',border:'1px solid #f3c4d9',borderRadius:'14px',padding:'12px 14px'};
    const tick=(ok,label)=>h('div',{style:{fontSize:'15px',fontWeight:700,color:ok?'#16814d':'#8a5a70'}},(ok?'✓ ':'○ ')+label);
    const hint=!got.approved&&!got.summary?'Show the TRANSACTION APPROVED screen — keep the whole white box and the clock at the top in view.'
      :!got.approved?'Now go back to the TRANSACTION APPROVED screen (scroll up on the machine).'
      :'Now tap VIEW FULL SUMMARY on the machine so Sale Amount, MID and TID are visible.';
    return h('div',{className:'modal-backdrop camera-backdrop'},h('div',{className:'card modal camera-modal',style:{maxWidth:'560px'}},
      h('div',{className:'panel-head'},
        h('div',null,h('h3',null,'Scan HDFC swipe machine screen'),h('small',null,'Hold the phone over the machine — it reads by itself')),
        h('button',{type:'button',className:'close',onClick:()=>{stop();onClose();}},'×')),
      phase==='camera'&&h(React.Fragment,null,
        h('div',{style:{...box,marginBottom:'10px'}},
          tick(got.approved,'TRANSACTION APPROVED screen'),
          tick(got.summary,'FULL SUMMARY screen (MID / TID)'),
          h('div',{style:{fontSize:'13px',color:'#6b3a52',marginTop:'6px'}},hint),
          seen==='declined'&&h('div',{style:{fontSize:'13px',color:'#b3261e',fontWeight:700,marginTop:'4px'}},'The machine shows a DECLINED / failed payment — this cannot be recorded.'),
          slow&&h('div',{style:{fontSize:'12px',color:'#b3261e',marginTop:'4px'}},'Taking long? Hold 15–20 cm away, avoid light reflection on the machine screen, keep it steady.')),
        error&&h('div',{className:'message error'},error),
        h('div',{className:'camera-stage',style:{position:'relative'}},
          h('video',{ref:videoRef,playsInline:true,muted:true,className:'camera-video'}),
          ready&&h('div',{style:{position:'absolute',top:'8px',left:'8px',background:'rgba(22,129,77,.85)',color:'#fff',borderRadius:'10px',padding:'3px 8px',fontSize:'12px'}},'● Reading…'))
      ),
      phase==='reading'&&h('div',{style:{...box,textAlign:'center',padding:'28px'}},
        h('div',{style:{fontSize:'17px',fontWeight:700,color:'#b01867'}},'Both screens read — checking the payment…'),
        h('div',{style:{fontSize:'13px',color:'#6b3a52',marginTop:'6px'}},'A few seconds. Please wait.')),
      phase==='result'&&h(React.Fragment,null,
        error&&h('div',{className:'message error'},error),
        result&&h('div',{style:box},
          h('div',{style:{fontSize:'18px',fontWeight:800,color:'#b3261e'}},'✗ Not accepted — please check and scan again'),
          r.amount!=null&&h('div',{style:{fontSize:'24px',fontWeight:800,margin:'6px 0',color:'#5d1740'}},'₹'+Number(r.amount).toLocaleString('en-IN',{minimumFractionDigits:2})),
          h('ul',{style:{margin:'10px 0 0',paddingLeft:'0',listStyle:'none',fontSize:'13px'}},
            (result.checks||[]).map(c=>h('li',{key:c.key,style:{color:c.ok?'#16814d':'#b3261e',fontWeight:c.ok?400:700}},(c.ok?'✓ ':'✗ ')+c.text)))),
        h('div',{style:{display:'flex',gap:'8px',marginTop:'12px',justifyContent:'flex-end'}},
          h('button',{type:'button',className:'btn',onClick:again},'Scan again'))),
      h('canvas',{ref:bigRef,style:{display:'none'}})
    ));
  }

  // 2.18.69: "Scan with phone" — the laptop shows a one-time QR (SQL 272); the same staff member scans it with the phone,
  // scans the machine screen there, and the verified payment appears on the laptop by itself.
  async function loadSamaraQr(){
    if(window.SamaraQRCode)return window.SamaraQRCode;
    await new Promise((resolve,reject)=>{const sc=document.createElement('script');sc.src='./vendor/qrcode.bundle.js';sc.onload=resolve;sc.onerror=()=>reject(new Error('QR generator could not be loaded.'));document.head.appendChild(sc)});
    if(!window.SamaraQRCode)throw new Error('QR generator is unavailable.');
    return window.SamaraQRCode;
  }
  function PosPhoneHandoff({onClose,onVerified}){
    const [qr,setQr]=React.useState(''),[error,setError]=React.useState(''),[left,setLeft]=React.useState(600),[status,setStatus]=React.useState('Preparing…');
    const handoffRef=React.useRef(null),timerRef=React.useRef(null),doneRef=React.useRef(false);
    React.useEffect(()=>{
      let cancelled=false;
      (async()=>{
        try{
          const {data,error:e}=await client.rpc('create_pos_scan_handoff');
          if(e)throw new Error(e.message);
          const row=Array.isArray(data)?data[0]:data;if(!row?.token)throw new Error('Scan link could not be created.');
          handoffRef.current=row;
          const link=`${location.origin}${location.pathname}?pos_scan=${row.token}`;
          const lib=await loadSamaraQr();
          if(cancelled)return;
          setQr(lib.toDataURL(link,{errorCorrectionLevel:'M',size:300,margin:3}));setStatus('Waiting for the phone…');
          const expires=new Date(row.expires_at).getTime();
          timerRef.current=setInterval(async()=>{
            const sec=Math.max(0,Math.round((expires-Date.now())/1000));setLeft(sec);
            if(sec<=0){clearInterval(timerRef.current);setStatus('This QR has expired. Close and click Scan with phone again.');return;}
            if(doneRef.current)return;
            const {data:hf}=await client.from('pos_scan_handoffs').select('scan_id').eq('id',row.id).maybeSingle();
            if(hf?.scan_id&&!doneRef.current){
              doneRef.current=true;clearInterval(timerRef.current);
              const {data:sc,error:se}=await client.from('pos_screen_scans').select('id,status,amount,paid_by,rrn,transaction_id,approval_code,card_last4,utr,mid,tid,txn_time').eq('id',hf.scan_id).maybeSingle();
              if(se||!sc||sc.status!=='Verified'){setError(se?.message||'The scan could not be loaded. Close and try again.');return;}
              onVerified({scan_id:sc.id,amount:Number(sc.amount),paid_by:sc.paid_by,rrn:sc.rrn,transaction_id:sc.transaction_id,approval_code:sc.approval_code,card_last4:sc.card_last4,utr:sc.utr,mid:sc.mid,tid:sc.tid,txn_time:sc.txn_time});
              onClose();
            }
          },2000);
        }catch(e){setError(e.message||String(e));}
      })();
      return()=>{cancelled=true;if(timerRef.current)clearInterval(timerRef.current);};
    },[]);
    const mm=String(Math.floor(left/60)),ss=String(left%60).padStart(2,'0');
    return h('div',{className:'modal-backdrop'},h('div',{className:'card modal',style:{maxWidth:'460px',textAlign:'center'}},
      h('div',{className:'panel-head'},h('div',null,h('h3',null,'Scan with phone'),h('small',null,'The phone is used only as the camera')),h('button',{type:'button',className:'close',onClick:onClose},'×')),
      error&&h('div',{className:'message error'},error),
      h('ol',{style:{textAlign:'left',fontSize:'14px',color:'#5d1740',lineHeight:1.6,margin:'0 0 10px 18px',padding:0}},
        h('li',null,'Open the phone camera (or Google Lens) and scan this QR.'),
        h('li',null,'Sign in on the phone with your OWN ERP login (the same as this laptop), if asked.'),
        h('li',null,'Scan the machine: TRANSACTION APPROVED, then VIEW FULL SUMMARY.'),
        h('li',null,'The verified amount appears here by itself — then Save here.')),
      qr?h('img',{src:qr,alt:'Scan with phone QR',style:{width:'260px',height:'260px',border:'1px solid #f3c4d9',borderRadius:'12px'}}):h('div',{style:{padding:'40px'}},'Preparing QR…'),
      h('div',{style:{marginTop:'8px',fontWeight:700,color:'#b01867'}},status),
      qr&&left>0&&h('small',{className:'muted'},`QR works for ${mm}:${ss} more · one scan only · only for your login`)
    ));
  }
  // Phone side: opened from the laptop's QR (?pos_scan=…). Shows only the scanner, then "Sent to the laptop".
  function PosPhoneScanPage({token,onExit}){
    const [state,setState]=React.useState('checking'),[done,setDone]=React.useState(false);
    React.useEffect(()=>{(async()=>{
      try{const {data,error}=await client.rpc('check_pos_scan_handoff',{p_token:token});setState(error?'error':String(data||'error'));}catch(_){setState('error');}
    })();},[token]);
    const msg={not_found:'This scan link is not valid. Click Scan with phone on the laptop again.',other_user:'This QR was made on the laptop by another staff login. Sign out here and sign in with the same ERP login as the laptop.',used:'This QR has already been used. Click Scan with phone on the laptop again for a new payment.',expired:'This QR has expired (10 minutes). Click Scan with phone on the laptop again.',error:'The scan link could not be checked. Check the internet and open the QR again.'};
    const page={minHeight:'100vh',background:'linear-gradient(160deg,#fff5fa,#ffd6e7)',padding:'16px',boxSizing:'border-box'};
    if(done==='expired')return h('div',{style:page},h('div',{className:'card',style:{textAlign:'center',padding:'28px'}},
      h('h3',{style:{color:'#b3261e'}},'The laptop QR expired'),h('p',null,'The payment was verified but the laptop link had expired. On the laptop click Scan with phone again and scan the new QR.'),
      h('button',{type:'button',className:'btn secondary',onClick:onExit},'Open the ERP on this phone')));
    if(done)return h('div',{style:page},h('div',{className:'card',style:{textAlign:'center',padding:'28px'}},
      h('div',{style:{fontSize:'40px'}},'✓'),h('h2',{style:{color:'#16814d'}},'Sent to the laptop'),
      h('p',null,'The verified payment is now on the laptop. Finish and Save there. You can close this page.'),
      h('button',{type:'button',className:'btn secondary',onClick:onExit},'Open the ERP on this phone')));
    if(state==='ok')return h('div',{style:page},h(PosScreenScanner,{handoffToken:token,onClose:()=>setState(cur=>cur==='ok'?'stopped':cur),onVerified:res=>setDone(res?.handed_off===false?'expired':true)}));
    if(state==='stopped')return h('div',{style:page},h('div',{className:'card',style:{textAlign:'center',padding:'24px'}},
      h('h3',{style:{color:'#b01867'}},'Scan stopped'),h('p',null,'The camera is closed. Nothing was sent to the laptop.'),
      h('div',{style:{display:'flex',gap:'8px',justifyContent:'center',flexWrap:'wrap'}},
        h('button',{type:'button',className:'btn',onClick:()=>setState('ok')},'Scan again'),
        h('button',{type:'button',className:'btn secondary',onClick:onExit},'Open the ERP'))));
    return h('div',{style:page},h('div',{className:'card',style:{textAlign:'center',padding:'24px'}},
      h('h3',{style:{color:'#b01867'}},'Scan with phone'),
      h('p',null,state==='checking'?'Checking the scan link…':(msg[state]||msg.error)),
      state!=='checking'&&h('button',{type:'button',className:'btn secondary',onClick:onExit},'Open the ERP')));
  }
