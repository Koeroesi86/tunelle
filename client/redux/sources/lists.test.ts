import { describe, expect, it } from 'vitest';
import type { SourceBrowse, SourceServerInfo } from '@shared/schemas/sources';
import { pageSize } from '../../constants/library';
import { listKey, markListsStale, noSourceLists, pageRequest, storeAnswer } from './lists';

const serverId = '5f6a1c1e-7d1c-4c3e-9d3b-2f7a7f0a1b11';
const servers: SourceServerInfo[] = [{ id: serverId, kind: 'jellyfin', name: 'Home', url: 'http://home', username: 'a', protected: true }];
const library = (start: number): SourceBrowse => ({ what: 'library', serverId, kind: 'albums', sort: 'recent', start, size: pageSize });
const album = (id: string) => ({ id, title: `Title ${id}`, artist: 'A', year: '2020' });
const albums = (count: number, from = 0) => Array.from({ length: count }, (_, index) => album(`a${from + index}`));

describe('the lists of a source', () => {
  it('has one key for every page of a library list and one for each other request', () => {
    expect(listKey(library(0))).toBe(listKey(library(pageSize)));
    expect(listKey({ what: 'albums', serverId, id: 'x' })).not.toBe(listKey({ what: 'albums', serverId, id: 'y' }));
  });

  it('asks for the page of a library list by its position and for the others as they are', () => {
    expect(pageRequest(library(0), 2)).toMatchObject({ start: 2 * pageSize, size: pageSize });
    expect(pageRequest({ what: 'tracks', serverId, id: 'x' }, 2)).toEqual({ what: 'tracks', serverId, id: 'x' });
  });

  it('puts a page with its total into the albums, as the tiles show them', () => {
    const lists = storeAnswer(noSourceLists, servers, library(0), { total: 250, items: albums(pageSize) });
    const cache = lists.albums[listKey(library(0))];

    expect(cache.total).toBe(250);
    expect(cache.pages[0]).toHaveLength(pageSize);
    expect(cache.pages[0][0]).toMatchObject({ id: 'a0', path: `jellyfin:${serverId}:a0`, title: 'Title a0' });
  });

  it('asks for one more item while a server that tells no total sends full pages, and ends the list at a short page', () => {
    const first = storeAnswer(noSourceLists, servers, library(0), { items: albums(pageSize) });
    expect(first.albums[listKey(library(0))].total).toBe(pageSize + 1);

    const last = storeAnswer(first, servers, library(pageSize), { items: albums(3, pageSize) });
    expect(last.albums[listKey(library(0))].total).toBe(pageSize + 3);
  });

  it('cuts an answer that is not in pages into the pages of the views', () => {
    const request: SourceBrowse = { what: 'albums', serverId, id: 'artist' };
    const cache = storeAnswer(noSourceLists, servers, request, albums(pageSize + 5)).albums[listKey(request)];

    expect(cache.total).toBe(pageSize + 5);
    expect(cache.pages[1]).toHaveLength(5);
  });

  it('keeps an empty answer as an empty list, which is not a list that is still loading', () => {
    const request: SourceBrowse = { what: 'tracks', serverId, id: 'album' };

    expect(storeAnswer(noSourceLists, servers, request, []).tracks[listKey(request)]).toMatchObject({ total: 0, pages: { 0: [] } });
  });

  it('fills the three lists from a search', () => {
    const request: SourceBrowse = { what: 'search', serverId, query: 'halo' };
    const lists = storeAnswer(noSourceLists, servers, request, { artists: [{ id: 'r1', name: 'Halo' }], albums: albums(2), tracks: [] });
    const key = listKey(request);

    expect([lists.artists[key].total, lists.albums[key].total, lists.tracks[key].total]).toEqual([1, 2, 0]);
  });

  it('ignores the answer of a server that is not known, and a request that failed', () => {
    expect(storeAnswer(noSourceLists, [], library(0), { items: albums(1) })).toBe(noSourceLists);
    expect(storeAnswer(noSourceLists, servers, library(0), undefined)).toBe(noSourceLists);
  });

  it('marks every page stale', () => {
    const lists = storeAnswer(noSourceLists, servers, library(0), { total: 3, items: albums(3) });

    expect(markListsStale(lists).albums[listKey(library(0))].stale).toEqual([0]);
  });
});
