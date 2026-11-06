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
    const { email, password, full_name, phone, role } = await req.json();

    if (!email || !password || !full_name) {
      return new Response(JSON.stringify({ error: "Missing required fields: email, password, full_name" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (password.length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminRole = role || "admin";

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // Verify the caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: callerData } = await supabaseClient.auth.getUser(token);
    const callerId = callerData?.user?.id;
    if (!callerId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: callerAdmin } = await supabaseClient
      .from("admin_users")
      .select("id, is_active")
      .eq("id", callerId)
      .eq("is_active", true)
      .maybeSingle();
    if (!callerAdmin) {
      return new Response(JSON.stringify({ error: "Only admins can create admin accounts" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try to create the auth user. If they already exist, look them up
    // and add the admin role to their existing account.
    const { data: newUser, error: createError } = await supabaseClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, phone, roles: [adminRole] },
    });

    let userId: string;
    let existingUser = false;

    if (createError) {
      if (createError.message.toLowerCase().includes("already been registered") || createError.message.toLowerCase().includes("already exists")) {
        const { data: listData, error: listError } = await supabaseClient.auth.admin.listUsers();
        if (listError || !listData?.users) {
          return new Response(JSON.stringify({ error: "An account with this email already exists, but we could not locate it." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const found = listData.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (!found) {
          return new Response(JSON.stringify({ error: "An account with this email already exists, but we could not locate it." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        userId = found.id;
        existingUser = true;
      } else {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (newUser.user) {
      userId = newUser.user.id;
    } else {
      return new Response(JSON.stringify({ error: "Failed to create user" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert admin_users row (idempotent — ON CONFLICT DO NOTHING)
    const { error: adminError } = await supabaseClient
      .from("admin_users")
      .upsert({
        id: userId,
        email,
        full_name,
        role: adminRole,
        is_active: true,
      }, { onConflict: "id" });

    if (adminError) {
      console.error("admin_users upsert error:", adminError.message);
      return new Response(JSON.stringify({ error: "Failed to create admin record" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Merge admin role into the profile's roles array (idempotent)
    await new Promise((r) => setTimeout(r, existingUser ? 100 : 300));
    const { data: existingProfile } = await supabaseClient
      .from("profiles")
      .select("roles")
      .eq("id", userId)
      .maybeSingle();

    const existingRoles: string[] = (existingProfile?.roles as string[]) || [];
    const mergedRoles = Array.from(new Set([...existingRoles, adminRole]));

    await supabaseClient
      .from("profiles")
      .upsert({
        id: userId,
        full_name,
        phone: phone || "",
        roles: mergedRoles,
      }, { onConflict: "id" });

    return new Response(JSON.stringify({ success: true, user_id: userId, existing_user: existingUser }), {
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
