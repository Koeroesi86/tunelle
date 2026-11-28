import fs from 'fs';
import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryFs, spyOnFs } from '../../electron/test-memory-fs';

const load = async () => {
  spyOnFs(fs);
  vi.resetModules();
  return import('./alias-paths');
};

describe('alias paths', () => {
  beforeEach(() => memoryFs.reset());

  it('points @shared at the shared folder of the output, relative to the file', async () => {
    const { rewrite } = await load();
    const source = 'const a = require("@shared/utils/wait");\nconst b = require("./other");';

    expect(rewrite(source, join('out', 'electron', 'services', 'a.js'), 'out')).toBe(
      'const a = require("../../shared/utils/wait");\nconst b = require("./other");'
    );
  });

  it('uses ./ for a file next to the shared folder', async () => {
    const { rewrite } = await load();

    expect(rewrite('require("@shared/x")', join('out', 'index.js'), 'out')).toBe('require("./shared/x")');
  });

  it('rewrites the scripts of a folder and the ones below it', async () => {
    const { rewriteFolder } = await load();
    const out = join('/', 'out');
    memoryFs.sync.mkdirSync(join(out, 'electron'));
    memoryFs.sync.writeFileSync(join(out, 'electron', 'a.js'), 'require("@shared/utils/wait")');
    memoryFs.sync.writeFileSync(join(out, 'electron', 'a.d.ts'), 'require("@shared/utils/wait")');

    rewriteFolder(out);

    expect(memoryFs.sync.readFileSync(join(out, 'electron', 'a.js'), 'utf8')).toBe('require("../shared/utils/wait")');
    expect(memoryFs.sync.readFileSync(join(out, 'electron', 'a.d.ts'), 'utf8')).toBe('require("@shared/utils/wait")');
  });
});
