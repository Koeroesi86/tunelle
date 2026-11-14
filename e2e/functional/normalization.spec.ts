import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { addFolder, expect, navigate, quit, test } from '../support/app';
import { albums, writeTrack } from '../support/library';
import { expectTone, levelNow, steadyLevel } from '../support/audio';
import { player } from '../support/player';

// -6.02 dB is half the amplitude, -12.04 dB a quarter
const trackGain = '-6.02 dB';
const albumGain = '-12.04 dB';

// the first track has the tags of an album that was levelled louder than the track, the second has none
const folderWithGain = () => {
  const folder = mkdtempSync(join(tmpdir(), 'tunelle-normalization-'));
  writeTrack(folder, albums[0], 0, 30, { REPLAYGAIN_TRACK_GAIN: trackGain, REPLAYGAIN_ALBUM_GAIN: albumGain });
  writeTrack(folder, albums[0], 1);
  return folder;
};

test('levels the tracks by their ReplayGain tags, per album by default, and plays untagged tracks as they are', async ({ start }) => {
  const { page } = await start();
  await addFolder(page, folderWithGain(), 2);
  const controls = player(page);
  await controls.playAlbum('Pitch Perfect');
  await controls.setVolume(1);
  await expectTone(page, 440);

  // the album gain of the track is the default
  const byAlbum = await steadyLevel(page);

  await navigate(page, 'Settings');
  await page.getByRole('radio', { name: 'Off', exact: true }).click();
  await expect.poll(async () => (await levelNow(page)) / byAlbum).toBeCloseTo(4, 0);
  // levelNow could still hold the audio from before the switch, and the ratios below are taken against this level
  const full = await steadyLevel(page);

  await page.getByRole('radio', { name: 'Track', exact: true }).click();
  await expect.poll(async () => (await levelNow(page)) / full).toBeCloseTo(0.5, 1);

  await page.getByRole('radio', { name: 'Album', exact: true }).click();
  await expect.poll(async () => (await levelNow(page)) / full).toBeCloseTo(0.25, 1);

  // a track without tags plays as it is, so the mode does not change its level (the pitch of a sine has its own level)
  await controls.next();
  await expectTone(page, 880);
  const untagged = await steadyLevel(page);
  await page.getByRole('radio', { name: 'Off', exact: true }).click();
  await expect.poll(async () => (await levelNow(page)) / untagged).toBeCloseTo(1, 1);
});

test('keeps the mode after a restart', async ({ start }) => {
  const first = await start();
  await navigate(first.page, 'Settings');
  await first.page.getByRole('radio', { name: 'Track', exact: true }).click();
  await expect(first.page.getByRole('radio', { name: 'Track', exact: true })).toHaveAttribute('aria-checked', 'true');

  await quit(first.app);

  const second = await start();
  await navigate(second.page, 'Settings');

  await expect(second.page.getByRole('radio', { name: 'Track', exact: true })).toHaveAttribute('aria-checked', 'true');
});
