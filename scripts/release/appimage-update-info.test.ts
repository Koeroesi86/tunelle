import { describe, expect, it } from 'vitest';
import { embedUpdateInformation, readUpdateInformation, updateInformation } from './appimage-update-info';

// an ELF file of 64 bits with the sections .shstrtab and .upd_info (1024 bytes) and what the runtime has around them
const buildElf = ({ section = '.upd_info', size = 1024 } = {}) => {
  const names = Buffer.from(`\0.shstrtab\0${section}\0`);
  const namesOffset = 0x100;
  const dataOffset = 0x200;
  const tableOffset = dataOffset + size + 0x40;
  const elf = Buffer.alloc(tableOffset + 3 * 0x40, 0xaa);
  elf.write('\x7fELF', 0, 'latin1');
  elf[4] = 2;
  elf[5] = 1;
  elf.writeBigUInt64LE(BigInt(tableOffset), 0x28);
  elf.writeUInt16LE(0x40, 0x3a);
  elf.writeUInt16LE(3, 0x3c);
  elf.writeUInt16LE(1, 0x3e);
  names.copy(elf, namesOffset);
  elf.fill(0, dataOffset, dataOffset + size);
  const header = (index: number, name: number, offset: number, length: number) => {
    const base = tableOffset + index * 0x40;
    elf.fill(0, base, base + 0x40);
    elf.writeUInt32LE(name, base);
    elf.writeBigUInt64LE(BigInt(offset), base + 0x18);
    elf.writeBigUInt64LE(BigInt(length), base + 0x20);
  };
  header(0, 0, 0, 0);
  header(1, 1, namesOffset, names.length);
  header(2, 11, dataOffset, size);
  return { elf, dataOffset };
};

describe('updateInformation', () => {
  it.each([
    ['x64', 'gh-releases-zsync|Koeroesi86|tunelle|latest|Tunelle-*-x86_64.AppImage.zsync'],
    ['arm64', 'gh-releases-zsync|Koeroesi86|tunelle|latest|Tunelle-*-arm64.AppImage.zsync'],
  ])('names the zsync file of the AppImage of %s', (arch, text) => {
    expect(updateInformation(arch)).toBe(text);
  });

  it('has none for an architecture the release has no AppImage of', () => {
    expect(() => updateInformation('ia32')).toThrow('ia32');
  });
});

describe('embedUpdateInformation', () => {
  it('writes the text into the section and leaves the rest of the file as it was', () => {
    const { elf, dataOffset } = buildElf();
    const patched = embedUpdateInformation(elf, 'gh-releases-zsync|a|b|latest|c');

    expect(readUpdateInformation(patched)).toBe('gh-releases-zsync|a|b|latest|c');
    expect(patched.subarray(0, dataOffset)).toEqual(elf.subarray(0, dataOffset));
    expect(patched.subarray(dataOffset + 1024)).toEqual(elf.subarray(dataOffset + 1024));
    expect(readUpdateInformation(elf)).toBeUndefined();
  });

  it('replaces what the section held before', () => {
    const { elf } = buildElf();

    expect(readUpdateInformation(embedUpdateInformation(embedUpdateInformation(elf, 'a long first text'), 'short'))).toBe('short');
  });

  it('fails for a text that does not fit, with room for the end of the text', () => {
    const { elf } = buildElf();

    expect(() => embedUpdateInformation(elf, 'x'.repeat(1024))).toThrow('1024 bytes');
    expect(readUpdateInformation(embedUpdateInformation(elf, 'x'.repeat(1023)))).toHaveLength(1023);
  });

  it('fails for a runtime without the section', () => {
    expect(() => embedUpdateInformation(buildElf({ section: '.other' }).elf, 'text')).toThrow('no .upd_info section');
  });

  it.each([
    ['a file that is no ELF file', Buffer.alloc(0x100)],
    ['a 32 bit ELF file', Object.assign(buildElf().elf, { 4: 1 })],
    ['a big endian ELF file', Object.assign(buildElf().elf, { 5: 2 })],
  ])('refuses %s', (_name, file) => {
    expect(() => embedUpdateInformation(file, 'text')).toThrow('ELF');
  });
});
