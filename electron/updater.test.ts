import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkForUpdate, createMockUpdateSource, downloadUpdate, getUpdateUnavailableReason, installUpdate, runUpdate } from './updater';
import type { UpdateSource } from './updater';

const createSource = (check: UpdateSource['checkForUpdates'], download: UpdateSource['downloadUpdate'] = () => Promise.resolve()) => {
  const source: UpdateSource = Object.assign(new EventEmitter(), {
    autoDownload: true,
    checkForUpdates: vi.fn(check),
    downloadUpdate: vi.fn(download),
    quitAndInstall: vi.fn(),
  });

  return source;
};

afterEach(() => {
  vi.useRealTimers();
});

const available = () => Promise.resolve({ isUpdateAvailable: true, updateInfo: { version: '2.0.0' } });

describe('checkForUpdate', () => {
  it('turns the automatic download off and gives the version of the update', async () => {
    const source = createSource(available);

    await expect(checkForUpdate(source)).resolves.toBe('2.0.0');

    expect(source.autoDownload).toBe(false);
  });

  it.each([
    ['no result', () => Promise.resolve(null)],
    ['no update', () => Promise.resolve({ isUpdateAvailable: false, updateInfo: { version: '1.0.0' } })],
  ])('gives no version for %s', async (_name, check) => {
    await expect(checkForUpdate(createSource(check))).resolves.toBeUndefined();
  });

  it('fails when the check fails', async () => {
    await expect(checkForUpdate(createSource(() => Promise.reject(new Error('offline'))))).rejects.toThrow('offline');
  });

  it('fails when the check takes too long', async () => {
    await expect(
      checkForUpdate(
        createSource(() => new Promise(() => undefined)),
        1
      )
    ).rejects.toThrow('took longer than 1 ms');
  });
});

describe('downloadUpdate', () => {
  it('reports the rounded progress and stops listening afterwards', async () => {
    const source = createSource(available, () => Promise.resolve(source.emit('download-progress', { percent: 41.6 })));
    const onProgress = vi.fn();

    await downloadUpdate(source, onProgress);

    expect(onProgress).toHaveBeenCalledExactlyOnceWith(42);
    expect(source.listenerCount('download-progress')).toBe(0);
  });

  it('fails when no progress arrives and stops listening', async () => {
    const source = createSource(available, () => new Promise(() => undefined));

    await expect(downloadUpdate(source, vi.fn(), 1)).rejects.toThrow('no progress for 1 ms');

    expect(source.listenerCount('download-progress')).toBe(0);
  });

  it('fails when the download fails', async () => {
    const source = createSource(available, () => Promise.reject(new Error('disk full')));

    await expect(downloadUpdate(source, vi.fn())).rejects.toThrow('disk full');
  });
});

describe('installUpdate', () => {
  it('installs silently and starts the app again', () => {
    const source = createSource(available);

    installUpdate(source);

    expect(source.quitAndInstall).toHaveBeenCalledExactlyOnceWith(true, true);
  });
});

describe('runUpdate', () => {
  it('reports in the language it is given', async () => {
    const source = createSource(available);
    const report = vi.fn();

    await runUpdate(source, report, { install: false, translate: (key, values) => `${key} ${values?.version ?? ''}`.trim() });

    expect(report).toHaveBeenCalledWith({ text: 'update.checking' });
    expect(report).toHaveBeenCalledWith({ text: 'update.downloading 2.0.0', percent: 0 });
  });

  it('continues when there is no update', async () => {
    const source = createSource(() => Promise.resolve({ isUpdateAvailable: false, updateInfo: { version: '1.0.0' } }));
    const report = vi.fn();

    await expect(runUpdate(source, report)).resolves.toBeUndefined();

    expect(report).toHaveBeenCalledWith({ text: 'Checking for updates...' });
    expect(source.downloadUpdate).not.toHaveBeenCalled();
    expect(source.quitAndInstall).not.toHaveBeenCalled();
  });

  it('downloads the update, reports the progress and installs it', async () => {
    const source = createSource(available, () => {
      source.emit('download-progress', { percent: 42.4 });
      return Promise.resolve();
    });
    const report = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runUpdate(source, report, { installTimeout: 0 })).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(expect.stringContaining('did not quit'));

    expect(source.autoDownload).toBe(false);
    expect(report.mock.calls.map(([progress]) => progress)).toEqual([
      { text: 'Checking for updates...' },
      { text: 'Downloading update 2.0.0...', percent: 0 },
      { text: 'Downloading update 2.0.0...', percent: 42 },
      { text: 'Restarting to install the update...', percent: 100 },
    ]);
    expect(source.quitAndInstall).toHaveBeenCalledExactlyOnceWith(true, true);
  });

  it('starts the app when it did not quit after the installer started', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const source = createSource(available);

    await expect(runUpdate(source, vi.fn(), { installTimeout: 1 })).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(expect.stringContaining('did not quit'));
  });

  it('does not install when installing is turned off', async () => {
    const source = createSource(available);

    await expect(runUpdate(source, vi.fn(), { install: false })).resolves.toBeUndefined();

    expect(source.downloadUpdate).toHaveBeenCalledOnce();
    expect(source.quitAndInstall).not.toHaveBeenCalled();
  });

  it.each([
    ['the check fails', () => Promise.reject(new Error('offline'))],
    ['the check does not answer in time', () => new Promise<never>(() => undefined)],
  ])('continues when %s', async (_name, check) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(runUpdate(createSource(check), vi.fn(), { checkTimeout: 1 })).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith('Update failed, starting the installed version', expect.any(Error));
  });

  it('continues when the download stalls', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const source = createSource(available, () => new Promise<never>(() => undefined));

    await expect(runUpdate(source, vi.fn(), { downloadStallTimeout: 1 })).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith('Update failed, starting the installed version', expect.any(Error));

    expect(source.quitAndInstall).not.toHaveBeenCalled();
  });

  it('keeps a slow download going while it makes progress', async () => {
    vi.useFakeTimers();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const source = createSource(available, () =>
      [20, 40, 60].reduce<Promise<unknown>>(
        (previous, percent) => previous.then(() => new Promise((resolve) => setTimeout(resolve, 15))).then(() => source.emit('download-progress', { percent })),
        Promise.resolve()
      )
    );

    const update = runUpdate(source, vi.fn(), { downloadStallTimeout: 40, installTimeout: 0 });
    await vi.runAllTimersAsync();
    await update;

    expect(error).toHaveBeenCalledWith(expect.stringContaining('did not quit'));

    expect(source.quitAndInstall).toHaveBeenCalledOnce();
  });

  it('continues when the download fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const source = createSource(available, () => Promise.reject(new Error('disk full')));

    await expect(runUpdate(source, vi.fn())).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith('Update failed, starting the installed version', expect.objectContaining({ message: 'disk full' }));

    expect(source.quitAndInstall).not.toHaveBeenCalled();
  });
});

describe('createMockUpdateSource', () => {
  it('goes through a whole update without installing anything', async () => {
    const report = vi.fn();

    await expect(runUpdate(createMockUpdateSource(0), report, { install: false })).resolves.toBeUndefined();

    const percents = report.mock.calls.map(([progress]) => progress.percent).filter((percent) => percent !== undefined);
    expect(percents).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
  });
});

describe('getUpdateUnavailableReason', () => {
  it.each([
    ['a development run', false, 'linux', { APPIMAGE: '/x.AppImage' }, 'development'],
    ['a run with TUNELLE_NO_UPDATE=1', true, 'win32', { TUNELLE_NO_UPDATE: '1' }, 'disabled'],
    ['an AppImage with TUNELLE_NO_UPDATE=1', true, 'linux', { APPIMAGE: '/x.AppImage', TUNELLE_NO_UPDATE: '1' }, 'disabled'],
    ['the Flatpak', true, 'linux', { FLATPAK_ID: 'io.github.koeroesi86.Tunelle' }, 'flatpak'],
    ['another Linux package', true, 'linux', {}, 'managed'],
  ] as const)('names the reason for %s', (_name, isPackaged, platform, env, reason) => {
    expect(getUpdateUnavailableReason(isPackaged, platform, env)).toBe(reason);
  });

  it('names the Store for a Store package, which has no say over its updates', () => {
    expect(getUpdateUnavailableReason(true, 'win32', {}, true)).toBe('store');
  });

  it('names a turned off update before the Store, and a development run before both', () => {
    expect(getUpdateUnavailableReason(true, 'win32', { TUNELLE_NO_UPDATE: '1' }, true)).toBe('disabled');
    expect(getUpdateUnavailableReason(false, 'win32', {}, true)).toBe('development');
  });

  it.each([
    ['windows', 'win32', {}],
    ['macos', 'darwin', {}],
    ['an AppImage', 'linux', { APPIMAGE: '/x.AppImage' }],
  ] as const)('has no reason on %s', (_name, platform, env) => {
    expect(getUpdateUnavailableReason(true, platform, env)).toBeUndefined();
  });
});
