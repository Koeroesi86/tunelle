import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Page } from '@playwright/test';
import { addFolder, expect, libraryTracks, navigate, test } from '../support/app';
import { albums, writeLongWav, writeTrack } from '../support/library';
import { expectTone, levelNow, steadyLevel } from '../support/audio';
import { player } from '../support/player';

// a sine of half the full scale in both channels is at -6.7 LUFS (BS.1770), so levelling it to -18 LUFS cuts it by 11.3 dB, to 0.27 of the amplitude
const cut = 10 ** (-11.3 / 20);

type Gains = { trackGain: number | null; albumGain: number | null };

/** The player takes the gains of a track from its own address, where the tags come first and the measurement is for the tracks without */
const gainsOf = (page: Page, path: string) =>
  page.evaluate(
    (trackPath): Promise<Gains> => fetch(`tunelle://app/library/track?path=${encodeURIComponent(trackPath)}`).then((response) => response.json()),
    path
  );

const folderOfTracks = (count: number, seconds = 10) => {
  const folder = mkdtempSync(join(tmpdir(), 'tunelle-loudness-'));
  [...Array(count).keys()].forEach((index) => writeTrack(folder, albums[0], index, seconds));
  return folder;
};

test('measures a track without gain tags in the background and levels it by the measurement', async ({ start }) => {
  const { page } = await start({ env: { TUNELLE_LOUDNESS_IDLE_SECONDS: '0' } });
  await addFolder(page, folderOfTracks(1), 1);
  const [{ path }] = await libraryTracks(page);

  await expect.poll(async () => (await gainsOf(page, path)).trackGain, { message: 'the measured gain of the track', timeout: 90_000 }).not.toBeNull();
  expect((await gainsOf(page, path)).trackGain).toBeCloseTo(-11.3, 0);

  const controls = player(page);
  await controls.playAlbum('Pitch Perfect');
  await controls.setVolume(1);
  await expectTone(page, 440);
  await navigate(page, 'Settings');
  await page.getByRole('radio', { name: 'Off', exact: true }).click();
  const full = await steadyLevel(page);

  await page.getByRole('radio', { name: 'Track', exact: true }).click();

  await expect.poll(async () => (await levelNow(page)) / full).toBeCloseTo(cut, 1);
});

test('measures a track that is queued before the ones that come first in the library', async ({ start }) => {
  const { page } = await start({ env: { TUNELLE_LOUDNESS_IDLE_SECONDS: '0' } });
  await addFolder(page, folderOfTracks(3), 3);
  const paths = (await libraryTracks(page)).map((track) => track.path).sort();
  const last = paths[paths.length - 1];

  // what the page sends when a track is added to the queue; the track in progress finishes first, then the last one goes before the rest
  await page.evaluate((trackPath) => window.electronAPI.send('LOUDNESS_PRIORITISE', { paths: [trackPath] }), last);

  // the track that would come next is read first, so a gain on it with none on the queued track was measured before it, however late the poll looks
  let first: { next: number | null; queued: number | null } | undefined;
  await expect
    .poll(
      async () => {
        const next = (await gainsOf(page, paths[1])).trackGain;
        const queued = (await gainsOf(page, last)).trackGain;
        first = next === null && queued === null ? undefined : { next, queued };
        return first;
      },
      { message: 'the first measured gain', timeout: 90_000 }
    )
    .toBeDefined();
  expect(first?.queued).not.toBeNull();
});

test('shows the histogram of the loudness of the song that plays on the now playing page', async ({ start }) => {
  const { page } = await start({ env: { TUNELLE_LOUDNESS_IDLE_SECONDS: '0' } });
  await addFolder(page, folderOfTracks(1), 1);
  const [{ path }] = await libraryTracks(page);
  await expect.poll(async () => (await gainsOf(page, path)).trackGain, { message: 'the measured gain of the track', timeout: 90_000 }).not.toBeNull();

  await player(page).playAlbum('Pitch Perfect');
  await navigate(page, 'Now playing');

  // a sine of half the full scale in both channels is at -6.7 LUFS, and its peak is -6.0 dBFS
  const panel = page.getByRole('region', { name: 'Loudness of the track' });
  // the number and its unit are shown apart, the unit in the line of the label
  await expect(panel.getByText('-6.7', { exact: true })).toBeVisible();
  await expect(panel.getByText('LUFS', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /^How the loudness of the track is spread/ })).toBeVisible();
});

test('shows the histogram of a song that is measured while it plays, and levels it, without leaving the page', async ({ start }) => {
  // the measurement waits 15 s after the scan, so the song is not measured when it starts to play, and it is long enough to still play then
  const { page } = await start({ env: { TUNELLE_LOUDNESS_IDLE_SECONDS: '15' } });
  await addFolder(page, folderOfTracks(1, 180), 1);
  const [{ path }] = await libraryTracks(page);

  const controls = player(page);
  await controls.playAlbum('Pitch Perfect');
  await controls.setVolume(1);
  await expectTone(page, 440);
  await navigate(page, 'Now playing');
  const panel = page.getByRole('region', { name: 'Loudness of the track' });
  await expect(panel).toBeHidden();
  expect((await gainsOf(page, path)).trackGain).toBeNull();

  await expect(panel.getByText('-6.7', { exact: true })).toBeVisible({ timeout: 90_000 });

  // the song that plays is levelled by what was measured while it played, the album by default
  await navigate(page, 'Settings');
  await page.getByRole('radio', { name: 'Off', exact: true }).click();
  const full = await steadyLevel(page);
  await page.getByRole('radio', { name: 'Album', exact: true }).click();
  await expect.poll(async () => (await levelNow(page)) / full).toBeCloseTo(cut, 1);
});

test('measures a track that is too long to decode as a whole, in pieces', async ({ start }) => {
  const { page } = await start({ env: { TUNELLE_LOUDNESS_IDLE_SECONDS: '0' } });
  const folder = mkdtempSync(join(tmpdir(), 'tunelle-loudness-'));
  // 50 minutes, over the 45 that are decoded as a whole
  writeLongWav(folder, 3000);
  await addFolder(page, folder, 1);
  const [{ path }] = await libraryTracks(page);

  await expect.poll(async () => (await gainsOf(page, path)).trackGain, { message: 'the measured gain of the long track', timeout: 120_000 }).not.toBeNull();

  // a sine of half the full scale in one channel is at -9.7 LUFS, 3 dB under the same in two
  expect((await gainsOf(page, path)).trackGain).toBeCloseTo(-8.3, 0);
});

test('gives the tracks of an album the gain pooled from all of them once each is measured, and levels the album by it', async ({ start }) => {
  const { page } = await start({ env: { TUNELLE_LOUDNESS_IDLE_SECONDS: '0' } });
  await addFolder(page, folderOfTracks(2), 2);
  const paths = (await libraryTracks(page)).map((track) => track.path);

  await expect
    .poll(async () => Promise.all(paths.map(async (path) => (await gainsOf(page, path)).albumGain)), {
      message: 'the pooled gain of the album',
      timeout: 90_000,
    })
    .not.toContain(null);
  const [first, second] = await Promise.all(paths.map((path) => gainsOf(page, path)));
  // two sines of the same level pool to the gain of either
  expect(first.albumGain).toBeCloseTo(-11.3, 0);
  expect(second.albumGain).toBe(first.albumGain);

  const controls = player(page);
  await controls.playAlbum('Pitch Perfect');
  await controls.setVolume(1);
  await expectTone(page, 440);
  await navigate(page, 'Settings');
  await page.getByRole('radio', { name: 'Off', exact: true }).click();
  const full = await steadyLevel(page);

  await page.getByRole('radio', { name: 'Album', exact: true }).click();

  await expect.poll(async () => (await levelNow(page)) / full).toBeCloseTo(cut, 1);
});

test('shows how far the measurement is in the settings, turns it off and clears what it measured', async ({ start }) => {
  const { page } = await start({ env: { TUNELLE_LOUDNESS_IDLE_SECONDS: '0' } });
  await addFolder(page, folderOfTracks(2), 2);
  const paths = (await libraryTracks(page)).map((track) => track.path);
  await expect
    .poll(async () => Promise.all(paths.map(async (path) => (await gainsOf(page, path)).trackGain)), { message: 'both tracks measured', timeout: 90_000 })
    .not.toContain(null);

  await navigate(page, 'Settings');
  await expect(page.getByRole('status').getByText('All tracks are measured.')).toBeVisible({ timeout: 30_000 });

  // off, so what is cleared stays cleared
  const measure = page.getByRole('switch', { name: 'Measure loudness' });
  await measure.click();
  await expect(measure).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button', { name: 'Clear measured values' }).click();
  // the page shows 0 as soon as the button is pressed, before the main process has deleted the rows
  await expect(page.getByRole('status').getByText('0 of 2 tracks measured')).toBeVisible();
  await expect
    .poll(async () => Promise.all(paths.map(async (path) => (await gainsOf(page, path)).trackGain)), { message: 'the gains are gone' })
    .toEqual([null, null]);

  await measure.click();

  await expect(page.getByRole('status').getByText('All tracks are measured.')).toBeVisible({ timeout: 60_000 });
  expect(await Promise.all(paths.map(async (path) => (await gainsOf(page, path)).trackGain))).not.toContain(null);
});
