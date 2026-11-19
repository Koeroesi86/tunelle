import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { request } from 'node:https';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contact, fetchAudio, fetchCover, followNowPlaying, HostAnswerError, requestToListen, sendControl } from './listener-client';

const mocks = vi.hoisted(() => ({ socket: class Socket {} }));

vi.mock('node:https', () => ({ request: vi.fn() }));
vi.mock('node:tls', () => ({ TLSSocket: mocks.socket }));
vi.mock('./certificate', () => ({
  approvalCode: (certificate: string) => `code-of-${certificate.length}`,
  pinnedOptions: (certificate: string) => ({ ca: certificate }),
  unpinnedOptions: { rejectUnauthorized: false },
}));

const address = { host: '192.168.0.2', port: 4000 };
const socketWithCertificate = () => Object.assign(new mocks.socket(), { getPeerCertificate: () => ({ raw: Buffer.from('cert') }) });

class FakeRequest extends EventEmitter {
  end = vi.fn();
  setTimeout = vi.fn();
  destroy = vi.fn((error?: Error) => error && this.emit('error', error));
}

/** The next request is answered with this response, once the request is ended */
const answerWith = (response?: Partial<PassThrough> & { statusCode?: number; headers?: Record<string, string>; socket?: unknown }) => {
  const outgoing = new FakeRequest();
  vi.mocked(request).mockImplementationOnce(((_options: unknown, listener: (incoming: unknown) => void) => {
    outgoing.end.mockImplementation(() => response && queueMicrotask(() => listener(response)));
    return outgoing;
  }) as never);
  return outgoing;
};

const reply = (status: number, body: string | undefined, headers: Record<string, string> = {}) => {
  const stream = new PassThrough();
  const response = Object.assign(stream, { statusCode: status, headers, socket: socketWithCertificate() });
  queueMicrotask(() => (body === undefined ? stream.end() : stream.end(body)));
  return response;
};

describe('the client of a host', () => {
  beforeEach(() => vi.mocked(request).mockReset());

  it('makes first contact without credentials, and gives the certificate of the host and the code of it', async () => {
    const outgoing = answerWith(reply(200, '{}'));

    const result = await contact(address);

    expect(result.certificate).toContain(Buffer.from('cert').toString('base64'));
    expect(result.code).toMatch(/^code-of-/);
    expect(vi.mocked(request).mock.calls[0][0]).toMatchObject({
      ...address,
      path: '/remote/now-playing',
      method: 'GET',
      agent: false,
      rejectUnauthorized: false,
    });
    expect(outgoing.end).toHaveBeenCalledWith(undefined);
  });

  it('asks to listen with the certificate pinned, and reads the answer', async () => {
    const outgoing = answerWith(reply(200, JSON.stringify({ status: 'approved', secret: 's' })));

    expect(await requestToListen(address, 'PEM', { deviceId: 'd', deviceName: 'Phone', note: 'hi' })).toEqual({ status: 'approved', secret: 's' });

    expect(vi.mocked(request).mock.calls[0][0]).toMatchObject({ method: 'POST', path: '/remote/request', ca: 'PEM' });
    expect(outgoing.end).toHaveBeenCalledWith(JSON.stringify({ deviceId: 'd', deviceName: 'Phone', note: 'hi' }));
  });

  it('rejects an answer that is not of the shape, as the body that is not JSON is undefined', async () => {
    answerWith(reply(200, 'not json'));

    await expect(requestToListen(address, 'PEM', { deviceId: 'd', deviceName: 'P', note: '' })).rejects.toThrow();
  });

  it('rejects an answer that is not from a TLS socket, one that is too long, and a request that fails or times out', async () => {
    answerWith({ ...reply(200, '{}'), socket: {} });
    await expect(contact(address)).rejects.toThrow('Not a TLS socket');

    answerWith(reply(200, 'x'.repeat(70 * 1024)));
    await expect(contact(address)).rejects.toThrow('too long');

    const failing = answerWith();
    const pending = contact(address);
    failing.emit('error', new Error('refused'));
    await expect(pending).rejects.toThrow('refused');

    const slow = answerWith();
    const waiting = contact(address);
    slow.emit('timeout');
    await expect(waiting).rejects.toThrow('did not answer');
  });

  it('sends a command with the device and the secret, and fails with the status when the host does not do it', async () => {
    const outgoing = answerWith(reply(200, '{}'));
    await sendControl(address, 'PEM', 'd', 's', { type: 'playPause' } as never);
    expect(vi.mocked(request).mock.calls[0][0]).toMatchObject({ path: '/remote/control', headers: { 'x-tunelle-device': 'd', authorization: 'Bearer s' } });
    expect(outgoing.end).toHaveBeenCalledWith(JSON.stringify({ type: 'playPause' }));

    answerWith(reply(403, '{}'));
    await expect(sendControl(address, 'PEM', 'd', 's', { type: 'skip' } as never)).rejects.toEqual(new HostAnswerError(403));
  });
});

describe('following the now playing of a host', () => {
  const events = { onSnapshot: vi.fn(), onControls: vi.fn() };
  const follow = (signal = new AbortController().signal) => followNowPlaying(address, 'PEM', 'd', 's', events, signal);
  const stream = (headers: Record<string, string> = {}) => {
    const response = Object.assign(new PassThrough(), { statusCode: 200, headers });
    return response;
  };
  const playing = { state: 'playing', title: 'A', position: 1, at: 5000 };

  beforeEach(() => {
    vi.mocked(request).mockReset();
    events.onSnapshot.mockReset();
    events.onControls.mockReset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(100_000);
  });

  it('resolves revoked when the host does not know the device, and fails for another status', async () => {
    answerWith(Object.assign(stream(), { statusCode: 401 }) as never);
    expect(await follow()).toBe('revoked');

    answerWith(Object.assign(stream(), { statusCode: 500 }) as never);
    await expect(follow()).rejects.toThrow('answered 500');
  });

  it('gives the snapshots on the clock of this computer, and the controls, and ends when the host closes the stream', async () => {
    const response = stream({ 'x-tunelle-time': '4000' });
    answerWith(response as never);
    const done = follow();
    await Promise.resolve();

    response.write(`data: ${JSON.stringify(playing)}\n\nevent: controls\ndata: ["skip","seek"]\n\nevent: controls\ndata: nope\n\nda`);
    response.write(`ta: ${JSON.stringify({ state: 'idle' })}\n\ndata: {"state":"x"}\n\n`);
    response.end();

    expect(await done).toBe('ended');
    expect(events.onSnapshot.mock.calls).toEqual([[{ ...playing, at: 5000 + 96_000 }], [{ state: 'idle' }]]);
    expect(events.onControls).toHaveBeenCalledExactlyOnceWith(['skip', 'seek']);
  });

  it('keeps the time of the snapshot when the host sends no clock', async () => {
    const response = stream();
    answerWith(response as never);
    const done = follow();
    await Promise.resolve();

    response.end(`data: ${JSON.stringify(playing)}\n\n`);
    await done;

    expect(events.onSnapshot).toHaveBeenCalledWith(playing);
  });

  it('fails when a message does not end, and when the stream fails or does not answer', async () => {
    const response = stream();
    answerWith(response as never);
    const long = follow();
    await Promise.resolve();
    response.destroy = vi.fn((error?: Error) => (response.emit('error', error), response)) as never;
    response.write('x'.repeat(70 * 1024));
    await expect(long).rejects.toThrow('too long');

    const failing = answerWith();
    const pending = follow();
    failing.emit('error', new Error('reset'));
    await expect(pending).rejects.toThrow('reset');

    const silent = answerWith();
    const waiting = follow();
    silent.emit('timeout');
    await expect(waiting).rejects.toThrow('did not answer');
  });
});

describe('the media of a host', () => {
  const media = (status: number, headers: Record<string, string>, body = 'audio') => {
    const response = Object.assign(new PassThrough(), { statusCode: status, headers });
    response.end(body);
    return response;
  };

  beforeEach(() => vi.mocked(request).mockReset());

  it('streams the audio with the range of the request, and keeps the headers that the player needs', async () => {
    const outgoing = answerWith(media(206, { 'content-type': 'audio/flac', 'content-range': 'bytes 0-4/5', 'x-secret': 'no' }) as never);

    const response = await fetchAudio(address, 'PEM', 'd', 's', 'bytes=0-4', new AbortController().signal);

    expect(vi.mocked(request).mock.calls[0][0]).toMatchObject({ path: '/remote/audio', headers: { range: 'bytes=0-4', authorization: 'Bearer s' } });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 0-4/5');
    expect(response.headers.get('x-secret')).toBeNull();
    expect(await response.text()).toBe('audio');
    expect(outgoing.setTimeout).toHaveBeenCalledWith(0);
  });

  it('asks for the cover, with no body for a status that has none, and no range', async () => {
    answerWith(media(304, {}) as never);

    const response = await fetchCover(address, 'PEM', 'd', 's', new AbortController().signal);

    expect(vi.mocked(request).mock.calls[0][0]).toMatchObject({ path: '/remote/cover' });
    expect(vi.mocked(request).mock.calls[0][0]).not.toHaveProperty('headers.range');
    expect(response.status).toBe(304);
    expect(response.body).toBeNull();
  });

  it('closes the connection when the player cancels, and fails when the host does not answer', async () => {
    const upstream = media(200, {}, 'x'.repeat(10));
    const destroy = vi.spyOn(upstream, 'destroy');
    answerWith(upstream as never);
    const response = await fetchAudio(address, 'PEM', 'd', 's', undefined, new AbortController().signal);
    await response.body?.cancel();
    expect(destroy).toHaveBeenCalled();

    const silent = answerWith();
    const waiting = fetchAudio(address, 'PEM', 'd', 's', undefined, new AbortController().signal);
    silent.emit('timeout');
    await expect(waiting).rejects.toThrow('did not answer');
  });
});
