import fc from 'fast-check';

/** The numbers that a length or a count of a file goes wrong with */
const word = fc.oneof(
  fc.constantFrom(0, 1, 2, 7, 8, 15, 16, 23, 24, 0x7fffffff, 0x80000000, 0xfffffff0, 0xffffffff),
  fc.nat(512),
  fc.integer({ min: 0, max: 0xffffffff })
);

/**
 * A valid file with a few words overwritten, in either byte order, and perhaps cut short: bytes that are random from the start are refused by the
 * first check, these get further. See docs/development/property-tests.md
 */
export const damaged = (file: Uint8Array) =>
  fc
    .record({
      writes: fc.array(fc.record({ at: fc.nat(file.length - 4), value: word, littleEndian: fc.boolean() }), { maxLength: 6 }),
      length: fc.oneof({ weight: 3, arbitrary: fc.constant(file.length) }, { weight: 1, arbitrary: fc.nat(file.length) }),
    })
    .map(({ writes, length }) => {
      const bytes = Uint8Array.from(file);
      const view = new DataView(bytes.buffer);
      writes.forEach(({ at, value, littleEndian }) => view.setUint32(at, value, littleEndian));
      return bytes.slice(0, length);
    });
