import { describe, expect, it } from 'vitest';
import { isRecord } from './is-record';

describe('isRecord', () => {
  it('accepts objects and arrays, not null or text', () => {
    expect([{}, [], null, 'a', undefined].map(isRecord)).toEqual([true, true, false, false, false]);
  });
});
