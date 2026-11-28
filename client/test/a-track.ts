import type { Track } from '@shared/types/library';

export const aTrack = (changes: Partial<Track> = {}): Track => ({
  path: '/music/a.flac',
  artist: 'Bach',
  album: 'Suites',
  title: 'Prelude',
  year: '',
  track: '',
  disk: '',
  genre: '',
  picture: null,
  duration: 1,
  ...changes,
});
