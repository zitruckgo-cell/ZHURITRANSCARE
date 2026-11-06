import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function stripeErrorBody(res: Record<string, unknown>): { message: string; code: string | null } {
  const err = res.error as Record<string, unknown> | undefined;
  const message = (err?.message as string) || "Unknown Stripe error";
  const code = (err?.code as string) || null;
  return { message, code };
}

function userFriendlyMessage(stripeMsg: string): string {
  if (stripeMsg.includes("Only Stripe Connect platforms can work with other accounts")) {
    return "Stripe Connect is not yet set up for this platform. Please contact support to activate driver payouts.";
  }
  if (stripeMsg.includes("account_create_activation_required")) {
    return "Your platform account needs to be activated with Stripe before drivers can set up payouts. Please contact support.";
  }
  if (stripeMsg.includes("connect_identity_not_verified")) {
    return "Your platform is not yet verified with Stripe. Please complete platform setup before drivers can set up payouts.";
  }
  if (stripeMsg.includes("connect_profile_not_submitted")) {
    return "Platform profile is not complete. Please contact support to finish Stripe setup.";
  }
  return stripeMsg;
}

function isConnectNotEnabled(data: Record<string, unknown>): boolean {
  const err = data.error as Record<string, unknown> | undefined;
  const msg = (err?.message as string) || "";
  return msg.includes("Only Stripe Connect platforms can work with other accounts");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeSecretKey) {
    return new Response(JSON.stringify({ error: "Stripe is not configured. Please contact support." }), {
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Please sign in to continue." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Your session has expired. Please sign in again." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;
    const userEmail = userData.user.email || "";

    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not found. Please contact support." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isDriver = (profile.roles || []).includes("driver");
    if (!isDriver) {
      return new Response(JSON.stringify({ error: "Only drivers can set up payouts." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || "status";

    const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/[^/]*$/, "") || "https://zhuritranscare.bolt.host";

    // ─── Create or retrieve Stripe Connect account (v1 API) ──────
    if (action === "create_account") {
      let accountId = profile.stripe_account_id;

      if (!accountId) {
        const accountName = profile.full_name || userEmail;

        const accountParams = new URLSearchParams();
        accountParams.append("type", "express");
        accountParams.append("country", "US");
        accountParams.append("email", userEmail);
        if (accountName) accountParams.append("business_profile[name]", accountName);
        accountParams.append("capabilities[transfers][requested]", "true");
        accountParams.append("metadata[supabase_user_id]", userId);

        const accountRes = await fetch("https://api.stripe.com/v1/accounts", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: accountParams,
        });
        const accountData = await accountRes.json() as Record<string, unknown>;

        if (!accountData.id) {
          const { message } = stripeErrorBody(accountData);
          console.error("Stripe account creation error:", JSON.stringify(accountData));
          return new Response(JSON.stringify({
            error: userFriendlyMessage(message),
          }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        accountId = accountData.id as string;
        await supabaseClient
          .from("profiles")
          .update({ stripe_account_id: accountId, stripe_account_status: "pending" })
          .eq("id", userId);
      }

      // Create v1 account link for onboarding
      const linkParams = new URLSearchParams();
      linkParams.append("account", accountId);
      linkParams.append("type", "account_onboarding");
      linkParams.append("return_url", `${origin}/?stripe=return&portal=driver`);
      linkParams.append("refresh_url", `${origin}/?stripe=refresh&portal=driver`);

      const linkRes = await fetch("https://api.stripe.com/v1/account_links", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: linkParams,
      });
      const linkData = await linkRes.json() as Record<string, unknown>;

      if (!linkData.url) {
        const { message, code } = stripeErrorBody(linkData);
        console.error("Stripe account link error:", JSON.stringify(linkData));
        return new Response(JSON.stringify({
          error: userFriendlyMessage(message),
          stripe_error_code: code,
          stripe_raw: JSON.stringify(linkData).slice(0, 500),
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ url: linkData.url }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Create login link for updating payment info ────────────
    if (action === "login_link") {
      if (!profile.stripe_account_id) {
        return new Response(JSON.stringify({ error: "No payment account found. Please set up payments first." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const linkParams = new URLSearchParams();
      linkParams.append("account", profile.stripe_account_id);
      linkParams.append("type", "account_onboarding");
      linkParams.append("return_url", `${origin}/?stripe=return&portal=driver`);
      linkParams.append("refresh_url", `${origin}/?stripe=refresh&portal=driver`);

      const linkRes = await fetch("https://api.stripe.com/v1/account_links", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: linkParams,
      });
      const linkData = await linkRes.json() as Record<string, unknown>;

      if (!linkData.url) {
        const { message, code } = stripeErrorBody(linkData);
        console.error("Stripe login link error:", JSON.stringify(linkData));
        return new Response(JSON.stringify({
          error: userFriendlyMessage(message),
          stripe_error_code: code,
          stripe_raw: JSON.stringify(linkData).slice(0, 500),
        }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ url: linkData.url }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Get account status (v1 API) ────────────────────────────
    if (action === "status") {
      if (!profile.stripe_account_id) {
        return new Response(JSON.stringify({
          stripe_account_id: null,
          stripe_account_status: "not_set_up",
          stripe_onboarding_complete: false,
          stripe_charges_enabled: false,
          stripe_payouts_enabled: false,
          stripe_requirements_status: "pending",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accountRes = await fetch(
        `https://api.stripe.com/v1/accounts/${profile.stripe_account_id}`,
        { headers: { Authorization: `Bearer ${stripeSecretKey}` } },
      );
      const accountData = await accountRes.json() as Record<string, unknown>;

      if (!accountData.id) {
        const { message } = stripeErrorBody(accountData);
        console.error("Stripe account status error:", JSON.stringify(accountData));

        if (isConnectNotEnabled(accountData)) {
          return new Response(JSON.stringify({
            stripe_account_id: profile.stripe_account_id,
            stripe_account_status: profile.stripe_account_status || "pending",
            stripe_onboarding_complete: profile.stripe_onboarding_complete ?? false,
            stripe_charges_enabled: profile.stripe_charges_enabled ?? false,
            stripe_payouts_enabled: profile.stripe_payouts_enabled ?? false,
            stripe_requirements_status: profile.stripe_requirements_status || "pending",
            stripe_payout_schedule: profile.stripe_payout_schedule || "automatic",
            connect_not_enabled: true,
          }), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify({ error: userFriendlyMessage(message) }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const chargesEnabled = (accountData.charges_enabled as boolean) ?? false;
      const payoutsEnabled = (accountData.payouts_enabled as boolean) ?? false;
      const payoutsSchedule = (accountData.payout_schedule as Record<string, unknown> | undefined)?.delay_days ?? 0;
      const reqs = (accountData.requirements as Record<string, unknown> | undefined) ?? {};
      const requirementsCurrentlyDue = (reqs.currently_due as unknown[]) ?? [];
      const requirementsEventuallyDue = (reqs.eventually_due as unknown[]) ?? [];
      const disabledReason = (reqs.disabled_reason as string) ?? null;

      const requirementsStatus = requirementsCurrentlyDue.length > 0
        ? "restricted"
        : ((chargesEnabled && payoutsEnabled) ? "verified" : "pending");

      const onboardingComplete = requirementsCurrentlyDue.length === 0;
      const isActive = chargesEnabled && payoutsEnabled;

      let accountStatus = "pending";
      if (isActive) accountStatus = "active";
      else if (disabledReason) accountStatus = "restricted";
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
        .eq("id", userId);

      return new Response(JSON.stringify({
        stripe_account_id: profile.stripe_account_id,
        stripe_account_status: accountStatus,
        stripe_onboarding_complete: onboardingComplete,
        stripe_charges_enabled: chargesEnabled,
        stripe_payouts_enabled: payoutsEnabled,
        stripe_requirements_status: requirementsStatus,
        stripe_payout_schedule: profile.stripe_payout_schedule || "automatic",
        requirements_currently_due: requirementsCurrentlyDue,
        requirements_eventually_due: requirementsEventuallyDue,
        disabled_reason: disabledReason,
        payouts_schedule_delay_days: payoutsSchedule,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Get earnings summary ───────────────────────────────────
    if (action === "earnings") {
      const { data: payments, error: paymentsError } = await supabaseClient
        .from("payments")
        .select("id, status, driver_payout, gross_amount, commission_amount, created_at, released_at, paid_at, delivery:deliveries(pickup_city, delivery_city, delivered_time)")
        .eq("driver_id", userId)
        .order("created_at", { ascending: false });

      if (paymentsError) {
        console.error("Earnings payments query error:", paymentsError.message);
      }

      const { data: payouts, error: payoutsError } = await supabaseClient
        .from("payouts")
        .select("id, amount, status, type, stripe_transfer_id, stripe_payout_id, scheduled_at, paid_at, created_at, payment:payments(delivery:deliveries(pickup_city, delivery_city))")
        .eq("driver_id", userId)
        .order("created_at", { ascending: false });

      if (payoutsError) {
        console.error("Earnings payouts query error:", payoutsError.message);
      }

      const allPayments = (payments as Record<string, unknown>[]) || [];
      const allPayouts = (payouts as Record<string, unknown>[]) || [];

      const releasedPayments = allPayments.filter((p) => p.status === "released");
      const pendingPayments = allPayments.filter((p) => p.status === "paid");
      const availableEarnings = releasedPayments.reduce((sum, p) => sum + Number(p.driver_payout), 0);
      const pendingEarnings = pendingPayments.reduce((sum, p) => sum + Number(p.driver_payout), 0);
      const totalEarnings = allPayments
        .filter((p) => p.status === "released" || p.status === "paid")
        .reduce((sum, p) => sum + Number(p.driver_payout), 0);
      const completedTrips = releasedPayments.length;

      return new Response(JSON.stringify({
        available_earnings: availableEarnings,
        pending_earnings: pendingEarnings,
        total_earnings: totalEarnings,
        completed_trips: completedTrips,
        recent_payments: allPayments.slice(0, 10),
        payout_history: allPayouts,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Request instant/manual payout ──────────────────────────
    if (action === "request_payout") {
      if (!profile.stripe_account_id) {
        return new Response(JSON.stringify({ error: "Please set up your payment account first." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check payout capability using v1 API
      const accountRes = await fetch(
        `https://api.stripe.com/v1/accounts/${profile.stripe_account_id}`,
        { headers: { Authorization: `Bearer ${stripeSecretKey}` } },
      );
      const accountData = await accountRes.json() as Record<string, unknown>;
      const payoutsEnabled = (accountData.payouts_enabled as boolean) ?? false;

      if (!payoutsEnabled) {
        return new Response(JSON.stringify({ error: "Payouts are not yet enabled on your account. Please complete your Stripe onboarding first." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Query the DRIVER's connected account balance, not the platform balance.
      const balanceRes = await fetch(
        "https://api.stripe.com/v1/balance",
        { headers: { Authorization: `Bearer ${stripeSecretKey}`, "Stripe-Account": profile.stripe_account_id } },
      );
      const balanceData = await balanceRes.json() as Record<string, unknown>;
      const availableArr = (balanceData.available as Record<string, string>[]) ?? [];
      const available = availableArr.find((b) => b.currency === "usd")?.amount ?? 0;

      if (Number(available) <= 0) {
        return new Response(JSON.stringify({ error: "No available balance to pay out yet." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const payoutType = body.payout_type === "instant" ? "instant" : "manual";
      const payoutParams = new URLSearchParams();
      payoutParams.append("amount", String(available));
      payoutParams.append("currency", "usd");
      payoutParams.append("method", payoutType === "instant" ? "instant" : "standard");

      // Create the payout on the DRIVER's connected account, not the platform.
      const payoutRes = await fetch("https://api.stripe.com/v1/payouts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Stripe-Account": profile.stripe_account_id,
        },
        body: payoutParams,
      });
      const payoutData = await payoutRes.json() as Record<string, unknown>;

      if (!payoutData.id) {
        const { message } = stripeErrorBody(payoutData);
        return new Response(JSON.stringify({ error: userFriendlyMessage(message) }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await supabaseClient.from("payouts").insert({
        driver_id: userId,
        amount: Number(available) / 100,
        status: "pending",
        stripe_payout_id: payoutData.id as string,
        type: payoutType,
        scheduled_at: new Date().toISOString(),
      });

      return new Response(JSON.stringify({
        success: true,
        payout_id: payoutData.id,
        amount: Number(available) / 100,
        type: payoutType,
        arrival_date: payoutData.arrival_date,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("stripe-connect error:", err instanceof Error ? err.message : String(err));
    return new Response(JSON.stringify({
      error: "Something went wrong. Please try again or contact support if the problem persists.",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
