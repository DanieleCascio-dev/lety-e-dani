const KEY = 'lety-dani:last-nav-route'

export type SavedMainNavRoute = 'home' | 'shopping' | 'wishlist' | 'todos' | 'restaurants' | 'calendar'

const MAIN: SavedMainNavRoute[] = ['home', 'shopping', 'wishlist', 'todos', 'restaurants', 'calendar']

export function isSavedMainNavRoute(s: string | null): s is SavedMainNavRoute {
  return (
    s === 'home' ||
    s === 'shopping' ||
    s === 'wishlist' ||
    s === 'todos' ||
    s === 'restaurants' ||
    s === 'calendar'
  )
}

export function isMainNavRouteName(name: unknown): name is SavedMainNavRoute {
  return typeof name === 'string' && MAIN.includes(name as SavedMainNavRoute)
}

export function readSavedMainNavRoute(): SavedMainNavRoute | null {
  try {
    const v = localStorage.getItem(KEY)
    return isSavedMainNavRoute(v) ? v : null
  } catch {
    return null
  }
}

export function writeSavedMainNavRoute(name: SavedMainNavRoute) {
  try {
    localStorage.setItem(KEY, name)
  } catch {
    /* ignore (es. modalità privata) */
  }
}
