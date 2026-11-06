import { EventEmitter } from 'events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { utilityProcess } from 'electron';
import type { ProbeReply, ProbeRequest } from './mount-probe-worker';
import { createMountGuard } from './mount-guard';

vi.mock('electron', () => ({ utilityProcess: { fork: vi.fn() } }));

/** A utility process that answers as the test says: a drive that answers, or one that never does */
class FakeProbe extends EventEmitter {
  requests: ProbeRequest[] = [];
  killed = false;

  postMessage = (request: ProbeRequest) => this.requests.push(request);

  kill = () => {
    this.killed = true;
    return true;
  };

  /** Answers the request that is asked for (the last one by default) */
  answer = (readable: boolean, extra: Partial<ProbeReply> = {}, index = this.requests.length - 1) =>
    this.emit('message', { id: this.requests[index].id, readable, ...extra } satisfies ProbeReply);

  /** The process ends, as one stuck on a share does when the share is back */
  end = () => this.emit('exit', 0);
}

describe('createMountGuard', () => {
  let probes: FakeProbe[];

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    probes = [];
    vi.mocked(utilityProcess.fork).mockImplementation(() => {
      const probe = new FakeProbe();
      probes.push(probe);
      // the fake has the parts of a utility process the guard uses
      return Object.assign(probe, { pid: 1, stdout: null, stderr: null });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(utilityProcess.fork).mockReset();
  });

  it('answers what the process of the mount answers, and keeps the process for the next file', async () => {
    const guard = createMountGuard();

    const first = guard.isReadable('/mnt/nas', '/mnt/nas/a.flac');
    probes[0].answer(true);
    const second = guard.isReadable('/mnt/nas', '/mnt/nas/b.flac');
    probes[0].answer(false);

    expect(await first).toBe(true);
    expect(await second).toBe(false);
    expect(probes).toHaveLength(1);
    expect(probes[0].requests.map(({ path: requested }) => requested)).toEqual(['/mnt/nas/a.flac', '/mnt/nas/b.flac']);
  });

  it('gives up on a file that does not answer in 10 s, and kills the process that waits on the drive', async () => {
    const guard = createMountGuard();

    const answer = guard.isReadable('/mnt/nas', '/mnt/nas/a.flac');
    vi.advanceTimersByTime(10_000);

    expect(await answer).toBe(false);
    expect(probes[0].killed).toBe(true);
  });

  it('answers no without a call to the drive while the process that was stuck on it has not ended', async () => {
    const guard = createMountGuard();
    const stuck = guard.isReadable('/mnt/nas', '/mnt/nas/a.flac');
    vi.advanceTimersByTime(10_000);
    await stuck;

    expect(await guard.isReadable('/mnt/nas', '/mnt/nas/b.flac')).toBe(false);
    expect(await guard.isReadable('/mnt/nas', '/mnt/nas/c.flac')).toBe(false);

    // one request, and no second process
    expect(probes).toHaveLength(1);
    expect(probes[0].requests).toHaveLength(1);
  });

  it('asks again with a new process once the stuck one has ended, which is when the share is back', async () => {
    const guard = createMountGuard();
    const stuck = guard.isReadable('/mnt/nas', '/mnt/nas/a.flac');
    vi.advanceTimersByTime(10_000);
    await stuck;
    probes[0].end();

    const again = guard.isReadable('/mnt/nas', '/mnt/nas/a.flac');
    probes[1].answer(true);

    expect(await again).toBe(true);
    expect(probes).toHaveLength(2);
  });

  it('does not let a mount that is stuck hold up the others', async () => {
    const guard = createMountGuard();
    const stuck = guard.isReadable('/mnt/nas', '/mnt/nas/a.flac');
    vi.advanceTimersByTime(10_000);
    await stuck;

    const local = guard.isReadable('/home/music', '/home/music/a.flac');
    probes[1].answer(true);

    expect(await local).toBe(true);
  });

  it('lets calls on a mount wait at once, and answers each its own', async () => {
    const guard = createMountGuard();

    const first = guard.list('/mnt/nas', '/mnt/nas/a');
    const second = guard.isEmpty('/mnt/nas', '/mnt/nas/b');
    probes[0].answer(true, { empty: true }, 1);
    probes[0].answer(true, { time: 5, names: ['x'], directories: [] }, 0);

    expect(await second).toBe(true);
    expect(await first).toEqual({ readable: true, time: 5, names: ['x'], directories: [] });
    expect(probes).toHaveLength(1);
  });

  it('answers no to all the calls that wait when one gives up, and none reaches the drive after it', async () => {
    const guard = createMountGuard();

    const empty = guard.isEmpty('/mnt/nas', '/mnt/nas/a');
    const time = guard.readTime('/mnt/nas', '/mnt/nas/b');
    const listing = guard.list('/mnt/nas', '/mnt/nas/c');
    vi.advanceTimersByTime(10_000);

    expect([await empty, await time, await listing]).toEqual([undefined, undefined, { readable: false }]);
    expect(await guard.isEmpty('/mnt/nas', '/mnt/nas/a')).toBeUndefined();
    expect(probes[0].requests).toHaveLength(3);
    expect(probes[0].killed).toBe(true);
  });

  it('gives the system error of a folder that cannot be read', async () => {
    const guard = createMountGuard();

    const listing = guard.list('/mnt/nas', '/mnt/nas/gone');
    probes[0].answer(false, { code: 'ENOENT' });

    expect(await listing).toEqual({ readable: false, code: 'ENOENT' });
  });

  it('kills the processes when it is closed', () => {
    const guard = createMountGuard();
    void guard.isReadable('/mnt/nas', '/mnt/nas/a.flac');

    guard.close();

    expect(probes[0].killed).toBe(true);
  });
});
