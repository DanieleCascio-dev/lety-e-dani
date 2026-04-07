import { ref } from 'vue'
import { getSupabaseClient } from '@/lib/supabase'
import type { VeganRestaurantSearchResult } from '@/types/restaurants'

const SEARCH_FN_TIMEOUT_MS = 120_000

export function useVeganRestaurantSearch() {
  const loading = ref(false)
  const error = ref<string | null>(null)
  const data = ref<VeganRestaurantSearchResult | null>(null)
  let searchGeneration = 0

  async function search(
    latitude: number,
    longitude: number,
    radiusKm: number,
    options?: { strict?: boolean },
  ) {
    const myGen = ++searchGeneration
    error.value = null
    loading.value = true

    try {
    const sb = getSupabaseClient()
    if (!sb) {
      error.value =
        'La ricerca funziona solo con Supabase e login. In locale senza cloud non è disponibile.'
      return
    }
    const {
      data: { session: initialSession },
    } = await sb.auth.getSession()
    if (!initialSession) {
      error.value = 'Accedi per cercare ristoranti.'
      return
    }
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(radiusKm) ||
      radiusKm < 1 ||
      radiusKm > 50
    ) {
      error.value = 'Coordinate o raggio non validi.'
      return
    }

    try {
      type Payload = {
        error?: string
        code?: string
        message?: string
        restaurants?: VeganRestaurantSearchResult['restaurants']
        modelNote?: string | null
      }
      let payload: Payload | null = null

      const { data: sessWrap } = await sb.auth.getSession()
      let accessToken = sessWrap.session?.access_token
      const expAt = sessWrap.session?.expires_at
      const expiresMs = typeof expAt === 'number' ? expAt * 1000 : 0
      if (!accessToken || expiresMs < Date.now() + 90_000) {
        const { data: refData, error: refreshErr } = await sb.auth.refreshSession()
        accessToken = refData?.session?.access_token ?? accessToken
        if (!accessToken) {
          error.value =
            refreshErr?.message ?? 'Sessione scaduta o non valida. Esci dall’account e accedi di nuovo.'
          return
        }
      }

      const notFoundHint =
        'Sul progetto Supabase non esiste la funzione «search-vegan-restaurants». In Dashboard → Edge Functions crea una funzione con nome esattamente search-vegan-restaurants, incolla il codice da supabase/functions/search-vegan-restaurants/index.ts e fai Deploy.'

      const jwtHint =
        'JWT non accettato: esci e fai di nuovo il login; controlla che VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY siano dello stesso progetto. Su Edge Function disattiva «Verify JWT» (l’auth è già nel codice).'

      const useDevProxy =
        import.meta.env.DEV && typeof window !== 'undefined' && import.meta.env.VITE_SUPABASE_URL

      if (useDevProxy) {
        const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
        if (!anon) {
          error.value = 'VITE_SUPABASE_ANON_KEY mancante.'
          return
        }
        let res: Response
        try {
          res = await fetch(`${window.location.origin}/__supabase_functions/search-vegan-restaurants`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              apikey: anon,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              latitude,
              longitude,
              radiusKm,
              ...(options?.strict ? { strict: true } : {}),
            }),
            signal: AbortSignal.timeout(SEARCH_FN_TIMEOUT_MS),
          })
        } catch (e) {
          if (e instanceof DOMException && e.name === 'AbortError') {
            error.value =
              'La richiesta ha impiegato troppo tempo. Controlla la funzione su Supabase e OpenAI, poi riprova.'
          } else {
            error.value =
              'Impossibile contattare la funzione. Controlla la connessione e che il dev server sia avviato.'
            console.error(e)
          }
          return
        }
        try {
          payload = (await res.json()) as Payload
        } catch {
          error.value = 'Risposta non valida dalla funzione.'
          return
        }
        if (!res.ok) {
          const p = payload
          if (p && typeof p === 'object' && p.code === 'NOT_FOUND') {
            error.value = notFoundHint
          } else if (
            res.status === 401 ||
            (p &&
              typeof p === 'object' &&
              typeof p.message === 'string' &&
              /jwt|JWT/i.test(p.message))
          ) {
            error.value = jwtHint
          } else {
            error.value =
              (p && typeof p === 'object' && (p.error || p.message)) ||
              `Errore HTTP ${res.status} dalla funzione.`
          }
          return
        }
      } else {
        const { data: fnData, error: fnErr } = await sb.functions.invoke('search-vegan-restaurants', {
          body: {
            latitude,
            longitude,
            radiusKm,
            ...(options?.strict ? { strict: true } : {}),
          },
          timeout: SEARCH_FN_TIMEOUT_MS,
        })
        if (fnErr) {
          const msg = fnErr.message ?? ''
          error.value = /NOT_FOUND|not found|non trovat/i.test(msg)
            ? notFoundHint
            : /jwt|JWT|401/i.test(msg)
              ? jwtHint
              : msg
          return
        }
        payload = fnData as Payload
      }

      if (myGen !== searchGeneration) return

      if (payload && typeof payload === 'object' && payload.code === 'NOT_FOUND') {
        error.value = notFoundHint
        return
      }
      if (payload && typeof payload === 'object' && payload.error) {
        error.value = payload.error
        return
      }
      if (!payload?.restaurants || !Array.isArray(payload.restaurants)) {
        error.value =
          'Risposta dal server non valida. Verifica che la funzione search-vegan-restaurants sia deployata.'
        return
      }
      if (myGen !== searchGeneration) return

      data.value = {
        restaurants: payload.restaurants,
        modelNote: payload.modelNote ?? null,
      }
    } catch (e) {
      error.value = 'Errore imprevisto durante la ricerca. Riprova.'
      console.error(e)
    }
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    data,
    search,
  }
}
