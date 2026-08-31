/**
 * Backend lifecycle for the desktop shell: spawns the dsh web application
 * through the supported `dsh` launcher, waits for its readiness line, and
 * owns orderly termination. The desktop shell never composes an inline
 * plugin tree; the web profile remains the only application launcher.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { createInterface } from 'node:readline'
import path from 'node:path'
import { parseWebUrlLine } from './url-line.ts'

/** How the backend is launched and where its agent sessions root. */
export interface BackendOptions {
  /** Absolute repository root holding apps/cli (the in-repo launcher). */
  repoRoot: string
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
 * Spawn `dsh web --no-open --port 0` and resolve once it prints its
 * readiness line.
 *
 * @param options - launch directories, timeout, and lifecycle callbacks.
 * @returns the running backend with its authenticated URL.
 */
export async function startBackend(options: BackendOptions): Promise<Backend> {
  const bin = path.join(options.repoRoot, 'apps/cli/src/bin.ts')
  // Resolve tsx from this package so the loader is found no matter which
  // directory the child runs in (the child's cwd is the workspace root).
  const tsxLoader = import.meta.resolve('tsx/esm')
  // A real Node binary, not Electron-as-Node: the web profile's HMR row needs
  // the loader's module internals, which Electron's patched module system
  // does not expose.
  const node = process.env.DSH_DESKTOP_NODE ?? 'node'
  const child = spawn(
    node,
    ['--import', tsxLoader, bin, 'web', '--no-open', '--port', '0'],
    {
      cwd: options.workspaceDir,
      env: {
        ...process.env,
        // tsx discovers tsconfig from the child's cwd; the workspace root is
        // arbitrary, so pin the repo config that maps workspace packages to
        // their TypeScript sources.
        TSX_TSCONFIG_PATH: path.join(options.repoRoot, 'tsconfig.base.json'),
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
