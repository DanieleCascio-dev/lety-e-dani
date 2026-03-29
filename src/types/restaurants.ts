/** Riga tabella `saved_restaurants`. */
export interface SavedRestaurant {
  id: string
  createdAt: string
  createdBy: 'daniele' | 'letizia'
  name: string
  mapsUrl: string
  /** Valutazione nostra 1–5 */
  rating: number
  placeId?: string | null
  address?: string | null
  categoryLabel?: string | null
  googleRating?: number | null
  googleReviewCount?: number | null
  extraNotes?: string | null
  latitude?: number | null
  longitude?: number | null
}

export interface VeganRestaurantSearchItem {
  name: string
  address: string
  mapsUrl: string
  notes: string
  latitude: number | null
  longitude: number | null
  /** Google Places id (resource name), se da Places API */
  placeId?: string | null
  /** Valutazione media Google (0–5) */
  rating?: number | null
  userRatingCount?: number | null
  /** Distanza approssimativa dal punto di ricerca (km) */
  distanceKm?: number | null
  /** Priorità elenco: 100% vegano, poi opzioni vegane, ecc. */
  categoryLabel?: string | null
}

export interface VeganRestaurantSearchResult {
  restaurants: VeganRestaurantSearchItem[]
  modelNote: string | null
}

/** Marker per Leaflet (posizione utente o ristorante). */
export type RestaurantMapMarker = {
  lat: number
  lng: number
  label?: string
  kind: 'user' | 'place'
  /** Chiave stabile per collegare click sulla mappa alla riga in elenco */
  placeKey?: string
}
