import { describe, expect, it, vi } from 'vitest';
import { serveWindowed } from './serve-windowed';
import type { WindowedTrack } from './windowed-track';

vi.mock('electron', () => ({ net: { fetch: vi.fn() } }));

const track = (size = 10) => {
  // as many bytes as the range has, which start with the range
  const read = vi.fn(async function* (start: number, end: number) {
    yield Buffer.from(`${start}-${end}`.padEnd(end - start + 1, '.'));
  });
  return { size, read } satisfies WindowedTrack;
};
const request = (range?: string) => new Request('tunelle://app/x', { headers: range ? { range } : {} });

describe('serveWindowed', () => {
  it('serves the whole file with the final size', async () => {
    const source = track();
    const response = serveWindowed(source, request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Length')).toBe('10');
    expect(response.headers.get('Content-Type')).toBe('audio/wav');
    expect(await response.text()).toBe('0-9.......');
  });

  it('serves a range with its Content-Range', async () => {
    const response = serveWindowed(track(), request('bytes=2-5'));
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 2-5/10');
    expect(response.headers.get('Content-Length')).toBe('4');
    expect(await response.text()).toBe('2-5.');
  });

  it('answers 416 for a range outside the file', () => {
    const response = serveWindowed(track(), request('bytes=50-60'));
    expect(response.status).toBe(416);
    expect(response.headers.get('Content-Range')).toBe('bytes */10');
  });

  const short = {
    size: 10,
    read: async function* () {
      yield Buffer.from('half.');
    },
  } satisfies WindowedTrack;

  it('fails the body of a read that ends before the end of the range', async () => {
    const response = serveWindowed(short, request());

    await expect(response.text()).rejects.toThrow('The decode ended before the end of the range');
  });

  it('closes the body of a read that ends early because the request is aborted', async () => {
    const aborted = new AbortController();
    const response = serveWindowed(short, { url: 'tunelle://app/x', headers: new Headers(), signal: aborted.signal });
    aborted.abort();

    await expect(response.text()).resolves.toBe('half.');
  });

  it('stops reading when the body is cancelled', async () => {
    const response = serveWindowed(track(), request());
    await response.body?.cancel();
    expect(response.body?.locked).toBe(false);
  });
});
