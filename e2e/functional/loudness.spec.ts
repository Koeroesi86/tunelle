// Needs the real app: the hidden window of Chromium measures the track, and the level is read where the audio leaves
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Page } from '@playwright/test';
import { addFolder, expect, libraryTracks, navigate, test } from '../support/app';
import { albums, writeTrack } from '../support/library';
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
