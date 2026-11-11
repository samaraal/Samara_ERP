// ERP 2.20.9 — HR letters: PDF + WhatsApp to the employee (Admin / Directors only).
// Letter rows live in public.hr_letters (SQL 370); this function only renders and sends them.
// Actions (POST JSON, ERP sign-in):
//   pdf   {letter_id}  -> application/pdf (view / print / download)
//   send  {letter_id}  -> WhatsApp template samara_hr_letter (DOCUMENT header = the letter PDF) to the employee's mobile;
//                         until Meta approves the template, the PDF goes as a direct document (works only if the
//                         employee messaged Samara in the last 24 hours) — otherwise a clear error is returned.
//   create_template {} -> submits template samara_hr_letter (UTILITY) to Meta once.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const json=(b:any,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,'Content-Type':'application/json'}});
const env=(n:string)=>Deno.env.get(n)||'';
const admin=createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false}});
const TEMPLATE='samara_hr_letter';
const TEMPLATE_NOT_READY=[132000,132001,132005,132007,132012,132015,132016];
const GRAPH='https://graph.facebook.com/v25.0';
const inr=(n:any)=>Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const dmy=(d:any)=>{const s=String(d||'').slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s.split('-').reverse().join('-'):'-'};
const mon=(n:any)=>{const v=Number(n||0);return v===1?'1 (one) month':`${v} (${['zero','one','two','three','four','five','six'][v]||v}) months`};
function words(n:number){
  const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'],b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  const two=(x:number)=>x<20?a[x]:b[Math.floor(x/10)]+(x%10?' '+a[x%10]:''),three=(x:number)=>(x>=100?a[Math.floor(x/100)]+' Hundred'+(x%100?' ':''):'')+(x%100?two(x%100):'');
  const w=(x:number):string=>{if(!x)return 'Zero';let o='';const cr=Math.floor(x/1e7),l=Math.floor(x/1e5)%100,t=Math.floor(x/1e3)%100,h=x%1000;if(cr)o+=w(cr)+' Crore ';if(l)o+=two(l)+' Lakh ';if(t)o+=two(t)+' Thousand ';if(h)o+=three(h);return o.trim();};
  const neg=n<0;n=Math.abs(n);const r=Math.floor(Math.round(n*100)/100),p=Math.round(n*100)%100;return (neg?'Minus ':'')+'Rupees '+w(r)+(p?' and '+two(p)+' Paise':'')+' Only';
}
async function requireAdmin(req:Request){
  const jwt=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');if(!jwt)throw new Error('ERP sign-in required.');
  const {data,error}=await admin.auth.getUser(jwt);if(error||!data.user)throw new Error('ERP session is invalid.');
  const {data:p}=await admin.from('profiles').select('id,role,is_active,full_name').or(`id.eq.${data.user.id},auth_user_id.eq.${data.user.id}`).limit(1).maybeSingle();
  if(!p||p.is_active===false||p.role!=='Admin')throw new Error('HR letters are available to Admin / Directors only.');
  return p;
}

// ---------- letter wording ----------
type Block={kind:'p'|'h'|'li'|'table'|'gap'|'box',text?:string,rows?:[string,string][],bold?:boolean};
function letterBody(type:string,d:any):{subject:string,blocks:Block[],sign:'issuer'|'issuer+accept'|'issuer+ack'}{
  const P=(text:string):Block=>({kind:'p',text}),L=(text:string):Block=>({kind:'li',text}),H=(text:string):Block=>({kind:'h',text});
  const name=d.name||'the employee',desig=d.designation||'-',dept=d.department||'-';
  const pm=Number(d.notice_probation_months??1),cm=Number(d.notice_confirmed_months??2);
  switch(type){
    case 'Appointment Letter': return {subject:`Appointment as ${desig}`,sign:'issuer+accept',blocks:[
      P(`Dear ${name},`),
      P(`With reference to your application and the interview held with us, we are pleased to appoint you as ${desig} in the ${dept} department of Samara Assisted Living, run by Samara Health Care LLP, on the following terms and conditions:`),
      L(`Date of joining: ${dmy(d.date_of_joining)}. Employee ID: ${d.employee_id||'-'}. Place of work: Samara Assisted Living, Mogappair West, Chennai, or any other Samara centre as required.`),
      L(`Salary: Rs. ${inr(d.salary)} per month (${words(Number(d.salary||0))}), paid monthly. Salary is worked out on a 30-day month from the Duty Roster: days worked, paid weekly offs and approved leave. Unauthorised absence is loss of pay.`),
      L(`Probation: you will be on probation for ${mon(d.probation_months??3)}, up to ${dmy(d.probation_end)}. Samara may extend the probation in writing. You become a confirmed (permanent) employee only on receiving a written Confirmation Letter.`),
      L(`Notice period: during probation, either party may end this employment by giving ${mon(pm)} notice in writing, or salary for the notice period in lieu of notice. After confirmation, the notice period is ${mon(cm)} on either side, or salary in lieu of notice. Samara may, at its discretion, waive or shorten the notice period.`),
      L(`Working hours: shifts of 12 hours - Day 7:00 to 19:00 and Night 19:00 to 7:00 - as per the Duty Roster. You are entitled to 4 paid weekly offs and 1 casual leave per month, and 2 permissions per month of not more than 2 hours each; leave and permissions are applied for and approved in the Samara ERP.`),
      L(`Duties: you will care for Samara's Guests as per Samara's care protocols and the instructions of your superiors, record your work truthfully in the Samara ERP (including bedside entries), and carry out any other duty reasonably assigned to you.`),
      L(`Confidentiality: all information about Guests and their families - health records, photographs, personal and financial details - is strictly confidential. You shall not share it with anyone outside Samara or post it on social media, during or after your employment.`),
      L(`Conduct: you shall treat every Guest with dignity and respect. Abuse or neglect of a Guest, theft, being under the influence of alcohol or drugs on duty, falsifying records, or absence without intimation are serious misconduct and may lead to disciplinary action, including termination, after you are given a show-cause notice and an opportunity to explain.`),
      L(`Absence without intimation: if you remain absent without informing Samara, you will be sent a notice to report for duty. If you do not report by the date given, you will be treated as having voluntarily abandoned your employment.`),
      L(`On leaving: you shall hand over your duties and return the ID card, uniform, keys and any Samara property. Your final wages will be settled within the time required by law.`),
      L(`This appointment is based on the documents and information given by you. If any of it is found to be false, this appointment may be cancelled.`),
      P(`Please sign the duplicate copy of this letter as a token of your acceptance. We welcome you to the Samara family and wish you a rewarding career with us.`)]};
    case 'Confirmation Letter': return {subject:'Confirmation of employment',sign:'issuer',blocks:[
      P(`Dear ${name},`),
      P(`We are pleased to inform you that, on successful completion of your probation, you are confirmed as a permanent employee of Samara Health Care LLP in the post of ${desig}, ${dept} department, with effect from ${dmy(d.confirmed_on)}.`),
      ...(Number(d.revised_salary)>0?[P(`Your salary with effect from ${dmy(d.confirmed_on)} will be Rs. ${inr(d.revised_salary)} per month (${words(Number(d.revised_salary))}).`)]:[]),
      P(`From the date of confirmation, the notice period on either side is ${mon(cm)}, or salary in lieu of notice. All other terms and conditions of your appointment letter remain unchanged.`),
      P(`We appreciate your work and commitment to our Guests, and look forward to your continued contribution.`)]};
    case 'Resignation Acceptance Letter': return {subject:'Acceptance of resignation',sign:'issuer',blocks:[
      P(`Dear ${name},`),
      P(`We acknowledge receipt of your resignation dated ${dmy(d.resignation_received_on)} from the post of ${desig}. Your resignation is accepted.`),
      d.notice_waived?P(`Samara has waived the notice period. Your last working day will be ${dmy(d.last_working_day)}.`)
        :P(`As per your terms of employment (${d.on_probation?'on probation':'confirmed employee'}), the notice period is ${mon(d.notice_months)}. Your last working day will be ${dmy(d.last_working_day)}.`),
      P(`Until then, please continue your duties as per the Duty Roster, complete the handover of your Guests' care, records and pending ERP entries to your superior, and return the ID card, uniform, keys and any Samara property on or before your last working day.`),
      P(`Your full and final settlement will be paid within the time required by law after your last working day, and your Relieving & Experience Letter will be issued on completion of the handover.`),
      P(`We thank you for your service to Samara and wish you all the best.`)]};
    case 'Show Cause Notice': return {subject:'Show cause notice',sign:'issuer+ack',blocks:[
      P(`Dear ${name},`),
      P(`It has been reported / observed that:`),
      {kind:'box',text:d.allegation||'-'},
      P(`This, if proved, amounts to misconduct under your terms of employment.`),
      P(`You are hereby directed to explain in writing, on or before ${dmy(d.reply_by)}, why disciplinary action, which may include termination of your employment, should not be taken against you. You may also meet the undersigned in person to explain.`),
      P(`If no reply is received by that date, it will be presumed that you have no explanation to offer, and Samara will decide the matter on the basis of the records available.`)]};
    case 'Termination Letter': return {subject:'Termination of employment',sign:'issuer',blocks:[
      P(`Dear ${name},`),
      P(`A show-cause notice dated ${dmy(d.show_cause_issued_on)} was issued to you regarding: ${d.allegation||'-'}.`),
      d.reply_received_on?P(`Your reply dated ${dmy(d.reply_received_on)} was received and carefully considered, but it was not found satisfactory.`):P(`No reply was received from you within the time given.`),
      P(`Reason for this decision: ${d.termination_reason||'-'}`),
      P(`Your services with Samara Health Care LLP are therefore terminated with effect from the close of ${dmy(d.last_working_day)}. Your ERP login will be closed from that date.`),
      P(`Please hand over your duties and return the ID card, uniform, keys and any Samara property immediately. Your full and final settlement will be paid within the time required by law.`)]};
    case 'Report to Duty Notice': return {subject:'Absence without intimation - notice to report for duty',sign:'issuer',blocks:[
      P(`Dear ${name},`),
      P(`You have been absent from duty from ${dmy(d.absent_from)} without any intimation or approved leave. Attempts to contact you have not been successful.`),
      P(`You are hereby directed to report for duty on or before ${dmy(d.report_by)} and to explain your absence in writing.`),
      P(`If you do not report by that date, it will be presumed that you are not interested in continuing your employment, and you will be treated as having voluntarily abandoned your service with Samara, without further notice.`)]};
    case 'Abandonment of Service Letter': return {subject:'Abandonment of service',sign:'issuer',blocks:[
      P(`Dear ${name},`),
      P(`You have remained absent from duty from ${dmy(d.absent_from)} without intimation. A notice dated ${dmy(d.report_notice_date)} directed you to report for duty on or before ${dmy(d.report_by)}, but you have neither reported nor given any explanation.`),
      P(`You are therefore treated as having voluntarily abandoned your employment with Samara Health Care LLP, and your name is removed from the rolls with effect from ${dmy(d.last_working_day)}. Your ERP login has been closed.`),
      P(`Please return the ID card, uniform, keys and any Samara property. Your final wages due, after adjustment as per your terms of employment, will be paid by bank transfer / can be collected from the Samara office.`)]};
    case 'Relieving & Experience Letter': return {subject:'Relieving and experience letter',sign:'issuer',blocks:[
      P(`TO WHOMSOEVER IT MAY CONCERN`),
      P(`This is to certify that ${name} (Employee ID ${d.employee_id||'-'}) was employed with Samara Health Care LLP, Samara Assisted Living, Chennai, as ${desig} in the ${dept} department from ${dmy(d.date_of_joining)} to ${dmy(d.last_working_day)}.`),
      P(`${name} has been relieved from the services of Samara at the close of working hours on ${dmy(d.last_working_day)}${d.exit_reason?`, ${d.exit_reason}`:''}.`),
      ...(d.conduct_line?[P(`During the period of employment, the conduct and work were found to be ${d.conduct_line}.`)]:[]),
      P(`We wish ${name} success in all future endeavours.`)]};
    case 'Full & Final Settlement Statement':{
      const f=d.fnf||{};const e:[string,string][]=[],x:[string,string][]=[];
      e.push([`Wages for ${f.days??'-'} paid day(s) of the final period @ Rs. ${inr(f.per_day)} per day`,inr(f.earned_wages)]);
      if(Number(f.leave_encashment)>0)e.push(['Leave encashment',inr(f.leave_encashment)]);
      if(Number(f.other_earnings)>0)e.push([`Other earnings${f.other_earnings_note?' ('+f.other_earnings_note+')':''}`,inr(f.other_earnings)]);
      if(Number(f.notice_recovery)>0)x.push([`Notice period shortfall: ${f.shortfall_days} day(s) @ Rs. ${inr(f.per_day)}`,inr(f.notice_recovery)]);
      if(Number(f.advance_recovery)>0)x.push(['Salary advance recovered',inr(f.advance_recovery)]);
      if(Number(f.other_deductions)>0)x.push([`Other deductions${f.other_deductions_note?' ('+f.other_deductions_note+')':''}`,inr(f.other_deductions)]);
      const te=e.reduce((t,r)=>t+Number(String(r[1]).replace(/,/g,'')),0),tx=x.reduce((t,r)=>t+Number(String(r[1]).replace(/,/g,'')),0),net=te-tx;
      return {subject:'Full and final settlement statement',sign:'issuer+ack',blocks:[
        P(`Name: ${name}   |   Employee ID: ${d.employee_id||'-'}   |   Designation: ${desig}`),
        P(`Date of joining: ${dmy(d.date_of_joining)}   |   Last working day: ${dmy(d.last_working_day)}   |   Exit: ${d.exit_type||'-'}`),
        H('EARNINGS'),{kind:'table',rows:e},{kind:'table',rows:[['Total earnings',inr(te)]],bold:true},
        H('DEDUCTIONS'),{kind:'table',rows:x.length?x:[['None','0.00']]},{kind:'table',rows:[['Total deductions',inr(tx)]],bold:true},
        {kind:'gap'},{kind:'table',rows:[[net>=0?'NET AMOUNT PAYABLE TO THE EMPLOYEE':'NET AMOUNT RECOVERABLE FROM THE EMPLOYEE',inr(Math.abs(net))]],bold:true},
        P(words(Math.abs(net))),
        ...(f.notes?[P(`Notes: ${f.notes}`)]:[]),
        f.paid_on?P(`Paid on ${dmy(f.paid_on)}${f.paid_mode?' by '+f.paid_mode:''}.`):P(`Payable on or before ${dmy(f.pay_by)}.`)]};}
    case 'Suspension Order': return {subject:'Suspension pending enquiry',sign:'issuer+ack',blocks:[
      P(`Dear ${name},`),
      P(`It has been reported that: ${d.allegation||'-'}`),
      P(`Pending enquiry into this matter, you are placed under suspension with effect from ${dmy(d.effective_date)}. During suspension you shall not report for duty or enter the Guest areas without permission, and your ERP login is closed.`),
      P(`You will be paid subsistence allowance during the period of suspension as per law. You shall make yourself available for the enquiry whenever called, and shall not leave the station without permission.`)]};
  }
  return {subject:type,sign:'issuer',blocks:[P(`Dear ${name},`),P(d.body||'')]};
}

async function letterPdf(L:any){
  const d=L.data||{};const {subject,blocks,sign}=letterBody(L.letter_type,d);
  const pdf=await PDFDocument.create(),R=await pdf.embedFont(StandardFonts.Helvetica),B=await pdf.embedFont(StandardFonts.HelveticaBold);
  const W=595.28,H=841.89,M=56,mag=rgb(0.698,0.043,0.365),ink=rgb(0.13,0.09,0.11),grey=rgb(0.43,0.35,0.39),line=rgb(0.93,0.8,0.86),pink=rgb(1,0.965,0.98);
  const clean=(t:any)=>String(t??'').replace(/[–—]/g,'-').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/₹/g,'Rs. ').replace(/[^\x20-\xFF]/g,'');
  let logo:any=null;try{const res=await fetch('https://app.samaraassistedliving.com/assets/samara-logo.png');if(res.ok)logo=await pdf.embedPng(new Uint8Array(await res.arrayBuffer()));}catch{}
  let page:any,y=0;
  const T=(t:any,x:number,yy:number,s=10.5,f=R,c=ink)=>page.drawText(clean(t),{x,y:yy,size:s,font:f,color:c});
  const right=(t:any,x:number,yy:number,s=10,f=R,c=ink)=>T(t,x-f.widthOfTextAtSize(clean(t),s),yy,s,f,c);
  const footer=()=>{page.drawLine({start:{x:M,y:58},end:{x:W-M,y:58},thickness:.6,color:line});
    T('Samara Health Care LLP - RBK VILLA, 23-A, Reddipalayam Road, Jeswant Nagar Phase 1, Mogappair West, Chennai 600037',M,45,7.4,R,grey);
    T('9976735577 / 7395961616  -  care@samaraassistedliving.com  -  www.samaraassistedliving.com',M,34,7.4,B,mag);
    right(`Ref: ${L.ref_no||'-'}  -  Page ${pdf.getPageCount()}`,W-M,22,7,R,grey);};
  const newPage=(first:boolean)=>{page=pdf.addPage([W,H]);y=H-44;
    if(logo){const s=Math.min((first?120:80)/logo.width,(first?60:40)/logo.height);page.drawImage(logo,{x:M,y:y-logo.height*s,width:logo.width*s,height:logo.height*s});}else T('Samara',M,y-26,22,B,mag);
    right('SAMARA HEALTH CARE LLP',W-M,y-16,13,B,mag);right('Samara Assisted Living - Centre for Nursing Excellence',W-M,y-30,8.5,R,grey);
    y-=first?72:52;page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:1.6,color:mag});y-=22;footer();};
  const need=(h:number)=>{if(y-h<80)newPage(false);};
  const wrap=(t:string,f:any,s:number,w:number)=>{const out:string[]=[];for(const para of clean(t).split('\n')){let cur='';for(const word of para.split(/\s+/)){const nx=cur?cur+' '+word:word;if(f.widthOfTextAtSize(nx,s)>w&&cur){out.push(cur);cur=word;}else cur=nx;}out.push(cur);}return out;};
  newPage(true);
  T(`Ref: ${L.ref_no||'-'}`,M,y,10,B);right(`Date: ${dmy(L.letter_date)}`,W-M,y,10,B);y-=26;
  const toAddr=L.letter_type!=='Relieving & Experience Letter';
  if(toAddr){T('To,',M,y);y-=14;T(d.name||'',M,y,10.5,B);y-=13;
    for(const ln of [d.designation?`${d.designation}${d.employee_id?' (Employee ID '+d.employee_id+')':''}`:'',...wrap(d.address||'',R,9.5,280).slice(0,3)].filter(Boolean)){T(ln,M,y,9.5,R,grey);y-=12;}
    y-=12;}
  const subj=`Subject: ${subject}`;for(const ln of wrap(subj,B,11,W-2*M)){T(ln,M,y,11,B);y-=15;}y-=10;
  if(L.letter_type==='Full & Final Settlement Statement'||L.letter_type==='Relieving & Experience Letter'){const tt=L.letter_type.toUpperCase();T(tt,W/2-B.widthOfTextAtSize(tt,13)/2,y,13,B,mag);y-=24;}
  let li=0;const fs=10.5,lh=14.5;
  for(const b of blocks){
    if(b.kind==='gap'){y-=8;continue;}
    if(b.kind==='h'){need(30);y-=4;T(b.text,M,y,10,B,mag);y-=16;continue;}
    if(b.kind==='table'){for(const [k,v] of b.rows||[]){const ls=wrap(k,b.bold?B:R,10,W-2*M-120);need(ls.length*13+6);ls.forEach((t,i)=>{T(t,M+6,y-i*13,10,b.bold?B:R);});right(v,W-M-6,y,10,B);const ly=y-(ls.length-1)*13-6;page.drawLine({start:{x:M,y:ly},end:{x:W-M,y:ly},thickness:.4,color:line});y-=ls.length*13+9;}continue;}
    if(b.kind==='box'){const ls=wrap(b.text||'',R,fs,W-2*M-24);need(ls.length*lh+30);const top=y+4,bh=ls.length*lh+12;page.drawRectangle({x:M,y:top-bh,width:W-2*M,height:bh,color:pink,borderColor:line,borderWidth:1});ls.forEach((t,i)=>T(t,M+12,top-13-i*lh,fs));y=top-bh-16;continue;}
    if(b.kind==='li'){li++;const ls=wrap(b.text||'',R,fs,W-2*M-22);need(ls.length*lh+6);T(`${li}.`,M,y,fs,B);ls.forEach((t,i)=>T(t,M+20,y-i*lh,fs));y-=ls.length*lh+6;continue;}
    const ls=wrap(b.text||'',R,fs,W-2*M);need(ls.length*lh+8);ls.forEach((t,i)=>T(t,M,y-i*lh,fs));y-=ls.length*lh+8;
  }
  need(120);y-=14;
  T('For SAMARA HEALTH CARE LLP',M,y,10.5,B,mag);y-=48;
  T('Authorised Signatory',M,y,10,B);y-=13;if(d.issued_by){T(d.issued_by,M,y,9.5,R,grey);y-=12;}T(d.signatory_designation||'Director',M,y,9.5,R,grey);
  if(sign!=='issuer'){
    need(110);y-=30;page.drawLine({start:{x:M,y:y+12},end:{x:W-M,y:y+12},thickness:.6,color:line});
    T(sign==='issuer+accept'?'ACCEPTANCE BY THE EMPLOYEE':'ACKNOWLEDGEMENT BY THE EMPLOYEE',M,y-4,10,B,mag);y-=20;
    const txt=sign==='issuer+accept'?`I have read and understood the above terms and conditions and accept this appointment.`:`I have received this ${L.letter_type.toLowerCase()}.`;
    for(const ln of wrap(txt,R,10,W-2*M)){T(ln,M,y,10);y-=13;}y-=26;
    T('Signature: ______________________',M,y,10);right(`Name: ${d.name||''}`,W-M,y,10);y-=20;T('Date: ____________',M,y,10);
  }
  y-=24;need(20);T('This letter is issued from the Samara ERP. Please keep it for your records.',M,y,8,R,grey);
  return await pdf.save();
}

async function waSend(payload:any){
  const r=await fetch(`${GRAPH}/${env('WHATSAPP_PHONE_NUMBER_ID')}/messages`,{method:'POST',headers:{Authorization:`Bearer ${env('WHATSAPP_ACCESS_TOKEN')}`,'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const j:any=await r.json().catch(()=>({}));return {ok:r.ok&&!!j?.messages?.[0]?.id,id:j?.messages?.[0]?.id,code:Number(j?.error?.code||0),error:String(j?.error?.error_user_msg||j?.error?.message||'')};
}
async function load(id:string){
  const {data:L,error}=await admin.from('hr_letters').select('*').eq('id',id).maybeSingle();
  if(error)throw error;if(!L)throw new Error('Letter not found.');if(L.voided_at)throw new Error('This letter was voided.');
  const {data:emp}=await admin.from('profiles').select('id,full_name,title,employee_id,mobile').eq('id',L.employee_id).maybeSingle();
  return {L,emp};
}
async function createTemplate(){
  const waba=env('WHATSAPP_BUSINESS_ACCOUNT_ID'),token=env('WHATSAPP_ACCESS_TOKEN');if(!waba||!token)throw new Error('WhatsApp is not configured.');
  const sample=await letterPdf({letter_type:'Confirmation Letter',ref_no:'SAM/HR/2026-27/000',letter_date:'2026-11-11',data:{name:'Sample Employee',designation:'Staff Nurse',department:'Nursing',employee_id:'EMP-0000',confirmed_on:'2026-11-11',notice_confirmed_months:2,issued_by:'Director'}});
  const app:any=await fetch(`${GRAPH}/app?access_token=${encodeURIComponent(token)}`).then(r=>r.json());
  if(!app?.id)throw new Error('Could not find the WhatsApp app id: '+JSON.stringify(app?.error||app).slice(0,200));
  const sess:any=await fetch(`${GRAPH}/${app.id}/uploads?file_name=hr-letter-sample.pdf&file_length=${sample.length}&file_type=application/pdf&access_token=${encodeURIComponent(token)}`,{method:'POST'}).then(r=>r.json());
  if(!sess?.id)throw new Error('Upload session failed: '+JSON.stringify(sess?.error||sess).slice(0,200));
  const up:any=await fetch(`${GRAPH}/${sess.id}`,{method:'POST',headers:{Authorization:`OAuth ${token}`,file_offset:'0'},body:sample}).then(r=>r.json());
  if(!up?.h)throw new Error('Sample upload failed: '+JSON.stringify(up?.error||up).slice(0,200));
  const body={name:TEMPLATE,language:'en',category:'UTILITY',components:[
    {type:'HEADER',format:'DOCUMENT',example:{header_handle:[up.h]}},
    {type:'BODY',text:'Dear {{1}},\n\nPlease find attached your {{2}} from Samara Health Care LLP (Ref: {{3}}).\n\nFor any query, please contact the Samara HR office.',example:{body_text:[['Saranya','Confirmation Letter','SAM/HR/2026-27/001']]}},
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
    const {L,emp}=await load(String(body.letter_id||''));
    const bytes=await letterPdf(L);
    const filename=`Samara-${String(L.letter_type).replace(/[^A-Za-z0-9]+/g,'-')}-${String(L.data?.name||emp?.full_name||'Employee').replace(/[^A-Za-z0-9]+/g,'-')}.pdf`.replace(/-+/g,'-');
    if(body.action==='pdf')return new Response(bytes,{headers:{...cors,'Content-Type':'application/pdf','Content-Disposition':`inline; filename="${filename}"`}});
    if(body.action!=='send')return json({success:false,error:'Unknown action.'},400);
    let to=String(emp?.mobile||'').replace(/\D/g,'');if(to.length===10)to='91'+to;
    if(!/^\d{11,15}$/.test(to)){await admin.from('hr_letters').update({send_error:'No valid mobile number in HR.'}).eq('id',L.id);return json({success:false,error:'No valid mobile number for this employee in HR.'})}
    const form=new FormData();form.append('messaging_product','whatsapp');form.append('type','application/pdf');form.append('file',new Blob([bytes as any],{type:'application/pdf'}),filename);
    const upr=await fetch(`${GRAPH}/${env('WHATSAPP_PHONE_NUMBER_ID')}/media`,{method:'POST',headers:{Authorization:`Bearer ${env('WHATSAPP_ACCESS_TOKEN')}`},body:form});const uj:any=await upr.json().catch(()=>({}));
    if(!upr.ok||!uj.id)throw new Error('Letter PDF could not be uploaded to WhatsApp.');
    let storedPath:string|null=null;try{const path=`outgoing/hr-letters/${L.id}/${filename}`;const st=await admin.storage.from('whatsapp-media').upload(path,bytes,{contentType:'application/pdf',upsert:true});if(!st.error)storedPath=path;}catch{}
    const first=String(L.data?.name||emp?.full_name||'').replace(/^(Mr|Mrs|Ms|Miss|Dr)\.?\s+/i,'').split(' ')[0]||'Team member';
    const values=[first,String(L.letter_type),String(L.ref_no||'-')];
    let sent=await waSend({messaging_product:'whatsapp',recipient_type:'individual',to,type:'template',template:{name:TEMPLATE,language:{code:'en'},components:[{type:'header',parameters:[{type:'document',document:{id:uj.id,filename}}]},{type:'body',parameters:values.map(text=>({type:'text',text}))}]}});
    let route='HR letter (template)';
    if(!sent.ok&&TEMPLATE_NOT_READY.includes(sent.code)){
      sent=await waSend({messaging_product:'whatsapp',recipient_type:'individual',to,type:'document',document:{id:uj.id,filename,caption:`Dear ${values[0]}, please find attached your ${values[1]} from Samara Health Care LLP (Ref: ${values[2]}).`}});
      route='HR letter (direct document)';
      if(!sent.ok)sent.error='The HR letter WhatsApp template is waiting for Meta approval, and the employee has not messaged Samara in the last 24 hours. Download the PDF and share it, or press Send again after approval.';
    }
    if(!sent.ok){await admin.from('hr_letters').update({send_error:sent.error.slice(0,300)}).eq('id',L.id);return json({success:false,error:sent.error||'WhatsApp did not accept the letter.'})}
    const now=new Date().toISOString();
    await admin.from('hr_letters').update({sent_at:now,sent_to:to,send_route:route,send_error:null,pdf_path:storedPath}).eq('id',L.id);
    await admin.from('hr_whatsapp_communications').upsert({recipient_number:to,template_name:TEMPLATE,communication_type:`HR Letter · ${L.letter_type}`,direction:'outbound',message_type:route.includes('template')?'template':'document',status:'Accepted',provider_message_id:sent.id,
      message_content:`Dear ${values[0]},\n\nPlease find attached your ${values[1]} from Samara Health Care LLP (Ref: ${values[2]}).`,
      message_payload:{hr_letter_id:L.id,employee_id:L.employee_id,body_params:values,route,...(storedPath?{_samara_media:{bucket:'whatsapp-media',path:storedPath,filename,mime_type:'application/pdf',size:bytes.length,meta_media_id:uj.id}}:{})},
      contact_name:L.data?.name||emp?.full_name,source_type:'HR',sent_by:staff.id,sent_at:now,created_at:now,updated_at:now},{onConflict:'provider_message_id',ignoreDuplicates:true});
    return json({success:true,route,to});
  }catch(e){return json({success:false,error:String((e as any)?.message||e)},200)}
});
