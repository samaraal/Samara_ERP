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
  chellaboomi: {
    email: "chellaboomi@samaraassistedliving.com",
    passwordEnv: "TITAN_CHELLABOOMI_PASSWORD",
    adminOnly: true,
  },
  care: {
    email: "care@samaraassistedliving.com",
    passwordEnv: "TITAN_CARE_PASSWORD",
    adminOnly: false,
  },
  admin: {
    email: "admin@samaraassistedliving.com",
    passwordEnv: "TITAN_ADMIN_PASSWORD",
    adminOnly: false,
  },
} as const;

const IMAP_HOST = "imap.secureserver.net";
const IMAP_PORT = 993;
const SMTP_HOST = "smtpout.secureserver.net";
const SMTP_PORT = 465;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function addresses(value: any) {
  return (value?.value || []).map((entry: any) => ({
    name: entry.name || "",
    address: entry.address || "",
  }));
}

function splitRecipients(value = "") {
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function authorisedProfile(req: Request) {
  const auth = req.headers.get("Authorization");
  if (!auth) throw new Error("Authentication required.");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: auth } },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("Invalid ERP session.");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,role,full_name,login_id,is_active")
    .or(`auth_user_id.eq.${authData.user.id},id.eq.${authData.user.id}`)
    .maybeSingle();

  if (profileError || !profile || profile.is_active === false) {
    throw new Error("ERP employee profile is not authorised.");
  }
  if (!["Admin", "Manager"].includes(profile.role)) {
    throw new Error("Mail access is restricted to Admin and Manager.");
  }
  return profile;
}

function mailboxCredentials(key: string, role: string) {
  const config = (MAILBOXES as any)[key];
  if (!config) throw new Error("Unknown mailbox.");
  if (config.adminOnly && role !== "Admin") {
    throw new Error("Director Mail is restricted to Admin.");
  }
  const password = Deno.env.get(config.passwordEnv);
  if (!password) throw new Error(`${config.email} has not yet been connected in Supabase Secrets.`);
  return { ...config, password };
}

function imapClient(email: string, password: string) {
  return new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
  });
}

async function folderPath(client: ImapFlow, requested: string) {
  if (requested === "INBOX") return "INBOX";
  const boxes = await client.list();
  const wanted = requested.toLowerCase();
  const exact = boxes.find((box: any) =>
    String(box.name || box.path || "").toLowerCase() === wanted ||
    String(box.specialUse || "").toLowerCase().includes(wanted.replace("sent", "\\sent").replace("trash", "\\trash").replace("drafts", "\\drafts"))
  );
  if (exact) return exact.path;
  const partial = boxes.find((box: any) =>
    String(box.path || "").toLowerCase().includes(wanted)
  );
  return partial?.path || requested;
}

async function getCounts(email: string, password: string) {
  const client = imapClient(email, password);
  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");
    try {
      const status: any = client.mailbox || {};
      return {
        unread: Number(status.exists || 0) - Number(status.seen || 0),
        total: Number(status.exists || 0),
      };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
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

    if (action === "counts") {
      return json(await getCounts(email, password));
    }

    if (action === "send") {
      const to = splitRecipients(body.to);
      if (!to.length) throw new Error("At least one recipient is required.");
      if (!String(body.subject || "").trim()) throw new Error("Subject is required.");

      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: true,
        auth: { user: email, pass: password },
      });

      const info = await transporter.sendMail({
        from: `"Samara Assisted Living" <${email}>`,
        to,
        cc: splitRecipients(body.cc),
        subject: String(body.subject || "").trim(),
        text: String(body.body || ""),
      });

      return json({ ok: true, messageId: info.messageId });
    }

    const client = imapClient(email, password);
    try {
      await client.connect();
      const path = await folderPath(client, String(body.folder || "INBOX"));
      const lock = await client.getMailboxLock(path);
      try {
        if (action === "list") {
          const total = Number((client.mailbox as any)?.exists || 0);
          const limit = Math.min(Math.max(Number(body.limit || 50), 1), 100);
          const start = Math.max(total - limit + 1, 1);
          const range = total ? `${start}:*` : "";
          const rows: any[] = [];

          if (range) {
            for await (const msg of client.fetch(range, {
              uid: true, envelope: true, flags: true, internalDate: true
            })) {
              const env: any = msg.envelope || {};
              const subject = String(env.subject || "");
              const from = addresses(env.from)[0] || { name: "", address: "" };
              const haystack = `${subject} ${from.name} ${from.address}`.toLowerCase();
              const query = String(body.search || "").trim().toLowerCase();
              if (query && !haystack.includes(query)) continue;

              rows.push({
                uid: msg.uid,
                subject,
                from,
                date: msg.internalDate || env.date || null,
                seen: msg.flags?.has("\\Seen") || false,
                flagged: msg.flags?.has("\\Flagged") || false,
              });
            }
          }

          rows.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

          let unread = 0;
          if (path === "INBOX") {
            const search = await client.search({ seen: false }, { uid: true });
            unread = search.length;
          } else {
            const inboxLock = await client.getMailboxLock("INBOX");
            try {
              const search = await client.search({ seen: false }, { uid: true });
              unread = search.length;
            } finally {
              inboxLock.release();
            }
          }

          return json({
            messages: rows.slice(0, limit),
            counts: { unread, total: path === "INBOX" ? total : undefined },
          });
        }

        if (action === "read") {
          const uid = Number(body.uid);
          if (!uid) throw new Error("Message UID is required.");

          const fetched: any = await client.fetchOne(uid, { source: true, uid: true }, { uid: true });
          if (!fetched?.source) throw new Error("Message was not found.");
          const parsed: any = await simpleParser(fetched.source);

          await client.messageFlagsAdd(uid, ["\\Seen"], { uid: true });

          return json({
            message: {
              uid,
              subject: parsed.subject || "(No subject)",
              from: addresses(parsed.from)[0] || { name: "", address: "" },
              to: addresses(parsed.to),
              cc: addresses(parsed.cc),
              date: parsed.date || null,
              text: parsed.text || "",
              htmlText: typeof parsed.html === "string" ? parsed.html.replace(/<[^>]+>/g, " ") : "",
              attachments: (parsed.attachments || []).map((a: any) => ({
                filename: a.filename || "Attachment",
                contentType: a.contentType || "",
                size: a.size || 0,
              })),
            },
          });
        }

        throw new Error("Unsupported mail action.");
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => {});
    }
  } catch (error) {
    console.error("Titan mail error", error);
    return json({ error: error?.message || "Titan Mail request failed." }, 400);
  }
});
