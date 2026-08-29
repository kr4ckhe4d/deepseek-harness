/**
 * Usage Overview tab: eight stat cards over a four-column grid plus the
 * calendar heatmap of daily token volume below. Heatmap cells shade by the
 * day's billed tokens against the window maximum (four buckets, empty for no
 * activity), laid out GitHub-contributions style: rows are weekdays, columns
 * are weeks, and the leading column pads to a Sunday start.
 */

import type { ReactNode } from 'react'
import type { SessionUsageDay, SessionUsageValue } from '@deepseek-ai/dsh-api-remotes/client'
import { formatCompact, formatExact, type UsageTranslate } from './format.ts'
import { monthLabel, shortDateLabel, weekdayOfKey } from './dates.ts'
import styles from './UsageSection.module.css'

/** Props of the Overview tab. */
export interface OverviewTabProps {
  value: SessionUsageValue
  t: UsageTranslate
}

/** One stat card's label/value pair. */
interface StatCard {
  readonly label: string
  readonly value: string
}

const HEATMAP_LEVELS = 4

/** Shade bucket for one day's token volume against the window maximum. */
export function heatLevel(tokens: number, maxTokens: number): number {
  if (tokens <= 0 || maxTokens <= 0) return 0
  const ratio = tokens / maxTokens
  if (ratio >= 0.75) return HEATMAP_LEVELS
  if (ratio >= 0.5) return 3
  if (ratio >= 0.25) return 2
  return 1
}

/** Slice one flat day series into Sunday-aligned week columns. */
export function heatWeeks(days: readonly SessionUsageDay[]): (SessionUsageDay | null)[][] {
  const leading = weekdayOfKey(days[0]?.date ?? '1970-01-04')
  const columns: (SessionUsageDay | null)[][] = []
  let column: (SessionUsageDay | null)[] = []
  for (let index = 0; index < leading; index += 1) column.push(null)
  for (const day of days) {
    column.push(day)
    if (column.length === 7) {
      columns.push(column)
      column = []
    }
  }
  if (column.length > 0) columns.push(column)
  return columns
}

/**
 * Render the Overview tab content.
 * @param props - the aggregated view and the locale seat.
 * @returns the stat grid and heatmap.
 */
export function OverviewTab({ value, t }: OverviewTabProps): ReactNode {
  const maxTokens = value.days.reduce((maximum, day) => Math.max(maximum, day.tokens), 0)
  const cards: StatCard[] = [
    { label: t('statSessions'), value: formatExact(value.sessions, t) },
    { label: t('statMessages'), value: formatExact(value.messages, t) },
    { label: t('statTotalTokens'), value: formatCompact(value.totalTokens, t) },
    { label: t('statActiveDays'), value: formatExact(value.activeDays, t) },
    { label: t('statCurrentStreak'), value: formatExact(value.currentStreak, t) },
    { label: t('statLongestStreak'), value: formatExact(value.longestStreak, t) },
    {
      label: t('statPeakHour'),
      value: t('peakHourValue', { hour: String(value.peakHour).padStart(2, '0') }),
    },
    { label: t('statFavoriteModel'), value: value.favoriteModel ?? t('none') },
  ]
  return (
    <div className={styles.tabBody}>
      <div className={styles.statGrid}>
        {cards.map(card => (
          <div key={card.label} className={styles.statCard}>
            <span className={styles.statLabel}>{card.label}</span>
            <span className={styles.statValue}>{card.value}</span>
          </div>
        ))}
      </div>
      <CalendarHeatmap days={value.days} maxTokens={maxTokens} t={t} />
    </div>
  )
}

/** The GitHub-style daily token heatmap. */
function CalendarHeatmap({
  days,
  maxTokens,
  t,
}: {
  days: readonly SessionUsageDay[]
  maxTokens: number
  t: UsageTranslate
}): ReactNode {
  const weeks = heatWeeks(days)
  return (
    <div className={styles.heatmap}>
      <span className={styles.heatmapCaption}>{t('heatmapCaption')}</span>
      <div className={styles.heatmapBody}>
        <div className={styles.heatmapWeekdays}>
          <span className={styles.heatmapMonthSpacer} />
          {WEEKDAY_ROW.map(index => (
            <span key={index} className={styles.heatmapWeekday}>{weekdayLabel(index)}</span>
          ))}
        </div>
        <div className={styles.heatmapColumns}>
          {weeks.map((week, columnIndex) => {
            const first = week.find((day): day is SessionUsageDay => day !== null)
            const previous = columnIndex === 0
              ? undefined
              : weeks[columnIndex - 1]?.find((day): day is SessionUsageDay => day !== null)
            const month = first !== undefined
              && (previous === undefined || monthLabel(first.date) !== monthLabel(previous.date))
              ? monthLabel(first.date)
              : ''
            return (
              <div key={columnIndex} className={styles.heatmapColumn}>
                <span className={styles.heatmapMonth}>{month}</span>
                <div className={styles.heatmapDays}>
                  {week.map((day, rowIndex) => day === null
                    ? <span key={rowIndex} className={styles.heatmapCellEmpty} />
                    : (
                      <span
                        key={rowIndex}
                        className={`${styles.heatmapCell} ${styles[`heatmapLevel${heatLevel(day.tokens, maxTokens)}`] ?? ''}`}
                        title={day.tokens === 0
                          ? t('dayTooltipEmpty', { date: shortDateLabel(day.date) })
                          : t('dayTooltipTokens', {
                            date: shortDateLabel(day.date),
                            tokens: formatCompact(day.tokens, t),
                            messages: formatExact(day.messages, t),
                          })}
                      />
                    ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className={styles.heatmapLegend}>
        <span className={styles.heatmapLegendText}>{t('heatmapLegendLess')}</span>
        {[0, 1, 2, 3, HEATMAP_LEVELS].map(level => (
          <span
            key={level}
            className={`${styles.heatmapCell} ${styles[`heatmapLevel${level}`] ?? ''}`}
          />
        ))}
        <span className={styles.heatmapLegendText}>{t('heatmapLegendMore')}</span>
      </div>
    </div>
  )
}

/** One known Sunday and the six following dates, for locale-aware weekday labels. */
const WEEKDAY_ROW = [0, 1, 2, 3, 4, 5, 6]

/** Locale-aware narrow weekday label for a row index (0 = Sunday). */
function weekdayLabel(row: number): string {
  return new Date(Date.UTC(2024, 2, 3 + row)).toLocaleDateString(undefined, { weekday: 'narrow' })
}
