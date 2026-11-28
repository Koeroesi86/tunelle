// Needs the real files: the specs and integration tests that the repository holds
import { describe, expect, it } from 'vitest';
import { findFilesWithoutReason } from './test-tier-reason';

describe('end to end specs and integration tests', () => {
  it('each say what the tier below can not show', () => {
    expect(findFilesWithoutReason()).toEqual([]);
  });
});
