// Needs the real app: a renderer process that really crashes; the pause on suspend and the limit on reloads are unit tested
import type { ElectronApplication } from '@playwright/test';
import { expect, test } from '../support/app';
import { expectTone } from '../support/audio';
import { player } from '../support/player';

// the page of the test is dead after a crash, so the one that is loaded in its place is asked through the main process. See docs/development/end-to-end-tests.md
const inWindow = (app: ElectronApplication, script: string): Promise<unknown> =>
  app
    .evaluate(({ BrowserWindow }, code) => {
      const main = BrowserWindow.getAllWindows().find((window) => window.webContents.getURL() === 'tunelle://app/index.html');
      return main?.webContents.executeJavaScript(code, true);
    }, script)
    // a frame that is on its way out answers with an error, and the caller asks again
    .catch(() => undefined);

const shown = `({
  title: document.querySelector('[class*="PlayerControls__title"]')?.textContent,
  paused: window.activeAudio?.()?.paused,
  restored: (window.activeAudio?.()?.currentTime ?? 0) > 12.5,
})`;

const press = (app: ElectronApplication, title: string) => inWindow(app, `document.querySelector('[title="${title}"]').click()`);

test('loads the page again after it crashes, with the queue, the track and the position, paused', async ({ session }) => {
  const controls = player(session.page);
  await controls.playAlbum('Pitch Perfect');
  await expectTone(session.page, 440);
  await controls.next();
  await expectTone(session.page, 880);
  await controls.seekTo(12);
  await expect.poll(() => controls.currentTime()).toBeGreaterThan(13.5);

  await session.app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL() === 'tunelle://app/index.html')
      ?.webContents.forcefullyCrashRenderer()
  );

  await expect.poll(() => inWindow(session.app, shown)).toEqual({ title: 'Octave Up', paused: true, restored: true });
  await press(session.app, 'Play');
  await expect.poll(() => inWindow(session.app, 'window.activeAudio().currentTime')).toBeGreaterThan(15);
  await press(session.app, 'Next');
  await expect.poll(() => inWindow(session.app, shown)).toMatchObject({ title: 'Deep Bass', paused: false });
});
