import { describe, expect, it, vi } from 'vitest';
import { serveGrowing } from './serve-growing';
import type { GrowingTrack } from './growing-track';

vi.mock('electron', () => ({ net: { fetch: vi.fn() } }));

const track = (size = 10) => {
  const read = vi.fn(async function* (start: number, end: number) {
    yield Buffer.from(`${start}-${end}`);
  });
  return { size, read } satisfies GrowingTrack;
};
const request = (range?: string) => new Request('tunelle://app/x', { headers: range ? { range } : {} });

describe('serveGrowing', () => {
  it('serves the whole file with the final size', async () => {
    const source = track();
    const response = serveGrowing(source, request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Length')).toBe('10');
    expect(response.headers.get('Content-Type')).toBe('audio/wav');
    expect(await response.text()).toBe('0-9');
  });

  it('serves a range with its Content-Range', async () => {
    const response = serveGrowing(track(), request('bytes=2-5'));
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 2-5/10');
    expect(response.headers.get('Content-Length')).toBe('4');
    expect(await response.text()).toBe('2-5');
  });

  it('answers 416 for a range outside the file', () => {
    const response = serveGrowing(track(), request('bytes=50-60'));
    expect(response.status).toBe(416);
    expect(response.headers.get('Content-Range')).toBe('bytes */10');
  });

  it('stops reading when the body is cancelled', async () => {
    const response = serveGrowing(track(), request());
    await response.body?.cancel();
    expect(response.body?.locked).toBe(false);
  });
});
