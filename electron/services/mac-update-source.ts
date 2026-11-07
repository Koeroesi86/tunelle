import { app } from 'electron';
import { execFile, spawn } from 'child_process';
import { createPublicKey, createHash, verify } from 'crypto';
import { EventEmitter } from 'events';
import { createWriteStream } from 'fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { promisify } from 'util';
import { z } from 'zod';
import { updatePublicKeys } from '@shared/constants/update-keys';
import { directoryUrlSchema } from '../schemas/environment';
import type { UpdateSource } from './updater';

const run = promisify(execFile);

const defaultFeed = 'https://github.com/Koeroesi86/tunelle/releases/latest/download/';
const startedFile = 'update-started';
const failedFile = 'update-failed';

const updateFileSchema = z.object({
  version: z.string().regex(/^\d{2}\.\d{1,2}\.\d+$/),
  files: z.array(z.object({ url: z.string().min(1), sha512: z.string().min(1), size: z.coerce.number().int().positive() })).min(1),
});

type UpdateFile = z.infer<typeof updateFileSchema>;

const unquote = (value: string) => value.trim().replace(/^(['"])(.*)\1$/, '$2');

/** Reads the version and the files of latest-mac.yml, which electron-builder writes with a fixed layout */
export const parseUpdateFile = (text: string): UpdateFile =>
  updateFileSchema.parse({
    version: unquote(text.match(/^version: (.+)$/m)?.[1] ?? ''),
    files: text
      .split(/^ {2}- url: /m)
      .slice(1)
      .map((entry) => ({
        url: unquote(entry.split('\n')[0]),
        sha512: unquote(entry.match(/^ {4}sha512: (.+)$/m)?.[1] ?? ''),
        size: entry.match(/^ {4}size: (\d+)$/m)?.[1],
      })),
  });

/** The zip of the running architecture: the one of arm64 has `arm64` in its name, the one of Intel has not */
export const pickZip = (files: UpdateFile['files'], arch: string) =>
  files.filter((file) => file.url.endsWith('.zip')).find((file) => file.url.includes('arm64') === (arch === 'arm64'));

/** Whether the version is greater than the installed one, both like 26.11.3 */
export const isNewer = (version: string, installed: string) => {
  const [left, right] = [version, installed].map((value) => value.split('.').map(Number));

  return (left.map((part, index) => part - right[index]).find((difference) => difference !== 0) ?? 0) > 0;
};

const isSignedBy = (text: string, signature: string, key: string) => {
  try {
    return verify(
      undefined,
      Buffer.from(text),
      createPublicKey({ key: Buffer.from(key, 'base64'), format: 'der', type: 'spki' }),
      Buffer.from(signature.trim(), 'base64')
    );
  } catch {
    // a key that can not be read (a wrong TUNELLE_UPDATE_PUBLIC_KEY) signed nothing
    return false;
  }
};

/** Whether the signature is of the text, made by one of the keys */
export const isSigned = (text: string, signature: string, publicKeys: string[]) => publicKeys.some((key) => isSignedBy(text, signature, key));

// arguments: pid of the app, installed bundle, new bundle, backup, started marker, version, record of a failed version, staging folder, then the TUNELLE_ variables as NAME=value
// the new bundle replaces the installed one with two renames, and the backup goes back when the swap or the first start of the new app (it writes the marker) does not work
// `open` hands the variables on, as an app started by the system does not get the ones of this process. See docs/app/updater.md
export const swapScript = `
pid="$1"; app="$2"; fresh="$3"; backup="$4"; marker="$5"; version="$6"; failed="$7"; staging="$8"
shift 8
exec >> "$failed.log" 2>&1
echo "$(date) updating to $version"
count=$#
while [ "$count" -gt 0 ]; do set -- "$@" --env "$1"; shift; count=$((count-1)); done
set -- "$@" "$app"
while kill -0 "$pid" 2>/dev/null; do sleep 0.2; done
rm -rf "$backup"
mv "$app" "$backup" || exit 1
if ! mv "$fresh" "$app"; then echo "the new app could not be moved in"; mv "$backup" "$app"; echo "$version" > "$failed"; open "$@"; exit 1; fi
rm -f "$marker"
open "$@"
tries=0
while [ ! -f "$marker" ] && [ "$tries" -lt 600 ]; do sleep 0.2; tries=$((tries+1)); done
if [ -f "$marker" ]; then echo "the new app started after $tries tries"; rm -rf "$backup" "$staging"; exit 0; fi
echo "the new app did not start in two minutes, putting the old one back"
pkill -f "$app/Contents/MacOS/"; sleep 1
rm -rf "$app"; mv "$backup" "$app"; echo "$version" > "$failed"; rm -rf "$staging"; open "$@"
`;

const plistValue = (bundle: string, key: string) =>
  run('plutil', ['-extract', key, 'raw', '-o', '-', join(bundle, 'Contents', 'Info.plist')]).then(({ stdout }) => stdout.trim());

const executableArch = (arch: string) => (arch === 'arm64' ? 'arm64' : 'x86_64');

/** Fails unless the extracted bundle is the signed version for this architecture and its ad hoc signature is intact */
const verifyBundle = async (bundle: string, version: string, arch: string) => {
  await run('codesign', ['--verify', '--deep', '--strict', bundle]);
  const bundleVersion = await plistValue(bundle, 'CFBundleShortVersionString');
  if (bundleVersion !== version) throw new Error(`The update has version ${bundleVersion}, not ${version}`);

  const executable = await plistValue(bundle, 'CFBundleExecutable');
  const { stdout } = await run('lipo', ['-archs', join(bundle, 'Contents', 'MacOS', executable)]);
  if (!stdout.split(/\s+/).includes(executableArch(arch))) throw new Error(`The update is not built for ${arch}: ${stdout.trim()}`);
};

/** The folder of the installed bundle: …/Tunelle.app from …/Tunelle.app/Contents/MacOS/Tunelle */
export const bundleOf = (executable: string) => resolve(executable, '..', '..', '..');

interface Pending {
  version: string;
  file: UpdateFile['files'][number];
  zip: string;
  bundle?: string;
}

/**
 * Updates the macOS app without a Developer ID: latest-mac.yml has to be signed with a key of update-keys.ts, the zip has to match its sha512, and the
 * installed bundle is only replaced when the new one is intact. See docs/app/updater.md
 */
export const createMacUpdateSource = (appDataPath: string): UpdateSource => {
  const feed = directoryUrlSchema.parse(process.env.TUNELLE_UPDATE_URL) ?? defaultFeed;
  const publicKeys = [...updatePublicKeys, ...(process.env.TUNELLE_UPDATE_PUBLIC_KEY ? [process.env.TUNELLE_UPDATE_PUBLIC_KEY] : [])];
  const installed = bundleOf(process.execPath);
  const staging = join(dirname(installed), '.Tunelle-update');
  let pending: Pending | undefined;

  const fetchText = async (name: string) => {
    const response = await fetch(new URL(name, feed));
    if (!response.ok) throw new Error(`${name} answered ${response.status}`);

    return response.text();
  };

  const failedVersion = () =>
    readFile(join(appDataPath, failedFile), 'utf8').then(
      (text) => text.trim(),
      () => undefined
    );

  const source: UpdateSource = Object.assign(new EventEmitter(), {
    autoDownload: false,
    checkForUpdates: async () => {
      const [text, signature] = await Promise.all([fetchText('latest-mac.yml'), fetchText('latest-mac.yml.sig')]);
      if (!isSigned(text, signature, publicKeys)) throw new Error('latest-mac.yml is not signed by a key of this app');

      const { version, files } = parseUpdateFile(text);
      if (!isNewer(version, app.getVersion())) return { isUpdateAvailable: false, updateInfo: { version } };
      if ((await failedVersion()) === version) throw new Error(`Version ${version} could not be installed on this Mac, a newer version is tried instead`);

      const file = pickZip(files, process.arch);
      if (!file) throw new Error(`Version ${version} has no zip for ${process.arch}`);

      pending = { version, file, zip: join(app.getPath('temp'), `tunelle-update-${version}-${process.arch}.zip`) };

      return { isUpdateAvailable: true, updateInfo: { version } };
    },
    downloadUpdate: async () => {
      if (!pending) throw new Error('There is no checked update to download');

      const { version, file, zip } = pending;
      const response = await fetch(new URL(file.url, feed));
      if (!response.ok || !response.body) throw new Error(`${file.url} answered ${response.status}`);

      const hash = createHash('sha512');
      let received = 0;
      const count = new Transform({
        transform: (chunk: Buffer, _encoding, done) => {
          received += chunk.length;
          hash.update(chunk);
          source.emit('download-progress', { percent: (received / file.size) * 100 });
          done(undefined, chunk);
        },
      });
      await pipeline(Readable.from(response.body), count, createWriteStream(zip));
      if (hash.digest('base64') !== file.sha512) throw new Error(`${file.url} does not match its sha512`);

      await rm(staging, { recursive: true, force: true });
      await mkdir(staging, { recursive: true });
      await run('ditto', ['-x', '-k', zip, staging]);
      const bundle = (await readdir(staging)).find((name) => name.endsWith('.app'));
      if (!bundle) throw new Error('The update has no app');

      await verifyBundle(join(staging, bundle), version, process.arch);
      pending = { ...pending, bundle: join(staging, bundle) };
      await rm(zip, { force: true });
    },
    quitAndInstall: () => {
      if (!pending?.bundle) return;

      const { version, bundle } = pending;
      const variables = Object.entries(process.env)
        .filter(([name, value]) => name.startsWith('TUNELLE_') && value !== undefined)
        .map(([name, value]) => `${name}=${value}`);
      spawn(
        '/bin/sh',
        [
          '-c',
          swapScript,
          'sh',
          `${process.pid}`,
          installed,
          bundle,
          `${installed}.backup`,
          join(appDataPath, startedFile),
          version,
          join(appDataPath, failedFile),
          staging,
          ...variables,
        ],
        { detached: true, stdio: 'ignore' }
      ).unref();
      app.quit();
    },
  });

  return source;
};

/** Tells the swap script of an update that the new version started; it keeps the backup of the old one until then */
export const confirmStart = (appDataPath: string) => writeFile(join(appDataPath, startedFile), app.getVersion());
