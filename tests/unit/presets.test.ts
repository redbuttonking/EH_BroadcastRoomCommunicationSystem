import { expect, test } from 'vitest'
import { PRESETS, readLegacyPresets, parsePresetCollection } from '../../src/domain/presets'

test('account presets distinguish defaults, empty collections and corrupt server data', () => {
  expect(parsePresetCollection(null, 'broadcast')).toEqual({
    revision: 0,
    items: PRESETS.broadcast,
  })
  expect(parsePresetCollection({ revision: 1 }, 'broadcast')).toEqual({ revision: 1, items: [] })
  expect(() => parsePresetCollection({ revision: 1, items: 'invalid' }, 'broadcast')).toThrow()
  expect(() => parsePresetCollection({ revision: 0, items: [] }, 'broadcast')).toThrow()
})

test('legacy imports distinguish missing and deliberately empty device collections by role', () => {
  const data = new Map([['eh:presets:broadcast:v1', '[]']])
  const storage = { getItem: (key: string) => data.get(key) ?? null }
  expect(readLegacyPresets(storage, 'broadcast')).toEqual([])
  expect(readLegacyPresets(storage, 'leader')).toBeNull()
})

test('legacy imports preserve text and order without changing the original storage', () => {
  const saved = JSON.stringify([
    { id: 'second', group: '답변', text: '제가 저장한 두 번째 문구' },
    { id: 'first', group: '음향', text: '제가 저장한 첫 번째 문구' },
  ])
  const items = readLegacyPresets({ getItem: () => saved }, 'broadcast')!
  expect(items.map((item) => item.id)).toEqual(['second', 'first'])
  expect(items[0].text).toBe('제가 저장한 두 번째 문구')
  expect(items[0]).not.toHaveProperty('group')
  expect(saved).toContain('group')
})

test('unreadable legacy storage is not offered for import', () => {
  expect(readLegacyPresets({ getItem: () => '{broken' }, 'leader')).toBeNull()
  expect(readLegacyPresets({ getItem: () => '[{"text":""}]' }, 'leader')).toBeNull()
  expect(
    readLegacyPresets(
      {
        getItem: () => {
          throw new Error('blocked')
        },
      },
      'leader',
    ),
  ).toBeNull()
})
