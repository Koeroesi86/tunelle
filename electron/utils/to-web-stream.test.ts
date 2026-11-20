import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { toWebStream } from './to-web-stream';

const answer = (chunks: string[]) => Readable.from(chunks.map((chunk) => Buffer.from(chunk))) as unknown as IncomingMessage;

describe('toWebStream', () => {
  it('gives the chunks of the answer in order and ends with it', async () => {
    expect(await new Response(toWebStream(answer(['a', 'b', 'c']))).text()).toBe('abc');
  });

  it('closes the connection when the reader cancels', async () => {
    const response = answer(['a', 'b']);
    const destroy = vi.spyOn(response, 'destroy');

    await toWebStream(response).cancel();

    expect(destroy).toHaveBeenCalled();
  });
});
