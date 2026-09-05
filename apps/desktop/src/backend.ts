/**
 * Backend lifecycle for the desktop shell: spawns the dsh web application
 * through the supported `dsh` launcher, waits for its readiness line, and
 * owns orderly termination. The desktop shell never composes an inline
 * plugin tree; the web profile remains the only application launcher.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { createInterface } from 'node:readline'
import { parseWebUrlLine } from './url-line.ts'

/**
 * How to invoke the `dsh` launcher. The two carriers differ only here: a
 * development checkout runs the TypeScript sources under a real Node with
 * tsx, while a packaged application runs the bundled closure's built
 * JavaScript under Electron's own Node.
 */
export interface BackendLaunch {
  /** Executable that carries the launcher. */
  command: string
  /** Arguments naming the launcher, before this app's own flags. */
  args: readonly string[]
  /** Environment additions the carrier needs. */
  env: Readonly<Record<string, string>>
}

/** How the backend is launched and where its agent sessions root. */
export interface BackendOptions {
  /** The launcher carrier for this build (see {@link BackendLaunch}). */
  launch: BackendLaunch
  /** Directory the spawned profile treats as the default workspace root. */
  workspaceDir: string
  /** Milliseconds to wait for the readiness line before failing. */
  readyTimeoutMs: number
  /** Receives every backend stdout/stderr line for the rolling log. */
  onLog: (line: string) => void
  /** Called when the child exits after readiness (crash or external kill). */
  onExit: (code: number | null) => void
}

/** A running backend: its authenticated URL and the handle to stop it. */
export interface Backend {
  /** The tokenized URL printed by the readiness line. */
  url: URL
  /** Terminates the child: SIGTERM, then SIGKILL after a grace period. */
  stop: () => Promise<void>
}

/** Grace period between SIGTERM and SIGKILL during stop(). */
const STOP_GRACE_MS = 5_000

/**
 * Spawn the web profile (`--no-open --port 0`) through the given carrier and
 * resolve once it prints its readiness line.
 *
 * @param options - launch directories, timeout, and lifecycle callbacks.
 * @returns the running backend with its authenticated URL.
 */
export async function startBackend(options: BackendOptions): Promise<Backend> {
  const child = spawn(
    options.launch.command,
    [...options.launch.args, '--profile', 'web', '--no-open', '--port', '0'],
    {
      cwd: options.workspaceDir,
      env: {
        ...process.env,
        ...options.launch.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const url = await waitForReadiness(child, options)
  child.on('exit', (code) => { options.onExit(code) })
  return { url, stop: () => stopChild(child) }
}

function waitForReadiness(child: ChildProcess, options: BackendOptions): Promise<URL> {
  return new Promise<URL>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`dsh web did not become ready within ${String(options.readyTimeoutMs)}ms`))
      void stopChild(child)
    }, options.readyTimeoutMs)
    const settle = (outcome: () => void): void => { clearTimeout(timer); outcome() }
    for (const stream of [child.stdout, child.stderr]) {
      if (stream === null) continue
      createInterface({ input: stream }).on('line', (line: string) => {
        options.onLog(line)
        const url = parseWebUrlLine(line)
        if (url !== undefined) settle(() => { resolve(url) })
      })
    }
    child.on('error', (error) => { settle(() => { reject(error) }) })
    child.on('exit', (code) => {
      settle(() => { reject(new Error(`dsh web exited with code ${String(code)} before becoming ready`)) })
    })
  })
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = once(child, 'exit')
  child.kill('SIGTERM')
  const killTimer = setTimeout(() => { child.kill('SIGKILL') }, STOP_GRACE_MS)
  await exited
  clearTimeout(killTimer)
}
