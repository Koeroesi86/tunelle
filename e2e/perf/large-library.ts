import { readFileSync } from 'fs';
import { join } from 'path';
import { planLibrary, writePlan } from '../../scripts/perf-library';
import { albums as toneAlbums, writeLibrary as writeToneLibrary, writeTrack } from '../library';

// the profile of a real library, in numbers only (scripts/perf-profile.ts): the same shape of albums, tags, formats, pictures and folders in every run
const profile = JSON.parse(readFileSync(join(__dirname, 'library-profile.json'), 'utf8'));

/** The tone albums of the other tests, with ReplayGain tags so the levelling of the player works while they play */
const writeTones = (folder: string) => {
  writeToneLibrary(folder);
  toneAlbums.forEach((album) =>
    album.tracks.forEach((_, index) =>
      writeTrack(join(folder, album.title.toLowerCase().replace(/ /g, '-')), album, index, undefined, {
        REPLAYGAIN_TRACK_GAIN: '-3.00 dB',
        REPLAYGAIN_ALBUM_GAIN: '-4.50 dB',
      })
    )
  );
};

/** A library of `tracks` made up tracks shaped like a real one (see scripts/perf-library.ts), next to the tone albums that something audible can be played from; answers the number of tracks in it */
export const writeLargeLibrary = (folder: string, tracks: number) => {
  writeTones(folder);
  writePlan(folder, planLibrary(profile, tracks));
  return tracks + toneAlbums.flatMap((album) => album.tracks).length;
};
