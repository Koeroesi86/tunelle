// How much is decoded at once and how much is kept, by how fast the source answers. See docs/app/decoder-proxy.md
export type SourceSpeed = 'fast' | 'slow';

/** The start of a file is read once per volume, and a read of this many bytes that takes longer than `slowAfterMs` makes the volume slow */
export const probeBytes = 256 * 1024;
export const slowAfterMs = 50;

/** A fast source is decoded this many seconds ahead of the furthest byte that was asked for; a slow one is decoded to the end */
export const fastAheadSeconds = 60;

/** The cache limit of the copies that were decoded from a fast source (copies of a slow source count against `slowCacheLimit`) */
export const fastCacheLimit = 256 * 1024 ** 2;
export const slowCacheLimit = 2 * 1024 ** 3;

/** A decode that waits for a reader longer than this is stopped; a later request starts it again */
export const idleStopMs = 5 * 60 * 1000;

export const aheadBytes = (speed: SourceSpeed, bytesPerSecond: number) => (speed === 'fast' ? fastAheadSeconds * bytesPerSecond : Infinity);
