import { Readable } from 'stream';
import { describe, expect, it } from 'vitest';
import { OverscaleGuard } from './overscale-guard';

const header = Buffer.from('RIFF....WAVEfmt ....data\xff\xff\xff\xff', 'latin1');
const block = 4608;

/** A block of float samples of 0.5, with one of them replaced */
const audio = (sample = 0.5, length = block) => {
  const samples = new Float32Array(length / 4).fill(0.5);
  samples[10] = sample;
  return Buffer.from(samples.buffer);
};

const guarded = async (...chunks: Buffer[]) => {
  const passed: Buffer[] = [];
  for await (const chunk of Readable.from(chunks).pipe(new OverscaleGuard())) passed.push(Buffer.from(chunk));
  return Buffer.concat(passed);
};

describe('OverscaleGuard', () => {
  it.each([0.5, 1.4, -2])('passes a block that peaks at %s as it is', async (sample) => {
    const input = Buffer.concat([header, audio(sample)]);

    expect((await guarded(input)).equals(input)).toBe(true);
  });

  it.each([2.1, -3924, Number.NaN, Number.POSITIVE_INFINITY])('silences the block that holds %s, and only that one', async (sample) => {
    const output = await guarded(Buffer.concat([header, audio(), audio(sample), audio()]));

    expect(output.equals(Buffer.concat([header, audio(), Buffer.alloc(block), audio()]))).toBe(true);
  });

  it('finds the header and the blocks in chunks of any size', async () => {
    const input = Buffer.concat([header, audio(), audio(7), audio(0.5, 400)]);
    const chunks = Array.from({ length: Math.ceil(input.length / 13) }, (_, index) => input.subarray(index * 13, (index + 1) * 13));

    expect((await guarded(...chunks)).equals(Buffer.concat([header, audio(), Buffer.alloc(block), audio(0.5, 400)]))).toBe(true);
  });

  it('looks at the last block, which is shorter', async () => {
    const output = await guarded(Buffer.concat([header, audio(9, 400)]));

    expect(output.equals(Buffer.concat([header, Buffer.alloc(400)]))).toBe(true);
  });

  it('gives what it got when the stream ends in the header', async () => {
    expect((await guarded(header.subarray(0, 20))).equals(header.subarray(0, 20))).toBe(true);
  });
});
