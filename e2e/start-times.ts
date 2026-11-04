import type { Page } from '@playwright/test';

/** When the first load of the page painted, in ms from the moment the app was spawned: what the person waits for, without the waits of the test after it */
export interface StartTimes {
  firstPaintMs?: number;
  firstContentfulPaintMs?: number;
  largestContentfulPaintMs?: number;
}

/**
 * Reads the paint entries of the page against the time the app was spawned (both in the clock of the system), so no mark is needed in the app
 * `process.getCreationTime()` is not used: on Linux it comes from the boot time, which has a resolution of a second
 */
export const readStartTimes = async (page: Page, spawnedAt: number): Promise<StartTimes> => {
  const entries = await page.evaluate(
    () =>
      new Promise<{ origin: number; paints: Record<string, number>; largest: number | undefined }>((done) => {
        const largest: number[] = [];
        new PerformanceObserver((list) => list.getEntries().forEach((entry) => largest.push(entry.startTime))).observe({
          type: 'largest-contentful-paint',
          buffered: true,
        });
        // the buffered entries come in a task of their own, and a page that has not painted yet is waited for (a display without a compositor, such as the headless Linux one, never reports the contentful paints)
        const read = (waited: number) => {
          const paints = Object.fromEntries(performance.getEntriesByType('paint').map((entry) => [entry.name, entry.startTime]));
          if (!('first-paint' in paints) && waited < 10_000) return void setTimeout(() => read(waited + 100), 100);
          done({
            origin: performance.timeOrigin,
            paints,
            largest: largest.at(-1),
          });
        };
        setTimeout(() => read(0), 100);
      })
  );
  const fromSpawn = (at: number | undefined) => (at === undefined ? undefined : Math.round(entries.origin + at - spawnedAt));
  return {
    firstPaintMs: fromSpawn(entries.paints['first-paint']),
    firstContentfulPaintMs: fromSpawn(entries.paints['first-contentful-paint']),
    largestContentfulPaintMs: fromSpawn(entries.largest),
  };
};
