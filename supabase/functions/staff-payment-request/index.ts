import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(body:any,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const env=(name:string)=>Deno.env.get(name)||'';
const supabaseUrl=env('SUPABASE_URL');
const serviceKey=env('SUPABASE_SERVICE_ROLE_KEY');
const razorKey=env('RAZORPAY_KEY_ID')||env('RAZORPAY_KEY');
const razorSecret=env('RAZORPAY_KEY_SECRET')||env('RAZORPAY_KEY_SECRET_KEY')||env('RAZORPAY_SECRET');
const site='https://family.samaraassistedliving.com';
const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}});
const money=(n:number)=>Math.round(n*100);
const safeEqual=(a:string,b:string)=>{if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0};
async function hmac(message:string){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(razorSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(message));return [...new Uint8Array(sig)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function requestByToken(token:string){
  const {data,error}=await admin.from('staff_payment_requests').select('*,patients(full_name,title,patient_id)').eq('public_token',token).maybeSingle();
  if(error||!data)throw new Error('Payment request not found.');
  if(data.status==='Pending'&&new Date(data.expires_at).getTime()<Date.now()){await admin.from('staff_payment_requests').update({status:'Expired',updated_at:new Date().toISOString()}).eq('id',data.id);data.status='Expired'}
  return data;
}
async function requireStaff(req:Request){
  const auth=req.headers.get('Authorization')||'';
  const jwt=auth.replace(/^Bearer\s+/i,'');if(!jwt)throw new Error('ERP sign-in required.');
  const {data,error}=await admin.auth.getUser(jwt);if(error||!data.user)throw new Error('ERP session is invalid.');
  const {data:profile}=await admin.from('profiles').select('id,role,is_active').eq('id',data.user.id).maybeSingle();
  if(!profile||profile.is_active===false||!['Admin','Manager','Accounts'].includes(profile.role))throw new Error('Accounts/Admin permission is required.');
  return profile;
}
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return json({success:false,error:'Method not allowed'},405);
  try{
    const body=await req.json();const action=String(body.action||'');
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
      const {data:patient,error:pErr}=await admin.from('patients').select('id,full_name,title,patient_id').eq('id',patientId).single();if(pErr)throw pErr;
      const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
      const {data,error}=await admin.from('staff_payment_requests').insert({public_token:token,patient_id:patientId,payment_type:type,amount,created_by:profile.id}).select('id,request_code,amount,payment_type,expires_at').single();if(error)throw error;
      return json({success:true,...data,patient_id:patientId,patient_name:[patient.title,patient.full_name].filter(Boolean).join(' '),patient_code:patient.patient_id,payment_url:`${site}/pay.html?t=${token}`});
    }
    const token=String(body.token||'');if(!token)return json({success:false,error:'Payment link is incomplete.'},400);
    const request=await requestByToken(token);const patient=request.patients||{};
    if(action==='details')return json({success:true,request_code:request.request_code,status:request.status,amount:Number(request.amount),payment_type:request.payment_type,expires_at:request.expires_at,patient_name:[patient.title,patient.full_name].filter(Boolean).join(' '),patient_code:patient.patient_id,paid_at:request.paid_at});
    if(request.status!=='Pending')return json({success:false,error:request.status==='Paid'?'This payment request has already been paid.':`This payment request is ${String(request.status).toLowerCase()}.`},409);
    if(!razorKey||!razorSecret)throw new Error('Razorpay server credentials are not configured.');
    if(action==='create_order'){
      if(request.razorpay_order_id){return json({success:true,order_id:request.razorpay_order_id,key_id:razorKey,amount:money(Number(request.amount)),currency:'INR',patient_name:patient.full_name,request_code:request.request_code})}
      const auth=btoa(`${razorKey}:${razorSecret}`);const r=await fetch('https://api.razorpay.com/v1/orders',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Basic ${auth}`},body:JSON.stringify({amount:money(Number(request.amount)),currency:'INR',receipt:request.request_code,notes:{samara_request_id:request.id,patient_id:request.patient_id,payment_type:request.payment_type}})});const order=await r.json();if(!r.ok)throw new Error(order?.error?.description||'Razorpay order could not be created.');
      const {error}=await admin.from('staff_payment_requests').update({razorpay_order_id:order.id,updated_at:new Date().toISOString()}).eq('id',request.id).eq('status','Pending');if(error)throw error;
      return json({success:true,order_id:order.id,key_id:razorKey,amount:order.amount,currency:order.currency||'INR',patient_name:patient.full_name,request_code:request.request_code});
    }
    if(action==='verify'){
      const paymentId=String(body.razorpay_payment_id||''),orderId=String(body.razorpay_order_id||''),signature=String(body.razorpay_signature||'');
      if(!paymentId||!orderId||!signature||orderId!==request.razorpay_order_id)return json({success:false,error:'Payment verification details are invalid.'},400);
      const expected=await hmac(`${orderId}|${paymentId}`);if(!safeEqual(expected,signature))return json({success:false,error:'Razorpay signature verification failed.'},400);
      const {data:claimed,error:claimErr}=await admin.from('staff_payment_requests').update({status:'Paid',razorpay_payment_id:paymentId,paid_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',request.id).eq('status','Pending').select('id').maybeSingle();if(claimErr)throw claimErr;
      if(!claimed){const latest=await requestByToken(token);if(latest.status==='Paid'&&latest.razorpay_payment_id===paymentId)return json({success:true,verified:true,payment_id:paymentId,amount:Number(latest.amount)});throw new Error('This payment request has already been processed.');}
      const txType=request.payment_type==='advance'?'Advance':'Payment';
      const {error:txErr}=await admin.from('billing_transactions').insert({patient_id:request.patient_id,transaction_type:txType,category:request.payment_type==='advance'?'Online Advance':'Online Payment',amount:Number(request.amount),payment_mode:'Razorpay Online',payment_reference:paymentId,description:`${request.payment_type==='advance'?'Online advance':'Online outstanding payment'} · Staff payment request ${request.request_code} · Razorpay Payment ID: ${paymentId} · Razorpay Order ID: ${orderId}`,transaction_date:new Date().toISOString(),entered_by:request.created_by});
      if(txErr){await admin.from('staff_payment_requests').update({status:'Pending',razorpay_payment_id:null,paid_at:null,updated_at:new Date().toISOString()}).eq('id',request.id).eq('razorpay_payment_id',paymentId);throw new Error('Payment was verified but could not be posted to the Samara ledger. Contact Accounts before retrying. '+txErr.message)}
      return json({success:true,verified:true,payment_id:paymentId,amount:Number(request.amount),request_code:request.request_code});
    }
    return json({success:false,error:'Unsupported action.'},400);
  }catch(error){console.error(error);return json({success:false,error:error instanceof Error?error.message:String(error)},400)}
});
