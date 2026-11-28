// Needs the real app: what Chromium raises, or does not, for each way a file of the queue goes bad
import { readFileSync, rmSync, truncateSync, writeFileSync } from 'fs';
import { join } from 'path';
import { addFolder, expect, test } from '../support/app';
import { expectTone } from '../support/audio';
import { writeTrack } from '../support/library';
import { player } from '../support/player';

const album = {
  title: 'Broken Record',
  artist: 'The Sine Waves',
  genre: 'Electronic',
  year: 2021,
  tracks: [
    { title: 'First', frequency: 440 },
    { title: 'Second', frequency: 880 },
    { title: 'Damaged', frequency: 660 },
    { title: 'Last', frequency: 550 },
  ],
};

const damages = [
  { name: 'is deleted', damage: (path: string) => rmSync(path) },
  { name: 'is cut short', damage: (path: string) => truncateSync(path, Math.floor(readFileSync(path).length / 10)) },
  { name: 'is overwritten with no audio', damage: (path: string) => writeFileSync(path, Buffer.alloc(readFileSync(path).length, 0x5a)) },
];

damages.forEach(({ name, damage }) =>
  test(`plays on to the next track when a file of the queue ${name}`, async ({ start }, testInfo) => {
    const { page } = await start();
    const folder = testInfo.outputPath('music');
    album.tracks.forEach((_, index) => writeTrack(folder, album, index));
    await addFolder(page, folder, album.tracks.length);
    const controls = player(page);

    await controls.playAlbum(album.title);
    await expectTone(page, 440);
    // the player holds the second track already, the third is not read yet
    damage(join(folder, '3-damaged.flac'));
    await controls.skipToEnd();
    await expectTone(page, 880);
    await controls.skipToEnd();

    // a file that is cut short raises nothing in Chromium: it is silent until the next track takes over at its full length (docs/app/playback-failures.md)
    await expect(async () => expectTone(page, 550)).toPass({ timeout: 45_000 });
    await expect(controls.title()).toHaveText('Last');
    await controls.expectPlaying();
  })
);
