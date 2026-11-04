import type { Track } from '../types/library';
import { readTrackFile } from './readTrackFile';

export type ReadRequest = { id: number; fileName: string; appDataPath: string };
export type ReadReply = { id: number; track: Track } | { id: number; error: string };

/** Answer a request with the tags of the file or the reason they could not be read */
export const answer = (request: ReadRequest): Promise<ReadReply> =>
  readTrackFile(request.fileName, request.appDataPath).then(
    (track) => ({ id: request.id, track }),
    (error: unknown) => ({ id: request.id, error: error instanceof Error ? error.message : `${error}` })
  );

/** Runs in a utility process of Electron: reads one file at a time as the app asks */
const port = process.parentPort;

port?.on('message', async ({ data }: { data: ReadRequest }) => port.postMessage(await answer(data)));
