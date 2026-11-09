import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainEvent } from 'electron';
import type { ListenerContext } from './listener-context';
import type { UpdateManager } from '../services/update-manager';
import registerUpdateListeners from './register-update-listeners';

type Listener = (event: IpcMainEvent, payload?: unknown) => void;

const listeners = new Map<string, Listener>();
const openExternal = vi.fn((_url: string) => Promise.resolve());
const openPath = vi.fn((_path: string) => Promise.resolve(''));

vi.mock('electron', () => ({
  ipcMain: { on: (channel: string, listener: Listener) => listeners.set(channel, listener) },
  shell: { openExternal: (url: string) => openExternal(url), openPath: (path: string) => openPath(path) },
}));

const state = {
  version: '26.10.5',
  electron: '40.0.0',
  chrome: '140.0.0',
  unavailable: undefined,
  automatic: true,
  allowMetered: false,
  status: { kind: 'idle' },
} as const;

describe('registerUpdateListeners', () => {
  const send = vi.fn();
  const updates: UpdateManager = {
    getState: vi.fn(() => state),
    check: vi.fn(() => Promise.resolve()),
    confirmMetered: vi.fn(() => Promise.resolve()),
    cancelMetered: vi.fn(),
    setAutomatic: vi.fn(() => Promise.resolve()),
    setAllowMetered: vi.fn(() => Promise.resolve()),
    install: vi.fn(),
  };
  const event = (destroyed = false) => ({ sender: { send, isDestroyed: () => destroyed } }) as unknown as IpcMainEvent;
  const emit = (channel: string, e = event()) => listeners.get(channel)?.(e);

  beforeEach(() => {
    vi.clearAllMocks();
    listeners.clear();
    registerUpdateListeners({ updates } as ListenerContext);
  });

  it('answers the request for the version with the update state', () => {
    emit('GET_APP_VERSION');

    expect(send).toHaveBeenCalledExactlyOnceWith('UPDATE_STATE', state);
  });

  it('does not answer a window that was closed', () => {
    emit('GET_APP_VERSION', event(true));

    expect(send).not.toHaveBeenCalled();
  });

  it('starts a check and a restart on request', () => {
    emit('CHECK_FOR_UPDATES');
    emit('INSTALL_UPDATE');

    expect(updates.check).toHaveBeenCalledOnce();
    expect(updates.install).toHaveBeenCalledOnce();
  });

  it('passes the choice to update at start on', () => {
    listeners.get('SET_AUTOMATIC_UPDATES')?.(event(), { enabled: false });

    expect(updates.setAutomatic).toHaveBeenCalledExactlyOnceWith(false);
  });

  it.each([undefined, null, 'off', {}, { enabled: 'no' }])('ignores %j as the choice to update at start', (payload) => {
    listeners.get('SET_AUTOMATIC_UPDATES')?.(event(), payload);

    expect(updates.setAutomatic).not.toHaveBeenCalled();
  });

  it('continues or drops a check that waited for the metered connection', () => {
    emit('CONFIRM_METERED_UPDATE');
    emit('CANCEL_METERED_UPDATE');

    expect(updates.confirmMetered).toHaveBeenCalledOnce();
    expect(updates.cancelMetered).toHaveBeenCalledOnce();
  });

  it('passes the choice to download on a metered connection', () => {
    listeners.get('SET_ALLOW_METERED_UPDATES')?.(event(), { enabled: true });

    expect(updates.setAllowMetered).toHaveBeenCalledExactlyOnceWith(true);
  });

  it.each([undefined, null, 'on', {}, { enabled: 1 }])('ignores %j as the choice for a metered connection', (payload) => {
    listeners.get('SET_ALLOW_METERED_UPDATES')?.(event(), payload);

    expect(updates.setAllowMetered).not.toHaveBeenCalled();
  });

  it('opens the releases page, a fixed address', () => {
    emit('OPEN_RELEASES');

    expect(openExternal).toHaveBeenCalledExactlyOnceWith('https://github.com/Koeroesi86/tunelle/releases');
  });

  it('opens the notice of the ffmpeg in the resources of the app, a fixed file', () => {
    Object.defineProperty(process, 'resourcesPath', { value: join('app', 'resources'), configurable: true });
    emit('OPEN_FFMPEG_NOTICE');

    expect(openPath).toHaveBeenCalledExactlyOnceWith(join('app', 'resources', 'ffmpeg', 'NOTICE.txt'));
  });
});
