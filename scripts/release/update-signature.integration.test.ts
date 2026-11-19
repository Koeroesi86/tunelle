import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { updatePublicKeys } from '@shared/constants/update-keys';
import { checkFile, generateKeys, readPublicKeys, signFile, signText, verifyText } from './update-signature';

const folders: string[] = [];

const makeFile = (content: string) => {
  const folder = mkdtempSync(join(tmpdir(), 'update-signature-'));
  folders.push(folder);
  const file = join(folder, 'latest-mac.yml');
  writeFileSync(file, content);
  return file;
};

afterEach(() => folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true })));

describe('update signature', () => {
  it('verifies the text that was signed', () => {
    const { privateKey, publicKey } = generateKeys();

    expect(verifyText('version: 26.11.1\n', signText('version: 26.11.1\n', privateKey), publicKey)).toBe(true);
  });

  it('rejects a text that was changed', () => {
    const { privateKey, publicKey } = generateKeys();

    expect(verifyText('version: 26.11.2\n', signText('version: 26.11.1\n', privateKey), publicKey)).toBe(false);
  });

  it('rejects the signature of another key', () => {
    const [signer, other] = [generateKeys(), generateKeys()];

    expect(verifyText('a', signText('a', signer.privateKey), other.publicKey)).toBe(false);
  });

  it('writes the signature next to the file and checks it against the given keys', () => {
    const { privateKey, publicKey } = generateKeys();
    const file = makeFile('version: 26.11.1\n');

    expect(signFile(file, privateKey)).toBe(`${file}.sig`);
    expect(checkFile(file, [generateKeys().publicKey, publicKey])).toBe(true);
    writeFileSync(file, 'version: 26.11.9\n');
    expect(checkFile(file, [publicKey])).toBe(false);
    expect(readFileSync(`${file}.sig`, 'utf8')).toMatch(/^[A-Za-z0-9+/=]+\n$/);
  });

  it('reads the keys that the app trusts from the constants file', () => {
    expect(readPublicKeys()).toEqual(updatePublicKeys);
  });
});
