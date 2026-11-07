import { cutsOf, findCut } from './find-cut';
import { NotSliceable, SliceError, mustRead, withHeader } from './types';
import type { ReadRange, Slice, Slicer } from './types';

const maxHeader = 1024 * 1024;
const maxPage = 27 + 255 + 255 * 255;
/** The pages before a cut that go first in a piece: the last 32 KB of them, and the last page when it is longer */
const leadInBytes = 32_768;

interface Page {
  offset: number;
  length: number;
  flags: number;
  /** The position in samples of the end of the page, undefined for a page where no packet ends */
  granule: number | undefined;
  serial: number;
}

const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

/** The page at `offset` of the bytes, undefined where there is none or its header is not all in the bytes */
const pageAt = (bytes: Uint8Array, offset: number): Page | undefined => {
  const head = bytes.subarray(offset, offset + 27);
  const segments = head[26];
  const lacing = bytes.subarray(offset + 27, offset + 27 + segments);
  const isPage = head.length === 27 && String.fromCharCode(...head.subarray(0, 4)) === 'OggS' && head[4] === 0 && lacing.length === segments;
  if (!isPage) return undefined;

  const data = view(bytes);
  const low = data.getUint32(offset + 6, true);
  const high = data.getUint32(offset + 10, true);
  return {
    offset,
    length: 27 + segments + lacing.reduce((total, size) => total + size, 0),
    flags: head[5],
    granule: low === 0xffffffff && high === 0xffffffff ? undefined : high * 2 ** 32 + low,
    serial: data.getUint32(offset + 14, true),
  };
};

const mustPage = (bytes: Uint8Array, offset: number) => {
  const page = pageAt(bytes, offset);
  if (!page) throw new SliceError('An Ogg file with a page that is not one');
  return page;
};

/** The pages that follow each other from `offset` to the end of the bytes, which must end where a page ends */
const pagesIn = (bytes: Uint8Array) => {
  const pages: Page[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const page = mustPage(bytes, offset);
    pages.push(page);
    offset += page.length;
  }
  if (offset !== bytes.length) throw new SliceError('An Ogg file with pages that do not end where the next starts');
  return pages;
};

/**
 * What the first packet says of the stream: Opus (always 48 kHz in a granule), Vorbis (the rate of the file) and FLAC, of which every packet is a frame
 * that needs nothing before it, so no pages go before a cut and none of a piece is left out; no other codec is cut
 */
const codecOf = (body: Uint8Array) => {
  const name = String.fromCharCode(...body.subarray(0, 8));
  if (name === 'OpusHead') return { rate: 48_000, hasLead: true };
  if (String.fromCharCode(...body.subarray(0, 7)) === '\u0001vorbis') return { rate: view(body).getUint32(12, true), hasLead: true };
  if (String.fromCharCode(...body.subarray(0, 5)) === '\u007fFLAC') return { rate: 0, hasLead: false };
  throw new NotSliceable('An Ogg file that is not Vorbis, Opus or FLAC');
};

/** The pages at the start that carry no sound (their granule is 0, or none for a packet that goes on), with the codec found in the first */
const readHeader = async (read: ReadRange) => {
  const first = await mustRead(read, 0, maxPage, 'The start of an Ogg file');
  const firstPage = mustPage(first, 0);
  if ((firstPage.flags & 0x02) === 0) throw new SliceError('An Ogg file that does not start with its first page');
  const { rate, hasLead } = codecOf(first.subarray(27 + first[26], firstPage.length));

  const bytes = await mustRead(read, 0, maxHeader, 'The header of an Ogg file');
  const end = headerEnd(bytes, 0, firstPage.serial);
  return { rate, hasLead, serial: firstPage.serial, header: bytes.subarray(0, end) };
};

const headerEnd = (bytes: Uint8Array, offset: number, serial: number): number => {
  const page = mustPage(bytes, offset);
  if (page.serial !== serial) throw new NotSliceable('An Ogg file with more than one stream');
  const isHeader = page.granule === 0 || page.granule === undefined;
  return isHeader ? headerEnd(bytes, offset + page.length, serial) : offset;
};

/** The pages before a cut, up to the last 32 KB of them and at least the last page, and where the sound of the last one ends */
const pagesBefore = async (read: ReadRange, cut: number, first: number, size: number, isStart: (bytes: Uint8Array, offset: number) => boolean) => {
  const from = (await findCut(read, Math.max(cut - maxPage - leadInBytes, first), size, isStart)) ?? cut;
  const pages = pagesIn(await mustRead(read, from, cut, 'The pages before a piece of an Ogg file'));
  if (pages.length === 0) throw new SliceError('An Ogg file with no page before a piece');
  const lead = pages.filter((page) => from + page.offset >= cut - leadInBytes);
  return { from: from + (lead[0] ?? pages[pages.length - 1]).offset, end: pages.map((page) => page.granule).findLast((granule) => granule !== undefined) ?? 0 };
};

/**
 * An Ogg file of one Vorbis, Opus or FLAC stream is cut at the start of a page that starts a packet, with the header pages of the file in front of each
 * piece. Each piece but the first starts a few pages early for the decoder, and the length of the sound after the cut is told by the granules
 */
export const sliceOgg: Slicer = async function* (read, size, sliceBytes) {
  const { rate, hasLead, serial, header } = await readHeader(read);
  const isStart = (bytes: Uint8Array, offset: number) => {
    const page = pageAt(bytes, offset);
    return page !== undefined && (page.flags & 0x03) === 0 && page.serial === serial;
  };
  const cuts = await cutsOf(read, header.length, size, sliceBytes, isStart);

  const before = hasLead ? await Promise.all(cuts.slice(1).map((cut) => pagesBefore(read, cut, header.length, size, isStart))) : [];

  for (let index = 0; index < cuts.length - 1; index++) {
    const start = before[index - 1]?.from ?? cuts[index];
    const data = await mustRead(read, start, cuts[index + 1], 'A piece of an Ogg file');
    const piece: Slice = { bytes: withHeader(header, data), skip: 0 };
    yield index === 0 || !hasLead ? piece : { ...piece, keep: (before[index].end - before[index - 1].end) / rate };
  }
};
