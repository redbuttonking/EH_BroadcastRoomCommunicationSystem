export const FONT_MIN = 16
export const FONT_MAX = 24
export const FONT_DEFAULT = 18
export const FONT_STEP = 2
export const FONT_STORAGE_KEY = 'eh:chat-font:v1'
export type Theme = 'light' | 'dark'
export const THEME_STORAGE_KEY = 'eh:theme:v1'

export function readTheme(
  storage: Pick<Storage, 'getItem'> | undefined,
  prefersDark: boolean,
): Theme {
  try {
    const saved = storage?.getItem(THEME_STORAGE_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* Optional preference. */
  }
  return prefersDark ? 'dark' : 'light'
}

export function saveTheme(storage: Pick<Storage, 'setItem'> | undefined, theme: Theme): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    /* Optional preference. */
  }
}

export function normalizeFontSize(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return FONT_DEFAULT
  return Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(value / FONT_STEP) * FONT_STEP))
}

export function readFontSize(storage: Pick<Storage, 'getItem'> | undefined): number {
  try {
    const raw = storage?.getItem(FONT_STORAGE_KEY)
    return raw == null ? FONT_DEFAULT : normalizeFontSize(JSON.parse(raw))
  } catch {
    return FONT_DEFAULT
  }
}

export function saveFontSize(storage: Pick<Storage, 'setItem'> | undefined, size: number): void {
  try {
    storage?.setItem(FONT_STORAGE_KEY, String(normalizeFontSize(size)))
  } catch {
    /* Optional preference. */
  }
}
