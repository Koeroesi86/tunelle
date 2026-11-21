import { describe, expect, it } from 'vitest';
import { toAlbumSummary, toGroupSummary } from './source-library';

const serverId = '5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11';

describe('the library of a server as tiles', () => {
  it('turns an album into a summary whose cover is the path of the cover on the server', () => {
    expect(toAlbumSummary('plex', serverId, { id: '7', title: 'First', artist: 'Band', year: '1999', songCount: 9, coverArt: '7' })).toMatchObject({
      id: '7',
      path: `plex:${serverId}:7`,
      cover: `plex:${serverId}:7`,
      trackCount: 9,
      duration: null,
    });
  });

  it('has no cover and no count where the server tells none', () => {
    expect(toAlbumSummary('subsonic', serverId, { id: '7', title: 'First', artist: '', year: '' })).toMatchObject({ cover: null, trackCount: 0 });
    expect(toGroupSummary('subsonic', serverId, { id: 'a', name: 'Band' })).toMatchObject({
      key: 'a',
      name: 'Band',
      cover: null,
      albumCount: 0,
      trackCount: 0,
    });
  });
});
