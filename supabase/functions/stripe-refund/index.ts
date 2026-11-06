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

    const { payment_id } = await req.json();
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

    const { data: adminCheck } = await supabaseClient
      .from("admin_users")
      .select("id, is_active")
      .eq("id", userData.user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!adminCheck) {
      return new Response(JSON.stringify({ error: "Only admins can issue refunds" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: payment, error: payError } = await supabaseClient
      .from("payments")
      .select("*, driver:profiles!payments_driver_id_fkey(stripe_account_id, full_name)")
      .eq("id", payment_id)
      .maybeSingle();

    if (payError || !payment) {
      return new Response(JSON.stringify({ error: "Payment not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const p = payment as {
      id: string;
      status: string;
      stripe_charge_id: string | null;
      stripe_payment_intent_id: string | null;
      stripe_transfer_id: string | null;
      stripe_destination_charge: boolean | null;
      gross_amount: string;
      driver_payout: string;
      shipper_id: string;
      driver_id: string;
      driver: { stripe_account_id: string | null; full_name: string } | null;
    };

    if (p.status !== "paid" && p.status !== "released") {
      return new Response(JSON.stringify({ error: "Only completed payments can be refunded" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!p.stripe_charge_id && !p.stripe_payment_intent_id) {
      return new Response(JSON.stringify({ error: "No Stripe charge found for this payment" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Step 1: Refund the shipper's charge ────────────────────
    const refundBody = new URLSearchParams();
    refundBody.append("amount", String(Math.round(Number(p.gross_amount) * 100)));
    if (p.stripe_charge_id) {
      refundBody.append("charge", p.stripe_charge_id);
    } else if (p.stripe_payment_intent_id) {
      refundBody.append("payment_intent", p.stripe_payment_intent_id);
    }
    refundBody.append("metadata[payment_id]", payment_id);

    const refundRes = await fetch("https://api.stripe.com/v1/refunds", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: refundBody,
    });

    const refundData = await refundRes.json() as Record<string, unknown>;
    if (!refundData.id) {
      return new Response(JSON.stringify({ error: "Failed to create refund", details: refundData }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Step 2: Reverse the driver's transfer if funds were released ─
    let transferReversed = false;
    let reversalError: string | null = null;

    if (p.status === "released") {
      // Case A: A separate transfer was created to the driver's Connect account
      if (p.stripe_transfer_id) {
        const reversalBody = new URLSearchParams();
        reversalBody.append("amount", String(Math.round(Number(p.driver_payout) * 100)));

        const reversalRes = await fetch(
          `https://api.stripe.com/v1/transfers/${p.stripe_transfer_id}/reversals`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${stripeSecretKey}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: reversalBody,
          },
        );
        const reversalData = await reversalRes.json() as Record<string, unknown>;
        if (reversalData.id) {
          transferReversed = true;
        } else {
          reversalError = (reversalData.error?.message as string) ?? "Unknown reversal error";
        }
      }

      // Case B: Destination charge — funds were routed to the driver's Connect
      // account automatically at charge time. We need to reverse the transfer
      // associated with the charge. The charge itself is refunded above, which
      // pulls from the platform balance; we also need to reverse the
      // application fee or destination transfer to recover the driver portion.
      if (!transferReversed && p.stripe_destination_charge && p.stripe_charge_id) {
        // Retrieve the charge to find the balance transaction / transfer
        const chargeRes = await fetch(
          `https://api.stripe.com/v1/charges/${p.stripe_charge_id}`,
          { headers: { Authorization: `Bearer ${stripeSecretKey}` } },
        );
        const chargeData = await chargeRes.json() as Record<string, unknown>;
        const transferId = (chargeData.transfer as string) ?? null;

        if (transferId) {
          const reversalBody = new URLSearchParams();
          reversalBody.append("amount", String(Math.round(Number(p.driver_payout) * 100)));

          const reversalRes = await fetch(
            `https://api.stripe.com/v1/transfers/${transferId}/reversals`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${stripeSecretKey}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: reversalBody,
            },
          );
          const reversalData = await reversalRes.json() as Record<string, unknown>;
          if (reversalData.id) {
            transferReversed = true;
          } else {
            reversalError = (reversalData.error?.message as string) ?? "Unknown reversal error";
          }
        }

        // Store the transfer ID for future reference
        if (transferId && !p.stripe_transfer_id) {
          await supabaseClient
            .from("payments")
            .update({ stripe_transfer_id: transferId })
            .eq("id", payment_id);
        }
      }
    }

    // ─── Step 3: Update the payment record ──────────────────────
    await supabaseClient
      .from("payments")
      .update({
        status: "refunded",
        stripe_refund_id: refundData.id as string,
        released_at: null,
      })
      .eq("id", payment_id);

    // ─── Step 4: Mark any related payout as reversed ────────────
    if (transferReversed) {
      await supabaseClient
        .from("payouts")
        .update({ status: "reversed" })
        .eq("payment_id", payment_id)
        .eq("status", "pending");
    }

    // ─── Step 5: Notify shipper and driver ──────────────────────
    await supabaseClient.from("notifications").insert({
      recipient_id: p.shipper_id,
      channel: "email",
      recipient_contact: "",
      subject: "Payment Refunded",
      body: `Your payment of $${Number(p.gross_amount).toFixed(2)} has been refunded.`,
      related_type: "payment",
      related_id: payment_id,
      status: "sent",
    });

    if (p.driver_id && transferReversed) {
      await supabaseClient.from("notifications").insert({
        recipient_id: p.driver_id,
        channel: "email",
        recipient_contact: "",
        subject: "Payout Reversed",
        body: `A payout of $${Number(p.driver_payout).toFixed(2)} has been reversed due to a refund on delivery payment ${payment_id}. This may take a few days to reflect in your account.`,
        related_type: "payment",
        related_id: payment_id,
        status: "sent",
      });
    }

    return new Response(JSON.stringify({
      success: true,
      refund_id: refundData.id,
      transfer_reversed: transferReversed,
      reversal_error: reversalError,
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
