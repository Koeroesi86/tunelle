import { generateKeyPairSync, sign, createHash } from 'crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'child_process';
import { chmodSync } from 'fs';
import { bundleOf, confirmStart, createMacUpdateSource, isNewer, isSigned, parseUpdateFile, pickZip, swapScript } from './mac-update-source';

const mocks = vi.hoisted(() => ({
  app: { getVersion: vi.fn(() => '26.11.1'), getPath: vi.fn(() => ''), quit: vi.fn() },
  commands: [] as { command: string; args: string[] }[],
  answers: { plist: {} as Record<string, string>, archs: 'arm64', failing: undefined as string | undefined },
  spawn: vi.fn(() => ({ unref: vi.fn() })),
}));

vi.mock('electron', () => ({ app: mocks.app }));
vi.mock('child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('child_process')>();

  const { promisify: promisifyFunction } = await import('util');
  const execFile = Object.assign(vi.fn(), {
    [promisifyFunction.custom]: async (command: string, args: string[]) => {
      mocks.commands.push({ command, args });
      if (mocks.answers.failing === command) throw new Error(`${command} failed`);
      if (command === 'ditto') mkdirSync(join(args[3], 'Tunelle.app'), { recursive: true });
      if (command === 'plutil') return { stdout: `${mocks.answers.plist[args[1]]}\n` };
      if (command === 'lipo') return { stdout: `${mocks.answers.archs}\n` };
      return { stdout: '' };
    },
  });

  return { ...original, execFile, spawn: mocks.spawn };
});

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const publicKeyBase64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const signText = (text: string) => sign(undefined, Buffer.from(text), privateKey).toString('base64');

const zipBytes = new Uint8Array(Buffer.from('zip of the update'));
const updateFile = (version: string, hash = createHash('sha512').update(zipBytes).digest('base64')) => `version: ${version}
files:
  - url: Tunelle-26.11.2-mac.zip
    sha512: ${hash}
    size: ${zipBytes.length}
  - url: Tunelle-26.11.2-arm64-mac.zip
    sha512: ${hash}
    size: ${zipBytes.length}
path: Tunelle-26.11.2-mac.zip
sha512: ${hash}
releaseDate: '2026-11-09T06:00:00.000Z'
`;

const serve = (text: string, options: { signature?: string; zip?: Uint8Array<ArrayBuffer>; missing?: string } = {}) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: URL) => {
      const name = url.pathname.split('/').pop() ?? '';
      if (name === options.missing) return new Response('', { status: 404 });
      if (name === 'latest-mac.yml') return new Response(text);
      if (name === 'latest-mac.yml.sig') return new Response(options.signature ?? signText(text));
      return new Response(options.zip ?? zipBytes);
    })
  );

describe('parseUpdateFile', () => {
  it('reads the version and the files', () => {
    expect(parseUpdateFile(updateFile('26.11.2', 'abc'))).toEqual({
      version: '26.11.2',
      files: [
        { url: 'Tunelle-26.11.2-mac.zip', sha512: 'abc', size: zipBytes.length },
        { url: 'Tunelle-26.11.2-arm64-mac.zip', sha512: 'abc', size: zipBytes.length },
      ],
    });
  });

  it('reads a quoted version', () => {
    expect(parseUpdateFile("version: '26.11.2'\nfiles:\n  - url: a.zip\n    sha512: x\n    size: 1\n").version).toBe('26.11.2');
  });

  it.each(['', 'version: 26.11.2\n', 'version: latest\nfiles:\n  - url: a.zip\n    sha512: x\n    size: 1\n'])('rejects %j', (text) => {
    expect(() => parseUpdateFile(text)).toThrow();
  });
});

describe('pickZip', () => {
  const files = [
    { url: 'Tunelle-26.11.2-mac.zip', sha512: 'x64', size: 1 },
    { url: 'Tunelle-26.11.2-arm64-mac.zip', sha512: 'arm', size: 1 },
    { url: 'Tunelle-26.11.2.dmg', sha512: 'dmg', size: 1 },
  ];

  it('takes the zip of Apple silicon and the zip of Intel apart', () => {
    expect(pickZip(files, 'arm64')?.sha512).toBe('arm');
    expect(pickZip(files, 'x64')?.sha512).toBe('x64');
  });

  it('finds nothing without a zip', () => {
    expect(pickZip([files[2]], 'arm64')).toBeUndefined();
  });
});

describe('isNewer', () => {
  it.each([
    ['26.11.2', '26.11.1', true],
    ['26.12.1', '26.11.9', true],
    ['27.1.1', '26.12.40', true],
    ['26.11.1', '26.11.1', false],
    ['26.11.1', '26.11.2', false],
    ['26.10.50', '26.11.1', false],
  ])('%s is newer than %s: %s', (version, installed, expected) => {
    expect(isNewer(version, installed)).toBe(expected);
  });
});

describe('isSigned', () => {
  it('accepts the signature of any of the keys', () => {
    expect(isSigned('text', signText('text'), ['bm90IGEga2V5', publicKeyBase64])).toBe(true);
  });

  it('rejects a changed text and a signature of nothing', () => {
    expect(isSigned('text!', signText('text'), [publicKeyBase64])).toBe(false);
    expect(isSigned('text', '', [publicKeyBase64])).toBe(false);
  });
});

describe('bundleOf', () => {
  it('goes up from the executable to the bundle', () => {
    expect(bundleOf('/Applications/Tunelle.app/Contents/MacOS/Tunelle')).toBe('/Applications/Tunelle.app');
  });
});

describe('the macOS update source', () => {
  let folder: string;
  let execPath: PropertyDescriptor | undefined;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'tunelle-mac-update-'));
    mkdirSync(join(folder, 'data'));
    mocks.commands.length = 0;
    mocks.answers.plist = { CFBundleShortVersionString: '26.11.2', CFBundleExecutable: 'Tunelle' };
    mocks.answers.archs = process.arch === 'arm64' ? 'x86_64 arm64' : 'x86_64';
    mocks.answers.failing = undefined;
    mocks.app.getPath.mockReturnValue(folder);
    execPath = Object.getOwnPropertyDescriptor(process, 'execPath');
    Object.defineProperty(process, 'execPath', { value: join(folder, 'Applications', 'Tunelle.app', 'Contents', 'MacOS', 'Tunelle'), configurable: true });
    vi.stubEnv('TUNELLE_UPDATE_URL', 'http://localhost:9999/feed/');
    vi.stubEnv('TUNELLE_UPDATE_PUBLIC_KEY', publicKeyBase64);
  });

  afterEach(() => {
    if (execPath) Object.defineProperty(process, 'execPath', execPath);
    rmSync(folder, { recursive: true, force: true });
  });

  const create = () => createMacUpdateSource(join(folder, 'data'));

  it('offers a newer version that is signed', async () => {
    serve(updateFile('26.11.2'));

    await expect(create().checkForUpdates()).resolves.toEqual({ isUpdateAvailable: true, updateInfo: { version: '26.11.2' } });
  });

  it('reads the files from the address of TUNELLE_UPDATE_URL', async () => {
    serve(updateFile('26.11.2'));
    await create().checkForUpdates();

    expect(vi.mocked(fetch).mock.calls.map(([url]) => `${url}`)).toEqual([
      'http://localhost:9999/feed/latest-mac.yml',
      'http://localhost:9999/feed/latest-mac.yml.sig',
    ]);
  });

  it('offers nothing when the installed version is the newest', async () => {
    serve(updateFile('26.11.1'));

    await expect(create().checkForUpdates()).resolves.toMatchObject({ isUpdateAvailable: false });
  });

  it('offers nothing for a version that is older than the installed one', async () => {
    serve(updateFile('26.10.5'));

    await expect(create().checkForUpdates()).resolves.toMatchObject({ isUpdateAvailable: false });
  });

  it('refuses a file that was signed by another key', async () => {
    const other = generateKeyPairSync('ed25519').privateKey;
    const text = updateFile('26.11.2');
    serve(text, { signature: sign(undefined, Buffer.from(text), other).toString('base64') });

    await expect(create().checkForUpdates()).rejects.toThrow('not signed');
  });

  it('refuses a file that was changed after it was signed', async () => {
    const text = updateFile('26.11.2');
    serve(text.replace('26.11.2', '26.11.9'), { signature: signText(text) });

    await expect(create().checkForUpdates()).rejects.toThrow('not signed');
  });

  it.each(['latest-mac.yml', 'latest-mac.yml.sig'])('fails when %s is not there', async (missing) => {
    serve(updateFile('26.11.2'), { missing });

    await expect(create().checkForUpdates()).rejects.toThrow(`${missing} answered 404`);
  });

  it('fails for a version that could not be installed before, and offers a newer one', async () => {
    writeFileSync(join(folder, 'data', 'update-failed'), '26.11.2\n');
    serve(updateFile('26.11.2'));
    const source = create();

    await expect(source.checkForUpdates()).rejects.toThrow('could not be installed');
    serve(updateFile('26.11.3'));
    await expect(source.checkForUpdates()).resolves.toMatchObject({ isUpdateAvailable: true });
  });

  it('downloads the zip, checks it and unpacks it next to the installed app', async () => {
    serve(updateFile('26.11.2'));
    const source = create();
    const progress: number[] = [];
    source.on('download-progress', ({ percent }: { percent: number }) => progress.push(percent));
    await source.checkForUpdates();
    await source.downloadUpdate();

    expect(progress.at(-1)).toBeCloseTo(100);
    expect(mocks.commands.map(({ command }) => command)).toEqual(['ditto', 'codesign', 'plutil', 'plutil', 'lipo']);
    expect(mocks.commands[0].args.slice(0, 2)).toEqual(['-x', '-k']);
    expect(mocks.commands[0].args[3]).toBe(join(folder, 'Applications', '.Tunelle-update'));
    expect(existsSync(join(folder, 'tunelle-update-26.11.2-' + process.arch + '.zip'))).toBe(false);
  });

  it('refuses a zip that does not match the hash of the signed file', async () => {
    serve(updateFile('26.11.2'), { zip: new Uint8Array(Buffer.from('another zip')) });
    const source = create();
    await source.checkForUpdates();

    await expect(source.downloadUpdate()).rejects.toThrow('does not match its sha512');
    expect(mocks.commands).toEqual([]);
  });

  it('refuses a download that was not checked first', async () => {
    await expect(create().downloadUpdate()).rejects.toThrow('no checked update');
  });

  it.each([
    ['the signature of the bundle is broken', () => (mocks.answers.failing = 'codesign'), 'codesign failed'],
    ['the bundle has another version', () => (mocks.answers.plist.CFBundleShortVersionString = '26.11.9'), 'has version 26.11.9, not 26.11.2'],
    ['the bundle is built for another architecture', () => (mocks.answers.archs = process.arch === 'arm64' ? 'x86_64' : 'arm64'), 'is not built for'],
  ])('refuses an update when %s', async (_name, break_, message) => {
    break_();
    serve(updateFile('26.11.2'));
    const source = create();
    await source.checkForUpdates();

    await expect(source.downloadUpdate()).rejects.toThrow(message);
    source.quitAndInstall();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it('starts the swap script with the bundle, the backup and the markers, and quits', async () => {
    serve(updateFile('26.11.2'));
    const source = create();
    await source.checkForUpdates();
    await source.downloadUpdate();
    source.quitAndInstall();

    const installed = join(folder, 'Applications', 'Tunelle.app');
    expect(mocks.spawn).toHaveBeenCalledWith(
      '/bin/sh',
      [
        '-c',
        expect.stringContaining('mv "$app" "$backup"'),
        'sh',
        `${process.pid}`,
        installed,
        join(folder, 'Applications', '.Tunelle-update', 'Tunelle.app'),
        `${installed}.backup`,
        join(folder, 'data', 'update-started'),
        '26.11.2',
        join(folder, 'data', 'update-failed'),
        join(folder, 'Applications', '.Tunelle-update'),
        'TUNELLE_UPDATE_URL=http://localhost:9999/feed/',
        `TUNELLE_UPDATE_PUBLIC_KEY=${publicKeyBase64}`,
      ],
      { detached: true, stdio: 'ignore' }
    );
    expect(mocks.app.quit).toHaveBeenCalled();
  });

  it('does not quit when no update was downloaded', () => {
    create().quitAndInstall();

    expect(mocks.app.quit).not.toHaveBeenCalled();
  });

  it('records the version that started for the swap script', async () => {
    await confirmStart(join(folder, 'data'));

    expect(readFileSync(join(folder, 'data', 'update-started'), 'utf8')).toBe('26.11.1');
  });
});

// the script runs with the real sh and a stand-in for `open`, which starts the "app" by writing the marker like the new version does
describe.skipIf(process.platform === 'win32')('the swap script', () => {
  let folder: string;

  const run = ({ fresh, writesMarker }: { fresh: string; writesMarker: boolean }) => {
    const bin = join(folder, 'bin');
    mkdirSync(bin);
    writeFileSync(
      join(bin, 'open'),
      `#!/bin/sh\necho "$@" >> "${join(folder, 'opened')}"\n${writesMarker ? `printf '%s' 26.11.2 > "${join(folder, 'marker')}"` : ''}\n`
    );
    chmodSync(join(bin, 'open'), 0o755);

    return spawnSync(
      '/bin/sh',
      [
        '-c',
        swapScript,
        'sh',
        '2147483646',
        join(folder, 'Tunelle.app'),
        fresh,
        join(folder, 'Tunelle.app.backup'),
        join(folder, 'marker'),
        '26.11.2',
        join(folder, 'failed'),
        join(folder, 'staging'),
        'TUNELLE_APP_DATA=/data',
      ],
      { env: { PATH: `${bin}:${process.env.PATH}` }, encoding: 'utf8' }
    );
  };

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'tunelle-swap-'));
    mkdirSync(join(folder, 'Tunelle.app'));
    writeFileSync(join(folder, 'Tunelle.app', 'version'), 'old');
    mkdirSync(join(folder, 'staging', 'Tunelle.app'), { recursive: true });
    writeFileSync(join(folder, 'staging', 'Tunelle.app', 'version'), 'new');
  });

  afterEach(() => rmSync(folder, { recursive: true, force: true }));

  it('puts the new app in place, opens it with the variables and drops the backup and the staging folder once it started', () => {
    const result = run({ fresh: join(folder, 'staging', 'Tunelle.app'), writesMarker: true });

    expect(result.status).toBe(0);
    expect(readFileSync(join(folder, 'Tunelle.app', 'version'), 'utf8')).toBe('new');
    expect(existsSync(join(folder, 'Tunelle.app.backup'))).toBe(false);
    expect(existsSync(join(folder, 'staging'))).toBe(false);
    expect(readFileSync(join(folder, 'opened'), 'utf8').trim()).toBe(`--env TUNELLE_APP_DATA=/data ${join(folder, 'Tunelle.app')}`);
  });

  it('puts the old app back and records the version when the new one can not be moved in', () => {
    const result = run({ fresh: join(folder, 'missing', 'Tunelle.app'), writesMarker: false });

    expect(result.status).toBe(1);
    expect(readFileSync(join(folder, 'Tunelle.app', 'version'), 'utf8')).toBe('old');
    expect(existsSync(join(folder, 'Tunelle.app.backup'))).toBe(false);
    expect(readFileSync(join(folder, 'failed'), 'utf8').trim()).toBe('26.11.2');
    expect(readFileSync(join(folder, 'opened'), 'utf8')).toContain(join(folder, 'Tunelle.app'));
  });
});
