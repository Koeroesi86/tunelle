import { join } from 'path';
import { expect, libraryTracks, navigate, quit, test } from '../support/app';
import { albums, writeTrack } from '../support/library';

// the rescans, the removal of a folder and the folders that go offline are tried in electron/library/scan/library-sync.integration.test.ts; what stays here is the real watch of the system

test('lists the albums and the songs of a scanned folder', async ({ session: { page } }) => {
  await navigate(page, 'Albums');
  await expect(page.getByRole('button', { name: 'Play Pitch Perfect' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play Single Note' })).toBeVisible();

  await navigate(page, 'Songs');
  await expect(page.getByText('Concert A')).toBeVisible();
  await expect(page.getByText('Deep Bass')).toBeVisible();
  await expect(page.getByText('4 tracks', { exact: true })).toBeVisible();
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

test('picks up a file that was added to a folder of the library that already has files, without a rescan', async ({ session: { page }, music }) => {
  writeTrack(join(music, 'pitch-perfect'), { ...albums[0], tracks: [...albums[0].tracks, { title: 'Fourth Tone', frequency: 660 }] }, 3);

  await expect.poll(async () => (await libraryTracks(page)).map((track) => track.title), { timeout: 60_000 }).toContain('Fourth Tone');
  expect(await libraryTracks(page)).toHaveLength(5);
});
