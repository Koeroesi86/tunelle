import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

const lifetime = 5 * 60 * 1000;

/**
 * An address on this machine that answers with a redirect to the target, as a launcher may cut an address at its `&`. See docs/app/plex.md
 * It listens on the loopback only, under a path nobody can guess, and stops when the signal aborts or after five minutes.
 */
export const serveRedirect = async (target: string, signal: AbortSignal): Promise<string> => {
  const path = `/${randomBytes(16).toString('hex')}`;
  const server = createServer((request, response) => {
    if (request.url !== path) return response.writeHead(404).end();
    return response.writeHead(302, { Location: target, 'Cache-Control': 'no-store' }).end();
  });
  const stop = () => {
    server.close();
    server.closeAllConnections();
  };

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  AbortSignal.any([signal, AbortSignal.timeout(lifetime)]).addEventListener('abort', stop, { once: true });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('The local redirect has no port');
  return `http://127.0.0.1:${address.port}${path}`;
};
