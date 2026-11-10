import { join } from 'path';
import { addFolder, expect, libraryTracks, test } from './support/app';
import { expectTone } from './support/audio';
import { player } from './support/player';

// Chromium does not decode WMA: the tracks are decoded to WAV by the ffmpeg of the app and played from there (docs/app/decoder-proxy.md)
test('plays the WMA tracks of an album through the decoder, one after the other', async ({ start }) => {
  const { page } = await start();
  await addFolder(page, join(__dirname, 'fixtures', 'wma'), 2);
  const controls = player(page);

  await controls.playAlbum('Windows Media');
  await expectTone(page, 440);
  await expect(controls.title()).toHaveText('Concert A');

  await controls.next();
  await expectTone(page, 880);
  await expect(controls.title()).toHaveText('Octave Up');
});

// the loudness window fetches the same address, so the decoded WAV is what it measures (docs/app/loudness-measurement.md)
test('measures the loudness of a WMA track from the decoded sound', async ({ start }) => {
  const { page } = await start({ env: { TUNELLE_LOUDNESS_IDLE_SECONDS: '0' } });
  await addFolder(page, join(__dirname, 'fixtures', 'wma'), 2);
  const [{ path }] = await libraryTracks(page);
  const gain = () =>
    page.evaluate(
      (trackPath): Promise<{ trackGain: number | null }> =>
        fetch(`tunelle://app/library/track?path=${encodeURIComponent(trackPath)}`).then((response) => response.json()),
      path
    );

  await expect.poll(async () => (await gain()).trackGain, { message: 'the measured gain of the WMA track', timeout: 90_000 }).not.toBeNull();
  const analysis = await page.evaluate(
    (trackPath) => fetch(`tunelle://app/library/loudness?path=${encodeURIComponent(trackPath)}`).then((response) => response.status),
    path
  );
  expect(analysis).toBe(200);
});
