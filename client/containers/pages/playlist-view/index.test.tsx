import { describe, expect, it, vi } from 'vitest';
import { aTrack } from '../../../test/a-track';
import View from '../../../components/pages/playlist-view/PlaylistView';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/pages/playlist-view/PlaylistView', () => ({ default: vi.fn(() => null) }));

describe('the container of PlaylistView', () => {
  const mix = { id: 3, name: 'Mix', position: 0, entries: [] };

  it.each([
    { playlistId: 3, playlist: mix },
    { playlistId: 4, playlist: undefined },
  ])('shows the open playlist, if there is one: $playlistId', ({ playlistId, playlist }) => {
    renderContainer(<Container />, (state) => ({ ...state, playlists: [mix], uiState: { ...state.uiState, playlistId } }));

    expect(propsOf(View).playlist).toEqual(playlist);
  });

  it('plays and queues its tracks', () => {
    const tracks = [aTrack()];
    const { sent } = renderContainer(<Container />);
    const { playTracks, addToQueue } = propsOf(View);

    playTracks(tracks);
    addToQueue(tracks, false);
    addToQueue(tracks, true);

    expect(sent()).toEqual([
      { type: 'PLAY_TRACKS', payload: { tracks } },
      { type: 'ADD_TO_QUEUE', payload: { tracks } },
      { type: 'PLAY_NEXT', payload: { tracks } },
    ]);
  });

  it('sends the changes of a playlist', () => {
    const { sent } = renderContainer(<Container />);
    const { rename, remove, exportPlaylist, setSync, setEncoding, undoImport, removeEntry, moveEntry } = propsOf(View);

    rename(3, 'Evening');
    remove(3, true);
    exportPlaylist(3);
    setSync(3, true);
    setEncoding(3, 'utf-8');
    undoImport(3);
    removeEntry(3, 8);
    moveEntry(3, 8, 0);

    expect(sent()).toEqual([
      { type: 'RENAME_PLAYLIST', payload: { id: 3, name: 'Evening' } },
      { type: 'DELETE_PLAYLIST', payload: { id: 3, deleteFile: true } },
      { type: 'EXPORT_PLAYLIST', payload: { id: 3 } },
      { type: 'SYNC_PLAYLIST_FILE', payload: { id: 3, sync: true } },
      { type: 'SET_PLAYLIST_ENCODING', payload: { id: 3, encoding: 'utf-8' } },
      { type: 'UNDO_PLAYLIST_IMPORT', payload: { id: 3 } },
      { type: 'REMOVE_FROM_PLAYLIST', payload: { id: 3, entryId: 8 } },
      { type: 'MOVE_PLAYLIST_ENTRY', payload: { id: 3, entryId: 8, toIndex: 0 } },
    ]);
  });
});
