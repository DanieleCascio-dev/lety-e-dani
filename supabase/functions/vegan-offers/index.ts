import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, accept, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

type AppUserRow = { app_role: string };

type RawProduct = {
  name?: unknown;
  price?: unknown;
  originalPrice?: unknown;
  discount?: unknown;
  validUntil?: unknown;
  notes?: unknown;
};

type RawSupermarket = {
  name?: unknown;
  items?: unknown;
  emptyMessage?: unknown;
};

type RawBestDeal = RawProduct & { supermarket?: unknown; rationale?: unknown };

type RawPayload = {
  supermarkets?: unknown;
  bestDeals?: unknown;
  modelNote?: unknown;
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

function strField(
  v: unknown,
  max: number,
  fallback = "Non disponibile",
): string {
  const t = String(v ?? "").trim();
  if (!t) return fallback;
  return clip(t, max);
}

function normalizeProduct(p: RawProduct): {
  name: string;
  price: string;
  originalPrice: string;
  discount: string;
  validUntil: string;
  notes: string;
} {
  return {
    name: strField(p.name, 280, "Non disponibile"),
    price: strField(p.price, 80),
    originalPrice: strField(p.originalPrice, 80),
    discount: strField(p.discount, 80),
    validUntil: strField(p.validUntil, 120),
    notes: strField(p.notes, 400),
  };
}

function normalizeSupermarket(
  row: RawSupermarket,
  fallbackName: string,
): {
  name: string;
  items: ReturnType<typeof normalizeProduct>[];
  emptyMessage: string | null;
} {
  const name = strField(row.name, 80, fallbackName);
  const itemsRaw = Array.isArray(row.items) ? row.items : [];
  const items = itemsRaw
    .slice(0, 40)
    .map((x) => normalizeProduct((x ?? {}) as RawProduct))
    .filter((it) => it.name !== "Non disponibile");
  let emptyMessage: string | null = null;
  const em = row.emptyMessage;
  if (typeof em === "string" && em.trim()) {
    emptyMessage = clip(em.trim(), 500);
  }
  return { name, items, emptyMessage };
}

const USER_PROMPT = `Compito: rispondi come in una chat e offri una bozza concreta di offerte vegane per la settimana in corso per: Lidl, Aldi, Iperlando (punti vendita nell’area di Padova e provincia).

Non puoi aprire i volantini PDF in tempo reale, ma l’utente vuole comunque il tuo parere: usa ragionamento e conoscenza su cosa queste catene mettono spesso in promo, gamma plant-based tipica, prezzi plausibili in Italia (anche come fascia o “da X €”, “tipicamente in offerta nel weekend”) e stagionalità. Preferisci un elenco utile e motivato a un elenco vuoto; evita di rispondere solo “controlla il volantino ufficiale” senza aver prima proposto idee.

Obiettivo: SOLO prodotti chiaramente vegani in offerta o che ragionevolmente potrebbero esserlo questa settimana.

Regole sui prodotti:
- Solo vegano dichiarato o inequivocabile (no “potenzialmente vegani”).
- Priorità a confezionati: burger vegetali, tofu/tempeh, hummus, bevande vegetali, gelati vegan, snack, surgelati plant-based, ecc.
- Escludi frutta e verdura generica salvo promo davvero distintiva.

Struttura: in "supermarkets" mantieni l’ordine Lidl, Aldi, Iperlando.

Per ogni prodotto in "items" (cerca diverse voci per catena quando ha senso): name, price, originalPrice, discount, validUntil, notes (stringhe).
- Campo mancante → "Non disponibile"; dove puoi, indica stime coerenti e segnala in "notes" che sono indicative (es. “Stima da promo ricorrenti / non letto su volantino odierno”).
- In "notes": anche carta fedeltà, app (Lidl Plus, Aldi), formato confezione, eventuali limiti.

Se per una catena non ha senso proporre nulla: "items": [] e "emptyMessage" breve che spiega il perché. Se ci sono "items", "emptyMessage" = "".

"bestDeals": 3–5 oggetti più interessanti in assoluto, con "supermarket" e "rationale" (perché conviene o perché è tipico).

"modelNote": 1–2 frasi che dicono chiaramente che è output di modello (non lettura del volantino ufficiale), che può sbagliare su prezzi/date, e che conviene verificare in app/sito — senza questo significato, il compito non è completo.
So che non puoi aprire i volantini PDF in tempo reale, ma l’utente vuole comunque il tuo parere: usa ragionamento e conoscenza su cosa queste catene mettono spesso in promo, gamma plant-based tipica, prezzi plausibili in Italia (anche come fascia o “da X €”, “tipicamente in offerta nel weekend”) e stagionalità. Preferisci un elenco utile e motivato a un elenco vuoto; evita di rispondere solo “controlla il volantino ufficiale” senza aver prima proposto idee.
Rispondi SOLO con JSON valido che rispetti lo schema del system (nessun markdown).`;

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

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) {
    return jsonResponse(
      {
        error:
          "OPENAI_API_KEY non configurata sul progetto (secret Edge Function)",
      },
      500,
    );
  }

  try {
    await req.json().catch(() => ({}));
  } catch {
    return jsonResponse({ error: "Body JSON non valido" }, 400);
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

  const jsonSchema = {
    type: "object",
    additionalProperties: false,
    required: ["supermarkets", "bestDeals", "modelNote"],
    properties: {
      modelNote: { type: "string" },
      supermarkets: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "items", "emptyMessage"],
          properties: {
            name: { type: "string" },
            emptyMessage: { type: "string" },
            items: {
              type: "array",
              maxItems: 40,
              items: {
                type: "object",
                additionalProperties: false,
                required: [
                  "name",
                  "price",
                  "originalPrice",
                  "discount",
                  "validUntil",
                  "notes",
                ],
                properties: {
                  name: { type: "string" },
                  price: { type: "string" },
                  originalPrice: { type: "string" },
                  discount: { type: "string" },
                  validUntil: { type: "string" },
                  notes: { type: "string" },
                },
              },
            },
          },
        },
      },
      bestDeals: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "name",
            "price",
            "originalPrice",
            "discount",
            "validUntil",
            "notes",
            "supermarket",
            "rationale",
          ],
          properties: {
            name: { type: "string" },
            price: { type: "string" },
            originalPrice: { type: "string" },
            discount: { type: "string" },
            validUntil: { type: "string" },
            notes: { type: "string" },
            supermarket: { type: "string" },
            rationale: { type: "string" },
          },
        },
      },
    },
  };

  const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 4096,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "vegan_flyer_offers",
          strict: true,
          schema: jsonSchema,
        },
      },
      messages: [
        {
          role: "system",
          content:
            "Sei un assistente chat per la spesa vegana in Italia. Rispondi solo con JSON che rispetta lo schema. Obiettivo: dare sempre un feedback utile (prodotti, prezzi o stime, note) anche senza accesso ai volantini live; etichetta l’incertezza nei campi notes e in modelNote. Non dichiarare di aver letto un volantino reale di oggi se non è vero; puoi comunque proporre offerte plausibili e tipiche delle catene. Vietati prodotti non chiaramente vegani.",
        },
        { role: "user", content: USER_PROMPT },
      ],
    }),
  });

  if (!openaiRes.ok) {
    const errText = await openaiRes.text();
    console.error("OpenAI error", openaiRes.status, errText);
    return jsonResponse(
      { error: "Errore dal servizio AI. Riprova più tardi." },
      502,
    );
  }

  const completion = (await openaiRes.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const rawContent = completion.choices?.[0]?.message?.content ?? "";

  let parsed: RawPayload;
  try {
    parsed = JSON.parse(rawContent) as RawPayload;
  } catch {
    return jsonResponse({ error: "Risposta AI non interpretabile" }, 502);
  }

  const defaultNames = ["Lidl", "Aldi", "Iperlando"];
  const smRaw = Array.isArray(parsed.supermarkets) ? parsed.supermarkets : [];
  const supermarkets = defaultNames.map((label, i) => {
    const normalized = normalizeSupermarket(
      (smRaw[i] ?? {}) as RawSupermarket,
      label,
    );
    return { ...normalized, name: label };
  });

  const bestRaw = Array.isArray(parsed.bestDeals) ? parsed.bestDeals : [];
  const bestDeals = bestRaw.slice(0, 5).map((x) => {
    const b = normalizeProduct((x ?? {}) as RawProduct);
    return {
      ...b,
      supermarket: strField((x as RawBestDeal).supermarket, 80, ""),
      rationale: strField((x as RawBestDeal).rationale, 400, ""),
    };
  });

  const modelNote =
    typeof parsed.modelNote === "string" && parsed.modelNote.trim()
      ? clip(parsed.modelNote.trim(), 600)
      : null;

  return jsonResponse({
    supermarkets,
    bestDeals,
    modelNote,
  });
});
