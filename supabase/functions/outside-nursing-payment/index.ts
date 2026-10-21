import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';
const env=n=>Deno.env.get(n)||'';
const url=env('SUPABASE_URL'),secret=env('SUPABASE_SERVICE_ROLE_KEY');
const admin=createClient(url,secret,{auth:{persistSession:false}});
const cors={'Access-Control-Allow-Origin':'https://app.samaraassistedliving.com','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,GET,OPTIONS'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
const paise=n=>Math.round(Number(n)*100);
async function rpc(action,data){const r=await admin.rpc('outside_nursing_online',{p_action:action,p_data:data});if(r.error)throw Error(r.error.message);return r.data.request;}
async function staff(req){
 const jwt=(req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
 const {data,error}=await admin.auth.getUser(jwt);if(error||!data.user)throw Error('Sign in to Samara ERP.');
 const r=await admin.from('profiles').select('id,role,is_active').eq('id',data.user.id).single();
 if(r.error||r.data.is_active===false||!['Admin','Accounts'].includes(r.data.role))throw Error('Admin or Accounts permission required.');return r.data;
}
async function gateway(path,body){
 const key=env('RAZORPAY_KEY_ID')||env('RAZORPAY_KEY'),password=env('RAZORPAY_KEY_SECRET')||env('RAZORPAY_KEY_SECRET_KEY')||env('RAZORPAY_SECRET');
 if(!key||!password)throw Error('Razorpay server credentials are not configured.');
 const r=await fetch('https://api.razorpay.com/v1/'+path,{method:body?'POST':'GET',headers:{Authorization:'Basic '+btoa(key+':'+password),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const data=await r.json();if(!r.ok){const e=Error(data?.error?.description||'Razorpay request failed.');e.definite=true;throw e;}return data;
}
async function request(id){const r=await admin.from('outside_nursing_online_requests').select('*').eq('id',id).single();if(r.error)throw Error('Payment request not found.');return r.data;}
function checkLink(r,link){
 if(link.id!==r.link_id||link.reference_id!==r.request_code||link.currency!=='INR'||Number(link.amount)!==paise(r.amount))throw Error('Razorpay link does not match this invoice request.');
}
async function reconcile(r){
 if(!r.link_id)return r;
 const link=await gateway('payment_links/'+encodeURIComponent(r.link_id));checkLink(r,link);
 const receipts=[];
 for(const line of link.payments||[]){
  if(!line.payment_id)continue;
  const payment=await gateway('payments/'+encodeURIComponent(line.payment_id));
  if(payment.id!==line.payment_id||payment.currency!=='INR'||Number(payment.amount)!==Number(line.amount))throw Error('Gateway payment details do not match this link.');
  if(payment.status==='captured'&&payment.captured===true)receipts.push({payment_id:payment.id,amount_paise:payment.amount,created_at:payment.created_at});
 }
 if(link.status==='paid'&&receipts.reduce((n,p)=>n+p.amount_paise,0)!==paise(r.amount))throw Error('Captured payments do not yet match the request. Please check again.');
 const settled=await rpc('settle',{request_id:r.id,payments:receipts,gateway_status:link.status});
 // 2.18.64: the moment a request is Paid, the family gets the WhatsApp receipt (once). Never blocks the payment itself.
 if(settled?.status==='Paid'){try{await sendReceipt(settled);}catch(e){console.error('auto receipt',e);}}
 return settled;
}
// ── 2.18.64: AUTOMATIC WhatsApp receipt (approved template samara_payment_receipt, same as resident receipts) ──
// 2.18.65: the template has the Samara logo IMAGE header — it must be sent (Meta error 132012 without it).
const RECEIPT_TEMPLATE='samara_payment_receipt';
const dmy=d=>{const x=String(d||'').slice(0,10).split('-');return x.length===3?x[2]+'-'+x[1]+'-'+x[0]:String(d||'');};
// 2.18.65: receipt PDF (same content as the ERP receipt) attached to the WhatsApp receipt.
// Template samara_payment_receipt_pdf (DOCUMENT header, same 6 body values). Until Meta approves it, the approved
// text receipt (logo header) is sent and the PDF goes as a direct document (works inside WhatsApp's 24-hour window).
const RECEIPT_PDF_TEMPLATE='samara_payment_receipt_pdf';
const TEMPLATE_NOT_READY=[132000,132001,132005,132007,132012,132015,132016];
function inWords(n){
 const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'],b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
 const two=x=>x<20?a[x]:b[Math.floor(x/10)]+(x%10?' '+a[x%10]:''),three=x=>(x>=100?a[Math.floor(x/100)]+' Hundred'+(x%100?' ':''):'')+(x%100?two(x%100):'');
 const w=x=>{if(!x)return 'Zero';let o='';const cr=Math.floor(x/1e7),l=Math.floor(x/1e5)%100,t=Math.floor(x/1e3)%100,h=x%1000;if(cr)o+=w(cr)+' Crore ';if(l)o+=two(l)+' Lakh ';if(t)o+=two(t)+' Thousand ';if(h)o+=three(h);return o.trim();};
 const r=Math.floor(Math.round(n*100)/100),p=Math.round(n*100)%100;return 'Rupees '+w(r)+(p?' and '+two(p)+' Paise':'')+' Only';
}
async function receiptPdf(d){
 const pdf=await PDFDocument.create(),page=pdf.addPage([595.28,841.89]),R=await pdf.embedFont(StandardFonts.Helvetica),B=await pdf.embedFont(StandardFonts.HelveticaBold);
 const W=595.28,M=48,mag=rgb(0.698,0.043,0.365),ink=rgb(0.2,0.11,0.16),grey=rgb(0.43,0.35,0.39),line=rgb(0.93,0.8,0.86),pink=rgb(1,0.965,0.98);
 const clean=t=>String(t??'').replace(/[–—]/g,'-').replace(/₹/g,'INR ').replace(/[^\x20-\xFF]/g,'');
 const T=(t,x,y,size=10,f=R,c=ink)=>page.drawText(clean(t),{x,y,size,font:f,color:c});
 const right=(t,y,size=10,f=R,c=ink)=>T(t,W-M-f.widthOfTextAtSize(clean(t),size),y,size,f,c);
 let y=800;
 try{const res=await fetch('https://app.samaraassistedliving.com/assets/samara-logo.png');if(res.ok){const img=await pdf.embedPng(new Uint8Array(await res.arrayBuffer()));const s=Math.min(110/img.width,58/img.height);page.drawImage(img,{x:M,y:y-50,width:img.width*s,height:img.height*s});}else throw 0;}catch{T('Samara',M,y-30,22,B,mag);}
 right('SAMARA HEALTH CARE LLP',y-18,13,B,mag);right('Compassion - Comfort - Dignity',y-32,8.5,R,grey);
 y-=66;page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:1.6,color:mag});
 y-=34;T('PAYMENT RECEIPT',W/2-B.widthOfTextAtSize('PAYMENT RECEIPT',17)/2,y,17,B,ink);
 y-=26;T('Receipt No.: '+d.receiptNo,M,y,10,B);right('Date: '+d.date,y,10,B);
 y-=14;T('Outside Samara Nursing Services',M,y,9,R,grey);
 y-=24;page.drawRectangle({x:M,y:y-112,width:W-2*M,height:122,color:pink,borderColor:line,borderWidth:1});
 const rows=[['Received from',d.from],['Patient',d.patient],['Invoice',d.invoice+'  -  '+d.procedure],['Payment mode','Razorpay (Online) - verified'],['Razorpay payment ID',d.gatewayIds]];
 rows.forEach(([k,v],i)=>{const yy=y-8-i*22;T(k,M+14,yy,9.5,R,grey);T(v,M+150,yy,10,B);});
 y-=140;page.drawRectangle({x:M,y:y-46,width:W-2*M,height:56,color:mag});
 T('Amount received',M+14,y-14,10,R,rgb(1,1,1));T('INR '+d.amount,M+14,y-36,20,B,rgb(1,1,1));
 y-=68;T(d.words,M,y,10,B);
 if(d.hasTotal){y-=30;[['Invoice total','INR '+d.total],['Total received to date','INR '+d.paid],['Balance','INR '+d.balance]].forEach(([k,v],i)=>{T(k,M,y-i*18,10,R,grey);T(v,M+170,y-i*18,10,B);});y-=72;}else y-=34;
 T(!d.hasTotal?'Payment received. Thank you for your payment.':d.fully?'Invoice fully paid. Thank you for your payment.':'Part payment received; the balance remains payable.',M,y,10,B,mag);
 y-=40;T('This is a computer-generated receipt and needs no signature.',M,y,8.5,R,grey);
 page.drawLine({start:{x:M,y:62},end:{x:W-M,y:62},thickness:.6,color:line});
 T('RBK VILLA, 23-A, Reddipalayam Road, Jeswant Nagar Phase 1, Mogappair West, Chennai 600037',M,48,7.6,R,grey);
 T('9976735577 / 7395961616  -  care@samaraassistedliving.com  -  Samara Assisted Living',M,36,7.6,B,mag);
 return await pdf.save();
}
async function waSend(token,sender,payload){
 const r=await fetch('https://graph.facebook.com/v25.0/'+sender+'/messages',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload)});
 const j=await r.json().catch(()=>({}));return {ok:r.ok&&!!j?.messages?.[0]?.id,id:j?.messages?.[0]?.id,code:Number(j?.error?.code||0),error:j?.error?.message||''};
}
async function sendReceipt(req){
 if(!req||req.status!=='Paid')return null;
 // claim once (a second run or a second device finds it already claimed)
 const claim=await admin.from('outside_nursing_online_requests').update({receipt_status:'Sending',receipt_claimed_at:new Date().toISOString(),receipt_tries:(Number(req.receipt_tries)||0)+1})
  .eq('id',req.id).eq('status','Paid').lt('receipt_tries',3).or('receipt_status.is.null,receipt_status.eq.Failed').select('*').maybeSingle();
 if(claim.error||!claim.data)return null;
 const r=claim.data;let submitted=false;
 const done=async patch=>{await admin.from('outside_nursing_online_requests').update(patch).eq('id',r.id);};
 try{
  const v=await admin.from('outside_nursing_visits').select('id,invoice_number,procedure_name,patient_id,snapshot').eq('id',r.visit_id).single();if(v.error)throw Error(v.error.message);
  const p=await admin.from('outside_nursing_patients').select('full_name,phone').eq('id',v.data.patient_id).maybeSingle();
  const pays=await admin.from('outside_nursing_payments').select('id,amount,payment_date,gateway_payment_id').eq('online_request_id',r.id).order('payment_date',{ascending:false});if(pays.error)throw Error(pays.error.message);
  const rows=pays.data||[];if(!rows.length)throw Error('Payment entry not found yet.');
  const amount=rows.reduce((n,x)=>n+Number(x.amount||0),0);
  const patientName=String(v.data.snapshot?.full_name||p.data?.full_name||'Patient').trim();
  let to='';try{to=phone(r.recipient_phone||v.data.snapshot?.phone||p.data?.phone);}catch{await done({receipt_status:'Failed',receipt_tries:3,receipt_error:'No valid WhatsApp number for this patient / family.'});return null;}
  const name=String(r.recipient_name||patientName||'Patient / Family').trim().slice(0,80);
  const invoice='SN-'+String(v.data.invoice_number).padStart(6,'0');
  const reference=invoice+' / '+rows.map(x=>x.gateway_payment_id).filter(Boolean).join(', ');
  const values=[name,amount.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}),patientName,dmy(rows[0].payment_date),reference,'Razorpay (Online)'];
  const token=env('WHATSAPP_ACCESS_TOKEN'),sender=env('WHATSAPP_PHONE_NUMBER_ID');if(!token||!sender)throw Error('Samara WhatsApp service is not configured.');
  // receipt PDF (never blocks the receipt message if it cannot be made)
  let mediaId=null,filename='',bytes=null,storedPath=null,pdfNote='';
  try{
   const vt=await admin.from('outside_nursing_visits').select('total').eq('id',v.data.id).single();
   const allPaid=await admin.from('outside_nursing_payments').select('amount').eq('visit_id',v.data.id);
   const total=Number(vt.data?.total||0),paidAll=(allPaid.data||[]).reduce((n,x)=>n+Number(x.amount||0),0),money=n=>Number(n).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
   const receiptNo=rows[0].id?'SNR-'+String(rows[0].id).slice(0,8).toUpperCase():'SNR-'+String(rows[0].gateway_payment_id||r.id).replace(/^pay_/,'').slice(0,10).toUpperCase();
   bytes=await receiptPdf({receiptNo,date:dmy(rows[0].payment_date),from:name,patient:patientName,invoice,procedure:String(v.data.procedure_name||''),gatewayIds:rows.map(x=>x.gateway_payment_id).filter(Boolean).join(', '),
    amount:money(amount),words:inWords(amount),hasTotal:total>0,total:money(total),paid:money(paidAll),balance:money(Math.max(0,total-paidAll)),fully:total>0&&paidAll>=total});
   filename='Samara-Receipt-'+invoice+'-'+receiptNo+'.pdf';
   const form=new FormData();form.append('messaging_product','whatsapp');form.append('type','application/pdf');form.append('file',new Blob([bytes],{type:'application/pdf'}),filename);
   const up=await fetch('https://graph.facebook.com/v25.0/'+sender+'/media',{method:'POST',headers:{Authorization:'Bearer '+token},body:form});const uj=await up.json().catch(()=>({}));
   if(up.ok&&uj.id)mediaId=uj.id;else pdfNote='Receipt PDF upload to WhatsApp failed.';
   try{const path='outgoing/outside-nursing/receipts/'+r.id+'/'+filename;const st=await admin.storage.from('whatsapp-media').upload(path,bytes,{contentType:'application/pdf',upsert:true});if(!st.error)storedPath=path;}catch{}
  }catch(e){pdfNote='Receipt PDF could not be prepared: '+String(e?.message||e).slice(0,120);}
  submitted=true;
  let sent=null,route='';
  const body={type:'body',parameters:values.map(text=>({type:'text',text}))};
  if(mediaId){
   const t=await waSend(token,sender,{messaging_product:'whatsapp',recipient_type:'individual',to,type:'template',template:{name:RECEIPT_PDF_TEMPLATE,language:{code:'en'},components:[{type:'header',parameters:[{type:'document',document:{id:mediaId,filename}}]},body]}});
   if(t.ok){sent=t;route='Receipt with PDF (template)';}
   else if(!TEMPLATE_NOT_READY.includes(t.code)){await done({receipt_status:'Failed',receipt_error:String(t.error||'WhatsApp did not accept the receipt.').slice(0,300),receipt_phone:to});return null;}
  }
  if(!sent){
   const t=await waSend(token,sender,{messaging_product:'whatsapp',recipient_type:'individual',to,type:'template',template:{name:RECEIPT_TEMPLATE,language:{code:'en'},components:[{type:'header',parameters:[{type:'image',image:{link:env('WHATSAPP_HEADER_IMAGE_URL')||'https://samaraassistedliving.com/assets/samara-whatsapp-logo.png'}}]},body]}});
   if(!t.ok){await done({receipt_status:'Failed',receipt_error:String(t.error||'WhatsApp did not accept the receipt.').slice(0,300),receipt_phone:to});return null;}
   sent=t;route='Receipt message';
   if(mediaId){
    const d2=await waSend(token,sender,{messaging_product:'whatsapp',recipient_type:'individual',to,type:'document',document:{id:mediaId,filename,caption:'Samara payment receipt '+invoice}});
    if(d2.ok)route='Receipt message + PDF';else pdfNote='PDF not attached yet: the receipt-with-PDF template is awaiting WhatsApp approval and the family has not written to Samara in the last 24 hours.';
   }
  }
  const id=sent.id;
  await done({receipt_status:'Sent',receipt_sent_at:new Date().toISOString(),receipt_phone:to,receipt_message_id:id,receipt_error:pdfNote||null});
  const now=new Date().toISOString();
  await admin.from('hr_whatsapp_communications').upsert({recipient_number:to,template_name:route==='Receipt with PDF (template)'?RECEIPT_PDF_TEMPLATE:RECEIPT_TEMPLATE,communication_type:'Outside Nursing Payment Receipt (automatic)',direction:'outbound',message_type:'template',status:'Accepted',provider_message_id:id,
   message_content:`Dear ${values[0]},\n\nThank you. We confirm receipt of ₹${values[1]} towards the account of ${values[2]} on ${values[3]}.\n\nReceipt No.: ${values[4]}\nPayment Mode: ${values[5]}`,
   message_payload:{outside_visit_id:v.data.id,request_id:r.id,body_params:values,automatic:true,route,pdf_note:pdfNote||null,...(storedPath?{_samara_media:{bucket:'whatsapp-media',path:storedPath,filename,mime_type:'application/pdf',size:bytes?.length||0,meta_media_id:mediaId}}:{})},contact_name:name,source_type:'Outside Nursing',sent_by:r.created_by,sent_at:now,created_at:now,updated_at:now},{onConflict:'provider_message_id',ignoreDuplicates:true});
  return id;
 }catch(e){
  await done({receipt_status:submitted?'Unknown':'Failed',receipt_error:String(e?.message||e).slice(0,300)});
  return null;
 }
}
// Every 2 minutes (SQL 268): record payments of unpaid links + send any receipt not yet sent. Secret header only.
async function cronSweep(){
 const since=new Date(Date.now()-14*24*3600*1000).toISOString();
 const pending=await admin.from('outside_nursing_online_requests').select('*').in('status',['Creating','Pending']).not('link_id','is',null).gte('created_at',since).limit(50);
 let checked=0,failures=0,sent=0;
 for(const r of pending.data||[]){try{await reconcile(r);checked++;}catch{failures++;}}
 const unsent=await admin.from('outside_nursing_online_requests').select('*').eq('status','Paid').gte('created_at',since).lt('receipt_tries',3).or('receipt_status.is.null,receipt_status.eq.Failed').limit(20);
 for(const r of unsent.data||[]){
  if(r.receipt_status==='Failed'&&r.receipt_claimed_at&&Date.now()-new Date(r.receipt_claimed_at).getTime()<10*60*1000)continue; // retry failed sends after 10 minutes
  if(await sendReceipt(r))sent++;
 }
 return {checked,failures,receipts_sent:sent};
}
function phone(raw){let p=String(raw||'').replace(/[\s()\-]/g,'');if(/^\d{10}$/.test(p))p='91'+p;p=p.replace(/^\+/,'');if(!/^[1-9]\d{7,14}$/.test(p))throw Error('Enter a valid WhatsApp number with country code.');return p;}
const publicRequest=r=>({id:r.id,visit_id:r.visit_id,amount:r.amount,status:r.status,payment_url:r.payment_url,expires_at:r.expires_at,recipient_phone:r.recipient_phone,recipient_name:r.recipient_name,shared_at:r.shared_at,receipt_status:r.receipt_status,receipt_sent_at:r.receipt_sent_at,receipt_phone:r.receipt_phone,receipt_error:r.receipt_error});
function callbackPage(ok){return Response.redirect('https://app.samaraassistedliving.com/outside-nursing-payment-return.html?status='+(ok?'confirmed':'pending'),303);}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method==='GET'){
  try{const q=new URL(req.url).searchParams,r=await request(q.get('request_id'));if(!r.link_id||q.get('razorpay_payment_link_id')!==r.link_id)throw Error('Link mismatch');const result=await reconcile(r);return callbackPage(result.status==='Paid');}catch{return callbackPage(false);}
 }
 if(req.method!=='POST')return json({success:false,error:'Method not allowed'},405);
 if(env('CRON_SECRET')&&req.headers.get('x-cron-secret')===env('CRON_SECRET')){try{return json({success:true,...await cronSweep()});}catch(e){return json({success:false,error:e.message},500);}}
 try{
  const user=await staff(req),body=await req.json(),action=body.action;
  if(action==='list'||action==='sync'){
   let query=admin.from('outside_nursing_online_requests').select('*').order('created_at',{ascending:false});
   if(body.visit_id)query=query.eq('visit_id',body.visit_id);
   if(action==='sync')query=query.in('status',['Creating','Pending']);
   const result=await query.limit(200);if(result.error)throw Error(result.error.message);
   const rows=[],failures=[];
   for(let r of result.data||[]){if(action==='sync'&&r.link_id&&['Pending','Creating'].includes(r.status)){try{r=await reconcile(r);}catch(e){failures.push({request_id:r.id,error:e.message});}}rows.push(publicRequest(r));}
   return json({success:true,requests:rows,failures});
  }
  if(action==='create'){
   // Reconcile old links, including expired links, before reserving another amount.
   const old=await admin.from('outside_nursing_online_requests').select('*').eq('visit_id',body.visit_id).in('status',['Pending','Creating']);if(old.error)throw Error(old.error.message);
   for(const prior of old.data||[])if(prior.link_id)await reconcile(prior);
   const reserved=await admin.rpc('outside_nursing_online',{p_action:'reserve',p_data:{visit_id:body.visit_id,staff_id:user.id,amount:body.amount}});if(reserved.error)throw Error(reserved.error.message);
   let r=reserved.data.request;
   if(r.link_id)return json({success:true,request:publicRequest(r)});
   let link;
   if(!reserved.data.fresh){
    const found=await gateway('payment_links?reference_id='+encodeURIComponent(r.request_code));link=(found.items||[]).find(x=>x.reference_id===r.request_code);
    if(!link)throw Error('This link is still being prepared. Wait and retry; no second link has been created.');
   }else{
    try{link=await gateway('payment_links',{amount:paise(r.amount),currency:'INR',accept_partial:false,reference_id:r.request_code,description:'Samara Assisted Living - Nursing Invoice',expire_by:Math.floor(new Date(r.expires_at).getTime()/1000),notify:{sms:false,email:false},reminder_enable:false,callback_url:url+'/functions/v1/outside-nursing-payment?request_id='+r.id,callback_method:'get',notes:{outside_nursing_request_id:r.id}});}catch(e){if(e.definite)await rpc('fail',{request_id:r.id});throw e;}
   }
   if(link.reference_id!==r.request_code||Number(link.amount)!==paise(r.amount)||link.currency!=='INR'||!/^https:\/\//.test(link.short_url||''))throw Error('Gateway returned an invalid payment link.');
   r=await rpc('attach',{request_id:r.id,link_id:link.id,payment_url:link.short_url});return json({success:true,request:publicRequest(r)});
  }
  let r=await request(body.request_id);
  if(action==='reconcile')return json({success:true,request:publicRequest(await reconcile(r))});
  if(action==='cancel'){
   r=await reconcile(r);if(r.status==='Paid')return json({success:true,request:publicRequest(r)});
   if(!r.link_id)throw Error('Link is still being prepared; try again before recording a manual payment.');
   if(r.status==='Pending')await gateway('payment_links/'+encodeURIComponent(r.link_id)+'/cancel',{});
   r=await reconcile(r);return json({success:true,request:publicRequest(r)});
  }
  if(action==='send_whatsapp'){
   r=await reconcile(r);if(r.status!=='Pending'||!r.payment_url)throw Error('Only an unpaid active payment link can be sent.');
   const to=phone(body.phone),name=String(body.name||'Patient / Family').trim().slice(0,80);
   const token=env('WHATSAPP_ACCESS_TOKEN'),sender=env('WHATSAPP_PHONE_NUMBER_ID');if(!token||!sender)throw Error('Samara WhatsApp service is not configured.');
   const v=await admin.from('outside_nursing_visits').select('invoice_number').eq('id',r.visit_id).single();if(v.error)throw Error(v.error.message);
   const caption=`Samara Assisted Living\nDear ${name},\nInvoice SN-${String(v.data.invoice_number).padStart(6,'0')}\nAmount requested: INR ${Number(r.amount).toFixed(2)}\nPay securely: ${r.payment_url}\nFor help: 9976735577\nSamara Health Care LLP`;
   const response=await fetch('https://graph.facebook.com/v25.0/'+sender+'/messages',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to,type:'image',image:{link:'https://app.samaraassistedliving.com/assets/samara-whatsapp-logo.png',caption}})});
   const result=await response.json();if(!response.ok||!result.messages?.[0]?.id)throw Error(result.error?.code===131047?'WhatsApp requires a recent conversation. Ask the recipient to message Samara first, then retry; or share the branded payment request with your phone.':result.error?.message||'WhatsApp did not accept the message.');
   r=await rpc('shared',{request_id:r.id,phone:to,name,message_id:result.messages[0].id});
   return json({success:true,request:publicRequest(r),message:'WhatsApp accepted the message for delivery.'});
  }
  return json({success:false,error:'Unsupported action'},400);
 }catch(e){return json({success:false,error:e.message||'Payment request failed'},400);}
});


