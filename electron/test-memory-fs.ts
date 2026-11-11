import { dirname, resolve, sep } from 'path';

const missing = (path: string) => Object.assign(new Error(`ENOENT: no such file or directory, '${path}'`), { code: 'ENOENT' });

/** An in-memory stand-in for `fs` and `fs/promises`, so a unit test touches no real folder (docs/development/unit-tests.md) */
const createMemoryFs = () => {
  const files = new Map<string, Buffer>();
  const folders = new Set<string>();
  const clean = (path: string) => resolve(path);
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

  const sync = {
    existsSync: (path: string) => files.has(clean(path)) || folders.has(clean(path)),
    mkdirSync: (path: string) => void parents(clean(path)).forEach((folder) => folders.add(folder)),
    writeFileSync: (path: string, data: string | Uint8Array) => {
      folderOf(dirname(clean(path)));
      files.set(clean(path), content(data));
    },
    readFileSync: (path: string, encoding?: BufferEncoding | { encoding?: BufferEncoding | null }) => {
      const data = files.get(clean(path));
      if (!data) throw missing(path);

      return decode(data, encoding);
    },
    rmSync: (path: string, options?: { force?: boolean; recursive?: boolean }) => {
      const target = clean(path);
      if (!options?.force && !sync.existsSync(target)) throw missing(path);
      [...files.keys()].filter((file) => file === target || inside(file, target)).forEach((file) => files.delete(file));
      [...folders].filter((folder) => folder === target || inside(folder, target)).forEach((folder) => folders.delete(folder));
    },
    readdirSync: (path: string) => {
      const folder = folderOf(path);
      const prefix = folder.endsWith(sep) ? folder : `${folder}${sep}`;

      return [...files.keys(), ...folders]
        .filter((entry) => inside(entry, folder) && entry !== folder)
        .map((entry) => entry.slice(prefix.length).split(sep)[0])
        .filter((name, index, all) => all.indexOf(name) === index)
        .sort();
    },
  };

  const promises = {
    mkdir: async (path: string) => sync.mkdirSync(path),
    writeFile: async (path: string, data: string | Uint8Array) => sync.writeFileSync(path, data),
    readFile: async (path: string, encoding?: BufferEncoding) => sync.readFileSync(path, encoding),
    rm: async (path: string, options?: { force?: boolean; recursive?: boolean }) => sync.rmSync(path, options),
    readdir: async (path: string) => sync.readdirSync(path),
  };

  const reset = () => {
    files.clear();
    folders.clear();
  };

  return { sync, promises, reset };
};

/** One per test file; `vi.mock('fs', ...)` and the test import the same one */
export const memoryFs = createMemoryFs();
