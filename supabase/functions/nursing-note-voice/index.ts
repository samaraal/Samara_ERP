// Samara Care ERP 2.18.139 — Nursing Notes voice assistant (Edge Function: nursing-note-voice).
// 2.20.79: + mode "Meal" — Meal / Beverage entry by voice (Tamil / Tamiglish / English → English form fields); STD / Kitchen allowed for this mode only.
// The nurse speaks a nursing note in Tamil (incl. Chennai / colloquial Tamil, Tamil-English) or English.
// Gemini listens to the recording (or reads the typed / browser-recognised text) and returns:
//   heard_text   – what was said, in the language spoken
//   english_note – the whole note in simple English (used for the Quick note)
//   focus        – one of the Nursing Notes focus list
//   data / action / response – the same note arranged as DAR
// STRICT: faithful to what was said — nothing invented, no diagnosis, no advice. The nurse checks
// and edits every field before saving; nothing is saved by this function. Recordings are not stored.
// Requires a logged-in Admin / Manager / Nurse / Caregiver (or Physiotherapist, Physio mode only — ERP 2.19.57).
// Secrets used (already set): GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional: NURSING_NOTE_MODEL.
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const out = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const FOCUS = [
  "General condition", "Sleep / Rest", "Pain", "Fall", "Incident", "Behaviour / Mood", "Breathing",
  "Skin / Wound", "Bowel / Bladder", "Eating / Drinking", "Mobility", "Medication response",
  "Family visit / call", "Doctor visit / instruction", "Other",
];

const SYSTEM = `You are the voice assistant for NURSING NOTES at Samara Assisted Living (a nursing care home in Chennai; residents are called "Guests").
A nurse has spoken (or typed) one nursing note about one Guest. The speech may be Tamil, Chennai / colloquial Tamil, Tamil mixed with English words, or English.

COMMON LOCAL USAGE (use context; do not copy blindly):
- நல்லா இருக்காங்க / ஓகேவா இருக்காங்க = Guest is well / stable
- சாப்டாங்க / சாப்பிட்டாங்க = ate; சாப்பிடல / சாப்டல = did not eat; பாதி சாப்டாங்க = ate half
- தூங்கிட்டாங்க / நல்லா தூங்குனாங்க = slept / slept well; தூங்கல = did not sleep
- மாத்திரை குடுத்தாச்சு / மருந்து கொடுத்தாச்சு = medicine was given; மாத்திரை வாங்கிட்டாங்க = took the medicine
- மோஷன் போச்சு / மலம் போனாங்க = passed stools; லூஸ் மோஷன் = loose stools; யூரின் போச்சு = passed urine; யூரின் போகல = did not pass urine
- டயப்பர் சேஞ்ச் பண்ணியாச்சு = diaper changed; பொசிஷன் சேஞ்ச் / டர்னிங் = repositioning done
- ஃபீட் / பீடிங் குடுத்தாச்சு = feed given; சக்‌ஷன் = suction; நெபுலைசர் = nebulisation; ட்ராக்கி = tracheostomy
- பிபி = blood pressure; சுகர் = blood glucose; சாட் = oxygen saturation; டெம்ப் = temperature
- கீழே விழுந்துட்டாங்க = fell down; அடிபட்டுச்சு = got hurt; வலிக்குதுன்னு சொன்னாங்க = complained of pain
- ரெஸ்ட்லெஸா இருக்காங்க = restless; ஒத்துழைக்கல = did not cooperate; கோபமா இருந்தாங்க = was angry / agitated
- டாக்டர்கிட்ட சொன்னாச்சு = doctor was informed; அட்டெண்டர் / வீட்டுல சொன்னாச்சு = attendant / family was informed

RULES — faithful nursing documentation:
1. heard_text: a faithful transcript of the whole recording in the language and script spoken. If the input is already text, repeat it.
2. english_note: the complete note in simple, clear English clinical sentences, in the same order as spoken. Every reading, time, medicine, dose, symptom, action, response and instruction must be kept. Do not drop anything.
3. Arrange the SAME content as DAR:
   - data: what was observed / found / reported (condition, readings, symptoms, what the Guest said, what happened).
   - action: what the nurse or staff did (care given, medicine given, position changed, doctor / family informed, etc.).
   - response: how the Guest responded or the outcome after the action.
   Put each sentence in the field it belongs to. If nothing was said for action or response, return "" for it. Never invent an action or a response.
4. focus: choose the ONE best item from this list: ${FOCUS.join(", ")}. A fall must be "Fall". Any injury, accident, aggression, wandering, choking or other unusual event is "Incident".
5. Never invent, diagnose, interpret causes, exaggerate, or add advice. Keep negations exactly (did not eat, refused, not done). Correct obvious speech-recognition errors only when the meaning is clear; otherwise keep a readable transliteration.
6. Use English only (Latin script) in every field except heard_text. Keep names and medicine names as spoken (transliterated).
Return JSON only: {"heard_text":"...","english_note":"...","focus":"...","data":"...","action":"...","response":"..."}`;

// 2.19.57: Physio Notes & Observations (mode "Physio") — physiotherapist / staff speaks a physiotherapy note.
const PHYSIO_SYSTEM = `You are the voice assistant for PHYSIOTHERAPY NOTES at Samara Assisted Living (a nursing care home in Chennai; residents are called "Guests").
A physiotherapist (or nurse) has spoken (or typed) one note or observation about one Guest's physiotherapy. The speech may be Tamil, Chennai / colloquial Tamil, Tamil mixed with English words, or English.

COMMON LOCAL USAGE (use context; do not copy blindly):
- எக்ஸர்சைஸ் பண்ணாங்க / பயிற்சி செஞ்சாங்க = did the exercises; பண்ணல = did not do
- நடக்க வச்சோம் / வாக் பண்ணாங்க = made the Guest walk; வாக்கர் வச்சு = with a walker; ஸ்டிக் = walking stick; வீல்சேர் = wheelchair
- தனியா நடந்தாங்க = walked independently; சப்போர்ட் வேணும் / பிடிச்சுக்கிட்டு = needed support / holding on; ஒருத்தர் / ரெண்டு பேர் சப்போர்ட் = one-person / two-person support
- கால் தூக்க முடியுது / முடியல = able / unable to lift the leg; கை தூக்க = lift the arm; மடக்க / நீட்ட = bend / straighten
- உக்கார வச்சோம் = made the Guest sit up; நிக்க வச்சோம் = made the Guest stand; பெட்ல திரும்ப = turning in bed
- வலி இருக்கு / வலிக்குதுன்னு சொன்னாங்க = has pain / complained of pain; வலி குறைஞ்சிருக்கு = pain has reduced; வீக்கம் = swelling; இறுக்கம் / ஸ்டிஃப் = stiffness
- பேலன்ஸ் இல்ல = poor balance; தள்ளாடுறாங்க = unsteady; களைப்பா இருக்காங்க = tired / fatigued; மூச்சு வாங்குது = breathless
- நல்லா கோஆப்பரேட் பண்ணாங்க = cooperated well; ஒத்துழைக்கல = did not cooperate; மறுத்துட்டாங்க = refused
- முன்னேற்றம் இருக்கு / இம்ப்ரூவ் ஆயிருக்கு = there is improvement; அப்படியே இருக்கு = no change
- ரெப்ஸ் / செட் = repetitions / sets; ஸ்ட்ரெச்சிங், ஸ்ட்ரெந்தனிங், ROM, IFT, TENS, அல்ட்ராசவுண்ட், ஹாட் பேக், ஐஸ் பேக் = keep the standard physiotherapy term

RULES — faithful physiotherapy documentation:
1. heard_text: a faithful transcript of the whole recording in the language and script spoken. If the input is already text, repeat it.
2. english_note: the complete note in simple, clear English clinical sentences, in the same order as spoken. Keep every exercise, repetition, distance, time, assistance level, pain score, body part, side (left / right), aid, response and instruction. Do not drop anything.
3. Never invent, diagnose, interpret causes, exaggerate, or add advice or a plan that was not said. Keep negations exactly (did not walk, refused, not done). Correct obvious speech-recognition errors only when the meaning is clear; otherwise keep a readable transliteration.
4. Use English only (Latin script) in english_note. Keep names as spoken (transliterated).
Return JSON only: {"heard_text":"...","english_note":"..."}`;

// 2.20.79: Meal / Beverage voice (mode "Meal") — the ANM says what the Guest was served and how much she ate,
// in Tamil, Chennai / colloquial Tamil, Tamiglish (Tamil + English words) or English; the form is filled in English.
const MEAL_SYSTEM = `You are the voice assistant for MEAL & BEVERAGE ENTRY at Samara Assisted Living (a nursing care home in Chennai; residents are called "Guests").
A nurse / caregiver (ANM) has spoken (or typed) what ONE Guest was given to eat or drink and how much was taken. The speech may be Tamil, Chennai / colloquial Tamil, Tamiglish (Tamil mixed with English words, e.g. "lunch-ku rice, sambar kuduthen, half dhaan saptanga"), or English.
You receive the allowed lists in the request. Fill the form fields from what was said.

COMMON LOCAL USAGE (use context; do not copy blindly):
- காலை டிஃபன் / breakfast / காலைல = Tiffin; மதியம் / lunch / சாப்பாடு (at noon) = Lunch; இரவு / நைட் / dinner = Dinner
- முழுசா / ஃபுல்லா / எல்லாம் சாப்டாங்க / full-ah = Consumed fully; பெரும்பாலும் / மோஸ்ட்லி / கொஞ்சம் மிச்சம் = Consumed mostly
- பாதி / ஹாஃப் / கொஞ்சம் தான் / half dhaan = Consumed partially; ருசி பார்த்தாங்க / டேஸ்ட் மட்டும் = Tasted only
- சாப்பிடல / சாப்டல / வேண்டாம்னு சொன்னாங்க / refuse பண்ணாங்க = Refused; வாந்தி / வாமிட் = Vomited; ட்யூப் ஃபீட் முடிஞ்சது / Ryle's feed = Tube feed completed
- இட்லி = Idli, தோசை = Dosa, பொங்கல் = Ven Pongal, உப்புமா = Upma, சாதம் / ரைஸ் = Rice, தயிர் சாதம் = Curd Rice, சாம்பார் = Sambar, ரசம் = Rasam, கூட்டு = Kootu, பொரியல் = Poriyal, கீரை = Keerai, மோர் = Buttermilk, தயிர் = Curd, கஞ்சி = Kanji / Porridge, சப்பாத்தி = Chapati
- டீ = Tea, காபி = Coffee, பால் = Milk, பூஸ்ட் = Boost, ஹார்லிக்ஸ் = Horlicks, ஜூஸ் = Fresh Juice (orange / சாத்துக்குடி = Mosambi / மாதுளை = Pomegranate / தர்பூசணி = Watermelon)
- ஒரு டம்ளர் / ஒரு கிளாஸ் / ஒரு கப் = quantity 1 with unit tumbler / glass / cup; "150 ml" = 150 ml; அரை டம்ளர் = 0.5 tumbler
- இப்போ / இப்ப / just now = the current time given; "எட்டு மணிக்கு" / "8 o'clock" = 08:00 in the morning, 20:00 at night (use the meal / time of day to decide); "ஒரு மணி" at lunch = 13:00

RULES:
1. heard_text: faithful transcript of what was said, in the language / script spoken (repeat the text if the input is text).
2. entry: "meal" if food (Breakfast / Lunch / Dinner items) was described, "beverage" if only a drink was described.
3. meal_type: one of Tiffin, Lunch, Dinner — only if said or clearly implied by the words or the time; else "".
4. items: food items served, each EXACTLY as written in the given food list when it matches (same spelling). Items said that are not in the list go to new_items, written in simple English (e.g. "Ragi Kali"). Keep the order spoken. Do not add items that were not said.
5. consumption_status: EXACTLY one of the given intake options, only if said; else "".
6. time: "HH:MM" 24-hour, only if said ("now" = the given current time); else "".
7. beverage: EXACTLY one of the given beverages, only for a drink; juice_name for Fresh Juice (e.g. "Orange"); quantity as a number and quantity_unit EXACTLY one of the given units, only if said.
8. remarks: anything else said that matters (refused an item, needed feeding help, choking / cough, complaint, spilled, family brought food …) in short simple English. "" if nothing.
9. Never invent or guess. Keep negations exactly. Use English (Latin script) in every field except heard_text.
Return JSON only: {"heard_text":"...","entry":"meal|beverage","meal_type":"","items":[],"new_items":[],"consumption_status":"","time":"","beverage":"","juice_name":"","quantity":"","quantity_unit":"","remarks":""}`;

function b64(bytes: Uint8Array) {
  let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function parseJson(t: string) {
  const raw = String(t || "").replace(/^\s*```(?:json)?\s*|```\s*$/g, "").trim();
  try { return JSON.parse(raw); } catch { /* try the {...} part */ }
  const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(raw.slice(a, b + 1)); } catch { /* fall through */ } }
  return null;
}
let goodModel = "";
function models() {
  const want = [Deno.env.get("NURSING_NOTE_MODEL"), goodModel, "gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"];
  return [...new Set(want.filter((m): m is string => !!m && !!m.trim()).map((m) => m.trim()))];
}
async function callGemini(key: string, model: string, parts: unknown[], thinking: boolean, system = SYSTEM) {
  const cfg: Record<string, unknown> = { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 4096 };
  if (/^gemini-2\./i.test(model)) cfg.thinkingConfig = { thinkingBudget: 0 };
  else if (thinking) cfg.thinkingConfig = { thinkingLevel: "low" };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST", signal: AbortSignal.timeout(45000),
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts }], generationConfig: cfg }),
  });
  return { r, j: await r.json().catch(() => null) };
}
async function gemini(parts: unknown[], system = SYSTEM) {
  const key = Deno.env.get("GEMINI_API_KEY"); if (!key) throw new Error("The voice service is not set up (Gemini key missing).");
  let last = "no model";
  for (const model of models()) {
    let { r, j } = await callGemini(key, model, parts, true, system);
    if (r.status === 400 && /thinking/i.test(String(j?.error?.message || ""))) ({ r, j } = await callGemini(key, model, parts, false, system));
    if (r.status === 404) { last = `${model} not available`; continue; }
    if (!r.ok) { last = `${model} HTTP ${r.status}`; console.error("nursing-note-voice gemini", model, r.status, String(j?.error?.message || "").slice(0, 160)); continue; }
    const txt = (j?.candidates?.[0]?.content?.parts || []).filter((p: any) => !p.thought).map((p: any) => p.text || "").join("");
    const x = parseJson(txt);
    if (x) { if (goodModel !== model) goodModel = model; return { x, model }; }
    last = `${model} unreadable`;
  }
  throw new Error(`The voice service could not read the note (${last}).`);
}
const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 4000);
const pickFocus = (v: unknown) => {
  const s = clean(v).toLowerCase();
  return FOCUS.find((f) => f.toLowerCase() === s) || FOCUS.find((f) => s && f.toLowerCase().startsWith(s.split(/[ /]/)[0])) || "General condition";
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return out({ error: "POST only" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: auth } = await admin.auth.getUser(token).catch(() => ({ data: null as any }));
    const user = auth?.user; if (!user) return out({ error: "Please sign in to the ERP again.", code: "AUTH" }, 401);
    const { data: prof } = await admin.from("profiles").select("*")
      .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`).limit(1).maybeSingle();
    if (!prof || prof.is_active === false || prof.active === false || !["Admin", "Manager", "Nurse", "Caregiver", "Physiotherapist", "STD", "Kitchen"].includes(String(prof.role)))
      return out({ error: "Nursing Notes voice is for nursing staff only." }, 403);
    let mealCtx = "";

    const parts: unknown[] = [];
    let spoken = "ta-IN";
    let mode = "DAR";
    const type = req.headers.get("content-type") || "";
    if (type.includes("multipart/form-data")) {
      const fd = await req.formData();
      spoken = String(fd.get("spoken_language") || spoken);
      mode = String(fd.get("mode") || mode);
      mealCtx = String(fd.get("context") || "").slice(0, 12000);
      const audio = fd.get("audio");
      if (!(audio instanceof File) || audio.size < 800) return out({ error: "No speech was captured. Please record again." }, 400);
      if (audio.size > 15_000_000) return out({ error: "The recording is too long. Please keep one note under about 5 minutes." }, 400);
      const mime = String(audio.type || "audio/webm").split(";")[0].trim().toLowerCase() || "audio/webm";
      parts.push({ text: `Spoken language selected by the nurse: ${spoken.startsWith("en") ? "English" : "Tamil"}. Listen to the complete recording and return the JSON.` });
      parts.push({ inlineData: { mimeType: mime, data: b64(new Uint8Array(await audio.arrayBuffer())) } });
    } else {
      const body = await req.json().catch(() => ({}));
      spoken = String(body?.spoken_language || spoken);
      mode = String(body?.mode || mode);
      mealCtx = typeof body?.context === "string" ? body.context.slice(0, 12000) : JSON.stringify(body?.context || "").slice(0, 12000);
      const text = clean(body?.text);
      if (text.length < 3) return out({ error: "No note text was received." }, 400);
      parts.push({ text: `The nurse's note (${spoken.startsWith("en") ? "English" : "Tamil / mixed"}), from speech recognition or typing:\n${text}\n\nReturn the JSON.` });
    }

    if (["STD", "Kitchen"].includes(String(prof.role)) && mode !== "Meal")
      return out({ error: "This login can use voice for meals and beverages only." }, 403);
    if (mode === "Meal") {
      parts.unshift({ text: `Allowed lists and the current time (JSON):\n${mealCtx || "{}"}` });
      const { x, model } = await gemini(parts, MEAL_SYSTEM);
      const arr = (v: unknown) => (Array.isArray(v) ? v : []).map((y) => clean(y).slice(0, 80)).filter(Boolean).slice(0, 20);
      const t = clean(x.time); const hhmm = /^([01]?\d|2[0-3]):[0-5]\d$/.test(t) ? t.padStart(5, "0") : "";
      const res = {
        ok: true, model, heard_text: clean(x.heard_text),
        entry: clean(x.entry).toLowerCase() === "beverage" ? "beverage" : "meal",
        meal_type: ["Tiffin", "Lunch", "Dinner"].includes(clean(x.meal_type)) ? clean(x.meal_type) : "",
        items: arr(x.items), new_items: arr(x.new_items),
        consumption_status: clean(x.consumption_status), time: hhmm,
        beverage: clean(x.beverage), juice_name: clean(x.juice_name).slice(0, 60),
        quantity: (() => { const q = Number(String(x.quantity ?? "").replace(/[^0-9.]/g, "")); return q > 0 && q < 5000 ? String(q) : ""; })(),
        quantity_unit: clean(x.quantity_unit), remarks: clean(x.remarks).slice(0, 500),
      };
      if (!res.heard_text && !res.items.length && !res.new_items.length && !res.beverage) return out({ error: "No usable entry was heard. Please speak again." }, 422);
      return out(res);
    }
    const physio = mode === "Physio";
    if (String(prof.role) === "Physiotherapist" && !physio)
      return out({ error: "This login can use voice for Physio Notes only." }, 403);
    if (physio) {
      const { x, model } = await gemini(parts, PHYSIO_SYSTEM);
      const english = clean(x.english_note);
      if (!english) return out({ error: "No usable note was heard. Please record again." }, 422);
      return out({ ok: true, model, heard_text: clean(x.heard_text), english_note: english });
    }

    const { x, model } = await gemini(parts);
    const english = clean(x.english_note) || [clean(x.data), clean(x.action), clean(x.response)].filter(Boolean).join(" ");
    if (!english) return out({ error: "No usable note was heard. Please record again." }, 422);
    return out({
      ok: true, model,
      heard_text: clean(x.heard_text),
      english_note: english,
      focus: pickFocus(x.focus),
      data: clean(x.data) || english,
      action: clean(x.action),
      response: clean(x.response),
    });
  } catch (e) {
    console.error("nursing-note-voice", e instanceof Error ? e.message : String(e));
    return out({ error: e instanceof Error ? e.message : "The voice service failed." }, 500);
  }
});
