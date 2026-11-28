import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSourceTracks } from '../../../services/source-tracks';
import View from '../../../components/library/add-to-playlist/AddToPlaylist';
import { aTrack } from '../../../test/a-track';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/library/add-to-playlist/AddToPlaylist', () => ({ default: vi.fn(() => null) }));
vi.mock('../../../services/source-tracks', () => ({ getSourceTracks: vi.fn() }));

describe('the container of AddToPlaylist', () => {
  const source = aTrack();
  const tracks = [source];

  beforeEach(() => {
    vi.mocked(getSourceTracks).mockReset().mockResolvedValue(tracks);
  });

  it('adds to a playlist, or makes one, once the tracks of the source are there', async () => {
    const { sent } = renderContainer(<Container source={source} />);
    const { add, create } = propsOf(View);

    await add(3, source);
    await create('Mix', source);

    expect(getSourceTracks).toHaveBeenCalledWith(source);
    expect(sent()).toEqual([
      { type: 'ADD_TO_PLAYLIST', payload: { id: 3, tracks } },
      { type: 'CREATE_PLAYLIST', payload: { name: 'Mix', tracks } },
    ]);
  });

  it('sends nothing and logs the error when the tracks can not be fetched', async () => {
    const error = new Error('offline');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(getSourceTracks).mockRejectedValue(error);
    const { sent } = renderContainer(<Container source={source} />);

    await propsOf(View).add(3, source);
    await propsOf(View).create('Mix', source);

    expect(log.mock.calls).toEqual([[error], [error]]);
    expect(sent()).toEqual([]);
  });
});
