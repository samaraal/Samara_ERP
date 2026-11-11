// ERP 2.20.23 — Biometric punches from easy TimePro (eSSL / ZKTeco) → ERP.
// easy TimePro: System → Configuration → Api Settings → API URL = this function's URL + ?key=<push key>
// (the push key is shown to Admin in HR → Biometric Attendance). "Verify JWT" must be OFF for this
// function — easy TimePro cannot sign in; the private key in the URL protects it instead.
// Accepts the punch list as JSON (array / single object / {data:[...]}) and also the Python-style
// single-quoted format easy TimePro shows in its note. Every request is logged (30 days) for checking.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false } });
const reply = (b: any, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

function parseBody(text: string, contentType: string): any {
  const t = (text || '').trim();
  if (!t) return [];
  if (/application\/x-www-form-urlencoded/i.test(contentType) || (/^[\w%]+=/.test(t) && !t.startsWith('{') && !t.startsWith('['))) {
    const f = new URLSearchParams(t); const o: any = {};
    for (const [k, v] of f) o[k] = v;
    for (const k of ['data', 'json', 'payload']) if (o[k]) { try { return parseBody(o[k], 'application/json'); } catch { /* keep form */ } }
    return o;
  }
  try { return JSON.parse(t); } catch { /* try Python-style below */ }
  const py = t.replace(/\bNone\b/g, 'null').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false')
    .replace(/'/g, '"');
  return JSON.parse(py);
}
function rowsOf(body: any): any[] {
  if (Array.isArray(body)) return body.flatMap(rowsOf);
  if (body && typeof body === 'object') {
    for (const k of ['data', 'Data', 'DATA', 'records', 'rows', 'punches', 'transactions']) if (Array.isArray(body[k])) return body[k].flatMap(rowsOf);
    return [body];
  }
  if (typeof body === 'string') { try { return rowsOf(parseBody(body, 'application/json')); } catch { return []; } }
  return [];
}
const lower = (o: any) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [String(k).toLowerCase(), v]));
// "11-11-2026 09:05:00" (DD-MM-YYYY) or "2026-11-11 09:05:00" — easy TimePro times are Indian time.
function toIso(dt: string, d?: string, tm?: string): string | null {
  let s = String(dt || '').trim();
  if (!s && d) s = `${d} ${tm || '00:00:00'}`;
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${m[4].padStart(2, '0')}:${m[5]}:${m[6] || '00'}+05:30`;
  m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T${m[4].padStart(2, '0')}:${m[5]}:${m[6] || '00'}+05:30`;
  const x = new Date(s); return Number.isNaN(x.getTime()) ? null : x.toISOString();
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const key = url.searchParams.get('key') || req.headers.get('x-samara-key') || '';
  const { data: st } = await admin.from('attendance_push_settings').select('push_key').eq('id', 1).maybeSingle();
  if (!st?.push_key || key !== st.push_key) return reply({ status: 'error', message: 'Invalid key' }, 401);
  if (req.method === 'GET') return reply({ status: 'success', message: 'Samara ERP attendance receiver is ready' });

  const text = await req.text().catch(() => '');
  let rowsIn = 0, saved = 0, error: string | null = null;
  try {
    const body = parseBody(text, req.headers.get('content-type') || '');
    const rows = rowsOf(body).map(lower).map((r: any) => ({
      emp_code: String(r.emp_code ?? r.employee_id ?? r.empcode ?? r.user_id ?? '').trim(),
      punch_at: toIso(String(r.punch_datetime ?? r.punch_time_full ?? r.datetime ?? ''), r.punch_date, r.punch_time),
      punch_state: r.punch_state ?? null, verify_type: r.verify_type ?? null,
      terminal_sn: r.terminal_sn ?? r.serial_number ?? '', terminal_alias: r.terminal_alias ?? r.device_name ?? null,
      area_name: r.area_name ?? null,
      device_name: [r.first_name, r.last_name].filter((x: any) => x && String(x).trim()).join(' ') || null,
      raw: r,
    })).filter((r: any) => r.emp_code && r.punch_at);
    rowsIn = rows.length;
    if (rows.length) {
      const { data, error: e } = await admin.rpc('attendance_store_punches', { p_rows: rows });
      if (e) throw e;
      saved = Number(data || 0);
    }
  } catch (e) { error = String((e as any)?.message || e).slice(0, 300); }
  await admin.from('attendance_push_log').insert({ ok: !error, rows_in: rowsIn, rows_saved: saved, error, body: text.slice(0, 4000) });
  await admin.from('attendance_push_settings').update({ last_push_at: new Date().toISOString(), last_push_count: saved, last_push_error: error }).eq('id', 1);
  // easy TimePro only needs a 200 reply; an error is kept in the ERP log for Admin.
  return reply(error ? { status: 'error', message: error } : { status: 'success', received: rowsIn, saved });
});
