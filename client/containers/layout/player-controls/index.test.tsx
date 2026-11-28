import { describe, expect, it, vi } from 'vitest';
import { createStore } from 'redux';
import reducers from '../../../redux/reducers';
import { hostNameOf } from '../../../domain/remote-host-name';
import { aTrack } from '../../../test/a-track';
import View from '../../../components/layout/player-controls/PlayerControls';
import { propsOf, renderContainer } from '../../../test/render-container';
import Container from './index';

const audio = vi.hoisted(() => ({
  addPlayStatusListener: vi.fn(),
  addPlayFailureListener: vi.fn(),
  play: vi.fn(),
  pause: vi.fn(),
  seek: vi.fn(),
  addTimeChangeListener: vi.fn(),
}));

vi.mock('../../../components/layout/player-controls/PlayerControls', () => ({ default: vi.fn(() => null) }));
vi.mock('../../../audio/context', async () => ({ Audio: (await import('react')).createContext(audio) }));

describe('the container of PlayerControls', () => {
  const track = aTrack();
  const nowPlaying = { state: 'idle' as const };
  const target = { host: 'desk.local', port: 4000 };

  it('gives what is played and how, with the audio of the app', () => {
    const { store } = renderContainer(<Container />);
    const { isPlaying, volume, shuffle, repeat, currentTime, currentSong, upNext, streamTitle, streamArt } = store.getState().uiState;

    expect(propsOf(View)).toMatchObject({ isPlaying, volume, shuffle, repeat, currentTime, currentSong, upNext, streamTitle, streamArt, ...audio });
    expect(propsOf(View).hostNowPlaying).toBeUndefined();
  });

  it.each([
    { status: 'listening' as const, hostNowPlaying: nowPlaying },
    { status: 'waiting' as const, hostNowPlaying: undefined },
  ])('gives what the host plays only while listening: $status', ({ status, hostNowPlaying }) => {
    renderContainer(<Container />, (state) => ({ ...state, uiState: { ...state.uiState, remoteListener: { status, target, nowPlaying } } }));

    expect(propsOf(View).hostNowPlaying).toEqual(hostNowPlaying);
    expect(propsOf(View).hostName).toBe(hostNameOf({ ...createStore(reducers).getState().uiState, remoteListener: { status, target, nowPlaying } }));
  });

  it('plays the track of a host as the only one of the queue, and leaves the host', () => {
    const { sent } = renderContainer(<Container />);
    const { followTrack, leaveRemoteHost } = propsOf(View);

    followTrack(track);
    leaveRemoteHost();

    expect(sent()).toEqual([{ type: 'PLAY_TRACKS', payload: { tracks: [track] } }, { type: 'PLAY_TRACK', payload: { track } }, { type: 'LEAVE_REMOTE_HOST' }]);
  });

  it('sends what the buttons of the player ask for', () => {
    const { sent } = renderContainer(<Container />);
    const { setPlaying, setVolume, setCurrentTime, toggleRepeat, toggleShuffle, nextSong, previousSong, openEqualizer, openNowPlaying } = propsOf(View);

    setPlaying(true);
    setVolume(0.5);
    setCurrentTime(7);
    toggleRepeat();
    toggleShuffle();
    nextSong();
    previousSong();
    openEqualizer();
    openNowPlaying();

    expect(sent()).toEqual([
      { type: 'SET_PLAYING', payload: { isPlaying: true } },
      { type: 'SET_VOLUME', payload: { volume: 0.5 } },
      { type: 'SET_CURRENT_TIME', payload: { currentTime: 7 } },
      { type: 'TOGGLE_REPEAT', payload: {} },
      { type: 'TOGGLE_SHUFFLE', payload: {} },
      { type: 'NEXT_SONG', payload: {} },
      { type: 'PREVIOUS_SONG', payload: {} },
      { type: 'SET_TAB', payload: { tab: 'equalizer' } },
      { type: 'SET_TAB', payload: { tab: 'now-playing' } },
    ]);
  });
});
