import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      return new Response(JSON.stringify({ error: "Stripe not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only admins can sync payments
    const { data: adminCheck } = await supabaseClient
      .from("admin_users")
      .select("id")
      .eq("id", userData.user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!adminCheck) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { payment_id } = body;
    if (!payment_id) {
      return new Response(JSON.stringify({ error: "Missing payment_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: payment, error: payError } = await supabaseClient
      .from("payments")
      .select("id, status, stripe_checkout_session_id, gross_amount, delivery_id")
      .eq("id", payment_id)
      .maybeSingle();

    if (payError || !payment) {
      return new Response(JSON.stringify({ error: "Payment not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const p = payment as { id: string; status: string; stripe_checkout_session_id: string | null; gross_amount: string; delivery_id: string };

    if (!p.stripe_checkout_session_id) {
      return new Response(JSON.stringify({ error: "No checkout session ID on this payment" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the checkout session from Stripe to get the payment intent
    const sessionRes = await fetch(
      `https://api.stripe.com/v1/checkout/sessions/${p.stripe_checkout_session_id}`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } },
    );
    const sessionData = await sessionRes.json() as Record<string, unknown>;

    if (!sessionData.id) {
      return new Response(JSON.stringify({ error: "Stripe session not found", details: sessionData }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paymentStatus = sessionData.payment_status as string;
    const paymentIntentId = sessionData.payment_intent as string | null;

    if (paymentStatus !== "paid" || !paymentIntentId) {
      return new Response(JSON.stringify({
        error: `Checkout session payment status is "${paymentStatus}", not "paid"`,
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the payment intent to get the charge ID
    let chargeId: string | null = null;
    const piRes = await fetch(
      `https://api.stripe.com/v1/payment_intents/${paymentIntentId}`,
      { headers: { Authorization: `Bearer ${stripeSecretKey}` } },
    );
    const piData = await piRes.json() as Record<string, unknown>;
    chargeId = (piData.latest_charge as string) ?? null;

    // Update the payment record
    const update: Record<string, unknown> = {
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: paymentIntentId,
    };
    if (chargeId) update.stripe_charge_id = chargeId;

    await supabaseClient
      .from("payments")
      .update(update)
      .eq("id", p.id)
      .eq("status", "pending");

    // Verify the update worked
    const { data: updated } = await supabaseClient
      .from("payments")
      .select("status, stripe_payment_intent_id, stripe_charge_id, paid_at")
      .eq("id", p.id)
      .maybeSingle();

    return new Response(JSON.stringify({
      success: true,
      payment_id: p.id,
      previous_status: p.status,
      updated: updated,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
