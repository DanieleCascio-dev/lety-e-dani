/** localStorage — stessa chiave dello script inline in index.html (anti-FOUC). */
export const UI_THEME_STORAGE_KEY = 'lety-dani:ui-theme'

export const UI_THEME_BOOTSTRAP = 'bootstrap' as const
export const UI_THEME_SUNFLOWER_BLACKCAT = 'sunflower-blackcat' as const

export type UiThemeId =
  | typeof UI_THEME_BOOTSTRAP
  | typeof UI_THEME_SUNFLOWER_BLACKCAT

export const DEFAULT_UI_THEME: UiThemeId = UI_THEME_SUNFLOWER_BLACKCAT

export const UI_THEME_IDS: readonly UiThemeId[] = [
  UI_THEME_BOOTSTRAP,
  UI_THEME_SUNFLOWER_BLACKCAT,
] as const

export function isUiThemeId(raw: string | null | undefined): raw is UiThemeId {
  return raw === UI_THEME_BOOTSTRAP || raw === UI_THEME_SUNFLOWER_BLACKCAT
}
