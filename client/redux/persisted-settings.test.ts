import { describe, expect, it } from 'vitest';
import { restoredSettingsSchema } from './persisted-settings';

const restore = (saved: unknown) => restoredSettingsSchema.parse(saved);

describe('restoredSettingsSchema', () => {
  it('restores the keys that are valid', () => {
    expect(restore({ volume: 0.5, normalization: 'track', trackSort: { field: 'artist', direction: 'asc' }, libraryFolders: ['/a'] })).toEqual({
      volume: 0.5,
      normalization: 'track',
      trackSort: { field: 'artist', direction: 'asc' },
      libraryFolders: ['/a'],
    });
  });

  it('leaves out a key of the wrong type and keeps the others', () => {
    expect(restore({ volume: 'loud', shuffle: true, normalization: 'loud', trackSort: { field: 'x', direction: 'asc' }, groupSort: 'name' })).toEqual({
      shuffle: true,
    });
  });

  it('drops what a sort does not know', () => {
    expect(restore({ groupSort: { field: 'albumCount', direction: 'asc', extra: 1 } })).toEqual({ groupSort: { field: 'albumCount', direction: 'asc' } });
  });

  it('leaves out the keys it does not know', () => {
    expect(restore({ repeat: true, tab: 'settings', anything: 1 })).toEqual({ repeat: true });
  });

  it('takes a track the player can show and drops a queue with one it cannot', () => {
    const track = { path: '/a.flac', title: 'A', artist: 'x' };

    expect(restore({ nowPlaying: [track], currentSong: track }).nowPlaying).toEqual([track]);
    expect(restore({ nowPlaying: [track, { title: 'no path' }], currentSong: { path: 3 } })).toEqual({});
  });

  it('gives the default for the part of a theme that is wrong', () => {
    expect(restore({ theme: { mode: 'sepia', accent: 4 } })).toEqual({ theme: { mode: 'system', accent: undefined } });
  });

  it('is empty for settings that are not an object', () => {
    expect([undefined, null, 'text', 5].map(restore)).toEqual([{}, {}, {}, {}]);
  });
});
