const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function getFamilyPaymentContext(sessionToken: string) {
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

  const q = new URLSearchParams({ select: "amount,transaction_type", patient_id: `eq.${patientId}` });
  const ledgerRes = await fetch(`${supabaseUrl}/rest/v1/billing_transactions?${q}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!ledgerRes.ok) throw new Error("Unable to read billing ledger");
  const ledger = await ledgerRes.json();

  let charges = 0, payments = 0, advances = 0, discounts = 0, refunds = 0;
  for (const row of ledger || []) {
    const amount = Number(row.amount || 0), type = String(row.transaction_type || "").toLowerCase();
    if (type === "charge") charges += amount;
    else if (type === "payment") payments += amount;
    else if (type === "advance") advances += amount;
    else if (type === "discount") discounts += amount;
    else if (type === "refund") refunds += amount;
  }
  const outstanding = Math.max(0, charges - payments - advances - discounts + refunds);
  const patientStatus = String(dashboard.patient.admission_status || dashboard.patient.status || "").toLowerCase();
  const isActive = dashboard.patient.is_active !== false && patientStatus !== "discharged";
  return { patientId, patientCode: dashboard.patient.patient_id || dashboard.patient.patient_code || "", patientName: dashboard.patient.patient_name || dashboard.patient.name || "", outstanding, amountPaise: Math.round(outstanding * 100), isActive };
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

    if (!keyId || !keySecret) {
      console.error("Razorpay credentials are not configured");

      return new Response(
        JSON.stringify({ error: "Payment gateway is not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const body = await req.json();
    const sessionToken = String(body.session_token || "").trim();

    if (!sessionToken) {
      return new Response(
        JSON.stringify({ error: "Family Portal session is required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const paymentContext = await getFamilyPaymentContext(sessionToken);

    if ("error" in paymentContext) {
      return new Response(
        JSON.stringify({ error: paymentContext.error }),
        {
          status: paymentContext.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const paymentType = String(body.payment_type || "outstanding").toLowerCase();
    if (!['outstanding', 'advance'].includes(paymentType)) {
      return new Response(JSON.stringify({ error: "Invalid payment type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Outstanding is always server-calculated. For an advance, the family may
    // choose the amount, but the server validates and freezes it into the order.
    let amount: number;
    if (paymentType === 'advance') {
      if (!paymentContext.isActive) {
        return new Response(JSON.stringify({ error: "Advance payment is available only for active residents" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const advanceRupees = Number(body.advance_amount);
      if (!Number.isFinite(advanceRupees) || advanceRupees < 1 || advanceRupees > 500000) {
        return new Response(JSON.stringify({ error: "Advance amount must be between ₹1 and ₹5,00,000" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      amount = Math.round(advanceRupees * 100);
    } else {
      amount = paymentContext.amountPaise;
    }

    const currency = "INR";
    const receipt =
      `samara_${paymentType}_${String(paymentContext.patientId).slice(0, 8)}_${Date.now()}`;

    if (!Number.isInteger(amount) || amount < 100) {
      return new Response(
        JSON.stringify({
          error: "Invalid amount. Minimum payment is ₹1.00",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const credentials = btoa(`${keyId}:${keySecret}`);

    const razorpayResponse = await fetch(
      "https://api.razorpay.com/v1/orders",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount,
          currency,
          receipt,
          notes: {
            samara_payment_type: paymentType,
            samara_patient_id: String(paymentContext.patientId),
          },
        }),
      }
    );

    const data = await razorpayResponse.json();

    if (!razorpayResponse.ok) {
      console.error("Razorpay create order error:", data);

      const status =
        razorpayResponse.status === 401 ? 401 : 500;

      return new Response(
        JSON.stringify({
          error:
            status === 401
              ? "Razorpay authentication failed"
              : "Unable to create payment order",
        }),
        {
          status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        order_id: data.id,
        amount: data.amount,
        currency: data.currency,
        key_id: keyId,
        patient_id: paymentContext.patientId,
        patient_code: paymentContext.patientCode,
        patient_name: paymentContext.patientName,
        outstanding: paymentContext.outstanding,
        payment_type: paymentType,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Create order error:", error);

    return new Response(
      JSON.stringify({ error: "Unable to create payment order" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});