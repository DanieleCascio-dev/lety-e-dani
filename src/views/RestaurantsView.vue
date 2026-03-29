<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue'
import { useRoute } from 'vue-router'
import { getSupabaseClient } from '@/lib/supabase'
import { useAppStorage } from '@/composables/useAppStorage'
import { useVeganRestaurantSearch } from '@/composables/useVeganRestaurantSearch'
import { useRestaurantPlaceSuggest, type PlaceDetailsResult } from '@/composables/useRestaurantPlaceSuggest'
import OurRatingStars from '@/components/OurRatingStars.vue'
import RestaurantMiniMap from '@/components/RestaurantMiniMap.vue'
import RestaurantPlaceCard from '@/components/RestaurantPlaceCard.vue'
import type {
  RestaurantMapMarker,
  SavedRestaurant,
  VeganRestaurantSearchItem,
} from '@/types/restaurants'

const { activeUser, profileFor } = useAppStorage()
const route = useRoute()

/** Evita race: più loadSaved in parallelo o completamento dopo navigazione via. */
let loadSavedSeq = 0

const { loading: searchLoading, error: searchError, data: searchData, search } =
  useVeganRestaurantSearch()

const {
  loading: suggestLoading,
  error: suggestError,
  fetchAutocomplete,
  fetchPlaceDetails,
} = useRestaurantPlaceSuggest()

const listLoading = ref(false)
const listError = ref<string | null>(null)
const savedList = ref<SavedRestaurant[]>([])

/** Ricerca nome locale (autocomplete) */
const nameQuery = ref('')
const suggestionsOpen = ref(false)
const suggestions = ref<Awaited<ReturnType<typeof fetchAutocomplete>>>([])
const pendingPlace = ref<PlaceDetailsResult | null>(null)
const formRating = ref(3)
const savedFormError = ref<string | null>(null)

let acTimer: ReturnType<typeof setTimeout> | null = null
let blurTimer: ReturnType<typeof setTimeout> | null = null

const radiusKm = ref(10)
const userPos = ref<{ lat: number; lng: number } | null>(null)
const geoMessage = ref<string | null>(null)

const addingFromSearchId = ref<string | null>(null)

const removeRestaurantModalOpen = ref(false)
const removeRestaurantTargetId = ref<string | null>(null)
const removeRestaurantSubmitting = ref(false)

const removeRestaurantTargetLabel = computed(() => {
  const id = removeRestaurantTargetId.value
  if (!id) return ''
  const name = savedList.value.find((x) => x.id === id)?.name?.trim()
  return name ?? ''
})

function openRemoveRestaurantModal(id: string) {
  removeRestaurantTargetId.value = id
  removeRestaurantModalOpen.value = true
}

function closeRemoveRestaurantModal() {
  removeRestaurantModalOpen.value = false
  removeRestaurantTargetId.value = null
}

function onRemoveRestaurantBackdrop() {
  if (!removeRestaurantSubmitting.value) closeRemoveRestaurantModal()
}

async function confirmRemoveRestaurant() {
  const id = removeRestaurantTargetId.value
  if (!id) return
  removeRestaurantSubmitting.value = true
  try {
    const ok = await removeSaved(id)
    await nextTick()
    if (ok) closeRemoveRestaurantModal()
  } finally {
    removeRestaurantSubmitting.value = false
  }
}

function onDocumentKeydownRestaurants(ev: KeyboardEvent) {
  if (ev.key !== 'Escape') return
  if (removeRestaurantModalOpen.value && !removeRestaurantSubmitting.value) {
    closeRemoveRestaurantModal()
  }
}

function mapRow(r: {
  id: string
  created_at: string
  created_by: string
  name: string | null
  maps_url: string
  rating: number
  place_id?: string | null
  address?: string | null
  category_label?: string | null
  google_rating?: number | null
  google_review_count?: number | null
  extra_notes?: string | null
  latitude?: number | null
  longitude?: number | null
}): SavedRestaurant {
  const role = r.created_by === 'letizia' ? 'letizia' : 'daniele'
  return {
    id: r.id,
    createdAt: r.created_at,
    createdBy: role,
    name: (r.name ?? '').trim(),
    mapsUrl: r.maps_url,
    rating: r.rating,
    placeId: r.place_id ?? null,
    address: r.address ?? null,
    categoryLabel: r.category_label ?? null,
    googleRating: r.google_rating ?? null,
    googleReviewCount: r.google_review_count ?? null,
    extraNotes: r.extra_notes ?? null,
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
  }
}

function savedToItem(r: SavedRestaurant): VeganRestaurantSearchItem {
  return {
    name: r.name,
    address: r.address ?? '',
    mapsUrl: r.mapsUrl,
    notes: r.extraNotes ?? '',
    latitude: r.latitude ?? null,
    longitude: r.longitude ?? null,
    placeId: r.placeId,
    rating: r.googleRating ?? null,
    userRatingCount: r.googleReviewCount ?? null,
    distanceKm: null,
    categoryLabel: r.categoryLabel ?? null,
  }
}

function detailsToItem(d: PlaceDetailsResult): VeganRestaurantSearchItem {
  return {
    name: d.name,
    address: d.address,
    mapsUrl: d.mapsUrl,
    notes: d.notes,
    latitude: d.latitude,
    longitude: d.longitude,
    placeId: d.placeId,
    rating: d.googleRating,
    userRatingCount: d.googleReviewCount,
    distanceKm: null,
    categoryLabel: d.categoryLabel,
  }
}

async function loadSaved() {
  const seq = ++loadSavedSeq
  listError.value = null
  listLoading.value = true
  try {
    const sb = getSupabaseClient()
    if (!sb) {
      savedList.value = []
      listError.value =
        'Salvare i ristoranti richiede Supabase e login. Configura .env.local e accedi.'
      return
    }
    const { data, error } = await sb
      .from('saved_restaurants')
      .select(
        'id, created_at, created_by, name, maps_url, rating, place_id, address, category_label, google_rating, google_review_count, extra_notes, latitude, longitude',
      )
      .order('created_at', { ascending: false })
    if (seq !== loadSavedSeq) return
    if (error) {
      listError.value = error.message
      savedList.value = []
      return
    }
    savedList.value = (data ?? []).map((row) =>
      mapRow(row as Parameters<typeof mapRow>[0]),
    )
  } finally {
    if (seq === loadSavedSeq) listLoading.value = false
  }
}

function resetPendingForm() {
  pendingPlace.value = null
  nameQuery.value = ''
  suggestions.value = []
  suggestionsOpen.value = false
  formRating.value = 5
  savedFormError.value = null
}

watch(nameQuery, (q) => {
  if (acTimer) clearTimeout(acTimer)
  pendingPlace.value = null
  if (q.trim().length < 2) {
    suggestions.value = []
    suggestionsOpen.value = false
    return
  }
  acTimer = setTimeout(async () => {
    suggestions.value = await fetchAutocomplete(
      q,
      userPos.value?.lat,
      userPos.value?.lng,
    )
    suggestionsOpen.value = suggestions.value.length > 0
  }, 320)
})

async function pickSuggestion(placeId: string) {
  savedFormError.value = null
  suggestionsOpen.value = false
  const d = await fetchPlaceDetails(placeId)
  if (!d) return
  pendingPlace.value = d
  nameQuery.value = d.name
}

function onNameBlur() {
  blurTimer = setTimeout(() => {
    suggestionsOpen.value = false
  }, 200)
}

function onNameFocus() {
  if (blurTimer) clearTimeout(blurTimer)
  if (nameQuery.value.trim().length >= 2 && suggestions.value.length) {
    suggestionsOpen.value = true
  }
}

async function submitPendingToList() {
  savedFormError.value = null
  if (!pendingPlace.value) {
    savedFormError.value = 'Scegli un locale dall’elenco mentre digiti il nome.'
    return
  }
  const d = pendingPlace.value
  const sb = getSupabaseClient()
  if (!sb) {
    savedFormError.value = 'Supabase non configurato.'
    return
  }
  if (d.placeId && savedList.value.some((s) => s.placeId === d.placeId)) {
    savedFormError.value = 'Questo locale è già nella lista.'
    return
  }
  const rating = Math.min(5, Math.max(1, Math.round(formRating.value)))
  const { error } = await sb.from('saved_restaurants').insert({
    created_by: activeUser.value,
    name: d.name,
    maps_url: d.mapsUrl,
    rating,
    place_id: d.placeId,
    address: d.address || null,
    category_label: d.categoryLabel || null,
    google_rating: d.googleRating,
    google_review_count: d.googleReviewCount,
    extra_notes: d.notes || null,
    latitude: d.latitude,
    longitude: d.longitude,
  })
  if (error) {
    savedFormError.value = error.message
    return
  }
  resetPendingForm()
  await loadSaved()
}

const ratingDebounce: Record<string, ReturnType<typeof setTimeout>> = {}

async function persistOurRating(id: string, value: number) {
  const sb = getSupabaseClient()
  if (!sb) return
  const rating = Math.min(5, Math.max(1, Math.round(value)))
  const { error } = await sb.from('saved_restaurants').update({ rating }).eq('id', id)
  if (error) listError.value = error.message
}

function onOurRatingUpdate(id: string, value: number) {
  const rating = Math.min(5, Math.max(1, Math.round(value)))
  const row = savedList.value.find((x) => x.id === id)
  if (row) row.rating = rating
  if (ratingDebounce[id]) clearTimeout(ratingDebounce[id])
  ratingDebounce[id] = setTimeout(() => {
    void persistOurRating(id, rating)
  }, 450)
}

async function removeSaved(id: string): Promise<boolean> {
  listError.value = null
  const sb = getSupabaseClient()
  if (!sb) {
    listError.value = 'Supabase non configurato.'
    return false
  }
  const prev = savedList.value.slice()
  savedList.value = savedList.value.filter((x) => x.id !== id)
  const { error } = await sb.from('saved_restaurants').delete().eq('id', id)
  if (error) {
    savedList.value = prev
    listError.value = error.message
    return false
  }
  return true
}

function isAlreadySaved(item: VeganRestaurantSearchItem): boolean {
  const pid = item.placeId
  if (pid && savedList.value.some((s) => s.placeId === pid)) return true
  return savedList.value.some((s) => s.mapsUrl === item.mapsUrl)
}

async function addFromSearch(item: VeganRestaurantSearchItem) {
  savedFormError.value = null
  const key = item.placeId ?? item.mapsUrl
  addingFromSearchId.value = key
  try {
    if (isAlreadySaved(item)) {
      savedFormError.value = 'Questo locale è già nella lista.'
      return
    }
    const sb = getSupabaseClient()
    if (!sb) {
      savedFormError.value = 'Supabase non configurato.'
      return
    }
    const { error } = await sb.from('saved_restaurants').insert({
      created_by: activeUser.value,
      name: item.name,
      maps_url: item.mapsUrl,
      rating: 3,
      place_id: item.placeId ?? null,
      address: item.address || null,
      category_label: item.categoryLabel ?? null,
      google_rating: item.rating ?? null,
      google_review_count: item.userRatingCount ?? null,
      extra_notes: item.notes || null,
      latitude: item.latitude,
      longitude: item.longitude,
    })
    if (error) {
      savedFormError.value = error.message
      return
    }
    await loadSaved()
  } finally {
    addingFromSearchId.value = null
  }
}

function coordsForSearchItem(r: VeganRestaurantSearchItem) {
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

function searchResultPlaceKey(
  item: VeganRestaurantSearchItem,
  idx: number,
): string {
  const base = item.placeId ?? item.mapsUrl ?? `idx-${idx}`
  return `sr-${String(base).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)}`
}

const expandedSearchKeys = ref<Set<string>>(new Set())

function isSearchExpanded(key: string) {
  return expandedSearchKeys.value.has(key)
}

function toggleSearchAccordion(key: string) {
  const s = new Set(expandedSearchKeys.value)
  if (s.has(key)) s.delete(key)
  else s.add(key)
  expandedSearchKeys.value = s
}

const expandedSavedIds = ref<Set<string>>(new Set())

function isSavedExpanded(id: string) {
  return expandedSavedIds.value.has(id)
}

function toggleSavedAccordion(id: string) {
  const s = new Set(expandedSavedIds.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  expandedSavedIds.value = s
}

const focusedSearchResultKey = ref<string | null>(null)
const highlightedSearchResultKey = ref<string | null>(null)

function searchItemHasMapCoords(item: VeganRestaurantSearchItem): boolean {
  return coordsForSearchItem(item) !== null
}

function onShowSearchResultOnMap(item: VeganRestaurantSearchItem, idx: number) {
  const key = searchResultPlaceKey(item, idx)
  const s = new Set(expandedSearchKeys.value)
  s.add(key)
  expandedSearchKeys.value = s
  focusedSearchResultKey.value = key
  void nextTick(() => {
    document.getElementById('restaurant-search-map')?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    })
  })
}

function onSearchMapPlaceClick(placeKey: string) {
  const s = new Set(expandedSearchKeys.value)
  s.add(placeKey)
  expandedSearchKeys.value = s
  highlightedSearchResultKey.value = placeKey
  void nextTick(() => {
    document.getElementById(`search-result-${placeKey}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    })
  })
  window.setTimeout(() => {
    if (highlightedSearchResultKey.value === placeKey) {
      highlightedSearchResultKey.value = null
    }
  }, 2800)
}

const searchMapMarkers = computed((): RestaurantMapMarker[] => {
  const out: RestaurantMapMarker[] = []
  if (userPos.value) {
    out.push({
      lat: userPos.value.lat,
      lng: userPos.value.lng,
      kind: 'user',
      label: 'La tua posizione',
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

const focusedSavedKey = ref<string | null>(null)
const highlightedSavedId = ref<string | null>(null)

const savedMapMarkers = computed((): RestaurantMapMarker[] => {
  const out: RestaurantMapMarker[] = []
  for (const r of savedList.value) {
    if (
      r.latitude != null &&
      r.longitude != null &&
      r.latitude >= -90 &&
      r.latitude <= 90 &&
      r.longitude >= -180 &&
      r.longitude <= 180
    ) {
      out.push({
        lat: r.latitude,
        lng: r.longitude,
        kind: 'place',
        label: r.name.trim() || 'Ristorante',
        placeKey: `saved-${r.id}`,
      })
    }
  }
  return out
})

function savedHasMapCoords(r: SavedRestaurant): boolean {
  return (
    r.latitude != null &&
    r.longitude != null &&
    r.latitude >= -90 &&
    r.latitude <= 90 &&
    r.longitude >= -180 &&
    r.longitude <= 180
  )
}

function ensureOurRestaurantsAccordionOpen() {
  const collapseEl = document.getElementById('collapse-our-restaurants')
  const btn = document.querySelector(
    '[data-bs-target="#collapse-our-restaurants"]',
  )
  if (collapseEl && !collapseEl.classList.contains('show')) {
    collapseEl.classList.add('show')
    btn?.classList.remove('collapsed')
    btn?.setAttribute('aria-expanded', 'true')
  }
}

function onShowSavedOnMap(id: string) {
  ensureOurRestaurantsAccordionOpen()
  focusedSavedKey.value = `saved-${id}`
  void nextTick(() => {
    document
      .getElementById('saved-restaurants-map')
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}

function onSavedMapPlaceClick(placeKey: string) {
  if (!placeKey.startsWith('saved-')) return
  const id = placeKey.slice('saved-'.length)
  highlightedSavedId.value = id
  ensureOurRestaurantsAccordionOpen()
  const open = new Set(expandedSavedIds.value)
  open.add(id)
  expandedSavedIds.value = open
  void nextTick(() => {
    document
      .getElementById(`saved-list-item-${id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
  window.setTimeout(() => {
    if (highlightedSavedId.value === id) highlightedSavedId.value = null
  }, 2800)
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
  geoMessage.value = null
  searchError.value = null
  if (!userPos.value) {
    try {
      await requestPosition()
    } catch {
      return
    }
  }
  const r = Math.min(50, Math.max(1, Math.round(radiusKm.value)))
  radiusKm.value = r
  if (!userPos.value) return
  await search(userPos.value.lat, userPos.value.lng, r)
}

watch(
  () => route.name,
  (name) => {
    if (name === 'restaurants') void loadSaved()
  },
  { immediate: true },
)

watch(
  () => searchData.value?.restaurants,
  () => {
    expandedSearchKeys.value = new Set()
    focusedSearchResultKey.value = null
    highlightedSearchResultKey.value = null
  },
)

function onPageShowRestaurants(ev: PageTransitionEvent) {
  if (ev.persisted && route.name === 'restaurants') void loadSaved()
}

onBeforeUnmount(() => {
  loadSavedSeq += 1
})

onMounted(() => {
  window.addEventListener('pageshow', onPageShowRestaurants)
  document.addEventListener('keydown', onDocumentKeydownRestaurants, true)
})

onUnmounted(() => {
  window.removeEventListener('pageshow', onPageShowRestaurants)
  document.removeEventListener('keydown', onDocumentKeydownRestaurants, true)
})
</script>

<template>
  <main class="shopping-main shopping-page">
    <div
      class="container-fluid px-3 px-sm-4 restaurants-inner restaurants-page"
      style="max-width: 32rem"
    >
      <h1 class="h5 fw-semibold mb-3 text-body">Ristoranti</h1>

      <section class="card border-0 shadow-sm mb-3">
        <div class="accordion accordion-flush" id="accordion-our-restaurants">
          <div class="accordion-item border-0">
            <h2 class="accordion-header d-flex flex-nowrap align-items-stretch mb-0">
              <button
                class="accordion-button collapsed rounded-0 shadow-none py-2 restaurants-accordion-btn flex-grow-1 min-w-0"
                type="button"
                data-bs-toggle="collapse"
                data-bs-target="#collapse-our-restaurants"
                aria-expanded="false"
                aria-controls="collapse-our-restaurants"
              >
                <span class="h6 fw-semibold mb-0 text-truncate d-block min-w-0"
                  >I nostri ristoranti</span
                >
              </button>
              <div
                class="restaurants-section-info-wrap d-flex align-items-center border-start border-light-subtle bg-body-secondary bg-opacity-10"
              >
                <div class="dropdown">
                  <button
                    type="button"
                    class="btn btn-sm btn-link text-secondary p-2 lh-1 restaurants-info-btn"
                    data-bs-toggle="dropdown"
                    data-bs-auto-close="outside"
                    aria-label="Informazioni su I nostri ristoranti"
                    @click.stop
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      fill="currentColor"
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                    >
                      <path
                        d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"
                      />
                      <path
                        d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"
                      />
                    </svg>
                  </button>
                  <div
                    class="dropdown-menu dropdown-menu-end shadow-sm p-3 restaurants-info-menu"
                  >
                    <p class="small text-secondary mb-3">
                      Cerca il nome su Google mentre digiti, scegli il locale dall’elenco e dai la
                      valutazione da 1 a 5 stelle. La lista è condivisa tra i due account.
                    </p>
                    <p class="small text-secondary mb-0">
                      Concedi la posizione GPS per ricevere suggerimenti più vicini mentre digiti il nome
                      del ristorante (non influisce sulla ricerca «Cerca ristoranti vegani» più sotto).
                    </p>
                  </div>
                </div>
              </div>
            </h2>
            <div
              id="collapse-our-restaurants"
              class="accordion-collapse collapse"
              data-bs-parent="#accordion-our-restaurants"
            >
              <div class="accordion-body pt-0">
          <div v-if="listError" class="alert alert-warning py-2 small mb-3" role="status">
            {{ listError }}
          </div>
          <div v-if="suggestError" class="alert alert-warning py-2 small mb-3" role="status">
            {{ suggestError }}
          </div>

          <div class="position-relative mb-3">
            <label class="form-label small mb-0" for="place-autocomplete">Nome del ristorante</label>
            <div class="input-group input-group-sm">
              <input
                id="place-autocomplete"
                v-model="nameQuery"
                type="text"
                class="form-control"
                autocomplete="off"
                placeholder="Inizia a digitare (es. Flower Burger)…"
                aria-autocomplete="list"
                aria-controls="place-suggestions-list"
                :aria-expanded="suggestionsOpen"
                @focus="onNameFocus"
                @blur="onNameBlur"
              />
              <button
                type="button"
                class="btn btn-sm d-inline-flex align-items-center justify-content-center gap-1 px-2 restaurant-autocomplete-gps-btn"
                :class="userPos ? 'btn-primary' : 'btn-outline-secondary'"
                :aria-pressed="userPos ? 'true' : 'false'"
                aria-label="Usa la posizione GPS per i suggerimenti mentre digiti il nome del locale"
                title="Chiede al browser la tua posizione: i suggerimenti mentre digiti saranno più pertinenti (vicini a te)."
                @click="requestPosition"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                >
                  <path
                    d="M8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10zm0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"
                  />
                </svg>
                <span class="d-none d-sm-inline">{{ userPos ? 'Posizione attiva' : 'GPS' }}</span>
              </button>
            </div>
            <p class="form-text small text-secondary mb-0 mt-1">
              <template v-if="userPos">
                Posizione usata per il completamento: i suggerimenti mentre digiti il nome sono ordinati in base
                alla vicinanza (~{{ userPos.lat.toFixed(3) }}, {{ userPos.lng.toFixed(3) }}).
              </template>
            </p>
            <ul
              v-show="suggestionsOpen && suggestions.length > 0"
              id="place-suggestions-list"
              class="list-group position-absolute w-100 shadow-sm mt-1"
              style="z-index: 20; max-height: 14rem; overflow-y: auto"
              role="listbox"
            >
              <li
                v-for="s in suggestions"
                :key="s.placeId"
                class="list-group-item list-group-item-action py-2 small"
                role="option"
                @mousedown.prevent="pickSuggestion(s.placeId)"
              >
                <div class="fw-semibold">{{ s.mainText }}</div>
                <div class="text-secondary text-truncate">{{ s.secondaryText }}</div>
              </li>
            </ul>
            <div v-if="suggestLoading" class="small text-secondary mt-1">Ricerca…</div>
          </div>

          <div v-if="pendingPlace" class="border rounded p-3 mb-3 bg-body-secondary bg-opacity-50">
            <div class="small text-secondary mb-2">Anteprima</div>
            <RestaurantPlaceCard
              :item="detailsToItem(pendingPlace)"
              variant="search"
              hide-add-button
            />
            <div class="mt-3">
              <div class="form-label small mb-1">La nostra valutazione</div>
              <OurRatingStars v-model="formRating" />
            </div>
            <div class="d-flex flex-wrap gap-2 mt-2">
              <button type="button" class="btn btn-primary btn-sm" @click="submitPendingToList">
                Aggiungi alla lista
              </button>
              <button type="button" class="btn btn-outline-secondary btn-sm" @click="resetPendingForm">
                Annulla
              </button>
            </div>
          </div>

          <div v-if="savedFormError" class="alert alert-danger py-2 small mb-3" role="alert">
            {{ savedFormError }}
          </div>

          <div v-if="listLoading" class="text-secondary small">Caricamento…</div>
          <ul v-else class="list-unstyled mb-0 restaurant-saved-list">
            <li
              v-for="r in savedList"
              :id="'saved-list-item-' + r.id"
              :key="r.id"
              class="mb-2 saved-list-item"
              :class="{ 'saved-list-item--highlight': highlightedSavedId === r.id }"
            >
              <div class="accordion accordion-flush border rounded overflow-hidden bg-body">
                <div class="accordion-item border-0">
                  <h2 class="accordion-header">
                    <button
                      class="accordion-button py-2 px-3 restaurants-accordion-btn restaurants-search-accordion-btn"
                      :class="{ collapsed: !isSavedExpanded(r.id) }"
                      type="button"
                      :aria-expanded="isSavedExpanded(r.id)"
                      @click="toggleSavedAccordion(r.id)"
                    >
                      <span
                        class="d-flex flex-nowrap align-items-center gap-2 w-100 text-start min-w-0"
                      >
                        <span class="fw-semibold text-truncate min-w-0">{{ r.name }}</span>
                        <span
                          class="text-nowrap small text-secondary flex-shrink-0"
                          aria-label="La nostra valutazione"
                        >
                          <span class="text-warning" aria-hidden="true">★</span>
                          {{ r.rating }}/5
                        </span>
                        <span
                          v-if="r.categoryLabel"
                          class="badge rounded-pill bg-success-subtle text-success-emphasis border border-success-subtle small fw-normal flex-shrink-0 text-truncate restaurants-search-badge"
                          :title="r.categoryLabel"
                        >
                          {{ r.categoryLabel }}
                        </span>
                      </span>
                    </button>
                  </h2>
                  <div
                    class="collapse bg-light"
                    :class="{ show: isSavedExpanded(r.id) }"
                  >
                    <div class="accordion-body p-3 pt-2">
                      <RestaurantPlaceCard
                        :item="savedToItem(r)"
                        variant="saved"
                        suppress-header
                        :our-rating="r.rating"
                        :has-map-coords="savedHasMapCoords(r)"
                        :added-meta="`Aggiunto da ${profileFor(r.createdBy).displayName} · ${new Date(r.createdAt).toLocaleDateString('it-IT')}`"
                        @request-remove="openRemoveRestaurantModal(r.id)"
                        @update-our-rating="onOurRatingUpdate(r.id, $event)"
                        @show-on-map="onShowSavedOnMap(r.id)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </li>
          </ul>
          <div
            v-if="!listLoading && savedMapMarkers.length"
            id="saved-restaurants-map"
            class="restaurant-saved-map-wrap mb-3"
          >
            <p class="small text-secondary mb-2">
              Mappa dei salvati: clicca un pin per evidenziare il locale nell’elenco sopra.
            </p>
            <RestaurantMiniMap
              :markers="savedMapMarkers"
              :focus-place-key="focusedSavedKey"
              height="min(38vh, 20rem)"
              @place-click="onSavedMapPlaceClick"
            />
          </div>
          <p v-if="!listLoading && savedList.length === 0 && !listError" class="text-secondary small mb-0">
            Nessun ristorante salvato ancora.
          </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="card border-0 shadow-sm mb-0">
        <div class="card-body">
          <div class="d-flex align-items-start gap-2 mb-3">
            <h2 class="h6 fw-semibold mb-0 flex-grow-1 min-w-0">
              Cerca ristorante (Google Maps)
            </h2>
            <div class="dropdown flex-shrink-0">
              <button
                type="button"
                class="btn btn-sm btn-link text-secondary p-0 lh-1 restaurants-info-btn"
                data-bs-toggle="dropdown"
                data-bs-auto-close="outside"
                aria-label="Informazioni sulla ricerca Google Places"
                @click.stop
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                >
                  <path
                    d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"
                  />
                  <path
                    d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"
                  />
                </svg>
              </button>
              <div class="dropdown-menu dropdown-menu-end shadow-sm p-3 restaurants-info-menu">
                <p class="small text-secondary mb-0">
                  Usiamo la tua posizione e un raggio in chilometri; i risultati arrivano da
                  <strong>Google Places</strong> (stessi dati che vedi su Maps: nome, indirizzo, link e
                  valutazioni). Orari e menu possono cambiare: controlla sempre la scheda del locale.
                </p>
              </div>
            </div>
          </div>

          <div class="mb-3">
            <label class="form-label small mb-0" for="rest-radius">
              Raggio: {{ radiusKm }} km
            </label>
            <input
              id="rest-radius"
              v-model.number="radiusKm"
              type="range"
              class="form-range"
              min="1"
              max="50"
              step="1"
            />
          </div>

          <div v-if="userPos" class="small text-secondary mb-2">
            Posizione: {{ userPos.lat.toFixed(5) }}, {{ userPos.lng.toFixed(5) }}
            <button type="button" class="btn btn-link btn-sm p-0 align-baseline" @click="userPos = null">
              Rimuovi
            </button>
          </div>

          <div v-if="geoMessage" class="alert alert-warning py-2 small mb-3" role="status">
            {{ geoMessage }}
          </div>

          <div class="d-flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              class="btn btn-outline-secondary btn-sm"
              :disabled="searchLoading"
              @click="requestPosition"
            >
              {{ userPos ? 'Rileggi posizione GPS' : 'Consenti posizione GPS' }}
            </button>
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="searchLoading"
              @click="runSearch"
            >
              <span
                v-if="searchLoading"
                class="spinner-border spinner-border-sm me-1"
                aria-hidden="true"
              />
              Cerca ristoranti vegani
            </button>
          </div>

          <div v-if="searchError" class="alert alert-danger py-2 small mb-3" role="alert">
            {{ searchError }}
          </div>

          <div v-if="searchData?.modelNote" class="alert alert-info py-2 small mb-3" role="status">
            {{ searchData.modelNote }}
          </div>

          <div v-if="searchData?.restaurants.length" class="mb-3">
            <h3 class="h6 fw-semibold mb-2">Risultati</h3>
            <p class="small text-secondary mb-2">
              Tocca un pin sulla mappa per aprire il dettaglio del locale nell’elenco sotto.
            </p>
            <div
              v-if="searchMapMarkers.length > 0"
              id="restaurant-search-map"
              class="restaurant-search-map-wrap mb-3"
            >
              <RestaurantMiniMap
                :markers="searchMapMarkers"
                :focus-place-key="focusedSearchResultKey"
                height="min(52vh, 26rem)"
                @place-click="onSearchMapPlaceClick"
              />
            </div>
            <ul class="list-unstyled mb-0 restaurant-search-results">
              <li
                v-for="(item, idx) in searchData.restaurants"
                :id="`search-result-${searchResultPlaceKey(item, idx)}`"
                :key="item.placeId || `${item.mapsUrl}-${idx}`"
                class="mb-2 search-result-item"
                :class="{
                  'search-result-item--highlight':
                    highlightedSearchResultKey === searchResultPlaceKey(item, idx),
                }"
              >
                <div class="accordion accordion-flush border rounded overflow-hidden bg-body">
                  <div class="accordion-item border-0">
                    <h2 class="accordion-header">
                      <button
                        class="accordion-button py-2 px-3 restaurants-accordion-btn restaurants-search-accordion-btn"
                        :class="{ collapsed: !isSearchExpanded(searchResultPlaceKey(item, idx)) }"
                        type="button"
                        :aria-expanded="isSearchExpanded(searchResultPlaceKey(item, idx))"
                        @click="toggleSearchAccordion(searchResultPlaceKey(item, idx))"
                      >
                        <span
                          class="d-flex flex-nowrap align-items-center gap-2 w-100 text-start min-w-0"
                        >
                          <span class="fw-semibold text-truncate min-w-0">{{ item.name }}</span>
                          <span
                            v-if="item.rating != null"
                            class="text-nowrap small text-secondary flex-shrink-0"
                            aria-label="Valutazione Google"
                          >
                            <span class="text-warning" aria-hidden="true">★</span>
                            {{ item.rating.toFixed(1) }}
                          </span>
                          <span
                            v-if="item.categoryLabel"
                            class="badge rounded-pill bg-success-subtle text-success-emphasis border border-success-subtle small fw-normal flex-shrink-0 text-truncate restaurants-search-badge"
                            :title="item.categoryLabel"
                          >
                            {{ item.categoryLabel }}
                          </span>
                        </span>
                      </button>
                    </h2>
                    <div
                      class="collapse bg-light"
                      :class="{ show: isSearchExpanded(searchResultPlaceKey(item, idx)) }"
                    >
                      <div class="accordion-body p-3 pt-2">
                        <RestaurantPlaceCard
                          :item="item"
                          variant="search"
                          suppress-header
                          :has-map-coords="searchItemHasMapCoords(item)"
                          :add-pending="addingFromSearchId === (item.placeId ?? item.mapsUrl)"
                          @add="addFromSearch(item)"
                          @show-on-map="onShowSearchResultOnMap(item, idx)"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            </ul>
            <p v-if="restaurantsWithoutMapCoords.length" class="small text-secondary mt-2 mb-0">
              Senza coordinate sulla mappa (solo elenco): {{ searchListWithoutCoordsText }}
            </p>
          </div>
        </div>
      </section>
    </div>

    <Teleport to="body">
      <div
        v-if="removeRestaurantModalOpen"
        class="modal fade show d-block restaurants-modal"
        tabindex="-1"
        style="background-color: rgba(0, 0, 0, 0.4)"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-restaurant-title"
        @click.self="onRemoveRestaurantBackdrop"
      >
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content" @click.stop>
            <div class="modal-header">
              <h2 id="remove-restaurant-title" class="modal-title h5 text-danger">
                Rimuovi ristorante
              </h2>
              <button
                type="button"
                class="btn-close"
                aria-label="Chiudi"
                :disabled="removeRestaurantSubmitting"
                @click="closeRemoveRestaurantModal"
              />
            </div>
            <div class="modal-body">
              <p class="mb-0">
                Rimuovere
                <strong v-if="removeRestaurantTargetLabel">{{ removeRestaurantTargetLabel }}</strong>
                <span v-else>questo ristorante</span>
                dalla lista?
              </p>
            </div>
            <div class="modal-footer">
              <button
                type="button"
                class="btn btn-secondary"
                :disabled="removeRestaurantSubmitting"
                @click="closeRemoveRestaurantModal"
              >
                Annulla
              </button>
              <button
                type="button"
                class="btn btn-danger"
                :disabled="removeRestaurantSubmitting"
                @click="confirmRemoveRestaurant"
              >
                <span
                  v-if="removeRestaurantSubmitting"
                  class="spinner-border spinner-border-sm me-2"
                  role="status"
                  aria-hidden="true"
                />
                Rimuovi
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </main>
</template>

<style scoped>
/* Shell allineata a Lista spesa / Todo (safe-area, padding verticale) */
.shopping-page {
  min-height: 100dvh;
  padding-top: max(0.35rem, var(--app-safe-top));
  padding-bottom: max(0.75rem, var(--app-safe-bottom));
}

.shopping-main {
  padding-top: 0.25rem;
}

.restaurants-inner {
  padding-bottom: 0.25rem;
}

.restaurant-saved-list li:last-child {
  margin-bottom: 0 !important;
}

.restaurant-search-map-wrap {
  border-radius: 0.75rem;
  overflow: hidden;
}

.restaurant-saved-map-wrap {
  border-radius: 0.75rem;
  overflow: hidden;
}

.saved-list-item--highlight {
  outline: 2px solid var(--bs-primary);
  outline-offset: 2px;
  border-radius: 0.5rem;
  transition: outline-color 0.2s ease;
}

.search-result-item--highlight {
  outline: 2px solid var(--bs-primary);
  outline-offset: 2px;
  border-radius: 0.5rem;
  transition: outline-color 0.2s ease;
}

.restaurant-autocomplete-gps-btn:focus-visible {
  box-shadow: 0 0 0 0.2rem rgba(var(--bs-primary-rgb), 0.35);
}

/* Intestazioni accordion compatte, una sola riga quando chiuse */
.restaurants-page .restaurants-accordion-btn {
  white-space: nowrap;
  overflow: hidden;
  min-height: 2.75rem;
  justify-content: flex-start;
}

.restaurants-page .restaurants-accordion-btn .text-truncate {
  min-width: 0;
}

.restaurants-page #accordion-our-restaurants > .accordion-item {
  overflow: visible;
}

.restaurants-section-info-wrap {
  flex-shrink: 0;
}

.restaurants-info-menu {
  max-width: min(100vw - 2rem, 22rem);
}

.restaurants-info-btn:focus-visible {
  box-shadow: 0 0 0 0.2rem rgba(var(--bs-primary-rgb), 0.28);
  border-radius: 50%;
}

.restaurants-page .restaurants-search-accordion-btn .restaurants-search-badge {
  max-width: 7.5rem;
}
</style>
