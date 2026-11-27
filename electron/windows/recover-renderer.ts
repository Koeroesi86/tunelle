import { app, dialog } from 'electron';
import type { BrowserWindow } from 'electron';
import { detachOpenedFiles } from '../library/opened/opened-files';
import { getMainTranslator } from '../language';

const maxReloads = 3;
const reloadWindow = 60_000;

const giveUp = (main: BrowserWindow) => {
  const { t } = getMainTranslator();
  dialog.showErrorBox(t('crash.title'), t('crash.message'));
  // the window has no frame, so nothing of a dead page closes it
  main.destroy();
  app.quit();
};

/** Loads the page again when its process is gone, a few times a minute at most. See docs/app/system-events.md */
export const recoverRenderer = (main: BrowserWindow) => {
  let reloads: number[] = [];

  main.webContents.on('render-process-gone', (_, { reason, exitCode }) => {
    if (reason === 'clean-exit') return;

    console.error(`The page is gone: ${reason} (${exitCode})`);
    detachOpenedFiles();
    reloads = [...reloads.filter((at) => Date.now() - at < reloadWindow), Date.now()];
    if (reloads.length > maxReloads) return giveUp(main);

    // not from within the event of the process that is gone
    setTimeout(() => !main.isDestroyed() && main.webContents.reload(), 0);
  });
};
