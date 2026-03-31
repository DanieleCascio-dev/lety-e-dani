import { ref } from 'vue'
import type { WishlistItem } from '@/types/wishlist'

/** Soglia orizzontale minima (px) per considerare lo swipe valido */
export const SWIPE_THRESHOLD_PX = 56

export function useWishlistSwipe(options: {
  threshold?: number
  canSwipe: (it: WishlistItem) => boolean
  onSwipeLeft: (it: WishlistItem) => void | Promise<void>
  onSwipeRight: (it: WishlistItem) => void | Promise<void>
}) {
  const threshold = options.threshold ?? SWIPE_THRESHOLD_PX
  const track = ref<{ id: string | null; x: number; y: number }>({
    id: null,
    x: 0,
    y: 0,
  })

  function onTouchStart(e: TouchEvent, it: WishlistItem) {
    if (!options.canSwipe(it) || e.touches.length !== 1) return
    const p = e.touches.item(0) ?? e.touches[0]
    if (!p) return
    track.value = {
      id: it.id,
      x: p.clientX,
      y: p.clientY,
    }
  }

  function onTouchEnd(e: TouchEvent, it: WishlistItem) {
    if (!options.canSwipe(it)) {
      if (track.value.id === it.id) track.value.id = null
      return
    }
    if (track.value.id !== it.id) {
      track.value.id = null
      return
    }
    const t = e.changedTouches.item(0) ?? e.changedTouches[0]
    if (!t) {
      track.value.id = null
      return
    }
    const dx = t.clientX - track.value.x
    const dy = t.clientY - track.value.y
    track.value.id = null
    if (Math.abs(dx) < threshold) return
    if (Math.abs(dx) < Math.abs(dy)) return
    if (dx < 0) void options.onSwipeLeft(it)
    else void options.onSwipeRight(it)
  }

  function onTouchCancel() {
    track.value.id = null
  }

  return { onTouchStart, onTouchEnd, onTouchCancel }
}
