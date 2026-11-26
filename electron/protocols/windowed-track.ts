import { isProgressiveCodec } from '../utils/is-supported';
import { prepareDecode, type PlayableTrack } from './decoded-track';
import { maxWindows, windowReach, type Reach } from './decode-policy';
import { holdFile } from './held-files';
import type { Format } from './pcm-encoder';
import { openDecodeWindow, rawFormats, type Cursor, type Decoding, type DecodeWindow } from './decode-window';
import { probeAudio } from './probe-audio';
import { sourceSpeed } from './source-speed';
import { wavHeader, wavHeaderSize, wavSize, type WavLayout } from './wav-header';

// See docs/app/decoder-proxy.md: a WAV of the size of the whole file, decoded into windows in memory where it is read
export interface WindowedTrack {
  size: number;
  /** The bytes from `start` to `end` of the file, each as soon as it is decoded; ends early when the decode fails or the signal aborts */
  read: (start: number, end: number, signal: AbortSignal) => AsyncGenerator<Buffer>;
}

interface Source extends Decoding {
  key: string;
  reach: Reach;
}

/** The open windows and the track of each, the one that was used longest ago first */
const windows = new Map<DecodeWindow, string>();
const layouts = new Map<string, WavLayout>();
const wholeOnly = new Set<string>();

/** Moves a window to the end of the line; one that has closed stays out */
const used = (window: DecodeWindow, key: string) => {
  if (windows.delete(window)) windows.set(window, key);
};

/** Drops windows until another one fits, those that nothing reads first; a read of a dropped window opens a new one */
const makeRoom = () =>
  [...windows.keys()]
    .sort((a, b) => Number(b.isIdle()) - Number(a.isIdle()))
    .slice(0, Math.max(windows.size - maxWindows + 1, 0))
    .forEach((window) => window.drop());

const openWindow = ({ key, reach, ...decoding }: Source, position: number) => {
  makeRoom();
  // a window that decodes on starts ffmpeg on the file again
  const release = holdFile(decoding.source);
  const window: DecodeWindow = openDecodeWindow(decoding, position, reach, {
    onMismatch: () => wholeOnly.add(key),
    onClose: () => {
      release();
      windows.delete(window);
    },
  });
  windows.set(window, key);
  return window;
};

const joinWindow = (source: Source, cursor: Cursor) => {
  const found = [...windows].find(([window, key]) => key === source.key && window.accepts(cursor.position))?.[0];
  const window = found ?? openWindow(source, cursor.position);
  window.join(cursor);
  return window;
};

async function* untilNone(next: () => Promise<Buffer | undefined>) {
  let bytes = await next();
  while (bytes) {
    yield bytes;
    bytes = await next();
  }
}

async function* readSamples(source: Source, cursor: Cursor, stop: number, signal: AbortSignal) {
  let window: DecodeWindow | undefined;
  /** The window that the read goes on in: the same while it keeps the cursor, another one otherwise */
  const current = () => {
    if (window?.keeps(cursor)) return window;
    window?.leave(cursor);
    window = joinWindow(source, cursor);
    return window;
  };
  const nextBytes = async (): Promise<Buffer | undefined> => {
    if (cursor.position >= stop || signal.aborted) return undefined;
    const reading = current();
    used(reading, source.key);
    const bytes = await reading.read(cursor, stop - cursor.position, signal);
    // a dropped window is replaced; otherwise the decode ended without these bytes
    return !bytes && reading.isDropped() ? nextBytes() : bytes;
  };

  try {
    yield* untilNone(nextBytes);
  } finally {
    window?.leave(cursor);
  }
}

async function* readTrack(source: Source, start: number, end: number, signal: AbortSignal) {
  const headerSize = wavHeaderSize(source.layout);
  // the header is known before anything is decoded
  if (start < headerSize && !signal.aborted) yield wavHeader(source.layout).subarray(start, end + 1);
  yield* readSamples(source, { position: Math.max(start - headerSize, 0) }, end + 1 - headerSize, signal);
}

const probeLayout = async (path: string, encoder: string[]): Promise<WavLayout | undefined> => {
  const raw = rawFormats[encoder[encoder.length - 1]];
  const length = await probeAudio(path);
  return raw && length && length.channels <= 2 ? { ...length, bytesPerSample: raw.bytesPerSample, float: raw.float } : undefined;
};

/**
 * The track to serve while it is decoded in windows, for a codec with an exact length; undefined when the whole decode has to run first
 * (`playableFile`). See docs/app/decoder-proxy.md
 */
export const windowedTrack = async ({ path, ...format }: PlayableTrack, signal: AbortSignal): Promise<WindowedTrack | undefined> => {
  if (!isProgressiveCodec(format.codec) || signal.aborted) return undefined;
  const prepared = await prepareDecode(path, format satisfies Format);
  if (!prepared || wholeOnly.has(prepared.key)) return undefined;

  const { key, encoder, volume } = prepared;
  const layout = layouts.get(key) ?? (await probeLayout(path, encoder));
  if (!layout) return undefined;
  layouts.set(key, layout);

  const speed = await sourceSpeed(path, volume);
  const reach = windowReach(speed, layout.sampleRate * layout.channels * layout.bytesPerSample);
  const source = { key, source: path, encoder, layout, reach };
  return { size: wavSize(layout), read: (start, end, signal) => readTrack(source, start, end, signal) };
};
