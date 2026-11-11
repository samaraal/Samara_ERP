// ERP 2.20.24 — Biometric staff sync: ERP employee list → easy TimePro → ZKTeco machine.
// Called every 5 minutes by the small "Samara Biometric Sync" program on the Samara PC (where easy TimePro runs).
//   GET  ?key=<push key>  → staff list with status active / suspended / exited (SQL 372: biometric_staff_feed)
//   POST ?key=<push key>  → result of that run (what was added / blocked / resigned), shown in HR → Biometric Attendance
// "Verify JWT" must be OFF — the program cannot sign in; the same private key as the punch receiver protects it.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const admin = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false } });
const reply = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const key = url.searchParams.get('key') || req.headers.get('x-samara-key') || '';
  const { data: st } = await admin.from('attendance_push_settings').select('push_key').eq('id', 1).maybeSingle();
  if (!st?.push_key || key !== st.push_key) return reply({ ok: false, message: 'Invalid key' }, 401);

  try {
    if (req.method === 'GET') {
      const { data, error } = await admin.rpc('biometric_staff_feed');
      if (error) throw error;
      return reply(data);
    }
    if (req.method === 'POST') {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== 'object') return reply({ ok: false, message: 'JSON body expected' }, 400);
      const { error } = await admin.rpc('biometric_staff_sync_record', { p: body });
      if (error) throw error;
      return reply({ ok: true });
    }
    return reply({ ok: false, message: 'Use GET or POST' }, 405);
  } catch (e) {
    return reply({ ok: false, message: String((e as { message?: string })?.message || e).slice(0, 300) }, 500);
  }
});
