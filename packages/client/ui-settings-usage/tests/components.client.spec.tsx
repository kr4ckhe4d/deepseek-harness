// @vitest-environment jsdom
/** Section tabs, range filter, stat cards, heatmap, and model chart behavior over a scripted view. */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionUsageDay, SessionUsageValue } from '@deepseek-ai/dsh-api-remotes/client'
import { UsageSection } from '../src/client/UsageSection.tsx'
import type { UsageSectionInjected, UsageSectionProps } from '../src/client/UsageSection.tsx'
import { heatLevel, heatWeeks } from '../src/client/OverviewTab.tsx'
import { niceCeiling } from '../src/client/ModelsTab.tsx'
import { formatCompact, formatExact, formatPercent } from '../src/client/format.ts'
import { UsageStore } from '../src/client/store.ts'
import type { UsageWire } from '../src/client/store.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

/** Shared common vocabulary the section's compact formatting falls back to. */
const COMMON: Record<string, string> = {
  'number.thousand': '{value}K',
  'number.million': '{value}M',
  'number.billion': '{value}B',
  'number.groupSeparator': ',',
}

const t: UsageSectionInjected['t'] = (key, params = {}) => {
  const template = (en as Readonly<Record<string, string>>)[key] ?? COMMON[key] ?? key
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return typeof value === 'string' || typeof value === 'number' ? String(value) : match
  })
}

function day(date: string, tokens: number, messages: number): SessionUsageDay {
  return { date, tokens, messages }
}

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
    days: [
      day('2024-03-03', 0, 0),
      day('2024-03-04', 12, 2),
      day('2024-03-05', 120, 4),
      day('2024-03-06', 36, 2),
      day('2024-03-07', 0, 0),
      day('2024-03-08', 0, 0),
      day('2024-03-09', 0, 0),
      day('2024-03-10', 6, 1),
    ],
    weeks: [
      {
        start: '2024-03-03',
        models: [
          { model: 'deepseek-chat', tokens: 120 },
          { model: 'deepseek-reasoner', tokens: 36 },
        ],
      },
      { start: '2024-03-10', models: [{ model: 'deepseek-chat', tokens: 6 }] },
    ],
    models: [
      { model: 'deepseek-reasoner', inputTokens: 100, outputTokens: 50, messages: 1 },
      { model: 'deepseek-chat', inputTokens: 12, outputTokens: 6, messages: 2 },
    ],
    ...overrides,
  }
}

async function mountValue(value: SessionUsageValue, onUsage = vi.fn()) {
  const wire: UsageWire = {
    session: {
      usage: onUsage.mockImplementation((request: { range: string }) =>
        Promise.resolve({
          ok: true as const,
          value: { ...value, range: request.range },
        })),
    },
  }
  const controller = new UsageStore(wire)
  await controller.load()
  const injected: UsageSectionProps = {
    controller,
    useSnapshot: bindSnapshotSelector(controller.store),
    api: wire,
    t,
  }
  const view = render(<UsageSection {...injected} />)
  return { view, controller, onUsage }
}

describe('UsageSection', () => {
  it('renders nothing before the slot injects its dependencies', () => {
    render(<UsageSection />)
    expect(document.body.textContent).toBe('')
  })

  it('shows the overview stat cards and the calendar heatmap', async () => {
    await mountValue(usageValue())
    expect(screen.getByRole('heading', { name: en.title })).toBeDefined()
    expect(screen.getByText(en.tabOverview)).toBeDefined()
    expect(screen.getByText(en.tabModels)).toBeDefined()
    const cards = screen.getAllByText(en.statSessions).length
    expect(cards).toBe(1)
    // 8 stat cards with their formatted values.
    expect(screen.getByText(en.statTotalTokens)).toBeDefined()
    expect(screen.getByText('168')).toBeDefined()
    expect(screen.getByText('08:00')).toBeDefined()
    expect(screen.getByText('deepseek-reasoner')).toBeDefined()
    // Heatmap caption and legend render.
    expect(screen.getByText(en.heatmapCaption)).toBeDefined()
    expect(screen.getByText(en.heatmapLegendLess)).toBeDefined()
    expect(screen.getByText(en.heatmapLegendMore)).toBeDefined()
    // The heatmap renders one titled cell per day (8 days); 2024-03-03 is a
    // Sunday, so the leading column needs no padding.
    expect(document.querySelectorAll('[title]').length).toBe(8)
  })

  it('switches to the Models tab with the weekly chart and model table', async () => {
    await mountValue(usageValue())
    fireEvent.click(screen.getByRole('tab', { name: en.tabModels }))
    expect(screen.getByText(en.chartCaption)).toBeDefined()
    // Legend rows: two models sorted by share, with in/out tokens and share.
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]!).getByText('deepseek-reasoner')).toBeDefined()
    expect(within(rows[0]!).getByText(en.modelTokens.replace('{input}', '100').replace('{output}', '50'))).toBeDefined()
    expect(within(rows[0]!).getByText('89.3%')).toBeDefined()
    expect(within(rows[1]!).getByText('deepseek-chat')).toBeDefined()
  })

  it('shows the expander for more than the top models', async () => {
    const models = Array.from({ length: 8 }, (_, index) => ({
      model: `deepseek-model-${String(index)}`,
      inputTokens: 100 - index,
      outputTokens: 1,
      messages: 1,
    }))
    const value = usageValue({
      totalTokens: 800,
      models,
      weeks: [{ start: '2024-03-03', models: models.map(model => ({ model: model.model, tokens: model.inputTokens })) }],
    })
    await mountValue(value)
    fireEvent.click(screen.getByRole('tab', { name: en.tabModels }))
    expect(screen.getAllByRole('listitem')).toHaveLength(7) // 6 top + expander row
    fireEvent.click(screen.getByRole('button', { name: en.showMore.replace('{count}', '2') }))
    expect(screen.getAllByRole('listitem')).toHaveLength(8)
  })

  it('shows the no-usage message when the view has no models', async () => {
    await mountValue(usageValue({ models: [], weeks: [], totalTokens: 0, favoriteModel: null }))
    fireEvent.click(screen.getByRole('tab', { name: en.tabModels }))
    expect(screen.getByText(en.noUsage)).toBeDefined()
  })

  it('refetches with the selected range on a range-filter click', async () => {
    const { onUsage } = await mountValue(usageValue())
    expect(onUsage).toHaveBeenLastCalledWith(expect.objectContaining({ range: 'all' }))
    fireEvent.click(screen.getByRole('button', { name: en.range30d }))
    expect(onUsage).toHaveBeenLastCalledWith(expect.objectContaining({ range: '30d' }))
    fireEvent.click(screen.getByRole('button', { name: en.range7d }))
    expect(onUsage).toHaveBeenLastCalledWith(expect.objectContaining({ range: '7d' }))
  })

  it('shows the error state with a retry action', async () => {
    const wire: UsageWire = {
      session: {
        usage: vi.fn().mockResolvedValue({
          ok: false as const,
          error: { code: 'internal', message: 'boom', details: {} },
        }),
      },
    }
    const controller = new UsageStore(wire)
    await controller.load()
    render(<UsageSection controller={controller} useSnapshot={bindSnapshotSelector(controller.store)} api={wire} t={t} />)
    expect(screen.getByText(`${en.loadFailed}: boom`)).toBeDefined()
    expect(screen.getByRole('button', { name: en.retry })).toBeDefined()
  })
})

describe('formatters', () => {
  it('formats compact, exact, and percent values', () => {
    expect(formatCompact(517, t)).toBe('517')
    expect(formatCompact(12_200, t)).toBe('12.2K')
    expect(formatCompact(517_000, t)).toBe('517K')
    expect(formatCompact(1_200_000, t)).toBe('1.2M')
    expect(formatCompact(2_900_000_000, t)).toBe('2.9B')
    expect(formatExact(19_902, t)).toBe('19,902')
    expect(formatPercent(150, 168)).toBe('89.3%')
    expect(formatPercent(1, 3)).toBe('33.3%')
    expect(formatPercent(0, 0)).toBe('0%')
  })
})

describe('overview helpers', () => {
  it('buckets heatmap cells into four shade levels plus empty', () => {
    expect(heatLevel(0, 100)).toBe(0)
    expect(heatLevel(10, 100)).toBe(1)
    expect(heatLevel(30, 100)).toBe(2)
    expect(heatLevel(60, 100)).toBe(3)
    expect(heatLevel(90, 100)).toBe(4)
    expect(heatLevel(0, 0)).toBe(0)
  })

  it('pads the leading week column to a Sunday start', () => {
    // 2024-03-06 is a Wednesday (weekday 3): the first column carries three
    // empty cells before the first real day, and the trailing partial column
    // stays unpadded like the current week on GitHub.
    const weeks = heatWeeks([day('2024-03-06', 1, 1), day('2024-03-07', 1, 1)])
    expect(weeks).toHaveLength(1)
    expect(weeks[0]).toHaveLength(5)
    expect(weeks[0]!.slice(0, 3)).toEqual([null, null, null])
  })

  it('rounds chart ceilings to 1/2/5 powers of ten', () => {
    expect(niceCeiling(0)).toBe(1)
    expect(niceCeiling(120)).toBe(200)
    expect(niceCeiling(250)).toBe(500)
    expect(niceCeiling(600)).toBe(1_000)
    expect(niceCeiling(1_000)).toBe(1_000)
  })
})
