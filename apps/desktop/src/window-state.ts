/**
 * Persisted main-window geometry: plain-JSON normalization for the state file
 * and a clamp that keeps a restored window on a currently attached display.
 * Pure functions so the file format and clamping are unit-testable without
 * Electron.
 */

/** Persisted main-window geometry and mode. */
export interface WindowState {
  /** Window left edge in screen coordinates. */
  x: number
  /** Window top edge in screen coordinates. */
  y: number
  /** Window outer width in pixels. */
  width: number
  /** Window outer height in pixels. */
  height: number
  /** Whether the window was maximized when last closed. */
  maximized: boolean
}

/** A display's usable work area, matching Electron's `Display.workArea`. */
export interface WorkArea {
  /** Work-area left edge in screen coordinates. */
  x: number
  /** Work-area top edge in screen coordinates. */
  y: number
  /** Work-area width in pixels. */
  width: number
  /** Work-area height in pixels. */
  height: number
}

/** Geometry used when no state file exists or the stored one is invalid. */
export const DEFAULT_WINDOW_STATE: WindowState = { x: 0, y: 0, width: 1280, height: 860, maximized: false }

/** Smallest usable main-window size; also the BrowserWindow minimum. */
export const MIN_WINDOW_SIZE = { width: 640, height: 480 } as const

/**
 * Validate a parsed state file. The file crosses a durable boundary (written
 * by any earlier build, or edited by hand), so every field is checked.
 *
 * @param raw - the JSON.parse result of the state file.
 * @returns the state when structurally valid, otherwise undefined.
 */
export function normalizeWindowState(raw: unknown): WindowState | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  const { x, y, width, height, maximized } = record
  if (typeof x !== 'number' || typeof y !== 'number') return undefined
  if (typeof width !== 'number' || typeof height !== 'number') return undefined
  if (![x, y, width, height].every(Number.isFinite)) return undefined
  if (typeof maximized !== 'boolean') return undefined
  if (width < MIN_WINDOW_SIZE.width || height < MIN_WINDOW_SIZE.height) return undefined
  return { x, y, width, height, maximized }
}

/**
 * Clamp a restored state onto the display whose work area contains most of
 * the window, so a window last seen on a detached monitor reappears on a
 * live one instead of off-screen.
 *
 * @param state - the restored (already normalized) state.
 * @param displays - work areas of the currently attached displays; must be non-empty.
 * @returns a state fully inside one of the given work areas.
 */
export function clampToDisplays(state: WindowState, displays: readonly WorkArea[]): WindowState {
  const area = displays.reduce((best, candidate) =>
    overlapArea(state, candidate) > overlapArea(state, best) ? candidate : best)
  const width = Math.min(state.width, area.width)
  const height = Math.min(state.height, area.height)
  const x = Math.min(Math.max(state.x, area.x), area.x + area.width - width)
  const y = Math.min(Math.max(state.y, area.y), area.y + area.height - height)
  return { x, y, width, height, maximized: state.maximized }
}

function overlapArea(state: WindowState, area: WorkArea): number {
  const w = Math.min(state.x + state.width, area.x + area.width) - Math.max(state.x, area.x)
  const h = Math.min(state.y + state.height, area.y + area.height) - Math.max(state.y, area.y)
  return Math.max(0, w) * Math.max(0, h)
}
