<script setup lang="ts">
import RestaurantMiniMap from '@/components/RestaurantMiniMap.vue'
import type { RestaurantMapMarker } from '@/types/restaurants'

defineProps<{
  open: boolean
  title: string
  dialogLabel: string
  markers: RestaurantMapMarker[]
  focusPlaceKey?: string | null
}>()

const emit = defineEmits<{
  close: []
  'place-click': [placeKey: string]
}>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && markers.length"
      class="restaurants-map-fs-backdrop"
      role="dialog"
      aria-modal="true"
      :aria-label="dialogLabel"
      @click.self="emit('close')"
    >
      <div class="restaurants-map-fs-sheet" @click.stop>
        <div class="restaurants-map-fs-head">
          <span class="fw-semibold small text-truncate">{{ title }}</span>
          <button
            type="button"
            class="btn-close flex-shrink-0"
            aria-label="Chiudi mappa"
            @click="emit('close')"
          />
        </div>
        <div class="restaurants-map-fs-body">
          <RestaurantMiniMap
            :markers="markers"
            :focus-place-key="focusPlaceKey"
            height="min(72dvh, 32rem)"
            @place-click="emit('place-click', $event)"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.restaurants-map-fs-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1060;
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: max(0.5rem, var(--app-safe-top)) 0.5rem max(0.5rem, var(--app-safe-bottom));
  background: rgba(0, 0, 0, 0.48);
  animation: restaurants-fs-fade 0.2s ease;
}

.restaurants-map-fs-sheet {
  width: 100%;
  max-width: 32rem;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bs-body-bg);
  border-radius: 1rem;
  overflow: hidden;
  box-shadow: 0 0.5rem 2rem rgba(0, 0, 0, 0.2);
}

.restaurants-map-fs-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--bs-border-color-translucent);
}

.restaurants-map-fs-body {
  flex: 1;
  min-height: 0;
}

@keyframes restaurants-fs-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .restaurants-map-fs-backdrop {
    animation: none;
  }
}
</style>
