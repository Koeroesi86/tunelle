import { Transform } from 'stream';
import type { TransformCallback } from 'stream';

/** Louder than any real audio: a clean lossy decode peaks below 1.5 of full scale, a damaged one goes far over. See docs/app/decoder-sources.md */
const limit = 2;
/** 13 ms of stereo float at 44.1 kHz, half an MP3 frame */
const blockBytes = 4608;

/** The block, or silence of its length when a sample of it is over the limit or is no number */
const muteDamaged = (block: Buffer) => {
  const samples = new Float32Array(new Uint8Array(block).buffer, 0, Math.floor(block.length / 4));
  return samples.every((sample) => Math.abs(sample) <= limit) ? block : Buffer.alloc(block.length);
};

/** Passes a WAV of 32 bit float on, with every block that holds a sample over the limit silenced */
export class OverscaleGuard extends Transform {
  private pending = Buffer.alloc(0);

  private inAudio = false;

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
    this.pending = Buffer.concat([this.pending, chunk]);
    if (!this.inAudio) this.passHeader();
    while (this.inAudio && this.pending.length >= blockBytes) this.push(muteDamaged(this.takePending(blockBytes)));
    callback();
  }

  override _flush(callback: TransformCallback) {
    callback(undefined, this.inAudio ? muteDamaged(this.pending) : this.pending);
  }

  private passHeader() {
    const marker = this.pending.indexOf('data');
    // the marker is followed by the size of the audio
    if (marker < 0 || this.pending.length < marker + 8) return;

    this.inAudio = true;
    this.push(this.takePending(marker + 8));
  }

  private takePending(length: number) {
    const part = this.pending.subarray(0, length);
    this.pending = this.pending.subarray(length);
    return part;
  }
}
