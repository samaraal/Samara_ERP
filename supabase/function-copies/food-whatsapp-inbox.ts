import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
(function(root){
'use strict';
const logo='https://samaraassistedliving.com/assets/samara-logo.png';
const slots=['Tiffin','Morning Tea / Coffee','Lunch','Evening Tea / Coffee','Dinner'];
const clean=v=>String(v??'').replace(/\s+/g,' ').trim()||'None';
const ref=id=>'FOOD-'+String(id).slice(0,8).toUpperCase();
function summary(items,key){return (items||[]).map(i=>`${clean(i.name)}: *${Number(i[key]||0)}*`).join('; ')||'None'}
function total(items){return (items||[]).map(i=>`${clean(i.name)}: *${Number(i.residents||0)+Number(i.employees||0)}*`).join('; ')||'None'}
// 2.15.36: same wording as the ERP's manual WhatsApp — 'Breakfast' (not Tiffin) and dates as DD-MM-YYYY.
const label=(v:any)=>String(v).replace(/\bTiffin\b/gi,'Breakfast').replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,(_:string,y:string,m:string,d:string)=>d+'-'+m+'-'+y);
 // 2.15.64/65: simplified vendor messages (Meta templates samara_food_order_v2 / _modification_v2 / _receipt_v2).
 // Header picture shows the kind of message (band colour) and the place (tag colour); quantities and place are bold.
 const headerBase='https://app.samaraassistedliving.com/assets/food-wa/';
 const V2_KINDS=['order','modification','receipt'];
 function placeKey(s){const p=String(s&&s.place||'');if(!p||/samara|mogappair/i.test(p))return 'samara';if(/appgeo|saidapet/i.test(p))return 'appgeo';return 'other'}
 function headerKind(kind,s){return kind==='order'?'order':kind==='modification'?(s&&s.cancellation?'cancelled':'revised'):kind==='receipt'?'received':null}
 function header(kind,s){const k=headerKind(kind,s);return k?headerBase+k+'-'+placeKey(s)+'.jpg':logo}
 function time12(v){const m=/^(\d{1,2}):(\d{2})/.exec(String(v??'').trim());if(!m)return clean(v);let h=Number(m[1]);const ap=h>=12?'PM':'AM';h=h%12||12;return h+':'+m[2]+' '+ap}
 function istTime(v){const d=new Date(v);if(isNaN(d.getTime()))return clean(v);const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:true}).formatToParts(d).map(x=>[x.type,x.value]));return Number(p.hour)+':'+p.minute+' '+String(p.dayPeriod||'').toUpperCase()}
 function qty(items,fn){const parts=(items||[]).map(i=>[clean(i.name),fn(i)]).filter(x=>x[1]>0).map(x=>x[0]+' *'+x[1]+'*');return parts.join(' • ')||'None'}
 const both=i=>Number(i.residents||0)+Number(i.employees||0);
 function messageV2(kind,s){
  // 2.15.65: total plus separate Guest and Employee lines (priced separately); the place is shown only in the header picture.
  const when=clean(s.date)+' – '+clean(s.slot),no=ref(s.id);
  const g=i=>Number(i.residents||0),e=i=>Number(i.employees||0),split=items=>[qty(items,both),qty(items,g),qty(items,e)];
  let values,body;
  if(kind==='order'){
   values=[clean(s.vendor_name),when,time12(s.delivery),...split(s.items),clean(s.instructions),no];
   body=`🍽️ *NEW FOOD ORDER / புதிய உணவு ஆர்டர்*\n\nDear {{1}},\n\n📅 Date / தேதி: *{{2}}*\n⏰ Time / நேரம்: *{{3}}*\n\n🍛 Total / மொத்தம்: {{4}}\n👥 Guest / கெஸ்ட்: {{5}}\n👷 Employee / ஊழியர்: {{6}}\n📝 Note / குறிப்பு: {{7}}\n\nOrder No: {{8}}\n\n👉 Please tap *Acknowledged* below.\nகீழே உள்ள *Acknowledged* பட்டனை அழுத்தவும்.\nThank you – Samara Assisted Living`;
  }else if(kind==='modification'){
   const before=s.before||{},timeChanged=before.delivery&&String(before.delivery).slice(0,5)!==String(s.delivery).slice(0,5);
   const now=s.cancellation?['*CANCELLED – do not prepare / சமைக்க வேண்டாம்*','None','None']:split(s.items);
   const earlier=qty(before.items,both)+(timeChanged?' (time '+time12(before.delivery)+')':'');
   const why=s.cancellation?clean(s.cancellation_reason||String(s.reason||'').replace(/^FULL CANCELLATION - /,'')):clean(s.reason)+(s.instructions&&clean(s.instructions)!=='None'?'; '+clean(s.instructions):'');
   values=[clean(s.vendor_name),when,time12(s.delivery),...now,earlier,why,no+' / Rev '+clean(s.version)];
   body=`✏️ *ORDER CHANGED / ஆர்டர் மாற்றம்*\n_Use this in place of the earlier order._\n_முந்தைய ஆர்டருக்கு பதிலாக இதைப் பின்பற்றவும்._\n\nDear {{1}},\n\n📅 Date / தேதி: *{{2}}*\n⏰ Time / நேரம்: *{{3}}*\n\n🍛 NEW total / புதிய மொத்தம்: {{4}}\n👥 Guest / கெஸ்ட்: {{5}}\n👷 Employee / ஊழியர்: {{6}}\nEarlier total / முன்பு: {{7}}\n📝 Reason / காரணம்: {{8}}\n\nOrder No: {{9}}\n\n👉 Please tap *Acknowledged* below.\nகீழே உள்ள *Acknowledged* பட்டனை அழுத்தவும்.\nThank you – Samara Assisted Living`;
  }else if(kind==='receipt'){
   const r=s.receipt||{},lines=(r.items||[]).map((i,n)=>({...i,name:(s.items[n]||{}).name}));
   const ordered=(s.items||[]).reduce((n,i)=>n+both(i),0),now=lines.reduce((n,i)=>n+both(i),0),out=Number(s.outstanding||0);
   // Per-item balance is exact only when this is the first delivery for the order; otherwise show the total.
   const balance=out<=0?'Nothing ✔️ / இல்லை':ordered-now===out?qty(s.items.map((i,n)=>({name:i.name,left:both(i)-both(lines[n]||{})})),i=>i.left)+' – please send / அனுப்பவும்':'*'+out+'* portions – please send / அனுப்பவும்';
   const rejected=lines.filter(i=>Number(i.rejected||0)>0);
   const remarks=(rejected.length?'Rejected / திருப்பியது: '+rejected.map(i=>clean(i.name)+' '+Number(i.rejected)).join(', ')+'. ':'')+(clean(r.remarks)!=='None'?clean(r.remarks):rejected.length?'':'None');
   values=[clean(s.vendor_name),when,istTime(r.received_at),...split(lines),balance,remarks,no];
   body=`✅ *FOOD RECEIVED / உணவு பெற்றுக்கொண்டோம்*\n_This is NOT a new order. இது புதிய ஆர்டர் அல்ல._\n\nDear {{1}},\n\n📅 Date / தேதி: {{2}}\n⏰ Received time / நேரம்: {{3}}\n\n✔️ We received / பெற்றது: {{4}}\n👥 Guest / கெஸ்ட்: {{5}}\n👷 Employee / ஊழியர்: {{6}}\n📦 Still to send / இன்னும் அனுப்ப வேண்டியது: {{7}}\n📝 Remarks / குறிப்பு: {{8}}\n\nOrder No: {{9}}\nThank you – Samara Assisted Living`;
  }else return null;
  values=values.map(v=>label(clean(v)));const text=body.replace(/\{\{(\d+)\}\}/g,(_,i)=>values[Number(i)-1]);
  return {name:'samara_food_'+kind+'_v2',values,text,logo:header(kind,s),tooLong:text.length>1000};
 }
function message(kind,s,v2){
 // A place without its own header picture keeps the older wording, which names the place in the text.
 if(v2&&V2_KINDS.includes(kind)&&placeKey(s)!=='other'){const m=messageV2(kind,s);if(m&&!m.tooLong)return m}
 const common=[clean(s.vendor_name),ref(s.id),clean(s.date)+' / '+clean(s.slot)+(s.place?' / Deliver to: *'+clean(s.place)+'*':''),clean(s.delivery)]; // 2.15.36: place inside the approved 'Date and meal' value
 let values,body;
 if(kind==='order'){
 values=[...common,summary(s.items,'residents'),summary(s.items,'employees'),total(s.items),clean(s.instructions)];
 body=`Dear {{1}},\nPlease arrange the following food order for Samara Assisted Living.\n\nOrder: {{2}}\nDate and meal: {{3}}\nDelivery time: {{4}}\nResident quantities: {{5}}\nEmployee quantities: {{6}}\nTotal quantities: {{7}}\nOther requests / instructions: {{8}}\n\nPlease acknowledge this order.\nThank you, Samara Assisted Living.`;
 }else if(kind==='modification'){
 common[1]+=' / Revision '+s.version;
 const before=total(s.before?.items);values=[...common,`Previous quantities: ${before}. Revised: ${total(s.items)}. Previous delivery: ${clean(s.before?.delivery)}.`,summary(s.items,'residents'),summary(s.items,'employees'),total(s.items),clean(s.reason)+'; '+clean(s.instructions)];
 body=`Dear {{1}},\nPlease use this revised food order for Samara Assisted Living in place of the earlier version.\n\nOrder and revision: {{2}}\nDate and meal: {{3}}\nDelivery time: {{4}}\nChanges: {{5}}\nRevised resident quantities: {{6}}\nRevised employee quantities: {{7}}\nRevised total quantities: {{8}}\nReason / instructions: {{9}}\n\nPlease acknowledge the revised quantities.\nThank you, Samara Assisted Living.`;
 }else if(kind==='receipt'){
 common[1]+=' / Receipt '+String(s.receipt_id).slice(0,8);common[3]=(v=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:true}).formatToParts(new Date(v)).map(x=>[x.type,x.value]));return `${p.day}-${p.month}-${p.year}, ${p.hour}:${p.minute} ${String(p.dayPeriod||'').toUpperCase()} IST`})(s.receipt.received_at);
 const lines=s.receipt.items.map((i,n)=>({...i,name:s.items[n].name}));
 values=[...common,total(s.items),'Residents: '+summary(lines,'residents')+'; Employees: '+summary(lines,'employees'),summary(lines,'rejected'),'*'+String(s.outstanding)+'* portions',clean(s.receipt.remarks)];
 body=`Dear {{1}},\nSamara Assisted Living has recorded a food delivery against your order.\n\nOrder and receipt: {{2}}\nDate and meal: {{3}}\nReceived at: {{4}}\nOrdered quantities: {{5}}\nAccepted this delivery: {{6}}\nRejected this delivery: {{7}}\nOutstanding quantities: {{8}}\nRemarks / instructions: {{9}}\n\nPlease review any discrepancy and acknowledge.\nThank you, Samara Assisted Living.`;
 }else if(kind==='confirm_request'){
 values=[...common.slice(0,3)];
 body=`Dear {{1}},\nPlease confirm the food order below for Samara Assisted Living.\n\nOrder: {{2}}\nDate and meal: {{3}}\n\nTap a button below to reply.\nThank you, Samara Assisted Living.`;
 }else throw Error('Unknown food message type');
 values=values.map(v=>label(clean(v)));const text=body.replace(/\{\{(\d+)\}\}/g,(_,i)=>values[Number(i)-1]);
 return {name:'samara_food_'+kind,values,text,logo,tooLong:text.length>3500};
}
function payload(kind,s,v2){const m=message(kind,s,v2);if(!/^[1-9][0-9]{7,14}$/.test(s.phone))throw Error('Invalid vendor phone');if(m.tooLong)throw Error('Message exceeds 3500 characters; use manual WhatsApp or shorten instructions before finalising');return {messaging_product:'whatsapp',to:s.phone,type:'template',template:{name:m.name,language:{code:'en'},components:[{type:'header',parameters:[{type:'image',image:{link:m.logo}}]},{type:'body',parameters:m.values.map(text=>({type:'text',text}))}]}}}
function manual(kind,s){const ask=kind==='confirm_request'?'\n\nPlease reply with one word: Acknowledged, Returned, or Modification Requested.':'';return 'https://wa.me/'+s.phone+'?text='+encodeURIComponent(message(kind,s,true).text+ask+'\n\nSamara Assisted Living: https://samaraassistedliving.com/')}
function balance(report){const entries=report.entries||[];return {opening:Number(report.opening||0),closing:Number(report.opening||0)+entries.reduce((n,e)=>n+Number(e.amount||0),0),unpriced:Number(report.unpriced_before||0)+entries.filter(e=>e.amount===null).length}}
const api={header,messageV2,V2_KINDS,logo,slots,ref,message,payload,manual,balance};root.SamaraFoodCore=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(globalThis);

const core=(globalThis as any).SamaraFoodCore;
const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
Deno.serve(async req=>{
 const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{headers,status});
 if(req.method==='OPTIONS')return new Response('ok',{headers});if(req.method!=='POST')return reply({error:'POST required'},405);
 const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const user=createClient(url,key,{global:{headers:{Authorization:req.headers.get('Authorization')||''}},auth:{persistSession:false}});
 const admin=createClient(url,service,{auth:{persistSession:false}});let id='',claimed=false;
 try{
  const jwt=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'').trim();
  if(!jwt)return reply({error:'Sign in required'},401);
  const {data:{user:identity},error:authError}=await user.auth.getUser(jwt);if(authError||!identity)return reply({error:'Session verification failed: '+(authError?.message||'No signed-in user')},401);
  const input=await req.json();id=String(input.id||'');
  const token=Deno.env.get('WHATSAPP_ACCESS_TOKEN'),number=Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');if(!token||!number)throw Error('WhatsApp server configuration missing');
  if(input.action==='check'){const {data:a,error}=await user.rpc('fv_access');if(error||!a?.control)return reply({error:'Food order authority required'},403);return reply({success:true,message:'Authenticated food sender and WhatsApp settings are available. No message was sent.'});}
  const {data:msg,error}=await user.rpc('fv_rpc',{action:'claim',p:{id,request_id:crypto.randomUUID()}});if(error)throw error;claimed=true;
  // 2.15.64: use the simplified _v2 template only after Admin ticks its Meta approval in Food Vendor settings.
  const {data:cfgRow}=await admin.from('fv_settings').select('data').eq('id',true).maybeSingle();
  const useV2=!!(cfgRow as any)?.data?.approved?.[msg.kind+'_v2'];
  let body;try{body=core.payload(msg.kind,msg.snapshot,useV2)}catch(e){await admin.from('fv_messages').update({status:'Failed',error:String(e),updated_at:new Date().toISOString()}).eq('id',id);claimed=false;throw e;}
  const response=await samaraInboxFetch(`https://graph.facebook.com/v25.0/${number}/messages`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  const data=await response.json();
  if(!response.ok){const errorText=String(data?.error?.message||'Meta rejected the message');await admin.from('fv_messages').update({status:response.status>=500?'Unknown':'Failed',error:errorText,updated_at:new Date().toISOString()}).eq('id',id);claimed=false;return reply({error:errorText},400)}
  const provider=data?.messages?.[0]?.id;if(!provider)throw Error('No provider message ID; outcome is uncertain');
  const {error:saveError}=await admin.from('fv_messages').update({provider_id:provider,status:'Accepted',error:null,updated_at:new Date().toISOString()}).eq('id',id);
  if(saveError)throw Error('Meta accepted, but history save failed. Do not resend. Provider ID: '+provider);
  await admin.rpc('fv_apply_provider_status',{p_id:provider,p_status:'Accepted',p_detail:null,p_at:new Date().toISOString()});
  return reply({success:true,status:'Accepted',provider_id:provider});
 }catch(e){const error=e instanceof Error?e.message:String((e as any)?.message||e);if(claimed)await admin.from('fv_messages').update({status:'Unknown',error,updated_at:new Date().toISOString()}).eq('id',id);return reply({error},400)}
});

// Embed this helper in each Edge Function and use samaraInboxFetch instead of fetch.
// Non-message requests pass through unchanged. Never store authentication codes.
async function samaraInboxFetch(input: any, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const isMeta = /^https:\/\/graph\.facebook\.com\/[^/]+\/[^/]+\/messages(?:\?|$)/.test(url);
  const isTwilio = /^https:\/\/api\.twilio\.com\/2010-04-01\/Accounts\/[^/]+\/Messages\.json$/.test(url);
  if ((!isMeta && !isTwilio) || String(init?.method || "GET").toUpperCase() !== "POST") return globalThis.fetch(input, init);
  const form = isTwilio ? new URLSearchParams(String(init?.body || "")) : null;
  if (form && !String(form.get("To")).startsWith("whatsapp:")) return globalThis.fetch(input,init);
  const payload = form ? {to:form.get("To"),type:"text",text:{body:form.get("Body")}} : JSON.parse(String(init?.body || "{}"));
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {auth:{persistSession:false}});
  const template = payload.template?.name || null;
  const privateTemplate = /otp|auth|portal_access|password|pin/i.test(template || "") || /\b(OTP|verification code|password|PIN)\b/i.test(payload.text?.body || "");
  const params = privateTemplate ? [] : (payload.template?.components || []).filter((c:any)=>c.type === "body").flatMap((c:any)=>c.parameters || []).map((p:any)=>String(p.text ?? ""));
  const content = privateTemplate ? "Authentication / portal access message. Secret values are hidden."
    : payload.text?.body || payload.image?.caption || payload.document?.caption
    || (template ? `Template: ${template}${params.length ? "\n" + params.join("\n") : ""}` : `[${payload.type || "WhatsApp"} message]`);
  const source = /food/i.test(template || "") ? "Food Vendor" : /employee|interview|career/i.test(template || "") ? "HR" : /patient|family|discharge|bill|package|clinical/i.test(template || "") ? "Patient / Family" : "WhatsApp";
  const id = crypto.randomUUID(), now = new Date().toISOString();
  const row = {id, recipient_number:String(payload.to || "").replace(/\D/g,""),
    template_name:template, communication_type:template ? `WhatsApp · ${template}` : "WhatsApp Reply",
    direction:"outbound", message_type:payload.type || "template", status:"Sending",
    message_content:content, message_payload:{inbox_transport:true,body_params:params,secret_values_hidden:privateTemplate},
    source_type:source, created_at:now,updated_at:now};
  const reserved = await db.from("hr_whatsapp_communications").insert(row);
  if (reserved.error) throw new Error("WhatsApp was not sent because Inbox recording is unavailable. " + reserved.error.message);
  let response: Response;
  try { response = await globalThis.fetch(input,init); }
  catch (error) {
    await db.from("hr_whatsapp_communications").update({status:"Unknown",error_message:"Network interrupted. Acceptance is unknown; check before resending.",updated_at:new Date().toISOString()}).eq("id",id);
    throw error;
  }
  let result:any = {};
  try { result = await response.clone().json(); } catch { /* Keep the provider response unchanged. */ }
  const providerId = result?.messages?.[0]?.id || (isTwilio ? result?.sid : null) || null;
  const when = new Date().toISOString();
  const status = response.ok ? (providerId ? "Accepted" : "Unknown") : "Failed";
  const saved = await db.from("hr_whatsapp_communications").update({
    provider_message_id:providerId, status, sent_at:status === "Accepted" ? when : null,
    failed_at:status === "Failed" ? when : null,
    error_message:status === "Failed" ? String(result?.error?.message || result?.message || `Provider rejected the message (${response.status})`) : status === "Unknown" ? "Provider did not return a message ID. Check before resending." : null,
    updated_at:when
  }).eq("id",id);
  // A failed status write must never turn an accepted send into a retryable error.
  if (saved.error) console.error("WhatsApp Inbox outcome update failed",id,saved.error.message);
  const headers = new Headers(response.headers);
  headers.set("x-samara-inbox-id",id);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
