// Needs the real files: the pages built from the templates and strings of site/
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildSite } from './build-site';

const release = { tag_name: 'v26.10.14', body: '', assets: [] };

describe('buildSite', () => {
  let folder: string;

  afterEach(() => rmSync(folder, { recursive: true, force: true }));

  it('writes the page of the repository without a placeholder left', () => {
    folder = mkdtempSync(join(tmpdir(), 'tunelle-site-'));
    writeFileSync(join(folder, 'release.json'), JSON.stringify(release));

    buildSite(join(folder, 'release.json'), join(folder, 'out'));
    const html = readFileSync(join(folder, 'out', 'index.html'), 'utf8');

    const hungarian = readFileSync(join(folder, 'out', 'hu', 'index.html'), 'utf8');

    expect(html).not.toMatch(/\{\{/);
    expect(hungarian).not.toMatch(/\{\{/);
    expect(html).toContain('26.10.14');
    expect(hungarian).toContain('26.10.14');
    expect(existsSync(join(folder, 'out', 'privacy.html'))).toBe(true);
    expect(existsSync(join(folder, 'out', 'hu', 'privacy.html'))).toBe(true);
    expect(existsSync(join(folder, 'out', 'templates'))).toBe(false);
    expect(existsSync(join(folder, 'out', 'strings'))).toBe(false);
    expect(readFileSync(join(folder, 'out', 'download.js'), 'utf8')).toBe(readFileSync(resolve(__dirname, '../..', 'site', 'download.js'), 'utf8'));
  });
});
