import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { UpdateState, UpdateStatus } from '../../types/update';
import About from './About';

const base: UpdateState = { version: '26.10.5', electron: '40.0.0', chrome: '140.0.0', unavailable: undefined, automatic: true, status: { kind: 'idle' } };

const setup = (overrides: Partial<UpdateState> = {}, isPlaying = false) => {
  const handlers = { check: vi.fn(), install: vi.fn(), setAutomatic: vi.fn(), openReleases: vi.fn() };
  render(<About update={{ ...base, ...overrides }} isPlaying={isPlaying} {...handlers} />);

  return handlers;
};

const withStatus = (status: UpdateStatus) => ({ status });

describe('About', () => {
  it('shows nothing before the main process reports', () => {
    const { container } = render(<About update={null} isPlaying={false} check={vi.fn()} install={vi.fn()} setAutomatic={vi.fn()} openReleases={vi.fn()} />);

    expect(container.innerHTML).toBe('');
  });

  it('shows the version with the Electron and Chromium versions', () => {
    setup();

    expect(screen.getByText('Version 26.10.5')).toBeTruthy();
    expect(screen.getByText('Electron 40.0.0 · Chromium 140.0.0')).toBeTruthy();
  });

  it('shows the icon of the app next to the version', () => {
    const { container } = render(<About update={base} isPlaying={false} check={vi.fn()} install={vi.fn()} setAutomatic={vi.fn()} openReleases={vi.fn()} />);

    expect(container.querySelector('img')?.getAttribute('src')).toContain('svg');
  });

  it('offers the check and asks for it', () => {
    const { check } = setup();

    fireEvent.click(screen.getByText('Check for updates'));

    expect(check).toHaveBeenCalledOnce();
  });

  it('shows that it is checking, without a button', () => {
    setup(withStatus({ kind: 'checking' }));

    expect(screen.getByText('Checking for updates...')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows that it is up to date with the time of the check, and offers the check again', () => {
    const checkedAt = new Date(2026, 9, 26, 14, 32).getTime();
    setup(withStatus({ kind: 'upToDate', checkedAt }));

    expect(screen.getByText(`Up to date, checked at ${new Intl.DateTimeFormat('en', { timeStyle: 'short' }).format(checkedAt)}`)).toBeTruthy();
    expect(screen.getByText('Check for updates')).toBeTruthy();
  });

  it('shows the version and the progress of the download, without a button', () => {
    setup(withStatus({ kind: 'downloading', version: '26.10.6', percent: 40 }));

    expect(screen.getByText('Downloading update 26.10.6... 40%')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('restarts to install a downloaded update when nothing is playing', () => {
    const { install } = setup(withStatus({ kind: 'ready', version: '26.10.6' }));

    fireEvent.click(screen.getByText('Restart to install'));

    expect(install).toHaveBeenCalledOnce();
  });

  it('says that the playback stops before restarting while it plays, and restarts only when confirmed', () => {
    const { install } = setup(withStatus({ kind: 'ready', version: '26.10.6' }), true);

    fireEvent.click(screen.getByText('Restart to install'));
    expect(install).not.toHaveBeenCalled();
    expect(screen.getByText('The playback stops for the restart. The queue and the position are kept.')).toBeTruthy();

    fireEvent.click(screen.getAllByText('Restart to install')[1]);
    expect(install).toHaveBeenCalledOnce();
  });

  it('does not restart when the confirmation is declined', () => {
    const { install } = setup(withStatus({ kind: 'ready', version: '26.10.6' }), true);

    fireEvent.click(screen.getByText('Restart to install'));
    fireEvent.click(screen.getByText('No'));

    expect(install).not.toHaveBeenCalled();
  });

  it('shows why the update failed and retries', () => {
    const { check } = setup(withStatus({ kind: 'failed', message: 'offline' }));

    expect(screen.getByText('The update failed: offline')).toBeTruthy();
    fireEvent.click(screen.getByText('Try again'));

    expect(check).toHaveBeenCalledOnce();
  });

  it.each([
    ['flatpak', 'Updates come through Flatpak'],
    ['disabled', 'Updates are turned off'],
    ['managed', 'Updates come through the package manager'],
    ['store', 'Updates come through the Microsoft Store'],
  ] as const)('shows the reason without a check button where updates are %s', (unavailable, reason) => {
    const { openReleases } = setup({ unavailable });

    expect(screen.getByText(reason)).toBeTruthy();
    expect(screen.queryByText('Check for updates')).toBeNull();
    fireEvent.click(screen.getByText('Open the releases page'));
    expect(openReleases).toHaveBeenCalledOnce();
  });

  it('shows the reason in a development run, with no button at all', () => {
    setup({ unavailable: 'development' });

    expect(screen.getByText('Updates are off in a development run')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('turns the update at start off, and the check stays', () => {
    const { setAutomatic } = setup();

    expect(screen.getByText(/installs it before it opens/)).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Update at start' }));

    expect(setAutomatic).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('says what the off switch means, still offers the check, and turns the update at start on', () => {
    const { setAutomatic } = setup({ automatic: false });

    expect(screen.getByText(/does not check when it starts/)).toBeTruthy();
    expect(screen.getByText('Check for updates')).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: 'Update at start' }));

    expect(setAutomatic).toHaveBeenCalledExactlyOnceWith(true);
  });

  it.each(['development', 'disabled', 'flatpak', 'managed', 'store'] as const)('has no switch where updates are %s', (unavailable) => {
    setup({ unavailable });

    expect(screen.queryByRole('switch')).toBeNull();
  });
});
