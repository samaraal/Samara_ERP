import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const env=(name:string)=>String(Deno.env.get(name)||'').trim();
const key=(name:string)=>env(name).replace(new RegExp('^'+name+'='),'').replace(/^['"]|['"]$/g,'').replace(/\s+/g,'').replace(/=+$/g,'');
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
Deno.serve(async(req)=>{
 if(req.method!=='POST')return json({error:'POST required'},405);
 if(!env('CRON_SECRET')||req.headers.get('x-cron-secret')!==env('CRON_SECRET'))return json({error:'Unauthorized'},401);
 try{
  if(!key('VAPID_PUBLIC_KEY')||!key('VAPID_PRIVATE_KEY'))throw Error('Mobile push is not configured');
  webpush.setVapidDetails(env('VAPID_SUBJECT')||'mailto:admin@samaraassistedliving.com',key('VAPID_PUBLIC_KEY'),key('VAPID_PRIVATE_KEY'));
  const db=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});
  const since=new Date(Date.now()-86400000).toISOString();
  const [{data:events,error:ee},{data:subs,error:se}]=await Promise.all([
   db.from('fv_cutoff_attempts').select('*').gte('attempted_at',since).order('attempted_at',{ascending:false}).limit(500),
   db.from('push_subscriptions').select('id,endpoint,p256dh,auth_key').eq('is_active',true)
  ]);
  if(ee||se)throw ee||se;
  let sent=0,failed=0;
  for(const event of events||[]){
   const when=new Date(event.attempted_at).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',hour:'numeric',minute:'2-digit',hour12:true});
   const operation=event.operation==='modify'?'modification':event.operation==='save'?'draft order':'new order';
   const payload=JSON.stringify({title:'SAMARA · Food cutoff attempt blocked',body:event.actor_name+' attempted a '+operation+' for '+event.meal_slot+' ('+event.supply_date+') at '+when+' IST. The order was blocked.',tag:'samara-food-cutoff-'+event.id,event_kind:'food_cutoff',url:'./?push_page=Notifications',renotify:false,requireInteraction:true,icon:'./icons/icon-192.png',badge:'./icons/icon-192.png'});
   for(const sub of subs||[]){
    const {data:claimed,error:ce}=await db.rpc('fv_claim_cutoff_push',{p_attempt:event.id,p_subscription:sub.id});
    if(ce)throw ce;if(!claimed)continue;
    let accepted=false;
    try{
     await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth_key}},payload,{TTL:300,urgency:'high'});
     accepted=true;sent++;
     const {error}=await db.from('fv_cutoff_push_receipts').update({state:'sent',sent_at:new Date().toISOString(),detail:null}).eq('attempt_id',event.id).eq('subscription_id',sub.id);
     if(error)throw error;
    }catch(error:any){
     failed++;const status=Number(error?.statusCode)||0;
     // Never replay an accepted or ambiguous delivery. Retry explicit transient rejections only.
     const retry=!accepted&&(status===429||status>=500);
     const {error:recordError}=await db.from('fv_cutoff_push_receipts').update({state:retry?'retry':'failed',retry_after:retry?new Date(Date.now()+300000).toISOString():null,detail:accepted?'Push accepted; receipt update failed':status?'Push provider HTTP '+status:'Delivery uncertain; automatic retry suppressed'}).eq('attempt_id',event.id).eq('subscription_id',sub.id);
     if(recordError)console.error('Could not record cutoff push outcome');
     if(status===404||status===410)await db.from('push_subscriptions').update({is_active:false,updated_at:new Date().toISOString()}).eq('id',sub.id);
    }
   }
  }
  return json({ok:true,attempts:events?.length||0,sent,failed});
 }catch(error:any){console.error('Food cutoff dispatch failed:',error?.message||'Unknown error');return json({error:'Food cutoff dispatch failed'},500)}
});
