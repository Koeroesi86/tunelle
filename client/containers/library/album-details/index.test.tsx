import { describe, expect, it, vi } from 'vitest';
import View from '../../../components/library/album-details/AlbumDetails';
import { aTrack } from '../../../test/a-track';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

const { albumDetailsActions, albumCoverMenu } = vi.hoisted(() => ({ albumDetailsActions: vi.fn(), albumCoverMenu: vi.fn() }));

vi.mock('../../../components/library/album-details/AlbumDetails', () => ({ default: vi.fn(() => null) }));
vi.mock('../item-actions', () => ({ albumDetailsActions, albumCoverMenu }));

describe('the container of AlbumDetails', () => {
  it('shows the selected album with the actions of an album', () => {
    renderContainer(<Container />);

    expect(propsOf(View)).toMatchObject({ album: null, renderActions: albumDetailsActions, renderCoverMenu: albumCoverMenu });
  });

  it('plays and queues tracks and closes the album', () => {
    const tracks = [aTrack({ path: '/music/a.flac' })];
    const { sent } = renderContainer(<Container />);
    const { playTracks, addToQueue, close } = propsOf(View);

    playTracks(tracks);
    addToQueue(tracks, false);
    addToQueue(tracks, true);
    close();

    expect(sent()).toEqual([
      { type: 'PLAY_TRACKS', payload: { tracks } },
      { type: 'ADD_TO_QUEUE', payload: { tracks } },
      { type: 'PLAY_NEXT', payload: { tracks } },
      { type: 'SELECT_ALBUM', payload: { album: null } },
    ]);
  });
});
