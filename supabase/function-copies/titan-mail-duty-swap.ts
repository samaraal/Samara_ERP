import { createClient } from "npm:@supabase/supabase-js@2";
import { ImapFlow } from "npm:imapflow@1";
import nodemailer from "npm:nodemailer@6";
import { simpleParser } from "npm:mailparser@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAILBOXES = {
  chellaboomi: { email: "chellaboomi@samaraassistedliving.com", passwordEnv: "TITAN_CHELLABOOMI_PASSWORD", adminOnly: true },
  care: { email: "care@samaraassistedliving.com", passwordEnv: "TITAN_CARE_PASSWORD", adminOnly: false },
  admin: { email: "admin@samaraassistedliving.com", passwordEnv: "TITAN_ADMIN_PASSWORD", adminOnly: false },
} as const;

const IMAP_HOST = "imap.secureserver.net";
const IMAP_PORT = 993;
const SMTP_HOST = "smtpout.secureserver.net";
const SMTP_PORT = 465;
const SYNC_ENVELOPE_LIMIT = 30;
const SYNC_BODY_LIMIT = 10;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function addresses(value: any) {
  return (value?.value || []).map((entry: any) => ({ name: entry.name || "", address: entry.address || "" }));
}
function splitRecipients(value = "") {
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}
function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] || ch));
}
function nl2br(value = "") {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}
function composeBodyHtml(value = "") {
  let html = escapeHtml(value);
  // Lightweight formatting for ERP-composed mail: **bold**, clickable URLs and
  // preserved paragraphs/line breaks. This avoids showing markdown markers in mail.
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:#7b0b45">$1</a>');
  html = html.replace(/\r?\n\r?\n/g, "</p><p>").replace(/\r?\n/g, "<br>");
  return `<p style="margin:0 0 10px 0">${html}</p>`;
}
function attachmentContentId(a: any) {
  return String(a?.contentId || a?.cid || "").replace(/^<|>$/g, "").trim();
}
function htmlWithInlineCid(parsed: any) {
  let html = typeof parsed?.html === "string" ? parsed.html : "";
  if (!html) return "";
  for (const a of parsed?.attachments || []) {
    const cid = attachmentContentId(a);
    if (!cid || !a?.content) continue;
    const mime = String(a.contentType || "application/octet-stream");
    const b64 = a.content.toString("base64");
    const dataUrl = `data:${mime};base64,${b64}`;
    const escapedCid = cid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(new RegExp(`cid:${escapedCid}`, "gi"), dataUrl);
  }
  return html;
}
function visibleAttachments(parsed: any) {
  return (parsed?.attachments || [])
    .filter((a: any) => {
      const disposition = String(a?.contentDisposition || "").toLowerCase();
      return disposition !== "inline" && !attachmentContentId(a);
    })
    .map((a: any) => ({ filename: a.filename || "Attachment", contentType: a.contentType || "", size: a.size || 0 }));
}
function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}
async function authorisedProfile(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth) throw new Error("Authentication required.");
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("Invalid ERP session.");
  const { data: profile, error: profileError } = await supabase.from("duty_profiles").select("id,role,full_name,login_id,is_active").or(`auth_user_id.eq.${authData.user.id},id.eq.${authData.user.id}`).maybeSingle();
  if (profileError || !profile || profile.is_active === false) throw new Error("ERP employee profile is not authorised.");
  if (!["Admin", "Manager"].includes(profile.role)) throw new Error("Mail access is restricted to Admin and Manager.");
  return profile;
}
function mailboxCredentials(key: string, role: string) {
  const config = (MAILBOXES as any)[key];
  if (!config) throw new Error("Unknown mailbox.");
  if (config.adminOnly && role !== "Admin") throw new Error("Director Mail is restricted to Admin.");
  const password = Deno.env.get(config.passwordEnv);
  if (!password) throw new Error(`${config.email} has not yet been connected in Supabase Secrets.`);
  return { ...config, password };
}
function imapClient(email: string, password: string) {
  return new ImapFlow({ host: IMAP_HOST, port: IMAP_PORT, secure: true, auth: { user: email, pass: password }, logger: false });
}
async function folderPath(client: ImapFlow, requested: string) {
  if (requested === "INBOX") return "INBOX";

  const boxes = await client.list();
  const wanted = String(requested || "").trim().toLowerCase();

  const specialUseMap: Record<string, string[]> = {
    sent: ["\\Sent"],
    drafts: ["\\Drafts"],
    trash: ["\\Trash"],
  };
  const nameMap: Record<string, string[]> = {
    sent: ["sent", "sent items", "sent mail"],
    drafts: ["drafts", "draft"],
    trash: ["trash", "deleted items", "deleted messages", "bin"],
  };

  // Prefer the IMAP SPECIAL-USE attribute. This is the safest way to distinguish
  // Titan's Sent/Drafts/Trash mailboxes from INBOX even when folder display names
  // vary by mailbox or locale.
  const specialCandidates = specialUseMap[wanted] || [];
  const bySpecialUse = boxes.find((box: any) => {
    const special = String(box.specialUse || "");
    return specialCandidates.some(candidate => special.toLowerCase() === candidate.toLowerCase());
  });
  if (bySpecialUse?.path) return bySpecialUse.path;

  // Then try exact folder display/path names commonly used by Titan.
  const names = nameMap[wanted] || [wanted];
  const byExactName = boxes.find((box: any) => {
    const path = String(box.path || "").trim().toLowerCase();
    const name = String(box.name || "").trim().toLowerCase();
    return names.includes(path) || names.includes(name);
  });
  if (byExactName?.path) return byExactName.path;

  // Finally accept a clear partial match, but never silently fall back to INBOX.
  const byPartialName = boxes.find((box: any) => {
    const path = String(box.path || "").trim().toLowerCase();
    const name = String(box.name || "").trim().toLowerCase();
    return names.some(candidate => path.includes(candidate) || name.includes(candidate));
  });
  if (byPartialName?.path) return byPartialName.path;

  throw new Error(`Titan ${requested} folder could not be located for this mailbox.`);
}

async function cacheState(mailboxKey: string, folder: string) {
  const db = adminClient();
  const { data } = await db.from("titan_mail_sync_state").select("last_synced_at,unread,total,last_error").eq("mailbox_key", mailboxKey).eq("folder", folder).maybeSingle();
  return data || { last_synced_at: null, unread: null, total: null, last_error: null };
}

async function cachedList(mailboxKey: string, folder: string, search: string, limit: number) {
  const db = adminClient();
  let q = db.from("titan_mail_cache").select("uid,subject,from_name,from_address,message_date,seen,flagged", { count: "exact" }).eq("mailbox_key", mailboxKey).eq("folder", folder).order("message_date", { ascending: false }).limit(limit);
  if (search) q = q.or(`subject.ilike.%${search.replace(/[%_,()]/g, " ")}%,from_name.ilike.%${search.replace(/[%_,()]/g, " ")}%,from_address.ilike.%${search.replace(/[%_,()]/g, " ")}%`);
  const { data, error } = await q;
  if (error) throw error;
  const state = await cacheState(mailboxKey, folder === "INBOX" ? "INBOX" : folder);
  return {
    messages: (data || []).map((r: any) => ({ uid: r.uid, subject: r.subject || "", from: { name: r.from_name || "", address: r.from_address || "" }, date: r.message_date, seen: !!r.seen, flagged: !!r.flagged })),
    counts: { unread: state?.unread ?? 0, total: state?.total ?? 0 },
    last_synced_at: state?.last_synced_at || null,
    last_error: state?.last_error || null,
  };
}

async function cachedRead(mailboxKey: string, folder: string, uid: number) {
  const db = adminClient();
  const { data, error } = await db.from("titan_mail_cache").select("*").eq("mailbox_key", mailboxKey).eq("folder", folder).eq("uid", uid).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    uid: data.uid,
    subject: data.subject || "(No subject)",
    from: { name: data.from_name || "", address: data.from_address || "" },
    to: data.to_json || [], cc: data.cc_json || [], date: data.message_date,
    text: data.body_text || "", htmlText: data.body_html_text || "", attachments: data.attachments_json || [],
    bodyCached: !!(data.body_text || data.body_html_text), seen: !!data.seen,
  };
}

async function syncFolder(mailboxKey: string, folderRequested: string, email: string, password: string) {
  const db = adminClient();
  const client = imapClient(email, password);
  let path = folderRequested;
  try {
    await client.connect();
    path = await folderPath(client, folderRequested);
    const lock = await client.getMailboxLock(path);
    try {
      const total = Number((client.mailbox as any)?.exists || 0);
      const start = Math.max(total - SYNC_ENVELOPE_LIMIT + 1, 1);
      const range = total ? `${start}:*` : "";
      const rows: any[] = [];
      if (range) {
        for await (const msg of client.fetch(range, { uid: true, envelope: true, flags: true, internalDate: true })) {
          const env: any = msg.envelope || {};
          const from = addresses(env.from)[0] || { name: "", address: "" };
          rows.push({
            mailbox_key: mailboxKey, folder: folderRequested, uid: Number(msg.uid), subject: String(env.subject || ""),
            from_name: from.name || "", from_address: from.address || "", to_json: addresses(env.to), cc_json: addresses(env.cc),
            message_date: msg.internalDate || env.date || null, seen: msg.flags?.has("\\Seen") || false, flagged: msg.flags?.has("\\Flagged") || false,
            cached_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          });
        }
      }
      // Remove stale rows previously cached under the wrong logical folder.
      // Earlier builds could accidentally populate Sent/Drafts/Trash with INBOX
      // envelopes. Rebuilding this folder cache from the actual Titan IMAP folder
      // keeps each ERP tab strictly separated.
      const { error: clearError } = await db
        .from("titan_mail_cache")
        .delete()
        .eq("mailbox_key", mailboxKey)
        .eq("folder", folderRequested);
      if (clearError) throw clearError;

      if (rows.length) {
        const { error } = await db.from("titan_mail_cache").upsert(rows, { onConflict: "mailbox_key,folder,uid" });
        if (error) throw error;
      }

      // Warm the full body cache only for the newest 10 messages. This may take time, but it runs in background from the ERP.
      const newest = [...rows].sort((a,b)=>new Date(b.message_date||0).getTime()-new Date(a.message_date||0).getTime()).slice(0, SYNC_BODY_LIMIT);
      for (const row of newest) {
        const { data: existing } = await db.from("titan_mail_cache").select("body_text,body_html_text").eq("mailbox_key", mailboxKey).eq("folder", folderRequested).eq("uid", row.uid).maybeSingle();
        if (existing?.body_text || existing?.body_html_text) continue;
        try {
          const fetched: any = await client.fetchOne(row.uid, { source: true, uid: true }, { uid: true });
          if (!fetched?.source) continue;
          const parsed: any = await simpleParser(fetched.source);
          await db.from("titan_mail_cache").update({
            to_json: addresses(parsed.to), cc_json: addresses(parsed.cc),
            body_text: parsed.text || "", body_html_text: htmlWithInlineCid(parsed),
            attachments_json: visibleAttachments(parsed),
            updated_at: new Date().toISOString(),
          }).eq("mailbox_key", mailboxKey).eq("folder", folderRequested).eq("uid", row.uid);
        } catch (e) { console.warn("Titan body cache skipped", row.uid, e?.message || e); }
      }

      let unread = 0;
      if (path === "INBOX") {
        const unseen = await client.search({ seen: false }, { uid: true }); unread = unseen.length;
      } else {
        // Use previous cached INBOX count for non-INBOX folder syncs.
        const prev = await cacheState(mailboxKey, "INBOX"); unread = Number(prev?.unread || 0);
      }
      await db.from("titan_mail_sync_state").upsert({ mailbox_key: mailboxKey, folder: folderRequested, last_synced_at: new Date().toISOString(), unread, total: path === "INBOX" ? total : rows.length, last_error: null }, { onConflict: "mailbox_key,folder" });
      return { ok: true, synced: rows.length, unread, total, last_synced_at: new Date().toISOString() };
    } finally { lock.release(); }
  } catch (error) {
    await db.from("titan_mail_sync_state").upsert({ mailbox_key: mailboxKey, folder: folderRequested, last_synced_at: new Date().toISOString(), last_error: error?.message || String(error) }, { onConflict: "mailbox_key,folder" }).catch(()=>{});
    throw error;
  } finally { await client.logout().catch(() => {}); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
  try {
    const profile = await authorisedProfile(req);
    const body = await req.json();
    const action = String(body.action || "");
    const mailboxKey = String(body.mailbox || "care");
    const { email, password } = mailboxCredentials(mailboxKey, profile.role);
    const folder = String(body.folder || "INBOX");

    if (action === "cache-list") return json(await cachedList(mailboxKey, folder, String(body.search || "").trim(), Math.min(Math.max(Number(body.limit || 10), 1), 50)));
    if (action === "cache-read") {
      const uid = Number(body.uid); if (!uid) throw new Error("Message UID is required.");
      const cached = await cachedRead(mailboxKey, folder, uid);
      if (cached?.bodyCached) return json({ message: cached, source: "cache" });
      // First read only: fetch from Titan, then permanently warm the cache for subsequent opens.
      const client = imapClient(email, password);
      try {
        await client.connect(); const path = await folderPath(client, folder); const lock = await client.getMailboxLock(path);
        try {
          const fetched: any = await client.fetchOne(uid, { source: true, uid: true }, { uid: true });
          if (!fetched?.source) throw new Error("Message was not found.");
          const parsed: any = await simpleParser(fetched.source);
          await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });
          const message = { uid, subject: parsed.subject || "(No subject)", from: addresses(parsed.from)[0] || { name: "Samara Assisted Living", address: email }, to: addresses(parsed.to), cc: addresses(parsed.cc), date: parsed.date || cached?.date || null, text: parsed.text || "", htmlText: htmlWithInlineCid(parsed), attachments: visibleAttachments(parsed), seen: true, bodyCached: true };
          await adminClient().from("titan_mail_cache").upsert({ mailbox_key: mailboxKey, folder, uid, subject: message.subject, from_name: message.from.name, from_address: message.from.address, to_json: message.to, cc_json: message.cc, message_date: message.date, seen: true, body_text: message.text, body_html_text: message.htmlText, attachments_json: message.attachments, updated_at: new Date().toISOString() }, { onConflict: "mailbox_key,folder,uid" });
          return json({ message, source: "titan" });
        } finally { lock.release(); }
      } finally { await client.logout().catch(()=>{}); }
    }
    if (action === "sync") return json(await syncFolder(mailboxKey, folder, email, password));
    if (action === "cache-counts") {
      const state = await cacheState(mailboxKey, "INBOX");
      return json({ unread: state?.unread ?? 0, total: state?.total ?? 0, last_synced_at: state?.last_synced_at || null });
    }
    if (action === "send") {
      const to = splitRecipients(body.to); if (!to.length) throw new Error("At least one recipient is required.");
      if (!String(body.subject || "").trim()) throw new Error("Subject is required.");

      const messageText = String(body.body || "");
      const senderName = String(profile.full_name || "Samara Team").trim() || "Samara Team";
      const senderRole = String(profile.role || "Staff").trim() || "Staff";
      const address = "RBK VILLA, No: 23-A, Reddipalayam Road, Jeswant Nagar Phase 1, Mogappair West, Chennai 600037.";
      const website = "www.samaraassistedliving.com";
      const signatureText = `\n\nRegards,\n${senderName}\n${senderRole}\nSamara Assisted Living\n${address}\nEmail: ${email}\nWebsite: ${website}`;

      let logoAttachment: any = null;
      let logoHtml = `<div style="font-size:22px;font-weight:700;color:#a50055;margin-bottom:8px">Samara Assisted Living</div>`;
      try {
        const logoResponse = await fetch("https://app.samaraassistedliving.com/assets/samara-mail-logo.png", { signal: AbortSignal.timeout(2500) });
        if (logoResponse.ok) {
          const logoBytes = new Uint8Array(await logoResponse.arrayBuffer());
          logoAttachment = { filename: "samara-logo.png", content: logoBytes, contentType: logoResponse.headers.get("content-type") || "image/png", cid: "samara-mail-logo", contentDisposition: "inline" };
          logoHtml = `<img src="cid:samara-mail-logo" alt="Samara Assisted Living" style="display:block;width:190px;max-width:100%;height:auto;margin:0 0 10px 0">`;
        }
      } catch (e) {
        console.warn("Samara mail logo could not be embedded; sending text signature fallback.", e?.message || e);
      }

      const signatureHtml = `
        <div style="margin-top:24px;padding-top:16px;border-top:1px solid #ead7df;font-family:Arial,Helvetica,sans-serif;color:#4b3540;font-size:13px;line-height:1.55">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:auto;max-width:100%">
            <tr>
              <td style="vertical-align:top;padding:0 22px 0 0">${logoHtml}</td>
              <td style="vertical-align:top;padding:0">
                <div style="font-weight:700;color:#7b0b45;font-size:14px">${escapeHtml(senderName)}</div>
                <div style="font-weight:600">${escapeHtml(senderRole)}</div>
                <div style="font-weight:700">Samara Assisted Living</div>
                <div>${escapeHtml(address)}</div>
                <div><strong>Email:</strong> <a href="mailto:${escapeHtml(email)}" style="color:#7b0b45;text-decoration:none">${escapeHtml(email)}</a></div>
                <div><strong>Website:</strong> <a href="https://samaraassistedliving.com/" style="color:#7b0b45;text-decoration:none">${escapeHtml(website)}</a></div>
                <div style="margin-top:4px;color:#a50055">Compassion • Comfort • Dignity</div>
              </td>
            </tr>
          </table>
        </div>`;

      const mailOptions = {
        from: `"Samara Assisted Living" <${email}>`,
        to, cc: splitRecipients(body.cc),
        subject: String(body.subject || "").trim(),
        text: messageText + signatureText,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#2f2730">${composeBodyHtml(messageText)}</div>${signatureHtml}`,
        attachments: logoAttachment ? [logoAttachment] : [],
      };

      // Build the exact RFC822/MIME message once so a copy can also be placed in
      // the Titan IMAP Sent folder. SMTP submission alone does not reliably create
      // a Sent-folder copy for these mailboxes.
      const rawBuilder = nodemailer.createTransport({
        streamTransport: true,
        buffer: true,
        newline: "unix",
      });
      const built = await rawBuilder.sendMail(mailOptions);
      const rawMessage = built.message;

      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: true,
        auth: { user: email, pass: password },
      });
      const info = await transporter.sendMail(mailOptions);

      // SMTP delivery is the critical operation. Return success to the ERP as soon
      // as SMTP accepts the message. Sent-folder archiving/cache refresh can take
      // several seconds on Titan IMAP and must not make the Compose action time out.
      const sentArchiveWork = (async () => {
        try {
          const sentClient = imapClient(email, password);
          await sentClient.connect();
          try {
            const sentPath = await folderPath(sentClient, "Sent");
            await sentClient.append(sentPath, rawMessage, ["\\Seen"], new Date());
          } finally {
            await sentClient.logout().catch(() => {});
          }

          await syncFolder(mailboxKey, "Sent", email, password).catch((syncError) => {
            console.warn("Sent cache refresh failed after send", syncError?.message || syncError);
          });
        } catch (sentCopyError) {
          console.warn("Email sent, but Sent-folder copy could not be archived.", sentCopyError?.message || sentCopyError);
        }
      })();

      try {
        // Supabase Edge Runtime supports background continuation after the response.
        // This keeps sending fast while still archiving the message into Titan Sent.
        // deno-lint-ignore no-explicit-any
        const edgeRuntime = (globalThis as any).EdgeRuntime;
        if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(sentArchiveWork);
        else sentArchiveWork.catch(() => {});
      } catch (_) {
        sentArchiveWork.catch(() => {});
      }

      return json({ ok: true, messageId: info.messageId });
    }
    throw new Error("Unsupported mail action.");
  } catch (error) {
    console.error("Titan mail error", error);
    return json({ error: error?.message || "Titan Mail request failed." }, 400);
  }
});
