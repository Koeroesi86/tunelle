import { createHash } from 'crypto';
import fs from 'fs';
import { createRequire } from 'module';
import { dirname, join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryFs } from '../../electron/test-memory-fs';
import source from '../ffmpeg/ffmpeg-source.json';

// the script runs when it loads and takes the functions of the modules it requires, so each test sets the system up and loads it again
const load = createRequire(__filename);
// the exports of asar can not be spied on, so the module that the script requires is replaced in the cache of `require`
const asarPath = load.resolve('@electron/asar');
const asarOriginal = load.cache[asarPath];
const asar = { listPackage: vi.fn<(archive: string, options: object) => string[]>(), extractFile: vi.fn<(archive: string, file: string) => Buffer>() };
const childProcess = load('child_process') as { spawnSync: (...args: unknown[]) => unknown };
// what the script requires is loaded now, as the spies on fs would hide the files from the loader of `require`
['./glibc', './dist-layout', '../ffmpeg/ffmpeg-build', '../ffmpeg/ffmpeg-source.json'].forEach((name) => load(name));
const updateInfo = load('./appimage-update-info') as { readUpdateInformation: (content: Buffer) => string; updateInformation: (arch: string) => string };

class Exit extends Error {
  constructor(readonly code: number | undefined) {
    super('exit');
  }
}

const root = resolve(__dirname, '../..');
const at = (...parts: string[]) => join(root, ...parts);
const put = (file: string, content: string | Buffer = '') => {
  memoryFs.sync.mkdirSync(dirname(file));
  memoryFs.sync.writeFileSync(file, content);
};

const healthy = ['/package.json', '/out/index.js', '/out/electron/preload.js', '/out/electron/loudness-preload.js', '/build/index.html', '/build/loudness.html', '/build/loudness.js', '/migrations/001-init.sql'];
const decoders = ` A..... = Audio\n ------\n${source.decoders.map((name) => ` A....D ${name}   some decoder`).join('\n')}`;
const appImage = Buffer.from('appimage');
const appImageName = 'Tunelle-26.11.1-x86_64.AppImage';
const hash = createHash('sha512').update(appImage).digest('base64');

describe('check-dist', () => {
  let packaged: string[];
  let woff: Buffer;
  let ffmpegRuns: { status: number; stdout: string; stderr?: string; error?: Error };
  let unpacked: { name: string; parentPath: string; isFile: () => boolean }[];
  let errors: string[];
  let logs: string[];
  let exit: ReturnType<typeof vi.spyOn>;
  const platformOf = Object.getOwnPropertyDescriptor(process, 'platform');
  const archOf = Object.getOwnPropertyDescriptor(process, 'arch');
  const system = (platform: string, arch = 'x64') => {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    Object.defineProperty(process, 'arch', { value: arch, configurable: true });
  };

  const archive = () => at('dist', 'linux-unpacked', 'resources', 'app.asar');
  const ffmpegFolder = () => at('dist', 'linux-unpacked', 'resources', 'ffmpeg');

  /** A package that has everything: the archive, the ffmpeg with its notices, the update metadata and the AppImage that it lists */
  const complete = () => {
    put(archive());
    put(join(ffmpegFolder(), 'ffmpeg'));
    put(join(ffmpegFolder(), 'NOTICE.txt'));
    put(join(ffmpegFolder(), 'COPYING.LGPLv2.1'));
    put(at('dist', 'latest-linux.yml'), `version: 26.11.1\nfiles:\n  - url: ${appImageName}\n    sha512: ${hash}\n`);
    put(at('dist', appImageName), appImage);
  };

  const check = async () => {
    vi.resetModules();
    await import('./check-dist').catch((error) => {
      if (!(error instanceof Exit)) throw error;
    });

    return { code: exit.mock.calls.at(-1)?.[0] as number | undefined };
  };

  beforeEach(() => {
    memoryFs.reset();
    packaged = healthy;
    woff = Buffer.from('wOF2');
    ffmpegRuns = { status: 0, stdout: `configuration: ${source.configure.join(' ')}` };
    unpacked = [];
    errors = [];
    logs = [];
    system('linux');
    vi.stubEnv('TUNELLE_LINUX_PACKAGE', '');
    vi.spyOn(console, 'error').mockImplementation((message: string) => void errors.push(message));
    vi.spyOn(console, 'log').mockImplementation((message: string) => void logs.push(message));
    exit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Exit(code);
    }) as never);
    vi.spyOn(fs, 'existsSync').mockImplementation(memoryFs.sync.existsSync);
    vi.spyOn(fs, 'readFileSync').mockImplementation(memoryFs.sync.readFileSync as never);
    vi.spyOn(fs, 'readdirSync').mockImplementation(((path: string, options?: { recursive?: boolean }) => (options?.recursive ? unpacked : memoryFs.sync.readdirSync(path))) as never);
    asar.listPackage.mockImplementation(() => packaged);
    asar.extractFile.mockImplementation(() => woff);
    load.cache[asarPath] = { id: asarPath, filename: asarPath, loaded: true, exports: asar } as unknown as NodeJS.Module;
    vi.spyOn(childProcess, 'spawnSync').mockImplementation(((_program: string, args: string[]) =>
      args[0] === '-version' ? ffmpegRuns : { status: 0, stdout: decoders }) as never);
    vi.spyOn(updateInfo, 'readUpdateInformation').mockImplementation(() => updateInfo.updateInformation('x64'));
  });

  afterEach(() => {
    if (asarOriginal) load.cache[asarPath] = asarOriginal;
    else delete load.cache[asarPath];
    if (platformOf) Object.defineProperty(process, 'platform', platformOf);
    if (archOf) Object.defineProperty(process, 'arch', archOf);
  });

  it('passes a package that has everything and says how many files it has', async () => {
    complete();

    expect((await check()).code).toBe(0);
    expect(errors).toEqual([]);
    expect(logs.at(-1)).toBe(`${healthy.length} files in ${archive()}, 0 problems`);
  });

  it('asks for the package to be built when the archive is not there', async () => {
    expect((await check()).code).toBe(1);
    expect(errors).toEqual([`${archive()} does not exist, run npm run dist first`]);
  });

  it.each([
    ['/.env.production', 'environment file'],
    ['/certs/app.pem', 'key or certificate'],
    ['/.git/config', 'git folder'],
    ['/build/index.js.map', 'source map'],
    ['/node_modules/sqlite3/deps/sqlite.tar.gz', 'archive'],
    ['/client/App.test.tsx', 'test'],
    ['/electron/index.ts', 'source or tooling folder'],
    ['/index.ts', 'source file'],
  ])('fails on %s that must not ship', async (file, label) => {
    complete();
    packaged = [...healthy, file];

    expect((await check()).code).toBe(1);
    expect(errors.join('\n')).toContain(`${label}`);
    expect(errors.join('\n')).toContain(file);
  });

  it('fails on a required file that the archive lacks, and reads the paths of Windows with a slash', async () => {
    complete();
    packaged = healthy.filter((file) => file !== '/out/index.js').map((file) => file.replace(/\//g, '\\'));

    expect((await check()).code).toBe(1);
    expect(errors).toContain('missing: /out/index.js');
    expect(errors).toHaveLength(1);
  });

  it.each(['ffmpeg', 'NOTICE.txt', 'COPYING.LGPLv2.1'])('fails when the packaged %s is not there', async (name) => {
    complete();
    memoryFs.sync.rmSync(join(ffmpegFolder(), name));

    expect((await check()).code).toBe(1);
    expect(errors).toContain(`missing: ${join(ffmpegFolder(), name)}`);
  });

  it('fails when the packaged ffmpeg does not run', async () => {
    complete();
    ffmpegRuns = { status: 1, stdout: '', stderr: 'bad ELF' };

    expect((await check()).code).toBe(1);
    expect(errors).toContain('the packaged ffmpeg does not run: bad ELF');
  });

  it('says why the packaged ffmpeg could not start', async () => {
    complete();
    ffmpegRuns = { status: 1, stdout: '', error: new Error('spawn ENOENT') };

    await check();

    expect(errors).toContain('the packaged ffmpeg does not run: spawn ENOENT');
  });

  it('fails when the packaged ffmpeg is not the LGPL build of the source file', async () => {
    complete();
    ffmpegRuns = { status: 0, stdout: `configuration: ${source.configure.join(' ')} --enable-gpl` };

    expect((await check()).code).toBe(1);
    expect(errors.join('\n')).toContain('the packaged ffmpeg: The binary was built with --enable-gpl');
  });

  it('fails on a font that is not a woff2 file', async () => {
    complete();
    packaged = [...healthy, '/build/fonts/a.woff2'];
    woff = Buffer.from('export default');

    expect((await check()).code).toBe(1);
    expect(errors).toContain('not a woff2 font: /build/fonts/a.woff2');
  });

  it('passes a woff2 font', async () => {
    complete();
    packaged = [...healthy, '/build/fonts/a.woff2'];

    expect((await check()).code).toBe(0);
  });

  describe('the update metadata', () => {
    it('is missing', async () => {
      complete();
      memoryFs.sync.rmSync(at('dist', 'latest-linux.yml'));

      expect((await check()).code).toBe(1);
      expect(errors).toContain('missing: dist/latest-linux.yml');
    });

    it('does not list an installer', async () => {
      complete();
      put(at('dist', 'latest-linux.yml'), 'version: 26.11.1\n');

      await check();

      expect(errors.join('\n')).toContain('does not list');
    });

    it('lists a file that is not in dist, and a name that GitHub would rename', async () => {
      complete();
      put(at('dist', 'latest-linux.yml'), `files:\n  - url: ${appImageName}\n    sha512: ${hash}\n  - url: Tunelle 26.11.1.AppImage\n`);

      await check();

      expect(errors).toContain('dist/latest-linux.yml lists Tunelle 26.11.1.AppImage, which is not in dist/');
      expect(errors).toContain('dist/latest-linux.yml lists Tunelle 26.11.1.AppImage, which GitHub would rename');
    });

    it('is not needed for a build of the Flatpak only', async () => {
      complete();
      memoryFs.sync.rmSync(at('dist', 'latest-linux.yml'));
      vi.stubEnv('TUNELLE_LINUX_PACKAGE', 'flatpak');

      expect((await check()).code).toBe(0);
      expect(logs).toContain('Flatpak only, no update metadata to check');
    });
  });

  describe('the AppImage', () => {
    it('has to be the only one', async () => {
      complete();
      put(at('dist', 'Other-26.11.1-x86_64.AppImage'), 'other');

      await check();

      expect(errors).toContain('expected one AppImage in dist/, found 2');
    });

    it('has to carry the update information of the app', async () => {
      complete();
      vi.spyOn(updateInfo, 'readUpdateInformation').mockImplementation(() => 'something else');

      await check();

      expect(errors).toContain(`${appImageName} does not carry the update information ${updateInfo.updateInformation('x64')}`);
    });

    it('has to be the file that the update metadata hashes', async () => {
      complete();
      put(at('dist', 'latest-linux.yml'), `files:\n  - url: ${appImageName}\n    sha512: another\n`);

      await check();

      expect(errors).toContain(`dist/latest-linux.yml does not list the hash of ${appImageName}`);
    });

    it('has its zsync file next to it when it is the AppImage job', async () => {
      complete();
      vi.stubEnv('TUNELLE_LINUX_PACKAGE', 'appimage');

      await check();

      expect(errors).toContain(`missing: ${appImageName}.zsync`);
    });

    it('passes with the zsync file', async () => {
      complete();
      put(at('dist', `${appImageName}.zsync`));
      vi.stubEnv('TUNELLE_LINUX_PACKAGE', 'appimage');

      expect((await check()).code).toBe(0);
    });

    it('fails on a binary that needs a newer glibc than the oldest supported system has', async () => {
      complete();
      vi.stubEnv('TUNELLE_LINUX_PACKAGE', 'appimage');
      put(at('dist', `${appImageName}.zsync`));
      const folder = at('dist', 'linux-unpacked');
      put(join(folder, 'Tunelle'), 'GLIBC_2.38');
      put(join(folder, 'libok.so.1'), 'GLIBC_2.31');
      put(join(folder, 'notes.txt'), 'GLIBC_2.99');
      unpacked = ['Tunelle', 'libok.so.1', 'notes.txt'].map((name) => ({ name, parentPath: folder, isFile: () => true }));

      expect((await check()).code).toBe(1);
      expect(errors).toEqual([`needs glibc 2.38, more than 2.35: ${join(folder, 'Tunelle')}`]);
    });
  });

  describe('on other systems', () => {
    it('wants the app-update.yml of the packaged app on macOS', async () => {
      system('darwin', 'arm64');
      const resources = at('dist', 'mac-arm64', 'Tunelle.app', 'Contents', 'Resources');
      put(join(resources, 'app.asar'));
      put(join(resources, 'ffmpeg', 'ffmpeg'));
      put(join(resources, 'ffmpeg', 'NOTICE.txt'));
      put(join(resources, 'ffmpeg', 'COPYING.LGPLv2.1'));
      put(at('dist', 'latest-mac.yml'), 'files:\n  - url: Tunelle-26.11.1-arm64-mac.zip\n');
      put(at('dist', 'Tunelle-26.11.1-arm64-mac.zip'));

      expect((await check()).code).toBe(1);
      expect(errors).toEqual(['missing: app-update.yml']);
    });

    it('wants the package of the Microsoft Store on Windows, which the updater must not list', async () => {
      system('win32');
      const resources = at('dist', 'win-unpacked', 'resources');
      put(join(resources, 'app.asar'));
      put(join(resources, 'app-update.yml'));
      put(join(resources, 'ffmpeg', 'ffmpeg.exe'));
      put(join(resources, 'ffmpeg', 'NOTICE.txt'));
      put(join(resources, 'ffmpeg', 'COPYING.LGPLv2.1'));
      put(at('dist', 'latest.yml'), 'files:\n  - url: Tunelle-Setup-26.11.1.exe\n  - url: Tunelle-26.11.1-x64.appx\n');
      put(at('dist', 'Tunelle-Setup-26.11.1.exe'));
      put(at('dist', 'Tunelle-26.11.1-x64.appx'));
      expect((await check()).code).toBe(1);
      expect(errors).toEqual(['dist/latest.yml lists the package of the Microsoft Store']);

      memoryFs.sync.rmSync(at('dist', 'Tunelle-26.11.1-x64.appx'));
      errors.length = 0;
      await check();

      expect(errors).toContain('missing: a file in dist/ named like /^Tunelle-\\d[\\d.]*-x64\\.appx$/');
    });
  });
});
