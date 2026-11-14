import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PlayerHome from './PlayerHome';

// the parts of the window are replaced: the test is about what the window does when the page is left
vi.mock('../../ui/confirm', () => ({ default: () => null }));
vi.mock('../player-controls', () => ({ default: () => null }));
vi.mock('../audio-component', () => ({ default: () => null }));
vi.mock('../title-bar', () => ({
  default: ({ onMenu, menuOpen }: { onMenu?: () => void; menuOpen?: boolean }) =>
    onMenu ? (
      <button type="button" onClick={onMenu}>
        menu {String(menuOpen)}
      </button>
    ) : null,
}));
vi.mock('../navigation', () => ({
  default: ({ rail, onNavigate }: { rail?: boolean; onNavigate?: () => void }) => (
    <button type="button" onClick={onNavigate}>
      navigation {String(rail)}
    </button>
  ),
}));
vi.mock('../audio-spectrum', () => ({ default: () => null }));
vi.mock('../player-tabs', () => ({ default: () => null }));
vi.mock('../launcher-offer', () => ({ default: () => null }));

const window = (onUnload: () => void) => <PlayerHome maximized={false} blurred={false} loaded folders={[]} addFiles={vi.fn()} onUnload={onUnload} />;

describe('PlayerHome', () => {
  it('has a skip link that moves the focus to the player controls', () => {
    const player = document.createElement('div');
    player.id = 'player-controls';
    player.tabIndex = -1;
    document.body.append(player);
    render(window(vi.fn()));

    fireEvent.click(screen.getByRole('button', { name: 'Skip to the player controls' }));

    expect(document.activeElement).toBe(player);
    player.remove();
  });

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

  describe('by size', () => {
    const open = (width: number) => {
      vi.stubGlobal('innerWidth', width);
      return render(window(vi.fn()));
    };
    const root = (container: HTMLElement) => container.firstElementChild;

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('has the sidebar in full when it is expanded', () => {
      const { container } = open(1400);

      expect(screen.getByText('navigation false')).toBeTruthy();
      expect(screen.queryByText(/^menu/)).toBeNull();
      expect(root(container)?.className).not.toMatch(/compact|medium/);
    });

    it('has a column of icons when it is medium', () => {
      const { container } = open(800);

      expect(screen.getByText('navigation true')).toBeTruthy();
      expect(screen.queryByText(/^menu/)).toBeNull();
      expect(root(container)?.className).toContain('medium');
    });

    it('has a drawer opened from the menu button when it is compact', () => {
      const { container } = open(400);
      expect(root(container)?.className).toContain('compact');
      expect(root(container)?.className).not.toContain('drawerOpen');

      fireEvent.click(screen.getByText('menu false'));

      expect(root(container)?.className).toContain('drawerOpen');
      expect(screen.getByText('menu true')).toBeTruthy();
    });

    it.each([
      ['the menu button again', () => fireEvent.click(screen.getByText('menu true'))],
      ['the scrim', () => fireEvent.click(screen.getByLabelText('Close the menu'))],
      ['Escape', () => fireEvent.keyDown(document.body, { key: 'Escape' })],
      ['an item of the navigation', () => fireEvent.click(screen.getByText('navigation false'))],
    ])('closes the drawer with %s', (_name, close) => {
      const { container } = open(400);
      fireEvent.click(screen.getByText('menu false'));

      close();

      expect(root(container)?.className).not.toContain('drawerOpen');
    });

    it('closes the drawer when the window grows to the medium size', () => {
      const { container } = open(400);
      fireEvent.click(screen.getByText('menu false'));

      vi.stubGlobal('innerWidth', 800);
      act(() => {
        globalThis.dispatchEvent(new Event('resize'));
      });

      expect(root(container)?.className).not.toContain('drawerOpen');
      expect(screen.queryByLabelText('Close the menu')).toBeNull();
    });
  });
});
