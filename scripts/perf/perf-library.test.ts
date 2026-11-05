import { createHash } from 'crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { planLibrary, random, writeMp3, writePlan } from './perf-library';

const profile = {
  tracks: 100,
  tracksPerAlbumFolder: [4, 8, 12],
  albumFoldersPerArtist: [1, 2, 3],
  formats: { flac: 3, mp3: 1, m4a: 1 },
  otherFiles: { jpg: 1, cue: 0 },
  tags: {
    durationSeconds: [120, 240],
    pictureKilobytes: [20, 40],
    missing: { title: 0, artist: 0, album: 0, albumArtist: 0, genre: 0, year: 0, trackNumber: 0 },
    albumArtistDiffers: 0,
    multiDisc: 0,
    replayGain: 0,
    nonAscii: 0,
  },
};

type Plan = ReturnType<typeof planLibrary>;

const tracksOf = (plan: Plan) => plan.flatMap(({ tracks }) => tracks);

describe('random', () => {
  it('gives the same numbers for the same seed, from 0 up to 1', () => {
    const [first, second] = [random(7), random(7)];
    const numbers = Array.from({ length: 50 }, () => first());

    expect(numbers).toEqual(Array.from({ length: 50 }, () => second()));
    expect(numbers.every((number) => number >= 0 && number < 1)).toBe(true);
    expect(new Set(numbers).size).toBe(50);
  });
});

describe('planLibrary', () => {
  it('plans the number of tracks asked for, the same for the same seed and another for another', () => {
    const plan = planLibrary(profile, 60, 3);

    expect(tracksOf(plan)).toHaveLength(60);
    expect(planLibrary(profile, 60, 3)).toEqual(plan);
    expect(planLibrary(profile, 60, 4)).not.toEqual(plan);
  });

  it('makes the formats that it has no encoder for lossy ones as mp3 and the others as FLAC', () => {
    const formats = new Set(tracksOf(planLibrary(profile, 200, 1)).map(({ format }) => format));

    expect([...formats].sort()).toEqual(['flac', 'mp3']);
  });

  it('leaves out the tags that the profile says are missing, and sets them otherwise', () => {
    const without = tracksOf(planLibrary({ ...profile, tags: { ...profile.tags, missing: { ...profile.tags.missing, title: 1, genre: 1 } } }, 40, 1));
    const present = tracksOf(planLibrary(profile, 40, 1));

    expect(without.every(({ tags }) => !('TITLE' in tags) && !('GENRE' in tags) && 'ALBUM' in tags)).toBe(true);
    expect(present.every(({ tags }) => 'TITLE' in tags && 'GENRE' in tags)).toBe(true);
  });

  it('puts the discs of a multi disc album in folders, and the tracks of a compilation under Various Artists', () => {
    const plan = planLibrary({ ...profile, tags: { ...profile.tags, multiDisc: 0.1, albumArtistDiffers: 0.3 } }, 400, 2);
    const discs = tracksOf(plan).filter(({ disc }) => disc);

    expect(discs.length).toBeGreaterThan(0);
    expect(discs.every(({ tags }) => tags.DISCNUMBER === 1 || tags.DISCNUMBER === 2)).toBe(true);
    expect(plan.some(({ folder, albumArtist }) => folder[0] === 'Various Artists' && albumArtist === 'Various Artists')).toBe(true);
  });

  it('has names with characters outside of ASCII at the share of the profile', () => {
    const names = planLibrary({ ...profile, tags: { ...profile.tags, nonAscii: 0.9 } }, 100, 1).map(({ album }) => album);

    expect(names.some((name) => /[^\x20-\x7e]/.test(name))).toBe(true);
    expect(planLibrary(profile, 100, 1).every(({ album }) => !/[^\x20-\x7e]/.test(album))).toBe(true);
  });
});

describe('planLibrary with a profile that has nothing to draw from', () => {
  it('falls back to an album of ten tracks of 200 seconds, and writes the picture of a few kilobytes', () => {
    const empty = {
      ...profile,
      albumFoldersPerArtist: [],
      tracksPerAlbumFolder: [],
      otherFiles: { png: 1 },
      tags: { ...profile.tags, durationSeconds: [], pictureKilobytes: [] },
    };
    const plan = planLibrary(empty, 20, 1);

    expect(plan.map(({ tracks }) => tracks.length)).toEqual([10, 10]);
    expect(tracksOf(plan).every(({ seconds }) => seconds === 200)).toBe(true);
    expect(plan[0]).toMatchObject({ pictureKilobytes: 0, extras: ['png'] });
  });

  it('writes the picture and the other file of such an album', () => {
    const folder = mkdtempSync(join(tmpdir(), 'perf-library-'));
    const plan = planLibrary({ ...profile, otherFiles: { png: 1 }, tags: { ...profile.tags, pictureKilobytes: [] } }, 6, 1);
    writePlan(folder, plan, { coverSize: 32 });

    expect(readdirSync(join(folder, ...plan[0].folder)).includes('album.png')).toBe(true);
    rmSync(folder, { recursive: true, force: true });
  });
});

describe('writeMp3', () => {
  it('is a file that the app reads: the tags, the picture and the length of its frames', async () => {
    const { parseBuffer } = await import('music-metadata');
    const cover = Buffer.from('89504e470d0a1a0a', 'hex');

    const { common, format } = await parseBuffer(
      writeMp3({ seconds: 5, cover, tags: { TITLE: 'Kék Szél', ARTIST: 'A', ALBUM: 'B', TRACKNUMBER: 3, DISCNUMBER: 2, REPLAYGAIN_TRACK_GAIN: '-3.00 dB' } }),
      { mimeType: 'audio/mpeg' }
    );

    expect(common).toMatchObject({ title: 'Kék Szél', artist: 'A', album: 'B', track: { no: 3 }, disk: { no: 2 } });
    expect(Buffer.from(common.picture?.[0].data ?? [])).toEqual(cover);
    expect(format.duration).toBeCloseTo(5, 0);
  });
});

describe('writePlan', () => {
  it('writes files with the length, the tags and a picture of their own for every album, and the other files beside the music', async () => {
    const { parseFile } = await import('music-metadata');
    const folder = mkdtempSync(join(tmpdir(), 'perf-library-'));
    const plan = planLibrary(profile, 30, 5);
    writePlan(folder, plan, { seed: 5, coverSize: 32 });

    const files = plan.flatMap((album) =>
      album.tracks.map((track) => join(folder, ...album.folder, ...(track.disc ? [`CD${track.disc}`] : []), `${track.file}.${track.format}`))
    );
    const flac = files.find((file) => file.endsWith('.flac'));
    const { common, format } = await parseFile(flac ?? '');
    const pictures = await Promise.all(
      files.map((file) =>
        parseFile(file).then(({ common: tags }) =>
          createHash('md5')
            .update(tags.picture?.[0].data ?? '')
            .digest('hex')
        )
      )
    );

    expect(common.title).toBeTruthy();
    expect(format.duration).toBeGreaterThanOrEqual(30);
    // an album has the picture of every one of its tracks, no two albums have the same
    expect(new Set(pictures).size).toBe(plan.length);
    expect(readdirSync(join(folder, ...plan[0].folder)).some((file) => file === 'folder.jpg')).toBe(true);
    expect(readFileSync(files[0]).length).toBeGreaterThan(20_000);
    rmSync(folder, { recursive: true, force: true });
  });
});
