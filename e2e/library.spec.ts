import { rename, rm } from 'fs/promises';
import { join } from 'path';
import { addFolder, expect, libraryTracks, navigate, quit, test } from './app';
import { expectTone } from './audio';
import { albums, writeTrack } from './library';
import { player } from './player';

test('lists the albums and the songs of a scanned folder', async ({ session: { page } }) => {
  await navigate(page, 'Albums');
  await expect(page.getByRole('button', { name: 'Play Pitch Perfect' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Single Note' })).toBeVisible();

  await navigate(page, 'Songs');
  await expect(page.getByText('Concert A')).toBeVisible();
  await expect(page.getByText('Deep Bass')).toBeVisible();
  await expect(page.getByText('4 tracks')).toBeVisible();
});

test('filters the songs with the search', async ({ session: { page } }) => {
  await navigate(page, 'Songs');

  await page.getByRole('searchbox', { name: 'Search the library' }).fill('octave');

  await expect(page.getByText('Octave Up')).toBeVisible();
  await expect(page.getByText('Concert A')).toBeHidden();

  await page.getByRole('searchbox', { name: 'Search the library' }).fill('no such song');
  await expect(page.getByText('Nothing in the library matches').filter({ visible: true })).toBeVisible();
});

test('keeps the library when the app is started again', async ({ start, session }) => {
  await quit(session.app);

  const { page } = await start();

  await expect.poll(async () => (await libraryTracks(page)).length).toBe(4);
  await navigate(page, 'Albums');
  await expect(page.getByRole('button', { name: 'Play Pitch Perfect' })).toBeVisible();
});

test('picks up a file that was added to the folder with a rescan', async ({ session: { page }, music }) => {
  writeTrack(join(music, 'single-note'), { ...albums[1], tracks: [...albums[1].tracks, { title: 'Second Note', frequency: 220 }] }, 1);

  await navigate(page, 'Albums');
  await page.getByRole('button', { name: 'Rescan' }).click();

  await expect.poll(async () => (await libraryTracks(page)).length).toBe(5);
});

test('picks up files that were added to and removed from a folder without a rescan', async ({ session: { page }, music }) => {
  // the folders are looked at every 30 seconds at the least, so each change waits for the next look
  test.setTimeout(150_000);
  const album = { ...albums[1], title: 'Fresh Start', tracks: [{ title: 'New Note', frequency: 330 }] };
  writeTrack(join(music, 'fresh-start', 'disc-1'), album, 0);

  await expect.poll(async () => (await libraryTracks(page)).length, { timeout: 60_000 }).toBe(5);

  await rm(join(music, 'fresh-start'), { recursive: true });

  await expect.poll(async () => (await libraryTracks(page)).length, { timeout: 60_000 }).toBe(4);
});

test('removes a folder from the library and leaves its files', async ({ session: { page }, music }) => {
  await navigate(page, 'Folders');

  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Remove from library' }).click();

  await expect.poll(async () => (await libraryTracks(page)).length).toBe(0);
  await navigate(page, 'Home');
  await expect(page.getByText('Your library is empty')).toBeVisible();
  await addFolder(page, music, 4);
});

test('marks a folder that cannot be reached and plays again once it is back', async ({ start, session, music }) => {
  await quit(session.app);
  const moved = `${music}-away`;
  await rename(music, moved);

  const offline = await start();
  await navigate(offline.page, 'Folders');
  await expect(offline.page.getByText('Unavailable').filter({ visible: true })).toBeVisible();
  // the tracks stay in the library
  expect((await libraryTracks(offline.page)).length).toBe(4);

  await quit(offline.app);
  await rename(moved, music);
  const back = await start();
  await navigate(back.page, 'Folders');
  await expect(back.page.getByText('Unavailable').filter({ visible: true })).toHaveCount(0);
  // the check may not have run yet: a track of the folder that plays is what shows the folder is reachable again
  await player(back.page).playAlbum('Pitch Perfect');
  await expectTone(back.page, 440);
});
