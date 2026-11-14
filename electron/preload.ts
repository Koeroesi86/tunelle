/// <reference lib="dom" />
import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel: string, payload?: unknown) => ipcRenderer.send(channel, payload),
  on: (channel: string, listener: (payload: unknown) => void) => ipcRenderer.on(channel, (_event, payload) => listener(payload)),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  // a sandboxed preload cannot import window-backdrop.ts, so the argument is spelled out here
  // the media controls of the desktop are the MPRIS service of the main process (electron/services/mpris.ts)
  mpris: process.platform === 'linux',
  blurred: process.argv.includes('--window-blur'),
  transparent: process.argv.includes('--window-transparent'),
});

// the splash is in the page (LoadingSplash.tsx) and the main process reports what it is doing while it starts (see updater.ts and docs/app/startup.md)
ipcRenderer.on('SPLASH_PROGRESS', (_event, progress: { text: string; percent?: number }) => {
  const status = document.getElementById('splash-status');
  const track = document.getElementById('splash-progress-track');
  const bar = document.getElementById('splash-progress-bar');

  if (status) status.textContent = progress.text;
  if (track) track.hidden = progress.percent === undefined;
  if (bar) bar.style.width = `${progress.percent ?? 0}%`;
});

// the main process asks before a download on a metered connection: the progress is hidden until a button is pressed
ipcRenderer.on('SPLASH_QUESTION', (_event, question: { text: string; download: string; notNow: string }) => {
  const status = document.getElementById('splash-status');
  const track = document.getElementById('splash-progress-track');
  const actions = document.getElementById('splash-actions');
  const [download, notNow] = Array.from(document.querySelectorAll<HTMLButtonElement>('#splash-actions button'));

  if (status) status.textContent = question.text;
  if (track) track.hidden = true;
  if (actions) actions.style.display = 'flex';
  if (download) download.textContent = question.download;
  if (notNow) notNow.textContent = question.notNow;

  const finish = (value: boolean) => {
    if (actions) actions.style.display = 'none';
    ipcRenderer.send('SPLASH_ANSWER', { download: value });
  };

  if (download) download.onclick = () => finish(true);
  if (notNow) notNow.onclick = () => finish(false);
});
