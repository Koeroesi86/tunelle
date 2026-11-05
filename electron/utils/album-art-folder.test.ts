import path from 'path';
import { describe, expect, it } from 'vitest';
import { getAlbumArtFolder } from './album-art-folder';

describe('getAlbumArtFolder', () => {
  it('is the albumart folder inside the data folder, with the slash at the end', () => {
    expect(getAlbumArtFolder(path.join(path.sep, 'data'))).toBe(`${path.join(path.sep, 'data', 'albumart')}${path.sep}`);
  });
});
