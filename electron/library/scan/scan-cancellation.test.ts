import { describe, expect, it } from 'vitest';
import { cancelScans, cancelScansInside, quitSignal, trackScan } from './scan-cancellation';

describe('scanCancellation', () => {
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
