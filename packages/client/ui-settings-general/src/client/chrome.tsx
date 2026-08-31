/**
 * Shell chrome content registered into the shell's trigger/header seats: the
 * sidebar-foot account row (initials avatar + display name) and the panel
 * title text. The shell renders the surrounding chrome (button, nav heading
 * row) and reads each entry's `label` option for aria text.
 */
import { IconUserOutline16 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { initialsOf } from '../profile-settings.ts'
import css from './chrome.module.css'

/** Trigger content props: the sidebar column state + the standard locale seat. */
export type TriggerContentProps = PropsRuntime<'settings.trigger'> & PropsLocale<'settings'>

/** Header content props: the standard locale seat only. */
export type HeaderContentProps = PropsRuntime<'settings.header'> & PropsLocale<'settings'>

/**
 * Render the account-row trigger content: an initials avatar (a generic user
 * glyph before a name is set) plus, in the wide column, the display name.
 * @param props - composed slot props.
 * @returns the trigger content fragment.
 */
export function TriggerContent({ wide, name, t }: TriggerContentProps) {
  const avatar = name === undefined
    ? <span className={css.avatar}><IconUserOutline16 size={14} /></span>
    : <span className={css.avatar}>{initialsOf(name)}</span>
  if (!wide) return avatar
  return (
    <>
      {avatar}
      <span className={css.triggerLabel}>{name ?? t('account.anonymous')}</span>
    </>
  )
}

/**
 * Render the panel title text.
 * @param props - composed slot props.
 * @returns the title text node.
 */
export function HeaderContent({ t }: HeaderContentProps) {
  return <>{t('title')}</>
}

/** Close-button label text props: the standard locale seat only. */
export type CloseLabelProps = PropsRuntime<'settings.close'> & PropsLocale<'settings'>

/**
 * Render the close button's visually-hidden label text.
 * @param props - composed slot props.
 * @returns the label text node.
 */
export function CloseLabel({ t }: CloseLabelProps) {
  return <>{t('close')}</>
}
