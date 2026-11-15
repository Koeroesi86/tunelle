import { describe, expect, it } from 'vitest';
import { isPlaylistFile, playlistExportFilters, playlistExtensions, playlistFormatOf } from './playlist-files';

describe('playlistFormatOf', () => {
  it.each([
    ['/lists/mix.m3u', 'm3u'],
    ['/lists/mix.m3u8', 'm3u'],
    ['/lists/mix.pls', 'pls'],
    ['/lists/mix.xspf', 'xspf'],
    ['C:/lists/MIX.M3U', 'm3u'],
    ['/lists/mix.Xspf', 'xspf'],
  ])('takes %s for %s', (filePath, format) => {
    expect(playlistFormatOf(filePath)).toBe(format);
  });

  it.each(['/lists/mix.flac', '/lists/mix', '/lists/m3u', '/lists/mix.m3u.bak', '/lists/mix.wpl', '/lists/mix.cue'])('takes %s for no playlist', (filePath) => {
    expect(playlistFormatOf(filePath)).toBeUndefined();
    expect(isPlaylistFile(filePath)).toBe(false);
  });
});

describe('the extensions of the dialogs', () => {
  it('offer every format that is read, without the dot', () => {
    expect(playlistExtensions).toEqual(['m3u', 'm3u8', 'pls', 'xspf']);
  });

  it('offer .m3u8 first for a new file, and every extension that is read can also be written', () => {
    expect(playlistExportFilters[0]?.extensions).toEqual(['m3u8']);
    expect(playlistExportFilters.flatMap(({ extensions }) => extensions).every((extension) => isPlaylistFile(`a.${extension}`))).toBe(true);
  });
});
