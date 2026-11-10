// Samara Care ERP 2.19.99 — Clinical Alert voice in TAMIL ONLY (Edge Function: clinical-alert-voice).
// The ERP builds the Tamil announcement text (Guest name, room, medicine, overdue time …) and sends it here.
// Gemini text-to-speech reads it aloud in a natural Tamil voice and returns a WAV file that the
// nurses' station plays. No English voice is ever produced. Nothing is stored.
// Requires a logged-in clinical staff profile (Admin / Manager / Nurse / Caregiver).
// Secrets used (already set): GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Optional: CLINICAL_VOICE_MODEL (Gemini TTS model id), CLINICAL_VOICE_NAME (Gemini voice, default "Kore").
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-voice-model",
};
const out = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// Current Gemini TTS models first; on 404 / "not supported" try the next and remember the one that works.
let ttsModel = "";
const modelList = () => [...new Set([
  Deno.env.get("CLINICAL_VOICE_MODEL"), ttsModel,
  "gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts",
].filter(Boolean) as string[])];

// Small in-memory cache: the same alert repeats every few minutes with the same words.
const cache = new Map<string, Uint8Array>();
function remember(key: string, wav: Uint8Array) {
  cache.set(key, wav);
  while (cache.size > 80) cache.delete(cache.keys().next().value as string);
}

function b64ToBytes(b64: string) {
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
// Gemini returns raw 16-bit PCM (audio/L16; rate=24000) from generateContent — wrap it in a WAV header.
function pcmToWav(pcm: Uint8Array, rate = 24000, channels = 1) {
  const h = new ArrayBuffer(44), v = new DataView(h), w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * channels * 2, true); v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, pcm.length, true);
  const wav = new Uint8Array(44 + pcm.length); wav.set(new Uint8Array(h), 0); wav.set(pcm, 44);
  return wav;
}

// Only the Tamil words are sent — no English instruction in the prompt (in testing, Gemini read an
// English style instruction aloud before the Tamil). Language is fixed by speechConfig.languageCode = ta-IN.
// Optional short Tamil style cue via CLINICAL_VOICE_STYLE (leave unset normally).
const promptFor = (text: string) => {
  const style = (Deno.env.get("CLINICAL_VOICE_STYLE") || "").trim();
  return style ? `${style}: ${text}` : text;
};

async function tamilSpeech(text: string): Promise<Uint8Array> {
  const key = Deno.env.get("GEMINI_API_KEY"); if (!key) throw new Error("Gemini key missing");
  const voiceName = Deno.env.get("CLINICAL_VOICE_NAME") || "Kore";
  let last = "no model";
  for (const model of modelList()) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: promptFor(text) }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { languageCode: "ta-IN", voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        },
      }),
    });
    const j: any = await r.json().catch(() => ({}));
    const msg = String(j?.error?.message || "");
    // languageCode is optional on some models — retry once without it if rejected.
    if (r.status === 400 && /language/i.test(msg)) {
      const r2 = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: promptFor(text) }] }],
          generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } },
        }),
      });
      const j2: any = await r2.json().catch(() => ({}));
      const wav = audioFrom(j2);
      if (r2.ok && wav) { if (ttsModel !== model) { ttsModel = model; console.log("clinical-alert-voice using", model); } return wav; }
      last = `${model} ${r2.status}`; console.error("clinical-alert-voice", model, r2.status, String(j2?.error?.message || "").slice(0, 160));
      continue;
    }
    if (r.status === 404 || (r.status === 400 && /not supported|not found|modalit/i.test(msg))) {
      console.error("clinical-alert-voice model unavailable", model, r.status, msg.slice(0, 120)); last = `${model} ${r.status}`; continue;
    }
    if (!r.ok) { console.error("clinical-alert-voice", model, r.status, msg.slice(0, 160)); throw new Error("Gemini HTTP " + r.status); }
    const wav = audioFrom(j);
    if (!wav) { console.error("clinical-alert-voice no audio", model, String(j?.candidates?.[0]?.finishReason || "")); last = `${model} no audio`; continue; }
    if (ttsModel !== model) { ttsModel = model; console.log("clinical-alert-voice using", model); }
    return wav;
  }
  throw new Error("No Gemini voice model available (" + last + ")");
}

function audioFrom(j: any): Uint8Array | null {
  const parts = j?.candidates?.[0]?.content?.parts || [];
  const p = parts.find((x: any) => x?.inlineData?.data);
  if (!p) return null;
  const bytes = b64ToBytes(String(p.inlineData.data));
  // Newer models may already send a WAV (RIFF) file.
  if (bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF") return bytes;
  const rate = Number((String(p.inlineData.mimeType || "").match(/rate=(\d+)/i) || [])[1] || 24000);
  return pcmToWav(bytes, rate);
}

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
      return out({ error: "Clinical alert voice is for clinical staff only." }, 403);

    const j: any = await req.json().catch(() => ({}));
    const text = String(j?.text || "").replace(/\s+/g, " ").trim();
    if (!text || text.length > 1500) return out({ error: "Invalid alert text." }, 400);
    // Tamil only: the announcement must be written in Tamil script.
    if (!/[஀-௿]/.test(text)) return out({ error: "Clinical alert voice is Tamil only." }, 400);

    let wav = cache.get(text);
    if (!wav) { wav = await tamilSpeech(text); remember(text, wav); }
    return new Response(wav, { headers: { ...CORS, "Content-Type": "audio/wav", "Cache-Control": "no-store", "x-voice-model": ttsModel } });
  } catch (e) {
    console.error("clinical-alert-voice failed", String((e as Error)?.message || e));
    return out({ error: "Tamil voice is not available right now." }, 502);
  }
});
