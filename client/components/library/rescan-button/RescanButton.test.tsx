import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import RescanButton from './RescanButton';

const send = vi.fn();
vi.mock('../../../services/electron-api', () => ({ electronAPI: { send: (...args: unknown[]) => send(...args) } }));

const renderButton = (props: Partial<Parameters<typeof RescanButton>[0]> = {}) =>
  render(<RescanButton current={0} total={0} scanningFolder={null} onRescan={vi.fn()} {...props} />);

const rescan = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Rescan' });

describe('RescanButton', () => {
  afterEach(() => {
    send.mockReset();
  });

  it('rescans from the button, with no ring or popover while nothing is scanned', () => {
    const onRescan = vi.fn();
    renderButton({ onRescan });

    fireEvent.click(rescan());

    expect(onRescan).toHaveBeenCalledTimes(1);
    expect(rescan().disabled).toBe(false);
    expect(rescan().querySelector('circle')).toBeNull();
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('waits while a folder is scanned, and says how far it is with the folder', () => {
    renderButton({ current: 1284, total: 3050, scanningFolder: '/music/jazz' });

    expect(rescan().disabled).toBe(true);
    const status = screen.getByRole('group');
    expect(status.textContent).toContain('Scanning library');
    expect(status.textContent).toContain('42%');
    expect(status.textContent).toContain('1,284 of 3,050 files');
    expect(status.textContent).toContain('/music/jazz');
  });

  it('draws the ring to the part that is scanned', () => {
    renderButton({ current: 1, total: 4, scanningFolder: '/music' });

    const fill = rescan().querySelectorAll('circle')[1];
    const length = Number(fill.getAttribute('stroke-dasharray'));
    expect(Number(fill.getAttribute('stroke-dashoffset'))).toBeCloseTo(length * 0.75);
  });

  it('shows an empty ring and no count until the number of files is known', () => {
    renderButton({ current: 0, total: 0, scanningFolder: '/music' });

    const fill = rescan().querySelectorAll('circle')[1];
    expect(fill.getAttribute('stroke-dashoffset')).toBe(fill.getAttribute('stroke-dasharray'));
    expect(screen.getByRole('group').textContent).not.toContain('files');
    expect(screen.getByRole('group').textContent).not.toContain('%');
  });

  it('never draws past a full ring when the count is behind', () => {
    renderButton({ current: 5, total: 4, scanningFolder: '/music' });

    expect(screen.getByRole('group').textContent).toContain('100%');
  });

  it('opens the folder that is scanned', () => {
    renderButton({ current: 1, total: 2, scanningFolder: '/music/jazz' });

    fireEvent.click(screen.getByRole('button', { name: '/music/jazz' }));

    expect(send).toHaveBeenCalledWith('OPEN_LIBRARY_PATH', '/music/jazz');
  });

  it('shows the folder that was picked instead of the path of the Flatpak document portal', () => {
    renderButton({ current: 1, total: 2, scanningFolder: '/run/user/1000/doc/a1b2c3d4/Music/jazz' });

    expect(screen.getByRole('group').textContent).toContain('Music/jazz');
    expect(screen.getByRole('group').textContent).not.toContain('/run/user');
  });

  it('scales the bar to the share that is scanned', () => {
    const { container } = renderButton({ current: 1, total: 4, scanningFolder: '/music' });

    expect(container.querySelector<HTMLElement>('[role="progressbar"] > div')?.style.transform).toBe('scaleX(0.25)');
  });

  it('announces the start and the end of a scan, and the progress only to a reader that asks', () => {
    const { rerender } = renderButton({ current: 1, total: 4, scanningFolder: '/music' });

    expect(screen.getByRole('status').textContent).toBe('Scanning library');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('25');

    rerender(<RescanButton current={4} total={4} scanningFolder={null} onRescan={vi.fn()} />);

    expect(screen.getByRole('status').textContent).toBe('Library scan finished');
  });
});
