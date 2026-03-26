import { computed, ref, watch } from 'vue'
import type { RealtimeChannel, Session } from '@supabase/supabase-js'
import type { GroceryItem, GroceryListMeta, UserId, UserProfile } from '@/types/app'
import type { VeganOffersResult } from '@/types/offers'
import { getSupabaseClient } from '@/lib/supabase'
import { authSession } from '@/auth/authSession'

const ACTIVE_USER_KEY = 'lety-dani:active-user'
const GROCERIES_KEY = 'lety-dani:groceries'
const PROFILES_KEY = 'lety-dani:user-profiles'
const SELECTED_GROCERY_LIST_KEY = 'lety-dani:selected-grocery-list-id'
const LOCAL_GROCERY_V2_KEY = 'lety-dani:grocery-v2'

const DEFAULT_PROFILES: Record<UserId, UserProfile> = {
  daniele: {
    id: 'daniele',
    displayName: 'Daniele',
    textIcon: 'grocery-text-icon grocery-text-icon--daniele',
  },
  letizia: {
    id: 'letizia',
    displayName: 'Letizia',
    textIcon: 'grocery-text-icon grocery-text-icon--letizia',
  },
}

function loadProfiles(): Record<UserId, UserProfile> {
  const raw = sessionStorage.getItem(PROFILES_KEY)
  if (!raw) {
    sessionStorage.setItem(PROFILES_KEY, JSON.stringify(DEFAULT_PROFILES))
    return { ...DEFAULT_PROFILES }
  }
  try {
    const parsed = JSON.parse(raw) as Partial<Record<UserId, Partial<UserProfile>>>
    return {
      daniele: { ...DEFAULT_PROFILES.daniele, ...parsed.daniele, id: 'daniele' },
      letizia: { ...DEFAULT_PROFILES.letizia, ...parsed.letizia, id: 'letizia' },
    }
  } catch {
    return { ...DEFAULT_PROFILES }
  }
}

function normalizeGroceryItem(i: Partial<GroceryItem> & { id: string; text: string }, fallbackBy: UserId): GroceryItem {
  const addedBy = i.addedBy === 'letizia' || i.addedBy === 'daniele' ? i.addedBy : fallbackBy
  return {
    id: i.id,
    text: i.text,
    done: Boolean(i.done),
    addedBy,
  }
}

function parseGroceries(raw: string | null): GroceryItem[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed.map((row) =>
        normalizeGroceryItem(row as Partial<GroceryItem> & { id: string; text: string }, 'daniele'),
      )
    }
    if (parsed && typeof parsed === 'object' && ('daniele' in parsed || 'letizia' in parsed)) {
      const o = parsed as Partial<Record<UserId, Partial<GroceryItem>[]>>
      const out: GroceryItem[] = []
      for (const uid of ['daniele', 'letizia'] as const) {
        const arr = o[uid]
        if (!Array.isArray(arr)) continue
        for (const row of arr) {
          if (row && typeof row === 'object' && 'id' in row && 'text' in row) {
            out.push(normalizeGroceryItem(row as Partial<GroceryItem> & { id: string; text: string }, uid))
          }
        }
      }
      return out
    }
  } catch {
    /* ignore */
  }
  return []
}

type GroceryRow = {
  id: string
  text: string
  done: boolean
  added_by: string
  list_id: string
}

type LocalV2Payload = {
  lists: GroceryListMeta[]
  itemsByListId: Record<string, GroceryItem[]>
  selectedListId: string | null
}

function groceryListDatePart(list: GroceryListMeta): string {
  return new Intl.DateTimeFormat('it-IT', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(list.createdAt))
}

export function groceryListDisplayName(list: GroceryListMeta): string {
  const datePart = groceryListDatePart(list)
  const t = (list.title ?? '').trim()
  if (t) return `${t} · ${datePart}`
  return `Lista del ${datePart}`
}

function mapListRow(r: {
  id: string
  created_at: string
  created_by: string
  title?: string | null
}): GroceryListMeta {
  return {
    id: r.id,
    createdAt: r.created_at,
    createdBy: r.created_by === 'letizia' ? 'letizia' : 'daniele',
    title: typeof r.title === 'string' ? r.title.trim() : '',
  }
}

const activeUser = ref<UserId>('daniele')
const userProfiles = ref<Record<UserId, UserProfile>>(loadProfiles())
const groceriesLoading = ref(false)
const groceriesError = ref<string | null>(null)
const chatGroceryLoading = ref(false)
const veganOffersLoading = ref(false)
const veganOffersError = ref<string | null>(null)
const veganOffersData = ref<VeganOffersResult | null>(null)
const groceryLists = ref<GroceryListMeta[]>([])
const groceryListsLoading = ref(false)
const groceries = ref<GroceryItem[]>([])
const selectedGroceryListId = ref<string | null>(sessionStorage.getItem(SELECTED_GROCERY_LIST_KEY))
const localItemsByList = ref<Record<string, GroceryItem[]>>({})

const u = sessionStorage.getItem(ACTIVE_USER_KEY)
if (u === 'daniele' || u === 'letizia') {
  activeUser.value = u
}

let groceriesInitDone = false
let groceryChannel: RealtimeChannel | null = null
/** Coalescing eventi Realtime su grocery_items (batch insert → un solo refetch). */
let groceriesItemsRealtimeDebounceTimer: ReturnType<typeof setTimeout> | null = null
const GROCERY_ITEMS_REALTIME_DEBOUNCE_MS = 250

function clearGroceryItemsRealtimeDebounce() {
  if (groceriesItemsRealtimeDebounceTimer !== null) {
    clearTimeout(groceriesItemsRealtimeDebounceTimer)
    groceriesItemsRealtimeDebounceTimer = null
  }
}

function scheduleGroceriesRefetchFromRealtime() {
  clearGroceryItemsRealtimeDebounce()
  groceriesItemsRealtimeDebounceTimer = setTimeout(() => {
    groceriesItemsRealtimeDebounceTimer = null
    void fetchGroceriesFromSupabase(true)
  }, GROCERY_ITEMS_REALTIME_DEBOUNCE_MS)
}

function persistLocalV2() {
  const p: LocalV2Payload = {
    lists: groceryLists.value,
    itemsByListId: { ...localItemsByList.value },
    selectedListId: selectedGroceryListId.value,
  }
  sessionStorage.setItem(LOCAL_GROCERY_V2_KEY, JSON.stringify(p))
  if (selectedGroceryListId.value) {
    sessionStorage.setItem(SELECTED_GROCERY_LIST_KEY, selectedGroceryListId.value)
  } else {
    sessionStorage.removeItem(SELECTED_GROCERY_LIST_KEY)
  }
}

function loadLocalV2(): boolean {
  const raw = sessionStorage.getItem(LOCAL_GROCERY_V2_KEY)
  if (!raw) return false
  try {
    const p = JSON.parse(raw) as LocalV2Payload
    if (!Array.isArray(p.lists)) return false
    groceryLists.value = p.lists.map((l) => ({
      ...l,
      title: typeof l.title === 'string' ? l.title : '',
    }))
    localItemsByList.value = p.itemsByListId ?? {}
    const sel =
      p.selectedListId && p.lists.some((l) => l.id === p.selectedListId)
        ? p.selectedListId
        : (p.lists[0]?.id ?? null)
    selectedGroceryListId.value = sel
    groceries.value = sel ? [...(localItemsByList.value[sel] ?? [])] : []
    return true
  } catch {
    return false
  }
}

function hydrateGroceriesLocalOnly() {
  if (loadLocalV2()) return
  const legacy = parseGroceries(sessionStorage.getItem(GROCERIES_KEY))
  if (legacy.length) {
    const listId = newId()
    const meta: GroceryListMeta = {
      id: listId,
      createdAt: new Date().toISOString(),
      createdBy: 'daniele',
      title: '',
    }
    groceryLists.value = [meta]
    localItemsByList.value = { [listId]: legacy }
    selectedGroceryListId.value = listId
    groceries.value = [...legacy]
    persistLocalV2()
    return
  }
  groceryLists.value = []
  selectedGroceryListId.value = null
  groceries.value = []
}

function teardownGroceryRealtime() {
  clearGroceryItemsRealtimeDebounce()
  const sb = getSupabaseClient()
  if (groceryChannel && sb) {
    void sb.removeChannel(groceryChannel)
  }
  groceryChannel = null
}

function syncLocalGroceriesToMap() {
  const lid = selectedGroceryListId.value
  if (!lid || getSupabaseClient()) return
  localItemsByList.value = { ...localItemsByList.value, [lid]: groceries.value.map((x) => ({ ...x })) }
  persistLocalV2()
}

async function fetchGroceryListsFromSupabase(silent: boolean) {
  const sb = getSupabaseClient()
  if (!sb) return
  if (!silent) groceryListsLoading.value = true
  const { data, error } = await sb
    .from('grocery_lists')
    .select('id, created_at, created_by, title')
    .order('created_at', { ascending: false })
  if (!silent) groceryListsLoading.value = false
  if (error) {
    groceriesError.value = error.message
    return
  }
  groceryLists.value = (data ?? []).map((r: {
    id: string
    created_at: string
    created_by: string
    title?: string | null
  }) => mapListRow(r))
}

async function ensureSelectedListAfterFetch() {
  const sid = selectedGroceryListId.value
  if (sid && groceryLists.value.some((l) => l.id === sid)) {
    sessionStorage.setItem(SELECTED_GROCERY_LIST_KEY, sid)
    return
  }
  const first = groceryLists.value[0]?.id ?? null
  selectedGroceryListId.value = first
  if (first) sessionStorage.setItem(SELECTED_GROCERY_LIST_KEY, first)
  else sessionStorage.removeItem(SELECTED_GROCERY_LIST_KEY)
}

async function fetchGroceriesFromSupabase(silent: boolean) {
  const sb = getSupabaseClient()
  if (!sb) return
  const lid = selectedGroceryListId.value
  if (!lid) {
    if (!silent) groceriesLoading.value = false
    groceries.value = []
    return
  }
  if (!silent) groceriesLoading.value = true
  const { data, error } = await sb
    .from('grocery_items')
    .select('id, text, done, added_by, list_id')
    .eq('list_id', lid)
    .order('created_at', { ascending: true })
  if (!silent) groceriesLoading.value = false
  if (error) {
    groceriesError.value = error.message
    return
  }
  groceriesError.value = null
  const fallbackBy = activeUser.value
  groceries.value = ((data ?? []) as GroceryRow[]).map((r) =>
    normalizeGroceryItem(
      {
        id: r.id,
        text: r.text,
        done: r.done,
        addedBy: r.added_by === 'letizia' || r.added_by === 'daniele' ? r.added_by : fallbackBy,
      },
      fallbackBy,
    ),
  )
}

function setupGroceryRealtimeChannel() {
  const sb = getSupabaseClient()
  if (!sb || groceryChannel) return
  const refreshListsAndItems = async () => {
    await fetchGroceryListsFromSupabase(true)
    await ensureSelectedListAfterFetch()
    await fetchGroceriesFromSupabase(true)
  }
  groceryChannel = sb
    .channel('groceries_scope')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'grocery_lists' }, () => {
      void refreshListsAndItems()
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'grocery_items' }, () => {
      scheduleGroceriesRefetchFromRealtime()
    })
    .subscribe()
}

async function startGroceriesSync() {
  const sb = getSupabaseClient()
  if (!sb) return
  teardownGroceryRealtime()
  await fetchGroceryListsFromSupabase(false)
  await ensureSelectedListAfterFetch()
  await fetchGroceriesFromSupabase(false)
  /** Dopo le fetch auth/HTTP, apri Realtime nel tick successivo per non chiudere il WS mentre GoTrue finisce. */
  queueMicrotask(() => setupGroceryRealtimeChannel())
}

type AppUserRow = { app_role: string }

export const lastAppUserFetchError = ref<string | null>(null)

async function fetchAppRoleFromDb(userId: string): Promise<UserId | null> {
  lastAppUserFetchError.value = null
  const sb = getSupabaseClient()
  if (!sb) return null
  const { data, error } = await sb
    .from('app_user')
    .select('app_role')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    lastAppUserFetchError.value = error.message
    return null
  }
  if (!data) return null
  const r = (data as AppUserRow).app_role
  return r === 'daniele' || r === 'letizia' ? r : null
}

export const appUserSessionValid = ref(false)

/**
 * Ricarica liste e articoli dal server (es. all’ingresso nella pagina lista spesa).
 * Il parametro `silent` evita spinner pieni durante il refresh in background.
 */
export async function refreshGroceryData(options?: { silent?: boolean }) {
  const sb = getSupabaseClient()
  if (!sb || !appUserSessionValid.value) return
  const silent = options?.silent !== false
  await fetchGroceryListsFromSupabase(silent)
  await ensureSelectedListAfterFetch()
  await fetchGroceriesFromSupabase(silent)
}

/**
 * Garantisce che il canale Realtime sia attivo (es. dopo riconnessione rete).
 * Idempotente: se il canale esiste già, non fa nulla.
 */
export function ensureGroceryRealtimeConnected() {
  setupGroceryRealtimeChannel()
}

export async function syncSessionToAppUser(session: Session | null) {
  appUserSessionValid.value = false
  if (!session?.user) {
    teardownGroceryRealtime()
    groceries.value = []
    groceryLists.value = []
    selectedGroceryListId.value = null
    localItemsByList.value = {}
    return
  }
  const sb = getSupabaseClient()
  if (!sb) return
  const role = await fetchAppRoleFromDb(session.user.id)
  if (!role) {
    teardownGroceryRealtime()
    groceries.value = []
    groceryLists.value = []
    selectedGroceryListId.value = null
    localItemsByList.value = {}
    await sb.auth.signOut()
    return
  }
  appUserSessionValid.value = true
  activeUser.value = role
  await startGroceriesSync()
}

let resolveAuthInit!: () => void
export const authInitPromise = new Promise<void>((r) => {
  resolveAuthInit = r
})

export async function initAppAuthAndStorage() {
  try {
    const sb = getSupabaseClient()
    if (!sb) {
      authSession.value = null
      return
    }
    const { data } = await sb.auth.getSession()
    authSession.value = data.session ?? null
    await syncSessionToAppUser(data.session ?? null)

    sb.auth.onAuthStateChange(async (event, session) => {
      authSession.value = session
      if (event === 'INITIAL_SESSION') return
      await syncSessionToAppUser(session)
    })
  } finally {
    resolveAuthInit()
  }
}

export async function signOutUser() {
  await getSupabaseClient()?.auth.signOut()
}

watch(
  [activeUser, groceries],
  () => {
    sessionStorage.setItem(ACTIVE_USER_KEY, activeUser.value)
    if (!getSupabaseClient()) {
      sessionStorage.setItem(GROCERIES_KEY, JSON.stringify(groceries.value))
      syncLocalGroceriesToMap()
    }
  },
  { deep: true },
)

watch(
  userProfiles,
  (p) => {
    sessionStorage.setItem(PROFILES_KEY, JSON.stringify(p))
  },
  { deep: true },
)

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export async function selectGroceryList(id: string) {
  selectedGroceryListId.value = id
  sessionStorage.setItem(SELECTED_GROCERY_LIST_KEY, id)
  const sb = getSupabaseClient()
  if (sb) await fetchGroceriesFromSupabase(false)
  else {
    groceries.value = [...(localItemsByList.value[id] ?? [])]
    persistLocalV2()
  }
}

function normalizeListTitle(raw: string | undefined): string {
  return (raw ?? '').trim().slice(0, 80)
}

export async function createGroceryList(name?: string): Promise<boolean> {
  groceriesError.value = null
  const title = normalizeListTitle(name)
  const sb = getSupabaseClient()
  if (!sb) {
    const id = newId()
    const meta: GroceryListMeta = {
      id,
      createdAt: new Date().toISOString(),
      createdBy: activeUser.value,
      title,
    }
    groceryLists.value = [meta, ...groceryLists.value]
    localItemsByList.value = { ...localItemsByList.value, [id]: [] }
    selectedGroceryListId.value = id
    groceries.value = []
    persistLocalV2()
    return true
  }
  const { data, error } = await sb
    .from('grocery_lists')
    .insert({ created_by: activeUser.value, title })
    .select('id, created_at, created_by, title')
    .single()
  if (error) {
    groceriesError.value = error.message
    return false
  }
  const meta = mapListRow(data as { id: string; created_at: string; created_by: string; title?: string | null })
  groceryLists.value = [meta, ...groceryLists.value]
  selectedGroceryListId.value = meta.id
  sessionStorage.setItem(SELECTED_GROCERY_LIST_KEY, meta.id)
  groceries.value = []
  return true
}

export async function createChatGroceryList(listNameSuffix: string) {
  groceriesError.value = null
  const sb = getSupabaseClient()
  if (!sb) {
    groceriesError.value =
      'La lista con Chat funziona solo con Supabase e login. In locale senza cloud non è disponibile.'
    return
  }
  const {
    data: { session: initialSession },
  } = await sb.auth.getSession()
  if (!initialSession) {
    groceriesError.value = 'Accedi per creare una lista con Chat.'
    return
  }
  const suffix = listNameSuffix
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\u0000-\u001f]/g, '')
    .slice(0, 73)
  if (!suffix) {
    groceriesError.value = 'Inserisci un nome per la lista.'
    return
  }
  const CHAT_FN_TIMEOUT_MS = 120_000

  chatGroceryLoading.value = true
  try {
    type ChatPayload = { error?: string; listId?: string; code?: string; message?: string } | null
    let payload: ChatPayload = null

    const { data: sessWrap } = await sb.auth.getSession()
    let accessToken = sessWrap.session?.access_token
    const expAt = sessWrap.session?.expires_at
    const expiresMs = typeof expAt === 'number' ? expAt * 1000 : 0
    if (!accessToken || expiresMs < Date.now() + 90_000) {
      const { data: refData, error: refreshErr } = await sb.auth.refreshSession()
      accessToken = refData?.session?.access_token ?? accessToken
      if (!accessToken) {
        groceriesError.value =
          refreshErr?.message ?? 'Sessione scaduta o non valida. Esci dall’account e accedi di nuovo.'
        return
      }
    }

    const notFoundHint =
      'Sul progetto Supabase non esiste la funzione «chat-grocery-list». In Dashboard → Edge Functions crea una funzione con nome esattamente chat-grocery-list (trattini, minuscolo), incolla il codice da supabase/functions/chat-grocery-list/index.ts e fai Deploy. Verifica anche che VITE_SUPABASE_URL in .env.local sia lo stesso progetto.'

    const jwtHint =
      'JWT non accettato: esci e fai di nuovo il login; controlla che VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY siano dello stesso progetto. Su Edge Function disattiva «Verify JWT» (l’auth è già nel codice).'

    const useDevProxy =
      import.meta.env.DEV && typeof window !== 'undefined' && import.meta.env.VITE_SUPABASE_URL

    if (useDevProxy) {
      const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
      if (!anon) {
        groceriesError.value = 'VITE_SUPABASE_ANON_KEY mancante.'
        return
      }
      let res: Response
      try {
        res = await fetch(`${window.location.origin}/__supabase_functions/chat-grocery-list`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: anon,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ listName: suffix }),
          signal: AbortSignal.timeout(CHAT_FN_TIMEOUT_MS),
        })
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          groceriesError.value =
            'La richiesta ha impiegato troppo tempo (oltre 2 minuti). Controlla la funzione su Supabase e OpenAI, poi riprova.'
        } else {
          groceriesError.value =
            'Impossibile contattare la funzione. Controlla la connessione e che il dev server sia avviato.'
          console.error(e)
        }
        return
      }
      try {
        payload = (await res.json()) as ChatPayload
      } catch {
        groceriesError.value = 'Risposta non valida dalla funzione.'
        return
      }
      if (!res.ok) {
        const p = payload
        if (p && typeof p === 'object' && p.code === 'NOT_FOUND') {
          groceriesError.value = notFoundHint
        } else if (
          res.status === 401 ||
          (p &&
            typeof p === 'object' &&
            typeof p.message === 'string' &&
            /jwt|JWT/i.test(p.message))
        ) {
          groceriesError.value = jwtHint
        } else {
          groceriesError.value =
            (p && typeof p === 'object' && (p.error || p.message)) ||
            `Errore HTTP ${res.status} dalla funzione.`
        }
        return
      }
    } else {
      const { data, error } = await sb.functions.invoke('chat-grocery-list', {
        body: { listName: suffix },
        timeout: CHAT_FN_TIMEOUT_MS,
      })
      if (error) {
        const msg = error.message ?? ''
        groceriesError.value = /NOT_FOUND|not found|non trovat/i.test(msg)
          ? notFoundHint
          : /jwt|JWT|401/i.test(msg)
            ? jwtHint
            : msg
        return
      }
      payload = data as ChatPayload
    }

    if (payload && typeof payload === 'object' && payload.code === 'NOT_FOUND') {
      groceriesError.value = notFoundHint
      return
    }
    if (payload && typeof payload === 'object' && payload.error) {
      groceriesError.value = payload.error
      return
    }
    if (!payload?.listId) {
      groceriesError.value =
        'Risposta dal server non valida. Verifica che la funzione chat-grocery-list sia deployata.'
      return
    }
    await fetchGroceryListsFromSupabase(false)
    await selectGroceryList(payload.listId)
    groceriesError.value = null
  } catch (e) {
    groceriesError.value = 'Errore imprevisto durante la lista Chat. Riprova.'
    console.error(e)
  } finally {
    chatGroceryLoading.value = false
  }
}

const OFFERS_FN_TIMEOUT_MS = 120_000

export async function fetchVeganOffers() {
  veganOffersError.value = null
  const sb = getSupabaseClient()
  if (!sb) {
    veganOffersError.value =
      'Le offerte vegane sono disponibili solo con Supabase e login. In locale senza cloud non è disponibile.'
    return
  }
  const {
    data: { session: initialSession },
  } = await sb.auth.getSession()
  if (!initialSession) {
    veganOffersError.value = 'Accedi per consultare le offerte vegane.'
    return
  }

  veganOffersLoading.value = true
  try {
    type OffersPayload = {
      error?: string
      code?: string
      message?: string
      supermarkets?: VeganOffersResult['supermarkets']
      bestDeals?: VeganOffersResult['bestDeals']
      modelNote?: string | null
    }
    let payload: OffersPayload | null = null

    const { data: sessWrap } = await sb.auth.getSession()
    let accessToken = sessWrap.session?.access_token
    const expAt = sessWrap.session?.expires_at
    const expiresMs = typeof expAt === 'number' ? expAt * 1000 : 0
    if (!accessToken || expiresMs < Date.now() + 90_000) {
      const { data: refData, error: refreshErr } = await sb.auth.refreshSession()
      accessToken = refData?.session?.access_token ?? accessToken
      if (!accessToken) {
        veganOffersError.value =
          refreshErr?.message ?? 'Sessione scaduta o non valida. Esci dall’account e accedi di nuovo.'
        return
      }
    }

    const notFoundHint =
      'Sul progetto Supabase non esiste la funzione «vegan-offers». In Dashboard → Edge Functions crea una funzione con nome esattamente vegan-offers, incolla il codice da supabase/functions/vegan-offers/index.ts e fai Deploy.'

    const jwtHint =
      'JWT non accettato: esci e fai di nuovo il login; controlla che VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY siano dello stesso progetto. Su Edge Function disattiva «Verify JWT» (l’auth è già nel codice).'

    const useDevProxy =
      import.meta.env.DEV && typeof window !== 'undefined' && import.meta.env.VITE_SUPABASE_URL

    if (useDevProxy) {
      const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
      if (!anon) {
        veganOffersError.value = 'VITE_SUPABASE_ANON_KEY mancante.'
        return
      }
      let res: Response
      try {
        res = await fetch(`${window.location.origin}/__supabase_functions/vegan-offers`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: anon,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
          signal: AbortSignal.timeout(OFFERS_FN_TIMEOUT_MS),
        })
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          veganOffersError.value =
            'La richiesta ha impiegato troppo tempo. Controlla la funzione su Supabase e OpenAI, poi riprova.'
        } else {
          veganOffersError.value =
            'Impossibile contattare la funzione. Controlla la connessione e che il dev server sia avviato.'
          console.error(e)
        }
        return
      }
      try {
        payload = (await res.json()) as OffersPayload
      } catch {
        veganOffersError.value = 'Risposta non valida dalla funzione.'
        return
      }
      if (!res.ok) {
        const p = payload
        if (p && typeof p === 'object' && p.code === 'NOT_FOUND') {
          veganOffersError.value = notFoundHint
        } else if (
          res.status === 401 ||
          (p &&
            typeof p === 'object' &&
            typeof p.message === 'string' &&
            /jwt|JWT/i.test(p.message))
        ) {
          veganOffersError.value = jwtHint
        } else {
          veganOffersError.value =
            (p && typeof p === 'object' && (p.error || p.message)) ||
            `Errore HTTP ${res.status} dalla funzione.`
        }
        return
      }
    } else {
      const { data, error } = await sb.functions.invoke('vegan-offers', {
        body: {},
        timeout: OFFERS_FN_TIMEOUT_MS,
      })
      if (error) {
        const msg = error.message ?? ''
        veganOffersError.value = /NOT_FOUND|not found|non trovat/i.test(msg)
          ? notFoundHint
          : /jwt|JWT|401/i.test(msg)
            ? jwtHint
            : msg
        return
      }
      payload = data as OffersPayload
    }

    if (payload && typeof payload === 'object' && payload.code === 'NOT_FOUND') {
      veganOffersError.value = notFoundHint
      return
    }
    if (payload && typeof payload === 'object' && payload.error) {
      veganOffersError.value = payload.error
      return
    }
    if (
      !payload?.supermarkets ||
      !Array.isArray(payload.supermarkets) ||
      !Array.isArray(payload.bestDeals)
    ) {
      veganOffersError.value =
        'Risposta dal server non valida. Verifica che la funzione vegan-offers sia deployata.'
      return
    }
    veganOffersData.value = {
      supermarkets: payload.supermarkets,
      bestDeals: payload.bestDeals,
      modelNote: payload.modelNote ?? null,
    }
  } catch (e) {
    veganOffersError.value = 'Errore imprevisto durante il caricamento delle offerte. Riprova.'
    console.error(e)
  } finally {
    veganOffersLoading.value = false
  }
}

export async function renameGroceryList(id: string, name: string): Promise<boolean> {
  groceriesError.value = null
  const title = normalizeListTitle(name)
  const sb = getSupabaseClient()
  if (!sb) {
    groceryLists.value = groceryLists.value.map((l) =>
      l.id === id ? { ...l, title } : l,
    )
    persistLocalV2()
    return true
  }
  const { error } = await sb.from('grocery_lists').update({ title }).eq('id', id)
  if (error) {
    groceriesError.value = error.message
    return false
  }
  groceryLists.value = groceryLists.value.map((l) =>
    l.id === id ? { ...l, title } : l,
  )
  return true
}

export async function deleteGroceryList(id: string) {
  groceriesError.value = null
  const wasSelected = selectedGroceryListId.value === id
  const sb = getSupabaseClient()
  if (!sb) {
    groceryLists.value = groceryLists.value.filter((l) => l.id !== id)
    const next = { ...localItemsByList.value }
    delete next[id]
    localItemsByList.value = next
    if (wasSelected) {
      const nid = groceryLists.value[0]?.id ?? null
      selectedGroceryListId.value = nid
      groceries.value = nid ? [...(localItemsByList.value[nid] ?? [])] : []
    }
    persistLocalV2()
    return
  }
  const { error: delItemsErr } = await sb.from('grocery_items').delete().eq('list_id', id)
  if (delItemsErr) {
    groceriesError.value = delItemsErr.message
    return
  }
  const { error } = await sb.from('grocery_lists').delete().eq('id', id)
  if (error) {
    groceriesError.value = error.message
    return
  }
  groceryLists.value = groceryLists.value.filter((l) => l.id !== id)
  if (wasSelected) {
    const nid = groceryLists.value[0]?.id ?? null
    selectedGroceryListId.value = nid
    if (nid) sessionStorage.setItem(SELECTED_GROCERY_LIST_KEY, nid)
    else sessionStorage.removeItem(SELECTED_GROCERY_LIST_KEY)
    await fetchGroceriesFromSupabase(false)
  }
}

export async function markAllGroceryItemsDone(done: boolean) {
  const lid = selectedGroceryListId.value
  if (!lid || !groceries.value.length) return
  const sb = getSupabaseClient()
  groceries.value.forEach((i) => {
    i.done = done
  })
  if (!sb) {
    syncLocalGroceriesToMap()
    return
  }
  const { error } = await sb.from('grocery_items').update({ done }).eq('list_id', lid)
  if (error) {
    groceriesError.value = error.message
    await fetchGroceriesFromSupabase(false)
  } else {
    groceriesError.value = null
  }
}

export function useAppStorage() {
  if (!groceriesInitDone) {
    groceriesInitDone = true
    if (!getSupabaseClient()) {
      hydrateGroceriesLocalOnly()
    }
  }

  const currentList = computed(() => groceries.value)

  const currentGroceryListMeta = computed(() =>
    groceryLists.value.find((l) => l.id === selectedGroceryListId.value) ?? null,
  )

  const isGroceryCloud = computed(() => getSupabaseClient() !== null)

  function setActiveUser(id: UserId) {
    if (getSupabaseClient()) return
    activeUser.value = id
  }

  function profileFor(userId: UserId): UserProfile {
    return userProfiles.value[userId]
  }

  function textIconClassFor(userId: UserId): string {
    return userProfiles.value[userId].textIcon
  }

  async function addGroceryItem(text: string): Promise<boolean> {
    const t = text.trim()
    if (!t) return false
    const lid = selectedGroceryListId.value
    if (!lid) {
      groceriesError.value = 'Crea o seleziona una lista prima di aggiungere articoli.'
      return false
    }
    const id = newId()
    const item: GroceryItem = { id, text: t, done: false, addedBy: activeUser.value }
    const sb = getSupabaseClient()
    if (!sb) {
      groceries.value.push(item)
      syncLocalGroceriesToMap()
      return true
    }
    const { error } = await sb.from('grocery_items').insert({
      id,
      text: t,
      done: false,
      added_by: activeUser.value,
      list_id: lid,
    })
    if (error) {
      groceriesError.value = error.message
      return false
    }
    groceriesError.value = null
    groceries.value.push(item)
    return true
  }

  /** `done` deve coincidere con `checkbox.checked` dopo l’evento change (no click.prevent). */
  async function setGroceryItemDone(id: string, done: boolean) {
    const item = groceries.value.find((i) => i.id === id)
    if (!item) return
    const prev = item.done
    if (prev === done) return
    item.done = done
    const sb = getSupabaseClient()
    if (!sb) {
      syncLocalGroceriesToMap()
      return
    }
    const lid = selectedGroceryListId.value
    if (!lid) {
      item.done = prev
      return
    }
    const { error } = await sb
      .from('grocery_items')
      .update({ done })
      .eq('id', id)
      .eq('list_id', lid)
    if (error) {
      item.done = prev
      groceriesError.value = error.message
    } else {
      groceriesError.value = null
    }
  }

  async function updateGroceryItemText(id: string, text: string): Promise<boolean> {
    const t = text.trim().replace(/[\u0000-\u001f]/g, '').slice(0, 200)
    if (!t) {
      groceriesError.value = 'Il nome dell’articolo non può essere vuoto.'
      return false
    }
    const item = groceries.value.find((i) => i.id === id)
    if (!item) return false
    const prevText = item.text
    if (prevText === t) {
      groceriesError.value = null
      return true
    }
    const sb = getSupabaseClient()
    if (!sb) {
      item.text = t
      syncLocalGroceriesToMap()
      groceriesError.value = null
      return true
    }
    const lid = selectedGroceryListId.value
    if (!lid) return false
    item.text = t
    const { error } = await sb
      .from('grocery_items')
      .update({ text: t })
      .eq('id', id)
      .eq('list_id', lid)
    if (error) {
      item.text = prevText
      groceriesError.value = error.message
      return false
    }
    groceriesError.value = null
    return true
  }

  async function removeGroceryItem(id: string) {
    const sb = getSupabaseClient()
    if (!sb) {
      const i = groceries.value.findIndex((x) => x.id === id)
      if (i !== -1) groceries.value.splice(i, 1)
      syncLocalGroceriesToMap()
      return
    }
    const lid = selectedGroceryListId.value
    const prev = groceries.value.slice()
    groceries.value = groceries.value.filter((x) => x.id !== id)
    let q = sb.from('grocery_items').delete().eq('id', id)
    if (lid) q = q.eq('list_id', lid)
    const { error } = await q
    if (error) {
      groceries.value = prev
      groceriesError.value = error.message
    } else {
      groceriesError.value = null
    }
  }

  async function clearDoneGroceryItems() {
    const lid = selectedGroceryListId.value
    if (!lid) return
    const sb = getSupabaseClient()
    if (!sb) {
      groceries.value = groceries.value.filter((i) => !i.done)
      syncLocalGroceriesToMap()
      return
    }
    const prev = groceries.value.slice()
    groceries.value = groceries.value.filter((i) => !i.done)
    const { error } = await sb.from('grocery_items').delete().eq('list_id', lid).eq('done', true)
    if (error) {
      groceries.value = prev
      groceriesError.value = error.message
    } else {
      groceriesError.value = null
    }
  }

  return {
    activeUser,
    setActiveUser,
    userProfiles,
    profileFor,
    textIconClassFor,
    groceryLists,
    groceryListsLoading,
    selectedGroceryListId,
    currentGroceryListMeta,
    groceriesLoading,
    groceriesError,
    chatGroceryLoading,
    veganOffersLoading,
    veganOffersError,
    veganOffersData,
    fetchVeganOffers,
    appUserSessionValid,
    isGroceryCloud,
    currentList,
    createGroceryList,
    createChatGroceryList,
    renameGroceryList,
    deleteGroceryList,
    selectGroceryList,
    markAllGroceryItemsDone,
    addGroceryItem,
    setGroceryItemDone,
    updateGroceryItemText,
    removeGroceryItem,
    clearDoneGroceryItems,
  }
}
