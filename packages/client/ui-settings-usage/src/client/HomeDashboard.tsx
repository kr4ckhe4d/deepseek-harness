/**
 * Home usage dashboard: the blank-session hero card over the same
 * Host-aggregated usage view as the Settings section. It reuses the shared
 * page store, so an open Settings page and the home card always agree; the
 * card is read-only and registers no extension seats.
 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { InjectFace, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionUsageRange } from '@deepseek-ai/dsh-api-remotes/client'
import type { UsageSectionInjected } from './UsageSection.tsx'
import { OverviewTab } from './OverviewTab.tsx'
import { ModelsTab } from './ModelsTab.tsx'
import section from './UsageSection.module.css'
import css from './HomeDashboard.module.css'

/** Props delivered by the slot outlet: the shared inject face spread flat. */
export type HomeDashboardProps = Partial<InjectFace<UsageSectionInjected>>

/** The two card tabs. */
type UsageTab = 'overview' | 'models'

/** The ordered range-filter choices. */
const RANGES: readonly SessionUsageRange[] = ['all', '30d', '7d']

/** The two card tabs in display order. */
const TAB_IDS: readonly UsageTab[] = ['overview', 'models']

/**
 * Render the hero dashboard card.
 * @param props - slot-delivered injected dependencies.
 * @returns the card, or null while the shell has not injected yet or the
 * first load has produced nothing to show.
 */
export function HomeDashboard(props: HomeDashboardProps): ReactNode {
  const { controller, useSnapshot, t } = props
  const [tabActive, setTab] = useState<UsageTab>('overview')
  const state = useSnapshot?.(snapshot => snapshot)
  if (controller === undefined || state === undefined || t === undefined) return null
  if (state.status === 'idle') void controller.load()
  const value = state.value
  // Errors keep the home quiet — the Settings section owns retry affordances.
  if (value === undefined || state.status === 'error') return null
  // A corpus without a single session yet has nothing worth a dashboard.
  if (value.sessions === 0 && state.range === 'all') return null
  return (
    <div className={css.card}>
      <div className={css.controls}>
        <div className={section.tabs} role="tablist" aria-label={t('title')}>
          {TAB_IDS.map(tab => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={tabActive === tab}
              className={section.control}
              onClick={() => { setTab(tab) }}
            >
              {tab === 'overview' ? t('tabOverview') : t('tabModels')}
            </button>
          ))}
        </div>
        <div className={section.ranges} role="group" aria-label={t('rangeAll')}>
          {RANGES.map(range => (
            <button
              key={range}
              type="button"
              aria-pressed={state.range === range}
              className={section.control}
              onClick={() => { void controller.setRange(range) }}
            >
              {rangeLabel(range, t)}
            </button>
          ))}
        </div>
      </div>
      {tabActive === 'overview' ? <OverviewTab value={value} t={t} /> : <ModelsTab value={value} t={t} />}
    </div>
  )
}

/** Locale copy for one range-filter value. */
function rangeLabel(range: SessionUsageRange, t: TranslateNS<'settings.usage'>): string {
  switch (range) {
    case 'all': return t('rangeAll')
    case '30d': return t('range30d')
    case '7d': return t('range7d')
  }
}
