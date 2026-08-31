/**
 * Electron main process for the dsh desktop shell. Owns the single
 * BrowserWindow over the dsh web GUI, the backend child lifecycle, the
 * application menu, the tray, and the navigation policy that keeps the
 * window on the backend origin.
 */
import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, screen, session, shell, Tray, type NativeImage } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startBackend, type Backend } from './backend.ts'
import { installMenu } from './menu.ts'
import {
  clampToDisplays, DEFAULT_WINDOW_STATE, MIN_WINDOW_SIZE, normalizeWindowState, type WindowState,
} from './window-state.ts'

const APP_DIR = path.dirname(fileURLToPath(import.meta.url))
const STATIC_DIR = path.join(APP_DIR, '../static')
/** apps/desktop/dist -> repository root. */
const REPO_ROOT = path.join(APP_DIR, '../../..')
const SMOKE = process.env.DSH_DESKTOP_SMOKE === '1'
const READY_TIMEOUT_MS = 120_000
/** Rolling backend log lines kept for the error page. */
const LOG_TAIL = 40

let mainWindow: BrowserWindow | undefined
let backend: Backend | undefined
let backendOrigin: string | undefined
let tray: Tray | undefined
let quitting = false
const logTail: string[] = []

function stateFile(): string { return path.join(app.getPath('userData'), 'window-state.json') }

function loadWindowState(): WindowState {
  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(stateFile(), 'utf8'))
  } catch {
    // First launch, unreadable file, or invalid JSON: any of these simply
    // falls back to the default geometry below.
    raw = undefined
  }
  const normalized = normalizeWindowState(raw)
  if (normalized === undefined) return DEFAULT_WINDOW_STATE
  return clampToDisplays(normalized, screen.getAllDisplays().map(display => display.workArea))
}

function saveWindowState(win: BrowserWindow): void {
  const bounds = win.getNormalBounds()
  const state: WindowState = { ...bounds, maximized: win.isMaximized() }
  try {
    fs.writeFileSync(stateFile(), JSON.stringify(state))
  } catch {
    // Geometry persistence is a convenience; a read-only or full profile
    // directory must not break shutdown.
  }
}

function createWindow(): BrowserWindow {
  const state = loadWindowState()
  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    show: false,
    backgroundColor: '#1b1c1d',
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 12, y: 10 } }
      : {}),
    webPreferences: {
      preload: path.join(APP_DIR, 'preload.cjs'),
    },
  })
  if (state.maximized) win.maximize()
  win.once('ready-to-show', () => { win.show() })
  win.on('close', () => { saveWindowState(win) })
  win.on('closed', () => { mainWindow = undefined })

  // Navigation policy: the window shows only the backend; everything else
  // goes to the system browser. Local file: pages (loading/error) load via
  // loadFile and never navigate by themselves.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (backendOrigin !== undefined && url.startsWith(backendOrigin)) return { action: 'allow' }
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file:')) return
    if (backendOrigin !== undefined && url.startsWith(backendOrigin)) return
    event.preventDefault()
    void shell.openExternal(url)
  })

  // The web GUI is unaware of the hidden titlebar; a slim drag strip along
  // the top edge restores window dragging without covering its controls.
  win.webContents.on('did-finish-load', () => {
    const current = win.webContents.getURL()
    if (process.platform !== 'darwin' || backendOrigin === undefined || !current.startsWith(backendOrigin)) return
    void win.webContents.executeJavaScript(`(() => {
      if (document.getElementById('dsh-desktop-drag')) return
      const strip = document.createElement('div')
      strip.id = 'dsh-desktop-drag'
      strip.style.cssText = 'position:fixed;top:0;left:0;right:0;height:14px;z-index:2147483647;-webkit-app-region:drag'
      document.body.appendChild(strip)
    })()`)
  })
  return win
}

function loadLocalPage(page: 'loading' | 'error', message?: string): void {
  if (mainWindow === undefined) return
  const query = message === undefined ? undefined : { message, log: logTail.join('\n') }
  void mainWindow.loadFile(path.join(STATIC_DIR, `${page}.html`), query === undefined ? undefined : { query })
}

function trayIcon(): NativeImage {
  const icon = nativeImage.createFromPath(path.join(STATIC_DIR, 'trayTemplate.png'))
  icon.setTemplateImage(true)
  return icon
}

function installTray(): void {
  tray = new Tray(trayIcon())
  tray.setToolTip('DeepSeek Harness')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: () => { showWindow() } },
    { label: 'New Chat', click: () => { newChat() } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.quit() } },
  ]))
}

function showWindow(): void {
  if (mainWindow === undefined) {
    mainWindow = createWindow()
    if (backend !== undefined) void mainWindow.loadURL(backend.url.href)
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function newChat(): void {
  showWindow()
  if (mainWindow === undefined || backendOrigin === undefined) return
  void mainWindow.loadURL(`${backendOrigin}/`)
}

async function bootBackend(): Promise<void> {
  loadLocalPage('loading')
  const attachUrl = process.env.DSH_DESKTOP_URL
  try {
    if (attachUrl !== undefined && attachUrl !== '') {
      backend = { url: new URL(attachUrl), stop: () => Promise.resolve() }
    } else {
      backend = await startBackend({
        repoRoot: REPO_ROOT,
        workspaceDir: process.env.DSH_DESKTOP_WORKSPACE ?? os.homedir(),
        readyTimeoutMs: READY_TIMEOUT_MS,
        onLog: (line) => {
          logTail.push(line)
          if (logTail.length > LOG_TAIL) logTail.shift()
          if (SMOKE) console.log(`backend: ${line}`)
        },
        onExit: (code) => {
          backend = undefined
          backendOrigin = undefined
          if (!quitting) loadLocalPage('error', `dsh web exited with code ${String(code)}`)
        },
      })
    }
  } catch (error) {
    backend = undefined
    if (SMOKE) console.error('smoke: backend failed:', error)
    loadLocalPage('error', error instanceof Error ? error.message : String(error))
    return
  }
  backendOrigin = backend.url.origin
  if (SMOKE) console.log(`smoke: backend ready at ${backendOrigin}`)
  grantPermissions(backendOrigin)
  if (mainWindow !== undefined) void mainWindow.loadURL(backend.url.href)
}

function grantPermissions(origin: string): void {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const fromBackend = webContents.getURL().startsWith(origin)
    const allowed = new Set(['notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen'])
    callback(fromBackend && allowed.has(permission))
  })
}

function runSmoke(): void {
  const deadline = setTimeout(() => {
    console.error('smoke: timed out waiting for the web GUI to load')
    app.exit(1)
  }, READY_TIMEOUT_MS + 60_000)
  const probe = (): void => {
    const contents = mainWindow?.webContents
    if (contents === undefined) return
    contents.on('did-fail-load', (_event, code, description, url) => {
      console.error(`smoke: did-fail-load ${String(code)} ${description} ${url}`)
    })
    contents.on('did-finish-load', () => {
      console.log(`smoke: did-finish-load ${contents.getURL()}`)
      const url = contents.getURL()
      if (backendOrigin === undefined || !url.startsWith(backendOrigin)) return
      void contents.executeJavaScript('document.title').then((title: unknown) => {
        clearTimeout(deadline)
        console.log(`smoke: loaded ${url} title=${String(title)}`)
        app.exit(0)
      })
    })
  }
  probe()
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => { showWindow() })

  app.whenReady().then(async () => {
    installMenu({ newChat, reload: () => { mainWindow?.webContents.reload() } })
    mainWindow = createWindow()
    installTray()
    globalShortcut.register('CommandOrControl+Shift+D', () => {
      if (mainWindow?.isFocused() === true) mainWindow.hide()
      else showWindow()
    })
    ipcMain.on('desktop:retry', () => { void bootBackend() })
    if (SMOKE) runSmoke()
    await bootBackend()
  }).catch((error: unknown) => {
    console.error(error)
    app.exit(1)
  })

  app.on('activate', () => { showWindow() })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' || SMOKE) app.quit()
  })
  app.on('before-quit', (event) => {
    if (quitting || backend === undefined) return
    quitting = true
    event.preventDefault()
    const pending = backend
    backend = undefined
    void pending.stop().finally(() => { app.quit() })
  })
  app.on('will-quit', () => { globalShortcut.unregisterAll() })
}
