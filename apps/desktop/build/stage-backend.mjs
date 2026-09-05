/**
 * Stage the backend closure the packaged application ships.
 *
 * `pnpm deploy` gives a hoisted, mostly self-contained tree, but the vendored
 * Cordis packages are `link:` overrides: pnpm stages them as relative symlinks
 * that climb out of the closure into the repository's `vendor/`. Those dangle
 * as soon as the application leaves the checkout, so this step replaces every
 * escaping symlink with a real copy and then asserts that nothing in the
 * closure resolves outside it.
 *
 * A replaced package's own `node_modules` is deliberately dropped: the closure
 * is hoisted, so its dependencies already sit at the closure root, and copying
 * the checkout's development tree would drag unrelated packages in.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const CLOSURE_PACKAGE = 'dsh-desktop-runtime-closure'
const STAGING_DIR = path.join(PACKAGE_DIR, 'staged-backend')

/**
 * Every symlink under one directory, deepest last.
 *
 * @param {string} root - directory to walk.
 * @returns {string[]} absolute symlink paths.
 */
function symlinksUnder(root) {
  const found = []
  const stack = [root]
  while (stack.length > 0) {
    const dir = stack.pop()
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) found.push(full)
      else if (entry.isDirectory()) stack.push(full)
    }
  }
  return found
}

/**
 * Whether a resolved path lies inside the closure.
 *
 * @param {string} target - resolved absolute path.
 * @param {string} root - resolved closure root.
 * @returns {boolean} true when `target` is the root or below it.
 */
function isInside(target, root) {
  return target === root || target.startsWith(`${root}${path.sep}`)
}

const deploy = spawnSync(
  'pnpm',
  [
    '--filter', CLOSURE_PACKAGE, 'deploy', '--prod', '--legacy',
    '--config.node-linker=hoisted', STAGING_DIR,
  ],
  { cwd: PACKAGE_DIR, stdio: 'inherit' },
)
if (deploy.status !== 0) {
  throw new Error(`stage-backend: pnpm deploy exited with ${String(deploy.status)}`)
}

// `pnpm deploy --prod` leaves this workspace's install state marked
// production, and every later pnpm command then refuses to run until the
// development tree is restored. Packaging must not strand the checkout.
const restore = spawnSync('pnpm', ['install', '--no-frozen-lockfile'], {
  cwd: PACKAGE_DIR,
  stdio: 'inherit',
  env: { ...process.env, CI: 'true' },
})
if (restore.status !== 0) {
  throw new Error(`stage-backend: restoring the development install exited with ${String(restore.status)}`)
}

const root = fs.realpathSync(STAGING_DIR)
let replaced = 0
for (const link of symlinksUnder(root)) {
  let target
  try {
    target = fs.realpathSync(link)
  } catch {
    // A link the checkout left dangling cannot be carried into the app; the
    // closure is hoisted, so dropping it keeps resolution at the root.
    fs.rmSync(link, { force: true })
    continue
  }
  if (isInside(target, root)) continue
  fs.rmSync(link, { force: true })
  fs.cpSync(target, link, {
    recursive: true,
    dereference: true,
    filter: source => path.basename(source) !== 'node_modules',
  })
  replaced += 1
}

const escaping = symlinksUnder(root).filter((link) => {
  try {
    return !isInside(fs.realpathSync(link), root)
  } catch {
    return true
  }
})
if (escaping.length > 0) {
  throw new Error(`stage-backend: ${String(escaping.length)} symlink(s) still escape the closure: ${escaping[0]}`)
}
console.log(`stage-backend: staged ${root} (${String(replaced)} escaping symlink(s) materialized)`)
