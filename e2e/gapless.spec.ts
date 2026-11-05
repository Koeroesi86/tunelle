import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { addFolder, expect, test } from './support/app';
import { albums, writeTrack } from './support/library';
import { clearProbe, expectTone, longestGap } from './support/audio';
import { player } from './support/player';

// the probe measures in windows of 1024 frames (about 21 ms): a silent window is a gap, and without gapless playback one or two are heard at every change of track
const noGap = 0;

// two tracks of 6 s, so the end of the first is reached by playing, not by a seek: a seek leaves a gap of its own in some formats and on some systems
const flacFolder = () => {
  const folder = mkdtempSync(join(tmpdir(), 'tunelle-gapless-'));
  [0, 1].forEach((index) => writeTrack(folder, albums[0], index, 6));
  return folder;
};

const formats = [
  { format: 'FLAC', folder: flacFolder, album: 'Pitch Perfect' },
  { format: 'mp3', folder: () => join(__dirname, 'fixtures', 'mp3'), album: 'Encoder Delay' },
  { format: 'AAC', folder: () => join(__dirname, 'fixtures', 'aac'), album: 'Priming' },
];

// the encoder of these formats adds silence at the start and the end of a file (the delay and the padding): Chromium leaves it out, which is why the player does not trim it itself
for (const { format, folder, album } of formats) {
  test(`plays the ${format} tracks of an album one after the other without a gap`, async ({ start }) => {
    const { page } = await start();
    await addFolder(page, folder(), 2);
    const controls = player(page);
    await controls.playAlbum(album);
    await expectTone(page, 440);

    // the track plays to its end
    await clearProbe(page);
    await expectTone(page, 880);

    expect(await longestGap(page)).toBe(noGap);
  });
}
