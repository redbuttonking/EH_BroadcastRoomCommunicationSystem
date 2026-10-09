import type { Preset, Role } from './types'

// Accounts without saved presets start with these role-specific defaults.
export const PRESETS: Record<Role, Preset[]> = {
  leader: [
    { id: 'monitor-up', text: '인도자 모니터 소리가 작아요' },
    { id: 'mic-tone', text: '인도자 마이크 소리가 너무 쨍합니다' },
    { id: 'temperature-up', text: '에어컨 온도 높여주세요' },
    { id: 'okay', text: '이제 괜찮아요' },
    { id: 'mistake', text: '잘못 보냈어요' },
  ],
  broadcast: [
    { id: 'adjusted', text: '조정했어요' },
    { id: 'moment', text: '잠시만 기다려주세요' },
    { id: 'check', text: '지금은 괜찮으신가요?' },
    { id: 'mistake', text: '잘못 보냈어요' },
  ],
}

export const PRESET_LIMIT = 30
export const PRESET_TEXT_LIMIT = 120
const storageKey = (role: Role) => `eh:presets:${role}:v1`

export function validPresets(value: unknown): value is Preset[] {
  return (
    Array.isArray(value) &&
    value.length <= PRESET_LIMIT &&
    new Set(value.map((item) => item?.id)).size === value.length &&
    value.every(
      (item) =>
        item &&
        typeof item.id === 'string' &&
        item.id.length > 0 &&
        item.id.length <= 64 &&
        typeof item.text === 'string' &&
        item.text.trim().length > 0 &&
        item.text.length <= PRESET_TEXT_LIMIT,
    )
  )
}

export function readLegacyPresets(
  storage: Pick<Storage, 'getItem'> | undefined,
  role: Role,
): Preset[] | null {
  try {
    const value: unknown = JSON.parse(storage?.getItem(storageKey(role)) || 'null')
    // Read the old device key only for the user's explicit import action.
    if (validPresets(value)) return value.map(({ id, text }) => ({ id, text }))
  } catch {
    /* No import is available if device storage is blocked or damaged. */
  }
  return null
}

export type PresetCollection = { revision: number; items: Preset[] }

export function parsePresetCollection(value: unknown, role: Role): PresetCollection {
  if (value === null) return { revision: 0, items: PRESETS[role].map((item) => ({ ...item })) }
  const saved = value as Partial<PresetCollection>
  // Realtime Database omits empty arrays. The revision preserves an intentionally empty list.
  const items = saved?.items ?? []
  if (!Number.isSafeInteger(saved?.revision) || saved.revision! < 1 || !validPresets(items))
    throw new Error('저장된 문구를 읽지 못했습니다. 다시 시도해 주세요.')
  return { revision: saved.revision!, items: items.map(({ id, text }) => ({ id, text })) }
}
