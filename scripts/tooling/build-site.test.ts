import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { architecture, buildSite, findAssets, findNotes, stampSite } from './build-site';

const asset = (name: string) => ({ name, browser_download_url: `https://example.test/${name}` });
const release = {
  tag_name: 'v26.10.14',
  body: [
    "## What's Changed",
    '* Browse the library by artist by @someone in https://github.com/o/r/pull/111',
    '* Read <b>formats</b> by @someone in https://github.com/o/r/pull/109',
    '',
    '**Full Changelog**: https://github.com/o/r/compare/a...b',
  ].join('\n'),
  assets: [
    asset('Tunelle-Setup-26.10.14-x64.exe'),
    asset('Tunelle-Setup-26.10.14-x64.exe.blockmap'),
    asset('Tunelle-Setup-26.10.14-arm64.exe'),
    asset('Tunelle-26.10.14-arm64.dmg'),
    asset('Tunelle-26.10.14.dmg'),
    asset('Tunelle-26.10.14-mac.zip'),
    asset('Tunelle-26.10.14-x86_64.AppImage'),
    asset('latest.yml'),
  ],
};

describe('architecture', () => {
  it.each([
    ['Tunelle-26.10.14-arm64.dmg', 'arm64'],
    ['Tunelle-26.10.14-aarch64.AppImage', 'arm64'],
    ['Tunelle-26.10.14.dmg', 'x64'],
    ['Tunelle-26.10.14-x86_64.AppImage', 'x64'],
  ])('reads %s as %s', (name, expected) => {
    expect(architecture(name)).toBe(expected);
  });
});

describe('findAssets', () => {
  it('keeps the installer of each system and architecture, and no update file, archive or block map', () => {
    expect(Object.keys(findAssets(release.assets)).sort()).toEqual(['linux-x64', 'mac-arm64', 'mac-x64', 'windows-arm64', 'windows-x64']);
  });

  it('links the installer of the release', () => {
    expect(findAssets(release.assets)['mac-arm64']).toBe('https://example.test/Tunelle-26.10.14-arm64.dmg');
  });
});

describe('findNotes', () => {
  it('lists the titles of the changes without the author, the link and the changelog line', () => {
    expect(findNotes(release.body)).toEqual(['Browse the library by artist', 'Read <b>formats</b>']);
  });

  it('lists nothing for a release without notes', () => {
    expect(findNotes(undefined)).toEqual([]);
  });
});

describe('stampSite', () => {
  it('writes the version, the installers and the escaped notes', () => {
    const html = stampSite('v{{version}} <a href="{{asset:windows-x64}}"></a><ul>{{notes}}</ul>', release);

    expect(html).toContain('v26.10.14');
    expect(html).toContain('href="https://example.test/Tunelle-Setup-26.10.14-x64.exe"');
    expect(html).toContain('<li>Read &lt;b&gt;formats&lt;/b&gt;</li>');
  });

  it('links the page of the latest release for a system without an installer', () => {
    expect(stampSite('{{asset:linux-arm64}}', release)).toBe('https://github.com/Koeroesi86/tunelle/releases/latest');
  });
});

describe('buildSite', () => {
  let folder: string;

  afterEach(() => rmSync(folder, { recursive: true, force: true }));

  it('writes the page of the repository without a placeholder left', () => {
    folder = mkdtempSync(join(tmpdir(), 'tunelle-site-'));
    writeFileSync(join(folder, 'release.json'), JSON.stringify(release));

    buildSite(join(folder, 'release.json'), join(folder, 'out'));
    const html = readFileSync(join(folder, 'out', 'index.html'), 'utf8');

    expect(html).not.toMatch(/\{\{/);
    expect(html).toContain('26.10.14');
    expect(readFileSync(join(folder, 'out', 'download.js'), 'utf8')).toBe(readFileSync(resolve(__dirname, '../..', 'site', 'download.js'), 'utf8'));
  });
});
