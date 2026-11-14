import { expect, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { test } from '../support/app';
import { clearProbe, expectTone, longestGap } from '../support/audio';
import { navigate } from '../support/app';
import { player } from '../support/player';
import { writeLargeLibrary } from './large-library';
import { memory, percentile, record, scrollList, startMainLoop, startRenderer, stopMainLoop, stopRenderer } from './measure';

// the measurements of the performance (npm run perf, after npm run build): they say how the app does on a big library and assert nothing but that it works,
// the numbers go to the output and to test-results/perf.json, as no budget is set before they are known
// PERF_TRACKS sets the size of the generated library (5000 by default), PERF_MUSIC a folder of a real library to scan instead

const tracks = Number(process.env.PERF_TRACKS ?? 5000);
const scrollSeconds = 6;
const generated = process.env.PERF_MUSIC ? undefined : mkdtempSync(join(tmpdir(), 'tunelle-perf-music-'));
const music = process.env.PERF_MUSIC ?? generated ?? '';
const expected = generated ? writeLargeLibrary(generated, tracks) : undefined;

test.afterAll(() => {
  if (generated) rmSync(generated, { recursive: true, force: true });
});

const search = (page: Page, text: string) => page.getByRole('searchbox', { name: 'Search the library' }).fill(text);

const libraryLength = (page: Page) => page.evaluate(() => fetch('tunelle://app/library').then((response) => response.json())).then((library) => library.length);

/** Adds the folder, and answers when the library has the tracks of a generated one, or when the number of tracks of a real one has stopped to grow */
const scan = async (app: ElectronApplication, page: Page) => {
  await startMainLoop(app);
  await startRenderer(page);
  const began = Date.now();
  await page.evaluate((path) => window.electronAPI.send('ADD_FOLDERS_TO_LIBRARY', [{ path, lastModified: 0 }]), music);
  let count = -1;
  await expect
    .poll(
      async () => {
        const now = await libraryLength(page);
        const settled = expected ? now === expected : now === count && now > 0;
        count = now;
        return settled;
      },
      { timeout: 1_000_000, intervals: [5000] }
    )
    .toBe(true);
  const renderer = await stopRenderer(page);
  return {
    tracksFound: count,
    seconds: (Date.now() - began) / 1000,
    mainLoop: await stopMainLoop(app),
    renderer: { longTasks: renderer.longTasks.length, longestTaskMs: Math.max(0, ...renderer.longTasks), p95FrameMs: percentile(renderer.frames, 0.95) },
  };
};

/** The Rescan button on a library that was scanned just now: the files are the same, so what it costs is the check for a change in each, and the time is until the app says the rescan is complete */
const rescan = async (app: ElectronApplication, page: Page) => {
  await startMainLoop(app);
  const began = Date.now();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.electronAPI.on('RESCAN_COMPLETE', () => resolve());
        window.electronAPI.send('RESCAN_LIBRARY', { forced: true });
      })
  );
  return { seconds: (Date.now() - began) / 1000, mainLoop: await stopMainLoop(app) };
};

const scroll = async (app: ElectronApplication, page: Page, label: string) => {
  await navigate(page, label);
  await startMainLoop(app);
  await startRenderer(page);
  const scrollHeightPx = await scrollList(page, scrollSeconds);
  const { frames, longTasks } = await stopRenderer(page);
  return {
    scrollHeightPx,
    mainLoop: await stopMainLoop(app),
    renderer: {
      frames: frames.length,
      p95FrameMs: percentile(frames, 0.95),
      maxFrameMs: Math.max(0, ...frames),
      longTasks: longTasks.length,
      longestTaskMs: Math.max(0, ...longTasks),
    },
  };
};

test('measures the scan and the scroll of a big library while a track plays', async ({ start }) => {
  const { app, page } = await start();
  const report: Record<string, unknown> = { tracks: expected ?? 'real library' };
  report.scan = await scan(app, page);
  report.rescan = await rescan(app, page);

  // something plays while the lists scroll: a tone from the album of the other tests, or the first album of a real library (whose quiet passages count as gaps)
  await navigate(page, 'Albums');
  if (expected) {
    await search(page, 'Pitch Perfect');
    // the list follows the text after a delay, and the page is not opened again (the filter is gone when it is); what the page shows when the album is not found stays with the traces
    await expect(page.getByText('1 album', { exact: true }).filter({ visible: true }))
      .toBeVisible({ timeout: 60_000 })
      .then(() => page.getByRole('button', { name: 'Play Pitch Perfect' }).click())
      .catch(async (error) => {
        await page.screenshot({ path: join('test-results', 'albums-without-the-tone-album.png') });
        throw error;
      });
    await expectTone(page, 440);
    await search(page, '');
  } else {
    await page
      .getByRole('button', { name: /^Play / })
      .first()
      .click();
    await player(page).expectPlaying();
  }
  // the equalizer and the levelling by ReplayGain (the tone album has the tags) work on the audio while the lists scroll
  await navigate(page, 'Equalizer');
  await page.getByRole('button', { name: 'Bass boost' }).click();
  await expectTone(page, 440);
  await clearProbe(page);

  const before = await memory(app, page);
  report['scroll Songs'] = await scroll(app, page, 'Songs');
  report['scroll Albums'] = await scroll(app, page, 'Albums');
  // what the lists left behind after a garbage collection: a growth that does not go away with the next scroll is a leak
  const after = await memory(app, page);
  report.memory = {
    before,
    after,
    growthMb: Math.round((after.totalMb - before.totalMb) * 10) / 10,
    rendererHeapGrowthMb: Math.round((after.rendererHeapMb - before.rendererHeapMb) * 10) / 10,
  };
  report.audioLongestGapSeconds = await longestGap(page);

  record('scan-and-scroll', report);
  if (expected) expect(report.scan).toMatchObject({ tracksFound: expected });
});
