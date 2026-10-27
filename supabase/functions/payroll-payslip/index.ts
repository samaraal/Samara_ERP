// ERP 2.18.179 — Payroll payslip: PDF + WhatsApp to the employee (Admin / Directors only).
// Actions (POST JSON, ERP sign-in):
//   pdf   {payroll_id}  -> application/pdf (download / print)
//   send  {payroll_id}  -> WhatsApp template samara_payslip (DOCUMENT header = the payslip PDF) to the employee's mobile;
//                          until Meta approves the template, the PDF is sent as a direct document (works only if the
//                          employee wrote to Samara in the last 24 hours) — otherwise a clear error is returned.
//   create_template {}  -> submits template samara_payslip (UTILITY) to Meta once.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,'Content-Type':'application/json'}});
const env=(n:string)=>Deno.env.get(n)||'';
const admin=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
const TEMPLATE='samara_payslip';
const TEMPLATE_NOT_READY=[132000,132001,132005,132007,132012,132015,132016];
const GRAPH='https://graph.facebook.com/v25.0';
const inr=(n:any)=>Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const dmy=(d:any)=>{const s=String(d||'').slice(0,10);return s?s.split('-').reverse().join('-'):'—'};
const monthName=(d:any)=>new Date(String(d).slice(0,10)+'T00:00:00Z').toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'});
const days=(n:any)=>{const v=Number(n||0);return Number.isInteger(v)?String(v):v.toFixed(1)};
function words(n:number){
  const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'],b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const two=(x:number)=>x<20?a[x]:b[Math.floor(x/10)]+(x%10?' '+a[x%10]:''),three=(x:number)=>(x>=100?a[Math.floor(x/100)]+' Hundred'+(x%100?' ':''):'')+(x%100?two(x%100):'');
  const w=(x:number):string=>{if(!x)return 'Zero';let o='';const cr=Math.floor(x/1e7),l=Math.floor(x/1e5)%100,t=Math.floor(x/1e3)%100,h=x%1000;if(cr)o+=w(cr)+' Crore ';if(l)o+=two(l)+' Lakh ';if(t)o+=two(t)+' Thousand ';if(h)o+=three(h);return o.trim();};
  const r=Math.floor(Math.round(n*100)/100),p=Math.round(n*100)%100;return 'Rupees '+w(r)+(p?' and '+two(p)+' Paise':'')+' Only';
}
async function requireAdmin(req:Request){
  const jwt=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');if(!jwt)throw new Error('ERP sign-in required.');
  const {data,error}=await admin.auth.getUser(jwt);if(error||!data.user)throw new Error('ERP session is invalid.');
  const {data:p}=await admin.from('profiles').select('id,role,is_active,full_name').or(`id.eq.${data.user.id},auth_user_id.eq.${data.user.id}`).limit(1).maybeSingle();
  if(!p||p.is_active===false||p.role!=='Admin')throw new Error('Payroll is available to Admin / Directors only.');
  return p;
}
async function payslipPdf(r:any,emp:any){
  const pdf=await PDFDocument.create(),page=pdf.addPage([595.28,841.89]),R=await pdf.embedFont(StandardFonts.Helvetica),B=await pdf.embedFont(StandardFonts.HelveticaBold);
  const W=595.28,M=46,mag=rgb(0.698,0.043,0.365),ink=rgb(0.2,0.11,0.16),grey=rgb(0.43,0.35,0.39),line=rgb(0.93,0.8,0.86),pink=rgb(1,0.965,0.98);
  const clean=(t:any)=>String(t??'').replace(/[–—]/g,'-').replace(/₹/g,'INR ').replace(/[^\x20-\xFF]/g,'');
  const T=(t:any,x:number,y:number,s=10,f=R,c=ink)=>page.drawText(clean(t),{x,y,size:s,font:f,color:c});
  const right=(t:any,x:number,y:number,s=10,f=R,c=ink)=>T(t,x-f.widthOfTextAtSize(clean(t),s),y,s,f,c);
  let y=800;
  try{const res=await fetch('https://app.samaraassistedliving.com/assets/samara-logo.png');if(!res.ok)throw 0;const img=await pdf.embedPng(new Uint8Array(await res.arrayBuffer()));const s=Math.min(110/img.width,58/img.height);page.drawImage(img,{x:M,y:y-50,width:img.width*s,height:img.height*s});}catch{T('Samara',M,y-30,22,B,mag);}
  right('SAMARA HEALTH CARE LLP',W-M,y-18,13,B,mag);right('Samara Assisted Living - Centre for Nursing Excellence',W-M,y-32,8.5,R,grey);
  y-=66;page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:1.6,color:mag});
  y-=30;const title='PAYSLIP - '+monthName(r.month).toUpperCase();T(title,W/2-B.widthOfTextAtSize(clean(title),15)/2,y,15,B,ink);
  y-=24;page.drawRectangle({x:M,y:y-58,width:W-2*M,height:68,color:pink,borderColor:line,borderWidth:1});
  const info=[['Employee',r.employee_name||emp?.full_name||''],['Designation',r.designation||''],['Employee ID',emp?.employee_id||'-'],['Paid on',dmy(r.paid_on)+(r.paid_mode?'  ('+r.paid_mode+')':'')]];
  info.forEach(([k,v],i)=>{const col=i%2,row=Math.floor(i/2);const x=M+12+col*((W-2*M)/2),yy=y-8-row*26;T(k,x,yy,8.5,R,grey);T(v,x,yy-12,10,B);});
  y-=84;T('ATTENDANCE (30-day month)',M,y,10,B,mag);
  y-=8;const att=[['Monthly salary','INR '+inr(r.monthly_salary)],['Per-day rate (salary / 30)','INR '+inr(r.per_day)],['Days worked',days(r.days_worked)],['Weekly offs (paid, max 4)',days(Math.min(Number(r.weekly_offs),4))],
    ['Casual leave: opening '+days(r.cl_opening)+' + credit '+days(r.cl_credit)+', taken '+days(r.cl_used),'paid '+days(r.cl_paid)+' / balance '+days(r.cl_closing)],['Other leave (unpaid)',days(r.other_leave)],['Paid days',days(r.paid_days)+' / 30'],['Loss of pay days',days(r.lop_days)]];
  att.forEach(([k,v],i)=>{const yy=y-14-i*16;T(k,M+4,yy,9.5);right(v,W-M-4,yy,9.5,B);});
  y-=14+att.length*16+12;page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:.6,color:line});
  const colW=(W-2*M)/2-10;y-=20;T('EARNINGS',M,y,10,B,mag);T('DEDUCTIONS',M+colW+20,y,10,B,mag);
  const earn=[['Salary for paid days',r.earned],['Overtime',r.overtime],['Incentives',r.incentives],['Other earnings',r.other_earnings]].filter((x,i)=>i===0||Number(x[1])>0);
  const ded=[['Advance recovered',r.advance_deduction],['Other deductions',r.other_deduction]].filter(x=>Number(x[1])>0);
  const n=Math.max(earn.length,ded.length,1);
  for(let i=0;i<n;i++){const yy=y-16-i*16;if(earn[i]){T(earn[i][0],M+4,yy,9.5);right('INR '+inr(earn[i][1]),M+colW,yy,9.5,B);}if(ded[i]){T(ded[i][0],M+colW+24,yy,9.5);right('INR '+inr(ded[i][1]),W-M-4,yy,9.5,B);}else if(i===0){T('None',M+colW+24,yy,9.5,R,grey);}}
  y-=16+n*16+4;
  const ge=earn.reduce((t,x)=>t+Number(x[1]||0),0),gd=ded.reduce((t,x)=>t+Number(x[1]||0),0);
  page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:.6,color:line});y-=14;
  T('Total earnings',M+4,y,9.5,B);right('INR '+inr(ge),M+colW,y,9.5,B);T('Total deductions',M+colW+24,y,9.5,B);right('INR '+inr(gd),W-M-4,y,9.5,B);
  const notes=[r.earnings_note?'Earnings note: '+r.earnings_note:'',r.deduction_note?'Deductions note: '+r.deduction_note:''].filter(Boolean);
  notes.forEach(t=>{y-=14;T(String(t).slice(0,110),M+4,y,8.5,R,grey);});
  y-=30;page.drawRectangle({x:M,y:y-40,width:W-2*M,height:52,color:mag});
  T('NET PAY',M+14,y-6,10,R,rgb(1,1,1));T('INR '+inr(r.net_pay),M+14,y-30,20,B,rgb(1,1,1));
  y-=60;T(words(Number(r.net_pay)),M,y,10,B);
  y-=40;T('This is a computer-generated payslip and needs no signature.',M,y,8.5,R,grey);
  page.drawLine({start:{x:M,y:62},end:{x:W-M,y:62},thickness:.6,color:line});
  T('RBK VILLA, 23-A, Reddipalayam Road, Jeswant Nagar Phase 1, Mogappair West, Chennai 600037',M,48,7.6,R,grey);
  T('9976735577 / 7395961616  -  care@samaraassistedliving.com  -  Samara Assisted Living',M,36,7.6,B,mag);
  return await pdf.save();
}
async function waSend(payload:any){
  const r=await fetch(`${GRAPH}/${env('WHATSAPP_PHONE_NUMBER_ID')}/messages`,{method:'POST',headers:{Authorization:`Bearer ${env('WHATSAPP_ACCESS_TOKEN')}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const j:any=await r.json().catch(()=>({}));return {ok:r.ok&&!!j?.messages?.[0]?.id,id:j?.messages?.[0]?.id,code:Number(j?.error?.code||0),error:String(j?.error?.error_user_msg||j?.error?.message||'')};
}
async function load(id:string){
  const {data:r,error}=await admin.from('samara_payroll').select('*').eq('id',id).is('voided_at',null).maybeSingle();
  if(error)throw error;if(!r)throw new Error('Saved salary not found (or it was voided).');
  const {data:emp}=await admin.from('profiles').select('id,full_name,title,employee_id,mobile').eq('id',r.employee_id).maybeSingle();
  return {r,emp};
}
async function createTemplate(){
  const waba=env('WHATSAPP_BUSINESS_ACCOUNT_ID'),token=env('WHATSAPP_ACCESS_TOKEN');if(!waba||!token)throw new Error('WhatsApp is not configured.');
  // sample PDF for the DOCUMENT header example (Meta resumable upload)
  const sample=await payslipPdf({month:'2026-10-01',employee_name:'Sample Employee',designation:'Staff Nurse',paid_on:'2026-10-31',paid_mode:'Bank Transfer',monthly_salary:15000,per_day:500,days_worked:26,weekly_offs:4,cl_opening:0,cl_credit:1,cl_used:0,cl_paid:0,cl_closing:1,other_leave:0,paid_days:30,lop_days:0,earned:15000,overtime:0,incentives:0,other_earnings:0,advance_deduction:0,other_deduction:0,net_pay:15000},{employee_id:'SAMPLE'});
  const app:any=await fetch(`${GRAPH}/app?access_token=${encodeURIComponent(token)}`).then(r=>r.json());
  if(!app?.id)throw new Error('Could not find the WhatsApp app id: '+JSON.stringify(app?.error||app).slice(0,200));
  const sess:any=await fetch(`${GRAPH}/${app.id}/uploads?file_name=payslip-sample.pdf&file_length=${sample.length}&file_type=application/pdf&access_token=${encodeURIComponent(token)}`,{method:'POST'}).then(r=>r.json());
  if(!sess?.id)throw new Error('Upload session failed: '+JSON.stringify(sess?.error||sess).slice(0,200));
  const up:any=await fetch(`${GRAPH}/${sess.id}`,{method:'POST',headers:{Authorization:`OAuth ${token}`,file_offset:'0'},body:sample}).then(r=>r.json());
  if(!up?.h)throw new Error('Sample upload failed: '+JSON.stringify(up?.error||up).slice(0,200));
  const body={name:TEMPLATE,language:'en',category:'UTILITY',components:[
    {type:'HEADER',format:'DOCUMENT',example:{header_handle:[up.h]}},
    {type:'BODY',text:'Dear {{1}},\n\nYour salary payslip for {{2}} is attached.\nNet pay: Rs. {{3}}, paid on {{4}}.\n\nFor any query, please contact the Samara office.',example:{body_text:[['Saranya','October 2026','15,000.00','31-10-2026']]}},
    {type:'FOOTER',text:'Samara Assisted Living'}]};
  const r=await fetch(`${GRAPH}/${waba}/message_templates`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j:any=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error('Meta did not accept the template: '+String(j?.error?.error_user_msg||j?.error?.message||r.status));
  return {template_id:j.id,status:j.status};
}
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  try{
    const staff=await requireAdmin(req);
    const body:any=await req.json().catch(()=>({}));
    if(body.action==='create_template')return json({success:true,...await createTemplate()});
    const {r,emp}=await load(String(body.payroll_id||''));
    const bytes=await payslipPdf(r,emp);
    const filename=`Samara-Payslip-${String(r.employee_name||'Employee').replace(/[^A-Za-z0-9]+/g,'-')}-${String(r.month).slice(0,7)}.pdf`;
    if(body.action==='pdf')return new Response(bytes,{headers:{...cors,'Content-Type':'application/pdf','Content-Disposition':`inline; filename="${filename}"`}});
    if(body.action!=='send')return json({success:false,error:'Unknown action.'},400);
    let to=String(emp?.mobile||'').replace(/\D/g,'');if(to.length===10)to='91'+to;
    if(!/^\d{11,15}$/.test(to)){await admin.from('samara_payroll').update({payslip_error:'No valid mobile number in HR.'}).eq('id',r.id);return json({success:false,error:'No valid mobile number for this employee in HR.'})}
    const form=new FormData();form.append('messaging_product','whatsapp');form.append('type','application/pdf');form.append('file',new Blob([bytes as any],{type:'application/pdf'}),filename);
    const upr=await fetch(`${GRAPH}/${env('WHATSAPP_PHONE_NUMBER_ID')}/media`,{method:'POST',headers:{Authorization:`Bearer ${env('WHATSAPP_ACCESS_TOKEN')}`},body:form});const uj:any=await upr.json().catch(()=>({}));
    if(!upr.ok||!uj.id)throw new Error('Payslip PDF could not be uploaded to WhatsApp.');
    let storedPath:string|null=null;try{const path=`outgoing/payslips/${r.id}/${filename}`;const st=await admin.storage.from('whatsapp-media').upload(path,bytes,{contentType:'application/pdf',upsert:true});if(!st.error)storedPath=path;}catch{}
    const first=String(r.employee_name||'').replace(/^(Mr|Mrs|Ms|Miss|Dr)\.?\s+/i,'').split(' ')[0]||'Team member';
    const values=[first,monthName(r.month),inr(r.net_pay),dmy(r.paid_on)];
    let sent=await waSend({messaging_product:'whatsapp',recipient_type:'individual',to,type:'template',template:{name:TEMPLATE,language:{code:'en'},components:[{type:'header',parameters:[{type:'document',document:{id:uj.id,filename}}]},{type:'body',parameters:values.map(text=>({type:'text',text}))}]}});
    let route='Payslip (template)';
    if(!sent.ok&&TEMPLATE_NOT_READY.includes(sent.code)){
      sent=await waSend({messaging_product:'whatsapp',recipient_type:'individual',to,type:'document',document:{id:uj.id,filename,caption:`Dear ${values[0]}, your Samara payslip for ${values[1]} — Net pay Rs. ${values[2]}, paid on ${values[3]}.`}});
      route='Payslip (direct document)';
      if(!sent.ok)sent.error='The payslip WhatsApp template is waiting for Meta approval, and the employee has not messaged Samara in the last 24 hours. Download the PDF and share it, or try again after approval.';
    }
    if(!sent.ok){await admin.from('samara_payroll').update({payslip_error:sent.error.slice(0,300)}).eq('id',r.id);return json({success:false,error:sent.error||'WhatsApp did not accept the payslip.'})}
    const now=new Date().toISOString();
    await admin.from('samara_payroll').update({payslip_sent_at:now,payslip_sent_to:to,payslip_error:null}).eq('id',r.id);
    await admin.from('hr_whatsapp_communications').upsert({recipient_number:to,template_name:TEMPLATE,communication_type:'Payslip · '+monthName(r.month),direction:'outbound',message_type:route.includes('template')?'template':'document',status:'Accepted',provider_message_id:sent.id,
      message_content:`Dear ${values[0]},\n\nYour salary payslip for ${values[1]} is attached.\nNet pay: Rs. ${values[2]}, paid on ${values[3]}.`,
      message_payload:{payroll_id:r.id,employee_id:r.employee_id,body_params:values,route,...(storedPath?{_samara_media:{bucket:'whatsapp-media',path:storedPath,filename,mime_type:'application/pdf',size:bytes.length,meta_media_id:uj.id}}:{})},
      contact_name:r.employee_name,source_type:'HR',sent_by:staff.id,sent_at:now,created_at:now,updated_at:now},{onConflict:'provider_message_id',ignoreDuplicates:true});
    return json({success:true,route,to});
  }catch(e){return json({success:false,error:String((e as any)?.message||e)},200)}
});
