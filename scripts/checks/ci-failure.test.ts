import { describe, expect, it } from 'vitest';
import { describeJob, failedJobs, firstError, parseRunId } from './ci-failure';

describe('parseRunId', () => {
  it.each([
    ['https://github.com/Koeroesi86/tunelle/actions/runs/123456/job/789', '123456'],
    ['https://github.com/Koeroesi86/tunelle/actions/runs/123456', '123456'],
    ['123456', '123456'],
  ])('reads the run of %s', (value, expected) => {
    expect(parseRunId(value)).toBe(expected);
  });
});

describe('failedJobs', () => {
  it('keeps the failed jobs with the step that failed', () => {
    const jobs = [
      { name: 'build (ubuntu-latest)', databaseId: 1, conclusion: 'success', steps: [] },
      {
        name: 'build (windows-latest)',
        databaseId: 2,
        conclusion: 'failure',
        steps: [
          { name: 'Install', conclusion: 'success' },
          { name: 'Run tests', conclusion: 'failure' },
        ],
      },
      { name: 'dist', databaseId: 3, conclusion: 'failure', steps: [] },
    ];

    expect(failedJobs(jobs)).toEqual([
      { name: 'build (windows-latest)', databaseId: 2, step: 'Run tests' },
      { name: 'dist', databaseId: 3, step: undefined },
    ]);
  });
});

describe('firstError', () => {
  it('finds the first error and not the cascade after it', () => {
    expect(firstError('ok\n  TypeError: x is not a function  \nError: cascade')).toBe('TypeError: x is not a function');
  });

  it('returns undefined when the log holds no error', () => {
    expect(firstError('all fine')).toBeUndefined();
  });
});

describe('describeJob', () => {
  it('names the job, the step and the error, then the end of the log', () => {
    const log = Array.from({ length: 100 }, (_, index) => (index === 10 ? 'Error: boom' : `line ${index}`)).join('\n');

    const lines = describeJob({ name: 'test', step: 'Run tests' }, log).split('\n');

    expect(lines.slice(0, 3)).toEqual(['FAILED test', 'step: Run tests', 'first error: Error: boom']);
    expect(lines.at(-1)).toBe('line 99');
  });
});
