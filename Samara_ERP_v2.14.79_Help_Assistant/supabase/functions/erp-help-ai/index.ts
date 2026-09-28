// Samara Care ERP — Help / உதவி assistant (Edge Function: erp-help-ai), 2.14.79, 28-09-2026.
// Staff ask how to use the ERP by Tamil/English voice, text and/or a screenshot. Answers are about using the ERP only.
// Requires a logged-in staff member. Screenshots and recordings are never stored; only the question text,
// page, role and answer are logged in public.erp_help_questions (Admin can read).
// Secrets used (already set for other functions): GEMINI_API_KEY, OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// Optional: ERP_HELP_KB_URL (default https://app.samaraassistedliving.com/help/erp-help-kb.json), GEMINI_HELP_MODEL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const out = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const SYSTEM = `You are "Samara Help" (உதவி), the in-app help assistant of the Samara Care ERP used by the staff of Samara Assisted Living, Chennai.

YOUR ONLY JOB
Help staff use the ERP: where to find a page, which button to press, how to complete a workflow, what an on-screen message means and how to fix it. You are not a clinical, legal or general assistant.
- If asked anything unrelated to using the ERP (medical advice, dosages, patient condition, general knowledge, personal matters), reply politely in one sentence that you can help only with using the ERP, and suggest asking the doctor / Nursing Manager / Admin as appropriate.
- Never ask for or repeat passwords, OTPs or Login IDs. Never repeat patient names, ages or health details you see in a screenshot — refer to "this patient" / "this resident".
- You cannot see or change ERP data; you only guide. Never claim you did something in the ERP.

HOW TO ANSWER
- Reply in the language of the question. Voice questions are usually Tamil: then answer in simple, polite, spoken-style Tamil (not formal literary Tamil). English questions get English answers.
- Keep ERP page names, menu names and button labels exactly as they appear on screen, in English inside quotes (e.g. "Raise Bill / Charge Request"), even inside a Tamil answer.
- Give 2–6 short numbered steps. Start with where to go (menu → page), then the buttons. No long introductions.
- Use ONLY the ERP GUIDE EXCERPTS, the staff member's role/menu and the screenshot. Do not invent pages, buttons or rules. If the excerpts do not cover it, say so briefly and advise asking Admin.
- Role awareness: if the needed page is not in the staff member's menu, tell them their role does not have it and who does (from the excerpts), instead of giving steps they cannot follow.
- If a screenshot is attached: identify the page and any error or red message, explain what it means and the exact fix.
- Respect ERP rules in the excerpts (e.g. medicines change only through "Doctor Review / Modify"; consumables go through the indent flow; dates are DD-MM-YYYY).

OUTPUT: JSON only: {"reply":"...","language":"ta|en|te|hi|kn|ml"}`;

const UNDERSTAND = `You read a staff question about the Samara Care ERP (voice recording and/or typed text, maybe with a screenshot).
Return JSON only: {"transcript":"<the question exactly as spoken/typed, in its original language; empty if no speech>","english":"<short English restatement of what they need help with, including any ERP page, button or error text visible in the screenshot>","language":"ta|en|te|hi|kn|ml"}`;

// ---------- helpers ----------
function b64(bytes: Uint8Array) {
  let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function parseJson(t: string) { try { return JSON.parse(String(t).replace(/^```json\s*|```$/g, "").trim()); } catch { return null; } }
function lang(x: unknown) { const v = String(x || "").toLowerCase().slice(0, 2); return ["ta", "en", "te", "hi", "kn", "ml"].includes(v) ? v : "ta"; }
async function gemini(system: string, parts: unknown[], maxTokens = 900) {
  const key = Deno.env.get("GEMINI_API_KEY"); if (!key) throw new Error("Gemini key missing");
  const model = Deno.env.get("GEMINI_HELP_MODEL") || "gemini-2.5-flash";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST", signal: AbortSignal.timeout(30000),
    headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: maxTokens,
        ...(/flash/i.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}) },
    }),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) { console.error("erp-help gemini", r.status, String(j?.error?.status || "")); throw new Error("Gemini HTTP " + r.status); }
  const x = parseJson((j?.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join(""));
  if (!x) throw new Error("Gemini returned unreadable output");
  return x;
}

// ---------- knowledge ----------
type Chunk = { title: string; kind: string; text: string; words: Set<string> };
let KB: Chunk[] = []; let kbAt = 0; let kbLoading: Promise<void> | null = null;
const STOP = new Set("the and for are you your with this that what who how can does have from about please tell there their them will would could should when where which into also more than just only very much many some any our ask want need know like give show page button samara erp".split(" "));
const stem = (w: string) => (w.length > 5 ? w.slice(0, 5) : w);
const wordsOf = (t: string) => new Set((String(t).toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((w) => !STOP.has(w)).map(stem));
async function loadKB() {
  const url = Deno.env.get("ERP_HELP_KB_URL") || "https://app.samaraassistedliving.com/help/erp-help-kb.json";
  const r = await fetch(url + "?t=" + Date.now(), { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error("KB HTTP " + r.status);
  const j = await r.json();
  KB = (j.chunks || []).map((c: any) => ({ ...c, words: wordsOf(c.title + " " + c.text) }));
  kbAt = Date.now();
}
function refreshKB() { if (!kbLoading) kbLoading = loadKB().catch((e) => console.error("erp-help kb", String(e?.message || e))).finally(() => { kbLoading = null; }); return kbLoading; }
async function excerpts(question: string, page: string, role: string) {
  if (!KB.length) await refreshKB(); else if (Date.now() - kbAt > 3600_000) refreshKB();
  if (!KB.length) return "";
  const q = wordsOf(question + " " + page);
  const pageTitle = "page: " + page.toLowerCase();
  const scored = KB.map((c) => {
    let n = 0; for (const w of q) if (c.words.has(w)) n++;
    if (c.kind === "guide") n = n * 1.6 + (n > 0 ? 1 : 0.3);
    if (page && c.title.toLowerCase() === pageTitle) n += 3;
    if (c.kind === "menu" && role && c.title.toLowerCase() === ("menu for " + role).toLowerCase()) n += 4;
    return { c, n };
  }).filter((x) => x.n > 0.5).sort((a, b) => b.n - a.n);
  let total = 0; const parts: string[] = [];
  const perTitle: Record<string, number> = {};
  for (const { c } of scored) {
    if ((perTitle[c.title] = (perTitle[c.title] || 0) + 1) > 2) continue;
    const t = `### ${c.title}\n${c.text}`; if (total + t.length > 9000) continue; total += t.length; parts.push(t); if (parts.length >= 9) break;
  }
  return parts.join("\n\n");
}
refreshKB();

// ---------- speech (Tamil / English) ----------
async function speech(text: string, code: string) {
  const key = Deno.env.get("OPENAI_API_KEY"); if (!key) return out({ error: "Speech unavailable" }, 503);
  const names: Record<string, string> = { en: "English", ta: "Tamil", te: "Telugu", hi: "Hindi", kn: "Kannada", ml: "Malayalam" };
  const r = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST", signal: AbortSignal.timeout(45000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: Deno.env.get("SAMARA_TTS_MODEL") || "gpt-4o-mini-tts", voice: "coral", input: text.slice(0, 3000), response_format: "mp3",
      instructions: `Read the text exactly in ${names[code] || "Tamil"}, warm, calm and clear, at a slightly slow pace for staff following steps. English button names stay in English. Do not add or translate words.` }),
  });
  if (!r.ok) return out({ error: "Speech failed" }, 502);
  return new Response(r.body, { headers: { ...CORS, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}

// ---------- main ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return out({ error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: auth } = await admin.auth.getUser(token).catch(() => ({ data: null as any }));
  const user = auth?.user; if (!user) return out({ error: "Please log in to the ERP again.", code: "AUTH" }, 401);
  const { data: prof } = await admin.from("profiles").select("role,full_name,title,designation,department")
    .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`).limit(1).maybeSingle();
  const role = String(prof?.role || "Staff"), name = [prof?.title, prof?.full_name].filter(Boolean).join(" ") || "Staff";
  try {
    const ct = req.headers.get("content-type") || "";
    let message = "", page = "", history: any[] = [], audio: File | null = null, image: { mime: string; data: string } | null = null;
    if (ct.includes("multipart/form-data")) {
      const fd = await req.formData();
      message = String(fd.get("message") || ""); page = String(fd.get("page") || "");
      try { history = JSON.parse(String(fd.get("history") || "[]")); } catch { history = []; }
      const a = fd.get("audio"); if (a instanceof File && a.size > 500) audio = a;
      const im = fd.get("image"); if (im instanceof File && im.size > 0) image = { mime: im.type || "image/jpeg", data: b64(new Uint8Array(await im.arrayBuffer())) };
    } else {
      const j = await req.json();
      if (j?.mode === "speech") return await speech(String(j.text || ""), lang(j.language));
      if (j?.mode === "whoami") return out({ role, name });
      message = String(j?.message || ""); page = String(j?.page || ""); history = Array.isArray(j?.history) ? j.history : [];
      if (j?.image?.data) image = { mime: String(j.image.mime || "image/jpeg"), data: String(j.image.data) };
    }
    message = message.trim().slice(0, 2000); page = page.trim().slice(0, 80);
    if (audio && audio.size > 8 * 1024 * 1024) return out({ error: "Recording is too long. Please keep it under a minute." }, 413);
    if (image && image.data.length > 7_000_000) return out({ error: "Screenshot is too large." }, 413);
    if (!message && !audio && !image) return out({ error: "Please speak, type or attach a screenshot." }, 400);

    // Rate limit: 40 questions per hour per staff member.
    const { count } = await admin.from("erp_help_questions").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).gte("created_at", new Date(Date.now() - 3600_000).toISOString());
    if ((count || 0) >= 40) return out({ error: "Too many questions in the last hour. Please try again later or ask Admin.", code: "RATE" }, 429);

    const media: unknown[] = [];
    if (audio) media.push({ inlineData: { mimeType: String(audio.type || "audio/webm").split(";")[0], data: b64(new Uint8Array(await audio.arrayBuffer())) } });
    if (image) media.push({ inlineData: { mimeType: image.mime, data: image.data } });

    // Step 1: understand the question (needed for voice, Tamil text or screenshots).
    let transcript = message, english = message, language = /[஀-௿]/.test(message) ? "ta" : /^[\x00-\x7F\s]*$/.test(message) && message ? "en" : "ta";
    if (audio || image || language !== "en") {
      const u = await gemini(UNDERSTAND, [{ text: `ERP page open now: ${page || "unknown"}\nTyped text: ${message || "(none)"}` }, ...media], 400);
      transcript = String(u.transcript || message || "").trim(); english = String(u.english || transcript).trim(); language = lang(u.language || language);
      if (audio && !transcript && !image) return out({ error: "I could not hear a question. Please try again.", code: "NO_SPEECH" }, 422);
    }

    // Step 2: answer from the ERP guide.
    const kb = await excerpts(english + " " + transcript, page, role);
    const hist = history.slice(-6).filter((h: any) => h && typeof h.content === "string").map((h: any) => `${h.role === "assistant" ? "Help" : "Staff"}: ${String(h.content).slice(0, 800)}`).join("\n");
    const ctx = `STAFF: ${name} — role ${role}${prof?.designation ? ", " + prof.designation : ""}${prof?.department ? ", " + prof.department : ""}\nERP PAGE OPEN NOW: ${page || "unknown"}\n` +
      (hist ? `RECENT CONVERSATION:\n${hist}\n` : "") + `\nERP GUIDE EXCERPTS:\n${kb || "(none found)"}\n\nQUESTION (${language}): ${transcript || "(see screenshot)"}\nMEANING IN ENGLISH: ${english}\nReply in language: ${language}.`;
    const a = await gemini(SYSTEM, [{ text: ctx }, ...(image ? [{ inlineData: { mimeType: image.mime, data: image.data } }] : [])], 1100);
    const reply = String(a.reply || "").trim(); language = lang(a.language || language);
    if (!reply) throw new Error("Empty reply");

    const { data: logged } = await admin.from("erp_help_questions").insert({
      user_id: user.id, staff_name: name, staff_role: role, page: page || null, question: (transcript || english || "(screenshot)").slice(0, 2000),
      answer: reply.slice(0, 4000), language, via_voice: !!audio, had_screenshot: !!image,
    }).select("id").maybeSingle();
    return out({ reply, language, transcript: audio ? transcript : undefined, id: logged?.id || null });
  } catch (e) {
    console.error("erp-help-ai failed", e instanceof Error ? e.message.slice(0, 120) : "unknown");
    return out({ error: "Help is temporarily unavailable. Please try again in a moment.", code: "UNAVAILABLE" }, 503);
  }
});
