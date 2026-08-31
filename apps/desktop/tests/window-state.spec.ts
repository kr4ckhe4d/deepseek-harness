import { describe, expect, it } from 'vitest'
import { clampToDisplays, DEFAULT_WINDOW_STATE, normalizeWindowState } from '../src/window-state.ts'

const PRIMARY = { x: 0, y: 25, width: 1512, height: 920 }
const SECOND = { x: 1512, y: 0, width: 1920, height: 1080 }

describe('normalizeWindowState', () => {
  it('accepts a well-formed persisted state', () => {
    const state = { x: 10, y: 20, width: 1280, height: 860, maximized: true }
    expect(normalizeWindowState(state)).toEqual(state)
  })

  it('rejects missing fields, wrong types, non-finite numbers, and undersized windows', () => {
    expect(normalizeWindowState(undefined)).toBeUndefined()
    expect(normalizeWindowState(null)).toBeUndefined()
    expect(normalizeWindowState('{}')).toBeUndefined()
    expect(normalizeWindowState({ x: 0, y: 0, width: 800, height: 600 })).toBeUndefined()
    expect(normalizeWindowState({ x: 0, y: 0, width: Number.NaN, height: 600, maximized: false })).toBeUndefined()
    expect(normalizeWindowState({ x: 0, y: 0, width: 100, height: 100, maximized: false })).toBeUndefined()
  })
})

describe('clampToDisplays', () => {
  it('keeps a state already inside a display unchanged', () => {
    const state = { x: 100, y: 100, width: 1000, height: 700, maximized: false }
    expect(clampToDisplays(state, [PRIMARY, SECOND])).toEqual(state)
  })

  it('pulls a window from a detached display onto the closest live one', () => {
    const detached = { x: -2000, y: 50, width: 1000, height: 700, maximized: false }
    const clamped = clampToDisplays(detached, [PRIMARY])
    expect(clamped.x).toBeGreaterThanOrEqual(PRIMARY.x)
    expect(clamped.y).toBeGreaterThanOrEqual(PRIMARY.y)
    expect(clamped.x + clamped.width).toBeLessThanOrEqual(PRIMARY.x + PRIMARY.width)
  })

  it('shrinks a window larger than the target work area', () => {
    const huge = { x: 0, y: 0, width: 4000, height: 3000, maximized: false }
    const clamped = clampToDisplays(huge, [PRIMARY])
    expect(clamped.width).toBe(PRIMARY.width)
    expect(clamped.height).toBe(PRIMARY.height)
  })

  it('prefers the display holding most of the window', () => {
    const onSecond = { x: 1600, y: 100, width: 1000, height: 700, maximized: false }
    expect(clampToDisplays(onSecond, [PRIMARY, SECOND])).toEqual(onSecond)
  })

  it('ships a default that satisfies its own normalization', () => {
    expect(normalizeWindowState(DEFAULT_WINDOW_STATE)).toEqual(DEFAULT_WINDOW_STATE)
  })
})
