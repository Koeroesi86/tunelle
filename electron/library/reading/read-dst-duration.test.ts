import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readDstDuration } from './read-dst-duration';

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

const chunk = (id: string, body: Buffer) => {
  const size = Buffer.alloc(8);
  size.writeBigUInt64BE(BigInt(body.length));
  return Buffer.concat([Buffer.from(id, 'latin1'), size, body, Buffer.alloc(body.length % 2)]);
};

const frameInfo = (frames: number, perSecond: number) => {
  const body = Buffer.alloc(6);
  body.writeUInt32BE(frames);
  body.writeUInt16BE(perSecond, 4);
  return chunk('FRTE', body);
};

const dsdiff = (...chunks: Buffer[]) => chunk('FRM8', Buffer.concat([Buffer.from('DSD '), ...chunks]));

describe('readDstDuration', () => {
  beforeEach(() => {
    close.mockClear();
  });

  it('gives the frames of the FRTE chunk over its rate, past the chunks before the sound, also one of an odd size', async () => {
    file = dsdiff(chunk('FVER', Buffer.alloc(4)), chunk('PROP', Buffer.alloc(7)), chunk('DST ', frameInfo(450, 75)));

    expect(await readDstDuration('/music/a.dff')).toBe(6);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['without a DST chunk', dsdiff(chunk('DSD ', Buffer.alloc(8)))],
    ['whose DST chunk does not start with FRTE', dsdiff(chunk('DST ', chunk('DSTF', Buffer.alloc(8))))],
    ['that ends in the FRTE chunk', dsdiff(chunk('DST ', Buffer.from('FRTE')))],
    ['with no frames per second', dsdiff(chunk('DST ', frameInfo(450, 0)))],
  ])('gives nothing for a file %s', async (_, content) => {
    file = content;

    expect(await readDstDuration('/music/a.dff')).toBeUndefined();
    expect(close).toHaveBeenCalledTimes(1);
  });
});
