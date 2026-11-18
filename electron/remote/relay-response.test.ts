import { PassThrough } from 'node:stream';
import type { ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { relayResponse } from './relay-response';

const fakeResponse = () => {
  const response = Object.assign(new PassThrough(), { writeHead: vi.fn() });
  const chunks: Buffer[] = [];
  response.on('data', (chunk) => chunks.push(chunk));
  return { response, text: () => Buffer.concat(chunks).toString() };
};

describe('relayResponse', () => {
  it('writes the status and headers of the answer and streams its body', async () => {
    const { response, text } = fakeResponse();

    await relayResponse(new Response('audio', { status: 206, headers: { 'content-range': 'bytes 0-4/10' } }), response as unknown as ServerResponse);

    expect(response.writeHead).toHaveBeenCalledWith(206, expect.objectContaining({ 'content-range': 'bytes 0-4/10' }));
    expect(text()).toBe('audio');
  });

  it('ends an answer without a body', async () => {
    const { response } = fakeResponse();
    const end = vi.spyOn(response, 'end');

    await relayResponse(new Response(undefined, { status: 404 }), response as unknown as ServerResponse);

    expect(end).toHaveBeenCalled();
  });

  it('destroys the response when the body fails, and does not throw', async () => {
    const { response } = fakeResponse();
    const destroy = vi.spyOn(response, 'destroy');
    const body = new ReadableStream({ start: (controller) => controller.error(new Error('gone')) });

    await expect(relayResponse(new Response(body), response as unknown as ServerResponse)).resolves.toBeUndefined();

    expect(destroy).toHaveBeenCalled();
  });
});
