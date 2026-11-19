import { describe, expect, it } from 'vitest';
import { issueNumber, summariseChecks, trimIssue } from './git-state';

describe('summariseChecks', () => {
  it('counts passed, failed (with names) and pending checks of runs and statuses', () => {
    const checks = [
      { name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { name: 'test (windows)', status: 'COMPLETED', conclusion: 'FAILURE' },
      { name: 'dist', status: 'IN_PROGRESS', conclusion: '' },
      { context: 'osv', state: 'SUCCESS' },
    ];

    expect(summariseChecks(checks)).toBe('2 passed, 1 failed (test (windows)), 1 pending');
  });

  it('is empty without checks', () => {
    expect(summariseChecks([])).toBe('0 passed, 0 failed, 0 pending');
  });
});

describe('trimIssue', () => {
  it('drops comments, keeps every heading and cuts each section and the total', () => {
    const body = `<!-- template -->\n## Problem\n${'line\n'.repeat(30)}## How to check\nrun it`;

    const trimmed = trimIssue(body, 5, 100).split('\n');

    expect(trimmed).toEqual(['## Problem', 'line', 'line', 'line', 'line', '## How to check', 'run it']);
    expect(trimIssue(body, 5, 3).split('\n')).toHaveLength(3);
  });
});

describe('issueNumber', () => {
  const pullRequest = { number: 9, state: 'OPEN', url: '', statusCheckRollup: [], closingIssuesReferences: [{ number: 347 }] };

  it.each([
    ['an argument first', '#12', 'feat/99-x', pullRequest, '12'],
    ['the issue the pull request closes', undefined, 'feat/99-x', pullRequest, '347'],
    ['the number in the branch name', undefined, 'fix/488-sponsor', undefined, '488'],
    ['nothing', undefined, 'feat/sponsor-links', undefined, undefined],
  ])('takes %s', (_name, argument, branch, pr, expected) => {
    expect(issueNumber(argument, branch, pr)).toBe(expected);
  });
});
