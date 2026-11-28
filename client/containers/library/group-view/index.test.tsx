import { describe, expect, it, vi } from 'vitest';
import { fetchGroupTracks } from '../../../services/group-tracks';
import View from '../../../components/library/group-view/GroupView';
import { aTrack } from '../../../test/a-track';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

const { renderGroupAlbums, localGroupParts } = vi.hoisted(() => ({ renderGroupAlbums: vi.fn(), localGroupParts: vi.fn() }));

vi.mock('../../../components/library/group-view/GroupView', () => ({ default: vi.fn(() => null) }));
vi.mock('../local-group', () => ({ renderGroupAlbums, localGroupParts }));
vi.mock('../../../services/group-tracks', () => ({ fetchGroupTracks: vi.fn() }));

describe('the container of GroupView', () => {
  const artist = { kind: 'artist' as const, key: 'bach', name: 'Bach' };

  it.each([
    { kind: 'artist' as const, open: artist },
    { kind: 'genre' as const, open: undefined },
  ])('lists the groups of the kind $kind and shows only an open group of that kind', ({ kind, open }) => {
    const { store } = renderContainer(<Container kind={kind} />, (state) => ({ ...state, uiState: { ...state.uiState, openGroup: artist } }));
    const { library, uiState, folders } = store.getState();

    expect(propsOf(View)).toMatchObject({ groups: library.groups[kind], sort: uiState.groupSort, filter: uiState.groupFilter, coverSize: uiState.coverSize });
    expect(propsOf(View)).toMatchObject({ selected: uiState.libraryFolders, folders, fetchTracks: fetchGroupTracks, renderAlbums: renderGroupAlbums });
    expect(propsOf(View).open).toEqual(open);
    expect(propsOf(View).renderOpenParts).toBe(localGroupParts);
  });

  it('asks for pages, opens and closes a group and plays tracks', () => {
    const tracks = [aTrack({ path: '/music/a.flac' })];
    const { sent } = renderContainer(<Container kind="artist" />);
    const { loadPage, setCoverSize, openGroup, closeGroup, playTracks } = propsOf(View);

    loadPage(1);
    setCoverSize(240);
    openGroup(artist);
    closeGroup();
    playTracks(tracks);

    expect(sent()).toEqual([
      { type: 'LOAD_LIBRARY_PAGE', payload: { kind: 'artist', page: 1 } },
      { type: 'SET_COVER_SIZE', payload: { size: 240 } },
      { type: 'OPEN_GROUP', payload: { group: artist } },
      { type: 'CLOSE_GROUP', payload: {} },
      { type: 'PLAY_TRACKS', payload: { tracks } },
    ]);
  });
});
