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

  it('writes UTF-8 when the encoding does not have a character', () => {
    expect(encodePlaylist('ő', 'windows-1252').encoding).toBe('utf-8');
  });

  it('writes UTF-8 for an encoding with more than one byte per character', () => {
    expect(encodePlaylist('é', 'shift_jis').encoding).toBe('utf-8');
  });
});
