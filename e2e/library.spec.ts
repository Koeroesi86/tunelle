import { statSync, utimesSync } from 'fs';
import { rename, rm } from 'fs/promises';
import { join } from 'path';
import { addFolder, expect, libraryTracks, navigate, quit, test } from './support/app';
import { expectTone } from './support/audio';
import { albums, writeTrack } from './support/library';
import { player } from './support/player';

test('lists the albums and the songs of a scanned folder', { tag: '@parallel' }, async ({ session: { page } }) => {
  await navigate(page, 'Albums');
  await expect(page.getByRole('button', { name: 'Play Pitch Perfect' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Single Note' })).toBeVisible();

  await navigate(page, 'Songs');
  await expect(page.getByText('Concert A')).toBeVisible();
  await expect(page.getByText('Deep Bass')).toBeVisible();
  await expect(page.getByText('4 tracks', { exact: true })).toBeVisible();
});

test('filters the songs with the search', { tag: '@parallel' }, async ({ session: { page } }) => {
  await navigate(page, 'Songs');

  await page.getByRole('searchbox', { name: 'Search the library' }).fill('octave');

  await expect(page.getByText('Octave Up')).toBeVisible();
  await expect(page.getByText('Concert A')).toBeHidden();

  await page.getByRole('searchbox', { name: 'Search the library' }).fill('no such song');
  await expect(page.getByText('Nothing in the library matches').filter({ visible: true })).toBeVisible();
});

test('keeps the library when the app is started again', { tag: '@parallel' }, async ({ start, session }) => {
  await quit(session.app);

  const { page } = await start();

  await expect.poll(async () => (await libraryTracks(page)).length).toBe(4);
  await navigate(page, 'Albums');
  await expect(page.getByRole('button', { name: 'Play Pitch Perfect' })).toBeVisible();
});

test('picks up a file that was added to the folder with a rescan', { tag: '@parallel' }, async ({ session: { page }, music }) => {
  writeTrack(join(music, 'single-note'), { ...albums[1], tracks: [...albums[1].tracks, { title: 'Second Note', frequency: 220 }] }, 1);

  await navigate(page, 'Albums');
  await page.getByRole('button', { name: 'Rescan' }).click();

  await expect.poll(async () => (await libraryTracks(page)).length).toBe(5);
});

test(
  'rescans a file whose size changed, and skips one whose size and modification time are the same',
  { tag: '@parallel' },
  async ({ session: { page }, music }) => {
    const album = join(music, 'pitch-perfect');
    const skipped = join(album, '1-concert-a.flac');
    const modified = statSync(skipped).mtimeMs;
    // a tag of the same length keeps the size; the time is the one of the file at the first scan, to the millisecond
    writeTrack(album, albums[0], 0, undefined, { TITLE: 'Concert Z' });
    utimesSync(skipped, (Math.floor(modified) + 0.5) / 1000, (Math.floor(modified) + 0.5) / 1000);
    writeTrack(album, albums[0], 1, undefined, { TITLE: 'Octave Down!' });

    await navigate(page, 'Albums');
    await page.getByRole('button', { name: 'Rescan' }).click();

    const titles = async () => (await libraryTracks(page)).map((track) => track.title);
    await expect.poll(titles).toContain('Octave Down!');
    // the files are read in order and stored together, so the skipped one is decided by now
    expect(await titles()).toEqual(expect.arrayContaining(['Concert A', 'Deep Bass', 'Hold It']));
    expect(await titles()).not.toContain('Concert Z');
    expect(await titles()).toHaveLength(4);
  }
);

test('rescans a file whose modification time changed, also with the same size', { tag: '@parallel' }, async ({ session: { page }, music }) => {
  const file = join(music, 'pitch-perfect', '1-concert-a.flac');
  writeTrack(join(music, 'pitch-perfect'), albums[0], 0, undefined, { TITLE: 'Concert Z' });
  const later = new Date(statSync(file).mtimeMs + 60_000);
  utimesSync(file, later, later);

  await navigate(page, 'Albums');
  await page.getByRole('button', { name: 'Rescan' }).click();

  await expect.poll(async () => (await libraryTracks(page)).map((track) => track.title)).toContain('Concert Z');
  expect(await libraryTracks(page)).toHaveLength(4);
});

test(
  'picks up a file that was added to a folder of the library that already has files, without a rescan',
  { tag: '@parallel' },
  async ({ session: { page }, music }) => {
    writeTrack(join(music, 'pitch-perfect'), { ...albums[0], tracks: [...albums[0].tracks, { title: 'Fourth Tone', frequency: 660 }] }, 3);

    await expect.poll(async () => (await libraryTracks(page)).map((track) => track.title), { timeout: 60_000 }).toContain('Fourth Tone');
    expect(await libraryTracks(page)).toHaveLength(5);
  }
);

test('picks up files that were added to and removed from a folder without a rescan', { tag: '@parallel' }, async ({ session: { page }, music }) => {
  // the folders are looked at every 10 seconds at the least, so each change waits for the next look
  test.setTimeout(150_000);
  const album = { ...albums[1], title: 'Fresh Start', tracks: [{ title: 'New Note', frequency: 330 }] };
  writeTrack(join(music, 'fresh-start', 'disc-1'), album, 0);

  await expect.poll(async () => (await libraryTracks(page)).length, { timeout: 60_000 }).toBe(5);

  await rm(join(music, 'fresh-start'), { recursive: true });

  await expect.poll(async () => (await libraryTracks(page)).length, { timeout: 60_000 }).toBe(4);
});

test('removes a folder from the library and leaves its files', { tag: '@parallel' }, async ({ session: { page }, music }) => {
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
