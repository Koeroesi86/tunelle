import { beforeEach, describe, expect, it, vi } from 'vitest';
import executeQuery from '../../database/execute-query';
import { memoryFs } from '../../test-memory-fs';
import { fakeDatabase } from '../../test-fake-database';
import { chooseArtistPhoto, readPhotoFile, removeArtistPhoto, resetArtistPhoto } from './artist-photo-choice';
import { getRecords } from './artist-photos';

vi.mock('fs', () => ({ ...memoryFs.sync, default: { ...memoryFs.sync, promises: memoryFs.promises } }));
vi.mock('../../database/execute-query', () => ({ default: vi.fn() }));
vi.mock('./artist-photos', () => ({ getRecords: vi.fn(), maxImageBytes: 100 }));

const database = fakeDatabase();
const folder = '/photos';
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 1, 2]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const webp = Buffer.from('RIFF....WEBP');

describe('reading a photo the user picked', () => {
  beforeEach(() => {
    memoryFs.reset();
    memoryFs.sync.mkdirSync('/in');
  });

  it.each([
    ['a.jpg', jpeg, 'jpg'],
    ['a.png', png, 'png'],
    ['a.webp', webp, 'webp'],
  ])('knows %s by its first bytes', async (name, data, extension) => {
    memoryFs.sync.writeFileSync(`/in/${name}`, data);

    expect(await readPhotoFile(`/in/${name}`)).toEqual({ image: { extension, data } });
  });

  it('says why a file cannot be used: not there, too large, or not an image', async () => {
    memoryFs.sync.writeFileSync('/in/big.jpg', Buffer.alloc(101, 1));
    memoryFs.sync.writeFileSync('/in/text.jpg', 'hello');

    expect(await readPhotoFile('/in/none.jpg')).toEqual({ reason: 'unreadable' });
    expect(await readPhotoFile('/in/big.jpg')).toEqual({ reason: 'tooLarge' });
    expect(await readPhotoFile('/in/text.jpg')).toEqual({ reason: 'notImage' });
  });
});

describe('keeping a photo', () => {
  beforeEach(() => {
    memoryFs.reset();
    memoryFs.sync.mkdirSync(folder);
    vi.mocked(executeQuery).mockReset().mockResolvedValue([]);
    vi.mocked(getRecords).mockReset().mockResolvedValue([]);
  });

  it('writes the picked image under a name of its content, saves it as manual, and removes the one before with its smaller copy', async () => {
    memoryFs.sync.writeFileSync(`${folder}/artist-old.jpg`, 'old');
    memoryFs.sync.writeFileSync(`${folder}/artist-old-optimized.png`, 'old');
    vi.mocked(getRecords).mockResolvedValue([{ picture: 'artist-old.jpg' }] as never);

    await chooseArtistPhoto(database, folder, 'adam', { extension: 'jpg', data: jpeg });

    const [name] = memoryFs.sync.readdirSync(folder);
    expect(memoryFs.sync.readdirSync(folder)).toHaveLength(1);
    expect(name).toMatch(/^artist-[0-9a-f]{16}-[0-9a-f]{12}\.jpg$/);
    expect(vi.mocked(executeQuery).mock.calls[0][1].variables.slice(0, 2)).toEqual(['adam', name]);
  });

  it('keeps the file of a lookup, which is not named as a photo of the user', async () => {
    memoryFs.sync.writeFileSync(`${folder}/lookup.jpg`, 'x');
    vi.mocked(getRecords).mockResolvedValue([{ picture: 'lookup.jpg' }] as never);

    await removeArtistPhoto(database, folder, 'adam');

    expect(memoryFs.sync.existsSync(`${folder}/lookup.jpg`)).toBe(true);
    expect(vi.mocked(executeQuery).mock.calls[0][1].variables.slice(0, 2)).toEqual(['adam', null]);
  });

  it('removes the file of a photo that is taken away, and forgets a name', async () => {
    memoryFs.sync.writeFileSync(`${folder}/artist-x.png`, 'x');
    vi.mocked(getRecords).mockResolvedValue([{ picture: 'artist-x.png' }] as never);

    await removeArtistPhoto(database, folder, 'adam');
    expect(memoryFs.sync.existsSync(`${folder}/artist-x.png`)).toBe(false);

    memoryFs.sync.writeFileSync(`${folder}/artist-x.png`, 'x');
    await resetArtistPhoto(database, folder, 'adam');
    expect(vi.mocked(executeQuery).mock.calls.at(-1)?.[1]).toEqual({ query: 'DELETE FROM artist_photos WHERE key = ?', variables: ['adam'] });
    expect(memoryFs.sync.existsSync(`${folder}/artist-x.png`)).toBe(false);
  });
});
