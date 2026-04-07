import { createClient } from "@supabase/supabase-js";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const MAX_HTML_BYTES = 1_500_000;
const FETCH_TIMEOUT_MS = 18_000;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function pickMeta(html: string, prop: string): string | null {
  const p = escapeRe(prop);
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${p}["'][^>]+content=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${p}["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+name=["']${p}["'][^>]+content=["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${p}["']`,
      "i",
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeHtmlEntities(m[1].trim());
  }
  return null;
}

function pickTitleTag(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m?.[1]) return null;
  return decodeHtmlEntities(m[1].replace(/<[^>]+>/g, " ").trim());
}

function resolveUrl(base: string, href: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

function extractJsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) out.push(...j);
      else out.push(j);
    } catch {
      /* ignore */
    }
  }
  return out;
}

function walkProductOffers(
  node: unknown,
  baseUrl: string,
): {
  name?: string;
  description?: string;
  image?: string;
  price?: string;
  priceCurrency?: string;
} | null {
  if (!node || typeof node !== "object") return null;
  const o = node as Record<string, unknown>;
  const types = o["@type"];
  const typeStr = Array.isArray(types)
    ? types.map(String).join(",")
    : String(types ?? "");

  if (typeStr.includes("Product") || typeStr.includes("IndividualProduct")) {
    const name = typeof o.name === "string" ? o.name : undefined;
    const description =
      typeof o.description === "string" ? o.description : undefined;
    let image: string | undefined;
    const img = o.image;
    if (typeof img === "string") image = img;
    else if (Array.isArray(img) && typeof img[0] === "string")
      image = img[0];
    else if (img && typeof img === "object" && "url" in (img as object)) {
      const u = (img as { url?: unknown }).url;
      if (typeof u === "string") image = u;
    }
    if (image) image = resolveUrl(baseUrl, image);

    const offers = o.offers;
    let price: string | undefined;
    let priceCurrency: string | undefined;
    if (offers && typeof offers === "object") {
      const off = offers as Record<string, unknown>;
      if (typeof off.price === "number" || typeof off.price === "string") {
        price = String(off.price);
      }
      if (typeof off.priceCurrency === "string") {
        priceCurrency = off.priceCurrency;
      }
    }
    return { name, description, image, price, priceCurrency };
  }

  if (Array.isArray(o["@graph"])) {
    for (const g of o["@graph"] as unknown[]) {
      const r = walkProductOffers(g, baseUrl);
      if (r?.name || r?.price) return r;
    }
  }
  return null;
}

function findProductInJsonLd(html: string, baseUrl: string) {
  const blocks = extractJsonLdBlocks(html);
  for (const b of blocks) {
    const r = walkProductOffers(b, baseUrl);
    if (r) return r;
  }
  return null;
}

/** Amazon: a-offscreen a-price-whole + a-price-fraction */
function guessAmazonPriceText(html: string): string | null {
  const whole = html.match(
    /class="[^"]*a-price-whole[^"]*"[^>]*>([^<]+)</i,
  );
  const frac = html.match(
    /class="[^"]*a-price-fraction[^"]*"[^>]*>([^<]+)</i,
  );
  if (whole?.[1]) {
    const w = whole[1].replace(/\s/g, "").replace(/[^\d]/g, "");
    const f = frac?.[1]?.replace(/\s/g, "") ?? "";
    if (w) return f ? `${w},${f} €` : `${w} €`;
  }
  const dataPrice = html.match(/data-a-price=["']([\d.]+)["']/i);
  if (dataPrice?.[1]) {
    const n = parseFloat(dataPrice[1]);
    if (!Number.isNaN(n)) return `${n.toFixed(2).replace(".", ",")} €`;
  }
  return null;
}

type PreviewOut = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  priceText: string | null;
  priceAmount: number | null;
  currency: string | null;
  previewNote: string | null;
};

function parsePriceAmountEuro(priceText: string): number | null {
  const t = priceText.replace(/\s/g, "").replace(",", ".");
  const m = t.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
}

export async function fetchLinkPreview(targetUrl: string): Promise<PreviewOut> {
  const u = new URL(targetUrl);
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("URL non valido");
  }
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let html: string;
  try {
    const res = await fetch(u.href, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
      },
    });
    const buf = new Uint8Array(await res.arrayBuffer());
    const slice = buf.slice(0, MAX_HTML_BYTES);
    html = new TextDecoder("utf-8", { fatal: false }).decode(slice);
  } finally {
    clearTimeout(t);
  }

  const base = u.href;
  let title =
    pickMeta(html, "og:title") ||
    pickMeta(html, "twitter:title") ||
    pickTitleTag(html);
  let description =
    pickMeta(html, "og:description") ||
    pickMeta(html, "description") ||
    pickMeta(html, "twitter:description");
  let imageUrl =
    pickMeta(html, "og:image:secure_url") ||
    pickMeta(html, "og:image") ||
    pickMeta(html, "twitter:image");
  if (imageUrl) imageUrl = resolveUrl(base, imageUrl);

  const siteName =
    pickMeta(html, "og:site_name") || u.hostname.replace(/^www\./, "");

  let priceText: string | null = null;
  const prodAmount = pickMeta(html, "product:price:amount");
  const prodCur = pickMeta(html, "product:price:currency");
  if (prodAmount) priceText = prodCur ? `${prodAmount} ${prodCur}` : prodAmount;
  if (!priceText) {
    const ogPrice = pickMeta(html, "og:price:amount");
    const ogCur = pickMeta(html, "og:price:currency");
    if (ogPrice) priceText = ogCur ? `${ogPrice} ${ogCur}` : ogPrice;
  }

  const jsonLd = findProductInJsonLd(html, base);
  if (jsonLd) {
    if (!title && jsonLd.name) title = jsonLd.name;
    if (!description && jsonLd.description) description = jsonLd.description;
    if (!imageUrl && jsonLd.image) imageUrl = jsonLd.image;
    if (!priceText && jsonLd.price) {
      const cur = jsonLd.priceCurrency ?? "EUR";
      priceText = `${jsonLd.price} ${cur}`;
    }
  }

  if (!priceText && /amazon\./i.test(u.hostname)) {
    priceText = guessAmazonPriceText(html);
  }

  let priceAmount: number | null = null;
  let currency: string | null = null;
  if (priceText) {
    priceAmount = parsePriceAmountEuro(priceText);
    const curMatch = priceText.match(/\b(EUR|USD|GBP)\b/i);
    currency = curMatch ? curMatch[1].toUpperCase() : "EUR";
  }

  let previewNote: string | null = null;
  if (!title && !imageUrl) {
    previewNote =
      "Anteprima limitata: alcuni negozi bloccano o offuscano i dati. Puoi modificare il titolo dopo l’aggiunta.";
  } else if (!title) {
    previewNote = "Titolo non rilevato automaticamente: puoi modificarlo dopo.";
  }

  return {
    title: title ? title.slice(0, 500) : null,
    description: description ? description.slice(0, 2000) : null,
    imageUrl,
    siteName: siteName ? siteName.slice(0, 200) : null,
    priceText: priceText ? priceText.slice(0, 120) : null,
    priceAmount,
    currency,
    previewNote,
  };
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

  let body: { url?: unknown };
  try {
    body = (await req.json()) as { url?: unknown };
  } catch {
    return jsonResponse({ error: "Body JSON non valido" }, 400);
  }

  const rawUrl = typeof body.url === "string" ? body.url.trim() : "";
  if (!rawUrl || rawUrl.length > 2048) {
    return jsonResponse({ error: "URL mancante o troppo lungo" }, 400);
  }

  let normalized: URL;
  try {
    normalized = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
  } catch {
    return jsonResponse({ error: "URL non valido" }, 400);
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

  const role = String((appRow as { app_role: string }).app_role ?? "").trim();
  if (!role) {
    return jsonResponse({ error: "Profilo app non valido" }, 403);
  }

  try {
    const preview = await fetchLinkPreview(normalized.href);
    return jsonResponse({ ok: true, preview });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore fetch";
    return jsonResponse(
      {
        ok: false,
        error: msg,
        preview: {
          title: null,
          description: null,
          imageUrl: null,
          siteName: normalized.hostname,
          priceText: null,
          priceAmount: null,
          currency: null,
          previewNote:
            "Impossibile caricare l’anteprima (timeout o blocco del sito). Prova comunque a salvare il link.",
        } satisfies PreviewOut,
      },
      200,
    );
  }
});
