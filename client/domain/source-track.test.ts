import { describe, expect, it } from 'vitest';
import { isSourcePath } from './source-track';

describe('isSourcePath', () => {
  it('is true for the path of a track of a server and false for anything else', () => {
    expect(isSourcePath('subsonic:5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11:song-1')).toBe(true);
    expect(isSourcePath('radio:5f6a1c1e')).toBe(false);
    expect(isSourcePath('/music/a.flac')).toBe(false);
  });
});
