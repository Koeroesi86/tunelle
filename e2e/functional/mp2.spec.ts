import { join } from 'path';
import { addFolder, expect, test } from '../support/app';
import { expectTone } from '../support/audio';
import { player } from '../support/player';

// MP2 is decoded by the ffmpeg of the app, not by Chromium, and played from the WAV (docs/app/decoder-proxy.md)
test('plays the MP2 tracks of an album through the decoder, one after the other', async ({ start }) => {
  const { page } = await start();
  await addFolder(page, join(__dirname, '..', 'fixtures', 'mp2'), 2);
  const controls = player(page);

  await controls.playAlbum('Lossy MP2');
  await expectTone(page, 440);
  await expect(controls.title()).toHaveText('Concert A');

  await controls.next();
  await expectTone(page, 880);
  await expect(controls.title()).toHaveText('Octave Up');
});
