import fs from 'fs';

export type ProbeRequest = { id: number; fileName: string };
export type ProbeReply = { id: number; readable: boolean };

/** Opens the file and reads its first byte: the data is asked of the drive, not only its directory entry */
const readFirstByte = async (fileName: string) => {
  const handle = await fs.promises.open(fileName, 'r');
  await handle.read(Buffer.alloc(1), 0, 1, 0).finally(() => handle.close());
};

/** Whether the file can be read; a call on a share that went away can wait for ever, which is why it is made here and not in the main process */
export const answer = ({ id, fileName }: ProbeRequest): Promise<ProbeReply> =>
  readFirstByte(fileName).then(
    () => ({ id, readable: true }),
    () => ({ id, readable: false })
  );

/** Runs in a utility process of Electron: reads the first byte of the files the app asks for, one at a time */
const port = process.parentPort;

port?.on('message', async ({ data }: { data: ProbeRequest }) => port.postMessage(await answer(data)));
