import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Track } from '@shared/types/library';
import { toRadioTrack } from '../../domain/radio-track';
import PlayerControls from './PlayerControls';

vi.mock('../live-shimmer', () => ({ default: () => null }));

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
    addTimeChangeListener: vi.fn(),
    seek: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    setCurrentTime: vi.fn(),
    setPlaying: vi.fn(),
    setVolume: vi.fn(),
    openEqualizer: vi.fn(),
    toggleRepeat: vi.fn(),
    toggleShuffle: vi.fn(),
    nextSong: vi.fn(),
    previousSong: vi.fn(),
  };
  const view = render(<PlayerControls {...props} />);
  return { ...view, props, rerenderWithVolume: (next: number) => view.rerender(<PlayerControls {...props} volume={next} />) };
};

describe('PlayerControls', () => {
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
});
