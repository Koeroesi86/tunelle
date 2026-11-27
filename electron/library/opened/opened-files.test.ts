import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';
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

// a path as the system under test resolves it: a drive letter is added on Windows
const abs = (file: string) => path.resolve(file);

const createSender = () => ({ isDestroyed: () => false, send: vi.fn() });

describe('findOpenableFiles', () => {
  it('takes paths and file addresses of audio files, once each', () => {
    const music = abs('/music/b c.MP3');

    expect(findOpenableFiles(['/usr/bin/Tunelle', '--flag', 'a.flac', music, pathToFileURL(music).href, 'notes.txt'], abs('/home/me'))).toEqual([
      abs('/home/me/a.flac'),
      music,
    ]);
  });

  it('leaves out an address that is not a file', () => {
    expect(findOpenableFiles(['file:'], '/')).toEqual([]);
  });

  it.skipIf(process.platform === 'win32')('leaves out an address with a host', () => {
    expect(findOpenableFiles(['file://host/a.flac'], '/')).toEqual([]);
  });
});

describe('openFiles', () => {
  const attach = (sender: ReturnType<typeof createSender>) => attachOpenedFiles(sender as unknown as WebContents);

  let attachOpenedFiles: (typeof import('./opened-files'))['attachOpenedFiles'];
  let findOpenedTrack: (typeof import('./opened-files'))['findOpenedTrack'];
  let openFiles: (typeof import('./opened-files'))['openFiles'];
  let detachOpenedFiles: (typeof import('./opened-files'))['detachOpenedFiles'];

  // the module keeps the page it was attached to and the tracks that wait for it
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    ({ attachOpenedFiles, detachOpenedFiles, findOpenedTrack, openFiles } = await import('./opened-files'));
    global._appDataPath = '/data';
  });

  it('sends the tracks to the page that is ready, and serves them', async () => {
    const sender = createSender();
    attach(sender);
    reader.read.mockResolvedValue(track(abs('/music/a.flac')));

    await openFiles([abs('/music/a.flac')], '/');

    expect(sender.send).toHaveBeenCalledWith('OPENED_FILES', { tracks: [track(abs('/music/a.flac'))] });
    expect(findOpenedTrack(abs('/music/a.flac'))).toEqual(track(abs('/music/a.flac')));
    expect(reader.close).toHaveBeenCalled();
  });

  it('keeps the tracks until the page is ready', async () => {
    reader.read.mockResolvedValue(track(abs('/music/early.flac')));
    await openFiles([abs('/music/early.flac')], '/');
    const sender = createSender();

    attach(sender);

    expect(sender.send).toHaveBeenCalledWith('OPENED_FILES', { tracks: [track(abs('/music/early.flac'))] });
  });

  it('keeps the files for the next page once the page is gone', async () => {
    const gone = createSender();
    const next = createSender();
    reader.read.mockResolvedValue(track(abs('/music/a.flac')));
    attach(gone);
    detachOpenedFiles();

    await openFiles([abs('/music/a.flac')], '/');
    attach(next);

    expect(gone.send).not.toHaveBeenCalled();
    expect(next.send).toHaveBeenCalledWith('OPENED_FILES', { tracks: [track(abs('/music/a.flac'))] });
  });

  it('leaves out a file that does not read and a codec that does not play', async () => {
    const sender = createSender();
    attach(sender);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    reader.read.mockImplementation(async (file: string) => {
      if (file === abs('/music/bad.flac')) throw new Error('unreadable');
      return track(file, file === abs('/music/speex.wav') ? 'SPEEX' : 'FLAC');
    });

    await openFiles([abs('/music/bad.flac'), abs('/music/speex.wav'), abs('/music/ok.flac')], '/');

    expect(sender.send).toHaveBeenCalledWith('OPENED_FILES', { tracks: [track(abs('/music/ok.flac'))] });
    expect(findOpenedTrack(abs('/music/speex.wav'))).toBeUndefined();
  });

  it('reads nothing when no argument is an audio file', async () => {
    await openFiles(['/usr/bin/Tunelle'], '/');

    expect(reader.read).not.toHaveBeenCalled();
  });
});
