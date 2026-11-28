import { describe, expect, it, vi } from 'vitest';
import { aTrack } from '../../../test/a-track';
import { toRadioTrack } from '../../../domain/radio-track';
import { renderFavourite } from '../../ui/render-favourite';
import View from '../../../components/pages/radio-stations/RadioStations';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/pages/radio-stations/RadioStations', () => ({ default: vi.fn(() => null) }));
vi.mock('../../ui/render-favourite', () => ({ renderFavourite: vi.fn() }));

describe('the container of RadioStations', () => {
  const station = { uuid: 'abc', name: 'Jazz FM', country: 'Hungary', tags: [], codec: 'MP3', bitrate: 128 };

  it.each([
    { playing: 'a station', currentSong: toRadioTrack(station), currentStation: 'abc' },
    { playing: 'a file', currentSong: aTrack(), currentStation: undefined },
    { playing: 'nothing', currentSong: null, currentStation: undefined },
  ])('marks the station that is played, with $playing', ({ currentSong, currentStation }) => {
    const { store } = renderContainer(<Container />, (state) => ({ ...state, uiState: { ...state.uiState, currentSong } }));

    expect(propsOf(View)).toMatchObject({ radio: store.getState().radio, renderFavourite });
    expect(propsOf(View).currentStation).toBe(currentStation);
  });

  it('searches, loads the choices of a search and plays a station', () => {
    const { sent } = renderContainer(<Container />);
    const { search, loadTags, loadOptions, play } = propsOf(View);

    search({});
    loadTags();
    loadOptions();
    play(station);

    expect(sent()).toEqual([
      { type: 'SEARCH_RADIO', payload: { query: {} } },
      { type: 'LOAD_RADIO_TAGS', payload: {} },
      { type: 'LOAD_RADIO_OPTIONS', payload: {} },
      { type: 'PLAY_RADIO_STATION', payload: { station } },
    ]);
  });
});
