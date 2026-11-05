import { describe, expect, it } from 'vitest';
import { toHex } from './to-hex';

describe('toHex', () => {
  it('writes channels as a padded hex colour, rounded', () => {
    expect([toHex([255, 134, 134]), toHex([0, 0.4, 15.6])]).toEqual(['#ff8686', '#000010']);
  });
});
