import { X509Certificate } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { approvalCode, CERTIFICATE_YEARS, createHostIdentity, fingerprintOf, pinnedOptions } from './certificate';

describe('certificate', () => {
  it('makes a certificate that X509Certificate reads, signed by its own key', () => {
    const { certificate } = createHostIdentity('Living room');
    const parsed = new X509Certificate(certificate);

    expect(parsed.subject).toBe('CN=Living room');
    expect(parsed.issuer).toBe('CN=Living room');
    expect(parsed.verify(parsed.publicKey)).toBe(true);
  });

  it('is valid from now for ten years', () => {
    const parsed = new X509Certificate(createHostIdentity('Living room').certificate);
    const years = (new Date(parsed.validTo).getTime() - new Date(parsed.validFrom).getTime()) / (365 * 24 * 3600 * 1000);

    expect(Math.round(years)).toBe(CERTIFICATE_YEARS);
    expect(new Date(parsed.validFrom).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('makes a new certificate and key every time, so a renewal is a different pin', () => {
    const first = createHostIdentity('Living room');
    const second = createHostIdentity('Living room');

    expect(fingerprintOf(first.certificate)).not.toBe(fingerprintOf(second.certificate));
    expect(first.key).not.toBe(second.key);
  });

  it('keeps the private key out of the certificate', () => {
    const { certificate, key } = createHostIdentity('Living room');

    expect(key).toMatch(/^-----BEGIN PRIVATE KEY-----/);
    expect(certificate).not.toContain('PRIVATE');
  });

  it('shows the first eight digits of the fingerprint as two groups of four', () => {
    const { certificate } = createHostIdentity('Living room');
    const digits = fingerprintOf(certificate).replace(/:/g, '').slice(0, 8);

    expect(approvalCode(certificate)).toMatch(/^[0-9A-F]{4} [0-9A-F]{4}$/);
    expect(approvalCode(certificate).replace(' ', '')).toBe(digits);
  });

  it('writes a name of any length into the certificate', () => {
    const name = 'N'.repeat(120);

    expect(new X509Certificate(createHostIdentity(name).certificate).subject).toBe(`CN=${name}`);
  });

  it('pins by `ca` and accepts the address that has no name in the certificate', () => {
    const { certificate } = createHostIdentity('Living room');
    const options = pinnedOptions(certificate);

    expect(options.ca).toEqual([certificate]);
    expect(options.checkServerIdentity()).toBeUndefined();
  });
});
