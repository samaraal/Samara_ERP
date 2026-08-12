import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const expected = Deno.env.get("CLEANUP_SECRET");
  if (expected && req.headers.get("x-cleanup-secret") !== expected) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data: rows, error } = await supabase
    .from("patient_daily_moments")
    .select("id,storage_path")
    .lte("expires_at", new Date().toISOString())
    .limit(500);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "content-type": "application/json" } });
  const paths = (rows || []).map((r) => r.storage_path).filter(Boolean);
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from("patient-daily-moments").remove(paths);
    if (storageError) return new Response(JSON.stringify({ error: storageError.message }), { status: 500, headers: { "content-type": "application/json" } });
    const ids = (rows || []).map((r) => r.id);
    const { error: deleteError } = await supabase.from("patient_daily_moments").delete().in("id", ids);
    if (deleteError) return new Response(JSON.stringify({ error: deleteError.message }), { status: 500, headers: { "content-type": "application/json" } });
  }
  return new Response(JSON.stringify({ success: true, deleted: paths.length }), { headers: { "content-type": "application/json" } });
});
