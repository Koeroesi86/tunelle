import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { drawCover, writeFlac } from '../../scripts/screenshot-media';
import { albums as toneAlbums, writeLibrary as writeToneLibrary } from '../library';

const tracksPerAlbum = 12;
const albumsPerArtist = 4;
const genres = ['Rock', 'Pop', 'Electronic', 'Ambient', 'Jazz', 'Classical', 'Folk', 'Metal'];

const cover = drawCover(
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
  64
);

const pad = (value: number, width = 2) => `${value}`.padStart(width, '0');

/** A library of `tracks` made up, silent tracks of a second (twelve to an album, four albums to an artist) with unique tags and a small cover each, next to the tone albums of the other tests that something audible can be played from */
export const writeLargeLibrary = (folder: string, tracks: number) => {
  writeToneLibrary(folder);
  const albums = Math.ceil(tracks / tracksPerAlbum);
  Array.from({ length: albums }).forEach((_, album) => {
    const artist = `Artist ${pad(Math.floor(album / albumsPerArtist), 4)}`;
    const directory = join(folder, artist.toLowerCase().replace(/ /g, '-'), `album-${pad(album, 4)}`);
    mkdirSync(directory, { recursive: true });
    Array.from({ length: Math.min(tracksPerAlbum, tracks - album * tracksPerAlbum) }).forEach((__, index) =>
      writeFileSync(
        join(directory, `${pad(index + 1)}-track.flac`),
        writeFlac({
          seconds: 1,
          frequency: 0,
          cover,
          tags: {
            TITLE: `Track ${pad(album, 4)}-${pad(index + 1)}`,
            ARTIST: artist,
            ALBUMARTIST: artist,
            ALBUM: `Album ${pad(album, 4)}`,
            GENRE: genres[album % genres.length],
            TRACKNUMBER: index + 1,
            DATE: 1980 + (album % 45),
          },
        })
      )
    );
  });
  return tracks + toneAlbums.flatMap((album) => album.tracks).length;
};
