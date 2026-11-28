// Needs the real app: what builds up over hundreds of changes of track in its processes, memory, handles, files and audio
import type { Page } from '@playwright/test';
import { cpSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { longestSilence, overlapOf } from '../../scripts/tooling/audio-joins';
import { joinFaults, leaksIn, type Joins, type Sample } from '../../scripts/tooling/soak-judge';
import { addFolder, expect, navigate, test as base, type Session } from '../support/app';
import { clearProbe, expectTone } from '../support/audio';
import { writeTrack } from '../support/library';
import { player } from '../support/player';
import { childProcesses, decodedFiles, takeSample } from '../support/resources';
import { installSecondOutput } from '../support/second-output';

// a round is some 30 changes of track, and later 4 changes of the output; the first one of each fills the caches and is not judged
const rounds = Number(process.env.SOAK_ROUNDS ?? 10);
const skipsPerAlbum = 8;

const generated = { title: 'Three in a Row', artist: 'The Sine Waves', genre: 'Electronic', year: 2020 };
const frequencies = [440, 880, 1320];
const tracks = frequencies.map((frequency) => ({ title: `Tone ${frequency}`, frequency }));
// a window decodes FLAC, the whole of WMA and MP3 is decoded to a file, and Chromium plays AAC itself
const fixtures = [
  { format: 'wma', title: 'Windows Media' },
  { format: 'mp3', title: 'Encoder Delay' },
  { format: 'aac', title: 'Priming' },
];
const albums = [generated.title, ...fixtures.map(({ title }) => title)];

// what a number may rise by from the first third of the run to the last one. See docs/development/soak-run.md
const limits: Sample = {
  processes: 1,
  mainResources: 5,
  mainArrayBuffersMb: 30,
  // the page keeps media of the tracks it played, up to a level: see docs/development/soak-run.md
  totalMb: 250,
  rendererHeapMb: 10,
  mainHeapMb: 10,
  domNodes: 200,
  listeners: 60,
  audioContexts: 0,
  cacheFiles: 0,
  ...(process.platform === 'linux' ? { openFiles: 8 } : {}),
};

/**
 * Waits until one element plays, and not the end of its track: the change of track is over. With `secondsLeft` that element jumps there, in the same step,
 * as the page may change the track between two
 */
const settled = (page: Page, secondsLeft?: number) =>
  expect
    .poll(
      () =>
        page.evaluate((left) => {
          const playing = Array.from(document.querySelectorAll('audio')).filter((element) => !element.paused);
          const [element] = playing;
          const ready = playing.length === 1 && Number.isFinite(element.duration) && element.duration - element.currentTime > 1.5;
          if (ready && left !== undefined) element.currentTime = element.duration - left;
          return ready || playing.map((other) => `${other.currentTime} of ${other.duration}: ${other.src}`);
        }, secondsLeft),
      { message: 'one element that plays' }
    )
    .toBe(true);

/** The track plays to its end from here, so the next one is handed the output as in a listening */
const playOut = async (page: Page) => {
  const title = player(page).title();
  await settled(page);
  const before = (await title.textContent()) ?? '';
  await settled(page, 1.2);
  await expect(title).not.toHaveText(before);
};

/** Changes that leave a decode or a window before it was done */
const hurry = async (page: Page) => {
  const controls = player(page);
  await controls.next();
  await controls.next();
  await controls.next();
  await controls.previous();
  await settled(page);
};

const changeTracksOf = async (page: Page, album: string) => {
  await player(page).playAlbum(album);
  for (let skip = 0; skip < skipsPerAlbum; skip += 1) await playOut(page);
  await hurry(page);
};

/** Records the three changes of the generated album, the last one back to its start */
const recordJoins = async (page: Page): Promise<Joins> => {
  await player(page).playAlbum(generated.title);
  await page.evaluate(() => window.listenWithProbe?.(true));
  await clearProbe(page);
  await expectTone(page, frequencies[0]);
  await page.evaluate(() => window.startRecording?.());
  const order = [...frequencies, frequencies[0]];
  for (const frequency of order.slice(1)) {
    await clearProbe(page);
    await expectTone(page, frequency);
  }

  const samples = (await page.evaluate(() => window.recordedSamples?.())) ?? [];
  const sampleRate = (await page.evaluate(() => window.audioProbe?.sampleRate)) ?? 0;
  await page.evaluate(() => window.stopRecording?.());
  return {
    silence: longestSilence(samples, sampleRate),
    overlaps: order.slice(1).map((frequency, index) => overlapOf(samples, sampleRate, [order[index], frequency])),
  };
};

/** To the second output, unplugged, plugged in again and back to the default: four contexts one after the other */
const switchOutputs = async (page: Page) => {
  const rate = () => page.evaluate(() => window.audioProbe?.sampleRate ?? 0);
  const defaultRate = await rate();
  const heardAt = async (expected: number) => {
    await expect.poll(rate).toBe(expected);
    await clearProbe(page);
    // the album repeats, so one of its tones comes
    await expect.poll(() => page.evaluate(() => window.audioProbe?.windows.some((window) => window.rms > 0.01))).toBe(true);
  };
  const choose = (label: string) => page.getByRole('combobox', { name: 'Output device' }).selectOption({ label });

  await page.evaluate(() => window.listenWithProbe?.(true));
  await navigate(page, 'Settings');
  await choose('Second output');
  await heardAt(96000);
  await page.evaluate(() => window.unplugSecondOutput?.());
  await heardAt(defaultRate);
  await page.evaluate(() => window.plugSecondOutput?.());
  await heardAt(96000);
  await choose('System default');
  await heardAt(defaultRate);
};

/** Changes of track in every album, and the recording of those of the generated one */
const changeTracks = async (page: Page) => {
  // the probe that is not read keeps every window it heard, which would count as memory of the page
  await page.evaluate(() => window.listenWithProbe?.(false));
  for (const album of albums) await changeTracksOf(page, album);
  return recordJoins(page);
};

const changeOutputs = async (page: Page) => {
  await player(page).playAlbum(generated.title);
  await switchOutputs(page);
};

/** The numbers of the app at rest: paused, with no decoder running and no half written file left */
const sampleAtRest = async ({ app, page }: Session, cache: string) => {
  await player(page).pause();
  await expect.poll(() => childProcesses(app), { message: 'no decoder is left running', timeout: 60_000 }).toBe(0);
  await expect.poll(() => decodedFiles(cache).filter((file) => file.endsWith('.part')), { timeout: 60_000 }).toEqual([]);
  await navigate(page, 'Albums');
  await page.evaluate(() => window.listenWithProbe?.(false));
  await clearProbe(page);
  return takeSample(app, page, cache);
};

/** Plays the rounds, each followed by a reading; the first one fills the caches and the pools, so it is not in the answer */
const playRounds = async <T>(session: Session, cache: string, play: (page: Page) => Promise<T>) => {
  const results: { played: T; sample: Sample }[] = [];
  for (let round = 0; round <= rounds; round += 1) {
    const played = await play(session.page);
    const sample = await sampleAtRest(session, cache);
    console.log(JSON.stringify({ round, ...sample, ...played }));
    results.push({ played, sample });
  }
  return results.slice(1);
};

// asked for before `start`, so the folders are removed after the app has quit: Windows does not remove a file that is held open
const test = base.extend<{ folders: { music: string; cache: string } }>({
  folders: async ({}, use) => {
    const folders = { music: mkdtempSync(join(tmpdir(), 'tunelle-soak-music-')), cache: mkdtempSync(join(tmpdir(), 'tunelle-soak-cache-')) };
    await use(folders);
    Object.values(folders).forEach((folder) => rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }));
  },
});

test(`holds on to nothing more over ${rounds} rounds of changes of track and as many of output`, async ({ folders: { music, cache }, start }) => {
  tracks.forEach((_, index) => writeTrack(music, { ...generated, tracks }, index, 4));
  fixtures.forEach(({ format }) => cpSync(join(__dirname, '..', 'fixtures', format), join(music, format), { recursive: true }));

  // the cache of the decoder in a folder of this run: each system takes it from another of these
  const session = await start({ bypassCSP: true, env: { XDG_CACHE_HOME: cache, TMPDIR: cache, TEMP: cache, TMP: cache } });
  const { page } = session;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(installSecondOutput);
  await page.reload();
  await addFolder(page, music, tracks.length + fixtures.length * 2);
  const controls = player(page);
  await controls.playAlbum(generated.title);
  await controls.repeat();

  // the changes of track first, without one of the output: that makes the audio elements again, and what had built up on them goes with them
  const tracksPlayed = await playRounds(session, cache, changeTracks);
  const outputsChanged = await playRounds(session, cache, changeOutputs);

  expect(errors, 'errors of the page').toEqual([]);
  const leaksOf = (results: { sample: Sample }[]) =>
    leaksIn(
      results.map(({ sample }) => sample),
      limits
    );
  expect.soft(leaksOf(tracksPlayed), 'what built up over the changes of track').toEqual([]);
  expect.soft(leaksOf(outputsChanged), 'what built up over the changes of output').toEqual([]);
  expect.soft(joinFaults(tracksPlayed.map(({ played }) => played)), 'the changes of track').toEqual([]);
});
