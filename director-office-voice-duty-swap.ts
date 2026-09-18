import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function reply(data: unknown, status=200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {...CORS, "Content-Type":"application/json"},
  })
}

function bytesToBase64(bytes:Uint8Array){
  let binary="";const size=0x8000
  for(let i=0;i<bytes.length;i+=size)binary+=String.fromCharCode(...bytes.subarray(i,i+size))
  return btoa(binary)
}

function geminiSchema(value:any):any{
  if(Array.isArray(value))return value.map(geminiSchema)
  if(!value||typeof value!=="object")return value
  const out:any={}
  for(const [key,item] of Object.entries(value)){
    if(key==="additionalProperties")continue
    out[key]=key==="type"&&typeof item==="string"?item.toUpperCase():geminiSchema(item)
  }
  return out
}

async function geminiAudio(apiKey:string,file:File,systemInstruction:string,responseSchema:any){
  const content=bytesToBase64(new Uint8Array(await file.arrayBuffer()))
  const mimeType=String(file.type||"audio/webm").split(";")[0].trim().toLowerCase()||"audio/webm"
  const model=Deno.env.get("GEMINI_VOICE_MODEL")||"gemini-2.5-flash"
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),18000)
  try{
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
      method:"POST",signal:controller.signal,
      headers:{"x-goog-api-key":apiKey,"Content-Type":"application/json"},
      body:JSON.stringify({
        systemInstruction:{parts:[{text:systemInstruction}]},
        contents:[{role:"user",parts:[
          {text:"Listen to the complete recording. Follow the instructions exactly and return only the requested JSON."},
          {inlineData:{mimeType,data:content}}
        ]}],
        generationConfig:{temperature:0,responseMimeType:"application/json",responseSchema:geminiSchema(responseSchema),thinkingConfig:{thinkingBudget:0}}
      })
    })
    const data=await response.json()
    if(!response.ok)throw new Error(data?.error?.message||`Gemini error ${response.status}`)
    const raw=(data?.candidates?.[0]?.content?.parts||[]).map((part:any)=>part?.text||"").join("").trim()
    if(!raw)throw new Error("Gemini returned no usable text")
    return JSON.parse(raw.replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,""))
  }finally{clearTimeout(timer)}
}

const schema = {
  type:"object",
  additionalProperties:false,
  properties:{
    item_type:{type:"string",enum:["Task","Appointment","Call / Callback","Follow-up","Visitor","Correspondence","Reminder"]},
    task_kind:{type:"string",enum:["Visit","Buy / Purchase","Attend Function","Trip / Travel","General Task","Not Applicable"]},
    title:{type:"string"},
    contact_name:{type:"string"},
    contact_mobile:{type:"string"},
    organisation:{type:"string"},
    scheduled_at:{type:"string"},
    due_date:{type:"string"},
    day_part:{type:"string",enum:["Morning","Afternoon","Evening","Night","Not Applicable"]},
    priority:{type:"string",enum:["Normal","Important","Urgent"]},
    details:{type:"string"},
    needs_director_attention:{type:"boolean"}
  },
  required:["item_type","task_kind","title","contact_name","contact_mobile","organisation","scheduled_at","due_date","day_part","priority","details","needs_director_attention"]
}

const nursingNoteSchema = {
  type:"object",
  additionalProperties:false,
  properties:{heard_text:{type:"string"},translated_text:{type:"string"}},
  required:["heard_text","translated_text"]
}

function nursingSlangInstructions() {
return `Convert a Tamil, Chennai Tamil, colloquial Tamil, Tamil-English, or English nursing note into one clear, faithful SIMPLE ENGLISH clinical note.

This is assisted-living bedside speech, not formal written Tamil. Understand shortened words, local pronunciation, respectful plural endings and speech-recognition spelling errors.

COMMON LOCAL USAGE (use context; do not copy these blindly):
- நல்லா இருக்காங்க / ஓகேவா இருக்காங்க = patient is well/stable
- சாப்டாங்க / சாப்பிட்டாங்க = ate; சாப்பிடல / சாப்டல = did not eat
- தூங்கிட்டாங்க / நல்லா தூங்குனாங்க = slept / slept well; தூங்கல = did not sleep
- மாத்திரை குடுத்தாச்சு / மருந்து கொடுத்தாச்சு = medicine was administered
- மாத்திரை வாங்கிட்டாங்க = took the medicine (not purchased medicine)
- மோஷன் போச்சு / மலம் போனாங்க = passed stools; லூஸ் மோஷன் = loose stools
- யூரின் போச்சு / யூரின் பாஸ் பண்ணாங்க = passed urine; யூரின் போகல = did not pass urine
- டயப்பர் சேஞ்ச் பண்ணியாச்சு = diaper was changed
- பொசிஷன் சேஞ்ச் / டர்னிங் பண்ணியாச்சு = repositioning was done
- பீடிங் / ஃபீட் குடுத்தாச்சு = feeding was given
- சக்‌ஷன் / சக்ஷன் பண்ணியாச்சு = suction was performed
- நெபுலைசர் / நெபுலைசேஷன் குடுத்தாச்சு = nebulisation was given
- ட்ராக்கி / டிராக்கியோஸ்டமி = tracheostomy
- பிபி = blood pressure; சுகர் = blood glucose; சாட் / சாட்சுரேஷன் = oxygen saturation; டெம்ப் = temperature
- ரெஸ்ட்லெஸா இருக்காங்க = patient is restless; ஒத்துழைக்கல = did not cooperate
- டாக்டர்கிட்ட சொன்னாச்சு = doctor was informed; அட்டெண்டர்கிட்ட சொன்னாச்சு = attendant was informed
- பாத்துக்கணும் / கவனிக்கணும் = needs monitoring/attention; பண்ணணும் = needs to be done

RULES:
- heard_text must be a faithful transcript in the language/script spoken. Capture the complete recording, not only its first sentence.
- translated_text must be the complete simple-English clinical note.
- Except for heard_text, return English only, in Latin script. Translate ordinary Tamil; transliterate genuine names and medicine names.
- Preserve every stated medicine, dose, route, time, symptom, observation, action, pending task and doctor instruction.
- Do not invent, diagnose, exaggerate, or change negation. Distinguish done, pending, refused, not done and unable.
- Keep multiple spoken sentences as multiple short English sentences in the same order.
- Correct obvious speech-recognition phonetic errors only when the intended clinical phrase is clear.
- If a word remains uncertain, preserve a readable transliteration instead of guessing.
- Output only the required JSON.`
}

async function translateNursingNote(apiKey:string, transcript:string) {
  const controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(),15000)
  try{
    const r=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      signal:controller.signal,
      headers:{"Authorization":`Bearer ${apiKey}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        model:"gpt-5-mini",
        reasoning:{effort:"low"},
        instructions:nursingSlangInstructions(),
        input:transcript,
        max_output_tokens:700,
        store:false,
        text:{verbosity:"low",format:{type:"json_schema",name:"nursing_note_translation",strict:true,schema:nursingNoteSchema}}
      })
    })
    const data=await r.json()
    if(!r.ok)throw new Error(data?.error?.message||`OpenAI error ${r.status}`)
    let raw=String(data?.output_text||"").trim()
    if(!raw&&Array.isArray(data?.output))raw=data.output.flatMap((item:any)=>Array.isArray(item?.content)?item.content:[]).map((part:any)=>typeof part?.text==="string"?part.text:"").join("").trim()
    if(!raw)throw new Error("No English nursing note was returned")
    const translated=String(JSON.parse(raw)?.translated_text||"").trim()
    if(!translated)throw new Error("No English nursing note was returned")
    return translated
  }finally{clearTimeout(timer)}
}

function instructions(nowIso:string, timezone:string) {
return `You fill a Director's Office ERP form from short spoken instructions.

The speaker may use Tamil, colloquial Tamil, English, or Tamil-English. Understand meaning rather than exact spelling.

OUTPUT LANGUAGE — STRICT
- EVERY returned text field must be in clear, simple ENGLISH ONLY.
- NEVER return Tamil script in title, contact_name, organisation, or details.
- NEVER return mixed Tamil-English / Tanglish text.
- Translate ordinary Tamil words fully into English.
- For Tamil personal names, organisation names, or place names that have no English translation, transliterate the name into readable Latin letters.
- Before returning JSON, inspect every string field. If any Tamil Unicode characters remain, translate/transliterate them and regenerate the field in English/Latin script only.
- Example: "வேஸ்ட் மேனேஜ்மென்ட் எக்ஸாம்ன்ஸ் நாளைக்கு பயம் எடுக்கணும்" must produce an English-only task such as "Prepare the Waste Management exams tomorrow", never "Prepare பயம் எடுக்க for Waste Management எக்ஸாம்ன்ஸ்".
- Example: "குமாரை நாளைக்கு காலை பத்து மணிக்கு கூப்பிடணும்" = "Call Kumar tomorrow at 10:00 AM."

ACCURACY RULES
- Return simple English.
- Preserve the actual action and every concrete noun/object, but TRANSLATE Tamil nouns/actions into English rather than copying Tamil script.
- Never invent a person, place, object, phone number, organisation, date, time, or action.
- Example: "நாளை மதியானம் பிரியாணி பண்ணணும்" = "Prepare biryani tomorrow afternoon", NOT "Have lunch tomorrow at noon".
- "பண்ணணும்/பண்ணனும்/செய்யணும்" means do/make/prepare according to context. Do not infer eating/buying/calling/visiting unless actually supported.
- மதியம்/மதியானம் means afternoon/noon period; it is NOT an exact 12:00 time.
- Preserve proper names and place names.
- For Trip / Travel, put the destination in contact_name (Person / Place), not only in the title.
- If the speaker gives a relative date, day part, or exact time, preserve all of them in details.
- In details use natural 12-hour time with AM/PM, e.g. "6:00 AM"; scheduled_at remains 24-hour YYYY-MM-DDTHH:mm.
- Tamil/STT variants such as நாளானக்கி, நாளனக்கி, நாளனிக்கு, நாளானிக்கு, நாளான்னிக்கு and நாளன்னிக்கு mean DAY AFTER TOMORROW, not tomorrow.

CLASSIFICATION
Task subtypes: Visit, Buy / Purchase, Attend Function, Trip / Travel, General Task.
Other item types: Appointment, Call / Callback, Follow-up, Visitor, Correspondence, Reminder.
For non-Task items return task_kind="Not Applicable".

DATES
Current instant: ${nowIso}
Timezone: ${timezone}
Resolve today/tomorrow/day-after-tomorrow and equivalent Tamil expressions from this current date.
scheduled_at must be YYYY-MM-DDTHH:mm ONLY when both a date and exact clock time are explicitly known.
due_date must be YYYY-MM-DD when a date is known but no exact time is spoken.
Never invent a clock time.
day_part is Morning/Afternoon/Evening/Night/Not Applicable.
details is one short faithful English sentence.
priority is Normal unless importance/urgency is clearly spoken.
needs_director_attention is true only when Director attention/decision/approval is explicitly requested.`
}


function semanticTranscript(transcript:string) {
  let t=transcript

  // Common Tamil/STT variants meaning "day after tomorrow".
  // Add an English semantic hint rather than replacing the user's original speech.
  const dayAfterTomorrow =
    /நாளானக்கி|நாளனக்கி|நாளனிக்கு|நாளனிக்கி|நாளானிக்கு|நாளானிக்கி|நாளான்னிக்கு|நாளன்னிக்கு|நாளன்னிக்கி|நாளன்னைக்கு|நாளானைக்கு|நாளைன்னைக்கு|நாளை\s*மறுநாள்|நாளை\s*மறு\s*நாள்|நாளை\s*மறு\s*தினம்/i

  if(dayAfterTomorrow.test(t)){
    t += "\nSemantic date hint: The Tamil relative-date expression above means DAY AFTER TOMORROW, not tomorrow."
  }
  return t
}

function humanTime(hhmm:string) {
  const m=/^(\d{1,2}):(\d{2})$/.exec(hhmm||"")
  if(!m) return ""
  let h=Number(m[1]); const min=m[2]
  const ap=h>=12?"PM":"AM"
  h=h%12||12
  return `${h}:${min} ${ap}`
}

function relativeDatePhrase(transcript:string) {
  if(/நாளானக்கி|நாளனக்கி|நாளனிக்கு|நாளனிக்கி|நாளானிக்கு|நாளானிக்கி|நாளான்னிக்கு|நாளன்னிக்கு|நாளன்னிக்கி|நாளன்னைக்கு|நாளானைக்கு|நாளைன்னைக்கு|நாளை\s*மறுநாள்|நாளை\s*மறு\s*நாள்|நாளை\s*மறு\s*தினம்|\bday after tomorrow\b/i.test(transcript))
    return "day after tomorrow"
  if(/நாளைக்கு|நாளை|நாளைக்கி|நாளைக்கே|\btomorrow\b/i.test(transcript))
    return "tomorrow"
  if(/இன்று|இன்றைக்கு|இன்னைக்கு|இன்னிக்கு|இன்னிக்கி|\btoday\b/i.test(transcript))
    return "today"
  return ""
}

function enrichFields(x:any, transcript:string) {
  const out=clean(x)

  // Travel destination should populate Person / Place when AI identified it in title.
  if(out.item_type==="Task" && out.task_kind==="Trip / Travel" && !out.contact_name){
    const m=/^(?:leave|travel|go|depart|start|drive|fly|ride)\s+(?:for|to)\s+(.+?)(?:\s+(?:today|tomorrow|day after tomorrow)\b|$)/i.exec(out.title)
    if(m?.[1]) out.contact_name=m[1].trim()
  }

  const rel=relativeDatePhrase(transcript)
  const day=out.day_part ? out.day_part.toLowerCase() : ""
  const exact=out.scheduled_at && out.scheduled_at.includes("T")
    ? humanTime(out.scheduled_at.slice(11,16))
    : ""

  // Preserve spoken scheduling information in the note. Do not invent it.
  if(rel || day || exact){
    let base=out.title.replace(/[.]+$/,"").trim()
    const parts=[base]
    if(rel && !base.toLowerCase().includes(rel)) parts.push(rel)
    if(day && !base.toLowerCase().includes(day)) parts.push(day)
    if(exact) parts.push(`at ${exact}`)
    out.details=parts.join(" ").replace(/\s+/g," ").trim()+"."
  }

  return out
}


async function transcribeAudio(apiKey:string, file:File, spokenLanguage:string) {
  const fd=new FormData()
  fd.append("file",file,file.name||"samara-voice.webm")
  fd.append("model","gpt-4o-mini-transcribe")
  if(String(spokenLanguage||"").toLowerCase().startsWith("ta")) fd.append("language","ta")
  else if(String(spokenLanguage||"").toLowerCase().startsWith("en")) fd.append("language","en")
  fd.append("prompt","Samara assisted-living nursing note spoken in Chennai Tamil, local colloquial Tamil or Tamil-English. Accurately preserve patient names, medicines, dose, route, food, sleep, urine, stools, diaper, feeding, suction, nebulisation, tracheostomy, symptoms, observations, pending work, doctor orders, times and negation. Common speech: சாப்டாங்க, சாப்பிடல, தூங்கிட்டாங்க, மாத்திரை குடுத்தாச்சு, மோஷன் போச்சு, யூரின் பாஸ் பண்ணாங்க, டயப்பர் சேஞ்ச், பொசிஷன் சேஞ்ச், பாத்துக்கணும்.")

  const controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(),20000)
  try{
    const r=await fetch("https://api.openai.com/v1/audio/transcriptions",{
      method:"POST",
      signal:controller.signal,
      headers:{"Authorization":`Bearer ${apiKey}`},
      body:fd
    })
    const data=await r.json()
    if(!r.ok) throw new Error(data?.error?.message||`OpenAI transcription error ${r.status}`)
    const text=String(data?.text||"").trim()
    if(!text) throw new Error("No speech was detected in the recording.")
    return text
  }finally{
    clearTimeout(timer)
  }
}

async function openAI(apiKey:string, transcript:string, nowIso:string, timezone:string) {
  const controller=new AbortController()
  const timer=setTimeout(()=>controller.abort(),12000)
  try {
    const r=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",
      signal:controller.signal,
      headers:{
        "Authorization":`Bearer ${apiKey}`,
        "Content-Type":"application/json",
      },
      body:JSON.stringify({
        model:"gpt-5-mini",
        reasoning:{effort:"low"},
        instructions:instructions(nowIso,timezone),
        input:semanticTranscript(transcript),
        max_output_tokens:700,
        store:false,
        text:{
          verbosity:"low",
          format:{
            type:"json_schema",
            name:"director_office_voice",
            strict:true,
            schema
          }
        }
      })
    })
    const data=await r.json()
    if(!r.ok) throw new Error(data?.error?.message || `OpenAI error ${r.status}`)
    // REST Responses API returns generated text inside output[].content[].
    // `output_text` is a convenience property in some SDKs, not guaranteed
    // on the raw HTTP JSON response.
    let raw=String(data?.output_text || "").trim()
    if(!raw && Array.isArray(data?.output)){
      raw=data.output
        .flatMap((item:any)=>Array.isArray(item?.content)?item.content:[])
        .filter((part:any)=>part?.type==="output_text" || typeof part?.text==="string")
        .map((part:any)=>typeof part?.text==="string"?part.text:"")
        .join("")
        .trim()
    }
    if(!raw){
      console.error("OpenAI response had no output text:", JSON.stringify(data))
      throw new Error("OpenAI returned no structured form data")
    }
    let parsed=JSON.parse(raw)

    // Hard guard: ERP form output must never contain Tamil script / Tanglish.
    // If the first structured response still contains Tamil characters, run one
    // constrained repair pass before returning it to the ERP.
    const hasTamil=(value:any)=>/[\u0B80-\u0BFF]/.test(JSON.stringify(value||{}))
    if(hasTamil(parsed)){
      const repairController=new AbortController()
      const repairTimer=setTimeout(()=>repairController.abort(),10000)
      try{
        const rr=await fetch("https://api.openai.com/v1/responses",{
          method:"POST",
          signal:repairController.signal,
          headers:{
            "Authorization":`Bearer ${apiKey}`,
            "Content-Type":"application/json",
          },
          body:JSON.stringify({
            model:"gpt-5-mini",
            reasoning:{effort:"low"},
            instructions:`Convert the supplied structured Samara ERP task to CLEAR SIMPLE ENGLISH ONLY.
Do not change its meaning, dates, times, priority, classification, or facts.
Translate all Tamil words into English.
Transliterate only genuine Tamil personal/place/organisation names into Latin letters.
ABSOLUTELY NO Tamil Unicode characters may remain in any returned string field.
Return only the required JSON schema.`,
            input:JSON.stringify(parsed),
            max_output_tokens:700,
            store:false,
            text:{
              verbosity:"low",
              format:{
                type:"json_schema",
                name:"director_office_voice_english_repair",
                strict:true,
                schema
              }
            }
          })
        })
        const rd=await rr.json()
        if(rr.ok){
          let repaired=String(rd?.output_text||"").trim()
          if(!repaired && Array.isArray(rd?.output)){
            repaired=rd.output
              .flatMap((item:any)=>Array.isArray(item?.content)?item.content:[])
              .filter((part:any)=>part?.type==="output_text" || typeof part?.text==="string")
              .map((part:any)=>typeof part?.text==="string"?part.text:"")
              .join("")
              .trim()
          }
          if(repaired){
            const candidate=JSON.parse(repaired)
            if(!hasTamil(candidate)) parsed=candidate
          }
        }
      }catch(e){
        console.error("English-only repair pass failed:",e)
      }finally{
        clearTimeout(repairTimer)
      }
    }

    return parsed
  } finally {
    clearTimeout(timer)
  }
}

function clean(x:any) {
  const item=["Task","Appointment","Call / Callback","Follow-up","Visitor","Correspondence","Reminder"].includes(x?.item_type)?x.item_type:"Task"
  return {
    item_type:item,
    task_kind:item==="Task" && ["Visit","Buy / Purchase","Attend Function","Trip / Travel","General Task"].includes(x?.task_kind)?x.task_kind:(item==="Task"?"General Task":""),
    title:String(x?.title||"").trim(),
    contact_name:String(x?.contact_name||"").trim(),
    contact_mobile:String(x?.contact_mobile||"").trim(),
    organisation:String(x?.organisation||"").trim(),
    scheduled_at:String(x?.scheduled_at||"").trim(),
    due_date:String(x?.scheduled_at||"").trim()?"":String(x?.due_date||"").trim(),
    day_part:x?.day_part==="Not Applicable"?"":String(x?.day_part||"").trim(),
    priority:["Normal","Important","Urgent"].includes(x?.priority)?x.priority:"Normal",
    details:String(x?.details||"").trim(),
    needs_director_attention:Boolean(x?.needs_director_attention),
  }
}

serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:CORS})
  if(req.method!=="POST") return reply({error:"Method not allowed"},405)

  try {
    const key=Deno.env.get("OPENAI_API_KEY")||""
    const geminiKey=Deno.env.get("GEMINI_API_KEY")||""
    if(!key&&!geminiKey) return reply({error:"GEMINI_API_KEY and OPENAI_API_KEY are not configured"},503)

    const url=Deno.env.get("SUPABASE_URL")!
    const anon=Deno.env.get("SUPABASE_ANON_KEY")!
    const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const auth=req.headers.get("Authorization")||""

    const client=createClient(url,anon,{global:{headers:{Authorization:auth}},auth:{persistSession:false,autoRefreshToken:false}})
    const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}})

    const {data:{user},error:userError}=await client.auth.getUser()
    if(userError||!user) return reply({error:"Please sign in again"},401)

    const {data:profile}=await admin.from("duty_profiles")
      .select("id,role,designation,is_active,active")
      .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`)
      .maybeSingle()

    if(!profile || !(profile.is_active ?? profile.active ?? false))
      return reply({error:"Employee account is inactive"},403)

    const designation=String(profile.designation||"").trim().toLowerCase()
    const role=String(profile.role||"").trim().toLowerCase()

    // Samara ERP global voice entry is available to authorised management and
    // frontline clinical staff. Field/module permissions remain enforced by ERP UI/RLS.
    let allowed=
      role==="admin" ||
      role==="manager" ||
      role==="std" ||
      role==="nurse" ||
      role==="caregiver" ||
      role==="nurse manager" ||
      role==="nursing manager" ||
      designation==="nurse manager" ||
      designation==="nursing manager" ||
      designation==="staff nurse" ||
      designation==="nursing supervisor" ||
      designation==="anm" ||
      designation==="caregiver"

    if(!allowed){
      const {data:pos}=await admin.from("director_office_positions")
        .select("assigned_profile_id")
        .eq("position_key","director")
        .maybeSingle()
      allowed=String(pos?.assigned_profile_id||"")===String(profile.id||"")
    }

    if(!allowed) return reply({
      error:"Voice entry is available to authorised Samara management and clinical staff"
    },403)

    const contentType=String(req.headers.get("content-type")||"")
    let transcript=""
    let timezone="Asia/Kolkata"
    let nowIso=new Date().toISOString()
    let currentFormType=""
    let providerPreference="auto"
    let audioFile:File|null=null

    if(contentType.includes("multipart/form-data")){
      const fd=await req.formData()
      const audio=fd.get("audio")
      const spokenLanguage=String(fd.get("spoken_language")||"ta-IN")
      currentFormType=String(fd.get("current_form_type")||"")
      providerPreference=String(fd.get("provider_preference")||"auto").toLowerCase()
      timezone=String(fd.get("timezone")||"Asia/Kolkata")
      nowIso=String(fd.get("now_iso")||new Date().toISOString())
      if(!(audio instanceof File)) return reply({error:"No mobile audio recording received"},400)
      audioFile=audio
      // Gemini processes the complete audio first. OpenAI remains the automatic
      // fallback and can also be selected manually from the editable review.
      if(providerPreference!=="openai"&&geminiKey){
        try{
          if(currentFormType.toLowerCase().includes("nursing")){
            const result=await geminiAudio(geminiKey,audio,nursingSlangInstructions(),nursingNoteSchema)
            const translatedText=String(result?.translated_text||"").trim()
            if(!translatedText)throw new Error("Gemini returned no English nursing note")
            const heardText=String(result?.heard_text||translatedText).trim()
            return reply({ok:true,provider:"gemini",provider_used:"Gemini",model:Deno.env.get("GEMINI_VOICE_MODEL")||"gemini-2.5-flash",transcript:heardText,translated_text:translatedText,fields:{title:translatedText,details:""}})
          }
          const result=clean(await geminiAudio(geminiKey,audio,instructions(nowIso,timezone),schema))
          const fields=enrichFields(result,result.title||"")
          if(!fields.title)throw new Error("The instruction could not be understood clearly. Please speak again.")
          return reply({ok:true,provider:"gemini",provider_used:"Gemini",model:Deno.env.get("GEMINI_VOICE_MODEL")||"gemini-2.5-flash",transcript:fields.title,fields})
        }catch(geminiError){
          console.error("Gemini primary failed:",geminiError)
          if(providerPreference==="gemini"||providerPreference==="google")return reply({error:geminiError instanceof Error?geminiError.message:"Gemini failed",provider:"gemini"},502)
        }
      }
      if(!key)return reply({error:"Gemini could not process this recording and OPENAI_API_KEY is not configured for fallback"},503)
      transcript=await transcribeAudio(key,audio,spokenLanguage)
    }else{
      const body=await req.json()
      transcript=String(body?.transcript||"").trim()
      currentFormType=String(body?.current_form_type||"")
      providerPreference=String(body?.provider_preference||"auto").toLowerCase()
      timezone=String(body?.timezone||"Asia/Kolkata")
      nowIso=String(body?.now_iso||new Date().toISOString())
    }

    if(!transcript) return reply({error:"No speech transcript received"},400)

    // Nursing notes need only faithful Tamil-to-English conversion. Using the
    // compact note schema avoids the larger Director's Office form extraction
    // and its optional repair pass, materially reducing processing time.
    if(currentFormType.toLowerCase().includes("nursing")){
      const translatedText=await translateNursingNote(key,transcript)
      return reply({
        ok:true,
        provider:"openai",
        provider_used:providerPreference==="auto"&&audioFile?"OpenAI fallback":"OpenAI",
        model:"gpt-5-mini",
        transcript,
        translated_text:translatedText,
        fields:{title:translatedText,details:""}
      })
    }

    const fields=enrichFields(await openAI(key,transcript,nowIso,timezone),transcript)
    if(!fields.title) throw new Error("The instruction could not be understood clearly. Please speak again.")

    return reply({ok:true,provider:"openai",model:"gpt-5-mini",transcript,fields})
  } catch(e) {
    const timed=e instanceof DOMException && e.name==="AbortError"
    console.error("director-office-voice:",e)
    return reply({
      error: timed
        ? "Voice translation took too long. Please try again."
        : (e instanceof Error?e.message:"Voice processing failed")
    }, timed?504:500)
  }
})
