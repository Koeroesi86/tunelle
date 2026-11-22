import { describe, expect, it } from 'vitest';
import type { SourceBrowse } from '@shared/schemas/sources';
import { pageSize } from '../constants/library';
import { browseKey, pageRequest, toAlbumSummary, toGroupSummary } from './source-library';

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

describe('the requests of a list', () => {
  const library: SourceBrowse = { what: 'library', serverId, kind: 'albums', sort: 'recent', start: 0, size: pageSize };

  it('asks for the page of a library list by its position and for the others as they are', () => {
    expect(pageRequest(library, 2)).toMatchObject({ start: 2 * pageSize, size: pageSize });
    expect(pageRequest({ what: 'tracks', serverId, id: 'x' }, 2)).toEqual({ what: 'tracks', serverId, id: 'x' });
  });

  it('keys a request by what it asks for', () => {
    expect(browseKey(library)).not.toBe(browseKey(pageRequest(library, 1)));
  });
});
