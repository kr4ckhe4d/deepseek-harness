/** Usage-statistics fold, time-zone bucketing, and Remote aggregation. */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createAssistantMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import {
  aggregateSessionUsage,
  createLocalCalendar,
  foldSessionUsageEvents,
  SessionUsageController,
} from '../src/usage.ts'
import type { SessionUsageRequest } from '../src/types.ts'

const sid = (id: string): SessionId => id as SessionId
const DAY_MS = 86_400_000

function userMessage(seq: number, time: number): SessionEvent {
  return {
    type: 'user/message',
    seq,
    time,
    data: createUserMessage({ content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } }),
    surfaceOp: 'append',
  }
}

function assistantMessage(
  seq: number,
  time: number,
  model: string,
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number },
): SessionEvent {
  return {
    type: 'assistant/message',
    seq,
    time,
    data: {
      turn: 1,
      step: 1,
      message: createAssistantMessage({
        content: [{ type: 'text', text: 'ok' }],
        source: { provider: 'deepseek-official', model },
      }),
      ...(usage === undefined ? {} : { usage }),
    },
    surfaceOp: 'append',
  }
}

/** A UTC epoch date, for readable fixture times. */
function utc(y: number, m: number, d: number, h = 0, min = 0): number {
  return Date.UTC(y, m - 1, d, h, min)
}

describe('foldSessionUsageEvents', () => {
  it('folds user and assistant messages with per-request usage and model facts', () => {
    const events = [
      { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } } as SessionEvent,
      userMessage(1, 2),
      { type: 'assistant/chunk', seq: 2, time: 3, data: { turn: 1, step: 1, chunk: { type: 'text-delta', text: 'o' } } } as SessionEvent,
      assistantMessage(3, 4, 'deepseek-chat', { inputTokens: 5, outputTokens: 2 }),
      assistantMessage(4, 5, 'deepseek-reasoner'),
      userMessage(5, 6),
    ]
    const folded = foldSessionUsageEvents(events)
    expect(folded).toEqual([
      { time: 2, kind: 'user' },
      {
        time: 4, kind: 'assistant', model: 'deepseek-chat',
        tokens: 7, inputTokens: 5, outputTokens: 2,
      },
      { time: 5, kind: 'assistant', model: 'deepseek-reasoner', tokens: undefined, inputTokens: undefined, outputTokens: undefined },
      { time: 6, kind: 'user' },
    ])
  })

  it('counts cache tokens in the billed total', () => {
    const folded = foldSessionUsageEvents([assistantMessage(1, 1, 'deepseek-chat', {
      inputTokens: 3, outputTokens: 4, cacheReadTokens: 10, cacheWriteTokens: 1,
    })])
    expect(folded).toEqual([{
      time: 1, kind: 'assistant', model: 'deepseek-chat', tokens: 18, inputTokens: 3, outputTokens: 4,
    }])
  })

  it('ignores every other event type', () => {
    const events = [
      { type: 'turn/start', seq: 0, time: 1, data: { turn: 1 } } as SessionEvent,
      { type: 'tool/call', seq: 1, time: 2, data: { turn: 1, step: 1, callId: 'c', name: 'ls', arguments: '{}' } } as SessionEvent,
      { type: 'request/context', seq: 2, time: 3, data: { provider: 'deepseek-official', model: 'deepseek-chat' } } as SessionEvent,
    ]
    expect(foldSessionUsageEvents(events)).toEqual([])
  })
})

describe('createLocalCalendar', () => {
  it('resolves UTC days, hours, and weekdays', () => {
    const calendar = createLocalCalendar('UTC')
    // 2024-03-03 is a Sunday.
    const sunday = utc(2024, 3, 3, 12)
    expect(calendar.day(sunday)).toBe(Date.UTC(2024, 2, 3) / DAY_MS)
    expect(calendar.hour(sunday)).toBe(12)
    expect(calendar.weekday(sunday)).toBe(0)
    expect(calendar.dateKey(calendar.day(sunday))).toBe('2024-03-03')
  })

  it('buckets by the requested time zone, not UTC', () => {
    const calendar = createLocalCalendar('America/New_York')
    // 2024-03-01 23:30 UTC is 2024-03-01 18:30 EST (UTC-5).
    const lateUtc = utc(2024, 3, 1, 23, 30)
    expect(calendar.day(lateUtc)).toBe(Date.UTC(2024, 2, 1) / DAY_MS)
    expect(calendar.hour(lateUtc)).toBe(18)
    // 2024-03-01 is a Friday.
    expect(calendar.weekday(lateUtc)).toBe(5)
    // 2024-03-02 00:30 UTC is 2024-03-01 19:30 EST — still the same local day.
    const afterMidnightUtc = utc(2024, 3, 2, 0, 30)
    expect(calendar.day(afterMidnightUtc)).toBe(Date.UTC(2024, 2, 1) / DAY_MS)
  })
})

describe('aggregateSessionUsage', () => {
  const now = utc(2024, 3, 10, 12)
  const options = { range: 'all' as const, rangeStart: 0, timeZone: 'UTC', now }

  function source(sessionId: string, messages: readonly { time: number; kind: 'user' | 'assistant'; model?: string; input?: number; output?: number }[]) {
    return {
      sessionId: sid(sessionId),
      messages: messages.map(message => message.kind === 'user'
        ? { time: message.time, kind: 'user' as const }
        : {
          time: message.time,
          kind: 'assistant' as const,
          model: message.model ?? 'deepseek-chat',
          tokens: message.input === undefined ? undefined : message.input + message.output!,
          inputTokens: message.input,
          outputTokens: message.output,
        }),
    }
  }

  it('totals messages, tokens, sessions, and derives every overview stat', () => {
    const value = aggregateSessionUsage([
      source('a', [
        { time: utc(2024, 3, 1, 8), kind: 'user' },
        { time: utc(2024, 3, 1, 8), kind: 'assistant', model: 'deepseek-chat', input: 10, output: 5 },
        { time: utc(2024, 3, 2, 9), kind: 'user' },
        { time: utc(2024, 3, 2, 9), kind: 'assistant', model: 'deepseek-reasoner', input: 100, output: 50 },
      ]),
      source('b', [
        { time: utc(2024, 3, 10, 23), kind: 'user' },
        { time: utc(2024, 3, 10, 23), kind: 'assistant', model: 'deepseek-chat', input: 2, output: 1 },
      ]),
    ], options)
    expect(value.sessions).toBe(2)
    expect(value.messages).toBe(6)
    expect(value.totalTokens).toBe(168)
    expect(value.activeDays).toBe(3)
    // Active days: Mar 1, 2 (a 2-day run) and Mar 10 (today, its own run).
    expect(value.currentStreak).toBe(1)
    expect(value.longestStreak).toBe(2)
    expect(value.peakHour).toBe(8)
    expect(value.favoriteModel).toBe('deepseek-reasoner')
    expect(value.models).toEqual([
      { model: 'deepseek-reasoner', inputTokens: 100, outputTokens: 50, messages: 1 },
      { model: 'deepseek-chat', inputTokens: 12, outputTokens: 6, messages: 2 },
    ])
  })

  it('computes streaks over consecutive local days', () => {
    const value = aggregateSessionUsage([
      source('a', [
        { time: utc(2024, 3, 5), kind: 'user' },
        { time: utc(2024, 3, 6), kind: 'user' },
        { time: utc(2024, 3, 7), kind: 'user' },
        { time: utc(2024, 3, 9), kind: 'user' },
        { time: utc(2024, 3, 10), kind: 'user' },
      ]),
    ], options)
    // Active: 5,6,7 and 9,10 → longest 3 (5-7), current 2 (9-10).
    expect(value.currentStreak).toBe(2)
    expect(value.longestStreak).toBe(3)
  })

  it('breaks the current streak when today is inactive', () => {
    const value = aggregateSessionUsage([
      source('a', [
        { time: utc(2024, 3, 1), kind: 'user' },
        { time: utc(2024, 3, 2), kind: 'user' },
      ]),
    ], options)
    expect(value.currentStreak).toBe(0)
    expect(value.longestStreak).toBe(2)
  })

  it('emits a bounded day series for the heatmap ending today', () => {
    const value = aggregateSessionUsage([], options)
    expect(value.days).toHaveLength(ALL_RANGE_WINDOW_DAYS)
    expect(value.days[value.days.length - 1]!.date).toBe('2024-03-10')
    expect(value.days[0]!.date).toBe('2023-03-13')
    expect(value.days.every(day => day.tokens === 0 && day.messages === 0)).toBe(true)
  })

  it('groups weekly buckets by model and local Sunday starts', () => {
    const value = aggregateSessionUsage([
      source('a', [
        // 2024-03-04 (Monday) and 2024-03-08 (Friday) share the week starting
        // Sunday 2024-03-03; 2024-03-10 (Sunday) opens the next week.
        { time: utc(2024, 3, 4), kind: 'assistant', model: 'deepseek-chat', input: 10, output: 0 },
        { time: utc(2024, 3, 8), kind: 'assistant', model: 'deepseek-reasoner', input: 20, output: 0 },
        { time: utc(2024, 3, 10), kind: 'assistant', model: 'deepseek-chat', input: 30, output: 0 },
      ]),
    ], options)
    expect(value.weeks).toEqual([
      { start: '2024-03-03', models: [{ model: 'deepseek-reasoner', tokens: 20 }, { model: 'deepseek-chat', tokens: 10 }] },
      { start: '2024-03-10', models: [{ model: 'deepseek-chat', tokens: 30 }] },
    ])
  })

  it('respects the range cut for every figure', () => {
    const value = aggregateSessionUsage([
      source('a', [
        { time: utc(2024, 2, 1), kind: 'user' },
        { time: utc(2024, 2, 1), kind: 'assistant', model: 'deepseek-chat', input: 999, output: 0 },
        { time: utc(2024, 3, 5), kind: 'user' },
        { time: utc(2024, 3, 5), kind: 'assistant', model: 'deepseek-chat', input: 1, output: 0 },
      ]),
    ], { range: '7d', rangeStart: now - 7 * DAY_MS, timeZone: 'UTC', now })
    expect(value.messages).toBe(2)
    expect(value.totalTokens).toBe(1)
    expect(value.sessions).toBe(1)
    expect(value.activeDays).toBe(1)
    expect(value.days).toHaveLength(7)
    expect(value.days[value.days.length - 1]!.date).toBe('2024-03-10')
    expect(value.models).toEqual([{ model: 'deepseek-chat', inputTokens: 1, outputTokens: 0, messages: 1 }])
  })

  it('counts sessions only when they carry an in-range message', () => {
    const value = aggregateSessionUsage([
      source('empty', []),
      source('stale', [{ time: utc(2024, 1, 1), kind: 'user' }]),
    ], { range: '7d', rangeStart: now - 7 * DAY_MS, timeZone: 'UTC', now })
    expect(value.sessions).toBe(0)
  })

  it('leaves peak hour and favorite model undefined-safe when empty', () => {
    const value = aggregateSessionUsage([], options)
    expect(value.peakHour).toBe(0)
    expect(value.favoriteModel).toBeNull()
    expect(value.models).toEqual([])
    expect(value.weeks).toEqual([])
  })
})

const ALL_RANGE_WINDOW_DAYS = 364

describe('SessionUsageController.usage', () => {
  function bench(sessionQuery: Record<string, unknown>) {
    const ctx = new Context()
    ctx.provide('sessionQuery', sessionQuery as never)
    return new SessionUsageController(ctx)
  }

  function observation(events: readonly SessionEvent[]) {
    return { events, cursor: events.length - 1, source: 'live' as const, [Symbol.dispose]: () => {} }
  }

  it('validates the range and time zone', async () => {
    const controller = bench({})
    await expect(controller.usage({ range: 'year' } as unknown as SessionUsageRequest, new AbortController().signal))
      .rejects.toMatchObject({ code: 'gateway/bad-request' })
    await expect(controller.usage({ range: 'all', timeZone: 'Mars/Olympus' }, new AbortController().signal))
      .rejects.toMatchObject({ code: 'session/invalid-time-zone' })
  })

  it('aggregates visible sessions in the requested time zone', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(utc(2024, 3, 10, 12))
    try {
      const listSessions = vi.fn(() => Promise.resolve([
        { header: { id: sid('a'), cwd: '/proj' } },
        { header: { id: sid('b'), cwd: '/other' } },
        // A cwd-less (subagent) session is not a visible Session and is skipped.
        { header: { id: sid('sub'), parentSession: sid('a'), origin: 'subagent' } },
      ]))
      const observeSession = vi.fn((id: SessionId) => Promise.resolve(id === sid('a')
        ? observation([userMessage(0, utc(2024, 3, 9, 20)), assistantMessage(1, utc(2024, 3, 9, 21), 'deepseek-chat', { inputTokens: 4, outputTokens: 6 })])
        : observation([userMessage(0, utc(2024, 3, 10, 10))])))
      const controller = bench({ listSessions, observeSession })
      const value = await controller.usage({ range: 'all', timeZone: 'UTC' }, new AbortController().signal)
      expect(listSessions).toHaveBeenCalledTimes(1)
      expect(observeSession).toHaveBeenCalledTimes(2)
      expect(value.sessions).toBe(2)
      expect(value.messages).toBe(3)
      expect(value.totalTokens).toBe(10)
      expect(value.favoriteModel).toBe('deepseek-chat')
      expect(value.models).toEqual([{ model: 'deepseek-chat', inputTokens: 4, outputTokens: 6, messages: 1 }])
    } finally {
      vi.useRealTimers()
    }
  })

  it('skips one unreadable session without failing the whole read', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(utc(2024, 3, 10, 12))
    try {
      const warn = vi.fn()
      const ctx = new Context()
      ctx.provide('sessionQuery', {
        listSessions: () => Promise.resolve([{ header: { id: sid('ok'), cwd: '/proj' } }, { header: { id: sid('bad'), cwd: '/proj' } }]),
        observeSession: (id: SessionId) => id === sid('bad')
          ? Promise.reject(new Error('storage offline'))
          : Promise.resolve(observation([userMessage(0, utc(2024, 3, 10, 9))])),
      } as never)
      ctx.logger.warn = warn
      const value = await new SessionUsageController(ctx)
        .usage({ range: 'all' }, new AbortController().signal)
      expect(value.sessions).toBe(1)
      expect(value.messages).toBe(1)
      expect(warn).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('defaults to UTC when no time zone is supplied', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(utc(2024, 3, 10, 12))
    try {
      const controller = bench({
        listSessions: () => Promise.resolve([]),
        observeSession: () => Promise.resolve(observation([])),
      })
      const value = await controller.usage({ range: '7d' }, new AbortController().signal)
      expect(value.range).toBe('7d')
      expect(value.rangeStart).toBe(utc(2024, 3, 3, 12))
      expect(value.days).toHaveLength(7)
      expect(value.days[value.days.length - 1]!.date).toBe('2024-03-10')
    } finally {
      vi.useRealTimers()
    }
  })
})
