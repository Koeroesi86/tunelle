import { join } from 'path';
import { expect, libraryTracks, test } from '../support/app';
import { albums, writeTrack } from '../support/library';

// the rescans, the removal of a folder and the folders that go offline are tried in electron/library/scan/library-sync.integration.test.ts; what stays here is the real watch of the system

test('picks up a file that was added to a folder of the library that already has files, without a rescan', async ({ session: { page }, music }) => {
  writeTrack(join(music, 'pitch-perfect'), { ...albums[0], tracks: [...albums[0].tracks, { title: 'Fourth Tone', frequency: 660 }] }, 3);

  await expect.poll(async () => (await libraryTracks(page)).map((track) => track.title), { timeout: 60_000 }).toContain('Fourth Tone');
  expect(await libraryTracks(page)).toHaveLength(5);
});
