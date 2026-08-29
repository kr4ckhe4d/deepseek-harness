/** Usage section store: wire read, range refetch, and generation fencing. */
import { describe, expect, it, vi } from 'vitest'
import type { SessionUsageValue } from '@deepseek-ai/dsh-api-remotes/client'
import { resolvedBrowserTimeZone, UsageStore } from '../src/client/store.ts'
import type { UsageWire } from '../src/client/store.ts'

function usageValue(overrides: Partial<SessionUsageValue> = {}): SessionUsageValue {
  return {
    range: 'all',
    rangeStart: 0,
    sessions: 2,
    messages: 6,
    totalTokens: 168,
    activeDays: 3,
    currentStreak: 1,
    longestStreak: 2,
    peakHour: 8,
    favoriteModel: 'deepseek-reasoner',
    days: [],
    weeks: [],
    models: [],
    ...overrides,
  }
}

function makeWire(usage = vi.fn()): { wire: UsageWire; usage: typeof usage } {
  const session = { usage }
  return { wire: { session }, usage }
}

describe('UsageStore', () => {
  it('starts idle on the all range with no value', () => {
    const { wire } = makeWire()
    const store = new UsageStore(wire)
    expect(store.store.getSnapshot()).toEqual({
      status: 'idle', error: null, range: 'all', value: undefined,
    })
  })

  it('loads the view for the current range and publishes it', async () => {
    const value = usageValue({ totalTokens: 42 })
    const { wire, usage } = makeWire(vi.fn(() => Promise.resolve({ ok: true as const, value })))
    const store = new UsageStore(wire)
    await store.load()
    expect(usage).toHaveBeenCalledWith(expect.objectContaining({ range: 'all' }))
    expect(store.store.getSnapshot()).toMatchObject({ status: 'ready', error: null, value })
  })

  it('surfaces a wire failure as the error state', async () => {
    const { wire } = makeWire(vi.fn(() => Promise.resolve({
      ok: false as const, error: { code: 'internal', message: 'nope', details: {} },
    })))
    const store = new UsageStore(wire)
    await store.load()
    expect(store.store.getSnapshot()).toMatchObject({ status: 'error', error: 'nope' })
  })

  it('refetches with the new range on setRange', async () => {
    const { wire, usage } = makeWire(vi.fn(() => Promise.resolve({
      ok: true as const, value: usageValue({ range: '30d' }),
    })))
    const store = new UsageStore(wire)
    await store.setRange('30d')
    expect(store.store.getSnapshot().range).toBe('30d')
    expect(usage).toHaveBeenLastCalledWith(expect.objectContaining({ range: '30d' }))
    // Selecting the active range again is a no-op.
    await store.setRange('30d')
    expect(usage).toHaveBeenCalledTimes(1)
  })

  it('ignores a stale response that lands after a newer load', async () => {
    let resolveFirst: (value: { ok: true; value: SessionUsageValue }) => void = () => {}
    const first = new Promise<{ ok: true; value: SessionUsageValue }>((resolve) => { resolveFirst = resolve })
    const usage = vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(Promise.resolve({ ok: true as const, value: usageValue({ range: '7d', totalTokens: 99 }) }))
    const { wire } = makeWire(usage)
    const store = new UsageStore(wire)
    const older = store.load()
    // The range move starts a second, newer load while the first is in flight.
    const newer = store.setRange('7d')
    // The stale response resolves last; it must not republish the old view.
    resolveFirst({ ok: true, value: usageValue({ range: 'all', totalTokens: 1 }) })
    await Promise.all([older, newer])
    expect(store.store.getSnapshot().range).toBe('7d')
    expect(store.store.getSnapshot().value?.totalTokens).toBe(99)
  })

  it('resolves a browser time zone without throwing', () => {
    expect(typeof resolvedBrowserTimeZone()).toBe('string')
    expect(resolvedBrowserTimeZone().length).toBeGreaterThan(0)
  })
})
