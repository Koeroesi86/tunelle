import { describe, expect, it, vi } from 'vitest';
import { answerHolding, holdFile, isHeld } from './held-files';

const released = (path: string) => vi.waitFor(() => expect(isHeld(path)).toBe(false));

const body = (cancel = vi.fn()) => {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const stream = new ReadableStream<Uint8Array>({ start: (started) => void (controller = started), cancel });
  return { response: new Response(stream, { status: 206, headers: { 'Content-Range': 'bytes 0-2/3' } }), controller: () => controller, cancel };
};

describe('held files', () => {
  it('holds a file until each of its users let it go, counting a release once', () => {
    const first = holdFile('/cache/shared');
    const second = holdFile('/cache/shared');

    first();
    first();
    expect(isHeld('/cache/shared')).toBe(true);

    second();
    expect(isHeld('/cache/shared')).toBe(false);
  });

  it('holds the file until the body of the answer has been read, and keeps its status and headers', async () => {
    const { response, controller } = body();

    const answer = await answerHolding('/cache/read', async () => response);
    expect(isHeld('/cache/read')).toBe(true);
    controller()?.enqueue(Buffer.from('wav'));
    controller()?.close();

    expect(await answer.text()).toBe('wav');
    expect([answer.status, answer.headers.get('content-range')]).toEqual([206, 'bytes 0-2/3']);
    await released('/cache/read');
  });

  it('cancels the body and lets go of the file when the answer is cancelled', async () => {
    const { response, cancel } = body();

    const answer = await answerHolding('/cache/cancelled', async () => response);
    await answer.body?.cancel();

    await released('/cache/cancelled');
    expect(cancel).toHaveBeenCalled();
  });

  it('fails the answer and lets go of the file when the body fails', async () => {
    const { response, controller } = body();

    const answer = await answerHolding('/cache/failed', async () => response);
    controller()?.error(new Error('short'));

    await expect(answer.text()).rejects.toThrow('short');
    await released('/cache/failed');
  });

  it('lets go at once of an answer without a body', async () => {
    const answer = await answerHolding('/cache/empty', async () => new Response(undefined, { status: 404 }));

    expect(answer.status).toBe(404);
    expect(isHeld('/cache/empty')).toBe(false);
  });

  it('lets go when no answer is made', async () => {
    await expect(answerHolding('/cache/thrown', () => Promise.reject(new Error('gone')))).rejects.toThrow('gone');
    expect(isHeld('/cache/thrown')).toBe(false);
  });
});
