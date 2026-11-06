import fs from 'fs';
import { isRecord } from '@shared/utils/is-record';

export type ProbeKind = 'file' | 'entries' | 'stat' | 'listing';
export type ProbeRequest = { id: number; kind: ProbeKind; path: string };
/** `readable` is whether the call went through; `code` is the system error when it did not */
export type ProbeReply = {
  id: number;
  readable: boolean;
  code?: string;
  /** The modification time of a folder, in milliseconds (`stat`, `listing`) */
  time?: number;
  /** Whether a folder has no entry (`entries`) */
  empty?: boolean;
  /** The names in a folder, and the ones that are folders (`listing`) */
  names?: string[];
  directories?: string[];
};

type Payload = Omit<ProbeReply, 'id' | 'readable' | 'code'>;

/** Opens the file and reads its first byte: the data is asked of the drive, not only its directory entry */
const readFirstByte = async (fileName: string): Promise<Payload> => {
  const handle = await fs.promises.open(fileName, 'r');
  await handle.read(Buffer.alloc(1), 0, 1, 0).finally(() => handle.close());
  return {};
};

const hasNoEntry = async (folderPath: string): Promise<Payload> => {
  const directory = await fs.promises.opendir(folderPath);
  const entry = await directory.read().finally(() => directory.close());
  return { empty: entry === null };
};

const readTime = async (folderPath: string): Promise<Payload> => ({ time: Math.floor((await fs.promises.stat(folderPath)).mtimeMs) });

const readListing = async (folderPath: string): Promise<Payload> => {
  const [stat, entries] = await Promise.all([fs.promises.stat(folderPath), fs.promises.readdir(folderPath, { withFileTypes: true })]);
  return {
    time: Math.floor(stat.mtimeMs),
    names: entries.map((entry) => entry.name),
    directories: entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
  };
};

const reads: Record<ProbeKind, (path: string) => Promise<Payload>> = { file: readFirstByte, entries: hasNoEntry, stat: readTime, listing: readListing };

const codeOf = (error: unknown) => (isRecord(error) && typeof error.code === 'string' ? error.code : undefined);

/** Whether the call goes through; a call on a share that went away can wait for ever, which is why it is made here and not in the main process */
export const answerProbe = ({ id, kind, path }: ProbeRequest): Promise<ProbeReply> =>
  reads[kind](path).then(
    (payload) => ({ id, readable: true, ...payload }),
    (error: unknown) => ({ id, readable: false, code: codeOf(error) })
  );

/** Runs in a utility process of Electron: makes the calls the app asks for, which may all wait at once */
const port = process.parentPort;

port?.on('message', async ({ data }: { data: ProbeRequest }) => port.postMessage(await answerProbe(data)));
