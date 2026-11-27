import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import { writeFlac } from '../../scripts/screenshots/screenshot-media';

const seconds = 30;

const songs = [
  { id: 'song-1', title: 'Remote A', track: 1, frequency: 440 },
  { id: 'song-2', title: 'Remote Octave', track: 2, frequency: 880 },
];

const album = { id: 'album-1', name: 'Far Away', artist: 'The Servers', songCount: songs.length, year: 2024 };

/** A Subsonic server of one album of sines. `takeAway` ends it: the open connections break, a new one is refused */
export const startSubsonic = () => {
  const files = new Map(songs.map(({ id, title, frequency }) => [id, writeFlac({ seconds, frequency, cover: Buffer.alloc(0), tags: { TITLE: title } })]));
  const listed = songs.map((song) => ({ ...song, artist: album.artist, album: album.name, suffix: 'flac', duration: seconds }));

  const calls = new Map<string, object>([
    ['/rest/ping.view', {}],
    ['/rest/getAlbumList2.view', { albumList2: { album: [album] } }],
    ['/rest/getAlbum.view', { album: { ...album, song: listed } }],
  ]);

  const answer = (request: IncomingMessage, response: ServerResponse) => {
    const { pathname, searchParams } = new URL(request.url ?? '/', 'http://subsonic.test');
    const file = pathname === '/rest/stream.view' ? files.get(searchParams.get('id') ?? '') : undefined;
    if (file) return response.writeHead(200, { 'content-type': 'audio/flac', 'content-length': file.length }).end(file);

    const body = calls.get(pathname);
    if (!body) return response.writeHead(404).end();

    return response
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ 'subsonic-response': { status: 'ok', version: '1.16.1', ...body } }));
  };

  const server = createServer(answer);

  return new Promise<{ url: string; takeAway: () => void }>((done) =>
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      done({
        url: `http://127.0.0.1:${typeof address === 'object' ? address?.port : 0}`,
        takeAway: () => (server.close(), server.closeAllConnections()),
      });
    })
  );
};
