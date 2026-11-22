import { describe, expect, it } from 'vitest';
import type { SourceBrowse } from '@shared/schemas/sources';
import { browseKey } from '../../domain/source-library';
import reducer from './reducer';
import { listKey } from './lists';

const serverId = '5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11';
const request: SourceBrowse = { what: 'artists', serverId };
const start = reducer(undefined, { type: 'unknown' });

describe('the sources reducer', () => {
  it('is saving until the servers or a failure arrive', () => {
    const saving = reducer(start, { type: 'SAVE_SOURCE_SERVER', payload: { server: {} } });
    expect(saving.saving).toBe(true);
    expect(reducer(saving, { type: 'SOURCE_SERVER_FAILED', payload: { error: 'no' } })).toMatchObject({ saving: false, failure: { error: 'no' } });
    expect(reducer(saving, { type: 'SOURCE_SERVERS_LOADED', payload: { servers: [] } })).toMatchObject({ saving: false, failure: undefined });
  });

  it('keeps a certificate to approve until it is cleared or the server is kept', () => {
    const read = reducer(start, { type: 'SOURCE_CERTIFICATE_READ', payload: { url: 'https://a', certificate: 'PEM', code: 'AB12' } });
    expect(read.certificate?.code).toBe('AB12');
    expect(reducer(read, { type: 'CLEAR_SOURCE_CERTIFICATE' }).certificate).toBeUndefined();
    expect(reducer(read, { type: 'SOURCE_SERVERS_LOADED', payload: { servers: [] } }).certificate).toBeUndefined();
  });

  it('keeps the failure of a request until it is asked again, and the answer as a list', () => {
    const failed = reducer(start, { type: 'SOURCE_BROWSED', payload: { request, error: 'down' } });
    expect(failed.browsed[browseKey(request)]).toEqual({ error: 'down' });
    expect(reducer(failed, { type: 'BROWSE_SOURCE', payload: { request } }).browsed[browseKey(request)]).toBeUndefined();
  });

  it('marks the lists out of date when the servers are loaded again', () => {
    const server = { id: serverId, kind: 'subsonic' as const, name: 'Home', url: 'http://home', username: 'a', protected: true };
    const loaded = reducer(start, { type: 'SOURCE_SERVERS_LOADED', payload: { servers: [server] } });
    const answered = reducer(loaded, { type: 'SOURCE_BROWSED', payload: { request, result: [{ id: 'a1', name: 'Halo' }] } });
    const key = listKey(request);
    expect(answered.lists.artists[key].stale).toEqual([]);
    expect(reducer(answered, { type: 'SOURCE_SERVERS_LOADED', payload: { servers: [server] } }).lists.artists[key].stale).toEqual([0]);
  });

  it('is searching the network until the servers that answered arrive', () => {
    const searching = reducer(start, { type: 'DISCOVER_SOURCE_SERVERS' });
    expect(searching.discovery).toEqual({ searching: true, servers: [] });

    const servers = [{ id: 'x', name: 'Film room', url: 'http://192.168.1.5:8096' }];
    expect(reducer(searching, { type: 'SOURCE_SERVERS_DISCOVERED', payload: { servers } }).discovery).toEqual({ searching: false, servers });
    expect(reducer(searching, { type: 'SOURCE_SERVERS_DISCOVERED', payload: { servers: [], error: 'no' } }).discovery).toEqual({
      searching: false,
      servers: [],
      error: 'no',
    });
  });
});
