<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ensureGoogleMapsRuntime, googleMapId } from '@/lib/googleMapsLoader'
import type { RestaurantMapMarker } from '@/types/restaurants'

/** Pin rosso (stile Maps) per fallback Leaflet — SVG inline, niente dipendenza da google al load. */
const LEAFLET_RED_PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="25" height="41" viewBox="0 0 25 41" aria-hidden="true"><path fill="#EA4335" d="M12.5 0C5.6 0 0 5.6 0 12.5c0 1.1.1 2.1.1 3.1C.1 24.5 12.5 41 12.5 41S25 24.5 25 15.6c0-1-.1-2-.1-3.1C25 5.6 19.4 0 12.5 0z"/><circle fill="#fff" cx="12.5" cy="12.5" r="3.5"/></svg>`

const PLACE_LABEL_MAX_LEN = 44

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function truncatePlaceLabel(s: string): string {
  const t = s.trim()
  if (t.length <= PLACE_LABEL_MAX_LEN) return t
  return `${t.slice(0, PLACE_LABEL_MAX_LEN - 1)}…`
}

/** Valore attributo HTML (es. title su pill troncata). */
function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\r?\n/g, ' ')
}

function pillLabelSpanHtml(fullRaw: string, pillClass: string): string {
  const full = fullRaw.trim()
  const display = truncatePlaceLabel(full)
  const safe = escapeHtml(display)
  const truncated = full.length > PLACE_LABEL_MAX_LEN
  const titleAttr = truncated ? ` title="${escapeAttr(full)}"` : ''
  return `<span class="${pillClass}"${titleAttr}>${safe}</span>`
}

/**
 * Solo etichetta nome (pin accanto all’AdvancedMarker predefinito).
 * La classe viene creata solo dopo `importLibrary('maps')`, così `google` esiste.
 */
type PlaceNameLabelOverlayConstructor = new (
  pos: google.maps.LatLngLiteral,
  label: string,
  onClick: () => void,
) => google.maps.OverlayView

let placeNameLabelOverlayCtor: PlaceNameLabelOverlayConstructor | null = null

function getPlaceNameLabelOverlayCtor(): PlaceNameLabelOverlayConstructor {
  const g = globalThis.google as typeof google | undefined
  if (!g?.maps?.OverlayView) {
    throw new Error('Google Maps API not loaded')
  }
  if (placeNameLabelOverlayCtor) return placeNameLabelOverlayCtor

  const Ctor: PlaceNameLabelOverlayConstructor = class PlaceNameLabelOverlay extends g.maps.OverlayView {
    private div!: HTMLDivElement
    private readonly posLit: google.maps.LatLngLiteral

    constructor(pos: google.maps.LatLngLiteral, label: string, onClick: () => void) {
      super()
      this.posLit = pos
      this.div = document.createElement('div')
      this.div.className = 'place-marker-name-gmap'
      this.div.innerHTML = pillLabelSpanHtml(label, 'place-marker-label-gmap__pill')
      this.div.addEventListener('click', (e) => {
        e.stopPropagation()
        onClick()
      })
      this.div.setAttribute('role', 'button')
      this.div.tabIndex = 0
      this.div.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      })
    }

    override onAdd(): void {
      this.getPanes()?.overlayMouseTarget.appendChild(this.div)
    }

    override draw(): void {
      const projection = this.getProjection()
      if (!projection) return
      const p = projection.fromLatLngToDivPixel(new g.maps.LatLng(this.posLit))
      if (!p) return
      // Ancora sul pin predefinito (punta in basso): etichetta a destra e centrata sul fusto
      this.div.style.left = `${p.x + 10}px`
      this.div.style.top = `${p.y - 20}px`
      this.div.style.position = 'absolute'
      this.div.style.transform = 'translate(0, -50%)'
      this.div.style.pointerEvents = 'auto'
      this.div.style.zIndex = '1'
    }

    override onRemove(): void {
      this.div.remove()
    }
  }
  placeNameLabelOverlayCtor = Ctor
  return Ctor
}

const emit = defineEmits<{
  /** Click su un marker locale (non posizione utente) */
  'place-click': [placeKey: string]
}>()

const props = withDefaults(
  defineProps<{
    markers: RestaurantMapMarker[]
    height?: string
    /** Se impostato, centra e ingrandisce su quel marker (dopo il disegno). */
    focusPlaceKey?: string | null
  }>(),
  { height: '220px', focusPlaceKey: null },
)

const containerEl = ref<HTMLElement | null>(null)

/** Google Maps (preferito) o Leaflet se manca VITE_GOOGLE_MAPS_API_KEY */
const mapBackend = ref<'google' | 'leaflet' | null>(null)

let leafMap: L.Map | null = null
let leafLayer: L.LayerGroup | null = null

let gmap: google.maps.Map | null = null
let gmarkers: google.maps.marker.AdvancedMarkerElement[] = []
/** Marker locale (AdvancedMarker pin predefinito); focus mappa. */
const gMarkerByPlaceKey = new Map<string, google.maps.marker.AdvancedMarkerElement>()
let gPlaceOverlays: google.maps.OverlayView[] = []
let leafMarkerByPlaceKey = new Map<string, L.Marker | L.CircleMarker>()

function googleMapsKey(): string | undefined {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim()
}

function createUserPositionDotElement(): HTMLDivElement {
  const el = document.createElement('div')
  el.setAttribute('aria-hidden', 'true')
  el.style.cssText =
    'width:20px;height:20px;border-radius:50%;background:#0d6efd;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.28);'
  return el
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
    m.map = null
  }
  gmarkers = []
  for (const o of gPlaceOverlays) {
    o.setMap(null)
  }
  gPlaceOverlays = []
  gMarkerByPlaceKey.clear()
}

function teardown() {
  teardownLeaflet()
  teardownGoogle()
  mapBackend.value = null
}

function applyFocus() {
  const key = props.focusPlaceKey
  if (!key) return
  if (mapBackend.value === 'google' && gmap) {
    const mk = gMarkerByPlaceKey.get(key)
    const p = mk?.position
    if (p) {
      gmap.panTo(p)
      gmap.setZoom(16)
    }
    return
  }
  if (mapBackend.value === 'leaflet' && leafMap) {
    const layer = leafMarkerByPlaceKey.get(key)
    if (layer) {
      const ll = layer.getLatLng()
      leafMap.setView(ll, 16)
    }
  }
}

function redrawGoogle() {
  if (!gmap || !containerEl.value) return
  const AdvancedMarkerElement = google.maps.marker.AdvancedMarkerElement
  for (const m of gmarkers) {
    m.map = null
  }
  gmarkers = []
  for (const o of gPlaceOverlays) {
    o.setMap(null)
  }
  gPlaceOverlays = []
  gMarkerByPlaceKey.clear()
  const bounds = new google.maps.LatLngBounds()
  let has = false
  for (const m of props.markers) {
    if (!Number.isFinite(m.lat) || !Number.isFinite(m.lng)) continue
    const pos = { lat: m.lat, lng: m.lng }
    bounds.extend(pos)
    has = true
    const title = m.label ?? (m.kind === 'user' ? 'La tua posizione' : 'Ristorante')
    if (m.kind === 'user') {
      const marker = new AdvancedMarkerElement({
        map: gmap,
        position: pos,
        title,
        content: createUserPositionDotElement(),
      })
      gmarkers.push(marker)
      continue
    }
    const labelText = m.label ?? 'Ristorante'
    const placeMarker = new AdvancedMarkerElement({
      map: gmap,
      position: pos,
      title: labelText,
    })
    placeMarker.addEventListener('gmp-click', () => {
      if (m.placeKey) emit('place-click', m.placeKey)
    })
    gmarkers.push(placeMarker)
    if (m.placeKey) {
      gMarkerByPlaceKey.set(m.placeKey, placeMarker)
    }

    const OverlayCtor = getPlaceNameLabelOverlayCtor()
    const overlay = new OverlayCtor(pos, labelText, () => {
      if (m.placeKey) emit('place-click', m.placeKey)
    })
    overlay.setMap(gmap)
    gPlaceOverlays.push(overlay)
  }
  if (!has) return
  const skipFit = Boolean(props.focusPlaceKey && gMarkerByPlaceKey.has(props.focusPlaceKey))
  if (skipFit) {
    applyFocus()
    return
  }
  if (props.markers.filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng)).length === 1) {
    const m = props.markers.find((x) => Number.isFinite(x.lat) && Number.isFinite(x.lng))
    if (m) {
      gmap.setCenter({ lat: m.lat, lng: m.lng })
      gmap.setZoom(14)
    }
  } else {
    gmap.fitBounds(bounds, 48)
    const z = gmap.getZoom()
    if (z != null && z > 15) gmap.setZoom(15)
  }
  applyFocus()
}

function redrawLeaflet() {
  if (!leafMap || !leafLayer) return
  leafLayer.clearLayers()
  leafMarkerByPlaceKey = new Map()
  const latLngs: L.LatLng[] = []
  for (const m of props.markers) {
    if (!Number.isFinite(m.lat) || !Number.isFinite(m.lng)) continue
    const text = m.label ?? (m.kind === 'user' ? 'La tua posizione' : 'Ristorante')
    if (m.kind === 'user') {
      const c = L.circleMarker([m.lat, m.lng], {
        radius: 10,
        color: '#ffffff',
        weight: 3,
        fillColor: '#0d6efd',
        fillOpacity: 0.92,
      })
      c.bindPopup(text)
      c.addTo(leafLayer)
    } else {
      const divIcon = L.divIcon({
        html: `<div class="place-marker-label-leaflet"><span class="place-marker-label-leaflet__pin">${LEAFLET_RED_PIN_SVG}</span>${pillLabelSpanHtml(text, 'place-marker-label-leaflet__pill')}</div>`,
        className: 'place-marker-label-leaflet-wrap',
        iconSize: [260, 41],
        iconAnchor: [12, 41],
      })
      const mk = L.marker([m.lat, m.lng], {
        title: text,
        icon: divIcon,
      })
      if (m.placeKey) {
        leafMarkerByPlaceKey.set(m.placeKey, mk)
        mk.on('click', () => {
          emit('place-click', m.placeKey as string)
        })
      }
      mk.addTo(leafLayer)
    }
    latLngs.push(L.latLng(m.lat, m.lng))
  }
  if (latLngs.length === 0) return
  const skipFit = Boolean(props.focusPlaceKey && leafMarkerByPlaceKey.has(props.focusPlaceKey))
  if (skipFit) {
    applyFocus()
    return
  }
  if (latLngs.length === 1) {
    const only = latLngs[0]
    if (only) leafMap.setView(only, 14)
  } else {
    leafMap.fitBounds(L.latLngBounds(latLngs), { padding: [28, 28], maxZoom: 15 })
  }
  applyFocus()
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
      await ensureGoogleMapsRuntime()
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
        mapId: googleMapId(),
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

watch(
  () => props.focusPlaceKey,
  () => {
    void nextTick(() => applyFocus())
  },
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

/* Etichetta nome (Google: overlay accanto al pin predefinito rosso) */
.restaurant-map-wrap :deep(.place-marker-name-gmap) {
  display: block;
  white-space: nowrap;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.15));
}

.restaurant-map-wrap :deep(.place-marker-label-gmap__pill) {
  max-width: 14rem;
  overflow: hidden;
  text-overflow: ellipsis;
  background: #fff;
  color: #1a1a1a;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.2;
  padding: 0.15rem 0.45rem 0.18rem;
  border-radius: 0.25rem;
  border: 1px solid rgba(0, 0, 0, 0.12);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  margin-bottom: 0.22rem;
}

.restaurant-map-wrap :deep(.place-marker-label-leaflet-wrap) {
  background: transparent !important;
  border: none !important;
}

.restaurant-map-wrap :deep(.place-marker-label-leaflet) {
  display: flex;
  align-items: flex-end;
  gap: 0.2rem;
  white-space: nowrap;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.15));
}

.restaurant-map-wrap :deep(.place-marker-label-leaflet__pin) {
  flex-shrink: 0;
  line-height: 0;
}

.restaurant-map-wrap :deep(.place-marker-label-leaflet__pin svg) {
  display: block;
}

.restaurant-map-wrap :deep(.place-marker-label-leaflet__pill) {
  max-width: 14rem;
  overflow: hidden;
  text-overflow: ellipsis;
  background: #fff;
  color: #1a1a1a;
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.2;
  padding: 0.15rem 0.45rem 0.18rem;
  border-radius: 0.25rem;
  border: 1px solid rgba(0, 0, 0, 0.12);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  margin-bottom: 0.22rem;
}
</style>
