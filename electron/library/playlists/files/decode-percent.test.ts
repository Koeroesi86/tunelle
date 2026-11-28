import { describe, expect, it } from 'vitest';
import { decodePercent } from './decode-percent';

describe('decodePercent', () => {
  it.each([
    ['a%20b%23c%25d', 'a b#c%d'],
    ['Caf%C3%A9%20%F0%9F%8E%B5', 'Café 🎵'],
    ['100%.flac', '100%.flac'],
    ['100% %2 %zz %20', '100% %2 %zz  '],
    // one byte of another encoding is no UTF-8
    ['Caf%E9%20ok', 'Caf%E9%20ok'],
    ['Caf%E9.%20ok', 'Caf%E9. ok'],
  ])('reads %j as %j', (text, expected) => {
    expect(decodePercent(text)).toBe(expected);
  });
});
