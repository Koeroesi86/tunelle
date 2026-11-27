import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { propertyParameters } from '../../shared/test-properties';
import { IcyMetadataStripper } from './icy-metadata';

/** Runs the stream in the chunks it is given and gives the audio that comes out */
const strip = (metaint: number, chunks: Buffer[], onTitle: (title: string, streamUrl?: string) => void) => {
  const stripper = new IcyMetadataStripper(metaint, onTitle);
  const audio: Buffer[] = [];
  chunks.forEach((chunk) =>
    stripper._transform(chunk, 'binary', (_, part?: Buffer) => {
      if (part) audio.push(part);
    })
  );
  return Buffer.concat(audio);
};

const cut = (bytes: Buffer, lengths: number[]): Buffer[] => {
  const [length, ...rest] = lengths;
  if (length === undefined || bytes.length === 0) return [bytes];
  return [bytes.subarray(0, length), ...cut(bytes.subarray(length), rest)];
};

const chunkLengths = fc.array(fc.integer({ min: 0, max: 300 }), { maxLength: 60 });
const metaints = fc.integer({ min: 1, max: 64 });

/** A title as a station can send it: no quote, which ends it, and no space around it */
const title = fc.string({ unit: 'grapheme', minLength: 1, maxLength: 40 }).filter((text) => /^[^'\0\r\n]+$/.test(text) && text === text.trim());

const metadataBlock = (text: string) => {
  const bytes = Buffer.from(`StreamTitle='${text}';`);
  const blocks = Math.ceil(bytes.length / 16);
  return Buffer.concat([Buffer.from([blocks]), bytes, Buffer.alloc(blocks * 16 - bytes.length)]);
};

describe('IcyMetadataStripper with untrusted bytes', () => {
  it('gives the audio and the titles of a stream, however it comes in', () =>
    fc.assert(
      fc.property(metaints, fc.array(fc.option(title), { maxLength: 8 }), chunkLengths, (metaint, titles, lengths) => {
        const parts = titles.map((_, index) => Buffer.alloc(metaint, index + 1));
        const stream = Buffer.concat(titles.flatMap((text, index) => [parts[index], text === null ? Buffer.from([0]) : metadataBlock(text)]));
        const onTitle = vi.fn();

        const audio = strip(metaint, cut(stream, lengths), onTitle);

        expect(audio).toEqual(Buffer.concat(parts));
        expect(onTitle.mock.calls.map(([text]) => text)).toEqual(titles.filter((text) => text !== null));
      }),
      propertyParameters
    ));

  it('takes any bytes, and gives the same for them however they are cut', () =>
    fc.assert(
      fc.property(metaints, fc.uint8Array({ maxLength: 2000 }), chunkLengths, (metaint, bytes, lengths) => {
        const stream = Buffer.from(bytes);
        const [whole, pieces] = [vi.fn(), vi.fn()];

        const audio = strip(metaint, [stream], whole);

        expect(strip(metaint, cut(stream, lengths), pieces)).toEqual(audio);
        expect(pieces.mock.calls).toEqual(whole.mock.calls);
        expect(audio.length).toBeLessThanOrEqual(stream.length);
      }),
      propertyParameters
    ));
});
