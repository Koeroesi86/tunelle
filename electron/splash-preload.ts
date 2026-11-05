/// <reference lib="dom" />
import { ipcRenderer } from 'electron';

// the splash page is static, the main process reports what it is doing (see updater.ts)
ipcRenderer.on('SPLASH_PROGRESS', (_event, progress: { text: string; percent?: number }) => {
  const status = document.getElementById('status');
  const track = document.getElementById('progress-track');
  const bar = document.getElementById('progress-bar');

  if (status) status.textContent = progress.text;
  if (track) track.hidden = progress.percent === undefined;
  if (bar) bar.style.width = `${progress.percent ?? 0}%`;
});
