import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findPlayableTrack: vi.fn(),
  findOpenedTrack: vi.fn(),
  arrivalOf: vi.fn(),
  playableFile: vi.fn(async (track: { path: string }) => track.path),
  serveFile: vi.fn(async (file: string) => new Response(file)),
}));

vi.mock('../repositories/library-repository', () => ({ findPlayableTrack: mocks.findPlayableTrack }));
vi.mock('../library/opened/opened-files', () => ({ findOpenedTrack: mocks.findOpenedTrack }));
vi.mock('./decoded-track', () => ({ arrivalOf: mocks.arrivalOf, playableFile: mocks.playableFile }));
vi.mock('./windowed-track', () => ({ windowedTrack: async () => undefined }));
vi.mock('./serve-windowed', () => ({ serveWindowed: vi.fn() }));
vi.mock('./serve-file', () => ({ serveFile: mocks.serveFile, notFound: () => new Response(null, { status: 404 }) }));

const { serveTrack } = await import('./serve-track');
const { isHeld } = await import('./held-files');

const database: Parameters<typeof serveTrack>[0] = Object.create(null);
const request = new Request('tunelle://app/track');

describe('serveTrack', () => {
  it('serves a track of the library', async () => {
    mocks.findPlayableTrack.mockResolvedValue({ path: '/music/a.mp3', codec: 'MP3', bitDepth: null });

    expect(await (await serveTrack(database, '/music/a.mp3', request)).text()).toBe('/music/a.mp3');
  });

  it('takes the place in the queue of the decodes before the lookup', async () => {
    mocks.arrivalOf.mockClear();
    mocks.findPlayableTrack.mockImplementationOnce(async () => {
      expect(mocks.arrivalOf).toHaveBeenCalledWith(request.signal);
      return { path: '/music/a.mp3', codec: 'MP3', bitDepth: null };
    });

    expect((await serveTrack(database, '/music/a.mp3', request)).status).toBe(200);
  });

  it('serves a file that the system opened when the library has none', async () => {
    mocks.findPlayableTrack.mockResolvedValue(undefined);
    mocks.findOpenedTrack.mockReturnValue({ path: '/tmp/b.flac', codec: 'FLAC' });

    expect(await (await serveTrack(database, '/tmp/b.flac', request)).text()).toBe('/tmp/b.flac');
    expect(mocks.playableFile).toHaveBeenLastCalledWith({ path: '/tmp/b.flac', codec: 'FLAC', bitDepth: null }, request.signal, false);
  });

  it('tells the decoder that a request of the loudness measurement is one', async () => {
    mocks.findPlayableTrack.mockResolvedValue({ path: '/music/a.mp3', codec: 'MP3', bitDepth: null });

    await serveTrack(database, '/music/a.mp3', new Request('tunelle://app/track?path=a&measure'));

    expect(mocks.playableFile).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), true);
  });

  it('holds a decoded copy while it is read', async () => {
    mocks.findPlayableTrack.mockResolvedValue({ path: '/music/a.wma', codec: 'WMA', bitDepth: null });
    mocks.playableFile.mockResolvedValueOnce('/cache/a.wav');

    const response = await serveTrack(database, '/music/a.wma', request);

    expect(isHeld('/cache/a.wav')).toBe(true);
    expect(await response.text()).toBe('/cache/a.wav');
    await vi.waitFor(() => expect(isHeld('/cache/a.wav')).toBe(false));
  });

  it('serves nothing else', async () => {
    mocks.findPlayableTrack.mockResolvedValue(undefined);
    mocks.findOpenedTrack.mockReturnValue(undefined);

    expect((await serveTrack(database, '/etc/passwd', request)).status).toBe(404);
  });
});
