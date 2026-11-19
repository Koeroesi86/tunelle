import fs from 'fs';
import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryFs, spyOnFs } from '../../electron/test-memory-fs';
import { mergeUpdateFiles, splitEntries } from './merge-update-files';

const metadata = (version: string, installer: string, size: number) => `version: ${version}
files:
  - url: ${installer}
    sha512: hash-of-${installer}
    size: ${size}
path: ${installer}
sha512: hash-of-${installer}
releaseDate: '2026-10-26T06:00:00.000Z'
`;

describe('splitEntries', () => {
  it('reads every file of the list', () => {
    expect(splitEntries(metadata('26.10.1', 'Tunelle-Setup.exe', 5))).toEqual([
      '  - url: Tunelle-Setup.exe\n    sha512: hash-of-Tunelle-Setup.exe\n    size: 5',
    ]);
  });

  it('reads nothing from a file without a list', () => {
    expect(splitEntries('version: 26.10.1\n')).toEqual([]);
  });
});

describe('mergeUpdateFiles', () => {
  it('lists the installers of both architectures and keeps the rest of the first file', () => {
    const merged = mergeUpdateFiles([metadata('26.10.1', 'Tunelle-Setup-x64.exe', 5), metadata('26.10.1', 'Tunelle-Setup-arm64.exe', 6)]);

    expect(merged).toBe(`version: 26.10.1
files:
  - url: Tunelle-Setup-x64.exe
    sha512: hash-of-Tunelle-Setup-x64.exe
    size: 5
  - url: Tunelle-Setup-arm64.exe
    sha512: hash-of-Tunelle-Setup-arm64.exe
    size: 6
path: Tunelle-Setup-x64.exe
sha512: hash-of-Tunelle-Setup-x64.exe
releaseDate: '2026-10-26T06:00:00.000Z'
`);
  });

  it('lists a file once', () => {
    const merged = mergeUpdateFiles([metadata('26.10.1', 'Tunelle.zip', 5), metadata('26.10.1', 'Tunelle.zip', 5)]);

    expect(merged.match(/url: /g)).toHaveLength(1);
  });

  it('fails when the versions differ', () => {
    expect(() => mergeUpdateFiles([metadata('26.10.1', 'a.exe', 5), metadata('26.10.2', 'b.exe', 5)])).toThrow('do not have the same version 26.10.1');
  });

  it('keeps a file that is alone as it is', () => {
    const single = metadata('26.10.1', 'Tunelle.AppImage', 5);

    expect(mergeUpdateFiles([single])).toBe(single);
  });
});

describe('mergeArtifacts', () => {
  let mergeArtifacts: (typeof import('./merge-update-files'))['mergeArtifacts'];

  beforeEach(async () => {
    memoryFs.reset();
    spyOnFs(fs);
    vi.resetModules();
    ({ mergeArtifacts } = await import('./merge-update-files'));
  });

  it('copies the installers and merges the update files of the same name', () => {
    const root = '/merge';
    const artifacts = join(root, 'artifacts');
    const release = join(root, 'release');
    const files = {
      'dist-windows-x64': { 'latest.yml': metadata('26.10.1', 'a-x64.exe', 5), 'a-x64.exe': 'x64' },
      'dist-windows-arm64': { 'latest.yml': metadata('26.10.1', 'a-arm64.exe', 6), 'a-arm64.exe': 'arm64' },
      'dist-linux-arm64': { 'latest-linux-arm64.yml': metadata('26.10.1', 'a-arm64.AppImage', 7) },
    };
    Object.entries(files).forEach(([folder, content]) => {
      memoryFs.sync.mkdirSync(join(artifacts, folder));
      Object.entries(content).forEach(([name, text]) => memoryFs.sync.writeFileSync(join(artifacts, folder, name), text));
    });

    const names = mergeArtifacts(artifacts, release);

    expect(names.sort()).toEqual(['latest-linux-arm64.yml', 'latest.yml']);
    expect(memoryFs.sync.readFileSync(join(release, 'latest.yml'), 'utf8')).toMatch(/url: a-x64\.exe[\s\S]*url: a-arm64\.exe[\s\S]*path: a-x64\.exe/);
    expect(memoryFs.sync.existsSync(join(release, 'a-x64.exe'))).toBe(true);
    expect(memoryFs.sync.existsSync(join(release, 'a-arm64.exe'))).toBe(true);
    expect(memoryFs.sync.readFileSync(join(release, 'latest-linux-arm64.yml'), 'utf8')).toBe(metadata('26.10.1', 'a-arm64.AppImage', 7));
  });
});
