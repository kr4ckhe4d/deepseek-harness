/**
 * Model usage settings plugin, browser half: registers the read-only Usage
 * section over the Host-aggregated `session.usage` view. The section has no
 * extension seats and owns no mutable state beyond its page store; pushed
 * session activity invalidations refresh an already-loaded page so an open
 * section tracks new messages without polling. Export discipline:
 * packages/client/AGENTS.md.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the hero dashboard seat ('conversation.hero.dashboard').
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: pulls the ctx.remote merge and the forwarded-event key face
// (api-session/* invalidations ride the allowlist) into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { UsageSection } from './UsageSection.tsx'
import { HomeDashboard } from './HomeDashboard.tsx'
import type { UsageSectionInjected } from './UsageSection.tsx'
import { UsageStore } from './store.ts'
import type { UsageWire } from './store.ts'
import { en, zh, type UsageKey } from './locales.ts'

export type { UsageSectionInjected, UsageSectionProps } from './UsageSection.tsx'
export type { UsageKey } from './locales.ts'
export type { UsageState, UsageSessionRemote, UsageWire } from './store.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Model usage settings section copy. */
    'settings.usage': UsageKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.usage'

/**
 * Refetch the page snapshot only after its first load: an unopened Usage
 * page must not fetch on background invalidations.
 * @param controller - the page store.
 */
export function refreshIfLoaded(controller: UsageStore): void {
  if (controller.store.getSnapshot().status === 'idle') return
  void controller.load()
}

/**
 * Required services (cordis fiber inject). The target slot is declared by
 * ui-settings' apply, whose activation order relative to this one is NOT
 * constrained; registration depends on it through `slots.inject()`.
 */
export const inject = ['slots', 'locale', 'remote', 'remote.session']

/**
 * Register the Usage section once the `settings.section` declaration is on
 * the ledger and keep an open page fresh on session activity.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-usage: copy dictionaries')

  const wire: UsageWire = { session: ctx.remote.session }
  const controller = new UsageStore(wire)
  const t = ctx.locale.bind(NS)
  const injected = (): UsageSectionInjected => ({
    controller,
    hooks: { snapshot: controller.store },
    api: wire,
    t,
  })

  // An open section follows new messages and session membership without
  // polling; the page stays idle-fresh otherwise (see refreshIfLoaded).
  ctx.effect(() => {
    const refresh = (): void => { refreshIfLoaded(controller) }
    const disposers = [
      ctx.remote.$on('api-session/activity', refresh),
      ctx.remote.$on('api-session/added', refresh),
      ctx.remote.$on('api-session/removed', refresh),
      ctx.on('connection/reset', refresh),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'ui-settings-usage: pushed invalidations')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'usage',
    order: 12,
    label: () => t('nav'),
    inject: injected,
  }, UsageSection))

  // The same store fills the blank-session hero card, so the home dashboard
  // and the Settings page always show one aggregated view.
  ctx.slots.inject('conversation.hero.dashboard', () => ctx.slots.register({
    name: 'conversation.hero.dashboard',
    inject: injected,
  }, HomeDashboard))
}
