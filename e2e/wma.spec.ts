import { join } from 'path';
import { addFolder, expect, test } from './support/app';
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
