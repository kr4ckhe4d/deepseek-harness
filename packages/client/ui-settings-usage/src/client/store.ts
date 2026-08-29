/**
 * Model usage section store: one snapshot of the Host-aggregated usage view.
 * The Host stays the single fact source — the section reads `session.usage`
 * (a corpus-wide fold of every visible session log in the client's time
 * zone) and re-renders from the next response; the range filter is a
 * page-local viewing choice refetched on change, so no other state lives
 * here.
 */

import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import type { SessionUsageRange, SessionUsageValue } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** The session Remote method the usage section reads. */
export type UsageSessionRemote = Pick<ClientRemote['session'], 'usage'>

/** The wire face the usage section reads through. */
export interface UsageWire {
  session: UsageSessionRemote
}

/** Page snapshot. */
export interface UsageState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** Whole-load failure text. */
  error: string | null
  /** Active time-range filter; the refetch key. */
  range: SessionUsageRange
  /** Last accepted aggregated view. */
  value: SessionUsageValue | undefined
}

/**
 * Resolve the current browser IANA zone for the Host aggregation.
 * @returns the browser-provided zone, or `UTC` when the runtime cannot name one.
 */
export function resolvedBrowserTimeZone(): string {
  const timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone
  return typeof timeZone === 'string' && timeZone.length > 0 ? timeZone : 'UTC'
}

/** The usage section controller (one per settings surface). */
export class UsageStore {
  /** The snapshot the section renders from (uSES-safe store). */
  readonly store: SnapshotStore<UsageState> = createSnapshotStore<UsageState>({
    status: 'idle', error: null, range: 'all', value: undefined,
  })

  /** Latest load wins; an older response never overwrites a newer one. */
  private generation = 0

  /** Browser zone fixed at construction, so repeated loads agree. */
  private readonly timeZone = resolvedBrowserTimeZone()

  /**
   * @param api - the usage section's session Remote wire face.
   */
  constructor(private readonly api: UsageWire) {}

  /**
   * Refresh the usage view for the snapshot's current range.
   * @returns nothing; the snapshot carries the outcome.
   */
  async load(): Promise<void> {
    const range = this.store.getSnapshot().range
    const generation = ++this.generation
    this.store.update((state) => { state.status = 'loading'; state.error = null })
    try {
      const response = await this.api.session.usage({ range, timeZone: this.timeZone })
      if (generation !== this.generation) return
      if (!response.ok) throw new Error(response.error.message)
      this.store.update((state) => {
        state.status = 'ready'
        state.error = null
        state.value = response.value
      })
    } catch (error) {
      if (generation !== this.generation) return
      this.store.update((state) => {
        state.status = 'error'
        state.error = error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Select a time-range filter and refetch the view.
   * @param range - the new range.
   * @returns nothing; the snapshot carries the outcome.
   */
  async setRange(range: SessionUsageRange): Promise<void> {
    if (this.store.getSnapshot().range === range) return
    this.store.update((state) => { state.range = range })
    await this.load()
  }
}
