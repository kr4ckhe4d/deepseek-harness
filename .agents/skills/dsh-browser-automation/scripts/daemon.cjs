/**
 * Persistent Playwright browser held across tool calls.
 *
 * The dynamic `chrome-browser` plugin runs inside the cordis vm sandbox, where
 * `require`, `fetch`, and timers are trapped, so its only way out is one-shot
 * `shell.run` commands. A browser launched inside such a command dies with it,
 * which is why a per-call worker can never carry a session from a search page
 * to a cart. This daemon owns one browser and one page for its whole lifetime
 * and answers JSON commands over loopback HTTP, so every tool call lands on the
 * same live page.
 */
const http = require('node:http')
const path = require('node:path')
const fs = require('node:fs')
const { spawn } = require('node:child_process')

/** Optional `{ "cdp": "http://127.0.0.1:9223" }`; the plugin cannot set env vars. */
function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'))
  } catch {
    // No config file, or unreadable: the launch-our-own default applies.
    return {}
  }
}
const CONFIG = readConfig()

/**
 * This skill ships inside a deepseek-harness checkout, so walk up to the
 * repository root (the nearest `.git`, file or directory) instead of hardcoding
 * a machine path. Playwright resolves from the web app's node_modules, the
 * workspace package that declares it.
 */
function repoRoot(from) {
  let dir = path.resolve(from)
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) throw new Error('dsh-browser: no .git above ' + from + '; is this a repository checkout?')
    dir = parent
  }
}
const ROOT = repoRoot(__dirname)
const PORT = Number(process.env.DSH_BROWSER_PORT || 47653)
/** Runtime state stays next to the scripts; a .gitignore in the skill dir keeps it out of git. */
const PROFILE_DIR = path.join(__dirname, 'profile')
const SHOT_DIR = path.join(__dirname, 'shots')
const HEADLESS = process.env.DSH_BROWSER_HEADFUL !== '1'
/** When set (e.g. http://127.0.0.1:9223), drive that Chrome instead of launching one. */
const CDP_URL = process.env.DSH_BROWSER_CDP || CONFIG.cdp
const CHROME_BIN = CONFIG.chrome || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const CHROME_PROFILE = path.join(__dirname, 'chrome-profile')
/** Page text is model-facing; an uncapped dump would swamp the turn it informs. */
const TEXT_LIMIT = 20000
const SNAPSHOT_LIMIT = 150
const DEFAULT_TIMEOUT = 30000

let chromium
try {
  ({ chromium } = require(path.join(ROOT, 'apps/web/node_modules/playwright')))
} catch (e) {
  throw new Error('dsh-browser: cannot load playwright from ' + path.join(ROOT, 'apps/web/node_modules/playwright') + ' — run pnpm install first (' + String((e && e.message) || e) + ')')
}

let context
let page
/** Serializes commands: one page cannot service two navigations at once. */
let queue = Promise.resolve()

async function cdpReachable(url) {
  try {
    return (await fetch(new URL('/json/version', url))).ok
  } catch {
    // Nothing listening yet, or Chrome is still starting up.
    return false
  }
}

/**
 * Bring up a visible Chrome on the configured CDP port when none is answering.
 * Chrome ignores --remote-debugging-port under its default user data dir, so
 * this uses a dedicated profile: a real Chrome window the user can watch and
 * log into once, not their existing signed-in one.
 */
async function ensureChrome(url) {
  if (await cdpReachable(url)) return
  fs.mkdirSync(CHROME_PROFILE, { recursive: true })
  const log = fs.openSync(path.join(__dirname, 'chrome.log'), 'a')
  spawn(CHROME_BIN, [
    `--remote-debugging-port=${new URL(url).port}`,
    `--user-data-dir=${CHROME_PROFILE}`,
    '--no-first-run',
    '--no-default-browser-check',
  ], { detached: true, stdio: ['ignore', log, log] }).unref()
  for (let i = 0; i < 40; i++) {
    await new Promise(resolve => setTimeout(resolve, 500))
    if (await cdpReachable(url)) return
  }
  throw new Error(`Chrome did not expose CDP at ${url}; see the chrome.log next to this script`)
}

async function start() {
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  // Attach to a Chrome already listening for CDP instead of launching our own.
  // Tabs then open in that visible window, which is the only way the work is
  // watchable: a bundled-Chromium launch is a separate browser no matter what.
  if (CDP_URL) {
    await ensureChrome(CDP_URL)
    const browser = await chromium.connectOverCDP(CDP_URL)
    context = browser.contexts()[0] || await browser.newContext()
    context.setDefaultTimeout(DEFAULT_TIMEOUT)
    page = context.pages().find(p => !p.isClosed()) || await context.newPage()
    context.on('page', p => { page = p })
    browser.on('disconnected', () => {
      console.error('CDP browser disconnected; daemon exiting')
      process.exit(1)
    })
    return
  }
  fs.mkdirSync(PROFILE_DIR, { recursive: true })
  // A killed Chromium leaves its singleton locks behind, and the next launch
  // exits on sight of them — which is how a daemon ends up serving a browser
  // that is already gone.
  for (const lock of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    fs.rmSync(path.join(PROFILE_DIR, lock), { force: true, recursive: true })
  }
  context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: HEADLESS,
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  })
  context.setDefaultTimeout(DEFAULT_TIMEOUT)
  page = context.pages()[0] || await context.newPage()
  // A site that opens a new tab (checkout, SSO) would otherwise strand every
  // later command on the original page.
  context.on('page', p => { page = p })
  // Serving requests after the browser dies produces "target closed" on every
  // action while /health still answers, so the client never knows to restart.
  // Exiting frees the port and lets the next call bring up a fresh daemon.
  context.on('close', () => {
    console.error('browser closed; daemon exiting')
    process.exit(1)
  })
}

/** True when the browser is still usable, not merely when the server is up. */
async function alive() {
  if (!page || page.isClosed()) {
    const open = context && context.pages().find(p => !p.isClosed())
    if (!open) return false
    page = open
  }
  return true
}

/** Settle after an action that may or may not navigate; never fail on a quiet page. */
async function settle() {
  await page.waitForLoadState('domcontentloaded').catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
}

function where() {
  return { url: page.url(), title: '' }
}

async function locate(selector, index) {
  const loc = page.locator(selector)
  const n = await loc.count()
  if (n === 0) throw new Error(`no element matched ${JSON.stringify(selector)}`)
  return index === undefined ? loc.first() : loc.nth(index)
}

const actions = {
  async status() {
    return { running: true, url: page.url(), title: await page.title() }
  },

  /** Open a tab and make it the target every later command acts on. */
  async newTab({ url }) {
    page = await context.newPage()
    if (url) {
      await page.goto(url, { waitUntil: 'domcontentloaded' })
      await settle()
    }
    return { index: context.pages().indexOf(page), url: page.url(), title: await page.title() }
  },

  async listTabs() {
    const pages = context.pages()
    const tabs = []
    for (const [index, p] of pages.entries()) {
      tabs.push({ index, url: p.url(), title: await p.title().catch(() => ''), active: p === page })
    }
    return { count: tabs.length, tabs }
  },

  /** Attach to an already-open tab by its listTabs index. */
  async selectTab({ index }) {
    const pages = context.pages()
    const target = pages[index]
    if (!target) throw new Error(`no tab at index ${index}; ${pages.length} open`)
    page = target
    await page.bringToFront().catch(() => {})
    return { index, url: page.url(), title: await page.title() }
  },

  async closeTab({ index }) {
    const pages = context.pages()
    const target = index === undefined ? page : pages[index]
    if (!target) throw new Error(`no tab at index ${index}; ${pages.length} open`)
    await target.close()
    const left = context.pages()
    if (!left.length) throw new Error('the last tab was closed; call newTab to continue')
    if (target === page) page = left[left.length - 1]
    return { closed: index === undefined ? 'active' : index, remaining: left.length, url: page.url() }
  },

  async navigate({ url }) {
    if (!url) throw new Error('navigate needs a url')
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await settle()
    return { url: page.url(), title: await page.title() }
  },

  async back() {
    await page.goBack({ waitUntil: 'domcontentloaded' })
    await settle()
    return { url: page.url(), title: await page.title() }
  },

  async click({ selector, index }) {
    const loc = await locate(selector, index)
    await loc.scrollIntoViewIfNeeded().catch(() => {})
    await loc.click()
    await settle()
    return { url: page.url(), title: await page.title() }
  },

  async fill({ selector, text, index }) {
    const loc = await locate(selector, index)
    await loc.fill(text ?? '')
    return { url: page.url(), filled: text ?? '' }
  },

  async press({ key, selector, index }) {
    if (selector) {
      const loc = await locate(selector, index)
      await loc.press(key)
    } else {
      await page.keyboard.press(key)
    }
    await settle()
    return { url: page.url(), title: await page.title() }
  },

  async waitFor({ selector, timeout }) {
    await page.locator(selector).first().waitFor({ timeout: timeout ?? DEFAULT_TIMEOUT })
    return { url: page.url(), matched: selector }
  },

  async getText({ selector }) {
    const target = selector ? (await locate(selector)) : page.locator('body')
    const raw = await target.innerText()
    const text = raw.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
    return {
      url: page.url(),
      title: await page.title(),
      truncated: text.length > TEXT_LIMIT,
      text: text.slice(0, TEXT_LIMIT),
    }
  },

  /**
   * Interactive elements with a ready-to-use Playwright selector. Without this
   * the model can only guess CSS against a page it has never seen.
   */
  async snapshot({ match, limit }) {
    const items = await page.evaluate(({ limit, match }) => {
      const out = []
      const needle = (match || '').toLowerCase()

      /** True when `sel` is valid CSS matching `el` and nothing else. */
      const identifies = (sel, el) => {
        try {
          const hits = document.querySelectorAll(sel)
          return hits.length === 1 && hits[0] === el
        } catch {
          return false
        }
      }

      /**
       * A pure-CSS selector that uniquely identifies `el`. Short, stable forms
       * are tried first; the structural `:nth-of-type` path is the fallback
       * that always exists, so repeated controls (one Add To Cart per product
       * row) each get their own selector instead of sharing an ambiguous one.
       */
      const cssFor = (el) => {
        if (el.id && identifies(`#${CSS.escape(el.id)}`, el)) return `#${CSS.escape(el.id)}`
        const tag = el.tagName.toLowerCase()
        for (const attr of ['data-testid', 'data-test', 'name', 'aria-label']) {
          const v = el.getAttribute(attr)
          if (v) {
            const sel = `${tag}[${attr}="${CSS.escape(v)}"]`
            if (identifies(sel, el)) return sel
          }
        }
        const parts = []
        let node = el
        while (node && node.nodeType === 1 && node !== document.documentElement) {
          if (node.id && identifies(`#${CSS.escape(node.id)}`, node)) {
            parts.unshift(`#${CSS.escape(node.id)}`)
            break
          }
          let part = node.tagName.toLowerCase()
          const parent = node.parentElement
          if (parent) {
            const twins = Array.prototype.filter.call(parent.children, c => c.tagName === node.tagName)
            if (twins.length > 1) part += `:nth-of-type(${twins.indexOf(node) + 1})`
          }
          parts.unshift(part)
          node = node.parentElement
        }
        const path = parts.join(' > ')
        return identifies(path, el) ? path : undefined
      }

      const nodes = document.querySelectorAll('a,button,input,select,textarea,[role=button],[role=link],[onclick]')
      for (const el of nodes) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        const label = (el.getAttribute('aria-label') || el.value || el.innerText || el.getAttribute('placeholder') || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 80)
        // Filter before the cap: a nav-heavy page would otherwise spend the
        // whole budget before reaching the content the caller asked about.
        if (needle && !label.toLowerCase().includes(needle)) continue
        out.push({
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type') || undefined,
          label,
          href: el.tagName === 'A' ? (el.getAttribute('href') || undefined) : undefined,
          selector: cssFor(el),
        })
        if (out.length >= limit) break
      }
      return out
    }, { limit: limit ?? SNAPSHOT_LIMIT, match })
    return { url: page.url(), title: await page.title(), count: items.length, elements: items }
  },

  /** Writes PNG bytes to disk; the sandbox cannot mint an image content block. */
  async screenshot({ fullPage }) {
    const file = path.join(SHOT_DIR, `shot-${Date.now()}.png`)
    await page.screenshot({ path: file, fullPage: fullPage === true })
    return { url: page.url(), title: await page.title(), path: file }
  },
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    alive().then(ok => {
      res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok }))
      if (!ok) process.exit(1)
    })
    return
  }
  let body = ''
  req.on('data', c => { body += c })
  req.on('end', () => {
    queue = queue.then(async () => {
      let out
      try {
        const { action, args } = JSON.parse(body || '{}')
        const fn = actions[action]
        if (!fn) throw new Error(`unknown action ${JSON.stringify(action)}; known: ${Object.keys(actions).join(', ')}`)
        out = { ok: true, result: await fn(args || {}) }
      } catch (e) {
        out = { ok: false, error: String((e && e.message) || e) }
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify(out))
    })
  })
})

start().then(() => {
  server.listen(PORT, '127.0.0.1', () => console.log(`dsh-browser daemon on 127.0.0.1:${PORT}`))
}).catch(e => {
  console.error(String((e && e.stack) || e))
  process.exit(1)
})
