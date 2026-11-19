import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainEvent } from 'electron';
import type { ListenerContext } from './listener-context';
import registerLoudnessListeners from './register-loudness-listeners';
import { fakeDatabase } from '../test-fake-database';
import { clearTrackLoudness } from '../repositories/loudness-repository';

type Listener = (event: IpcMainEvent, payload?: unknown) => void;

const listeners = new Map<string, Listener>();

vi.mock('../repositories/loudness-repository', () => ({ clearTrackLoudness: vi.fn() }));
vi.mock('electron', () => ({
  ipcMain: { on: (channel: string, listener: Listener) => listeners.set(channel, listener) },
}));

describe('registerLoudnessListeners', () => {
  const send = vi.fn();
  const event = { sender: { send, isDestroyed: () => false } } as unknown as IpcMainEvent;
  const status = { total: 4, measured: 3, failed: 1 };
  const failed = [{ path: '/music/a.flac', reason: 'silent' }];
  const loudness = { status: vi.fn(), failed: vi.fn(), restart: vi.fn(), prioritise: vi.fn() };
  const database = fakeDatabase();

  beforeEach(() => {
    listeners.clear();
    send.mockReset();
    loudness.status.mockReset().mockResolvedValue(status);
    loudness.failed.mockReset().mockResolvedValue(failed);
    loudness.restart.mockReset().mockResolvedValue(undefined);
    loudness.prioritise.mockReset().mockResolvedValue(undefined);
    vi.mocked(clearTrackLoudness).mockReset().mockResolvedValue([]);
    registerLoudnessListeners({ database, loudness } as unknown as ListenerContext);
  });

  it('tells the window how far the measurement is when it asks', async () => {
    listeners.get('LOUDNESS_STATUS_LOAD')?.(event);
    await vi.waitFor(() => expect(send).toHaveBeenCalled());

    expect(send).toHaveBeenCalledWith('LOUDNESS_STATUS', status);
  });

  it('lists the tracks that could not be measured when the window asks', async () => {
    listeners.get('LOUDNESS_FAILED_LOAD')?.(event);
    await vi.waitFor(() => expect(send).toHaveBeenCalled());

    expect(send).toHaveBeenCalledWith('LOUDNESS_FAILED', { tracks: failed });
  });

  it('measures the tracks that the window queued or started first, and refuses a message of another shape', () => {
    listeners.get('LOUDNESS_PRIORITISE')?.(event, { paths: ['/music/a.flac', '/music/b.flac'] });
    listeners.get('LOUDNESS_PRIORITISE')?.(event, { paths: 'x' });

    expect(loudness.prioritise).toHaveBeenCalledExactlyOnceWith(['/music/a.flac', '/music/b.flac'], undefined);
  });

  it('tells the source which track plays now', () => {
    listeners.get('LOUDNESS_PRIORITISE')?.(event, { paths: ['/music/a.flac'], nowPlaying: true });

    expect(loudness.prioritise).toHaveBeenCalledExactlyOnceWith(['/music/a.flac'], true);
  });

  it('forgets every measurement and starts over when the window asks to clear them', async () => {
    listeners.get('LOUDNESS_CLEAR')?.(event);
    await vi.waitFor(() => expect(loudness.restart).toHaveBeenCalled());

    expect(clearTrackLoudness).toHaveBeenCalledExactlyOnceWith(database);
  });
});
