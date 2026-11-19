import fs from 'fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryFs, spyOnFs } from '../../electron/test-memory-fs';

type Script = typeof import('./update-signature');

const makeFile = (content: string) => {
  memoryFs.sync.mkdirSync('/release');
  memoryFs.sync.writeFileSync('/release/latest-mac.yml', content);
  return '/release/latest-mac.yml';
};

describe('update signature', () => {
  let script: Script;

  beforeEach(async () => {
    memoryFs.reset();
    spyOnFs(fs);
    vi.resetModules();
    script = await import('./update-signature');
  });

  it('verifies the text that was signed', () => {
    const { privateKey, publicKey } = script.generateKeys();

    expect(script.verifyText('version: 26.11.1\n', script.signText('version: 26.11.1\n', privateKey), publicKey)).toBe(true);
  });

  it('rejects a text that was changed', () => {
    const { privateKey, publicKey } = script.generateKeys();

    expect(script.verifyText('version: 26.11.2\n', script.signText('version: 26.11.1\n', privateKey), publicKey)).toBe(false);
  });

  it('rejects the signature of another key', () => {
    const [signer, other] = [script.generateKeys(), script.generateKeys()];

    expect(script.verifyText('a', script.signText('a', signer.privateKey), other.publicKey)).toBe(false);
  });

  it('writes the signature next to the file and checks it against the given keys', () => {
    const { privateKey, publicKey } = script.generateKeys();
    const file = makeFile('version: 26.11.1\n');

    expect(script.signFile(file, privateKey)).toBe(`${file}.sig`);
    expect(script.checkFile(file, [script.generateKeys().publicKey, publicKey])).toBe(true);
    memoryFs.sync.writeFileSync(file, 'version: 26.11.9\n');
    expect(script.checkFile(file, [publicKey])).toBe(false);
    expect(memoryFs.sync.readFileSync(`${file}.sig`, 'utf8')).toMatch(/^[A-Za-z0-9+/=]+\n$/);
  });

  it('reads the keys that the app trusts from the constants file', () => {
    const keys = ['MCowBQYDK2VwAyEAabcdefghijklmnopqrstuvwxyz0123456789ABCD', 'MCowBQYDK2VwAyEA0123456789abcdefghijklmnopqrstuvwxyzABCD'];
    const constants = new URL('../../shared/constants/update-keys.ts', `file://${__dirname}/`).pathname;
    memoryFs.sync.mkdirSync(constants.slice(0, constants.lastIndexOf('/')));
    memoryFs.sync.writeFileSync(constants, `export const updatePublicKeys = [\n  '${keys[0]}',\n  '${keys[1]}',\n  'short',\n];\n`);

    expect(script.readPublicKeys()).toEqual(keys);
  });
});
