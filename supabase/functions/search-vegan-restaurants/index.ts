import { createClient } from "@supabase/supabase-js";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

type AppUserRow = { app_role: string };

type BodyIn = {
  latitude?: unknown;
  longitude?: unknown;
  radiusKm?: unknown;
};

/** Risposta parziale Places API (New). */
type GPlace = {
  id?: string;
  displayName?: { text?: string } | string;
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  types?: string[];
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

function displayNameText(p: GPlace): string {
  const d = p.displayName;
  if (typeof d === "string" && d.trim()) return clip(d.trim(), 200);
  if (d && typeof d === "object" && typeof d.text === "string" && d.text.trim()) {
    return clip(d.text.trim(), 200);
  }
  return "Senza nome";
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const TYPE_LABELS: Record<string, string> = {
  vegan_restaurant: "Ristorante vegano",
  vegetarian_restaurant: "Ristorante vegetariano",
  indian_restaurant: "Cucina indiana",
  italian_restaurant: "Cucina italiana",
  meal_delivery: "Consegna",
  meal_takeaway: "Asporto",
  restaurant: "Ristorante",
  cafe: "Bar / caffè",
  bakery: "Panificio",
  food: "Food",
};

/** Tipi Google che indicano locale principalmente su carne/pesce: escludiamo salvo nome/tipo vegan. */
const MEAT_OR_FISH_FORWARD_TYPES = new Set([
  "steak_house",
  "barbecue_restaurant",
  "hamburger_restaurant",
  "hot_dog_restaurant",
  "seafood_restaurant",
  "chicken_restaurant",
  "rotisserie_chicken_restaurant",
  "sushi_restaurant",
]);

function nameSuggestsPlantBased(name: string): boolean {
  return /vegan|veggie|veg\b|plant|flower|bio\s*veget|vegetal/i.test(name);
}

type ClassifyResult = {
  exclude: boolean;
  /** Ordinamento: più basso = più in alto (prima 100% vegan). */
  sortTier: number;
  /** Etichetta breve per UI. */
  categoryLabel: string;
};

/**
 * Ordine richiesto: (1) 100% vegan, (2) vegetariano / opzioni vegane chiare,
 * (3) bar e caffè con possibili opzioni, (4) altro compatibile; esclusi i tipi “carne-first”.
 */
function classifyPlace(types: string[] | undefined, name: string): ClassifyResult {
  const t = new Set(types ?? []);
  const plantName = nameSuggestsPlantBased(name);

  if (
    [...MEAT_OR_FISH_FORWARD_TYPES].some((x) => t.has(x)) &&
    !t.has("vegan_restaurant") &&
    !plantName
  ) {
    return { exclude: true, sortTier: 99, categoryLabel: "" };
  }

  if (t.has("vegan_restaurant")) {
    return { exclude: false, sortTier: 0, categoryLabel: "100% vegano" };
  }

  if (t.has("vegetarian_restaurant")) {
    return {
      exclude: false,
      sortTier: 1,
      categoryLabel: "Vegetariano · molte opzioni vegane",
    };
  }

  const ethnicPlantFriendly = [
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
  ];
  if (ethnicPlantFriendly.some((x) => t.has(x))) {
    return {
      exclude: false,
      sortTier: 2,
      categoryLabel: "Spesso molte opzioni vegane (cucina etnica)",
    };
  }

  if (t.has("cafe") || t.has("coffee_shop") || t.has("bar") || t.has("bakery")) {
    return {
      exclude: false,
      sortTier: 3,
      categoryLabel: "Bar / caffè · verifica opzioni vegane",
    };
  }

  if (
    t.has("pizza_restaurant") ||
    t.has("fast_food_restaurant") ||
    t.has("meal_takeaway") ||
    t.has("italian_restaurant")
  ) {
    return {
      exclude: false,
      sortTier: 4,
      categoryLabel: "Controlla menu / opzioni vegane",
    };
  }

  if (t.has("restaurant") || t.has("food")) {
    return {
      exclude: false,
      sortTier: 5,
      categoryLabel: "Ristorante · verifica opzioni vegane",
    };
  }

  return {
    exclude: false,
    sortTier: 6,
    categoryLabel: "Scheda Google Maps · verifica opzioni vegane",
  };
}

function typesToShortNote(types: string[] | undefined): string {
  if (!types?.length) return "";
  const labels = types
    .filter((t) => t !== "point_of_interest" && t !== "establishment")
    .slice(0, 4)
    .map((x) => TYPE_LABELS[x] ?? x.replace(/_/g, " "));
  return clip(labels.join(" · "), 400);
}

/** Query mirate su vegano/vegetariano; niente “indian restaurant” da solo (troppi risultati carnivori). */
const TEXT_QUERIES = [
  "vegan restaurant",
  "ristorante vegano",
  "vegan bar",
  "bar vegano caffè",
  "vegetarian restaurant",
  "ristorante vegetariano",
  "cucina vegana",
  "opzioni vegane ristorante",
  "vegan food",
] as const;

const FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.googleMapsUri,places.types";

async function searchTextOnce(
  apiKey: string,
  textQuery: string,
  lat: number,
  lng: number,
  radiusM: number,
): Promise<GPlace[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK,
    },
    body: JSON.stringify({
      textQuery,
      languageCode: "it",
      regionCode: "IT",
      rankPreference: "DISTANCE",
      pageSize: 20,
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusM,
        },
      },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    console.error("Places searchText error", textQuery, res.status, t);
    return [];
  }

  const data = (await res.json()) as { places?: GPlace[] };
  return Array.isArray(data.places) ? data.places : [];
}

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
          "Configura il secret GOOGLE_PLACES_API_KEY (Places API New) sul progetto Supabase per la ricerca su Google Maps.",
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

  const lat = numField(body.latitude);
  const lng = numField(body.longitude);
  const radiusKm = numField(body.radiusKm);

  if (lat == null || lng == null || radiusKm == null) {
    return jsonResponse(
      { error: "Parametri richiesti: latitude, longitude, radiusKm" },
      400,
    );
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return jsonResponse({ error: "Coordinate non valide" }, 400);
  }
  if (radiusKm < 1 || radiusKm > 50) {
    return jsonResponse({ error: "radiusKm deve essere tra 1 e 50" }, 400);
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

  const radiusM = Math.min(radiusKm * 1000, 50_000);

  const batch = await Promise.all(
    TEXT_QUERIES.map((q) => searchTextOnce(placesKey, q, lat, lng, radiusM)),
  );

  const byId = new Map<string, GPlace>();
  for (const group of batch) {
    for (const p of group) {
      const id = p.id;
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, p);
    }
  }

  type Enriched = {
    placeId: string;
    name: string;
    address: string;
    mapsUrl: string;
    notes: string;
    categoryLabel: string;
    sortTier: number;
    latitude: number | null;
    longitude: number | null;
    rating: number | null;
    userRatingCount: number | null;
    distanceKm: number;
  };

  const enriched: Enriched[] = [];

  for (const p of byId.values()) {
    const plat = p.location?.latitude;
    const plng = p.location?.longitude;
    if (plat == null || plng == null || !Number.isFinite(plat) || !Number.isFinite(plng)) {
      continue;
    }
    const distanceKm = haversineKm(lat, lng, plat, plng);
    if (distanceKm > radiusKm + 0.5) {
      continue;
    }

    const mapsUrl = (p.googleMapsUri ?? "").trim();
    if (!mapsUrl) continue;

    const name = displayNameText(p);
    const { exclude, sortTier, categoryLabel } = classifyPlace(p.types, name);
    if (exclude) continue;

    const address = clip((p.formattedAddress ?? "").trim(), 400);
    const rating =
      typeof p.rating === "number" && p.rating >= 0 && p.rating <= 5 ? p.rating : null;
    const userRatingCount =
      typeof p.userRatingCount === "number" && p.userRatingCount >= 0
        ? Math.round(p.userRatingCount)
        : null;

    const typeLine = typesToShortNote(p.types);
    const notes = typeLine
      ? clip(`${categoryLabel} · ${typeLine}`, 500)
      : categoryLabel;

    enriched.push({
      placeId: p.id ?? "",
      name,
      address,
      mapsUrl: clip(mapsUrl, 2000),
      notes,
      categoryLabel,
      sortTier,
      latitude: plat,
      longitude: plng,
      rating,
      userRatingCount,
      distanceKm,
    });
  }

  /** Elenco: (1) dal più vicino al più lontano, (2) a parità di distanza rating Google più alto prima, (3) spareggio tipo locale (vegano prima). */
  enriched.sort((a, b) => {
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    const ra = a.rating ?? -1;
    const rb = b.rating ?? -1;
    if (rb !== ra) return rb - ra;
    return a.sortTier - b.sortTier;
  });

  const restaurants = enriched.slice(0, 35).map((r) => ({
    placeId: r.placeId,
    name: r.name,
    address: r.address,
    mapsUrl: r.mapsUrl,
    notes: r.notes,
    categoryLabel: r.categoryLabel,
    latitude: r.latitude,
    longitude: r.longitude,
    rating: r.rating,
    userRatingCount: r.userRatingCount,
    distanceKm: Math.round(r.distanceKm * 10) / 10,
  }));

  const modelNote =
    restaurants.length === 0
      ? "Nessun locale trovato nel raggio con le ricerche attuali. Prova ad aumentare i chilometri o verifica in Google Cloud che sia abilitata la «Places API (New)» per questa chiave."
      : "Risultati da Google Places, ordinati per distanza (dal più vicino), poi per valutazione stelle a parità di distanza. Le etichette tipo «100% vegano» sono informative; i tipi principalmente a base carne sono esclusi. " +
        "Orari e menu: verifica sempre su Maps.";

  return jsonResponse({
    restaurants,
    modelNote,
  });
});
