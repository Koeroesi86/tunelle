import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { navigate } from './app';

/** The controls of the player bar and the audio element behind them */
export const player = (page: Page) => {
  const range = (name: string) => page.locator(`[class*="PlayerControls__${name}"] input[type="range"]`);

  const setRange = (slider: Locator, value: number) =>
    slider.evaluate((input, to) => {
      if (!(input instanceof HTMLInputElement)) throw new Error('not a slider');
      input.value = `${to}`;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);

  return {
    play: () => page.getByTitle('Play', { exact: true }).click(),
    pause: () => page.getByTitle('Pause', { exact: true }).click(),
    next: () => page.getByTitle('Next', { exact: true }).click(),
    previous: () => page.getByTitle('Previous', { exact: true }).click(),
    shuffle: () => page.getByTitle('Shuffle', { exact: true }).click(),
    repeat: () => page.getByTitle('Repeat', { exact: true }).click(),
    mute: () => page.getByRole('button', { name: 'Mute' }).click(),
    unmute: () => page.getByRole('button', { name: 'Unmute' }).click(),
    // the volume reaches the audio element a moment after the slider moved, and a level measured before that is the old one
    setVolume: async (volume: number) => {
      await setRange(range('volume'), volume);
      await expect.poll(() => page.evaluate(() => window.activeAudio?.()?.volume)).toBeCloseTo(volume, 2);
    },
    seekTo: (seconds: number) => setRange(range('seek'), seconds),
    /** Plays the album from its tile in Albums */
    playAlbum: async (title: string) => {
      await navigate(page, 'Albums');
      await page.getByRole('button', { name: `Play ${title}` }).click();
    },
    /** The title in the player bar */
    title: () => page.locator('[class*="PlayerControls__title"]'),
    currentTime: () =>
      page.evaluate(() => {
        const element = window.activeAudio?.();
        if (!element) throw new Error('There is no audio element');
        return element.currentTime;
      }),
    /** Jumps the element to the last seconds of the track, so its end does not take the length of the track to reach */
    skipToEnd: async (secondsLeft = 0.7) => {
      // the length is not known until the element has read the file
      await expect.poll(() => page.evaluate(() => window.activeAudio?.()?.duration ?? 0)).toBeGreaterThan(secondsLeft);
      await page.evaluate((left) => {
        const element = window.activeAudio?.();
        if (element) element.currentTime = element.duration - left;
      }, secondsLeft);
    },
    expectPlaying: () => expect.poll(() => page.evaluate(() => window.activeAudio?.()?.paused)).toBe(false),
    expectPaused: () => expect.poll(() => page.evaluate(() => window.activeAudio?.()?.paused)).toBe(true),
  };
};
