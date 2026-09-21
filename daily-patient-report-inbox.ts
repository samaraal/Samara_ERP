import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-cron-secret","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const text=(v:unknown)=>String(v??"").trim();
// Standard PDF fonts use WinAnsi. Convert invisible spaces and unsupported
// punctuation before measuring or drawing any dynamic report text.
const pdfText=(v:unknown)=>text(v)
 .replace(/[\u00a0\u202f]/g," ")
 .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g,"-")
 .replace(/[\u2018\u2019]/g,"'")
 .replace(/[\u201c\u201d]/g,'"')
 .replace(/\u20b9/g,"INR ")
 .normalize("NFKD")
 .replace(/[^\x20-\x7e]/g,"?");
const digits=(v:unknown)=>text(v).replace(/\D/g,"");
// Exact approved Meta template name. Keep this single source of truth for both
// the WhatsApp API payload and the ERP inbox/audit record.
const DAILY_PATIENT_REPORT_TEMPLATE="amara_daily_patient_report";
const indiaDate=(value=new Date())=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(value);
const displayDate=(iso:string)=>{const [y,m,d]=iso.split("-");return `${d}:${m}:${y}`};
const displayDateTime=(v:unknown)=>v?pdfText(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:true}).format(new Date(String(v))).replace(",","").replace(/\//g,":")):"-";
const sameDay=(v:unknown,date:string)=>{if(!v)return false;try{return indiaDate(new Date(String(v)))===date}catch{return false}};
const patientName=(p:any)=>[text(p.title),text(p.full_name)].filter(Boolean).join(" ")||"Patient";
const canonicalMealType=(value:unknown)=>{const v=text(value).toLowerCase();if(v.includes("lunch"))return "Lunch";if(v.includes("dinner"))return "Dinner";return "Tiffin"};

async function rows(sb:any,table:string,patientId:string){const r=await sb.from(table).select("*").eq("patient_id",patientId);return r.error?[]:(r.data||[])}
async function allRows(sb:any,table:string){const r=await sb.from(table).select("*");return r.error?[]:(r.data||[])}
function wrap(font:any,value:string,size:number,max:number){const words=pdfText(value).split(/\s+/).filter(Boolean),out:string[]=[];let line="";for(const word of words){const next=line?`${line} ${word}`:word;if(font.widthOfTextAtSize(next,size)<=max)line=next;else{if(line)out.push(line);line=word}}if(line)out.push(line);return out.length?out:[""]}

async function makeReport(sb:any,patient:any,date:string){
  const [vitals,care,careOrders,orders,mar,meals,physioPlans,physio,incidents,billing,recovery,documents,handovers,medReviews,medReviewItems,staffResult]=await Promise.all([
    rows(sb,"vital_signs",patient.id),rows(sb,"care_logs",patient.id),rows(sb,"care_orders",patient.id),rows(sb,"medication_orders",patient.id),
    rows(sb,"medication_administrations",patient.id),rows(sb,"meal_records",patient.id),rows(sb,"physiotherapy_plans",patient.id),rows(sb,"physiotherapy_sessions",patient.id),
    rows(sb,"incidents",patient.id),rows(sb,"billing_transactions",patient.id),rows(sb,"recovery_events",patient.id),rows(sb,"patient_documents",patient.id),
    rows(sb,"shift_handovers",patient.id),rows(sb,"medication_reviews",patient.id),allRows(sb,"medication_review_items"),sb.from("profiles").select("id,full_name,role")
  ]);
  const dayVitals=vitals.filter((x:any)=>sameDay(x.recorded_at||x.created_at,date));
  const dayCare=care.filter((x:any)=>sameDay(x.completed_at||x.created_at||x.care_date,date));
  const dayMar=mar.filter((x:any)=>sameDay(x.administered_at||x.created_at||x.scheduled_date,date));
  const dayMealCandidates=meals.filter((x:any)=>sameDay(x.served_at||x.created_at||x.meal_date,date)).sort((a:any,b:any)=>+new Date(b.served_at||b.created_at||b.meal_date)-+new Date(a.served_at||a.created_at||a.meal_date));
  const dayMeals=["Tiffin","Lunch","Dinner"].map(mealType=>{const row=dayMealCandidates.find((x:any)=>canonicalMealType(x.meal_type)===mealType);return row?{...row,meal_type:mealType}:null}).filter(Boolean) as any[];
  const dayPhysio=physio.filter((x:any)=>sameDay(x.session_at||x.created_at||x.session_date,date));
  const dayIncidents=incidents.filter((x:any)=>sameDay(x.incident_at||x.created_at,date));
  const dayHandovers=handovers.filter((x:any)=>sameDay(x.created_at||x.handover_date,date));
  const dayReviews=medReviews.filter((x:any)=>sameDay(x.reviewed_at||x.created_at,date));
  const staff=staffResult.error?[]:(staffResult.data||[]),staffName=(id:any)=>text(staff.find((x:any)=>x.id===id)?.full_name)||"Not recorded";
  const latest=[...dayVitals].sort((a:any,b:any)=>+new Date(b.recorded_at||b.created_at)-+new Date(a.recorded_at||a.created_at))[0];
  const n=(v:any)=>{const x=Number(v);return Number.isFinite(x)&&x!==0?x:null};
  const critical=dayVitals.some((x:any)=>(n(x.spo2)!==null&&n(x.spo2)!<90)||(n(x.systolic)!==null&&(n(x.systolic)!>=180||n(x.systolic)!<80))||(n(x.pulse)!==null&&(n(x.pulse)!>130||n(x.pulse)!<40)));
  const warning=dayVitals.some((x:any)=>(n(x.spo2)!==null&&n(x.spo2)!<94)||(n(x.systolic)!==null&&(n(x.systolic)!>=160||n(x.systolic)!<90))||(n(x.pulse)!==null&&(n(x.pulse)!>110||n(x.pulse)!<50)));
  const status=critical?"REQUIRES CLINICAL REVIEW":warning?"UNDER OBSERVATION":"STABLE";
  const given=dayMar.filter((x:any)=>text(x.status).toLowerCase()==="given").length;
  const missed=dayMar.filter((x:any)=>["missed","omitted","refused","not given"].includes(text(x.status).toLowerCase())).length;
  const completed=dayCare.filter((x:any)=>["completed","done","given"].includes(text(x.status).toLowerCase())).length;
  const physioDone=dayPhysio.filter((x:any)=>text(x.status).toLowerCase()==="completed").length;
  const activeOrders=orders.filter((x:any)=>x.is_active!==false&&!x.stopped_at);
  const meds=activeOrders.map((x:any)=>`${text(x.medicine_name)||"Medicine"}${text(x.strength||x.dose)?` - ${text(x.strength||x.dose)}`:""}${text(x.route)?` (${text(x.route)})`:""}${text(x.timing||x.scheduled_times)?` at ${text(x.timing||x.scheduled_times)}`:""}`).join("; ");
  const admission=new Date(patient.admission_date||date),asOn=new Date(`${date}T12:00:00+05:30`);const stay=Math.max(1,Math.floor((+asOn-+admission)/86400000)+1);
  const pronoun=text(patient.gender).toLowerCase()==="female"?"She":text(patient.gender).toLowerCase()==="male"?"He":"The patient";
  const hospital=text(patient.hospital_name)||"the referring hospital / care centre";
  const intro=`Admission Summary: ${patientName(patient)} (${text(patient.patient_id)||"patient ID not assigned"}) was admitted following discharge from ${hospital} on ${displayDate(text(patient.admission_date).slice(0,10)||date)} with ${text(patient.diagnosis)?`a diagnosis of ${text(patient.diagnosis)}`:"the recorded assisted-living care requirement"}. ${pronoun} has completed ${stay} day${stay===1?"":"s"} of stay as on ${displayDate(date)}. Known allergies: ${text(patient.allergies)||"none recorded"}.`;
  const careSummary=`Care and Treatment Provided: ${meds?`Treatment is continuing according to the active prescription: ${meds}.`:"No active medicine prescription is available."} ${given} administered dose record(s), ${dayCare.length} nursing/personal-care activity record(s), ${dayMeals.length} meal/intake record(s) and ${dayPhysio.length} physiotherapy session record(s) are available for the selected date.`;
  const vitalText=latest?[n(latest.systolic)!==null||n(latest.diastolic)!==null?`BP ${n(latest.systolic)??"-"}/${n(latest.diastolic)??"-"} mmHg`:"",n(latest.pulse)!==null?`pulse ${n(latest.pulse)}/min`:"",n(latest.spo2)!==null?`SpO2 ${n(latest.spo2)}%`:"",n(latest.blood_sugar)!==null?`${text(latest.blood_sugar_type)||"RBS"} ${n(latest.blood_sugar)} mg/dL`:""].filter(Boolean).join(", "):"no vital-sign observation was entered";
  const current=`Current Clinical Status: ${pronoun} is ${status==="STABLE"?"clinically stable":status.toLowerCase()} on the available records. The latest available observations show ${vitalText}. ${dayIncidents.length?`${dayIncidents.length} incident(s) were recorded and require review.`:"No serious incident was recorded for the selected date."}`;

  const family=`Family Communication: ${dayIncidents.some((x:any)=>x.family_informed===true||/family|relative|attendant/i.test(text(x.immediate_action||x.remarks||x.description)))?"The available records indicate that the family/attendant was informed regarding the patient's condition or a significant event.":"No specific family communication entry is available for the selected reporting period."}`;
  const plan=`Plan and Recommendation: ${critical?"Prompt review by the treating doctor is advisable. Continue close monitoring and follow the doctor's instructions.":warning?"Continue close observation and scheduled medical review. Escalate promptly if there is any deterioration.":"Continue the prescribed treatment and routine medical follow-up."} Continue care according to the active prescription and care plan, including nursing assistance, diet, physiotherapy and documented risk precautions.`;
  const charges=billing.filter((x:any)=>x.transaction_type==="Charge").reduce((a:number,x:any)=>a+Number(x.amount||0),0),payments=billing.filter((x:any)=>["Payment","Advance"].includes(x.transaction_type)).reduce((a:number,x:any)=>a+Number(x.amount||0),0),discounts=billing.filter((x:any)=>x.transaction_type==="Discount").reduce((a:number,x:any)=>a+Number(x.amount||0),0);
  const pdf=await PDFDocument.create();const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const W=595.28,H=841.89,M=28,mag=rgb(.72,.02,.34),deep=rgb(.34,.05,.19),pink=rgb(.97,.83,.89),pale=rgb(1,.975,.985),ink=rgb(.20,.10,.16),grey=rgb(.43,.34,.39),green=rgb(.02,.68,.36),red=rgb(.78,.08,.16);
  const page=pdf.addPage([W,H]);page.drawRectangle({x:0,y:H-8,width:W,height:8,color:mag});
  const line=(x1:number,y1:number,x2:number,y2:number,color=pink,width=.6)=>page.drawLine({start:{x:x1,y:y1},end:{x:x2,y:y2},thickness:width,color});
  const frame=(x:number,y:number,w:number,h:number,fill=pale,border=pink)=>page.drawRectangle({x,y,width:w,height:h,color:fill,borderColor:border,borderWidth:.7});
  const fitted=(value:string,x:number,y:number,max:number,size:number,font=regular,color=ink)=>{const safe=pdfText(value)||"-";let s=size;while(s>4.3&&font.widthOfTextAtSize(safe,s)>max)s-=.2;page.drawText(safe,{x,y,size:s,font,color})};
  const wrapped=(value:string,x:number,y:number,max:number,size:number,lineH:number,maxLines=99,font=regular,color=ink)=>{const lines=wrap(font,value,size,max).slice(0,maxLines);lines.forEach((v,i)=>page.drawText(v,{x,y:y-i*lineH,size,font,color}));return lines.length};
  const richWrapped=(label:string,value:string,x:number,y:number,max:number,size:number,lineH:number,maxLines=4)=>{const safeLabel=pdfText(label),safeValue=pdfText(value),prefix=`${safeLabel}:`,prefixWidth=bold.widthOfTextAtSize(prefix,size),firstWidth=Math.max(40,max-prefixWidth-4),words=safeValue.split(/\s+/).filter(Boolean);let first="";while(words.length){const candidate=first?`${first} ${words[0]}`:words[0];if(regular.widthOfTextAtSize(candidate,size)>firstWidth)break;first=candidate;words.shift()}page.drawText(prefix,{x,y,size,font:bold,color:mag});if(first)page.drawText(first,{x:x+prefixWidth+4,y,size,font:regular,color:ink});const remaining=wrap(regular,words.join(" "),size,max).filter(Boolean).slice(0,Math.max(0,maxLines-1));remaining.forEach((lineText,i)=>page.drawText(lineText,{x,y:y-(i+1)*lineH,size,font:regular,color:ink}));return 1+remaining.length};
  const sectionBar=(title:string,x:number,y:number,w:number)=>{page.drawRectangle({x,y,width:w,height:15,color:mag});page.drawText(title,{x:x+7,y:y+3.5,size:8.3,font:bold,color:rgb(1,1,1)})};
  const card=(title:string,items:[string,string][],note:string,x:number,y:number,w:number,h:number)=>{frame(x,y,w,h);page.drawText(title,{x:x+8,y:y+h-14,size:8.3,font:bold,color:mag});line(x+7,y+h-20,x+w-7,y+h-20);let cy=y+h-33;items.forEach(([k,v])=>{fitted(k,x+8,cy,w*.46,7.2,regular,grey);page.drawText(":",{x:x+w*.51,y:cy,size:7.2,font:bold,color:grey});fitted(v,x+w*.57,cy,w*.37,7.2,bold,ink);cy-=13});if(note){page.drawRectangle({x:x+7,y:y+7,width:w-14,height:17,color:pale,borderColor:pink,borderWidth:.4});wrapped(note,x+12,y+16.5,w-24,6,6.5,2,bold,mag)}};

  // Branded header - same visual hierarchy as the ERP preview.
  try{const logoBytes=await samaraInboxFetch("https://samaraassistedliving.com/assets/samara-logo.png").then(r=>r.ok?r.arrayBuffer():Promise.reject());const logo=await pdf.embedPng(logoBytes);const scale=Math.min(82/logo.width,42/logo.height);page.drawImage(logo,{x:M+9,y:H-67,width:logo.width*scale,height:logo.height*scale})}catch{page.drawText("Samara",{x:M+12,y:H-48,size:17,font:bold,color:mag})}
  line(M+105,H-70,M+105,H-27,mag,.7);
  page.drawText("SAMARA HEALTH CARE LLP",{x:M+162,y:H-31,size:10,font:bold,color:mag});
  page.drawText("Assisted Living Management System",{x:M+176,y:H-44,size:6.6,font:regular,color:grey});
  page.drawText("PATIENT CARE REPORT",{x:M+158,y:H-60,size:15,font:bold,color:mag});
  page.drawText(`Generated on: ${displayDateTime(new Date())}`,{x:M+180,y:H-70,size:6.2,font:regular,color:grey});
  line(M,H-76,W-M,H-76,mag,1);

  // Resident overview.
  const oy=H-202,oh=116;frame(M,oy,W-2*M,oh,rgb(1,.99,.995));sectionBar("RESIDENT OVERVIEW",M,oy+oh-16,W-2*M);
  let photoPath=text(patient.photo_storage_path);if(!photoPath){const ph=documents.filter((x:any)=>/patient photo|photograph/i.test(text(x.document_type))).sort((a:any,b:any)=>+new Date(b.created_at)-+new Date(a.created_at))[0];photoPath=text(ph?.storage_path)}
  if(photoPath){try{const signed=await sb.storage.from("patient-documents").createSignedUrl(photoPath,600);const bytes=await samaraInboxFetch(signed.data.signedUrl).then(r=>r.arrayBuffer());let img:any;try{img=await pdf.embedJpg(bytes)}catch{img=await pdf.embedPng(bytes)};page.drawImage(img,{x:M+12,y:oy+15,width:72,height:78})}catch{/* photo optional */}}
  page.drawText(pdfText(patientName(patient)),{x:M+100,y:oy+82,size:11.5,font:bold,color:mag});
  const overview:[[string,string],[string,string],[string,string],[string,string],[string,string]]=[["Resident ID",text(patient.patient_id)||"-"],["Room / Bed",`${text(patient.room_no)||"Unassigned"}${text(patient.bed_no)?`-${text(patient.bed_no)}`:""}`],["Admission Type",text(patient.admission_type)||"-"],["Admission Date",displayDate(text(patient.admission_date).slice(0,10)||date)],["Duration of Stay",`${stay} day${stay===1?"":"s"}`]];
  overview.forEach(([k,v],i)=>{page.drawText(k,{x:M+100,y:oy+65-i*12,size:7.7,font:bold,color:ink});page.drawText(":",{x:M+164,y:oy+65-i*12,size:7.7,font:bold,color:ink});fitted(v,M+174,oy+65-i*12,98,7.7,regular,ink)});
  const right:[[string,string],[string,string],[string,string],[string,string]]=[["Diagnosis",text(patient.diagnosis)||"Not recorded"],["Treating Doctor",text(patient.treating_doctor||patient.referring_doctor)||"Not recorded"],["Allergies",text(patient.allergies)||"None recorded"],["Emergency Contact",`${text(patient.emergency_contact_name||patient.attendant_name)||"Not available"}${text(patient.emergency_contact_number||patient.attendant_phone)?` - ${text(patient.emergency_contact_number||patient.attendant_phone)}`:""}`]];
  right.forEach(([k,v],i)=>{page.drawText(k,{x:M+285,y:oy+78-i*15,size:7.7,font:bold,color:ink});page.drawText(":",{x:M+373,y:oy+78-i*15,size:7.7,font:bold,color:ink});fitted(v,M+383,oy+78-i*15,148,7.7,regular,ink)});
  page.drawRectangle({x:M+205,y:oy+8,width:132,height:18,color:pale,borderColor:mag,borderWidth:.6});page.drawText("Current Status",{x:M+214,y:oy+13,size:7.5,font:bold,color:mag});page.drawText(status,{x:M+280,y:oy+13,size:7.8,font:bold,color:status==="STABLE"?green:red});

  // Clinical narrative.
  const sy=H-344,sh=132;frame(M,sy,W-2*M,sh,rgb(1,.99,.995));page.drawText("CLINICAL CARE SUMMARY",{x:M+8,y:sy+sh-16,size:9.2,font:bold,color:mag});line(M+7,sy+sh-23,W-M-7,sy+sh-23);
  const summaryParts=[intro,careSummary,current,family,plan].map(value=>{const split=value.indexOf(":");return split>0?[value.slice(0,split),value.slice(split+1).trim()]:["Summary",value]});
  const largeSummaryLines=summaryParts.reduce((total,[label,value])=>total+wrap(regular,`${label}: ${value}`,6.5,W-2*M-18).slice(0,4).length,0);
  const summarySize=largeSummaryLines<=11?6.5:largeSummaryLines<=14?6:5.5;
  const summaryLineHeight=summarySize+1.3;
  let py=sy+sh-35;summaryParts.forEach(([label,value])=>{const used=richWrapped(label,value,M+9,py,W-2*M-18,summarySize,summaryLineHeight,4);py-=used*summaryLineHeight+2.2});

  // Six clinical cards in the same 3 x 2 layout as the preview.
  const gap=8,cw=(W-2*M-gap*2)/3,ch=112,row1=H-458,row2=H-572;
  card("VITAL SIGNS SUMMARY",[["Blood Pressure",latest?`${n(latest.systolic)??"-"}/${n(latest.diastolic)??"-"} mmHg`:"-"],["Pulse Rate",latest&&n(latest.pulse)!==null?`${n(latest.pulse)}/min`:"-"],["SpO2",latest&&n(latest.spo2)!==null?`${n(latest.spo2)}%`:"-"],["Temperature",latest&&n(latest.temperature)!==null?`${n(latest.temperature)} deg`:"-"],["Blood Sugar",latest&&n(latest.blood_sugar)!==null?`${text(latest.blood_sugar_type)||"RBS"} ${n(latest.blood_sugar)} mg/dL`:"Not Taken"]],latest?`Latest: ${displayDateTime(latest.recorded_at||latest.created_at)}`:"No vital observations recorded.",M,row1,cw,ch);
  card("MEDICATION ADMINISTRATION",[["Medicines Scheduled",String(dayMar.length)],["Medicines Given",String(given)],["Missed / Omitted",String(missed)],["Active Prescription Items",String(activeOrders.length)]],missed?"Medication exceptions require review.":"Medication activity is summarised above.",M+cw+gap,row1,cw,ch);
  card("DAILY CARE AND NURSING",[["Care Activities Planned",String(careOrders.filter((x:any)=>x.is_active!==false).length)],["Care Activities Recorded",String(dayCare.length)],["Care Activities Completed",String(completed)],["Assistance with ADL",dayCare.length?"Recorded":"-"]],"Care activities are summarised above.",M+(cw+gap)*2,row1,cw,ch);
  card("FOOD, DIET AND INTAKE",[["Diet Type",text(patient.diet_type||patient.food_preference)||"Normal Diet"],["Meal / Intake Records",String(dayMeals.length)],["Average Intake",dayMeals.length?"Recorded":"-"],["Feeding Instruction",text(patient.feeding_instruction)||"-"]],"Meal and intake records are available.",M,row2,cw,ch);
  card("PHYSIOTHERAPY",[["Sessions Planned",String(physioPlans.filter((x:any)=>x.is_active!==false).length)],["Sessions Recorded",String(dayPhysio.length)],["Sessions Completed",String(physioDone)],["Remarks",dayPhysio.length?"Available":"-"]],dayPhysio.length?"Physiotherapy activity recorded.":"No physiotherapy records for the period.",M+cw+gap,row2,cw,ch);
  card("INCIDENT REPORTS",[["Total Incidents",String(dayIncidents.length)],["Falls",String(dayIncidents.filter((x:any)=>/fall/i.test(text(x.incident_type||x.type))).length)],["Medical Emergencies",String(dayIncidents.filter((x:any)=>/emergency|transfer/i.test(text(x.incident_type||x.type))).length)],["Open Incidents",String(dayIncidents.filter((x:any)=>text(x.status||"Open").toLowerCase()!=="closed").length)]],dayIncidents.length?"Incident review is required.":"No reportable incidents during the period.",M+(cw+gap)*2,row2,cw,ch);

  // Financial summary, timeline and footer.
  const fy=H-638,fh=57;frame(M,fy,W-2*M,fh);page.drawText("FINANCIAL STATEMENT",{x:M+8,y:fy+fh-14,size:8.2,font:bold,color:mag});const fw=(W-2*M-28)/4;[["Charges",charges,mag],["Payments / Advances",payments,green],["Discounts",discounts,mag],["Outstanding Balance",charges-payments-discounts,red]].forEach(([label,value,color],i)=>{const x=M+7+i*(fw+5);page.drawRectangle({x,y:fy+8,width:fw,height:27,color:pale,borderColor:color as any,borderWidth:.6});fitted(String(label),x+6,fy+24,fw-12,6.4,bold,color as any);fitted(`INR ${Number(value).toFixed(2)}`,x+6,fy+13,fw-12,7.8,bold,ink)});
  const ty=H-711,th=65;frame(M,ty,W-2*M,th);page.drawText("RECOVERY / PROGRESS TIMELINE",{x:M+8,y:ty+th-14,size:8.2,font:bold,color:mag});line(M+7,ty+th-20,W-M-7,ty+th-20);if(recovery.length)recovery.slice(0,4).forEach((x:any,i)=>wrapped(`${text(x.event_type)||"Progress"}: ${text(x.note)||"-"} - ${displayDateTime(x.event_at||x.created_at)}`,M+10,ty+th-32-i*10,W-2*M-20,6.5,7.3,1,regular,ink));else page.drawText("No progress timeline data is available for the selected period.",{x:M+126,y:ty+23,size:7.4,font:regular,color:grey});
  const footerY=72;frame(M,footerY,W-2*M,42,rgb(1,.985,.992));page.drawText("Samara Health Care LLP",{x:M+10,y:footerY+25,size:7.2,font:bold,color:deep});page.drawText("Assisted Living Management System",{x:M+10,y:footerY+13,size:5.9,font:regular,color:grey});line(M+200,footerY+7,M+200,footerY+35);page.drawText("Report status",{x:M+215,y:footerY+25,size:5.6,font:regular,color:grey});page.drawText("Automatically generated",{x:M+215,y:footerY+13,size:6.8,font:bold,color:deep});line(M+355,footerY+7,M+355,footerY+35);page.drawText("Data cut-off",{x:M+370,y:footerY+25,size:5.6,font:regular,color:grey});page.drawText(displayDateTime(new Date()),{x:M+370,y:footerY+13,size:6.3,font:bold,color:deep});
  page.drawText(pdfText(`${patientName(patient)} - Patient Care Report`),{x:M,y:48,size:8.5,font:bold,color:deep});page.drawText(`Report date: ${displayDate(date)} | Confidential`,{x:M,y:35,size:6.3,font:regular,color:grey});
  page.drawText("For full details, log in to the Samara Family Portal: https://family.samaraassistedliving.com/",{x:M,y:22,size:6.2,font:bold,color:mag});page.drawText("1 / 2",{x:W-M-20,y:22,size:6.3,font:regular,color:grey});

  // Page 2 - detailed clinical annexure. Every row is derived from ERP records.
  const p2=pdf.addPage([W,H]);p2.drawRectangle({x:0,y:H-8,width:W,height:8,color:mag});
  const p2Line=(x1:number,y1:number,x2:number,y2:number,color=pink,width=.5)=>p2.drawLine({start:{x:x1,y:y1},end:{x:x2,y:y2},thickness:width,color});
  const p2Frame=(x:number,y:number,w:number,h:number,fill=rgb(1,.99,.995))=>p2.drawRectangle({x,y,width:w,height:h,color:fill,borderColor:pink,borderWidth:.65});
  const p2Fit=(value:any,x:number,y:number,max:number,size=6.3,font=regular,color=ink)=>{const safe=pdfText(value)||"-";let s=size;while(s>4.8&&font.widthOfTextAtSize(safe,s)>max)s-=.2;let shown=safe;while(shown.length>3&&font.widthOfTextAtSize(shown,s)>max)shown=shown.slice(0,-2);if(shown!==safe)shown=`${shown.slice(0,-3)}...`;p2.drawText(shown,{x,y,size:s,font,color})};
  const p2Wrapped=(value:any,x:number,y:number,max:number,size=5.3,lineH=6.5,maxLines=4,font=regular,color=ink)=>{const lines=wrap(font,pdfText(value),size,max).slice(0,maxLines);lines.forEach((v,i)=>p2.drawText(v,{x,y:y-i*lineH,size,font,color}));return lines.length};
  const p2Section=(title:string,y:number,h:number)=>{p2Frame(M,y,W-2*M,h);p2.drawText(title,{x:M+9,y:y+h-16,size:9.2,font:bold,color:mag});p2Line(M+8,y+h-23,W-M-8,y+h-23);return y+h-35};
  const table=(x:number,yTop:number,widths:number[],headers:string[],data:any[][],rowH=13)=>{const fontSize=Math.min(9,Math.max(6.4,rowH*.43));let xPos=x;headers.forEach((v,i)=>{p2.drawRectangle({x:xPos,y:yTop-rowH+2,width:widths[i],height:rowH,color:pink,borderColor:rgb(1,1,1),borderWidth:.35});p2Fit(v,xPos+4,yTop-rowH*.62,widths[i]-8,fontSize,bold,deep);xPos+=widths[i]});let y=yTop-rowH;data.forEach((row,r)=>{xPos=x;row.forEach((v,i)=>{p2.drawRectangle({x:xPos,y:y-rowH+2,width:widths[i],height:rowH,color:r%2?pale:rgb(1,1,1),borderColor:pink,borderWidth:.25});p2Fit(v,xPos+4,y-rowH*.62,widths[i]-8,fontSize,regular,ink);xPos+=widths[i]});y-=rowH});return y};
  const orderMap=Object.fromEntries(orders.map((x:any)=>[x.id,x])),careOrderMap=Object.fromEntries(careOrders.map((x:any)=>[x.id,x]));
  const vitalRows=[...dayVitals].sort((a:any,b:any)=>+new Date(b.recorded_at||b.created_at)-+new Date(a.recorded_at||a.created_at)).slice(0,6);
  const vitalFlag=(x:any)=>{const c=(n(x.spo2)!==null&&n(x.spo2)!<90)||(n(x.systolic)!==null&&(n(x.systolic)!>=180||n(x.systolic)!<80))||(n(x.pulse)!==null&&(n(x.pulse)!>130||n(x.pulse)!<40));const w=(n(x.spo2)!==null&&n(x.spo2)!<94)||(n(x.systolic)!==null&&(n(x.systolic)!>=160||n(x.systolic)!<90))||(n(x.pulse)!==null&&(n(x.pulse)!>110||n(x.pulse)!<50));return c?"Critical":w?"Review":"Within range"};
  const latestReview=[...dayReviews].sort((a:any,b:any)=>+new Date(b.reviewed_at||b.created_at)-+new Date(a.reviewed_at||a.created_at))[0];
  const latestHandover=[...dayHandovers].sort((a:any,b:any)=>+new Date(b.created_at)-+new Date(a.created_at))[0];
  const reviewItems=latestReview?medReviewItems.filter((x:any)=>x.review_id===latestReview.id):[];
  const reviewChanges=reviewItems.slice(0,4).map((x:any)=>`${text(x.action)||"Change"}: ${text(x.medicine_name)||"medicine"}${text(x.strength||x.dose)?` ${text(x.strength||x.dose)}`:""}`).join("; ");
  const wellbeingText=[...dayCare.map((x:any)=>text(x.remarks)),text(latestHandover?.patient_summary),text(latestHandover?.special_instructions)].filter(Boolean).join(" ");
  const mealSummary=dayMeals.map((x:any)=>`${text(x.meal_type)||"Meal"}: ${text(x.consumption_status)||"recorded"}`).join("; ")||"No food intake entered";
  const beverageSummary=dayMeals.filter((x:any)=>text(x.beverage_type)).map((x:any)=>`${text(x.beverage_type)}${text(x.beverage_time)?` at ${text(x.beverage_time).slice(0,5)}`:""}`).join("; ")||"No beverage entered";
  const wellbeing=`Mobility ${/mobil|walk|ambulat|turn|position/i.test(wellbeingText)?"documented":"not separately recorded"}; pain ${/pain/i.test(wellbeingText)?"mentioned":"not separately recorded"}; sleep ${/sleep/i.test(wellbeingText)?"documented":"not separately recorded"}; orientation ${/orient|conscious|alert/i.test(wellbeingText)?"documented":"not separately recorded"}.`;
  const previous=vitalRows[1];const direction=(a:any,b:any)=>a==null||b==null?"Not enough data":a>b?"increased":a<b?"decreased":"remained stable";
  const glanceCards:[string,string][]=[
    ["VITAL TREND",latest&&previous?`BP ${n(latest.systolic)??"-"}/${n(latest.diastolic)??"-"}; pulse ${direction(n(latest.pulse),n(previous.pulse))}; SpO2 ${direction(n(latest.spo2),n(previous.spo2))}`:latest?"One observation; comparison unavailable":"No observation entered"],
    ["MEDICATION",`${given} given; ${missed} missed / omitted / refused`],
    ["FOOD AND BEVERAGES",`${mealSummary}. ${beverageSummary}`],
    ["DAILY WELLBEING",wellbeing],
    ["DOCTOR REVIEW",latestReview?`${text(latestReview.doctor_name)||"Doctor"}: ${text(latestReview.clinical_notes)||text(latestReview.review_type)||"Review recorded"}${reviewChanges?`; ${reviewChanges}`:""}`:"No new review entered"],
    ["CLINICAL CONCERN",dayIncidents.length?`${dayIncidents.length} incident(s) recorded - review required`:"No incident recorded"]
  ];
  try{const logoBytes=await samaraInboxFetch("https://samaraassistedliving.com/assets/samara-logo.png").then(r=>r.ok?r.arrayBuffer():Promise.reject());const logo=await pdf.embedPng(logoBytes);const scale=Math.min(67/logo.width,34/logo.height);p2.drawImage(logo,{x:M,y:H-58,width:logo.width*scale,height:logo.height*scale})}catch{p2.drawText("Samara",{x:M,y:H-45,size:15,font:bold,color:mag})}
  p2.drawText("DETAILED CLINICAL ANNEXURE",{x:M+145,y:H-35,size:14.5,font:bold,color:mag});p2.drawText(pdfText(`${patientName(patient)} | ${text(patient.patient_id)} | Room ${text(patient.room_no)}-${text(patient.bed_no)} | ${displayDate(date)}`),{x:M+145,y:H-51,size:7.2,font:regular,color:grey});p2Line(M,H-66,W-M,H-66,mag,.9);

  let y2=H-155;let cursor=p2Section("TODAY AT A GLANCE AND CHANGES SINCE THE PREVIOUS REPORT",y2,84);const glanceGap=6,glanceW=(W-2*M-28-glanceGap*2)/3;glanceCards.forEach(([label,value],i)=>{const col=i%3,row=Math.floor(i/3),x=M+8+col*(glanceW+glanceGap),y=cursor-21-row*22;p2.drawRectangle({x,y,width:glanceW,height:21,color:row?pale:rgb(1,.97,.985),borderColor:pink,borderWidth:.4});p2.drawText(label,{x:x+5,y:y+12.5,size:6.5,font:bold,color:mag});p2Fit(value,x+5,y+4.5,glanceW-10,6,regular,i===5&&dayIncidents.length?red:ink)});
  y2=H-282;cursor=p2Section("VITAL-SIGN TREND",y2,117);const vitalData=vitalRows.length?vitalRows.map((x:any)=>[displayDateTime(x.recorded_at||x.created_at),`${n(x.systolic)??"-"}/${n(x.diastolic)??"-"}`,n(x.pulse)!=null?`${n(x.pulse)}/min`:"-",n(x.spo2)!=null?`${n(x.spo2)}%`:"-",n(x.temperature)!=null?`${n(x.temperature)} deg`:"-",n(x.blood_sugar)!=null?`${text(x.blood_sugar_type)||"RBS"} ${n(x.blood_sugar)}`:"Not taken",vitalFlag(x)]):[["No observations","-","-","-","-","-","-"]];table(M+8,cursor,[74,72,60,58,58,76,87],["Date / Time","Blood Pressure","Pulse","SpO2","Temperature","Blood Sugar","Assessment"],vitalData,Math.min(22,80/(vitalData.length+1)));
  y2=H-433;cursor=p2Section("MEDICATION ADMINISTRATION DETAILS",y2,141);const medRows=[...dayMar].sort((a:any,b:any)=>+new Date(a.scheduled_at||a.created_at)-+new Date(b.scheduled_at||b.created_at)).slice(0,8).map((x:any)=>{const o=orderMap[x.order_id||x.medication_order_id]||{};return [text(x.scheduled_time)||text(x.scheduled_at).slice(11,16)||"-",text(x.administered_at)?displayDateTime(x.administered_at).split(" ").slice(-2).join(" "):"-",text(x.medicine_name)||text(o.medicine_name)||"Medicine",text(x.dose||x.strength)||text(o.dose||o.strength)||"-",text(x.route)||text(o.route)||"-",text(x.status)||"Recorded",text(x.remarks||x.exception_reason)||staffName(x.administered_by)]});const medData=medRows.length?medRows:[["-","-","No administration records","-","-","-","-"]];table(M+8,cursor,[45,54,106,58,44,61,155],["Scheduled","Actual","Medicine","Dose","Route","Status","Remarks / Recorded by"],medData,Math.min(22,104/(medData.length+1)));
  y2=H-558;cursor=p2Section("DAILY CARE AND NURSING DETAILS",y2,115);const careRows=[...dayCare].sort((a:any,b:any)=>+new Date(a.completed_at||a.created_at)-+new Date(b.completed_at||b.created_at)).slice(0,6).map((x:any)=>{const o=careOrderMap[x.care_order_id]||{};return [text(o.care_type||o.task_name||x.care_type)||"Care activity",text(x.shift)||text(o.shift)||"-",text(x.status)||"Recorded",displayDateTime(x.completed_at||x.created_at),text(x.remarks)||"-",staffName(x.completed_by)]});const careData=careRows.length?careRows:[["No detailed care log","-","-","-","-","-"]];table(M+8,cursor,[120,60,60,88,135,60],["Care activity","Shift","Status","Completed at","Remarks","Recorded by"],careData,Math.min(22,78/(careData.length+1)));
  y2=H-682;cursor=p2Section("FOOD, FLUID, PHYSIOTHERAPY AND INCIDENT DETAILS",y2,114);const fullX=M+8,foodData=dayMeals.slice(0,3).map((x:any)=>[text(x.meal_type)||"Meal",text(x.menu)||"-",text(x.consumption_status)||"Recorded",text(x.served_at)?displayDateTime(x.served_at).split(" ").slice(-2).join(" "):"-",text(x.beverage_type)||"-",text(x.beverage_time).slice(0,5)||"-"]).concat(dayMeals.length?[]:[["No records","-","-","-","-","-"]]);p2.drawText("Food / Fluid Intake",{x:fullX+2,y:cursor,size:7,font:bold,color:deep});table(fullX,cursor-8,[42,122,78,68,91,64],["Meal","Menu","Food Intake","Meal Time","Beverage","Beverage Time"],foodData,Math.min(11,42/(foodData.length+1)));const clinicalY=cursor-58;p2.drawText("Physiotherapy / Incidents",{x:fullX+2,y:clinicalY,size:7,font:bold,color:deep});const combined=[...dayPhysio.slice(0,2).map((x:any)=>["Physiotherapy",text(x.status)||"Recorded",text(x.notes)||"-"]),...dayIncidents.slice(0,2).map((x:any)=>[text(x.incident_type)||"Incident",`${text(x.severity)||"-"} / ${text(x.status)||"-"}`,text(x.description||x.immediate_action)||"-"])],combinedData=combined.length?combined:[["No records","-","-"]];table(fullX,clinicalY-8,[125,110,230],["Type","Status","Notes / Action"],combinedData,Math.min(10,28/(combinedData.length+1)));
  y2=58;cursor=p2Section("NEXT 24 HOURS / HANDOVER PLAN",y2,92);const nextItems=[latestHandover?.pending_tasks&&["Pending tasks",text(latestHandover.pending_tasks)],latestHandover?.special_instructions&&["Special instructions",text(latestHandover.special_instructions)],latestHandover?.patient_summary&&["Patient summary",text(latestHandover.patient_summary)],activeOrders.length&&["Medication plan",`Continue ${activeOrders.length} active prescription item(s) at the ordered times.`],careOrders.some((x:any)=>x.is_active!==false)&&["Care plan",`Continue ${careOrders.filter((x:any)=>x.is_active!==false).length} active care-plan item(s).`]].filter(Boolean) as string[][];const planRows=nextItems.length?nextItems:[["Plan","Continue prescribed treatment, routine nursing care and observation. No separate patient-specific handover instruction was recorded."]];let planY=cursor;for(const [label,value] of planRows.slice(0,5)){p2.drawText("-",{x:M+10,y:planY,size:7,font:bold,color:ink});p2Fit(label,M+20,planY,92,6.5,bold,ink);p2.drawText(":",{x:M+114,y:planY,size:6.5,font:bold,color:ink});const used=p2Wrapped(value,M+122,planY,W-M-(M+122),6.5,7.4,2,regular,ink);planY-=Math.max(10,used*7.4+2)}
  p2.drawText("This annexure is automatically compiled from ERP entries and does not replace medical advice.",{x:M,y:36,size:6,font:regular,color:grey});p2.drawText("For full details, log in to the Samara Family Portal: https://family.samaraassistedliving.com/",{x:M,y:23,size:6.2,font:bold,color:mag});p2.drawText("2 / 2",{x:W-M-20,y:23,size:6.3,font:regular,color:grey});
  return await pdf.save();
}

async function uploadAndSign(sb:any,patient:any,date:string,bytes:Uint8Array){
 const safe=text(patient.full_name).replace(/[^a-zA-Z0-9_-]+/g,"_")||"Patient",path=`${patient.id}/${date}/${safe}_Intelligent_Patient_Report_${date}_readable_v9.pdf`;
 await sb.storage.createBucket("patient-reports",{public:false}).catch(()=>{});
 const up=await sb.storage.from("patient-reports").upload(path,bytes,{contentType:"application/pdf",upsert:true});if(up.error)throw up.error;
 const signed=await sb.storage.from("patient-reports").createSignedUrl(path,3600);if(signed.error)throw signed.error;return {path,url:signed.data.signedUrl};
}

async function sendWhatsApp(to:string,recipient:string,patient:string,date:string,url:string){
 const token=Deno.env.get("WHATSAPP_ACCESS_TOKEN"),phone=Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");if(!token||!phone)throw new Error("WhatsApp configuration is missing.");
 const source=await samaraInboxFetch(url);if(!source.ok)throw new Error(`Generated PDF could not be opened for Meta upload (${source.status}).`);
 const mediaForm=new FormData();mediaForm.append("messaging_product","whatsapp");mediaForm.append("type","application/pdf");mediaForm.append("file",new Blob([await source.arrayBuffer()],{type:"application/pdf"}),`${patient.replace(/[^a-zA-Z0-9 _-]/g,"")} - Intelligent Patient Report - ${date}.pdf`);
 const mediaResponse=await samaraInboxFetch(`https://graph.facebook.com/v25.0/${phone}/media`,{method:"POST",headers:{Authorization:`Bearer ${token}`},body:mediaForm});const mediaResult=await mediaResponse.json();
 if(!mediaResponse.ok||!mediaResult?.id)throw new Error(`Meta document upload failed: ${JSON.stringify(mediaResult)}`);
 const payload={messaging_product:"whatsapp",to:digits(to),type:"template",template:{name:DAILY_PATIENT_REPORT_TEMPLATE,language:{code:"en"},components:[{type:"header",parameters:[{type:"document",document:{id:mediaResult.id,filename:`${patient.replace(/[^a-zA-Z0-9 _-]/g,"")} - Intelligent Patient Report - ${date}.pdf`}}]},{type:"body",parameters:[recipient,patient,displayDate(date)].map(value=>({type:"text",text:value}))}]}};
 const response=await samaraInboxFetch(`https://graph.facebook.com/v25.0/${phone}/messages`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)throw new Error(JSON.stringify(result));return result;
}

async function recordWhatsAppInbox(sb:any,{patient,recipientName,recipientMobile,date,providerId,storagePath,scheduled}:{patient:any,recipientName:string,recipientMobile:string,date:string,providerId:string|null,storagePath:string,scheduled:boolean}){
 const now=new Date().toISOString();
 const message=`Dear ${recipientName}, the Daily Intelligent Patient Report for ${patientName(patient)} dated ${displayDate(date)} is attached.`;
  const payload={patient_id:patient.id,patient_code:patient.patient_id||null,patient_name:patientName(patient),report_date:date,report_storage_path:storagePath,report_storage_bucket:"patient-reports",report_file_name:`${patientName(patient)} - Intelligent Patient Report - ${displayDate(date)}.pdf`,automated:scheduled};
 const log=await sb.from("hr_whatsapp_communications").insert({
  career_application_id:null,application_id:null,applicant_name:recipientName,recipient_number:digits(recipientMobile),
  communication_type:"Daily Intelligent Patient Report",template_name:DAILY_PATIENT_REPORT_TEMPLATE,status:"Accepted",
  provider_message_id:providerId,error_message:null,sent_by:null,sent_by_name:scheduled?"Samara Automatic Report":"Samara ERP",
  direction:"outbound",message_type:"template",message_content:message,message_payload:payload,
  contact_name:recipientName,source_type:"Patient / Family",sent_at:now,created_at:now,updated_at:now
 });
 if(log.error)console.error("WhatsApp Inbox history insert failed",log.error);
 return log.error;
}

Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({ok:false,error:"Method not allowed"},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")!,key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,cronSecret=Deno.env.get("DAILY_REPORT_CRON_SECRET")||"";const sb=createClient(url,key,{auth:{persistSession:false}});const body=await req.json().catch(()=>({}));
  const scheduled=Boolean(cronSecret&&req.headers.get("x-cron-secret")===cronSecret);
  if(!scheduled){const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");const auth=await sb.auth.getUser(jwt);if(auth.error||!auth.data.user)return json({ok:false,error:"Unauthorised"},401)}
  if(scheduled){
   const now=new Date(),date=indiaDate(now),time=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",hour12:false}).format(now);
   const prefs=await sb.from("patient_family_communication_preferences").select("*").eq("daily_whatsapp_enabled",true).eq("is_active",true);
   if(prefs.error){console.error("DAILY_REPORT preference query failed",prefs.error);throw prefs.error}
   const duePrefs=(prefs.data||[]).filter((pref:any)=>{const scheduledTime=text(pref.daily_report_time).slice(0,5);return Boolean(scheduledTime&&scheduledTime<=time)});
   console.log("DAILY_REPORT_RUN",JSON.stringify({date,time,enabled:(prefs.data||[]).length,due:duePrefs.length,due_patients:duePrefs.map((x:any)=>x.patient_id)}));
   const results:any[]=[];for(const pref of duePrefs){
    const already=await sb.from("patient_communications").select("id,status,provider_message_id").eq("patient_id",pref.patient_id).eq("report_date",date).ilike("communication_type","%Intelligent%Report%").ilike("message_preview","%Detailed%Report%pdf%").limit(1);
    if(already.error)console.error("DAILY_REPORT duplicate check failed",pref.patient_id,already.error);
    if(already.data?.length){console.log("DAILY_REPORT_SKIP_ALREADY_SENT",JSON.stringify({patient_id:pref.patient_id,date,record:already.data[0]}));results.push({patient_id:pref.patient_id,status:"skipped_already_sent"});continue}
    try{
     const pr=await sb.from("patients").select("*").eq("id",pref.patient_id).single();
     if(pr.error)throw pr.error;if(pr.data.is_active===false){results.push({patient_id:pref.patient_id,status:"skipped_inactive"});continue}
     const bytes=await makeReport(sb,pr.data,date),file=await uploadAndSign(sb,pr.data,date,bytes),wa=await sendWhatsApp(pref.recipient_mobile,pref.recipient_name||"Family Member",patientName(pr.data),date,file.url),provider=wa?.messages?.[0]?.id||null;
     const inboxError=await recordWhatsAppInbox(sb,{patient:pr.data,recipientName:pref.recipient_name||"Family Member",recipientMobile:pref.recipient_mobile,date,providerId:provider,storagePath:file.path,scheduled:true});
	     const patientLog=await sb.from("patient_communications").insert({patient_id:pr.data.id,communication_type:"Daily Intelligent Patient Report",method:"WhatsApp",recipient_type:"Relative",recipient_name:pref.recipient_name||"Family Member",recipient_number:digits(pref.recipient_mobile),report_date:date,status:"Accepted",provider_message_id:provider,message_preview:"Detailed two-page Intelligent Patient Report PDF",created_at:new Date().toISOString()});
	     if(patientLog.error)console.error("DAILY_REPORT patient history insert failed",pref.patient_id,patientLog.error);
	     const preferenceUpdate=await sb.from("patient_family_communication_preferences").update({last_report_sent_at:new Date().toISOString(),last_report_status:"Accepted by Meta",updated_at:new Date().toISOString()}).eq("patient_id",pref.patient_id);
	     if(preferenceUpdate.error)console.error("DAILY_REPORT preference timestamp update failed",pref.patient_id,preferenceUpdate.error);
	     results.push({patient_id:pr.data.id,status:"sent",provider_message_id:provider,inbox_recorded:!inboxError,patient_history_recorded:!patientLog.error,preference_updated:!preferenceUpdate.error});
     console.log("DAILY_REPORT_SENT",JSON.stringify(results[results.length-1]));
    }catch(e){const error=e instanceof Error?e.message:String(e);console.error("DAILY_REPORT_FAILED",JSON.stringify({patient_id:pref.patient_id,error}));results.push({patient_id:pref.patient_id,status:"failed",error})}
   }
   return json({ok:true,date,time,enabled:(prefs.data||[]).length,due:duePrefs.length,results});
  }
  const patientId=text(body.patient_id),date=text(body.report_date)||indiaDate();if(!patientId)return json({ok:false,error:"patient_id is required"},400);const pr=await sb.from("patients").select("*").eq("id",patientId).single();if(pr.error)return json({ok:false,error:pr.error.message},404);const bytes=await makeReport(sb,pr.data,date),file=await uploadAndSign(sb,pr.data,date,bytes);
  if(body.mode==="generate_only")return json({ok:true,report_url:file.url,storage_path:file.path,file_name:`${patientName(pr.data)} - Intelligent Patient Report - ${displayDate(date)}.pdf`});
  const wa=await sendWhatsApp(body.recipient_mobile,body.recipient_name||"Family Member",patientName(pr.data),date,file.url),provider=wa?.messages?.[0]?.id||null;
  const inboxError=await recordWhatsAppInbox(sb,{patient:pr.data,recipientName:body.recipient_name||"Family Member",recipientMobile:body.recipient_mobile,date,providerId:provider,storagePath:file.path,scheduled:false});
  return json({ok:true,report_url:file.url,storage_path:file.path,provider_message_id:provider,inbox_recorded:!inboxError});
 }catch(e){console.error(e);return json({ok:false,error:e instanceof Error?e.message:String(e)},500)}
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
