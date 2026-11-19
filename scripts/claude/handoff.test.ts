import { describe, expect, it } from 'vitest';
import { formatHandoff } from './handoff';

const state = { branch: 'fix/1', dirty: [' M a.ts', ' M b.ts'], commits: ['abc one', 'def two'], stat: [], pullRequest: undefined };

describe('formatHandoff', () => {
  it('holds the facts and the three notes', () => {
    const text = formatHandoff(state, { next: 'open the PR', decisions: 'no cache', unverified: 'windows' });

    expect(text).toContain('branch: fix/1, 2 commits ahead of origin/master, 2 uncommitted files');
    expect(text).toContain('pull request: none');
    expect(text).toContain('uncommitted:  M a.ts;  M b.ts');
    expect(text).toContain('next: open the PR');
    expect(text).toContain('decisions not in the code: no cache');
    expect(text).toContain('not verified: windows');
  });

  it('says what was not given and stays within 15 lines', () => {
    const many = {
      ...state,
      commits: Array.from({ length: 40 }, (_, index) => `c${index} x`),
      dirty: Array.from({ length: 40 }, (_, index) => ` M f${index}`),
    };

    const text = formatHandoff(many, {});

    expect(text.split('\n').length).toBeLessThanOrEqual(15);
    expect(text).toContain('and 35 more');
  });
});
