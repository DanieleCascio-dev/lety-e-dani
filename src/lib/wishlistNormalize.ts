import type { WishlistItem } from '@/types/wishlist'

/** Titolo leggibile: spazi, lunghezza, niente HTML. */
export function cleanProductTitle(raw: string | null | undefined): string {
  let s = (raw ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (s.length > 180) s = `${s.slice(0, 177)}…`
  return s || 'Prodotto'
}

/** Dominio visibile (fiducia): es. amazon.it */
export function domainLabel(url: string, siteName: string | null): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    const t = (siteName ?? '').trim()
    return t || '—'
  }
}

export function hasDisplayablePrice(it: WishlistItem): boolean {
  if (it.priceText?.trim()) return true
  return (
    it.priceAmount != null &&
    Number.isFinite(it.priceAmount)
  )
}

const PRICE_FRESH_MS = 48 * 60 * 60 * 1000

export function isPriceFresh(previewFetchedAt: string | null): boolean {
  if (!previewFetchedAt) return false
  const t = Date.parse(previewFetchedAt)
  if (Number.isNaN(t)) return false
  return Date.now() - t < PRICE_FRESH_MS
}

export type PriceBadgeKind = 'updated' | 'unavailable' | 'unverified'

export function priceBadgeKind(it: WishlistItem): PriceBadgeKind {
  if (hasDisplayablePrice(it) && isPriceFresh(it.previewFetchedAt)) {
    return 'updated'
  }
  if (hasDisplayablePrice(it)) return 'unverified'
  return 'unavailable'
}

/** Heuristica: anteprima molto scarsa → possibile pagina rotta / prodotto rimosso */
export function isLikelyUnavailable(it: WishlistItem): boolean {
  const note = (it.previewNote ?? '').toLowerCase()
  if (
    note.includes('non disponibile') ||
    note.includes('404') ||
    note.includes('not found')
  ) {
    return true
  }
  const title = (it.title ?? '').trim()
  if (title.length < 3 && !it.imageUrl && !hasDisplayablePrice(it)) return true
  return false
}
