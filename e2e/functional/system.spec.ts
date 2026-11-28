// Needs the real app: the window, the single instance lock, the media controls of the desktop and the content policy as Chromium applies it
import { spawn } from 'child_process';
import { expect, quit, test } from '../support/app';
import { player } from '../support/player';

// where the app meets the system around it: the window, the media controls of the desktop, the protocol that serves the files
test('tells the desktop what plays', async ({ session: { app, page } }) => {
  const controls = player(page);
  const mediaSession = () =>
    page.evaluate(() => ({
      title: navigator.mediaSession.metadata?.title,
      artist: navigator.mediaSession.metadata?.artist,
      album: navigator.mediaSession.metadata?.album,
    }));
  // Linux has the MPRIS service of the main process instead of navigator.mediaSession, and the session bus is not there in CI,
  // so what the page sends to the service is read at the main process (the D-Bus side is tried by hand, see docs/app/mpris.md)
  const mprisTrack = () =>
    app.evaluate(() => {
      const states: unknown[] = Reflect.get(globalThis, 'mprisStates');
      const last: unknown = states.at(-1);
      const track = typeof last === 'object' && last !== null && 'track' in last ? last.track : undefined;

      return typeof track === 'object' && track !== null && 'title' in track && 'artist' in track && 'album' in track
        ? { title: track.title, artist: track.artist, album: track.album }
        : { title: undefined, artist: undefined, album: undefined };
    });
  const shown = process.platform === 'linux' ? mprisTrack : mediaSession;

  await app.evaluate(({ ipcMain }) => {
    const states: unknown[] = [];
    Reflect.set(globalThis, 'mprisStates', states);
    ipcMain.on('MPRIS_STATE', (_event, state: unknown) => states.push(state));
  });
  await controls.playAlbum('Pitch Perfect');
  await expect.poll(shown).toEqual({ title: 'Concert A', artist: 'The Sine Waves', album: 'Pitch Perfect' });

  await controls.next();
  await expect.poll(async () => (await shown()).title).toBe('Octave Up');
});

test('a second start of the same profile leaves and keeps the window of the first', async ({ session: { app, page } }) => {
  const { spawnfile, spawnargs } = app.process();
  // the command of the first start without what Playwright adds to attach to it (the loader and the debugging ports)
  const args = spawnargs.slice(spawnargs.findIndex((arg) => arg.endsWith('index.js')));
  const { ELECTRON_RUN_AS_NODE, ...inherited } = process.env;
  const second = spawn(spawnfile, args, { env: { ...inherited, NODE_ENV: 'production', TUNELLE_NO_UPDATE: '1' }, stdio: 'ignore' });
  const exit = await new Promise<number | null>((done) => second.once('exit', done));

  expect(exit).toBe(0);
  expect(page.isClosed()).toBe(false);
  await expect(page.locator('#root')).not.toBeEmpty();
});

test('maximizes the window from its own button', async ({ session: { app, page } }) => {
  const maximized = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().some((window) => window.isMaximized()));

  await page.getByRole('button', { name: 'Maximize' }).click();
  await expect.poll(maximized).toBe(true);

  // the button offers to undo it now (macOS zooms the window and the app does not hear of it as a maximize)
  if (process.platform !== 'darwin') await expect(page.getByRole('button', { name: 'Restore' })).toBeAttached();
});

test('closes the window with the close button, and quits the app where closing the last window quits it', async ({ session: { app, page } }) => {
  const windowClosed = page.waitForEvent('close');

  await page.locator('[class*="WindowControls__button"][aria-label="Close"]').click();

  await windowClosed;
  // macOS keeps the app running without a window (index.ts): it is quit here, as the test run would wait for it otherwise, and killed when it does not quit
  if (process.platform === 'darwin') return quit(app);
  await app.waitForEvent('close', { timeout: 60_000 });
});

// the header is tried in electron/protocols/tunelle-protocol.test.ts; what stays here is that Chromium refuses a script that is written into the page
test('refuses an inline script that is written into the page', async ({ session: { page } }) => {
  const ran = await page.evaluate(() => {
    document.body.append(Object.assign(document.createElement('script'), { textContent: 'globalThis.inlineScriptRan = true' }));
    return Reflect.get(globalThis, 'inlineScriptRan') === true;
  });

  expect(ran).toBe(false);
});
