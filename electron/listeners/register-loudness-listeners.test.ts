import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainEvent } from 'electron';
import type { Database } from 'sqlite3';
import type { ListenerContext } from './listener-context';
import registerLoudnessListeners from './register-loudness-listeners';
import executeQuery from '../database/execute-query';
import { createTestDatabase } from '../test-database';
import { saveTrackLoudness } from '../repositories/loudness-repository';

type Listener = (event: IpcMainEvent, payload?: unknown) => void;

const listeners = new Map<string, Listener>();

vi.mock('electron', () => ({
  ipcMain: { on: (channel: string, listener: Listener) => listeners.set(channel, listener) },
}));

describe('registerLoudnessListeners', () => {
  const send = vi.fn();
  const event = { sender: { send, isDestroyed: () => false } } as unknown as IpcMainEvent;
  const status = { total: 4, measured: 3, failed: 1 };
  const failed = [{ path: '/music/a.flac', reason: 'silent' }];
  const loudness = { status: vi.fn(), failed: vi.fn(), restart: vi.fn(), prioritise: vi.fn() };
  let database: Database;

  beforeEach(async () => {
    listeners.clear();
    send.mockReset();
    loudness.status.mockReset().mockResolvedValue(status);
    loudness.failed.mockReset().mockResolvedValue(failed);
    loudness.restart.mockReset().mockResolvedValue(undefined);
    loudness.prioritise.mockReset().mockResolvedValue(undefined);
    database = await createTestDatabase();
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

    expect(loudness.prioritise).toHaveBeenCalledExactlyOnceWith(['/music/a.flac', '/music/b.flac']);
  });

  it('forgets every measurement and starts over when the window asks to clear them', async () => {
    await saveTrackLoudness(database, {
      path: '/music/a.flac',
      status: 'failed',
      trackGain: null,
      trackPeak: null,
      albumGain: null,
      albumPeak: null,
      albumTracks: null,
      fileModified: 1,
      fileSize: 1,
      analysisVersion: 1,
      reason: 'silent',
      analysis: null,
    });

    listeners.get('LOUDNESS_CLEAR')?.(event);
    await vi.waitFor(() => expect(loudness.restart).toHaveBeenCalled());

    expect(await executeQuery(database, { query: 'SELECT path FROM track_loudness', variables: [] })).toEqual([]);
  });
});
