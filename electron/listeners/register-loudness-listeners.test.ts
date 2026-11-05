import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IpcMainEvent } from 'electron';
import type { Database } from 'sqlite3';
import type { ListenerContext } from './listener-context';
import registerLoudnessListeners from './register-loudness-listeners';
import executeQuery from '../database/execute-query';
import { createTestDatabase } from '../test-database';
import { isPlaying, setPlaying } from '../library/loudness/playback-state';
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
  const loudness = { status: vi.fn(), restart: vi.fn() };
  let database: Database;

  beforeEach(async () => {
    listeners.clear();
    send.mockReset();
    loudness.status.mockReset().mockResolvedValue(status);
    loudness.restart.mockReset().mockResolvedValue(undefined);
    database = await createTestDatabase();
    registerLoudnessListeners({ database, loudness } as unknown as ListenerContext);
    setPlaying(false);
  });

  it('keeps whether the player plays, and takes anything but a true as stopped', () => {
    listeners.get('PLAYBACK_STATE')?.(event, { isPlaying: true });
    expect(isPlaying()).toBe(true);

    listeners.get('PLAYBACK_STATE')?.(event, { isPlaying: 'yes' });
    expect(isPlaying()).toBe(false);

    listeners.get('PLAYBACK_STATE')?.(event, { isPlaying: true });
    listeners.get('PLAYBACK_STATE')?.(event, undefined);
    expect(isPlaying()).toBe(false);
  });

  it('tells the window how far the measurement is when it asks', async () => {
    listeners.get('LOUDNESS_STATUS_LOAD')?.(event);
    await vi.waitFor(() => expect(send).toHaveBeenCalled());

    expect(send).toHaveBeenCalledWith('LOUDNESS_STATUS', status);
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
