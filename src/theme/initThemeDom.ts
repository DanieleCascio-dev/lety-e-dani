import {
  DEFAULT_UI_THEME,
  isUiThemeId,
  UI_THEME_STORAGE_KEY,
  type UiThemeId,
} from './constants'

export function readStoredThemeId(): UiThemeId {
  try {
    const raw = localStorage.getItem(UI_THEME_STORAGE_KEY)
    if (raw && isUiThemeId(raw)) return raw
  } catch {
    /* ignore */
  }
  return DEFAULT_UI_THEME
}

export function applyThemeDataset(themeId: UiThemeId): void {
  document.documentElement.dataset.theme = themeId
}

export function syncThemeColorMeta(themeId: UiThemeId): void {
  const el = document.querySelector('meta[name="theme-color"]')
  if (!el) return
  el.setAttribute(
    'content',
    themeId === 'sunflower-blackcat' ? '#242019' : '#0d6efd',
  )
}

/** Allinea <html data-theme> e meta theme-color al valore salvato. */
export function initThemeDom(): void {
  const id = readStoredThemeId()
  applyThemeDataset(id)
  syncThemeColorMeta(id)
}
