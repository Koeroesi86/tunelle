import { join } from 'path';
import type { Page } from '@playwright/test';
import { expect, quit, test } from '../support/app';
import { expectTone } from '../support/audio';
import { writeTrack } from '../support/library';
import { player } from '../support/player';

// which arguments are files and how they are read is tried in electron/library/opened/opened-files.test.ts; what stays here is the start of the app with a file and the second start

const album = {
  title: 'Handed Over',
  artist: 'The Sine Waves',
  genre: 'Electronic',
  year: 2024,
  tracks: [
    { title: 'From Outside', frequency: 660 },
    { title: 'While Running', frequency: 220 },
  ],
};

/** The files are outside of every folder of the library */
const writeOpened = (folder: string) => {
  album.tracks.forEach((_, index) => writeTrack(folder, album, index));
  return { atStart: join(folder, '1-from-outside.flac'), whileRunning: join(folder, '2-while-running.flac') };
};

// the audio probe is not on the first load of the page, so the element itself says that it plays
const expectElementPlaying = (page: Page) =>
  expect.poll(() => page.evaluate(() => [...document.querySelectorAll('audio')].some((audio) => !audio.paused && audio.currentTime > 0))).toBe(true);

test('plays the file it is started with, over the queue of the last time', async ({ session, start }, testInfo) => {
  const { atStart } = writeOpened(testInfo.outputPath('opened'));
  await player(session.page).playAlbum('Pitch Perfect');
  await expectTone(session.page, 440);
  await quit(session.app);

  const { page } = await start({
    files: [atStart],
    onFirstLoad: async (firstLoad) => {
      await expect(player(firstLoad).title()).toHaveText('From Outside');
      await expectElementPlaying(firstLoad);
      // the page is loaded again for the audio probe, which restores the track paused
      await player(firstLoad).pause();
    },
  });

  await expect(player(page).title()).toHaveText('From Outside');
  await player(page).play();
  await expectTone(page, 660);
});

test('plays the file of a second start in the running window', async ({ session: { page, openAgain } }, testInfo) => {
  const { whileRunning } = writeOpened(testInfo.outputPath('opened'));
  await player(page).playAlbum('Pitch Perfect');
  await expectTone(page, 440);

  await openAgain([whileRunning]);

  await expectTone(page, 220);
  await expect(player(page).title()).toHaveText('While Running');
});
