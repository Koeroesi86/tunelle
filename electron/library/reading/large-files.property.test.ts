import fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { damaged } from '../../../shared/test-damaged-bytes';
import { propertyParameters } from '../../../shared/test-properties';
import { readDstDuration } from './read-dst-duration';
import { readLargeWave } from './read-large-wave';

let file: Buffer = Buffer.alloc(0);
let reads = 0;

vi.mock('fs', () => {
  const open = async () => ({
    // refuses what Node refuses, and a reader that does not stop
    read: async (buffer: Buffer, offset: number, length: number, position: number) => {
      reads += 1;
      if (reads > 100_000) throw new Error('The reader does not stop reading');
      if (!Number.isSafeInteger(position) || position < 0) throw new RangeError(`ERR_OUT_OF_RANGE position ${position}`);
      return { buffer, bytesRead: file.subarray(position, position + length).copy(buffer, offset) };
    },
    close: async () => undefined,
  });
  return { default: { promises: { open } }, promises: { open } };
});

const le = (value: number, width: number) => Buffer.from(Array.from({ length: width }, (_, index) => Math.floor(value / 256 ** index) % 256));
const be = (value: number, width: number) => Buffer.from(le(value, width)).reverse();
const ascii = (text: string) => Buffer.from(text, 'latin1');

const fmt = Buffer.concat([le(1, 2), le(2, 2), le(44100, 4), le(176400, 4), le(4, 2), le(16, 2)]);

const riffChunk = (id: string, body: Buffer) => Buffer.concat([ascii(id), le(body.length, 4), body, Buffer.alloc(body.length % 2)]);
const rf64 = Buffer.concat([
  ascii('RF64'),
  le(0xffffffff, 4),
  ascii('WAVE'),
  riffChunk('ds64', Buffer.concat([le(0, 8), le(176400, 8), le(0, 8), le(0, 4)])),
  riffChunk('fmt ', fmt),
  riffChunk('LIST', Buffer.concat([ascii('INFO'), riffChunk('INAM', ascii('A title\0')), riffChunk('IPRT', ascii('3\0'))])),
  ascii('data'),
  le(0xffffffff, 4),
]);

const w64Id = (id: string) => Buffer.concat([ascii(id), Buffer.from('f3acd3118cd100c04f8edb8a', 'hex')]);
const w64Chunk = (id: string, body: Buffer) => Buffer.concat([w64Id(id), le(body.length + 24, 8), body, Buffer.alloc((8 - (body.length % 8)) % 8)]);
const w64 = Buffer.concat([
  Buffer.from('726966662e91cf11a5d628db04c10000', 'hex'),
  le(0, 8),
  w64Id('wave'),
  w64Chunk('fmt ', fmt),
  w64Chunk('data', Buffer.alloc(64)),
]);

const dsdiffChunk = (id: string, body: Buffer) => Buffer.concat([ascii(id), be(body.length, 8), body, Buffer.alloc(body.length % 2)]);
const dsdiff = Buffer.concat([
  ascii('FRM8'),
  be(0, 8),
  ascii('DSD '),
  dsdiffChunk('FVER', be(0x01050000, 4)),
  dsdiffChunk('DST ', dsdiffChunk('FRTE', Buffer.concat([be(750, 4), be(75, 2)]))),
]);

const damagedFiles = (...valid: Buffer[]) => fc.oneof(...valid.map((one) => damaged(one))).map((bytes) => Buffer.from(bytes));
const behind = (start: Buffer) => fc.uint8Array({ maxLength: 400 }).map((rest) => Buffer.concat([start, rest]));

/** An error that the reader has a text for: not one of a read past a buffer or of a position that is none */
const expected = /^(Wave format \d+ is not supported|.* has no fmt or data chunk in the header|.* has a header that is not valid)$/;

const checkWave = async (bytes: Buffer) => {
  file = bytes;
  reads = 0;
  const wave = await readLargeWave('a.w64').catch((error: Error) => {
    expect(error.message).toMatch(expected);
  });
  if (!wave) return;
  expect(Number.isFinite(wave.format.duration)).toBe(true);
  expect(wave.format.duration).toBeGreaterThanOrEqual(0);
};

const checkDst = async (bytes: Buffer) => {
  file = bytes;
  reads = 0;
  const duration = await readDstDuration('a.dff');
  if (duration === undefined) return;
  expect(Number.isFinite(duration)).toBe(true);
  expect(duration).toBeGreaterThanOrEqual(0);
};

describe('readLargeWave with untrusted bytes', () => {
  beforeEach(() => {
    reads = 0;
  });

  it('reads a damaged RF64 or Wave64 file, or says what is wrong with it', () =>
    fc.assert(fc.asyncProperty(damagedFiles(rf64, w64), checkWave), propertyParameters));

  it('reads any bytes behind the start of either file, or says what is wrong with them', () =>
    fc.assert(fc.asyncProperty(fc.oneof(behind(rf64.subarray(0, 12)), behind(w64.subarray(0, 40))), checkWave), propertyParameters));
});

describe('readDstDuration with untrusted bytes', () => {
  beforeEach(() => {
    reads = 0;
  });

  it('gives a length or none for a damaged file', () => fc.assert(fc.asyncProperty(damagedFiles(dsdiff), checkDst), propertyParameters));

  it('gives a length or none for any bytes behind the start', () => fc.assert(fc.asyncProperty(behind(dsdiff.subarray(0, 16)), checkDst), propertyParameters));
});
