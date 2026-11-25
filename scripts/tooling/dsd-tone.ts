// The tones of the DSD fixtures and the parts of a DSDIFF file, shared by the DSD and DST generators. See e2e/fixtures/README.md
export const rate = 2822400;
export const seconds = 3;
const amplitude = 0.5;

/** A sine through a second order sigma-delta modulator: 1 bit a sample, the most significant bit of a byte first */
export const modulate = (frequency: number) => {
  const bits = Buffer.alloc((rate * seconds) / 8);
  const step = (2 * Math.PI * frequency) / rate;
  let [v1, v2, y] = [0, 0, 0];
  for (let n = 0; n < rate * seconds; n += 1) {
    v1 += amplitude * Math.sin(step * n) - y;
    v2 += v1 - y;
    y = v2 >= 0 ? 1 : -1;
    bits[n >> 3] |= (y > 0 ? 0x80 : 0) >> (n & 7);
  }
  return bits;
};

export const id3 = (tags: Record<string, string>) => {
  const frames = Buffer.concat(
    Object.entries(tags).map(([name, text]) => {
      const header = Buffer.alloc(10);
      header.write(name, 0, 'latin1');
      header.writeUInt32BE(text.length + 1, 4);
      return Buffer.concat([header, Buffer.from(`\0${text}`, 'latin1')]);
    })
  );
  const size = Buffer.from([21, 14, 7, 0].map((shift) => (frames.length >> shift) & 0x7f));
  return Buffer.concat([Buffer.from('ID3\x03\0\0', 'latin1'), size, frames]);
};

export const u64 = (value: number, bigEndian = false) => {
  const buffer = Buffer.alloc(8);
  if (bigEndian) buffer.writeBigUInt64BE(BigInt(value));
  else buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
};

export const u32 = (value: number, bigEndian = false) => {
  const buffer = Buffer.alloc(4);
  if (bigEndian) buffer.writeUInt32BE(value);
  else buffer.writeUInt32LE(value);
  return buffer;
};

export const chunk = (name: string, payload: Buffer) =>
  Buffer.concat([Buffer.from(name), u64(payload.length, true), payload, Buffer.alloc(payload.length % 2)]);

/** A mono DSDIFF file: the compression type and its name, the chunk of the sound and the ID3 tags */
export const toDsdiff = (compression: { id: string; name: string }, sound: Buffer, tags: Record<string, string>) => {
  const property = Buffer.concat([
    Buffer.from('SND '),
    chunk('FS  ', u32(rate, true)),
    chunk('CHNL', Buffer.concat([Buffer.from([0, 1]), Buffer.from('C   ')])),
    chunk('CMPR', Buffer.concat([Buffer.from(compression.id), Buffer.from([compression.name.length]), Buffer.from(`${compression.name}\0`)])),
  ]);
  const body = Buffer.concat([Buffer.from('DSD '), chunk('FVER', u32(0x01050000, true)), chunk('PROP', property), sound, chunk('ID3 ', id3(tags))]);
  return Buffer.concat([Buffer.from('FRM8'), u64(body.length, true), body]);
};
