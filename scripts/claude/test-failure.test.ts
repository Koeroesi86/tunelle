import { describe, expect, it } from 'vitest';
import { parseReport, summarise } from './test-failure';

const report = {
  numTotalTests: 3,
  numFailedTests: 1,
  testResults: [
    {
      name: '/repo/a.test.ts',
      message: '',
      assertionResults: [
        { fullName: 'a works', status: 'passed', failureMessages: [] },
        { fullName: 'a breaks', status: 'failed', failureMessages: ['expected 1 to be 2', 'at line 3'] },
      ],
    },
    { name: '/repo/b.test.ts', message: 'Error: cannot import x', assertionResults: [] },
  ],
};

describe('parseReport', () => {
  it('reads the JSON between the noise of the output', () => {
    expect(parseReport(`warn\n${JSON.stringify(report)}\n`)?.numTotalTests).toBe(3);
  });

  it.each(['', 'no json', '{broken', '{"a":1}'])('gives nothing for %j', (output) => {
    expect(parseReport(output)).toBeUndefined();
  });
});

describe('summarise', () => {
  it('prints the totals, each failed test and a file that did not run', () => {
    const text = summarise(parseReport(JSON.stringify(report)) ?? report, '/repo');

    expect(text).toContain('2 of 3 tests passed');
    expect(text).toContain('FAIL a.test.ts > a breaks\nexpected 1 to be 2');
    expect(text).toContain('FAIL b.test.ts\nError: cannot import x');
    expect(text).not.toContain('a works');
  });
});
