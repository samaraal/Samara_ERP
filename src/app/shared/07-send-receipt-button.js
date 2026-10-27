  // 2.18.174: one clear "Send Receipt" button for any Payment / Advance row (Guest Payments / Receipts, Accounts Reports).
  // Tap once -> "Yes, send" / "Cancel" (no accidental sends). The server sends the WhatsApp receipt + PDF to every
  // family contact (same as the automatic receipt) and records it in WhatsApp Inbox.
  function SendReceiptButton({transactionId,amountText='',compact=false}){
    const [stage,setStage]=React.useState('idle'); // idle | confirm | sending | sent | failed
    const [note,setNote]=React.useState('');
    React.useEffect(()=>{if(stage!=='confirm')return;const t=setTimeout(()=>setStage('idle'),8000);return()=>clearTimeout(t)},[stage]);
    const stop=e=>{if(e){e.stopPropagation();e.preventDefault();}};
    const send=async e=>{
      stop(e);setStage('sending');setNote('');
      try{
        const {data:{session}}=await client.auth.getSession();
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/staff-payment-request`,{method:'POST',
          headers:{'Content-Type':'application/json','apikey':cfg.supabasePublishableKey,'Authorization':`Bearer ${session?.access_token||''}`},
          body:JSON.stringify({action:'resend_receipt',transaction_id:transactionId})});
        const result=await response.json().catch(()=>({}));
        if(response.ok&&result.success){
          setStage('sent');setNote(`Sent to ${result.sent||1} family contact(s)`);
          showSamaraActionToast('success','Receipt sent on WhatsApp',`${amountText?amountText+' — ':''}receipt${result.pdf_note?'':' with PDF'} sent to ${result.sent||1} family contact(s).${result.pdf_note?' '+result.pdf_note:''}`);
          writeAuditEvent('Payment Receipt Resent','Billing',transactionId,{sent:result.sent||1},'Success');
        }else{
          const t=result.error||'WhatsApp did not accept the receipt.';
          setStage('failed');setNote(t);showSamaraActionToast('error','Receipt not sent',t);
          writeAuditEvent('Payment Receipt Resent','Billing',transactionId,{error:t},'Failed');
        }
      }catch(error){
        const t=error?.message||'Network problem. Please try again.';
        setStage('failed');setNote(t);showSamaraActionToast('error','Receipt not sent',t);
      }
    };
    const base={type:'button',style:{padding:'6px 10px',fontSize:'12px',whiteSpace:'nowrap',borderRadius:'999px'}};
    // 2.18.176: compact = round WhatsApp icon (used in the Pending Payments breakdown)
    if(compact){
      const wa=h('svg',{viewBox:'0 0 24 24',width:16,height:16,'aria-hidden':'true',fill:'#fff'},h('path',{d:'M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.27-1.38a9.9 9.9 0 0 0 4.77 1.22c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm5.8 14.03c-.24.68-1.4 1.3-1.93 1.35-.5.05-.97.23-3.27-.68-2.76-1.09-4.5-3.9-4.64-4.08-.13-.18-1.11-1.48-1.11-2.82s.7-2 .95-2.27c.25-.27.54-.34.72-.34h.52c.17 0 .39-.06.61.47.24.55.79 1.9.86 2.04.07.14.11.3.02.48-.09.18-.14.3-.27.46-.14.16-.29.36-.41.48-.14.14-.28.29-.12.56.16.27.71 1.17 1.52 1.89 1.04.93 1.92 1.22 2.19 1.36.27.14.43.11.59-.07.16-.18.68-.79.86-1.06.18-.27.36-.23.61-.14.25.09 1.59.75 1.86.89.27.14.45.2.52.32.07.11.07.66-.17 1.34z'}));
      const round={type:'button',style:{width:'30px',height:'30px',borderRadius:'50%',border:'none',display:'inline-flex',alignItems:'center',justifyContent:'center',cursor:'pointer',padding:0}};
      if(stage==='confirm')return h('span',{style:{display:'inline-flex',gap:'4px',alignItems:'center'},onClick:stop},
        h('small',{style:{color:'#7a1247',fontWeight:700}},'Send?'),
        h('button',{...base,className:'btn btn-whatsapp',style:{...base.style,padding:'4px 8px'},onClick:send},'✓ Yes'),
        h('button',{...base,className:'btn btn-secondary',style:{...base.style,padding:'4px 8px'},onClick:e=>{stop(e);setStage('idle')}},'✕'));
      if(stage==='sending')return h('small',{style:{color:'#8a5a70'}},'Sending…');
      return h('span',{style:{display:'inline-flex',alignItems:'center',gap:'4px'}},
        h('button',{...round,style:{...round.style,background:stage==='failed'?'#b42318':'#25D366'},title:stage==='sent'?(note+' — tap to send again'):stage==='failed'?('Not sent: '+note+' — tap to try again'):'Send receipt with PDF on WhatsApp','aria-label':'Send receipt on WhatsApp',onClick:e=>{stop(e);setStage('confirm')}},wa),
        stage==='sent'?h('small',{style:{color:'#2e7d4f',fontWeight:700}},'✓ Sent'):stage==='failed'?h('small',{style:{color:'#b42318'}},'Not sent'):null);
    }
    if(stage==='confirm')return h('span',{style:{display:'inline-flex',gap:'6px',alignItems:'center'},onClick:stop},
      h('button',{...base,className:'btn btn-whatsapp',onClick:send},'✓ Yes, send'),
      h('button',{...base,className:'btn btn-secondary',onClick:e=>{stop(e);setStage('idle')}},'Cancel'));
    if(stage==='sending')return h('button',{...base,className:'btn btn-secondary',disabled:true},'Sending…');
    return h('span',{style:{display:'inline-flex',flexDirection:'column',gap:'2px'}},
      h('button',{...base,className:'btn btn-whatsapp',title:'Send the WhatsApp receipt (with PDF) to the family',onClick:e=>{stop(e);setStage('confirm')}},
        stage==='sent'?'✓ Sent · Send again':stage==='failed'?'↻ Try again':'📩 Send Receipt'),
      note?h('small',{style:{fontSize:'10.5px',color:stage==='failed'?'#b42318':'#2e7d4f',maxWidth:'180px',whiteSpace:'normal'}},note):null);
  }
