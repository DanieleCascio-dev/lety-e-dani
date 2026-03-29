import { importLibrary, setOptions } from '@googlemaps/js-api-loader'

let optionsApplied = false
let loadPromise: Promise<void> | null = null

/**
 * Carica Maps + marker library una sola volta; `setOptions` viene chiamato una sola volta
 * (evita il warn del loader quando più componenti montano mappe).
 */
export function ensureGoogleMapsRuntime(): Promise<void> {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim()
  if (!key) return Promise.reject(new Error('no key'))
  if (!optionsApplied) {
    setOptions({ key, v: 'weekly', language: 'it', region: 'IT' })
    optionsApplied = true
  }
  if (!loadPromise) {
    loadPromise = (async () => {
      await importLibrary('maps')
      await importLibrary('marker')
    })().catch((err: unknown) => {
      loadPromise = null
      throw err
    })
  }
  return loadPromise
}

/** Richiesto per AdvancedMarkerElement; override con VITE_GOOGLE_MAP_ID in .env se serve. */
export function googleMapId(): string {
  return import.meta.env.VITE_GOOGLE_MAP_ID?.trim() || 'DEMO_MAP_ID'
}
