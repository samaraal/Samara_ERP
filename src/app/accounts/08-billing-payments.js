  function BillingPayments({profile}){
    const [patients]=usePatients();
    // Accounts history must remain available after discharge.  Keep the existing
    // active-patient list for new manual entries, and load a separate all-patient
    // list only for financial history / receipt resend selection.
    const [financialPatients,setFinancialPatients]=React.useState([]);
    React.useEffect(()=>{
      let cancelled=false;
      (async()=>{
        const {data,error}=await client.from('patients').select('*').order('full_name');
        if(error){console.error('Accounts patient history list could not be loaded:',error);return}
        if(!cancelled)setFinancialPatients(data||[]);
      })();
      const ch=client.channel(`accounts-all-patients-${Math.random()}`)
        .on('postgres_changes',{event:'*',schema:'public',table:'patients'},async()=>{
          const {data,error}=await client.from('patients').select('*').order('full_name');
          if(!error&&!cancelled)setFinancialPatients(data||[]);
        }).subscribe();
      return()=>{cancelled=true;client.removeChannel(ch)};
    },[]);
    const [rows,setRows]=React.useState([]);
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

    const [patientFilter,setPatientFilter]=React.useState(dischargeTarget?.patient_id||'');
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
      patient_id:dischargeTarget?.patient_id||'',
      transaction_type:'Payment',
      category:'Final Settlement',
      amount:'',
      payment_mode:'Cash',
      payment_reference:'',
      description:'',
      closure_remarks:'All payments received and final account settled.'
    });

    const isAutoVoucherTransaction=
      ['Cash','Card Payment'].includes(form.payment_mode) &&
      ['Payment','Advance','Refund'].includes(form.transaction_type);

    React.useEffect(()=>{
      if(!isAutoVoucherTransaction)setLastVoucherNo('');
    },[form.payment_mode,form.transaction_type]);



    function notify(type,title,text){
      showSamaraActionToast(type,title,text);
      setToast({type,title,text});
      setTimeout(()=>setToast(null),5000);
    }

    async function createOnlinePaymentRequest(kind='outstanding'){
      if(!patientFilter){notify('error','Select patient','Select a patient before creating an online payment request.');return}
      if(kind==='outstanding'&&pendingBills<1){notify('error','No outstanding amount','This patient has no amount currently payable.');return}
      let amount=kind==='outstanding'?pendingBills:0;
      if(kind==='advance'){
        const entered=window.prompt('Enter advance amount (₹):','');
        if(entered===null)return;
        amount=Number(String(entered).replace(/,/g,'').trim());
        if(!Number.isFinite(amount)||amount<1||amount>500000){notify('error','Invalid amount','Enter an advance amount between ₹1 and ₹5,00,000.');return}
      }
      setPaymentRequestBusy(true);
      try{
        const {data:{session}}=await client.auth.getSession();
        if(!session)throw new Error('Your ERP session has expired. Please sign in again.');
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/staff-payment-request`,{
          method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.supabasePublishableKey,'Authorization':`Bearer ${session.access_token}`},
          body:JSON.stringify({action:'create',patient_id:patientFilter,payment_type:kind,amount:Number(amount)})
        });
        const result=await response.json().catch(()=>({}));
        if(!response.ok||result.success===false)throw new Error(result.error||'Payment request could not be created.');
        setPaymentRequest(result);
        notify('success','Payment request created',`${kind==='advance'?'Advance':'Outstanding'} payment request for ${money(result.amount||amount)} is ready.`);
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
      if(!paymentRequest?.payment_url)return;
      try{
        const qr=await ensurePaymentQr();
        const dataUrl=qr.toDataURL(paymentRequest.payment_url,{margin:3,scale:8});
        const w=window.open('','_blank','width=520,height=720');
        if(!w)throw new Error('Allow pop-ups to display the payment QR code.');
        w.document.write(`<!doctype html><html><head><title>Samara Payment QR</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial,sans-serif;text-align:center;padding:24px;color:#5d1740;background:#fff7fb}main{max-width:440px;margin:auto;background:#fff;padding:24px;border-radius:20px;box-shadow:0 10px 35px #b0186720}img{width:min(330px,85vw)}h1{color:#b01867}.amt{font-size:34px;font-weight:800}.small{font-size:13px;color:#765}</style></head><body><main><h1>Samara Assisted Living</h1><p>Scan to pay securely</p><div class="amt">${money(paymentRequest.amount)}</div><p>${paymentRequest.patient_name||''}<br>${paymentRequest.payment_type==='advance'?'Advance Payment':'Outstanding Payment'}</p><img src="${dataUrl}" alt="Payment QR"><p class="small">This QR opens the secure Razorpay payment link. Request expires ${paymentRequest.expires_at?fmt(paymentRequest.expires_at):'automatically'}.</p></main></body></html>`);w.document.close();
      }catch(error){notify('error','QR could not be displayed',error.message||String(error))}
    }

    async function sendPaymentLinkWhatsApp(){
      if(!paymentRequest?.payment_url)return;
      try{
        const {data:contacts,error}=await client.from('family_portal_access').select('mobile,relative_name,is_active').eq('patient_id',patientFilter).eq('is_active',true);
        if(error)throw error;
        const targets=(contacts||[]).filter(x=>normalizeWhatsAppRecipient(x.mobile));
        if(!targets.length)throw new Error('No active Family Portal mobile number is available for this patient.');
        const text=`Samara Assisted Living\nSecure payment request for ${paymentRequest.patient_name||'patient'}\nPurpose: ${paymentRequest.payment_type==='advance'?'Advance Payment':'Outstanding Payment'}\nAmount: ${money(paymentRequest.amount)}\nPay securely: ${paymentRequest.payment_url}\nThis link is unique to this payment request and will expire automatically.`;
        const failures=[];
        for(const contact of targets){try{await sendWhatsAppText({to:contact.mobile,text})}catch(e){failures.push(`${contact.relative_name||contact.mobile}: ${e.message}`)}}
        if(failures.length===targets.length)throw new Error(failures.join(' | '));
        notify(failures.length?'error':'success',failures.length?'Partly sent':'Payment link sent',failures.length?`Sent to ${targets.length-failures.length} contact(s). ${failures.join(' | ')}`:`WhatsApp payment link sent to ${targets.length} family contact(s).`);
      }catch(error){notify('error','WhatsApp not sent',error.message||String(error))}
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
      const paymentRefresh=setInterval(load,15000);
      window.addEventListener('samara-refresh-charges',load);
      const channel=client.channel('billing-payments-live-v216')
        .on('postgres_changes',{event:'*',schema:'public',table:'billing_transactions'},load)
        .on('postgres_changes',{event:'*',schema:'public',table:'patient_discharges'},load)
        .subscribe();
      return()=>{clearInterval(paymentRefresh);window.removeEventListener('samara-refresh-charges',load);client.removeChannel(channel)};
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
      return Object.values(grouped).filter(x=>x.balance>0.009).sort((a,b)=>b.balance-a.balance);
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

    async function sendPaymentReceiptWhatsAppApi(receipt,{automatic=false}={}){
      if(!receipt)return false;
      const patient=patients.find(p=>p.id===receipt.patient_id)||{};
      // Payment receipts must also work for discharged/inactive patients.
      // Family contacts are stored in family_portal_access (including Contact 2),
      // so do not rely only on the legacy attendant_phone field on patients.
      let familyContacts=[];
      try{
        const {data,error}=await client.from('family_portal_access')
          .select('id,relative_name,mobile,primary_contact,is_active,created_at')
          .eq('patient_id',receipt.patient_id)
          .eq('is_active',true)
          .order('primary_contact',{ascending:false})
          .order('created_at',{ascending:true});
        if(error)throw error;
        familyContacts=(data||[])
          .map(contact=>({
            name:String(contact.relative_name||'Family Member').trim()||'Family Member',
            mobile:normalizeWhatsAppRecipient(contact.mobile||''),
            primary:!!contact.primary_contact
          }))
          .filter(contact=>contact.mobile);
      }catch(contactError){
        console.warn('Could not load family_portal_access for payment WhatsApp:',contactError);
      }
      const legacyMobile=normalizeWhatsAppRecipient(patient.attendant_phone||patient.mobile||'');
      if(legacyMobile&&!familyContacts.some(contact=>contact.mobile===legacyMobile)){
        familyContacts.push({name:patient.attendant_name||'Family Member',mobile:legacyMobile,primary:familyContacts.length===0});
      }
      // Remove accidental duplicate numbers while preserving primary/contact order.
      familyContacts=familyContacts.filter((contact,index,list)=>list.findIndex(item=>item.mobile===contact.mobile)===index);
      if(!familyContacts.length){
        const text='Family / patient WhatsApp number is not available in the Patient File or Family Contacts.';
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
      const to=patient.attendant_phone||patient.mobile||'';
      if(!to){setMessage('Family / patient WhatsApp number is not available in the Patient File.');return}
      const recipient=patient.attendant_name||formalName(patient)||patient.full_name||'Family Member';
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
      let actualReference=String(form.payment_reference||'').trim();

      if(isAutoVoucherTransaction){
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
          payment_mode:form.transaction_type==='Charge'?'Not applicable':form.payment_mode,
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
          payment_reference:actualReference||null
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
        setLastPaymentReceipt(savedPaymentReceipt);
        await sendPaymentReceiptWhatsAppApi(savedPaymentReceipt,{automatic:true});
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
      ['Pending Bills',pendingBills,pendingBills>0?'summary-red':'summary-green'],
      [balanceLabel,balanceDisplay,balanceTone,'signed']
    ];

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
          h('div',{className:'field'},
            h('label',null,'Patient'),
            h('select',{
              value:patientFilter,
              disabled:!!dischargeTarget,
              onChange:e=>{
                const value=e.target.value;
                setPatientFilter(value);
                setForm(current=>({...current,patient_id:value}));
              }
            },
              h('option',{value:''},'Select patient'),
              financialPatients.map(patient=>h('option',{key:patient.id,value:patient.id},
                `${formalName(patient)||patient.full_name} · ${patient.patient_id||'No ID'}${patient.is_active===false?' · Discharged / Inactive':' · Active'}`
              ))
            )
          ),
          h('div',{className:'field'},
            h('label',null,'Quick View'),
            h('select',{value:quickView,onChange:e=>setQuickView(e.target.value)},
              ['Pending Bills','Payments / Advances','Discounts','Refunds','Complete Transaction History']
                .map(option=>h('option',{key:option,value:option},option))
            )
          )
        ),
        h('div',{className:'payment-quick-buttons'},
          h('button',{type:'button',className:'btn btn-primary',onClick:()=>setQuickView('Pending Bills')},'Pending Bills as on Date'),
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
          ,patientFilter&&h(React.Fragment,null,
            h('button',{type:'button',className:'btn btn-primary',disabled:paymentRequestBusy||pendingBills<1,onClick:()=>createOnlinePaymentRequest('outstanding')},paymentRequestBusy?'Preparing…':`Create Online Payment · ${money(pendingBills)}`),
            h('button',{type:'button',className:'btn btn-secondary',disabled:paymentRequestBusy,onClick:()=>createOnlinePaymentRequest('advance')},'Create Advance Payment Link')
          )
        )
      ),

      paymentRequest&&paymentRequest.patient_id===patientFilter&&h(Section,{title:'Online Payment Request',subtitle:'Razorpay-hosted secure payment link · Family Portal login is not required'},
        h('div',{className:'message success'},
          h('strong',null,`${paymentRequest.payment_type==='advance'?'Advance':'Outstanding'} · ${money(paymentRequest.amount)}`),
          h('div',{style:{marginTop:'6px',wordBreak:'break-all'}},paymentRequest.payment_url),
          h('div',{className:'payment-quick-buttons',style:{marginTop:'12px'}},
            h('button',{type:'button',className:'btn btn-whatsapp',onClick:sendPaymentLinkWhatsApp},'Send Payment Link · WhatsApp API'),
            h('button',{type:'button',className:'btn btn-primary',onClick:showPaymentQr},'Show QR Code'),
            h('button',{type:'button',className:'btn btn-secondary',onClick:async()=>{await navigator.clipboard.writeText(paymentRequest.payment_url);notify('success','Link copied','Secure payment link copied to clipboard.')}},'Copy Payment Link'),
            h('button',{type:'button',className:'btn btn-secondary',onClick:()=>window.open(paymentRequest.payment_url,'_blank','noopener')},'Open Razorpay Payment Link')
          ),
          h('small',null,`Request ID: ${paymentRequest.request_code||paymentRequest.id||'—'}${paymentRequest.expires_at?` · Expires ${fmt(paymentRequest.expires_at)}`:''}`)
        )
      ),

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
          h('div',{className:'field'},
            h('label',null,'Patient'),
            h('select',{
              value:form.patient_id,
              disabled:!!dischargeTarget,
              onChange:e=>setForm({...form,patient_id:e.target.value})
            },
              h('option',{value:''},'Select patient'),
              patients.map(patient=>h('option',{key:patient.id,value:patient.id},
                `${patient.patient_id||'No ID'} · ${formalName(patient)||patient.full_name} · Room ${patient.room_no||'—'}-${patient.bed_no||'—'}`
              ))
            )
          ),
          h('div',{className:'field'},
            h('label',null,'Transaction'),
            h('select',{
              value:form.transaction_type,
              disabled:!!dischargeTarget,
              onChange:e=>setForm({...form,transaction_type:e.target.value})
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
              [
                'Final Settlement','Advance','Room Charges','Nursing Charges',
                'Special Nurse Charges','Food Charges','Medicine Charges',
                'Physiotherapy','Consumables','Doctor Visit','Lab Charges',
                'Hospital Charges','Ambulance / Transport','Equipment','Other'
              ].map(option=>h('option',{key:option,value:option},option))
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
              onChange:e=>{if(isAutoVoucherTransaction)setLastVoucherNo('');setForm({...form,amount:e.target.value,payment_reference:isAutoVoucherTransaction?'':form.payment_reference})}
            })
          ),
          h('div',{className:'field'},
            h('label',null,'Payment Mode'),
            h('select',{value:form.payment_mode,onChange:e=>{const mode=e.target.value;setLastVoucherNo('');setForm({...form,payment_mode:mode,payment_reference:''})}},
              ['Cash','UPI','RTGS','Card Payment']
                .map(option=>h('option',{key:option,value:option},option))
            )
          ),
          h('div',{className:'field'},
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
          h('div',{className:'field span-2'},
            h('label',null,'Description'),
            h('input',{
              value:form.description,
              placeholder:'Payment particulars',
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
          h('button',{type:'button',className:'btn btn-whatsapp',style:{marginTop:'8px'},onClick:()=>sendPaymentReceiptWhatsAppApi(lastPaymentReceipt)},'Resend Payment Receipt WhatsApp API')
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

      h(LogTable,{
        title:quickView==='Complete Transaction History'
          ?'Complete Transaction History'
          :quickView,
        subtitle:'Payment / Advance rows can resend the original Amount Received WhatsApp without creating another financial transaction.',
        heads:['Patient','Type','Category','Amount','Mode','Description','Date','WhatsApp'],
        rows:filteredRows.map(row=>[
          formalName(row.patients||{})||row.patients?.full_name||'—',
          row.transaction_type,
          row.category,
          money(row.amount),
          row.payment_mode||'—',
          row.description||'—',
          fmt(row.transaction_date),
          ['Payment','Advance'].includes(row.transaction_type)
            ?h('button',{
                type:'button',
                className:'btn btn-whatsapp',
                style:{padding:'6px 9px',fontSize:'12px',whiteSpace:'nowrap'},
                onClick:()=>sendPaymentReceiptWhatsAppApi({
                  patient_id:row.patient_id,
                  amount:Number(row.amount||0),
                  payment_mode:row.payment_mode||'—',
                  reference:row.payment_reference||row.reference||'',
                  transaction_id:row.id||'',
                  date:row.transaction_date||row.created_at||new Date().toISOString(),
                  category:row.category||row.transaction_type,
                  description:String(row.description||'').trim()
                })
              },'Resend WhatsApp')
            :'—'
        ])
      }),

      toast&&h('div',{className:`samara-toast ${toast.type}`},
        h('span',{className:'samara-toast-icon'},toast.type==='success'?'✓':'!'),
        h('div',null,h('strong',null,toast.title),h('span',null,toast.text)),
        h('button',{onClick:()=>setToast(null)},'×')
      )
    );
  }

