import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { logError } from '../utils/log-error';
import { idleStopMs, type Reach } from './decode-policy';
import { ffmpegProgram } from './ffmpeg-program';
import { wavHeaderSize, wavSize, type WavLayout } from './wav-header';

export const rawFormats: Record<string, { format: string; bytesPerSample: number }> = {
  pcm_s16le: { format: 's16le', bytesPerSample: 2 },
  pcm_s24le: { format: 's24le', bytesPerSample: 3 },
  pcm_s32le: { format: 's32le', bytesPerSample: 4 },
};

export interface Decoding {
  source: string;
  encoder: string[];
  layout: WavLayout;
}

/** Where a read is: the next byte of samples that it needs */
export interface Cursor {
  position: number;
}

interface Listeners {
  /** ffmpeg gave another number of samples than the file said */
  onMismatch: () => void;
  /** The window takes no new reads any more */
  onClose: () => void;
}

export type DecodeWindow = ReturnType<typeof openDecodeWindow>;

/** One ffmpeg run from the frame of `position`, and the decoded bytes around the reads that use it. See docs/app/decoder-proxy.md */
export const openDecodeWindow = ({ source, encoder, layout }: Decoding, position: number, reach: Reach, { onMismatch, onClose }: Listeners) => {
  const frameSize = layout.channels * layout.bytesPerSample;
  const total = wavSize(layout) - wavHeaderSize;
  const from = position - (position % frameSize);
  const chunks: Buffer[] = [];
  /** The bytes of samples that are held, from `start` up to `end` */
  let start = from;
  let end = from;
  /** Where the read that left last was */
  let left = position;
  let state: 'running' | 'done' | 'failed' | 'dropped' = 'running';
  let idle: ReturnType<typeof setTimeout> | undefined;
  let kill: () => void = () => undefined;
  const cursors = new Set<Cursor>();
  const events = new EventEmitter();
  events.setMaxListeners(0);

  /** The read that is furthest behind decides what is held; with none open, the one that left last */
  const anchor = () => (cursors.size > 0 ? Math.min(...[...cursors].map((cursor) => cursor.position)) : left);

  const trim = () => {
    const keepFrom = anchor() - reach.behind;
    while (chunks.length > 0 && start + chunks[0].length <= keepFrom) {
      start += chunks[0].length;
      chunks.shift();
    }
  };

  const moved = () => {
    trim();
    events.emit('moved');
  };

  const finish = (next: 'done' | 'failed') => {
    state = next;
    events.emit('progress');
    if (next === 'failed') onClose();
  };

  const drop = () => {
    if (state === 'dropped') return;
    state = 'dropped';
    clearTimeout(idle);
    chunks.length = 0;
    kill();
    events.emit('moved');
    events.emit('progress');
    onClose();
  };

  /** ffmpeg waits on its full pipe while nothing is taken from it */
  const holdBack = async () => {
    while (state === 'running' && end >= anchor() + reach.ahead) await new Promise<void>((resolve) => events.once('moved', () => resolve()));
  };

  /** Whether ffmpeg gave more bytes than the file has */
  let excess = false;

  const take = async (chunk: Buffer) => {
    if (state !== 'running' || excess) return;
    const fitting = chunk.subarray(0, total - end);
    chunks.push(fitting);
    end += fitting.length;
    trim();
    events.emit('progress');
    excess = fitting.length < chunk.length;
    if (excess) return kill();
    await holdBack();
  };

  const decode = async () => {
    const raw = rawFormats[encoder[encoder.length - 1]];
    // the time of a frame: exact for every progressive codec, see docs/app/decoder-proxy.md
    const seek = from > 0 ? ['-ss', (from / frameSize / layout.sampleRate).toFixed(9)] : [];
    const child = spawn(
      ffmpegProgram(),
      [
        '-nostdin',
        '-v',
        'error',
        '-fflags',
        '+bitexact',
        ...seek,
        '-i',
        source,
        '-map',
        '0:a:0',
        '-map_metadata',
        '-1',
        ...encoder,
        '-f',
        raw.format,
        'pipe:1',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
    );
    kill = () => void child.kill();
    const errors: Buffer[] = [];
    child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    const closed = new Promise<number | null>((resolve) => {
      child.on('error', (error) => {
        logError(error);
        resolve(-1);
      });
      child.on('close', resolve);
    });
    for await (const chunk of child.stdout) await take(chunk);
    const code = await closed;
    if (state === 'dropped') return;
    const mismatch = excess || (code === 0 && end !== total);
    if (mismatch) {
      logError(new Error(`ffmpeg wrote another number of bytes of ${source} than the ${total} that the file said`));
      onMismatch();
    }
    if (!mismatch && code !== 0) logError(new Error(`ffmpeg failed on ${source}: ${Buffer.concat(errors).toString().trim()}`));
    finish(end === total ? 'done' : 'failed');
  };

  void decode().catch((error) => {
    if (state === 'dropped') return;
    logError(error);
    kill();
    finish('failed');
  });

  const waitForProgress = (signal: AbortSignal) =>
    new Promise<void>((resolve) => {
      const proceed = () => {
        events.off('progress', proceed);
        signal.removeEventListener('abort', proceed);
        resolve();
      };
      events.once('progress', proceed);
      signal.addEventListener('abort', proceed, { once: true });
    });

  /** A copy of the held bytes from `at`, at most `length` of them */
  const copyAt = (at: number, length: number) => {
    let after = start;
    const holding = chunks.find((chunk) => {
      after += chunk.length;
      return at < after;
    });
    const skip = (holding?.length ?? 0) - (after - at);
    return holding && Buffer.from(holding.subarray(skip, skip + length));
  };

  return {
    isIdle: () => cursors.size === 0,
    isDropped: () => state === 'dropped',
    /** Whether a new read from `at` can use this window without another one losing what it needs */
    accepts: (at: number) =>
      (state === 'running' || state === 'done') &&
      at >= start &&
      at < anchor() + reach.ahead &&
      [...cursors].every((cursor) => cursor.position < at + reach.ahead),
    /** Whether a read that has joined can go on here: one that runs a window ahead of another leaves */
    keeps: (cursor: Cursor) => state !== 'dropped' && [...cursors].every((other) => cursor.position < other.position + reach.ahead || other === cursor),
    join: (cursor: Cursor) => {
      clearTimeout(idle);
      cursors.add(cursor);
    },
    leave: (cursor: Cursor) => {
      if (!cursors.delete(cursor) || state === 'dropped') return;
      left = cursor.position;
      if (cursors.size === 0) idle = setTimeout(drop, idleStopMs);
      moved();
    },
    /** The next bytes for the cursor, which moves past them; undefined when the signal aborts, the window is dropped or the decode ended without them */
    read: async (cursor: Cursor, length: number, signal: AbortSignal) => {
      while (state === 'running' && cursor.position >= end && !signal.aborted) await waitForProgress(signal);
      if (signal.aborted || state === 'dropped' || cursor.position >= end) return undefined;
      const bytes = copyAt(cursor.position, length);
      cursor.position += bytes?.length ?? 0;
      moved();
      return bytes;
    },
    drop,
  };
};
