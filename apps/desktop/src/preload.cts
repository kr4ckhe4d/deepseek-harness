/**
 * Preload for every page the shell hosts (loading, error, and the web GUI).
 * Exposes the minimal desktop bridge the local pages use; the web GUI
 * ignores it.
 */
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('dshDesktop', {
  /** Host platform, for platform-conditional styling of local pages. */
  platform: process.platform,
  /** Ask the main process to restart the backend after a failure. */
  retryBackend: (): void => { ipcRenderer.send('desktop:retry') },
})
