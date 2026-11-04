import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';

class FakeProcess extends EventEmitter {
  messages: { id: number; fileName: string; appDataPath: string }[] = [];
  kill = vi.fn(() => {
    this.emit('exit', 0);
    return true;
  });
  postMessage = (message: { id: number; fileName: string; appDataPath: string }) => {
    this.messages.push(message);
  };
}

const forked: FakeProcess[] = [];
const fork = vi.fn((..._args: unknown[]) => {
  const child = new FakeProcess();
  forked.push(child);
  return child;
});

vi.mock('electron', () => ({ utilityProcess: { fork: (...args: unknown[]) => fork(...args) } }));

const { createTrackReader } = await import('./trackReader');

const track = { path: '/a.flac', artist: '', album: '', title: 'A', year: '', track: '', disk: '', genre: '', picture: null, duration: 1 };

describe('trackReader in a utility process', () => {
  beforeEach(() => {
    forked.length = 0;
    fork.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts one process with the first file and answers with its tags', async () => {
    const reader = createTrackReader();

    const first = reader.read('/a.flac', '/data', 1000);
    forked[0].emit('message', { id: forked[0].messages[0].id, track });
    const second = reader.read('/b.flac', '/data', 1000);
    forked[0].emit('message', { id: forked[0].messages[1].id, track: { ...track, title: 'B' } });

    expect((await first).title).toBe('A');
    expect((await second).title).toBe('B');
    expect(fork).toHaveBeenCalledTimes(1);
    expect(forked[0].messages[0]).toMatchObject({ fileName: '/a.flac', appDataPath: '/data' });
  });

  it('fails with the reason the process gives', async () => {
    const reader = createTrackReader();

    const read = reader.read('/a.flac', '/data', 1000);
    forked[0].emit('message', { id: forked[0].messages[0].id, error: 'Bad tags' });

    await expect(read).rejects.toThrow('Bad tags');
  });

  it('ignores an answer nobody waits for', () => {
    const reader = createTrackReader();
    reader.read('/a.flac', '/data', 1000).catch(() => undefined);

    expect(() => forked[0].emit('message', { id: 999, track })).not.toThrow();
  });

  it('replaces the process that does not answer in time, and the late end of it fails nothing of the next', async () => {
    vi.useFakeTimers();
    const reader = createTrackReader();

    const stuck = reader.read('/slow.flac', '/data', 2000);
    const stuckResult = expect(stuck).rejects.toThrow('File access timeout /slow.flac');
    await vi.advanceTimersByTimeAsync(2000);
    await stuckResult;
    const next = reader.read('/b.flac', '/data', 2000);
    forked[0].emit('exit', 0);
    forked[1].emit('message', { id: forked[1].messages[0].id, track });

    expect(forked[0].kill).toHaveBeenCalled();
    expect(forked).toHaveLength(2);
    await expect(next).resolves.toMatchObject({ title: 'A' });
  });

  it('fails the file when the process ends in the middle of it, and starts another for the next', async () => {
    const reader = createTrackReader();

    const read = reader.read('/a.flac', '/data', 1000);
    forked[0].emit('exit', 1);

    await expect(read).rejects.toThrow('The library reader ended');
    reader.read('/b.flac', '/data', 1000).catch(() => undefined);
    expect(forked).toHaveLength(2);
  });

  it('ends the process on close', () => {
    const reader = createTrackReader();
    reader.read('/a.flac', '/data', 1000).catch(() => undefined);

    reader.close();

    expect(forked[0].kill).toHaveBeenCalled();
  });
});
