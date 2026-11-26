import { join } from 'path';
import { addFolder, expect, test } from '../support/app';
import { expectTone } from '../support/audio';
import { player } from '../support/player';

// An RF64 file is read by the scan itself (music-metadata cannot) and decoded by the ffmpeg of the app, not by Chromium, and played from the WAV (docs/app/decoder-formats.md)
test('plays the RF64 tracks of an album through the decoder, one after the other', async ({ start }) => {
  const { page } = await start();
  await addFolder(page, join(__dirname, '..', 'fixtures', 'rf64'), 2);
  const controls = player(page);

  await controls.playAlbum('Lossless RF64');
  await expectTone(page, 440);
  await expect(controls.title()).toHaveText('Concert A');

  await controls.next();
  await expectTone(page, 880);
  await expect(controls.title()).toHaveText('Octave Up');
});
