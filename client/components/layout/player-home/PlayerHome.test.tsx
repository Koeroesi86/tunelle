import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import PlayerHome from './PlayerHome';

// the parts of the window are replaced: the test is about what the window does when the page is left
vi.mock('../../library/album-details', () => ({ default: () => null }));
vi.mock('../../ui/confirm', () => ({ default: () => null }));
vi.mock('../player-controls', () => ({ default: () => null }));
vi.mock('../audio-component', () => ({ default: () => null }));
vi.mock('../title-bar', () => ({ default: () => null }));
vi.mock('../navigation', () => ({ default: () => null }));
vi.mock('../audio-spectrum', () => ({ default: () => null }));
vi.mock('../player-tabs', () => ({ default: () => null }));
vi.mock('../launcher-offer', () => ({ default: () => null }));

const window = (onUnload: () => void) => <PlayerHome maximized={false} blurred={false} loaded folders={[]} addFiles={vi.fn()} onUnload={onUnload} />;

describe('PlayerHome', () => {
  it('saves the settings when the page is left, with the callback it has now, and no more once it is gone', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = render(window(first));

    rerender(window(second));
    globalThis.dispatchEvent(new Event('beforeunload'));
    unmount();
    globalThis.dispatchEvent(new Event('beforeunload'));

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
