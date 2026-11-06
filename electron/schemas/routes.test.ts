import { describe, expect, it } from 'vitest';
import { artKeySchema, assetPathSchema, stationUuidSchema, trackPathSchema } from './routes';
import { folderRowSchema } from './rows';

describe('route schemas', () => {
  it('reads the kind and the name of an asset path', () => {
    expect(assetPathSchema.parse('/albumart/a%20b.png')).toEqual({ kind: 'albumart', key: 'a b.png' });
    expect(assetPathSchema.parse('/radio/abc-1')).toEqual({ kind: 'radio', key: 'abc-1' });
  });

  it.each(['/', '/other/x', '/albumart/', '/albumart/a/b', '/radio'])('does not read %s as an asset path', (pathname) => {
    expect(assetPathSchema.safeParse(pathname).success).toBe(false);
  });

  it('takes the keys of the art and the stations that are well formed', () => {
    expect(artKeySchema.safeParse('0123456789abcdef').success).toBe(true);
    expect(artKeySchema.safeParse('0123456789ABCDEF').success).toBe(false);
    expect(stationUuidSchema.safeParse('abc-123').success).toBe(true);
    expect(stationUuidSchema.safeParse('../x').success).toBe(false);
    expect(trackPathSchema.safeParse('').success).toBe(false);
    expect(trackPathSchema.safeParse(null).success).toBe(false);
  });
});

describe('folderRowSchema', () => {
  it('reads a folder without a modification time as 0 and names the column that is wrong', () => {
    expect(folderRowSchema.parse({ path: '/m', lastModified: null })).toEqual({ path: '/m', lastModified: 0 });
    expect(folderRowSchema.safeParse({ path: 1, lastModified: 2 }).error?.issues[0].path).toEqual(['path']);
  });
});
