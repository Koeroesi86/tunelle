import type { ElectronApplication, Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface Renderer {
  /** Tasks of the main thread of the page longer than 50 ms (the Long Tasks API) */
  longTasks: number[];
  /** The time between the frames the page drew, in ms */
  frames: number[];
}

declare global {
  interface Window {
    perfRenderer?: { longTasks: number[]; frames: number[]; stop: () => void };
  }
}

/** Starts to record the long tasks and the frame times of the page; `stopRenderer` answers with them */
export const startRenderer = (page: Page) =>
  page.evaluate(() => {
    const longTasks: number[] = [];
    const frames: number[] = [];
    const recorded = { longTasks, frames, stop: () => {} };
    const observer = new PerformanceObserver((list) => list.getEntries().forEach((entry) => recorded.longTasks.push(entry.duration)));
    observer.observe({ type: 'longtask', buffered: false });
    let running = true;
    let last = performance.now();
    const frame = (now: number) => {
      recorded.frames.push(now - last);
      last = now;
      if (running) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    recorded.stop = () => {
      running = false;
      observer.disconnect();
    };
    window.perfRenderer = recorded;
  });

export const stopRenderer = (page: Page): Promise<Renderer> =>
  page.evaluate(() => {
    const recorded = window.perfRenderer;
    if (!recorded) throw new Error('startRenderer was not called');
    recorded.stop();
    return { longTasks: recorded.longTasks, frames: recorded.frames.slice(1) };
  });

interface MainLoop {
  histogram: ReturnType<typeof import('perf_hooks').monitorEventLoopDelay>;
  blocks: { atMs: number; lagMs: number }[];
  timer: NodeJS.Timeout;
}

/** Records the delay of the event loop of the main process (ms): what a blocking scan or a slow handler adds to every other thing the process does, and when the loop stood still for longer than 100 ms */
export const startMainLoop = (app: ElectronApplication) =>
  app.evaluate(() => {
    const { monitorEventLoopDelay } = process.getBuiltinModule('perf_hooks');
    const histogram = monitorEventLoopDelay({ resolution: 10 });
    histogram.enable();
    const began = Date.now();
    const blocks: MainLoop['blocks'] = [];
    let last = began;
    const timer = setInterval(() => {
      const now = Date.now();
      if (now - last > 100) blocks.push({ atMs: last - began, lagMs: now - last });
      last = now;
    }, 20);
    const recorded: MainLoop = { histogram, blocks, timer };
    Reflect.set(process, 'perfLoop', recorded);
  });

export const stopMainLoop = (app: ElectronApplication) =>
  app.evaluate(() => {
    const recorded: MainLoop | undefined = Reflect.get(process, 'perfLoop');
    if (!recorded) throw new Error('startMainLoop was not called');
    recorded.histogram.disable();
    clearInterval(recorded.timer);
    // the histogram counts in ns and includes the resolution of the timer
    const { histogram, blocks } = recorded;
    return {
      maxMs: histogram.max / 1e6,
      p99Ms: histogram.percentile(99) / 1e6,
      meanMs: histogram.mean / 1e6,
      blocks: blocks.slice(0, 30),
      blockCount: blocks.length,
    };
  });

export const percentile = (values: number[], share: number) =>
  [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * share))] ?? 0;

/** Scrolls the biggest scrollable list that is on the screen down and up again in frames, and answers how far it went (once the list has more than five screens of rows: before that it is still loading) */
export const scrollList = (page: Page, seconds: number) =>
  page.evaluate(
    (duration) =>
      new Promise<number>((done, fail) => {
        // a page that is left stays mounted: the list is the one that is on the screen and that a pointer at its middle reaches
        const isOnScreen = (element: HTMLElement) => {
          const { left, right, top, bottom } = element.getBoundingClientRect();
          return element.contains(
            document.elementFromPoint(Math.min(Math.max((left + right) / 2, 0), innerWidth - 1), Math.min(Math.max((top + bottom) / 2, 0), innerHeight - 1))
          );
        };
        const find = () =>
          [...document.querySelectorAll<HTMLElement>('*')]
            .filter(
              (element) => element.scrollHeight > element.clientHeight * 5 && isOnScreen(element) && /auto|scroll/.test(getComputedStyle(element).overflowY)
            )
            .sort((a, b) => b.scrollHeight - a.scrollHeight)
            .at(0);
        const waitFrom = performance.now();
        const begin = () => {
          const list = find();
          if (!list && performance.now() - waitFrom > 10_000) return fail(new Error('Nothing on the page scrolls'));
          if (!list) return setTimeout(begin, 100);
          const start = performance.now();
          const step = (now: number) => {
            const progress = (now - start) / (duration * 1000);
            // down in the first half, up in the second
            list.scrollTop = (list.scrollHeight - list.clientHeight) * (1 - Math.abs(1 - 2 * Math.min(1, progress)));
            if (progress < 1) requestAnimationFrame(step);
            else done(list.scrollHeight);
          };
          requestAnimationFrame(step);
        };
        begin();
      }),
    seconds
  );

/** Prints what a measurement found, and keeps it in test-results/perf-<name>.json for the summary of the runs (scripts/perf-summary.js) */
export const record = (name: string, report: Record<string, unknown>) => {
  console.log(JSON.stringify({ [name]: report }));
  mkdirSync('test-results', { recursive: true });
  writeFileSync(join('test-results', `perf-${name}.json`), JSON.stringify(report, undefined, 2));
};
