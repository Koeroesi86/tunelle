import { describe, expect, it, vi } from 'vitest';
import { aTrack } from '../../../test/a-track';
import { renderFavourite } from '../../ui/render-favourite';
import LoudnessPanel from '../../ui/loudness-panel';
import View from '../../../components/pages/now-playing/NowPlaying';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

vi.mock('../../../components/pages/now-playing/NowPlaying', () => ({ default: vi.fn(() => null) }));
vi.mock('../../ui/render-favourite', () => ({ renderFavourite: vi.fn() }));
vi.mock('../../ui/loudness-panel', () => ({
  default: function LoudnessPanel() {
    return null;
  },
}));

describe('the container of NowPlaying', () => {
  it('shows what is played, also of a radio station', () => {
    const { store } = renderContainer(<Container />);
    const { uiState, radio } = store.getState();
    const { streamTitle, streamArt, streamSampleRate, isPlaying, currentSong, nowPlaying } = uiState;

    expect(propsOf(View)).toMatchObject({
      streamTitle,
      streamArt,
      streamSampleRate,
      isPlaying,
      currentSong,
      nowPlaying,
      station: radio.playing,
      renderFavourite,
    });
  });

  it('draws the loudness of a track', () => {
    renderContainer(<Container />);
    const track = { path: '/music/a.flac', duration: 1, sampleRate: 44100 };

    expect(propsOf(View).renderLoudness(track)).toEqual(<LoudnessPanel {...track} />);
  });

  it('changes the queue and opens the library', () => {
    const track = aTrack();
    const { sent } = renderContainer(<Container />);
    const { playTrack, moveTrack, removeTrack, clearQueue, openLibrary } = propsOf(View);

    playTrack(track);
    moveTrack(1, 0);
    removeTrack(1);
    clearQueue();
    openLibrary();

    expect(sent()).toEqual([
      { type: 'FORCE_PLAY_TRACK', payload: { track } },
      { type: 'MOVE_QUEUE_TRACK', payload: { from: 1, to: 0 } },
      { type: 'REMOVE_FROM_QUEUE', payload: { index: 1 } },
      { type: 'CLEAR_QUEUE', payload: {} },
      { type: 'SET_TAB', payload: { tab: 'local' } },
    ]);
  });
});
