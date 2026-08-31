/**
 * Profile rows on the Settings General page: the full-name and nickname text
 * fields over the durable `ui-profile` section. Edits commit on blur (and on
 * Enter), so a half-typed name never churns the Host document; the displayed
 * value follows the local draft while focused and the accepted setting
 * otherwise.
 */
import { useEffect, useRef, useState } from 'react'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ProfileSettings } from '../profile-settings.ts'
import css from './ProfileRow.module.css'

/** Registration-side profile face. */
export interface ProfileRowInjected {
  hooks: {
    /** Accepted durable profile section bound as useProfile. */
    profile: HostObservable<ProfileSettings>
  }
  /** Persist one profile field. */
  setProfileField: (field: keyof ProfileSettings, value: string) => void
}

/** Full Settings-row props. */
export type ProfileRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings'>
  & InjectFace<ProfileRowInjected>

function Field({ label, value, onCommit }: {
  label: string
  value: string
  onCommit: (value: string) => void
}) {
  const [draft, setDraft] = useState<string | undefined>(undefined)
  // A remote acceptance while unfocused refreshes the field; an open draft wins.
  useEffect(() => { setDraft(undefined) }, [value])
  // Unmount (closing the settings dialog) commits a pending draft the same
  // way blur does, so a typed value never silently vanishes.
  const pending = useRef<{ draft: string | undefined; value: string; onCommit: (value: string) => void }>({ draft, value, onCommit })
  pending.current = { draft, value, onCommit }
  useEffect(() => () => {
    const { draft: last, value: accepted, onCommit: commit } = pending.current
    if (last !== undefined && last !== accepted) commit(last)
  }, [])
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{label}</div>
      </div>
      <input
        className={css.input}
        type="text"
        value={draft ?? value}
        aria-label={label}
        onChange={(event) => { setDraft(event.currentTarget.value) }}
        onBlur={() => {
          if (draft !== undefined && draft !== value) onCommit(draft)
          setDraft(undefined)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
    </div>
  )
}

/**
 * Render the two profile field rows.
 * @param props - composed Settings slot props.
 * @returns the rows fragment.
 */
export function ProfileRow({ useProfile, setProfileField, t }: ProfileRowProps) {
  const profile = useProfile(value => value)
  return (
    <>
      <Field
        label={t('profile.fullName')}
        value={profile.fullName}
        onCommit={(value) => { setProfileField('fullName', value) }}
      />
      <Field
        label={t('profile.nickname')}
        value={profile.nickname}
        onCommit={(value) => { setProfileField('nickname', value) }}
      />
    </>
  )
}
