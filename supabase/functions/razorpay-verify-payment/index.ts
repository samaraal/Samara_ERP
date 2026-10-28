const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

async function getVerifiedFamilyContext(sessionToken: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Supabase server configuration is incomplete");

  const dashRes = await fetch(`${supabaseUrl}/rest/v1/rpc/family_portal_dashboard`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_session_token: sessionToken }),
  });
  const dashboard = await dashRes.json().catch(() => null);
  if (!dashRes.ok || !dashboard?.patient) return { error: "Family Portal session has expired", status: 401 };
  const patientId = dashboard.patient.id || dashboard.patient.patient_uuid || dashboard.patient.patient_id || dashboard.patient.uuid;
  if (!patientId) return { error: "Resident could not be identified", status: 400 };
  return { supabaseUrl, serviceRoleKey, patientId, patientCode: dashboard.patient.patient_id || dashboard.patient.patient_code || "", patientName: dashboard.patient.patient_name || dashboard.patient.name || "" };
}

async function serviceSelect(baseUrl: string, key: string, path: string) {
  const res = await fetch(`${baseUrl}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Supabase read failed: ${await res.text()}`);
  return await res.json();
}

async function serviceInsert(baseUrl: string, key: string, table: string, row: Record<string, unknown>) {
  const res = await fetch(`${baseUrl}/rest/v1/${table}`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(row) });
  if (!res.ok) throw new Error(`Supabase insert failed: ${await res.text()}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }

  try {
    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

    if (!keyId || !keySecret) {
      console.error("RAZORPAY_KEY_SECRET is not configured");

      return new Response(
        JSON.stringify({
          success: false,
          error: "Payment gateway is not configured",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const body = await req.json();

    const razorpayPaymentId = body.razorpay_payment_id;
    const razorpayOrderId = body.razorpay_order_id;
    const razorpaySignature = body.razorpay_signature;
    const sessionToken = String(body.session_token || "").trim();

    if (
      !razorpayPaymentId ||
      !razorpayOrderId ||
      !razorpaySignature ||
      !sessionToken
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing Razorpay payment verification fields",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const message =
      `${razorpayOrderId}|${razorpayPaymentId}`;

    const encoder = new TextEncoder();

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(keySecret),
      {
        name: "HMAC",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      encoder.encode(message)
    );

    const expectedSignature = bytesToHex(
      new Uint8Array(signatureBuffer)
    );

    if (!safeEqual(expectedSignature, razorpaySignature)) {
      console.error(
        "Razorpay signature verification failed",
        razorpayOrderId
      );

      return new Response(
        JSON.stringify({
          success: false,
          error: "Payment signature verification failed",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    // The signature is valid. Bind the payment to the active Family Portal
    // session and confirm the captured payment directly with Razorpay.
    const familyContext = await getVerifiedFamilyContext(sessionToken);

    if ("error" in familyContext) {
      return new Response(
        JSON.stringify({ success: false, error: familyContext.error }),
        {
          status: familyContext.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const credentials = btoa(`${keyId}:${keySecret}`);

    const paymentResponse = await fetch(
      `https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpayPaymentId)}`,
      {
        method: "GET",
        headers: { Authorization: `Basic ${credentials}` },
      }
    );

    const payment = await paymentResponse.json();

    if (!paymentResponse.ok) {
      console.error("Unable to confirm Razorpay payment:", payment);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Unable to confirm payment with Razorpay",
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (payment.order_id !== razorpayOrderId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Razorpay order does not match this payment",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Read the Razorpay order created by Samara. Its notes bind the payment
    // type and resident to this server-created order, so the browser cannot
    // turn an outstanding payment into an advance (or vice versa).
    const orderResponse = await fetch(
      `https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpayOrderId)}`,
      { method: "GET", headers: { Authorization: `Basic ${credentials}` } }
    );
    const order = await orderResponse.json();
    if (!orderResponse.ok) {
      return new Response(JSON.stringify({ success: false, error: "Unable to confirm Razorpay order" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const paymentType = String(order?.notes?.samara_payment_type || "outstanding").toLowerCase();
    const orderPatientId = String(order?.notes?.samara_patient_id || "");
    if (!['outstanding', 'advance'].includes(paymentType) || orderPatientId !== String(familyContext.patientId)) {
      return new Response(JSON.stringify({ success: false, error: "Payment order is not valid for this Family Portal account" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (Number(order.amount) !== Number(payment.amount)) {
      return new Response(JSON.stringify({ success: false, error: "Captured amount does not match the Razorpay order" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (String(payment.currency || "") !== "INR") {
      return new Response(
        JSON.stringify({ success: false, error: "Unexpected payment currency" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (String(payment.status || "") !== "captured") {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Payment has not been captured by Razorpay",
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const amountRupees = Number(payment.amount || 0) / 100;

    if (!Number.isFinite(amountRupees) || amountRupees < 1) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid captured payment amount",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Prevent the same Razorpay Payment ID from being posted twice.
    const transactionType = paymentType === "advance" ? "Advance" : "Payment";
    const duplicateQuery = new URLSearchParams({ select: "id", patient_id: `eq.${familyContext.patientId}`, description: `ilike.*${razorpayPaymentId}*`, limit: "1" });
    const duplicateRows = await serviceSelect(familyContext.supabaseUrl, familyContext.serviceRoleKey, `billing_transactions?${duplicateQuery}`);

    if ((duplicateRows || []).length > 0) {
      return new Response(
        JSON.stringify({
          success: true,
          verified: true,
          already_recorded: true,
          payment_id: razorpayPaymentId,
          order_id: razorpayOrderId,
          amount: amountRupees,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Re-read the ERP ledger immediately before posting.
    const ledgerQuery = new URLSearchParams({ select: "amount,transaction_type", patient_id: `eq.${familyContext.patientId}` });
    const ledger = await serviceSelect(familyContext.supabaseUrl, familyContext.serviceRoleKey, `billing_transactions?${ledgerQuery}`);

    let charges = 0;
    let payments = 0;
    let advances = 0;
    let discounts = 0;
    let refunds = 0;

    for (const row of ledger || []) {
      const rowAmount = Number(row.amount || 0);
      const type = String(row.transaction_type || "").toLowerCase();
      if (type === "charge") charges += rowAmount;
      else if (type === "payment") payments += rowAmount;
      else if (type === "advance") advances += rowAmount;
      else if (type === "discount") discounts += rowAmount;
      else if (type === "refund") refunds += rowAmount;
    }

    const currentOutstanding =
      Math.max(0, charges - payments - advances - discounts + refunds);

    if (paymentType === "outstanding" && amountRupees > currentOutstanding + 0.01) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Payment was captured but the ERP outstanding changed. Please contact Samara Accounts for reconciliation.",
          payment_id: razorpayPaymentId,
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const description = [
      paymentType === "advance" ? "Family Portal online advance" : "Family Portal online payment",
      `Razorpay Payment ID: ${razorpayPaymentId}`,
      `Razorpay Order ID: ${razorpayOrderId}`,
    ].join(" · ");

    await serviceInsert(familyContext.supabaseUrl, familyContext.serviceRoleKey, "billing_transactions", {
        patient_id: familyContext.patientId,
        transaction_type: transactionType,
        category: paymentType === "advance" ? "Online Advance" : "Online Payment",
        amount: amountRupees,
        description,
        payment_mode: "Razorpay Online",
        transaction_date: new Date().toISOString(),
      });

    return new Response(
      JSON.stringify({
        success: true,
        verified: true,
        payment_id: razorpayPaymentId,
        order_id: razorpayOrderId,
        amount: amountRupees,
        patient_id: familyContext.patientId,
        recorded_in_erp: true,
        transaction_type: transactionType,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Verify payment error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: "Unable to verify payment",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});