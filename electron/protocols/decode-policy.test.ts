import { describe, expect, it } from 'vitest';
import { behindBytes, fastAheadSeconds, maxWindows, slowAheadSeconds, windowMemoryLimit, windowReach } from './decode-policy';

describe('windowReach', () => {
  it.each([
    ['fast' as const, fastAheadSeconds],
    ['slow' as const, slowAheadSeconds],
  ])('reaches the seconds of a %s source ahead of a read, and a fixed number of bytes behind it', (speed, seconds) => {
    expect(windowReach(speed, 100)).toEqual({ ahead: 100 * seconds, behind: behindBytes });
  });

  it('keeps more of a slow source than of a fast one', () => {
    expect(windowReach('slow', 100).ahead).toBeGreaterThan(windowReach('fast', 100).ahead);
  });

  it.each(['fast' as const, 'slow' as const])('keeps a window of the largest layout of a %s source within its share of the memory', (speed) => {
    const { ahead, behind } = windowReach(speed, 768_000 * 2 * 4);

    expect(ahead + behind).toBeCloseTo(windowMemoryLimit / maxWindows);
  });
});
