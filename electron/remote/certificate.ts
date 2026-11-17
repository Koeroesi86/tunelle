/** The self-signed certificate of a host, made with node:crypto alone, and the options that pin it. See docs/app/remote-access-discovery.md */
import { createHash, createSign, generateKeyPairSync, X509Certificate } from 'node:crypto';

export const CERTIFICATE_YEARS = 10;

const YEAR_MS = 365 * 24 * 3600 * 1000;
/** The digits of the fingerprint both screens show at the approval */
const CODE_DIGITS = 8;

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
const time = (date: Date) => tlv(0x17, Buffer.from(`${date.toISOString().replace(/[-:T]/g, '').slice(2, 14)}Z`));

export interface HostIdentity {
  /** The certificate, which listeners keep as their pin */
  certificate: string;
  /** The private key (PKCS#8), which stays on the host */
  key: string;
}

/** ECDSA P-256, valid for ten years: a new one means every listener asks for a new approval */
export const createHostIdentity = (name: string): HostIdentity => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const algorithm = tlv(0x30, oid(1, 2, 840, 10045, 4, 3, 2));
  const now = new Date();
  const end = new Date(now.getTime() + CERTIFICATE_YEARS * YEAR_MS);
  const serial = createHash('sha256').update(`${name}${now.toISOString()}`).digest().subarray(0, 8);
  const toBeSigned = tlv(
    0x30,
    tlv(0xa0, tlv(0x02, Buffer.from([2]))),
    // a leading 1 keeps the serial a positive number
    tlv(0x02, Buffer.from([1, ...serial])),
    algorithm,
    commonName(name),
    tlv(0x30, time(now), time(end)),
    commonName(name),
    publicKey.export({ type: 'spki', format: 'der' })
  );
  const signature = createSign('sha256').update(toBeSigned).sign(privateKey);
  const der = tlv(0x30, toBeSigned, algorithm, tlv(0x03, Buffer.from([0]), signature));

  return {
    certificate: `-----BEGIN CERTIFICATE-----\n${der.toString('base64').replace(/(.{64})/g, '$1\n')}\n-----END CERTIFICATE-----\n`,
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  };
};

/** The SHA-256 fingerprint of a certificate, as `X509Certificate` prints it */
export const fingerprintOf = (certificate: string) => new X509Certificate(certificate).fingerprint256;

/** The short code of the approval: the first digits of the fingerprint in groups of four, such as `3F9A 04C1` */
export const approvalCode = (certificate: string) => {
  const digits = fingerprintOf(certificate).replace(/:/g, '').slice(0, CODE_DIGITS);
  return digits.replace(/(.{4})(?=.)/g, '$1 ');
};

/**
 * The options of a listener that pins the host. The certificate is the only `ca`, as `rejectUnauthorized: false` with a
 * `checkServerIdentity` does not pin (Node skips the check once the chain failed). The host is an address with no name in
 * the certificate, so the name check passes: the pin is what is checked.
 */
export const pinnedOptions = (certificate: string) => ({ ca: [certificate], checkServerIdentity: () => undefined });

/** The options of the first contact, before the user has approved: the certificate is read from the answer and shown as a code, and nothing secret is sent */
export const unpinnedOptions = { rejectUnauthorized: false } as const;
