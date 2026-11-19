import { describe, expect, it } from 'vitest';
import { encodePlaylist } from './encode-playlist';

describe('encodePlaylist', () => {
  it('writes UTF-8 when no encoding is wanted', () => {
    expect(encodePlaylist('é')).toEqual({ buffer: Buffer.from([0xc3, 0xa9]), encoding: 'utf-8' });
  });

  it('writes the single byte encoding it was read with', () => {
    expect(encodePlaylist('é', 'windows-1252')).toEqual({ buffer: Buffer.from([0xe9]), encoding: 'windows-1252' });
    expect(encodePlaylist('ő', 'windows-1250')).toEqual({ buffer: Buffer.from([0xf5]), encoding: 'windows-1250' });
  });

  it('writes nothing when the encoding does not have a character, and none is replaced', () => {
    expect(encodePlaylist('ő', 'windows-1252')).toBeUndefined();
  });

  it('writes nothing for an encoding that is not written, unless the text is ASCII', () => {
    expect(encodePlaylist('é', 'shift_jis')).toBeUndefined();
    expect(encodePlaylist('e', 'shift_jis')).toEqual({ buffer: Buffer.from('e'), encoding: 'shift_jis' });
  });
});
