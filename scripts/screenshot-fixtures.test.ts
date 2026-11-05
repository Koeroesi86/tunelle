import { mkdtempSync, readdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseFile } from 'music-metadata';
import { afterEach, describe, expect, it } from 'vitest';
import { createRadioBrowser } from '../electron/services/radioBrowser';
import { albums, startDirectory, stations, writeLibrary } from './screenshot-fixtures';

describe('writeLibrary', () => {
  let folder: string;

  afterEach(() => rmSync(folder, { recursive: true, force: true }));

  it('writes the tracks of every album, tagged, with the cover of the album', async () => {
    folder = mkdtempSync(join(tmpdir(), 'tunelle-library-test-'));

    writeLibrary(folder);

    const files = readdirSync(folder, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.flac'));
    const tracks = await Promise.all(files.map((file) => parseFile(join(folder, file))));
    expect(tracks).toHaveLength(albums.flatMap((album) => album.tracks).length);
    expect(tracks.map(({ common }) => common.album).filter((album, index, all) => all.indexOf(album) === index)).toEqual(
      expect.arrayContaining(albums.map((album) => album.title))
    );
    expect(tracks.every(({ common }) => common.picture?.length === 1)).toBe(true);
    // the pictures show these, so a change of them is a change of the pictures
    expect(tracks.map(({ format }) => Math.round(format.duration ?? 0)).slice(0, 4)).toEqual(expect.arrayContaining([167, 184, 201, 218]));
    // the covers are drawn pixel by pixel, which a runner with coverage on takes its time for
  }, 30000);
});

describe('startDirectory', () => {
  let directory: Awaited<ReturnType<typeof startDirectory>> | undefined;

  afterEach(() => directory?.close());

  it('lists the stations the way the app asks the directory for them', async () => {
    directory = await startDirectory();
    const radio = createRadioBrowser('test', directory.origin);

    const { stations: listed } = await radio.searchStations({});

    expect(listed.map((station) => station.name)).toEqual(stations.map((station) => station.name));
    expect(listed[0]).toMatchObject({ country: 'Hungary', codec: 'MP3', bitrate: 192 });
  });

  it('gives every station a logo that is an image, and the albums a genre', async () => {
    directory = await startDirectory();
    const radio = createRadioBrowser('test', directory.origin);

    const { stations: listed } = await radio.searchStations({});

    expect(listed.every((station) => station.hasLogo)).toBe(true);
    expect((await fetch(radio.getLogoUrl(listed[0]?.uuid ?? '') ?? '')).headers.get('content-type')).toBe('image/png');
    expect(albums.every((album) => album.genre)).toBe(true);
  });

  it('answers the lists of the filters', async () => {
    directory = await startDirectory();
    const radio = createRadioBrowser('test', directory.origin);

    const countries = await radio.getOptions('countries');
    const codecs = await radio.getOptions('codecs');

    expect(countries.find((country) => country.value === 'DE')).toMatchObject({ name: 'Germany', stationCount: 2 });
    expect(codecs.map((codec) => codec.name)).toEqual(expect.arrayContaining(['MP3', 'AAC', 'FLAC']));
  });

  it('plays a station that announces a song with the cover of its album, and the cover is an image', async () => {
    directory = await startDirectory();
    const radio = createRadioBrowser('test', directory.origin);

    const stream = await radio.resolveStream('00000000-0000-4000-8000-000000000000');
    const response = await fetch(stream, { headers: { 'icy-metadata': '1' } });
    const reader = (response.body ?? new ReadableStream<Uint8Array>()).getReader();
    const received: Uint8Array[] = [];
    let length = 0;
    while (length < 16001) {
      const { value } = await reader.read();
      received.push(value ?? new Uint8Array());
      length += value?.length ?? 0;
    }
    await reader.cancel();
    const announced = Buffer.concat(received).subarray(16000).toString('latin1');

    expect(response.headers.get('icy-metaint')).toBe('16000');
    expect(announced).toContain("StreamTitle='Northern Lights Orchestra - Aurora Drift';");
    const art = announced.match(/StreamUrl='(.*?)';/)?.[1] ?? '';
    expect((await fetch(art)).headers.get('content-type')).toBe('image/png');
  });
});
