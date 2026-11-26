import { EventEmitter } from 'events';
import fs from 'fs';
import http from 'http';
import { createRequire } from 'module';
import net from 'net';
import os from 'os';
import { join, resolve } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import childProcess from 'child_process';
import { memoryFs } from '../../electron/test-memory-fs';

// the script starts the app when it loads and takes what it needs from the modules at that time, so each test sets the system up and loads it again
const load = createRequire(__filename);
['../release/dist-layout', './wait-for-page', '../../package.json'].forEach((name) => load(name));
const electronPath = load.resolve('electron');
const electronOriginal = load.cache[electronPath];

class Exit extends Error {}

type Answers = Record<'ready' | 'library' | 'tracks' | 'track' | 'radio', unknown>;

const trackResult = {
  whole: [200, 160044],
  part: [206, 'bytes 100-199/160044', 100],
  suffix: [206, 'bytes 159994-160043/160044', 50],
  outside: 404,
  seek: [10, 6],
};
const radioResult = { status: 200, type: 'audio/wav', metadataLeft: 0, titles: ['Smoke - Song'], played: 'playing' };

describe('the smoke test', () => {
  const home = '/tmp/tunelle-smoke-1';
  const sockets: FakeSocket[] = [];
  let answers: Answers;
  let targets: { url: string; webSocketDebuggerUrl: string }[];
  let child: EventEmitter & { exitCode: number | null; pid: number; kill: ReturnType<typeof vi.fn> };
  let spawn: ReturnType<typeof vi.spyOn>;
  let spawnSync: ReturnType<typeof vi.spyOn>;
  let stationHandler: ((request: unknown, response: unknown) => unknown) | undefined;
  let stationClosed: ReturnType<typeof vi.fn>;
  let errors: string[];
  let logs: string[];
  let exitCode: typeof process.exitCode;
  const argv = process.argv;
  const platformOf = Object.getOwnPropertyDescriptor(process, 'platform');
  const system = (platform: string) => Object.defineProperty(process, 'platform', { value: platform, configurable: true });

  class FakeSocket {
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    onerror?: () => void;
    close = vi.fn();
    constructor(readonly url: string) {
      sockets.push(this);
      queueMicrotask(() => this.onopen?.());
    }
    send(message: string) {
      const { expression } = JSON.parse(message).params;
      const value = [
        ["location.href === 'tunelle://app/index.html'", answers.ready],
        ['ADD_FOLDERS_TO_LIBRARY', undefined],
        ["fetch('tunelle://app/library').then(response => response.json())", answers.tracks],
        ['/library answered', answers.library],
        ['tunelle://app/track?path', answers.track],
        ['radio/smoke-station', answers.radio],
      ].find(([text]) => expression.includes(text))?.[1];
      queueMicrotask(() =>
        this.onmessage?.({ data: JSON.stringify(value instanceof Error ? { error: { message: value.message } } : { result: { result: { value } } }) })
      );
    }
  }

  /** Runs the script with these arguments, and waits for it to clean up */
  const smoke = async (...flags: string[]) => {
    process.argv = ['node', 'smoke.js', ...flags];
    vi.resetModules();
    const stopped = await import('./smoke').then(
      () => false,
      (error) => {
        if (!(error instanceof Exit)) throw error;
        return true;
      }
    );
    if (stopped) return;
    await vi.waitFor(() => expect(fs.rmSync).toHaveBeenCalledWith(home, expect.anything()), { timeout: 3000 }).catch(() => undefined);
  };

  beforeEach(() => {
    memoryFs.reset();
    memoryFs.sync.mkdirSync(home);
    memoryFs.sync.mkdirSync('/fake');
    memoryFs.sync.writeFileSync('/fake/electron', '');
    sockets.length = 0;
    errors = [];
    logs = [];
    exitCode = process.exitCode;
    process.exitCode = undefined;
    system('linux');
    answers = {
      ready: true,
      library: [{ path: 'a' }, { path: 'b' }],
      tracks: [{ path: `${home}/music/smoke.wav` }],
      track: trackResult,
      radio: radioResult,
    };
    targets = [{ url: 'tunelle://app/index.html', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/page' }];
    stationHandler = undefined;
    stationClosed = vi.fn();
    const self: typeof child = Object.assign(new EventEmitter(), {
      exitCode: null as number | null,
      pid: 4242,
      kill: vi.fn(() => {
        self.exitCode = 0;
        self.emit('exit');
      }),
    });
    child = self;
    vi.spyOn(console, 'error').mockImplementation((message: string) => void errors.push(`${message}`));
    vi.spyOn(console, 'log').mockImplementation((message: string) => void logs.push(`${message}`));
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Exit();
    }) as never);
    load.cache[electronPath] = { id: electronPath, filename: electronPath, loaded: true, exports: '/fake/electron' } as unknown as NodeJS.Module;
    vi.spyOn(os, 'tmpdir').mockReturnValue('/tmp');
    vi.spyOn(fs, 'existsSync').mockImplementation((path) => memoryFs.sync.existsSync(String(path)));
    vi.spyOn(fs, 'mkdirSync').mockImplementation(memoryFs.sync.mkdirSync as never);
    vi.spyOn(fs, 'mkdtempSync').mockReturnValue(home);
    vi.spyOn(fs, 'readFileSync').mockImplementation(memoryFs.sync.readFileSync as never);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(memoryFs.sync.writeFileSync as never);
    vi.spyOn(fs, 'rmSync').mockImplementation(() => undefined);
    vi.spyOn(net, 'createServer').mockImplementation((() => {
      const server = Object.assign(new EventEmitter(), {
        listen: (_port: number, _host: string, done: () => void) => done(),
        address: () => ({ port: 9222 }),
        close: (done: () => void) => done(),
      });
      return server;
    }) as never);
    vi.spyOn(http, 'createServer').mockImplementation(((handler: typeof stationHandler) => {
      stationHandler = handler;
      return { listen: (_port: number, _host: string, done: () => void) => done(), address: () => ({ port: 9333 }), close: stationClosed };
    }) as never);
    spawn = vi.spyOn(childProcess, 'spawn').mockImplementation((() => child) as never);
    spawnSync = vi.spyOn(childProcess, 'spawnSync').mockImplementation((() => ({ stdout: 'ok   sqlite3\n', stderr: '' })) as never);
    vi.stubGlobal('WebSocket', FakeSocket);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(targets))
    );
  });

  afterEach(() => {
    process.argv = argv;
    process.exitCode = exitCode;
    if (platformOf) Object.defineProperty(process, 'platform', platformOf);
    if (electronOriginal) load.cache[electronPath] = electronOriginal;
    else delete load.cache[electronPath];
  });

  it('starts the built app on a clean profile, checks the library, a track and a station, and cleans up', async () => {
    await smoke();

    expect(errors).toEqual([]);
    expect(logs.at(-1)).toBe('Smoke test passed: 2 tracks');
    expect(logs[0]).toContain('tracks over tunelle passed');
    expect(logs[1]).toContain('radio over tunelle passed');
    const [program, args, options] = spawn.mock.calls[0] as unknown as [string, string[], { env: Record<string, string> }];
    expect(program).toBe('/fake/electron');
    expect(args).toEqual([
      resolve(__dirname, '../..', 'out/index.js'),
      '--no-sandbox',
      '--remote-debugging-port=9222',
      '--enable-logging',
      `--log-file=${join(home, 'chromium.log')}`,
      `--user-data-dir=${join(home, 'user-data')}`,
    ]);
    expect(options.env).toMatchObject({
      HOME: home,
      XDG_CONFIG_HOME: home,
      XDG_CACHE_HOME: join(home, 'cache'),
      NODE_ENV: 'production',
      TUNELLE_NO_UPDATE: '1',
      TUNELLE_RADIO_DIRECTORY: 'http://127.0.0.1:9333',
    });
    expect(options.env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(child.kill).toHaveBeenCalled();
    expect(stationClosed).toHaveBeenCalled();
    expect(fs.rmSync).toHaveBeenCalledWith(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    expect(memoryFs.sync.readFileSync(`${home}/music/smoke.wav`)).toHaveLength(80044);
  });

  it('does not pass a sandbox flag on the systems that have the sandbox', async () => {
    system('darwin');

    await smoke();

    expect((spawn.mock.calls[0][1] as string[]).includes('--no-sandbox')).toBe(false);
  });

  it('keeps the profile folders on Windows and stops the app and its helpers with taskkill', async () => {
    system('win32');
    spawnSync.mockImplementation(((command: string) => {
      if (command === 'taskkill') child.emit('exit');
      return { stdout: '', stderr: '' };
    }) as never);
    vi.stubEnv('HOME', '/real-home');

    await smoke();

    expect((spawn.mock.calls[0][2] as { env: Record<string, string> }).env.HOME).toBe('/real-home');
    expect(spawnSync).toHaveBeenCalledWith('taskkill', ['/pid', '4242', '/T', '/F']);
  });

  it('starts the packaged app of the machine with --packaged', async () => {
    memoryFs.sync.mkdirSync(resolve(__dirname, '../..', 'dist/linux-unpacked'));
    memoryFs.sync.writeFileSync(resolve(__dirname, '../..', 'dist/linux-unpacked/Tunelle'), '');
    Object.defineProperty(process, 'arch', { value: 'x64', configurable: true });

    await smoke('--packaged');

    expect(spawn.mock.calls[0][0]).toBe(resolve(__dirname, '../..', 'dist/linux-unpacked/Tunelle'));
    expect((spawn.mock.calls[0][1] as string[]).includes(resolve(__dirname, '../..', 'out/index.js'))).toBe(false);
  });

  it('asks for a build when the executable is not there', async () => {
    await smoke('--packaged');

    expect(errors[0]).toMatch(/Tunelle does not exist, build first$/);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('runs the installed Flatpak with the updater off, and checks the library only, as its sandbox does not see the folder of the run', async () => {
    await smoke('--flatpak');

    expect(spawn.mock.calls[0][0]).toBe('flatpak');
    expect((spawn.mock.calls[0][1] as string[]).slice(0, 3)).toEqual(['run', '--env=TUNELLE_NO_UPDATE=1', 'io.github.koeroesi86.Tunelle']);
    expect(logs).toEqual(['Smoke test passed: 2 tracks']);
    expect(sockets.every((socket) => socket.url === 'ws://127.0.0.1:9222/page')).toBe(true);
  });

  describe('when something is wrong', () => {
    it('says what a track over the protocol answered', async () => {
      answers.track = { ...trackResult, outside: 200 };

      await smoke();

      expect(errors.join('\n')).toContain('A track over tunelle answered');
      expect(process.exitCode).toBe(1);
      expect(child.kill).toHaveBeenCalled();
    });

    it('says what the radio answered', async () => {
      answers.radio = { ...radioResult, titles: [] };

      await smoke();

      expect(errors.join('\n')).toContain('The radio over tunelle answered');
      expect(process.exitCode).toBe(1);
    });

    it('fails when the library is not a list', async () => {
      answers.library = { error: true };

      await smoke();

      expect(errors.join('\n')).toContain('/library did not answer a list');
    });

    it('counts no tracks when the library has no length', async () => {
      answers.library = [];

      await smoke();

      expect(logs.at(-1)).toBe('Smoke test passed: 0 tracks');
    });

    it('fails when the window answers with an error', async () => {
      answers.library = new Error('/library answered 500');

      await smoke();

      expect(errors.join('\n')).toContain('/library answered 500');
      expect(process.exitCode).toBe(1);
    });

    it('fails when the app exits before a window opened, and prints the packaged dependencies and the log of the app', async () => {
      memoryFs.sync.mkdirSync(resolve(__dirname, '../..', 'dist/linux-unpacked'));
      memoryFs.sync.writeFileSync(resolve(__dirname, '../..', 'dist/linux-unpacked/Tunelle'), '');
      memoryFs.sync.writeFileSync(`${home}/chromium.log`, 'line one\r\nline two');
      Object.defineProperty(process, 'arch', { value: 'x64', configurable: true });
      child.exitCode = 3;

      await smoke('--packaged');

      const output = errors.join('\n');
      expect(output).toContain('The app exited with 3 before a window opened');
      expect(output).toContain('Packaged dependencies:\nok   sqlite3');
      expect(output).toContain('Log of the app:\nline one\nline two');
      expect(process.exitCode).toBe(1);
    });

    it('says what is open when no window of the app comes', async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
      targets = [{ url: 'about:blank', webSocketDebuggerUrl: 'ws://x' }];
      const done = smoke();
      await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(61_000);
      await done;
      vi.useRealTimers();

      expect(errors.join('\n')).toContain('No main window, open: about:blank, debugging endpoint error: none');
    });

    it('says what the debugging endpoint answered when it never does', async () => {
      vi.useFakeTimers({ toFake: ['Date', 'setTimeout'] });
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
        })
      );
      const done = smoke();
      await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(61_000);
      await done;
      vi.useRealTimers();

      expect(errors.join('\n')).toContain('debugging endpoint error: ECONNREFUSED');
    });

    it('prints what the app wrote on one line each, so it can not forge a line of the log', async () => {
      answers.library = { error: true };
      memoryFs.sync.writeFileSync(`${home}/chromium.log`, 'one\rforged\ntwo');

      await smoke();

      expect(errors.at(-1)).toBe('Log of the app:\none forged\ntwo');
    });
  });

  describe('the station of the run', () => {
    const request = (url: string, headers: Record<string, string> = {}) => ({ url, headers });
    const answer = () => {
      const calls: unknown[][] = [];
      const response = {
        writeHead: vi.fn(() => response),
        end: vi.fn(() => response),
        write: vi.fn(),
        on: vi.fn((_event: string, listener: () => void) => void calls.push([listener])),
      };
      return { response, close: () => (calls[0][0] as () => void)() };
    };

    beforeEach(async () => {
      await smoke('--flatpak');
    });

    it('resolves every station of the directory to itself, and lists nothing else', () => {
      const [resolved, listed, missing] = [answer(), answer(), answer()];

      stationHandler?.(request('/json/url/abc'), resolved.response);
      stationHandler?.(request('/json/stations'), listed.response);
      stationHandler?.(request('/other'), missing.response);

      expect(resolved.response.end).toHaveBeenCalledWith(JSON.stringify({ url: 'http://127.0.0.1:9333/station' }));
      expect(listed.response.end).toHaveBeenCalledWith('[]');
      expect(missing.response.writeHead).toHaveBeenCalledWith(404);
    });

    it('streams silent frames, with the ICY metadata when asked, until the player closes', () => {
      const intervals: { run: () => void; every: number; cleared: boolean }[] = [];
      vi.spyOn(globalThis, 'setInterval').mockImplementation(((run: () => void, every: number) => intervals.push({ run, every, cleared: false })) as never);
      vi.spyOn(globalThis, 'clearInterval').mockImplementation(((id: number) => void (intervals[id - 1].cleared = true)) as never);
      const [plain, withTitle] = [answer(), answer()];

      stationHandler?.(request('/station'), plain.response);
      stationHandler?.(request('/station', { 'icy-metadata': '1' }), withTitle.response);
      const [first, second] = [intervals[0], intervals[1]];
      [first, first, first, first].forEach(({ run }) => run());
      intervals[2].run();
      second.run();

      expect(plain.response.writeHead).toHaveBeenCalledWith(200, { 'content-type': 'audio/mpeg' });
      expect(withTitle.response.writeHead).toHaveBeenCalledWith(200, { 'content-type': 'audio/mpeg', 'icy-metaint': '16000' });
      expect(plain.response.write.mock.calls[0][0]).toHaveLength(16000);
      expect(String(withTitle.response.write.mock.calls[0][0].subarray(16000))).toContain("StreamTitle='Smoke - Song';");
      // the first seconds come at once, the rest one second at a time
      expect(plain.response.write).toHaveBeenCalledTimes(4);
      plain.close();
      expect(intervals.slice(0, 2).every(({ cleared }) => cleared)).toBe(true);
    });
  });
});
