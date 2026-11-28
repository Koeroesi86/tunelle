// Needs the real files: the unit tests that the repository holds
import { describe, expect, it } from 'vitest';
import { findRealWorldTests } from './unit-test-isolation';

describe('unit tests', () => {
  it('use no real database, folder, server or process', () => {
    expect(findRealWorldTests()).toEqual([]);
  });
});
