/**
 * Corpus-wide model usage statistics for the settings usage section.
 *
 * The Host stays the single fact source: every visible session log is folded
 * into the surface messages the section reads (user/assistant messages plus
 * the per-request model and token accounting that `assistant/message` events
 * already carry), then aggregated in the client's time zone so local-day
 * streaks, the peak hour, the calendar heatmap, and weekly buckets all match
 * what the user's clock shows. The aggregation is computed on demand — the
 * settings page opens rarely, so there is no persistent cache to invalidate —
 * with bounded concurrency over cold persisted-session reads and per-session
 * tolerance mirroring the Session list's own cold-summary policy.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-query'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { canonicalClientTimeZone } from '@deepseek-ai/dsh-util-time'
import type {
  SessionUsageDay, SessionUsageModel, SessionUsageRange, SessionUsageRequest,
  SessionUsageValue, SessionUsageWeek, SessionUsageWeekModel,
} from './types.ts'

const DAY_MS = 86_400_000
/** Range window lengths in local days; `all` is unbounded (the display caps it). */
const RANGE_WINDOW_DAYS: Readonly<Record<Exclude<SessionUsageRange, 'all'>, number>> = { '30d': 30, '7d': 7 }
/** Legal range values, checked at the request boundary. */
const RANGE_VALUES: ReadonlySet<SessionUsageRange> = new Set(['all', '30d', '7d'])
/** Calendar-heatmap and weekly-chart window for the `all` range (52 weeks). */
const ALL_RANGE_WINDOW_DAYS = 364
/** Bounded concurrency for cold persisted-session reads. */
const USAGE_OBSERVE_CONCURRENCY = 8
/** Weekday index of the first heatmap column and weekly chart bucket (GitHub style). */
const WEEK_START_WEEKDAY = 0

/** One folded user message (no model or token accounting of its own). */
export interface SessionUsageUserMessage {
  readonly time: number
  readonly kind: 'user'
}

/** One folded assistant message with the per-request facts the section needs. */
export interface SessionUsageAssistantMessage {
  readonly time: number
  readonly kind: 'assistant'
  /** Model id as recorded on the request (e.g. `deepseek-chat`). */
  readonly model: string
  /** Billed tokens when the step reported usage; undefined otherwise. */
  readonly tokens: number | undefined
  readonly inputTokens: number | undefined
  readonly outputTokens: number | undefined
}

/** One surface message folded from a session log. */
export type SessionUsageMessage = SessionUsageUserMessage | SessionUsageAssistantMessage

/** One folded session's messages. */
export interface SessionUsageSource {
  readonly sessionId: SessionId
  readonly messages: readonly SessionUsageMessage[]
}

/**
 * Fold one session log into the surface messages the usage section reads.
 * Every `user/message` and `assistant/message` event counts as a message; an
 * assistant step carries the model id from its own message source (present on
 * every event, unlike the sparse `request/context` route records) and the
 * billed token accounting when the adapter reported it.
 * @param events - one session's complete event log.
 * @returns the session's messages in log order.
 */
export function foldSessionUsageEvents(events: readonly SessionEvent[]): readonly SessionUsageMessage[] {
  const messages: SessionUsageMessage[] = []
  for (const event of events) {
    if (event.type === 'user/message') {
      messages.push({ time: event.time, kind: 'user' })
      continue
    }
    if (event.type !== 'assistant/message') continue
    const usage = event.data.usage
    messages.push({
      time: event.time,
      kind: 'assistant',
      model: event.data.message.source.model,
      tokens: usage === undefined ? undefined : billedTokens(usage),
      inputTokens: usage === undefined ? undefined : usage.inputTokens,
      outputTokens: usage === undefined ? undefined : usage.outputTokens,
    })
  }
  return messages
}

/** Billed tokens for one usage record: uncached input + cache reads + cache writes + output. */
function billedTokens(usage: {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
}): number {
  return usage.inputTokens
    + usage.outputTokens
    + (usage.cacheReadTokens ?? 0)
    + (usage.cacheWriteTokens ?? 0)
}

/** Local-calendar arithmetic in one fixed time zone. */
interface LocalCalendar {
  /** Local day index: whole days since epoch in the local calendar. */
  day(time: number): number
  /** Local hour, 0–23. */
  hour(time: number): number
  /** Local weekday, 0 = Sunday. */
  weekday(time: number): number
  /** `YYYY-MM-DD` key for a local day index. */
  dateKey(day: number): string
}

/** Build a local-calendar helper for one IANA time zone. */
export function createLocalCalendar(timeZone: string): LocalCalendar {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  })
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const cache = new Map<number, { day: number; hour: number; weekday: number }>()
  const at = (time: number): { day: number; hour: number; weekday: number } => {
    let hit = cache.get(time)
    if (hit === undefined) {
      const parts: Record<string, string> = {}
      for (const part of format.formatToParts(time)) parts[part.type] = part.value
      const weekdayIndex = WEEKDAYS.indexOf(parts.weekday ?? '')
      hit = {
        // A local day index is the UTC midnight of the local calendar date,
        // which makes day arithmetic and date keys timezone-independent.
        day: Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / DAY_MS,
        hour: Number(parts.hour),
        weekday: weekdayIndex < 0 ? WEEK_START_WEEKDAY : weekdayIndex,
      }
      cache.set(time, hit)
    }
    return hit
  }
  return {
    day: time => at(time).day,
    hour: time => at(time).hour,
    weekday: time => at(time).weekday,
    dateKey(day) {
      const date = new Date(day * DAY_MS)
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
        + `-${String(date.getUTCDate()).padStart(2, '0')}`
    },
  }
}

/** Options fixing the range cut and local-calendar anchor of one aggregation. */
export interface UsageAggregateOptions {
  readonly range: SessionUsageRange
  /** Epoch-ms cut of the range start; 0 for `all`. */
  readonly rangeStart: number
  readonly timeZone: string
  /** Aggregation clock; the range window and streaks end at this instant. */
  readonly now: number
}

/** Accumulated per-model totals during the aggregate fold. */
interface ModelTotals {
  inputTokens: number
  outputTokens: number
  tokens: number
  messages: number
}

/**
 * Aggregate folded session messages into the corpus-wide usage view.
 * All day/hour/week bucketing happens in {@link UsageAggregateOptions.timeZone},
 * and every figure respects the range cut. The heatmap and weekly chart span
 * the range window — the trailing 30 or 7 local days, or the trailing 52 weeks
 * for `all`.
 * @param sources - per-session folded messages.
 * @param options - range, time zone, and aggregation clock.
 * @returns the usage view for the section.
 */
export function aggregateSessionUsage(
  sources: readonly SessionUsageSource[],
  options: UsageAggregateOptions,
): SessionUsageValue {
  const { range, rangeStart, timeZone, now } = options
  const calendar = createLocalCalendar(timeZone)
  const today = calendar.day(now)
  const windowDays = range === 'all' ? ALL_RANGE_WINDOW_DAYS : RANGE_WINDOW_DAYS[range]
  const windowStartDay = today - (windowDays - 1)

  const days = new Map<number, { tokens: number; messages: number }>()
  const hours = new Array<number>(24).fill(0)
  const models = new Map<string, ModelTotals>()
  const weeks = new Map<number, Map<string, number>>()
  let sessions = 0
  let messages = 0
  let totalTokens = 0

  for (const source of sources) {
    let sessionActive = false
    for (const message of source.messages) {
      if (message.time < rangeStart) continue
      messages += 1
      sessionActive = true
      const day = calendar.day(message.time)
      const hour = calendar.hour(message.time)
      const dayBucket = days.get(day) ?? { tokens: 0, messages: 0 }
      dayBucket.messages += 1
      hours[hour] = (hours[hour] ?? 0) + 1
      days.set(day, dayBucket)
      if (message.kind !== 'assistant') continue
      const model = message.model
      const modelBucket = models.get(model) ?? {
        inputTokens: 0, outputTokens: 0, tokens: 0, messages: 0,
      }
      modelBucket.messages += 1
      if (message.tokens !== undefined) {
        dayBucket.tokens += message.tokens
        totalTokens += message.tokens
        modelBucket.inputTokens += message.inputTokens ?? 0
        modelBucket.outputTokens += message.outputTokens ?? 0
        modelBucket.tokens += message.tokens
        const weekStart = day - ((calendar.weekday(message.time) - WEEK_START_WEEKDAY + 7) % 7)
        let week = weeks.get(weekStart)
        if (week === undefined) {
          week = new Map()
          weeks.set(weekStart, week)
        }
        week.set(model, (week.get(model) ?? 0) + message.tokens)
      }
      models.set(model, modelBucket)
    }
    if (sessionActive) sessions += 1
  }

  const activeDays = [...days.keys()]
  const activeSet = new Set(activeDays)
  let currentStreak = 0
  for (let day = today; day >= windowStartDay; day -= 1) {
    if (!activeSet.has(day)) break
    currentStreak += 1
  }
  let longestStreak = 0
  let run = 0
  for (let day = windowStartDay; day <= today; day += 1) {
    run = activeSet.has(day) ? run + 1 : 0
    if (run > longestStreak) longestStreak = run
  }

  let peakHour = 0
  let peakCount = 0
  for (let hour = 0; hour < 24; hour += 1) {
    const count = hours[hour] ?? 0
    if (count > peakCount) {
      peakCount = count
      peakHour = hour
    }
  }

  const modelRows: SessionUsageModel[] = [...models.entries()]
    .map(([model, totals]) => ({
      model,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      messages: totals.messages,
    }))
    .sort((left, right) => tokenTotal(right) - tokenTotal(left))
  const topModel = modelRows[0]
  const favoriteModel = topModel === undefined ? null : topModel.model

  const dayRows: SessionUsageDay[] = []
  for (let day = windowStartDay; day <= today; day += 1) {
    const bucket = days.get(day)
    dayRows.push({
      date: calendar.dateKey(day),
      tokens: bucket?.tokens ?? 0,
      messages: bucket?.messages ?? 0,
    })
  }

  const weekRows: SessionUsageWeek[] = [...weeks.entries()]
    .filter(([start]) => start >= windowStartDay && start <= today)
    .sort(([left], [right]) => left - right)
    .map(([start, modelsOfWeek]) => ({
      start: calendar.dateKey(start),
      models: [...modelsOfWeek.entries()]
        .map(([model, tokens]): SessionUsageWeekModel => ({ model, tokens }))
        .sort((left, right) => right.tokens - left.tokens),
    }))

  return {
    range,
    rangeStart,
    sessions,
    messages,
    totalTokens,
    activeDays: activeDays.length,
    currentStreak,
    longestStreak,
    peakHour,
    favoriteModel,
    days: dayRows,
    weeks: weekRows,
    models: modelRows,
  }
}

function tokenTotal(model: SessionUsageModel): number {
  return model.inputTokens + model.outputTokens
}

/** Owns corpus-wide usage reads for the Session Remote. */
export class SessionUsageController {
  /**
   * @param ctx - Host context carrying Session query and persistence services.
   */
  constructor(private readonly ctx: Context) {}

  /**
   * Read and aggregate usage across every visible session.
   * @param request - range filter and the client's IANA time zone.
   * @param signal - caller cancellation for corpus listing and persisted reads.
   * @returns the aggregated usage view.
   */
  async usage(request: SessionUsageRequest, signal: AbortSignal): Promise<SessionUsageValue> {
    if (!RANGE_VALUES.has(request.range)) {
      throw new RemoteError('gateway/bad-request', 'session usage range must be "all", "30d", or "7d"', {})
    }
    let timeZone = 'UTC'
    if (request.timeZone !== undefined) {
      const canonical = canonicalClientTimeZone(request.timeZone)
      if (canonical === undefined) {
        throw new RemoteError(
          'session/invalid-time-zone',
          'timeZone must be UTC or a valid IANA Area/Location name',
          { value: request.timeZone },
        )
      }
      timeZone = canonical
    }
    const now = Date.now()
    const rangeStart = request.range === 'all'
      ? 0
      : now - RANGE_WINDOW_DAYS[request.range] * DAY_MS
    const records = await this.ctx.sessionQuery.listSessions(signal)
    signal.throwIfAborted()
    // Visible sessions match the Session list's own visibility rule (a cwd is
    // what makes a session addressable from the browser).
    const ids = records
      .filter(record => record.header.cwd !== undefined)
      .map(record => record.header.id)
    const sources = await this.collectSources(ids, signal)
    signal.throwIfAborted()
    return aggregateSessionUsage(sources, { range: request.range, rangeStart, timeZone, now })
  }

  private async collectSources(
    ids: readonly SessionId[],
    signal: AbortSignal,
  ): Promise<SessionUsageSource[]> {
    const sources: SessionUsageSource[] = []
    let cursor = 0
    const worker = async (): Promise<void> => {
      for (;;) {
        signal.throwIfAborted()
        const index = cursor
        if (index >= ids.length) return
        cursor += 1
        const sessionId = ids[index] as SessionId
        try {
          using observation = await this.ctx.sessionQuery.observeSession(sessionId, {
            signal,
            projectionMode: 'none',
          })
          signal.throwIfAborted()
          sources.push({
            sessionId,
            messages: foldSessionUsageEvents(observation.events),
          })
        } catch (error) {
          signal.throwIfAborted()
          // One unreadable or vanished session must not fail the whole stats
          // read; the Session list tolerates per-row cold failures the same way.
          this.ctx.logger.warn(
            `api-session.usage: observing "${sessionId}" failed; skipping it: ${String(error)}`,
          )
        }
      }
    }
    const workerCount = Math.min(USAGE_OBSERVE_CONCURRENCY, ids.length)
    const settlements = await Promise.allSettled(
      Array.from({ length: workerCount }, () => worker()),
    )
    signal.throwIfAborted()
    /* v8 ignore start -- workers settle per-session failures; they reject only on the shared abort above */
    for (const settlement of settlements) {
      if (settlement.status === 'rejected') throw settlement.reason
    }
    /* v8 ignore stop */
    return sources
  }
}
