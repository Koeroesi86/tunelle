/// <reference lib="dom" />
import { ipcRenderer } from 'electron';

const answer = (download: boolean) => ipcRenderer.send('SPLASH_ANSWER', { download });

// the splash page is static, the main process reports what it is doing (see updater.ts)
ipcRenderer.on('SPLASH_PROGRESS', (_event, progress: { text: string; percent?: number }) => {
  const status = document.getElementById('status');
  const track = document.getElementById('progress-track');
  const bar = document.getElementById('progress-bar');

  if (status) status.textContent = progress.text;
  if (track) track.hidden = progress.percent === undefined;
  if (bar) bar.style.width = `${progress.percent ?? 0}%`;
});

// the main process asks before a download on a metered connection: the progress is hidden until a button is pressed
ipcRenderer.on('SPLASH_QUESTION', (_event, question: { text: string; download: string; notNow: string }) => {
  const status = document.getElementById('status');
  const track = document.getElementById('progress-track');
  const actions = document.getElementById('actions');
  const [download, notNow] = Array.from(document.querySelectorAll<HTMLButtonElement>('#actions button'));

  if (status) status.textContent = question.text;
  if (track) track.hidden = true;
  if (actions) actions.hidden = false;
  if (download) download.textContent = question.download;
  if (notNow) notNow.textContent = question.notNow;

  const finish = (value: boolean) => {
    if (actions) actions.hidden = true;
    answer(value);
  };

  if (download) download.onclick = () => finish(true);
  if (notNow) notNow.onclick = () => finish(false);
});
