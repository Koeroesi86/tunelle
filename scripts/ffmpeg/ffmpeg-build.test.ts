import { afterEach, describe, expect, it, vi } from 'vitest';
import source from './ffmpeg-source.json';
import { checkBinary, checkFlags, download, checkTarball, posixPath, sha256Of, toolchainFlags } from './ffmpeg-build';

const legend = ' A..... = Audio\n ------\n';
const decoderLines = legend + source.decoders.map((name) => ` A....D ${name}   some decoder`).join('\n');
const version = `configuration: ${source.configure.join(' ')}`;

describe('ffmpeg source', () => {
  it('pins a sha256 and builds an LGPL decoder only', () => {
    expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(source.url).toContain(source.version);
    expect(() => checkFlags(source)).not.toThrow();
  });

  it('refuses a flag that makes the build GPL', () => {
    expect(() => checkFlags({ ...source, configure: [...source.configure, '--enable-gpl'] })).toThrow('--enable-gpl');
  });
});

describe('checkTarball', () => {
  it('accepts the pinned bytes and refuses others', () => {
    const bytes = Buffer.from('ffmpeg');

    expect(() => checkTarball(bytes, sha256Of(bytes))).not.toThrow();
    expect(() => checkTarball(Buffer.from('other'), sha256Of(bytes))).toThrow('expected');
  });
});

describe('checkBinary', () => {
  it('accepts the configured decoders', () => {
    expect(() => checkBinary(version, decoderLines, source)).not.toThrow();
  });

  it('refuses a GPL binary', () => {
    expect(() => checkBinary(`${version} --enable-gpl`, decoderLines, source)).toThrow('--enable-gpl');
  });

  it('refuses a decoder that is not in the list', () => {
    expect(() => checkBinary(version, `${decoderLines}\n A....D h264   H.264`, source)).toThrow('h264');
  });
});

describe('posixPath', () => {
  it('turns a Windows path into the one MSYS reads and leaves a POSIX path as it is', () => {
    expect(posixPath('D:\\a\\_temp\\ffmpeg\\install')).toBe('/d/a/_temp/ffmpeg/install');
    expect(posixPath('/tmp/ffmpeg/install')).toBe('/tmp/ffmpeg/install');
  });
});

describe('toolchainFlags', () => {
  it('asks for clang on Windows on ARM only', () => {
    expect(toolchainFlags('win32', 'arm64')).toEqual(['--cc=clang']);
    expect(toolchainFlags('win32', 'x64')).toEqual([]);
    expect(toolchainFlags('linux', 'arm64')).toEqual([]);
  });
});

describe('download', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const bytes = (text: string) => new Response(text);
  const run = async (answers: (Response | Error)[]) => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetcher = vi.fn(async () => {
      const next = answers.shift();
      if (next instanceof Error) throw next;
      return next;
    });
    vi.stubGlobal('fetch', fetcher);
    const result = download('https://example.test/ffmpeg.tar.xz').then(
      (value): { value?: Buffer; error?: Error } => ({ value }),
      (error: Error): { value?: Buffer; error?: Error } => ({ error })
    );
    await vi.runAllTimersAsync();
    return { ...(await result), calls: fetcher.mock.calls.length };
  };

  it('returns the bytes of the first answer', async () => {
    const { value, calls } = await run([bytes('tarball')]);

    expect(value?.toString()).toBe('tarball');
    expect(calls).toBe(1);
  });

  it('tries again after a failure of the network and after a server error', async () => {
    const { value, calls } = await run([new TypeError('fetch failed'), new Response('', { status: 503 }), bytes('tarball')]);

    expect(value?.toString()).toBe('tarball');
    expect(calls).toBe(3);
  });

  it('gives up with the last error after four attempts', async () => {
    const { error, calls } = await run(Array.from({ length: 4 }, () => new TypeError('fetch failed')));

    expect(error?.message).toBe('fetch failed');
    expect(calls).toBe(4);
  });

  it('does not try again for a status that will not change', async () => {
    const { error, calls } = await run([new Response('', { status: 404 }), bytes('tarball')]);

    expect(error?.message).toContain('(404)');
    expect(calls).toBe(1);
  });
});
