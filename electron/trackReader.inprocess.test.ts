import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTrackReader } from './trackReader';
import { readTrackFile } from './readTrackFile';

vi.mock('./readTrackFile', () => ({ readTrackFile: vi.fn() }));

describe('trackReader in the main process', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the file', async () => {
    vi.mocked(readTrackFile).mockResolvedValue({
      path: '/a.flac',
      artist: '',
      album: '',
      title: '',
      year: '',
      track: '',
      disk: '',
      genre: '',
      picture: null,
      duration: 1,
    });

    await expect(createTrackReader().read('/a.flac', '/data', 2000)).resolves.toMatchObject({ path: '/a.flac' });
    expect(readTrackFile).toHaveBeenCalledWith('/a.flac', '/data');
  });

  it('fails when the file takes longer than the timeout', async () => {
    vi.useFakeTimers();
    vi.mocked(readTrackFile).mockReturnValue(new Promise(() => undefined));

    const read = expect(createTrackReader().read('/slow.flac', '/data', 2000)).rejects.toThrow('File access timeout /slow.flac');
    await vi.advanceTimersByTimeAsync(2000);

    await read;
  });

  it('closes without anything to end', () => {
    expect(() => createTrackReader().close()).not.toThrow();
  });
});
