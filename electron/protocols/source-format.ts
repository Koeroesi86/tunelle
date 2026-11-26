import { stat } from 'fs/promises';
import type { Format } from './pcm-encoder';
import { probeFormat } from './probe-audio';

const formats = new Map<string, Format>();

/**
 * The format of a downloaded track, probed once for each file and not for every range of it; no codec, so the file plays as it is, when ffprobe
 * can not read it. See docs/app/decoder-sources.md
 */
export const downloadedFormat = async (path: string): Promise<Format> => {
  const stats = await stat(path).catch(() => undefined);
  const key = `${path}\0${stats?.ino}\0${stats?.size}`;
  const found = formats.get(key) ?? (stats && (await probeFormat(path)));
  if (!found) return { codec: null, bitDepth: null };
  formats.set(key, { codec: found.codec, bitDepth: found.bitDepth });
  return { codec: found.codec, bitDepth: found.bitDepth };
};
