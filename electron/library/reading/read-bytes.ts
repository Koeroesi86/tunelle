import type fs from 'fs';

/** The bytes at a position of an open file, fewer than asked for at its end */
export const readBytes = async (handle: fs.promises.FileHandle, length: number, position: number) => {
  const { buffer, bytesRead } = await handle.read(Buffer.alloc(length), 0, length, position);
  return buffer.subarray(0, bytesRead);
};
