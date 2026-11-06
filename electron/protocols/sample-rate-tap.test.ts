import { describe, expect, it, vi } from 'vitest';
import { SampleRateTap } from './sample-rate-tap';

const frame = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(413)]);

const run = async (chunks: Buffer[]) => {
  const onSampleRate = vi.fn();
  const tap = new SampleRateTap(onSampleRate);
  const received: Buffer[] = [];
  tap.on('data', (chunk: Buffer) => received.push(chunk));
  chunks.forEach((chunk) => tap.write(chunk));
  tap.end();
  await new Promise((resolve) => tap.on('end', resolve));
  return { onSampleRate, received: Buffer.concat(received) };
};

describe('SampleRateTap', () => {
  it('passes the audio on untouched', async () => {
    const audio = Buffer.concat([frame, frame, frame]);

    expect((await run([audio])).received.equals(audio)).toBe(true);
  });

  it('tells the rate once, when the bytes that hold it have arrived in pieces', async () => {
    const { onSampleRate } = await run([frame.subarray(0, 100), Buffer.concat([frame.subarray(100), frame]), frame]);

    expect(onSampleRate).toHaveBeenCalledExactlyOnceWith(44100);
  });

  it('gives up after the start of a stream that has no rate that is known, and still passes it on', async () => {
    const noise = Buffer.alloc(70 * 1024, 1);
    const { onSampleRate, received } = await run([noise, frame, frame]);

    expect(onSampleRate).not.toHaveBeenCalled();
    expect(received.length).toBe(noise.length + frame.length * 2);
  });
});
