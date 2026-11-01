import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUpdateManager } from './updateManager';
import type { UpdateSource } from './updater';
import type { UpdateState } from '../types/update';

const info = { version: '26.10.5', electron: '40.0.0', chrome: '140.0.0', unavailable: undefined } as const;
const found = () => Promise.resolve({ isUpdateAvailable: true, updateInfo: { version: '26.10.6' } });
const notFound = () => Promise.resolve({ isUpdateAvailable: false, updateInfo: { version: '26.10.5' } });

const setup = (check: UpdateSource['checkForUpdates'], download: (source: UpdateSource) => Promise<unknown> = () => Promise.resolve(), options = {}) => {
  const source: UpdateSource = Object.assign(new EventEmitter(), {
    autoDownload: true,
    checkForUpdates: vi.fn(check),
    downloadUpdate: vi.fn(() => download(source)),
    quitAndInstall: vi.fn(),
  });
  const published: UpdateState[] = [];
  const manager = createUpdateManager({ source, info, publish: (state) => published.push(state), now: () => 1000, ...options });

  return { source, manager, kinds: () => published.map(({ status }) => status.kind) };
};

describe('createUpdateManager', () => {
  afterEach(() => vi.restoreAllMocks());

  it('starts idle with the versions of the app', () => {
    expect(setup(notFound).manager.getState()).toEqual({ ...info, automatic: true, status: { kind: 'idle' } });
  });

  it('reports up to date with the time of the check', async () => {
    const { manager, kinds } = setup(notFound);

    await manager.check();

    expect(kinds()).toEqual(['checking', 'upToDate']);
    expect(manager.getState().status).toEqual({ kind: 'upToDate', checkedAt: 1000 });
  });

  it('downloads a found update with progress and waits for the restart', async () => {
    const { manager, source, kinds } = setup(found, (updateSource) => {
      updateSource.emit('download-progress', { percent: 30.2 });
      updateSource.emit('download-progress', { percent: 100 });
      return Promise.resolve();
    });

    await manager.check();

    expect(kinds()).toEqual(['checking', 'downloading', 'downloading', 'downloading', 'ready']);
    expect(manager.getState().status).toEqual({ kind: 'ready', version: '26.10.6' });
    expect(source.quitAndInstall).not.toHaveBeenCalled();
  });

  it('installs only a downloaded update', async () => {
    const { manager, source } = setup(found);

    manager.install();
    expect(source.quitAndInstall).not.toHaveBeenCalled();

    await manager.check();
    manager.install();
    expect(source.quitAndInstall).toHaveBeenCalledExactlyOnceWith(true, true);
  });

  it('reports a failed check and can be retried', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { manager, source } = setup(() => Promise.reject(new Error('offline')));

    await manager.check();
    expect(manager.getState().status).toEqual({ kind: 'failed', message: 'offline' });

    source.checkForUpdates = vi.fn(notFound);
    await manager.check();
    expect(manager.getState().status.kind).toBe('upToDate');
  });

  it('reports a failed download', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { manager } = setup(found, () => Promise.reject(new Error('disk full')));

    await manager.check();

    expect(manager.getState().status).toEqual({ kind: 'failed', message: 'disk full' });
  });

  it('reports a check that takes too long', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { manager } = setup(() => new Promise(() => undefined), undefined, { checkTimeout: 1 });

    await manager.check();

    expect(manager.getState().status.kind).toBe('failed');
  });

  it('reports a stalled download', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { manager } = setup(found, () => new Promise(() => undefined), { downloadStallTimeout: 1 });

    await manager.check();

    expect(manager.getState().status).toEqual({ kind: 'failed', message: expect.stringContaining('no progress') });
  });

  it('does not start a second check while one runs', async () => {
    const { manager, source } = setup(notFound);

    await Promise.all([manager.check(), manager.check()]);

    expect(source.checkForUpdates).toHaveBeenCalledOnce();
  });

  it('does not check again once an update is downloaded', async () => {
    const { manager, source } = setup(found);

    await manager.check();
    await manager.check();

    expect(source.checkForUpdates).toHaveBeenCalledOnce();
  });

  it('does nothing without an update source', async () => {
    const publish = vi.fn();
    const manager = createUpdateManager({ source: undefined, info: { ...info, unavailable: 'flatpak' }, publish });

    await manager.check();
    manager.install();

    expect(publish).not.toHaveBeenCalled();
    expect(manager.getState().unavailable).toBe('flatpak');
  });

  describe('the update at start', () => {
    it('keeps the choice and publishes it', async () => {
      const saveAutomatic = vi.fn(() => Promise.resolve());
      const { manager, kinds } = setup(notFound, undefined, { saveAutomatic });

      await manager.setAutomatic(false);

      expect(manager.getState().automatic).toBe(false);
      expect(saveAutomatic).toHaveBeenCalledExactlyOnceWith(false);
      expect(kinds()).toEqual(['idle']);
    });

    it('starts from the saved choice', () => {
      expect(setup(notFound, undefined, { automatic: false }).manager.getState().automatic).toBe(false);
    });

    it('still checks, downloads and installs by hand while it is off', async () => {
      const { manager, source } = setup(found, undefined, { automatic: false });

      await manager.check();
      manager.install();

      expect(manager.getState().status).toEqual({ kind: 'ready', version: '26.10.6' });
      expect(source.quitAndInstall).toHaveBeenCalledExactlyOnceWith(true, true);
    });

    it('does not save a choice that is already made', async () => {
      const saveAutomatic = vi.fn(() => Promise.resolve());
      const { manager } = setup(notFound, undefined, { saveAutomatic });

      await manager.setAutomatic(true);

      expect(saveAutomatic).not.toHaveBeenCalled();
    });

    it('takes the choice back when it was not saved', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { manager } = setup(notFound, undefined, { saveAutomatic: () => Promise.reject(new Error('read only')) });

      await manager.setAutomatic(false);

      expect(manager.getState().automatic).toBe(true);
    });

    it.each(['development', 'disabled', 'flatpak', 'managed', 'store'] as const)('ignores the choice where updates are %s', async (unavailable) => {
      const saveAutomatic = vi.fn(() => Promise.resolve());
      const manager = createUpdateManager({ source: undefined, info: { ...info, unavailable }, publish: vi.fn(), saveAutomatic });

      await manager.setAutomatic(false);

      expect(manager.getState().automatic).toBe(true);
      expect(saveAutomatic).not.toHaveBeenCalled();
    });
  });
});
