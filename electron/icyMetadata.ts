import { Transform } from 'stream';
import type { TransformCallback } from 'stream';

const metadataBlock = 16;

/** The title of the metadata block of a stream, undefined when it carries none */
export const parseStreamTitle = (metadata: string) => metadata.match(/StreamTitle='(.*?)';/)?.[1]?.trim() || undefined;

/** The address the station names next to the title, undefined when it names none */
export const parseStreamUrl = (metadata: string) => metadata.match(/StreamUrl='(.*?)';/)?.[1]?.trim() || undefined;

/**
 * Takes the ICY metadata out of an audio stream: every `metaint` bytes of audio are followed by a length byte
 * (in blocks of 16 bytes) and that much metadata. Only the audio passes through, the titles go to `onTitle`.
 */
export class IcyMetadataStripper extends Transform {
  private audioLeft: number;

  private metadataLeft: number | undefined;

  private metadata: Buffer[] = [];

  constructor(
    private readonly metaint: number,
    private readonly onTitle: (title: string, streamUrl?: string) => void
  ) {
    super();
    this.audioLeft = metaint;
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
    const audio: Buffer[] = [];
    let offset = 0;

    while (offset < chunk.length) {
      offset = this.audioLeft > 0 ? this.readAudio(chunk, offset, audio) : this.readMetadata(chunk, offset);
    }

    callback(undefined, Buffer.concat(audio));
  }

  private readAudio(chunk: Buffer, offset: number, audio: Buffer[]) {
    const part = chunk.subarray(offset, offset + this.audioLeft);
    audio.push(part);
    this.audioLeft -= part.length;
    return offset + part.length;
  }

  private readMetadata(chunk: Buffer, offset: number) {
    if (this.metadataLeft === undefined) return this.readMetadataLength(chunk[offset], offset);

    const part = chunk.subarray(offset, offset + this.metadataLeft);
    this.metadata.push(part);
    this.metadataLeft -= part.length;
    if (this.metadataLeft === 0) this.finishMetadata();
    return offset + part.length;
  }

  private readMetadataLength(blocks: number, offset: number) {
    this.metadataLeft = blocks * metadataBlock;
    if (this.metadataLeft === 0) this.finishMetadata();
    return offset + 1;
  }

  private finishMetadata() {
    const metadata = Buffer.concat(this.metadata).toString('utf8');
    const title = parseStreamTitle(metadata);
    if (title) this.onTitle(title, parseStreamUrl(metadata));

    this.metadata = [];
    this.metadataLeft = undefined;
    this.audioLeft = this.metaint;
  }
}
