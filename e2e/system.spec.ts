import { spawn } from 'child_process';
import { rmSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { expect, libraryTracks, navigate, quit, test } from './app';
import { player } from './player';

// where the app meets the system around it: the window, the media controls of the desktop, the protocol that serves the files
test('tells the desktop what plays', async ({ session: { page } }) => {
  const controls = player(page);
  const mediaSession = () =>
    page.evaluate(() => ({
      title: navigator.mediaSession.metadata?.title,
      artist: navigator.mediaSession.metadata?.artist,
      album: navigator.mediaSession.metadata?.album,
    }));

  await controls.playAlbum('Pitch Perfect');
  await expect.poll(mediaSession).toEqual({ title: 'Concert A', artist: 'The Sine Waves', album: 'Pitch Perfect' });

  await controls.next();
  await expect.poll(async () => (await mediaSession()).title).toBe('Octave Up');
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

test('serves a track in ranges, and nothing outside of the library', async ({ session: { page }, music }) => {
  const [track] = await libraryTracks(page);
  // a real file next to the library: a missing one would be a 404 on every system, whether or not the request was refused
  const secret = join(dirname(music), `${basename(music)}-secret.txt`);
  writeFileSync(secret, 'secret');
  const url = (path: string) => `tunelle://app/track?path=${encodeURIComponent(path)}`;

  const answers = await page.evaluate(
    async ([inside, outside]) => {
      const whole = await fetch(inside);
      const part = await fetch(inside, { headers: { range: 'bytes=0-99' } });
      const refused = await fetch(outside);
      return {
        whole: whole.status,
        size: (await whole.arrayBuffer()).byteLength,
        part: part.status,
        range: part.headers.get('content-range'),
        refused: refused.status,
      };
    },
    [url(track.path), url(`${music}/../${basename(secret)}`)]
  );
  rmSync(secret, { force: true });

  expect(answers.whole).toBe(200);
  expect(answers.part).toBe(206);
  expect(answers.range).toBe(`bytes 0-99/${answers.size}`);
  expect(answers.refused).toBe(404);
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

test('speaks the language that is picked, and keeps it after a restart', async ({ start, session }) => {
  await navigate(session.page, 'Settings');
  await session.page.locator('select[class*="LanguageSelect__select"]').selectOption('hu');
  await expect(session.page.locator('[class*="Navigation__label"]').getByText('Kezdőlap')).toBeVisible();
  await quit(session.app);

  const restarted = await start();
  await expect(restarted.page.locator('[class*="Navigation__label"]').getByText('Kezdőlap')).toBeVisible();
});
