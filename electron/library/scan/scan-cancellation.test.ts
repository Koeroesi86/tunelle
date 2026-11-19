import { beforeEach, describe, expect, it, vi } from 'vitest';

type Cancellation = typeof import('./scan-cancellation');
type Queue = typeof import('../tasks/background-queue');

describe('scanCancellation', () => {
  let cancelScans: Cancellation['cancelScans'];
  let cancelScansInside: Cancellation['cancelScansInside'];
  let quitSignal: Cancellation['quitSignal'];
  let trackScan: Cancellation['trackScan'];
  let backgroundQueue: Queue['backgroundQueue'];
  let scanKind: Queue['scanKind'];

  // the quit signal and the running scans are state of the module, so each test gets a new one
  beforeEach(async () => {
    vi.resetModules();
    ({ cancelScans, cancelScansInside, quitSignal, trackScan } = await import('./scan-cancellation'));
    ({ backgroundQueue, scanKind } = await import('../tasks/background-queue'));
  });

  it('stops the scans of a folder that is removed, and of the folders around it, not of another', () => {
    const inside = trackScan('/music/jazz/live');
    const same = trackScan('/music/jazz');
    const parent = trackScan('/music');
    const other = trackScan('/music-more');

    cancelScansInside('/music/jazz');

    expect([inside, same, parent, other].map((scan) => scan.signal.aborted)).toEqual([true, true, true, false]);
    expect(inside.wasRemoved()).toBe(true);
    expect(other.wasRemoved()).toBe(false);
    [inside, same, parent, other].forEach((scan) => scan.release());
  });

  it('tells the background queue that a scan is going on until all the scans have ended', () => {
    const first = trackScan('/music/a');
    const second = trackScan('/music/b');
    first.release();
    expect(backgroundQueue.isBusy(scanKind)).toBe(true);

    second.release();

    expect(backgroundQueue.isBusy(scanKind)).toBe(false);
  });

  it('forgets a scan that ended', () => {
    const scan = trackScan('/music');
    scan.release();

    cancelScansInside('/music');

    expect(scan.signal.aborted).toBe(false);
  });

  it('aborts the quit signal once the scans are cancelled, which is not a removal', () => {
    const scan = trackScan('/music');
    expect(quitSignal.aborted).toBe(false);

    cancelScans();

    expect(quitSignal.aborted).toBe(true);
    expect(scan.signal.aborted).toBe(true);
    expect(scan.wasRemoved()).toBe(false);
  });
});
