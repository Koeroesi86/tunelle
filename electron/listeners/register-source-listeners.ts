import { ipcMain, type IpcMainEvent } from 'electron';
import { z } from 'zod';
import { errorMessage } from '@shared/utils/error-message';
import { sourceBrowseSchema, sourceServerInputSchema, type SourceBrowse } from '@shared/schemas/sources';
import type { ListenerContext } from './listener-context';
import { approvalCode } from '../remote/certificate';
import { readCertificate, SourceError } from '../services/sources/source-request';
import { discoverJellyfin } from '../services/sources/jellyfin-discovery';
import type { SourceClient } from '../services/sources/sources';

const certificateRequestSchema = z.object({ url: z.url() });
const removeSchema = z.object({ id: z.uuid() });

const browse = async (client: SourceClient, request: SourceBrowse) => {
  switch (request.what) {
    case 'artists':
      return client.artists();
    case 'albums':
      return client.albumsOf(request.id);
    case 'tracks':
      return client.tracksOf(request.id);
    case 'search':
      return client.search(request.query);
    case 'library':
      return (
        client.library?.(request.kind, request.sort, request.start, request.size) ?? Promise.reject(new Error('This kind of server has no library to list'))
      );
  }
};

/** The servers of the user: the list, adding one (checked before it is kept), removing one, browsing one and reading the certificate of one for the user to approve. See docs/app/sources.md */
const registerSourceListeners = ({ sources }: ListenerContext) => {
  const sendServers = (event: IpcMainEvent) => sources.list().then((servers) => event.sender.send('SOURCE_SERVERS_LOADED', { servers }));

  ipcMain.on('SOURCE_SERVERS', (event) => {
    sendServers(event).catch((error) => console.warn(`The servers could not be read: ${errorMessage(error)}`));
  });

  ipcMain.on('SOURCE_SERVER_SAVE', (event, payload: unknown) => {
    const input = sourceServerInputSchema.safeParse(payload);
    if (!input.success) return event.sender.send('SOURCE_SERVER_FAILED', { error: 'The server is not valid' });

    const { password, ...server } = input.data;
    sources
      .check(server, password)
      .then(() => sources.save(server, password))
      .then(() => sendServers(event))
      // a code of the server (40 is a wrong user or password) lets the page word it in its language
      .catch((error) =>
        event.sender.send('SOURCE_SERVER_FAILED', { id: server.id, error: errorMessage(error), code: error instanceof SourceError ? error.code : undefined })
      );
  });

  ipcMain.on('SOURCE_SERVER_REMOVE', (event, payload: unknown) => {
    const { id } = removeSchema.catch({ id: '' }).parse(payload);

    sources
      .remove(id)
      .then(() => sendServers(event))
      .catch((error) => console.warn(`The server could not be removed: ${errorMessage(error)}`));
  });

  // the certificate of a server that is not valid, with the code both the page and the user can compare; the page asks to keep it with the server
  ipcMain.on('SOURCE_CERTIFICATE', (event, payload: unknown) => {
    const request = certificateRequestSchema.safeParse(payload);
    if (!request.success) return;

    readCertificate(new URL(request.data.url))
      .then((certificate) => event.sender.send('SOURCE_CERTIFICATE_READ', { url: request.data.url, certificate, code: approvalCode(certificate) }))
      .catch((error) => event.sender.send('SOURCE_SERVER_FAILED', { error: errorMessage(error) }));
  });

  // the Jellyfin servers that answer on the network, for the page to offer; the user still gives the login
  ipcMain.on('SOURCE_DISCOVER', (event) => {
    discoverJellyfin()
      .then((servers) => event.sender.send('SOURCE_DISCOVERED', { servers }))
      .catch((error) => event.sender.send('SOURCE_DISCOVERED', { servers: [], error: errorMessage(error) }));
  });

  ipcMain.on('SOURCE_BROWSE', async (event, payload: unknown) => {
    const request = sourceBrowseSchema.safeParse(payload);
    if (!request.success) return;

    const client = await sources.clientOf(request.data.serverId);
    if (!client) return event.sender.send('SOURCE_BROWSED', { request: request.data, error: 'The server is not known' });

    browse(client, request.data)
      .then((result) => event.sender.send('SOURCE_BROWSED', { request: request.data, result }))
      .catch((error) => event.sender.send('SOURCE_BROWSED', { request: request.data, error: errorMessage(error) }));
  });
};

export default registerSourceListeners;
