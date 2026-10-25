// Samara Care ERP 2.18.139 — Nursing Notes voice assistant (Edge Function: nursing-note-voice).
// The nurse speaks a nursing note in Tamil (incl. Chennai / colloquial Tamil, Tamil-English) or English.
// Gemini listens to the recording (or reads the typed / browser-recognised text) and returns:
//   heard_text   – what was said, in the language spoken
//   english_note – the whole note in simple English (used for the Quick note)
//   focus        – one of the Nursing Notes focus list
//   data / action / response – the same note arranged as DAR
// STRICT: faithful to what was said — nothing invented, no diagnosis, no advice. The nurse checks
// and edits every field before saving; nothing is saved by this function. Recordings are not stored.
// Requires a logged-in Admin / Manager / Nurse / Caregiver.
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
async function callGemini(key: string, model: string, parts: unknown[], thinking: boolean) {
  const cfg: Record<string, unknown> = { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 4096 };
  if (/^gemini-2\./i.test(model)) cfg.thinkingConfig = { thinkingBudget: 0 };
  else if (thinking) cfg.thinkingConfig = { thinkingLevel: "low" };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST", signal: AbortSignal.timeout(45000),
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: "user", parts }], generationConfig: cfg }),
  });
  return { r, j: await r.json().catch(() => null) };
}
async function gemini(parts: unknown[]) {
  const key = Deno.env.get("GEMINI_API_KEY"); if (!key) throw new Error("The voice service is not set up (Gemini key missing).");
  let last = "no model";
  for (const model of models()) {
    let { r, j } = await callGemini(key, model, parts, true);
    if (r.status === 400 && /thinking/i.test(String(j?.error?.message || ""))) ({ r, j } = await callGemini(key, model, parts, false));
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
    if (!prof || prof.is_active === false || prof.active === false || !["Admin", "Manager", "Nurse", "Caregiver"].includes(String(prof.role)))
      return out({ error: "Nursing Notes voice is for nursing staff only." }, 403);

    const parts: unknown[] = [];
    let spoken = "ta-IN";
    const type = req.headers.get("content-type") || "";
    if (type.includes("multipart/form-data")) {
      const fd = await req.formData();
      spoken = String(fd.get("spoken_language") || spoken);
      const audio = fd.get("audio");
      if (!(audio instanceof File) || audio.size < 800) return out({ error: "No speech was captured. Please record again." }, 400);
      if (audio.size > 15_000_000) return out({ error: "The recording is too long. Please keep one note under about 5 minutes." }, 400);
      const mime = String(audio.type || "audio/webm").split(";")[0].trim().toLowerCase() || "audio/webm";
      parts.push({ text: `Spoken language selected by the nurse: ${spoken.startsWith("en") ? "English" : "Tamil"}. Listen to the complete recording and return the JSON.` });
      parts.push({ inlineData: { mimeType: mime, data: b64(new Uint8Array(await audio.arrayBuffer())) } });
    } else {
      const body = await req.json().catch(() => ({}));
      spoken = String(body?.spoken_language || spoken);
      const text = clean(body?.text);
      if (text.length < 3) return out({ error: "No note text was received." }, 400);
      parts.push({ text: `The nurse's note (${spoken.startsWith("en") ? "English" : "Tamil / mixed"}), from speech recognition or typing:\n${text}\n\nReturn the JSON.` });
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
