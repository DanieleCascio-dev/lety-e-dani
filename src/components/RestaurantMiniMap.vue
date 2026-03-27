<script setup lang="ts">
import { importLibrary, setOptions } from '@googlemaps/js-api-loader'
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { RestaurantMapMarker } from '@/types/restaurants'

const props = withDefaults(
  defineProps<{
    markers: RestaurantMapMarker[]
    height?: string
  }>(),
  { height: '220px' },
)

const containerEl = ref<HTMLElement | null>(null)

/** Google Maps (preferito) o Leaflet se manca VITE_GOOGLE_MAPS_API_KEY */
const mapBackend = ref<'google' | 'leaflet' | null>(null)

let leafMap: L.Map | null = null
let leafLayer: L.LayerGroup | null = null

let gmap: google.maps.Map | null = null
let gmarkers: google.maps.Marker[] = []

let mapsLoadPromise: Promise<void> | null = null

function googleMapsKey(): string | undefined {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim()
}

function ensureGoogleMapsLoaded(): Promise<void> {
  const key = googleMapsKey()
  if (!key) return Promise.reject(new Error('no key'))
  if (!mapsLoadPromise) {
    setOptions({ key, v: 'weekly', language: 'it', region: 'IT' })
    mapsLoadPromise = importLibrary('maps')
      .then(() => undefined)
      .catch((err: unknown) => {
        mapsLoadPromise = null
        throw err
      })
  }
  return mapsLoadPromise
}

function teardownLeaflet() {
  if (leafMap) {
    leafMap.remove()
    leafMap = null
    leafLayer = null
  }
}

function teardownGoogle() {
  if (gmap) {
    google.maps.event.clearInstanceListeners(gmap)
    gmap = null
  }
  for (const m of gmarkers) {
    m.setMap(null)
  }
  gmarkers = []
}

function teardown() {
  teardownLeaflet()
  teardownGoogle()
  mapBackend.value = null
}

function iconForKind(kind: 'user' | 'place'): google.maps.Symbol {
  const fill = kind === 'user' ? '#0d6efd' : '#198754'
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: kind === 'user' ? 10 : 8,
    fillColor: fill,
    fillOpacity: 0.95,
    strokeColor: '#ffffff',
    strokeWeight: 2,
  }
}

function redrawGoogle() {
  if (!gmap || !containerEl.value) return
  for (const m of gmarkers) {
    m.setMap(null)
  }
  gmarkers = []
  const bounds = new google.maps.LatLngBounds()
  let has = false
  for (const m of props.markers) {
    if (!Number.isFinite(m.lat) || !Number.isFinite(m.lng)) continue
    const pos = { lat: m.lat, lng: m.lng }
    bounds.extend(pos)
    has = true
    const marker = new google.maps.Marker({
      position: pos,
      map: gmap,
      title: m.label ?? (m.kind === 'user' ? 'La tua posizione' : 'Ristorante'),
      icon: iconForKind(m.kind),
    })
    gmarkers.push(marker)
  }
  if (!has) return
  if (props.markers.length === 1) {
    const m = props.markers[0]
    if (m && Number.isFinite(m.lat) && Number.isFinite(m.lng)) {
      gmap.setCenter({ lat: m.lat, lng: m.lng })
      gmap.setZoom(14)
    }
  } else {
    gmap.fitBounds(bounds, 48)
    const z = gmap.getZoom()
    if (z != null && z > 15) gmap.setZoom(15)
  }
}

function redrawLeaflet() {
  if (!leafMap || !leafLayer) return
  leafLayer.clearLayers()
  const latLngs: L.LatLng[] = []
  for (const m of props.markers) {
    if (!Number.isFinite(m.lat) || !Number.isFinite(m.lng)) continue
    const color = m.kind === 'user' ? '#0d6efd' : '#157347'
    const r = m.kind === 'user' ? 10 : 8
    const c = L.circleMarker([m.lat, m.lng], {
      radius: r,
      color: '#ffffff',
      weight: 3,
      fillColor: color,
      fillOpacity: 0.92,
    })
    const text = m.label ?? (m.kind === 'user' ? 'La tua posizione' : 'Ristorante')
    c.bindPopup(text)
    c.addTo(leafLayer)
    latLngs.push(L.latLng(m.lat, m.lng))
  }
  if (latLngs.length === 0) return
  if (latLngs.length === 1) {
    const only = latLngs[0]
    if (only) leafMap.setView(only, 14)
  } else {
    leafMap.fitBounds(L.latLngBounds(latLngs), { padding: [28, 28], maxZoom: 15 })
  }
}

async function setup() {
  if (!containerEl.value) return
  if (props.markers.length === 0) {
    teardown()
    return
  }
  const valid = props.markers.filter(
    (m) => Number.isFinite(m.lat) && Number.isFinite(m.lng),
  )
  if (valid.length === 0) {
    teardown()
    return
  }

  const useGoogle = !!googleMapsKey()

  if (useGoogle) {
    try {
      await ensureGoogleMapsLoaded()
    } catch {
      mapBackend.value = 'leaflet'
      setupLeafletOnly()
      redrawLeaflet()
      void nextTick(() => leafMap?.invalidateSize())
      return
    }
    if (mapBackend.value === 'leaflet') {
      teardownLeaflet()
    }
    mapBackend.value = 'google'
    if (!gmap && containerEl.value) {
      const first = valid[0]
      gmap = new google.maps.Map(containerEl.value, {
        scrollwheel: false,
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: true,
        gestureHandling: 'cooperative',
        zoomControl: true,
        center: first ? { lat: first.lat, lng: first.lng } : { lat: 45.4, lng: 11.88 },
        zoom: 13,
      })
    }
    redrawGoogle()
    void nextTick(() => {
      if (gmap) google.maps.event.trigger(gmap, 'resize')
    })
    return
  }

  mapBackend.value = 'leaflet'
  setupLeafletOnly()
  redrawLeaflet()
  void nextTick(() => leafMap?.invalidateSize())
}

function setupLeafletOnly() {
  if (!containerEl.value) return
  if (!leafMap) {
    leafMap = L.map(containerEl.value, {
      scrollWheelZoom: false,
      zoomControl: true,
    })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright" rel="noopener">OSM</a> © CARTO',
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(leafMap)
    leafLayer = L.layerGroup().addTo(leafMap)
  }
}

watch(
  () => props.markers,
  () => {
    void nextTick(() => setup())
  },
  { deep: true },
)

onMounted(() => {
  void nextTick(() => setup())
})

onUnmounted(() => {
  teardown()
})
</script>

<template>
  <div class="restaurant-map-wrap">
    <div
      v-if="markers.length > 0"
      ref="containerEl"
      class="restaurant-mini-map rounded-3 border shadow-sm overflow-hidden bg-light"
      :style="{ height, minHeight: height }"
      role="img"
      :aria-label="'Mappa con ' + markers.length + ' punti'"
    />
    <p v-else class="text-secondary small mb-0">Nessuna posizione da mostrare sulla mappa.</p>
    <p
      v-if="markers.length > 0 && !googleMapsKey()"
      class="small text-secondary mt-2 mb-0"
    >
      Mappa di fallback (OpenStreetMap). Per Google Maps aggiungi
      <code class="small">VITE_GOOGLE_MAPS_API_KEY</code> in <code class="small">.env.local</code> e
      abilita «Maps JavaScript API» sulla stessa chiave Google Cloud.
    </p>
  </div>
</template>

<style scoped>
.restaurant-mini-map {
  z-index: 0;
  min-height: 12rem;
}

.restaurant-mini-map :deep(.leaflet-control-zoom) {
  border: none !important;
  box-shadow: 0 0.125rem 0.5rem rgba(0, 0, 0, 0.12) !important;
  border-radius: 0.5rem;
  overflow: hidden;
}
</style>
