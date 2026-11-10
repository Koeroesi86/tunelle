import path from 'path';
import { protocol } from 'electron';
import type { Database } from 'sqlite3';
import { resolveAlbumArt } from '../library/art/album-art';
import { getCoverAccent } from '../library/art/album-art-accents';
import { findPlayableTrack } from '../repositories/library-repository';
import { libraryRoutes } from './library-routes';
import { serveRadio } from './radio-protocol';
import type { RadioStreamDeps } from './radio-proxy';
import type { RadioArtImage } from '../services/radio-art';
import { playableFile } from './decoded-track';
import { notFound, serveFile } from './serve-file';
import { artKeySchema, assetPathSchema, stationUuidSchema, trackPathSchema } from '../schemas/routes';

const scheme = 'tunelle';
const host = 'app';

/** The page and everything it asks for is served from this origin, so no request is cross-origin */
export const tunelleOrigin = `${scheme}://${host}`;

/** Has to run before the app is ready */
export const registerTunelleScheme = () =>
  protocol.registerSchemesAsPrivileged([{ scheme, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);

interface TunelleDeps {
  getDatabase: () => Database | undefined;
  radio: RadioStreamDeps & { getArt?: (key: string) => RadioArtImage | undefined; getLogo?: (uuid: string) => Promise<RadioArtImage | undefined> };
  /** The folder of the built page */
  appRoot: string;
  /** The origin of the dev server, the page of a development run is not served from here and asks across origins */
  devOrigin?: string;
}

const pageFile = (appRoot: string, pathname: string) => {
  const file = path.resolve(appRoot, `.${pathname === '/' ? '/index.html' : decodeURIComponent(pathname)}`);
  return file.startsWith(appRoot + path.sep) ? file : undefined;
};

const route = async (request: Request, { getDatabase, radio, appRoot }: TunelleDeps) => {
  const { pathname, searchParams } = new URL(request.url);
  if (Object.hasOwn(libraryRoutes, pathname)) return libraryRoutes[pathname](getDatabase(), searchParams);

  if (pathname === '/track') {
    const database = getDatabase();
    const filePath = trackPathSchema.safeParse(searchParams.get('path')).data;
    // only files of the library are served, the path comes from the database and not from the request
    const track = database && filePath ? await findPlayableTrack(database, filePath) : undefined;
    // a format that Chromium does not play is decoded to a WAV file first (docs/app/decoder-proxy.md)
    const file = track ? await playableFile(track, request.signal) : undefined;
    return file ? serveFile(file, request) : notFound();
  }

  const { kind, key = '' } = assetPathSchema.safeParse(pathname).data ?? {};
  if (kind === 'radio') return serveRadio(key, request.signal, radio);
  if (kind === 'radio-art') {
    const art = artKeySchema.safeParse(key).success ? radio.getArt?.(key) : undefined;
    return art ? new Response(new Uint8Array(art.data), { headers: { 'Content-Type': art.type, 'Cache-Control': 'max-age=3600' } }) : notFound();
  }
  if (kind === 'radio-logo') {
    const logo = stationUuidSchema.safeParse(key).success ? await radio.getLogo?.(key) : undefined;
    return logo ? new Response(new Uint8Array(logo.data), { headers: { 'Content-Type': logo.type, 'Cache-Control': 'max-age=86400' } }) : notFound();
  }
  if (kind === 'albumart') {
    const albumArt = await resolveAlbumArt(path.basename(key));
    const database = getDatabase();
    // the colour of the cover goes with it, so the page does not read the pixels again; the header is left out while it is not picked
    const accent = database ? await getCoverAccent(database, path.basename(key)) : undefined;
    return albumArt ? serveFile(albumArt, request, { 'Cache-Control': 'Public', ...(accent === undefined ? {} : { 'X-Cover-Accent': accent }) }) : notFound();
  }

  const file = pageFile(appRoot, pathname);
  return file ? serveFile(file, request) : notFound();
};

const allowDevOrigin = (request: Request, response: Response, devOrigin?: string) => {
  if (!devOrigin || request.headers.get('origin') !== devOrigin) return response;

  response.headers.set('Access-Control-Allow-Origin', devOrigin);
  response.headers.set('Access-Control-Allow-Headers', 'Range, Content-Type');
  response.headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  response.headers.set('Vary', 'Origin');
  return response;
};

export const handleTunelleRequest = (deps: TunelleDeps) => async (request: Request) => {
  if (new URL(request.url).hostname !== host) return notFound();
  if (request.method === 'OPTIONS') return allowDevOrigin(request, new Response(undefined, { status: 204 }), deps.devOrigin);
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(undefined, { status: 405 });

  const response = await route(request, deps).catch(() => new Response(undefined, { status: 500 }));
  return allowDevOrigin(request, response, deps.devOrigin);
};

export const handleTunelleProtocol = (deps: TunelleDeps) => protocol.handle(scheme, handleTunelleRequest(deps));
