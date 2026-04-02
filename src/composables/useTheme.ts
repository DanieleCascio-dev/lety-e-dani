import { ref } from 'vue'
import {
  DEFAULT_UI_THEME,
  UI_THEME_STORAGE_KEY,
  type UiThemeId,
} from '@/theme/constants'
import {
  applyThemeDataset,
  readStoredThemeId,
  syncThemeColorMeta,
} from '@/theme/initThemeDom'

const activeTheme = ref<UiThemeId>(readStoredThemeId())

export const themeOptions: {
  id: UiThemeId
  label: string
  description: string
}[] = [
  {
    id: 'bootstrap',
    label: 'Bootstrap (predefinito)',
    description:
      'Aspetto chiaro originale dell’app: invariato rispetto al design attuale.',
  },
  {
    id: 'sunflower-blackcat',
    label: 'Sunflower & Black Cat',
    description:
      'Tema scuro caldo con accenti giallo girasole, ispirato al brand visivo.',
  },
]

/**
 * Preferenza tema UI (device): localStorage + `data-theme` su `<html>`.
 * Terzo tema futuro: aggiungi id in `constants.ts`, voce in `themeOptions` e blocco CSS.
 */
export function useTheme() {
  function setTheme(id: UiThemeId): void {
    activeTheme.value = id
    try {
      localStorage.setItem(UI_THEME_STORAGE_KEY, id)
    } catch {
      /* ignore */
    }
    applyThemeDataset(id)
    syncThemeColorMeta(id)
  }

  function resetToDefault(): void {
    setTheme(DEFAULT_UI_THEME)
  }

  return {
    activeTheme,
    setTheme,
    resetToDefault,
    themeOptions,
  }
}
