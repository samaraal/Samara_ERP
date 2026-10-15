import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
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
 return await rpc('settle',{request_id:r.id,payments:receipts,gateway_status:link.status});
}
function phone(raw){let p=String(raw||'').replace(/[\s()\-]/g,'');if(/^\d{10}$/.test(p))p='91'+p;p=p.replace(/^\+/,'');if(!/^[1-9]\d{7,14}$/.test(p))throw Error('Enter a valid WhatsApp number with country code.');return p;}
const publicRequest=r=>({id:r.id,visit_id:r.visit_id,amount:r.amount,status:r.status,payment_url:r.payment_url,expires_at:r.expires_at,recipient_phone:r.recipient_phone,recipient_name:r.recipient_name,shared_at:r.shared_at});
function callbackPage(ok){return new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Samara Payment</title></head><body style="font:18px Arial;background:#fff0f7;color:#a00050;text-align:center;padding:40px"><img src="https://app.samaraassistedliving.com/assets/samara-logo.png" alt="Samara Assisted Living" width="200"><h1>${ok?'Payment confirmed':'Payment confirmation pending'}</h1><p>${ok?'Your payment has been recorded against the Samara invoice.':'Please contact Samara Accounts. Do not pay again until the payment status is checked.'}</p><p>Samara Assisted Living · 9976735577</p></body></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method==='GET'){
  try{const q=new URL(req.url).searchParams,r=await request(q.get('request_id'));if(!r.link_id||q.get('razorpay_payment_link_id')!==r.link_id)throw Error('Link mismatch');const result=await reconcile(r);return callbackPage(result.status==='Paid');}catch{return callbackPage(false);}
 }
 if(req.method!=='POST')return json({success:false,error:'Method not allowed'},405);
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

