import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { logError } from '../utils/log-error';
import { idleStopMs, restAfterMs, type Reach } from './decode-policy';
import { ffmpegProgram } from './ffmpeg-program';
import { wavDataSize, type WavLayout } from './wav-header';

export const rawFormats: Record<string, { format: string; bytesPerSample: number; float?: boolean }> = {
  pcm_s16le: { format: 's16le', bytesPerSample: 2 },
  pcm_s24le: { format: 's24le', bytesPerSample: 3 },
  pcm_s32le: { format: 's32le', bytesPerSample: 4 },
  pcm_f32le: { format: 'f32le', bytesPerSample: 4, float: true },
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

/** The decoded bytes around the reads that use it, from the frame of `position`, and the ffmpeg that adds to them. See docs/app/decoder-proxy.md */
export const openDecodeWindow = ({ source, encoder, layout }: Decoding, position: number, reach: Reach, { onMismatch, onClose }: Listeners) => {
  const frameSize = layout.channels * layout.bytesPerSample;
  const total = wavDataSize(layout);
  const from = position - (position % frameSize);
  const chunks: Buffer[] = [];
  /** The bytes of samples that are held, from `start` up to `end` */
  let start = from;
  let end = from;
  /** Where the read that left last was */
  let left = position;
  /** `resting` has no ffmpeg: it holds its bytes, and decodes on when a read comes near their end */
  let state: 'running' | 'resting' | 'done' | 'failed' | 'dropped' = 'running';
  let idle: ReturnType<typeof setTimeout> | undefined;
  /** The ffmpeg that fills the window; one that was stopped is not it any more, and what it still gives is not taken */
  let ffmpeg: ChildProcess | undefined;
  let runs = 0;
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

  const stop = () => {
    const stopped = ffmpeg;
    ffmpeg = undefined;
    stopped?.kill();
  };

  const rest = () => {
    state = 'resting';
    stop();
    events.emit('moved');
  };

  const drop = () => {
    if (state === 'dropped') return;
    state = 'dropped';
    clearTimeout(idle);
    chunks.length = 0;
    stop();
    events.emit('moved');
    events.emit('progress');
    onClose();
  };

  /** ffmpeg waits on its full pipe while nothing is taken from it, and is stopped when that lasts */
  const holdBack = async (child: ChildProcess) => {
    while (ffmpeg === child && end < total && end >= anchor() + reach.ahead) {
      const resting = setTimeout(rest, restAfterMs);
      await new Promise<void>((resolve) => events.once('moved', () => resolve()));
      clearTimeout(resting);
    }
  };

  /** Whether ffmpeg gave more bytes than the file has */
  let excess = false;

  const take = async (child: ChildProcess, chunk: Buffer) => {
    if (ffmpeg !== child || excess || chunk.length === 0) return;
    const fitting = chunk.subarray(0, total - end);
    chunks.push(fitting);
    end += fitting.length;
    trim();
    events.emit('progress');
    excess = fitting.length < chunk.length;
    if (excess) return void child.kill();
    await holdBack(child);
  };

  /** Runs ffmpeg from the frame of the first byte that is not held, and takes what it gives from that byte on */
  const decode = async () => {
    const raw = rawFormats[encoder[encoder.length - 1]];
    let held = end % frameSize;
    const first = end - held;
    // the time of a frame: exact for every progressive codec, see docs/app/decoder-proxy.md
    const seek = first > 0 ? ['-ss', (first / frameSize / layout.sampleRate).toFixed(9)] : [];
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
    ffmpeg = child;
    const errors: Buffer[] = [];
    child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    const closed = new Promise<number | null>((resolve) => {
      child.on('error', (error) => {
        logError(error);
        resolve(-1);
      });
      child.on('close', resolve);
    });
    for await (const chunk of child.stdout) {
      const fresh: Buffer = chunk.subarray(held);
      held -= chunk.length - fresh.length;
      await take(child, fresh);
    }
    const code = await closed;
    if (ffmpeg !== child) return;
    const mismatch = excess || (code === 0 && end !== total);
    if (mismatch) {
      logError(new Error(`ffmpeg wrote another number of bytes of ${source} than the ${total} that the file said`));
      onMismatch();
    }
    if (!mismatch && code !== 0) logError(new Error(`ffmpeg failed on ${source}: ${Buffer.concat(errors).toString().trim()}`));
    finish(end === total ? 'done' : 'failed');
  };

  const startDecode = () => {
    const run = ++runs;
    state = 'running';
    void decode().catch((error) => {
      // a run that was stopped has nothing more to say
      if (run !== runs || state !== 'running') return;
      logError(error);
      stop();
      finish('failed');
    });
  };

  const refill = (cursor: Cursor) => {
    if (state === 'resting' && end - cursor.position < reach.ahead / 2) startDecode();
  };

  startDecode();

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
      state !== 'failed' &&
      state !== 'dropped' &&
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
      refill(cursor);
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
