import { once } from 'node:events';
import { createServer, request, type Server } from 'node:https';
import { TLSSocket } from 'node:tls';
import { afterEach, describe, expect, it } from 'vitest';
import { approvalCode, createHostIdentity, pinnedOptions, unpinnedOptions } from './certificate';

const servers: Server[] = [];

const listen = async (identity = createHostIdentity('Host')) => {
  const server = createServer({ cert: identity.certificate, key: identity.key }, (_request, response) => response.end('ok'));

  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (typeof address !== 'object' || !address) throw new Error('The server has no port');
  return { port: address.port, identity };
};

/** The status of the answer, or the message of the refusal */
const get = (port: number, options: object) =>
  new Promise<string>((resolve) => {
    const call = request({ host: '127.0.0.1', port, ...options }, (response) => {
      response.resume();
      resolve(`${response.statusCode}`);
    });

    call.on('error', (error) => resolve(error.message));
    call.end();
  });

describe('certificate over TLS', () => {
  afterEach(() => {
    servers.splice(0).forEach((server) => server.close());
  });

  it('answers a listener that pinned the certificate of the host', async () => {
    const { port, identity } = await listen();

    expect(await get(port, pinnedOptions(identity.certificate))).toBe('200');
  });

  it('refuses a host that presents another certificate than the pinned one', async () => {
    const { port } = await listen();

    expect(await get(port, pinnedOptions(createHostIdentity('Host').certificate))).toContain('self-signed certificate');
  });

  it('reads the certificate of the first contact, for the same code on both screens', async () => {
    const { port, identity } = await listen();
    const code = await new Promise<string>((resolve, reject) => {
      const call = request({ host: '127.0.0.1', port, ...unpinnedOptions }, (response) => {
        response.resume();
        if (!(response.socket instanceof TLSSocket)) return reject(new Error('Not a TLS socket'));
        const raw = response.socket.getPeerCertificate().raw.toString('base64');
        resolve(approvalCode(`-----BEGIN CERTIFICATE-----\n${raw}\n-----END CERTIFICATE-----\n`));
      });

      call.on('error', reject);
      call.end();
    });

    expect(code).toBe(approvalCode(identity.certificate));
  });
});
