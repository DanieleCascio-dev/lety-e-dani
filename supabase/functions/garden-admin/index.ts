import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Body = {
  action?: unknown;
  name?: unknown;
  gardenId?: unknown;
  userId?: unknown;
  appRole?: unknown;
  email?: unknown;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Metodo non consentito" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Accesso non autorizzato" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse({ error: "Configurazione Supabase mancante" }, 500);
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return jsonResponse({ error: "Body JSON non valido" }, 400);
  }

  const action = typeof body.action === "string" ? body.action.trim() : "";
  if (!action) {
    return jsonResponse({ error: "action mancante" }, 400);
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    return jsonResponse({ error: "Sessione non valida" }, 401);
  }

  const adminDb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: appRow, error: appErr } = await adminDb
    .from("app_user")
    .select("power_admin")
    .eq("user_id", user.id)
    .maybeSingle();

  if (appErr || !appRow || !(appRow as { power_admin?: boolean }).power_admin) {
    return jsonResponse({ error: "Non autorizzato (Gestione Garden)" }, 403);
  }

  try {
    switch (action) {
      case "listGardens": {
        const { data, error } = await adminDb
          .from("garden")
          .select("id, name, created_at")
          .order("created_at", { ascending: true });
        if (error) throw error;
        return jsonResponse({ ok: true, gardens: data ?? [] });
      }

      case "listMembers": {
        const gardenId =
          typeof body.gardenId === "string" ? body.gardenId.trim() : "";
        if (!gardenId) {
          return jsonResponse({ error: "gardenId mancante" }, 400);
        }
        const { data, error } = await adminDb
          .from("garden_member")
          .select("garden_id, user_id, joined_at")
          .eq("garden_id", gardenId);
        if (error) throw error;
        return jsonResponse({ ok: true, members: data ?? [] });
      }

      case "listAuthUsers": {
        const { data, error } = await adminDb.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        if (error) throw error;
        const users = (data?.users ?? []).map((u) => ({
          id: u.id,
          email: u.email ?? null,
          created_at: u.created_at,
        }));
        return jsonResponse({ ok: true, users });
      }

      case "listAppUsers": {
        const { data, error } = await adminDb
          .from("app_user")
          .select("user_id, app_role, power_admin, created_at")
          .order("created_at", { ascending: true });
        if (error) throw error;
        return jsonResponse({ ok: true, appUsers: data ?? [] });
      }

      case "createGarden": {
        const name =
          typeof body.name === "string" && body.name.trim()
            ? body.name.trim().slice(0, 120)
            : "Nuovo spazio";
        const { data, error } = await adminDb
          .from("garden")
          .insert({ name })
          .select("id, name, created_at")
          .single();
        if (error) throw error;
        return jsonResponse({ ok: true, garden: data });
      }

      case "addMember": {
        const gardenId =
          typeof body.gardenId === "string" ? body.gardenId.trim() : "";
        const userId = typeof body.userId === "string" ? body.userId.trim() : "";
        if (!gardenId || !userId) {
          return jsonResponse({ error: "gardenId e userId obbligatori" }, 400);
        }
        const { error } = await adminDb.from("garden_member").insert({
          garden_id: gardenId,
          user_id: userId,
        });
        if (error) throw error;
        return jsonResponse({ ok: true });
      }

      case "removeMember": {
        const gardenId =
          typeof body.gardenId === "string" ? body.gardenId.trim() : "";
        const userId = typeof body.userId === "string" ? body.userId.trim() : "";
        if (!gardenId || !userId) {
          return jsonResponse({ error: "gardenId e userId obbligatori" }, 400);
        }
        const { error } = await adminDb
          .from("garden_member")
          .delete()
          .eq("garden_id", gardenId)
          .eq("user_id", userId);
        if (error) throw error;
        return jsonResponse({ ok: true });
      }

      case "ensureAppUser": {
        const userId = typeof body.userId === "string" ? body.userId.trim() : "";
        let appRole =
          typeof body.appRole === "string" && body.appRole.trim()
            ? body.appRole.trim().slice(0, 64)
            : "";
        if (!userId) {
          return jsonResponse({ error: "userId obbligatorio" }, 400);
        }
        if (!appRole) {
          const email =
            typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
          const local = email.includes("@") ? email.split("@")[0]! : "utente";
          appRole = local.replace(/[^a-z0-9_-]/gi, "_").slice(0, 64) || "utente";
        }
        const { error } = await adminDb.from("app_user").upsert(
          {
            user_id: userId,
            app_role: appRole,
            power_admin: false,
          },
          { onConflict: "user_id" },
        );
        if (error) throw error;
        return jsonResponse({ ok: true, appRole });
      }

      default:
        return jsonResponse({ error: `Azione sconosciuta: ${action}` }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore server";
    return jsonResponse({ error: msg }, 500);
  }
});
