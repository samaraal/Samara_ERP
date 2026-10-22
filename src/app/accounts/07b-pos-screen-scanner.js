  // 2.18.68: HDFC swipe machine — scan the machine SCREEN live in the ERP camera (like QR reading; no uploads).
  // Step 1: TRANSACTION APPROVED screen · Step 2: VIEW FULL SUMMARY (MID / TID). Captures automatically when the
  // picture is steady; the server (pos-screen-scan) reads and checks everything. Only a passed scan can be saved.
  function PosScreenScanner({onClose,onVerified}){
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
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/pos-screen-scan`,{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.supabasePublishableKey,'Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({images})});
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
          result?.verified&&h('button',{type:'button',className:'btn',onClick:()=>{onVerified({scan_id:result.scan_id,...r});onClose();}},'Use this payment')))
      ,
      h('canvas',{ref:smallRef,style:{display:'none'}}),h('canvas',{ref:bigRef,style:{display:'none'}})
    ));
  }
