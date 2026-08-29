/**
 * Usage Models tab: a stacked weekly bar chart of token volume split by model
 * plus the per-model legend table below. Model ids come from the Host
 * aggregate (recorded request ids, never hardcoded); the palette is a fixed
 * series of design-token colors assigned by usage-share rank, so a model
 * keeps its color between the chart and its table row.
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import type { SessionUsageModel, SessionUsageValue, SessionUsageWeek } from '@deepseek-ai/dsh-api-remotes/client'
import { formatCompact, formatPercent, type UsageTranslate } from './format.ts'
import { shortDateLabel } from './dates.ts'
import styles from './UsageSection.module.css'

/** Props of the Models tab. */
export interface ModelsTabProps {
  value: SessionUsageValue
  t: UsageTranslate
}

/** Rows shown before the expander reveals the rest. */
const TOP_MODELS = 6

const CHART_WIDTH = 760
const CHART_HEIGHT = 220
const CHART_PAD_LEFT = 44
const CHART_PAD_BOTTOM = 26
const CHART_PAD_TOP = 8
const GRIDLINES = 4

/**
 * Round a chart maximum up to a "nice" value (1/2/5 × power of ten).
 * @param value - the raw maximum.
 * @returns the axis ceiling.
 */
export function niceCeiling(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const head = value / magnitude
  const nice = head <= 1 ? 1 : head <= 2 ? 2 : head <= 5 ? 5 : 10
  return nice * magnitude
}

/**
 * Render the Models tab content.
 * @param props - the aggregated view and the locale seat.
 * @returns the weekly bar chart and the model legend table.
 */
export function ModelsTab({ value, t }: ModelsTabProps): ReactNode {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? value.models : value.models.slice(0, TOP_MODELS)
  const hidden = value.models.length - visible.length
  if (value.models.length === 0) {
    return (
      <div className={styles.tabBody}>
        <span className={styles.chartCaption}>{t('chartCaption')}</span>
        <p className={styles.noUsage}>{t('noUsage')}</p>
      </div>
    )
  }
  return (
    <div className={styles.tabBody}>
      <WeeklyBarChart weeks={value.weeks} models={value.models} t={t} />
      <ul className={styles.modelList}>
        {visible.map(model => (
          <li key={model.model} className={styles.modelRow}>
            <span className={`${styles.swatch} ${seriesClass(value.models, model.model)}`} />
            <span className={styles.modelName}>{model.model}</span>
            <span className={styles.modelTokens}>
              {t('modelTokens', {
                input: formatCompact(model.inputTokens, t),
                output: formatCompact(model.outputTokens, t),
              })}
            </span>
            <span className={styles.modelShare}>
              {formatPercent(model.inputTokens + model.outputTokens, value.totalTokens)}
            </span>
          </li>
        ))}
        {hidden > 0 && !expanded
          ? (
            <li className={styles.modelRow}>
              <button
                type="button"
                className={styles.showMore}
                onClick={() => { setExpanded(true) }}
              >
                {t('showMore', { count: hidden })}
              </button>
            </li>
          )
          : null}
      </ul>
    </div>
  )
}

/** The CSS module class carrying one model's palette color. */
function seriesClass(models: readonly SessionUsageModel[], model: string): string {
  const index = models.findIndex(candidate => candidate.model === model)
  return styles[`series${index < 0 ? 0 : index % SERIES_COUNT}`] ?? ''
}

const SERIES_COUNT = 8

/** The stacked weekly token bar chart, drawn as responsive SVG. */
function WeeklyBarChart({
  weeks,
  models,
  t,
}: {
  weeks: readonly SessionUsageWeek[]
  models: readonly SessionUsageModel[]
  t: UsageTranslate
}): ReactNode {
  const totals = weeks.map(week => week.models.reduce((sum, entry) => sum + entry.tokens, 0))
  const ceiling = niceCeiling(totals.reduce((maximum, total) => Math.max(maximum, total), 0))
  const plotWidth = CHART_WIDTH - CHART_PAD_LEFT
  const plotHeight = CHART_HEIGHT - CHART_PAD_TOP - CHART_PAD_BOTTOM
  const columnWidth = weeks.length === 0 ? plotWidth : plotWidth / weeks.length
  const barWidth = Math.max(2, columnWidth * 0.7)
  const modelIndex = new Map(models.map((model, index) => [model.model, index]))
  const labelEvery = Math.max(1, Math.ceil(weeks.length / 8))

  return (
    <div className={styles.chart}>
      <span className={styles.chartCaption}>{t('chartCaption')}</span>
      {weeks.length === 0
        ? <p className={styles.noUsage}>{t('noUsage')}</p>
        : (
          <svg
            className={styles.chartSvg}
            viewBox={`0 0 ${String(CHART_WIDTH)} ${String(CHART_HEIGHT)}`}
            role="img"
            aria-label={t('chartCaption')}
          >
            {Array.from({ length: GRIDLINES + 1 }, (_, index) => {
              const fraction = index / GRIDLINES
              const y = CHART_PAD_TOP + plotHeight * (1 - fraction)
              const value = ceiling * fraction
              return (
                <g key={index}>
                  <line
                    x1={CHART_PAD_LEFT}
                    x2={CHART_WIDTH}
                    y1={y}
                    y2={y}
                    className={styles.gridline}
                  />
                  <text x={CHART_PAD_LEFT - 6} y={y + 4} textAnchor="end" className={styles.axisLabel}>
                    {formatCompact(value, t)}
                  </text>
                </g>
              )
            })}
            {weeks.map((week, weekIndex) => {
              let stack = 0
              const x = CHART_PAD_LEFT + weekIndex * columnWidth + (columnWidth - barWidth) / 2
              return (
                <g key={week.start}>
                  {week.models.map((entry) => {
                    const height = Math.max(0, entry.tokens / ceiling * plotHeight)
                    const rect = (
                      <rect
                        key={entry.model}
                        x={x}
                        y={CHART_PAD_TOP + plotHeight - stack - height}
                        width={barWidth}
                        height={height}
                        className={styles[`series${(modelIndex.get(entry.model) ?? 0) % SERIES_COUNT}`]}                      >
                        <title>{`${entry.model}: ${formatCompact(entry.tokens, t)}`}</title>
                      </rect>
                    )
                    stack += height
                    return rect
                  })}
                  {weekIndex % labelEvery === 0
                    ? (
                      <text
                        x={x + barWidth / 2}
                        y={CHART_HEIGHT - 8}
                        textAnchor="middle"
                        className={styles.axisLabel}
                      >
                        {shortDateLabel(week.start)}
                      </text>
                    )
                    : null}
                </g>
              )
            })}
          </svg>
        )}
    </div>
  )
}
