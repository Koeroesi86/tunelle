import { describe, expect, it } from 'vitest';
import { detectStreamSampleRate } from './stream-sample-rate';

/** A Layer III frame of 128 kbit/s: 417 bytes at 44.1 kHz, 384 at 48 kHz, as the header says */
const mp3 = (rateBits: number, length: number) => Buffer.concat([Buffer.from([0xff, 0xfb, 0x90 | (rateBits << 2), 0x00]), Buffer.alloc(length - 4)]);
/** An ADTS frame of the given length with the rate at this index of the table */
const adts = (rateIndex: number, length: number) =>
  Buffer.concat([
    Buffer.from([0xff, 0xf1, (1 << 6) | (rateIndex << 2), (length >> 11) & 3, (length >> 3) & 255, ((length & 7) << 5) | 0x1f, 0xfc]),
    Buffer.alloc(length - 7),
  ]);

describe('detectStreamSampleRate', () => {
  it.each([
    ['MP3 at 44.1 kHz', Buffer.concat([mp3(0, 417), mp3(0, 417)]), 44100],
    ['MP3 at 48 kHz', Buffer.concat([mp3(1, 384), mp3(1, 384)]), 48000],
    ['MP3 after a tag', Buffer.concat([Buffer.from('ID3'), Buffer.alloc(30), mp3(0, 417), mp3(0, 417)]), 44100],
    ['AAC at 44.1 kHz', Buffer.concat([adts(4, 300), adts(4, 300)]), 44100],
    ['AAC at 48 kHz', Buffer.concat([adts(3, 200), adts(3, 200)]), 48000],
  ])('finds the rate of %s', (_, bytes, expected) => {
    expect(detectStreamSampleRate(bytes)).toBe(expected);
  });

  it('finds the rate of Opus, which plays at 48 kHz', () => {
    expect(detectStreamSampleRate(Buffer.concat([Buffer.from('OggS'), Buffer.alloc(24), Buffer.from('OpusHead'), Buffer.alloc(11)]))).toBe(48000);
  });

  it('finds the rate of Vorbis in its header', () => {
    const header = Buffer.concat([Buffer.from([1]), Buffer.from('vorbis'), Buffer.alloc(4), Buffer.from([2]), Buffer.alloc(4)]);
    header.writeUInt32LE(96000, 12);

    expect(detectStreamSampleRate(Buffer.concat([Buffer.from('OggS'), Buffer.alloc(24), header]))).toBe(96000);
  });

  it('waits for the second frame, as the sync pattern of one frame can be in the data', () => {
    expect(detectStreamSampleRate(mp3(0, 417))).toBeUndefined();
  });

  it('finds none in bytes that are not audio of a known kind', () => {
    expect(detectStreamSampleRate(Buffer.from('<html>not a stream</html>'))).toBeUndefined();
    expect(detectStreamSampleRate(Buffer.alloc(0))).toBeUndefined();
  });

  it('does not take a frame whose next frame has another rate', () => {
    expect(detectStreamSampleRate(Buffer.concat([mp3(0, 417), mp3(1, 384)]))).toBeUndefined();
  });
});
