import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { crc32 } from 'zlib';
import { drawCover, writeFlac } from '../screenshots/screenshot-media';
import type { CoverSpec } from '../screenshots/screenshot-media';
import { clamp } from '../../shared/utils/clamp';

/** The part of a profile (scripts/perf/perf-profile.ts) that the plan reads */
interface PlanProfile {
  tracksPerAlbumFolder: number[];
  albumFoldersPerArtist: number[];
  formats: Record<string, number>;
  otherFiles: Record<string, number>;
  tags: {
    durationSeconds: number[];
    pictureKilobytes: number[];
    missing: Record<string, number>;
    albumArtistDiffers: number;
    multiDisc: number;
    replayGain: number;
    nonAscii: number;
  };
}

type Next = () => number;
type Tags = Record<string, string | number>;

interface PlannedTrack {
  file: string;
  disc: number;
  format: string;
  seconds: number;
  tags: Tags;
}

interface PlannedAlbum {
  folder: string[];
  albumArtist: string;
  album: string;
  pictureKilobytes: number;
  extras: string[];
  tracks: PlannedTrack[];
}

// the library of the perf runs (e2e/perf): made up, and shaped like a real one by a profile of numbers (scripts/perf/perf-profile.ts): the albums of an artist, the tracks of an album, the formats, the other files in the folders,
// the lengths and sizes of the files and the pictures, and which tags are missing or odd; the same seed gives the same library, so the base branch and the pull request are measured on the same files
// a real library has what a one second silent file does not: names that are not ASCII, compilations, discs in folders, files with no tags, a picture of hundreds of kilobytes in every album, other files beside the music

/** A seeded generator of numbers from 0 up to 1 (mulberry32) */
const random = (seed: number): Next => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

const pick = <T>(list: T[], next: Next): T | undefined => list[Math.floor(next() * list.length)];

const words = [
  'Midnight',
  'River',
  'Echo',
  'Golden',
  'Silver',
  'Paper',
  'Wild',
  'Static',
  'Velvet',
  'Harbour',
  'Lantern',
  'Winter',
  'Summer',
  'Hollow',
  'Electric',
  'Quiet',
  'Burning',
  'Northern',
  'Lost',
  'Crimson',
];
const nouns = [
  'Road',
  'Night',
  'Machine',
  'Garden',
  'Heart',
  'Sky',
  'Train',
  'Mirror',
  'Season',
  'Letters',
  'Radio',
  'Ocean',
  'Dreams',
  'Skin',
  'Tide',
  'Stone',
  'Fire',
  'House',
  'Moon',
  'Signals',
];
// words with characters outside of ASCII: Hungarian, French, Nordic, Polish, Spanish, Japanese, Cyrillic and Greek
const accented = [
  'Kék',
  'Szél',
  'Tűz',
  'Éjszaka',
  'Város',
  'Álom',
  'Hegyek',
  'Ősz',
  'Szív',
  'Fény',
  'Müller',
  'Café',
  'Sœur',
  'Ångström',
  'Zoë',
  'Ñandú',
  'Łódź',
  '夜',
  '風',
  '東京',
  'Привет',
  'Ελλάδα',
];
const genres = ['Rock', 'Pop', 'Electronic', 'Ambient', 'Jazz', 'Classical', 'Folk', 'Metal', 'Soundtrack', 'Hip-Hop', 'Blues', 'Country', 'Reggae'];

/** A name of this many words, one of them accented when the chance says so */
const phrase = (next: Next, count: number, accentedChance = 0) => {
  const special = next() < accentedChance ? Math.floor(next() * count) : -1;
  return Array.from({ length: count }, (_, index) => (index === special ? pick(accented, next) : pick(next() < 0.7 ? words : nouns, next))).join(' ');
};

const pad = (value: number | string, width = 2) => `${value}`.padStart(width, '0');

/** A name that no other had: the second one gets a number, as real libraries have artists that differ by a word */
const unique = (used: Map<string, number>, name: string) => {
  const count = used.get(name) ?? 0;
  used.set(name, count + 1);
  return count === 0 ? name : `${name} ${count + 1}`;
};

// a track of one of the formats that have no encoder here is made in the nearest one: the lossy ones as mp3, the others as FLAC
const lossy = new Set(['mp3', 'm4a', 'aac', 'ogg', 'opus', 'wma']);

const weighted = (counts: Record<string, number>, next: Next) => {
  const entries = Object.entries(counts);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  let point = next() * total;
  return (entries.find(([, count]) => (point -= count) < 0) ?? entries[0])[0];
};

/**
 * The albums of a library of about this many tracks, drawn from the profile, each as { folder, albumArtist, album, tracks: [{ file, format, seconds, tags, pictureKilobytes }], extras }
 * `folder` is the path inside the library, with the folders of the discs below it
 */
const planLibrary = (profile: PlanProfile, tracks: number, seed = 1) => {
  const next = random(seed);
  const { tags } = profile;
  const used = new Map<string, number>();
  const albums: PlannedAlbum[] = [];
  let total = 0;

  // the discs of a multi disc album are folders of the album; the share is of the tracks of the sample, so an album is likely at a third of it
  const multiDisc = clamp(tags.multiDisc * 3, 0, 0.3);
  const compilation = clamp(tags.albumArtistDiffers, 0, 0.3);
  // the share of the tracks with such a character is over their three names
  const accentedChance = tags.nonAscii / 3;
  const named = (count: number) => phrase(next, count, accentedChance);

  while (total < tracks) {
    const artist = unique(used, named(1 + Math.floor(next() * 2)));
    const albumCount =
      pick(
        profile.albumFoldersPerArtist.filter((count) => count > 0),
        next
      ) ?? 1;

    for (let albumIndex = 0; albumIndex < albumCount && total < tracks; albumIndex += 1) {
      const trackCount = Math.min(pick(profile.tracksPerAlbumFolder, next) ?? 10, tracks - total);
      const isCompilation = next() < compilation;
      const isMultiDisc = trackCount >= 4 && next() < multiDisc;
      const album = named(1 + Math.floor(next() * 3));
      const year = `${1965 + Math.floor(next() * 60)}`;
      const genre = pick(genres, next);
      const albumArtist = isCompilation ? 'Various Artists' : artist;
      const format = weighted(profile.formats, next);

      albums.push({
        folder: [isCompilation ? 'Various Artists' : `${artist}`, `${year} - ${album}`.replace(/[\\/:*?"<>|]/g, '-')],
        albumArtist,
        album,
        pictureKilobytes: pick(tags.pictureKilobytes, next) ?? 0,
        extras: Object.entries(profile.otherFiles)
          .filter(([, chance]) => next() < chance)
          .map(([extension]) => extension),
        tracks: Array.from({ length: trackCount }, (_, index) => {
          const title = next() < 0.03 ? named(12 + Math.floor(next() * 8)) : named(1 + Math.floor(next() * 4));
          const disc = isMultiDisc ? 1 + Math.floor((index * 2) / trackCount) : 0;
          const number = isMultiDisc ? (index % Math.ceil(trackCount / 2)) + 1 : index + 1;
          const seconds = clamp(pick(tags.durationSeconds, next) ?? 200, 30, 900);
          const trackArtist = isCompilation ? named(2) : next() < 0.05 ? `${artist} feat. ${named(2)}` : artist;
          const absent = (name: string) => next() < tags.missing[name];
          return {
            file: `${pad(number)} - ${title.replace(/[\\/:*?"<>|]/g, '-').slice(0, 80)}`,
            disc,
            format: lossy.has(format) ? 'mp3' : 'flac',
            seconds,
            tags: {
              ...(absent('title') ? {} : { TITLE: title }),
              ...(absent('artist') ? {} : { ARTIST: trackArtist }),
              ...(absent('albumArtist') ? {} : { ALBUMARTIST: albumArtist }),
              ...(absent('album') ? {} : { ALBUM: album }),
              ...(absent('genre') ? {} : { GENRE: genre }),
              ...(absent('year') ? {} : { DATE: next() < 0.5 ? year : `${year}-${pad(1 + Math.floor(next() * 12))}-${pad(1 + Math.floor(next() * 28))}` }),
              ...(absent('trackNumber') ? {} : { TRACKNUMBER: number }),
              ...(disc ? { DISCNUMBER: disc } : {}),
              ...(next() < tags.replayGain
                ? { REPLAYGAIN_TRACK_GAIN: `${(next() * 12 - 9).toFixed(2)} dB`, REPLAYGAIN_ALBUM_GAIN: `${(next() * 12 - 9).toFixed(2)} dB` }
                : {}),
            },
          };
        }),
      });
      total += trackCount;
    }
  }
  return albums;
};

const synchsafe = (value: number) => Buffer.from([(value >> 21) & 0x7f, (value >> 14) & 0x7f, (value >> 7) & 0x7f, value & 0x7f]);

const id3Frame = (id: string, body: Buffer) => Buffer.concat([Buffer.from(id), synchsafe(body.length), Buffer.alloc(2), body]);
// UTF-8 text, the encoding byte 3 of ID3v2.4
const textFrame = (id: string, text: string | number) => id3Frame(id, Buffer.concat([Buffer.from([3]), Buffer.from(`${text}`, 'utf8')]));

const id3Names: Record<string, string> = {
  TITLE: 'TIT2',
  ARTIST: 'TPE1',
  ALBUMARTIST: 'TPE2',
  ALBUM: 'TALB',
  GENRE: 'TCON',
  DATE: 'TDRC',
  TRACKNUMBER: 'TRCK',
  DISCNUMBER: 'TPOS',
};

const mpegFrame = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x44]), Buffer.alloc(413)]);

/** An mp3 of 128 kbit/s, 44.1 kHz joint stereo, of silent frames, with ID3v2.4 tags (an object of Vorbis style names, the ReplayGain of it as TXXX) and the PNG as its cover; the length is that of the frames, 26 ms each */
const writeMp3 = ({ seconds, tags, cover }: { seconds: number; tags: Tags; cover: Buffer }) => {
  const frames = [
    ...Object.entries(tags)
      .filter(([name]) => id3Names[name])
      .map(([name, value]) => textFrame(id3Names[name], value)),
    ...Object.entries(tags)
      .filter(([name]) => name.startsWith('REPLAYGAIN_'))
      .map(([name, value]) => id3Frame('TXXX', Buffer.concat([Buffer.from([3]), Buffer.from(`${name}\0${value}`, 'utf8')]))),
    id3Frame('APIC', Buffer.concat([Buffer.from([0]), Buffer.from('image/png\0'), Buffer.from([3]), Buffer.from('\0'), cover])),
  ];
  const body = Buffer.concat(frames);
  const header = Buffer.concat([Buffer.from('ID3'), Buffer.from([4, 0, 0]), synchsafe(body.length)]);
  return Buffer.concat([header, body, ...Array.from({ length: Math.ceil((seconds * 44100) / 1152) }, () => mpegFrame)]);
};

const pngChunk = (type: string, data: Buffer) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, sum]);
};

const coverSpecs: CoverSpec[] = [
  {
    sky: [
      [10, 20, 60],
      [40, 90, 140],
    ],
    sun: [120, 230, 200],
    ground: [
      [48, 60, 150],
      [14, 20, 70],
    ],
    shape: 'waves',
  },
  {
    sky: [
      [60, 20, 40],
      [140, 90, 40],
    ],
    sun: [230, 200, 120],
    ground: [
      [150, 60, 48],
      [70, 20, 14],
    ],
    shape: 'mountains',
  },
  {
    sky: [
      [20, 50, 30],
      [90, 140, 80],
    ],
    sun: [250, 240, 180],
    ground: [
      [30, 90, 60],
      [10, 40, 30],
    ],
    shape: 'grid',
  },
  {
    sky: [
      [200, 200, 210],
      [240, 235, 225],
    ],
    sun: [220, 90, 60],
    ground: [
      [90, 90, 100],
      [40, 40, 50],
    ],
    shape: 'mountains',
  },
  {
    sky: [
      [90, 30, 120],
      [230, 120, 150],
    ],
    sun: [255, 220, 120],
    ground: [
      [60, 20, 90],
      [20, 10, 40],
    ],
    shape: 'waves',
  },
  {
    sky: [
      [10, 10, 10],
      [60, 60, 70],
    ],
    sun: [240, 240, 240],
    ground: [
      [30, 30, 30],
      [5, 5, 5],
    ],
    shape: 'grid',
  },
];

const defaultCoverSize = 600;

// the pictures are drawn pixel by pixel, which takes seconds on a slow runner: each size is drawn once for all the libraries of a process
const drawnCovers = new Map<number, Buffer[]>();
const drawCovers = (size: number) => {
  if (!drawnCovers.has(size))
    drawnCovers.set(
      size,
      coverSpecs.map((spec) => drawCover(spec, size))
    );
  return drawnCovers.get(size) ?? [];
};

/** The covers: a few drawn pictures, each given for every album its own private chunk of random bytes as big as the picture of a real album is, so no two albums share a file (the app keeps a picture once by its hash) and the file is as heavy to read */
const createCovers = (size: number) => {
  const drawn = drawCovers(size);
  return (albumNumber: number, kilobytes: number, next: Next) => {
    const picture = drawn[albumNumber % drawn.length];
    const bytes = Buffer.alloc(Math.max(16, Math.round(kilobytes * 1000)));
    bytes.writeUInt32LE(albumNumber);
    for (let at = 4; at < bytes.length; at += 4) bytes.writeUInt32LE(Math.floor(next() * 4294967296), at);
    // the chunk goes before the end of the picture: an ancillary chunk of a private kind, which readers skip
    const end = picture.length - 12;
    return Buffer.concat([picture.subarray(0, end), pngChunk('prVt', bytes), picture.subarray(end)]);
  };
};

const extraFile = (extension: string, next: Next) =>
  Buffer.from(
    Array.from({ length: extension === 'jpg' || extension === 'jpeg' || extension === 'png' ? 60_000 + Math.floor(next() * 140_000) : 400 }, () =>
      Math.floor(next() * 256)
    )
  );

/** Writes the albums of a plan into the folder (the pictures are `coverSize` pixels wide): the files, the folders of the discs, the picture of each album and the other files beside the music */
const writePlan = (folder: string, plan: PlannedAlbum[], { seed = 1, coverSize = defaultCoverSize } = {}) => {
  const next = random(seed + 1000);
  const cover = createCovers(coverSize);

  plan.forEach((album, albumNumber) => {
    const picture = cover(albumNumber, album.pictureKilobytes || 5, next);
    album.tracks.forEach((track) => {
      const directory = join(folder, ...album.folder, ...(track.disc ? [`CD${track.disc}`] : []));
      mkdirSync(directory, { recursive: true });
      // a track of the lossy formats is as long as 20 seconds of frames, as its length is that of its frames and a library of thousands of them would take the disk of the runner
      const content =
        track.format === 'mp3'
          ? writeMp3({ seconds: Math.min(track.seconds, 20), tags: track.tags, cover: picture })
          : writeFlac({ seconds: track.seconds, frequency: 0, cover: picture, tags: track.tags, padding: 8192 });
      writeFileSync(join(directory, `${track.file}.${track.format}`), content);
    });
    album.extras.forEach((extension) => {
      mkdirSync(join(folder, ...album.folder), { recursive: true });
      writeFileSync(join(folder, ...album.folder, `${extension === 'jpg' ? 'folder' : 'album'}.${extension}`), extraFile(extension, next));
    });
  });
};

export { random, planLibrary, writePlan, writeMp3 };
