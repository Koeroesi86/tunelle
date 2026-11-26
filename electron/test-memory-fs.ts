import { dirname, join, resolve, sep } from 'path';
import { vi } from 'vitest';

/** What `open` gives: a test that replaces it may give a handle that only reads the whole file */
interface MemoryHandle {
  stat: () => Promise<{ size: number; mtimeMs?: number }>;
  readFile: () => Promise<Buffer>;
  close: () => Promise<undefined>;
  read?: (buffer: Buffer, offset: number, length: number, position: number) => Promise<{ bytesRead: number; buffer: Buffer }>;
  write?: (buffer: Buffer, offset: number, length: number, position: number) => Promise<{ bytesWritten: number; buffer: Buffer }>;
}

const missing = (path: string) => Object.assign(new Error(`ENOENT: no such file or directory, '${path}'`), { code: 'ENOENT' });

/** An in-memory stand-in for `fs` and `fs/promises`, so a unit test touches no real folder (docs/development/unit-tests.md) */
const createMemoryFs = () => {
  const files = new Map<string, Buffer>();
  const modified = new Map<string, number>();
  const links = new Map<string, string>();
  const folders = new Set<string>();
  /** The owner and the mode of a folder that `mkdir` or `chmod` of the promises gave one */
  const owners = new Map<string, { uid?: number; mode: number }>();
  const clean = (path: string) => resolve(path);
  /** A link keeps the text of its target, as on disk, and is followed once, to the file or folder it names */
  const followed = (path: string) => clean(links.get(clean(path)) ?? path);
  const isRoot = (path: string) => dirname(path) === path;
  const parents = (path: string): string[] => (isRoot(path) ? [path] : [path, ...parents(dirname(path))]);
  const inside = (entry: string, folder: string) => entry.startsWith(folder.endsWith(sep) ? folder : `${folder}${sep}`);
  const content = (data: string | Uint8Array) => Buffer.from(data);
  const decode = (data: Buffer, encoding?: BufferEncoding | { encoding?: BufferEncoding | null } | null) => {
    const name = typeof encoding === 'string' ? encoding : encoding?.encoding;

    return name ? data.toString(name) : data;
  };
  const folderOf = (path: string) => {
    if (!isRoot(clean(path)) && !folders.has(clean(path))) throw missing(path);

    return clean(path);
  };

  type Entry = { name: string; isFile: () => boolean; isDirectory: () => boolean };
  function list(path: string): string[];
  function list(path: string, options: { withFileTypes: true }): Entry[];
  function list(path: string, options?: { withFileTypes?: boolean }): string[] | Entry[] {
    const folder = folderOf(path);
    const prefix = folder.endsWith(sep) ? folder : `${folder}${sep}`;
    const names = [...files.keys(), ...links.keys(), ...folders]
      .filter((entry) => inside(entry, folder) && entry !== folder)
      .map((entry) => entry.slice(prefix.length).split(sep)[0])
      .filter((name, index, all) => all.indexOf(name) === index)
      .sort();

    return options?.withFileTypes
      ? names.map((name) => ({ name, isFile: () => files.has(join(folder, name)), isDirectory: () => folders.has(join(folder, name)) }))
      : names;
  }

  const sync = {
    existsSync: (path: string): boolean =>
      links.has(clean(path)) ? sync.existsSync(links.get(clean(path)) ?? '') : files.has(clean(path)) || folders.has(clean(path)),
    mkdirSync: (path: string) => void parents(clean(path)).forEach((folder) => folders.add(folder)),
    writeFileSync: (path: string, data: string | Uint8Array, options?: { flag?: string }) => {
      folderOf(dirname(clean(path)));
      if (options?.flag === 'wx' && files.has(clean(path))) throw Object.assign(new Error(`EEXIST: file already exists, open '${path}'`), { code: 'EEXIST' });
      files.set(clean(path), content(data));
      links.delete(clean(path));
      modified.set(clean(path), Date.now());
    },
    readFileSync: (path: string, encoding?: BufferEncoding | { encoding?: BufferEncoding | null }) => {
      const data = files.get(followed(path));
      if (!data) throw missing(path);

      return decode(data, encoding);
    },
    appendFileSync: (path: string, data: string | Uint8Array) =>
      sync.writeFileSync(path, Buffer.concat([files.get(clean(path)) ?? Buffer.alloc(0), content(data)])),
    rmSync: (path: string, options?: { force?: boolean; recursive?: boolean }) => {
      const target = clean(path);
      if (!options?.force && !sync.existsSync(target) && !links.has(target)) throw missing(path);
      [...files.keys()].filter((file) => file === target || inside(file, target)).forEach((file) => files.delete(file));
      [...links.keys()].filter((link) => link === target || inside(link, target)).forEach((link) => links.delete(link));
      [...folders].filter((folder) => folder === target || inside(folder, target)).forEach((folder) => folders.delete(folder));
    },
    statSync: (path: string) => {
      const target = followed(path);
      const data = files.get(target);
      if (!data && !folders.has(target)) throw missing(path);

      return { size: data?.length ?? 0, mtimeMs: modified.get(target) ?? 0, isFile: () => data !== undefined, isDirectory: () => data === undefined };
    },
    readdirSync: list,
    copyFileSync: (from: string, to: string) => sync.writeFileSync(to, sync.readFileSync(from)),
  };

  const promises = {
    mkdir: async (path: string, options?: { mode?: number }) => {
      const made = !folders.has(clean(path));
      sync.mkdirSync(path);
      if (made) owners.set(clean(path), { uid: process.getuid?.(), mode: options?.mode ?? 0o755 });
    },
    chmod: async (path: string, mode: number) => void owners.set(clean(path), { uid: process.getuid?.(), ...owners.get(clean(path)), mode }),
    lstat: async (path: string) => {
      const link = links.has(clean(path));
      const stats = link ? { size: 0, mtimeMs: 0, isFile: () => false, isDirectory: () => false } : sync.statSync(path);

      return { ...stats, uid: process.getuid?.(), mode: 0o755, ...owners.get(clean(path)), isSymbolicLink: () => link };
    },
    writeFile: async (path: string, data: string | Uint8Array, options?: { flag?: string }) => sync.writeFileSync(path, data, options),
    readFile: async (path: string, encoding?: BufferEncoding) => sync.readFileSync(path, encoding),
    rm: async (path: string, options?: { force?: boolean; recursive?: boolean }) => sync.rmSync(path, options),
    readdir: async (path: string) => sync.readdirSync(path),
    access: async (path: string) =>
      void (
        sync.existsSync(path) ||
        (() => {
          throw missing(path);
        })()
      ),
    rename: async (from: string, to: string) => {
      const target = links.get(clean(from));
      if (target === undefined) {
        sync.writeFileSync(to, sync.readFileSync(from));
      } else {
        folderOf(dirname(clean(to)));
        links.set(clean(to), target);
      }
      sync.rmSync(from);
    },
    copyFile: async (from: string, to: string) => sync.writeFileSync(to, sync.readFileSync(from)),
    symlink: async (target: string, path: string) => {
      folderOf(dirname(clean(path)));
      if (sync.existsSync(path) || links.has(clean(path))) throw Object.assign(new Error(`EEXIST: file already exists, symlink '${path}'`), { code: 'EEXIST' });
      links.set(clean(path), target);
    },
    readlink: async (path: string) => {
      const target = links.get(clean(path));
      if (target === undefined) throw missing(path);

      return target;
    },
    rmdir: async (path: string) => {
      const target = folderOf(path);
      if (sync.readdirSync(target).length > 0) throw Object.assign(new Error(`ENOTEMPTY: directory not empty, rmdir '${path}'`), { code: 'ENOTEMPTY' });
      folders.delete(target);
    },
    stat: async (path: string) => sync.statSync(path),
    utimes: async (path: string, _atime: Date, mtime: Date) => {
      if (!sync.existsSync(path)) throw missing(path);
      modified.set(clean(path), mtime.getTime());
    },
    /** `w` creates the file empty; the handle reads and writes at a position, as a `FileHandle` does */
    open: async (path: string, flags?: string): Promise<MemoryHandle> => {
      if (flags === 'w') sync.writeFileSync(path, Buffer.alloc(0));
      const target = followed(path);
      const current = () => files.get(target) ?? Buffer.alloc(0);
      if (!files.has(target)) throw missing(path);

      return {
        stat: async () => ({ size: current().length }),
        readFile: async () => current(),
        read: async (buffer: Buffer, offset: number, length: number, position: number) => {
          const bytesRead = Math.max(0, Math.min(length, current().length - position));
          current().copy(buffer, offset, position, position + bytesRead);

          return { bytesRead, buffer };
        },
        write: async (buffer: Buffer, offset: number, length: number, position: number) => {
          const next = Buffer.alloc(Math.max(current().length, position + length));
          current().copy(next);
          buffer.copy(next, position, offset, offset + length);
          files.set(target, next);
          modified.set(target, Date.now());

          return { bytesWritten: length, buffer };
        },
        close: async () => undefined,
      };
    },
  };

  const reset = () => {
    files.clear();
    modified.clear();
    links.clear();
    folders.clear();
    owners.clear();
  };

  return { sync, promises, reset };
};

/** One per test file; `vi.mock('fs', ...)` and the test import the same one */
export const memoryFs = createMemoryFs();

/**
 * A CommonJS script (`scripts/**` with `require('fs')`) takes the functions of `fs` when it loads and `vi.mock('fs')` does not reach it:
 * spy on `fs`, then `vi.resetModules()` and import the script again (docs/development/unit-tests.md)
 */
export const spyOnFs = (fs: Record<string, unknown>) =>
  Object.entries(memoryFs.sync)
    .filter(([name]) => name in fs)
    .forEach(([name, implementation]) => vi.spyOn(fs as Record<string, (...args: unknown[]) => unknown>, name).mockImplementation(implementation as never));
