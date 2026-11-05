import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { planLibrary, writePlan } from './perf-library';
import { profileOf, tags } from './perf-profile';

const profile = {
  tracks: 100,
  tracksPerAlbumFolder: [6],
  albumFoldersPerArtist: [2],
  formats: { flac: 1 },
  otherFiles: { jpg: 1, cue: 0 },
  tags: {
    durationSeconds: [120],
    pictureKilobytes: [20],
    missing: { title: 0, artist: 0, album: 0, albumArtist: 0, genre: 1, year: 0, trackNumber: 0 },
    albumArtistDiffers: 0,
    multiDisc: 0,
    replayGain: 0,
    nonAscii: 0,
  },
};

describe('profileOf', () => {
  it('reads the shape of a library back from its files, as numbers only', async () => {
    const { parseFile } = await import('music-metadata');
    const folder = mkdtempSync(join(tmpdir(), 'perf-profile-'));
    const plan = planLibrary(profile, 24, 9);
    writePlan(folder, plan, { coverSize: 32 });
    mkdirSync(join(folder, 'no-music'));
    writeFileSync(join(folder, 'no-music', 'notes.txt'), 'text');

    const read = await profileOf(folder, 10, parseFile);

    expect(read.tracks).toBe(24);
    expect(read.tracksPerAlbumFolder).toEqual([6, 6, 6, 6]);
    expect(read.albumFoldersPerArtist).toEqual(expect.arrayContaining([2]));
    expect(read.formats).toEqual({ flac: 24 });
    expect(read.otherFiles.jpg).toBe(1);
    expect(read.otherFiles.cue).toBe(0);
    expect(read.tags).toMatchObject({ sampled: 10, missing: { genre: 1, title: 0 }, multiDisc: 0, nonAscii: 0 });
    expect(read.tags.durationSeconds.every((seconds: number) => seconds === 120)).toBe(true);
    // no name of an album, an artist or a track is in it
    const written = JSON.stringify(read);
    expect(
      plan
        .flatMap(({ album, albumArtist, tracks }) => [album, albumArtist, ...tracks.map(({ tags }) => String(tags.TITLE))])
        .filter((name) => written.includes(name))
    ).toEqual([]);
    rmSync(folder, { recursive: true, force: true });
  });
});

describe('tags', () => {
  it('has no shares and no lists for a sample of nothing', () => {
    expect(tags([])).toMatchObject({ sampled: 0, durationSeconds: [], missing: { title: 0 }, multiDisc: 0, replayGain: 0, nonAscii: 0 });
  });

  it('counts a file with another artist than its album artist, a second disc, ReplayGain and a name outside of ASCII', () => {
    const file = {
      megabytes: 1,
      seconds: 100,
      kbps: 320,
      sampleRate: 48000,
      bits: 24,
      pictureKilobytes: 0,
      pictureFormat: '',
      title: 'Café',
      artist: 'A',
      album: 'B',
      albumArtist: 'C',
      genre: 'G',
      year: '1999',
      trackNumber: 1,
      discNumber: 2,
      replayGain: true,
    };

    expect(tags([file])).toMatchObject({ albumArtistDiffers: 1, multiDisc: 1, replayGain: 1, nonAscii: 1, kbps: [320], missing: { genre: 0, year: 0 } });
  });
});

describe('profileOf with files that cannot be read', () => {
  it('leaves them out of the sample', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'perf-profile-'));
    writePlan(folder, planLibrary(profile, 6, 2), { coverSize: 32 });

    const read = await profileOf(folder, 6, () => Promise.reject(new Error('unreadable')));

    expect(read).toMatchObject({ tracks: 6, tags: { sampled: 0 } });
    rmSync(folder, { recursive: true, force: true });
  });
});
