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
import { useAppStorage } from '@/composables/useAppStorage'
import { useRestaurantPlaceSuggest, type PlaceDetailsResult } from '@/composables/useRestaurantPlaceSuggest'
import {
  coordsForSearchItem,
  searchResultPlaceKey,
  useRestaurantsDiscovery,
} from '@/composables/useRestaurantsDiscovery'
import {
  placeDetailsToSearchItem,
  savedRestaurantToSearchItem,
  useRestaurantsSaved,
} from '@/composables/useRestaurantsSaved'
import OurRatingStars from '@/components/OurRatingStars.vue'
import RestaurantMiniMap from '@/components/RestaurantMiniMap.vue'
import RestaurantPlaceCard from '@/components/RestaurantPlaceCard.vue'
import RestaurantMapSheet from '@/components/restaurants/RestaurantMapSheet.vue'
import type {
  RestaurantMapMarker,
  SavedRestaurant,
  VeganRestaurantSearchItem,
} from '@/types/restaurants'

const { activeUser, profileFor, currentGarden, refreshGardenContext } = useAppStorage()
const route = useRoute()

/** Evita race: più loadSaved in parallelo o completamento dopo navigazione via. */

const {
  loading: suggestLoading,
  error: suggestError,
  fetchAutocomplete,
  fetchPlaceDetails,
} = useRestaurantPlaceSuggest()

const {
  listLoading,
  listError,
  savedList,
  loadSaved,
  addPlace,
  addSearchItem,
  updateOurRating,
  removeSaved,
  cancelPendingLoads,
} = useRestaurantsSaved({ activeUser, currentGarden, refreshGardenContext })

const {
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
} = useRestaurantsDiscovery({ fetchAutocomplete, fetchPlaceDetails })

/** Ricerca nome locale (autocomplete) */
const nameQuery = ref('')
const suggestionsOpen = ref(false)
const suggestions = ref<Awaited<ReturnType<typeof fetchAutocomplete>>>([])
const pendingPlace = ref<PlaceDetailsResult | null>(null)
const formRating = ref(3)
const savedFormError = ref<string | null>(null)

let acTimer: ReturnType<typeof setTimeout> | null = null
let blurTimer: ReturnType<typeof setTimeout> | null = null

const addingFromSearchId = ref<string | null>(null)

/** Tab principale: lista salvati vs ricerca Places */
const mainTab = ref<'mine' | 'discover'>('mine')
const mineMapVisible = ref(false)
const discoverMapVisible = ref(false)
const mineMapWrapRef = ref<HTMLElement | null>(null)
const discoverMapWrapRef = ref<HTMLElement | null>(null)
/** Mappa a schermo intero (un solo layer alla volta, niente Leaflet doppio) */
const mineMapFullscreenOpen = ref(false)
const discoverMapFullscreenOpen = ref(false)

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
  if (mineMapFullscreenOpen.value) {
    mineMapFullscreenOpen.value = false
    return
  }
  if (discoverMapFullscreenOpen.value) {
    discoverMapFullscreenOpen.value = false
    return
  }
  if (removeRestaurantModalOpen.value && !removeRestaurantSubmitting.value) {
    closeRemoveRestaurantModal()
  }
}

watch([mineMapFullscreenOpen, discoverMapFullscreenOpen], ([mineFs, discFs]) => {
  document.body.style.overflow = mineFs || discFs ? 'hidden' : ''
})

watch(mainTab, () => {
  mineMapFullscreenOpen.value = false
  discoverMapFullscreenOpen.value = false
})

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
    savedFormError.value = "Scegli un locale dall'elenco mentre digiti il nome."
    return
  }
  const result = await addPlace(pendingPlace.value, formRating.value)
  if (!result.ok) {
    savedFormError.value = result.error ?? 'Impossibile salvare il locale.'
    return
  }
  resetPendingForm()
}

function onOurRatingUpdate(id: string, value: number) {
  updateOurRating(id, value)
}
async function addFromSearch(item: VeganRestaurantSearchItem) {
  savedFormError.value = null
  const key = item.placeId ?? item.mapsUrl
  addingFromSearchId.value = key
  try {
    const result = await addSearchItem(item)
    if (!result.ok) {
      savedFormError.value = result.error ?? 'Impossibile aggiungere il locale.'
    }
  } finally {
    addingFromSearchId.value = null
  }
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
  mainTab.value = 'discover'
  discoverMapVisible.value = false
  discoverMapFullscreenOpen.value = true
  const key = searchResultPlaceKey(item, idx)
  const s = new Set(expandedSearchKeys.value)
  s.add(key)
  expandedSearchKeys.value = s
  focusedSearchResultKey.value = key
}

function onSearchMapPlaceClick(placeKey: string) {
  mainTab.value = 'discover'
  if (!discoverMapVisible.value && !discoverMapFullscreenOpen.value) {
    discoverMapFullscreenOpen.value = true
  }
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

function onShowSavedOnMap(id: string) {
  mainTab.value = 'mine'
  mineMapVisible.value = false
  mineMapFullscreenOpen.value = true
  focusedSavedKey.value = `saved-${id}`
}

function onSavedMapPlaceClick(placeKey: string) {
  if (!placeKey.startsWith('saved-')) return
  const id = placeKey.slice('saved-'.length)
  highlightedSavedId.value = id
  mainTab.value = 'mine'
  if (!mineMapVisible.value && !mineMapFullscreenOpen.value) {
    mineMapFullscreenOpen.value = true
  }
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
    discoverMapVisible.value = false
  },
)

function onPageShowRestaurants(ev: PageTransitionEvent) {
  if (ev.persisted && route.name === 'restaurants') void loadSaved()
}

onBeforeUnmount(() => {
  cancelPendingLoads()
  cleanupDiscoveryTimers()
  if (acTimer) clearTimeout(acTimer)
  if (blurTimer) clearTimeout(blurTimer)
})

onMounted(() => {
  window.addEventListener('pageshow', onPageShowRestaurants)
  document.addEventListener('keydown', onDocumentKeydownRestaurants, true)
})

onUnmounted(() => {
  document.body.style.overflow = ''
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
      <header class="restaurants-page-header">
        <h1 class="restaurants-page-title text-body">Ristoranti</h1>
      </header>

      <div
        class="restaurants-pill-tabs"
        role="tablist"
        aria-label="Sezione ristoranti"
      >
        <button
          type="button"
          class="restaurants-pill-tabs__btn touch-manipulation"
          :class="{ 'is-active': mainTab === 'mine' }"
          role="tab"
          :aria-selected="mainTab === 'mine'"
          @click="mainTab = 'mine'"
        >
          I miei
        </button>
        <button
          type="button"
          class="restaurants-pill-tabs__btn touch-manipulation"
          :class="{ 'is-active': mainTab === 'discover' }"
          role="tab"
          :aria-selected="mainTab === 'discover'"
          @click="mainTab = 'discover'"
        >
          Scopri
        </button>
      </div>

      <!-- TAB: lista salvati + aggiungi -->
      <section
        v-if="mainTab === 'mine'"
        class="card border-0 shadow-sm mb-2 restaurants-tab-panel"
        role="tabpanel"
        aria-label="I miei ristoranti"
      >
        <div class="card-body restaurants-card-body">
          <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
            <h2 class="restaurants-section-title mb-0 text-truncate">Salvati</h2>
            <div class="dropdown flex-shrink-0">
              <button
                type="button"
                class="btn btn-sm btn-link text-secondary p-1 lh-1 restaurants-info-btn"
                data-bs-toggle="dropdown"
                data-bs-auto-close="outside"
                aria-label="Informazioni"
                @click.stop
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="17"
                  height="17"
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
                <p class="small text-secondary mb-2 mb-md-3">
                  Cerca su Google mentre digiti, scegli il locale e valuta 1?5 stelle. Lista condivisa.
                </p>
                <p class="small text-secondary mb-0">
                  GPS qui: suggerimenti più vicini mentre digiti. In «Scopri» puoi anche cercare per
                  altro luogo.
                </p>
              </div>
            </div>
          </div>

          <div v-if="listError" class="alert alert-warning py-2 small mb-2" role="status">
            {{ listError }}
          </div>
          <div v-if="suggestError" class="alert alert-warning py-2 small mb-2" role="status">
            {{ suggestError }}
          </div>

          <div class="position-relative mb-2">
            <div
              class="input-group input-group-sm restaurants-add-input shadow-sm border border-light-subtle"
            >
              <input
                id="place-autocomplete"
                v-model="nameQuery"
                type="text"
                class="form-control border-0 restaurants-add-input__field"
                autocomplete="off"
                placeholder="Aggiungi: cerca su Google…"
                aria-label="Cerca ristorante da aggiungere (Google)"
                aria-autocomplete="list"
                aria-controls="place-suggestions-list"
                :aria-expanded="suggestionsOpen"
                @focus="onNameFocus"
                @blur="onNameBlur"
              />
              <button
                type="button"
                class="btn btn-sm d-inline-flex align-items-center justify-content-center restaurants-add-input__gps restaurant-autocomplete-gps-btn border-0 touch-manipulation"
                :class="
                  userPos
                    ? 'btn-primary restaurants-gps-active'
                    : 'btn-light text-secondary'
                "
                :aria-pressed="userPos ? 'true' : 'false'"
                aria-label="Attiva posizione per suggerimenti più vicini"
                title="Suggerimenti ordinati per distanza"
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
              </button>
            </div>
            <ul
              v-show="suggestionsOpen && suggestions.length > 0"
              id="place-suggestions-list"
              class="list-group position-absolute w-100 shadow-sm mt-1 rounded border-0"
              style="z-index: 25; max-height: 12rem; overflow-y: auto"
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

          <div
            v-if="pendingPlace"
            class="border rounded-3 p-2 mb-2 bg-body-secondary bg-opacity-50"
          >
            <RestaurantPlaceCard
              :item="placeDetailsToSearchItem(pendingPlace)"
              variant="search"
              hide-add-button
              compact
            />
            <div class="mt-2 d-flex align-items-center gap-2 flex-wrap">
              <span class="small text-secondary flex-shrink-0">Valutazione</span>
              <OurRatingStars v-model="formRating" />
            </div>
            <div class="d-flex flex-wrap gap-2 mt-2">
              <button type="button" class="btn btn-primary btn-sm" @click="submitPendingToList">
                Salva in lista
              </button>
              <button type="button" class="btn btn-outline-secondary btn-sm" @click="resetPendingForm">
                Annulla
              </button>
            </div>
          </div>

          <div v-if="savedFormError" class="alert alert-danger py-2 small mb-2" role="alert">
            {{ savedFormError }}
          </div>

          <div
            v-if="!listLoading && savedMapMarkers.length"
            class="d-flex align-items-center gap-2 mb-2 restaurants-map-toolbar"
          >
            <span class="restaurants-map-toolbar__label">Mappa</span>
            <div class="ms-auto btn-group btn-group-sm">
              <button
                type="button"
                class="btn btn-outline-secondary touch-manipulation"
                :class="{ active: mineMapVisible }"
                @click="mineMapVisible = !mineMapVisible; mineMapFullscreenOpen = false"
              >
                {{ mineMapVisible ? 'Chiudi' : 'Anteprima' }}
              </button>
              <button
                type="button"
                class="btn btn-primary touch-manipulation"
                aria-label="Mappa a schermo intero"
                title="Schermo intero"
                @click="
                  mineMapFullscreenOpen = true;
                  mineMapVisible = false
                "
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
                    d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1h-4zM10 .5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 16 1.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zM.5 10a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 0 14.5v-4a.5.5 0 0 1 .5-.5zm15 0a.5.5 0 0 1 .5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5z"
                  />
                </svg>
              </button>
            </div>
          </div>
          <div
            v-if="mineMapVisible && savedMapMarkers.length"
            ref="mineMapWrapRef"
            class="restaurant-map-panel mb-2"
          >
            <RestaurantMiniMap
              :markers="savedMapMarkers"
              :focus-place-key="focusedSavedKey"
              height="min(34vh, 15rem)"
              @place-click="onSavedMapPlaceClick"
            />
          </div>

          <div v-if="listLoading" class="text-secondary small py-2">Caricamento…</div>
          <ul v-else class="list-unstyled mb-0 restaurant-saved-list">
            <li
              v-for="r in savedList"
              :id="'saved-list-item-' + r.id"
              :key="r.id"
              class="mb-2 saved-list-item restaurants-list-gap"
              :class="{ 'saved-list-item--highlight': highlightedSavedId === r.id }"
            >
              <div
                class="accordion accordion-flush border rounded-3 overflow-hidden bg-body restaurants-row-surface"
              >
                <div class="accordion-item border-0">
                  <h3 class="accordion-header">
                    <button
                      class="accordion-button restaurants-accordion-btn restaurants-accordion-btn-compact restaurants-accordion-btn--multiline restaurants-search-accordion-btn restaurants-accordion-head"
                      :class="{ collapsed: !isSavedExpanded(r.id) }"
                      type="button"
                      :aria-expanded="isSavedExpanded(r.id)"
                      @click="toggleSavedAccordion(r.id)"
                    >
                      <span
                        class="restaurants-accordion-head__stack w-100 text-start min-w-0"
                      >
                        <span class="restaurants-accordion-head__title">{{ r.name }}</span>
                        <span class="restaurants-accordion-head__meta">
                          <span
                            class="restaurants-rating-pill flex-shrink-0"
                            aria-label="La nostra valutazione"
                          >
                            <span class="text-warning" aria-hidden="true">★</span>
                            {{ r.rating }}
                          </span>
                          <span
                            v-if="r.categoryLabel"
                            class="restaurants-cat-badge restaurants-cat-badge--accordion"
                            :title="r.categoryLabel"
                          >
                            {{ r.categoryLabel }}
                          </span>
                        </span>
                      </span>
                    </button>
                  </h3>
                  <div
                    class="collapse bg-light"
                    :class="{ show: isSavedExpanded(r.id) }"
                  >
                    <div class="accordion-body restaurants-accordion-body-dense">
                      <RestaurantPlaceCard
                        :item="savedRestaurantToSearchItem(r)"
                        variant="saved"
                        suppress-header
                        compact
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
          <p
            v-if="!listLoading && savedList.length === 0 && !listError"
            class="text-secondary small mb-0 mt-1"
          >
            Nessun salvato. Aggiungi dalla barra sopra o da «Scopri».
          </p>
        </div>
      </section>

      <!-- TAB: ricerca vegan / Places -->
      <section
        v-if="mainTab === 'discover'"
        class="card border-0 shadow-sm mb-0 restaurants-tab-panel"
        role="tabpanel"
        aria-label="Scopri ristoranti vegani"
      >
        <div class="card-body restaurants-card-body">
          <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
            <h2 class="restaurants-section-title mb-0 text-truncate">Scopri</h2>
            <div class="dropdown flex-shrink-0">
              <button
                type="button"
                class="btn btn-sm btn-link text-secondary p-1 lh-1 restaurants-info-btn"
                data-bs-toggle="dropdown"
                data-bs-auto-close="outside"
                aria-label="Informazioni ricerca"
                @click.stop
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="17"
                  height="17"
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
                  Centro ricerca (GPS o luogo) + raggio → <strong>Google Places</strong>. Verifica su
                  Maps.
                </p>
              </div>
            </div>
          </div>

          <div
            class="restaurants-origin-pills mb-2"
            role="group"
            aria-label="Modalità centro ricerca"
          >
            <button
              type="button"
              class="restaurants-origin-pills__btn touch-manipulation"
              :class="{ 'is-active': discoverOriginMode === 'near_me' }"
              :aria-pressed="discoverOriginMode === 'near_me'"
              @click="setDiscoverOriginNearMe"
            >
              Vicino a me
            </button>
            <button
              type="button"
              class="restaurants-origin-pills__btn touch-manipulation"
              :class="{ 'is-active': discoverOriginMode === 'other' }"
              :aria-pressed="discoverOriginMode === 'other'"
              @click="discoverOriginMode = 'other'"
            >
              Altro luogo
            </button>
          </div>

          <div v-if="discoverOriginMode === 'other'" class="position-relative mb-2">
            <label class="visually-hidden" for="discover-location-input">Luogo di ricerca</label>
            <input
              id="discover-location-input"
              v-model="discoverLocationQuery"
              type="text"
              class="form-control form-control-sm shadow-sm"
              autocomplete="off"
              placeholder="Città, indirizzo, luogo…"
              aria-label="Cerca luogo per centrare la ricerca"
              aria-autocomplete="list"
              aria-controls="discover-location-suggestions"
              :aria-expanded="discoverLocationOpen"
              @focus="onDiscoverLocationFocus"
              @blur="onDiscoverLocationBlur"
            />
            <ul
              v-show="discoverLocationOpen && discoverLocationSuggestions.length > 0"
              id="discover-location-suggestions"
              class="list-group position-absolute w-100 shadow-sm mt-1 rounded border-0"
              style="z-index: 25; max-height: 11rem; overflow-y: auto"
              role="listbox"
            >
              <li
                v-for="s in discoverLocationSuggestions"
                :key="s.placeId"
                class="list-group-item list-group-item-action py-2 small"
                role="option"
                @mousedown.prevent="pickDiscoverLocation(s.placeId)"
              >
                <div class="fw-semibold">{{ s.mainText }}</div>
                <div class="text-secondary text-truncate">{{ s.secondaryText }}</div>
              </li>
            </ul>
            <div
              v-if="discoverSelectedCenter"
              class="small text-success mt-1 mb-0"
              role="status"
            >
              Centro: {{ discoverSelectedCenter.label }}
            </div>
            <div class="d-flex flex-wrap align-items-center gap-2 mt-1">
              <button
                type="button"
                class="btn btn-link btn-sm p-0 touch-manipulation"
                @click="onDiscoverGpsClick"
              >
                Usa posizione attuale (GPS)
              </button>
            </div>
          </div>

          <div class="d-flex align-items-center gap-2 mb-2 restaurants-radius-row">
            <span class="restaurants-radius-label text-nowrap flex-shrink-0">{{ radiusKm }} km</span>
            <input
              id="rest-radius"
              v-model.number="radiusKm"
              type="range"
              class="form-range flex-grow-1 m-0"
              min="1"
              max="50"
              step="1"
              aria-label="Raggio ricerca in chilometri"
            />
          </div>

          <div class="form-check form-switch mb-2">
            <input
              id="rest-search-strict"
              v-model="searchStrictMode"
              class="form-check-input"
              type="checkbox"
              role="switch"
              aria-describedby="rest-search-strict-hint"
            />
            <label class="form-check-label small" for="rest-search-strict">
              Solo risultati accurati (vegan/vegetariano su Google)
            </label>
          </div>

          <div
            v-if="discoverOriginMode === 'near_me' && userPos"
            class="d-flex align-items-center justify-content-between gap-2 small text-secondary mb-2"
          >
            <span class="text-truncate">Posizione GPS attiva</span>
            <button
              type="button"
              class="btn btn-link btn-sm p-0 text-secondary flex-shrink-0 touch-manipulation"
              @click="userPos = null"
            >
              Rimuovi
            </button>
          </div>

          <div v-if="geoMessage" class="alert alert-warning py-2 small mb-2" role="status">
            {{ geoMessage }}
          </div>

          <div class="d-flex gap-2 mb-2">
            <button
              type="button"
              class="btn btn-primary flex-grow-1 touch-manipulation restaurants-cta-primary"
              :disabled="searchPanelBusy"
              :aria-busy="searchPanelBusy ? 'true' : 'false'"
              @click="runSearch"
            >
              <span
                v-if="searchPanelBusy"
                class="spinner-border spinner-border-sm me-1"
                role="status"
                aria-hidden="true"
              />
              {{ searchPanelBusy ? 'Cerco…' : 'Cerca vegani qui' }}
            </button>
            <button
              type="button"
              class="btn touch-manipulation restaurants-gps-square"
              :class="
                discoverGpsLooksActive
                  ? 'btn-primary restaurants-gps-active'
                  : 'btn-outline-secondary'
              "
              :disabled="searchPanelBusy"
              :aria-pressed="discoverGpsLooksActive ? 'true' : 'false'"
              :aria-label="userPos ? 'Aggiorna GPS' : 'Attiva GPS'"
              :title="userPos ? 'Aggiorna posizione' : 'Consenti posizione'"
              @click="onDiscoverGpsClick"
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
                  d="M8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10zm0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"
                />
              </svg>
            </button>
          </div>

          <div
            v-if="searchPanelBusy"
            class="restaurants-search-pending small text-secondary mb-2 d-flex align-items-center gap-2"
            role="status"
            aria-live="polite"
          >
            <span class="placeholder-glow d-flex gap-1 flex-grow-1" aria-hidden="true">
              <span class="placeholder col-4 rounded" style="height: 0.65rem" />
              <span class="placeholder col-2 rounded" style="height: 0.65rem" />
              <span class="placeholder col-3 rounded" style="height: 0.65rem" />
            </span>
          </div>

          <div v-if="searchError" class="alert alert-danger py-2 small mb-2" role="alert">
            {{ searchError }}
          </div>

          <div v-if="searchData?.modelNote" class="alert alert-info py-2 small mb-2" role="status">
            {{ searchData.modelNote }}
          </div>

          <div v-if="searchData?.restaurants.length" class="mb-0">
            <div
              v-if="searchMapMarkers.length > 0"
              class="d-flex align-items-center gap-2 mb-2 restaurants-map-toolbar"
            >
              <span class="restaurants-map-toolbar__label">Mappa risultati</span>
              <div class="ms-auto btn-group btn-group-sm">
                <button
                  type="button"
                  class="btn btn-outline-secondary touch-manipulation"
                  :class="{ active: discoverMapVisible }"
                  @click="
                    discoverMapVisible = !discoverMapVisible;
                    discoverMapFullscreenOpen = false
                  "
                >
                  {{ discoverMapVisible ? 'Chiudi' : 'Anteprima' }}
                </button>
                <button
                  type="button"
                  class="btn btn-primary touch-manipulation"
                  aria-label="Mappa risultati a schermo intero"
                  title="Schermo intero"
                  @click="
                    discoverMapFullscreenOpen = true;
                    discoverMapVisible = false
                  "
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
                      d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1h-4zM10 .5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 16 1.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zM.5 10a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 0 14.5v-4a.5.5 0 0 1 .5-.5zm15 0a.5.5 0 0 1 .5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5z"
                    />
                  </svg>
                </button>
              </div>
            </div>
            <div
              v-if="discoverMapVisible && searchMapMarkers.length > 0"
              ref="discoverMapWrapRef"
              class="restaurant-map-panel mb-2"
            >
              <RestaurantMiniMap
                :markers="searchMapMarkers"
                :focus-place-key="focusedSearchResultKey"
                height="min(36vh, 16rem)"
                @place-click="onSearchMapPlaceClick"
              />
            </div>

            <h3 class="restaurants-results-heading mb-2">Risultati</h3>
            <ul class="list-unstyled mb-0 restaurant-search-results">
              <li
                v-for="(item, idx) in searchData.restaurants"
                :id="`search-result-${searchResultPlaceKey(item, idx)}`"
                :key="item.placeId || `${item.mapsUrl}-${idx}`"
                class="mb-2 search-result-item restaurants-list-gap"
                :class="{
                  'search-result-item--highlight':
                    highlightedSearchResultKey === searchResultPlaceKey(item, idx),
                }"
              >
                <div
                  class="accordion accordion-flush border rounded-3 overflow-hidden bg-body restaurants-row-surface"
                >
                  <div class="accordion-item border-0">
                    <h3 class="accordion-header">
                      <button
                        class="accordion-button restaurants-accordion-btn restaurants-accordion-btn-compact restaurants-accordion-btn--multiline restaurants-search-accordion-btn restaurants-accordion-head"
                        :class="{ collapsed: !isSearchExpanded(searchResultPlaceKey(item, idx)) }"
                        type="button"
                        :aria-expanded="isSearchExpanded(searchResultPlaceKey(item, idx))"
                        @click="toggleSearchAccordion(searchResultPlaceKey(item, idx))"
                      >
                        <span
                          class="restaurants-accordion-head__stack w-100 text-start min-w-0"
                        >
                          <span class="restaurants-accordion-head__title">{{ item.name }}</span>
                          <span class="restaurants-accordion-head__meta">
                            <span
                              v-if="item.rating != null"
                              class="restaurants-rating-pill flex-shrink-0"
                              aria-label="Valutazione Google"
                            >
                              <span class="text-warning" aria-hidden="true">★</span>
                              {{ item.rating.toFixed(1) }}
                            </span>
                            <span
                              v-if="item.categoryLabel"
                              class="restaurants-cat-badge restaurants-cat-badge--accordion"
                              :title="item.categoryLabel"
                            >
                              {{ item.categoryLabel }}
                            </span>
                          </span>
                        </span>
                      </button>
                    </h3>
                    <div
                      class="collapse bg-light"
                      :class="{ show: isSearchExpanded(searchResultPlaceKey(item, idx)) }"
                    >
                      <div class="accordion-body restaurants-accordion-body-dense">
                        <RestaurantPlaceCard
                          :item="item"
                          variant="search"
                          suppress-header
                          compact
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
              Solo elenco: {{ searchListWithoutCoordsText }}
            </p>
          </div>
        </div>
      </section>
    </div>

    <RestaurantMapSheet
      :open="mineMapFullscreenOpen"
      title="I tuoi salvati"
      dialog-label="Mappa salvati"
      :markers="savedMapMarkers"
      :focus-place-key="focusedSavedKey"
      @close="mineMapFullscreenOpen = false"
      @place-click="onSavedMapPlaceClick"
    />

    <RestaurantMapSheet
      :open="discoverMapFullscreenOpen"
      :title="discoverMapFullscreenTitle"
      dialog-label="Mappa risultati ricerca"
      :markers="searchMapMarkers"
      :focus-place-key="focusedSearchResultKey"
      @close="discoverMapFullscreenOpen = false"
      @place-click="onSearchMapPlaceClick"
    />

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

/* 8px grid: 0.5rem base unit */
.restaurants-page-header {
  margin-bottom: 0.5rem;
}

.restaurants-page-title {
  font-size: 1.35rem;
  font-weight: 650;
  letter-spacing: -0.03em;
  line-height: 1.15;
  margin: 0;
}

.restaurants-pill-tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0.25rem;
  margin-bottom: 0.75rem;
  background: var(--bs-secondary-bg);
  border-radius: 999px;
  border: 1px solid var(--bs-border-color-translucent);
}

.restaurants-pill-tabs__btn {
  flex: 1;
  border: none;
  border-radius: 999px;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--bs-secondary-color);
  background: transparent;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
}

.restaurants-pill-tabs__btn.is-active {
  background: var(--bs-body-bg);
  color: var(--bs-body-color);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.06),
    0 1px 3px rgba(0, 0, 0, 0.04);
}

/* Segmented: Vicino a me / Altro luogo (stesso linguaggio visivo dei tab pill) */
.restaurants-origin-pills {
  display: flex;
  gap: 0.2rem;
  padding: 0.2rem;
  background: var(--bs-secondary-bg);
  border-radius: 0.65rem;
  border: 1px solid var(--bs-border-color-translucent);
}

.restaurants-origin-pills__btn {
  flex: 1;
  border: none;
  border-radius: 0.5rem;
  padding: 0.4rem 0.5rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--bs-secondary-color);
  background: transparent;
  transition:
    background-color 0.2s ease,
    color 0.2s ease,
    box-shadow 0.2s ease;
}

.restaurants-origin-pills__btn.is-active {
  background: var(--bs-body-bg);
  color: var(--bs-body-color);
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.06),
    0 1px 2px rgba(0, 0, 0, 0.04);
}

.restaurants-origin-pills__btn:focus-visible {
  outline: 2px solid var(--bs-primary);
  outline-offset: 2px;
}

.restaurants-card-body {
  padding: 0.75rem;
}

@media (min-width: 576px) {
  .restaurants-card-body {
    padding: 1rem;
  }
}

.restaurants-section-title {
  font-size: 0.9375rem;
  font-weight: 650;
  letter-spacing: -0.02em;
  color: var(--bs-body-color);
}

.restaurants-add-input {
  border-radius: 0.65rem;
  overflow: hidden;
}

.restaurants-add-input__field {
  min-height: 2.5rem;
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
}

.restaurants-add-input__gps {
  min-width: 2.75rem;
}

.restaurants-map-toolbar__label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--bs-secondary-color);
}

.restaurants-cta-primary {
  font-weight: 650;
  min-height: 2.75rem;
}

.restaurants-radius-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--bs-secondary-color);
  min-width: 2.5rem;
}

.restaurants-accordion-head {
  padding-left: 0.5rem !important;
  padding-right: 0.5rem !important;
}

.restaurants-accordion-head__stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
  min-width: 0;
  flex: 1 1 auto;
}

.restaurants-accordion-head__title {
  font-weight: 650;
  font-size: 0.875rem;
  letter-spacing: -0.01em;
  line-height: 1.25;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  word-break: break-word;
  width: 100%;
}

.restaurants-accordion-head__meta {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.35rem;
  width: 100%;
  min-width: 0;
}

.restaurants-rating-pill {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--bs-secondary-color);
  padding: 0.125rem 0.375rem;
  border-radius: 0.35rem;
  background: var(--bs-secondary-bg);
}

.restaurants-cat-badge {
  font-size: 0.625rem;
  font-weight: 600;
  max-width: 5.5rem;
  padding: 0.15rem 0.4rem;
  border-radius: 999px;
  background: var(--bs-success-bg-subtle);
  color: var(--bs-success-text-emphasis);
  border: 1px solid var(--bs-success-border-subtle);
}

/* Larghezza al testo; solo se lungo occupa lo spazio rimasto e va in ellissi (:title ha il testo intero) */
.restaurants-cat-badge.restaurants-cat-badge--accordion {
  box-sizing: border-box;
  flex: 0 1 auto;
  min-width: 0;
  width: max-content;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
  line-height: 1.2;
  padding: 0.1rem 0.35rem;
}

.restaurants-accordion-body-dense {
  padding: 0.5rem !important;
  padding-top: 0.375rem !important;
}

.restaurants-row-surface {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}

.restaurants-list-gap {
  margin-bottom: 0.5rem !important;
}

.restaurants-results-heading {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--bs-secondary-color);
  margin: 0;
}

.restaurant-map-panel {
  border-radius: 0.75rem;
  overflow: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .restaurants-pill-tabs__btn,
  .restaurants-origin-pills__btn {
    transition: none;
  }
}

.restaurant-saved-list li:last-child {
  margin-bottom: 0 !important;
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

.restaurants-gps-active {
  box-shadow:
    0 0 0 0.12rem rgba(var(--bs-primary-rgb), 0.35),
    0 1px 3px rgba(0, 0, 0, 0.08);
}

.restaurants-search-pending .placeholder {
  opacity: 0.35;
}

/* Intestazioni accordion: titolo fino a 2 righe, caret Bootstrap resta a destra */
.restaurants-page .restaurants-accordion-btn {
  white-space: normal;
  overflow: hidden;
  min-height: 2.5rem;
  justify-content: flex-start;
  align-items: flex-start;
}

.restaurants-page .restaurants-accordion-btn--multiline::after {
  margin-top: 0.35rem;
  flex-shrink: 0;
}

.restaurants-page .restaurants-accordion-btn-compact {
  min-height: 2.125rem;
}

.restaurants-page .restaurants-accordion-btn .text-truncate {
  min-width: 0;
}

.restaurants-tab-panel {
  min-height: 0;
}

.restaurants-pill-tabs__btn:focus-visible {
  outline: 2px solid var(--bs-primary);
  outline-offset: 2px;
}

.restaurants-radius-row .form-range {
  min-height: 1.2rem;
}

.restaurants-gps-square {
  width: 2.75rem;
  min-width: 2.75rem;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding-left: 0;
  padding-right: 0;
}

.restaurants-info-menu {
  max-width: min(100vw - 2rem, 22rem);
}

.restaurants-info-btn:focus-visible {
  box-shadow: 0 0 0 0.2rem rgba(var(--bs-primary-rgb), 0.28);
  border-radius: 50%;
}

</style>
