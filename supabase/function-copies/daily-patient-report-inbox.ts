import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

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
  const dayReviews=medReviews.filter((x:any)=>sameDay(x.reviewed_at||x.created_at,date));
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
const SAMARA_ADDRESS=["RBK VILLA, No. 23-A, Reddipalayam Road,","Jeswant Nagar Phase 1, Mogappair West,","Chennai 600037","Ph: +91 99767 35577 | +91 73959 61616","care@samaraassistedliving.com"];
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
2. Use ONLY the data given (records JSON and attached documents). Never invent values, dates, diagnoses, symptoms or examinations. If something is not recorded, do not mention it.
3. Never make a new diagnosis, interpretation of cause, or prognosis. Name a condition only if it appears in the diagnosis field or in an attached document, and say where it is documented.
4. PATIENT- and DISEASE-SPECIFIC: group observations by the Guest's own documented conditions / body systems (e.g. Neurology, Orthopaedics, Cardiovascular, Diabetes, Respiratory, Renal, Wound care, Nutrition, Mobility). For each condition, report the recorded data that relates to it: the relevant vital-sign or sugar trend over the period, the medicines for that condition and whether doses were given, physiotherapy findings for that condition, nursing notes and incidents. Skip generic statements that would fit any patient.
5. Quote real numbers with dates (DD-MM-YYYY or DD-MM) and times (AM/PM). Be factual and neutral. No exaggeration ("significant", "worrying", "excellent").
6. At most 4 groups, at most 4 observations per group, each observation at most 30 words. Plain English for a doctor.

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

async function aiObservations(sb:any,facts:any,documents:any[]){
 const key=Deno.env.get("GEMINI_API_KEY");if(!key)return null;
 const docs=await clinicalDocuments(sb,documents);
 const parts=[{text:`Records JSON for the report period:\n${JSON.stringify(facts)}`},...docs.parts,{text:"Write the Clinical Observations JSON now. Observations only - no advice of any kind."}];
 const models=[...new Set([Deno.env.get("DOCTOR_REPORT_MODEL"),"gemini-3.8-flash","gemini-3.5-flash","gemini-2.5-flash"].filter((m):m is string=>!!m&&!!m.trim()))];
 for(const model of models){
  try{
   const cfg:Record<string,unknown>={responseMimeType:"application/json",temperature:0,maxOutputTokens:8192};
   if(/^gemini-2\./i.test(model))cfg.thinkingConfig={thinkingBudget:2048};
   const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:"POST",signal:AbortSignal.timeout(90000),headers:{"x-goog-api-key":key,"Content-Type":"application/json"},body:JSON.stringify({systemInstruction:{parts:[{text:AI_SYSTEM}]},contents:[{role:"user",parts}],generationConfig:cfg})});
   const j=await r.json().catch(()=>null);
   if(r.status===404){console.error("DOCTOR_REPORT_MODEL_NOT_AVAILABLE",model);continue}
   if(!r.ok){console.error("DOCTOR_REPORT_GEMINI",model,r.status,String(j?.error?.message||"").slice(0,160));continue}
   const out=parseAiJson((j?.candidates?.[0]?.content?.parts||[]).filter((p:any)=>!p.thought).map((p:any)=>p.text||"").join(""));
   if(!out||!Array.isArray(out.groups)){console.error("DOCTOR_REPORT_AI_UNREADABLE",model);continue}
   let dropped=0;
   const groups=out.groups.slice(0,4).map((g:any)=>{
    const obs=(Array.isArray(g?.observations)?g.observations:[]).map((x:any)=>pdfText(x)).filter((x:string)=>{if(!x)return false;if(ADVICE_RE.test(x)){dropped++;return false}return true}).slice(0,4);
    const condition=pdfText(g?.condition);const area=pdfText(g?.area).slice(0,24)||"Clinical";
    return {area,condition:ADVICE_RE.test(condition)?"":condition,documented:pdfText(g?.documented_in),observations:obs};
   }).filter((g:any)=>g.observations.length);
   if(dropped)console.log("DOCTOR_REPORT_AI_ADVICE_LINES_REMOVED",dropped);
   if(!groups.length)return null;
   const sources=(Array.isArray(out.sources_used)?out.sources_used:[]).map((x:any)=>pdfText(x)).filter(Boolean).slice(0,8);
   return {groups,sources:sources.length?sources:docs.names,model};
  }catch(e){console.error("DOCTOR_REPORT_AI_FAILED",model,e instanceof Error?e.message:String(e))}
 }
 return null;
}

async function makeDoctorReport(sb:any,patient:any,date:string,doctor:string,generatedAt=new Date()){
 const [vitals,orders,mar,meals,physioPlans,physio,incidents,documents,medReviews,medReviewItems,careLogs,ioEntries,staffResult]=await Promise.all([
  rows(sb,"vital_signs",patient.id),rows(sb,"medication_orders",patient.id),rows(sb,"medication_administrations",patient.id),rows(sb,"meal_records",patient.id),
  rows(sb,"physiotherapy_plans",patient.id),rows(sb,"physiotherapy_sessions",patient.id),rows(sb,"incidents",patient.id),rows(sb,"patient_documents",patient.id),
  rows(sb,"medication_reviews",patient.id),allRows(sb,"medication_review_items"),rows(sb,"care_logs",patient.id),rows(sb,"io_entries",patient.id),sb.from("profiles").select("id,full_name,role")
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
 const medRows=relevantOrders.map((o:any)=>{
  const times=(Array.isArray(o.scheduled_times)?o.scheduled_times:text(o.scheduled_times).replace(/[{}]/g,"").split(",")).map((t:any)=>text(t).slice(0,5)).filter(Boolean);
  const own=wm.filter((x:any)=>x.order_id===o.id),given=own.filter((x:any)=>text(x.status).toLowerCase()==="given").length;
  const notGiven=own.filter((x:any)=>text(x.status).toLowerCase()!=="given");
  const daily=!o.is_prn&&times.length&&!o.dose_weekday&&!o.dose_month_day&&!/alternate|weekly|monthly|sos|prn|once a week/i.test(text(o.frequency));
  // doses due: on the admission / start day only times after the Guest's first recorded entry that day count
  let due:number|null=null;if(daily){due=0;const s=isoOf(o.start_date||o.effective_from)||from,e=isoOf(o.stopped_at||o.end_date)||date;for(const d of days){if(d<s||d>e)continue;const first=d===s||d===admission?firstEntry(d):"00:00";for(const t of times){if(d===date&&t>cutoff)continue;if(t<first)continue;due++}}}
  const stopped=o.is_active===false||Boolean(o.stopped_at);
  return {name:`${text(o.medicine_name)}${text(o.strength)?` ${text(o.strength)}`:""}`,dose:[text(o.dose),text(o.route)].filter(Boolean).join(", "),
   times:o.is_prn?"PRN / as needed":times.map((t:any)=>hhmm12(t)).join(", ")||text(o.frequency)||"-",freq:text(o.frequency),given,due,stopped,
   exceptions:notGiven.map((x:any)=>`${text(x.status)} ${displayDate(isoOf(x.scheduled_date||x.created_at)).slice(0,5)}${text(x.withhold_reason)?` (${text(x.withhold_reason)}${text(x.withhold_reading)?` ${text(x.withhold_reading)}`:""})`:text(x.remarks)?` (${text(x.remarks)})`:""}`)};
 });
 const lateDoses=wm.filter((x:any)=>text(x.late_given_reason)).length;

 // ---- physiotherapy ----
 const activePlans=physioPlans.filter((p:any)=>p.is_active!==false&&(!text(p.end_date)||isoOf(p.end_date)>=from));
 const wp=physio.filter((x:any)=>inWindow(x.session_at||x.session_date||x.created_at,from,date)).sort((a:any,b:any)=>+new Date(a.session_at||a.session_date||a.created_at)-+new Date(b.session_at||b.session_date||b.created_at));
 const physioRows=wp.map((x:any)=>({d:displayDate(isoOf(x.session_at||x.session_date||x.created_at)),slot:text(x.scheduled_time)?(text(x.scheduled_time).includes("-")?text(x.scheduled_time).split("-").map(hhmm12).join("-"):hhmm12(x.scheduled_time)):"-",
  actual:text(x.actual_time)?hhmm12(x.actual_time):timeOf(x.session_at)||"-",who:text(x.physiotherapist_name)||staffName(x.performed_by)||"-",status:text(x.status)||"-",notes:[text(x.notes),text(x.reason)].filter(Boolean).join(" | ")||"-"}));

 // ---- nursing ----
 const wio=ioEntries.filter((x:any)=>inWindow(x.io_date||x.entry_at,from,date));
 const ioDays=days.slice(-3).map(d=>{const r=wio.filter((x:any)=>isoOf(x.io_date||x.entry_at)===d);const sum=(dir:string)=>r.filter((x:any)=>x.direction===dir).reduce((a:number,x:any)=>a+Number(x.volume_ml||0),0);
  return {d,n:r.length,intake:sum("Intake"),output:sum("Output"),stool:r.reduce((a:number,x:any)=>a+Number(x.stool_count||0),0)}}).filter(x=>x.n);
 const wMeals=meals.filter((x:any)=>inWindow(x.meal_date||x.served_at,from,date));
 const mealCounts:Record<string,number>={};wMeals.forEach((x:any)=>{const k=text(x.consumption_status)||"Recorded";mealCounts[k]=(mealCounts[k]||0)+1});
 const wInc=incidents.filter((x:any)=>inWindow(x.incident_at||x.created_at,from,date));
 const wCare=careLogs.filter((x:any)=>inWindow(x.care_date||x.completed_at||x.created_at,from,date));
 const careNotes=wCare.filter((x:any)=>text(x.remarks)).slice(-8).map((x:any)=>`${displayDate(isoOf(x.care_date||x.created_at)).slice(0,5)}: ${text(x.remarks)}`);
 const wReviews=medReviews.filter((x:any)=>inWindow(x.reviewed_at||x.created_at,from,date)).sort((a:any,b:any)=>+new Date(a.reviewed_at||a.created_at)-+new Date(b.reviewed_at||b.created_at));
 const reviewLines=wReviews.map((r:any)=>{const items=medReviewItems.filter((x:any)=>x.review_id===r.id).slice(0,5).map((x:any)=>`${text(x.action)||"Change"} ${text(x.medicine_name)}${text(x.strength||x.dose)?` ${text(x.strength||x.dose)}`:""}`).join("; ");
  return `${displayDate(isoOf(r.reviewed_at||r.created_at))} - ${drName(r.doctor_name)}: ${text(r.clinical_notes)||text(r.review_type)||"Review recorded"}${items?`. Changes: ${items}`:""}`});

 // ---- AI observations (facts only from the records above) ----
 const facts={guest:{age:ageOf(patient),gender:text(patient.gender),diagnosis:text(patient.diagnosis),allergies:text(patient.allergies),admitted_on:displayDate(admission),referring_hospital:text(patient.hospital_name),treating_doctor:text(patient.treating_doctor)},
  period:{from:displayDate(from),to:displayDate(date),data_until:`${displayDate(date)} ${hhmm12(cutoff)}`},
  vitals:wv.map((x:any)=>({at:displayDateTime(x.recorded_at||x.created_at),bp:num(x.systolic)?`${num(x.systolic)}/${num(x.diastolic)??"-"}`:null,pulse:num(x.pulse),spo2:num(x.spo2),temp_f:num(x.temperature),resp:num(x.respiration),sugar:num(x.blood_sugar)?`${text(x.blood_sugar_type)||"RBS"} ${num(x.blood_sugar)}`:null,pain:num(x.pain_score),remarks:text(x.remarks)||null})),
  medicines:medRows.map((m:any)=>({medicine:m.name,dose:m.dose,times:m.times,frequency:m.freq,doses_given:m.given,doses_due:m.due,stopped:m.stopped,not_given:m.exceptions})),
  doses_given_late_with_reason:lateDoses,
  physiotherapy_plan:activePlans.map((p:any)=>({therapy:text(p.therapy_type),frequency:text(p.frequency),windows:p.session_times,precautions:text(p.precautions),advised_by:text(p.advised_by),ends:text(p.end_date)?displayDate(isoOf(p.end_date)):"until doctor review"})),
  physiotherapy_sessions:physioRows,doctor_reviews:reviewLines,intake_output_daily:ioDays.map(x=>({date:displayDate(x.d),intake_ml:x.intake,output_ml:x.output,stools:x.stool})),
  meals:mealCounts,nursing_care_notes:careNotes,incidents:wInc.map((x:any)=>({at:displayDateTime(x.incident_at||x.created_at),type:text(x.incident_type||x.category),description:text(x.description),action:text(x.immediate_action)}))};
 let ai:any=null;try{ai=await aiObservations(sb,facts,documents)}catch(e){console.error("DOCTOR_REPORT_AI_ERROR",e instanceof Error?e.message:String(e))}

 // ======================= PDF =======================
 const pdf=await PDFDocument.create();const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold),italic=await pdf.embedFont(StandardFonts.HelveticaOblique);
 const W=595.28,H=841.89,M=28,mag=rgb(.72,.02,.34),deep=rgb(.33,.05,.2),pink=rgb(.95,.78,.86),pale=rgb(1,.96,.975),head=rgb(.99,.89,.93),ink=rgb(.18,.09,.15),grey=rgb(.42,.33,.38),red=rgb(.75,.07,.13),green=rgb(.03,.48,.26),white=rgb(1,1,1);
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
  let bytes:ArrayBuffer|null=null,fromErp=false;
  for(const u of ["https://app.samaraassistedliving.com/assets/samara-logo.png","https://samaraassistedliving.com/assets/samara-logo.png"]){try{const r=await samaraInboxFetch(u);if(r.ok){bytes=await r.arrayBuffer();fromErp=u.includes("app.");break}}catch{/* next */}}
  if(!bytes)throw new Error("logo");
  const logo=await pdf.embedPng(bytes);
  // samara-logo.png (1536x1024) has transparent margins: visible content box x 111-1421, y 131-847.
  const box=fromErp&&logo.width===1536&&logo.height===1024?{x:111,y:131,w:1310,h:716}:{x:0,y:0,w:logo.width,h:logo.height};
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
   return {g,lines,h:Math.max(15,lines.length*lh)+5}});
  const srcLines=ai?wrapW(`Prepared by AI (Gemini) from Samara records${ai.sources?.length?`: ${ai.sources.join("; ")}`:""}. These are observations of recorded data only - not a diagnosis and not a recommendation. Please verify against the records below.`,6.6,W-2*M-2*pad,italic):
   wrapW("Clinical observations could not be prepared for this report. All recorded data is given in the sections below.",7.4,W-2*M-2*pad,italic);
  const innerH=22+blocks.reduce((a:number,b:any)=>a+b.h,0)+srcLines.length*8.4+6;
  ensure(Math.min(innerH,400));
  const top=y;page.drawRectangle({x:M,y:top-innerH,width:W-2*M,height:innerH,color:pale,borderColor:rgb(.9,.56,.71),borderWidth:1.1});
  T("Clinical Observations",M+pad,top-15,10.5,bold,deep);
  const badge="AI-assisted | observations only";const bw=tw(badge,6.8,bold)+12;page.drawRectangle({x:W-M-pad-bw,y:top-18,width:bw,height:12,color:head,borderColor:pink,borderWidth:.6});T(badge,W-M-pad-bw+6,top-14.2,6.8,bold,mag);
  let yy=top-25;
  blocks.forEach((b:any,i:number)=>{if(i)page.drawLine({start:{x:M+pad,y:yy+2},end:{x:W-M-pad,y:yy+2},thickness:.4,color:pink,dashArray:[1.5,1.5]});
   const label=b.g.area.toUpperCase();let ls=7.6;while(ls>5.8&&tw(label,ls,bold)>chipW-8)ls-=.2;
   page.drawRectangle({x:M+pad,y:yy-12,width:chipW,height:13,color:aiChipColour(b.g.area)});centre(label,M+pad+chipW/2,yy-8.2,ls,bold,white);
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
  medRows.length?medRows.map((m:any)=>[{t:`${m.name}${m.stopped?" (stopped)":""}`,b:true},m.dose||"-",m.times,{t:m.due!==null?`${m.given} / ${m.due}`:String(m.given),c:m.due!==null&&m.given<m.due?red:green,b:true},{t:m.exceptions.join("; ")||"None",c:m.exceptions.length?red:undefined}]):[["No medicine orders in the period","-","-","-","-"]],7.2);
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

 // ---- 6. Nursing ----
 sectionTitle("Nursing summary");
 const mealText=Object.keys(mealCounts).length?Object.entries(mealCounts).map(([k,v])=>`${k}: ${v}`).join(", "):"No meal records";
 const ioText=ioDays.length?ioDays.map(x=>`${displayDate(x.d).slice(0,5)}: in ${x.intake} ml / out ${x.output} ml${x.stool?` / stool ${x.stool}`:""}`).join("; "):"Not charted";
 const incText=wInc.length?wInc.map((x:any)=>`${displayDateTime(x.incident_at||x.created_at)} ${text(x.incident_type||x.category)}: ${text(x.description)}`).join("; "):"No incidents recorded";
 table([{h:"Meals (period)",w:120},{h:"Intake / output (last 3 days)",w:170},{h:"Incidents",w:130},{h:"Nursing care",w:110}],[[mealText,ioText,{t:incText,c:wInc.length?red:undefined},`${wCare.length} care record(s)${careNotes.length?`; notes: ${careNotes.slice(-3).join("; ")}`:""}`]],7.2);

 // ---- reply box + footer ----
 const replyLines=wrapW("Reply on this WhatsApp chat with any instructions. Your reply reaches the Samara nursing team in the ERP WhatsApp Inbox.",7.6,W-2*M-16);
 const rh=replyLines.length*10+10;ensure(rh+6);page.drawRectangle({x:M,y:y-rh,width:W-2*M,height:rh,color:rgb(1,.98,.99),borderColor:mag,borderWidth:.9,borderDashArray:[3,2]});
 replyLines.forEach((l,i)=>T(l,M+8,y-12-i*10,7.6,i?regular:bold,i?ink:deep));y-=rh+6;
 const pages=pdf.getPages();pages.forEach((p,i)=>{p.drawLine({start:{x:M,y:40},end:{x:W-M,y:40},thickness:.5,color:pink});
  p.drawText(pdfText(`Samara Assisted Living | Daily Clinical Report | data till ${displayDate(date)} ${hhmm12(cutoff)}`),{x:M,y:30,size:6.4,font:regular,color:grey});
  const r=`Confidential - for the treating doctor | ${i+1} / ${pages.length}`;p.drawText(r,{x:W-M-regular.widthOfTextAtSize(r,6.4),y:30,size:6.4,font:regular,color:grey})});
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

  if(!scheduled){const jwt=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");const auth=await sb.auth.getUser(jwt);if(auth.error||!auth.data.user)return json({ok:false,error:"Unauthorised"},401)}
  if(scheduled){
   const now=new Date(),date=indiaDate(now),time=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",hour12:false}).format(now);
   const prefs=await sb.from("patient_family_communication_preferences").select("*").eq("daily_whatsapp_enabled",true).eq("is_active",true);
   if(prefs.error){console.error("DAILY_REPORT preference query failed",prefs.error);throw prefs.error}
   const duePrefs=(prefs.data||[]).filter((pref:any)=>{const scheduledTime=text(pref.daily_report_time).slice(0,5);return Boolean(scheduledTime&&scheduledTime<=time)});
   console.log("DAILY_REPORT_RUN",JSON.stringify({date,time,enabled:(prefs.data||[]).length,due:duePrefs.length,due_patients:duePrefs.map((x:any)=>x.patient_id)}));
   const results:any[]=[];for(const pref of duePrefs){
    try{
     const pr=await sb.from("patients").select("*").eq("id",pref.patient_id).single();
     if(pr.error)throw pr.error;if(pr.data.is_active===false){results.push({patient_id:pref.patient_id,status:"skipped_inactive"});continue}
     const recipients:any[]=[{type:"Relative",name:pref.recipient_name||"Family Member",mobile:pref.recipient_mobile}];
     if(pref.doctor_report_enabled===true){
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
   return json({ok:true,date,time,enabled:(prefs.data||[]).length,due:duePrefs.length,results});
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
