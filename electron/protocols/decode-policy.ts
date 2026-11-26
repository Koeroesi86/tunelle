// How much is decoded at once and how much is kept, by how fast the source answers. See docs/app/decoder-windowed.md
export type SourceSpeed = 'fast' | 'slow';

/** The start of a file is read once per volume, and a read of this many bytes that takes longer than `slowAfterMs` makes the volume slow */
export const probeBytes = 256 * 1024;
export const slowAfterMs = 50;

/** The seconds of audio that a window decodes ahead of the read that is furthest behind */
export const fastAheadSeconds = 5;
export const slowAheadSeconds = 10;
/** The bytes that a window keeps behind that read: Chromium asks again from about 2 MiB before it, see docs/app/decoder-windowed.md */
export const behindBytes = 4 * 1024 ** 2;

/** A full window that no read moves for this long stops its ffmpeg, which holds the source file open, see docs/app/decoder-windowed.md */
export const restAfterMs = 10_000;

/** The most memory that the windows of all tracks may hold, and the most of them (each can have a waiting ffmpeg) */
export const windowMemoryLimit = 128 * 1024 ** 2;
export const maxWindows = 6;

/** The most that the whole decodes may take of the disk: 45 minutes of DSD are about 1.4 GiB */
export const cacheLimit = 2 * 1024 ** 3;

/** A window that no read uses for this long is dropped; a later request decodes it again */
export const idleStopMs = 5 * 60 * 1000;

/** How far a window reaches around its reads, in bytes of samples */
export interface Reach {
  ahead: number;
  behind: number;
}

/** Each window has its share of the memory, so a very high rate gets fewer seconds and the windows never drop each other for room */
export const windowReach = (speed: SourceSpeed, bytesPerSecond: number): Reach => {
  const aheadSeconds = speed === 'fast' ? fastAheadSeconds : slowAheadSeconds;
  return { ahead: Math.min(aheadSeconds * bytesPerSecond, windowMemoryLimit / maxWindows - behindBytes), behind: behindBytes };
};
