import { expect, type Page } from '@playwright/test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { addFolder, navigate, quit, test } from '../app';
import { expectTone } from '../audio';
import { player } from '../player';
import { writeLargeLibrary } from './large-library';
import { memory, record } from './measure';

// how long the app takes to show its page, and what it costs while it stands still (npm run perf, after npm run build)
// PERF_TRACKS sets the size of the generated library (2000 by default)

const tracks = Number(process.env.PERF_TRACKS ?? 2000);
const idleSeconds = 5;
// a slow runner scans thousands of files for minutes
const scanTimeout = 300_000;

const generated = mkdtempSync(join(tmpdir(), 'tunelle-perf-startup-'));
const expected = writeLargeLibrary(generated, tracks);

test.afterAll(() => rmSync(generated, { recursive: true, force: true }));

/** What the page reports about its own start: when it painted and which tasks of the main thread were long before that */
const pageStart = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<{ domContentLoadedMs: number; longTasks: number[] }>((done) => {
        const longTasks: number[] = [];
        new PerformanceObserver((list) => list.getEntries().forEach((entry) => longTasks.push(entry.duration))).observe({ type: 'longtask', buffered: true });
        // the buffered entries are delivered in a task of their own
        setTimeout(() => {
          const [navigation] = performance.getEntriesByType('navigation');
          done({
            domContentLoadedMs: navigation instanceof PerformanceNavigationTiming ? navigation.domContentLoadedEventEnd : 0,
            longTasks,
          });
        }, 500);
      })
  );

test('measures the start of the app on an empty library and on a big one', async ({ start }) => {
  const report: Record<string, unknown> = { tracks: expected };

  // toPageMs is the wall time of start() and includes the launch of Playwright; the paint times run from the spawn of the app to the paint of the first load of the page
  const emptyStarted = Date.now();
  const empty = await start({ measureStart: true });
  const emptyMs = Date.now() - emptyStarted;
  const emptyPage = await pageStart(empty.page);
  report.emptyLibrary = {
    toPageMs: emptyMs,
    ...empty.startTimes,
    ...emptyPage,
    longTasks: emptyPage.longTasks.length,
    longestTaskMs: Math.max(0, ...emptyPage.longTasks),
  };

  await addFolder(empty.page, generated, expected, scanTimeout);
  await quit(empty.app);

  const warmStarted = Date.now();
  const warm = await start({ measureStart: true });
  const warmMs = Date.now() - warmStarted;
  const warmPage = await pageStart(warm.page);
  // the lists of the library are shown once the first page of tracks came
  const listedStarted = Date.now();
  await navigate(warm.page, 'Songs');
  await expect(warm.page.getByText(`${expected} tracks`)).toBeVisible({ timeout: 60_000 });
  report.bigLibrary = {
    toPageMs: warmMs,
    ...warm.startTimes,
    ...warmPage,
    longTasks: warmPage.longTasks.length,
    longestTaskMs: Math.max(0, ...warmPage.longTasks),
    songsListedMs: Date.now() - listedStarted,
  };

  record('startup', report);
});

test('measures the cost of a standing app: the processor while it plays, is paused and is hidden, and the covers it loads', async ({ start }) => {
  const { app, page } = await start();
  await addFolder(page, generated, expected, scanTimeout);

  // the share of a processor that the processes of the app used since the last call, in percent
  const cpu = async () => {
    await app.evaluate(({ app: electron }) => electron.getAppMetrics());
    await page.waitForTimeout(idleSeconds * 1000);
    const metrics = await app.evaluate(({ app: electron }) => electron.getAppMetrics().map(({ type, cpu }) => ({ type, percent: cpu.percentCPUUsage })));
    return {
      totalPercent: metrics.reduce((sum, { percent }) => sum + percent, 0),
      byProcess: metrics.reduce<Record<string, number>>((sums, { type, percent }) => ({ ...sums, [type]: (sums[type] ?? 0) + percent }), {}),
    };
  };

  const report: Record<string, unknown> = { tracks: expected };
  await navigate(page, 'Albums');
  report.coversOfAlbums = await page.evaluate(() => {
    const covers = [...document.querySelectorAll('img')].filter((image) => image.getBoundingClientRect().width > 0 && image.complete && image.naturalWidth > 0);
    const ratios = covers.map((image) => image.naturalWidth / image.clientWidth).sort((a, b) => a - b);
    return {
      shown: covers.length,
      lazy: covers.filter((image) => image.loading === 'lazy').length,
      asyncDecoding: covers.filter((image) => image.decoding === 'async').length,
      // 1 is a cover at the size it is shown, 4 has sixteen times the pixels
      medianNaturalOverShown: ratios.at(Math.floor(ratios.length / 2)) ?? 0,
      canvases: document.querySelectorAll('canvas').length,
    };
  });
  report.visibleIdle = await cpu();
  report.memoryVisibleIdle = await memory(app, page);

  await page.getByRole('searchbox', { name: 'Search the library' }).fill('Pitch Perfect');
  // the page is not opened again: the filter is gone when it is
  await expect(page.getByText('1 album', { exact: true }).filter({ visible: true })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Play Pitch Perfect' }).click();
  await expectTone(page, 440);
  report.visiblePlaying = await cpu();
  report.memoryVisiblePlaying = await memory(app, page);

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((window) => window.hide()));
  // a window of the headless Linux display never turns hidden: the number says whether the page was, so the other systems can be told from it
  const hidden = await expect
    .poll(() => page.evaluate(() => document.visibilityState), { timeout: 5000 })
    .toBe('hidden')
    .then(
      () => true,
      () => false
    );
  report.hiddenPlaying = { pageHidden: hidden, ...(await cpu()) };

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((window) => window.show()));
  await player(page).pause();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((window) => window.hide()));
  report.hiddenPaused = await cpu();
  report.memoryHiddenPaused = await memory(app, page);

  record('standing', report);
});
