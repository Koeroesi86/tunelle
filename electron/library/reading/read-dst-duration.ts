import fs from 'fs';
import { readBytes } from './read-bytes';

/** The id and the 64 bit size of a DSDIFF chunk */
const headerLength = 12;
/** The `FRM8` header and the form type, before the first chunk */
const firstChunk = 16;
/** The header of the `FRTE` chunk, the number of frames and the frames per second */
const frameInfoLength = headerLength + 6;

const toDuration = (info: Buffer) => {
  if (info.length < frameInfoLength || info.toString('latin1', 0, 4) !== 'FRTE') return undefined;
  const perSecond = info.readUInt16BE(headerLength + 4);
  return perSecond ? info.readUInt32BE(headerLength) / perSecond : undefined;
};

const findDuration = async (handle: fs.promises.FileHandle, position: number): Promise<number | undefined> => {
  const header = await readBytes(handle, headerLength, position);
  if (header.length < headerLength) return undefined;
  if (header.toString('latin1', 0, 4) === 'DST ') return toDuration(await readBytes(handle, frameInfoLength, position + headerLength));
  const size = Number(header.readBigUInt64BE(4));
  return findDuration(handle, position + headerLength + size + (size % 2));
};

/** The seconds of a DST compressed DSDIFF, from the `FRTE` chunk that starts its sound chunk. See docs/app/decoded-formats.md */
export const readDstDuration = async (fileName: string) => {
  const handle = await fs.promises.open(fileName);
  try {
    return await findDuration(handle, firstChunk);
  } finally {
    await handle.close();
  }
};
