import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { assertNewer, compareVersions, createVersion, stampMetainfo, stampVersion, versionPattern } from './version';

describe('createVersion', () => {
  it.each([
    [new Date(2026, 9, 22), 14, '26.10.14'],
    [new Date(2027, 0, 3), 1, '27.1.1'],
    [new Date(2026, 5, 30), 120, '26.6.120'],
  ])('writes %s and run %s as %s', (date, runNumber, expected) => {
    const version = createVersion(date, runNumber);

    expect(version).toBe(expected);
    expect(version).toMatch(versionPattern);
  });
});

describe('compareVersions', () => {
  it.each([
    ['26.10.14', '26.10.9', 1],
    ['26.10.9', '26.10.14', -1],
    ['26.10.14', '26.10.14', 0],
    ['26.11.1', '26.10.99', 1],
    ['27.1.1', '26.12.50', 1],
    ['26.9.50', '26.10.1', -1],
  ])('orders %s against %s as %s', (a, b, sign) => {
    expect(Math.sign(compareVersions(a, b))).toBe(sign);
  });
});

describe('assertNewer', () => {
  it.each([
    ['26.10.15', 'v26.10.14'],
    ['26.10.100', 'v26.10.99'],
    ['26.11.1', 'v26.10.14'],
    ['26.10.1', ''],
    ['26.10.1', undefined],
  ])('accepts %s after %j', (version, latest) => {
    expect(() => assertNewer(version, latest)).not.toThrow();
  });

  it.each([
    ['26.10.14', 'v26.10.14'],
    ['26.10.3', 'v26.10.14'],
    ['26.9.99', 'v26.10.1'],
  ])('refuses %s after %s', (version, latest) => {
    expect(() => assertNewer(version, latest)).toThrow('is not greater than the latest release');
  });
});

describe('stampVersion', () => {
  const folders: string[] = [];
  const createPackage = () => {
    const folder = mkdtempSync(join(tmpdir(), 'tunelle-version-'));
    folders.push(folder);
    const packagePath = join(folder, 'package.json');
    writeFileSync(packagePath, JSON.stringify({ name: 'tunelle', version: '1.0.0' }));
    return packagePath;
  };

  afterEach(() => folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true })));

  it('writes the version and keeps the rest of the package', () => {
    const packagePath = createPackage();

    stampVersion(packagePath, '26.10.14');

    expect(JSON.parse(readFileSync(packagePath, 'utf8'))).toEqual({ name: 'tunelle', version: '26.10.14' });
  });

  it.each(['1.0.0-master', '26.06.14', '26.13.1', '26.10.', 'v26.10.14', ''])('refuses %j', (version) => {
    const packagePath = createPackage();

    expect(() => stampVersion(packagePath, version)).toThrow('is not a version');
    expect(JSON.parse(readFileSync(packagePath, 'utf8')).version).toBe('1.0.0');
  });
});

describe('command line', () => {
  const run = (args: string[], env: Record<string, string>) => {
    const output = execFileSync(process.execPath, [join(__dirname, 'version.js'), ...args], { env, encoding: 'utf8', stdio: 'pipe' });
    return output.trim();
  };

  it('prints the version of a new release from the run number', () => {
    expect(run([], { GITHUB_RUN_NUMBER: '14' })).toMatch(new RegExp(`^\\d{2}\\.[1-9]\\d?\\.14$`));
  });

  it('refuses a run number that is not greater than the latest release', () => {
    expect(() => run(['--after', 'v99.12.1'], { GITHUB_RUN_NUMBER: '14' })).toThrow('is not greater than the latest release v99.12.1');
  });

  it('prints the version when it is greater than the latest release or there is none', () => {
    expect(run(['--after', 'v20.1.1'], { GITHUB_RUN_NUMBER: '14' })).toMatch(/\.14$/);
    expect(run(['--after', ''], { GITHUB_RUN_NUMBER: '14' })).toMatch(/\.14$/);
  });

  it('refuses to print a version without a run number', () => {
    expect(() => run([], {})).toThrow('GITHUB_RUN_NUMBER is not set');
  });
});

describe('stampMetainfo', () => {
  it('replaces the release entry with the version, the date, the notes in both languages and the link to the release', () => {
    const folder = mkdtempSync(join(tmpdir(), 'tunelle-metainfo-'));
    const path = join(folder, 'metainfo.xml');
    writeFileSync(path, '<releases>\n    <release version="26.10.9" date="2026-10-29"/>\n  </releases>\n');

    stampMetainfo(path, '26.11.19', new Date('2026-11-04T06:00:00Z'), 'Koeroesi86/tunelle');
    const stamped = readFileSync(path, 'utf8');
    rmSync(folder, { recursive: true });

    expect(stamped).toContain('<release version="26.11.19" date="2026-11-04">');
    expect(stamped).toContain('<p>Bug fixes and improvements.</p>');
    expect(stamped).toContain('<p xml:lang="hu">Hibajavítások és fejlesztések.</p>');
    expect(stamped).toContain('<url type="details">https://github.com/Koeroesi86/tunelle/releases/tag/v26.11.19</url>');
    expect(stamped).not.toContain('26.10.9');
  });

  it('replaces an entry that already has a description the same way', () => {
    const folder = mkdtempSync(join(tmpdir(), 'tunelle-metainfo-'));
    const path = join(folder, 'metainfo.xml');
    writeFileSync(path, '<releases>\n    <release version="1.0.0" date="2026-01-01"><description><p>old</p></description></release>\n  </releases>\n');

    stampMetainfo(path, '26.11.19', new Date('2026-11-04T06:00:00Z'), 'Koeroesi86/tunelle');
    const stamped = readFileSync(path, 'utf8');
    rmSync(folder, { recursive: true });

    expect(stamped).not.toContain('old');
    expect(stamped.match(/<release /g)).toHaveLength(1);
  });
});
