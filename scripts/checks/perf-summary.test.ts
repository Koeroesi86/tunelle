import fs from 'fs';
import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryFs } from '../../electron/test-memory-fs';
import { change, flatten, median, toMarkdown } from './perf-summary';

describe('flatten', () => {
  it('names the numbers by their path and leaves out lists and text', () => {
    expect(flatten({ tracks: 'real', scan: { seconds: 8.3, mainLoop: { maxMs: 90, blocks: [{ atMs: 1 }] }, hidden: true } })).toEqual([
      ['scan.seconds', 8.3],
      ['scan.mainLoop.maxMs', 90],
      ['scan.hidden', 1],
    ]);
  });
});

describe('change', () => {
  it('is the signed percent from the base, in bold from a fifth', () => {
    expect(change(105, 100)).toBe('+5%');
    expect(change(90, 100)).toBe('-10%');
    expect(change(150, 100)).toBe('**+50%**');
    expect(change(50, 100)).toBe('**-50%**');
  });

  it('says new for a number the base had as 0, and is empty without one of the two', () => {
    expect(change(3, 0)).toBe('new');
    expect(change(0, 0)).toBe('0%');
    expect(change(3, undefined)).toBe('');
    expect(change(undefined, 3)).toBe('');
  });
});

describe('toMarkdown', () => {
  it('has a row for each number and a column for each system, empty where a system lacks one', () => {
    const text = toMarkdown({ 'macos-15': { pr: { startup: { toPageMs: 7.123 } } }, 'ubuntu-latest': { pr: { startup: { toPageMs: 650, extra: 1 } } } });

    expect(text).toContain('<summary><b>startup</b>, 2 numbers</summary>');
    expect(text).toContain('| | macos-15 | ubuntu-latest |');
    expect(text).toContain('| toPageMs | 7.12 | 650 |');
    expect(text).toContain('| extra |  | 1 |');
  });

  it('puts the base and the change next to the number of each system when the base was measured', () => {
    const text = toMarkdown({ 'ubuntu-latest': { base: { startup: { toPageMs: 100, gone: 5 } }, pr: { startup: { toPageMs: 150, added: 2 } } } });

    expect(text).toContain('| | ubuntu-latest base | ubuntu-latest PR | change |');
    expect(text).toContain('| toPageMs | 100 | 150 | **+50%** |');
    expect(text).toContain('| added |  | 2 |  |');
    expect(text).not.toContain('gone');
  });

  it('puts the numbers that changed by a fifth or more on top, with the unit and which way is worse, and the tables in collapsed blocks', () => {
    const text = toMarkdown({
      'ubuntu-latest': {
        base: { scan: { maxFrameMs: 30, scrollSeconds: 10, steadyMs: 100 }, startup: { toPageMs: 600 } },
        pr: { scan: { maxFrameMs: 50, scrollSeconds: 6, steadyMs: 105 }, startup: { toPageMs: 590 } },
      },
    });
    const [top] = text.split('<details>');

    expect(top).toContain('**2 of 4 numbers changed by a fifth or more**');
    expect(top).toContain('| 🔴 scan.maxFrameMs | 30 → 50 ms (**+67%**) |');
    expect(top).toContain('| 🟢 scan.scrollSeconds | 10 → 6 s (**-40%**) |');
    expect(top).not.toContain('steadyMs');
    expect(top).not.toContain('toPageMs');
    expect(text).toContain('<summary><b>scan</b>, 3 numbers, 2 changed</summary>');
    expect(text).toContain('<summary><b>startup</b>, 1 numbers, 0 changed</summary>');
    expect(text).toContain('| steadyMs | 100 | 105 | +5% |');
    expect(text.match(/<details>/g)).toHaveLength(2);
    expect(text.match(/<\/details>/g)).toHaveLength(2);
  });

  it('marks a number that is worse on one system and better on another', () => {
    const text = toMarkdown({
      a: { base: { m: { xMs: 100 } }, pr: { m: { xMs: 150 } } },
      b: { base: { m: { xMs: 100 } }, pr: { m: { xMs: 50 } } },
    });

    expect(text).toContain('| ⚠️ m.xMs | 100 → 150 ms (**+50%**) | 100 → 50 ms (**-50%**) |');
  });

  it('says so when nothing changed by a fifth, and has no summary without a base', () => {
    const same = toMarkdown({ a: { base: { m: { xMs: 100 } }, pr: { m: { xMs: 105 } } } });
    const alone = toMarkdown({ a: { pr: { m: { xMs: 105 } } } });

    expect(same).toContain('**No number of 1 changed by a fifth or more.**');
    expect(alone).not.toContain('changed by a fifth');
    expect(alone).toContain('<summary><b>m</b>, 1 numbers</summary>');
  });

  it('says so when there is nothing', () => {
    expect(toMarkdown({})).toContain('No measurements were found');
  });
});

describe('readSystems', () => {
  const folder = '/artifacts';

  // the script takes the functions of fs when it loads, so it loads again after the spies are set
  const load = async () => {
    vi.spyOn(fs, 'readdirSync').mockImplementation(memoryFs.sync.readdirSync as never);
    vi.spyOn(fs, 'readFileSync').mockImplementation(memoryFs.sync.readFileSync as never);
    vi.spyOn(fs, 'statSync').mockImplementation(memoryFs.sync.statSync as never);
    vi.resetModules();
    return (await import('./perf-summary')).readSystems;
  };

  beforeEach(() => {
    memoryFs.reset();
    memoryFs.sync.mkdirSync(folder);
  });

  it('reads the perf files of each artifact folder, the base ones apart', async () => {
    memoryFs.sync.mkdirSync(join(folder, 'perf-windows-2025'));
    memoryFs.sync.mkdirSync(join(folder, 'base-perf-windows-2025'));
    memoryFs.sync.writeFileSync(join(folder, 'perf-windows-2025', 'perf-startup.json'), '{"a":1}');
    memoryFs.sync.writeFileSync(join(folder, 'perf-windows-2025', 'other.json'), '{"b":2}');
    memoryFs.sync.writeFileSync(join(folder, 'base-perf-windows-2025', 'perf-startup.json'), '{"a":2}');
    memoryFs.sync.writeFileSync(join(folder, 'notes.txt'), 'not a folder');

    expect((await load())(folder)).toEqual({ 'windows-2025': { pr: { startup: { a: 1 } }, base: { startup: { a: 2 } } } });
  });

  it('takes the median of the runs of a measurement, the later runs being perf-<name>.<n>.json', async () => {
    memoryFs.sync.mkdirSync(join(folder, 'perf-ubuntu-latest'));
    memoryFs.sync.writeFileSync(join(folder, 'perf-ubuntu-latest', 'perf-startup.json'), '{"scan":{"seconds":10},"tracks":5}');
    memoryFs.sync.writeFileSync(join(folder, 'perf-ubuntu-latest', 'perf-startup.1.json'), '{"scan":{"seconds":30},"tracks":5}');
    memoryFs.sync.writeFileSync(join(folder, 'perf-ubuntu-latest', 'perf-startup.2.json'), '{"scan":{"seconds":12},"tracks":5}');

    expect((await load())(folder)).toEqual({ 'ubuntu-latest': { pr: { startup: { 'scan.seconds': 12, tracks: 5 } } } });
  });
});

describe('median', () => {
  it('is the middle one, and the mean of the two in the middle of an even number', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});
