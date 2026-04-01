import { reactive, ref } from 'vue'

const DEFAULT_REVEAL_PX = 76
/** Soglia apertura come frazione della larghezza reveal (~45%) */
const SNAP_OPEN_FRAC = 34 / 76
/** Pixel prima di decidere asse */
const AXIS_LOCK_PX = 10
/** Lo swipe orizzontale deve dominare sul verticale */
const HORIZONTAL_DOMINANCE = 1.12

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/**
 * Swipe reveal su riga lista (es. spesa): sinistra → azione destra (elimina),
 * destra → azione sinistra (modifica). Una riga aperta alla volta.
 * Touch + mouse; scroll verticale non bloccato se il gesto è prevalentemente verticale.
 */
export function useShoppingSwipeReveal(options?: { revealPx?: number }) {
  const revealPx =
    typeof options?.revealPx === 'number' &&
    Number.isFinite(options.revealPx) &&
    options.revealPx >= 48 &&
    options.revealPx <= 100
      ? Math.round(options.revealPx)
      : DEFAULT_REVEAL_PX
  const snapOpenPx = Math.max(18, Math.round(revealPx * SNAP_OPEN_FRAC))

  /** translateX per id riga (negativo = mostra azione destra, positivo = sinistra) */
  const tx = reactive<Record<string, number>>({})

  const drag = ref<{
    id: string
    pointerId: number
    startX: number
    startY: number
    startTx: number
    axis: 'h' | 'v' | null
    frontEl: HTMLElement | null
  } | null>(null)

  const dragging = ref(false)

  function getTx(id: string): number {
    return tx[id] ?? 0
  }

  function setTx(id: string, v: number) {
    tx[id] = clamp(v, -revealPx, revealPx)
  }

  function closeOthers(exceptId: string) {
    for (const k of Object.keys(tx)) {
      if (k !== exceptId) tx[k] = 0
    }
  }

  function closeAll() {
    for (const k of Object.keys(tx)) tx[k] = 0
  }

  function snapClosed(id: string) {
    tx[id] = 0
  }

  function isBlockedTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return true
    return Boolean(
      target.closest(
        'input, button, textarea, select, a, .dropdown-menu, .shopping-swipe-action',
      ),
    )
  }

  function isDraggingRow(id: string): boolean {
    return dragging.value && drag.value?.id === id
  }

  function releaseDrag(
    d: {
      pointerId: number
      frontEl: HTMLElement | null
    },
  ) {
    try {
      d.frontEl?.releasePointerCapture(d.pointerId)
    } catch {
      /* ignore */
    }
    drag.value = null
    dragging.value = false
  }

  function snapAfterHorizontalDrag(id: string) {
    const v = getTx(id)
    let next = 0
    if (v < -snapOpenPx) next = -revealPx
    else if (v > snapOpenPx) next = revealPx
    else next = 0
    tx[id] = next
    if (next !== 0 && typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(10)
      } catch {
        /* ignore */
      }
    }
  }

  /** Riga con pannello aperto (per ombre / stato visivo) */
  function isRevealed(id: string): boolean {
    return Math.abs(getTx(id)) > 4
  }

  function revealSide(id: string): 'edit' | 'delete' | null {
    const v = getTx(id)
    if (v < -8) return 'delete'
    if (v > 8) return 'edit'
    return null
  }

  function onPointerDown(e: PointerEvent, itemId: string) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (isBlockedTarget(e.target)) return
    const el = e.currentTarget as HTMLElement | null
    if (!el) return

    closeOthers(itemId)
    drag.value = {
      id: itemId,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTx: getTx(itemId),
      axis: null,
      frontEl: el,
    }
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  function onPointerMove(e: PointerEvent) {
    const d = drag.value
    if (!d || e.pointerId !== d.pointerId) return

    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY

    if (d.axis === null) {
      if (
        Math.abs(dx) >= AXIS_LOCK_PX &&
        Math.abs(dx) > Math.abs(dy) * HORIZONTAL_DOMINANCE
      ) {
        d.axis = 'h'
        dragging.value = true
      } else if (
        Math.abs(dy) >= AXIS_LOCK_PX &&
        Math.abs(dy) >= Math.abs(dx)
      ) {
        d.axis = 'v'
        setTx(d.id, d.startTx)
        releaseDrag(d)
        return
      } else {
        return
      }
    }

    if (d.axis === 'v') return
    e.preventDefault()
    setTx(d.id, d.startTx + dx)
  }

  function onPointerUp(e: PointerEvent) {
    const d = drag.value
    if (!d || e.pointerId !== d.pointerId) return

    if (d.axis === null) {
      const cur = getTx(d.id)
      releaseDrag(d)
      if (cur !== 0) tx[d.id] = 0
      return
    }

    if (d.axis === 'h') {
      snapAfterHorizontalDrag(d.id)
    }
    releaseDrag(d)
  }

  function onPointerCancel(e: PointerEvent) {
    const d = drag.value
    if (!d || e.pointerId !== d.pointerId) return
    setTx(d.id, d.startTx)
    releaseDrag(d)
  }

  return {
    tx,
    getTx,
    closeAll,
    snapClosed,
    dragging,
    isDraggingRow,
    isRevealed,
    revealSide,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    revealPx,
  }
}
