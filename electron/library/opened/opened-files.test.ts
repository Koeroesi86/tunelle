import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';

const reader = vi.hoisted(() => ({ read: vi.fn(), close: vi.fn() }));

vi.mock('electron', () => ({ app: { whenReady: () => Promise.resolve() } }));
vi.mock('../reading/track-reader', () => ({ createTrackReader: () => reader }));

const { findOpenableFiles } = await import('./opened-files');

const track = (path: string, codec = 'FLAC') => ({
  path,
  artist: '',
  album: '',
  title: 'T',
  year: '',
  track: '',
  disk: '',
  genre: '',
  picture: null,
  duration: 1,
  codec,
});

const createSender = () => ({ isDestroyed: () => false, send: vi.fn() });

describe('findOpenableFiles', () => {
  it('takes paths and file addresses of audio files, once each', () => {
    expect(findOpenableFiles(['/usr/bin/Tunelle', '--flag', 'a.flac', '/music/b%20c.MP3', 'file:///music/b%20c.MP3', 'notes.txt'], '/home/me')).toEqual([
      '/home/me/a.flac',
      '/music/b%20c.MP3',
      '/music/b c.MP3',
    ]);
  });

  it('leaves out an address that is not a file', () => {
    expect(findOpenableFiles(['file://host/a.flac', 'file:'], '/')).toEqual([]);
  });
});

describe('openFiles', () => {
  const attach = (sender: ReturnType<typeof createSender>) => attachOpenedFiles(sender as unknown as WebContents);

  let attachOpenedFiles: (typeof import('./opened-files'))['attachOpenedFiles'];
  let findOpenedTrack: (typeof import('./opened-files'))['findOpenedTrack'];
  let openFiles: (typeof import('./opened-files'))['openFiles'];

  // the module keeps the page it was attached to and the tracks that wait for it
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    ({ attachOpenedFiles, findOpenedTrack, openFiles } = await import('./opened-files'));
    global._appDataPath = '/data';
  });

  it('sends the tracks to the page that is ready, and serves them', async () => {
    const sender = createSender();
    attach(sender);
    reader.read.mockResolvedValue(track('/music/a.flac'));

    await openFiles(['/music/a.flac'], '/');

    expect(sender.send).toHaveBeenCalledWith('OPENED_FILES', { tracks: [track('/music/a.flac')] });
    expect(findOpenedTrack('/music/a.flac')).toEqual(track('/music/a.flac'));
    expect(reader.close).toHaveBeenCalled();
  });

  it('keeps the tracks until the page is ready', async () => {
    reader.read.mockResolvedValue(track('/music/early.flac'));
    await openFiles(['/music/early.flac'], '/');
    const sender = createSender();

    attach(sender);

    expect(sender.send).toHaveBeenCalledWith('OPENED_FILES', { tracks: [track('/music/early.flac')] });
  });

  it('leaves out a file that does not read and a codec that does not play', async () => {
    const sender = createSender();
    attach(sender);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    reader.read.mockImplementation(async (file: string) => {
      if (file === '/music/bad.flac') throw new Error('unreadable');
      return track(file, file === '/music/ac3.wav' ? 'AC-3' : 'FLAC');
    });

    await openFiles(['/music/bad.flac', '/music/ac3.wav', '/music/ok.flac'], '/');

    expect(sender.send).toHaveBeenCalledWith('OPENED_FILES', { tracks: [track('/music/ok.flac')] });
    expect(findOpenedTrack('/music/ac3.wav')).toBeUndefined();
  });

  it('reads nothing when no argument is an audio file', async () => {
    await openFiles(['/usr/bin/Tunelle'], '/');

    expect(reader.read).not.toHaveBeenCalled();
  });
});
