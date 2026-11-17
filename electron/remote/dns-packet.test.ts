import { describe, expect, it } from 'vitest';
import { decodeMessage, encodeA, encodeName, encodeQuery, encodeResponse, encodeSrv, encodeTxt, RecordType, type DnsRecord } from './dns-packet';

const SERVICE = '_tunelle._tcp.local';
const INSTANCE = `Living room.${SERVICE}`;

const records: DnsRecord[] = [
  { name: SERVICE, type: RecordType.PTR, data: encodeName(INSTANCE) },
  { name: INSTANCE, type: RecordType.SRV, data: encodeSrv(48123, 'living-room.local') },
  { name: INSTANCE, type: RecordType.TXT, data: encodeTxt({ name: 'Living room', version: '26.11.1', port: '48123', approval: '1' }) },
  { name: 'living-room.local', type: RecordType.A, data: encodeA('192.168.1.20') },
];

describe('dns-packet', () => {
  it('reads back the four records of an advertisement', () => {
    expect(decodeMessage(encodeResponse(records, 120))?.records).toEqual([
      { kind: 'ptr', name: SERVICE, ttl: 120, target: INSTANCE },
      { kind: 'srv', name: INSTANCE, ttl: 120, port: 48123, target: 'living-room.local' },
      { kind: 'txt', name: INSTANCE, ttl: 120, entries: { name: 'Living room', version: '26.11.1', port: '48123', approval: '1' } },
      { kind: 'a', name: 'living-room.local', ttl: 120, address: '192.168.1.20' },
    ]);
  });

  it('writes the goodbye as the same records with a ttl of 0', () => {
    expect(decodeMessage(encodeResponse(records, 0))?.records.map((record) => record.ttl)).toEqual([0, 0, 0, 0]);
  });

  it('reads the question of a browser', () => {
    expect(decodeMessage(encodeQuery(SERVICE, RecordType.PTR))).toEqual({ questions: [{ name: SERVICE, type: RecordType.PTR }], records: [] });
  });

  it('follows a name pointer, as avahi and Bonjour write their answers', () => {
    const name = encodeName(SERVICE);
    // header with one answer, then the name, then a PTR whose data is "Living room" and a pointer to the name at 12
    const target = Buffer.concat([Buffer.from([11]), Buffer.from('Living room'), Buffer.from([0xc0, 12])]);
    const answer = Buffer.concat([Buffer.from([0, 12, 0x80, 1, 0, 0, 0, 120, 0, target.length]), target]);
    const message = Buffer.concat([Buffer.from([0, 0, 0x84, 0, 0, 0, 0, 1, 0, 0, 0, 0]), name, answer]);

    expect(decodeMessage(message)?.records).toEqual([{ kind: 'ptr', name: SERVICE, ttl: 120, target: `Living room.${SERVICE}` }]);
  });

  it('keeps the first entry of a TXT key and an entry without a value', () => {
    const data = encodeTxt({ name: 'a' });
    const second = Buffer.from([6, ...Buffer.from('name=b'), 4, ...Buffer.from('flag')]);
    const message = encodeResponse([{ name: INSTANCE, type: RecordType.TXT, data: Buffer.concat([data, second]) }], 120);

    expect(decodeMessage(message)?.records).toEqual([{ kind: 'txt', name: INSTANCE, ttl: 120, entries: { name: 'a', flag: '' } }]);
  });

  it('cuts a label at 63 bytes and a TXT entry at 255', () => {
    expect(encodeName('a'.repeat(100))[0]).toBe(63);
    expect(encodeTxt({ note: 'x'.repeat(400) })[0]).toBe(255);
  });

  it('skips a record type it does not know', () => {
    const other: DnsRecord = { name: 'x.local', type: 28, data: Buffer.alloc(16) };

    expect(decodeMessage(encodeResponse([other, records[0]], 120))?.records).toHaveLength(1);
  });

  it('returns undefined for a packet that is cut, empty or loops, and never throws', () => {
    const whole = encodeResponse(records, 120);
    // a name that points to itself
    const loop = Buffer.concat([Buffer.from([0, 0, 0x84, 0, 0, 0, 0, 1, 0, 0, 0, 0]), Buffer.from([0xc0, 12]), Buffer.alloc(10)]);

    expect(decodeMessage(Buffer.alloc(0))).toBeUndefined();
    expect(decodeMessage(whole.subarray(0, whole.length - 3))).toBeUndefined();
    expect(decodeMessage(loop)).toBeUndefined();
  });
});
