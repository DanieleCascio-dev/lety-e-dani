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
  latitude?: unknown;
  longitude?: unknown;
  radiusKm?: unknown;
  /**
   * Se true:
   * - solo risultati classificati da Google come vegan/vegetarian (nessun fallback da nome)
   * - query Places senza le ricerche su cafe
   */
  strict?: unknown;
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

function boolField(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
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
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const TYPE_LABELS: Record<string, string> = {
  vegan_restaurant: "Ristorante vegano",
  vegetarian_restaurant: "Ristorante vegetariano",
  restaurant: "Ristorante",
  cafe: "Bar / caffè",
  coffee_shop: "Caffetteria",
  bakery: "Panificio",
  meal_delivery: "Consegna",
  meal_takeaway: "Asporto",
  food: "Food",
  pizza_restaurant: "Pizzeria",
  fast_food_restaurant: "Fast food",
  indian_restaurant: "Cucina indiana",
  italian_restaurant: "Cucina italiana",
};

const DISPLAYABLE_TYPES = new Set([
  "vegan_restaurant",
  "vegetarian_restaurant",
  "restaurant",
  "cafe",
  "coffee_shop",
  "bakery",
  "meal_delivery",
  "meal_takeaway",
  "food",
  "pizza_restaurant",
  "fast_food_restaurant",
  "indian_restaurant",
  "italian_restaurant",
]);

/**
 * Tipi Google che suggeriscono un locale principalmente orientato a carne/pesce.
 * Esclusi salvo classificazione esplicita vegan/vegetarian da Google.
 */
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

/**
 * Tipi compatibili con il fallback dal nome: serve un contesto “dove si mangia”.
 */
const FOODISH_TYPES = new Set([
  "restaurant",
  "cafe",
  "coffee_shop",
  "bakery",
  "meal_takeaway",
  "meal_delivery",
  "food",
  "pizza_restaurant",
  "fast_food_restaurant",
]);

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/**
 * Segnali chiari plant-based nel nome.
 * Evita termini rumorosi come "plant" da solo, "flower", "veg" troppo corto.
 */
function nameSuggestsPlantBased(name: string): boolean {
  const n = normalizeText(name);

  if (/\bplant[-\s]+based\b/.test(n)) return true;
  if (/\bvegan(?:o|a|i|e)?\b/.test(n)) return true;
  if (
    /\bvegetarian\b/.test(n) ||
    /\bvegetariano\b/.test(n) ||
    /\bvegetariana\b/.test(n)
  ) {
    return true;
  }
  if (/\bveggie\b/.test(n)) return true;

  return false;
}

/**
 * Nome molto “carne/pesce first”; non si applica se il nome ha già segnali veg forti
 * (gestito dall’ordine in classifyPlace).
 */
function nameSuggestsNonPlantPrimary(name: string): boolean {
  const n = normalizeText(name);
  return /\b(burger|steak|grill|bbq|barbecue|sushi|kebab|pollo|chicken|fish|seafood|meat)\b/.test(
    n,
  );
}

function hasFoodishType(types: string[] | undefined): boolean {
  return (types ?? []).some((t) => FOODISH_TYPES.has(t));
}

type ClassifyResult = {
  exclude: boolean;
  /**
   * 0 = vegan Google
   * 1 = vegetarian Google
   * 2 = fallback nome + tipo food-related
   * 99 = escluso
   */
  sortTier: number;
  categoryLabel: string;
};

/**
 * Regole restrittive:
 * - Includi se Google indica vegan_restaurant o vegetarian_restaurant (prima dei filtri carne sul tipo).
 * - Escludi tipi carne/pesce-first senza classificazione vegan/veg Google.
 * - Fallback nome solo se segnali plant-based chiari E tipi food-compatibili (prima del filtro nome “carne”).
 * - Altrimenti escludi nomi che sembrano chiaramente non plant-first.
 */
function classifyPlace(types: string[] | undefined, name: string): ClassifyResult {
  const t = new Set(types ?? []);
  const hasVegan = t.has("vegan_restaurant");
  const hasVegetarian = t.has("vegetarian_restaurant");

  const meatFishForward = [...MEAT_OR_FISH_FORWARD_TYPES].some((x) => t.has(x));
  if (meatFishForward && !hasVegan && !hasVegetarian) {
    return { exclude: true, sortTier: 99, categoryLabel: "" };
  }

  if (hasVegan) {
    return { exclude: false, sortTier: 0, categoryLabel: "100% vegano" };
  }

  if (hasVegetarian) {
    return { exclude: false, sortTier: 1, categoryLabel: "Vegetariano" };
  }

  if (nameSuggestsPlantBased(name) && hasFoodishType(types)) {
    return {
      exclude: false,
      sortTier: 2,
      categoryLabel: "Segnali da nome (verifica su Maps)",
    };
  }

  if (nameSuggestsNonPlantPrimary(name)) {
    return { exclude: true, sortTier: 99, categoryLabel: "" };
  }

  return { exclude: true, sortTier: 99, categoryLabel: "" };
}

function typesToShortNote(types: string[] | undefined): string {
  if (!types?.length) return "";
  const labels = types
    .filter((x) =>
      x !== "point_of_interest" &&
      x !== "establishment" &&
      DISPLAYABLE_TYPES.has(x)
    )
    .slice(0, 4)
    .map((x) => TYPE_LABELS[x] ?? x.replace(/_/g, " "));
  return clip(labels.join(" · "), 400);
}

/** Query strette; in default si aggiungono cafe per coprire caffetterie veg (non in strict). */
const TEXT_QUERIES_DEFAULT = [
  "vegan restaurant",
  "ristorante vegano",
  "vegetarian restaurant",
  "ristorante vegetariano",
  "vegan cafe",
  "caffetteria vegana",
] as const;

const TEXT_QUERIES_STRICT = [
  "vegan restaurant",
  "ristorante vegano",
  "vegetarian restaurant",
  "ristorante vegetariano",
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
    const errText = await res.text();
    console.error("Places searchText error", textQuery, res.status, errText);
    return [];
  }

  const data = (await res.json()) as { places?: GPlace[] };
  return Array.isArray(data.places) ? data.places : [];
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
  const strict = boolField(body.strict);

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

  const textQueries = strict ? TEXT_QUERIES_STRICT : TEXT_QUERIES_DEFAULT;

  const batch = await Promise.all(
    textQueries.map((q) => searchTextOnce(placesKey, q, lat, lng, radiusM)),
  );

  const byId = new Map<string, GPlace>();
  for (const group of batch) {
    for (const p of group) {
      const id = p.id;
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, p);
    }
  }

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

    if (strict && sortTier > 1) {
      continue;
    }

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

  /**
   * Ordine: sortTier → rating ↓ → distanza ↑ → recensioni ↓
   */
  enriched.sort((a, b) => {
    if (a.sortTier !== b.sortTier) return a.sortTier - b.sortTier;
    const ra = a.rating ?? -1;
    const rb = b.rating ?? -1;
    if (rb !== ra) return rb - ra;
    if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
    const ca = a.userRatingCount ?? 0;
    const cb = b.userRatingCount ?? 0;
    return cb - ca;
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
      ? strict
        ? "Nessun locale trovato nel raggio con la modalità strict. Prova ad aumentare i chilometri o disattivare strict per includere anche i fallback dal nome e le query su cafe."
        : "Nessun locale trovato nel raggio con i criteri attuali. Prova ad aumentare i chilometri."
      : strict
      ? "Modalità strict: solo locali classificati da Google come vegan o vegetariano (nessun fallback da nome). Ordine: vegan → vegetariano, poi stelle, distanza e numero recensioni. Orari e menu: verifica sempre su Maps."
      : "Filtro restrittivo: priorità ai locali classificati da Google come vegan o vegetariano; fallback solo se il nome ha segnali plant-based chiari e il tipo è compatibile (food). Tipi carne/pesce-first esclusi senza vegan/veg Google. Ordine: tipo, stelle, distanza, recensioni. Orari e menu: verifica sempre su Maps.";

  return jsonResponse({
    restaurants,
    modelNote,
  });
});
