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

  answer = (readable: boolean) => this.emit('message', { id: this.requests[this.requests.length - 1].id, readable } satisfies ProbeReply);

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
    expect(probes[0].requests.map(({ fileName }) => fileName)).toEqual(['/mnt/nas/a.flac', '/mnt/nas/b.flac']);
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

  it('kills the processes when it is closed', () => {
    const guard = createMountGuard();
    void guard.isReadable('/mnt/nas', '/mnt/nas/a.flac');

    guard.close();

    expect(probes[0].killed).toBe(true);
  });
});
