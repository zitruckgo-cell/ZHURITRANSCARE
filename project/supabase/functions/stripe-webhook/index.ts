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

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!stripeSecretKey || !webhookSecret) {
    return new Response(JSON.stringify({ error: "Stripe is not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const body = await req.text();
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const event = await verifyStripeEvent(body, signature, webhookSecret);
    if (!event) {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Idempotency: check if we've already processed this event ──
    const { data: existingEvent } = await supabaseClient
      .from("stripe_webhook_events")
      .select("id")
      .eq("id", event.id)
      .maybeSingle();

    if (existingEvent) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Record the event as processed
    await supabaseClient.from("stripe_webhook_events").insert({
      id: event.id,
      event_type: event.type,
    });

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;

        // ─── Setup session: store the saved payment method on the profile ──
        if (session.mode === "setup") {
          const userId = session.metadata?.supabase_user_id;
          const setupIntentId = session.setup_intent;

          if (userId && setupIntentId) {
            const siRes = await fetch(`https://api.stripe.com/v1/setup_intents/${setupIntentId}`, {
              headers: { Authorization: `Bearer ${stripeSecretKey}` },
            });
            const siData = await siRes.json() as Record<string, unknown>;
            const paymentMethodId = siData.payment_method as string | null;

            if (paymentMethodId) {
              await supabaseClient
                .from("profiles")
                .update({ stripe_default_payment_method: paymentMethodId })
                .eq("id", userId);
            }
          }
          break;
        }

        const paymentId = session.metadata?.payment_id;

        if (paymentId) {
          const update: Record<string, unknown> = {
            status: "paid",
            paid_at: new Date().toISOString(),
          };
          if (session.payment_intent) {
            update.stripe_payment_intent_id = session.payment_intent;
            const piRes = await fetch(`https://api.stripe.com/v1/payment_intents/${session.payment_intent}`, {
              headers: { Authorization: `Bearer ${stripeSecretKey}` },
            });
            const piData = await piRes.json();
            if (piData.latest_charge) {
              update.stripe_charge_id = piData.latest_charge;
            }
          }

          await supabaseClient
            .from("payments")
            .update(update)
            .eq("id", paymentId)
            .eq("status", "pending"); // Only update if still pending — idempotency guard

          const { data: payment } = await supabaseClient
            .from("payments")
            .select("shipper_id, gross_amount, driver_id, driver_payout, status, delivery_id, delivery:deliveries(pickup_city, delivery_city)")
            .eq("id", paymentId)
            .maybeSingle();

          if (payment) {
            const p = payment as { shipper_id: string; gross_amount: string; driver_id: string; driver_payout: string; status: string; delivery_id: string; delivery?: { pickup_city: string; delivery_city: string } };
            await supabaseClient.from("notifications").insert({
              recipient_id: p.shipper_id,
              channel: "email",
              recipient_contact: "",
              subject: "Payment Successful",
              body: `Your payment of $${Number(p.gross_amount).toFixed(2)} for delivery ${p.delivery?.pickup_city ?? ""} → ${p.delivery?.delivery_city ?? ""} has been processed successfully.`,
              related_type: "payment",
              related_id: paymentId,
              status: "sent",
            });

            // Notify driver they're cleared to start the pickup
            if (p.status === "paid" && p.driver_id) {
              await supabaseClient.from("notifications").insert({
                recipient_id: p.driver_id,
                channel: "email",
                recipient_contact: "",
                subject: "You're Cleared to Go",
                body: `Payment has been confirmed for your delivery ${p.delivery?.pickup_city ?? ""} → ${p.delivery?.delivery_city ?? ""}. You can now head to the pickup location.`,
                related_type: "payment",
                related_id: paymentId,
                status: "sent",
              });

              await supabaseClient.from("tracking_events").insert({
                delivery_id: p.delivery_id,
                status: "Payment confirmed — cleared for pickup",
                notes: "Shipper payment confirmed. Driver cleared to start pickup.",
              });
            }

            // If delivery is already delivered, release the payment and create transfer
            if (p.status === "paid") {
              const { data: delivery } = await supabaseClient
                .from("deliveries")
                .select("status")
                .eq("id", p.delivery_id)
                .maybeSingle();

              if (delivery && (delivery as { status: string }).status === "delivered") {
                await releasePaymentToDriver(supabaseClient, stripeSecretKey, paymentId, p);
              }
            }
          }
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object;
        const paymentIntentId = charge.payment_intent;

        if (paymentIntentId) {
          const { data: payment } = await supabaseClient
            .from("payments")
            .select("id, shipper_id, gross_amount, stripe_transfer_id")
            .eq("stripe_payment_intent_id", paymentIntentId)
            .maybeSingle();

          if (payment) {
            const p = payment as { id: string; shipper_id: string; gross_amount: string; stripe_transfer_id: string | null };
            await supabaseClient
              .from("payments")
              .update({
                status: "refunded",
                stripe_refund_id: charge.refunds?.data?.[0]?.id ?? null,
              })
              .eq("id", p.id);

            // If there was a transfer to the driver, reverse it
            if (p.stripe_transfer_id) {
              await fetch(`https://api.stripe.com/v1/transfers/${p.stripe_transfer_id}/reversals`, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${stripeSecretKey}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
              });
            }

            await supabaseClient.from("notifications").insert({
              recipient_id: p.shipper_id,
              channel: "email",
              recipient_contact: "",
              subject: "Payment Refunded",
              body: `Your payment of $${Number(p.gross_amount).toFixed(2)} has been refunded.`,
              related_type: "payment",
              related_id: p.id,
              status: "sent",
            });
          }
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const intent = event.data.object;
        // Try by payment_intent_id first, then fall back to metadata payment_id
        // (the intent ID is only stored on the payment record after checkout succeeds,
        // so for failures we rely on the metadata link set at session creation time).
        const paymentIdFromMeta = intent.metadata?.payment_id as string | undefined;
        let payment = null;
        if (paymentIdFromMeta) {
          const { data } = await supabaseClient
            .from("payments")
            .select("id, shipper_id")
            .eq("id", paymentIdFromMeta)
            .maybeSingle();
          payment = data;
        }
        if (!payment) {
          const { data } = await supabaseClient
            .from("payments")
            .select("id, shipper_id")
            .eq("stripe_payment_intent_id", intent.id)
            .maybeSingle();
          payment = data;
        }

        if (payment) {
          const p = payment as { id: string; shipper_id: string };
          const failureReason = (intent.last_payment_error as Record<string, unknown> | null)?.message as string | undefined;
          await supabaseClient.from("notifications").insert({
            recipient_id: p.shipper_id,
            channel: "email",
            recipient_contact: "",
            subject: "Payment Failed",
            body: `Your payment could not be processed. ${failureReason ? `Reason: ${failureReason}. ` : ""}Please try again or contact support.`,
            related_type: "payment",
            related_id: p.id,
            status: "failed",
          });
        }
        break;
      }

      case "checkout.session.expired": {
        // Clear the stale session ID so the shipper can retry with a fresh one
        const session = event.data.object;
        const paymentId = session.metadata?.payment_id as string | undefined;
        if (paymentId) {
          await supabaseClient
            .from("payments")
            .update({ stripe_checkout_session_id: null })
            .eq("id", paymentId)
            .eq("status", "pending");
        }
        break;
      }

      // ─── Stripe Connect account events ─────────────────────────

      case "account.updated": {
        const account = event.data.object;
        const accountId = account.id;

        const { data: profile } = await supabaseClient
          .from("profiles")
          .select("id")
          .eq("stripe_account_id", accountId)
          .maybeSingle();

        if (profile) {
          // v1 account object: charges_enabled, payouts_enabled, requirements at top level
          const chargesEnabled = (account.charges_enabled as boolean) ?? false;
          const payoutsEnabled = (account.payouts_enabled as boolean) ?? false;

          const requirementsObj = account.requirements as Record<string, unknown> | undefined;
          const requirementsCurrentlyDue = (requirementsObj?.currently_due as unknown[]) ?? [];
          const onboardingComplete = requirementsCurrentlyDue.length === 0;
          const requirementsStatus = requirementsCurrentlyDue.length > 0
            ? "restricted"
            : ((chargesEnabled && payoutsEnabled) ? "verified" : "pending");

          let accountStatus = "pending";
          if (chargesEnabled && payoutsEnabled) accountStatus = "active";
          else if (requirementsObj?.disabled_reason) accountStatus = "restricted";
          else if (requirementsStatus === "restricted") accountStatus = "restricted";

          await supabaseClient
            .from("profiles")
            .update({
              stripe_account_status: accountStatus,
              stripe_onboarding_complete: onboardingComplete,
              stripe_charges_enabled: chargesEnabled,
              stripe_payouts_enabled: payoutsEnabled,
              stripe_requirements_status: requirementsStatus,
            })
            .eq("id", (profile as { id: string }).id);

          // Notify driver of status changes
          if (accountStatus === "active" && requirementsStatus === "verified") {
            await supabaseClient.from("notifications").insert({
              recipient_id: (profile as { id: string }).id,
              channel: "email",
              recipient_contact: "",
              subject: "Payment Account Active",
              body: "Your Stripe payment account is now active. You can receive payouts for completed deliveries.",
              related_type: "stripe_account",
              status: "sent",
            });
          } else if (requirementsStatus === "restricted") {
            await supabaseClient.from("notifications").insert({
              recipient_id: (profile as { id: string }).id,
              channel: "email",
              recipient_contact: "",
              subject: "Action Required: Payment Account",
              body: "Additional information is required for your Stripe payment account. Please complete the setup to continue receiving payouts.",
              related_type: "stripe_account",
              status: "sent",
            });
          }
        }
        break;
      }

      case "payout.paid": {
        const payout = event.data.object;
        const stripePayoutId = payout.id;

        // Update the payout record
        const { data: payoutRecord } = await supabaseClient
          .from("payouts")
          .select("id, driver_id")
          .eq("stripe_payout_id", stripePayoutId)
          .maybeSingle();

        if (payoutRecord) {
          const pr = payoutRecord as { id: string; driver_id: string };
          await supabaseClient
            .from("payouts")
            .update({ status: "paid", paid_at: new Date().toISOString() })
            .eq("id", pr.id);

          await supabaseClient.from("notifications").insert({
            recipient_id: pr.driver_id,
            channel: "email",
            recipient_contact: "",
            subject: "Payout Completed",
            body: `Your payout of $${(payout.amount / 100).toFixed(2)} has been deposited to your account.`,
            related_type: "payout",
            related_id: pr.id,
            status: "sent",
          });
        }
        break;
      }

      case "payout.failed": {
        const payout = event.data.object;
        const stripePayoutId = payout.id;

        const { data: payoutRecord } = await supabaseClient
          .from("payouts")
          .select("id, driver_id")
          .eq("stripe_payout_id", stripePayoutId)
          .maybeSingle();

        if (payoutRecord) {
          const pr = payoutRecord as { id: string; driver_id: string };
          await supabaseClient
            .from("payouts")
            .update({ status: "failed" })
            .eq("id", pr.id);

          await supabaseClient.from("notifications").insert({
            recipient_id: pr.driver_id,
            channel: "email",
            recipient_contact: "",
            subject: "Payout Failed",
            body: `Your payout of $${(payout.amount / 100).toFixed(2)} could not be processed. Please check your bank details in your Stripe account.`,
            related_type: "payout",
            related_id: pr.id,
            status: "failed",
          });
        }
        break;
      }

      case "transfer.created": {
        const transfer = event.data.object;
        const transferId = transfer.id;

        // Update the payment record with the transfer ID if we have a metadata link
        const paymentId = transfer.metadata?.payment_id;
        if (paymentId) {
          await supabaseClient
            .from("payments")
            .update({ stripe_transfer_id: transferId })
            .eq("id", paymentId);
        }

        // Record the transfer as a payout
        const { data: profile } = await supabaseClient
          .from("profiles")
          .select("id")
          .eq("stripe_account_id", transfer.destination)
          .maybeSingle();

        if (profile) {
          const p = profile as { id: string };
          const { data: existingPayout } = await supabaseClient
            .from("payouts")
            .select("id")
            .eq("stripe_transfer_id", transferId)
            .maybeSingle();

          if (!existingPayout) {
            await supabaseClient.from("payouts").insert({
              driver_id: p.id,
              payment_id: paymentId || null,
              amount: transfer.amount / 100,
              status: "pending",
              stripe_transfer_id: transferId,
              type: "automatic",
              scheduled_at: new Date().toISOString(),
            });
          }
        }
        break;
      }

      case "payment_intent.succeeded": {
        // Backup handler: if checkout.session.completed failed to update the
        // payment (e.g. due to a trigger error that has since been fixed),
        // this event gives us a second chance to mark it paid.
        const intent = event.data.object;
        const paymentIdFromMeta = intent.metadata?.payment_id as string | undefined;
        if (paymentIdFromMeta) {
          const update: Record<string, unknown> = {
            status: "paid",
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: intent.id,
          };
          const latestCharge = intent.latest_charge as string | undefined;
          if (latestCharge) update.stripe_charge_id = latestCharge;

          await supabaseClient
            .from("payments")
            .update(update)
            .eq("id", paymentIdFromMeta)
            .eq("status", "pending");
        }
        break;
      }

      default:
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── Helper: Release payment to driver via Stripe Connect transfer ──────
async function releasePaymentToDriver(
  supabaseClient: ReturnType<typeof createClient>,
  stripeSecretKey: string,
  paymentId: string,
  payment: { driver_id: string; driver_payout: string },
) {
  // Check if this payment used a destination charge — if so, the transfer
  // already happened automatically at charge time, so we just mark it released.
  const { data: payRecord } = await supabaseClient
    .from("payments")
    .select("stripe_destination_charge, stripe_transfer_id")
    .eq("id", paymentId)
    .maybeSingle();

  const payData = payRecord as { stripe_destination_charge: boolean | null; stripe_transfer_id: string | null } | null;

  // Mark payment as released
  await supabaseClient
    .from("payments")
    .update({ status: "released", released_at: new Date().toISOString() })
    .eq("id", paymentId);

  // If a destination charge was used, the funds were already routed to the
  // driver's connected account at checkout time — no manual transfer needed.
  if (payData?.stripe_destination_charge) {
    return;
  }

  // Get driver's Stripe Connect account
  const { data: driver } = await supabaseClient
    .from("profiles")
    .select("stripe_account_id, stripe_payouts_enabled, stripe_account_status")
    .eq("id", payment.driver_id)
    .maybeSingle();

  if (!driver) return;
  const d = driver as { stripe_account_id: string | null; stripe_payouts_enabled: boolean; stripe_account_status: string };

  // Only create transfer if driver has a connected Stripe account with payouts enabled
  if (d.stripe_account_id && d.stripe_payouts_enabled) {
    const amountCents = Math.round(Number(payment.driver_payout) * 100);

    const transferBody = new URLSearchParams({
      amount: String(amountCents),
      currency: "usd",
      destination: d.stripe_account_id,
      "metadata[payment_id]": paymentId,
      "metadata[driver_id]": payment.driver_id,
    });

    const transferRes = await fetch("https://api.stripe.com/v1/transfers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: transferBody,
    });
    const transferData = await transferRes.json();

    if (transferData.id) {
      await supabaseClient
        .from("payments")
        .update({ stripe_transfer_id: transferData.id })
        .eq("id", paymentId);
    }
  }
}

// ─── Verify Stripe webhook signature ─────────────────────────────────────
async function verifyStripeEvent(
  body: string,
  signature: string,
  secret: string,
): Promise<{ id: string; type: string; data: { object: Record<string, unknown> } } | null> {
  try {
    const sigParts = signature.split(",").reduce((acc, part) => {
      const [key, value] = part.split("=");
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    const timestamp = sigParts["t"];
    const sig = sigParts["v1"];

    if (!timestamp || !sig) return null;

    const age = Math.floor(Date.now() / 1000) - parseInt(timestamp);
    if (age > 300) return null;

    const signedPayload = `${timestamp}.${body}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const expectedSig = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(signedPayload),
    );
    const expectedHex = Array.from(new Uint8Array(expectedSig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (expectedHex !== sig) return null;

    return JSON.parse(body);
  } catch {
    return null;
  }
}
