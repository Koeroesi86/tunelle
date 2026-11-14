import { useEffect } from 'react';
import { useLatest } from './use-latest';

export interface PlayerShortcuts {
  isPlaying: boolean;
  /** A station has no position, so the seek keys do nothing */
  live: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  play: () => void;
  pause: () => void;
  setCurrentTime: (currentTime: number) => void;
  setVolume: (volume: number) => void;
}

const seekStep = 5;
const volumeStep = 0.05;
/** What keeps a key for itself: a field, a button or link, a slider, a menu, a tab or a dialog */
const ownsKeys =
  'input, textarea, select, button, a[href], summary, [contenteditable], [role=slider], [role=menuitem], [role=option], [role=tab], [role=dialog]';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Space, the left and right arrows and Shift with the up and down arrows work the player from anywhere that does not use the key itself. See docs/development/accessibility.md */
export const usePlayerShortcuts = (shortcuts: PlayerShortcuts) => {
  const latest = useLatest(shortcuts);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const { isPlaying, live, currentTime, duration, volume, play, pause, setCurrentTime, setVolume } = latest.current;
      const target = event.target instanceof Element ? event.target : undefined;
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || target?.closest(ownsKeys)) return;

      const actions: Record<string, (() => void) | undefined> = {
        ' ': !event.shiftKey ? () => (isPlaying ? pause() : play()) : undefined,
        ArrowLeft: !live && !event.shiftKey ? () => setCurrentTime(clamp(currentTime - seekStep, 0, duration)) : undefined,
        ArrowRight: !live && !event.shiftKey ? () => setCurrentTime(clamp(currentTime + seekStep, 0, duration)) : undefined,
        ArrowUp: event.shiftKey ? () => setVolume(clamp(volume + volumeStep, 0, 1)) : undefined,
        ArrowDown: event.shiftKey ? () => setVolume(clamp(volume - volumeStep, 0, 1)) : undefined,
      };
      const action = Object.hasOwn(actions, event.key) ? actions[event.key] : undefined;
      if (!action) return;
      event.preventDefault();
      action();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
};
