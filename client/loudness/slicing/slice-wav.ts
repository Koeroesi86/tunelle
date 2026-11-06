import { SliceError, mustRead } from './types';
import type { ReadRange, Slicer } from './types';

const chunkHeader = 8;

const text = (bytes: Uint8Array, offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));

interface WavLayout {
  /** The `fmt ` chunk as it is, with its header */
  format: Uint8Array;
  blockAlign: number;
  dataStart: number;
  dataEnd: number;
}

const dataLayout = (format: Uint8Array | undefined, dataStart: number, length: number, size: number): WavLayout => {
  if (!format) throw new SliceError('A WAV file has its sound before its format');
  // a stream that did not know its length writes 0 or the largest number: the sound goes on to the end of the file
  const dataEnd = length === 0 || dataStart + length > size ? size : dataStart + length;
  return { format, blockAlign: new DataView(format.buffer, format.byteOffset).getUint16(chunkHeader + 12, true), dataStart, dataEnd };
};

/** Where the format and the sound of a WAV file are: the chunks are walked one by one, as a file can have tags before its sound */
const layoutFrom = async (read: ReadRange, size: number, offset: number, format: Uint8Array | undefined): Promise<WavLayout> => {
  const header = offset + chunkHeader <= size ? await read(offset, offset + chunkHeader) : undefined;
  if (!header || header.length < chunkHeader) throw new SliceError('A WAV file without sound');

  const length = new DataView(header.buffer, header.byteOffset).getUint32(4, true);
  const next = offset + chunkHeader + length + (length % 2);
  if (text(header, 0) === 'data') return dataLayout(format, offset + chunkHeader, length, size);
  return layoutFrom(read, size, next, text(header, 0) === 'fmt ' ? await read(offset, next) : format);
};

/** The header of a WAV file of its own for `dataLength` bytes of the sound, with the format chunk of the file */
const headerOf = (format: Uint8Array, dataLength: number) => {
  const header = new Uint8Array(12 + format.length + chunkHeader);
  const view = new DataView(header.buffer);
  header.set(
    [...'RIFF'].map((letter) => letter.charCodeAt(0)),
    0
  );
  view.setUint32(4, header.length - chunkHeader + dataLength, true);
  header.set(
    [...'WAVE'].map((letter) => letter.charCodeAt(0)),
    8
  );
  header.set(format, 12);
  header.set(
    [...'data'].map((letter) => letter.charCodeAt(0)),
    12 + format.length
  );
  view.setUint32(12 + format.length + 4, dataLength, true);
  return header;
};

/** A WAV file is cut anywhere between two samples of all the channels, so each piece is the file with its own header and a part of the sound */
export const sliceWav: Slicer = async function* (read, size, sliceBytes) {
  const { format, blockAlign, dataStart, dataEnd } = await layoutFrom(read, size, 12, undefined);
  if (blockAlign === 0) throw new SliceError('A WAV file with no size of a sample');
  const step = Math.max(Math.floor(sliceBytes / blockAlign), 1) * blockAlign;

  for (let start = dataStart; start < dataEnd; start += step) {
    const end = Math.min(start + step, dataEnd);
    const sound = await mustRead(read, start, end, 'A piece of a WAV file');
    const header = headerOf(format, sound.length);
    const piece = new Uint8Array(header.length + sound.length);
    piece.set(header);
    piece.set(sound, header.length);
    yield { bytes: piece, skip: 0 };
  }
};
