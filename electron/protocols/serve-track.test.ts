import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findPlayableTrack: vi.fn(),
  findOpenedTrack: vi.fn(),
  playableFile: vi.fn(async (track: { path: string }) => track.path),
  serveFile: vi.fn(async (file: string) => new Response(file)),
}));

vi.mock('../repositories/library-repository', () => ({ findPlayableTrack: mocks.findPlayableTrack }));
vi.mock('../library/opened/opened-files', () => ({ findOpenedTrack: mocks.findOpenedTrack }));
vi.mock('./decoded-track', () => ({ playableFile: mocks.playableFile }));
vi.mock('./windowed-track', () => ({ windowedTrack: async () => undefined }));
vi.mock('./serve-windowed', () => ({ serveWindowed: vi.fn() }));
vi.mock('./serve-file', () => ({ serveFile: mocks.serveFile, notFound: () => new Response(null, { status: 404 }) }));

const { serveTrack } = await import('./serve-track');

const database: Parameters<typeof serveTrack>[0] = Object.create(null);
const request = new Request('tunelle://app/track');

describe('serveTrack', () => {
  it('serves a track of the library', async () => {
    mocks.findPlayableTrack.mockResolvedValue({ path: '/music/a.mp3', codec: 'MP3', bitDepth: null });

    expect(await (await serveTrack(database, '/music/a.mp3', request)).text()).toBe('/music/a.mp3');
  });

  it('serves a file that the system opened when the library has none', async () => {
    mocks.findPlayableTrack.mockResolvedValue(undefined);
    mocks.findOpenedTrack.mockReturnValue({ path: '/tmp/b.flac', codec: 'FLAC' });

    expect(await (await serveTrack(database, '/tmp/b.flac', request)).text()).toBe('/tmp/b.flac');
    expect(mocks.playableFile).toHaveBeenLastCalledWith({ path: '/tmp/b.flac', codec: 'FLAC', bitDepth: null }, request.signal);
  });

  it('serves nothing else', async () => {
    mocks.findPlayableTrack.mockResolvedValue(undefined);
    mocks.findOpenedTrack.mockReturnValue(undefined);

    expect((await serveTrack(database, '/etc/passwd', request)).status).toBe(404);
  });
});
