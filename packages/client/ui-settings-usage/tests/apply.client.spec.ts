/** Usage section registration: slot declaration injection, the locale-following label thunk, and HMR recovery. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { apply, inject, refreshIfLoaded } from '@deepseek-ai/dsh-client-ui-settings-usage/client'
import { UsageSection } from '../src/client/UsageSection.tsx'
import { UsageStore } from '../src/client/store.ts'

async function bench(session = {}) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('zh')
  ctx.provide('locale', locale)
  const remote = new TestRemote(ctx, {
    session: {
      usage: vi.fn(() => Promise.resolve({
        ok: true,
        value: { range: 'all', sessions: 0, messages: 0, totalTokens: 0 },
      })),
      ...session,
    },
  })
  ctx.provide('connection', { api: {} } as never)
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, remote }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register(
    {
      name: 'root',
      children: { 'settings.section': { kind: 'list', scope: 'root' } },
    } as never,
    () => null,
  )
}

describe('ui-settings-usage apply', () => {
  it('declares the services it uses', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.session'])
  })

  it('registers the usage nav entry for declarations before or after apply', async () => {
    const before = await bench()
    declare(before.slots)
    await before.ctx.plugin({ inject: [...inject], apply }).await()
    const entry = before.slots.entries('settings.section')[0]!
    expect(entry.component).toBe(UsageSection)
    expect(entry.options).toMatchObject({ id: 'usage', order: 12 })
    // The nav label is a locale-following thunk; owners resolve at read time.
    expect(resolveSlotLabel(entry.options.label)).toBe('用量')
    const injected = (entry.inject as unknown as () => import('../src/client/UsageSection.tsx').UsageSectionInjected)()
    expect(injected.t('nav')).toBe('用量')
    expect(typeof injected.controller.load).toBe('function')
    expect(injected.hooks.snapshot).toBe(injected.controller.store)
    expect(injected.api.session).toBeDefined()

    const after = await bench()
    await after.ctx.plugin({ inject: [...inject], apply }).await()
    expect(after.slots.entries('settings.section')).toHaveLength(0)
    declare(after.slots)
    await Promise.resolve()
    expect(after.slots.entries('settings.section')[0]!.component).toBe(UsageSection)
    // The self-inflicted ledger notifications hit the duplicate guard.
    expect(after.slots.entries('settings.section')).toHaveLength(1)
  })

  it('the label thunk follows the active locale without re-registration', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    b.locale.setLocale('en')
    expect(resolveSlotLabel(b.slots.entries('settings.section')[0]!.options.label)).toBe('Usage')
    b.locale.setLocale('zh')
    expect(resolveSlotLabel(b.slots.entries('settings.section')[0]!.options.label)).toBe('用量')
  })

  it('re-registers after an HMR collapse re-declares the slot', async () => {
    const b = await bench()
    const redeclare = declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    expect(b.slots.entries('settings.section')).toHaveLength(1)
    redeclare()
    expect(b.slots.entries('settings.section')).toHaveLength(0)
    declare(b.slots)
    await Promise.resolve()
    expect(b.slots.entries('settings.section')[0]!.component).toBe(UsageSection)
  })

  it('registers the zh/en nav dictionaries and disposes everything with the fiber', async () => {
    const b = await bench()
    declare(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.locale.bind('settings.usage')('nav')).toBe('用量')
    await fiber.dispose()
    expect(b.slots.entries('settings.section')).toHaveLength(0)
    expect(() => b.locale.register('settings.usage', 'zh', {})).not.toThrow()
    expect(() => b.locale.register('settings.usage', 'en', {})).not.toThrow()
  })

  it('refreshes a loaded page on session activity and skips an idle one', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const entry = b.slots.entries('settings.section')[0]!
    const injected = (
      entry.inject as unknown as () => import('../src/client/UsageSection.tsx').UsageSectionInjected
    )()
    // Idle: pushed invalidations must not fetch.
    b.remote.emit('api-session/activity', [])
    const usage = (b.remote as unknown as { session: { usage: ReturnType<typeof vi.fn> } }).session.usage
    expect(usage).not.toHaveBeenCalled()
    // Loaded: one refresh per pushed invalidation.
    await injected.controller.load()
    const calls = usage.mock.calls.length
    b.remote.emit('api-session/activity', [])
    b.remote.emit('api-session/added', [])
    expect(usage.mock.calls.length).toBe(calls + 2)
  })

  it('refreshIfLoaded skips an idle page store', () => {
    const loads: number[] = []
    const controller = {
      store: { getSnapshot: () => ({ status: 'idle' }) },
      load: () => { loads.push(1); return Promise.resolve() },
    }
    refreshIfLoaded(controller as unknown as UsageStore)
    expect(loads).toHaveLength(0)
    const loaded = {
      store: { getSnapshot: () => ({ status: 'ready' }) },
      load: () => { loads.push(2); return Promise.resolve() },
    }
    refreshIfLoaded(loaded as unknown as UsageStore)
    expect(loads).toEqual([2])
  })
})
