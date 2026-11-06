import { Transform } from 'stream';
import type { TransformCallback } from 'stream';
import { detectStreamSampleRate } from '@shared/utils/stream-sample-rate';

/** The start of the stream that is searched for the rate, a tag with a cover in front of the first frame can be large; past it the stream has none that is known */
const searchedBytes = 64 * 1024;

/** Passes the audio on untouched and tells `onSampleRate` once which rate its start holds */
export class SampleRateTap extends Transform {
  private head = Buffer.alloc(0);

  private searching = true;

  constructor(private readonly onSampleRate: (sampleRate: number) => void) {
    super();
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
    if (this.searching) this.search(chunk);
    callback(undefined, chunk);
  }

  private search(chunk: Buffer) {
    this.head = Buffer.concat([this.head, chunk]);
    const sampleRate = detectStreamSampleRate(this.head);
    if (sampleRate !== undefined) this.onSampleRate(sampleRate);
    this.searching = sampleRate === undefined && this.head.length < searchedBytes;
    if (!this.searching) this.head = Buffer.alloc(0);
  }
}
