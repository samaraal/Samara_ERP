import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
(function(root){
'use strict';
const logo='https://samaraassistedliving.com/assets/samara-logo.png';
const slots=['Tiffin','Morning Tea / Coffee','Lunch','Evening Tea / Coffee','Dinner'];
const clean=v=>String(v??'').replace(/\s+/g,' ').trim()||'None';
const ref=id=>'FOOD-'+String(id).slice(0,8).toUpperCase();
function summary(items,key){return (items||[]).map(i=>`${clean(i.name)}: ${Number(i[key]||0)}`).join('; ')||'None'}
function total(items){return (items||[]).map(i=>`${clean(i.name)}: ${Number(i.residents||0)+Number(i.employees||0)}`).join('; ')||'None'}
function message(kind,s){
 const common=[clean(s.vendor_name),ref(s.id),clean(s.date)+' / '+clean(s.slot),clean(s.delivery)];
 let values,body;
 if(kind==='order'){
 values=[...common,summary(s.items,'residents'),summary(s.items,'employees'),total(s.items),clean(s.instructions)];
 body=`Dear {{1}},\nPlease arrange the following food order for Samara Assisted Living.\n\nOrder: {{2}}\nDate and meal: {{3}}\nDelivery time: {{4}}\nResident quantities: {{5}}\nEmployee quantities: {{6}}\nTotal quantities: {{7}}\nOther requests / instructions: {{8}}\n\nPlease acknowledge this order.\nThank you, Samara Assisted Living.`;
 }else if(kind==='modification'){
 common[1]+=' / Revision '+s.version;
 const before=total(s.before?.items);values=[...common,`Previous quantities: ${before}. Revised: ${total(s.items)}. Previous delivery: ${clean(s.before?.delivery)}.`,summary(s.items,'residents'),summary(s.items,'employees'),total(s.items),clean(s.reason)+'; '+clean(s.instructions)];
 body=`Dear {{1}},\nPlease use this revised food order for Samara Assisted Living in place of the earlier version.\n\nOrder and revision: {{2}}\nDate and meal: {{3}}\nDelivery time: {{4}}\nChanges: {{5}}\nRevised resident quantities: {{6}}\nRevised employee quantities: {{7}}\nRevised total quantities: {{8}}\nReason / instructions: {{9}}\n\nPlease acknowledge the revised quantities.\nThank you, Samara Assisted Living.`;
 }else if(kind==='receipt'){
 common[1]+=' / Receipt '+String(s.receipt_id).slice(0,8);common[3]=new Date(s.receipt.received_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata'});
 const lines=s.receipt.items.map((i,n)=>({...i,name:s.items[n].name}));
 values=[...common,total(s.items),'Residents: '+summary(lines,'residents')+'; Employees: '+summary(lines,'employees'),summary(lines,'rejected'),String(s.outstanding)+' portions',clean(s.receipt.remarks)];
 body=`Dear {{1}},\nSamara Assisted Living has recorded a food delivery against your order.\n\nOrder and receipt: {{2}}\nDate and meal: {{3}}\nReceived at: {{4}}\nOrdered quantities: {{5}}\nAccepted this delivery: {{6}}\nRejected this delivery: {{7}}\nOutstanding quantities: {{8}}\nRemarks / instructions: {{9}}\n\nPlease review any discrepancy and acknowledge.\nThank you, Samara Assisted Living.`;
 }else if(kind==='confirm_request'){
 values=[...common.slice(0,3)];
 body=`Dear {{1}},\nPlease confirm the food order below for Samara Assisted Living.\n\nOrder: {{2}}\nDate and meal: {{3}}\n\nTap a button below to reply.\nThank you, Samara Assisted Living.`;
 }else throw Error('Unknown food message type');
 values=values.map(clean);const text=body.replace(/\{\{(\d+)\}\}/g,(_,i)=>values[Number(i)-1]);
 return {name:'samara_food_'+kind,values,text,logo,tooLong:text.length>3500};
}
function payload(kind,s){const m=message(kind,s);if(!/^[1-9][0-9]{7,14}$/.test(s.phone))throw Error('Invalid vendor phone');if(m.tooLong)throw Error('Message exceeds 3500 characters; use manual WhatsApp or shorten instructions before finalising');return {messaging_product:'whatsapp',to:s.phone,type:'template',template:{name:m.name,language:{code:'en'},components:[{type:'header',parameters:[{type:'image',image:{link:logo}}]},{type:'body',parameters:m.values.map(text=>({type:'text',text}))}]}}}
function manual(kind,s){const ask=kind==='confirm_request'?'\n\nPlease reply with one word: Acknowledged, Returned, or Modification Requested.':'';return 'https://wa.me/'+s.phone+'?text='+encodeURIComponent(message(kind,s).text+ask+'\n\nSamara Assisted Living: https://samaraassistedliving.com/')}
function balance(report){const entries=report.entries||[];return {opening:Number(report.opening||0),closing:Number(report.opening||0)+entries.reduce((n,e)=>n+Number(e.amount||0),0),unpriced:Number(report.unpriced_before||0)+entries.filter(e=>e.amount===null).length}}
const api={logo,slots,ref,message,payload,manual,balance};root.SamaraFoodCore=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
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
  let body;try{body=core.payload(msg.kind,msg.snapshot)}catch(e){await admin.from('fv_messages').update({status:'Failed',error:String(e),updated_at:new Date().toISOString()}).eq('id',id);claimed=false;throw e;}
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
