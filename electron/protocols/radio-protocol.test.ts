import { PassThrough } from 'stream';
import { describe, expect, it, vi } from 'vitest';
import { serveRadio } from './radio-protocol';
import { openRadioStream } from './radio-proxy';

vi.mock('./radio-proxy', () => ({ openRadioStream: vi.fn() }));

const deps = { resolveStream: vi.fn(), onTitle: vi.fn(), onSampleRate: vi.fn() };

describe('serveRadio', () => {
  it.each([
    ['has ended already', () => AbortSignal.abort()],
    [
      'ends while the station is opened',
      () => {
        const controller = new AbortController();
        queueMicrotask(() => controller.abort());
        return controller.signal;
      },
    ],
  ])('opens the station with an aborted signal for a request that %s', async (_name, signal) => {
    vi.mocked(openRadioStream).mockImplementation(async () => ({ contentType: 'audio/mpeg', audio: new PassThrough() }));

    await serveRadio('abc-1', signal(), deps);

    expect(vi.mocked(openRadioStream).mock.lastCall?.[1].aborted).toBe(true);
  });
});
