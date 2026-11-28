import { describe, expect, it, vi } from 'vitest';
import { propsOf, renderContainer } from '../../../test/render-container';
import View from './PlayerIntegrations';
import Container from './index';

const audio = vi.hoisted(() => ({ play: vi.fn(), pause: vi.fn() }));

vi.mock('./PlayerIntegrations', () => ({ default: vi.fn(() => null) }));
vi.mock('../../../audio/context', async () => ({ Audio: (await import('react')).createContext(audio) }));

describe('the container of PlayerIntegrations', () => {
  it('gives what is played, with play and pause of the audio', () => {
    const { store } = renderContainer(<Container />);
    const { isPlaying, volume, currentTime, currentSong, upNext, streamTitle, streamArt } = store.getState().uiState;

    expect(propsOf(View)).toMatchObject({ isPlaying, volume, currentTime, currentSong, upNext, streamTitle, streamArt, ...audio });
  });

  it('sends what the system and the listeners ask for', () => {
    const { sent } = renderContainer(<Container />);
    const { setCurrentTime, setVolume, nextSong, previousSong } = propsOf(View);

    setCurrentTime(7);
    setVolume(0.5);
    nextSong();
    previousSong();

    expect(sent()).toEqual([
      { type: 'SET_CURRENT_TIME', payload: { currentTime: 7 } },
      { type: 'SET_VOLUME', payload: { volume: 0.5 } },
      { type: 'NEXT_SONG', payload: {} },
      { type: 'PREVIOUS_SONG', payload: {} },
    ]);
  });
});
