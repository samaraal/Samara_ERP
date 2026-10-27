  function BillingPayments({profile}){
    const [activePatients]=usePatients();
    // Payments and financial history remain available after discharge.
    const [financialPatients,setFinancialPatients]=React.useState([]);
    const [patientListLoading,setPatientListLoading]=React.useState(true);
    const [patientListError,setPatientListError]=React.useState('');
    const [patientScope,setPatientScope]=React.useState('active');
    const [patientSearch,setPatientSearch]=React.useState('');
    const patients=financialPatients.length?financialPatients:activePatients;
    React.useEffect(()=>{
      let cancelled=false;
      (async()=>{
        const {data,error}=await client.from('patients').select('*').order('full_name');
        if(!cancelled){setPatientListLoading(false);setPatientListError(error?'Patient list could not be loaded. Refresh this page to retry.':'');if(!error)setFinancialPatients(data||[]);}
      })();
      const ch=client.channel(`accounts-all-patients-${Math.random()}`)
        .on('postgres_changes',{event:'*',schema:'public',table:'patients'},async()=>{
          const {data,error}=await client.from('patients').select('*').order('full_name');
          if(!cancelled){setPatientListError(error?'Patient list could not be refreshed. Refresh this page to retry.':'');if(!error)setFinancialPatients(data||[]);}
        }).subscribe();
      return()=>{cancelled=true;client.removeChannel(ch)};
    },[]);
    const [rows,setRows]=React.useState([]);
    // 2.18.175: Guest-wise pending payments read the WHOLE ledger (the list above is limited to the latest 1,000 entries)
    const [ledgerAll,setLedgerAll]=React.useState({loading:true,rows:[],error:''});
    const [openGuest,setOpenGuest]=React.useState('');
    const [openGuestAll,setOpenGuestAll]=React.useState(false);
    const [patientLedger,setPatientLedger]=React.useState({patientId:null,rows:[],loading:true,error:''});
    const [loading,setLoading]=React.useState(true);
    const [saving,setSaving]=React.useState(false);
    const [message,setMessage]=React.useState('');
    const [toast,setToast]=React.useState(null);
    const [lastVoucherNo,setLastVoucherNo]=React.useState('');
    const [lastPaymentReceipt,setLastPaymentReceipt]=React.useState(null);
    const [dailyPayableSent,setDailyPayableSent]=React.useState(false);
    const [dailyPayableChecking,setDailyPayableChecking]=React.useState(false);
    const [paymentRequest,setPaymentRequest]=React.useState(null);
    const [paymentRequestBusy,setPaymentRequestBusy]=React.useState(false);
    const [paymentWhatsAppBusy,setPaymentWhatsAppBusy]=React.useState(false);
    const [paymentWhatsAppStatus,setPaymentWhatsAppStatus]=React.useState(null);
    const [advancePaymentModal,setAdvancePaymentModal]=React.useState(false);
    const [advancePaymentAmount,setAdvancePaymentAmount]=React.useState('');
    const [paymentWorkspace,setPaymentWorkspace]=React.useState(false);
    const [refundRequest,setRefundRequest]=React.useState(null);
    const [refundLoading,setRefundLoading]=React.useState(false);
    const [activeAccountantPresent,setActiveAccountantPresent]=React.useState(false);
    const [refundForm,setRefundForm]=React.useState({
      amount:'',confirm_amount:'',payment_mode:'UPI',payment_reference:'',accounts_remarks:'',
      admin_confirm_amount:'',admin_remarks:'',admin_confirmed:false
    });
    const canEnter=['Admin','Manager','Accounts'].includes(profile?.role);
    const canDiscount=profile?.role==='Admin';
    const financialVerifierRole=activeAccountantPresent?'Accounts':'Admin';
    const canVerifyDischargeRefund=profile?.role===financialVerifierRole;

    const [dischargeTarget,setDischargeTarget]=React.useState(()=>{
      try{return JSON.parse(sessionStorage.getItem('samara_discharge_payment_target')||'null')}catch(_error){return null}
    });

    // 2.17.9: "Receive Payment" from Discharged – Dues Pending opens Payments with that Guest selected.
    const [guestFromDues]=React.useState(()=>{
      try{const v=sessionStorage.getItem('samara-payment-patient')||'';sessionStorage.removeItem('samara-payment-patient');return v}catch(_error){return ''}
    });
    const [patientFilter,setPatientFilter]=React.useState(dischargeTarget?.patient_id||guestFromDues||'');
    const [dashboardPaymentFocus,setDashboardPaymentFocus]=React.useState(()=>{
      try{
        const value=sessionStorage.getItem('samara-payment-filter')||'';
        sessionStorage.removeItem('samara-payment-filter');
        return value==='outstanding'?'outstanding':'';
      }catch(_error){return ''}
    });
    const chargeReadiness=useChargeReadiness(patientFilter);
    const ledgerReady=patientLedger.patientId===patientFilter&&!patientLedger.loading&&!patientLedger.error;
    const clearanceBlocked=!ledgerReady||chargeReadiness.loading||!!chargeReadiness.error||chargeReadiness.rows.length>0;
    const [quickView,setQuickView]=React.useState(dischargeTarget?'Complete Transaction History':'Pending Bills');
    const [form,setForm]=React.useState({
      patient_id:dischargeTarget?.patient_id||guestFromDues||'',
      transaction_type:'Payment',
      category:'Final Settlement',
      amount:'',
      payment_mode:'Cash',
      payment_reference:'',
      pos_paid_by:'Card',pos_approval:'',pos_last4:'',pos_scan:null,pos_typed:false,
      description:'',
      closure_remarks:'All payments received and final account settled.'
    });

    const patientQuery=patientSearch.trim().toLowerCase();
    const matchingPatients=patients.filter(p=>
      (patientScope==='all'||(patientScope==='inactive'?p.is_active===false:p.is_active!==false))&&
      (patientQuery.length<3||`${p.full_name||''} ${p.patient_id||''}`.toLowerCase().includes(patientQuery))
    );
    // Keep a selected resident visible when the search is refined or a discharge target opens.
    const selectablePatients=[...matchingPatients,...patients.filter(p=>
      [patientFilter,form.patient_id].includes(p.id)&&!matchingPatients.some(m=>m.id===p.id)
    )];
    function choosePaymentPatient(value){
      setPatientFilter(value);
      setForm(current=>({...current,patient_id:value}));
    }
    function patientSearchFields(prefix){return h(React.Fragment,null,
      h('div',{className:'field'},h('label',{htmlFor:prefix+'-scope'},'Patient status'),
        h('select',{id:prefix+'-scope',value:patientScope,disabled:!!dischargeTarget,onChange:e=>{setPatientScope(e.target.value);choosePaymentPatient('');}},
          h('option',{value:'active'},'Active patients'),h('option',{value:'inactive'},'Inactive / Discharged patients'),h('option',{value:'all'},'All patients'))),
      h('div',{className:'field'},h('label',{htmlFor:prefix+'-search'},'Search patient name / ID'),
        h('input',{id:prefix+'-search',type:'search',value:patientSearch,disabled:!!dischargeTarget,placeholder:'Type at least 3 characters',onChange:e=>setPatientSearch(e.target.value)}),
        h('small',{role:'status'},patientListLoading?'Loading patients…':patientListError||
          (patientQuery.length>0&&patientQuery.length<3?'Type at least 3 characters to filter patients.':matchingPatients.length?`${matchingPatients.length} matching patient(s)`:'No patients match this status and search.')))
    );}

    const isAutoVoucherTransaction=
      ['Cash','Card Payment'].includes(form.payment_mode) &&
      ['Payment','Advance','Refund'].includes(form.transaction_type);

    React.useEffect(()=>{
      if(!isAutoVoucherTransaction)setLastVoucherNo('');
    },[form.payment_mode,form.transaction_type]);
    // 2.18.67: Card Payment = the HDFC swipe machine (Mosambee POS). Payment / Advance carry the slip's approval code / RRN.
    const isPosEntry=form.payment_mode==='Card Payment'&&['Payment','Advance'].includes(form.transaction_type);
    const posApprovalClean=String(form.pos_approval||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
    // 2.18.68: the payment comes from a live scan of the machine screen; typed slip details are Admin only.
    const [posScannerOpen,setPosScannerOpen]=React.useState(false);
    const [posPhoneOpen,setPosPhoneOpen]=React.useState(false); // 2.18.69: Scan with phone (laptop shows QR)
    const posUseScan=isPosEntry&&!form.pos_typed;
    function openPosScanner(mode='camera'){
      if(!form.patient_id){
        const text='Select a patient before scanning the swipe machine.';
        setMessage(text);notify('error','Patient required',text);return;
      }
      if(!['Payment','Advance'].includes(form.transaction_type)){
        const text='Select Payment or Advance before scanning the swipe machine.';
        setMessage(text);notify('error','Transaction type required',text);return;
      }
      setMessage('');
      if(mode==='phone')setPosPhoneOpen(true);else setPosScannerOpen(true);
    }
    // 2.18.70: verified scan → amount filled; if the Guest is already selected the payment is SAVED automatically.
    const posAutoSaveRef=React.useRef(false);
    const posFormRef=React.useRef(form);posFormRef.current=form; // latest form even inside the phone-scan waiting window
    function applyPosScan(res){
      setLastVoucherNo('');
      const cur=posFormRef.current;
      const autoSave=!!cur.patient_id&&['Payment','Advance'].includes(cur.transaction_type)&&cur.payment_mode==='Card Payment';
      posAutoSaveRef.current=autoSave;
      setForm(f=>({...f,pos_scan:res,amount:String(res.amount)}));
      notify('success','Machine screen verified',`₹${Number(res.amount).toLocaleString('en-IN',{minimumFractionDigits:2})} · ${res.paid_by==='UPI on machine'?'UPI':'Card'} · RRN ${res.rrn}. ${autoSave?'Saving the payment automatically…':'Select the Guest and Save.'}`);
    }
    React.useEffect(()=>{
      if(posAutoSaveRef.current&&form.pos_scan?.scan_id&&Number(form.amount)===Number(form.pos_scan.amount)&&!saving){
        posAutoSaveRef.current=false;
        savePaymentAndPossiblyClose({preventDefault(){}});
      }
    },[form.pos_scan,form.amount]);



    function notify(type,title,text){
      showSamaraActionToast(type,title,text);
      setToast({type,title,text});
      setTimeout(()=>setToast(null),5000);
    }

    function openAdvancePaymentModal(){
      if(!patientFilter){notify('error','Select patient','Select a patient before creating an online payment request.');return}
      setAdvancePaymentAmount('');setAdvancePaymentModal(true);
    }
    async function createOnlinePaymentRequest(kind='outstanding',advanceAmount=null){
      if(!patientFilter){notify('error','Select patient','Select a patient before creating an online payment request.');return}
      if(kind==='outstanding'&&pendingBills<1){notify('error','No outstanding amount','This patient has no amount currently payable.');return}
      let amount=kind==='outstanding'?pendingBills:Number(String(advanceAmount??'').replace(/,/g,'').trim());
      if(kind==='advance'&&(!Number.isFinite(amount)||amount<1||amount>500000)){notify('error','Invalid amount','Enter an advance amount between ₹1 and ₹5,00,000.');return}
      if(kind==='advance')setAdvancePaymentModal(false);
      setPaymentRequestBusy(true);setPaymentWorkspace(true);
      try{
        const {data:{session}}=await client.auth.getSession();
        if(!session)throw new Error('Your ERP session has expired. Please sign in again.');
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/staff-payment-request`,{
          method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.supabasePublishableKey,'Authorization':`Bearer ${session.access_token}`},
          body:JSON.stringify({action:'create',patient_id:patientFilter,payment_type:kind,amount:Number(amount)})
        });
        const result=await response.json().catch(()=>({}));
        if(!response.ok||result.success===false)throw new Error(result.error||'Payment request could not be created.');
        setPaymentRequest(result);setPaymentWorkspace(true);
        if(result.contact_prefilled===false)notify('warning','Payment link created – no mobile on file',`No active family mobile is registered for this patient, so Razorpay will ask the payer for a mobile number. Add the family mobile in Family Portal access (or set SAMARA_PAYMENT_CONTACT on the server) and create a new link to skip that step.`);
        else notify('success','Payment request created',`${kind==='advance'?'Advance':'Outstanding'} payment request for ${money(result.amount||amount)} is ready.${result.contact_masked?` Payer mobile ${result.contact_masked} is pre-filled, so Razorpay will not ask for it.`:''}`);
      }catch(error){notify('error','Payment request failed',error.message||String(error))}
      finally{setPaymentRequestBusy(false)}
    }

    async function ensurePaymentQr(){
      if(window.SamaraQRCode)return window.SamaraQRCode;
      await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='./vendor/qrcode.bundle.js';script.onload=resolve;script.onerror=()=>reject(new Error('QR generator could not be loaded.'));document.head.appendChild(script)});
      if(!window.SamaraQRCode)throw new Error('QR generator is unavailable.');
      return window.SamaraQRCode;
    }

    async function showPaymentQr(){
      if(!paymentRequest?.id)return;
      const w=samaraPrintBar(window.open('','_blank','width=520,height=720'));
      if(!w){notify('error','QR could not be displayed','Allow pop-ups to display the payment QR code.');return}
      w.document.write(`<!doctype html><html><head><title>Samara Payment QR</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial,sans-serif;text-align:center;padding:24px;color:#5d1740;background:#fff7fb}main{max-width:440px;margin:auto;background:#fff;padding:28px;border-radius:20px;box-shadow:0 10px 35px #b0186720}h1{color:#b01867}.wait{font-size:18px;line-height:1.5}.spin{width:44px;height:44px;border:5px solid #f7d9e8;border-top-color:#b01867;border-radius:50%;margin:28px auto;animation:s 1s linear infinite}@keyframes s{to{transform:rotate(360deg)}}</style></head><body><main><h1>Samara Assisted Living</h1><div class="spin"></div><p class="wait">Preparing direct UPI Scan & Pay QR…<br>Please wait for a moment.</p></main></body></html>`);w.document.close();
      try{
        const {data:{session}}=await client.auth.getSession();
        if(!session)throw new Error('Your ERP session has expired. Please sign in again.');
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/staff-payment-request`,{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.supabasePublishableKey,'Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({action:'create_qr',request_id:paymentRequest.id})});
        const result=await response.json().catch(()=>({}));
        if(!response.ok||result.success===false||!result.qr_image_url){
          // Razorpay's QR Codes API is not enabled on every account (it answers HTTP 400 "The requested URL was not found on the server").
          // Fall back to a locally generated QR of the secure Razorpay payment link, so staff can still show a scannable code.
          const serverError=result.error||'Direct UPI QR could not be created.';
          if(!paymentRequest.payment_url)throw new Error(serverError);
          console.warn('[Samara payments] Razorpay QR unavailable, using payment-link QR fallback:',serverError);
          const qr=await ensurePaymentQr();
          const linkQr=qr.toDataURL(paymentRequest.payment_url,{errorCorrectionLevel:'M',size:340,margin:4});
          w.document.open();
          w.document.write(`<!doctype html><html><head><title>Samara Payment QR</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial,sans-serif;text-align:center;padding:24px;color:#5d1740;background:#fff7fb}main{max-width:440px;margin:auto;background:#fff;padding:24px;border-radius:20px;box-shadow:0 10px 35px #b0186720}img{width:min(340px,86vw);height:auto}h1{color:#b01867}.amt{font-size:34px;font-weight:800}.small{font-size:13px;color:#765;line-height:1.45}.upi{font-weight:700;color:#16814d}.link{font-size:12px;word-break:break-all;color:#8a2a5c}</style></head><body><main><h1>Samara Assisted Living</h1><p class="upi">Scan &amp; Pay Securely</p><div class="amt">${money(paymentRequest.amount)}</div><p>${paymentRequest.patient_name||''}<br>${paymentRequest.payment_type==='advance'?'Advance Payment':'Outstanding Payment'}</p><img src="${linkQr}" alt="Razorpay payment link QR"><p class="small">Scan with the phone camera or Google Lens to open the secure Razorpay page, then pay by UPI (Google Pay, PhonePe, Paytm), card or net banking.<br>Amount and Samara payment reference are fixed for this request.</p><p class="link">${paymentRequest.payment_url}</p></main></body></html>`);w.document.close();
          notify('warning','Payment-link QR shown','Razorpay QR Codes is not yet enabled on the Samara Razorpay account, so a QR of the payment link is shown. Razorpay will ask the payer for a mobile number until QR Codes is enabled.');
          return;
        }
        setPaymentRequest(prev=>prev?{...prev,razorpay_qr_id:result.qr_id,razorpay_qr_image_url:result.qr_image_url}:prev);
        w.document.open();
        w.document.write(`<!doctype html><html><head><title>Samara Direct UPI QR</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial,sans-serif;text-align:center;padding:24px;color:#5d1740;background:#fff7fb}main{max-width:440px;margin:auto;background:#fff;padding:24px;border-radius:20px;box-shadow:0 10px 35px #b0186720}img{width:min(340px,86vw);height:auto}h1{color:#b01867}.amt{font-size:34px;font-weight:800}.small{font-size:13px;color:#765;line-height:1.45}.upi{font-weight:700;color:#16814d}</style></head><body><main><h1>Samara Assisted Living</h1><p class="upi">Direct UPI Scan & Pay</p><div class="amt">${money(paymentRequest.amount)}</div><p>${paymentRequest.patient_name||''}<br>${paymentRequest.payment_type==='advance'?'Advance Payment':'Outstanding Payment'}</p><img src="${result.qr_image_url}" alt="Razorpay UPI QR"><p class="small">Scan this QR directly using Google Pay, PhonePe, Paytm or another UPI app.<br>Amount and Samara payment reference are fixed for this request.</p><p id="samara-qr-status" class="small" style="font-weight:700;color:#8a2a5c">Waiting for payment… this window updates automatically.</p></main></body></html>`);w.document.close();
        watchOnlinePayment(paymentRequest.id,w);
      }catch(error){w.close();notify('error','QR could not be displayed',error.message||String(error))}
    }

    const paymentWatchRef=React.useRef(null);
    React.useEffect(()=>()=>{if(paymentWatchRef.current)clearInterval(paymentWatchRef.current)},[]);

    async function reconcileOnlinePayment(requestId,{silent=false}={}){
      const {data:{session}}=await client.auth.getSession();
      if(!session)throw new Error('Your ERP session has expired. Please sign in again.');
      const response=await fetch(`${cfg.supabaseUrl}/functions/v1/staff-payment-request`,{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.supabasePublishableKey,'Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({action:'reconcile',request_id:requestId})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok||result.success===false)throw new Error(result.error||'Payment status could not be checked.');
      if(result.status==='Paid'){
        setPaymentRequest(prev=>prev&&prev.id===requestId?{...prev,status:'Paid',razorpay_payment_id:result.payment_id}:prev);
        notify('success','Payment received',`Online payment received and posted to the patient ledger${result.payment_id?` (Razorpay ${result.payment_id})`:''}.`);
        try{await load()}catch(_){}
      }else if(!silent){
        notify('warning','Not paid yet','Razorpay has not received this payment yet. Check again after the family completes the payment.');
      }
      return result;
    }

    function watchOnlinePayment(requestId,popup){
      if(paymentWatchRef.current)clearInterval(paymentWatchRef.current);
      const started=Date.now();let busy=false;
      const setPopup=(html,color)=>{try{const el=popup&&!popup.closed&&popup.document.getElementById('samara-qr-status');if(el){el.innerHTML=html;if(color)el.style.color=color}}catch(_){}};
      paymentWatchRef.current=setInterval(async()=>{
        if(busy)return;
        const popupOpen=popup&&!popup.closed;
        if(Date.now()-started>20*60*1000||!popupOpen){clearInterval(paymentWatchRef.current);paymentWatchRef.current=null;return}
        busy=true;
        try{
          const result=await reconcileOnlinePayment(requestId,{silent:true});
          if(result.status==='Paid'){
            clearInterval(paymentWatchRef.current);paymentWatchRef.current=null;
            setPopup('✅ Payment received and posted to the Samara ledger. You may close this window.','#16814d');
          }
        }catch(error){console.warn('[Samara payments] status check failed:',error)}
        finally{busy=false}
      },5000);
    }

    async function syncPendingOnlinePayments({silent=true}={}){
      try{
        const {data:{session}}=await client.auth.getSession();if(!session)return;
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/staff-payment-request`,{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.supabasePublishableKey,'Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({action:'reconcile_pending'})});
        const result=await response.json().catch(()=>({}));
        if(!response.ok||result.success===false)throw new Error(result.error||'Online payments could not be synced.');
        if(result.posted?.length){
          notify('success','Online payments received',`${result.posted.length} online payment(s) posted to the ledger: ${result.posted.map(x=>`${x.request_code} ${money(x.amount)}`).join(', ')}.`);
          try{await load()}catch(_){}
        }else if(!silent)notify('success','Online payments up to date',`Checked ${result.checked||0} pending request(s). No new payments.`);
        if(result.failed?.length)console.warn('[Samara payments] sync issues:',result.failed);
      }catch(error){if(!silent)notify('error','Sync failed',error.message||String(error));else console.warn('[Samara payments] sync failed:',error)}
    }
    React.useEffect(()=>{
      if(!['Admin','Manager','Accounts'].includes(profile?.role))return;
      syncPendingOnlinePayments();
      const t=setInterval(()=>syncPendingOnlinePayments(),3*60*1000);
      return()=>clearInterval(t);
    },[]);

    async function checkOnlinePaymentStatus(){
      if(!paymentRequest?.id)return;
      setPaymentRequestBusy(true);
      try{await reconcileOnlinePayment(paymentRequest.id)}
      catch(error){notify('error','Status check failed',error.message||String(error))}
      finally{setPaymentRequestBusy(false)}
    }

    async function cancelOnlinePaymentRequest(){
      if(!paymentRequest?.id)return;
      const ok=window.confirm(`Cancel this ${paymentRequest.payment_type==='advance'?'advance':'outstanding'} payment link for ${money(paymentRequest.amount)}?\n\nThe Razorpay link will stop accepting payment.`);
      if(!ok)return;
      setPaymentRequestBusy(true);
      try{
        const {data:{session}}=await client.auth.getSession();
        if(!session)throw new Error('Your ERP session has expired. Please sign in again.');
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/staff-payment-request`,{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.supabasePublishableKey,'Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({action:'cancel',request_id:paymentRequest.id})});
        const result=await response.json().catch(()=>({}));
        if(!response.ok||result.success===false)throw new Error(result.error||'Payment link could not be cancelled.');
        setPaymentRequest(null);setPaymentWorkspace(false);
        notify('success','Payment link cancelled','The Razorpay payment link has been cancelled and can no longer be used.');
      }catch(error){notify('error','Cancellation failed',error.message||String(error))}
      finally{setPaymentRequestBusy(false)}
    }

    async function sendPaymentLinkWhatsApp(){
      if(!paymentRequest?.payment_url||paymentWhatsAppBusy)return;
      setPaymentWhatsAppBusy(true);
      setPaymentWhatsAppStatus({type:'progress',title:'Sending payment link…',detail:'Please wait while Samara sends the secure Razorpay link to the registered family WhatsApp number(s).'});
      try{
        const {data:{session}}=await client.auth.getSession();
        if(!session)throw new Error('Your ERP session has expired. Please sign in again.');
        const contactResponse=await fetch(`${cfg.supabaseUrl}/functions/v1/staff-payment-request`,{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.supabasePublishableKey,'Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({action:'family_contacts',patient_id:patientFilter})});
        const contactResult=await contactResponse.json().catch(()=>({}));
        if(!contactResponse.ok||contactResult.success===false)throw new Error(contactResult.error||'Registered family contacts could not be loaded.');
        const targets=(contactResult.contacts||[]).filter(x=>normalizeWhatsAppRecipient(x.mobile));
        if(!targets.length)throw new Error('No active registered family mobile number is available for this patient.');
        const text=`Samara Assisted Living\nSecure payment request for ${paymentRequest.patient_name||'patient'}\nPurpose: ${paymentRequest.payment_type==='advance'?'Advance Payment':'Outstanding Payment'}\nAmount: ${money(paymentRequest.amount)}\nPay securely: ${paymentRequest.payment_url}\nThis link is unique to this payment request and will expire automatically.`;
        const sendResponse=await fetch(`${cfg.supabaseUrl}/functions/v1/staff-payment-request`,{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.supabasePublishableKey,'Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({action:'send_whatsapp',request_id:paymentRequest.id,text})});
        const sendResult=await sendResponse.json().catch(()=>({}));
        if(!sendResponse.ok||sendResult.success===false)throw new Error(sendResult.error||'WhatsApp payment link could not be sent.');
        const sent=Number(sendResult.sent||0),failed=Array.isArray(sendResult.failures)?sendResult.failures:[];
        const detail=failed.length?`Sent to ${sent} contact(s). ${failed.join(' | ')}`:`WhatsApp payment link sent successfully to ${sent} registered family contact${sent===1?'':'s'}.`;
        setPaymentWhatsAppStatus({type:failed.length?'error':'success',title:failed.length?'Partly sent':'Payment link sent successfully',detail});
        notify(failed.length?'error':'success',failed.length?'Partly sent':'Payment link sent',detail);
      }catch(error){
        const detail=error.message||String(error);
        setPaymentWhatsAppStatus({type:'error',title:'WhatsApp not sent',detail});
        notify('error','WhatsApp not sent',detail);
      }finally{setPaymentWhatsAppBusy(false)}
    }

    function money(value){
      return `₹${Number(value||0).toLocaleString('en-IN',{
        minimumFractionDigits:0,
        maximumFractionDigits:2
      })}`;
    }

    async function loadRefundRequest(dischargeId){
      if(!dischargeId){setRefundRequest(null);return null}
      const {data,error}=await client.from('discharge_refund_requests')
        .select('*')
        .eq('discharge_id',dischargeId)
        .maybeSingle();
      if(error){
        if(!String(error.message||'').toLowerCase().includes('does not exist'))console.warn('Refund request could not be loaded:',error);
        setRefundRequest(null);
        return null;
      }
      setRefundRequest(data||null);
      if(data){
        setRefundForm(current=>({
          ...current,
          amount:data.accounts_amount!=null?String(data.accounts_amount):(current.amount||''),
          confirm_amount:data.accounts_confirm_amount!=null?String(data.accounts_confirm_amount):(current.confirm_amount||''),
          payment_mode:data.payment_mode||current.payment_mode||'UPI',
          payment_reference:data.payment_reference||current.payment_reference||'',
          accounts_remarks:data.accounts_remarks||current.accounts_remarks||'',
          admin_confirm_amount:data.admin_confirm_amount!=null?String(data.admin_confirm_amount):(current.admin_confirm_amount||''),
          admin_remarks:data.admin_remarks||current.admin_remarks||''
        }));
      }
      return data||null;
    }

    async function load(){
      setLoading(true);
      const {data,error}=await client.from('billing_transactions')
        .select('*,patients(full_name,title,patient_id,room_no,bed_no)')
        .order('transaction_date',{ascending:false})
        .limit(1000);

      if(error){
        console.error('Billing transactions could not be loaded:',error);
        setRows([]);
        setMessage(error.message||'Billing information could not be loaded.');
      }else{
        setRows(data||[]);
        setMessage('');
      }
      const accountantCheck=await client.from('profiles')
        .select('id,role,is_active')
        .eq('role','Accounts')
        .limit(25);
      if(accountantCheck.error){
        console.warn('Accountant availability could not be checked:',accountantCheck.error);
        setActiveAccountantPresent(false);
      }else{
        setActiveAccountantPresent((accountantCheck.data||[]).some(row=>row.is_active!==false));
      }
      if(dischargeTarget?.discharge_id)await loadRefundRequest(dischargeTarget.discharge_id);
      setLoading(false);
    }

    React.useEffect(()=>{
      ensurePaymentSettlementStyle();
      load();
      window.addEventListener('samara-refresh-charges',load);
      const channel=client.channel('billing-payments-live-v216')
        .on('postgres_changes',{event:'*',schema:'public',table:'billing_transactions'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'patient_discharges'},load)
        .subscribe();
      return()=>{window.removeEventListener('samara-refresh-charges',load);client.removeChannel(channel)};
    },[]);

    React.useEffect(()=>{
      let cancelled=false;
      setPatientLedger({patientId:patientFilter,rows:[],loading:!!patientFilter,error:''});
      if(!patientFilter)return()=>{cancelled=true};
      (async()=>{
        try{
          const all=[];
          for(let offset=0;;offset+=500){
            const {data,error}=await client.from('billing_transactions')
              .select('*,patients(full_name,title,patient_id,room_no,bed_no)')
              .eq('patient_id',patientFilter).order('transaction_date',{ascending:false}).order('id').range(offset,offset+499);
            if(cancelled)return;
            if(error)throw error;
            all.push(...(data||[]));
            if((data||[]).length<500)break;
          }
          setPatientLedger({patientId:patientFilter,rows:all,loading:false,error:''});
        }catch(error){
          if(!cancelled)setPatientLedger({patientId:patientFilter,rows:[],loading:false,error:error.message||'Patient ledger could not be loaded.'});
        }
      })();
      return()=>{cancelled=true};
    },[patientFilter,rows]);

    const visibleRows=patientFilter
      ?(ledgerReady?patientLedger.rows:[])
      :rows;

    const totals=visibleRows.reduce((sum,row)=>{
      const type=row.transaction_type||'Charge';
      sum[type]=(sum[type]||0)+Number(row.amount||0);
      return sum;
    },{Charge:0,Payment:0,Advance:0,Discount:0,Refund:0});

    const paidTotal=totals.Payment+totals.Advance;
    const netPayable=totals.Charge-paidTotal-totals.Discount+totals.Refund;
    const pendingBills=Math.max(0,netPayable);
    const advanceBalance=Math.max(0,-netPayable);

    React.useEffect(()=>{
      let cancelled=false;
      (async()=>{
        try{
          const all=[];
          for(let from=0;from<200000;from+=1000){
            const {data,error}=await client.from('billing_transactions')
              .select('id,patient_id,transaction_type,category,amount,description,transaction_date,patients(full_name,title,patient_id,room_no,bed_no,is_active)')
              .order('transaction_date',{ascending:true}).order('id',{ascending:true}).range(from,from+999);
            if(error)throw error;
            all.push(...(data||[]));
            if(!data||data.length<1000)break;
          }
          if(!cancelled)setLedgerAll({loading:false,rows:all,error:''});
        }catch(error){if(!cancelled)setLedgerAll({loading:false,rows:[],error:error.message||'Guest balances could not be loaded.'})}
      })();
      return()=>{cancelled=true};
    },[rows]);
    const guestPending=(()=>{
      const grouped={};
      (ledgerAll.rows||[]).forEach(row=>{
        const id=row.patient_id||'';if(!id)return;
        const amount=Number(row.amount||0),type=String(row.transaction_type||'Charge');
        const g=grouped[id]||(grouped[id]={patient_id:id,patient:row.patients||{},charges:0,paid:0,discount:0,refund:0,balance:0,cats:{},charges_list:[],money_list:[]});
        if(type==='Charge'){g.charges+=amount;const c=String(row.category||'Other charges').trim()||'Other charges';(g.cats[c]=g.cats[c]||{amount:0,count:0});g.cats[c].amount+=amount;g.cats[c].count++;g.charges_list.push(row);}
        else if(type==='Payment'||type==='Advance'){g.paid+=amount;g.money_list.push(row);}
        else if(type==='Discount'){g.discount+=amount;g.money_list.push(row);}
        else if(type==='Refund'){g.refund+=amount;g.money_list.push(row);}
      });
      return Object.values(grouped).map(g=>({...g,balance:Math.round((g.charges-g.paid-g.discount+g.refund)*100)/100}))
        .filter(g=>g.balance>0.009).sort((a,b)=>b.balance-a.balance);
    })();
    const outstandingByPatient=(()=>{
      const grouped={};
      rows.forEach(row=>{
        const id=row.patient_id||'';
        if(!id)return;
        const amount=Number(row.amount||0);
        const type=String(row.transaction_type||'Charge');
        if(!grouped[id])grouped[id]={patient_id:id,patient:row.patients||{},balance:0};
        if(type==='Charge')grouped[id].balance+=amount;
        else if(type==='Payment'||type==='Advance'||type==='Discount')grouped[id].balance-=amount;
        else if(type==='Refund')grouped[id].balance+=amount;
      });
      const limited=Object.values(grouped).filter(x=>x.balance>0.009).sort((a,b)=>b.balance-a.balance);
      return ledgerAll.loading||ledgerAll.error?limited:guestPending.map(g=>({patient_id:g.patient_id,patient:g.patient,balance:g.balance}));
    })();

    React.useEffect(()=>{
      if(ledgerReady&&dischargeTarget&&patientFilter===dischargeTarget.patient_id&&pendingBills>0){
        setForm(current=>({
          ...current,
          patient_id:dischargeTarget.patient_id,
          transaction_type:'Payment',
          category:'Final Settlement',
          amount:String(pendingBills),
          description:`Final payment for discharge clearance of ${dischargeTarget.patient_name||'patient'}`
        }));
      }
    },[dischargeTarget?.discharge_id,patientFilter,pendingBills,ledgerReady]);

    React.useEffect(()=>{
      if(!ledgerReady||!dischargeTarget||patientFilter!==dischargeTarget.patient_id||advanceBalance<=0.009)return;
      let cancelled=false;
      (async()=>{
        setRefundLoading(true);
        const result=await client.rpc('ensure_discharge_refund_request',{p_discharge_id:dischargeTarget.discharge_id});
        if(cancelled)return;
        if(result.error){
          setMessage(`Refund workflow could not be initiated: ${result.error.message}`);
          setRefundLoading(false);
          return;
        }
        await loadRefundRequest(dischargeTarget.discharge_id);
        if(!cancelled)setRefundLoading(false);
      })();
      return()=>{cancelled=true};
    },[dischargeTarget?.discharge_id,patientFilter,advanceBalance,ledgerReady]);

    async function verifyRefundByAccounts(){
      if(!canVerifyDischargeRefund||!refundRequest||saving)return;
      const amount=Number(refundForm.amount),confirmAmount=Number(refundForm.confirm_amount);
      if(!Number.isFinite(amount)||amount<=0||!Number.isFinite(confirmAmount)||confirmAmount<=0){
        notify('error','Refund amount required','Enter the refund amount twice for verification.');return;
      }
      if(Math.abs(amount-confirmAmount)>0.009){
        notify('error','Amounts do not match','Refund Amount and Confirm Refund Amount must be identical.');return;
      }
      if(Math.abs(amount-advanceBalance)>0.009){
        notify('error','Amount blocked',`The system-calculated refundable balance is ${money(advanceBalance)}. The entered amount must match exactly.`);return;
      }
      if(!String(refundForm.payment_reference||'').trim()){
        notify('error','Reference required','Refund receipt / bank / UPI / transaction reference number is mandatory.');return;
      }
      if(String(refundForm.accounts_remarks||'').trim().length<8){
        notify('error','Verification remarks required','Enter clear financial verification remarks before forwarding for independent Admin approval.');return;
      }
      setSaving(true);
      const result=await client.rpc('accounts_verify_discharge_refund',{
        p_request_id:refundRequest.id,
        p_amount:amount,
        p_confirm_amount:confirmAmount,
        p_payment_mode:refundForm.payment_mode,
        p_payment_reference:String(refundForm.payment_reference||'').trim(),
        p_remarks:String(refundForm.accounts_remarks||'').trim()
      });
      if(result.error){notify('error','Refund verification failed',result.error.message);setSaving(false);return}
      writeAuditEvent('Discharge Refund Financially Verified','Billing',refundRequest.id,{patient_id:form.patient_id,amount,payment_mode:refundForm.payment_mode,payment_reference:refundForm.payment_reference},'Success');
      notify('success','Financial verification completed',activeAccountantPresent?'The Accountant verification is locked. An Administrator must now complete the independent final approval.':'The Admin financial verification is locked. A different Administrator must now complete the independent final approval.');
      await loadRefundRequest(dischargeTarget.discharge_id);setSaving(false);
    }

    async function approveRefundByAdmin(){
      try{await verifyChargesBeforeClearance();}catch(error){setMessage(error.message||'Unable to verify charges.');return;}
      if(profile?.role!=='Admin'||!refundRequest||saving)return;
      const amount=Number(refundForm.admin_confirm_amount);
      if(!Number.isFinite(amount)||amount<=0){notify('error','Confirmation amount required','Re-enter the exact refund amount shown in the verified financial record.');return}
      if(Math.abs(amount-Number(refundRequest.accounts_amount||refundRequest.calculated_refund||0))>0.009){notify('error','Amount mismatch','Admin confirmation amount does not match the financially verified refund amount.');return}
      if(!refundForm.admin_confirmed){notify('error','Final verification required','Confirm that the patient ledger and refund evidence have been independently checked.');return}
      if(String(refundForm.admin_remarks||'').trim().length<8){notify('error','Admin remarks required','Enter the Admin approval remarks before completing the refund.');return}
      setSaving(true);
      const result=await client.rpc('admin_approve_discharge_refund',{
        p_request_id:refundRequest.id,
        p_confirm_amount:amount,
        p_ledger_confirmed:true,
        p_remarks:String(refundForm.admin_remarks||'').trim()
      });
      if(result.error){notify('error','Refund approval failed',result.error.message);setSaving(false);return}
      writeAuditEvent('Discharge Refund Approved by Independent Admin','Billing',refundRequest.id,{patient_id:form.patient_id,amount,verification_reference:refundRequest.payment_reference},'Success');
      notify('success','Refund approved and accounts cleared','The refund has been posted to the permanent patient ledger. The discharge has returned automatically to Nursing for final physical clearance.');
      try{sessionStorage.removeItem('samara_discharge_payment_target')}catch(_error){}
      setDischargeTarget(null);
      await load();setSaving(false);
      setTimeout(()=>window.dispatchEvent(new CustomEvent('samara-return-discharge-clearance')),2600);
    }

    const pendingRows=visibleRows.filter(row=>row.transaction_type==='Charge');
    const paymentRows=visibleRows.filter(row=>['Payment','Advance'].includes(row.transaction_type));
    const filteredRows=
      quickView==='Pending Bills'?pendingRows:
      quickView==='Payments / Advances'?paymentRows:
      quickView==='Discounts'?visibleRows.filter(row=>row.transaction_type==='Discount'):
      quickView==='Refunds'?visibleRows.filter(row=>row.transaction_type==='Refund'):
      visibleRows;

    React.useEffect(()=>{
      let cancelled=false;
      async function checkDailyPayableSent(){
        setDailyPayableSent(false);
        if(!patientFilter||pendingBills<=0)return;
        const patient=patients.find(p=>p.id===patientFilter)||{};
        const to=normalizeWhatsAppRecipient(patient.attendant_phone||patient.mobile||'');
        if(!to)return;
        setDailyPayableChecking(true);
        try{
          const start=new Date();
          start.setHours(0,0,0,0);
          const {data,error}=await client.from('hr_whatsapp_communications')
            .select('id,template_name,recipient_number,created_at,message_payload')
            .eq('template_name','samara_bill_reminder')
            .eq('recipient_number',to)
            .gte('created_at',start.toISOString())
            .order('created_at',{ascending:false})
            .limit(20);
          if(error)throw error;
          const found=(data||[]).some(r=>{
            const payload=r?.message_payload||{};
            return !payload?.patient_id||String(payload.patient_id)===String(patientFilter);
          });
          if(!cancelled)setDailyPayableSent(found);
        }catch(error){
          console.warn('Could not check today Daily Payable status:',error);
        }finally{
          if(!cancelled)setDailyPayableChecking(false);
        }
      }
      checkDailyPayableSent();
      return()=>{cancelled=true};
    },[patientFilter,pendingBills,patients]);

    async function ensureWhatsAppInboxLog({sendResult,to,communicationLog,templateName,messageType='template'}){
      if(sendResult?.history_logged===true)return true;
      const providerId=sendResult?.provider_message_id||sendResult?.result?.messages?.[0]?.id||null;
      if(!providerId)throw new Error('Meta message ID is missing; WhatsApp acceptance is not confirmed.');
      if(providerId){
        const existing=await client.from('hr_whatsapp_communications')
          .select('id')
          .eq('provider_message_id',providerId)
          .maybeSingle();
        if(existing?.data?.id)return true;
      }
      const now=new Date().toISOString();
      const row={
        career_application_id:null,
        application_id:null,
        applicant_name:communicationLog?.contact_name||null,
        recipient_number:normalizeWhatsAppRecipient(to),
        communication_type:communicationLog?.communication_type||'WhatsApp API',
        template_name:templateName||null,
        status:'Accepted',
        provider_message_id:providerId,
        error_message:null,
        sent_by:communicationLog?.sent_by||profile?.id||null,
        sent_by_name:communicationLog?.sent_by_name||formalName(profile)||'Samara System',
        direction:'outbound',
        message_type:messageType,
        message_content:communicationLog?.message_content||'',
        message_payload:communicationLog?.message_payload||sendResult?.result||null,
        contact_name:communicationLog?.contact_name||null,
        source_type:communicationLog?.source_type||'Patient / Family',
        sent_at:now,
        created_at:now,
        updated_at:now
      };
      const {error}=await client.from('hr_whatsapp_communications').insert(row);
      if(error){
        console.error('WhatsApp Inbox fallback log failed:',error,row);
        setMessage(`WhatsApp was sent, but ERP Inbox logging failed: ${error.message||error}`);
        return false;
      }
      return true;
    }

    // 2.18.95: registered family contacts for WhatsApp (primary first) — secure server lookup, then a direct read
    // (Admin / Manager), then the legacy attendant phone. Never the Guest's own mobile.
    async function loadFamilyReceiptContacts(patientId,patient={}){
      let list=[];
      try{
        const {data:{session}}=await client.auth.getSession();
        if(session){
          const res=await fetch(`${cfg.supabaseUrl}/functions/v1/staff-payment-request`,{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.supabasePublishableKey,'Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({action:'family_contacts',patient_id:patientId})});
          const j=await res.json().catch(()=>({}));
          if(res.ok&&j.success!==false&&Array.isArray(j.contacts))list=j.contacts.map(c=>({name:String(c.relative_name||'Family Member').trim()||'Family Member',mobile:normalizeWhatsAppRecipient(c.mobile||''),primary:!!c.primary_contact}));
        }
      }catch(e){console.warn('Secure family contact lookup failed:',e)}
      if(!list.length){
        try{
          const {data,error}=await client.from('family_portal_access').select('relative_name,mobile,primary_contact,is_active,created_at').eq('patient_id',patientId).eq('is_active',true).order('primary_contact',{ascending:false}).order('created_at',{ascending:true});
          if(!error)list=(data||[]).map(c=>({name:String(c.relative_name||'Family Member').trim()||'Family Member',mobile:normalizeWhatsAppRecipient(c.mobile||''),primary:!!c.primary_contact}));
        }catch(_e){}
      }
      list=list.filter(c=>c.mobile);
      const legacy=normalizeWhatsAppRecipient(patient.attendant_phone||'');
      if(legacy&&!list.some(c=>c.mobile===legacy))list.push({name:patient.attendant_name||'Family Member',mobile:legacy,primary:list.length===0});
      return list.filter((c,i,a)=>a.findIndex(x=>x.mobile===c.mobile)===i);
    }
    async function sendPaymentReceiptWhatsAppApi(receipt,{automatic=false}={}){
      if(!receipt)return false;
      const patient=patients.find(p=>p.id===receipt.patient_id)||{};
      // Payment receipts must also work for discharged/inactive patients.
      // Family contacts are stored in family_portal_access (including Contact 2),
      // so do not rely only on the legacy attendant_phone field on patients.
      // 2.18.95: family contacts are read through the secure server lookup (same as payment links). The Accounts login
      // cannot read family_portal_access directly, so the list came back EMPTY and the receipt went to the Guest's own
      // mobile labelled "Family Member" (Mr. S. Swaminathan, 23-10-2026). The Guest's own mobile is never used now.
      let familyContacts=await loadFamilyReceiptContacts(receipt.patient_id,patient);
      // Remove accidental duplicate numbers while preserving primary/contact order.
      familyContacts=familyContacts.filter((contact,index,list)=>list.findIndex(item=>item.mobile===contact.mobile)===index);
      if(!familyContacts.length){
        const text='No family WhatsApp number is registered for this Guest (Patients → Edit → Family contacts). The receipt is not sent to the Guest\'s own mobile.';
        setMessage(text);
        if(automatic)notify('error','Payment saved · WhatsApp not sent',text);
        return false;
      }
      const patientName=formalName(patient)||patient.full_name||'Patient';
      const purpose=[
        String(receipt.category||'').trim(),
        String(receipt.description||'').trim()
      ].filter(Boolean).join(' · ');
      const amountText=Number(receipt.amount||0).toLocaleString('en-IN',{maximumFractionDigits:2});
      const paidDate=formatDateIN(receipt.date);
      const reference=receipt.reference||receipt.transaction_id||'—';
      const paymentMode=receipt.payment_mode||'—';
      try{
        let acceptedCount=0;
        const failures=[];
        for(const contact of familyContacts){
          const recipient=contact.name||'Family Member';
          const to=contact.mobile;
          const renderedMessage=`Dear ${recipient},

Thank you. We confirm receipt of ₹${amountText} towards the account of ${patientName} on ${paidDate}.

Receipt No.: ${reference}
Payment Mode: ${paymentMode}

The payment has been recorded in our system.

For any clarification regarding the account, please contact Samara Assisted Living.

Thank you.`;
          const communicationLog={
            communication_type:`Payment Receipt${receipt.category?` · ${receipt.category}`:''}`,
            message_content:renderedMessage,
            contact_name:recipient,
            source_type:'Patient / Family · Accounts',
            sent_by:profile?.id||null,
            sent_by_name:automatic?'Accounts · Automated':(formalName(profile)||'Accounts'),
            message_payload:{
              patient_id:receipt.patient_id,
              patient_name:patientName,
              category:receipt.category||'Payment',
              description:receipt.description||'',
              amount:Number(receipt.amount||0),
              payment_mode:paymentMode,
              reference
            }
          };
          try{
            const sendResult=await sendWhatsAppTemplate({
              to,
              templateName:'samara_payment_receipt',
              languageCode:'en',
              bodyParams:[recipient,amountText,patientName,paidDate,reference,paymentMode],
              communicationLog
            });
            await ensureWhatsAppInboxLog({sendResult,to,communicationLog,templateName:'samara_payment_receipt'});
            acceptedCount+=1;
          }catch(contactError){
            failures.push(`${recipient}: ${contactError?.message||contactError}`);
          }
        }
        if(acceptedCount){
          const contactText=acceptedCount===1?'1 family contact':`${acceptedCount} family contacts`;
          if(automatic)notify('success','Payment saved · WhatsApp accepted',`${money(receipt.amount)} received${purpose?` towards ${purpose}`:''}. Meta accepted the receipt for ${contactText}; each accepted message is recorded in WhatsApp Inbox.`);
          else notify('success','WhatsApp receipt accepted',`Meta accepted the payment receipt for ${contactText}; each message is recorded in WhatsApp Inbox.`);
          if(failures.length)setMessage(`Payment receipt sent to ${contactText}, but ${failures.length} contact(s) failed: ${failures.join(' | ')}`);
          return true;
        }
        throw new Error(failures.join(' | ')||'WhatsApp API did not accept the payment receipt.');
      }catch(apiError){
        const errorText=apiError?.message||String(apiError);
        if(automatic){
          setMessage(`Payment was saved successfully, but WhatsApp receipt was NOT sent (${errorText}). Use Resend Payment Receipt below.`);
          notify('error','Payment saved · WhatsApp not sent','The financial transaction is safe. Use Resend Payment Receipt to retry the WhatsApp notification.');
          return false;
        }
        setMessage(`WhatsApp API could not send the payment receipt (${errorText}). No financial transaction was changed.`);
        notify('error','WhatsApp receipt not sent',errorText);
        return false;
      }
    }

    async function sendDailyBillWhatsAppApi({resend=false}={}){
      if(!patientFilter){setMessage('Select a patient first.');return}
      if(pendingBills<=0){setMessage('There is no outstanding amount to notify for the selected patient.');return}
      if(dailyPayableSent&&!resend)return;
      const patient=patients.find(p=>p.id===patientFilter)||{};
      // 2.18.95: the primary registered family contact (never the Guest's own mobile)
      const firstContact=(await loadFamilyReceiptContacts(patient.id||patientFilter,patient))[0];
      const to=firstContact?.mobile||'';
      if(!to){setMessage('No family WhatsApp number is registered for this Guest (Patients → Edit → Family contacts).');return}
      const recipient=firstContact.name||'Family Member';
      const patientName=formalName(patient)||patient.full_name||'Patient';
      const amount=Number(pendingBills||0).toLocaleString('en-IN',{maximumFractionDigits:2});
      const dueDate=formatDateIN(new Date().toISOString().slice(0,10));
      try{
        const renderedMessage=`Dear ${recipient},

This is a gentle reminder regarding the outstanding amount for ${patientName}.

Amount Due: ₹${amount}
Due Date: ${dueDate}

Please arrange payment at your convenience.

You may access the Samara Family Portal using the button below to view the account details.

If payment has already been made, kindly disregard this message.

Thank you.`;
        const communicationLog={
          communication_type:`Daily Payable Reminder · ${resend?'Resent':'Manual'}`,
          message_content:renderedMessage,
          contact_name:recipient,
          source_type:'Patient / Family · Accounts',
          sent_by:profile?.id||null,
          sent_by_name:formalName(profile)||'Accounts',
          message_payload:{
            patient_id:patient.id,
            patient_name:patientName,
            amount:Number(pendingBills||0),
            due_date:dueDate,
            resend:Boolean(resend)
          }
        };
        const sendResult=await sendWhatsAppTemplate({
          to,
          templateName:'samara_bill_reminder',
          languageCode:'en',
          bodyParams:[recipient,patientName,amount,dueDate],
          communicationLog
        });
        const inboxLogged=await ensureWhatsAppInboxLog({
          sendResult,to,communicationLog,templateName:'samara_bill_reminder'
        });
        setDailyPayableSent(true);
        notify(
          'success',
          resend?'Daily payable accepted again':'Daily payable accepted',
          `Meta accepted the ₹${amount} reminder${inboxLogged?' and it was recorded in WhatsApp Inbox':' through WhatsApp API; Inbox logging needs attention'}. Await delivery confirmation.`
        );
      }catch(apiError){
        const number=normalizeWhatsAppRecipient(to);
        const text=`Dear ${recipient},

This is the daily payable summary for ${patientName}.

Outstanding Amount: ₹${amount}
As on: ${dueDate}

Please access the Samara Family Portal for detailed account information.`;
        if(number)window.open(`https://wa.me/${number}?text=${encodeURIComponent(brandWhatsAppText(text))}`,'_blank','noopener');
        setMessage(`WhatsApp API could not send (${apiError.message||apiError}); the existing WhatsApp message has been opened as fallback.`);
      }
    }

    async function verifyChargesBeforeClearance(){
      if(!ledgerReady)throw Error('Wait until the complete patient ledger is loaded before financial clearance.');
      const unresolved=await fetchUnpostedCharges(dischargeTarget.patient_id);
      window.dispatchEvent(new Event('samara-refresh-charges'));
      if(unresolved.length)throw Error(`${unresolved.length} unresolved charge request(s). Open Charge Approvals and resolve every request before clearance.`);
    }
    async function clearZeroBalance(){
      if(saving||!dischargeTarget||!['Admin','Accounts'].includes(profile?.role))return;
      if(!String(form.closure_remarks||'').trim()){setMessage('Accounts closure remarks are required.');return;}
      setSaving(true);setMessage('');
      try{
        await verifyChargesBeforeClearance();
        const result=await client.rpc('close_patient_discharge_accounts_v2',{p_discharge_id:dischargeTarget.discharge_id,p_remarks:form.closure_remarks});
        if(result.error)throw result.error;
        try{sessionStorage.removeItem('samara_discharge_payment_target')}catch(_error){}
        setDischargeTarget(null);
        notify('success','Accounts cleared','Zero balance verified. Returned to Nursing for final physical discharge. No payment was recorded.');
        await load();
        window.dispatchEvent(new CustomEvent('samara-return-discharge-clearance'));
      }catch(error){setMessage(error.message||'Clearance verification failed.');notify('error','Discharge not cleared',error.message);await load();}
      finally{setSaving(false);}
    }
    async function savePaymentAndPossiblyClose(e){
      e.preventDefault();
      if(!canEnter||saving)return;

      if(!form.patient_id){
        const text='Select a patient before saving the transaction.';
        setMessage(text);notify('error','Patient required',text);return;
      }

      if(dischargeTarget){
        try{await verifyChargesBeforeClearance();}catch(error){setMessage(error.message||'Unable to verify charges.');return;}
      }
      const amount=Number(form.amount);
      if(dischargeTarget&&advanceBalance>0.009){
        const text='This discharge has an excess patient balance. Use the controlled Refund Verification workflow; direct transaction posting is blocked.';
        setMessage(text);notify('error','Controlled refund required',text);return;
      }
      if(!Number.isFinite(amount)||amount<=0){
        const text='Enter a valid amount greater than zero.';
        setMessage(text);notify('error','Amount required',text);return;
      }

      // 2.14.95: a manual "Charge" is allowed only where no other route exists. Items and services in
      // Charge Master / Pharmacy & Stores are charged only through Bills & Charges (then Accounts approval),
      // so nothing can be charged twice or charged without being issued.
      if(form.transaction_type==='Charge'&&!MANUAL_CHARGE_CATEGORIES.includes(form.category)){
        const text=`"${form.category}" is charged only through Bills & Charges (Charge Master / Pharmacy & Stores), then Accounts approval. Manual Charge is allowed only for: ${MANUAL_CHARGE_CATEGORIES.join(', ')}.`;
        setMessage(text);notify('error','Use Bills & Charges',text);return;
      }
      if(form.transaction_type==='Charge'&&form.category==='Other'&&String(form.description||'').trim().length<5){
        const text='For a manual "Other" charge, write the reason in the description.';
        setMessage(text);notify('error','Reason required',text);return;
      }

      if(form.transaction_type==='Discount'&&!canDiscount){
        const text='Discount can be entered only by the Admin.';
        setMessage(text);notify('error','Not permitted',text);return;
      }

      if(
        ['Payment','Advance','Refund'].includes(form.transaction_type) &&
        ['UPI','RTGS'].includes(form.payment_mode) &&
        !String(form.payment_reference||'').trim()
      ){
        const text=`${form.payment_mode} Transaction Reference No. is mandatory.`;
        setMessage(text);notify('error','Reference required',text);return;
      }

      if(posUseScan){
        if(!form.pos_scan?.scan_id){
          const text='Scan the HDFC swipe machine screen first (button "Scan machine screen").';
          setMessage(text);notify('error','Scan the machine screen',text);return;
        }
        if(Math.round(Number(form.amount)*100)!==Math.round(Number(form.pos_scan.amount)*100)){
          const text=`The amount must be the scanned amount ₹${Number(form.pos_scan.amount).toLocaleString('en-IN',{minimumFractionDigits:2})}.`;
          setMessage(text);notify('error','Amount differs from the machine',text);return;
        }
      }else if(isPosEntry){
        if(profile?.role!=='Admin'){
          const text='Typed swipe machine entry is Admin only. Please use Scan machine screen.';
          setMessage(text);notify('error','Scan the machine screen',text);return;
        }
        if(!/^[A-Z0-9]{4,12}$/.test(posApprovalClean)){
          const text=form.pos_paid_by==='UPI on machine'?'Enter the RRN printed on the swipe machine slip.':'Enter the Approval Code printed on the swipe machine slip.';
          setMessage(text);notify('error','Slip details required',text);return;
        }
        const last4=String(form.pos_last4||'').replace(/\D/g,'');
        if(form.pos_paid_by==='Card'&&last4&&last4.length!==4){
          const text='Card last 4 digits must be exactly 4 numbers (or leave it empty).';
          setMessage(text);notify('error','Check card digits',text);return;
        }
      }

      if(
        dischargeTarget &&
        form.transaction_type==='Payment' &&
        amount>pendingBills+0.009
      ){
        setMessage(`Payment cannot exceed the Net Payable amount of ${money(pendingBills)}.`);
        return;
      }

      if(
        dischargeTarget &&
        form.transaction_type==='Payment' &&
        ['UPI','RTGS'].includes(form.payment_mode) &&
        !String(form.payment_reference||'').trim()
      ){
        const text=`${form.payment_mode} Transaction Reference No. is mandatory for discharge settlement.`;
        setMessage(text);notify('error','Reference required',text);return;
      }

      if(
        dischargeTarget &&
        form.transaction_type==='Payment' &&
        amount>=pendingBills-0.009 &&
        !String(form.closure_remarks||'').trim()
      ){
        setMessage('Closure remarks are mandatory before completing discharge settlement.');
        return;
      }

      setSaving(true);
      setMessage('');

      let data=null;
      let error=null;
      // 2.18.53: Charge and Discount are not money received, so they never carry a payment mode or a
      // voucher / reference (earlier the previous Cash payment's "Cash · CV-…" was carried over).
      const isNonMoneyTransaction=['Charge','Discount'].includes(form.transaction_type);
      let actualReference=isNonMoneyTransaction?'':String(form.payment_reference||'').trim();

      let posSlipId='',posReference='';
      if(posUseScan){
        // 2.18.68: amount, RRN, Transaction ID, Card / UPI come from the verified scan on the server (SQL 271), never from typing.
        const posResult=await client.rpc('record_pos_card_payment_scan',{
          p_patient_id:form.patient_id,
          p_transaction_type:form.transaction_type,
          p_category:form.category,
          p_description:form.description||null,
          p_scan_id:form.pos_scan.scan_id
        });
        error=posResult.error;
        const posRow=Array.isArray(posResult.data)?posResult.data[0]:posResult.data;
        if(!error&&posRow){
          data={id:posRow.transaction_id};
          posSlipId=String(posRow.slip_id||'');
          posReference=String(posRow.reference||'');
          actualReference=String(posRow.voucher_no||'').trim();
          setLastVoucherNo(actualReference);
          setForm(current=>({...current,payment_reference:actualReference,pos_scan:null}));
        }
      }else if(isPosEntry){
        // 2.18.67: ledger entry + CARDV voucher + slip saved together on the server (SQL 270); a slip can never be entered twice.
        const posResult=await client.rpc('record_pos_card_payment',{
          p_patient_id:form.patient_id,
          p_transaction_type:form.transaction_type,
          p_category:form.category,
          p_amount:amount,
          p_description:form.description||null,
          p_approval_code:posApprovalClean,
          p_card_last4:form.pos_paid_by==='Card'?(String(form.pos_last4||'').replace(/\D/g,'')||null):null,
          p_paid_by:form.pos_paid_by==='UPI on machine'?'UPI on machine':'Card'
        });
        error=posResult.error;
        const posRow=Array.isArray(posResult.data)?posResult.data[0]:posResult.data;
        if(!error&&posRow){
          data={id:posRow.transaction_id};
          posSlipId=String(posRow.slip_id||'');
          actualReference=String(posRow.voucher_no||'').trim();
          setLastVoucherNo(actualReference);
          setForm(current=>({...current,payment_reference:actualReference,pos_approval:'',pos_last4:''}));
        }
      }else if(isAutoVoucherTransaction){
        const voucherResult=await client.rpc('record_voucher_transaction',{
          p_patient_id:form.patient_id,
          p_transaction_type:form.transaction_type,
          p_category:form.category,
          p_amount:amount,
          p_payment_mode:form.payment_mode,
          p_description:form.description||null,
          p_entered_by:profile.id
        });

        error=voucherResult.error;
        const voucherRow=Array.isArray(voucherResult.data)?voucherResult.data[0]:voucherResult.data;
        if(!error&&voucherRow){
          data={id:voucherRow.transaction_id};
          actualReference=String(voucherRow.voucher_no||'').trim();
          setLastVoucherNo(actualReference);
          setForm(current=>({...current,payment_reference:actualReference}));
        }
      }else{
        const payload={
          patient_id:form.patient_id,
          transaction_type:form.transaction_type,
          category:form.category,
          amount,
          payment_mode:isNonMoneyTransaction?'Not applicable':form.payment_mode,
          payment_reference:actualReference||null,
          description:[
            form.description,
            actualReference?`Reference: ${actualReference}`:''
          ].filter(Boolean).join(' | '),
          transaction_date:new Date().toISOString(),
          entered_by:profile.id
        };

        const result=await client.from('billing_transactions')
          .insert(payload)
          .select('id')
          .single();
        data=result.data;
        error=result.error;
      }

      if(error){
        const text=error.message||'Transaction could not be saved.';
        setMessage(text);
        notify('error','Payment save failed',text);
        setSaving(false);
        return;
      }

      if(isAutoVoucherTransaction&&!actualReference){
        const text='Voucher number was not generated. The transaction has not been posted.';
        setMessage(text);
        notify('error','Voucher required',text);
        setSaving(false);
        return;
      }

      writeAuditEvent(
        'Billing Transaction Saved',
        'Billing',
        data?.id||form.patient_id,
        {
          patient_id:form.patient_id,
          transaction_type:form.transaction_type,
          category:form.category,
          amount,
          payment_mode:form.payment_mode,
          payment_reference:actualReference||null,
          ...(isPosEntry?{pos_slip_id:posSlipId,pos_approval_code:posUseScan?posReference:posApprovalClean,pos_paid_by:posUseScan?form.pos_scan?.paid_by:form.pos_paid_by,pos_entry:posUseScan?'Screen scan':'Typed (Admin)'}:{})
        },
        'Success'
      );

      let savedPaymentReceipt=null;
      if(['Payment','Advance'].includes(form.transaction_type)){
        savedPaymentReceipt={
          patient_id:form.patient_id,
          amount,
          payment_mode:form.payment_mode,
          reference:actualReference||'',
          transaction_id:data?.id||'',
          date:new Date().toISOString(),
          category:form.category||form.transaction_type,
          description:String(form.description||'').trim()
        };
        if(isPosEntry){
          const paidBy=posUseScan?form.pos_scan?.paid_by:form.pos_paid_by;
          savedPaymentReceipt.payment_mode=paidBy==='UPI on machine'?'UPI (HDFC swipe machine)':'Card (HDFC swipe machine)';
          savedPaymentReceipt.reference=`${actualReference} / ${posUseScan?posReference:'Appr. '+posApprovalClean}`;
        }
        setLastPaymentReceipt(savedPaymentReceipt);
        if(isPosEntry&&posSlipId){
          // receipt + PDF sent by the server to every family contact; if it cannot go now, the server retries by itself every few minutes
          try{
            const {data:{session}}=await client.auth.getSession();
            const response=await fetch(`${cfg.supabaseUrl}/functions/v1/staff-payment-request`,{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.supabasePublishableKey,'Authorization':`Bearer ${session?.access_token||''}`},body:JSON.stringify({action:'pos_receipt',slip_id:posSlipId})});
            const result=await response.json().catch(()=>({}));
            if(response.ok&&result.success){
              notify('success','Payment saved · WhatsApp receipt sent',`${money(amount)} by swipe machine (Voucher ${actualReference}). Receipt${result.pdf_note?'':' with PDF'} sent to ${result.sent||1} family contact(s); recorded in WhatsApp Inbox.`);
              if(result.pdf_note)setMessage(result.pdf_note);
            }else{
              const t=result.error||result.receipt_error||'WhatsApp receipt could not be sent yet.';
              setMessage(`Payment was saved successfully (Voucher ${actualReference}). WhatsApp receipt not sent yet: ${t}. The system will retry automatically.`);
              notify('warning','Payment saved · receipt will retry',t);
            }
          }catch(receiptError){
            setMessage(`Payment was saved successfully (Voucher ${actualReference}). The WhatsApp receipt will be sent automatically within a few minutes.`);
          }
        }else if(data?.id){
          // 2.18.173: Cash / UPI / bank entries — receipt + PDF sent by the SERVER to every family contact, retried by itself
          // every few minutes if it cannot go now (no more browser-only sending; "Resend" below stays for a manual resend).
          try{
            const {data:{session}}=await client.auth.getSession();
            const response=await fetch(`${cfg.supabaseUrl}/functions/v1/staff-payment-request`,{method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.supabasePublishableKey,'Authorization':`Bearer ${session?.access_token||''}`},body:JSON.stringify({action:'ledger_receipt',transaction_id:data.id})});
            const result=await response.json().catch(()=>({}));
            if(response.ok&&result.success){
              notify('success','Payment saved · WhatsApp receipt sent',`${money(amount)} received. Receipt${result.pdf_note?'':' with PDF'} sent to ${result.sent||1} family contact(s); recorded in WhatsApp Inbox.`);
              if(result.pdf_note)setMessage(result.pdf_note);
            }else{
              const t=result.error||result.receipt_error||'WhatsApp receipt could not be sent yet.';
              setMessage(`Payment was saved successfully. WhatsApp receipt not sent yet: ${t}. The system will retry automatically.`);
              notify('warning','Payment saved · receipt will retry',t);
            }
          }catch(receiptError){
            setMessage('Payment was saved successfully. The WhatsApp receipt will be sent automatically within a few minutes.');
          }
        }
      }

      const expectedBalance=
        form.transaction_type==='Payment'||form.transaction_type==='Advance'
          ?netPayable-amount
          :form.transaction_type==='Discount'
            ?netPayable-amount
            :form.transaction_type==='Refund'
              ?netPayable+amount
              :netPayable+amount;

      if(dischargeTarget && expectedBalance<=0.009){
        const closeResult=await client.rpc('close_patient_discharge_accounts_v2',{
          p_discharge_id:dischargeTarget.discharge_id,
          p_remarks:[
            form.closure_remarks,
            `Payment mode: ${form.payment_mode}`,
            actualReference?`Reference: ${actualReference}`:''
          ].filter(Boolean).join(' | ')
        });

        if(closeResult.error){
          notify(
            'error',
            'Payment recorded, but discharge not closed',
            closeResult.error.message||'Return to Discharge Clearance and complete closure.'
          );
          await load();
          setSaving(false);
          return;
        }

        try{sessionStorage.removeItem('samara_discharge_payment_target')}catch(_error){}
        setDischargeTarget(null);

        notify(
          'success',
          'Payment received and accounts cleared successfully',
          'The account is financially cleared and the case has been forwarded automatically to Nursing for final physical discharge confirmation. The room and bed remain occupied until the Nurse confirms that the patient has left.'
        );

        await load();
        setSaving(false);
        setTimeout(()=>window.dispatchEvent(new CustomEvent('samara-return-discharge-clearance')),3800);
        return;
      }

      notify(
        'success',
        isAutoVoucherTransaction
          ?`${form.transaction_type} recorded · ${form.payment_mode==='Cash'?'Cash':'Card'} Voucher ${actualReference}`
          :`${form.transaction_type} recorded successfully`,
        isAutoVoucherTransaction
          ?`${money(amount)} received through ${form.payment_mode}. Voucher ${actualReference} was created automatically and linked to this transaction.`
          :`${money(amount)} received through ${form.payment_mode}${actualReference?` · Reference ${actualReference}`:''}.`
      );

      setForm(current=>({
        ...current,
        amount:'',
        payment_reference:isAutoVoucherTransaction?actualReference:'',
        description:''
      }));

      await load();
      setSaving(false);
    }

    const signedFinancialBalance=paidTotal+totals.Discount-totals.Charge-totals.Refund;
    const balanceDisplay=
      signedFinancialBalance>0
        ?`+ ${money(signedFinancialBalance)}`
        :signedFinancialBalance<0
          ?`− ${money(Math.abs(signedFinancialBalance))}`
          :money(0);
    const balanceTone=
      signedFinancialBalance>0
        ?'summary-green'
        :signedFinancialBalance<0
          ?'summary-red'
          :'summary-blue';
    const balanceLabel=
      signedFinancialBalance>0
        ?'Financial Balance · Advance Available'
        :signedFinancialBalance<0
          ?'Financial Balance · Outstanding'
          :'Financial Balance · Account Settled';

    const summaryCards=[
      ['Total Charges',totals.Charge,'summary-blue'],
      ['Payments Received',totals.Payment,'summary-green'],
      ['Advance Receipts',totals.Advance,'summary-blue'],
      ['Discounts',totals.Discount,'summary-pink'],
      // 2.18.175: all Guests -> sum of every Guest's pending balance from the whole ledger
      (()=>{const v=!patientFilter&&!ledgerAll.loading&&!ledgerAll.error?Math.round(guestPending.reduce((t,g)=>t+g.balance,0)*100)/100:pendingBills;return ['Pending Payments',v,v>0?'summary-red':'summary-green']})(),
      [balanceLabel,balanceDisplay,balanceTone,'signed']
    ];

    if(paymentWorkspace){
      return h(React.Fragment,null,
        h('div',{className:'samara-payment-page'},
          h('div',{className:'samara-payment-page-head'},
            h('div',null,h('div',{className:'samara-payment-eyebrow'},'SAMARA SECURE PAYMENT'),h('h2',null,'Online Payment'),h('p',null,'Create, share or display the Razorpay payment request for the selected patient.')),
            h('button',{type:'button',className:'btn samara-payment-back',disabled:paymentRequestBusy,onClick:()=>{setPaymentWorkspace(false);setPaymentRequest(null)}},'← Back to Payments')
          ),
          paymentRequestBusy&&h('div',{className:'samara-payment-preparing'},h('div',{className:'samara-payment-spinner'}),h('strong',null,'Preparing secure Razorpay payment link…'),h('span',null,'Please wait for a moment. Do not click again.')),
          !paymentRequestBusy&&paymentRequest&&paymentRequest.patient_id===patientFilter&&h('div',{className:'samara-payment-request-card'},
            h('div',{className:'samara-payment-request-summary'},h('div',null,h('span',null,'Patient'),h('strong',null,paymentRequest.patient_name||'Patient')),h('div',null,h('span',null,'Purpose'),h('strong',null,paymentRequest.payment_type==='advance'?'Advance Payment':'Outstanding Payment')),h('div',null,h('span',null,'Amount'),h('strong',{className:'samara-payment-request-amount'},money(paymentRequest.amount)))),
            h('div',{className:'samara-payment-link-box'},h('span',null,'Secure Razorpay link'),h('code',null,paymentRequest.payment_url),paymentRequest.contact_masked?h('small',{style:{display:'block',marginTop:'6px',color:'#16814d'}},`Payer mobile pre-filled: ${paymentRequest.contact_masked}`):paymentRequest.contact_prefilled===false?h('small',{style:{display:'block',marginTop:'6px',color:'#b45309'}},'No family mobile found. Razorpay will ask the payer for a mobile number.'):null),
            paymentWhatsAppStatus&&h('div',{className:`samara-payment-send-status ${paymentWhatsAppStatus.type||''}`},h('div',{className:'samara-payment-send-icon','aria-hidden':'true'},paymentWhatsAppStatus.type==='progress'?'↻':paymentWhatsAppStatus.type==='success'?'✓':'!'),h('div',{className:'samara-payment-send-copy'},h('strong',null,paymentWhatsAppStatus.title),h('span',null,paymentWhatsAppStatus.detail))),
            h('div',{className:'samara-payment-action-grid'},h('button',{type:'button',className:'btn btn-whatsapp',disabled:paymentWhatsAppBusy,onClick:sendPaymentLinkWhatsApp},paymentWhatsAppBusy?'Sending…':'Send via WhatsApp'),h('button',{type:'button',className:'btn btn-primary',disabled:paymentRequestBusy,onClick:showPaymentQr,title:'Create a fixed-amount Razorpay UPI QR for this payment request. No family mobile number or email is sent for QR creation.'},'Show Direct UPI QR'),h('button',{type:'button',className:'btn btn-secondary',onClick:async()=>{await navigator.clipboard.writeText(paymentRequest.payment_url);notify('success','Link copied','Secure payment link copied to clipboard.')}},'Copy Link'),h('button',{type:'button',className:'btn btn-secondary',onClick:()=>window.open(paymentRequest.payment_url,'_blank','noopener')},'Open Razorpay'),h('button',{type:'button',className:'btn btn-secondary',disabled:paymentRequestBusy,onClick:checkOnlinePaymentStatus},'Check Payment Status'),h('button',{type:'button',className:'btn btn-danger',disabled:paymentRequestBusy||paymentRequest.status==='Paid',onClick:cancelOnlinePaymentRequest},'Cancel Payment Link')),
            h('div',{className:'samara-payment-request-foot'},`Request ID: ${paymentRequest.request_code||paymentRequest.id||'—'}${paymentRequest.expires_at?` · Expires ${fmt(paymentRequest.expires_at)}`:''}`)
          )
        )
      );
    }

    return h(React.Fragment,null,
      dischargeTarget&&h(Section,{
        title:'Discharge Final Payment',
        subtitle:`${dischargeTarget.patient_name} · ${dischargeTarget.patient_code||'No ID'} · Room ${dischargeTarget.room_no||'—'}${dischargeTarget.bed_no?`-${dischargeTarget.bed_no}`:''}`
      },
        h('div',{className:'message info'},
          !ledgerReady?'Loading the complete patient ledger. Settlement actions remain unavailable.':advanceBalance>0.009
            ?`Excess patient balance detected: ${money(advanceBalance)} refundable. The system has initiated a dual-control refund workflow. One Administrator must complete the financial verification first; a different Administrator must then approve it before the case returns to Nursing.`
            :(Math.abs(netPayable)<=0.009?'Account settled. No additional payment is due. Verify the existing receipts and clear Accounts below.':'Complete the exact final settlement below. Financial clearance is permitted only after the system verifies the ledger, amount, payment evidence and closure remarks.')
        )
      ),

      h(Section,{
        title:'Patient Bills, Charges & Transaction History',
        subtitle:'Select one patient to display only that patient’s financial records'
      },
        h('div',{className:'payment-filter-grid'},
          patientSearchFields('payment-history'),
          h('div',{className:'field'},
            h('label',null,'Patient'),
            h('select',{
              value:patientFilter,
              disabled:!!dischargeTarget,
              onChange:e=>{
                const value=e.target.value;
                choosePaymentPatient(value);
              }
            },
              h('option',{value:''},'Select patient'),
              selectablePatients.map(patient=>h('option',{key:patient.id,value:patient.id},
                `${formalName(patient)||patient.full_name} · ${patient.patient_id||'No ID'}${patient.is_active===false?' · Discharged / Inactive':' · Active'}`
              ))
            )
          ),
          h('div',{className:'field'},
            h('label',null,'Quick View'),
            h('select',{value:quickView,onChange:e=>setQuickView(e.target.value)},
              ['Pending Bills','Payments / Advances','Discounts','Refunds','Complete Transaction History']
                .map(option=>h('option',{key:option,value:option},option==='Pending Bills'?'Pending Payments (Guest-wise)':option))
            )
          )
        ),
        h('div',{className:'payment-quick-buttons'},
          h('button',{type:'button',className:'btn btn-primary',onClick:()=>setQuickView('Pending Bills')},'Pending Payments (Guest-wise)'),
          h('button',{type:'button',className:'btn btn-secondary',onClick:()=>setQuickView('Complete Transaction History')},'Complete Transaction History'),
          patientFilter&&pendingBills>0&&h(React.Fragment,null,
            h('button',{
              type:'button',
              className:'btn btn-whatsapp',
              disabled:dailyPayableSent||dailyPayableChecking,
              onClick:()=>sendDailyBillWhatsAppApi({resend:false}),
              style:(dailyPayableSent||dailyPayableChecking)?{opacity:.58,cursor:'not-allowed'}:null
            },dailyPayableChecking?'Checking WhatsApp Status…':dailyPayableSent?'Daily Payable WhatsApp Sent ✓':'Send Daily Payable WhatsApp API'),
            dailyPayableSent&&h('button',{
              type:'button',
              className:'btn btn-secondary',
              onClick:()=>sendDailyBillWhatsAppApi({resend:true})
            },'Resend Daily Payable WhatsApp')
          )
          ,patientFilter&&h('div',{className:'online-payment-actions'},
            h('button',{type:'button',className:'btn samara-pay-main',disabled:paymentRequestBusy||pendingBills<1,onClick:()=>createOnlinePaymentRequest('outstanding')},paymentRequestBusy?'Preparing secure link…':`Create Online Payment · ${money(pendingBills)}`),
            h('button',{type:'button',className:'btn samara-pay-advance',disabled:paymentRequestBusy,onClick:openAdvancePaymentModal},'Advance Payment'),h('button',{type:'button',className:'btn btn-secondary',disabled:paymentRequestBusy,onClick:()=>syncPendingOnlinePayments({silent:false}),title:'Check Razorpay for any online payments not yet posted to the ledger'},'Sync Online Payments')
          )
        )
      ),

      advancePaymentModal&&h('div',{className:'samara-payment-modal',role:'dialog','aria-modal':'true'},h('div',{className:'samara-payment-backdrop',onClick:()=>!paymentRequestBusy&&setAdvancePaymentModal(false)}),h('div',{className:'samara-payment-card'},h('button',{type:'button',className:'samara-payment-close',disabled:paymentRequestBusy,onClick:()=>setAdvancePaymentModal(false),'aria-label':'Close'},'×'),h('div',{className:'samara-payment-brand'},h('img',{src:'./assets/samara-logo.png',alt:'Samara Assisted Living'})),h('div',{className:'samara-payment-heading'},h('div',{className:'samara-payment-icon'},'₹'),h('div',null,h('h2',null,'Enter Advance Payment'),h('p',null,'Create a secure Razorpay payment link for this patient.'))),h('label',{className:'samara-payment-label'},'Advance amount'),h('div',{className:'samara-amount-field'},h('span',null,'₹'),h('input',{type:'number',min:'1',max:'500000',step:'1',autoFocus:true,value:advancePaymentAmount,onChange:e=>setAdvancePaymentAmount(e.target.value),onKeyDown:e=>{if(e.key==='Enter'&&!paymentRequestBusy)createOnlinePaymentRequest('advance',advancePaymentAmount)}})),h('p',{className:'samara-payment-note'},'The family will receive a Razorpay-hosted secure payment link. Family Portal login is not required.'),h('div',{className:'samara-payment-actions'},h('button',{type:'button',className:'samara-btn secondary',disabled:paymentRequestBusy,onClick:()=>setAdvancePaymentModal(false)},'Cancel'),h('button',{type:'button',className:'samara-btn primary',disabled:paymentRequestBusy,onClick:()=>createOnlinePaymentRequest('advance',advancePaymentAmount)},paymentRequestBusy?'Preparing…':'Create Payment Link')))),

      patientFilter&&!ledgerReady&&h('div',{className:patientLedger.error?'message error':'message info'},patientLedger.error||'Loading complete patient ledger…'),
      (!patientFilter||ledgerReady)&&h('div',{className:'payment-summary-grid'},
        summaryCards.map(([label,value,klass,format])=>h('div',{
          className:`payment-summary-card ${klass}`,
          key:label
        },
          h('span',null,label),
          h('strong',null,format==='signed'?value:money(value)),
          format==='signed'&&h('small',null,
            signedFinancialBalance>0
              ?'Credit available with Samara'
              :signedFinancialBalance<0
                ?'Amount payable by patient'
                :'No amount due or refundable'
          )
        ))
      ),

      dischargeTarget&&ledgerReady&&advanceBalance>0.009&&h(Section,{
        title:'Refund Required Before Discharge',
        subtitle:activeAccountantPresent?'Dual-control financial clearance · Accountant verification → Admin approval → Nursing':'Dual-control financial clearance · Admin fallback verification → independent Admin approval → Nursing'
      },
        h('div',{className:'financial-security-banner'},
          h('strong',null,`System-calculated refund: ${money(advanceBalance)}`),
          h('span',null,'The amount is derived from the permanent patient ledger and cannot be overridden during discharge.')
        ),
        refundLoading&&h('div',{className:'message info'},'Preparing the controlled refund record…'),
        refundRequest&&h('div',{className:'refund-security-grid'},
          h('div',{className:'refund-security-card'},
            h('span',null,'Workflow Status'),
            h('strong',null,refundRequest.status||'Pending Accounts Verification'),
            h('small',null,`Request ${String(refundRequest.id||'').slice(0,8).toUpperCase()}`)
          ),
          h('div',{className:'refund-security-card'},
            h('span',null,'Refundable Balance'),
            h('strong',null,money(refundRequest.calculated_refund||advanceBalance)),
            h('small',null,'Revalidated again at every approval stage')
          ),
          h('div',{className:'refund-security-card'},
            h('span',null,'Financial Verification'),
            h('strong',null,refundRequest.accounts_verified_at?'Completed':'Pending'),
            h('small',null,refundRequest.accounts_verified_at?fmt(refundRequest.accounts_verified_at):(activeAccountantPresent?'Accountant verification required':'Admin fallback verification required'))
          ),
          h('div',{className:'refund-security-card'},
            h('span',null,'Admin Approval'),
            h('strong',null,refundRequest.admin_approved_at?'Completed':'Pending'),
            h('small',null,refundRequest.admin_approved_at?fmt(refundRequest.admin_approved_at):'Independent second-person control')
          )
        ),
        refundRequest&&canVerifyDischargeRefund&&refundRequest.status==='Pending Accounts Verification'&&h('div',{className:'payment-entry-grid refund-control-form'},
          h('div',{className:'message warning span-2'},h('strong',null,activeAccountantPresent?'Accountant financial verification required':'Admin financial verification required (Accountant position vacant)'),h('div',null,activeAccountantPresent?'Enter the actual refund evidence below. The system will re-check the patient ledger. After Accountant verification, an Administrator must complete the independent final approval.':'No active Accountant is currently configured. An Administrator may perform the financial verification. The system will then require a different Administrator for final approval.')),
          h('div',{className:'field'},h('label',null,'Refund Amount *'),h('input',{type:'number',step:'0.01',min:'0.01',value:refundForm.amount,onChange:e=>setRefundForm({...refundForm,amount:e.target.value}),placeholder:'Enter exact refundable amount'})),
          h('div',{className:'field'},h('label',null,'Confirm Refund Amount *'),h('input',{type:'number',step:'0.01',min:'0.01',value:refundForm.confirm_amount,onChange:e=>setRefundForm({...refundForm,confirm_amount:e.target.value}),placeholder:'Re-enter amount independently'})),
          h('div',{className:'field'},h('label',null,'Refund Payment Mode *'),h('select',{value:refundForm.payment_mode,onChange:e=>setRefundForm({...refundForm,payment_mode:e.target.value,payment_reference:''})},['Cash','UPI','RTGS','Card Payment'].map(v=>h('option',{key:v,value:v},v)))),
          h('div',{className:'field'},h('label',null,'Refund Receipt / Transaction Reference No. *'),h('input',{value:refundForm.payment_reference,onChange:e=>setRefundForm({...refundForm,payment_reference:e.target.value}),placeholder:'Mandatory receipt / bank / UPI reference'})),
          h('div',{className:'field span-2'},h('label',null,'Financial Closure Remarks *'),h('textarea',{rows:4,value:refundForm.accounts_remarks,onChange:e=>setRefundForm({...refundForm,accounts_remarks:e.target.value}),placeholder:'Confirm refund amount, payment mode, receipt/reference and ledger verification. These remarks become part of the permanent discharge audit trail.'})),
          h('button',{type:'button',className:'btn btn-primary span-2',disabled:saving,onClick:verifyRefundByAccounts},saving?'Checking ledger & saving…':'Verify Refund & Forward for Independent Approval')
        ),
        refundRequest&&activeAccountantPresent&&profile?.role==='Admin'&&refundRequest.status==='Pending Accounts Verification'&&h('div',{className:'message info'},'An active Accountant is configured. Financial verification must be completed by the Accountant before Admin approval becomes available.'),
        refundRequest&&!activeAccountantPresent&&profile?.role==='Accounts'&&refundRequest.status==='Pending Accounts Verification'&&h('div',{className:'message info'},'This Accounts profile is not currently recognised as an active Accountant. Ask an Administrator to check the employee/profile status.'),
        refundRequest&&profile?.role==='Accounts'&&refundRequest.status==='Pending Admin Approval'&&h('div',{className:'message success'},'Financial verification is complete and locked. Waiting for independent Administrator approval.'),
        refundRequest&&profile?.role==='Admin'&&refundRequest.status==='Pending Admin Approval'&&h('div',{className:'payment-entry-grid refund-control-form'},
          h('div',{className:'field'},h('label',null,'Verified Refund Amount'),h('input',{readOnly:true,value:money(refundRequest.accounts_amount)})),
          h('div',{className:'field'},h('label',null,'Payment Evidence'),h('input',{readOnly:true,value:`${refundRequest.payment_mode||'—'} · ${refundRequest.payment_reference||'—'}`})),
          h('div',{className:'field'},h('label',null,'Admin Confirm Refund Amount *'),h('input',{type:'number',step:'0.01',min:'0.01',value:refundForm.admin_confirm_amount,onChange:e=>setRefundForm({...refundForm,admin_confirm_amount:e.target.value}),placeholder:'Re-enter verified amount'})),
          h('div',{className:'field'},h('label',null,'Financial Verification Remarks'),h('input',{readOnly:true,value:refundRequest.accounts_remarks||'—'})),
          h('div',{className:'field span-2'},h('label',null,'Admin Approval Remarks *'),h('textarea',{rows:3,value:refundForm.admin_remarks,onChange:e=>setRefundForm({...refundForm,admin_remarks:e.target.value}),placeholder:'Confirm independent review of ledger and refund evidence.'})),
          h('label',{className:'financial-confirm-check span-2'},h('input',{type:'checkbox',checked:refundForm.admin_confirmed,onChange:e=>setRefundForm({...refundForm,admin_confirmed:e.target.checked})}),h('span',null,'I independently verified the patient ledger, refundable balance, payment mode and refund receipt/reference evidence.')),
          h('button',{type:'button',className:'btn btn-primary span-2',disabled:saving,onClick:approveRefundByAdmin},saving?'Approving…':'Approve Refund & Return to Nursing')
        ),
        refundRequest&&refundRequest.status==='Completed'&&h('div',{className:'message success'},`Refund ${money(refundRequest.accounts_amount||refundRequest.calculated_refund)} completed and posted to the ledger. Accounts clearance has returned to Nursing.`)
      ),

      patientFilter&&h(ChargeReadinessSummary,{state:chargeReadiness}),
      dischargeTarget&&ledgerReady&&Math.abs(netPayable)<=0.009&&message&&h('div',{className:'message error'},message),
      dischargeTarget&&ledgerReady&&Math.abs(netPayable)<=0.009&&h(Section,{title:'Zero Balance Discharge Clearance',subtitle:'Verify all charges and close the account without recording a payment.'},
        h('label',null,'Accounts Closure Remarks'),
        h('textarea',{value:form.closure_remarks,onChange:e=>setForm({...form,closure_remarks:e.target.value}),rows:3}),
        h('button',{type:'button',className:'btn btn-primary',disabled:saving||loading||clearanceBlocked||!['Admin','Accounts'].includes(profile?.role),onClick:clearZeroBalance},saving?'Checking…':'Verify ₹0 Balance & Clear Accounts')
      ),
      (!dischargeTarget||(ledgerReady&&pendingBills>0.009))&&h(Section,{
        title:dischargeTarget?'Final Payment & Discharge Settlement':'Manual Billing & Payment Entry',
        subtitle:dischargeTarget
          ?'Enter payment details. Exact settlement will close the discharge automatically.'
          :'Accounts, Admin and Manager only'
      },
        h('form',{className:'payment-entry-grid',onSubmit:savePaymentAndPossiblyClose},
          posScannerOpen&&h(PosScreenScanner,{onClose:()=>setPosScannerOpen(false),onVerified:applyPosScan}),
          posPhoneOpen&&h(PosPhoneHandoff,{onClose:()=>setPosPhoneOpen(false),onVerified:applyPosScan}),
          patientSearchFields('payment-entry'),
          h('div',{className:'field'},
            h('label',null,'Patient'),
            h('select',{
              value:form.patient_id,
              disabled:!!dischargeTarget,
              onChange:e=>choosePaymentPatient(e.target.value)
            },
              h('option',{value:''},'Select patient'),
              selectablePatients.map(patient=>h('option',{key:patient.id,value:patient.id},
                `${patient.patient_id||'No ID'} · ${formalName(patient)||patient.full_name}${patient.is_active===false?' · Inactive / Discharged':` · Room ${patient.room_no||'—'}-${patient.bed_no||'—'}`}`
              ))
            )
          ),
          h('div',{className:'field'},
            h('label',null,'Transaction'),
            h('select',{
              value:form.transaction_type,
              disabled:!!dischargeTarget,
              onChange:e=>{const t=e.target.value;setLastVoucherNo('');setForm({...form,transaction_type:t,payment_reference:'',category:t==='Charge'&&!MANUAL_CHARGE_CATEGORIES.includes(form.category)?'Room Charges':form.category})}
            },
              (canDiscount?['Payment','Advance','Charge','Discount','Refund']:['Payment','Advance','Charge','Refund'])
                .map(option=>h('option',{key:option,value:option},option))
            )
          ),
          h('div',{className:'field'},
            h('label',null,'Category'),
            h('select',{
              value:form.category,
              onChange:e=>setForm({...form,category:e.target.value})
            },
              (form.transaction_type==='Charge'?MANUAL_CHARGE_CATEGORIES:[
                'Final Settlement','Advance','Room Charges','Nursing Charges',
                'Special Nurse Charges','Food Charges','Medicine Charges',
                'Physiotherapy','Consumables','Doctor Visit','Lab Charges',
                'Hospital Charges','Ambulance / Transport','Equipment','Other'
              ]).map(option=>h('option',{key:option,value:option},option))
            )
          ),
          h('div',{className:'field'},
            h('label',null,dischargeTarget?'Net Payable Amount':'Amount'),
            h('input',{
              type:'number',
              min:'0.01',
              step:'0.01',
              required:true,
              value:form.amount,
              readOnly:posUseScan&&!!form.pos_scan,
              title:posUseScan&&form.pos_scan?'Amount taken from the swipe machine screen':'',
              onChange:e=>{if(isAutoVoucherTransaction)setLastVoucherNo('');setForm({...form,amount:e.target.value,payment_reference:isAutoVoucherTransaction?'':form.payment_reference})}
            })
          ),
          !['Charge','Discount'].includes(form.transaction_type)&&h('div',{className:'field'},
            h('label',null,'Payment Mode'),
            h('select',{value:form.payment_mode,onChange:e=>{const mode=e.target.value;setLastVoucherNo('');setForm({...form,payment_mode:mode,payment_reference:''})}},
              ['Cash','UPI','RTGS','Card Payment']
                .map(option=>h('option',{key:option,value:option},option==='Card Payment'?'Card / UPI – HDFC swipe machine':option))
            )
          ),
          !['Charge','Discount'].includes(form.transaction_type)&&h('div',{className:'field'},
            h('label',null,
              isAutoVoucherTransaction
                ?`${form.payment_mode==='Cash'?'Cash':'Card'} Voucher / Payment Reference No.`
                :`${form.payment_mode} Transaction Reference No.`
            ),
            h('input',{
              value:isAutoVoucherTransaction?(lastVoucherNo||form.payment_reference||''):form.payment_reference,
              readOnly:isAutoVoucherTransaction,
              required:['UPI','RTGS'].includes(form.payment_mode)&&['Payment','Advance','Refund'].includes(form.transaction_type),
              placeholder:isAutoVoucherTransaction
                ?`Auto-generated when ${form.payment_mode} transaction is saved`
                :`Enter ${form.payment_mode} transaction reference`,
              onChange:e=>setForm({...form,payment_reference:e.target.value})
            }),
            isAutoVoucherTransaction&&h('small',{className:'muted'},
              lastVoucherNo
                ?`${form.payment_mode==='Cash'?'Cash':'Card'} Voucher created: ${lastVoucherNo}`
                :`${form.payment_mode} transaction will be posted only after the system creates its voucher number.`
            )
          ),
          posUseScan&&h('div',{className:'field span-2'},
            h('label',null,'HDFC swipe machine payment *'),
            form.pos_scan
              ?h('div',{style:{background:'linear-gradient(135deg,#fff5fa,#ffe3ef)',border:'1px solid #f3c4d9',borderRadius:'12px',padding:'10px 12px',color:'#5d1740'}},
                  h('div',{style:{fontWeight:800,color:'#16814d'}},`✓ Verified from the machine screen · ₹${Number(form.pos_scan.amount).toLocaleString('en-IN',{minimumFractionDigits:2})}`),
                  h('div',{style:{fontSize:'13px'}},`${form.pos_scan.paid_by==='UPI on machine'?'UPI (QR on the machine)':'Card'+(form.pos_scan.card_last4?' ending '+form.pos_scan.card_last4:'')} · RRN ${form.pos_scan.rrn||'—'} · Txn ID ${form.pos_scan.transaction_id||'—'}`),
                  h('button',{type:'button',className:'btn secondary',style:{marginTop:'6px'},onClick:()=>{setForm(f=>({...f,pos_scan:null,amount:''}));}},'Scan again'))
              :h('div',null,
                  h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap'}},
                    h('button',{type:'button',className:'btn',style:{fontSize:'16px',padding:'12px 18px'},onClick:()=>openPosScanner('camera')},'📷 Scan machine screen'),
                    h('button',{type:'button',className:'btn secondary',style:{fontSize:'16px',padding:'12px 18px'},onClick:()=>openPosScanner('phone')},'📱 Scan with phone')),
                  h('small',{className:'muted',style:{display:'block',marginTop:'4px'}},'After the machine shows TRANSACTION APPROVED, scan its screen — with this device (📷), or from a laptop with your phone (📱 shows a QR to scan). The amount and payment details are filled from the machine and checked; the WhatsApp receipt with PDF goes to the family automatically.')),
            profile?.role==='Admin'&&h('button',{type:'button',className:'login-link-button',style:{marginTop:'6px',fontSize:'12px'},onClick:()=>setForm(f=>({...f,pos_typed:true,pos_scan:null}))},'Screen not available? Type slip details (Admin only)')
          ),
          isPosEntry&&form.pos_typed&&h('div',{className:'field span-2'},
            h('small',{className:'muted'},'Admin typed entry (fallback). ',h('button',{type:'button',className:'login-link-button',onClick:()=>setForm(f=>({...f,pos_typed:false}))},'Back to Scan machine screen'))),
          isPosEntry&&form.pos_typed&&h('div',{className:'field'},
            h('label',null,'Paid on the swipe machine by'),
            h('select',{value:form.pos_paid_by,onChange:e=>setForm({...form,pos_paid_by:e.target.value,pos_last4:''})},
              h('option',{value:'Card'},'Card (tap / swipe / insert)'),
              h('option',{value:'UPI on machine'},'UPI QR shown on the machine'))
          ),
          isPosEntry&&form.pos_typed&&h('div',{className:'field'},
            h('label',null,form.pos_paid_by==='UPI on machine'?'RRN on the slip *':'Approval Code on the slip *'),
            h('input',{value:form.pos_approval,required:true,maxLength:16,autoComplete:'off',style:{textTransform:'uppercase'},
              placeholder:form.pos_paid_by==='UPI on machine'?'e.g. 429512345678':'e.g. 123456 or A1B2C3',
              onChange:e=>setForm({...form,pos_approval:e.target.value})}),
            h('small',{className:'muted'},'Check the amount on the slip matches. The same slip cannot be entered twice. The WhatsApp receipt with PDF goes to the family automatically.')
          ),
          isPosEntry&&form.pos_typed&&form.pos_paid_by==='Card'&&h('div',{className:'field'},
            h('label',null,'Card last 4 digits (optional)'),
            h('input',{value:form.pos_last4,inputMode:'numeric',maxLength:4,placeholder:'e.g. 4417',onChange:e=>setForm({...form,pos_last4:e.target.value.replace(/\D/g,'').slice(0,4)})})
          ),
          h('div',{className:'field span-2'},
            h('label',null,'Description'),
            h('input',{
              value:form.description,
              placeholder:form.transaction_type==='Discount'?'Reason for the discount':'Payment particulars',
              onChange:e=>setForm({...form,description:e.target.value})
            })
          ),
          dischargeTarget&&h('div',{className:'field span-2'},
            h('label',null,'Accounts Closure Remarks'),
            h('textarea',{
              rows:3,
              required:true,
              value:form.closure_remarks,
              onChange:e=>setForm({...form,closure_remarks:e.target.value}),
              placeholder:'Confirm final settlement, receipt details, advance adjustment or refund, if any.'
            })
          ),
          h('button',{
            className:'btn btn-primary span-2 payment-submit',
            disabled:saving||!form.patient_id||!!dischargeTarget&&(loading||clearanceBlocked)
          },saving
            ?'Processing…'
            :dischargeTarget
              ?`Receive ${money(Number(form.amount||pendingBills))} & Close Discharge`
              :'Save Transaction'
          )
        ),
        message&&h('div',{className:'message error'},message),
        lastPaymentReceipt&&h('div',{className:'message success',style:{marginTop:'10px'}},
          h('strong',null,'Payment receipt ready'),
          h('div',null,`${money(lastPaymentReceipt.amount)} · ${lastPaymentReceipt.category||'Payment'} · ${lastPaymentReceipt.payment_mode}${lastPaymentReceipt.reference?` · ${lastPaymentReceipt.reference}`:''}`),
          lastPaymentReceipt.transaction_id?h('div',{style:{marginTop:'8px'}},h(SendReceiptButton,{transactionId:lastPaymentReceipt.transaction_id,amountText:money(lastPaymentReceipt.amount)})):h('button',{type:'button',className:'btn btn-whatsapp',style:{marginTop:'8px'},onClick:()=>sendPaymentReceiptWhatsAppApi(lastPaymentReceipt)},'Resend Payment Receipt WhatsApp API')
        )
      ),

      dashboardPaymentFocus==='outstanding'&&h(LogTable,{
        title:`Outstanding Patients (${outstandingByPatient.length})`,
        subtitle:'Patient-wise live amount payable represented by the Dashboard Outstanding Amount',
        heads:['Patient','Resident ID','Room / Bed','Outstanding'],
        rows:outstandingByPatient.map(item=>[
          formalName(item.patient)||item.patient?.full_name||'—',
          item.patient?.patient_id||'—',
          `${item.patient?.room_no||'—'}${item.patient?.bed_no?`-${item.patient.bed_no}`:''}`,
          money(item.balance)
        ])
      }),

      quickView==='Pending Bills'?(()=>{
        // 2.18.175: Pending Payments — one row per Guest, highest balance first; tap a row for the full breakdown
        const list=patientFilter?guestPending.filter(g=>g.patient_id===patientFilter):guestPending;
        const total=list.reduce((v,g)=>v+g.balance,0);
        const nameOf=g=>formalName(g.patient||{})||g.patient?.full_name||'Guest';
        const roomOf=g=>g.patient?.room_no?`${g.patient.room_no}${g.patient.bed_no?'-'+g.patient.bed_no:''}`:'—';
        const cell={padding:'10px 12px',borderBottom:'1px solid #f3d6e4',textAlign:'left',verticalAlign:'top'};
        const num={...cell,textAlign:'right',whiteSpace:'nowrap'};
        return h('div',{className:'section-card',style:{marginTop:'14px'}},
          h('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'baseline',flexWrap:'wrap',gap:'8px'}},
            h('div',null,h('h3',{style:{margin:0}},`Pending Payments (${list.length} Guest${list.length===1?'':'s'})`),
              h('small',{style:{color:'#8a5a70'}},'Amount each Guest still has to pay, highest first. Tap a Guest to see what it is made of.')),
            h('strong',{style:{color:'#b42318',fontSize:'18px'}},`Total pending ${money(total)}`)),
          ledgerAll.loading?h('p',null,'Loading Guest balances…'):ledgerAll.error?h('div',{className:'message error'},ledgerAll.error):
          !list.length?h('p',{style:{color:'#2e7d4f',fontWeight:700}},'✓ No pending payments — every Guest account is settled or in advance.'):
          h('div',{className:'table-wrap'},h('table',{className:'table',style:{width:'100%'}},
            h('thead',null,h('tr',null,['S.No','Guest','Room','Total Charges','Paid / Advance','Discount','Pending'].map((x,i)=>h('th',{key:x,style:i>=3?{textAlign:'right'}:{}},x)))),
            h('tbody',null,...list.flatMap((g,i)=>{
              const open=openGuest===g.patient_id;
              const main=h('tr',{key:g.patient_id,style:{cursor:'pointer',background:open?'#fde7f1':undefined},onClick:()=>{setOpenGuest(open?'':g.patient_id);setOpenGuestAll(false)}},
                h('td',{style:cell},String(i+1)),
                h('td',{style:cell},h('strong',null,nameOf(g)),h('small',{style:{display:'block',color:'#8a5a70'}},`${g.patient?.patient_id||''}${g.patient?.is_active===false?' · Discharged':''}`)),
                h('td',{style:cell},roomOf(g)),
                h('td',{style:num},money(g.charges)),
                h('td',{style:num},money(g.paid)),
                h('td',{style:num},g.discount?money(g.discount):'—'),
                h('td',{style:{...num,color:'#b42318',fontWeight:800,fontSize:'15px'}},money(g.balance),h('span',{style:{marginLeft:'6px',color:'#b01867'}},open?'▲':'▼')));
              if(!open)return [main];
              const cats=Object.entries(g.cats).sort((a,b)=>b[1].amount-a[1].amount);
              const items=g.charges_list.slice().sort((a,b)=>String(b.transaction_date).localeCompare(String(a.transaction_date)));
              const shown=openGuestAll?items:items.slice(0,15);
              const detail=h('tr',{key:g.patient_id+'-d'},h('td',{colSpan:7,style:{background:'#fff7fb',padding:'14px 16px',borderBottom:'2px solid #f3c2d8'}},
                h('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))',gap:'14px'}},
                  h('div',null,h('h4',{style:{margin:'0 0 6px'}},'Charges by type'),
                    h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'13px'}},h('tbody',null,
                      ...cats.map(([c,v])=>h('tr',{key:c},h('td',{style:{padding:'4px 0'}},c),h('td',{style:{padding:'4px 0',color:'#8a5a70'}},`${v.count} entr${v.count===1?'y':'ies'}`),h('td',{style:{padding:'4px 0',textAlign:'right'}},money(v.amount)))),
                      h('tr',null,h('td',{colSpan:2,style:{padding:'6px 0',borderTop:'1px solid #f3d6e4',fontWeight:700}},'Total charges'),h('td',{style:{padding:'6px 0',borderTop:'1px solid #f3d6e4',textAlign:'right',fontWeight:700}},money(g.charges))),
                      h('tr',null,h('td',{colSpan:2,style:{padding:'4px 0'}},'Less: Paid / Advance'),h('td',{style:{padding:'4px 0',textAlign:'right'}},'− '+money(g.paid))),
                      g.discount?h('tr',null,h('td',{colSpan:2,style:{padding:'4px 0'}},'Less: Discount'),h('td',{style:{padding:'4px 0',textAlign:'right'}},'− '+money(g.discount))):null,
                      g.refund?h('tr',null,h('td',{colSpan:2,style:{padding:'4px 0'}},'Add: Refund given'),h('td',{style:{padding:'4px 0',textAlign:'right'}},'+ '+money(g.refund))):null,
                      h('tr',null,h('td',{colSpan:2,style:{padding:'6px 0',borderTop:'2px solid #b01867',fontWeight:800,color:'#b42318'}},'Pending'),h('td',{style:{padding:'6px 0',borderTop:'2px solid #b01867',textAlign:'right',fontWeight:800,color:'#b42318'}},money(g.balance)))))),
                  h('div',null,h('h4',{style:{margin:'0 0 6px'}},'Payments received'),
                    !g.money_list.length?h('p',{style:{margin:0,color:'#8a5a70'}},'No payment yet.'):
                    h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'13px'}},h('tbody',null,
                      ...g.money_list.slice().reverse().map(r=>h('tr',{key:r.id},h('td',{style:{padding:'4px 0'}},formatDateIN(r.transaction_date)),h('td',{style:{padding:'4px 0'}},`${r.transaction_type}${r.category&&r.category!==r.transaction_type?' · '+r.category:''}`),h('td',{style:{padding:'4px 0',textAlign:'right'}},money(r.amount)))))),
                    h('div',{style:{display:'flex',gap:'8px',flexWrap:'wrap',marginTop:'12px'}},
                      h('button',{type:'button',className:'btn btn-primary',onClick:e=>{e.stopPropagation();choosePaymentPatient(g.patient_id);setForm(current=>({...current,patient_id:g.patient_id,transaction_type:'Payment',amount:String(g.balance)}));window.scrollTo({top:0,behavior:'smooth'})}},`Receive ${money(g.balance)}`)))),
                h('h4',{style:{margin:'14px 0 6px'}},`Charge entries (${items.length})`),
                h('table',{style:{width:'100%',borderCollapse:'collapse',fontSize:'12.5px'}},
                  h('thead',null,h('tr',null,['Date','Type','Item','Amount'].map((x,i)=>h('th',{key:x,style:{textAlign:i===3?'right':'left',padding:'4px 6px',color:'#7a1247'}},x)))),
                  h('tbody',null,...shown.map(r=>{const d=String(r.description||'').split(' · ')[0];return h('tr',{key:r.id},h('td',{style:{padding:'3px 6px',whiteSpace:'nowrap'}},formatDateIN(r.transaction_date)),h('td',{style:{padding:'3px 6px'}},r.category||'—'),h('td',{style:{padding:'3px 6px'},title:r.description||''},d.length>80?d.slice(0,80)+'…':d||'—'),h('td',{style:{padding:'3px 6px',textAlign:'right',whiteSpace:'nowrap'}},money(r.amount)))}))),
                items.length>15?h('button',{type:'button',className:'btn btn-secondary',style:{marginTop:'8px'},onClick:e=>{e.stopPropagation();setOpenGuestAll(!openGuestAll)}},openGuestAll?'Show latest 15 only':`Show all ${items.length} entries`):null));
              return [main,detail];
            }))
          )));
      })():
      h(LogTable,{
        title:quickView==='Complete Transaction History'
          ?'Complete Transaction History'
          :quickView,
        subtitle:'Tap 📩 Send Receipt on any Payment / Advance to send the WhatsApp receipt with PDF to the family again. No new financial entry is made.',
        // 2.18.174: "Send Receipt" first and a short description, so staff never scroll sideways to act
        heads:['Receipt','Date','Patient','Type','Amount','Mode','Description'],
        rows:filteredRows.map(row=>[
          ['Payment','Advance'].includes(row.transaction_type)&&row.id
            ?h(SendReceiptButton,{transactionId:row.id,amountText:money(row.amount)}):'—',
          fmt(row.transaction_date),
          formalName(row.patients||{})||row.patients?.full_name||'—',
          row.category&&row.category!==row.transaction_type?`${row.transaction_type} · ${row.category}`:row.transaction_type,
          money(row.amount),
          row.payment_mode||'—',
          (()=>{const d=String(row.description||'').trim();return d?h('span',{title:d},d.length>70?d.slice(0,70)+'…':d):'—'})()
        ])
      }),

      toast&&h('div',{className:`samara-toast ${toast.type}`},
        h('span',{className:'samara-toast-icon'},toast.type==='success'?'✓':'!'),
        h('div',null,h('strong',null,toast.title),h('span',null,toast.text)),
        h('button',{onClick:()=>setToast(null)},'×')
      )
    );
  }
