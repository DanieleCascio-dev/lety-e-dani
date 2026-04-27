import { ref, type Ref } from 'vue'
import { getSupabaseClient } from '@/lib/supabase'
import type { UserId } from '@/types/app'
import type { SavedRestaurant, VeganRestaurantSearchItem } from '@/types/restaurants'
import type { PlaceDetailsResult } from '@/composables/useRestaurantPlaceSuggest'

type GardenRef = Ref<{ id: string; name: string } | null>

type SavedRestaurantRow = {
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
}

function mapRow(r: SavedRestaurantRow): SavedRestaurant {
  const role = (String(r.created_by ?? '').trim() || 'daniele') as SavedRestaurant['createdBy']
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

export function savedRestaurantToSearchItem(r: SavedRestaurant): VeganRestaurantSearchItem {
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

export function placeDetailsToSearchItem(d: PlaceDetailsResult): VeganRestaurantSearchItem {
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

function normalizedRating(value: number): number {
  return Math.min(5, Math.max(1, Math.round(value)))
}

export function useRestaurantsSaved(options: {
  activeUser: Ref<UserId>
  currentGarden: GardenRef
  refreshGardenContext: () => Promise<unknown>
}) {
  const listLoading = ref(false)
  const listError = ref<string | null>(null)
  const savedList = ref<SavedRestaurant[]>([])
  let loadSeq = 0
  const ratingDebounce: Record<string, ReturnType<typeof setTimeout>> = {}

  async function loadSaved() {
    const seq = ++loadSeq
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
      await options.refreshGardenContext()
      const { data, error } = await sb
        .from('saved_restaurants')
        .select(
          'id, created_at, created_by, name, maps_url, rating, place_id, address, category_label, google_rating, google_review_count, extra_notes, latitude, longitude',
        )
        .order('created_at', { ascending: false })
      if (seq !== loadSeq) return
      if (error) {
        listError.value = error.message
        savedList.value = []
        return
      }
      savedList.value = (data ?? []).map((row) => mapRow(row as SavedRestaurantRow))
    } finally {
      if (seq === loadSeq) listLoading.value = false
    }
  }

  async function addPlace(
    d: PlaceDetailsResult,
    rating: number,
  ): Promise<{ ok: boolean; error?: string }> {
    const sb = getSupabaseClient()
    if (!sb) return { ok: false, error: 'Supabase non configurato.' }
    if (d.placeId && savedList.value.some((s) => s.placeId === d.placeId)) {
      return { ok: false, error: 'Questo locale e gia nella lista.' }
    }
    const gid = options.currentGarden.value?.id
    if (!gid) {
      return {
        ok: false,
        error: 'Nessuno spazio assegnato. Chiedi a un amministratore di aggiungerti a un garden.',
      }
    }
    const { error } = await sb.from('saved_restaurants').insert({
      created_by: options.activeUser.value,
      garden_id: gid,
      name: d.name,
      maps_url: d.mapsUrl,
      rating: normalizedRating(rating),
      place_id: d.placeId,
      address: d.address || null,
      category_label: d.categoryLabel || null,
      google_rating: d.googleRating,
      google_review_count: d.googleReviewCount,
      extra_notes: d.notes || null,
      latitude: d.latitude,
      longitude: d.longitude,
    })
    if (error) return { ok: false, error: error.message }
    await loadSaved()
    return { ok: true }
  }

  function isAlreadySaved(item: VeganRestaurantSearchItem): boolean {
    const pid = item.placeId
    if (pid && savedList.value.some((s) => s.placeId === pid)) return true
    return savedList.value.some((s) => s.mapsUrl === item.mapsUrl)
  }

  async function addSearchItem(item: VeganRestaurantSearchItem): Promise<{ ok: boolean; error?: string }> {
    if (isAlreadySaved(item)) return { ok: false, error: 'Questo locale e gia nella lista.' }
    const sb = getSupabaseClient()
    if (!sb) return { ok: false, error: 'Supabase non configurato.' }
    const gid = options.currentGarden.value?.id
    if (!gid) {
      return {
        ok: false,
        error: 'Nessuno spazio assegnato. Chiedi a un amministratore di aggiungerti a un garden.',
      }
    }
    const { error } = await sb.from('saved_restaurants').insert({
      created_by: options.activeUser.value,
      garden_id: gid,
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
    if (error) return { ok: false, error: error.message }
    await loadSaved()
    return { ok: true }
  }

  async function persistOurRating(id: string, value: number) {
    const sb = getSupabaseClient()
    if (!sb) return
    const { error } = await sb
      .from('saved_restaurants')
      .update({ rating: normalizedRating(value) })
      .eq('id', id)
    if (error) listError.value = error.message
  }

  function updateOurRating(id: string, value: number) {
    const rating = normalizedRating(value)
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

  function cancelPendingLoads() {
    loadSeq += 1
    Object.values(ratingDebounce).forEach(clearTimeout)
  }

  return {
    listLoading,
    listError,
    savedList,
    loadSaved,
    addPlace,
    addSearchItem,
    updateOurRating,
    removeSaved,
    isAlreadySaved,
    cancelPendingLoads,
  }
}
