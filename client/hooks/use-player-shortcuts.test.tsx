import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { usePlayerShortcuts } from './use-player-shortcuts';
import type { PlayerShortcuts } from './use-player-shortcuts';

const setup = (overrides: Partial<PlayerShortcuts> = {}) => {
  const props = {
    isPlaying: false,
    live: false,
    currentTime: 10,
    duration: 100,
    volume: 0.5,
    play: vi.fn(),
    pause: vi.fn(),
    setCurrentTime: vi.fn(),
    setVolume: vi.fn(),
    ...overrides,
  };
  const Host = () => {
    usePlayerShortcuts(props);
    return (
      <div>
        <button type="button">button</button>
        <input aria-label="field" />
        <div role="slider" tabIndex={0} aria-valuenow={0} aria-label="slider" />
      </div>
    );
  };
  const view = render(<Host />);
  return { props, ...view };
};

describe('usePlayerShortcuts', () => {
  it('plays and pauses with Space', () => {
    const paused = setup();
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(paused.props.play).toHaveBeenCalledTimes(1);
    paused.unmount();

    const playing = setup({ isPlaying: true });
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(playing.props.pause).toHaveBeenCalledTimes(1);
  });

  it('seeks by 5 seconds and stays inside the track', () => {
    const { props } = setup({ currentTime: 98 });

    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });

    expect(props.setCurrentTime).toHaveBeenNthCalledWith(1, 100);
    expect(props.setCurrentTime).toHaveBeenNthCalledWith(2, 93);
  });

  it('does not seek a station', () => {
    const { props } = setup({ live: true });
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(props.setCurrentTime).not.toHaveBeenCalled();
  });

  it('changes the volume with Shift and the up and down arrows only, so a plain arrow still scrolls', () => {
    const { props } = setup({ volume: 0.98 });

    fireEvent.keyDown(document.body, { key: 'ArrowUp' });
    expect(props.setVolume).not.toHaveBeenCalled();

    fireEvent.keyDown(document.body, { key: 'ArrowUp', shiftKey: true });
    fireEvent.keyDown(document.body, { key: 'ArrowDown', shiftKey: true });
    expect(props.setVolume).toHaveBeenNthCalledWith(1, 1);
    expect(props.setVolume).toHaveBeenNthCalledWith(2, expect.closeTo(0.93));
  });

  it('leaves the key to a button, a field, a slider and to a shortcut with a modifier', () => {
    const { props, getByRole } = setup();

    fireEvent.keyDown(getByRole('button'), { key: ' ' });
    fireEvent.keyDown(getByRole('textbox'), { key: ' ' });
    fireEvent.keyDown(getByRole('slider'), { key: 'ArrowRight' });
    fireEvent.keyDown(document.body, { key: ' ', ctrlKey: true });

    expect(props.play).not.toHaveBeenCalled();
    expect(props.setCurrentTime).not.toHaveBeenCalled();
  });

  it('leaves the key to a handler that took it', () => {
    const { props } = setup();
    const row = document.createElement('div');
    row.addEventListener('keydown', (event) => event.preventDefault());
    document.body.append(row);

    fireEvent.keyDown(row, { key: ' ' });

    expect(props.play).not.toHaveBeenCalled();
    row.remove();
  });
});
