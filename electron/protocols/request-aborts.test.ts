import { beforeEach, describe, expect, it, vi } from 'vitest';
import { abortSignalOf, watchRequestAborts } from './request-aborts';

const webRequest = vi.hoisted(() => ({ onBeforeSendHeaders: vi.fn(), onErrorOccurred: vi.fn(), onCompleted: vi.fn() }));
vi.mock('electron', () => ({ session: { defaultSession: { webRequest } } }));

const urls = ['tunelle://app/*'];

/** What the page does: sends a request, which gets its tag, and the request that the handler is given */
const send = (id: number, headers: Record<string, string> = {}) => {
  const callback = vi.fn();
  webRequest.onBeforeSendHeaders.mock.lastCall?.[1]({ id, requestHeaders: headers }, callback);
  return new Request('tunelle://app/track', { headers: callback.mock.lastCall?.[0].requestHeaders });
};
const fail = (id: number) => webRequest.onErrorOccurred.mock.lastCall?.[1]({ id });
const complete = (id: number) => webRequest.onCompleted.mock.lastCall?.[1]({ id });

describe('the end of a request of the page', () => {
  beforeEach(() => watchRequestAborts(urls));

  it('tags each request with its id, next to the headers it had, for the requests of the app only', () => {
    expect(Object.fromEntries(send(1, { range: 'bytes=0-' }).headers)).toEqual({ range: 'bytes=0-', 'x-tunelle-request': '1' });
    expect([webRequest.onBeforeSendHeaders, webRequest.onErrorOccurred, webRequest.onCompleted].map((hook) => hook.mock.lastCall?.[0])).toEqual([
      { urls },
      { urls },
      { urls },
    ]);
  });

  it('aborts the signal of the request that fails, and of no other', () => {
    const [gone, wanted] = [send(2), send(3)].map(abortSignalOf);

    fail(2);

    expect([gone.aborted, wanted.aborted]).toEqual([true, false]);
  });

  it('leaves the signal of a completed request alone', () => {
    const signal = abortSignalOf(send(4));

    complete(4);
    fail(4);

    expect(signal.aborted).toBe(false);
  });

  it('gives an aborted signal for a request that ended before it was asked for', () => {
    const request = send(5);

    fail(5);

    expect(abortSignalOf(request).aborted).toBe(true);
  });

  it('keeps the signal of a request without a tag', () => {
    const request = new Request('tunelle://app/track');

    expect(abortSignalOf(request)).toBe(request.signal);
  });
});
