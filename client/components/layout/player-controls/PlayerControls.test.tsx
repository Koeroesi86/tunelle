import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Track } from '@shared/types/library';
import { toRadioTrack } from '../../../domain/radio-track';
import PlayerControls from './PlayerControls';

vi.mock('../../ui/live-shimmer', () => ({ default: () => null }));

const renderControls = (volume: number, currentSong: Track | null = null, currentTime = 0) => {
  const props = {
    currentSong,
    streamTitle: null,
    streamArt: null,
    currentTime,
    volume,
    shuffle: false,
    repeat: false,
    isPlaying: false,
    addPlayStatusListener: vi.fn(),
    addPlayFailureListener: vi.fn(),
    addTimeChangeListener: vi.fn(),
    seek: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    setCurrentTime: vi.fn(),
    setPlaying: vi.fn(),
    setVolume: vi.fn(),
    openEqualizer: vi.fn(),
    openNowPlaying: vi.fn(),
    toggleRepeat: vi.fn(),
    toggleShuffle: vi.fn(),
    nextSong: vi.fn(),
    previousSong: vi.fn(),
    upNext: null,
    followTrack: vi.fn(),
    leaveRemoteHost: vi.fn(),
  };
  const view = render(<PlayerControls {...props} />);
  return { ...view, props, rerenderWithVolume: (next: number) => view.rerender(<PlayerControls {...props} volume={next} />) };
};

describe('PlayerControls', () => {
  it('says in an alert that a track does not play, and stops saying it with the next track', () => {
    const song: Track = {
      ...toRadioTrack({ uuid: 'u9', name: 'Jazz FM', country: '', tags: [], codec: 'MP3', bitrate: 128 }),
      path: '/music/a.flac',
      duration: 10,
    };
    const { props, rerender } = renderControls(0.5, song);
    expect(screen.getByRole('alert').textContent).toBe('');

    act(() => props.addPlayFailureListener.mock.calls[0][0]());
    expect(screen.getByRole('alert').textContent).toBe('Could not play this track');

    rerender(<PlayerControls {...props} currentSong={{ ...song, path: '/music/b.flac' }} />);
    expect(screen.getByRole('alert').textContent).toBe('');
  });

  it('shows the format of a station', () => {
    renderControls(0.5, toRadioTrack({ uuid: 'u1', name: 'Jazz FM', country: '', tags: [], codec: 'MP3', bitrate: 128 }));

    expect(screen.getByText('MP3 128')).toBeTruthy();
  });

  it('shows the elapsed and the total time at the two ends of the seek bar', () => {
    const song: Track = {
      ...toRadioTrack({ uuid: 'u2', name: 'Teardrop', country: '', tags: [], codec: 'FLAC', bitrate: 0 }),
      path: '/music/teardrop.flac',
      duration: 180,
    };
    const { container } = renderControls(0.5, song, 65);

    const seek = container.querySelector('input[type="range"]')?.parentElement?.parentElement?.parentElement;
    expect(seek?.firstElementChild?.textContent).toBe('00:01:05');
    expect(seek?.lastElementChild?.textContent).toBe('00:03:00');
  });

  it('replaces the seek bar of a station with the live row', () => {
    const { container } = renderControls(0.5, toRadioTrack({ uuid: 'u3', name: 'Jazz FM', country: '', tags: [], codec: 'MP3', bitrate: 128 }), 754);

    expect(screen.getByText('Live')).toBeTruthy();
    expect(container.querySelectorAll('input[type="range"]')).toHaveLength(1);
    expect(screen.getByText('00:12:34')).toBeTruthy();
  });

  it('keeps the play button in the middle of the transport buttons, so it sits under the middle of the seek bar', () => {
    renderControls(0.5);

    const buttons = Array.from(screen.getByRole('button', { name: 'Play' }).parentElement?.children ?? []);
    expect(buttons.map((button) => button.getAttribute('title'))).toEqual(['Shuffle', 'Previous', 'Play', 'Next', 'Repeat']);
  });

  it('keeps the play button disabled until there is a track', () => {
    renderControls(0.5);

    expect((screen.getByRole('button', { name: 'Play' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('mutes and restores the previous volume', () => {
    const { props, rerenderWithVolume } = renderControls(0.7);

    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    expect(props.setVolume).toHaveBeenLastCalledWith(0);

    rerenderWithVolume(0);
    fireEvent.click(screen.getByRole('button', { name: 'Unmute' }));
    expect(props.setVolume).toHaveBeenLastCalledWith(0.7);
  });

  it('sets the full volume and opens the equalizer from labelled buttons', () => {
    const { props } = renderControls(0.2);

    fireEvent.click(screen.getByRole('button', { name: 'Full volume' }));
    fireEvent.click(screen.getByRole('button', { name: 'Equalizer' }));

    expect(props.setVolume).toHaveBeenCalledWith(1);
    expect(props.openEqualizer).toHaveBeenCalled();
  });

  it('names the host that it listens to, with a button that leaves it, and shows neither otherwise', () => {
    const { props, rerender } = renderControls(0.5);
    expect(screen.queryByText('Listening to Kitchen')).toBeNull();

    rerender(<PlayerControls {...props} hostName="Kitchen" />);
    fireEvent.click(screen.getByRole('button', { name: 'Stop listening' }));

    expect(screen.getByText('Listening to Kitchen')).toBeTruthy();
    expect(props.leaveRemoteHost).toHaveBeenCalledTimes(1);
  });

  it('opens the page of what plays from the track, which is the way from the mini player to the full view', () => {
    const { props } = renderControls(0.5);

    fireEvent.click(screen.getByRole('button', { name: /^Open now playing/ }));

    expect(props.openNowPlaying).toHaveBeenCalledTimes(1);
  });

  it('marks the shuffle and repeat buttons as the ones the mini player drops', () => {
    renderControls(0.5);

    const secondary = Array.from(document.querySelectorAll('.secondary')).map((button) => button.getAttribute('title'));
    expect(secondary).toEqual(['Shuffle', 'Repeat']);
  });

  it('names every button and slider, and says what the toggles and the sliders are at', () => {
    const song: Track = {
      ...toRadioTrack({ uuid: 'u4', name: 'Teardrop', country: '', tags: [], codec: 'FLAC', bitrate: 0 }),
      path: '/music/teardrop.flac',
      duration: 180,
    };
    renderControls(0.5, song, 65);

    const unnamed = screen.getAllByRole('button').filter((button) => !button.getAttribute('aria-label') && !button.textContent);
    expect(unnamed).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Shuffle' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Repeat' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('slider', { name: 'Seek' }).getAttribute('aria-valuetext')).toBe('00:01:05 / 00:03:00');
    expect(screen.getByRole('slider', { name: 'Volume' }).getAttribute('aria-valuetext')).toBe('50%');
  });

  it('announces the track that plays in a polite status', () => {
    const song: Track = {
      ...toRadioTrack({ uuid: 'u5', name: 'Teardrop', country: '', tags: [], codec: 'FLAC', bitrate: 0 }),
      path: '/music/teardrop.flac',
      title: 'Teardrop',
      artist: 'Massive Attack',
    };
    renderControls(0.5, song);

    expect(screen.getByRole('status').textContent).toBe('Now playing: Teardrop by Massive Attack');
  });

  const song: Track = {
    ...toRadioTrack({ uuid: 'u6', name: 'Teardrop', country: '', tags: [], codec: 'FLAC', bitrate: 0 }),
    path: '/music/teardrop.flac',
    duration: 180,
  };

  it('shows that nothing plays, with an empty seek bar', () => {
    renderControls(0.5);

    expect(screen.getAllByText('None')).toHaveLength(3);
    expect(screen.getByRole('slider', { name: 'Seek' }).getAttribute('aria-valuetext')).toBe('00:00:00 / 00:00:00');
  });

  it('offers to pause what plays, and shows the toggles that are on', () => {
    const { props, rerender } = renderControls(0, song);

    rerender(<PlayerControls {...props} isPlaying shuffle repeat />);
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    expect(props.pause).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Shuffle' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Repeat' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeTruthy();
  });

  it('moves the position and the volume with their sliders', () => {
    const { props } = renderControls(0.5, song);

    fireEvent.input(screen.getByRole('slider', { name: 'Seek' }), { target: { value: '30' } });
    fireEvent.input(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '0.2' } });

    expect(props.setCurrentTime).toHaveBeenCalledWith(30);
    expect(props.setVolume).toHaveBeenCalledWith('0.2');
  });

  it('follows the audio when it starts or stops by itself', () => {
    const { props } = renderControls(0.5, song);
    const report = props.addPlayStatusListener.mock.calls[0][0];

    act(() => report(false));
    expect(props.setPlaying).not.toHaveBeenCalled();
    act(() => report(true));

    expect(props.setPlaying).toHaveBeenCalledWith(true);
  });

  it('takes over the position of the audio once it moved by a hundredth of a second', () => {
    const { props } = renderControls(0.5, song, 10);
    const report = props.addTimeChangeListener.mock.calls[0][0];

    act(() => report(10.001));
    expect(props.setCurrentTime).not.toHaveBeenCalled();
    act(() => report(10.5));

    expect(props.setCurrentTime).toHaveBeenCalledWith(10.5);
  });

  it('seeks, plays and pauses the audio as the state changes, and plays the next track of what plays', () => {
    const { props, rerender } = renderControls(0.5, song);

    rerender(<PlayerControls {...props} currentTime={20} />);
    expect(props.seek).toHaveBeenCalledWith(20);
    rerender(<PlayerControls {...props} currentTime={20} isPlaying />);
    expect(props.play).toHaveBeenCalledTimes(1);
    rerender(<PlayerControls {...props} currentTime={20} isPlaying currentSong={{ ...song, path: '/music/next.flac' }} />);
    expect(props.play).toHaveBeenCalledTimes(2);
    rerender(<PlayerControls {...props} currentTime={20} currentSong={{ ...song, path: '/music/next.flac' }} />);

    expect(props.pause).toHaveBeenCalledTimes(1);
  });

  it('starts nothing for a track that is loaded while paused', () => {
    const { props, rerender } = renderControls(0.5, song);

    rerender(<PlayerControls {...props} currentSong={{ ...song, path: '/music/next.flac' }} />);

    expect(props.play).not.toHaveBeenCalled();
  });

  it('plays with the space bar only while a track is loaded', () => {
    const { props, rerender } = renderControls(0.5);

    fireEvent.keyDown(window, { key: ' ' });
    expect(props.play).not.toHaveBeenCalled();
    rerender(<PlayerControls {...props} currentSong={song} />);
    fireEvent.keyDown(window, { key: ' ' });

    expect(props.play).toHaveBeenCalled();
  });

  it('leaves the host from the button that names it', () => {
    const { props, rerender } = renderControls(0.5);

    rerender(<PlayerControls {...props} hostName="Desk" />);
    fireEvent.click(screen.getByRole('button', { name: 'Stop listening' }));

    expect(props.leaveRemoteHost).toHaveBeenCalled();
  });
});
