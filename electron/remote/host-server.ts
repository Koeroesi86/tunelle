import { once } from 'node:events';
import { createServer, type Server } from 'node:https';
import type { AccessControl } from './access';
import type { HostIdentity } from './certificate';
import type { ControlCommand } from './control-command';
import { createRoutes, type ServeAudio } from './host-routes';
import type { NowPlaying } from '../../shared/schemas/now-playing';

export interface HostServer {
  port: number;
  /** What the approved listeners are shown; the renderer sends a new one when the track, the play state or the position jumps */
  setNowPlaying: (snapshot: NowPlaying, trackPath?: string) => void;
  close: () => Promise<void>;
}

export interface HostOptions {
  identity: HostIdentity;
  access: AccessControl;
  /** 0 picks a free port */
  port?: number;
  /** Only this machine, which is not advertised and asks for no firewall prompt */
  loopbackOnly?: boolean;
  /** A command of a listener that the host allowed to control */
  onControl?: (command: ControlCommand) => void;
  /** Serves the file of the track that plays; without it the audio route answers 404 */
  serveAudio?: ServeAudio;
}

/** The HTTPS server of the host around its routes (host-routes.ts). See docs/app/remote-access-discovery.md */
export const startHostServer = async ({ identity, access, port = 0, loopbackOnly = false, onControl, serveAudio }: HostOptions): Promise<HostServer> => {
  const routes = createRoutes(access, onControl, serveAudio);
  const server: Server = createServer({ cert: identity.certificate, key: identity.key }, routes.handle);
  // a socket that fails ends there: an unhandled error would open the error dialog of the app
  server.on('tlsClientError', () => undefined);
  server.on('clientError', (_error, socket) => socket.destroy());
  // a write to a peer that is gone (EPIPE) is an error of that socket only, also after its request was answered
  server.on('secureConnection', (socket) => socket.on('error', () => socket.destroy()));

  server.listen(port, loopbackOnly ? '127.0.0.1' : '0.0.0.0');
  await once(server, 'listening');
  const address = server.address();
  if (typeof address !== 'object' || !address) throw new Error('The host server has no port');

  return {
    port: address.port,
    setNowPlaying: routes.setNowPlaying,
    close: () => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
};
