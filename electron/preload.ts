import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel: string, payload?: unknown) => ipcRenderer.send(channel, payload),
  on: (channel: string, listener: (payload: unknown) => void) => ipcRenderer.on(channel, (_event, payload) => listener(payload)),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  // a sandboxed preload cannot import window-backdrop.ts, so the argument is spelled out here
  // the media controls of the desktop are the MPRIS service of the main process (electron/services/mpris.ts)
  mpris: process.platform === 'linux',
  blurred: process.argv.includes('--window-blur'),
});
