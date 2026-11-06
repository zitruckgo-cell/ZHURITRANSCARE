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
      return new Response(JSON.stringify({ error: "Stripe is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { payment_id, action: reqAction } = body;

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // ─── Setup mode: save a payment method for future use ─────────
    if (reqAction === "setup") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const token = authHeader.replace("Bearer ", "");
      const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
      if (userError || !userData.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const userId = userData.user.id;
      const shipperEmail = userData.user.email || "";

      const { data: profile } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      let stripeCustomerId = profile?.stripe_customer_id;

      if (!stripeCustomerId) {
        const customerRes = await fetch("https://api.stripe.com/v1/customers", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            email: shipperEmail,
            name: profile?.business_name || profile?.full_name || "",
            "metadata[supabase_user_id]": userId,
          }),
        });
        const customerData = await customerRes.json();
        if (!customerData.id) {
          return new Response(JSON.stringify({ error: "Failed to create Stripe customer" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        stripeCustomerId = customerData.id;
        await supabaseClient
          .from("profiles")
          .update({ stripe_customer_id: stripeCustomerId })
          .eq("id", userId);
      }

      const referers = req.headers.get("referer");
      let origin = req.headers.get("origin");
      if (!origin && referers) {
        try { origin = new URL(referers).origin; } catch { origin = null; }
      }
      if (!origin) origin = "https://zhuritranscare.bolt.host";

      const sessionBody = new URLSearchParams();
      sessionBody.append("mode", "setup");
      sessionBody.append("customer", stripeCustomerId);
      sessionBody.append("currency", "usd");
      // Don't restrict payment_method_types — let Stripe show all methods
      // enabled on the account (card, ACH, Cash App, Link, etc.)
      sessionBody.append("metadata[supabase_user_id]", userId);
      sessionBody.append("success_url", `${origin}/?payment=setup_success&session_id={CHECKOUT_SESSION_ID}`);
      sessionBody.append("cancel_url", `${origin}/?payment=setup_cancelled`);

      const checkoutRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: sessionBody,
      });

      const checkoutData = await checkoutRes.json();
      if (!checkoutData.id || !checkoutData.url) {
        console.error("Stripe setup session error:", JSON.stringify(checkoutData));
        return new Response(JSON.stringify({ error: "Failed to create setup session", details: checkoutData }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ url: checkoutData.url }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!payment_id) {
      return new Response(JSON.stringify({ error: "Missing payment_id" }), {
        status: 400,
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

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    const { data: payment, error: payError } = await supabaseClient
      .from("payments")
      .select("*, delivery:deliveries(*), shipper:profiles!payments_shipper_id_fkey(*), driver:profiles!payments_driver_id_fkey(*)")
      .eq("id", payment_id)
      .maybeSingle();

    if (payError || !payment) {
      return new Response(JSON.stringify({ error: "Payment not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (payment.shipper_id !== userId) {
      const { data: adminCheck } = await supabaseClient
        .from("admin_users")
        .select("id")
        .eq("id", userId)
        .eq("is_active", true)
        .maybeSingle();
      if (!adminCheck) {
        return new Response(JSON.stringify({ error: "You are not authorized to pay for this delivery" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (payment.status === "paid" || payment.status === "released") {
      return new Response(JSON.stringify({ error: "This payment has already been completed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Always create a fresh checkout session so the charged amount
    // matches the current gross_amount (admin may have edited it).
    // Clear any stale session ID first.
    if (payment.stripe_checkout_session_id) {
      await supabaseClient
        .from("payments")
        .update({ stripe_checkout_session_id: null })
        .eq("id", payment_id);
    }

    const delivery = payment.delivery;

    // Recalculate the correct price from the delivery's accepted_bid,
    // falling back to calculated_price / max_bid_amount. The payment's
    // gross_amount may be stale if it was created before a bid was accepted
    // (e.g. admin auto-assign created it with the original calculated_price).
    const correctPrice = Number(delivery?.accepted_bid) ||
      Number(delivery?.calculated_price) ||
      Number(delivery?.max_bid_amount) ||
      Number(payment.gross_amount) || 0;

    // Fetch commission rate from app_settings (default 10%)
    const { data: settingsRow } = await supabaseClient
      .from("app_settings")
      .select("value")
      .eq("key", "commission_rate")
      .maybeSingle();
    const commissionRate = settingsRow ? Number(settingsRow.value) : 0.10;
    const correctCommission = Math.round(correctPrice * commissionRate * 100) / 100;
    const correctDriverPayout = Math.round((correctPrice - correctCommission) * 100) / 100;

    // Update the payment record with the corrected amounts so the webhook
    // and payout release use the right figures.
    if (Number(payment.gross_amount) !== correctPrice) {
      await supabaseClient
        .from("payments")
        .update({
          gross_amount: correctPrice,
          commission_rate: commissionRate,
          commission_amount: correctCommission,
          driver_payout: correctDriverPayout,
        })
        .eq("id", payment_id);
    }

    const grossAmountCents = Math.round(correctPrice * 100);
    const driverPayoutCents = Math.round(correctDriverPayout * 100);

    let stripeCustomerId = payment.shipper?.stripe_customer_id;
    const shipperEmail = userData.user.email || "";

    if (!stripeCustomerId) {
      const customerRes = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          email: shipperEmail,
          name: payment.shipper?.business_name || payment.shipper?.full_name || "",
          "metadata[supabase_user_id]": userId,
        }),
      });
      const customerData = await customerRes.json();
      if (!customerData.id) {
        return new Response(JSON.stringify({ error: "Failed to create Stripe customer" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      stripeCustomerId = customerData.id;
      await supabaseClient
        .from("profiles")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", userId);
    }

    const referer = req.headers.get("referer");
    let origin = req.headers.get("origin");
    if (!origin && referer) {
      try { origin = new URL(referer).origin; } catch { origin = null; }
    }
    if (!origin) origin = "https://zhuritranscare.bolt.host";

    // Check if driver has a connected Stripe account with charges enabled.
    // If so, use a destination charge: funds go directly to the driver's
    // connected account, and the platform keeps the commission via
    // application_fee_amount. If not, use a standard charge to the platform.
    const driverStripeAccountId = payment.driver?.stripe_account_id as string | null;
    const driverChargesEnabled = payment.driver?.stripe_charges_enabled as boolean ?? false;
    const useDestinationCharge = driverStripeAccountId && driverChargesEnabled;

    const sessionBody = new URLSearchParams();
    sessionBody.append("mode", "payment");
    sessionBody.append("customer", stripeCustomerId);
    // Don't restrict payment_method_types — Stripe will show all methods
    // enabled on the account automatically (card, ACH, Cash App, Link, etc.)
    sessionBody.append("line_items[0][quantity]", "1");
    sessionBody.append("line_items[0][price_data][currency]", "usd");
    sessionBody.append("line_items[0][price_data][unit_amount]", String(grossAmountCents));
    sessionBody.append(
      "line_items[0][price_data][product_data][name]",
      `Delivery: ${delivery?.pickup_city ?? "N/A"} → ${delivery?.delivery_city ?? "N/A"}`,
    );
    if (delivery?.bol_number) {
      sessionBody.append("line_items[0][price_data][product_data][description]", `BOL: ${delivery.bol_number}`);
    }
    sessionBody.append("metadata[payment_id]", payment_id);
    sessionBody.append("metadata[delivery_id]", payment.delivery_id);
    sessionBody.append("metadata[shipper_id]", payment.shipper_id);
    sessionBody.append("metadata[driver_id]", payment.driver_id ?? "");
    sessionBody.append("success_url", `${origin}/?payment=success&session_id={CHECKOUT_SESSION_ID}`);
    sessionBody.append("cancel_url", `${origin}/?payment=cancelled`);

    if (useDestinationCharge) {
      // Destination charge: the full amount goes to the driver's connected account,
      // and the platform deducts the commission as an application fee.
      sessionBody.append("payment_intent_data[application_fee_amount]", String(grossAmountCents - driverPayoutCents));
      sessionBody.append("payment_intent_data[transfer_data][destination]", driverStripeAccountId!);
      sessionBody.append("payment_intent_data[metadata][payment_id]", payment_id);
      sessionBody.append("payment_intent_data[metadata][driver_id]", payment.driver_id ?? "");
    }

    const checkoutRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: sessionBody,
    });

    const checkoutData = await checkoutRes.json();
    if (!checkoutData.id || !checkoutData.url) {
      console.error("Stripe checkout error:", JSON.stringify(checkoutData));
      return new Response(JSON.stringify({ error: "Failed to create checkout session", details: checkoutData }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabaseClient
      .from("payments")
      .update({
        stripe_checkout_session_id: checkoutData.id,
        stripe_destination_charge: useDestinationCharge,
      })
      .eq("id", payment_id);

    return new Response(JSON.stringify({ url: checkoutData.url }), {
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
