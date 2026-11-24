import { open } from 'fs/promises';
import { probeBytes, slowAfterMs, type SourceSpeed } from './decode-policy';

const volumes = new Map<number, SourceSpeed>();

const timeRead = async (source: string) => {
  const started = Date.now();
  const handle = await open(source, 'r');
  await handle.read(Buffer.alloc(probeBytes), 0, probeBytes, 0).finally(() => handle.close());
  return Date.now() - started;
};

/** How fast the volume of the file answers, measured on the first file of it and kept; a file that can not be read counts as slow. See docs/app/decoder-proxy.md */
export const sourceSpeed = async (source: string, volume: number): Promise<SourceSpeed> => {
  const known = volumes.get(volume);
  if (known) return known;
  const speed = await timeRead(source).then(
    (elapsed): SourceSpeed => (elapsed > slowAfterMs ? 'slow' : 'fast'),
    () => 'slow' as const
  );
  volumes.set(volume, speed);
  return speed;
};
