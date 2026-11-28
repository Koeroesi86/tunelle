import { describe, expect, it, vi } from 'vitest';
import AlbumSort from '../../library/album-sort';
import AlbumView from '../../library/album-view';
import FolderFilter from '../../library/folder-filter';
import GroupFilter from '../../library/group-filter';
import GroupSort from '../../library/group-sort';
import GroupView from '../../library/group-view';
import LibrarySearch from '../../library/library-search';
import RescanButton from '../../library/rescan-button';
import TrackView from '../../library/track-view';
import FolderManagement from '../../settings/folder-management';
import View from '../../../components/pages/local-collection/LocalCollection';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/pages/local-collection/LocalCollection', () => ({ default: vi.fn(() => null) }));
vi.mock('../../library/album-sort', () => ({
  default: function AlbumSort() {
    return null;
  },
}));
vi.mock('../../library/album-view', () => ({
  default: function AlbumView() {
    return null;
  },
}));
vi.mock('../../library/folder-filter', () => ({
  default: function FolderFilter() {
    return null;
  },
}));
vi.mock('../../library/group-filter', () => ({
  default: function GroupFilter() {
    return null;
  },
}));
vi.mock('../../library/group-sort', () => ({
  default: function GroupSort() {
    return null;
  },
}));
vi.mock('../../library/group-view', () => ({
  default: function GroupView() {
    return null;
  },
}));
vi.mock('../../library/library-search', () => ({
  default: function LibrarySearch() {
    return null;
  },
}));
vi.mock('../../library/rescan-button', () => ({
  default: function RescanButton() {
    return null;
  },
}));
vi.mock('../../library/track-view', () => ({
  default: function TrackView() {
    return null;
  },
}));
vi.mock('../../settings/folder-management', () => ({
  default: function FolderManagement() {
    return null;
  },
}));

describe('the container of LocalCollection', () => {
  it.each([
    { openGroup: { kind: 'artist' as const, key: 'bach', name: 'Bach' }, groupOpen: true },
    { openGroup: undefined, groupOpen: false },
  ])('shows the view and whether a group is open: $groupOpen', ({ openGroup, groupOpen }) => {
    renderContainer(<Container addFiles={vi.fn()} />, (state) => ({ ...state, uiState: { ...state.uiState, view: 'genres', openGroup } }));

    expect(propsOf(View)).toMatchObject({ view: 'genres', groupOpen });
  });

  it('has a list for each view, and sends another view', () => {
    const { sent } = renderContainer(<Container addFiles={vi.fn()} />);
    const { panels, setView } = propsOf(View);

    setView('tracks');

    expect(panels).toEqual({
      albums: <AlbumView />,
      artists: <GroupView kind="artist" />,
      albumArtists: <GroupView kind="albumArtist" />,
      genres: <GroupView kind="genre" />,
      tracks: <TrackView />,
      folders: <FolderManagement />,
    });
    expect(sent()).toEqual([{ type: 'SET_VIEW', payload: { view: 'tracks' } }]);
  });

  it('has the controls of the lists', () => {
    renderContainer(<Container addFiles={vi.fn()} />);
    const { search, groupFilter, folderFilter, albumSort, groupSort, rescan } = propsOf(View).controls;

    expect([search, folderFilter, albumSort, groupSort, rescan]).toEqual([<LibrarySearch />, <FolderFilter />, <AlbumSort />, <GroupSort />, <RescanButton />]);
    expect(groupFilter('Artists')).toEqual(<GroupFilter label="Artists" />);
  });
});
