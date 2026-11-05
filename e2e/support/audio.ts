import { expect, type Page } from '@playwright/test';
import type { Probe, ProbeWindow } from './audio-probe';

interface Heard {
  /** The length of what was heard on the clock of the audio */
  seconds: number;
  rms: number;
  peak: number;
  /** Hz, from the cycles of the signal; 0 for silence */
  frequency: number;
}

const probeOf = async (page: Page): Promise<Probe> => (await page.evaluate(() => window.audioProbe)) ?? { sampleRate: 0, windows: [] };

const summarize = (sampleRate: number, windows: ProbeWindow[]): Heard => {
  const frames = windows.reduce((sum, window) => sum + window.frames, 0);
  const seconds = sampleRate ? frames / sampleRate : 0;
  return {
    seconds,
    rms: frames ? Math.sqrt(windows.reduce((sum, window) => sum + window.rms ** 2 * window.frames, 0) / frames) : 0,
    peak: windows.reduce((peak, window) => Math.max(peak, window.peak), 0),
    frequency: seconds ? windows.reduce((sum, window) => sum + window.crossings, 0) / seconds : 0,
  };
};

/** The last seconds that came out of the app, a shorter time when less than that was played */
const heardLately = async (page: Page, seconds = 0.5): Promise<Heard> => {
  const { sampleRate, windows } = await probeOf(page);
  const wanted = Math.ceil((seconds * sampleRate) / 1024);
  return summarize(sampleRate, windows.slice(-wanted));
};

export const clearProbe = (page: Page) =>
  page.evaluate(() => {
    if (window.audioProbe) window.audioProbe.windows.length = 0;
  });

const audible = 0.01;

/** Waits until the last half second is a tone of this frequency (Hz), give or take 5 */
export const expectTone = (page: Page, frequency: number) =>
  expect
    .poll(
      async () => {
        const { seconds, rms, frequency: heard } = await heardLately(page);
        return seconds >= 0.4 && rms > audible ? heard : 0;
      },
      { message: `a tone of ${frequency} Hz` }
    )
    .toBeCloseTo(frequency, -1);

/** Waits until the last half second is silent */
export const expectSilence = (page: Page) =>
  expect
    .poll(
      async () => {
        const { seconds, peak } = await heardLately(page);
        return seconds >= 0.4 && peak < 0.001;
      },
      { message: 'silence' }
    )
    .toBe(true);

/** The level (rms, 0 to 1) of the last half second, once there is a half second of it */
export const levelNow = async (page: Page) => {
  await expect.poll(async () => (await heardLately(page)).seconds).toBeGreaterThanOrEqual(0.4);
  return (await heardLately(page)).rms;
};

/** The level once two readings of audio that follow each other agree, as a reading right after a track began or a setting changed can be of the change itself (readings that overlap agree for that reason alone) */
export const steadyLevel = async (page: Page) => {
  let readAt = 0;
  let before = 0;
  let steady = 0;
  await expect
    .poll(async () => {
      const { sampleRate, windows } = await probeOf(page);
      const wanted = Math.ceil((0.5 * sampleRate) / 1024);
      if (!sampleRate || windows.length < readAt + wanted) return false;

      steady = summarize(sampleRate, windows.slice(-wanted)).rms;
      const settled = readAt > 0 && steady > audible && Math.abs(steady - before) <= before * 0.05;
      before = steady;
      readAt = windows.length;
      return settled;
    })
    .toBe(true);
  return steady;
};

/** The longest stretch of silence, in seconds, between the first and the last sound of what was heard since the probe was cleared */
export const longestGap = async (page: Page) => {
  const { sampleRate, windows } = await probeOf(page);
  const sounds = windows.map((window, index) => (window.peak > 0.001 ? index : -1)).filter((index) => index >= 0);
  const first = sounds.at(0);
  const last = sounds.at(-1);
  if (first === undefined || last === undefined) throw new Error('Nothing was heard, so there is no gap to measure');
  const gaps = windows
    .slice(first, last + 1)
    .reduce<number[]>((runs, window) => (window.peak > 0.001 ? [...runs, 0] : [...runs.slice(0, -1), (runs.at(-1) ?? 0) + window.frames]), [0]);
  return Math.max(...gaps) / (sampleRate || 1);
};
