import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

type AppUserRow = { app_role: string };

type BodyIn = {
  action?: unknown;
  input?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  placeId?: unknown;
  /** "food" (default) = ristoranti/bar; "geo" = città / province / regioni per centro ricerca */
  autocompleteMode?: unknown;
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function clip(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}

function numField(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function strField(v: unknown, max: number): string {
  const t = String(v ?? "").trim();
  return clip(t, max);
}

/** Stessa logica di search-vegan-restaurants per note/etichetta. */
function classifyForNotes(types: string[] | undefined, name: string): { label: string; notes: string } {
  const t = new Set(types ?? []);
  const plantName = /vegan|veggie|veg\b|plant|flower|bio\s*veget|vegetal/i.test(name);

  const meat = new Set([
    "steak_house",
    "barbecue_restaurant",
    "hamburger_restaurant",
    "hot_dog_restaurant",
    "seafood_restaurant",
    "chicken_restaurant",
    "rotisserie_chicken_restaurant",
    "sushi_restaurant",
  ]);
  if ([...meat].some((x) => t.has(x)) && !t.has("vegan_restaurant") && !plantName) {
    return { label: "Locale · verifica opzioni vegane", notes: "Scheda Google Maps" };
  }
  let label = "Scheda Google Maps · verifica opzioni vegane";
  if (t.has("vegan_restaurant")) label = "100% vegano";
  else if (t.has("vegetarian_restaurant")) label = "Vegetariano · molte opzioni vegane";
  else if (
    [
      "indian_restaurant",
      "middle_eastern_restaurant",
      "thai_restaurant",
      "ethiopian_restaurant",
      "vietnamese_restaurant",
      "mediterranean_restaurant",
      "greek_restaurant",
      "lebanese_restaurant",
      "japanese_restaurant",
      "korean_restaurant",
      "mexican_restaurant",
    ].some((x) => t.has(x))
  ) {
    label = "Spesso molte opzioni vegane (cucina etnica)";
  } else if (t.has("cafe") || t.has("coffee_shop") || t.has("bar") || t.has("bakery")) {
    label = "Bar / caffè · verifica opzioni vegane";
  } else if (
    t.has("pizza_restaurant") ||
    t.has("fast_food_restaurant") ||
    t.has("meal_takeaway") ||
    t.has("italian_restaurant")
  ) {
    label = "Controlla menu / opzioni vegane";
  } else if (t.has("restaurant") || t.has("food")) {
    label = "Ristorante · verifica opzioni vegane";
  }

  const TYPE_LABELS: Record<string, string> = {
    vegan_restaurant: "Ristorante vegano",
    vegetarian_restaurant: "Ristorante vegetariano",
    indian_restaurant: "Cucina indiana",
    italian_restaurant: "Cucina italiana",
    meal_takeaway: "Asporto",
    restaurant: "Ristorante",
    cafe: "Bar / caffè",
    bakery: "Panificio",
    food: "Food",
  };
  const typeLine = (types ?? [])
    .filter((x) => x !== "point_of_interest" && x !== "establishment")
    .slice(0, 4)
    .map((x) => TYPE_LABELS[x] ?? x.replace(/_/g, " "))
    .join(" · ");
  const notes = typeLine ? clip(`${label} · ${typeLine}`, 500) : label;
  return { label, notes };
}

async function requireUser(
  authHeader: string | null,
  supabaseUrl: string,
  supabaseAnonKey: string,
): Promise<Response | { user: { id: string } }> {
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Accesso non autorizzato" }, 401);
  }
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return jsonResponse({ error: "Sessione non valida" }, 401);
  }
  const { data: appRow, error: appErr } = await supabase
    .from("app_user")
    .select("app_role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (appErr || !appRow) {
    return jsonResponse({ error: "Profilo app non trovato" }, 403);
  }
  const role = String((appRow as AppUserRow).app_role ?? "").trim();
  if (!role) {
    return jsonResponse({ error: "Profilo app non valido" }, 403);
  }
  return { user };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Metodo non consentito" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: "Configurazione Supabase mancante" }, 500);
  }

  const placesKey =
    Deno.env.get("GOOGLE_PLACES_API_KEY")?.trim() ||
    Deno.env.get("GOOGLE_MAPS_API_KEY")?.trim();
  if (!placesKey) {
    return jsonResponse(
      {
        error:
          "Configura GOOGLE_PLACES_API_KEY sul progetto Supabase.",
      },
      500,
    );
  }

  let body: BodyIn;
  try {
    body = (await req.json()) as BodyIn;
  } catch {
    return jsonResponse({ error: "Body JSON non valido" }, 400);
  }

  const authHeader = req.headers.get("Authorization");
  const auth = await requireUser(authHeader, supabaseUrl, supabaseAnonKey);
  if (auth instanceof Response) return auth;

  const action = strField(body.action, 32);
  if (action === "autocomplete") {
    const input = strField(body.input, 200);
    if (input.length < 2) {
      return jsonResponse({ suggestions: [] });
    }
    const lat = numField(body.latitude);
    const lng = numField(body.longitude);
    const modeRaw = strField(body.autocompleteMode, 16).toLowerCase();
    const geoMode = modeRaw === "geo";

    const payload: Record<string, unknown> = {
      input,
      languageCode: "it",
      regionCode: "IT",
      includedPrimaryTypes: geoMode
        ? [
          "locality",
          "administrative_area_level_3",
          "administrative_area_level_2",
          "administrative_area_level_1",
        ]
        : [
          "restaurant",
          "cafe",
          "bar",
          "bakery",
          "meal_takeaway",
        ],
    };
    if (lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      payload.locationBias = {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: 50000,
        },
      };
    }

    const res = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": placesKey,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.place,suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const t = await res.text();
      console.error("autocomplete error", res.status, t);
      return jsonResponse({ error: "Ricerca Google non disponibile. Riprova.", suggestions: [] }, 502);
    }

    const data = (await res.json()) as {
      suggestions?: Array<{
        placePrediction?: {
          place?: string;
          placeId?: string;
          text?: { text?: string };
          structuredFormat?: {
            mainText?: { text?: string };
            secondaryText?: { text?: string };
          };
        };
      }>;
    };

    const suggestions = (data.suggestions ?? [])
      .map((s) => {
        const p = s.placePrediction;
        if (!p?.placeId) return null;
        const main = p.structuredFormat?.mainText?.text ?? p.text?.text ?? "";
        const secondary = p.structuredFormat?.secondaryText?.text ?? "";
        return {
          placeId: p.placeId,
          placeResourceName: p.place ?? `places/${p.placeId}`,
          mainText: clip(main, 200),
          secondaryText: clip(secondary, 300),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);

    return jsonResponse({ suggestions });
  }

  if (action === "details") {
    const placeId = strField(body.placeId, 512);
    if (!placeId) {
      return jsonResponse({ error: "placeId richiesto" }, 400);
    }

    const resource = placeId.startsWith("places/") ? placeId : `places/${placeId}`;
    const idPart = resource.startsWith("places/") ? resource.slice("places/".length) : resource;
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(idPart)}`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": placesKey,
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,location,googleMapsUri,types,rating,userRatingCount",
      },
    });

    if (!res.ok) {
      const t = await res.text();
      console.error("place details error", res.status, t);
      return jsonResponse({ error: "Dettaglio luogo non disponibile." }, 502);
    }

    const p = (await res.json()) as {
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      googleMapsUri?: string;
      types?: string[];
      rating?: number;
      userRatingCount?: number;
    };

    const displayName =
      typeof p.displayName?.text === "string" ? clip(p.displayName.text.trim(), 200) : "Senza nome";
    const address = clip((p.formattedAddress ?? "").trim(), 400);
    const mapsUrl = clip((p.googleMapsUri ?? "").trim(), 2000);
    const lat = p.location?.latitude;
    const lng = p.location?.longitude;
    const types = Array.isArray(p.types) ? p.types : [];
    const { label, notes } = classifyForNotes(types, displayName);

    const googleRating =
      typeof p.rating === "number" && p.rating >= 0 && p.rating <= 5 ? p.rating : null;
    const googleReviewCount =
      typeof p.userRatingCount === "number" && p.userRatingCount >= 0
        ? Math.round(p.userRatingCount)
        : null;

    return jsonResponse({
      placeId: p.id ?? placeId,
      name: displayName,
      address,
      mapsUrl,
      latitude: lat ?? null,
      longitude: lng ?? null,
      types,
      categoryLabel: label,
      notes,
      googleRating,
      googleReviewCount,
    });
  }

  return jsonResponse({ error: "action non valida (autocomplete | details)" }, 400);
});
