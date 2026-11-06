import { describe, expect, it, vi } from 'vitest';
import { readBody } from './read-body';

const streamOf = (chunks: number[][], failAfter?: number) => {
  const pending = [...chunks];
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (failAfter !== undefined && pending.length === chunks.length - failAfter) return controller.error(new Error('the drive went away'));
        const next = pending.shift();
        return next ? controller.enqueue(Uint8Array.from(next)) : controller.close();
      },
    })
  );
};

describe('readBody', () => {
  it('gives the bytes of the body, and tells for each chunk that came', async () => {
    const onChunk = vi.fn();

    const bytes = await readBody(streamOf([[1, 2], [3], [4, 5, 6]]), onChunk);

    expect(bytes).toEqual(Uint8Array.from([1, 2, 3, 4, 5, 6]));
    expect(onChunk).toHaveBeenCalledTimes(3);
  });

  it('gives nothing when the stream fails half way', async () => {
    expect(await readBody(streamOf([[1], [2], [3]], 2), vi.fn())).toBeUndefined();
  });

  it('gives no bytes for a body that is empty', async () => {
    expect(await readBody(new Response(null), vi.fn())).toEqual(new Uint8Array(0));
  });
});
