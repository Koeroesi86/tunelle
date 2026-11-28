import fs from 'fs';
import { dirname, resolve } from 'path';
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
    const constants = resolve(__dirname, '../../shared/constants/update-keys.ts');
    memoryFs.sync.mkdirSync(dirname(constants));
    memoryFs.sync.writeFileSync(constants, `export const updatePublicKeys = [\n  '${keys[0]}',\n  '${keys[1]}',\n  'short',\n];\n`);

    expect(script.readPublicKeys()).toEqual(keys);
  });

  describe('the command line', () => {
    const log = () => vi.spyOn(console, 'log').mockImplementation(() => undefined);

    it('prints a new key pair, which belong together', () => {
      const printed = log();

      script.main(['generate']);

      const [, privateKey, publicKey] = /^([\s\S]+-----\n)\n(\S+)$/.exec(String(printed.mock.calls[0][0])) ?? [];
      expect(script.verifyText('a', script.signText('a', privateKey), publicKey)).toBe(true);
    });

    it('signs a file with the key of the environment', () => {
      const printed = log();
      const file = makeFile('version: 26.11.1\n');
      const { privateKey, publicKey } = script.generateKeys();
      vi.stubEnv('UPDATE_SIGNING_KEY', String(privateKey));

      script.main(['sign', file]);

      expect(script.checkFile(file, [publicKey])).toBe(true);
      expect(printed).toHaveBeenCalledWith(`signed ${file}.sig`);
    });

    it('warns and signs nothing without a key', () => {
      const printed = log();
      const file = makeFile('version: 26.11.1\n');
      vi.stubEnv('UPDATE_SIGNING_KEY', undefined);

      script.main(['sign', file]);

      expect(memoryFs.sync.existsSync(`${file}.sig`)).toBe(false);
      expect(printed).toHaveBeenCalledWith(expect.stringContaining('::warning::UPDATE_SIGNING_KEY is not set'));
    });

    /** A signed file and, in the constants file, the key that the app trusts */
    const signedFor = (trusted: 'signer' | 'another') => {
      const keys = { signer: script.generateKeys(), another: script.generateKeys() };
      const file = makeFile('version: 26.11.1\n');
      script.signFile(file, keys.signer.privateKey);
      const constants = resolve(__dirname, '../../shared/constants/update-keys.ts');
      memoryFs.sync.mkdirSync(dirname(constants));
      memoryFs.sync.writeFileSync(constants, `export const updatePublicKeys = ['${keys[trusted].publicKey}'];\n`);
      return file;
    };

    it('accepts the signature of a key that the app trusts', () => {
      const printed = log();
      const file = signedFor('signer');

      script.main(['check', file]);

      expect(printed).toHaveBeenCalledWith(`${file}.sig is valid`);
    });

    it('fails on the signature of a key that the app does not trust', () => {
      const file = signedFor('another');

      expect(() => script.main(['check', file])).toThrow('is not a signature');
    });

    it.each([[[]], [['sign']], [['check']], [['verify', 'file']]])('says how it is used for %j', (args) => {
      expect(() => script.main(args)).toThrow('usage:');
    });
  });
});
