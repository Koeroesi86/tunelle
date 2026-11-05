import { mkdirSync, writeFileSync } from 'fs';
import { createServer } from 'http';
import type { ServerResponse, IncomingMessage } from 'http';
import type { AddressInfo } from 'net';
import { join } from 'path';
import { drawCover, writeFlac } from './screenshot-media';
import type { CoverSpec } from './screenshot-media';

// everything the screenshots show is made up here: no real artist, cover or station is in a picture of the site

// a track is a second longer than the one before it, so the lists do not look copied
const durations = [167, 184, 201, 218];

interface Album {
  title: string;
  genre: string;
  artist: string;
  year: number;
  tracks: string[];
  cover: CoverSpec;
}

const albums: Album[] = [
  {
    title: 'Night Shift',
    genre: 'Synthwave',
    artist: 'The Velvet Engine',
    year: 2018,
    tracks: ['Neon Rain', 'Last Train', 'Overclock', 'Afterhours'],
    cover: {
      sky: [
        [38, 8, 84],
        [226, 56, 140],
      ],
      sun: [255, 200, 90],
      ground: [
        [120, 30, 150],
        [36, 8, 76],
      ],
      shape: 'grid',
    },
  },
  {
    title: 'Room Tones',
    genre: 'Chamber',
    artist: 'Juniper Quartet',
    year: 2023,
    tracks: ['First Light', 'Soft Hands', 'Interlude', 'Open Window'],
    cover: {
      sky: [
        [236, 232, 214],
        [250, 244, 228],
      ],
      sun: [236, 150, 70],
      ground: [
        [96, 150, 110],
        [52, 100, 78],
      ],
      shape: 'mountains',
    },
  },
  {
    title: 'Salt and Static',
    genre: 'Indie',
    artist: 'Marble Coast',
    year: 2019,
    tracks: ['Sea Wall', 'Tape Hiss', 'Low Tide Radio', 'Harbour Lights'],
    cover: {
      sky: [
        [232, 84, 48],
        [250, 150, 70],
      ],
      sun: [255, 214, 80],
      ground: [
        [210, 70, 40],
        [120, 32, 30],
      ],
      shape: 'waves',
    },
  },
  {
    title: 'Small Hours',
    genre: 'Indie',
    artist: 'Ada Rivers',
    year: 2022,
    tracks: ['Kitchen Table', 'Paper Boats', 'Slow Burn', 'Porch Light'],
    cover: {
      sky: [
        [70, 40, 96],
        [190, 120, 130],
      ],
      sun: [250, 226, 200],
      ground: [
        [60, 36, 80],
        [28, 18, 46],
      ],
      shape: 'mountains',
    },
  },
  {
    title: 'Winter Signals',
    genre: 'Ambient',
    artist: 'Northern Lights Orchestra',
    year: 2021,
    tracks: ['Aurora Drift', 'Glass Lake', 'Long Night', 'Polar Hum'],
    cover: {
      sky: [
        [10, 20, 60],
        [40, 90, 140],
      ],
      sun: [120, 230, 200],
      ground: [
        [48, 60, 150],
        [14, 20, 70],
      ],
      shape: 'waves',
    },
  },
];

// the Radio page lists these in this order, the first one is the one the pictures play
interface Station {
  name: string;
  country: string;
  code: string;
  codec: string;
  bitrate: number;
  tags: string;
}

const stations: Station[] = [
  { name: 'Night Owl FM', country: 'Hungary', code: 'HU', codec: 'MP3', bitrate: 192, tags: 'electronic,chill' },
  { name: 'Lowtide Radio', country: 'United Kingdom', code: 'GB', codec: 'AAC', bitrate: 128, tags: 'indie' },
  { name: 'Juniper Classical', country: 'Germany', code: 'DE', codec: 'FLAC', bitrate: 1000, tags: 'classical' },
  { name: 'Kitchen Table Folk', country: 'Ireland', code: 'IE', codec: 'MP3', bitrate: 128, tags: 'folk' },
  { name: 'Neon Rain 24/7', country: 'United States', code: 'US', codec: 'MP3', bitrate: 192, tags: 'synthwave' },
  { name: 'Polar Hum', country: 'Norway', code: 'NO', codec: 'AAC', bitrate: 96, tags: 'ambient' },
  { name: 'Harbour Jazz', country: 'Netherlands', code: 'NL', codec: 'MP3', bitrate: 160, tags: 'jazz' },
  { name: 'Afterhours Beats', country: 'Germany', code: 'DE', codec: 'MP3', bitrate: 256, tags: 'electronic' },
  { name: 'Slow Burn Soul', country: 'United States', code: 'US', codec: 'AAC', bitrate: 128, tags: 'soul' },
  { name: 'Open Window', country: 'France', code: 'FR', codec: 'MP3', bitrate: 128, tags: 'jazz' },
  { name: 'Salt and Static', country: 'Australia', code: 'AU', codec: 'MP3', bitrate: 192, tags: 'indie' },
  { name: 'Glass Lake', country: 'Canada', code: 'CA', codec: 'FLAC', bitrate: 1000, tags: 'ambient' },
];

// the song that the first station announces, with the cover its StreamUrl names
const announced = { album: albums[4], track: 0 };

const toFile = (text: string, extra = '') =>
  `${text}${extra}`
    .replace(/[^\w ]+/g, '')
    .replace(/ +/g, '-')
    .toLowerCase();

/** Writes the tracks of every album in the folder, one folder per album, silent but tagged and with the cover of the album inside */
const writeLibrary = (folder: string) =>
  albums.forEach((album) => {
    const directory = join(folder, toFile(album.title));
    const cover = drawCover(album.cover);
    mkdirSync(directory, { recursive: true });
    album.tracks.forEach((title, index) =>
      writeFileSync(
        join(directory, `${index + 1}-${toFile(title)}.flac`),
        writeFlac({
          seconds: durations[index],
          tags: {
            TITLE: title,
            ARTIST: album.artist,
            ALBUMARTIST: album.artist,
            ALBUM: album.title,
            GENRE: album.genre,
            TRACKNUMBER: index + 1,
            DATE: album.year,
          },
          cover,
        })
      )
    );
  });

// the byte of a stream of silent mpeg frames (128 kbit/s, 44.1 kHz, a header and zeros) at a position
const frameLength = 417;
const silentByte = (position: number) => [0xff, 0xfb, 0x90, 0x00][position % frameLength] ?? 0;

const audioPerBlock = 16000;

const toDirectoryStation = (station: Station, index: number, origin: string) => ({
  stationuuid: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  name: station.name,
  country: station.country,
  countrycode: station.code,
  tags: station.tags,
  codec: station.codec,
  bitrate: station.bitrate,
  hls: 0,
  favicon: `${origin}/logo/${index}.png`,
});

const countBy = (items: Station[], key: 'code' | 'codec') =>
  [...Map.groupBy(items, (item) => item[key])].map(([value, group]) => [value, group.length] as const);

const portOf = (address: string | AddressInfo | null) => (address && typeof address === 'object' ? address.port : 0);

const json = (response: ServerResponse, body: unknown) => response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(body));

/**
 * A station directory of the stations above, whose first station plays silence and announces a song with the cover of its album:
 * the app is pointed to it with TUNELLE_RADIO_DIRECTORY, so no real station and no search of an image on the internet is involved
 */
const startDirectory = () => {
  const announcement = `${announced.album.artist} - ${announced.album.tracks[announced.track]}`;
  let origin = '';
  const directory = () => stations.map((station, index) => toDirectoryStation(station, index, origin));
  // a logo a station: the cover of an album, small
  const logos = stations.map((_, index) => drawCover(albums[index % albums.length].cover, 96));

  const options = {
    '/json/countries': countBy(stations, 'code').map(([code, stationcount]) => ({
      name: stations.find((station) => station.code === code)?.country,
      iso_3166_1: code,
      stationcount,
    })),
    '/json/languages': [{ name: 'english', stationcount: stations.length }],
    '/json/codecs': countBy(stations, 'codec').map(([name, stationcount]) => ({ name, stationcount })),
    '/json/tags': [...new Set(stations.flatMap((station) => station.tags.split(',')))].map((name) => ({ name, stationcount: 1 })),
  };

  const stream = (request: IncomingMessage, response: ServerResponse) => {
    const asksForMetadata = request.headers['icy-metadata'] === '1';
    const text = Buffer.from(`StreamTitle='${announcement}';StreamUrl='${origin}/cover.png';`);
    const metadata = Buffer.concat([Buffer.from([Math.ceil(text.length / 16)]), text, Buffer.alloc(Math.ceil(text.length / 16) * 16 - text.length)]);
    response.writeHead(200, asksForMetadata ? { 'content-type': 'audio/mpeg', 'icy-metaint': String(audioPerBlock) } : { 'content-type': 'audio/mpeg' });
    let block = 0;
    const send = () => {
      const audio = Buffer.from(Array.from({ length: audioPerBlock }, (_, index) => silentByte(block * audioPerBlock + index)));
      response.write(Buffer.concat([audio, ...(asksForMetadata ? [metadata] : [])]));
      block += 1;
    };
    // the first seconds at once so playback starts promptly, then in real time
    const timer = setInterval(() => (block < 3 ? send() : undefined), 0);
    const pace = setInterval(() => (block >= 3 ? send() : undefined), 1000);
    response.on('close', () => {
      clearInterval(timer);
      clearInterval(pace);
    });
  };

  const cover = drawCover(announced.album.cover);

  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://directory.test');
    if (pathname === '/json/servers') return json(response, []);
    if (pathname === '/json/stations/search') return json(response, directory());
    if (pathname === '/json/stations/byuuid') return json(response, directory());
    if (pathname.startsWith('/json/url/')) return json(response, { url: `${origin}/station` });
    const listed = new Map(Object.entries(options)).get(pathname);
    if (listed) return json(response, listed);
    if (pathname === '/station') return stream(request, response);
    if (pathname.startsWith('/logo/')) return response.writeHead(200, { 'content-type': 'image/png' }).end(logos[Number.parseInt(pathname.slice(6))]);
    if (pathname === '/cover.png') return response.writeHead(200, { 'content-type': 'image/png' }).end(cover);
    return response.writeHead(404).end();
  });

  return new Promise<{ origin: string; close: () => void }>((done) =>
    server.listen(0, '127.0.0.1', () => {
      origin = `http://127.0.0.1:${portOf(server.address())}`;
      done({ origin, close: () => (server.closeAllConnections(), server.close()) });
    })
  );
};

export { albums, stations, writeLibrary, startDirectory };
