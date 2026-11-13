import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Database } from 'sqlite3';
import executeQuery from '../database/execute-query';
import { createTestDatabase } from '../test-database';
import { chooseArtistPhoto, readPhotoFile, removeArtistPhoto, resetArtistPhoto } from './artist-photo-choice';
import { maxImageBytes } from './artist-photos';

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('png')]);
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('jpeg')]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);

describe('the photo of an artist the user chooses', () => {
  let database: Database;
  let folder: string;
  const records = () => executeQuery<{ key: string; picture: string | null; manual: number }>(database, { query: 'SELECT key, picture, manual FROM artist_photos', variables: [] });
  const files = () => fs.readdirSync(folder).sort();

  beforeEach(async () => {
    database = await createTestDatabase();
    folder = fs.mkdtempSync(path.join(os.tmpdir(), 'tunelle-photo-choice-'));
  });

  afterEach(() => {
    fs.rmSync(folder, { recursive: true, force: true });
  });

  it('reads a JPEG, a PNG and a WebP by what is in the file, not by its name', async () => {
    const read = async (data: Buffer) => {
      const file = path.join(folder, 'picked.txt');
      fs.writeFileSync(file, data);
      return readPhotoFile(file);
    };

    expect(await read(jpeg)).toEqual({ image: { extension: 'jpg', data: jpeg } });
    expect(await read(png)).toEqual({ image: { extension: 'png', data: png } });
    expect(await read(webp)).toEqual({ image: { extension: 'webp', data: webp } });
    expect(await read(Buffer.from('<svg></svg>'))).toEqual({ reason: 'notImage' });
  });

  it('refuses a file that is missing, a folder and an image over the limit', async () => {
    const big = path.join(folder, 'big.png');
    fs.writeFileSync(big, Buffer.concat([png, Buffer.alloc(maxImageBytes)]));

    expect(await readPhotoFile(path.join(folder, 'missing.png'))).toEqual({ reason: 'unreadable' });
    expect(await readPhotoFile(folder)).toEqual({ reason: 'unreadable' });
    expect(await readPhotoFile(big)).toEqual({ reason: 'tooLarge' });
  });

  it('keeps the image as a manual photo, in a file that another image does not reuse, and deletes the one it replaces', async () => {
    await executeQuery(database, { query: "INSERT INTO artist_photos (key, picture, checkedAt) VALUES ('adam', 'artist-0123456789abcdef.jpg', 1)", variables: [] });
    fs.writeFileSync(path.join(folder, 'artist-0123456789abcdef.jpg'), 'looked up');
    fs.writeFileSync(path.join(folder, 'artist-0123456789abcdef-optimized.png'), 'small');

    await chooseArtistPhoto(database, folder, 'adam', { extension: 'png', data: png });
    const [first] = await records();
    await chooseArtistPhoto(database, folder, 'adam', { extension: 'jpg', data: jpeg });
    const [second] = await records();

    expect(first).toMatchObject({ key: 'adam', manual: 1, picture: expect.stringMatching(/^artist-[0-9a-f]{16}-[0-9a-f]{12}\.png$/) });
    expect(second.picture).toMatch(/\.jpg$/);
    expect(second.picture).not.toBe(first.picture);
    expect(files()).toEqual([second.picture]);
    expect(fs.readFileSync(path.join(folder, second.picture ?? ''))).toEqual(jpeg);
  });

  it('removes the photo for good: the name has no picture and is marked as chosen', async () => {
    await chooseArtistPhoto(database, folder, 'adam', { extension: 'png', data: png });

    await removeArtistPhoto(database, folder, 'adam');

    expect(await records()).toEqual([{ key: 'adam', picture: null, manual: 1 }]);
    expect(files()).toEqual([]);
  });

  it('resets a name so that it is looked up as new, and leaves the photos of the others', async () => {
    await chooseArtistPhoto(database, folder, 'adam', { extension: 'png', data: png });
    await chooseArtistPhoto(database, folder, 'eve', { extension: 'jpg', data: jpeg });

    await resetArtistPhoto(database, folder, 'adam');

    expect((await records()).map(({ key }) => key)).toEqual(['eve']);
    expect(files()).toHaveLength(1);
  });

  it('does not delete a file that is not a photo of an artist, such as the cover a name points at', async () => {
    fs.writeFileSync(path.join(folder, 'cover.png'), 'cover');
    await executeQuery(database, { query: "INSERT INTO artist_photos (key, picture, checkedAt) VALUES ('adam', 'cover.png', 1)", variables: [] });

    await resetArtistPhoto(database, folder, 'adam');

    expect(files()).toEqual(['cover.png']);
  });
});
