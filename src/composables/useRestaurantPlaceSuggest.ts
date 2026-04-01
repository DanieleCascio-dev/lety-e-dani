import { ref } from 'vue'
import { getSupabaseClient } from '@/lib/supabase'

const FN_TIMEOUT_MS = 25_000

export type AutocompleteSuggestion = {
  placeId: string
  placeResourceName: string
  mainText: string
  secondaryText: string
}

export type PlaceDetailsResult = {
  placeId: string
  name: string
  address: string
  mapsUrl: string
  latitude: number | null
  longitude: number | null
  types: string[]
  categoryLabel: string
  notes: string
  googleRating: number | null
  googleReviewCount: number | null
}

export type AutocompleteMode = 'food' | 'geo'

export function useRestaurantPlaceSuggest() {
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchAutocomplete(
    input: string,
    latitude: number | undefined,
    longitude: number | undefined,
    options?: { mode?: AutocompleteMode },
  ): Promise<AutocompleteSuggestion[]> {
    error.value = null
    const q = input.trim()
    if (q.length < 2) return []

    const sb = getSupabaseClient()
    if (!sb) {
      error.value = 'Serve Supabase e login per i suggerimenti.'
      return []
    }
    const {
      data: { session: initialSession },
    } = await sb.auth.getSession()
    if (!initialSession) {
      error.value = 'Accedi per cercare il nome del ristorante.'
      return []
    }

    loading.value = true
    try {
      const body: Record<string, unknown> = {
        action: 'autocomplete',
        input: q,
      }
      if (options?.mode === 'geo') {
        body.autocompleteMode = 'geo'
      }
      if (
        latitude != null &&
        longitude != null &&
        Number.isFinite(latitude) &&
        Number.isFinite(longitude)
      ) {
        body.latitude = latitude
        body.longitude = longitude
      }

      const data = await invokeSuggest(sb, body)
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        error.value = String(data.error)
        return []
      }
      const list = (data as { suggestions?: AutocompleteSuggestion[] })?.suggestions
      return Array.isArray(list) ? list : []
    } catch (e) {
      console.error(e)
      error.value = 'Errore durante la ricerca del nome.'
      return []
    } finally {
      loading.value = false
    }
  }

  async function fetchPlaceDetails(placeId: string): Promise<PlaceDetailsResult | null> {
    error.value = null
    const sb = getSupabaseClient()
    if (!sb) {
      error.value = 'Serve Supabase e login.'
      return null
    }
    loading.value = true
    try {
      const data = await invokeSuggest(sb, { action: 'details', placeId })
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        error.value = String(data.error)
        return null
      }
      return data as PlaceDetailsResult
    } catch (e) {
      console.error(e)
      error.value = 'Impossibile caricare i dettagli del locale.'
      return null
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    fetchAutocomplete,
    fetchPlaceDetails,
  }
}

async function invokeSuggest(
  sb: NonNullable<ReturnType<typeof getSupabaseClient>>,
  body: Record<string, unknown>,
): Promise<unknown> {
  const { data: sessWrap } = await sb.auth.getSession()
  let accessToken = sessWrap.session?.access_token
  const expAt = sessWrap.session?.expires_at
  const expiresMs = typeof expAt === 'number' ? expAt * 1000 : 0
  if (!accessToken || expiresMs < Date.now() + 90_000) {
    const { data: refData } = await sb.auth.refreshSession()
    accessToken = refData?.session?.access_token ?? accessToken
  }
  if (!accessToken) throw new Error('Sessione non valida')

  const useDevProxy =
    import.meta.env.DEV && typeof window !== 'undefined' && import.meta.env.VITE_SUPABASE_URL

  if (useDevProxy) {
    const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
    if (!anon) throw new Error('VITE_SUPABASE_ANON_KEY mancante')
    const res = await fetch(`${window.location.origin}/__supabase_functions/restaurant-place-suggest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: anon,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FN_TIMEOUT_MS),
    })
    const j = (await res.json()) as Record<string, unknown>
    if (!res.ok) {
      throw new Error(typeof j.error === 'string' ? j.error : `HTTP ${res.status}`)
    }
    return j
  }

  const { data, error } = await sb.functions.invoke('restaurant-place-suggest', {
    body,
    timeout: FN_TIMEOUT_MS,
  })
  if (error) throw new Error(error.message)
  return data
}
