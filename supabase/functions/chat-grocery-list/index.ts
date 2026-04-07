import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, accept, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

type AppUserRow = { app_role: string }

type ItemCatalog = {
  /** Righe "nome: conteggio" per il prompt */
  freqLines: string[]
  /** Canonical ordinati per frequenza decrescente */
  sortedCanonical: string[]
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function sanitizeListSuffix(raw: unknown): string {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f]/g, '')
  return s.slice(0, 73)
}

function normKey(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Heuristica italiana: esclude carne, pesce, latticini, uova, miele, ecc. */
function isLikelyNonVegan(text: string): boolean {
  const t = text.toLowerCase()

  if (/(latte|bevanda)\s+(di|d')\s*(soia|mandorla|avena|cocco|riso|nocciola|canapa|quinoa)/.test(t)) {
    return false
  }
  if (/\blatte\b/.test(t)) return true
  if (/\bpanna\b/.test(t) && !/(cocco|soia|riso|mandorla|vegan)/.test(t)) return true

  if (/\byogurt\b/.test(t) || /\byoghurt\b/.test(t)) {
    if (/(soia|cocco|mandorla|avena|riso|vegan|vegetale)/.test(t)) return false
    return true
  }

  const bad =
    'carne,manzo,vitell,maiale,agnell,pollo,tacchin,coniglio,cinghial,bresaola,prosciutt,salam,mortadell,pancett,speck,wurstel,salsicc,hamburger,macin,bistecca,rosticcer,arrost,grigliat,kebab,guanciale,cotechino,culatello,cotoletta,fesa,tacchino'.split(
      ',',
    )
  for (const w of bad) {
    if (w && t.includes(w)) return true
  }

  const fish =
    'pesce,tonno,salmone,merluzz,acciug,gamber,calamar,polpo,seppi,cozz,vongol,aragost,sgombr,sardin,branzin,orata,spigola,trota,sogliola'.split(
      ',',
    )
  for (const w of fish) {
    if (w && t.includes(w)) return true
  }

  const dairy =
    'burro,formaggio,mozzarell,pecorin,parmigian,ricott,mascarpon,gorgonzol,grana,scamorz,provolon,stracch,feta,stracchino,robiola,taleggio,fontina,latticin'.split(
      ',',
    )
  for (const w of dairy) {
    if (w && t.includes(w)) return true
  }

  if (/\buov[oa]?\b/.test(t) || /\buova\b/.test(t) || /\balbume\b/.test(t) || /\btuorlo\b/.test(t)) {
    return true
  }
  /** Voci intere molto comuni (spesso inventate dall’AI) che da sole indicano prodotti animali */
  const exactBad = new Set([
    'carne',
    'pesce',
    'pollo',
    'manzo',
    'maiale',
    'agnello',
    'tacchino',
    'coniglio',
    'uova',
    'uovo',
    'latte',
    'burro',
    'formaggio',
    'panna',
    'miele',
    'yogurt',
    'yoghurt',
  ])
  if (exactBad.has(t.trim())) return true
  if (/\bmiele\b/.test(t)) return true
  if (/\bgelatina\b/.test(t)) return true
  if (/\bstrutto\b/.test(t) || /\blardo\b/.test(t)) return true

  return false
}

/** Catalogo solo da righe DB considerate vegane: carne/latte/uova non entrano mai (né per prompt né per mapping). */
function buildCatalog(rows: { text: string }[] | null): ItemCatalog {
  const freq = new Map<string, { count: number; example: string }>()
  for (const row of rows ?? []) {
    const raw = row.text?.trim()
    if (!raw) continue
    if (isLikelyNonVegan(raw)) continue
    const key = normKey(raw)
    if (!key) continue
    const cur = freq.get(key) ?? { count: 0, example: raw }
    cur.count += 1
    freq.set(key, cur)
  }
  const sorted = [...freq.entries()].sort((a, b) => b[1].count - a[1].count)
  const sortedCanonical = sorted.map(([, v]) => v.example)
  const freqLines = sorted.slice(0, 120).map(([, v]) => `${v.example}: ${v.count}`)
  return { freqLines, sortedCanonical }
}

/** Dopo enum JSON: solo stringhe ammesse, dedup, max 35, blocco sicurezza vegano. */
function sanitizeChatItemsFromEnum(
  raw: string[],
  allowedSet: Set<string>,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const x of raw) {
    const t = String(x).trim()
    if (!t || t.length > 200) continue
    if (!allowedSet.has(t)) continue
    if (isLikelyNonVegan(t)) continue
    const nk = normKey(t)
    if (seen.has(nk)) continue
    seen.add(nk)
    out.push(t)
    if (out.length >= 35) break
  }
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Metodo non consentito' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Accesso non autorizzato' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    return jsonResponse(
      {
        error:
          'Configurazione Supabase mancante (serve SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY per questa funzione).',
      },
      500,
    )
  }

  const openaiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openaiKey) {
    return jsonResponse({ error: 'OPENAI_API_KEY non configurata sul progetto (secret Edge Function)' }, 500)
  }

  let body: { listName?: string }
  try {
    body = (await req.json()) as { listName?: string }
  } catch {
    return jsonResponse({ error: 'Body JSON non valido' }, 400)
  }

  const suffix = sanitizeListSuffix(body.listName)
  if (!suffix) {
    return jsonResponse({ error: 'Inserisci un nome per la lista' }, 400)
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  })

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) {
    return jsonResponse({ error: 'Sessione non valida' }, 401)
  }

  const { data: appRow, error: appErr } = await supabase
    .from('app_user')
    .select('app_role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (appErr || !appRow) {
    return jsonResponse({ error: 'Profilo app non trovato' }, 403)
  }

  const role = String((appRow as AppUserRow).app_role ?? '').trim()
  if (!role) {
    return jsonResponse({ error: 'Profilo app non valido' }, 403)
  }

  const { data: memRow, error: memErr } = await supabase
    .from('garden_member')
    .select('garden_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (memErr || !memRow?.garden_id) {
    return jsonResponse(
      {
        error:
          'Nessuno spazio assegnato. Chiedi a un amministratore di aggiungerti a un garden.',
      },
      403,
    )
  }

  const gardenId = memRow.garden_id as string

  /** Scritture su liste/items: service role dopo verifica JWT + membership (RLS con JWT da Edge può fallire su INSERT). */
  const adminDb = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: itemRows, error: itemsErr } = await supabase.from('grocery_items').select('text')
  if (itemsErr) {
    return jsonResponse({ error: itemsErr.message }, 500)
  }

  const catalog = buildCatalog(itemRows ?? [])

  if (catalog.sortedCanonical.length === 0) {
    return jsonResponse(
      {
        error:
          'Non ci sono articoli vegani nello storico (o il database non ha ancora voci). Aggiungi prodotti plant-based alle liste, poi riprova la Chat.',
      },
      400,
    )
  }

  const historyBlock = catalog.freqLines.join('\n')
  const allowedStrings = catalog.sortedCanonical.slice(0, 80)
  const allowedList = allowedStrings.join('\n')
  const allowedSet = new Set(allowedStrings)

  const jsonSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        minItems: 1,
        maxItems: 35,
        items: {
          type: 'string',
          enum: allowedStrings,
        },
      },
    },
  }

  const userPrompt = `Contesto: la famiglia è VEGANA. Vietato carne, pesce, latticini, uova, miele e qualsiasi derivato animale.

Il formato JSON che rispondi accetta SOLO stringhe dall’enum (stesso testo identico a una delle righe sotto). Non esistono altre voci: non puoi inventare nomi.

Elenco con frequenze (solo vegano, solo da DB):
${historyBlock}

Stesso elenco, una voce per riga (scegli SOLO tra questi testi, copia letterale):
${allowedList}

Compito:
1) Da 1 a 35 articoli nell’array "items", ogni elemento è ESATTAMENTE una delle righe sopra (stesso testo).
2) Privilegia le frequenze più alte.
3) Una stringa = un solo articolo.

La risposta deve rispettare lo schema JSON richiesto (nessun markdown).`

  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_tokens: 2500,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'vegan_grocery_list',
          strict: true,
          schema: jsonSchema,
        },
      },
      messages: [
        {
          role: 'system',
          content:
            'Spesa vegana. L’array "items" contiene SOLO stringhe dall’enum dello schema (copia letterale da elenco utente). Vietati prodotti animali. Una voce per elemento.',
        },
        { role: 'user', content: userPrompt },
      ],
    }),
  })

  if (!openaiRes.ok) {
    const errText = await openaiRes.text()
    console.error('OpenAI error', openaiRes.status, errText)
    return jsonResponse({ error: 'Errore dal servizio AI. Riprova più tardi.' }, 502)
  }

  const completion = (await openaiRes.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const rawContent = completion.choices?.[0]?.message?.content ?? ''
  let items: string[] = []
  try {
    const parsed = JSON.parse(rawContent) as { items?: unknown }
    if (Array.isArray(parsed.items)) {
      items = sanitizeChatItemsFromEnum(
        parsed.items.map((x) => String(x).trim()),
        allowedSet,
      )
    }
  } catch {
    return jsonResponse({ error: 'Risposta AI non interpretabile' }, 502)
  }

  if (items.length === 0) {
    return jsonResponse(
      {
        error:
          'Non è stato possibile comporre la lista dalla Chat. Riprova; se persiste, aggiungi più articoli plant-based allo storico delle liste.',
      },
      400,
    )
  }

  const title = `chat - ${suffix}`.slice(0, 80)

  const { data: listRow, error: listErr } = await adminDb
    .from('grocery_lists')
    .insert({ created_by: role, title, garden_id: gardenId })
    .select('id')
    .single()

  if (listErr || !listRow) {
    return jsonResponse({ error: listErr?.message ?? 'Impossibile creare la lista' }, 500)
  }

  const listId = listRow.id as string
  const inserts = items.map((text) => ({
    id: crypto.randomUUID(),
    text,
    done: false,
    added_by: role,
    list_id: listId,
  }))

  const { error: insErr } = await adminDb.from('grocery_items').insert(inserts)
  if (insErr) {
    await adminDb.from('grocery_lists').delete().eq('id', listId)
    return jsonResponse({ error: insErr.message }, 500)
  }

  return jsonResponse({ listId, itemCount: inserts.length })
})
