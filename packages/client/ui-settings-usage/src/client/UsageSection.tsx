/**
 * Model usage settings section: the Overview and Models tabs over one
 * Host-aggregated usage view, with a time-range filter applying to both.
 * The page reads through its store, which owns the wire call, the range
 * selection, and the load/error lifecycle; the tabs are pure renderers over
 * the accepted snapshot. No extension seats: the section is read-only and
 * nothing else composes into it.
 */

import { useState } from 'react'
import type { ReactNode } from 'react'
import type { InjectFace, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionUsageRange } from '@deepseek-ai/dsh-api-remotes/client'
import { UsageStore, type UsageWire } from './store.ts'
import { OverviewTab } from './OverviewTab.tsx'
import { ModelsTab } from './ModelsTab.tsx'
import styles from './UsageSection.module.css'

/** Injected dependencies of {@link UsageSection} (slot `inject`). */
export interface UsageSectionInjected {
  /** The page store (loaded on mount, refetched on range changes). */
  controller: UsageStore
  hooks: {
    /** Page snapshot bound by the UI renderer as useSnapshot. */
    snapshot: UsageStore['store']
  }
  /** The session Remote wire face the store reads through. */
  api: UsageWire
  /** Section copy plus the shared common vocabulary. */
  t: TranslateNS<'settings.usage'>
}

/** Props delivered by the slot outlet: the inject face spread flat. */
export type UsageSectionProps = Partial<InjectFace<UsageSectionInjected>>

type UsageSectionFace = InjectFace<UsageSectionInjected>

/** The two section tabs. */
type UsageTab = 'overview' | 'models'

/** The ordered range-filter choices. */
const RANGES: readonly SessionUsageRange[] = ['all', '30d', '7d']

/** The two section tabs in display order. */
const TAB_IDS: readonly UsageTab[] = ['overview', 'models']

/**
 * Render the Model usage section content column.
 * @param props - slot-delivered injected dependencies.
 * @returns the section, or null while the shell has not injected yet.
 */
export function UsageSection(props: UsageSectionProps): ReactNode {
  const { controller, useSnapshot, api, t } = props
  if (controller === undefined || useSnapshot === undefined || api === undefined || t === undefined) {
    return null
  }
  return <Loaded injected={{ controller, useSnapshot, api, t }} />
}

function Loaded({ injected }: { injected: UsageSectionFace }): ReactNode {
  const { controller, useSnapshot, t } = injected
  const state = useSnapshot(snapshot => snapshot)
  const [tabActive, setTab] = useState<UsageTab>('overview')

  if (state.status === 'idle') void controller.load()
  if (state.status === 'error') {
    /* v8 ignore next -- an error status always carries text; the fallback satisfies the nullable type */
    const errorText = state.error ?? ''
    return (
      <div className={styles.section}>
        <h2 className={styles.title}>{t('title')}</h2>
        <p className={styles.error}>{`${t('loadFailed')}: ${errorText}`}</p>
        <button type="button" className={styles.secondaryButton} onClick={() => { void controller.load() }}>
          {t('retry')}
        </button>
      </div>
    )
  }

  const value = state.value
  return (
    <div className={styles.section}>
      <h2 className={styles.title}>{t('title')}</h2>
      <p className={styles.intro}>{t('intro')}</p>
      <div className={styles.controls}>
        <div className={styles.tabs} role="tablist" aria-label={t('title')}>
          {TAB_IDS.map(tab => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={tabActive === tab}
              className={styles.control}
              onClick={() => { setTab(tab) }}
            >
              {tabLabel(tab, t)}
            </button>
          ))}
        </div>
        <div className={styles.ranges} role="group" aria-label={t('rangeAll')}>
          {RANGES.map(range => (
            <button
              key={range}
              type="button"
              aria-pressed={state.range === range}
              className={styles.control}
              onClick={() => { void controller.setRange(range) }}
            >
              {rangeLabel(range, t)}
            </button>
          ))}
        </div>
      </div>
      {value === undefined
        ? null
        : tabActive === 'overview'
          ? <OverviewTab value={value} t={t} />
          : <ModelsTab value={value} t={t} />}
    </div>
  )
}

/** Locale copy for one tab value. */
function tabLabel(tab: UsageTab, t: TranslateNS<'settings.usage'>): string {
  return tab === 'overview' ? t('tabOverview') : t('tabModels')
}

/** Locale copy for one range-filter value. */
function rangeLabel(range: SessionUsageRange, t: TranslateNS<'settings.usage'>): string {
  switch (range) {
    case 'all': return t('rangeAll')
    case '30d': return t('range30d')
    case '7d': return t('range7d')
  }
}
