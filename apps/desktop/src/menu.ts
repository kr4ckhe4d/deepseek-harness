/**
 * Application menu for the desktop shell: standard platform roles plus the
 * shell-owned actions (New Chat, Home) that the main process wires to the
 * window.
 */
import { Menu, type MenuItemConstructorOptions } from 'electron'

/** Shell actions the menu triggers on the main window. */
export interface MenuActions {
  /** Navigate the window to a fresh conversation at the backend root. */
  newChat: () => void
  /** Reload the current page from the backend. */
  reload: () => void
}

/**
 * Build and install the application menu.
 *
 * @param actions - the shell actions the accelerators dispatch.
 */
export function installMenu(actions: MenuActions): void {
  const isMac = process.platform === 'darwin'
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' } satisfies MenuItemConstructorOptions] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Chat', accelerator: 'CmdOrCtrl+N', click: () => { actions.newChat() } },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => { actions.reload() } },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
