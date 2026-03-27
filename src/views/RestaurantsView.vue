<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
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
  listError.value = null
  const sb = getSupabaseClient()
  if (!sb) {
    savedList.value = []
    listError.value =
      'Salvare i ristoranti richiede Supabase e login. Configura .env.local e accedi.'
    return
  }
  listLoading.value = true
  try {
    const { data, error } = await sb
      .from('saved_restaurants')
      .select(
        'id, created_at, created_by, name, maps_url, rating, place_id, address, category_label, google_rating, google_review_count, extra_notes, latitude, longitude',
      )
      .order('created_at', { ascending: false })
    if (error) {
      listError.value = error.message
      savedList.value = []
      return
    }
    savedList.value = (data ?? []).map((row) =>
      mapRow(row as Parameters<typeof mapRow>[0]),
    )
  } finally {
    listLoading.value = false
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
  for (const r of searchData.value?.restaurants ?? []) {
    const c = coordsForSearchItem(r)
    if (c) {
      out.push({
        lat: c.lat,
        lng: c.lng,
        kind: 'place',
        label: r.name,
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

onMounted(() => {
  void loadSaved()
  document.addEventListener('keydown', onDocumentKeydownRestaurants, true)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onDocumentKeydownRestaurants, true)
})
</script>

<template>
  <main class="restaurants-main pb-5">
    <div class="container-fluid px-3 px-sm-4 restaurants-page">
      <h1 class="h5 fw-semibold mb-3">Ristoranti</h1>

      <section class="card border-0 shadow-sm mb-4">
        <div class="card-body">
          <h2 class="h6 fw-semibold mb-3">I nostri ristoranti</h2>
          <p class="small text-secondary mb-3">
            Cerca il nome su Google mentre digiti, scegli il locale dall’elenco e dai la valutazione
            da 1 a 5 stelle. La lista è condivisa tra i due account.
          </p>

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
                class="btn btn-outline-secondary"
                title="Usa la posizione GPS per suggerimenti più vicini"
                @click="requestPosition"
              >
                GPS
              </button>
            </div>
            <div
              v-if="userPos"
              class="small text-secondary mt-1"
            >
              Suggerimenti calibrati su posizione ~{{ userPos.lat.toFixed(3) }}, {{ userPos.lng.toFixed(3) }}
            </div>
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
            <li v-for="r in savedList" :key="r.id" class="mb-3">
              <RestaurantPlaceCard
                :item="savedToItem(r)"
                variant="saved"
                :our-rating="r.rating"
                :added-meta="`Aggiunto da ${profileFor(r.createdBy).displayName} · ${new Date(r.createdAt).toLocaleDateString('it-IT')}`"
                @request-remove="openRemoveRestaurantModal(r.id)"
                @update-our-rating="onOurRatingUpdate(r.id, $event)"
              />
            </li>
          </ul>
          <p v-if="!listLoading && savedList.length === 0 && !listError" class="text-secondary small mb-0">
            Nessun ristorante salvato ancora.
          </p>
        </div>
      </section>

      <section class="card border-0 shadow-sm mb-4">
        <div class="card-body">
          <h2 class="h6 fw-semibold mb-3">Cerca ristorante (Google Maps)</h2>
          <p class="small text-secondary mb-3">
            Usiamo la tua posizione e un raggio in chilometri; i risultati arrivano da
            <strong>Google Places</strong> (stessi dati che vedi su Maps: nome, indirizzo, link e
            valutazioni). Orari e menu possono cambiare: controlla sempre la scheda del locale.
          </p>

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
            <div class="restaurant-search-map-wrap mb-3">
              <RestaurantMiniMap
                v-if="searchMapMarkers.length > 0"
                :markers="searchMapMarkers"
                height="320px"
              />
            </div>
            <ul class="list-unstyled mb-0">
              <li
                v-for="(item, idx) in searchData.restaurants"
                :key="item.placeId || `${item.mapsUrl}-${idx}`"
              >
                <RestaurantPlaceCard
                  :item="item"
                  variant="search"
                  :add-pending="addingFromSearchId === (item.placeId ?? item.mapsUrl)"
                  @add="addFromSearch(item)"
                />
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
.restaurants-main {
  padding-top: 0.5rem;
}

.restaurants-page {
  max-width: 42rem;
}

.restaurant-saved-list li:last-child {
  margin-bottom: 0 !important;
}

.restaurant-search-map-wrap {
  border-radius: 0.75rem;
  overflow: hidden;
}
</style>
