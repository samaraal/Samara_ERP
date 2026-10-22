import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
const json=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const env=(name:string)=>Deno.env.get(name)||'';
const supabaseUrl=env('SUPABASE_URL');
const serviceKey=env('SUPABASE_SERVICE_ROLE_KEY');
const razorKey=env('RAZORPAY_KEY_ID')||env('RAZORPAY_KEY');
const razorSecret=env('RAZORPAY_KEY_SECRET')||env('RAZORPAY_KEY_SECRET_KEY')||env('RAZORPAY_SECRET');
const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
const money=(n:number)=>Math.round(n*100);
const razorAuth=()=>`Basic ${btoa(`${razorKey}:${razorSecret}`)}`;
const normalizePhone=(value:any)=>{let digits=String(value||'').replace(/\D/g,'');if(digits.length===10)digits=`91${digits}`;return digits?`+${digits}`:''};

const validPhone=(value:string)=>/^\+\d{11,15}$/.test(value);
// Family mobile can live in several places depending on how it was entered (admission form, Edit Patient,
// Daily WhatsApp settings, or the legacy attendant phone). Check them all, most reliable first.
async function findPayerContact(patientId:string){
  const {data:access}=await admin.from('family_portal_access').select('mobile,relative_name,primary_contact,is_active,updated_at').eq('patient_id',patientId).or('is_active.is.null,is_active.eq.true').order('primary_contact',{ascending:false}).order('updated_at',{ascending:false}).limit(10);
  for(const row of access||[]){const mobile=normalizePhone(row.mobile);if(validPhone(mobile))return {mobile,name:String(row.relative_name||'').trim(),source:'family_portal'};}
  const {data:pref}=await admin.from('patient_family_communication_preferences').select('recipient_mobile,recipient_name').eq('patient_id',patientId).maybeSingle();
  const prefMobile=normalizePhone(pref?.recipient_mobile);if(validPhone(prefMobile))return {mobile:prefMobile,name:String(pref?.recipient_name||'').trim(),source:'family_communication'};
  const {data:patient}=await admin.from('patients').select('*').eq('id',patientId).maybeSingle();
  for(const [field,nameField] of [['attendant_phone','attendant_name'],['emergency_contact_phone','emergency_contact_name'],['family_mobile','family_name'],['mobile','full_name']]){
    const mobile=normalizePhone((patient as any)?.[field]);if(validPhone(mobile))return {mobile,name:String((patient as any)?.[nameField]||'').trim(),source:`patient_${field}`};
  }
  return null;
}

async function requireStaff(req:Request){
  const auth=req.headers.get('Authorization')||'';
  const jwt=auth.replace(/^Bearer\s+/i,'');if(!jwt)throw new Error('ERP sign-in required.');
  const {data,error}=await admin.auth.getUser(jwt);if(error||!data.user)throw new Error('ERP session is invalid.');
  const {data:profile}=await admin.from('profiles').select('id,role,is_active').eq('id',data.user.id).maybeSingle();
  if(!profile||profile.is_active===false||!['Admin','Manager','Accounts'].includes(profile.role))throw new Error('Accounts/Admin permission is required.');
  return profile;
}

async function fetchRazorpayLink(linkId:string){
  if(!razorKey||!razorSecret)throw new Error('Razorpay server credentials are not configured.');
  const response=await fetch(`https://api.razorpay.com/v1/payment_links/${encodeURIComponent(linkId)}`,{headers:{Authorization:razorAuth()}});
  const data=await response.json();
  if(!response.ok)throw new Error(data?.error?.description||'Razorpay payment link could not be verified.');
  return data;
}


async function fetchQrPayments(qrId:string){
  if(!razorKey||!razorSecret)throw new Error('Razorpay server credentials are not configured.');
  const response=await fetch(`https://api.razorpay.com/v1/payments/qr_codes/${encodeURIComponent(qrId)}/payments`,{headers:{Authorization:razorAuth()}});
  const data=await response.json();
  if(!response.ok)throw new Error(data?.error?.description||'Razorpay QR payment status could not be verified.');
  return data;
}

async function postPaidQrRequest(request:any,qrPayments:any){
  if(request.status==='Paid')return {paymentId:request.razorpay_payment_id,alreadyPosted:true};
  const captured=(qrPayments?.items||[]).filter((p:any)=>p.status==='captured'&&Number(p.amount||0)===money(Number(request.amount)));
  const payment=captured[captured.length-1];
  if(!payment?.id)return null;
  const paymentId=String(payment.id);
  const {data:claimed,error:claimErr}=await admin.from('staff_payment_requests').update({status:'Paid',razorpay_payment_id:paymentId,paid_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',request.id).eq('status','Pending').select('id').maybeSingle();
  if(claimErr)throw claimErr;
  if(!claimed){const {data:latest}=await admin.from('staff_payment_requests').select('status,razorpay_payment_id').eq('id',request.id).single();if(latest?.status==='Paid'&&latest?.razorpay_payment_id===paymentId)return {paymentId,alreadyPosted:true};throw new Error('This payment request has already been processed.');}
  const txType=request.payment_type==='advance'?'Advance':'Payment';
  const {error:txErr}=await admin.from('billing_transactions').insert({patient_id:request.patient_id,transaction_type:txType,category:request.payment_type==='advance'?'Online Advance':'Online Payment',amount:Number(request.amount),payment_mode:'Razorpay Online',payment_reference:paymentId,description:`${request.payment_type==='advance'?'Online advance':'Online outstanding payment'} · Staff direct UPI QR ${request.request_code} · Razorpay QR: ${request.razorpay_qr_id} · Razorpay Payment ID: ${paymentId}`,transaction_date:new Date().toISOString(),entered_by:request.created_by});
  if(txErr){await admin.from('staff_payment_requests').update({status:'Pending',razorpay_payment_id:null,paid_at:null,updated_at:new Date().toISOString()}).eq('id',request.id).eq('razorpay_payment_id',paymentId);throw new Error('QR payment was received but could not be posted to the Samara ledger. Contact Accounts. '+txErr.message);}
  await autoReceipt(request.id); // 2.18.66: automatic WhatsApp receipt (never blocks the payment)
  return {paymentId,alreadyPosted:false};
}

async function postPaidRequest(request:any,link:any){
  if(request.status==='Paid')return {paymentId:request.razorpay_payment_id,alreadyPosted:true};
  if(link.status!=='paid')throw new Error('Razorpay has not marked this payment link as paid.');
  const captured=(link.payments||[]).filter((p:any)=>p.status==='captured');
  const payment=captured[captured.length-1];
  if(!payment?.payment_id)throw new Error('No captured Razorpay payment was found for this link.');
  if(Number(link.amount_paid||0)!==money(Number(request.amount)))throw new Error('Paid amount does not match the Samara payment request.');
  const paymentId=String(payment.payment_id);
  const {data:claimed,error:claimErr}=await admin.from('staff_payment_requests')
    .update({status:'Paid',razorpay_payment_id:paymentId,paid_at:new Date().toISOString(),updated_at:new Date().toISOString()})
    .eq('id',request.id).eq('status','Pending').select('id').maybeSingle();
  if(claimErr)throw claimErr;
  if(!claimed){
    const {data:latest}=await admin.from('staff_payment_requests').select('status,razorpay_payment_id').eq('id',request.id).single();
    if(latest?.status==='Paid'&&latest?.razorpay_payment_id===paymentId)return {paymentId,alreadyPosted:true};
    throw new Error('This payment request has already been processed.');
  }
  const txType=request.payment_type==='advance'?'Advance':'Payment';
  const {error:txErr}=await admin.from('billing_transactions').insert({
    patient_id:request.patient_id,transaction_type:txType,
    category:request.payment_type==='advance'?'Online Advance':'Online Payment',amount:Number(request.amount),
    payment_mode:'Razorpay Online',payment_reference:paymentId,
    description:`${request.payment_type==='advance'?'Online advance':'Online outstanding payment'} · Staff payment request ${request.request_code} · Razorpay Payment Link: ${link.id} · Razorpay Payment ID: ${paymentId}`,
    transaction_date:new Date().toISOString(),entered_by:request.created_by
  });
  if(txErr){
    await admin.from('staff_payment_requests').update({status:'Pending',razorpay_payment_id:null,paid_at:null,updated_at:new Date().toISOString()}).eq('id',request.id).eq('razorpay_payment_id',paymentId);
    throw new Error('Payment was received but could not be posted to the Samara ledger. Contact Accounts. '+txErr.message);
  }
  await autoReceipt(request.id); // 2.18.66: automatic WhatsApp receipt (never blocks the payment)
  return {paymentId,alreadyPosted:false};
}

function resultPage(ok:boolean,message:string){
  const title=ok?'Payment received':'Payment verification pending';
  return new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:Arial,sans-serif;background:#fff7fb;color:#5d1740;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:520px;margin:20px;padding:30px;background:#fff;border-radius:20px;box-shadow:0 10px 35px #b0186720;text-align:center}h1{color:#b01867}p{font-size:18px;line-height:1.5}</style></head><body><main><h1>Samara Assisted Living</h1><h2>${title}</h2><p>${message}</p><p>You may close this page.</p></main></body></html>`,{status:ok?200:400,headers:{...cors,'Content-Type':'text/html; charset=utf-8'}});
}

// ── 2.18.66: AUTOMATIC WhatsApp receipt (with PDF) for every Guest Razorpay payment (advance / outstanding, link or UPI QR) ──
// Same templates and behaviour as Outside Nursing (2.18.64/65): approved samara_payment_receipt (Samara logo image header);
// samara_payment_receipt_pdf (DOCUMENT header) once Meta approves it. Sent ONCE per payment, logged in WhatsApp Inbox.
// Never blocks the payment itself. Payments made before this version are marked "Before auto receipt" (SQL 269).
const RECEIPT_TEMPLATE='samara_payment_receipt';
const RECEIPT_PDF_TEMPLATE='samara_payment_receipt_pdf';
const TEMPLATE_NOT_READY=[132000,132001,132005,132007,132012,132015,132016];
const istDate=(t:any)=>new Date(t||Date.now()).toLocaleDateString('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'2-digit',year:'numeric'}).replace(/\//g,'-');
const inr=(n:number)=>Number(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
function inWords(n:number){
  const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'],b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const two=(x:number)=>x<20?a[x]:b[Math.floor(x/10)]+(x%10?' '+a[x%10]:''),three=(x:number)=>(x>=100?a[Math.floor(x/100)]+' Hundred'+(x%100?' ':''):'')+(x%100?two(x%100):'');
  const w=(x:number):string=>{if(!x)return 'Zero';let o='';const cr=Math.floor(x/1e7),l=Math.floor(x/1e5)%100,t=Math.floor(x/1e3)%100,h=x%1000;if(cr)o+=w(cr)+' Crore ';if(l)o+=two(l)+' Lakh ';if(t)o+=two(t)+' Thousand ';if(h)o+=three(h);return o.trim();};
  const r=Math.floor(Math.round(n*100)/100),p=Math.round(n*100)%100;return 'Rupees '+w(r)+(p?' and '+two(p)+' Paise':'')+' Only';
}
async function guestReceiptPdf(d:any){
  const pdf=await PDFDocument.create(),page=pdf.addPage([595.28,841.89]),R=await pdf.embedFont(StandardFonts.Helvetica),B=await pdf.embedFont(StandardFonts.HelveticaBold);
  const W=595.28,M=48,mag=rgb(0.698,0.043,0.365),ink=rgb(0.2,0.11,0.16),grey=rgb(0.43,0.35,0.39),line=rgb(0.93,0.8,0.86),pink=rgb(1,0.965,0.98);
  const clean=(t:any)=>String(t??'').replace(/[–—]/g,'-').replace(/₹/g,'INR ').replace(/[^\x20-\xFF]/g,'');
  const T=(t:any,x:number,y:number,size=10,f=R,c=ink)=>page.drawText(clean(t),{x,y,size,font:f,color:c});
  const right=(t:any,y:number,size=10,f=R,c=ink)=>T(t,W-M-f.widthOfTextAtSize(clean(t),size),y,size,f,c);
  let y=800;
  try{const res=await fetch('https://app.samaraassistedliving.com/assets/samara-logo.png');if(!res.ok)throw 0;const img=await pdf.embedPng(new Uint8Array(await res.arrayBuffer()));const s=Math.min(110/img.width,58/img.height);page.drawImage(img,{x:M,y:y-50,width:img.width*s,height:img.height*s});}catch{T('Samara',M,y-30,22,B,mag);}
  right('SAMARA HEALTH CARE LLP',y-18,13,B,mag);right('Compassion - Comfort - Dignity',y-32,8.5,R,grey);
  y-=66;page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:1.6,color:mag});
  y-=34;T('PAYMENT RECEIPT',W/2-B.widthOfTextAtSize('PAYMENT RECEIPT',17)/2,y,17,B,ink);
  y-=26;T('Receipt No.: '+d.receiptNo,M,y,10,B);right('Date: '+d.date,y,10,B);
  y-=14;T('Samara Assisted Living - Guest account',M,y,9,R,grey);
  y-=24;page.drawRectangle({x:M,y:y-112,width:W-2*M,height:122,color:pink,borderColor:line,borderWidth:1});
  const rows=[['Received from',d.from],['Guest',d.guest],['Towards',d.towards],['Payment mode',d.mode],[d.idLabel||'Razorpay payment ID',d.paymentId]];
  rows.forEach(([k,v],i)=>{const yy=y-8-i*22;T(k,M+14,yy,9.5,R,grey);T(v,M+150,yy,10,B);});
  y-=140;page.drawRectangle({x:M,y:y-46,width:W-2*M,height:56,color:mag});
  T('Amount received',M+14,y-14,10,R,rgb(1,1,1));T('INR '+d.amount,M+14,y-36,20,B,rgb(1,1,1));
  y-=68;T(d.words,M,y,10,B);
  y-=30;T('Guest account after this payment',M,y,10,R,grey);T(d.balanceLine,M+190,y,10,B);
  y-=34;T('Thank you for your payment.',M,y,10,B,mag);
  y-=40;T('This is a computer-generated receipt and needs no signature.',M,y,8.5,R,grey);
  page.drawLine({start:{x:M,y:62},end:{x:W-M,y:62},thickness:.6,color:line});
  T('RBK VILLA, 23-A, Reddipalayam Road, Jeswant Nagar Phase 1, Mogappair West, Chennai 600037',M,48,7.6,R,grey);
  T('9976735577 / 7395961616  -  care@samaraassistedliving.com  -  Samara Assisted Living',M,36,7.6,B,mag);
  return await pdf.save();
}
async function waSend(token:string,sender:string,payload:any){
  const r=await fetch(`https://graph.facebook.com/v25.0/${sender}/messages`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const j:any=await r.json().catch(()=>({}));return {ok:r.ok&&!!j?.messages?.[0]?.id,id:j?.messages?.[0]?.id,code:Number(j?.error?.code||0),error:String(j?.error?.message||'')};
}
async function sendGuestReceipt(requestId:string){
  // claim once (a second run / device finds it already claimed)
  const {data:cur}=await admin.from('staff_payment_requests').select('receipt_tries').eq('id',requestId).maybeSingle();
  const claim=await admin.from('staff_payment_requests').update({receipt_status:'Sending',receipt_claimed_at:new Date().toISOString(),receipt_tries:(Number(cur?.receipt_tries)||0)+1})
    .eq('id',requestId).eq('status','Paid').lt('receipt_tries',3).or('receipt_status.is.null,receipt_status.eq.Failed').select('*').maybeSingle();
  if(claim.error||!claim.data)return null;
  const r:any=claim.data;let submitted=false;
  const done=async(patch:any)=>{await admin.from('staff_payment_requests').update(patch).eq('id',r.id);};
  try{
    const {data:patient,error:pErr}=await admin.from('patients').select('id,full_name,title,patient_id').eq('id',r.patient_id).single();if(pErr)throw pErr;
    const guest=[patient.title,patient.full_name].filter(Boolean).join(' ').trim()||'Guest';
    const contact=await findPayerContact(r.patient_id);
    if(!contact){await done({receipt_status:'Failed',receipt_tries:3,receipt_error:'No valid family WhatsApp number for this Guest.'});return null;}
    const to=contact.mobile.replace(/\D/g,'');
    const name=String(contact.name||'').trim().slice(0,80)||('Family of '+guest);
    const amount=Number(r.amount),paymentId=String(r.razorpay_payment_id||'');
    const towards=r.payment_type==='advance'?'Advance':'Outstanding payment';
    const reference=`${r.request_code} / ${paymentId}`;
    const values=[name,inr(amount),guest,istDate(r.paid_at),reference,'Razorpay (Online)'];
    const token=env('WHATSAPP_ACCESS_TOKEN'),sender=env('WHATSAPP_PHONE_NUMBER_ID');if(!token||!sender)throw new Error('Samara WhatsApp service is not configured.');
    // receipt PDF (never blocks the receipt message if it cannot be made)
    let mediaId:string|null=null,filename='',bytes:Uint8Array|null=null,storedPath:string|null=null,pdfNote='';
    try{
      const {data:tx}=await admin.from('billing_transactions').select('transaction_type,amount').eq('patient_id',r.patient_id);
      const bal=Math.round((tx||[]).reduce((v:number,x:any)=>v+(x.transaction_type==='Charge'?Number(x.amount||0):x.transaction_type==='Refund'?Number(x.amount||0):['Payment','Advance','Discount'].includes(x.transaction_type)?-Number(x.amount||0):0),0)*100)/100;
      const balanceLine=bal>0?'Balance due INR '+inr(bal):bal<0?'Advance held INR '+inr(-bal):'Account settled - no balance due';
      bytes=await guestReceiptPdf({receiptNo:r.request_code,date:istDate(r.paid_at),from:name,guest:`${guest}${patient.patient_id?' ('+patient.patient_id+')':''}`,towards,
        mode:r.razorpay_qr_id?'Razorpay UPI QR (Online) - verified':'Razorpay payment link (Online) - verified',paymentId,amount:inr(amount),words:inWords(amount),balanceLine});
      filename=`Samara-Receipt-${r.request_code}.pdf`;
      const form=new FormData();form.append('messaging_product','whatsapp');form.append('type','application/pdf');form.append('file',new Blob([bytes as any],{type:'application/pdf'}),filename);
      const up=await fetch(`https://graph.facebook.com/v25.0/${sender}/media`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form});const uj:any=await up.json().catch(()=>({}));
      if(up.ok&&uj.id)mediaId=uj.id;else pdfNote='Receipt PDF upload to WhatsApp failed.';
      try{const path=`outgoing/guest-payments/receipts/${r.id}/${filename}`;const st=await admin.storage.from('whatsapp-media').upload(path,bytes,{contentType:'application/pdf',upsert:true});if(!st.error)storedPath=path;}catch{}
    }catch(e){pdfNote='Receipt PDF could not be prepared: '+String((e as any)?.message||e).slice(0,120);}
    submitted=true;
    let sent:any=null,route='';
    const bodyCmp={type:'body',parameters:values.map(text=>({type:'text',text}))};
    if(mediaId){
      const t=await waSend(token,sender,{messaging_product:'whatsapp',recipient_type:'individual',to,type:'template',template:{name:RECEIPT_PDF_TEMPLATE,language:{code:'en'},components:[{type:'header',parameters:[{type:'document',document:{id:mediaId,filename}}]},bodyCmp]}});
      if(t.ok){sent=t;route='Receipt with PDF (template)';}
      else if(!TEMPLATE_NOT_READY.includes(t.code)){await done({receipt_status:'Failed',receipt_error:(t.error||'WhatsApp did not accept the receipt.').slice(0,300),receipt_phone:to});return null;}
    }
    if(!sent){
      const t=await waSend(token,sender,{messaging_product:'whatsapp',recipient_type:'individual',to,type:'template',template:{name:RECEIPT_TEMPLATE,language:{code:'en'},components:[{type:'header',parameters:[{type:'image',image:{link:env('WHATSAPP_HEADER_IMAGE_URL')||'https://samaraassistedliving.com/assets/samara-whatsapp-logo.png'}}]},bodyCmp]}});
      if(!t.ok){await done({receipt_status:'Failed',receipt_error:(t.error||'WhatsApp did not accept the receipt.').slice(0,300),receipt_phone:to});return null;}
      sent=t;route='Receipt message';
      if(mediaId){
        const d2=await waSend(token,sender,{messaging_product:'whatsapp',recipient_type:'individual',to,type:'document',document:{id:mediaId,filename,caption:`Samara payment receipt ${r.request_code}`}});
        if(d2.ok)route='Receipt message + PDF';else pdfNote='PDF not attached yet: the receipt-with-PDF template is awaiting WhatsApp approval and the family has not written to Samara in the last 24 hours.';
      }
    }
    await done({receipt_status:'Sent',receipt_sent_at:new Date().toISOString(),receipt_phone:to,receipt_message_id:sent.id,receipt_error:pdfNote||null});
    const now=new Date().toISOString();
    await admin.from('hr_whatsapp_communications').upsert({recipient_number:to,template_name:route==='Receipt with PDF (template)'?RECEIPT_PDF_TEMPLATE:RECEIPT_TEMPLATE,communication_type:'Payment Receipt · Online (automatic)',direction:'outbound',message_type:'template',status:'Accepted',provider_message_id:sent.id,
      message_content:`Dear ${values[0]},\n\nThank you. We confirm receipt of ₹${values[1]} towards the account of ${values[2]} on ${values[3]}.\n\nReceipt No.: ${values[4]}\nPayment Mode: ${values[5]}`,
      message_payload:{patient_id:r.patient_id,patient_name:guest,amount,category:r.payment_type==='advance'?'Online Advance':'Online Payment',reference,payment_mode:'Razorpay Online',request_id:r.id,body_params:values,automatic:true,route,pdf_note:pdfNote||null,...(storedPath?{_samara_media:{bucket:'whatsapp-media',path:storedPath,filename,mime_type:'application/pdf',size:bytes?.length||0,meta_media_id:mediaId}}:{})},
      contact_name:name,source_type:'Patient / Family · Accounts',sent_by:r.created_by,sent_at:now,created_at:now,updated_at:now},{onConflict:'provider_message_id',ignoreDuplicates:true});
    return sent.id;
  }catch(e){
    await done({receipt_status:submitted?'Unknown':'Failed',receipt_error:String((e as any)?.message||e).slice(0,300)});
    return null;
  }
}
// ── 2.18.67: HDFC swipe machine (Mosambee POS) payment — automatic WhatsApp receipt (+ PDF) to every active family contact ──
// The slip is saved with the ledger entry by record_pos_card_payment() (SQL 270). Sent ONCE per slip (claimed), logged in WhatsApp Inbox
// exactly like the Accounts payment receipts ("Payment Receipt · <category>"). Never blocks the payment itself.
async function sendPosReceipt(slipId:string){
  const {data:cur}=await admin.from('pos_card_slips').select('receipt_tries').eq('id',slipId).maybeSingle();
  const claim=await admin.from('pos_card_slips').update({receipt_status:'Sending',receipt_claimed_at:new Date().toISOString(),receipt_tries:(Number(cur?.receipt_tries)||0)+1})
    .eq('id',slipId).lt('receipt_tries',3).or('receipt_status.is.null,receipt_status.eq.Failed').select('*').maybeSingle();
  if(claim.error||!claim.data)return {sent:0,skipped:true};
  const s:any=claim.data;let accepted=0;const failures:string[]=[];let pdfNote='';const phones:string[]=[];
  const done=async(patch:any)=>{await admin.from('pos_card_slips').update(patch).eq('id',s.id);};
  try{
    const {data:tx,error:txErr}=await admin.from('billing_transactions').select('id,transaction_type,category,amount,transaction_date,entered_by').eq('id',s.billing_transaction_id).single();if(txErr)throw txErr;
    const {data:patient,error:pErr}=await admin.from('patients').select('id,full_name,title,patient_id').eq('id',s.patient_id).single();if(pErr)throw pErr;
    const guest=[patient.title,patient.full_name].filter(Boolean).join(' ').trim()||'Guest';
    // same recipients as the Accounts receipt: every active family contact (primary first); else the best number on file
    const {data:fam}=await admin.from('family_portal_access').select('mobile,relative_name,primary_contact,created_at').eq('patient_id',s.patient_id).eq('is_active',true).order('primary_contact',{ascending:false}).order('created_at',{ascending:true});
    let targets=(fam||[]).map((r:any)=>({mobile:normalizePhone(r.mobile),name:String(r.relative_name||'').trim()||'Family Member'})).filter((r:any)=>validPhone(r.mobile));
    if(!targets.length){const c=await findPayerContact(s.patient_id);if(c)targets=[{mobile:c.mobile,name:c.name||('Family of '+guest)}];}
    targets=targets.filter((t:any,i:number,a:any[])=>a.findIndex(x=>x.mobile===t.mobile)===i);
    if(!targets.length){await done({receipt_status:'Failed',receipt_tries:3,receipt_error:'No valid family WhatsApp number for this Guest.'});return {sent:0,error:'No valid family WhatsApp number for this Guest.'};}
    const amount=Number(s.amount);
    const mode=s.paid_by==='UPI on machine'?'UPI (HDFC swipe machine)':'Card (HDFC swipe machine)';
    const reference=`${s.voucher_no} / Appr. ${s.approval_code}`;
    const token=env('WHATSAPP_ACCESS_TOKEN'),sender=env('WHATSAPP_PHONE_NUMBER_ID');if(!token||!sender)throw new Error('Samara WhatsApp service is not configured.');
    const category=String(tx.category||tx.transaction_type||'Payment');
    // one PDF for the slip
    let mediaId:string|null=null,filename='',bytes:Uint8Array|null=null,storedPath:string|null=null;
    try{
      const {data:all}=await admin.from('billing_transactions').select('transaction_type,amount').eq('patient_id',s.patient_id);
      const bal=Math.round((all||[]).reduce((v:number,x:any)=>v+(x.transaction_type==='Charge'?Number(x.amount||0):x.transaction_type==='Refund'?Number(x.amount||0):['Payment','Advance','Discount'].includes(x.transaction_type)?-Number(x.amount||0):0),0)*100)/100;
      const balanceLine=bal>0?'Balance due INR '+inr(bal):bal<0?'Advance held INR '+inr(-bal):'Account settled - no balance due';
      bytes=await guestReceiptPdf({receiptNo:s.voucher_no,date:istDate(tx.transaction_date||s.created_at),from:targets[0].name,guest:`${guest}${patient.patient_id?' ('+patient.patient_id+')':''}`,
        towards:tx.transaction_type==='Advance'?'Advance':category,mode:mode+' - slip verified by Accounts',idLabel:s.paid_by==='UPI on machine'?'RRN (on the slip)':'Approval code',
        paymentId:s.approval_code+(s.card_last4?'   (card ending '+s.card_last4+')':''),amount:inr(amount),words:inWords(amount),balanceLine});
      filename=`Samara-Receipt-${s.voucher_no}.pdf`;
      const form=new FormData();form.append('messaging_product','whatsapp');form.append('type','application/pdf');form.append('file',new Blob([bytes as any],{type:'application/pdf'}),filename);
      const up=await fetch(`https://graph.facebook.com/v25.0/${sender}/media`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:form});const uj:any=await up.json().catch(()=>({}));
      if(up.ok&&uj.id)mediaId=uj.id;else pdfNote='Receipt PDF upload to WhatsApp failed.';
      try{const path=`outgoing/pos-payments/receipts/${s.id}/${filename}`;const st=await admin.storage.from('whatsapp-media').upload(path,bytes,{contentType:'application/pdf',upsert:true});if(!st.error)storedPath=path;}catch{}
    }catch(e){pdfNote='Receipt PDF could not be prepared: '+String((e as any)?.message||e).slice(0,120);}
    for(const t of targets){
      const to=t.mobile.replace(/\D/g,'');
      const values=[t.name.slice(0,80),inr(amount),guest,istDate(tx.transaction_date||s.created_at),reference,mode];
      const bodyCmp={type:'body',parameters:values.map(text=>({type:'text',text}))};
      let sent:any=null,route='';
      if(mediaId){
        const r=await waSend(token,sender,{messaging_product:'whatsapp',recipient_type:'individual',to,type:'template',template:{name:RECEIPT_PDF_TEMPLATE,language:{code:'en'},components:[{type:'header',parameters:[{type:'document',document:{id:mediaId,filename}}]},bodyCmp]}});
        if(r.ok){sent=r;route='Receipt with PDF (template)';}else if(!TEMPLATE_NOT_READY.includes(r.code)){failures.push(`${t.name}: ${r.error||'WhatsApp did not accept the receipt.'}`);continue;}
      }
      if(!sent){
        const r=await waSend(token,sender,{messaging_product:'whatsapp',recipient_type:'individual',to,type:'template',template:{name:RECEIPT_TEMPLATE,language:{code:'en'},components:[{type:'header',parameters:[{type:'image',image:{link:env('WHATSAPP_HEADER_IMAGE_URL')||'https://samaraassistedliving.com/assets/samara-whatsapp-logo.png'}}]},bodyCmp]}});
        if(!r.ok){failures.push(`${t.name}: ${r.error||'WhatsApp did not accept the receipt.'}`);continue;}
        sent=r;route='Receipt message';
        if(mediaId){const d2=await waSend(token,sender,{messaging_product:'whatsapp',recipient_type:'individual',to,type:'document',document:{id:mediaId,filename,caption:`Samara payment receipt ${s.voucher_no}`}});
          if(d2.ok)route='Receipt message + PDF';else pdfNote='PDF not attached yet: the receipt-with-PDF template is awaiting WhatsApp approval and the family has not written to Samara in the last 24 hours.';}
      }
      accepted++;phones.push(to);
      const now=new Date().toISOString();
      await admin.from('hr_whatsapp_communications').upsert({recipient_number:to,template_name:route==='Receipt with PDF (template)'?RECEIPT_PDF_TEMPLATE:RECEIPT_TEMPLATE,communication_type:`Payment Receipt · ${category}`,direction:'outbound',message_type:'template',status:'Accepted',provider_message_id:sent.id,
        message_content:`Dear ${values[0]},\n\nThank you. We confirm receipt of ₹${values[1]} towards the account of ${values[2]} on ${values[3]}.\n\nReceipt No.: ${values[4]}\nPayment Mode: ${values[5]}`,
        message_payload:{patient_id:s.patient_id,patient_name:guest,category,amount,payment_mode:'Card Payment',pos_slip_id:s.id,reference,body_params:values,automatic:true,route,pdf_note:pdfNote||null,...(storedPath?{_samara_media:{bucket:'whatsapp-media',path:storedPath,filename,mime_type:'application/pdf',size:bytes?.length||0,meta_media_id:mediaId}}:{})},
        contact_name:values[0],source_type:'Patient / Family · Accounts',sent_by:s.entered_by||tx.entered_by,sent_by_name:'Accounts · Automated',sent_at:now,created_at:now,updated_at:now},{onConflict:'provider_message_id',ignoreDuplicates:true});
    }
    if(!accepted){await done({receipt_status:'Failed',receipt_error:(failures.join(' | ')||'WhatsApp did not accept the receipt.').slice(0,300)});return {sent:0,error:failures.join(' | ')};}
    const note=[pdfNote,failures.length?`${failures.length} contact(s) failed: ${failures.join(' | ')}`:''].filter(Boolean).join(' ');
    await done({receipt_status:'Sent',receipt_sent_at:new Date().toISOString(),receipt_phone:phones.join(', '),receipt_error:note.slice(0,300)||null});
    return {sent:accepted,failures,pdf_note:pdfNote||null};
  }catch(e){
    const msg=String((e as any)?.message||e).slice(0,300);
    await done({receipt_status:accepted?'Sent':'Unknown',receipt_error:msg});
    return {sent:accepted,error:msg};
  }
}
async function autoReceipt(requestId:string){try{await sendGuestReceipt(requestId);}catch(e){console.error('auto receipt',e);}}
// Every 2 minutes (SQL 269): record Guest payments of pending links / QRs (even if nobody has the ERP open) + send any receipt not yet sent.
async function cronSweep(){
  const since=new Date(Date.now()-4*24*60*60*1000).toISOString();
  const {data:rows}=await admin.from('staff_payment_requests').select('*').eq('status','Pending').gte('created_at',since).order('created_at',{ascending:true}).limit(40);
  let checked=0,posted=0,failures=0,sent=0;
  for(const request of rows||[]){
    try{
      checked++;
      if(request.razorpay_qr_id){const qrPosted=await postPaidQrRequest(request,await fetchQrPayments(request.razorpay_qr_id));if(qrPosted){posted++;if(request.razorpay_payment_link_id){await fetch(`https://api.razorpay.com/v1/payment_links/${encodeURIComponent(request.razorpay_payment_link_id)}/cancel`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:razorAuth()}}).catch(()=>null)}continue;}}
      if(request.razorpay_payment_link_id){const link=await fetchRazorpayLink(request.razorpay_payment_link_id);if(link.status==='paid'){await postPaidRequest(request,link);posted++;if(request.razorpay_qr_id){await fetch(`https://api.razorpay.com/v1/payments/qr_codes/${encodeURIComponent(request.razorpay_qr_id)}/close`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:razorAuth()}}).catch(()=>null)}}}
    }catch{failures++;}
  }
  const recent=new Date(Date.now()-14*24*60*60*1000).toISOString();
  const {data:unsent}=await admin.from('staff_payment_requests').select('id,receipt_status,receipt_claimed_at').eq('status','Paid').gte('paid_at',recent).lt('receipt_tries',3).or('receipt_status.is.null,receipt_status.eq.Failed').limit(20);
  for(const u of unsent||[]){
    if(u.receipt_status==='Failed'&&u.receipt_claimed_at&&Date.now()-new Date(u.receipt_claimed_at).getTime()<10*60*1000)continue; // retry failed sends after 10 minutes
    if(await sendGuestReceipt(u.id))sent++;
  }
  // 2.18.67: swipe machine receipts not sent yet (e.g. the Accounts screen was closed) — retried after 10 minutes, 3 tries
  const twoDays=new Date(Date.now()-2*24*60*60*1000).toISOString();
  const {data:slips}=await admin.from('pos_card_slips').select('id,receipt_status,receipt_claimed_at,created_at').gte('created_at',twoDays).lt('receipt_tries',3).or('receipt_status.is.null,receipt_status.eq.Failed').limit(20);
  let posSent=0;
  for(const u of slips||[]){
    if(!u.receipt_status&&Date.now()-new Date(u.created_at).getTime()<60*1000)continue; // the Accounts screen sends it first
    if(u.receipt_status==='Failed'&&u.receipt_claimed_at&&Date.now()-new Date(u.receipt_claimed_at).getTime()<10*60*1000)continue;
    if((await sendPosReceipt(u.id)).sent)posSent++;
  }
  return {checked,posted,failures,receipts_sent:sent,pos_receipts_sent:posSent};
}

Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  try{
    if(req.method==='GET'){
      const url=new URL(req.url);
      const linkId=String(url.searchParams.get('razorpay_payment_link_id')||'');
      const reference=String(url.searchParams.get('razorpay_payment_link_reference_id')||'');
      if(!linkId&&!reference)return resultPage(false,'The Razorpay payment reference is missing.');
      let query=admin.from('staff_payment_requests').select('*');
      query=linkId?query.eq('razorpay_payment_link_id',linkId):query.eq('request_code',reference);
      const {data:request,error}=await query.maybeSingle();
      if(error||!request)return resultPage(false,'This payment request could not be matched with Samara billing.');
      const link=await fetchRazorpayLink(linkId||request.razorpay_payment_link_id);
      await postPaidRequest(request,link);
      const successUrl=new URL('https://app.samaraassistedliving.com/payment-success.html');
      successUrl.searchParams.set('amount',String(request.amount));
      successUrl.searchParams.set('request',String(request.request_code||''));
      return Response.redirect(successUrl.toString(),303);
    }
    if(req.method!=='POST')return json({success:false,error:'Method not allowed'},405);
    // 2.18.66: background check every 2 minutes (SQL 269) — secret header only
    if(env('CRON_SECRET')&&req.headers.get('x-cron-secret')===env('CRON_SECRET'))return json({success:true,...await cronSweep()});
    const body=await req.json();const action=String(body.action||'');
    if(action==='family_contacts'){
      await requireStaff(req);
      const patientId=String(body.patient_id||'');if(!patientId)return json({success:false,error:'Patient ID is required.'},400);
      const {data:contacts,error}=await admin.from('family_portal_access').select('mobile,relative_name,relationship,primary_contact,is_active').eq('patient_id',patientId).eq('is_active',true).order('primary_contact',{ascending:false}).order('updated_at',{ascending:false});
      if(error)throw error;
      const clean=(contacts||[]).map((row:any)=>({mobile:normalizePhone(row.mobile),relative_name:row.relative_name||'Family Member',relationship:row.relationship||'',primary_contact:!!row.primary_contact})).filter((row:any)=>row.mobile);
      return json({success:true,contacts:clean});
    }

    if(action==='pos_receipt'){
      // 2.18.67: called by the Accounts screen right after a swipe machine payment is saved
      await requireStaff(req);
      const slipId=String(body.slip_id||'');if(!slipId)return json({success:false,error:'Slip ID is required.'},400);
      const result:any=await sendPosReceipt(slipId);
      if(result.skipped){const {data:slip}=await admin.from('pos_card_slips').select('receipt_status,receipt_phone,receipt_error').eq('id',slipId).maybeSingle();return json({success:slip?.receipt_status==='Sent',already:true,...(slip||{})});}
      return json({success:result.sent>0,...result});
    }

    if(action==='send_whatsapp'){
      await requireStaff(req);
      const id=String(body.request_id||'');if(!id)return json({success:false,error:'Payment request ID is required.'},400);
      const {data:request,error:reqErr}=await admin.from('staff_payment_requests').select('id,patient_id,status,amount,payment_type,razorpay_payment_link_url').eq('id',id).single();if(reqErr)throw reqErr;
      if(request.status!=='Pending')return json({success:false,error:`This payment request is ${request.status} and cannot be sent.`},409);
      const {data:contacts,error:contactErr}=await admin.from('family_portal_access').select('mobile,relative_name,primary_contact,is_active').eq('patient_id',request.patient_id).eq('is_active',true).order('primary_contact',{ascending:false}).order('updated_at',{ascending:false});if(contactErr)throw contactErr;
      const targets=(contacts||[]).map((row:any)=>({mobile:normalizePhone(row.mobile),name:row.relative_name||'Family Member'})).filter((row:any)=>row.mobile);
      if(!targets.length)return json({success:false,error:'No active registered family mobile number is available for this patient.'},400);
      const accessToken=env('WHATSAPP_ACCESS_TOKEN'),phoneNumberId=env('WHATSAPP_PHONE_NUMBER_ID');
      if(!accessToken||!phoneNumberId)throw new Error('Samara WhatsApp API configuration is missing.');
      const message=String(body.text||'').trim();if(!message)return json({success:false,error:'Payment message is empty.'},400);
      const failures:string[]=[];let sent=0;
      for(const target of targets){
        const meta=await fetch(`https://graph.facebook.com/v25.0/${phoneNumberId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:target.mobile.replace(/\D/g,''),type:'text',text:{preview_url:true,body:message}})});
        const result=await meta.json().catch(()=>({}));
        if(meta.ok&&result?.messages?.[0]?.id)sent++;else failures.push(`${target.name}: ${result?.error?.message||`WhatsApp API error ${meta.status}`}`);
      }
      if(!sent)return json({success:false,error:failures.join(' | ')||'WhatsApp did not accept the payment message.'},400);
      return json({success:true,sent,failures});
    }

    if(action==='create'){
      const profile=await requireStaff(req);const patientId=String(body.patient_id||'');const type=String(body.payment_type||'');
      if(!patientId||!['advance','outstanding'].includes(type))return json({success:false,error:'Patient and payment type are required.'},400);
      let amount=Number(body.amount||0);
      if(type==='outstanding'){
        const {data:tx,error}=await admin.from('billing_transactions').select('transaction_type,amount').eq('patient_id',patientId);if(error)throw error;
        const balance=(tx||[]).reduce((v:any,r:any)=>v+(r.transaction_type==='Charge'?Number(r.amount||0):r.transaction_type==='Refund'?Number(r.amount||0):['Payment','Advance','Discount'].includes(r.transaction_type)?-Number(r.amount||0):0),0);
        amount=Math.max(0,Math.round(balance*100)/100);
      }
      if(!Number.isFinite(amount)||amount<1||amount>500000)return json({success:false,error:type==='outstanding'?'There is no payable outstanding amount.':'Amount must be between ₹1 and ₹5,00,000.'},400);
      if(!razorKey||!razorSecret)throw new Error('Razorpay server credentials are not configured.');
      const {data:patient,error:pErr}=await admin.from('patients').select('id,full_name,title,patient_id').eq('id',patientId).single();if(pErr)throw pErr;
      // Always prefill a mobile number and lock it, so Razorpay's checkout never shows the "Contact details" screen.
      // Typing a number by hand there (especially one already used for another patient's link) can freeze the Razorpay page.
      const familyContact=await findPayerContact(patientId);
      const officeContact=normalizePhone(env('SAMARA_PAYMENT_CONTACT'));
      const contact=familyContact?.mobile||(validPhone(officeContact)?officeContact:'');
      const contactSource=familyContact?familyContact.source:contact?'office':'none';
      const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
      const {data:request,error}=await admin.from('staff_payment_requests').insert({public_token:token,patient_id:patientId,payment_type:type,amount,created_by:profile.id}).select('id,request_code,amount,payment_type,expires_at').single();if(error)throw error;
      const callback=`${supabaseUrl}/functions/v1/staff-payment-request`;
      const payload:any={amount:money(amount),currency:'INR',accept_partial:false,reference_id:request.request_code,description:`Samara Assisted Living - ${type==='advance'?'Advance':'Outstanding'} - ${patient.patient_id||patient.full_name}`,expire_by:Math.floor(new Date(request.expires_at).getTime()/1000),notify:{sms:false,email:false},reminder_enable:false,callback_url:callback,callback_method:'get',notes:{samara_request_id:request.id,patient_id:patientId,payment_type:type,patient_code:patient.patient_id||''}};
      if(contact){
        const payerName=familyContact?.name?familyContact.name:`Samara - ${[patient.title,patient.full_name].filter(Boolean).join(' ')}`;
        payload.customer={name:payerName.slice(0,50),contact};
        payload.options={checkout:{readonly:{contact:'1'}}};
      }
      const r=await fetch('https://api.razorpay.com/v1/payment_links',{method:'POST',headers:{'Content-Type':'application/json',Authorization:razorAuth()},body:JSON.stringify(payload)});
      const link=await r.json();
      if(!r.ok){await admin.from('staff_payment_requests').delete().eq('id',request.id);throw new Error(link?.error?.description||'Razorpay Payment Link could not be created.');}
      const {error:updateError}=await admin.from('staff_payment_requests').update({razorpay_payment_link_id:link.id,razorpay_payment_link_url:link.short_url,updated_at:new Date().toISOString()}).eq('id',request.id);if(updateError)throw updateError;
      return json({success:true,...request,patient_id:patientId,patient_name:[patient.title,patient.full_name].filter(Boolean).join(' '),patient_code:patient.patient_id,payment_url:link.short_url,razorpay_payment_link_id:link.id,contact_prefilled:!!contact,contact_source:contactSource,contact_masked:contact?contact.replace(/^(\+\d{2})\d+(\d{4})$/,'$1 ••••••$2'):''});
    }

    if(action==='create_qr'){
      await requireStaff(req);
      const id=String(body.request_id||'');if(!id)return json({success:false,error:'Payment request ID is required.'},400);
      const {data:request,error}=await admin.from('staff_payment_requests').select('*').eq('id',id).single();if(error)throw error;
      if(request.status!=='Pending')return json({success:false,error:`This payment request is ${request.status} and cannot create a QR.`},409);
      if(request.razorpay_qr_id&&request.razorpay_qr_image_url)return json({success:true,qr_id:request.razorpay_qr_id,qr_image_url:request.razorpay_qr_image_url});
      const payload:any={type:'upi_qr',name:`Samara ${request.request_code}`.slice(0,64),usage:'single_use',fixed_amount:true,payment_amount:money(Number(request.amount)),description:`Samara Assisted Living - ${request.payment_type==='advance'?'Advance':'Outstanding'} - ${request.request_code}`,close_by:Math.floor(new Date(request.expires_at).getTime()/1000),notes:{samara_request_id:request.id,request_code:request.request_code,patient_id:request.patient_id,payment_type:request.payment_type}};
      const r=await fetch('https://api.razorpay.com/v1/payments/qr_codes',{method:'POST',headers:{'Content-Type':'application/json',Authorization:razorAuth()},body:JSON.stringify(payload)});
      const raw=await r.text();
      let qr:any={};try{qr=raw?JSON.parse(raw):{}}catch{qr={raw}}
      if(!r.ok){
        const detail=qr?.error?.description||qr?.error?.reason||qr?.message||raw||`HTTP ${r.status}`;
        if(r.status===404||/requested URL was not found/i.test(String(detail)))throw new Error('Razorpay Direct UPI QR API is not available for this merchant/account. The Payment Link remains active. Please enable Razorpay QR Codes for this account, then retry Show QR Code. Razorpay response: '+detail);
        throw new Error(`Razorpay QR creation failed (HTTP ${r.status}). ${detail}`);
      }
      const {error:updateError}=await admin.from('staff_payment_requests').update({razorpay_qr_id:qr.id,razorpay_qr_image_url:qr.image_url,updated_at:new Date().toISOString()}).eq('id',request.id);if(updateError)throw updateError;
      return json({success:true,qr_id:qr.id,qr_image_url:qr.image_url,close_by:qr.close_by});
    }

    if(action==='cancel'){
      await requireStaff(req);
      const id=String(body.request_id||'');if(!id)return json({success:false,error:'Payment request ID is required.'},400);
      const {data:request,error}=await admin.from('staff_payment_requests').select('*').eq('id',id).single();if(error)throw error;
      if(request.status==='Paid')return json({success:false,error:'This payment request has already been paid and cannot be cancelled.'},409);
      if(request.status==='Cancelled')return json({success:true,status:'Cancelled'});
      if(request.status==='Expired')return json({success:false,error:'This payment request has already expired.'},409);
      if(!request.razorpay_payment_link_id)throw new Error('Razorpay Payment Link is missing.');
      const r=await fetch(`https://api.razorpay.com/v1/payment_links/${encodeURIComponent(request.razorpay_payment_link_id)}/cancel`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:razorAuth()}});
      const link=await r.json();
      if(!r.ok&&String(link?.status||'').toLowerCase()!=='cancelled')throw new Error(link?.error?.description||'Razorpay Payment Link could not be cancelled.');
      if(request.razorpay_qr_id){const qrClose=await fetch(`https://api.razorpay.com/v1/payments/qr_codes/${encodeURIComponent(request.razorpay_qr_id)}/close`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:razorAuth()}});if(!qrClose.ok){const q=await qrClose.json().catch(()=>({}));console.warn('QR close warning',q?.error?.description||q)}}
      const {error:updateError}=await admin.from('staff_payment_requests').update({status:'Cancelled',updated_at:new Date().toISOString()}).eq('id',request.id).eq('status','Pending');if(updateError)throw updateError;
      return json({success:true,status:'Cancelled',request_id:request.id});
    }
    if(action==='reconcile_pending'){
      // Sweep recent Pending requests so a payment is never lost when the QR window was closed early
      // or Razorpay confirmed late. Safe to call repeatedly: posting is guarded by the Pending->Paid claim.
      await requireStaff(req);
      const since=new Date(Date.now()-4*24*60*60*1000).toISOString();
      const {data:rows,error}=await admin.from('staff_payment_requests').select('*').eq('status','Pending').gte('created_at',since).order('created_at',{ascending:true}).limit(40);if(error)throw error;
      const posted:any[]=[];const failed:any[]=[];
      for(const request of rows||[]){
        try{
          if(request.razorpay_qr_id){const qrPosted=await postPaidQrRequest(request,await fetchQrPayments(request.razorpay_qr_id));if(qrPosted){posted.push({request_code:request.request_code,amount:Number(request.amount),payment_id:qrPosted.paymentId});if(request.razorpay_payment_link_id){await fetch(`https://api.razorpay.com/v1/payment_links/${encodeURIComponent(request.razorpay_payment_link_id)}/cancel`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:razorAuth()}}).catch(()=>null)}continue;}}
          if(request.razorpay_payment_link_id){const link=await fetchRazorpayLink(request.razorpay_payment_link_id);if(link.status==='paid'){const p=await postPaidRequest(request,link);posted.push({request_code:request.request_code,amount:Number(request.amount),payment_id:p.paymentId});if(request.razorpay_qr_id){await fetch(`https://api.razorpay.com/v1/payments/qr_codes/${encodeURIComponent(request.razorpay_qr_id)}/close`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:razorAuth()}}).catch(()=>null)}}}
        }catch(e){failed.push({request_code:request.request_code,error:e instanceof Error?e.message:String(e)})}
      }
      return json({success:true,checked:(rows||[]).length,posted,failed});
    }
    if(action==='reconcile'){
      await requireStaff(req);
      const id=String(body.request_id||'');if(!id)return json({success:false,error:'Payment request ID is required.'},400);
      const {data:request,error}=await admin.from('staff_payment_requests').select('*').eq('id',id).single();if(error)throw error;
      if(request.status==='Paid')return json({success:true,status:'Paid',payment_id:request.razorpay_payment_id});
      if(request.razorpay_qr_id){const qrPayments=await fetchQrPayments(request.razorpay_qr_id);const qrPosted=await postPaidQrRequest(request,qrPayments);if(qrPosted){if(request.razorpay_payment_link_id){await fetch(`https://api.razorpay.com/v1/payment_links/${encodeURIComponent(request.razorpay_payment_link_id)}/cancel`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:razorAuth()}}).catch(()=>null)}return json({success:true,status:'Paid',payment_id:qrPosted.paymentId,source:'qr'});}}
      if(!request.razorpay_payment_link_id)throw new Error('Razorpay Payment Link is missing.');
      const link=await fetchRazorpayLink(request.razorpay_payment_link_id);
      if(link.status!=='paid')return json({success:true,status:link.status||'created'});
      const posted=await postPaidRequest(request,link);
      if(request.razorpay_qr_id){await fetch(`https://api.razorpay.com/v1/payments/qr_codes/${encodeURIComponent(request.razorpay_qr_id)}/close`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:razorAuth()}}).catch(()=>null)}
      return json({success:true,status:'Paid',payment_id:posted.paymentId,source:'link'});
    }
    return json({success:false,error:'Unsupported action.'},400);
  }catch(error){console.error(error);if(req.method==='GET')return resultPage(false,error instanceof Error?error.message:String(error));return json({success:false,error:error instanceof Error?error.message:String(error)},400)}
});
