import { detectStreamCodec } from '@shared/utils/stream-sample-rate';
import type { Format } from './pcm-encoder';

/** The bits of the 5 bit field of the STREAMINFO block that follows `fLaC`, in a native stream and in Ogg alike */
const flacDepth = (head: Buffer) => {
  const marker = head.indexOf('fLaC');
  return marker < 0 || head.length < marker + 22 ? undefined : (((head[marker + 20] & 1) << 4) | (head[marker + 21] >> 4)) + 1;
};

/** The format that the start of a stream shows, with the depth for FLAC, which is the one that keeps it */
export const detectStreamFormat = (head: Buffer): Format | undefined => {
  const codec = detectStreamCodec(head);
  return codec ? { codec, bitDepth: codec === 'FLAC' ? (flacDepth(head) ?? null) : null } : undefined;
};

/** The format once nothing of it is missing, so the start of the stream needs no more reading */
export const completeStreamFormat = (head: Buffer) => {
  const format = detectStreamFormat(head);
  return format?.codec === 'FLAC' && format.bitDepth === null ? undefined : format;
};
