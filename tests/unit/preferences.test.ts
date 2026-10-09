import { expect, test } from 'vitest'
import {
  FONT_DEFAULT,
  FONT_MAX,
  FONT_MIN,
  readFontSize,
  saveFontSize,
  readTheme,
  saveTheme,
} from '../../src/domain/preferences'

test('theme restores a saved choice or falls back to the operating system', () => {
  expect(readTheme(undefined, true)).toBe('dark')
  expect(readTheme({ getItem: () => 'light' }, true)).toBe('light')
  expect(readTheme({ getItem: () => 'obsolete' }, false)).toBe('light')
  expect(
    readTheme(
      {
        getItem: () => {
          throw new Error('blocked')
        },
      },
      true,
    ),
  ).toBe('dark')
  expect(() =>
    saveTheme(
      {
        setItem: () => {
          throw new Error('blocked')
        },
      },
      'dark',
    ),
  ).not.toThrow()
})

test('missing, blocked, invalid and legacy storage does not prevent chat startup', () => {
  expect(readFontSize(undefined)).toBe(FONT_DEFAULT)
  expect(readFontSize({ getItem: () => null })).toBe(FONT_DEFAULT)
  expect(
    readFontSize({
      getItem: () => {
        throw new Error('blocked')
      },
    }),
  ).toBe(FONT_DEFAULT)
  expect(readFontSize({ getItem: () => 'invalid' })).toBe(FONT_DEFAULT)
  expect(readFontSize({ getItem: () => '"22"' })).toBe(FONT_DEFAULT)
  expect(readFontSize({ getItem: () => '900' })).toBe(FONT_MAX)
  expect(readFontSize({ getItem: () => '0' })).toBe(FONT_MIN)
  expect(() =>
    saveFontSize(
      {
        setItem: () => {
          throw new Error('blocked')
        },
      },
      22,
    ),
  ).not.toThrow()
})
