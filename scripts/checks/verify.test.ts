import { describe, expect, it } from 'vitest';
import { report, runChecks, tail } from './verify';

const list: [string, string[]][] = [
  ['one', ['run', 'one']],
  ['two', ['run', 'two']],
  ['three', ['run', 'three']],
];

describe('runChecks', () => {
  it('runs every check when they pass', () => {
    const results = runChecks(list, () => ({ ok: true, output: '' }));

    expect(results.map(({ name }) => name)).toEqual(['one', 'two', 'three']);
  });

  it('stops after the first failure', () => {
    const results = runChecks(list, ([, name]) => ({ ok: name !== 'two', output: name }));

    expect(results.map(({ name, ok }) => [name, ok])).toEqual([
      ['one', true],
      ['two', false],
    ]);
  });

  it('starts from the named check', () => {
    const results = runChecks(list, () => ({ ok: true, output: '' }), 'two');

    expect(results.map(({ name }) => name)).toEqual(['two', 'three']);
  });
});

describe('report', () => {
  it('lists a pass in one line and only the end of a failure', () => {
    const output = Array.from({ length: 100 }, (_, index) => `line ${index}`).join('\n');

    const lines = report([
      { name: 'one', ok: true, output },
      { name: 'two', ok: false, output },
    ]).split('\n');

    expect(lines[0]).toBe('PASS one');
    expect(lines[1]).toBe('FAIL two');
    expect(lines).toHaveLength(2 + 40);
    expect(lines.at(-1)).toBe('line 99');
  });
});

describe('tail', () => {
  it('keeps the last lines without the trailing newline', () => {
    expect(tail('a\nb\nc\n', 2)).toBe('b\nc');
  });
});
