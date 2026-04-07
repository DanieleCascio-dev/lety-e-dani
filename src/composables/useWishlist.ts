import { computed, ref, watch } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import type { GroceryListMeta, UserId } from '@/types/app'
import { getSupabaseClient } from '@/lib/supabase'
import type {
  LinkPreviewPayload,
  WishlistItem,
  WishlistItemStatus,
} from '@/types/wishlist'
import { cleanProductTitle } from '@/lib/wishlistNormalize'
import { authSession } from '@/auth/authSession'
import { queryAbortSignal } from '@/lib/supabaseQuery'
import {
  activeUser,
  currentGarden,
  groceryListDisplayName,
  refreshGardenContext,
} from '@/composables/useAppStorage'

const SELECTED_WISHLIST_LIST_KEY = 'lety-dani:selected-wishlist-list-id'

function readPersistedSelectedWishListId(): string | null {
  try {
    return localStorage.getItem(SELECTED_WISHLIST_LIST_KEY)
  } catch {
    return null
  }
}

function writePersistedSelectedWishListId(id: string | null) {
  try {
    if (id) localStorage.setItem(SELECTED_WISHLIST_LIST_KEY, id)
    else localStorage.removeItem(SELECTED_WISHLIST_LIST_KEY)
  } catch {
    /* ignore */
  }
}

function normalizeListTitle(raw: string | undefined): string {
  return (raw ?? '').trim().slice(0, 80)
}

function mapListRow(r: {
  id: string
  created_at: string
  created_by: string
  title?: string | null
}): GroceryListMeta {
  const by = String(r.created_by ?? '').trim()
  return {
    id: r.id,
    createdAt: r.created_at,
    createdBy: (by || 'daniele') as import('@/types/app').UserId,
    title: typeof r.title === 'string' ? r.title.trim() : '',
  }
}

function mapRow(r: Record<string, unknown>): WishlistItem {
  const raw = String(r.created_by ?? '').trim()
  const by = (raw || 'daniele') as WishlistItem['createdBy']
  const st = r.status
  const status: WishlistItemStatus =
    st === 'purchased' || st === 'dismissed' ? st : 'active'
  return {
    id: String(r.id),
    listId: String(r.list_id),
    createdAt: String(r.created_at),
    createdBy: by,
    status,
    url: String(r.url),
    title: r.title != null ? String(r.title) : null,
    description: r.description != null ? String(r.description) : null,
    imageUrl: r.image_url != null ? String(r.image_url) : null,
    siteName: r.site_name != null ? String(r.site_name) : null,
    priceText: r.price_text != null ? String(r.price_text) : null,
    priceAmount:
      r.price_amount != null && r.price_amount !== ''
        ? Number(r.price_amount)
        : null,
    currency: r.currency != null ? String(r.currency) : null,
    notes: r.notes != null ? String(r.notes) : null,
    previewFetchedAt:
      r.preview_fetched_at != null ? String(r.preview_fetched_at) : null,
    previewNote: r.preview_note != null ? String(r.preview_note) : null,
  }
}

const wishLists = ref<GroceryListMeta[]>([])
const wishListsLoading = ref(false)
const selectedWishListId = ref<string | null>(readPersistedSelectedWishListId())
const items = ref<WishlistItem[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

let wishChannel: RealtimeChannel | null = null
let wishItemsRealtimeDebounceTimer: ReturnType<typeof setTimeout> | null = null
const WISH_ITEMS_REALTIME_DEBOUNCE_MS = 250

watch(selectedWishListId, (id: string | null) => {
  writePersistedSelectedWishListId(id)
})

function clearWishItemsRealtimeDebounce() {
  if (wishItemsRealtimeDebounceTimer !== null) {
    clearTimeout(wishItemsRealtimeDebounceTimer)
    wishItemsRealtimeDebounceTimer = null
  }
}

function scheduleWishItemsRefetchFromRealtime() {
  clearWishItemsRealtimeDebounce()
  wishItemsRealtimeDebounceTimer = setTimeout(() => {
    wishItemsRealtimeDebounceTimer = null
    void fetchWishItemsFromSupabase(true)
  }, WISH_ITEMS_REALTIME_DEBOUNCE_MS)
}

function teardownWishRealtime() {
  clearWishItemsRealtimeDebounce()
  const sb = getSupabaseClient()
  if (wishChannel && sb) void sb.removeChannel(wishChannel)
  wishChannel = null
}

async function fetchWishListsFromSupabase(silent: boolean) {
  const sb = getSupabaseClient()
  if (!sb) return
  if (!silent) wishListsLoading.value = true
  try {
    const { data, error: qErr } = await sb
      .from('wishlist_lists')
      .select('id, created_at, created_by, title')
      .order('created_at', { ascending: false })
      .abortSignal(queryAbortSignal())
    if (qErr) {
      error.value = qErr.message
      return
    }
    wishLists.value = (data ?? []).map((r: {
      id: string
      created_at: string
      created_by: string
      title?: string | null
    }) => mapListRow(r))
  } finally {
    if (!silent) wishListsLoading.value = false
  }
}

async function ensureSelectedWishListAfterFetch() {
  const sid = selectedWishListId.value
  if (sid && wishLists.value.some((l) => l.id === sid)) {
    writePersistedSelectedWishListId(sid)
    return
  }
  const first = wishLists.value[0]?.id ?? null
  selectedWishListId.value = first
}

async function fetchWishItemsFromSupabase(silent: boolean) {
  const sb = getSupabaseClient()
  if (!sb) {
    if (!silent) loading.value = false
    items.value = []
    error.value =
      'La lista desideri richiede Supabase e login. Configura .env.local e accedi.'
    return
  }
  const lid = selectedWishListId.value
  if (!lid) {
    if (!silent) loading.value = false
    items.value = []
    return
  }
  if (!silent) loading.value = true
  error.value = null
  try {
    const { data, error: qErr } = await sb
      .from('wishlist_items')
      .select(
        'id, list_id, created_at, created_by, status, url, title, description, image_url, site_name, price_text, price_amount, currency, notes, preview_fetched_at, preview_note',
      )
      .eq('list_id', lid)
      .order('created_at', { ascending: false })
      .abortSignal(queryAbortSignal())
    if (qErr) {
      error.value = qErr.message
      items.value = []
      return
    }
    items.value = (data ?? []).map((row) =>
      mapRow(row as Record<string, unknown>),
    )
  } finally {
    if (!silent) loading.value = false
  }
}

function setupWishRealtimeChannel() {
  const sb = getSupabaseClient()
  if (!sb || wishChannel) return
  const refresh = async () => {
    await fetchWishListsFromSupabase(true)
    await ensureSelectedWishListAfterFetch()
    await fetchWishItemsFromSupabase(true)
  }
  wishChannel = sb
    .channel('wishlist_scope')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'wishlist_lists' },
      () => {
        void refresh()
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'wishlist_items' },
      () => {
        scheduleWishItemsRefetchFromRealtime()
      },
    )
    .subscribe()
}

async function startWishSync() {
  const sb = getSupabaseClient()
  if (!sb) return
  teardownWishRealtime()
  await fetchWishListsFromSupabase(false)
  await ensureSelectedWishListAfterFetch()
  await fetchWishItemsFromSupabase(false)
  queueMicrotask(() => setupWishRealtimeChannel())
}

export function ensureWishRealtimeConnected() {
  setupWishRealtimeChannel()
}

export async function refreshWishData(options?: { silent?: boolean }) {
  const sb = getSupabaseClient()
  if (!sb || !authSession.value?.user) return
  const silent = options?.silent !== false
  await refreshGardenContext()
  await fetchWishListsFromSupabase(silent)
  await ensureSelectedWishListAfterFetch()
  await fetchWishItemsFromSupabase(silent)
}

export function resetWishlistState() {
  teardownWishRealtime()
  wishLists.value = []
  selectedWishListId.value = null
  items.value = []
  error.value = null
  wishListsLoading.value = false
  loading.value = false
  try {
    localStorage.removeItem(SELECTED_WISHLIST_LIST_KEY)
  } catch {
    /* ignore */
  }
}

export async function selectWishList(id: string) {
  selectedWishListId.value = id
  const sb = getSupabaseClient()
  if (sb) await fetchWishItemsFromSupabase(false)
}

export async function createWishList(name?: string): Promise<boolean> {
  error.value = null
  const title = normalizeListTitle(name)
  const sb = getSupabaseClient()
  if (!sb) {
    error.value = 'La lista desideri richiede Supabase e login.'
    return false
  }
  const gid = currentGarden.value?.id
  if (!gid) {
    error.value =
      'Nessuno spazio assegnato. Chiedi a un amministratore di aggiungerti a un garden.'
    return false
  }
  const { data, error: qErr } = await sb
    .from('wishlist_lists')
    .insert({ created_by: activeUser.value, title, garden_id: gid })
    .select('id, created_at, created_by, title')
    .single()
  if (qErr) {
    error.value = qErr.message
    return false
  }
  const meta = mapListRow(
    data as { id: string; created_at: string; created_by: string; title?: string | null },
  )
  wishLists.value = [meta, ...wishLists.value]
  selectedWishListId.value = meta.id
  items.value = []
  return true
}

export async function renameWishList(id: string, name: string): Promise<boolean> {
  error.value = null
  const title = normalizeListTitle(name)
  const sb = getSupabaseClient()
  if (!sb) return false
  const { error: qErr } = await sb.from('wishlist_lists').update({ title }).eq('id', id)
  if (qErr) {
    error.value = qErr.message
    return false
  }
  wishLists.value = wishLists.value.map((l) =>
    l.id === id ? { ...l, title } : l,
  )
  return true
}

export async function deleteWishList(id: string) {
  error.value = null
  const wasSelected = selectedWishListId.value === id
  const sb = getSupabaseClient()
  if (!sb) return
  const { error: qErr } = await sb.from('wishlist_lists').delete().eq('id', id)
  if (qErr) {
    error.value = qErr.message
    return
  }
  wishLists.value = wishLists.value.filter((l) => l.id !== id)
  if (wasSelected) {
    const nid = wishLists.value[0]?.id ?? null
    selectedWishListId.value = nid
    await fetchWishItemsFromSupabase(false)
  }
}

export function useWishlist() {
  const currentWishListMeta = computed(
    () => wishLists.value.find((l) => l.id === selectedWishListId.value) ?? null,
  )

  const isWishCloud = computed(() => getSupabaseClient() !== null)

  async function loadItems(): Promise<void> {
    await fetchWishItemsFromSupabase(false)
  }

  async function fetchPreview(url: string): Promise<LinkPreviewPayload> {
    const sb = getSupabaseClient()
    if (!sb) throw new Error('Supabase non configurato')
    const { data, error: fnErr } = await sb.functions.invoke('link-preview', {
      body: { url },
    })
    if (fnErr) throw new Error(fnErr.message)
    const d = data as {
      ok?: boolean
      preview?: LinkPreviewPayload
      error?: string
    }
    if (d?.preview) return d.preview
    throw new Error(d?.error ?? 'Anteprima non disponibile')
  }

  async function saveItemFromPreview(
    href: string,
    preview: LinkPreviewPayload,
    createdBy: UserId,
  ): Promise<{ ok: boolean; message?: string }> {
    const sb = getSupabaseClient()
    if (!sb) {
      return { ok: false, message: 'Supabase non configurato' }
    }
    const lid = selectedWishListId.value
    if (!lid) {
      return { ok: false, message: 'Crea o seleziona una lista prima.' }
    }

    const nowIso = new Date().toISOString()
    const row = {
      list_id: lid,
      url: href,
      created_by: createdBy,
      status: 'active' as const,
      title: cleanProductTitle(preview.title ?? 'Articolo'),
      description: preview.description,
      image_url: preview.imageUrl,
      site_name: preview.siteName,
      price_text: preview.priceText,
      price_amount: preview.priceAmount,
      currency: preview.currency ?? 'EUR',
      preview_fetched_at: nowIso,
      preview_note: preview.previewNote,
    }

    const { error: insErr } = await sb.from('wishlist_items').insert(row)
    if (insErr) return { ok: false, message: insErr.message }
    await fetchWishItemsFromSupabase(false)
    return { ok: true }
  }

  async function addItem(
    rawUrl: string,
    createdBy: 'daniele' | 'letizia',
  ): Promise<{ ok: boolean; message?: string }> {
    let href: string
    try {
      const t = rawUrl.trim()
      href = new URL(t.startsWith('http') ? t : `https://${t}`).href
    } catch {
      return { ok: false, message: 'URL non valido' }
    }

    let preview: LinkPreviewPayload
    try {
      preview = await fetchPreview(href)
    } catch (e) {
      preview = {
        title: null,
        description: null,
        imageUrl: null,
        siteName: null,
        priceText: null,
        priceAmount: null,
        currency: null,
        previewNote:
          e instanceof Error
            ? e.message
            : 'Anteprima non disponibile; salvo solo il link.',
      }
    }

    return saveItemFromPreview(href, preview, createdBy)
  }

  async function setItemStatus(
    id: string,
    status: WishlistItemStatus,
  ): Promise<boolean> {
    const sb = getSupabaseClient()
    if (!sb) return false
    const lid = selectedWishListId.value
    if (!lid) return false
    const { error: upErr } = await sb
      .from('wishlist_items')
      .update({ status })
      .eq('id', id)
      .eq('list_id', lid)
    if (upErr) {
      error.value = upErr.message
      return false
    }
    await fetchWishItemsFromSupabase(false)
    return true
  }

  async function removeItem(id: string): Promise<boolean> {
    const sb = getSupabaseClient()
    if (!sb) return false
    const lid = selectedWishListId.value
    if (!lid) return false
    const { error: delErr } = await sb
      .from('wishlist_items')
      .delete()
      .eq('id', id)
      .eq('list_id', lid)
    if (delErr) {
      error.value = delErr.message
      return false
    }
    await fetchWishItemsFromSupabase(false)
    return true
  }

  async function updateItemNotes(id: string, notes: string): Promise<boolean> {
    const sb = getSupabaseClient()
    if (!sb) return false
    const lid = selectedWishListId.value
    if (!lid) return false
    const { error: upErr } = await sb
      .from('wishlist_items')
      .update({ notes: notes.trim() || null })
      .eq('id', id)
      .eq('list_id', lid)
    if (upErr) {
      error.value = upErr.message
      return false
    }
    await fetchWishItemsFromSupabase(false)
    return true
  }

  async function updateItemTitle(id: string, title: string): Promise<boolean> {
    const sb = getSupabaseClient()
    if (!sb) return false
    const lid = selectedWishListId.value
    if (!lid) return false
    const t = title.trim()
    const { error: upErr } = await sb
      .from('wishlist_items')
      .update({ title: t || 'Articolo' })
      .eq('id', id)
      .eq('list_id', lid)
    if (upErr) {
      error.value = upErr.message
      return false
    }
    await fetchWishItemsFromSupabase(false)
    return true
  }

  return {
    wishLists,
    wishListsLoading,
    selectedWishListId,
    currentWishListMeta,
    items,
    loading,
    error,
    isWishCloud,
    wishListDisplayName: groceryListDisplayName,
    selectWishList,
    createWishList,
    renameWishList,
    deleteWishList,
    loadItems,
    fetchPreview,
    saveItemFromPreview,
    addItem,
    setItemStatus,
    removeItem,
    updateItemNotes,
    updateItemTitle,
    startWishSync,
    refreshWishData,
    ensureWishRealtimeConnected,
  }
}
