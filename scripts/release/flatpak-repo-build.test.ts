import fs from 'fs';
import { createRequire } from 'module';
import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryFs, spyOnFs } from '../../electron/test-memory-fs';

const childProcess: typeof import('child_process') = createRequire(__filename)('child_process');

const fingerprint = '0123456789ABCDEF0123456789ABCDEF01234567';
const listing = ['sec:u:255:22:ABCDEF0123456789:1700000000:::u:::scESC:::+:::23::0:', `fpr:::::::::${fingerprint}:`].join('\n');
const publicKey = Buffer.from('public key');
const bundles = join('/', 'bundles');
const repo = join('/', 'repo');
const gpgHome = join('/', 'gpg-home');

/** What gpg and ostree print, the other commands print nothing; flatpak init is what makes the folder of the repository */
const outputOf = (command: string, args: string[]) => {
  if (args.includes('--list-secret-keys')) return Buffer.from(listing);
  if (args.includes('--export')) return publicKey;
  if (command === 'ostree' && args[0] === 'init') memoryFs.sync.mkdirSync(repo);
  return Buffer.from(args[0] === 'refs' ? 'app/io.github.koeroesi86.Tunelle/x86_64/stable\n' : '');
};

describe('building the Flatpak repository', () => {
  let main: typeof import('./flatpak-repo').main;
  let commands: string[];

  beforeEach(async () => {
    memoryFs.reset();
    spyOnFs(fs);
    vi.spyOn(fs, 'mkdtempSync').mockImplementation((() => {
      memoryFs.sync.mkdirSync(gpgHome);
      return gpgHome;
    }) as never);
    commands = [];
    vi.spyOn(childProcess, 'execFileSync').mockImplementation(((command: string, args: string[]) => {
      commands.push([command, ...args].join(' '));
      return outputOf(command, args);
    }) as never);
    vi.stubEnv('FLATPAK_GPG_PRIVATE_KEY', 'private key');
    memoryFs.sync.mkdirSync(bundles);
    memoryFs.sync.writeFileSync(join(bundles, 'tunelle-x64.flatpak'), 'x64');
    memoryFs.sync.writeFileSync(join(bundles, 'notes.txt'), 'not a bundle');
    vi.resetModules();
    ({ main } = await import('./flatpak-repo'));
  });

  it('imports each bundle, signed with the key, and publishes the branch they share', () => {
    main([bundles, repo]);

    const sign = `--gpg-sign=${fingerprint} --gpg-homedir=${gpgHome}`;
    expect(commands.filter((command) => command.includes('build-import-bundle'))).toEqual([
      `flatpak build-import-bundle ${sign} ${repo} ${join(bundles, 'tunelle-x64.flatpak')}`,
    ]);
    expect(commands.at(-1)).toContain(`flatpak build-update-repo ${sign}`);
    expect(commands.at(-1)).toContain('--default-branch=stable');
  });

  it('writes the files that add the repository and the app, with the public key', () => {
    main([bundles, repo]);

    ['tunelle.flatpakrepo', 'tunelle.flatpakref'].forEach((name) =>
      expect(memoryFs.sync.readFileSync(join(repo, name), 'utf8')).toContain(`GPGKey=${publicKey.toString('base64')}`)
    );
  });

  it('removes the folder with the private key, also when a command fails', () => {
    vi.mocked(childProcess.execFileSync).mockImplementation(() => {
      throw new Error('gpg failed');
    });

    expect(() => main([bundles, repo])).toThrow('gpg failed');
    expect(memoryFs.sync.existsSync(gpgHome)).toBe(false);
  });

  it('runs nothing without a key', () => {
    vi.stubEnv('FLATPAK_GPG_PRIVATE_KEY', undefined);

    expect(() => main([bundles, repo])).toThrow('FLATPAK_GPG_PRIVATE_KEY is not set');
    expect(commands).toEqual([]);
  });

  it('runs nothing without a bundle', () => {
    memoryFs.sync.rmSync(join(bundles, 'tunelle-x64.flatpak'));

    expect(() => main([bundles, repo])).toThrow('no .flatpak bundle');
    expect(commands).toEqual([]);
  });

  it.each([[[]], [[bundles]]])('says how it is used for %j', (args) => {
    expect(() => main(args)).toThrow('usage:');
  });
});
