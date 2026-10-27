  // 2.18.174: one clear "Send Receipt" button for any Payment / Advance row (Guest Payments / Receipts, Accounts Reports).
  // Tap once -> "Yes, send" / "Cancel" (no accidental sends). The server sends the WhatsApp receipt + PDF to every
  // family contact (same as the automatic receipt) and records it in WhatsApp Inbox.
  function SendReceiptButton({transactionId,amountText=''}){
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
    if(stage==='confirm')return h('span',{style:{display:'inline-flex',gap:'6px',alignItems:'center'},onClick:stop},
      h('button',{...base,className:'btn btn-whatsapp',onClick:send},'✓ Yes, send'),
      h('button',{...base,className:'btn btn-secondary',onClick:e=>{stop(e);setStage('idle')}},'Cancel'));
    if(stage==='sending')return h('button',{...base,className:'btn btn-secondary',disabled:true},'Sending…');
    return h('span',{style:{display:'inline-flex',flexDirection:'column',gap:'2px'}},
      h('button',{...base,className:'btn btn-whatsapp',title:'Send the WhatsApp receipt (with PDF) to the family',onClick:e=>{stop(e);setStage('confirm')}},
        stage==='sent'?'✓ Sent · Send again':stage==='failed'?'↻ Try again':'📩 Send Receipt'),
      note?h('small',{style:{fontSize:'10.5px',color:stage==='failed'?'#b42318':'#2e7d4f',maxWidth:'180px',whiteSpace:'normal'}},note):null);
  }
