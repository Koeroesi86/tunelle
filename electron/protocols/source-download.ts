import { createHash, randomUUID } from 'crypto';
import { createWriteStream } from 'fs';
import { readdir, rename, rm, stat } from 'fs/promises';
import { join } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import type { Sources } from '../services/sources/sources';
import { logError } from '../utils/log-error';
import { cacheFolder, makeCacheFolder } from './cache-folder';
import { isHeld } from './held-files';

type SourceClient = NonNullable<Awaited<ReturnType<Sources['clientOf']>>>;

/** How many downloaded tracks stay in the folder: the one that plays, the next one and the previous one */
const keptFiles = 3;

interface Download {
  done: Promise<string | undefined>;
  waiters: number;
  abort: AbortController;
}

const downloads = new Map<string, Download>();

/** When a file of the folder was asked for last. Its modification time stays, as it names the decoded copy of the track */
const used = new Map<string, number>();

const folder = () => cacheFolder('source');

const remove = (path: string) => rm(path, { force: true });

/** A part file is named by its target and a name of its own; no running download has it after a quit or a crash */
const isAbandoned = (name: string) => name.endsWith('.part') && !downloads.has(join(folder(), name.split('.', 2).join('.')));

const evictOld = async (current: string) => {
  const names = await readdir(folder());
  await Promise.all(
    names
      .filter(isAbandoned)
      .map((name) => join(folder(), name))
      .map(remove)
  );
  const files = await Promise.all(
    names
      .filter((name) => !name.endsWith('.part'))
      .map((name) => join(folder(), name))
      .filter((path) => path !== current)
      .map((path) => stat(path).then(({ mtimeMs }) => ({ path, time: used.get(path) ?? mtimeMs })))
  );
  await Promise.all(
    files
      .sort((a, b) => b.time - a.time)
      .slice(keptFiles - 1)
      .map(({ path }) => path)
      .filter((path) => !isHeld(path))
      .map(remove)
  );
};

const fetchToFile = async (client: SourceClient, id: string, target: string, signal: AbortSignal) => {
  const response = await client.stream(id, undefined, signal);
  if (!response.ok || !response.body) throw new Error(`The server answered ${response.status}`);

  // a name of its own, so a download that was cancelled can not touch the file of the one that follows it
  const part = `${target}.${randomUUID()}.part`;
  const discard = () => rm(part, { force: true });
  await pipeline(Readable.from(response.body), createWriteStream(part)).catch((error: unknown) => discard().then(() => Promise.reject(error)));
  if (signal.aborted) return discard().then(() => undefined);
  await rename(part, target);
  await evictOld(target).catch(() => undefined);
  return target;
};

/** Only its own entry: after a cancel the target may already belong to a new download */
const forget = (target: string, abort: AbortController) => {
  if (downloads.get(target)?.abort === abort) downloads.delete(target);
};

/**
 * A track of a server in a file of the temp folder, once for all the requests that ask for it meanwhile: the decoder proxy and the ranges of the page work on a file.
 * Undefined when the download fails or its request is gone, and the track then plays as the server sends it. See docs/app/decoder-proxy.md
 */
export const downloadSource = async (key: string, client: SourceClient, id: string, signal: AbortSignal) => {
  if (!(await makeCacheFolder('source').catch(logError))) return undefined;
  const target = join(folder(), `${createHash('sha256').update(key).digest('hex').slice(0, 32)}.src`);
  const existing = await stat(target).then(
    () => target,
    () => undefined
  );
  if (existing) used.set(existing, Date.now());
  if (existing || signal.aborted) return signal.aborted ? undefined : existing;

  const download =
    downloads.get(target) ??
    ((abort: AbortController): Download => ({
      abort,
      waiters: 0,
      done: fetchToFile(client, id, target, abort.signal)
        .catch((error: unknown) => (abort.signal.aborted ? undefined : void logError(error)))
        .finally(() => forget(target, abort)),
    }))(new AbortController());
  downloads.set(target, download);
  download.waiters += 1;
  const leave = () => {
    download.waiters -= 1;
    if (download.waiters > 0) return;
    forget(target, download.abort);
    download.abort.abort();
  };
  signal.addEventListener('abort', leave, { once: true });

  return download.done.finally(() => signal.removeEventListener('abort', leave));
};
