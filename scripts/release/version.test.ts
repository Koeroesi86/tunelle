import fs from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryFs, spyOnFs } from '../../electron/test-memory-fs';
import { assertNewer, compareVersions, createVersion, versionPattern } from './version';

type Script = typeof import('./version');

// the script takes the functions of fs when it loads, so it loads again after the spies are set
const load = async (): Promise<Script> => {
  memoryFs.reset();
  spyOnFs(fs);
  vi.resetModules();
  return import('./version');
};

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
  let stampVersion: Script['stampVersion'];
  const createPackage = () => {
    memoryFs.sync.mkdirSync('/package');
    memoryFs.sync.writeFileSync('/package/package.json', JSON.stringify({ name: 'tunelle', version: '1.0.0' }));
    return '/package/package.json';
  };

  beforeEach(async () => {
    ({ stampVersion } = await load());
  });

  it('writes the version and keeps the rest of the package', () => {
    const packagePath = createPackage();

    stampVersion(packagePath, '26.10.14');

    expect(JSON.parse(memoryFs.sync.readFileSync(packagePath, 'utf8') as string)).toEqual({ name: 'tunelle', version: '26.10.14' });
  });

  it.each(['1.0.0-master', '26.06.14', '26.13.1', '26.10.', 'v26.10.14', ''])('refuses %j', (version) => {
    const packagePath = createPackage();

    expect(() => stampVersion(packagePath, version)).toThrow('is not a version');
    expect(JSON.parse(memoryFs.sync.readFileSync(packagePath, 'utf8') as string).version).toBe('1.0.0');
  });
});

describe('stampMetainfo', () => {
  const notes = { en: 'Bug fixes and improvements.', hu: 'Hibajavítások és fejlesztések.' };
  const path = '/metainfo/metainfo.xml';
  let stampMetainfo: Script['stampMetainfo'];

  beforeEach(async () => {
    ({ stampMetainfo } = await load());
    memoryFs.sync.mkdirSync('/metainfo');
  });

  it('replaces the release entry with the version, the date, the notes in both languages and the link to the release', () => {
    memoryFs.sync.writeFileSync(path, '<releases>\n    <release version="26.10.9" date="2026-10-29"/>\n  </releases>\n');

    stampMetainfo(path, '26.11.19', new Date('2026-11-04T06:00:00Z'), 'Koeroesi86/tunelle', notes);
    const stamped = memoryFs.sync.readFileSync(path, 'utf8') as string;

    expect(stamped).toContain('<release version="26.11.19" date="2026-11-04">');
    expect(stamped).toContain('<p>Bug fixes and improvements.</p>');
    expect(stamped).toContain('<p xml:lang="hu">Hibajavítások és fejlesztések.</p>');
    expect(stamped).toContain('<url type="details">https://github.com/Koeroesi86/tunelle/releases/tag/v26.11.19</url>');
    expect(stamped).not.toContain('26.10.9');
  });

  it('replaces an entry that already has a description the same way', () => {
    memoryFs.sync.writeFileSync(
      path,
      '<releases>\n    <release version="1.0.0" date="2026-01-01"><description><p>old</p></description></release>\n  </releases>\n'
    );

    stampMetainfo(path, '26.11.19', new Date('2026-11-04T06:00:00Z'), 'Koeroesi86/tunelle', notes);
    const stamped = memoryFs.sync.readFileSync(path, 'utf8') as string;

    expect(stamped).not.toContain('old');
    expect(stamped.match(/<release /g)).toHaveLength(1);
  });

  it('escapes the notes, as they come from a model', () => {
    memoryFs.sync.writeFileSync(path, '<releases>\n    <release version="26.10.9" date="2026-10-29"/>\n  </releases>\n');

    stampMetainfo(path, '26.11.19', new Date('2026-11-04T06:00:00Z'), 'Koeroesi86/tunelle', { en: 'Tags <b> & more.', hu: 'Címkék & több.' });
    const stamped = memoryFs.sync.readFileSync(path, 'utf8') as string;

    expect(stamped).toContain('<p>Tags &lt;b&gt; &amp; more.</p>');
    expect(stamped).toContain('<p xml:lang="hu">Címkék &amp; több.</p>');
  });
});
