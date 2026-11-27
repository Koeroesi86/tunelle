import { spawn } from 'child_process';
import { PassThrough, Readable, Transform, finished, pipeline } from 'stream';
import type { TransformCallback } from 'stream';
import { ffmpegProgram } from './ffmpeg-program';
import { OverscaleGuard } from './overscale-guard';
import { logError } from '../utils/log-error';

/** The start of a stream that is read to find its format; a stream that shows none by then is not decoded */
const searchedBytes = 64 * 1024;
/** A stream that is slow and shows no format by then plays as it is, so a station of an unknown format does not wait for the bytes */
const searchedTime = 2000;

/** The bytes read with `peekStream` and then the rest of the stream, which an `unshift` cannot give once the stream has ended */
export const replay = (head: Buffer, rest: Readable) =>
  Readable.from(
    (async function* () {
      yield head;
      yield* rest;
    })()
  );

/** Reads the start of a stream until `found` knows the answer, or enough is read, or it took `searchedTime`, or the stream ends. The bytes returned are no longer in the stream: `unshift` them back, or hand them to `decodeStream` */
export const peekStream = (stream: Readable, found: (head: Buffer) => unknown) =>
  new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => finish(), searchedTime);
    const finish = () => {
      clearTimeout(timer);
      stream.off('data', onData);
      stream.off('end', finish);
      stream.off('close', finish);
      stream.pause();
      resolve(Buffer.concat(chunks));
    };
    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
      const head = Buffer.concat(chunks);
      if (found(head) !== undefined || head.length >= searchedBytes) finish();
    };
    stream.on('data', onData);
    stream.once('end', finish);
    stream.once('close', finish);
  });

/** Passes the WAV on and tells `onStart` its sample rate (bytes 24 to 27 of the header) with the first bytes: the decoder has started */
class WavStart extends Transform {
  private started = false;

  constructor(private readonly onStart: (sampleRate: number | undefined) => void) {
    super();
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
    if (!this.started) {
      this.started = true;
      this.onStart(chunk.length >= 28 && chunk.toString('latin1', 0, 4) === 'RIFF' ? chunk.readUInt32LE(24) : undefined);
    }
    callback(undefined, chunk);
  }
}

/** Decodes an encoded stream with the bundled ffmpeg, from `pipe:0` to a WAV of no set length on `pipe:1`; undefined when it gives nothing and the stream plays as it is. See docs/app/decoder-sources.md */
export const decodeStream = (head: Buffer, rest: Readable, encoder: string[], onSampleRate: (sampleRate: number) => void) =>
  new Promise<Readable | undefined>((resolve) => {
    const child = spawn(
      ffmpegProgram(),
      // `buffer` drops an MP3 frame that refers to data it does not have, as after a splice, in place of playing it as noise
      [
        '-v',
        'error',
        '-fflags',
        '+bitexact',
        '-err_detect',
        'buffer',
        '-i',
        'pipe:0',
        '-map',
        '0:a:0',
        '-map_metadata',
        '-1',
        ...encoder,
        '-f',
        'wav',
        'pipe:1',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }
    );
    const audio = new PassThrough();
    const errors: Buffer[] = [];
    let started = false;

    const fallBack = (error: Error) => {
      if (started) return;
      started = true;
      logError(error);
      rest.unpipe(child.stdin);
      resolve(undefined);
    };

    child.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    // ffmpeg that ends first closes its input: the writing of the rest is an end, not an error of the app
    child.stdin.on('error', () => undefined);
    child.on('error', fallBack);
    child.on('close', (code) => fallBack(new Error(`ffmpeg gave no audio (${code}): ${Buffer.concat(errors).toString().trim()}`)));
    audio.on('close', () => {
      child.kill();
      rest.destroy();
    });
    // an input that fails or is destroyed never ends ffmpeg's: `finished` also tells of one that did so before this call
    finished(rest, { writable: false }, (error) => error && child.kill());

    const wavStart = new WavStart((sampleRate) => {
      started = true;
      if (sampleRate !== undefined) onSampleRate(sampleRate);
      resolve(audio);
    });
    // only float audio can go over full scale
    const guards = encoder.includes('pcm_f32le') ? [new OverscaleGuard()] : [];
    pipeline([child.stdout, wavStart, ...guards, audio], () => undefined);
    child.stdin.write(head);
    rest.pipe(child.stdin);
  });
