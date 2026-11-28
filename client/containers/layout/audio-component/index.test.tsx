import { describe, expect, it, vi } from 'vitest';
import { fetchTrackFormat } from '../../../services/library-api';
import View from '../../../components/layout/audio-component/AudioComponent';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

const audio = vi.hoisted(() => ({
  connectNode: vi.fn(),
  connectStandbyNode: vi.fn(),
  activateNode: vi.fn(),
  setNormalization: vi.fn(),
  setOutputDevice: vi.fn(),
  addOutputChangeListener: vi.fn(),
  removeOutputChangeListener: vi.fn(),
}));

vi.mock('../../../components/layout/audio-component/AudioComponent', () => ({ default: vi.fn(() => null) }));
vi.mock('../../../audio/context', async () => ({ Audio: (await import('react')).createContext(audio) }));
vi.mock('../../../services/library-api', () => ({ fetchTrackFormat: vi.fn() }));

describe('the container of AudioComponent', () => {
  it.each([
    { isPlaying: true, pausedAt: undefined },
    { isPlaying: false, pausedAt: 42 },
  ])('gives the position only while it does not play: $isPlaying', ({ isPlaying, pausedAt }) => {
    renderContainer(<Container />, (state) => ({ ...state, uiState: { ...state.uiState, isPlaying, currentTime: 42 } }));

    expect(propsOf(View).pausedAt).toBe(pausedAt);
  });

  it('gives what is played and how, with the audio of the app', () => {
    const { store } = renderContainer(<Container />);
    const { currentSong, upNext, loudnessStatus, volume, normalization, outputDevice, outputDevices } = store.getState().uiState;

    expect(propsOf(View)).toMatchObject({ currentSong, upNext, loudnessStatus, volume, normalization, outputDevice, devices: outputDevices });
    expect(propsOf(View)).toMatchObject({ ...audio, readFormat: fetchTrackFormat });
  });

  it('reports the end of a track, a stop and the position to keep', () => {
    const { sent } = renderContainer(<Container />);
    const { trackEnded, stopPlaying, keepPosition } = propsOf(View);

    trackEnded();
    stopPlaying();
    keepPosition(7);

    expect(sent()).toEqual([
      { type: 'TRACK_ENDED', payload: {} },
      { type: 'SET_PLAYING', payload: { isPlaying: false } },
      { type: 'KEEP_POSITION', payload: { currentTime: 7 } },
    ]);
  });
});
