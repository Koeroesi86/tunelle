import type { Track } from '../types/library';
import { readTrackFile } from './readTrackFile';

type ReadRequest = { id: number; fileName: string; appDataPath: string };
export type ReadReply = { id: number; track: Track } | { id: number; error: string };

/** Runs in a utility process of Electron: reads one file at a time as the app asks, and answers with its tags or the reason it could not */
const port = process.parentPort;

port?.on('message', async ({ data }: { data: ReadRequest }) => {
  const reply: ReadReply = await readTrackFile(data.fileName, data.appDataPath).then(
    (track) => ({ id: data.id, track }),
    (error: unknown) => ({ id: data.id, error: error instanceof Error ? error.message : `${error}` })
  );
  port.postMessage(reply);
});
