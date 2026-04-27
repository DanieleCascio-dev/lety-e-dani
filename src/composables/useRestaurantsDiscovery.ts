import { computed, ref, watch } from 'vue'
import { useVeganRestaurantSearch } from '@/composables/useVeganRestaurantSearch'
import type {
  AutocompleteSuggestion,
  PlaceDetailsResult,
} from '@/composables/useRestaurantPlaceSuggest'
import type {
  RestaurantMapMarker,
  VeganRestaurantSearchItem,
} from '@/types/restaurants'

export type DiscoverOriginMode = 'near_me' | 'other'

type FetchAutocomplete = (
  input: string,
  latitude: number | undefined,
  longitude: number | undefined,
  options?: { mode?: 'food' | 'geo' },
) => Promise<AutocompleteSuggestion[]>

type FetchPlaceDetails = (placeId: string) => Promise<PlaceDetailsResult | null>

export function coordsForSearchItem(r: VeganRestaurantSearchItem) {
  if (r.latitude != null && r.longitude != null) {
    if (
      r.latitude >= -90 &&
      r.latitude <= 90 &&
      r.longitude >= -180 &&
      r.longitude <= 180
    ) {
      return { lat: r.latitude, lng: r.longitude }
    }
  }
  return null
}

export function searchResultPlaceKey(
  item: VeganRestaurantSearchItem,
  idx: number,
): string {
  const base = item.placeId ?? item.mapsUrl ?? `idx-${idx}`
  return `sr-${String(base).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)}`
}

export function useRestaurantsDiscovery(options: {
  fetchAutocomplete: FetchAutocomplete
  fetchPlaceDetails: FetchPlaceDetails
}) {
  const { loading: searchLoading, error: searchError, data: searchData, search } =
    useVeganRestaurantSearch()

  const radiusKm = ref(10)
  const searchStrictMode = ref(false)
  const userPos = ref<{ lat: number; lng: number } | null>(null)
  const geoMessage = ref<string | null>(null)

  const discoverOriginMode = ref<DiscoverOriginMode>('near_me')
  const discoverLocationQuery = ref('')
  const discoverLocationSuggestions = ref<AutocompleteSuggestion[]>([])
  const discoverLocationOpen = ref(false)
  const discoverSelectedCenter = ref<{ lat: number; lng: number; label: string } | null>(null)
  const searchRunBusy = ref(false)

  let discoverLocTimer: ReturnType<typeof setTimeout> | null = null
  let discoverBlurTimer: ReturnType<typeof setTimeout> | null = null
  let skipDiscoverQueryWatchReset = false

  const searchPanelBusy = computed(() => searchLoading.value || searchRunBusy.value)

  const discoverGpsLooksActive = computed(
    () => discoverOriginMode.value === 'near_me' && userPos.value != null,
  )

  const discoverMapFullscreenTitle = computed(() => {
    if (discoverOriginMode.value === 'other' && discoverSelectedCenter.value?.label) {
      const t = discoverSelectedCenter.value.label.trim()
      return t.length > 42 ? `Intorno a ${t.slice(0, 40)}...` : `Intorno a ${t}`
    }
    return 'Risultati vicino a te'
  })

  watch(discoverLocationQuery, (q) => {
    if (!skipDiscoverQueryWatchReset) discoverSelectedCenter.value = null
    if (discoverLocTimer) clearTimeout(discoverLocTimer)
    const t = q.trim()
    if (t.length < 2) {
      discoverLocationSuggestions.value = []
      discoverLocationOpen.value = false
      return
    }
    discoverLocTimer = setTimeout(async () => {
      discoverLocationSuggestions.value = await options.fetchAutocomplete(
        t,
        undefined,
        undefined,
        { mode: 'geo' },
      )
      discoverLocationOpen.value = discoverLocationSuggestions.value.length > 0
    }, 320)
  })

  async function pickDiscoverLocation(placeId: string) {
    geoMessage.value = null
    discoverLocationOpen.value = false
    const d = await options.fetchPlaceDetails(placeId)
    if (!d) return
    if (d.latitude == null || d.longitude == null) {
      geoMessage.value =
        'Coordinate non disponibili per questo luogo. Prova un altro indirizzo o una citta.'
      return
    }
    discoverSelectedCenter.value = {
      lat: d.latitude,
      lng: d.longitude,
      label: (d.name || d.address || discoverLocationQuery.value).trim() || 'Luogo scelto',
    }
    skipDiscoverQueryWatchReset = true
    discoverLocationQuery.value = d.name
      ? d.address
        ? `${d.name} - ${d.address}`
        : d.name
      : d.address || discoverLocationQuery.value
    queueMicrotask(() => {
      skipDiscoverQueryWatchReset = false
    })
  }

  function onDiscoverLocationBlur() {
    discoverBlurTimer = setTimeout(() => {
      discoverLocationOpen.value = false
    }, 200)
  }

  function onDiscoverLocationFocus() {
    if (discoverBlurTimer) clearTimeout(discoverBlurTimer)
    if (
      discoverLocationQuery.value.trim().length >= 2 &&
      discoverLocationSuggestions.value.length
    ) {
      discoverLocationOpen.value = true
    }
  }

  async function onDiscoverGpsClick() {
    discoverOriginMode.value = 'near_me'
    try {
      await requestPosition()
    } catch {
      /* geoMessage already set */
    }
  }

  function setDiscoverOriginNearMe() {
    discoverOriginMode.value = 'near_me'
    geoMessage.value = null
  }

  function requestPosition(): Promise<void> {
    geoMessage.value = null
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        geoMessage.value = 'Il browser non supporta la geolocalizzazione.'
        reject(new Error('no geolocation'))
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          userPos.value = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          }
          geoMessage.value = null
          resolve()
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            geoMessage.value =
              'Permesso posizione negato. Abilitalo nelle impostazioni del browser per cercare nel raggio scelto.'
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            geoMessage.value = 'Posizione non disponibile. Riprova.'
          } else {
            geoMessage.value = 'Timeout nel recupero della posizione. Riprova.'
          }
          reject(err)
        },
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
      )
    })
  }

  async function runSearch() {
    searchRunBusy.value = true
    geoMessage.value = null
    searchError.value = null
    try {
      let lat: number
      let lng: number
      if (discoverOriginMode.value === 'near_me') {
        if (!userPos.value) {
          try {
            await requestPosition()
          } catch {
            return
          }
        }
        if (!userPos.value) return
        lat = userPos.value.lat
        lng = userPos.value.lng
      } else {
        if (!discoverSelectedCenter.value) {
          geoMessage.value =
            "Cerca citta o indirizzo, poi scegli un risultato dall'elenco prima di cercare."
          return
        }
        lat = discoverSelectedCenter.value.lat
        lng = discoverSelectedCenter.value.lng
      }
      const r = Math.min(50, Math.max(1, Math.round(radiusKm.value)))
      radiusKm.value = r
      await search(lat, lng, r, { strict: searchStrictMode.value })
    } finally {
      searchRunBusy.value = false
    }
  }

  const searchMapMarkers = computed((): RestaurantMapMarker[] => {
    const out: RestaurantMapMarker[] = []
    if (discoverOriginMode.value === 'near_me' && userPos.value) {
      out.push({
        lat: userPos.value.lat,
        lng: userPos.value.lng,
        kind: 'user',
        label: 'Tu',
      })
    } else if (
      discoverOriginMode.value === 'other' &&
      discoverSelectedCenter.value
    ) {
      const lab = discoverSelectedCenter.value.label.trim() || 'Centro ricerca'
      out.push({
        lat: discoverSelectedCenter.value.lat,
        lng: discoverSelectedCenter.value.lng,
        kind: 'user',
        label: lab.length > 28 ? `${lab.slice(0, 26)}...` : lab,
      })
    }
    const list = searchData.value?.restaurants ?? []
    for (let i = 0; i < list.length; i++) {
      const r = list[i]!
      const c = coordsForSearchItem(r)
      if (c) {
        out.push({
          lat: c.lat,
          lng: c.lng,
          kind: 'place',
          label: r.name,
          placeKey: searchResultPlaceKey(r, i),
        })
      }
    }
    return out
  })

  const restaurantsWithoutMapCoords = computed(() => {
    if (!searchData.value?.restaurants.length) return []
    return searchData.value.restaurants.filter((r) => !coordsForSearchItem(r))
  })

  const searchListWithoutCoordsText = computed(() =>
    restaurantsWithoutMapCoords.value.map((x) => x.name).join(', '),
  )

  function cleanupDiscoveryTimers() {
    if (discoverLocTimer) clearTimeout(discoverLocTimer)
    if (discoverBlurTimer) clearTimeout(discoverBlurTimer)
  }

  return {
    searchLoading,
    searchError,
    searchData,
    radiusKm,
    searchStrictMode,
    userPos,
    geoMessage,
    discoverOriginMode,
    discoverLocationQuery,
    discoverLocationSuggestions,
    discoverLocationOpen,
    discoverSelectedCenter,
    searchPanelBusy,
    discoverGpsLooksActive,
    discoverMapFullscreenTitle,
    searchMapMarkers,
    restaurantsWithoutMapCoords,
    searchListWithoutCoordsText,
    pickDiscoverLocation,
    onDiscoverLocationBlur,
    onDiscoverLocationFocus,
    onDiscoverGpsClick,
    setDiscoverOriginNearMe,
    requestPosition,
    runSearch,
    cleanupDiscoveryTimers,
  }
}
