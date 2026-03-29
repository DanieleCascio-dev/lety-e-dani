<script setup lang="ts">
import OurRatingStars from '@/components/OurRatingStars.vue'
import type { VeganRestaurantSearchItem } from '@/types/restaurants'

const props = withDefaults(
  defineProps<{
    item: VeganRestaurantSearchItem
    variant: 'search' | 'saved'
    /** Valutazione nostra 1–5 (solo saved) */
    ourRating?: number
    /** Es. "Aggiunto da … · data" */
    addedMeta?: string | null
    addPending?: boolean
    /** Nasconde "Aggiungi" (es. anteprima form) */
    hideAddButton?: boolean
    /**
     * Se true, non mostra nome / badge categoria / stelle in cima (usato nell’accordion risultati:
     * l’intestazione è nel pulsante accordion).
     */
    suppressHeader?: boolean
  /** Ha coordinate sulla mappa interna: mostra «Vedi sulla mappa» (saved o risultati ricerca) */
  hasMapCoords?: boolean
  }>(),
  {
    ourRating: 3,
    addedMeta: null,
    addPending: false,
    hideAddButton: false,
    suppressHeader: false,
    hasMapCoords: false,
  },
)

const emit = defineEmits<{
  add: []
  /** Apre il modale di conferma eliminazione (solo saved) */
  'request-remove': []
  'update-our-rating': [value: number]
  /** Centra la mappa interna sul locale (con coordinate) */
  'show-on-map': []
}>()
</script>

<template>
  <div
    class="border rounded p-3 mb-2 bg-light restaurant-place-card"
    :class="{
      'border-primary-subtle': variant === 'saved' && !suppressHeader,
      'border-0 mb-0': suppressHeader,
    }"
  >
    <template v-if="!suppressHeader">
      <div v-if="item.categoryLabel" class="mb-2">
        <span
          class="badge rounded-pill bg-success-subtle text-success-emphasis border border-success-subtle small fw-normal text-truncate d-inline-block mw-100"
          :title="item.categoryLabel"
        >
          {{ item.categoryLabel }}
        </span>
      </div>
      <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
        <div class="fw-semibold">{{ item.name }}</div>
        <div v-if="item.rating != null" class="text-nowrap small text-end">
          <span class="text-warning" aria-hidden="true">★</span>
          {{ item.rating.toFixed(1) }}
          <span v-if="item.userRatingCount != null" class="text-secondary">
            · {{ item.userRatingCount.toLocaleString('it-IT') }} recensioni
          </span>
        </div>
      </div>
    </template>
    <div v-if="item.address" class="small text-secondary">{{ item.address }}</div>
    <div class="small mt-1 text-secondary">
      <span v-if="item.distanceKm != null">~{{ item.distanceKm }} km da te</span>
      <span v-if="item.distanceKm != null && item.notes"> · </span>
      <span v-if="item.notes">{{ item.notes }}</span>
    </div>
    <div v-if="addedMeta" class="small text-secondary mt-2">{{ addedMeta }}</div>

    <div v-if="variant === 'saved'" class="mt-3 pt-2 border-top border-light-subtle">
      <div class="form-label small mb-1">La nostra valutazione</div>
      <OurRatingStars
        :model-value="ourRating ?? 3"
        @update:model-value="emit('update-our-rating', $event)"
      />
    </div>

    <div class="d-flex flex-wrap gap-2 align-items-center mt-2">
      <a
        v-if="item.mapsUrl"
        :href="item.mapsUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="small fw-semibold"
      >
        Apri su Google Maps
      </a>
      <button
        v-if="hasMapCoords && (variant === 'saved' || variant === 'search')"
        type="button"
        class="btn btn-sm btn-outline-secondary"
        @click="emit('show-on-map')"
      >
        Vedi sulla mappa
      </button>
      <button
        v-if="variant === 'search' && !hideAddButton"
        type="button"
        class="btn btn-sm btn-outline-primary ms-auto"
        :disabled="addPending"
        @click="emit('add')"
      >
        <span
          v-if="addPending"
          class="spinner-border spinner-border-sm me-1"
          aria-hidden="true"
        />
        Aggiungi alla lista
      </button>
      <button
        v-if="variant === 'saved'"
        type="button"
        class="btn btn-outline-danger btn-sm d-inline-flex align-items-center justify-content-center btn-icon-touch touch-manipulation ms-auto"
        title="Rimuovi"
        aria-label="Rimuovi dalla lista"
        @click="emit('request-remove')"
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
            d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"
          />
          <path
            fill-rule="evenodd"
            d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.touch-manipulation {
  touch-action: manipulation;
}

.btn-icon-touch {
  min-width: 2.75rem;
  min-height: 2.75rem;
  padding-left: 0.5rem;
  padding-right: 0.5rem;
}
</style>
