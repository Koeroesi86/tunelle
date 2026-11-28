import { beforeEach, describe, expect, it, vi } from 'vitest';
import { join, resolve } from 'path';
import { memoryFs } from '../../electron/test-memory-fs';
import { findEditProblem, findFilesWithoutReason, findMissingReason } from './test-tier-reason';

vi.mock('fs', async () => {
  const { memoryFs } = await import('../../electron/test-memory-fs');
  return { ...memoryFs.sync, default: memoryFs.sync };
});

const root = resolve(__dirname, '../..');
const spec = 'e2e/functional/new.spec.ts';
const integration = 'electron/new.integration.test.ts';
const code = "import { it } from 'vitest';\n";
const appReason = '// Needs the real app: Chromium raises the media error\n';
const databaseReason = '// Needs the real database: the order SQLite gives\n';

const write = (file: string, text: string) => {
  memoryFs.sync.mkdirSync(join(root, file, '..'));
  memoryFs.sync.writeFileSync(join(root, file), text);
};

beforeEach(() => memoryFs.reset());

describe('findMissingReason', () => {
  it.each([
    [spec, code],
    [spec, databaseReason],
    [spec, '// Needs the real app:\n'],
    [spec, `  ${appReason}`],
    [integration, code],
    [integration, '// Needs the real database:\n'],
    ['scripts/tooling/new.integration.test.ts', code],
    ['.claude/hooks/new.integration.test.ts', code],
  ])('finds %s with %j', (file, text) => {
    expect(findMissingReason(file, text)).toContain(`${file} lacks the line`);
  });

  it.each([
    [spec, code + appReason],
    [spec, appReason.replace('\n', '\r\n')],
    [integration, databaseReason + code],
    ['electron/new.test.ts', code],
    ['e2e/support/app.ts', code],
  ])('accepts %s with %j', (file, text) => {
    expect(findMissingReason(file, text)).toBeUndefined();
  });

  it('takes an absolute path as well', () => {
    expect(findMissingReason(join(root, spec), code)).toContain(`${spec} lacks the line`);
  });
});

describe('findFilesWithoutReason', () => {
  it('lists the files of both tiers that lack the reason', () => {
    write(spec, code);
    write('e2e/functional/old.spec.ts', appReason);
    write(integration, code);
    write('electron/new.test.ts', code);
    write('scripts/node_modules/package/a.integration.test.ts', code);

    expect(findFilesWithoutReason()).toEqual([expect.stringContaining(spec), expect.stringContaining(integration)]);
  });
});

describe('findEditProblem', () => {
  it('finds a new file written without the reason', () => {
    expect(findEditProblem({ file_path: join(root, spec), content: code })).toContain(spec);
  });

  it('finds a new file made by an edit', () => {
    expect(findEditProblem({ file_path: spec, old_string: '', new_string: code })).toContain(spec);
  });

  it('accepts a new file written with the reason', () => {
    expect(findEditProblem({ file_path: spec, content: appReason + code })).toBeUndefined();
  });

  it('finds a rewrite that drops the reason', () => {
    write(spec, appReason + code);

    expect(findEditProblem({ file_path: spec, content: code })).toContain(spec);
  });

  it.each([false, true])('finds an edit that drops the reason, replace_all %s', (all) => {
    write(spec, appReason + code);

    expect(findEditProblem({ file_path: spec, old_string: appReason, new_string: '', replace_all: all })).toContain(spec);
  });

  it('accepts an edit that keeps the reason, with a $ in the new text', () => {
    write(spec, appReason + code);

    expect(findEditProblem({ file_path: spec, old_string: 'it', new_string: "it, '$&'" })).toBeUndefined();
  });

  it('accepts an edit of a file that lacks the reason already', () => {
    write(spec, code);

    expect(findEditProblem({ file_path: spec, old_string: 'it', new_string: 'test' })).toBeUndefined();
  });
});
