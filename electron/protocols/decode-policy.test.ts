import { describe, expect, it } from 'vitest';
import { aheadBytes, fastAheadSeconds } from './decode-policy';

describe('aheadBytes', () => {
  it('limits a fast source to a window of seconds of audio', () => {
    expect(aheadBytes('fast', 100)).toBe(100 * fastAheadSeconds);
  });

  it('lets a slow source decode to the end', () => {
    expect(aheadBytes('slow', 100)).toBe(Infinity);
  });
});
