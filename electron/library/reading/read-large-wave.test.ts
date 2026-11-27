import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readLargeWave } from './read-large-wave';

let file = Buffer.alloc(0);
const close = vi.fn();

vi.mock('fs', () => {
  const open = async () => ({
    read: async (buffer: Buffer, offset: number, length: number, position: number) => ({
      buffer,
      bytesRead: file.subarray(position, position + length).copy(buffer, offset),
    }),
    close,
  });
  return { default: { promises: { open } }, promises: { open } };
});

const u16 = (value: number) => Buffer.from(new Uint16Array([value]).buffer);
const u32 = (value: number) => Buffer.from(new Uint32Array([value]).buffer);
const u64 = (value: number) => Buffer.from(new BigUint64Array([BigInt(value)]).buffer);

const fmt = (tag: number, bytesPerSecond = 88200) => Buffer.concat([u16(tag), u16(1), u32(44100), u32(bytesPerSecond), u16(2), u16(16)]);

const riffChunk = (id: string, body: Buffer) => Buffer.concat([Buffer.from(id, 'latin1'), u32(body.length), body, Buffer.alloc(body.length % 2)]);

const info = (tags: Record<string, string>) =>
  riffChunk('LIST', Buffer.concat([Buffer.from('INFO'), ...Object.entries(tags).map(([id, text]) => riffChunk(id, Buffer.from(`${text}\0`)))]));

const rf64 = (chunks: Buffer[], dataSize = 176400) =>
  Buffer.concat([
    Buffer.from('RF64'),
    u32(0xffffffff),
    Buffer.from('WAVE'),
    riffChunk('ds64', Buffer.concat([u64(0), u64(dataSize), u64(0), u32(0)])),
    ...chunks,
    Buffer.from('data'),
    u32(0xffffffff),
  ]);

const w64Guid = (id: string) => Buffer.concat([Buffer.from(id, 'latin1'), Buffer.from('f3acd3118cd100c04f8edb8a', 'hex')]);
const w64Chunk = (id: string, body: Buffer) => {
  const size = 24 + body.length;
  return Buffer.concat([w64Guid(id), u64(size), body, Buffer.alloc((8 - (size % 8)) % 8)]);
};
const w64 = (chunks: Buffer[], dataSize = 176400) =>
  Buffer.concat([
    Buffer.from('726966662e91cf11a5d628db04c10000', 'hex'),
    u64(0),
    Buffer.from('77617665f3acd3118cd100c04f8edb8a', 'hex'),
    ...chunks,
    Buffer.concat([w64Guid('data'), u64(24 + dataSize)]),
  ]);

describe('readLargeWave', () => {
  beforeEach(() => {
    close.mockClear();
  });

  it('reads the format of an RF64 file, with the length of the audio from ds64, and the tags of its INFO chunk', async () => {
    file = rf64([riffChunk('fmt ', fmt(1)), info({ INAM: 'Concert A', IART: 'The Sine Waves', IPRD: 'Album', ICRD: '2020-01-02', IGNR: 'Test', IPRT: '3/9' })]);

    const wave = await readLargeWave('/music/a.wav');

    expect(wave?.format).toEqual({ codec: 'PCM', container: 'WAVE', lossless: true, bitsPerSample: 16, sampleRate: 44100, bitrate: 705600, duration: 2 });
    expect(wave?.common).toEqual({ title: 'Concert A', artist: 'The Sine Waves', album: 'Album', year: 2020, genre: ['Test'], track: { no: 3, of: null } });
    expect(close).toHaveBeenCalledOnce();
  });

  it('reads a Wave64 file, whose chunks have a GUID and a size that counts it', async () => {
    file = w64([w64Chunk('fmt ', fmt(3))], 88200);

    const wave = await readLargeWave('/music/a.w64');

    expect(wave?.format).toMatchObject({ codec: 'IEEE_FLOAT', lossless: true, duration: 1 });
    expect(wave?.common).toEqual({ track: { no: null, of: null } });
  });

  it.each([
    [2, 'ADPCM', false],
    [6, 'ALAW', false],
    [7, 'MULAW', false],
    [17, 'DVI_ADPCM', false],
  ])('names the format tag %i %s', async (tag, codec, lossless) => {
    file = rf64([riffChunk('fmt ', fmt(tag))]);

    expect((await readLargeWave('/music/a.wav'))?.format).toMatchObject({ codec, lossless });
  });

  it('names the format of an extensible header by its sub format', async () => {
    file = rf64([riffChunk('fmt ', Buffer.concat([fmt(0xfffe), u16(22), u16(16), u32(4), u16(3), Buffer.alloc(14)]))]);

    expect((await readLargeWave('/music/a.wav'))?.format.codec).toBe('IEEE_FLOAT');
  });

  it('is undefined for a file that is neither, so a plain WAV is left to music-metadata', async () => {
    file = Buffer.concat([Buffer.from('RIFF'), u32(36), Buffer.from('WAVE')]);

    expect(await readLargeWave('/music/a.wav')).toBeUndefined();
    expect(close).toHaveBeenCalledOnce();
  });

  it('fails for a format that is not decoded', async () => {
    file = rf64([riffChunk('fmt ', fmt(0x55))]);

    await expect(readLargeWave('/music/a.wav')).rejects.toThrow('Wave format 85 is not supported');
    expect(close).toHaveBeenCalledOnce();
  });

  it('fails for a file that ends before its audio', async () => {
    file = rf64([riffChunk('fmt ', fmt(1))]).subarray(0, 60);

    await expect(readLargeWave('/music/a.wav')).rejects.toThrow('no fmt or data chunk');
  });

  it.each([
    ['with no bytes a second', rf64([riffChunk('fmt ', fmt(1, 0))])],
    ['whose fmt chunk is cut off', rf64([riffChunk('fmt ', fmt(1).subarray(0, 8))])],
  ])('says that the header of a file %s is not valid', async (_, content) => {
    file = content;

    await expect(readLargeWave('/music/a.wav')).rejects.toThrow('has a header that is not valid');
  });

  it.each([
    ['a chunk whose size does not count its header', w64([Buffer.concat([w64Guid('junk'), u64(0)])])],
    ['a chunk that is longer than a file can be read', w64([Buffer.concat([w64Guid('junk'), u64(2 ** 62)])])],
  ])('finds no data chunk behind %s', async (_, content) => {
    file = content;

    await expect(readLargeWave('/music/a.w64')).rejects.toThrow('no fmt or data chunk');
  });
});
