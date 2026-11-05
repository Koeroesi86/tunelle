import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { addFolder, expect, libraryTracks, navigate, test } from './support/app';
import { albums, writeTrack } from './support/library';
import { expectTone, levelNow, steadyLevel } from './support/audio';
import { player } from './support/player';

// a sine of half the full scale in both channels is at -6.7 LUFS (BS.1770), so levelling it to -18 LUFS cuts it by 11.3 dB, to 0.27 of the amplitude
const cut = 10 ** (-11.3 / 20);

test('measures a track without gain tags in the background and levels it by the measurement', async ({ start }) => {
  const { page } = await start({ env: { TUNELLE_LOUDNESS_IDLE_SECONDS: '0' } });
  const folder = mkdtempSync(join(tmpdir(), 'tunelle-loudness-'));
  writeTrack(folder, albums[0], 0, 10);
  await addFolder(page, folder, 1);
  const [{ path }] = await libraryTracks(page);

  // the player takes the gain of a track from its own address, where the tags come first and the measurement is for the tracks without
  const gainOf = () =>
    page.evaluate(
      (trackPath) =>
        fetch(`tunelle://app/library/track?path=${encodeURIComponent(trackPath)}`)
          .then((response) => response.json())
          .then((track: { trackGain: number | null }) => track.trackGain),
      path
    );
  await expect.poll(gainOf, { message: 'the measured gain of the track', timeout: 90_000 }).not.toBeNull();
  expect(await gainOf()).toBeCloseTo(-11.3, 0);

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
