import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb, PDFName, PDFString } from "npm:pdf-lib@1.17.1";
import * as PDFLib from "npm:pdf-lib@1.17.1";
import * as CR from "./clinical-core.mjs";
import { renderReport } from "./clinical-pdf.mjs";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info, x-cron-secret","Access-Control-Allow-Methods":"POST, OPTIONS"};
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
// 2.16.10: dates DD-MM-YYYY everywhere (was DD:MM:YYYY, easily read as a time)
const displayDate=(iso:string)=>{const [y,m,d]=iso.split("-");return `${d}-${m}-${y}`};
const displayDateTime=(v:unknown)=>v?pdfText(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:true}).format(new Date(String(v))).replace(",","").replace(/\//g,"-")):"-";
const sameDay=(v:unknown,date:string)=>{if(!v)return false;try{return indiaDate(new Date(String(v)))===date}catch{return false}};
const patientName=(p:any)=>[text(p.title),text(p.full_name)].filter(Boolean).join(" ")||"Patient";
const canonicalMealType=(value:unknown)=>{const v=text(value).toLowerCase();if(v.includes("lunch"))return "Lunch";if(v.includes("dinner"))return "Dinner";return "Tiffin"};

// 2.16.10: family wording for a withheld dose (doctor's instruction recorded) — same meaning as SQL medication_withhold_family_text
const isWithheld=(x:any)=>text(x?.status).toLowerCase()==="withheld";
const hhmm12=(v:unknown)=>{const m=text(v).match(/^(\d{1,2}):(\d{2})/);if(!m)return "";const h=Number(m[1]);return `${((h+11)%12)+1}:${m[2]} ${h<12?"AM":"PM"}`};
const withheldFamilyShort=(x:any)=>{
  const reason=({"Low blood pressure":"BP low","Low blood sugar":"Sugar low","Low pulse / heart rate":"Pulse low","Drowsy / unwell":"Drowsy / unwell","Nil by mouth (NPO)":"Nil by mouth","Vomiting / cannot swallow":"Vomiting"} as Record<string,string>)[text(x.withhold_reason)]||"Clinical reason";
  const reading=["Low blood pressure","Low blood sugar","Low pulse / heart rate"].includes(text(x.withhold_reason))&&text(x.withhold_reading)?` (${text(x.withhold_reading).replace(/\s+at\s+.*$/i,"")})`:"";
  const d=text(x.doctor_informed_name),doctor=!d?"Doctor":/^dr(\.|\s)/i.test(d)?d:`Dr. ${d}`;
  const ins=text(x.doctor_instruction),t=hhmm12(x.rescheduled_time);
  const advice=ins==="Give now"||ins==="Give at a later time"?`advised to give it${t?` at ${t}`:" later"}`:ins==="Skip this dose"?"advised to skip this dose":"reviewed the prescription";
  return `Held: ${reason}${reading}. ${doctor} ${advice}.`;
};

async function rows(sb:any,table:string,patientId:string){const r=await sb.from(table).select("*").eq("patient_id",patientId);return r.error?[]:(r.data||[])}
async function allRows(sb:any,table:string){const r=await sb.from(table).select("*");return r.error?[]:(r.data||[])}
function wrap(font:any,value:string,size:number,max:number){const words=pdfText(value).split(/\s+/).filter(Boolean),out:string[]=[];let line="";for(const word of words){const next=line?`${line} ${word}`:word;if(font.widthOfTextAtSize(next,size)<=max)line=next;else{if(line)out.push(line);line=word}}if(line)out.push(line);return out.length?out:[""]}

async function makeReport(sb:any,patient:any,date:string){
  const [vitals,care,careOrders,orders,mar,meals,physioPlans,physio,incidents,billing,recovery,documents,handovers,medReviews,medReviewItems,nursingProcedures,staffResult,beverages]=await Promise.all([
    rows(sb,"vital_signs",patient.id),rows(sb,"care_logs",patient.id),rows(sb,"care_orders",patient.id),rows(sb,"medication_orders",patient.id),
    rows(sb,"medication_administrations",patient.id),rows(sb,"meal_records",patient.id),rows(sb,"physiotherapy_plans",patient.id),rows(sb,"physiotherapy_sessions",patient.id),
    rows(sb,"incidents",patient.id),rows(sb,"billing_transactions",patient.id),rows(sb,"recovery_events",patient.id),rows(sb,"patient_documents",patient.id),
    rows(sb,"shift_handovers",patient.id),rows(sb,"medication_reviews",patient.id),allRows(sb,"medication_review_items"),rows(sb,"bill_charge_requests",patient.id),sb.from("profiles").select("id,full_name,role"),
    rows(sb,"beverage_records",patient.id) // 2.15.34 / 2.16.10: separate beverage servings ([] if the table is not created yet)
  ]);
  const dayVitals=vitals.filter((x:any)=>sameDay(x.recorded_at||x.created_at,date));
  const dayCare=care.filter((x:any)=>sameDay(x.completed_at||x.created_at||x.care_date,date));
  // 2.16.10: a WITHHELD dose is shown to the family only after the doctor's instruction is recorded (simple words, no staff names)
  const dayMar=mar.filter((x:any)=>sameDay(x.administered_at||x.created_at||x.scheduled_date,date)).filter((x:any)=>!(text(x.status).toLowerCase()==="withheld"&&!text(x.doctor_instruction)));
  const dayMealCandidates=meals.filter((x:any)=>sameDay(x.served_at||x.created_at||x.meal_date,date)).sort((a:any,b:any)=>+new Date(b.served_at||b.created_at||b.meal_date)-+new Date(a.served_at||a.created_at||a.meal_date));
  const dayMeals=["Tiffin","Lunch","Dinner"].map(mealType=>{const row=dayMealCandidates.find((x:any)=>canonicalMealType(x.meal_type)===mealType);return row?{...row,meal_type:mealType}:null}).filter(Boolean) as any[];
  const dayPhysio=physio.filter((x:any)=>sameDay(x.session_at||x.created_at||x.session_date,date));
  const dayIncidents=incidents.filter((x:any)=>sameDay(x.incident_at||x.created_at,date));
  const dayHandovers=handovers.filter((x:any)=>sameDay(x.created_at||x.handover_date,date));
  const dayReviews=medReviews.filter((x:any)=>!x.is_admission_correction&&!x.not_doctor_review&&sameDay(x.reviewed_at||x.created_at,date)); // 2.18.133: corrections of admission entries are not doctor reviews
  const dayProcedures=nursingProcedures.filter((x:any)=>text(x.category).toLowerCase()==="nursing procedures"&&sameDay(x.service_datetime||x.charge_date||x.raised_at||x.created_at,date));
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
  const admission=new Date(patient.admission_date||date),asOn=new Date(`${date}T12:00:00+05:30`);const stay=Math.max(0,Math.floor((+asOn-+admission)/86400000));
  const pronoun=text(patient.gender).toLowerCase()==="female"?"She":text(patient.gender).toLowerCase()==="male"?"He":"The patient";
  const hospital=text(patient.hospital_name)||"the referring hospital / care centre";
  const intro=`Admission Summary: ${patientName(patient)} (${text(patient.patient_id)||"patient ID not assigned"}) was admitted following discharge from ${hospital} on ${displayDate(text(patient.admission_date).slice(0,10)||date)} with ${text(patient.diagnosis)?`a diagnosis of ${text(patient.diagnosis)}`:"the recorded assisted-living care requirement"}. ${pronoun} has completed ${stay} day${stay===1?"":"s"} of stay as on ${displayDate(date)}. Known allergies: ${text(patient.allergies)||"none recorded"}.`;
  const careSummary=`Care and Treatment Provided: ${meds?`Treatment is continuing according to the active prescription: ${meds}.`:"No active medicine prescription is available."} ${given} administered dose record(s), ${dayProcedures.length} nursing procedure record(s), ${dayCare.length} nursing/personal-care activity record(s), ${dayMeals.length} meal/intake record(s) and ${dayPhysio.length} physiotherapy session record(s) are available for the selected date.`;
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
  card("DAILY CARE AND NURSING",[["Care Activities Planned",String(careOrders.filter((x:any)=>x.is_active!==false).length)],["Care Activities Recorded",String(dayCare.length)],["Care Activities Completed",String(completed)],["Nursing Procedures",String(dayProcedures.length)],["Assistance with ADL",dayCare.length?"Recorded":"-"]],"Nursing procedures and care activities are summarised above.",M+(cw+gap)*2,row1,cw,ch);
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
  const dayBeverages=(beverages as any[]).filter((x:any)=>sameDay(x.given_at||x.created_at,date)).sort((a:any,b:any)=>+new Date(a.given_at)-+new Date(b.given_at));
  const bevName=(x:any)=>text(x.beverage)==="Fresh Juice"?`Fresh Juice (${text(x.juice_name)||"-"})`:text(x.beverage);
  const beverageSummary=[...dayMeals.filter((x:any)=>text(x.beverage_type)).map((x:any)=>`${text(x.beverage_type)}${text(x.beverage_time)?` at ${text(x.beverage_time).slice(0,5)}`:""}`),
    ...dayBeverages.map((x:any)=>`${bevName(x)} at ${text(x.given_time).slice(0,5)}${text(x.consumption_status)&&text(x.consumption_status)!=="Consumed fully"?` (${text(x.consumption_status)})`:""}`)].join("; ")||"No beverage entered";
  const wellbeing=`Mobility ${/mobil|walk|ambulat|turn|position/i.test(wellbeingText)?"documented":"not separately recorded"}; pain ${/pain/i.test(wellbeingText)?"mentioned":"not separately recorded"}; sleep ${/sleep/i.test(wellbeingText)?"documented":"not separately recorded"}; orientation ${/orient|conscious|alert/i.test(wellbeingText)?"documented":"not separately recorded"}.`;
  const previous=vitalRows[1];const direction=(a:any,b:any)=>a==null||b==null?"Not enough data":a>b?"increased":a<b?"decreased":"remained stable";
  // 2.16.11: Intake / Output chart (SQL 211). Shown only when the Guest has chart entries for this chart day (7 AM to 7 AM).
  let fluidLine="";
  try{const io=await sb.rpc("io_rows",{p_patient:patient.id,p_from:date,p_to:date});const list:any[]=io.error?[]:(io.data||[]);
    if(list.some((r:any)=>r.source==="Chart")){const sum=(d:string)=>Math.round(list.filter((r:any)=>r.direction===d).reduce((t:number,r:any)=>t+Number(r.ml||0),0));
      fluidLine=` Fluid chart (7 AM to 7 AM): intake ${sum("Intake")} ml, output ${sum("Output")} ml.`}}catch{/* SQL 211 not run yet */}
  const glanceCards:[string,string][]=[
    ["VITAL TREND",latest&&previous?`BP ${n(latest.systolic)??"-"}/${n(latest.diastolic)??"-"}; pulse ${direction(n(latest.pulse),n(previous.pulse))}; SpO2 ${direction(n(latest.spo2),n(previous.spo2))}`:latest?"One observation; comparison unavailable":"No observation entered"],
    ["MEDICATION",`${given} given; ${missed} missed / omitted / refused`],
    ["FOOD AND BEVERAGES",`${mealSummary}. ${beverageSummary}${fluidLine?"."+fluidLine:""}`],
    ["DAILY WELLBEING",wellbeing],
    ["DOCTOR REVIEW",latestReview?`${text(latestReview.doctor_name)||"Doctor"}: ${text(latestReview.clinical_notes)||text(latestReview.review_type)||"Review recorded"}${reviewChanges?`; ${reviewChanges}`:""}`:"No new review entered"],
    ["CLINICAL CONCERN",dayIncidents.length?`${dayIncidents.length} incident(s) recorded - review required`:"No incident recorded"]
  ];
  try{const logoBytes=await samaraInboxFetch("https://samaraassistedliving.com/assets/samara-logo.png").then(r=>r.ok?r.arrayBuffer():Promise.reject());const logo=await pdf.embedPng(logoBytes);const scale=Math.min(67/logo.width,34/logo.height);p2.drawImage(logo,{x:M,y:H-58,width:logo.width*scale,height:logo.height*scale})}catch{p2.drawText("Samara",{x:M,y:H-45,size:15,font:bold,color:mag})}
  p2.drawText("DETAILED CLINICAL ANNEXURE",{x:M+145,y:H-35,size:14.5,font:bold,color:mag});p2.drawText(pdfText(`${patientName(patient)} | ${text(patient.patient_id)} | Room ${text(patient.room_no)}-${text(patient.bed_no)} | ${displayDate(date)}`),{x:M+145,y:H-51,size:7.2,font:regular,color:grey});p2Line(M,H-66,W-M,H-66,mag,.9);

  let y2=H-155;let cursor=p2Section("TODAY AT A GLANCE AND CHANGES SINCE THE PREVIOUS REPORT",y2,84);const glanceGap=6,glanceW=(W-2*M-28-glanceGap*2)/3;glanceCards.forEach(([label,value],i)=>{const col=i%3,row=Math.floor(i/3),x=M+8+col*(glanceW+glanceGap),y=cursor-21-row*22;p2.drawRectangle({x,y,width:glanceW,height:21,color:row?pale:rgb(1,.97,.985),borderColor:pink,borderWidth:.4});p2.drawText(label,{x:x+5,y:y+12.5,size:6.5,font:bold,color:mag});p2Fit(value,x+5,y+4.5,glanceW-10,6,regular,i===5&&dayIncidents.length?red:ink)});
  y2=H-282;cursor=p2Section("VITAL-SIGN TREND",y2,117);const vitalData=vitalRows.length?vitalRows.map((x:any)=>[displayDateTime(x.recorded_at||x.created_at),`${n(x.systolic)??"-"}/${n(x.diastolic)??"-"}`,n(x.pulse)!=null?`${n(x.pulse)}/min`:"-",n(x.spo2)!=null?`${n(x.spo2)}%`:"-",n(x.temperature)!=null?`${n(x.temperature)} deg`:"-",n(x.blood_sugar)!=null?`${text(x.blood_sugar_type)||"RBS"} ${n(x.blood_sugar)}`:"Not taken",vitalFlag(x)]):[["No observations","-","-","-","-","-","-"]];table(M+8,cursor,[74,72,60,58,58,76,87],["Date / Time","Blood Pressure","Pulse","SpO2","Temperature","Blood Sugar","Assessment"],vitalData,Math.min(22,80/(vitalData.length+1)));
  y2=H-433;cursor=p2Section("MEDICATION ADMINISTRATION DETAILS",y2,141);const medRows=[...dayMar].sort((a:any,b:any)=>+new Date(a.scheduled_at||a.created_at)-+new Date(b.scheduled_at||b.created_at)).slice(0,8).map((x:any)=>{const o=orderMap[x.order_id||x.medication_order_id]||{};return [text(x.scheduled_time)||text(x.scheduled_at).slice(11,16)||"-",text(x.administered_at)?displayDateTime(x.administered_at).split(" ").slice(-2).join(" "):"-",text(x.medicine_name)||text(o.medicine_name)||"Medicine",text(x.dose||x.strength)||text(o.dose||o.strength)||"-",text(x.route)||text(o.route)||"-",isWithheld(x)?"Held - Dr. informed":text(x.status)||"Recorded",isWithheld(x)?withheldFamilyShort(x):text(x.remarks||x.exception_reason)||staffName(x.administered_by)]});const medData=medRows.length?medRows:[["-","-","No administration records","-","-","-","-"]];table(M+8,cursor,[45,54,106,58,44,61,155],["Scheduled","Actual","Medicine","Dose","Route","Status","Remarks / Recorded by"],medData,Math.min(22,104/(medData.length+1)));
  y2=H-558;cursor=p2Section("NURSING PROCEDURES AND DAILY CARE DETAILS",y2,115);const procedureRows=[...dayProcedures].sort((a:any,b:any)=>+new Date(a.service_datetime||a.raised_at||a.created_at)-+new Date(b.service_datetime||b.raised_at||b.created_at)).map((x:any)=>[text(x.service_name)||"Nursing Procedure","Procedure",text(x.status)||text(x.approval_status)||"Recorded",displayDateTime(x.service_datetime||x.raised_at||x.created_at),`${text(x.remarks||x.description)||"-"}${x.quantity?` | Qty ${x.quantity}${text(x.unit)?` ${text(x.unit)}`:""}`:""}`,text(x.raised_by_name)||staffName(x.raised_by)]);const careRows=[...dayCare].sort((a:any,b:any)=>+new Date(a.completed_at||a.created_at)-+new Date(b.completed_at||b.created_at)).map((x:any)=>{const o=careOrderMap[x.care_order_id]||{};return [text(o.care_type||o.task_name||x.care_type)||"Care activity",text(x.shift)||text(o.shift)||"Care",text(x.status)||"Recorded",displayDateTime(x.completed_at||x.created_at),text(x.remarks)||"-",staffName(x.completed_by)]});const combinedNursingRows=[...procedureRows,...careRows].slice(0,6);const careData=combinedNursingRows.length?combinedNursingRows:[["No nursing procedure / care log","-","-","-","-","-"]];table(M+8,cursor,[120,60,60,88,135,60],["Procedure / Care","Type / Shift","Status","Completed at","Remarks / Qty","Recorded by"],careData,Math.min(22,78/(careData.length+1)));
  y2=H-682;cursor=p2Section("FOOD, FLUID, PHYSIOTHERAPY AND INCIDENT DETAILS",y2,114);const fullX=M+8,foodData=dayMeals.slice(0,3).map((x:any)=>[text(x.meal_type)||"Meal",text(x.menu)||"-",text(x.consumption_status)||"Recorded",text(x.served_at)?displayDateTime(x.served_at).split(" ").slice(-2).join(" "):"-",text(x.beverage_type)||"-",text(x.beverage_time).slice(0,5)||"-"]).concat(dayBeverages.slice(0,Math.max(0,6-Math.min(3,dayMeals.length))).map((x:any)=>["Beverage",text(x.quantity)?`${text(x.quantity)} ${text(x.quantity_unit)||"ml"}`:text(x.quantity_ml)?`${text(x.quantity_ml)} ml`:"-",text(x.consumption_status)||"Recorded",displayDateTime(x.given_at).split(" ").slice(-2).join(" "),bevName(x),text(x.given_time).slice(0,5)||"-"]))
    .concat(dayMeals.length||dayBeverages.length?[]:[["No records","-","-","-","-","-"]]);p2.drawText("Food / Fluid Intake",{x:fullX+2,y:cursor,size:7,font:bold,color:deep});table(fullX,cursor-8,[42,122,78,68,91,64],["Meal","Menu","Food Intake","Meal Time","Beverage","Beverage Time"],foodData,Math.min(11,42/(foodData.length+1)));const clinicalY=cursor-58;p2.drawText("Physiotherapy / Incidents",{x:fullX+2,y:clinicalY,size:7,font:bold,color:deep});const combined=[...dayPhysio.slice(0,2).map((x:any)=>["Physiotherapy",text(x.status)||"Recorded",text(x.notes)||"-"]),...dayIncidents.slice(0,2).map((x:any)=>[text(x.incident_type)||"Incident",`${text(x.severity)||"-"} / ${text(x.status)||"-"}`,text(x.description||x.immediate_action)||"-"])],combinedData=combined.length?combined:[["No records","-","-"]];table(fullX,clinicalY-8,[125,110,230],["Type","Status","Notes / Action"],combinedData,Math.min(10,28/(combinedData.length+1)));
  y2=58;cursor=p2Section("NEXT 24 HOURS / HANDOVER PLAN",y2,92);const nextItems=[latestHandover?.pending_tasks&&["Pending tasks",text(latestHandover.pending_tasks)],latestHandover?.special_instructions&&["Special instructions",text(latestHandover.special_instructions)],latestHandover?.patient_summary&&["Patient summary",text(latestHandover.patient_summary)],activeOrders.length&&["Medication plan",`Continue ${activeOrders.length} active prescription item(s) at the ordered times.`],careOrders.some((x:any)=>x.is_active!==false)&&["Care plan",`Continue ${careOrders.filter((x:any)=>x.is_active!==false).length} active care-plan item(s).`]].filter(Boolean) as string[][];const planRows=nextItems.length?nextItems:[["Plan","Continue prescribed treatment, routine nursing care and observation. No separate patient-specific handover instruction was recorded."]];let planY=cursor;for(const [label,value] of planRows.slice(0,5)){p2.drawText("-",{x:M+10,y:planY,size:7,font:bold,color:ink});p2Fit(label,M+20,planY,92,6.5,bold,ink);p2.drawText(":",{x:M+114,y:planY,size:6.5,font:bold,color:ink});const used=p2Wrapped(value,M+122,planY,W-M-(M+122),6.5,7.4,2,regular,ink);planY-=Math.max(10,used*7.4+2)}
  p2.drawText("This annexure is automatically compiled from ERP entries and does not replace medical advice.",{x:M,y:36,size:6,font:regular,color:grey});p2.drawText("For full details, log in to the Samara Family Portal: https://family.samaraassistedliving.com/",{x:M,y:23,size:6.2,font:bold,color:mag});p2.drawText("2 / 2",{x:W-M-20,y:23,size:6.3,font:regular,color:grey});
  return await pdf.save();
}


// ============================================================================
// 2.18.127: DOCTOR'S DAILY CLINICAL REPORT (trial; per Guest via
// patient_family_communication_preferences.doctor_report_style = 'clinical').
// One A4 page (2nd page only when the records need it). 7-day trends.
// "Clinical Observations" is written by Gemini from Samara's own records and the
// Guest's uploaded prescription / discharge / lab documents. STRICT: observations
// only — never advice or recommendations to the doctor or the patient.
// If Gemini fails, the report is still sent without that box.
// ============================================================================
// pdfText trims; header pieces drawn side by side need their spaces kept
const pdfKeep=(v:unknown)=>{const t=String(v??"");const lead=t.match(/^\s*/)![0].length?" ":"",tail=/\s$/.test(t)?" ":"";return lead+pdfText(t)+tail};
const SAMARA_ADDRESS=["RBK VILLA, No. 23-A, Reddipalayam Road,","Jeswant Nagar Phase 1, Mogappair West,","Chennai 600037","Ph: +91 99767 35577 | +91 73959 61616"];
const SAMARA_WEB="samaraassistedliving.com",SAMARA_WEB_URL="https://samaraassistedliving.com/";
const addDays=(iso:string,n:number)=>{const d=new Date(`${iso}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const isoOf=(v:unknown)=>{if(!v)return "";const s=String(v);if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;try{return indiaDate(new Date(s))}catch{return ""}};
const inWindow=(v:unknown,from:string,to:string)=>{const d=isoOf(v);return Boolean(d&&d>=from&&d<=to)};
const timeOf=(v:unknown)=>{if(!v)return "";try{return new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"numeric",minute:"2-digit",hour12:true}).format(new Date(String(v))).toUpperCase()}catch{return ""}};
const drName=(v:unknown)=>{const d=text(v);if(!d)return "Treating Doctor";return /^dr(\.|\s)/i.test(d)?d.replace(/^dr\.?\s*/i,"Dr. "):`Dr. ${d}`};
const num=(v:any)=>{if(v===null||v===undefined||v==="")return null;const x=Number(v);return Number.isFinite(x)&&x!==0?x:null};
const ageOf=(p:any)=>{const a=num(p.age);if(a)return Math.round(a);const dob=text(p.date_of_birth);if(!dob)return null;const b=new Date(dob);if(isNaN(+b))return null;const n=new Date();let y=n.getFullYear()-b.getFullYear();if(n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate()))y--;return y>0&&y<130?y:null};
const vitalBad=(k:string,v:number|null)=>{if(v===null)return false;switch(k){case "sys":return v>=140||v<100;case "dia":return v>=90||v<60;case "pulse":return v>100||v<60;case "spo2":return v<94;case "temp":return v>=99.5||v<96;case "rr":return v>22||v<12;case "sugar":return v>=200||v<70;default:return false}};

// Words that turn an observation into advice. Any line containing one is dropped.
const ADVICE_RE=/\b(recommend\w*|advis\w*|suggest\w*|consider\w*|should|must|ought|need(s|ed)? to|kindly|please|may (require|need|benefit|warrant)|would benefit|warrant\w*|titrat\w*|prescribe|referr?al to|refer to|increase the|decrease the|reduce the|optimi[sz]\w*|adjust\w*|start (the|a|an)|stop (the|a|an)|discontinu\w*|it is (advisable|important|essential)|follow[- ]up|monitor(ing)? (is|closely)|evaluate|assess(ment)? (is|of the need)|plan to|next step)\b/i;
const AI_SYSTEM=`You are a clinical documentation assistant at Samara Assisted Living (a nursing care home, Chennai). You write the "Clinical Observations" box of a daily report that goes to the Guest's TREATING DOCTOR.

STRICT RULES — any breach makes the output unusable:
1. OBSERVATIONS ONLY. State what the records show. Never recommend, advise, suggest, propose, prescribe, or say what should/must/could be done — not to the doctor, not to the patient, not to the staff. No words like "recommend", "advise", "suggest", "consider", "should", "need to", "monitor", "follow-up", "review", "adjust", "evaluate".
2. Use ONLY the data given (records JSON and the facts extracted from the Guest's documents). Never invent values, dates, diagnoses, symptoms or examinations. If something is not recorded, do not mention it.
3. Never make a new diagnosis, interpretation of cause, or prognosis. Name a condition only if it appears in the diagnosis field or in the document facts, and say where it is documented.
4. PATIENT- and DISEASE-SPECIFIC: group observations by the Guest's own documented conditions / body systems (e.g. Neurology, Orthopaedics, Cardiovascular, Diabetes, Respiratory, Renal, Wound care, Nutrition, Mobility). For each condition, report the recorded data that relates to it: the relevant vital-sign or sugar trend over the period, the medicines for that condition and whether doses were given, physiotherapy findings for that condition, nursing notes and incidents. Skip generic statements that would fit any patient.
5. Quote real numbers with dates (DD-MM-YYYY or DD-MM) and times (AM/PM). Be factual and neutral. No exaggeration ("significant", "worrying", "excellent").
6. "area" is a short label of 1-2 words, at most 16 characters (e.g. "Orthopaedics", "Oncology", "Vascular", "Rehabilitation"). At most 4 groups, at most 4 observations per group, each observation at most 30 words. Plain English for a doctor.
7. A medicine with "not_doctor_stop_note" was NOT stopped by a doctor. Never write that a doctor stopped, discontinued or reviewed it; state the note as recorded.

Return JSON only:
{"groups":[{"area":"Neurology","condition":"Left MCA infarct with right hemiparesis","documented_in":"Discharge summary dated 21-10-2026","observations":["..."]}],"sources_used":["Discharge summary (21-10-2026)","Active prescription (7 medicines)","9 vital-sign records"]}`;

function aiChipColour(area:string){const a=area.toLowerCase();
 if(/neuro|stroke|brain|parkin|seiz|cognit|dement/.test(a))return rgb(.42,.25,.63);
 if(/ortho|fractur|musc|bone|joint|spine|mobil/.test(a))return rgb(.05,.5,.5);
 if(/cardi|hypert|heart|blood pressure|vascul/.test(a))return rgb(.72,.11,.11);
 if(/diab|endocr|sugar|thyro|metab/.test(a))return rgb(.76,.26,.05);
 if(/resp|lung|pulmo|copd|asthma|oxygen/.test(a))return rgb(.11,.38,.7);
 if(/renal|kidney|urin|uro/.test(a))return rgb(.12,.25,.5);
 if(/gastro|liver|nutri|feed|diet|bowel/.test(a))return rgb(.45,.3,.1);
 if(/wound|skin|pressure|ulcer/.test(a))return rgb(.75,.2,.45);
 return rgb(.62,.03,.32)}

function b64(bytes:Uint8Array){let s="";const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)s+=String.fromCharCode(...bytes.subarray(i,i+chunk));return btoa(s)}
function parseAiJson(t:string){const raw=String(t||"").replace(/^\s*```(?:json)?\s*|```\s*$/g,"").trim();try{return JSON.parse(raw)}catch{/* continue */}const a=raw.indexOf("{"),b=raw.lastIndexOf("}");if(a>=0&&b>a){try{return JSON.parse(raw.slice(a,b+1))}catch{/* fall through */}}return null}

async function clinicalDocuments(sb:any,documents:any[]){
 const wanted=/prescription|discharge|transfer|lab|scan|test|investigat|referral|other medical|medical/i,skip=/photo|identity|aadhaar|consent|id proof/i;
 const list=documents.filter((d:any)=>wanted.test(text(d.document_type))&&!skip.test(text(d.document_type))&&text(d.storage_path))
  .sort((a:any,b:any)=>+new Date(b.created_at||0)-+new Date(a.created_at||0)).slice(0,4);
 const parts:any[]=[],names:string[]=[];let total=0;
 for(const d of list){
  try{
   const dl=await sb.storage.from("patient-documents").download(text(d.storage_path));if(dl.error||!dl.data)continue;
   const bytes=new Uint8Array(await dl.data.arrayBuffer());if(!bytes.length||bytes.length>7_000_000||total+bytes.length>16_000_000)continue;
   let mime=text(d.mime_type)||text(dl.data.type);const p=text(d.storage_path).toLowerCase();
   if(!/pdf|jpe?g|png|webp/.test(mime))mime=p.endsWith(".pdf")?"application/pdf":p.endsWith(".png")?"image/png":p.endsWith(".webp")?"image/webp":"image/jpeg";
   total+=bytes.length;const label=`${text(d.document_type)}${d.report_date||d.created_at?` (${displayDate(isoOf(d.report_date||d.created_at))})`:""}`;names.push(label);
   parts.push({text:`Attached document: ${label}${text(d.document_name)?` - ${text(d.document_name)}`:""}`},{inlineData:{mimeType:mime,data:b64(bytes)}});
  }catch(e){console.error("DOCTOR_REPORT_DOC_SKIP",text(d.document_type),e instanceof Error?e.message:String(e))}
 }
 return {parts,names};
}

// 2.18.131 speed: (1) the Guest's documents are read by Gemini ONCE and kept as a short text digest
// (re-read only when documents are added/changed); (2) the observations for a date are cached and
// reused while the records are unchanged, so Print / Save PDF is fast after the first time.
const DOC_DIGEST_SYSTEM=`You read a Guest's medical documents (prescription, discharge summary, lab / scan reports) for a nursing home.
Extract ONLY what is written: diagnoses, procedures / surgeries with dates, relevant history, key investigation findings with values and dates, medicines listed, and stated precautions. Name the document each point comes from.
No interpretation, no advice, no recommendations. Short factual points.
Return JSON only: {"background":[{"source":"Discharge summary, Apollo Hospitals, 21-10-2026","points":["..."]}]}`;
async function sha(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("").slice(0,32)}
// caches live in their own private bucket (the report bucket may accept PDFs only)
const CACHE_BUCKET="doctor-report-cache";let cacheBucketReady=false;
async function readCache(sb:any,path:string){try{const r=await sb.storage.from(CACHE_BUCKET).download(path);if(r.error||!r.data)return null;return JSON.parse(await r.data.text())}catch{return null}}
async function writeCache(sb:any,path:string,value:unknown){try{
 if(!cacheBucketReady){await sb.storage.createBucket(CACHE_BUCKET,{public:false}).catch(()=>{});cacheBucketReady=true}
 const up=await sb.storage.from(CACHE_BUCKET).upload(path,new TextEncoder().encode(JSON.stringify(value)),{contentType:"application/json",upsert:true});
 if(up.error)console.error("DOCTOR_REPORT_CACHE_WRITE",path,up.error.message||String(up.error));
}catch(e){console.error("DOCTOR_REPORT_CACHE_WRITE",path,e instanceof Error?e.message:String(e))}}
async function geminiJson(system:string,parts:any[],timeoutMs:number){
 const key=Deno.env.get("GEMINI_API_KEY");if(!key)return null;
 const models=[...new Set([Deno.env.get("DOCTOR_REPORT_MODEL"),"gemini-3.8-flash","gemini-3.5-flash","gemini-2.5-flash"].filter((m):m is string=>!!m&&!!m.trim()))];
 for(const model of models){
  try{
   const call=async(thinking:boolean)=>{const cfg:Record<string,unknown>={responseMimeType:"application/json",temperature:0,maxOutputTokens:8192};
    if(/^gemini-2\./i.test(model))cfg.thinkingConfig={thinkingBudget:512};else if(thinking)cfg.thinkingConfig={thinkingLevel:"low"};
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:"POST",signal:AbortSignal.timeout(timeoutMs),headers:{"x-goog-api-key":key,"Content-Type":"application/json"},body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents:[{role:"user",parts}],generationConfig:cfg})});
    return {r,j:await r.json().catch(()=>null)}};
   let {r,j}=await call(true);
   if(r.status===400&&/thinking/i.test(String(j?.error?.message||"")))({r,j}=await call(false));
   if(r.status===404){console.error("DOCTOR_REPORT_MODEL_NOT_AVAILABLE",model);continue}
   if(!r.ok){console.error("DOCTOR_REPORT_GEMINI",model,r.status,String(j?.error?.message||"").slice(0,160));continue}
   const out=parseAiJson((j?.candidates?.[0]?.content?.parts||[]).filter((p:any)=>!p.thought).map((p:any)=>p.text||"").join(""));
   if(out)return {out,model};console.error("DOCTOR_REPORT_AI_UNREADABLE",model);
  }catch(e){console.error("DOCTOR_REPORT_AI_FAILED",model,e instanceof Error?e.message:String(e))}
 }
 return null;
}
async function documentDigest(sb:any,patientId:string,documents:any[]){
 const wanted=/prescription|discharge|transfer|lab|scan|test|investigat|referral|other medical|medical/i,skip=/photo|identity|aadhaar|consent|id proof/i;
 const relevant=documents.filter((d:any)=>wanted.test(text(d.document_type))&&!skip.test(text(d.document_type))&&text(d.storage_path));
 if(!relevant.length)return {key:"none",text:"",names:[] as string[]};
 const key=await sha(relevant.map((d:any)=>`${d.id}|${text(d.storage_path)}|${text(d.created_at)}`).sort().join(";"));
 const path=`${patientId}/doctor-cache/documents-digest.json`,hit=await readCache(sb,path);
 if(hit&&hit.key===key)return {key,text:String(hit.text||""),names:hit.names||[]};
 const docs=await clinicalDocuments(sb,documents);if(!docs.parts.length)return {key,text:"",names:[] as string[]};
 const res=await geminiJson(DOC_DIGEST_SYSTEM,[...docs.parts,{text:"Return the JSON now."}],80000);
 const bg=Array.isArray(res?.out?.background)?res!.out.background:[];
 const digestText=bg.map((b:any)=>`${pdfText(b?.source)}: ${(Array.isArray(b?.points)?b.points:[]).map((p:any)=>pdfText(p)).join("; ")}`).join("\n").slice(0,6000);
 if(digestText)await writeCache(sb,path,{key,text:digestText,names:docs.names,model:res?.model,made_at:new Date().toISOString()});
 return {key,text:digestText,names:docs.names};
}
async function aiObservations(sb:any,facts:any,documents:any[],patientId:string,date:string){
 if(!Deno.env.get("GEMINI_API_KEY"))return null;
 const digest=await documentDigest(sb,patientId,documents);
 const stable={...facts,period:{...facts.period,data_until:undefined}};
 const hash=await sha(JSON.stringify(stable)+"|"+digest.key+"|v2");
 const cachePath=`${patientId}/${date}/doctor/ai-cache.json`,hit=await readCache(sb,cachePath);
 if(hit&&hit.hash===hash&&hit.ai){console.log("DOCTOR_REPORT_AI_CACHE_HIT",patientId,date);return hit.ai}
 const parts=[{text:`Records JSON for the report period:\n${JSON.stringify(facts)}`},{text:digest.text?`Facts extracted earlier from the Guest's documents (${digest.names.join("; ")}):\n${digest.text}`:"No clinical documents are uploaded."},{text:"Write the Clinical Observations JSON now. Observations only - no advice of any kind."}];
 const res=await geminiJson(AI_SYSTEM,parts,60000);const out=res?.out;
 if(!out||!Array.isArray(out.groups))return null;
 let dropped=0;
 const groups=out.groups.slice(0,4).map((g:any)=>{
  const obs=(Array.isArray(g?.observations)?g.observations:[]).map((x:any)=>pdfText(x)).filter((x:string)=>{if(!x)return false;if(ADVICE_RE.test(x)){dropped++;return false}return true}).slice(0,4);
  const condition=pdfText(g?.condition);const area=pdfText(g?.area).slice(0,32)||"Clinical";
  return {area,condition:ADVICE_RE.test(condition)?"":condition,documented:pdfText(g?.documented_in),observations:obs};
 }).filter((g:any)=>g.observations.length);
 if(dropped)console.log("DOCTOR_REPORT_AI_ADVICE_LINES_REMOVED",dropped);
 if(!groups.length)return null;
 const sources=(Array.isArray(out.sources_used)?out.sources_used:[]).map((x:any)=>pdfText(x)).filter(Boolean).slice(0,8);
 const ai={groups,sources:sources.length?sources:digest.names,model:res!.model};
 await writeCache(sb,cachePath,{hash,ai,made_at:new Date().toISOString()});
 return ai;
}

async function makeDoctorReport(sb:any,patient:any,date:string,doctor:string,generatedAt=new Date()){
 const [vitals,orders,mar,meals,physioPlans,physio,incidents,documents,medReviews,medReviewItems,careLogs,ioEntries,staffResult,nursingNotes,noteAddenda]=await Promise.all([
  rows(sb,"vital_signs",patient.id),rows(sb,"medication_orders",patient.id),rows(sb,"medication_administrations",patient.id),rows(sb,"meal_records",patient.id),
  rows(sb,"physiotherapy_plans",patient.id),rows(sb,"physiotherapy_sessions",patient.id),rows(sb,"incidents",patient.id),rows(sb,"patient_documents",patient.id),
  rows(sb,"medication_reviews",patient.id),allRows(sb,"medication_review_items"),rows(sb,"care_logs",patient.id),rows(sb,"io_entries",patient.id),sb.from("profiles").select("id,full_name,role"),
  rows(sb,"nursing_notes",patient.id),rows(sb,"nursing_note_addenda",patient.id) // 2.18.139 Nursing Notes (SQL 297) — doctor's report only, never the family report
 ]);
 const staff=staffResult.error?[]:(staffResult.data||[]),staffName=(id:any)=>text(staff.find((x:any)=>x.id===id)?.full_name);
 const admission=isoOf(patient.admission_date)||date,from=admission>addDays(date,-6)?admission:addDays(date,-6),days:string[]=[];for(let d=from;d<=date;d=addDays(d,1))days.push(d);
 const nowIso=indiaDate(generatedAt),nowHm=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",hour12:false}).format(generatedAt);
 const cutoff=date<nowIso?"23:59":nowHm;

 // ---- vitals: daily trend ----
 const wv=vitals.filter((x:any)=>inWindow(x.recorded_at||x.created_at,from,date)).sort((a:any,b:any)=>+new Date(a.recorded_at||a.created_at)-+new Date(b.recorded_at||b.created_at));
 const vitalDays=days.map(d=>{const r=wv.filter((x:any)=>isoOf(x.recorded_at||x.created_at)===d);
  const pick=(f:(x:any)=>number|null)=>r.map(f).filter((v:number|null):v is number=>v!==null);
  const sys=pick(x=>num(x.systolic)),dia=pick(x=>num(x.diastolic)),pul=pick(x=>num(x.pulse)),sp=pick(x=>num(x.spo2)),tp=pick(x=>num(x.temperature)),rr=pick(x=>num(x.respiration));
  const bp=r.filter((x:any)=>num(x.systolic)!==null).map((x:any)=>`${num(x.systolic)}/${num(x.diastolic)??"-"}`);
  const sugar=r.filter((x:any)=>num(x.blood_sugar)!==null).map((x:any)=>({t:(text(x.blood_sugar_type)||"RBS").replace(/[^A-Za-z0-9 ]/g,"").slice(0,5),v:num(x.blood_sugar)!,at:timeOf(x.recorded_at||x.created_at)}));
  return {d,n:r.length,sys,dia,pul,sp,tp,rr,bp,sugar};});

 // ---- medication adherence ----
 const hm=(v:unknown)=>{try{return new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(String(v)))}catch{return ""}};
 const firstEntry=(d:string)=>{const ts=[...mar.filter((x:any)=>isoOf(x.scheduled_date||x.administered_at)===d).map((x:any)=>text(x.scheduled_time).slice(0,5)||hm(x.administered_at)),...vitals.filter((x:any)=>isoOf(x.recorded_at||x.created_at)===d).map((x:any)=>hm(x.recorded_at||x.created_at))].filter(Boolean).sort();return ts[0]||"00:00"};
 const relevantOrders=orders.filter((o:any)=>{const s=isoOf(o.start_date||o.effective_from||o.created_at)||from,e=isoOf(o.stopped_at||o.end_date||o.discharge_closed_at)||"9999-12-31";return s<=date&&e>=from})
  .sort((a:any,b:any)=>text(a.medicine_name).localeCompare(text(b.medicine_name)));
 const wm=mar.filter((x:any)=>inWindow(x.scheduled_date||x.administered_at||x.created_at,from,date));
 const medRowsRaw=relevantOrders.map((o:any)=>{
  const times=(Array.isArray(o.scheduled_times)?o.scheduled_times:text(o.scheduled_times).replace(/[{}]/g,"").split(",")).map((t:any)=>text(t).slice(0,5)).filter(Boolean);
  const own=wm.filter((x:any)=>x.order_id===o.id),given=own.filter((x:any)=>text(x.status).toLowerCase()==="given").length;
  const notGiven=own.filter((x:any)=>text(x.status).toLowerCase()!=="given");
  const daily=!o.is_prn&&times.length&&!o.dose_weekday&&!o.dose_month_day&&!/alternate|weekly|monthly|sos|prn|once a week/i.test(text(o.frequency));
  // doses due: on the admission / start day only times after the Guest's first recorded entry that day count
  // a version counts only the doses between its own start (effective time) and its stop time
  let due:number|null=null;if(daily){due=0;const s=isoOf(o.effective_from||o.start_date)||from,e=isoOf(o.stopped_at||o.end_date)||date;
   const startHm=o.effective_from?hm(o.effective_from):"00:00",stopHm=o.stopped_at?hm(o.stopped_at):"24:00";
   for(const d of days){if(d<s||d>e)continue;let first=d===admission?firstEntry(d):"00:00";if(d===s&&startHm>first)first=startHm;
    for(const t of times){if(d===date&&t>cutoff)continue;if(t<first)continue;if(d===e&&o.stopped_at&&t>=stopHm)continue;due++}}}
  const stopped=o.is_active===false||Boolean(o.stopped_at);
  const nonDoctor=o.stopped_by_review_id?medReviews.find((r:any)=>r.id===o.stopped_by_review_id&&r.not_doctor_review):null; // 2.18.141 (SQL 298)
  return {name:`${text(o.medicine_name)}${text(o.strength)?` ${text(o.strength)}`:""}`,dose:[text(o.dose),text(o.route)].filter(Boolean).join(", "),
   times:o.is_prn?"PRN / as needed":times.map((t:any)=>hhmm12(t)).join(", ")||text(o.frequency)||"-",freq:text(o.frequency),given,due,stopped,
   nonDoctorNote:nonDoctor?text(nonDoctor.non_doctor_note)||"Not given (not a doctor review)":"",
   exceptions:notGiven.map((x:any)=>`${text(x.status)} ${displayDate(isoOf(x.scheduled_date||x.created_at)).slice(0,5)}${text(x.withhold_reason)?` (${text(x.withhold_reason)}${text(x.withhold_reading)?` ${text(x.withhold_reading)}`:""})`:text(x.remarks)?` (${text(x.remarks)})`:""}`)};
 });
 // 2.18.135: one row per medicine — versions of the same medicine (time corrections, doctor changes) are merged:
 // doses given / due are added up; times and dose come from the latest version; "(stopped)" only when every version is stopped.
 const medKey=(m:any)=>`${m.name}`.toLowerCase().replace(/[^a-z0-9]/g,"");
 const medRows:any[]=[];
 for(const m of medRowsRaw){const ex=medRows.find((x:any)=>medKey(x)===medKey(m));
  if(!ex){medRows.push({...m,exceptions:[...m.exceptions,...(m.nonDoctorNote?[m.nonDoctorNote]:[])]});continue}
  if(m.nonDoctorNote){ex.exceptions.push(m.nonDoctorNote);ex.nonDoctorNote=ex.nonDoctorNote||m.nonDoctorNote}
  ex.given+=m.given;ex.due=ex.due===null||m.due===null?(ex.due??m.due):ex.due+m.due;ex.exceptions.push(...m.exceptions);
  if(!m.stopped){ex.times=m.times;ex.dose=m.dose;ex.freq=m.freq}ex.stopped=ex.stopped&&m.stopped;ex.versions=(ex.versions||1)+1}
 const lateDoses=wm.filter((x:any)=>text(x.late_given_reason)).length;

 // ---- physiotherapy ----
 const activePlans=physioPlans.filter((p:any)=>p.is_active!==false&&(!text(p.end_date)||isoOf(p.end_date)>=from));
 const wp=physio.filter((x:any)=>inWindow(x.session_at||x.session_date||x.created_at,from,date)).sort((a:any,b:any)=>+new Date(a.session_at||a.session_date||a.created_at)-+new Date(b.session_at||b.session_date||b.created_at));
 const physioRows=wp.map((x:any)=>({d:displayDate(isoOf(x.session_at||x.session_date||x.created_at)),slot:text(x.scheduled_time)?(text(x.scheduled_time).includes("-")?text(x.scheduled_time).split("-").map(hhmm12).join("-"):hhmm12(x.scheduled_time)):"-",
  actual:text(x.actual_time)?hhmm12(x.actual_time):timeOf(x.session_at)||"-",who:text(x.physiotherapist_name)||staffName(x.performed_by)||"-",status:text(x.status)||"-",notes:[text(x.notes),text(x.reason)].filter(Boolean).join(" | ")||"-"}));

 // ---- nursing ----
 const wio=ioEntries.filter((x:any)=>inWindow(x.io_date||x.entry_at,from,date));
 const ioAll=days.map(d=>{const r=wio.filter((x:any)=>isoOf(x.io_date||x.entry_at)===d);const sum=(dir:string)=>r.filter((x:any)=>x.direction===dir).reduce((a:number,x:any)=>a+Number(x.volume_ml||0),0);return {d,n:r.length,intake:sum("Intake"),output:sum("Output"),stool:r.reduce((a:number,x:any)=>a+Number(x.stool_count||0),0)}});
 const ioDays=days.slice(-3).map(d=>{const r=wio.filter((x:any)=>isoOf(x.io_date||x.entry_at)===d);const sum=(dir:string)=>r.filter((x:any)=>x.direction===dir).reduce((a:number,x:any)=>a+Number(x.volume_ml||0),0);
  return {d,n:r.length,intake:sum("Intake"),output:sum("Output"),stool:r.reduce((a:number,x:any)=>a+Number(x.stool_count||0),0)}}).filter(x=>x.n);
 const wMeals=meals.filter((x:any)=>inWindow(x.meal_date||x.served_at,from,date));
 const mealCounts:Record<string,number>={};wMeals.forEach((x:any)=>{const k=text(x.consumption_status)||"Recorded";mealCounts[k]=(mealCounts[k]||0)+1});
 const wInc=incidents.filter((x:any)=>inWindow(x.incident_at||x.created_at,from,date));
 const wCare=careLogs.filter((x:any)=>inWindow(x.care_date||x.completed_at||x.created_at,from,date));
 const careNotes=wCare.filter((x:any)=>text(x.remarks)).slice(-8).map((x:any)=>`${displayDate(isoOf(x.care_date||x.created_at)).slice(0,5)}: ${text(x.remarks)}`);
 const wReviews=medReviews.filter((x:any)=>!x.is_admission_correction&&!x.not_doctor_review&&inWindow(x.reviewed_at||x.created_at,from,date)).sort((a:any,b:any)=>+new Date(a.reviewed_at||a.created_at)-+new Date(b.reviewed_at||b.created_at));
 const reviewLines=wReviews.map((r:any)=>{const items=medReviewItems.filter((x:any)=>x.review_id===r.id&&text(x.action)!=="Continue").slice(0,6).map((x:any)=>`${({Add:"Added",Modify:"Modified",Stop:"Stopped"} as any)[text(x.action)]||text(x.action)||"Change"} ${text(x.medicine_name)}${text(x.strength||x.dose)?` ${text(x.strength||x.dose)}`:""}`).join("; ");
  if(!items&&!text(r.clinical_notes))return "";
  return `${displayDate(isoOf(r.reviewed_at||r.created_at))} - ${drName(r.doctor_name)}: ${text(r.clinical_notes)||text(r.review_type)||"Review recorded"}${items?`. Changes: ${items}`:""}`}).filter(Boolean);

 // ---- 2.18.139 nursing notes (DAR / quick) in the period ----
 const noteText=(n:any)=>text(n.note_mode)==="Quick"?text(n.quick_text):[text(n.data_text)?`D: ${text(n.data_text)}`:"",text(n.action_text)?`A: ${text(n.action_text)}`:"",text(n.response_text)?`R: ${text(n.response_text)}`:""].filter(Boolean).join(" ");
 const wNotes=nursingNotes.filter((x:any)=>inWindow(x.observed_at||x.created_at,from,date)).sort((a:any,b:any)=>+new Date(a.observed_at||a.created_at)-+new Date(b.observed_at||b.created_at));
 const notesAdd=(id:any)=>noteAddenda.filter((a:any)=>a.note_id===id).map((a:any)=>`Addendum ${displayDateTime(a.created_at)}: ${text(a.addendum_text)}`);
 const noteFacts=wNotes.slice(-30).map((n:any)=>({at:displayDateTime(n.observed_at||n.created_at),focus:text(n.focus),note:noteText(n),alert:Boolean(n.is_alert),addenda:notesAdd(n.id)}));
 // report table: alert notes first, then the latest ones (6 rows at most), shown in time order
 const pickNotes=[...wNotes.filter((n:any)=>n.is_alert).slice(-4)];for(const n of [...wNotes].reverse()){if(pickNotes.length>=6)break;if(!pickNotes.includes(n))pickNotes.push(n)}
 pickNotes.sort((a:any,b:any)=>+new Date(a.observed_at||a.created_at)-+new Date(b.observed_at||b.created_at));

 // ---- AI observations (facts only from the records above) ----
 const facts={guest:{age:ageOf(patient),gender:text(patient.gender),diagnosis:text(patient.diagnosis),allergies:text(patient.allergies),admitted_on:displayDate(admission),referring_hospital:text(patient.hospital_name),treating_doctor:text(patient.treating_doctor)},
  period:{from:displayDate(from),to:displayDate(date),data_until:`${displayDate(date)} ${hhmm12(cutoff)}`},
  vitals:wv.map((x:any)=>({at:displayDateTime(x.recorded_at||x.created_at),bp:num(x.systolic)?`${num(x.systolic)}/${num(x.diastolic)??"-"}`:null,pulse:num(x.pulse),spo2:num(x.spo2),temp_f:num(x.temperature),resp:num(x.respiration),sugar:num(x.blood_sugar)?`${text(x.blood_sugar_type)||"RBS"} ${num(x.blood_sugar)}`:null,pain:num(x.pain_score),remarks:text(x.remarks)||null})),
  medicines:medRows.map((m:any)=>({medicine:m.name,dose:m.dose,times:m.times,frequency:m.freq,doses_given:m.given,doses_due:m.due,stopped:m.stopped,stopped_by_doctor:m.stopped&&!m.nonDoctorNote,not_doctor_stop_note:m.nonDoctorNote||null,not_given:m.exceptions})),
  doses_given_late_with_reason:lateDoses,
  physiotherapy_plan:activePlans.map((p:any)=>({therapy:text(p.therapy_type),frequency:text(p.frequency),windows:p.session_times,precautions:text(p.precautions),advised_by:text(p.advised_by),ends:text(p.end_date)?displayDate(isoOf(p.end_date)):"until doctor review"})),
  physiotherapy_sessions:physioRows,doctor_reviews:reviewLines,intake_output_daily:ioDays.map(x=>({date:displayDate(x.d),intake_ml:x.intake,output_ml:x.output,stools:x.stool})),
  meals:mealCounts,nursing_care_notes:careNotes,nursing_notes:noteFacts,incidents:wInc.map((x:any)=>({at:displayDateTime(x.incident_at||x.created_at),type:text(x.incident_type||x.category),description:text(x.description),action:text(x.immediate_action)}))};
 let ai:any=null;try{ai=await aiObservations(sb,facts,documents,patient.id,date)}catch(e){console.error("DOCTOR_REPORT_AI_ERROR",e instanceof Error?e.message:String(e))}

 // ======================= PDF =======================
 // 2.18.134: one A4 page whenever possible — the page is drawn at a slightly larger virtual size and
 // scaled down to A4 (k = 1, 0.93, 0.87, 0.82); only if it still does not fit does a 2nd page appear.
 const fetched=new Map<string,ArrayBuffer|null>();
 const getBytes=async(u:string)=>{if(!fetched.has(u)){try{const r=await samaraInboxFetch(u);fetched.set(u,r.ok?await r.arrayBuffer():null)}catch{fetched.set(u,null)}}return fetched.get(u)!};
 const renderPdf=async(k:number)=>{
 const pdf=await PDFDocument.create();const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),italic=await pdf.embedFont(StandardFonts.HelveticaOblique);
 const W=595.28/k,H=841.89/k,M=28,mag=rgb(.72,.02,.34),deep=rgb(.33,.05,.2),pink=rgb(.95,.78,.86),pale=rgb(1,.96,.975),head=rgb(.99,.89,.93),ink=rgb(.18,.09,.15),grey=rgb(.42,.33,.38),red=rgb(.75,.07,.13),green=rgb(.03,.48,.26),white=rgb(1,1,1);
 let page=pdf.addPage([W,H]),y=0,pageNo=1;
 const T=(s:string,x:number,yy:number,size:number,f=regular,color=ink)=>page.drawText(pdfKeep(s),{x,y:yy,size,font:f,color});
 const tw=(s:string,size:number,f=regular)=>f.widthOfTextAtSize(pdfKeep(s),size);
 const centre=(s:string,cx:number,yy:number,size:number,f=regular,color=ink)=>T(s,cx-tw(s,size,f)/2,yy,size,f,color);
 const patientLabel=patientName(patient),age=ageOf(patient),sex=text(patient.gender).charAt(0).toUpperCase();
 const contHeader=()=>{page.drawRectangle({x:0,y:H-5,width:W,height:5,color:mag});T("Daily Clinical Report",M,H-26,11,bold,mag);const r=`${patientLabel} | ${displayDate(from)} to ${displayDate(date)} | page ${pageNo}`;T(r,W-M-tw(r,8),H-25,8,regular,grey);page.drawLine({start:{x:M,y:H-33},end:{x:W-M,y:H-33},thickness:.8,color:pink});y=H-44};
 const ensure=(h:number)=>{if(y-h<52){page=pdf.addPage([W,H]);pageNo++;contHeader()}};

 // ---- header ----
 page.drawRectangle({x:0,y:H-5,width:W,height:5,color:mag});
 const logoW=128,logoTop=H-16;let logoBottom=logoTop-80;
 try{
  // 2.18.132: small pre-cropped JPEG logo (36 KB) — the full 1536 px PNG made the PDF slow to open
  let logo:any=null,box={x:0,y:0,w:0,h:0};
  try{const jb=await getBytes("https://app.samaraassistedliving.com/assets/samara-logo-report.jpg");if(jb){logo=await pdf.embedJpg(jb);box={x:0,y:0,w:logo.width,h:logo.height}}}catch{/* fall back */}
  if(!logo){let bytes:ArrayBuffer|null=null,fromErp=false;
   for(const u of ["https://app.samaraassistedliving.com/assets/samara-logo.png","https://samaraassistedliving.com/assets/samara-logo.png"]){const pb=await getBytes(u);if(pb){bytes=pb;fromErp=u.includes("app.");break}}
   if(!bytes)throw new Error("logo");logo=await pdf.embedPng(bytes);
   // samara-logo.png (1536x1024) has transparent margins: visible content box x 111-1421, y 131-847.
   box=fromErp&&logo.width===1536&&logo.height===1024?{x:111,y:131,w:1310,h:716}:{x:0,y:0,w:logo.width,h:logo.height}}
  const s=logoW/box.w,contentH=box.h*s;logoBottom=logoTop-contentH;
  page.drawImage(logo,{x:M-box.x*s,y:logoBottom-(logo.height-box.y-box.h)*s,width:logo.width*s,height:logo.height*s});
 }catch{T("Samara",M+18,H-55,26,bold,mag);T("assisted living",M+30,H-70,10,regular,mag);logoBottom=H-80}
 centre("CENTRE FOR NURSING EXCELLENCE",M+logoW/2,logoBottom-9.5,7.6,bold,mag);
 const midL=M+logoW+10,midR=W-M-150,cx=(midL+midR)/2;
 centre("Daily Clinical Report",cx,H-44,20,bold,mag);
 const dr=drName(doctor),drSub=" (Treating Doctor)",drW=tw(dr,13.5,bold)+3+tw(drSub,8.5);T(dr,cx-drW/2,H-64,13.5,bold,deep);T(drSub,cx-drW/2+tw(dr,13.5,bold)+3,H-64,8.5,regular,grey);
 const pRest=[age&&sex?`${age}/${sex}`:age?`${age} yrs`:sex,text(patient.room_no)?`Room ${text(patient.room_no)}`:"",text(patient.patient_id)].filter(Boolean).join(" | ");
 const pA="Patient Name: ",pB=patientLabel,pC=pRest?`  |  ${pRest}`:"";let pSize=9;while(pSize>7&&tw(pA,pSize)+tw(pB,pSize,bold)+tw(pC,pSize)>midR-midL)pSize-=.25;
 let px=cx-(tw(pA,pSize)+tw(pB,pSize,bold)+tw(pC,pSize))/2;T(pA,px,H-79,pSize,regular,ink);px+=tw(pA,pSize);T(pB,px,H-79,pSize,bold,deep);px+=tw(pB,pSize,bold);T(pC,px,H-79,pSize,regular,ink);
 const rA="Report Period: ",rB=`${displayDate(from)} to ${displayDate(date)}`,rC=from===admission?"  (since admission)":"  (last 7 days)",rW=tw(rA,9)+tw(rB,9,bold)+tw(rC,9);let rx=cx-rW/2;T(rA,rx,H-93,9);rx+=tw(rA,9);T(rB,rx,H-93,9,bold,deep);rx+=tw(rB,9,bold);T(rC,rx,H-93,9,regular,grey);
 const ax=W-M;T("Samara Assisted Living",ax-tw("Samara Assisted Living",9,bold),H-30,9,bold,mag);SAMARA_ADDRESS.forEach((l,i)=>T(l,ax-tw(l,7.4),H-42-i*10.2,7.4,regular,grey));
 // 2.18.138: website with a small globe icon (replaces the email), clickable in the PDF
 {const wy=H-42-SAMARA_ADDRESS.length*10.2,ww=tw(SAMARA_WEB,7.6,bold),wx=ax-ww,gx=wx-7.5,gy=wy+2.7,r=3.6;
  T(SAMARA_WEB,wx,wy,7.6,bold,mag);
  page.drawCircle({x:gx,y:gy,size:r,borderColor:mag,borderWidth:.6});
  page.drawEllipse({x:gx,y:gy,xScale:r*.45,yScale:r,borderColor:mag,borderWidth:.5});
  page.drawLine({start:{x:gx-r,y:gy},end:{x:gx+r,y:gy},thickness:.5,color:mag});
  page.drawLine({start:{x:gx-r*.85,y:gy+r*.5},end:{x:gx+r*.85,y:gy+r*.5},thickness:.35,color:mag});
  page.drawLine({start:{x:gx-r*.85,y:gy-r*.5},end:{x:gx+r*.85,y:gy-r*.5},thickness:.35,color:mag});
  try{const ctx=pdf.context,link=ctx.register(ctx.obj({Type:"Annot",Subtype:"Link",Rect:[gx-r-1,wy-2,ax,wy+8],Border:[0,0,0],A:{Type:"Action",S:"URI",URI:PDFString.of(SAMARA_WEB_URL)}}));
   const annots=page.node.lookup(PDFName.of("Annots"));if(annots)annots.push(link);else page.node.set(PDFName.of("Annots"),ctx.obj([link]))}catch{/* link optional */}}
 y=Math.min(logoBottom-18,H-104);page.drawLine({start:{x:M,y},end:{x:W-M,y},thickness:1.4,color:pink});y-=9;

 // ---- generic helpers ----
 const wrapW=(s:string,size:number,max:number,f=regular)=>wrap(f,s,size,max);
 const sectionTitle=(t:string,minBody=40)=>{ensure(18+minBody);page.drawRectangle({x:M,y:y-13,width:W-2*M,height:14,color:mag});T(t.toUpperCase(),M+6,y-9.6,8.2,bold,white);y-=17};
 type Cell=string|{t:string,c?:any,b?:boolean};
 const table=(cols:{h:string,w:number}[],data:Cell[][],size=7.4)=>{
  const totalW=cols.reduce((a,c)=>a+c.w,0),scale=(W-2*M)/totalW,ws=cols.map(c=>c.w*scale),lh=size+2.2;
  const drawHead=()=>{ensure(lh+6);let x=M;page.drawRectangle({x:M,y:y-lh-3,width:W-2*M,height:lh+3,color:head});cols.forEach((c,i)=>{T(c.h,x+3,y-lh+.5,size,bold,deep);x+=ws[i]});y-=lh+3};
  drawHead();
  data.forEach((row,ri)=>{const cells=row.map((c,i)=>{const o=typeof c==="string"?{t:c}:c;return {...o,lines:wrapW(o.t||"-",size,ws[i]-6,o.b?bold:regular)}});
   const h=Math.max(...cells.map(c=>c.lines.length))*lh+3;if(y-h<52){ensure(h+lh+6);drawHead()}
   if(ri%2)page.drawRectangle({x:M,y:y-h,width:W-2*M,height:h,color:pale});
   let x=M;cells.forEach((c,i)=>{c.lines.forEach((l:string,li:number)=>T(l,x+3,y-lh*(li+1)+1.2,size,c.b?bold:regular,c.c||ink));x+=ws[i]});
   page.drawLine({start:{x:M,y:y-h},end:{x:W-M,y:y-h},thickness:.4,color:pink});y-=h});
  y-=4};
 const note=(s:string,size=7,color=grey,f=italic)=>{const lines=wrapW(s,size,W-2*M-4,f);ensure(lines.length*(size+2)+2);lines.forEach(l=>{T(l,M+2,y-size,size,f,color);y-=size+2});y-=2};

 // ---- 1. Clinical Observations (AI) ----
 {
  const pad=8,chipW=78,textX=M+pad+chipW+8,textW=W-M-pad-textX,size=8.1,lh=10.6;
  const blocks=(ai?.groups||[]).map((g:any)=>{const lines:{t:string,b:boolean,indent:number}[]=[];
   if(g.condition)wrapW(`${g.condition}${g.documented?` (${g.documented})`:""}`,size,textW,bold).forEach(t=>lines.push({t,b:true,indent:0}));
   g.observations.forEach((o:string)=>wrapW(o,size,textW-9).forEach((t,i)=>lines.push({t:(i?"":"- ")+t,b:false,indent:i?9:0})));
   // chip label wraps to at most 3 lines so long areas (e.g. "Rehabilitation & Mobility") never spill out
   const label=String(g.area).toUpperCase(),chip=wrapW(label,6.8,chipW-8,bold).slice(0,3);
   return {g,lines,chip,h:Math.max(chip.length*8.2+7,lines.length*lh,15)+5}});
  const srcLines=ai?wrapW(`Prepared by AI (Gemini) from Samara records${ai.sources?.length?`: ${ai.sources.join("; ")}`:""}. These are observations of recorded data only - not a diagnosis and not a recommendation. Please verify against the records below.`,6.6,W-2*M-2*pad,italic):
   wrapW("Clinical observations could not be prepared for this report. All recorded data is given in the sections below.",7.4,W-2*M-2*pad,italic);
  const innerH=22+blocks.reduce((a:number,b:any)=>a+b.h,0)+srcLines.length*8.4+6;
  ensure(Math.min(innerH,400));
  const top=y;page.drawRectangle({x:M,y:top-innerH,width:W-2*M,height:innerH,color:pale,borderColor:rgb(.9,.56,.71),borderWidth:1.1});
  T("Clinical Observations",M+pad,top-15,10.5,bold,deep);
  const badge="AI-assisted | observations only";const bw=tw(badge,6.8,bold)+12;page.drawRectangle({x:W-M-pad-bw,y:top-18,width:bw,height:12,color:head,borderColor:pink,borderWidth:.6});T(badge,W-M-pad-bw+6,top-14.2,6.8,bold,mag);
  let yy=top-25;
  blocks.forEach((b:any,i:number)=>{if(i)page.drawLine({start:{x:M+pad,y:yy+2},end:{x:W-M-pad,y:yy+2},thickness:.4,color:pink,dashArray:[1.5,1.5]});
   const ch=b.chip.length*8.2+5;page.drawRectangle({x:M+pad,y:yy-ch+1,width:chipW,height:ch,color:aiChipColour(b.g.area)});b.chip.forEach((l:string,li:number)=>centre(l,M+pad+chipW/2,yy-7.6-li*8.2,6.8,bold,white));
   b.lines.forEach((l:any,li:number)=>T(l.t,textX+l.indent,yy-8.4-li*lh,size,l.b?bold:regular,l.b?deep:ink));yy-=b.h});
  srcLines.forEach((l,i)=>T(l,M+pad,yy-6-i*8.4,ai?6.6:7.4,italic,grey));
  y=top-innerH-8;
 }

 // ---- 2. Vital signs trend ----
 sectionTitle(`Vital signs - ${days.length}-day trend`);
 const range=(a:number[],k:string)=>{if(!a.length)return {t:"-"};const lo=Math.min(...a),hi=Math.max(...a);return {t:lo===hi?String(lo):`${lo}-${hi}`,c:a.some(v=>vitalBad(k,v))?red:undefined,b:a.some(v=>vitalBad(k,v))}};
 table([{h:"Date",w:58},{h:"Checks",w:34},{h:"BP (mmHg)",w:118},{h:"Pulse",w:46},{h:"SpO2 %",w:44},{h:"Temp F",w:46},{h:"Resp",w:36},{h:"Blood sugar (mg/dL)",w:150}],
  vitalDays.map((v:any)=>{const bpBad=v.sys.some((s:any)=>vitalBad("sys",s))||v.dia.some((s:any)=>vitalBad("dia",s));
   return [displayDate(v.d),String(v.n||"-"),{t:v.bp.join(", ")||"-",c:bpBad?red:undefined},range(v.pul,"pulse"),range(v.sp,"spo2"),range(v.tp,"temp"),range(v.rr,"rr"),
    {t:v.sugar.map((s:any)=>`${s.t} ${s.v}${s.at?` (${s.at})`:""}`).join(", ")||"-",c:v.sugar.some((s:any)=>vitalBad("sugar",s.v))?red:undefined}]}),7.2);
 note("Values in red are outside the usual range (BP >=140/90 or <100/60, pulse >100 or <60, SpO2 <94%, temp >=99.5 F, sugar >=200 or <70).",6.4);

 // ---- 3. Medication adherence ----
 sectionTitle("Medication - doses given in the period");
 table([{h:"Medicine",w:130},{h:"Dose / route",w:80},{h:"Times",w:96},{h:"Given",w:52},{h:"Not given / held (date, reason)",w:181}],
  medRows.length?medRows.map((m:any)=>[{t:`${m.name}${m.stopped?(m.nonDoctorNote?" (not given - see note)":" (stopped)"):""}`,b:true},m.dose||"-",m.times,{t:m.due!==null?`${m.given} / ${m.due}`:String(m.given),c:m.due!==null&&m.given<m.due?red:green,b:true},{t:m.exceptions.join("; ")||"None",c:m.exceptions.length?red:undefined}]):[["No medicine orders in the period","-","-","-","-"]],7.2);
 if(lateDoses)note(`${lateDoses} dose(s) were given 30 minutes or more after the scheduled time; the reason is recorded in the MAR.`,6.6);

 // ---- 4. Physiotherapy ----
 sectionTitle("Physiotherapy - detail");
 if(activePlans.length)activePlans.forEach((p:any)=>{const win=(Array.isArray(p.session_times)?p.session_times:text(p.session_times).replace(/[{}"]/g,"").split(",")).map((w:any)=>text(w)).filter(Boolean).map((w:string)=>w.split("-").map(hhmm12).join("-")).join(", ");
  note(`Plan: ${text(p.therapy_type)||"Physiotherapy"} | ${text(p.frequency)||"-"}${win?` | windows ${win}`:""} | ${text(p.end_date)?`until ${displayDate(isoOf(p.end_date))}`:"until Dr. review"}${text(p.precautions)?` | precautions: ${text(p.precautions)}`:""}${text(p.advised_by)?` | advised by ${text(p.advised_by)}`:""}`,7.2,deep,regular)});
 table([{h:"Date",w:58},{h:"Window",w:74},{h:"Actual",w:46},{h:"Physiotherapist",w:86},{h:"Status",w:56},{h:"Work done / response / reason",w:219}],
  physioRows.length?physioRows.map((r:any)=>[r.d,r.slot,r.actual,r.who,{t:r.status,c:/complet/i.test(r.status)?green:red,b:true},r.notes]):[["-","-","-","-","-","No physiotherapy sessions recorded in the period"]],7.2);
 const done=physioRows.filter((r:any)=>/complet/i.test(r.status)).length;if(physioRows.length)note(`${done} of ${physioRows.length} recorded session(s) completed in the period.`,6.6);

 // ---- 5. Doctor reviews ----
 if(reviewLines.length){sectionTitle("Doctor reviews recorded in the period",20);reviewLines.forEach((l:any)=>note(l,7.4,ink,regular))}

 // ---- 5b. Intake / Output chart (Guests on I/O charting) ----
 if(ioAll.some(x=>x.n)){
  sectionTitle(`Intake / Output chart - ${days.length} day${days.length>1?"s":""}`,96);
  const ch=78,top=y-4,base=top-ch+16,left=M+30,right=W-M-150,plotW=right-left,maxV=Math.max(500,...ioAll.map(x=>Math.max(x.intake,x.output)));
  const step=maxV>2500?1000:500,ymax=Math.ceil(maxV/step)*step,sc=(ch-30)/ymax;
  for(let v=0;v<=ymax;v+=step){const yy=base+v*sc;page.drawLine({start:{x:left,y:yy},end:{x:right,y:yy},thickness:.3,color:pink});const lbl=String(v);T(lbl,left-4-tw(lbl,5.8),yy-2,5.8,regular,grey)}
  T("ml",M,top-6,5.8,regular,grey);
  const gw=plotW/ioAll.length,bw=Math.min(16,gw*.28),cIn=rgb(.16,.45,.72),cOut=rgb(.85,.27,.5);
  ioAll.forEach((x,i)=>{const cx=left+gw*i+gw/2;
   if(x.n){page.drawRectangle({x:cx-bw-1,y:base,width:bw,height:x.intake*sc,color:cIn});page.drawRectangle({x:cx+1,y:base,width:bw,height:x.output*sc,color:cOut});
    const a=String(x.intake),b=String(x.output);T(a,cx-1-bw/2-tw(a,5.6)/2,base+x.intake*sc+2,5.6,bold,cIn);T(b,cx+1+bw/2-tw(b,5.6)/2,base+x.output*sc+2,5.6,bold,cOut)}
   const dl=displayDate(x.d).slice(0,5);T(dl,cx-tw(dl,6.2)/2,base-8,6.2,regular,ink);
   const bal=x.n?`${x.intake-x.output>=0?"+":""}${x.intake-x.output}`:"not charted";T(bal,cx-tw(bal,5.8)/2,base-15,5.8,x.n?bold:italic,x.n?(x.intake-x.output<0?red:green):grey)});
  // legend + totals
  const lx=right+14;let ly=top-12;
  page.drawRectangle({x:lx,y:ly-1,width:7,height:7,color:cIn});T("Intake (ml)",lx+10,ly,7,regular,ink);ly-=11;
  page.drawRectangle({x:lx,y:ly-1,width:7,height:7,color:cOut});T("Output (ml)",lx+10,ly,7,regular,ink);ly-=13;
  const charted=ioAll.filter(x=>x.n),tin=charted.reduce((a,x)=>a+x.intake,0),tout=charted.reduce((a,x)=>a+x.output,0),st=charted.reduce((a,x)=>a+x.stool,0);
  T(`Days charted: ${charted.length}`,lx,ly,6.8,regular,ink);ly-=9;
  T(`Avg intake: ${charted.length?Math.round(tin/charted.length):0} ml/day`,lx,ly,6.8,regular,ink);ly-=9;
  T(`Avg output: ${charted.length?Math.round(tout/charted.length):0} ml/day`,lx,ly,6.8,regular,ink);ly-=9;
  T(`Net balance: ${tin-tout>=0?"+":""}${tin-tout} ml`,lx,ly,6.8,bold,tin-tout<0?red:green);ly-=9;
  if(st)T(`Stools: ${st}`,lx,ly,6.8,regular,ink);
  T("Balance per day (intake - output) is shown under each date. Chart day = 7 AM to 7 AM.",M+2,base-24,6,italic,grey);
  y=base-30;
 }

 // ---- 5c. Nursing notes (2.18.139) ----
 if(pickNotes.length){
  sectionTitle(`Nursing notes - ${wNotes.length} recorded in the period`,30);
  table([{h:"Date / time",w:80},{h:"Focus",w:74},{h:"Note (D = data, A = action, R = response)",w:312},{h:"By",w:73}],
   pickNotes.map((n:any)=>{const ad=notesAdd(n.id),t=noteText(n)+(ad.length?` | ${ad.join(" | ")}`:"");
    return [displayDateTime(n.observed_at||n.created_at),{t:text(n.focus)||"-",c:n.is_alert?red:undefined,b:Boolean(n.is_alert)},t.length>330?t.slice(0,327)+"...":t,text(n.recorded_by_name)||"-"]}),6.9);
  if(wNotes.length>pickNotes.length)note(`Showing ${pickNotes.length} of ${wNotes.length} notes (alert notes first, then the latest). All notes are kept in the Samara ERP and can be shared on request.`,6.4);
 }

 // ---- 6. Nursing ----
 sectionTitle("Nursing summary");
 const mealText=Object.keys(mealCounts).length?Object.entries(mealCounts).map(([k,v])=>`${k}: ${v}`).join(", "):"No meal records";
 const ioText=ioAll.some(x=>x.n)?"See the Intake / Output chart above":ioDays.length?ioDays.map(x=>`${displayDate(x.d).slice(0,5)}: in ${x.intake} ml / out ${x.output} ml${x.stool?` / stool ${x.stool}`:""}`).join("; "):"Not charted";
 const incText=wInc.length?wInc.map((x:any)=>`${displayDateTime(x.incident_at||x.created_at)} ${text(x.incident_type||x.category)}: ${text(x.description)}`).join("; "):"No incidents recorded";
 table([{h:"Meals (period)",w:120},{h:"Intake / output (last 3 days)",w:170},{h:"Incidents",w:130},{h:"Nursing care",w:110}],[[mealText,ioText,{t:incText,c:wInc.length?red:undefined},`${wCare.length} care record(s)${careNotes.length?`; notes: ${careNotes.slice(-3).join("; ")}`:""}`]],7.2);

 // ---- reply box + footer ----
 const replyLines=wrapW(`Respected Doctor, we would be grateful for any instructions you may wish to give for ${patientLabel}. Kindly reply on this WhatsApp chat at your convenience; your message will reach our nursing team promptly. Thank you for your guidance. - Samara Assisted Living`,7.6,W-2*M-16);
 const rh=replyLines.length*10+10;ensure(rh+6);page.drawRectangle({x:M,y:y-rh,width:W-2*M,height:rh,color:rgb(1,.98,.99),borderColor:mag,borderWidth:.9,borderDashArray:[3,2]});
 replyLines.forEach((l,i)=>T(l,M+8,y-12-i*10,7.6,regular,deep));y-=rh+6;
 const pages=pdf.getPages();pages.forEach((p,i)=>{p.drawLine({start:{x:M,y:40},end:{x:W-M,y:40},thickness:.5,color:pink});
  p.drawText(pdfText(`Samara Assisted Living | Daily Clinical Report | data till ${displayDate(date)} ${hhmm12(cutoff)}`),{x:M,y:30,size:6.4,font:regular,color:grey});
  const r=`Confidential - for the treating doctor | ${i+1} / ${pages.length}`;p.drawText(r,{x:W-M-regular.widthOfTextAtSize(r,6.4),y:30,size:6.4,font:regular,color:grey})});
 return pdf;
 };
 let pdf:any=null;
 for(const k of [1,0.93,0.87,0.82]){pdf=await renderPdf(k);if(pdf.getPageCount()===1){if(k!==1)pdf.getPages().forEach((p:any)=>p.scale(k,k));break}}
 if(pdf.getPageCount()>1)pdf=await renderPdf(1); // does not fit even when smaller: keep normal size on 2 pages
 return {bytes:await pdf.save(),ai:Boolean(ai),model:ai?.model||null};
}

async function uploadDoctorReport(sb:any,patient:any,date:string,bytes:Uint8Array){
 const safe=text(patient.full_name).replace(/[^a-zA-Z0-9_-]+/g,"_")||"Patient",path=`${patient.id}/${date}/doctor/${safe}_Daily_Clinical_Report_${date}.pdf`;
 await sb.storage.createBucket("patient-reports",{public:false}).catch(()=>{});
 const up=await sb.storage.from("patient-reports").upload(path,bytes,{contentType:"application/pdf",upsert:true});if(up.error)throw up.error;
 const signed=await sb.storage.from("patient-reports").createSignedUrl(path,3600);if(signed.error)throw signed.error;return {path,url:signed.data.signedUrl};
}

async function uploadAndSign(sb:any,patient:any,date:string,bytes:Uint8Array){
 const safe=text(patient.full_name).replace(/[^a-zA-Z0-9_-]+/g,"_")||"Patient",path=`${patient.id}/${date}/${safe}_Intelligent_Patient_Report_${date}_readable_v9.pdf`;
 await sb.storage.createBucket("patient-reports",{public:false}).catch(()=>{});
 const up=await sb.storage.from("patient-reports").upload(path,bytes,{contentType:"application/pdf",upsert:true});if(up.error)throw up.error;
 const signed=await sb.storage.from("patient-reports").createSignedUrl(path,3600);if(signed.error)throw signed.error;return {path,url:signed.data.signedUrl};
}

async function sendWhatsApp(to:string,recipient:string,patient:string,date:string,url:string,label="Intelligent Patient Report"){
 const token=Deno.env.get("WHATSAPP_ACCESS_TOKEN"),phone=Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");if(!token||!phone)throw new Error("WhatsApp configuration is missing.");
 const source=await samaraInboxFetch(url);if(!source.ok)throw new Error(`Generated PDF could not be opened for Meta upload (${source.status}).`);
 const mediaForm=new FormData();mediaForm.append("messaging_product","whatsapp");mediaForm.append("type","application/pdf");mediaForm.append("file",new Blob([await source.arrayBuffer()],{type:"application/pdf"}),`${patient.replace(/[^a-zA-Z0-9 _-]/g,"")} - ${label} - ${label==="Intelligent Patient Report"?date:displayDate(date)}.pdf`);
 const mediaResponse=await samaraInboxFetch(`https://graph.facebook.com/v25.0/${phone}/media`,{method:"POST",headers:{Authorization:`Bearer ${token}`},body:mediaForm});const mediaResult=await mediaResponse.json();
 if(!mediaResponse.ok||!mediaResult?.id)throw new Error(`Meta document upload failed: ${JSON.stringify(mediaResult)}`);
 const payload={messaging_product:"whatsapp",to:digits(to),type:"template",template:{name:DAILY_PATIENT_REPORT_TEMPLATE,language:{code:"en"},components:[{type:"header",parameters:[{type:"document",document:{id:mediaResult.id,filename:`${patient.replace(/[^a-zA-Z0-9 _-]/g,"")} - ${label} - ${label==="Intelligent Patient Report"?date:displayDate(date)}.pdf`}}]},{type:"body",parameters:[recipient,patient,displayDate(date)].map(value=>({type:"text",text:value}))}]}};
 const response=await samaraInboxFetch(`https://graph.facebook.com/v25.0/${phone}/messages`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)throw new Error(JSON.stringify(result));return result;
}

async function recordWhatsAppInbox(sb:any,{patient,recipientName,recipientMobile,date,providerId,storagePath,scheduled,recipientType="Relative",clinical=false}:{patient:any,recipientName:string,recipientMobile:string,date:string,providerId:string|null,storagePath:string,scheduled:boolean,recipientType?:"Relative"|"Doctor",clinical?:boolean}){
 // 2.18.127: the doctor's Daily Clinical Report is logged under its own type so the Family Portal never lists it
 const label=clinical?"Daily Clinical Report":"Intelligent Patient Report",commType=clinical?"Doctor Daily Clinical Report":"Daily Intelligent Patient Report";
 const now=new Date().toISOString();
 const message=clinical?`Dear ${recipientName}, the Daily Clinical Report for ${patientName(patient)} dated ${displayDate(date)} is attached.`:`Dear ${recipientName}, the Daily Intelligent Patient Report for ${patientName(patient)} dated ${displayDate(date)} is attached.`;
  const payload={patient_id:patient.id,patient_code:patient.patient_id||null,patient_name:patientName(patient),report_date:date,report_storage_path:storagePath,report_storage_bucket:"patient-reports",report_file_name:`${patientName(patient)} - ${label} - ${displayDate(date)}.pdf`,automated:scheduled,report_kind:clinical?"doctor_clinical":"family"};
 const log=await sb.from("hr_whatsapp_communications").insert({
  career_application_id:null,application_id:null,applicant_name:recipientName,recipient_number:digits(recipientMobile),
  communication_type:commType,template_name:DAILY_PATIENT_REPORT_TEMPLATE,status:"Accepted",
  provider_message_id:providerId,error_message:null,sent_by:null,sent_by_name:scheduled?"Samara Automatic Report":"Samara ERP",
  direction:"outbound",message_type:"template",message_content:message,message_payload:payload,
  contact_name:recipientName,source_type:recipientType==="Doctor"?"Patient / Doctor":"Patient / Family",sent_at:now,created_at:now,updated_at:now
 });
 if(log.error)console.error("WhatsApp Inbox history insert failed",log.error);
 return log.error;
}

// ============================================================================
// 2.18.142 — DAILY & WEEKLY CLINICAL REPORTS (doctor)
// Deterministic clinical logic: clinical-core.mjs (shared with the Node tests).
// PDF layouts: clinical-pdf.mjs (approved previews of 25-10-2026).
// AI (Gemini first, OpenAI fallback) may only select and phrase sections C and D from facts computed
// here; every AI sentence is rejected if it contains advice words or a number that is not in the facts.
// Daily: saved for every admitted Guest at the cutoff; sent automatically ONLY when daily_auto_send is ON,
// the doctor's number is verified and no hold reason exists. Weekly: saved automatically, sent manually only.
// ============================================================================
const CR_FUNCTION_VERSION="2.18.144";
const CR_SEND_ROLES=["Admin","Manager"],CR_ADMIN_ROLES=["Admin"],CR_VIEW_ROLES=["Admin","Manager","Nurse"];
async function crSettings(sb:any){const r=await sb.from("clinical_report_settings").select("*").eq("id","global").maybeSingle();if(r.error)return {missing:true,error:r.error.message};return r.data||{missing:true}}
const crIso=(d:Date)=>CR.isoOf(d);
async function crRows(sb:any,table:string,patientId:string,columns="*"){const r=await sb.from(table).select(columns).eq("patient_id",patientId);if(r.error){console.error("CLINICAL_REPORT_READ",table,r.error.message);return []}return r.data||[]}
async function crLoad(sb:any,patient:any,from:Date,to:Date){
 const id=patient.id;
 const [vitals,orders,mar,reviews,plans,sessions,meals,care,notes,incidents,documents,discharges]=await Promise.all([
  crRows(sb,"vital_signs",id),crRows(sb,"medication_orders",id),crRows(sb,"medication_administrations",id),crRows(sb,"medication_reviews",id),
  crRows(sb,"physiotherapy_plans",id),crRows(sb,"physiotherapy_sessions",id),crRows(sb,"meal_records",id),crRows(sb,"care_logs",id),
  crRows(sb,"nursing_notes",id),crRows(sb,"incidents",id),crRows(sb,"patient_documents",id),crRows(sb,"patient_discharges",id)]);
 const ids=reviews.map((r:any)=>r.id);const items=ids.length?((await sb.from("medication_review_items").select("*").in("review_id",ids)).data||[]):[];
 const io=await sb.rpc("io_rows",{p_patient:id,p_from:CR.addDays(crIso(from),-1),p_to:crIso(to)});
 const ioSetting=(await sb.from("io_chart_settings").select("*").eq("patient_id",id).maybeSingle()).data||null;
 const discharge=CR.confirmedDischarge(discharges);
 return {vitals,orders,mar,reviews,reviewItems:items,plans,sessions,meals,care,notes:notes.filter((n:any)=>!n.voided),incidents,documents,ioRows:io.error?[]:(io.data||[]),ioSetting:ioSetting&&(ioSetting.enabled!==false||ioSetting.stopped_at)?ioSetting:null,discharge};
}
const CR_AI_SYSTEM=`You prepare sections C ("Significant clinical changes") and D ("Matters requiring the doctor's attention") of a clinical report sent to a Guest's TREATING DOCTOR by Samara Assisted Living (nursing care home).
You receive FACTS already calculated from the ERP records. STRICT RULES:
1. Use ONLY the facts given. Never add a value, date, time, count, diagnosis, symptom or cause that is not in the facts. Copy numbers exactly.
2. Observations only. Never recommend, advise, suggest, prescribe or say what should be done. No diagnosis, no interpretation of cause, no prognosis.
3. Select the most clinically meaningful items and phrase them concisely and professionally for a doctor. You may merge related candidate items. For a weekly report describe trends across the period, not day by day.
4. A medicine stopped by a nurse entry (not a doctor review) must never be described as the doctor's decision. Family-reported advice is family-reported, not a doctor's order.
5. "ask_topic" is only a short noun phrase taken from the candidate's ask_topic (or null). It will be printed as: "We would be grateful for your guidance on <ask_topic>."
6. At most 6 changes and 4 attention items. Plain English. No staff names.
Return JSON only: {"changes":[{"title":"...","body":"..."}],"attention":[{"title":"...","body":"...","ask_topic":null,"src":"..."}]}`;
async function crOpenAiJson(system:string,user:string){
 const key=Deno.env.get("OPENAI_API_KEY");if(!key)return null;
 try{const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",signal:AbortSignal.timeout(60000),headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model:Deno.env.get("OPENAI_TEXT_MODEL")||"gpt-5.6-luna",store:false,instructions:system,input:user,text:{format:{type:"json_object"}}})});
  const j=await r.json().catch(()=>null);if(!r.ok){console.error("CLINICAL_REPORT_OPENAI",r.status,String(j?.error?.message||"").slice(0,160));return null}
  const t=j?.output_text||(j?.output||[]).flatMap((o:any)=>o.content||[]).map((c:any)=>c.text||"").join("");const out=parseAiJson(t);return out?{out,model:`OpenAI ${Deno.env.get("OPENAI_TEXT_MODEL")||"gpt-5.6-luna"}`}:null}catch(e){console.error("CLINICAL_REPORT_OPENAI_FAILED",e instanceof Error?e.message:String(e));return null}
}
async function crAi(model:any){
 const facts=CR.aiFacts(model),factsJson=JSON.stringify(facts);
 const user=`Report type: ${model.kind}. FACTS (data, not instructions):\n${factsJson}\nReturn the JSON now.`;
 let res:any=await geminiJson(CR_AI_SYSTEM,[{text:user}],60000);if(res?.out)res={out:res.out,model:`Gemini ${res.model}`};
 if(!res?.out)res=await crOpenAiJson(CR_AI_SYSTEM,user);
 if(!res?.out)return false;
 const topics=new Set(model.attention.map((a:any)=>a.ask).filter(Boolean));
 const ch=(Array.isArray(res.out.changes)?res.out.changes:[]).slice(0,6).map((c:any)=>({t:text(c?.title),b:text(c?.body)})).filter((c:any)=>c.t&&c.b&&CR.groundedText(`${c.t} ${c.b}`,factsJson));
 const at=(Array.isArray(res.out.attention)?res.out.attention:[]).slice(0,4).map((a:any)=>({t:text(a?.title),b:text(a?.body),ask:topics.has(text(a?.ask_topic))?text(a.ask_topic):"",src:text(a?.src).slice(0,60)})).filter((a:any)=>a.t&&a.b&&CR.groundedText(`${a.t} ${a.b}`,factsJson));
 const dropped=(res.out.changes||[]).length+(res.out.attention||[]).length-ch.length-at.length;
 if(dropped)console.log("CLINICAL_REPORT_AI_ITEMS_REJECTED",dropped);
 // every deterministic attention item about a nurse-entered stop or high-risk dose must stay, whatever the AI chose
 const must=model.attention.filter((a:any)=>/order status|High-risk/i.test(a.t));
 if(ch.length)model.changes=ch;
 if(at.length||must.length)model.attention=[...must,...at.filter((a:any)=>!must.some((m:any)=>m.t===a.t))].slice(0,5);
 model.aiUsed=Boolean(ch.length||at.length);model.aiModel=res.model;return model.aiUsed;
}
let crLogo:ArrayBuffer|null|undefined;
async function crLogoBytes(){if(crLogo===undefined){try{const r=await samaraInboxFetch("https://app.samaraassistedliving.com/assets/samara-logo-report.jpg");crLogo=r.ok?await r.arrayBuffer():null}catch{crLogo=null}}return crLogo}
function crRecipient(pref:any,patient:any){const mobile=text(pref?.doctor_recipient_mobile);return {name:text(pref?.doctor_recipient_name)||text(patient.treating_doctor)||text(patient.referring_doctor)||"Treating Doctor",mobile,enabled:pref?.doctor_report_enabled===true,verified:Boolean(pref?.doctor_recipient_verified_at)&&digits(pref?.doctor_recipient_verified_mobile)===digits(mobile)&&digits(mobile).length>=10}}
// Generate, save (never overwrite) and register one report. Returns the clinical_reports row.
async function crGenerate(sb:any,{patient,kind,period,weekNo=null,final=false,trigger="scheduled",user=null,settings,periodLabel=""}:{patient:any,kind:"daily"|"weekly",period:{from:Date,to:Date},weekNo?:number|null,final?:boolean,trigger?:string,user?:any,settings:any,periodLabel?:string}){
 const pref=(await sb.from("patient_family_communication_preferences").select("*").eq("patient_id",patient.id).maybeSingle()).data||{};
 const rcp=crRecipient(pref,patient),now=new Date();
 const trendFrom=new Date(Math.min(period.from.getTime(),period.to.getTime()-8*86400000));
 const data=await crLoad(sb,patient,trendFrom,period.to);
 let background="";try{const dg=await documentDigest(sb,patient.id,data.documents);background=text(dg.text).split("\n").slice(0,2).join(" ").slice(0,380)}catch(e){console.error("CLINICAL_REPORT_DIGEST",e instanceof Error?e.message:String(e))}
 const weekLabel=kind==="weekly"?(periodLabel||(final?"Final period":weekNo?`Week ${weekNo}`:"")):"";
 const model:any=CR.buildModel({kind,patient,pref,doctorName:rcp.name,period,data,settings,now,weekLabel,final,background} as any);
 try{await crAi(model)}catch(e){console.error("CLINICAL_REPORT_AI_ERROR",e instanceof Error?e.message:String(e))}
 model.attention.forEach((a:any)=>a.askLine=CR.askLine(a.ask));
 const rendered=await renderReport(PDFLib,model,{logoJpg:await crLogoBytes()});
 const prev=await sb.from("clinical_reports").select("id,version").eq("patient_id",patient.id).eq("kind",kind).eq("period_from",period.from.toISOString()).eq("period_to",period.to.toISOString()).order("version",{ascending:false}).limit(1);
 const version=(prev.data?.[0]?.version||0)+1,supersedes=prev.data?.[0]?.id||null;
 const safe=text(patient.full_name).replace(/[^a-zA-Z0-9_-]+/g,"_")||"Guest";
 const label=kind==="daily"?"Daily_Clinical_Report":final?"Weekly_Clinical_Report_Final":"Weekly_Clinical_Report";
 const path=`${patient.id}/clinical/${kind}/${crIso(period.to)}/${safe}_${label}_${crIso(period.from)}_to_${crIso(new Date(period.to.getTime()-1))}_v${version}_${crypto.randomUUID().slice(0,8)}.pdf`;
 await sb.storage.createBucket("patient-reports",{public:false}).catch(()=>{});
 const up=await sb.storage.from("patient-reports").upload(path,rendered.bytes,{contentType:"application/pdf",upsert:false});if(up.error)throw up.error;
 const holds=kind==="daily"?CR.validateForSend({kind,vitals:model.vitals.period,meds:model.medsPeriod,recipient:rcp.enabled?rcp:undefined,period}):[];
 const fileName=`${patientName(patient)} - ${kind==="daily"?"Daily":"Weekly"} Clinical Report - ${CR.fmtDate(crIso(period.from))} to ${CR.fmtDate(crIso(new Date(period.to.getTime()-1)))}${version>1?` (v${version})`:""}.pdf`;
 const row={patient_id:patient.id,kind,period_from:period.from.toISOString(),period_to:period.to.toISOString(),week_no:weekNo,is_final:final,version,supersedes,trigger,storage_bucket:"patient-reports",storage_path:path,file_name:fileName,pages:rendered.pages,
  status:holds.length?"held":"saved",hold_reasons:holds,ai_model:model.aiUsed?model.aiModel:null,doctor_name:model.doctor,generated_by:user?.id||null,generated_by_name:user?.full_name||(trigger==="manual"?"ERP user":"Samara Automatic Report"),
  summary:{meds:model.medsPeriod.totals,meds_balanced:model.medsPeriod.balanced,vitals:model.vitals.period.length,missed_checks:model.vitals.missed.length,io_days:model.io.days?.length||0,doctor_report_enabled:rcp.enabled,recipient_verified:rcp.verified}};
 const ins=await sb.from("clinical_reports").insert(row).select("*").single();
 if(ins.error){await sb.storage.from("patient-reports").remove([path]).catch(()=>{});throw ins.error}
 console.log("CLINICAL_REPORT_SAVED",JSON.stringify({id:ins.data.id,patient_id:patient.id,kind,version,status:row.status,holds:holds.length,ai:row.ai_model}));
 if(holds.length&&kind==="daily"&&rcp.enabled)await crNotifyHeld(sb,patient,ins.data);
 return ins.data;
}
async function crNotifyHeld(sb:any,patient:any,report:any){
 try{await sb.from("notifications").insert({title:"Clinical report held for review",message:`The Daily Clinical Report for Room ${text(patient.room_no)||"-"} is held and was not sent automatically. Admin / Nursing Manager: open the Guest's Reports → Daily Clinical Report.`,priority:"High",expires_at:new Date(Date.now()+2*86400000).toISOString()})}catch(e){console.error("CLINICAL_REPORT_NOTIFY",e instanceof Error?e.message:String(e))}
}
// Send one saved report over the existing approved WhatsApp template. One live send per report + number.
async function crSend(sb:any,report:any,{mode,user=null,patient}:{mode:"automatic"|"manual",user?:any,patient:any}){
 const pref=(await sb.from("patient_family_communication_preferences").select("*").eq("patient_id",report.patient_id).maybeSingle()).data||{};
 const rcp=crRecipient(pref,patient);
 if(!rcp.verified)throw new Error("The treating doctor's WhatsApp number is not verified. Admin must verify it in Reports first.");
 const claim=await sb.from("clinical_report_sends").insert({report_id:report.id,patient_id:report.patient_id,recipient_name:rcp.name,recipient_number:digits(rcp.mobile),mode,status:"sending",sent_by:user?.id||null,sent_by_name:user?.full_name||"Samara Automatic Report"}).select("*").single();
 if(claim.error){if(/duplicate|clinical_report_sends_once/i.test(claim.error.message))throw new Error("This report has already been sent (or is being sent) to this doctor.");throw claim.error}
 await sb.from("clinical_reports").update({status:"sending"}).eq("id",report.id);
 try{
  const signed=await sb.storage.from(report.storage_bucket||"patient-reports").createSignedUrl(report.storage_path,900);if(signed.error)throw signed.error;
  const label=report.kind==="daily"?"Daily Clinical Report":"Weekly Clinical Report",dateIso=crIso(new Date(new Date(report.period_to).getTime()-1));
  const wa=await sendWhatsApp(rcp.mobile,rcp.name,patientName(patient),dateIso,signed.data.signedUrl,label),provider=wa?.messages?.[0]?.id||null;
  await sb.from("clinical_report_sends").update({status:provider?"accepted":"unknown",provider_message_id:provider,error:provider?null:"Provider did not return a message ID. Check the WhatsApp Inbox before resending.",updated_at:new Date().toISOString()}).eq("id",claim.data.id);
  await sb.from("clinical_reports").update({status:provider?"sent":"failed"}).eq("id",report.id);
  await recordWhatsAppInbox(sb,{patient,recipientName:rcp.name,recipientMobile:rcp.mobile,date:dateIso,providerId:provider,storagePath:report.storage_path,scheduled:mode==="automatic",recipientType:"Doctor",clinical:true});
  await sb.from("patient_communications").insert({patient_id:report.patient_id,communication_type:`Doctor ${label}`,method:"WhatsApp",recipient_type:"Doctor",recipient_name:rcp.name,recipient_number:digits(rcp.mobile),report_date:dateIso,status:provider?"Accepted":"Unknown",provider_message_id:provider,message_preview:`${label} PDF (${mode}) · clinical report ${report.id}`,created_at:new Date().toISOString()});
  return {ok:true,provider_message_id:provider};
 }catch(e){const msg=e instanceof Error?e.message:String(e);const unknown=/Network interrupted|acceptance is unknown/i.test(msg);
  await sb.from("clinical_report_sends").update({status:unknown?"unknown":"failed",error:msg.slice(0,500),updated_at:new Date().toISOString()}).eq("id",claim.data.id);
  await sb.from("clinical_reports").update({status:"failed"}).eq("id",report.id);throw e}
}
// The weekly window now in progress for an admitted Guest, and when its report will be saved.
function crNextWeekly(p:any,s:any,now:Date){const adm=CR.admissionAt(p);if(!adm)return null;const w=(CR.weeklyWindows(adm,new Date(now.getTime()+8*86400000)) as any[]).find((x:any)=>x.to>now);if(!w)return null;
 return {week:w.week,from:w.from,to:w.to,due:CR.at(crIso(w.to),text(s.weekly_run_time).slice(0,5)||"07:30")}}
const crActive=(p:any)=>p.is_active!==false&&!["Discharged","Draft"].includes(text(p.admission_status));
// Called from the existing 5-minute scheduled run, after the family reports. Small batches keep each run short.
async function crScheduled(sb:any,started:number){
 const s:any=await crSettings(sb);if(s.missing)return {skipped:"clinical_report_settings not installed (SQL 299)"};
 if(s.function_version!==CR_FUNCTION_VERSION)await sb.from("clinical_report_settings").update({function_version:CR_FUNCTION_VERSION}).eq("id","global");
 const now=new Date(),out:any[]=[],budget=()=>Date.now()-started<110000;let made=0;
 const pts=(await sb.from("patients").select("*")).data||[];
 const activated=new Date(s.activated_at||now);
 if(s.daily_enabled){
  for(const p of pts.filter(crActive)){
   if(made>=2||!budget())break;
   const adm=CR.admissionAt(p);if(!adm)continue;
   const period=CR.dailyPeriod({cutoff:text(s.daily_cutoff).slice(0,5),now,admission:adm} as any);if(!period.valid||period.to<activated)continue;
   const ex=await sb.from("clinical_reports").select("id,status").eq("patient_id",p.id).eq("kind","daily").eq("period_to",period.to.toISOString()).limit(1);
   if(ex.error){out.push({patient_id:p.id,error:ex.error.message});continue}if(ex.data?.length)continue;
   try{const r=await crGenerate(sb,{patient:p,kind:"daily",period,trigger:"scheduled",settings:s});made++;const o:any={patient_id:p.id,report_id:r.id,status:r.status};
    if(s.daily_auto_send===true&&r.status==="saved"&&r.summary?.doctor_report_enabled&&r.summary?.recipient_verified){try{o.send=await crSend(sb,r,{mode:"automatic",patient:p})}catch(e){o.send_error=e instanceof Error?e.message:String(e)}}
    out.push(o)}catch(e){out.push({patient_id:p.id,error:e instanceof Error?e.message:String(e)})}
  }
  // safe retry of failed automatic sends (never of "unknown" — those may have been delivered)
  if(s.daily_auto_send===true&&budget()){
   const failed=(await sb.from("clinical_reports").select("*").eq("kind","daily").eq("status","failed").gte("generated_at",new Date(now.getTime()-20*3600000).toISOString()).limit(3)).data||[];
   for(const r of failed){if(!budget())break;const tries=(await sb.from("clinical_report_sends").select("id,status").eq("report_id",r.id)).data||[];
    if(tries.some((t:any)=>["accepted","unknown","sending"].includes(t.status))||tries.length>=3)continue;const p=pts.find((x:any)=>x.id===r.patient_id);if(!p)continue;
    try{out.push({retry:r.id,send:await crSend(sb,r,{mode:"automatic",patient:p})})}catch(e){out.push({retry:r.id,error:e instanceof Error?e.message:String(e)})}}
  }
 }
 if(s.weekly_enabled){
  const runTime=text(s.weekly_run_time).slice(0,5)||"07:30",delay=Number(s.final_report_delay_minutes??120)*60000;
  for(const p of pts){
   if(made>=3||!budget())break;
   const adm=CR.admissionAt(p);if(!adm)continue;
   let discharge:any=null;
   if(!crActive(p)){const dis=(await sb.from("patient_discharges").select("*").eq("patient_id",p.id)).data||[];discharge=CR.confirmedDischarge(dis);
    // a final report needs a confirmed discharge with its time; never for discharges before activation
    if(!discharge||discharge.at<activated||now.getTime()<discharge.at.getTime()+delay)continue;}
   const existing=((await sb.from("clinical_reports").select("period_from,period_to,week_no,is_final").eq("patient_id",p.id).eq("kind","weekly")).data||[]).filter((r:any)=>r.week_no!=null||r.is_final); // on-request (last-7-days) reports do not change the automatic weekly windows
   const due=CR.dueWeeklyPeriods({admission:adm,now,discharge,existing,runTime} as any);
   for(const w of due.slice(0,1)){if(made>=3||!budget())break;
    try{const r=await crGenerate(sb,{patient:p,kind:"weekly",period:{from:w.from,to:w.to},weekNo:w.week,final:w.final,trigger:w.final?"discharge":"scheduled",settings:s});made++;out.push({patient_id:p.id,weekly:r.id,week:w.week,final:w.final})}
    catch(e){out.push({patient_id:p.id,weekly_error:e instanceof Error?e.message:String(e)})}}
  }
 }
 console.log("CLINICAL_REPORT_RUN",JSON.stringify({made,results:out.length}));
 return {made,results:out};
}
// Staff actions from Patient Card → Reports.
async function crManual(sb:any,body:any,req:Request){
 const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");const auth=await sb.auth.getUser(jwt);if(auth.error||!auth.data.user)return json({ok:false,error:"Unauthorised"},401);
 const prof=(await sb.from("profiles").select("id,full_name,role,is_active").eq("id",auth.data.user.id).maybeSingle()).data;
 if(!prof||prof.is_active===false||!CR_VIEW_ROLES.includes(text(prof.role)))return json({ok:false,error:"Clinical reports are available to Admin, Manager and Nurses only."},403);
 const canSend=CR_SEND_ROLES.includes(text(prof.role)),isAdmin=CR_ADMIN_ROLES.includes(text(prof.role));
 const s:any=await crSettings(sb);if(s.missing)return json({ok:false,not_installed:true,error:"Clinical reports are not installed yet (Supabase SQL 299)."},200);
 if(s.function_version!==CR_FUNCTION_VERSION)await sb.from("clinical_report_settings").update({function_version:CR_FUNCTION_VERSION}).eq("id","global");
 const mode=text(body.mode);
 if(mode==="clinical_settings"){
  if(body.update){if(!isAdmin)return json({ok:false,error:"Only Admin can change report settings."},403);
   const u:any={updated_by:prof.id,updated_by_name:prof.full_name||"Admin",updated_at:new Date().toISOString()};
   const hm=(v:any)=>/^\d{2}:\d{2}$/.test(text(v))?text(v):null;
   if(hm(body.update.daily_cutoff))u.daily_cutoff=hm(body.update.daily_cutoff);if(hm(body.update.weekly_run_time))u.weekly_run_time=hm(body.update.weekly_run_time);
   for(const k of ["daily_enabled","weekly_enabled","daily_auto_send"])if(typeof body.update[k]==="boolean")u[k]=body.update[k];
   const r=await sb.from("clinical_report_settings").update(u).eq("id","global").select("*").single();if(r.error)throw r.error;
   console.log("CLINICAL_REPORT_SETTINGS",JSON.stringify({by:prof.id,changes:Object.keys(u)}));return json({ok:true,settings:r.data})}
  return json({ok:true,settings:s});
 }
 const patientId=text(body.patient_id);
 if(mode==="clinical_list"){
  if(!patientId)return json({ok:false,error:"patient_id is required"},400);
  const p=(await sb.from("patients").select("*").eq("id",patientId).single()).data;if(!p)return json({ok:false,error:"Guest not found"},404);
  const reps=(await sb.from("clinical_reports").select("*").eq("patient_id",patientId).order("period_to",{ascending:false}).order("version",{ascending:false}).limit(120)).data||[];
  const sends=reps.length?((await sb.from("clinical_report_sends").select("*").in("report_id",reps.map((r:any)=>r.id)).order("created_at",{ascending:false})).data||[]):[];
  const pids=sends.map((x:any)=>x.provider_message_id).filter(Boolean);const wa=pids.length?((await sb.from("hr_whatsapp_communications").select("provider_message_id,status,delivered_at,read_at,failed_at,error_message").in("provider_message_id",pids)).data||[]):[];
  const pref=(await sb.from("patient_family_communication_preferences").select("*").eq("patient_id",patientId).maybeSingle()).data||{};
  const rcp=crRecipient(pref,p);
  return json({ok:true,settings:s,next_weekly:crActive(p)?crNextWeekly(p,s,new Date()):null,recipient:{...rcp,mobile_masked:rcp.mobile?`${digits(rcp.mobile).slice(0,2)}xxxxxx${digits(rcp.mobile).slice(-2)}`:"",verified_at:pref.doctor_recipient_verified_at||null,verified_by:pref.doctor_recipient_verified_by_name||null},
   can_send:canSend,is_admin:isAdmin,reports:reps.map((r:any)=>({...r,sends:sends.filter((x:any)=>x.report_id===r.id).map((x:any)=>({...x,delivery:wa.find((w:any)=>w.provider_message_id===x.provider_message_id)||null}))}))});
 }
 if(mode==="clinical_url"){
  const r=(await sb.from("clinical_reports").select("*").eq("id",text(body.report_id)).single()).data;if(!r)return json({ok:false,error:"Report not found"},404);
  const signed=await sb.storage.from(r.storage_bucket||"patient-reports").createSignedUrl(r.storage_path,600,body.download?{download:r.file_name}:undefined);if(signed.error)throw signed.error;
  return json({ok:true,url:signed.data.signedUrl,file_name:r.file_name});
 }
 if(!canSend)return json({ok:false,error:"Only Admin or Manager can generate or send clinical reports."},403);
 if(mode==="clinical_verify_recipient"){
  if(!isAdmin)return json({ok:false,error:"Only Admin can verify the doctor's WhatsApp number."},403);
  const pref=(await sb.from("patient_family_communication_preferences").select("*").eq("patient_id",patientId).maybeSingle()).data;
  if(!pref||digits(pref.doctor_recipient_mobile).length<10)return json({ok:false,error:"Save the treating doctor's WhatsApp number in the Guest's Daily Report settings first."},400);
  const r=await sb.from("patient_family_communication_preferences").update({doctor_recipient_verified_at:new Date().toISOString(),doctor_recipient_verified_by:prof.id,doctor_recipient_verified_by_name:prof.full_name||"Admin",doctor_recipient_verified_mobile:digits(pref.doctor_recipient_mobile)}).eq("patient_id",patientId);
  if(r.error)throw r.error;return json({ok:true});
 }
 if(mode==="clinical_generate"){
  const p=(await sb.from("patients").select("*").eq("id",patientId).single()).data;if(!p)return json({ok:false,error:"Guest not found"},404);
  const adm=CR.admissionAt(p);if(!adm)return json({ok:false,error:"Admission date / time is not recorded for this Guest."},400);
  if(text(body.kind)==="daily"){const period=CR.dailyPeriod({cutoff:text(s.daily_cutoff).slice(0,5),now:new Date(),admission:adm} as any);if(!period.valid)return json({ok:false,error:"No completed reporting period since admission yet."},400);
   const r=await crGenerate(sb,{patient:p,kind:"daily",period,trigger:"manual",user:prof,settings:s});return json({ok:true,report:r});}
  const dis=CR.confirmedDischarge((await sb.from("patient_discharges").select("*").eq("patient_id",patientId)).data||[]);
  const regen=text(body.regenerate_report_id);
  if(regen){const o=(await sb.from("clinical_reports").select("*").eq("id",regen).single()).data;if(!o)return json({ok:false,error:"Report not found"},404);
   const r=await crGenerate(sb,{patient:p,kind:o.kind,period:{from:new Date(o.period_from),to:new Date(o.period_to)},weekNo:o.week_no,final:o.is_final,trigger:"manual",user:prof,settings:s});return json({ok:true,report:r});}
  // 2.18.144: on-demand weekly report = the 7 days before now (from admission if the stay is shorter; up to the
  // recorded departure for a discharged Guest). Automatic weekly reports keep the consecutive 7-day windows.
  const now=new Date(),end=dis&&!crActive(p)&&dis.at<now?dis.at:now,from=new Date(Math.max(end.getTime()-7*86400000,adm.getTime()));
  if(end<=from)return json({ok:false,error:"No recorded stay in the last 7 days."},400);
  const short=end.getTime()-from.getTime()<7*86400000-60000;
  const r=await crGenerate(sb,{patient:p,kind:"weekly",period:{from,to:end},trigger:"manual",user:prof,settings:s,periodLabel:(short?"Since admission":"Last 7 days")+(end<now?" to discharge":"")});return json({ok:true,report:r});
 }
 if(mode==="clinical_send"){
  if(body.confirm!==true)return json({ok:false,error:"Recipient confirmation is required."},400);
  const r=(await sb.from("clinical_reports").select("*").eq("id",text(body.report_id)).single()).data;if(!r)return json({ok:false,error:"Report not found"},404);
  const p=(await sb.from("patients").select("*").eq("id",r.patient_id).single()).data;
  const pref=(await sb.from("patient_family_communication_preferences").select("*").eq("patient_id",r.patient_id).maybeSingle()).data||{};
  if(digits(body.confirm_recipient_mobile)!==digits(pref.doctor_recipient_mobile))return json({ok:false,error:"The confirmed recipient does not match the saved treating-doctor number."},400);
  if(r.kind==="daily"&&r.status==="held"&&!isAdmin&&!canSend)return json({ok:false,error:"A held report needs review by Admin / Manager."},403);
  const res=await crSend(sb,r,{mode:"manual",user:prof,patient:p});return json({...res,ok:true});
 }
 if(mode==="clinical_mark_send_failed"){
  if(!isAdmin)return json({ok:false,error:"Only Admin can clear an unknown send."},403);
  const r=await sb.from("clinical_report_sends").update({status:"failed",error:`Marked not delivered by ${prof.full_name||"Admin"} after checking the WhatsApp Inbox`,updated_at:new Date().toISOString()}).eq("id",text(body.send_id)).eq("status","unknown");
  if(r.error)throw r.error;return json({ok:true});
 }
 return json({ok:false,error:"Unknown clinical report action"},400);
}

Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return json({ok:false,error:"Method not allowed"},405);
 try{
  const url=Deno.env.get("SUPABASE_URL")!,key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,cronSecret=Deno.env.get("DAILY_REPORT_CRON_SECRET")||"";const sb=createClient(url,key,{auth:{persistSession:false}});const body=await req.json().catch(()=>({}));
  const scheduled=Boolean(cronSecret&&req.headers.get("x-cron-secret")===cronSecret);

  // Family Portal read-only access to PDFs already generated by this function.
  // This mode NEVER generates, modifies, or sends a report.
  if(body.mode==="family_list_existing_reports"){
   const sessionToken=text(body.session_token);
   if(!sessionToken)return json({ok:false,error:"Family Portal session is required"},401);
   const anonKey=Deno.env.get("SUPABASE_ANON_KEY")||"";
   const publicClient=createClient(url,anonKey,{auth:{persistSession:false}});
   const dash=await publicClient.rpc("family_portal_dashboard",{p_session_token:sessionToken});
   if(dash.error||!dash.data?.patient)return json({ok:false,error:"Family Portal session has expired"},401);
   const patientId=dash.data.patient.id||dash.data.patient.uuid;
   if(!patientId)return json({ok:false,error:"Resident could not be identified"},400);
   // The stored PDF metadata lives inside message_payload. The WhatsApp inbox
   // table itself does not have patient_id/report_date columns, so filter by
   // the exact payload written by sendWhatsApp() instead of querying columns
   // that do not exist.
   const logs=await sb.from("hr_whatsapp_communications")
    .select("id,sent_at,created_at,message_payload,communication_type")
    .eq("communication_type","Daily Intelligent Patient Report")
    .order("created_at",{ascending:false})
    .limit(200);
   if(logs.error)throw logs.error;
   const reports:any[]=[];const seen=new Set<string>();
   for(const row of logs.data||[]){
    const payload=row.message_payload||{};
    if(text(payload.patient_id)!==patientId)continue;
    const path=text(payload.report_storage_path);
    const bucket=text(payload.report_storage_bucket)||"patient-reports";
    const reportDate=text(payload.report_date);
    if(!path||!reportDate||seen.has(path))continue;
    const signed=await sb.storage.from(bucket).createSignedUrl(path,900);
    if(signed.error||!signed.data?.signedUrl)continue;
    seen.add(path);
    reports.push({report_date:reportDate,sent_at:row.sent_at||row.created_at,created_at:row.created_at,file_name:text(payload.report_file_name)||`Intelligent Patient Report - ${displayDate(reportDate)}.pdf`,signed_url:signed.data.signedUrl});
   }
   reports.sort((a:any,b:any)=>String(b.report_date).localeCompare(String(a.report_date))||(+new Date(b.created_at||0)-+new Date(a.created_at||0)));
   return json({ok:true,reports});
  }

  // 2.18.142 clinical report actions (own role checks)
  if(!scheduled&&/^clinical_/.test(text(body.mode)))return await crManual(sb,body,req);
  if(!scheduled){const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");const auth=await sb.auth.getUser(jwt);if(auth.error||!auth.data.user)return json({ok:false,error:"Unauthorised"},401)}
  if(scheduled){
   const now=new Date(),date=indiaDate(now),time=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",hour12:false}).format(now);
   const prefs=await sb.from("patient_family_communication_preferences").select("*").eq("daily_whatsapp_enabled",true).eq("is_active",true);
   if(prefs.error){console.error("DAILY_REPORT preference query failed",prefs.error);throw prefs.error}
   const duePrefs=(prefs.data||[]).filter((pref:any)=>{const scheduledTime=text(pref.daily_report_time).slice(0,5);return Boolean(scheduledTime&&scheduledTime<=time)});
   console.log("DAILY_REPORT_RUN",JSON.stringify({date,time,enabled:(prefs.data||[]).length,due:duePrefs.length,due_patients:duePrefs.map((x:any)=>x.patient_id)}));
   const runStarted=Date.now();const crS:any=await crSettings(sb).catch(()=>({missing:true}));const newDoctorSending=!crS.missing&&crS.daily_auto_send===true;
   const results:any[]=[];for(const pref of duePrefs){
    try{
     const pr=await sb.from("patients").select("*").eq("id",pref.patient_id).single();
     if(pr.error)throw pr.error;if(pr.data.is_active===false){results.push({patient_id:pref.patient_id,status:"skipped_inactive"});continue}
     const recipients:any[]=[{type:"Relative",name:pref.recipient_name||"Family Member",mobile:pref.recipient_mobile}];
     // 2.18.142: once automatic Daily Clinical Report sending is ON, the doctor gets that report instead of the old trial copy
     if(pref.doctor_report_enabled===true&&!(newDoctorSending&&text(pref.doctor_report_style).toLowerCase()==="clinical")){
      const doctorMobile=text(pref.doctor_recipient_mobile),doctorName=text(pref.doctor_recipient_name)||text(pr.data.treating_doctor)||text(pr.data.referring_doctor)||"Doctor";
      if(doctorMobile&&digits(doctorMobile).length>=10)recipients.push({type:"Doctor",name:doctorName,mobile:doctorMobile});
      else console.error("DAILY_REPORT_DOCTOR_RECIPIENT_INVALID",JSON.stringify({patient_id:pref.patient_id}));
     }
     const uniqueRecipients=recipients.filter((r,i,all)=>r.mobile&&digits(r.mobile).length>=10&&all.findIndex(x=>digits(x.mobile)===digits(r.mobile))===i);
     if(!uniqueRecipients.length){results.push({patient_id:pref.patient_id,status:"failed",error:"No valid WhatsApp recipient"});continue}
     const already=await sb.from("patient_communications").select("recipient_number,status,provider_message_id").eq("patient_id",pref.patient_id).eq("report_date",date).ilike("communication_type","%Intelligent%Report%").ilike("message_preview","%Detailed%Report%pdf%");
     if(already.error)console.error("DAILY_REPORT duplicate check failed",pref.patient_id,already.error);
     const sentNumbers=new Set((already.data||[]).filter((row:any)=>["accepted","sent","delivered","read"].includes(text(row.status).toLowerCase())).map((row:any)=>digits(row.recipient_number)));
     const pending=uniqueRecipients.filter(r=>!sentNumbers.has(digits(r.mobile)));
     if(!pending.length){console.log("DAILY_REPORT_SKIP_ALREADY_SENT",JSON.stringify({patient_id:pref.patient_id,date,recipients:uniqueRecipients.map(r=>r.type)}));results.push({patient_id:pref.patient_id,status:"skipped_already_sent"});continue}
     // 2.18.127: family PDF made only when a non-clinical recipient is pending; clinical doctor PDF made only for the trial Guests
     const clinicalDoctor=text(pref.doctor_report_style).toLowerCase()==="clinical";
     let familyFile:any=null,doctorFile:any=null;
     const fileFor=async(r:any)=>{if(r.type==="Doctor"&&clinicalDoctor){if(!doctorFile){const made=await makeDoctorReport(sb,pr.data,date,r.name);doctorFile=await uploadDoctorReport(sb,pr.data,date,made.bytes);console.log("DOCTOR_REPORT_MADE",JSON.stringify({patient_id:pr.data.id,ai:made.ai,model:made.model}))}return doctorFile}if(!familyFile){const bytes=await makeReport(sb,pr.data,date);familyFile=await uploadAndSign(sb,pr.data,date,bytes)}return familyFile};
     const deliveries:any[]=[];
     if(pref.doctor_report_enabled===true&&!uniqueRecipients.some(r=>r.type==="Doctor"))deliveries.push({recipient_type:"Doctor",status:"failed",error:"Doctor WhatsApp number is missing or invalid"});
     for(const recipient of pending){
      try{
       const clinical=recipient.type==="Doctor"&&clinicalDoctor,file=await fileFor(recipient);
       const wa=await sendWhatsApp(recipient.mobile,recipient.name,patientName(pr.data),date,file.url,clinical?"Daily Clinical Report":"Intelligent Patient Report"),provider=wa?.messages?.[0]?.id||null;
       const inboxError=await recordWhatsAppInbox(sb,{patient:pr.data,recipientName:recipient.name,recipientMobile:recipient.mobile,date,providerId:provider,storagePath:file.path,scheduled:true,recipientType:recipient.type,clinical});
       const patientLog=await sb.from("patient_communications").insert({patient_id:pr.data.id,communication_type:"Daily Intelligent Patient Report",method:"WhatsApp",recipient_type:recipient.type,recipient_name:recipient.name,recipient_number:digits(recipient.mobile),report_date:date,status:"Accepted",provider_message_id:provider,message_preview:clinical?"Detailed Daily Clinical Report PDF (doctor)":"Detailed two-page Intelligent Patient Report PDF",created_at:new Date().toISOString()});
       if(patientLog.error)console.error("DAILY_REPORT patient history insert failed",pref.patient_id,recipient.type,patientLog.error);
       deliveries.push({recipient_type:recipient.type,status:"sent",provider_message_id:provider,inbox_recorded:!inboxError,patient_history_recorded:!patientLog.error});
      }catch(e){const error=e instanceof Error?e.message:String(e);console.error("DAILY_REPORT_RECIPIENT_FAILED",JSON.stringify({patient_id:pref.patient_id,recipient_type:recipient.type,error}));deliveries.push({recipient_type:recipient.type,status:"failed",error})}
     }
     const sent=deliveries.filter(x=>x.status==="sent").length,failed=deliveries.filter(x=>x.status==="failed").length;
     const reportStatus=failed?(sent?"Partial delivery":"Failed"):"Accepted by Meta";
     const preferenceUpdate=await sb.from("patient_family_communication_preferences").update({...(sent?{last_report_sent_at:new Date().toISOString()}:{}),last_report_status:reportStatus,updated_at:new Date().toISOString()}).eq("patient_id",pref.patient_id);
     if(preferenceUpdate.error)console.error("DAILY_REPORT preference timestamp update failed",pref.patient_id,preferenceUpdate.error);
     results.push({patient_id:pr.data.id,status:failed?(sent?"partial":"failed"):"sent",deliveries,preference_updated:!preferenceUpdate.error});
     console.log("DAILY_REPORT_SENT",JSON.stringify(results[results.length-1]));
    }catch(e){const error=e instanceof Error?e.message:String(e);console.error("DAILY_REPORT_FAILED",JSON.stringify({patient_id:pref.patient_id,error}));results.push({patient_id:pref.patient_id,status:"failed",error})}
   }
   let clinical:any=null;try{clinical=await crScheduled(sb,runStarted)}catch(e){console.error("CLINICAL_REPORT_RUN_FAILED",e instanceof Error?e.message:String(e));clinical={error:e instanceof Error?e.message:String(e)}}
   return json({ok:true,date,time,enabled:(prefs.data||[]).length,due:duePrefs.length,results,clinical});
  }
  const patientId=text(body.patient_id),date=text(body.report_date)||indiaDate();if(!patientId)return json({ok:false,error:"patient_id is required"},400);const pr=await sb.from("patients").select("*").eq("id",patientId).single();if(pr.error)return json({ok:false,error:pr.error.message},404);
  // 2.18.127: doctor's Daily Clinical Report - preview (doctor_generate_only) or send to the saved doctor number (doctor_send)
  if(body.mode==="doctor_generate_only"||body.mode==="doctor_send"){
   const pref=await sb.from("patient_family_communication_preferences").select("*").eq("patient_id",patientId).maybeSingle();
   const doctorName=text(body.doctor_name)||text(pref.data?.doctor_recipient_name)||text(pr.data.treating_doctor)||text(pr.data.referring_doctor)||"Treating Doctor";
   const made=await makeDoctorReport(sb,pr.data,date,doctorName),file=await uploadDoctorReport(sb,pr.data,date,made.bytes),fileName=`${patientName(pr.data)} - Daily Clinical Report - ${displayDate(date)}.pdf`;
   if(body.mode==="doctor_generate_only")return json({ok:true,report_url:file.url,storage_path:file.path,file_name:fileName,ai_observations:made.ai});
   const mobile=text(body.recipient_mobile)||text(pref.data?.doctor_recipient_mobile);if(digits(mobile).length<10)return json({ok:false,error:"Doctor WhatsApp number is not saved for this Guest."},400);
   const wa=await sendWhatsApp(mobile,doctorName,patientName(pr.data),date,file.url,"Daily Clinical Report"),provider=wa?.messages?.[0]?.id||null;
   const inboxError=await recordWhatsAppInbox(sb,{patient:pr.data,recipientName:doctorName,recipientMobile:mobile,date,providerId:provider,storagePath:file.path,scheduled:false,recipientType:"Doctor",clinical:true});
   return json({ok:true,report_url:file.url,storage_path:file.path,provider_message_id:provider,inbox_recorded:!inboxError,ai_observations:made.ai});
  }
  const bytes=await makeReport(sb,pr.data,date),file=await uploadAndSign(sb,pr.data,date,bytes);
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
  return response;
}
