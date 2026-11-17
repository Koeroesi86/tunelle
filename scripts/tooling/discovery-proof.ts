/**
 * Proof for docs/app/remote-access-discovery.md: native mDNS on dgram and a self-signed certificate made with node:crypto alone.
 * `npx tsx scripts/tooling/discovery-proof.ts` prints what worked on this system; nothing of it ships.
 */
import { createSign, generateKeyPairSync, X509Certificate, createHash } from 'node:crypto';
import { createSocket, type Socket } from 'node:dgram';
import { request, createServer } from 'node:https';
import { once } from 'node:events';

const MDNS_ADDRESS = '224.0.0.251';
const MDNS_PORT = 5353;
const SERVICE = '_tunelle._tcp.local';

// ---- DNS wire format (names are written without compression and read with it)

const encodeName = (name: string) =>
  Buffer.concat([...name.split('.').map((label) => Buffer.concat([Buffer.from([label.length]), Buffer.from(label)])), Buffer.from([0])]);

const u16 = (value: number) => Buffer.from([value >> 8, value & 255]);
const u32 = (value: number) => Buffer.from([(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]);

interface Record {
  name: string;
  type: number;
  data: Buffer;
}

const TYPE = { A: 1, PTR: 12, TXT: 16, SRV: 33 };

const encodeRecord = ({ name, type, data }: Record, ttl: number) => Buffer.concat([encodeName(name), u16(type), u16(0x8001), u32(ttl), u16(data.length), data]);

const encodeResponse = (records: Record[], ttl: number) =>
  Buffer.concat([Buffer.from([0, 0, 0x84, 0, 0, 0]), u16(records.length), Buffer.from([0, 0, 0, 0]), ...records.map((record) => encodeRecord(record, ttl))]);

const encodeQuery = (name: string, type: number) => Buffer.concat([Buffer.from([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]), encodeName(name), u16(type), u16(1)]);

const readName = (message: Buffer, start: number): { name: string; next: number } => {
  const length = message[start];

  if (length === 0) return { name: '', next: start + 1 };
  if (length >= 0xc0) return { name: readName(message, ((length & 0x3f) << 8) | message[start + 1]).name, next: start + 2 };

  const rest = readName(message, start + length + 1);
  const label = message.subarray(start + 1, start + 1 + length).toString();

  return { name: rest.name ? `${label}.${rest.name}` : label, next: rest.next };
};

interface Answer {
  name: string;
  type: number;
  text: string;
}

const decodeRecord = (message: Buffer, type: number, dataStart: number, dataLength: number): string => {
  if (type === TYPE.PTR) return readName(message, dataStart).name;
  if (type === TYPE.A) return [...message.subarray(dataStart, dataStart + 4)].join('.');
  if (type === TYPE.SRV) return `${message.readUInt16BE(dataStart + 4)} ${readName(message, dataStart + 6).name}`;

  const texts: string[] = [];
  for (let at = dataStart; at < dataStart + dataLength; at += message[at] + 1) texts.push(message.subarray(at + 1, at + 1 + message[at]).toString());
  return texts.join(' ');
};

const decodeAnswers = (message: Buffer): Answer[] => {
  const questions = message.readUInt16BE(4);
  const count = message.readUInt16BE(6) + message.readUInt16BE(8) + message.readUInt16BE(10);
  let position = 12;

  for (let index = 0; index < questions; index += 1) position = readName(message, position).next + 4;

  return Array.from({ length: count }, () => {
    const { name, next } = readName(message, position);
    const type = message.readUInt16BE(next);
    const length = message.readUInt16BE(next + 8);
    const text = decodeRecord(message, type, next + 10, length);

    position = next + 10 + length;
    return { name, type, text };
  });
};

// ---- the responder and the browser, two sockets that share port 5353 as avahi or Bonjour would be shared with

const openSocket = async (): Promise<Socket> => {
  const socket = createSocket({ type: 'udp4', reuseAddr: true });

  socket.bind(MDNS_PORT);
  await once(socket, 'listening');
  socket.addMembership(MDNS_ADDRESS);
  socket.setMulticastLoopback(true);
  return socket;
};

const instance = (name: string, port: number, host: string): Record[] => [
  { name: SERVICE, type: TYPE.PTR, data: encodeName(`${name}.${SERVICE}`) },
  { name: `${name}.${SERVICE}`, type: TYPE.SRV, data: Buffer.concat([u16(0), u16(0), u16(port), encodeName(`${host}.local`)]) },
  {
    name: `${name}.${SERVICE}`,
    type: TYPE.TXT,
    data: Buffer.concat(
      ['name=Living room', 'version=26.11.1', `port=${port}`, 'approval=1'].map((entry) => Buffer.concat([Buffer.from([entry.length]), Buffer.from(entry)]))
    ),
  },
  { name: `${host}.local`, type: TYPE.A, data: Buffer.from([127, 0, 0, 1]) },
];

const proveMdns = async () => {
  const responder = await openSocket();
  const browser = await openSocket();
  const records = instance('Tunelle-proof', 48123, 'tunelle-proof');
  const found: Answer[] = [];

  responder.on('message', (message) => {
    if (message.readUInt16BE(4) === 0) return;
    responder.send(encodeResponse(records, 120), MDNS_PORT, MDNS_ADDRESS);
  });
  browser.on('message', (message) => {
    if (message.readUInt16BE(6) === 0) return;
    found.push(...decodeAnswers(message));
  });

  browser.send(encodeQuery(SERVICE, TYPE.PTR), MDNS_PORT, MDNS_ADDRESS);
  await new Promise((resolve) => setTimeout(resolve, 500));
  responder.send(encodeResponse(records, 0), MDNS_PORT, MDNS_ADDRESS);
  await new Promise((resolve) => setTimeout(resolve, 100));
  responder.close();
  browser.close();

  console.log('mDNS: the browser read', found.length, 'records');
  found.slice(0, 4).forEach((answer) => console.log('  ', answer.type, answer.name, '->', answer.text));
  return found.some((answer) => answer.type === TYPE.PTR);
};

// ---- a self-signed X.509 certificate (ECDSA P-256) written in DER with node:crypto signing it

const tlv = (tag: number, ...parts: Buffer[]) => {
  const body = Buffer.concat(parts);
  const length =
    body.length < 128
      ? Buffer.from([body.length])
      : Buffer.from([0x81 + Number(body.length > 255), ...(body.length > 255 ? [body.length >> 8] : []), body.length & 255]);

  return Buffer.concat([Buffer.from([tag]), length, body]);
};

const base128 = (value: number): number[] =>
  (value < 128 ? [value] : [...base128(Math.floor(value / 128)), value % 128]).map((part, index, all) => (index < all.length - 1 ? part | 128 : part));

const oid = (...numbers: number[]) => tlv(0x06, Buffer.from([numbers[0] * 40 + numbers[1], ...numbers.slice(2).flatMap(base128)]));

const commonName = (name: string) => tlv(0x30, tlv(0x31, tlv(0x30, oid(2, 5, 4, 3), tlv(0x0c, Buffer.from(name)))));
const time = (date: Date) => tlv(0x17, Buffer.from(date.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z'));

const makeCertificate = (name: string, years: number) => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const signature = tlv(0x30, oid(1, 2, 840, 10045, 4, 3, 2));
  const now = new Date();
  const end = new Date(now.getTime() + years * 365 * 24 * 3600 * 1000);
  const toBeSigned = tlv(
    0x30,
    tlv(0xa0, tlv(0x02, Buffer.from([2]))),
    tlv(
      0x02,
      Buffer.from([
        1,
        ...createHash('sha256')
          .update(name + now.toISOString())
          .digest()
          .subarray(0, 8),
      ])
    ),
    signature,
    commonName(name),
    tlv(0x30, time(now), time(end)),
    commonName(name),
    publicKey.export({ type: 'spki', format: 'der' })
  );
  const signed = createSign('sha256').update(toBeSigned).sign(privateKey);
  const der = tlv(0x30, toBeSigned, signature, tlv(0x03, Buffer.from([0]), signed));
  const pem = `-----BEGIN CERTIFICATE-----\n${der.toString('base64').replace(/(.{64})/g, '$1\n')}\n-----END CERTIFICATE-----\n`;

  return { pem, key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
};

const proveCertificate = async () => {
  const { pem, key } = makeCertificate('Tunelle proof', 10);
  const certificate = new X509Certificate(pem);
  const server = createServer({ cert: pem, key }, (_request, response) => response.end('ok')).listen(0, '127.0.0.1');

  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const other = makeCertificate('Tunelle proof', 10).pem;
  const connect = (pinned: string, withoutPin = false) =>
    new Promise<string>((resolve) => {
      const call = request(
        {
          host: '127.0.0.1',
          port,
          ...(withoutPin
            ? { rejectUnauthorized: false, checkServerIdentity: () => new Error('never called') }
            : { ca: [pinned], checkServerIdentity: () => undefined }),
        },
        (response) => resolve(`answered ${response.statusCode}`)
      );

      call.on('error', (error) => resolve(`refused: ${error.message}`));
      call.end();
    });

  console.log('certificate: parsed by X509Certificate, subject', JSON.stringify(certificate.subject), 'valid to', certificate.validTo);
  console.log('certificate: pinned certificate as ca ->', await connect(pem));
  console.log('certificate: another certificate as ca ->', await connect(other));
  console.log('certificate: rejectUnauthorized false + checkServerIdentity ->', await connect(pem, true));
  server.close();
  return certificate.fingerprint256.length > 0;
};

const main = async () => {
  const mdns = await proveMdns().catch((error) => (console.log('mDNS failed:', error), false));
  const certificate = await proveCertificate().catch((error) => (console.log('certificate failed:', error), false));

  process.exitCode = mdns && certificate ? 0 : 1;
};

main();
