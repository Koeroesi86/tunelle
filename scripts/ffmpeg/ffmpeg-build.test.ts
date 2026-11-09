import { describe, expect, it } from 'vitest';
import source from './ffmpeg-source.json';
import { checkBinary, checkFlags, checkTarball, posixPath, sha256Of, toolchainFlags } from './ffmpeg-build';

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
