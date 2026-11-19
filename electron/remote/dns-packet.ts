/** The DNS wire format of mDNS (RFC 6762) for `_tunelle._tcp`: what the host answers and what the listener reads. See docs/app/remote-access-discovery.md */

export const RecordType = { A: 1, PTR: 12, TXT: 16, SRV: 33 } as const;

const CACHE_FLUSH_IN = 0x8001;
const MAX_POINTER_JUMPS = 16;

/** A record to send; `data` is the encoded record data */
export interface DnsRecord {
  name: string;
  type: number;
  data: Buffer;
}

export type DecodedRecord = { name: string; ttl: number } & (
  | { kind: 'ptr'; target: string }
  | { kind: 'srv'; port: number; target: string }
  | { kind: 'txt'; entries: Record<string, string> }
  | { kind: 'a'; address: string }
);

export interface DecodedMessage {
  questions: { name: string; type: number }[];
  records: DecodedRecord[];
}

const u16 = (value: number) => Buffer.from([value >> 8, value & 255]);
const u32 = (value: number) => Buffer.from([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);

/** A label is at most 63 bytes: a longer one is cut, and a name with an empty label is written without it */
export const encodeName = (name: string) =>
  Buffer.concat([
    ...name
      .split('.')
      .filter(Boolean)
      .map((label) => {
        const bytes = Buffer.from(label).subarray(0, 63);
        return Buffer.concat([Buffer.from([bytes.length]), bytes]);
      }),
    Buffer.from([0]),
  ]);

export const encodeTxt = (entries: Record<string, string>) =>
  Buffer.concat(
    Object.entries(entries).map(([key, value]) => {
      const bytes = Buffer.from(`${key}=${value}`).subarray(0, 255);
      return Buffer.concat([Buffer.from([bytes.length]), bytes]);
    })
  );

export const encodeSrv = (port: number, target: string) => Buffer.concat([u16(0), u16(0), u16(port), encodeName(target)]);

export const encodeA = (address: string) => Buffer.from(address.split('.').map(Number));

const encodeRecord = ({ name, type, data }: DnsRecord, ttl: number) =>
  Buffer.concat([encodeName(name), u16(type), u16(CACHE_FLUSH_IN), u32(ttl), u16(data.length), data]);

/** An answer packet; a ttl of 0 is the goodbye of a service that stops */
export const encodeResponse = (records: DnsRecord[], ttl: number) =>
  Buffer.concat([Buffer.from([0, 0, 0x84, 0, 0, 0]), u16(records.length), Buffer.from([0, 0, 0, 0]), ...records.map((record) => encodeRecord(record, ttl))]);

export const encodeQuery = (name: string, type: number) =>
  Buffer.concat([Buffer.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]), encodeName(name), u16(type), u16(1)]);

// a pointer: the name goes on at another place, and a loop of pointers must end
const readPointer = (message: Buffer, start: number, length: number, jumps: number): { name: string; next: number } => {
  if (jumps >= MAX_POINTER_JUMPS) throw new RangeError('too many name pointers');
  return { name: readName(message, ((length & 0x3f) << 8) | message.readUInt8(start + 1), jumps + 1).name, next: start + 2 };
};

const readName = (message: Buffer, start: number, jumps = 0): { name: string; next: number } => {
  const length = message.readUInt8(start);

  if (length === 0) return { name: '', next: start + 1 };
  if (length >= 0xc0) return readPointer(message, start, length, jumps);
  if (length > 63) throw new RangeError('label too long');

  const rest = readName(message, start + length + 1, jumps);
  const label = message.toString('utf8', start + 1, start + 1 + length);

  return { name: rest.name ? `${label}.${rest.name}` : label, next: rest.next };
};

// the first entry of a key counts (RFC 6763)
const addEntry = (entries: Record<string, string>, text: string) => {
  const split = text.indexOf('=');
  const key = split < 0 ? text : text.slice(0, split);

  if (key && !(key in entries)) entries[key] = split < 0 ? '' : text.slice(split + 1);
};

const readTxt = (message: Buffer, start: number, end: number) => {
  const entries: Record<string, string> = {};

  for (let at = start; at < end; at += message.readUInt8(at) + 1)
    addEntry(entries, message.toString('utf8', at + 1, Math.min(at + 1 + message.readUInt8(at), end)));
  return entries;
};

const readRecord = (message: Buffer, position: number): { record?: DecodedRecord; next: number } => {
  const { name, next } = readName(message, position);
  const type = message.readUInt16BE(next);
  const ttl = message.readUInt32BE(next + 4);
  const length = message.readUInt16BE(next + 8);
  const start = next + 10;
  const end = start + length;

  if (end > message.length) throw new RangeError('record past the end');
  if (type === RecordType.PTR) return { record: { kind: 'ptr', name, ttl, target: readName(message, start).name }, next: end };
  if (type === RecordType.SRV)
    return { record: { kind: 'srv', name, ttl, port: message.readUInt16BE(start + 4), target: readName(message, start + 6).name }, next: end };
  if (type === RecordType.TXT) return { record: { kind: 'txt', name, ttl, entries: readTxt(message, start, end) }, next: end };
  if (type === RecordType.A && length === 4) return { record: { kind: 'a', name, ttl, address: [...message.subarray(start, end)].join('.') }, next: end };
  return { next: end };
};

const parseMessage = (message: Buffer): DecodedMessage => {
  const questionCount = message.readUInt16BE(4);
  const recordCount = message.readUInt16BE(6) + message.readUInt16BE(8) + message.readUInt16BE(10);
  const questions: DecodedMessage['questions'] = [];
  const records: DecodedRecord[] = [];
  let position = 12;

  for (let index = 0; index < questionCount; index += 1) {
    const { name, next } = readName(message, position);
    questions.push({ name, type: message.readUInt16BE(next) });
    position = next + 4;
  }
  for (let index = 0; index < recordCount; index += 1) {
    const { record, next } = readRecord(message, position);
    records.push(...(record ? [record] : []));
    position = next;
  }
  return { questions, records };
};

/** Reads a packet from the network. A packet that is cut or made up is no message: it returns `undefined` and never throws */
export const decodeMessage = (message: Buffer): DecodedMessage | undefined => {
  try {
    return parseMessage(message);
  } catch {
    return undefined;
  }
};
