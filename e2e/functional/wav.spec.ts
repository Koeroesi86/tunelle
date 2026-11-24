import { join } from 'path';
import { addFolder, expect, test } from '../support/app';
import { expectTone } from '../support/audio';
import { player } from '../support/player';

// PCM in a WAV is decoded by the ffmpeg of the app, not by Chromium, and played from the decoded copy (docs/app/decoder-proxy.md)
test('plays the WAV tracks of an album through the decoder, one after the other', async ({ start }) => {
  const { page } = await start();
  await addFolder(page, join(__dirname, '..', 'fixtures', 'wav'), 2);
  const controls = player(page);

  await controls.playAlbum('Lossless WAV');
  await expectTone(page, 440);
  await expect(controls.title()).toHaveText('Concert A');

  await controls.next();
  await expectTone(page, 880);
  await expect(controls.title()).toHaveText('Octave Up');
});
