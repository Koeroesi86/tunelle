import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ElectronApi } from '@shared/types/global';
import { getBackend, setBackend } from './backend';
import { createElectronBackend } from './electron-backend';

const api = (): ElectronApi => ({ send: vi.fn(), on: vi.fn(), getPathForFile: vi.fn(() => '/music/a.flac'), blurred: true, mpris: false });

describe('backend', () => {
  afterEach(() => vi.resetModules());

  it('is detached until a host is set: nothing is sent and no platform feature is there', async () => {
    const { getBackend: fresh } = await import('./backend');
    const detached = fresh();

    expect(detached.send('PING')).toBeUndefined();
    expect(detached.capabilities).toEqual({ blur: false, mpris: false });
    expect(detached.resolveUrl('/track')).toBe('tunelle://app/track');
  });

  it('serves the host that was set', () => {
    const host = createElectronBackend(api());
    setBackend(host);

    expect(getBackend()).toBe(host);
  });
});

describe('createElectronBackend', () => {
  it('hands the messages and the paths to the preload', () => {
    const electron = api();
    const backend = createElectronBackend(electron);
    const listener = vi.fn();

    backend.send('RESCAN_LIBRARY', { forced: true });
    backend.on('STORE_FOLDERS', listener);

    expect(electron.send).toHaveBeenCalledWith('RESCAN_LIBRARY', { forced: true });
    expect(electron.on).toHaveBeenCalledWith('STORE_FOLDERS', listener);
    expect(backend.pathForFile(new File([], 'a.flac'))).toBe('/music/a.flac');
  });

  it('serves everything of the main process under the tunelle protocol and reports its platform features', () => {
    const backend = createElectronBackend(api());

    expect(backend.resolveUrl('/albumart/cover.png')).toBe('tunelle://app/albumart/cover.png');
    expect(backend.capabilities).toEqual({ blur: true, mpris: false });
  });
});
