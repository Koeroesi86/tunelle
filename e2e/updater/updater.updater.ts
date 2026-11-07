import { expect, test } from '@playwright/test';
import { execFileSync, spawn, type ChildProcess } from 'child_process';
import { createHash, generateKeyPairSync, sign } from 'crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { packagedExecutable } from '../../scripts/release/dist-layout';

// the updater of the macOS app replaces its own bundle, which only a packaged app on macOS does (npm run dist, then npm run test:updater)
test.skip(process.platform !== 'darwin', 'the own updater is for macOS, other systems update with electron-updater');

const root = resolve(__dirname, '../..');
const packagedBundle = resolve(root, packagedExecutable('darwin', process.arch), '../../..');
const updateVersion = '26.99.1';
const zipName = `Tunelle-${updateVersion}-${process.arch === 'arm64' ? 'arm64-' : ''}mac.zip`;
// the version of the packaged app, which the update has to be greater than
const installedVersion = '1.0.0';

const run = (command: string, args: string[]) => execFileSync(command, args, { encoding: 'utf8' }).trim();
const plistVersion = (bundle: string) => run('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', join(bundle, 'Contents', 'Info.plist')]);
const executableHash = (bundle: string) =>
  createHash('sha256')
    .update(readFileSync(join(bundle, 'Contents', 'MacOS', 'Tunelle')))
    .digest('hex');

/** The packaged app with another version, re-signed ad hoc as the release is; `executable` replaces its main program */
const makeUpdateBundle = (folder: string, executable?: string) => {
  const bundle = join(folder, 'Tunelle.app');
  run('ditto', [packagedBundle, bundle]);
  run('plutil', ['-replace', 'CFBundleShortVersionString', '-string', updateVersion, join(bundle, 'Contents', 'Info.plist')]);
  if (executable) run('cp', [executable, join(bundle, 'Contents', 'MacOS', 'Tunelle')]);
  run('codesign', ['--force', '--deep', '-s', '-', bundle]);
  const zip = join(folder, zipName);
  run('ditto', ['-c', '-k', '--keepParent', bundle, zip]);

  return readFileSync(zip);
};

/** A program that exits at once, built for the architecture of the runner: an update that installs and does not start */
const makeBrokenExecutable = (folder: string) => {
  const source = join(folder, 'broken.c');
  const executable = join(folder, 'broken');
  writeFileSync(source, 'int main(void) { return 1; }\n');
  run('cc', ['-arch', process.arch === 'arm64' ? 'arm64' : 'x86_64', source, '-o', executable]);

  return executable;
};

interface Feed {
  server: Server;
  url: string;
  requests: string[];
}

const startFeed = async (files: Record<string, Buffer | string>): Promise<Feed> => {
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const name = (request.url ?? '').split('/').pop() ?? '';
    requests.push(name);
    const file = files[name];
    response.writeHead(file === undefined ? 404 : 200).end(file);
  });
  const address = await new Promise<string | AddressInfo | null>((done) => server.listen(0, '127.0.0.1', () => done(server.address())));
  if (!address || typeof address === 'string') throw new Error('The update feed did not start');

  return { server, url: `http://127.0.0.1:${address.port}/`, requests };
};

const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

/** latest-mac.yml like electron-builder writes it, and its signature */
const updateFiles = (zip: Buffer, signer = keys.privateKey) => {
  const yml = `version: ${updateVersion}
files:
  - url: ${zipName}
    sha512: ${createHash('sha512').update(zip).digest('base64')}
    size: ${zip.length}
path: ${zipName}
releaseDate: '2026-11-09T06:00:00.000Z'
`;

  return { 'latest-mac.yml': yml, 'latest-mac.yml.sig': sign(undefined, Buffer.from(yml), signer).toString('base64') };
};

test.describe('the macOS updater', () => {
  let folder: string;
  let feed: Feed | undefined;
  let app: ChildProcess | undefined;

  test.beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'tunelle-updater-'));
    mkdirSync(join(folder, 'data'));
  });

  test.afterEach(async () => {
    app?.kill('SIGKILL');
    // the apps that the swap script opened are not children of the test
    try {
      run('pkill', ['-f', folder]);
    } catch {
      // nothing was running
    }
    await new Promise((done) => (feed ? feed.server.close(done) : done(undefined)));
    feed = undefined;
    // the test of the folder that can not be written to leaves it so when it fails
    try {
      chmodSync(join(folder, 'Applications'), 0o755);
    } catch {
      // the folder was not made
    }
    rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  });

  /** The "installed" app: a copy of the packaged bundle, started with the feed */
  const install = (parent: string) => {
    mkdirSync(parent, { recursive: true });
    const bundle = join(parent, 'Tunelle.app');
    run('ditto', [packagedBundle, bundle]);

    return bundle;
  };

  const start = (bundle: string) => {
    const { ELECTRON_RUN_AS_NODE, ...inherited } = process.env;
    app = spawn(join(bundle, 'Contents', 'MacOS', 'Tunelle'), [], {
      stdio: 'ignore',
      env: {
        ...inherited,
        HOME: folder,
        TUNELLE_APP_DATA: join(folder, 'data'),
        TUNELLE_NO_ARTIST_PHOTOS: '1',
        TUNELLE_UPDATE_URL: feed?.url ?? 'http://127.0.0.1:9/',
        TUNELLE_UPDATE_PUBLIC_KEY: publicKey,
      },
    });
    const exited = new Promise<void>((done) => app?.once('exit', () => done()));

    return exited;
  };

  const marker = () => join(folder, 'data', 'update-started');

  test('installs a signed update, starts it and drops the backup', async () => {
    const zip = makeUpdateBundle(folder);
    feed = await startFeed({ ...updateFiles(zip), [zipName]: zip });
    const bundle = install(join(folder, 'Applications'));
    const exited = start(bundle);

    // the swap script drops the backup once the new app wrote its marker
    await expect.poll(() => plistVersion(bundle) === updateVersion && existsSync(marker()) && !existsSync(`${bundle}.backup`), { timeout: 150_000 }).toBe(true);
    await exited;
    expect(existsSync(join(folder, 'Applications', '.Tunelle-update'))).toBe(false);
    expect(feed.requests).toEqual(expect.arrayContaining(['latest-mac.yml', 'latest-mac.yml.sig', zipName]));
  });

  test('puts the old version back when the update installs and does not start', async () => {
    const zip = makeUpdateBundle(folder, makeBrokenExecutable(folder));
    feed = await startFeed({ ...updateFiles(zip), [zipName]: zip });
    const bundle = install(join(folder, 'Applications'));
    start(bundle);

    // the old app starts again after the script waited for the marker of the new one: it writes the marker, and the version is recorded as failed
    await expect.poll(() => readFileSync(join(folder, 'data', 'update-failed'), 'utf8').trim(), { timeout: 150_000 }).toBe(updateVersion);
    await expect.poll(() => plistVersion(bundle) === installedVersion && existsSync(marker()), { timeout: 150_000 }).toBe(true);
    expect(existsSync(`${bundle}.backup`)).toBe(false);
  });

  test.describe('leaves the installed app as it is', () => {
    const untouched = async (bundle: string, hash: string) => {
      await expect.poll(() => existsSync(marker()), { timeout: 150_000 }).toBe(true);
      expect(plistVersion(bundle)).toBe(installedVersion);
      expect(executableHash(bundle)).toBe(hash);
      expect(existsSync(`${bundle}.backup`)).toBe(false);
    };

    test('for a zip that was changed after it was signed', async () => {
      const zip = makeUpdateBundle(folder);
      feed = await startFeed({ ...updateFiles(zip), [zipName]: Buffer.concat([zip, Buffer.from('tampered')]) });
      const bundle = install(join(folder, 'Applications'));
      const hash = executableHash(bundle);
      start(bundle);

      await untouched(bundle, hash);
      expect(feed.requests).toContain(zipName);
    });

    test('for a file that another key signed', async () => {
      const zip = makeUpdateBundle(folder);
      feed = await startFeed({ ...updateFiles(zip, generateKeyPairSync('ed25519').privateKey), [zipName]: zip });
      const bundle = install(join(folder, 'Applications'));
      const hash = executableHash(bundle);
      start(bundle);

      await untouched(bundle, hash);
      expect(feed.requests).not.toContain(zipName);
    });

    test('in a folder that can not be written to', async () => {
      const zip = makeUpdateBundle(folder);
      feed = await startFeed({ ...updateFiles(zip), [zipName]: zip });
      const parent = join(folder, 'Applications');
      const bundle = install(parent);
      const hash = executableHash(bundle);
      chmodSync(parent, 0o555);
      start(bundle);

      await untouched(bundle, hash);
      // the app did not even look for an update
      expect(feed.requests).toEqual([]);
      chmodSync(parent, 0o755);
    });

    test('when it runs from a translocated path', async () => {
      const zip = makeUpdateBundle(folder);
      feed = await startFeed({ ...updateFiles(zip), [zipName]: zip });
      const bundle = install(join(folder, 'AppTranslocation', 'ABC', 'd'));
      const hash = executableHash(bundle);
      start(bundle);

      await untouched(bundle, hash);
      expect(feed.requests).toEqual([]);
    });
  });
});
