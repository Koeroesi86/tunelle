import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { drawCover, writeFlac } from '../../scripts/screenshots/screenshot-media';

interface FixtureTrack {
  title: string;
  /** The pitch of the generated sine, so what is heard says which track plays */
  frequency: number;
}

interface FixtureAlbum {
  title: string;
  artist: string;
  genre: string;
  year: number;
  tracks: FixtureTrack[];
}

// long enough that a track does not end under a test that measures it several times on a slow runner (the tests that want an end skip to it)
const trackSeconds = 30;

/** Two albums of made up tracks, each a sine of its own pitch: 440 Hz is the A of the first track, 880 Hz an octave above, 100 Hz is in the reach of the bass of the equalizer */
export const albums: FixtureAlbum[] = [
  {
    title: 'Pitch Perfect',
    artist: 'The Sine Waves',
    genre: 'Electronic',
    year: 2020,
    tracks: [
      { title: 'Concert A', frequency: 440 },
      { title: 'Octave Up', frequency: 880 },
      { title: 'Deep Bass', frequency: 100 },
    ],
  },
  { title: 'Single Note', artist: 'Lone Oscillator', genre: 'Ambient', year: 2022, tracks: [{ title: 'Hold It', frequency: 440 }] },
];

const cover = drawCover(
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
  64
);

// a track is the same bytes in every test, and a second of tone takes long to make: each is made once per run
const made = new Map<string, Buffer>();

/** `extraTags` are more Vorbis comments of the file, such as its ReplayGain */
export const writeTrack = (folder: string, album: FixtureAlbum, index: number, seconds = trackSeconds, extraTags: Record<string, string> = {}) => {
  const track = album.tracks[index];
  const key = `${album.title}/${track.title}/${track.frequency}/${seconds}/${JSON.stringify(extraTags)}`;
  if (!made.has(key)) {
    made.set(
      key,
      writeFlac({
        seconds,
        frequency: track.frequency,
        cover,
        tags: {
          TITLE: track.title,
          ARTIST: album.artist,
          ALBUMARTIST: album.artist,
          ALBUM: album.title,
          GENRE: album.genre,
          TRACKNUMBER: index + 1,
          DATE: album.year,
          ...extraTags,
        },
      })
    );
  }
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, `${index + 1}-${track.title.toLowerCase().replace(/ /g, '-')}.flac`), made.get(key) ?? Buffer.alloc(0));
};

/** Writes the albums, a folder each, in the folder */
export const writeLibrary = (folder: string) =>
  albums.forEach((album) => album.tracks.forEach((_, index) => writeTrack(join(folder, album.title.toLowerCase().replace(/ /g, '-')), album, index)));

/** A mono WAV file of 8 bit samples, a sine of 440 Hz at half of the full scale, which is long and small (8 000 bytes a second) */
export const writeLongWav = (folder: string, seconds: number) => {
  const rate = 8000;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + seconds * rate, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write('data', 36);
  header.writeUInt32LE(seconds * rate, 40);
  const sound = Buffer.from(Array.from({ length: seconds * rate }, (_, index) => 128 + Math.round(64 * Math.sin((2 * Math.PI * 440 * index) / rate))));
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'Long Mix.wav'), Buffer.concat([header, sound]));
};
