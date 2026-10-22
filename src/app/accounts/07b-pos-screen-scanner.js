  // 2.18.68: HDFC swipe machine — scan the machine SCREEN live in the ERP camera (like QR reading; no uploads).
  // Step 1: TRANSACTION APPROVED screen · Step 2: VIEW FULL SUMMARY (MID / TID). Captures automatically when the
  // picture is steady; the server (pos-screen-scan) reads and checks everything. Only a passed scan can be saved.
  function PosScreenScanner({onClose,onVerified,handoffToken}){
    const videoRef=React.useRef(null),streamRef=React.useRef(null),smallRef=React.useRef(null),bigRef=React.useRef(null);
    const loopRef=React.useRef(null),stateRef=React.useRef({prev:null,stable:0,needChange:false,lastShot:0,step:1,shots:[]});
    const [error,setError]=React.useState(''),[ready,setReady]=React.useState(false);
    const [step,setStep]=React.useState(1),[shots,setShots]=React.useState([]);
    const [phase,setPhase]=React.useState('camera'); // camera | reading | result
    const [result,setResult]=React.useState(null),[steady,setSteady]=React.useState(0);
    function stop(){if(loopRef.current){clearInterval(loopRef.current);loopRef.current=null}streamRef.current?.getTracks().forEach(t=>t.stop());streamRef.current=null;}
    React.useEffect(()=>{
      let cancelled=false;
      (async()=>{
        try{
          if(!navigator.mediaDevices?.getUserMedia)throw new Error('Camera is not supported on this browser. Please use the ERP in Chrome on the phone.');
          const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});
          if(cancelled){stream.getTracks().forEach(t=>t.stop());return}
          streamRef.current=stream;
          if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play();setReady(true);startLoop();}
        }catch(e){setError(e.name==='NotAllowedError'?'Camera permission was refused. Allow the camera for the ERP and try again.':(e.message||'Unable to open the camera.'))}
      })();
      return()=>{cancelled=true;stop();};
    },[]);
    function grab(){
      const v=videoRef.current,c=bigRef.current;if(!v||!c||!v.videoWidth)return '';
      const scale=Math.min(1,1600/Math.max(v.videoWidth,v.videoHeight));
      c.width=Math.round(v.videoWidth*scale);c.height=Math.round(v.videoHeight*scale);
      c.getContext('2d').drawImage(v,0,0,c.width,c.height);
      return c.toDataURL('image/jpeg',0.85);
    }
    function takeShot(){
      const st=stateRef.current;if(st.shots.length>=2)return;
      const img=grab();if(!img)return;
      st.shots=[...st.shots,img];st.lastShot=Date.now();st.needChange=true;st.stable=0;
      setShots(st.shots);
      try{navigator.vibrate&&navigator.vibrate(80)}catch(_){}
      if(st.shots.length===1){st.step=2;setStep(2);}
      else{stop();readScreens(st.shots);}
    }
    function startLoop(){
      loopRef.current=setInterval(()=>{
        const v=videoRef.current,c=smallRef.current,st=stateRef.current;if(!v||!c||!v.videoWidth||st.shots.length>=2)return;
        c.width=64;c.height=48;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(v,0,0,64,48);
        const d=ctx.getImageData(0,0,64,48).data,g=new Float32Array(64*48);let sum=0;
        for(let i=0;i<g.length;i++){g[i]=d[i*4]*0.299+d[i*4+1]*0.587+d[i*4+2]*0.114;sum+=g[i];}
        const mean=sum/g.length;let varr=0,diff=0;for(let i=0;i<g.length;i++){varr+=(g[i]-mean)**2;if(st.prev)diff+=Math.abs(g[i]-st.prev[i]);}
        const contrast=Math.sqrt(varr/g.length);diff=st.prev?diff/g.length:99;st.prev=g;
        if(st.needChange){ if(diff>10&&Date.now()-st.lastShot>600)st.needChange=false; st.stable=0; setSteady(0); return; } // wait until the screen changes (tap VIEW FULL SUMMARY)
        if(diff<3.5&&contrast>22&&mean>40){st.stable++;}else st.stable=0;
        setSteady(Math.min(100,Math.round(st.stable/6*100)));
        if(st.stable>=6&&Date.now()-st.lastShot>1500)takeShot(); // ~1.5 s steady
      },250);
    }
    async function readScreens(images){
      setPhase('reading');setError('');
      try{
        const {data:{session}}=await client.auth.getSession();
        if(!session)throw new Error('Your ERP session has expired. Please sign in again.');
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/pos-screen-scan`,{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.supabasePublishableKey,'Authorization':`Bearer ${session.access_token}`},body:JSON.stringify(handoffToken?{images,handoff_token:handoffToken}:{images})});
        const j=await response.json().catch(()=>({}));
        if(!response.ok||j.success===false)throw new Error(j.error||'The machine screen could not be read. Please scan again.');
        setResult(j);setPhase('result');
      }catch(e){setError(e.message||String(e));setPhase('result');setResult(null);}
    }
    function again(){
      stateRef.current={prev:null,stable:0,needChange:false,lastShot:0,step:1,shots:[]};
      setShots([]);setStep(1);setResult(null);setError('');setPhase('camera');setSteady(0);
      (async()=>{try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});streamRef.current=stream;if(videoRef.current){videoRef.current.srcObject=stream;await videoRef.current.play();setReady(true);startLoop();}}catch(e){setError(e.message||'Unable to open the camera.')}})();
    }
    const r=result?.result||{};
    const fmtTime=t=>{try{return t?new Date(t).toLocaleString('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}).replace(/\//g,'-'):'—'}catch(_){return '—'}};
    const box={background:'linear-gradient(135deg,#fff5fa,#ffe3ef)',border:'1px solid #f3c4d9',borderRadius:'14px',padding:'12px 14px'};
    return h('div',{className:'modal-backdrop camera-backdrop'},h('div',{className:'card modal camera-modal',style:{maxWidth:'560px'}},
      h('div',{className:'panel-head'},
        h('div',null,h('h3',null,'Scan HDFC swipe machine screen'),h('small',null,'Hold the phone over the machine — it captures by itself')),
        h('button',{type:'button',className:'close',onClick:()=>{stop();onClose();}},'×')),
      phase==='camera'&&h(React.Fragment,null,
        h('div',{style:{...box,marginBottom:'10px'}},
          h('div',{style:{fontWeight:700,color:'#b01867',fontSize:'16px'}},step===1?'Step 1 of 2 · TRANSACTION APPROVED screen':'Step 2 of 2 · Tap "VIEW FULL SUMMARY" on the machine'),
          h('div',{style:{fontSize:'13px',color:'#6b3a52',marginTop:'4px'}},step===1
            ?'Show the screen with the green TRANSACTION APPROVED, the amount and RRN. Keep the whole white box and the clock at the top inside the frame.'
            :'Scroll the machine so Sale Amount, UTR No, MID and TID are visible, then hold steady.')),
        error&&h('div',{className:'message error'},error),
        h('div',{className:'camera-stage',style:{position:'relative'}},
          h('video',{ref:videoRef,playsInline:true,muted:true,className:'camera-video'}),
          ready&&h('div',{style:{position:'absolute',left:'8px',right:'8px',bottom:'8px',height:'8px',background:'rgba(255,255,255,.6)',borderRadius:'4px',overflow:'hidden'}},
            h('div',{style:{width:steady+'%',height:'100%',background:'#16814d',transition:'width .2s'}}))),
        h('div',{style:{display:'flex',gap:'8px',marginTop:'10px',alignItems:'center',flexWrap:'wrap'}},
          shots.map((s,i)=>h('img',{key:i,src:s,alt:'Screen '+(i+1),style:{height:'64px',borderRadius:'8px',border:'2px solid #16814d'}})),
          h('span',{style:{flex:1}}),
          h('button',{type:'button',className:'btn secondary',disabled:!ready,onClick:takeShot},'Capture now'))
      ),
      phase==='reading'&&h('div',{style:{...box,textAlign:'center',padding:'28px'}},
        h('div',{style:{fontSize:'17px',fontWeight:700,color:'#b01867'}},'Reading and checking the machine screen…'),
        h('div',{style:{fontSize:'13px',color:'#6b3a52',marginTop:'6px'}},'A few seconds. Please wait.')),
      phase==='result'&&h(React.Fragment,null,
        error&&h('div',{className:'message error'},error),
        result&&h('div',{style:box},
          h('div',{style:{fontSize:'18px',fontWeight:800,color:result.verified?'#16814d':'#b3261e'}},result.verified?'✓ Verified — HDFC swipe machine payment':'✗ Not accepted — please check and scan again'),
          r.amount!=null&&h('div',{style:{fontSize:'28px',fontWeight:800,margin:'6px 0',color:'#5d1740'}},'₹'+Number(r.amount).toLocaleString('en-IN',{minimumFractionDigits:2})),
          h('div',{style:{fontSize:'13px',color:'#5d1740',lineHeight:1.6}},
            h('div',null,'Paid by: ',h('b',null,r.paid_by==='UPI on machine'?'UPI (QR on the machine)':'Card')),
            h('div',null,'Payment time: ',h('b',null,fmtTime(r.txn_time))),
            h('div',null,'RRN: ',h('b',null,r.rrn||'—'),' · Txn ID: ',h('b',null,r.transaction_id||'—')),
            r.approval_code&&h('div',null,'Approval code: ',h('b',null,r.approval_code),r.card_last4?' · Card ending '+r.card_last4:''),
            h('div',null,'Machine: MID ',h('b',null,r.mid||'—'),' · TID ',h('b',null,r.tid||'—'))),
          h('ul',{style:{margin:'10px 0 0',paddingLeft:'0',listStyle:'none',fontSize:'13px'}},
            (result.checks||[]).map(c=>h('li',{key:c.key,style:{color:c.ok?'#16814d':'#b3261e',fontWeight:c.ok?400:700}},(c.ok?'✓ ':'✗ ')+c.text)))),
        h('div',{style:{display:'flex',gap:'8px',marginTop:'12px',justifyContent:'flex-end'}},
          h('button',{type:'button',className:'btn secondary',onClick:again},'Scan again'),
          result?.verified&&h('button',{type:'button',className:'btn',onClick:()=>{onVerified({scan_id:result.scan_id,...r});onClose();}},handoffToken?'Done':'Use this payment')),
        result?.verified&&handoffToken&&h('div',{className:'message success',style:{marginTop:'10px',fontSize:'15px'}},result.handed_off?'✓ Sent to the laptop. The amount now appears there — finish and Save on the laptop.':'Verified, but the laptop link had expired. Click Scan with phone on the laptop again.'))
      ,
      h('canvas',{ref:smallRef,style:{display:'none'}}),h('canvas',{ref:bigRef,style:{display:'none'}})
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
    if(done)return h('div',{style:page},h('div',{className:'card',style:{textAlign:'center',padding:'28px'}},
      h('div',{style:{fontSize:'40px'}},'✓'),h('h2',{style:{color:'#16814d'}},'Sent to the laptop'),
      h('p',null,'The verified payment is now on the laptop. Finish and Save there. You can close this page.'),
      h('button',{type:'button',className:'btn secondary',onClick:onExit},'Open the ERP on this phone')));
    if(state==='ok')return h('div',{style:page},h(PosScreenScanner,{handoffToken:token,onClose:()=>{},onVerified:()=>setDone(true)}));
    return h('div',{style:page},h('div',{className:'card',style:{textAlign:'center',padding:'24px'}},
      h('h3',{style:{color:'#b01867'}},'Scan with phone'),
      h('p',null,state==='checking'?'Checking the scan link…':(msg[state]||msg.error)),
      state!=='checking'&&h('button',{type:'button',className:'btn secondary',onClick:onExit},'Open the ERP')));
  }
